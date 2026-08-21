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

  private async deliver(input: { id: string; kind: string; userId: string; journeyId?: string; payload?: Record<string, unknown> }) {
    const existing = await this.prisma.followUpJob.findUnique({ where: { id: input.id } });
    if (!existing || !['pending', 'scheduled'].includes(existing.status)) return { skipped: true, status: existing?.status };

    const notificationId = 'notification_' + input.id;
    const privacy = await this.prisma.privacySetting.findUnique({ where: { userId: input.userId } });
    const futureNotificationsAllowed = input.kind !== 'FUTURE_SELF' || privacy?.allowFutureSelfNotifications === true;
    const existingNotification = futureNotificationsAllowed
      ? await this.prisma.userNotification.findUnique({ where: { id: notificationId } })
      : null;
    if (futureNotificationsAllowed && !existingNotification) {
      const message = this.notificationCopy(input.kind, input.payload);
      await this.prisma.userNotification.create({
        data: {
          id: notificationId,
          userId: input.userId,
          type: message.type,
          title: message.title,
          body: message.body,
          targetRoute: message.targetRoute,
          status: 'unread',
        },
      });
    }

    await this.prisma.followUpJob.update({ where: { id: input.id }, data: { status: 'delivered', completedAt: new Date() } });
    const messageId = typeof input.payload?.messageId === 'string' ? input.payload.messageId : undefined;
    if (messageId) await this.prisma.messageToFutureSelf.updateMany({ where: { id: messageId, userId: input.userId }, data: { deliveredAt: new Date() } });
    const cooldownId = typeof input.payload?.cooldownId === 'string' ? input.payload.cooldownId : undefined;
    if (cooldownId) await this.prisma.cooldownItem.updateMany({ where: { id: cooldownId, userId: input.userId }, data: { status: 'released' } });
    const decisionId = typeof input.payload?.decisionId === 'string' ? input.payload.decisionId : undefined;
    if (decisionId)
      await this.prisma.decisionRecord.updateMany({
        where: { id: decisionId, userId: input.userId, status: 'cooling' },
        data: { status: 'ready', reviewedAt: new Date() },
      });

    await this.store.reloadRuntimeState();
    return { notificationId: futureNotificationsAllowed ? notificationId : undefined, status: 'delivered' };
  }

  private notificationCopy(kind: string, payload?: Record<string, unknown>) {
    if (kind === 'FUTURE_SELF') return { type: 'FUTURE_SELF', title: '清醒时候的你，留了一句话', body: '这是过去的你留给现在的。', targetRoute: '/pages/future-self/index' };
    if (kind === 'DECISION_COOLDOWN') {
      const decisionId = typeof payload?.decisionId === 'string' ? payload.decisionId : '';
      return { type: 'COOLDOWN_RELEASED', title: '现在还想这样做吗？', body: '你之前放进决定保险箱的事情，已经到了可以重新看一眼的时间。', targetRoute: `/pages/decision/index${decisionId ? `?id=${encodeURIComponent(decisionId)}` : ''}` };
    }
    return { type: 'FOLLOW_UP', title: '昨天那件事，后来怎么样了？', body: '不用写得完整，告诉我现在发生了什么就好。', targetRoute: '/pages/action/index?section=follow-up' };
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
  }
}
