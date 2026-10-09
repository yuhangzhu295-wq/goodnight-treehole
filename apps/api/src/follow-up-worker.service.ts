import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaRuntimeService } from './prisma-runtime.service.js';
import { StoreService } from './store.service.js';
import { FOLLOW_UP_QUEUE_NAME, REDIS_URL } from './follow-up-queue.js';

/** How often the durable pending jobs are reconciled against the queue. */
const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class FollowUpWorkerService implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  private connection?: Redis;
  private reconcileTimer?: ReturnType<typeof setInterval>;

  constructor(
    @Inject(PrismaRuntimeService)
    private readonly prisma: PrismaRuntimeService,
    @Inject(StoreService)
    private readonly store: StoreService,
  ) {}

  async onModuleInit() {
    this.connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    this.worker = new Worker(
      FOLLOW_UP_QUEUE_NAME,
      async (job) =>
        this.deliver(
          job.data as { id: string; kind: string; userId: string; journeyId?: string; payload?: Record<string, unknown> },
          // The queue name is the job kind. Passing it in lets `deliver` refuse a payload whose
          // kind does not match the job it is running, instead of running the wrong handler against
          // it (design §0.7/F4).
          job.name,
        ),
      { connection: this.connection },
    );
    this.worker.on('error', (error) => console.error(`[follow-up-worker] ${error.message}`));
    // A failing job is retried by BullMQ and, without this, fails silently: only connection errors
    // reach the handler above. The job id and the error message are logged; the payload is not,
    // because it can carry the user's own text.
    this.worker.on('failed', (job, error) => {
      console.error(`[follow-up-worker] job ${job?.id ?? 'unknown'} failed: ${error?.message ?? 'unknown error'}`);
    });
    await this.reconcilePending();
    this.reconcileTimer = setInterval(() => {
      void this.reconcilePending();
    }, RECONCILE_INTERVAL_MS);
    // The interval must not hold the process open on its own; shutdown clears it explicitly.
    this.reconcileTimer.unref?.();
  }

  /**
   * Re-enqueues durable pending jobs that never reached the queue.
   *
   * The create path commits the row before enqueueing, so an enqueue failure leaves a job the
   * database still reports as pending. This pass is bounded and idempotent: it only looks at rows
   * the database says are pending, so a delivered job is never regressed or re-notified.
   */
  private async reconcilePending() {
    try {
      const result = await this.store.selfPersistence.reconcilePendingFutureMessages();
      if (result.failed > 0) {
        console.error(
          `[follow-up-worker] reconcile: ${result.failed} of ${result.scanned} pending future-self jobs could not be enqueued`,
        );
      }
    } catch (error) {
      // Redis being unreachable must not take the process down; the next pass retries.
      console.error(`[follow-up-worker] reconcile failed: ${(error as Error).message}`);
    }
  }

  private async deliver(
    input: {
      id: string;
      kind: string;
      userId: string;
      journeyId?: string;
      payload?: Record<string, unknown>;
      _onBeforeNotificationWrite?: () => Promise<void>;
      /** Fires inside the claim transaction, before any row is touched. Used to overlap a retry
       *  with a concurrent mark-read in the multi-instance tests. */
      _onBeforeClaim?: () => Promise<void>;
    },
    queueJobName?: string,
  ) {
    // Refuse a mismatch rather than guessing which handler was meant. There is deliberately no
    // allowlist of kinds: `FollowUpJob.kind` is a free-form string and this worker routes everything
    // that is not a decision cooldown through the action follow-up path, so an allowlist would
    // refuse legitimate kinds (it refused `action_checkin` when first written).
    if (queueJobName !== undefined && queueJobName !== input.kind) {
      throw new Error(
        `follow-up job ${input.id}: queue job name "${queueJobName}" does not match payload kind "${input.kind}"`,
      );
    }
    if (!input.kind) {
      throw new Error(`follow-up job ${input.id}: missing kind`);
    }
    const notificationId = 'notification_' + input.id;
    const completedAt = new Date();

    const messageId = typeof input.payload?.messageId === 'string' ? input.payload.messageId : undefined;
    const decisionId = typeof input.payload?.decisionId === 'string' ? input.payload.decisionId : undefined;

    // 1. Claim the FollowUpJob and write its notification in ONE transaction (design A6).
    //
    // The consent flag is read from the database here rather than from the queue payload, and the
    // notification row is written inside the claim. A crash therefore cannot leave "delivered with
    // no notification" ambiguous: the two commit together or not at all. When consent is off the
    // delivery deliberately writes no notification, so an absent row means exactly one thing -
    // consent was off at the decision point - and no reconciler may invent one.
    const claimResult = await this.prisma.$transaction(async (tx) => {
      if (input._onBeforeClaim) await input._onBeforeClaim();
      if (input.kind === 'DECISION_COOLDOWN') {
        await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${input.userId} FOR UPDATE`;
        if (decisionId) {
          await tx.$executeRaw`SELECT 1 FROM "DecisionRecord" WHERE id = ${decisionId} FOR UPDATE`;
        }
        const [dueCheck] = await tx.$queryRaw<Array<{ passed: boolean }>>`
          SELECT ("dueAt" <= clock_timestamp()) AS passed FROM "FollowUpJob" WHERE id = ${input.id}
        `;
        if (!dueCheck?.passed) {
          return { count: 0, notified: false };
        }
        const claim = await tx.followUpJob.updateMany({
          where: { id: input.id, status: { in: ['pending', 'scheduled'] } },
          data: { status: 'delivered', completedAt },
        });
        if (claim.count === 0) return { count: 0, notified: false };
        const res = await this.store.selfPersistence.deliverCooldownJob(tx, input, completedAt);
        if (res.status !== 'delivered') {
          return { count: 0, notified: false };
        }
        const notified = await this.writeClaimNotification(tx, input, notificationId);
        return { count: claim.count, notified };
      }

      const claim = await tx.followUpJob.updateMany({
        where: { id: input.id, status: { in: ['pending', 'scheduled'] } },
        data: { status: 'delivered', completedAt },
      });

      if (claim.count === 0) {
        // Another delivery already claimed this job. It wrote its own notification in its own
        // claim, so this one must not write a second one - and must not retroactively notify a
        // letter that was delivered while consent was off.
        return { count: 0, notified: false };
      }

      if (messageId) {
        await tx.messageToFutureSelf.updateMany({
          where: { id: messageId, userId: input.userId },
          data: { deliveredAt: completedAt },
        });
      }

      const notified = await this.writeClaimNotification(tx, input, notificationId);
      return { count: claim.count, notified };
    });

    // 2. Reload the runtime store so legacy in-memory state is consistent before the notification is observable
    await this.store.reloadRuntimeState();

    // 3. Notification creation: read current job state
    const currentJob = await this.prisma.followUpJob.findUnique({ where: { id: input.id } });
    if (!currentJob || currentJob.status !== 'delivered') {
      return { skipped: true, status: currentJob?.status };
    }

    return {
      notificationId: claimResult.notified ? notificationId : undefined,
      status: 'delivered',
      ...(claimResult.count === 0 ? { skipped: true } : {}),
    };
  }

  /**
   * Reads the notification consent from the database inside the claim transaction and writes the
   * notification row in that same transaction (design A6).
   *
   * Reading consent from the queue payload would let a stale payload decide whether the user is
   * notified, and writing the row afterwards would leave "delivered with no notification" meaning
   * either "consent was off" or "the write failed" - two very different situations. Both are
   * removed here: consent is read from the database, and the row commits with the claim or not at
   * all. Returns whether a notification was written.
   */
  private async writeClaimNotification(
    tx: any,
    input: { kind: string; userId: string; payload?: Record<string, unknown>; _onBeforeNotificationWrite?: () => Promise<void> },
    notificationId: string,
  ): Promise<boolean> {
    const privacy = (await tx.privacySetting.findUnique({ where: { userId: input.userId } })) as {
      allowFutureSelfNotifications?: boolean;
    } | null;
    const allowed = input.kind !== 'FUTURE_SELF' || privacy?.allowFutureSelfNotifications === true;
    if (!allowed) return false;

    const copy = this.notificationCopy(input.kind, input.payload);
    if (input._onBeforeNotificationWrite) {
      await input._onBeforeNotificationWrite();
    }
    await tx.userNotification.createMany({
      data: [
        {
          id: notificationId,
          userId: input.userId,
          type: copy.type,
          title: copy.title,
          body: copy.body,
          targetRoute: copy.targetRoute,
          status: 'unread',
        },
      ],
      skipDuplicates: true,
    });
    return true;
  }

  private notificationCopy(kind: string, payload?: Record<string, unknown>) {
    if (kind === 'FUTURE_SELF') return { type: 'FUTURE_SELF', title: '清醒时候的你，留了一句话', body: '这是过去的你留给现在的。', targetRoute: '/pages/future-self/index' };
    if (kind === 'DECISION_COOLDOWN') {
      const decisionId = typeof payload?.decisionId === 'string' ? payload.decisionId : '';
      return { type: 'COOLDOWN_RELEASED', title: '现在还想这样做吗？', body: '你之前放进决定保险箱的事情，已经到了可以重新看一眼的时间。', targetRoute: `/pages/decision/index${decisionId ? `?id=${encodeURIComponent(decisionId)}` : ''}` };
    }
    // The check-in the user has to answer belongs to a specific commitment, so the deep link
    // carries it. The previous `?section=follow-up` was never read by any view, so tapping a
    // follow-up notification landed on the generic action card with no way to check in
    // (product audit ISSUE-010).
    const commitmentId = typeof payload?.actionId === 'string' ? payload.actionId : '';
    return {
      type: 'FOLLOW_UP',
      title: '昨天那件事，后来怎么样了？',
      body: '不用写得完整，告诉我现在发生了什么就好。',
      targetRoute: `/pages/action/index?followUp=1${commitmentId ? `&commitmentId=${encodeURIComponent(commitmentId)}` : ''}`,
    };
  }

  /**
   * Graceful shutdown with a bounded wait.
   *
   * `worker.close()` and `connection.quit()` both wait on the Redis socket. When Redis is slow,
   * already gone, or the connection has already been quit, that wait does not necessarily end:
   * measured here as an `app.close()` that never returned, which surfaced as a test file failing
   * with zero failing tests. A shutdown that can hang forever is worse than one that drops the
   * socket, so the graceful attempt is bounded and a forced close is the fallback. The fallback is
   * reported to stderr, not silent.
   *
   * Interruption window: none between the claim and its notification. Both are written in the same
   * transaction (design A6), so a forced close either loses both or neither, and a retry re-runs
   * the whole claim. A forced close between two deliveries can still drop the second one, which a
   * retry or the reconciler re-enqueues.
   */
  private async closeBounded(label: string, graceful: () => Promise<unknown>, forced: () => Promise<void> | void) {
    const budgetMs = 3000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Deliberately NOT unref'd: the point of the bound is that it always fires. An unref'd timer
    // would let an otherwise idle process exit before the forced close runs.
    const expired = new Promise<'expired'>((resolve) => {
      timer = setTimeout(() => resolve('expired'), budgetMs);
    });
    try {
      const outcome = await Promise.race([graceful().then(() => 'closed' as const), expired]);
      if (outcome === 'expired') {
        console.error(`[follow-up-worker] ${label} did not finish within ${budgetMs}ms; forcing close`);
        this.forceClose(forced);
      }
    } catch (error) {
      console.error(`[follow-up-worker] ${label} failed (${(error as Error).message}); forcing close`);
      this.forceClose(forced);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * The forced close is started but NOT awaited.
   *
   * Awaiting it would defeat the bound this method exists to provide: the forced path calls into
   * the same Redis client layer that just failed to close, so it can stall for the same reason.
   * A shutdown that has already exceeded its budget has to return; the socket is released when the
   * process exits. Failures are still reported rather than swallowed.
   */
  private forceClose(forced: () => Promise<void> | void) {
    try {
      void Promise.resolve(forced()).catch((error) => {
        console.error(`[follow-up-worker] forced close failed: ${(error as Error).message}`);
      });
    } catch (error) {
      console.error(`[follow-up-worker] forced close threw: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy() {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    await this.closeBounded(
      'worker.close',
      () => this.worker?.close() ?? Promise.resolve(),
      async () => {
        // A BullMQ Worker holds TWO Redis connections: the main one and a duplicated blocking one
        // (`worker.blockingConnection`). The inherited `disconnect()` only touches the main
        // connection, so the blocking connection is closed explicitly — with `force`, so it does
        // not wait on the socket it is being closed for.
        await this.worker?.disconnect();
        const worker = this.worker as unknown as {
          blockingConnection?: { close?: (force?: boolean) => Promise<void> };
        };
        await worker?.blockingConnection?.close?.(true);
      },
    );
    await this.closeBounded(
      'connection.quit',
      () => this.connection?.quit() ?? Promise.resolve(),
      () => this.connection?.disconnect(),
    );
  }
}
