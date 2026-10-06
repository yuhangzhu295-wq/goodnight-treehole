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
      if (input._onBeforeNotificationWrite) {
        await input._onBeforeNotificationWrite();
      }
      const message = this.notificationCopy(input.kind, input.payload);
      await this.prisma.userNotification.createMany({
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

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
  }
}
