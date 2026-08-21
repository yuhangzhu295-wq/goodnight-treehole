import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Queue } from '../../apps/api/node_modules/bullmq';
import request from 'supertest';
import { createApiTestApp, followUpTestConnection } from './helpers';

describe('third-stage future self business loop', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  it('keeps user-selected context, persists it, and delivers a future message through the real follow-up queue', async () => {
    const server = app.getHttpServer();
    await request(server).patch('/api/v1/me/privacy').send({ allowRecoveryData: true }).expect(200);
    const journey = await request(server)
      .post('/api/v1/journeys')
      .send({
        title: '未来信关联旅程 ' + Date.now(),
        domain: '关系',
        content: '先把想说的话留到明天再看。',
        visibility: 'PRIVATE',
      })
      .expect(201);
    const journeyId = journey.body.journey.id as string;

    const recovery = await request(server)
      .post('/api/v1/me/recovery')
      .send({ journeyId, summary: '今天能按时吃饭，也愿意短暂出门。', signals: { sleep: 'partial', meals: 'yes' } })
      .expect(201);
    const decision = await request(server)
      .post('/api/v1/decisions')
      .send({ journeyId, question: '今晚要不要发送那段解释？', options: ['现在发', '明天再看'], criteria: ['睡一觉后再确认'] })
      .expect(201);

    const later = new Date(Date.now() + 86_400_000).toISOString();
    const journeyMessage = await request(server)
      .post('/api/v1/future-messages')
      .send({ content: '请记得，你已经先停下来了一次。', deliverAt: later, contextType: 'journey', contextRefId: journeyId })
      .expect(201);
    const recoveryMessage = await request(server)
      .post('/api/v1/future-messages')
      .send({ content: '你那天已经能好好吃饭了。', deliverAt: later, contextType: 'recovery', contextRefId: recovery.body.item.id })
      .expect(201);
    const deliveredMessage = await request(server)
      .post('/api/v1/future-messages')
      .send({ content: '情绪过去后，再读一遍这句话。', deliverAt: later, contextType: 'decision', contextRefId: decision.body.item.id })
      .expect(201);

    expect(journeyMessage.body.item).toMatchObject({ contextType: 'journey', contextRefId: journeyId, contextLabel: expect.stringContaining('未来信关联旅程') });
    expect(recoveryMessage.body.item).toMatchObject({ contextType: 'recovery', contextRefId: recovery.body.item.id, contextLabel: expect.stringContaining('今天能按时吃饭') });
    expect(deliveredMessage.body.item).toMatchObject({ contextType: 'decision', contextRefId: decision.body.item.id, contextLabel: expect.stringContaining('今晚要不要发送') });
    expect(await prisma.messageToFutureSelf.findUnique({ where: { id: journeyMessage.body.item.id } })).toMatchObject({
      contextType: 'journey',
      contextRefId: journeyId,
      journeyId,
    });

    const futureId = deliveredMessage.body.item.id as string;
    const followUpId = deliveredMessage.body.followUp.id as string;
    const past = new Date(Date.now() - 2_000);
    await prisma.$transaction([
      prisma.messageToFutureSelf.update({ where: { id: futureId }, data: { deliverAt: past } }),
      prisma.followUpJob.update({ where: { id: followUpId }, data: { dueAt: past, status: 'pending', completedAt: null } }),
    ]);

    // Advance only this isolated test record, then let the production worker and Redis queue deliver it.
    const queue = new Queue(process.env.FOLLOW_UP_QUEUE_NAME!, { connection: followUpTestConnection() });
    const scheduled = await queue.getJob(followUpId);
    if (scheduled) await scheduled.remove();
    await queue.add(
      'FUTURE_SELF',
      { id: followUpId, kind: 'FUTURE_SELF', userId: 'user_demo', payload: { messageId: futureId } },
      { jobId: followUpId, delay: 0, attempts: 3, backoff: { type: 'exponential', delay: 1_000 }, removeOnComplete: false, removeOnFail: false },
    );
    await queue.close();

    let notification: any;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const result = await request(server).get('/api/v1/notifications').expect(200);
      notification = result.body.items.find((item: any) => item.id === 'notification_' + followUpId);
      if (notification) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect(notification).toMatchObject({ type: 'FUTURE_SELF', targetRoute: '/pages/future-self/index', status: 'unread' });

    const list = await request(server).get('/api/v1/future-messages').expect(200);
    expect(list.body.items.find((item: any) => item.id === futureId)).toMatchObject({
      deliveredAt: expect.any(String),
      contextType: 'decision',
      contextRefId: decision.body.item.id,
    });
    expect(await prisma.messageToFutureSelf.findUnique({ where: { id: futureId } })).toMatchObject({
      contextType: 'decision',
      contextRefId: decision.body.item.id,
      deliveredAt: expect.any(Date),
    });
    expect(await prisma.followUpJob.findUnique({ where: { id: followUpId } })).toMatchObject({ status: 'delivered' });
  }, 30_000);
});
