import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaRuntimeService } from './prisma-runtime.service.js';
import { StoreService } from './store.service.js';
import { FOLLOW_UP_QUEUE_NAME, REDIS_URL } from './follow-up-queue.js';

@Injectable()
export class FollowUpWorkerService implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;
  private connection?: Redis;

  constructor(
    @Inject(PrismaRuntimeService)
    private readonly prisma: PrismaRuntimeService,
    @Inject(StoreService)
    private readonly store: StoreService,
  ) {}

  async onModuleInit() {
    this.connection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    this.worker = new Worker(FOLLOW_UP_QUEUE_NAME, async (job) => this.deliver(job.data as { id: string; kind: string; userId: string; journeyId?: string; payload?: Record<string, unknown> }), { connection: this.connection });
    this.worker.on('error', (error) => console.error(`[follow-up-worker] ${error.message}`));
  }

  private async deliver(input: {
    id: string;
    kind: string;
    userId: string;
    journeyId?: string;
    payload?: Record<string, unknown>;
    _onBeforeNotificationWrite?: () => Promise<void>;
  }) {
    const notificationId = 'notification_' + input.id;
    const privacy = await this.prisma.privacySetting.findUnique({ where: { userId: input.userId } });
    const futureNotificationsAllowed = input.kind !== 'FUTURE_SELF' || privacy?.allowFutureSelfNotifications === true;
    const completedAt = new Date();

    const messageId = typeof input.payload?.messageId === 'string' ? input.payload.messageId : undefined;
    const cooldownId = typeof input.payload?.cooldownId === 'string' ? input.payload.cooldownId : undefined;
    const decisionId = typeof input.payload?.decisionId === 'string' ? input.payload.decisionId : undefined;

    // 1. Transaction A: Claim FollowUpJob together with legacy-model updates atomically
    const claimResult = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.followUpJob.updateMany({
        where: { id: input.id, status: { in: ['pending', 'scheduled'] } },
        data: { status: 'delivered', completedAt },
      });

      if (claim.count > 0) {
        if (messageId) {
          await tx.messageToFutureSelf.updateMany({
            where: { id: messageId, userId: input.userId },
            data: { deliveredAt: completedAt },
          });
        }
        if (cooldownId) {
          await tx.cooldownItem.updateMany({
            where: { id: cooldownId, userId: input.userId },
            data: { status: 'released' },
          });
        }
        if (decisionId) {
          await tx.decisionRecord.updateMany({
            where: { id: decisionId, userId: input.userId, status: 'cooling' },
            data: { status: 'ready', reviewedAt: completedAt },
          });
        }
      }
      return claim;
    });

    // 2. Reload the runtime store so legacy in-memory state is consistent before the notification is observable
    await this.store.reloadRuntimeState();

    // 3. Notification creation: read current job state
    const currentJob = await this.prisma.followUpJob.findUnique({ where: { id: input.id } });
    if (!currentJob || currentJob.status !== 'delivered') {
      return { skipped: true, status: currentJob?.status };
    }

    if (futureNotificationsAllowed) {
      const message = this.notificationCopy(input.kind, input.payload);
      await this.prisma.$transaction(async (tx) => {
        if (input._onBeforeNotificationWrite) {
          await input._onBeforeNotificationWrite();
        }
        await tx.userNotification.createMany({
          data: [{
            id: notificationId,
            userId: input.userId,
            type: message.type,
            title: message.title,
            body: message.body,
            targetRoute: message.targetRoute,
            status: 'unread',
          }],
          skipDuplicates: true,
        });
      });
    }

    return {
      notificationId: futureNotificationsAllowed ? notificationId : undefined,
      status: 'delivered',
      ...(claimResult.count === 0 ? { skipped: true } : {}),
    };
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
   * Interruption window this opens: `deliver()` claims a job as `delivered` in one transaction and
   * writes its notification in a second. A forced close between the two loses that notification
   * while the job already reads `delivered`, so a retry will not re-deliver it. That ordering is
   * pre-existing; what this change adds is a bounded moment at which it can be interrupted instead
   * of an unbounded hang. Closing it properly means making the notification part of the claim
   * transaction, which is a change to the follow-up delivery path and is not made here.
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
