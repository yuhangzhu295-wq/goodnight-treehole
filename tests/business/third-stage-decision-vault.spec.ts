import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Queue } from '../../apps/api/node_modules/bullmq';
import request from 'supertest';
import { createApiTestApp, followUpTestConnection } from './helpers';

describe('third-stage decision vault business loop', () => {
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

  it('holds a user decision, delivers a real cooldown notification, and only then lets the user decide and archive', async () => {
    const server = app.getHttpServer();
    const question = `决定保险箱回归 ${Date.now()}`;
    const created = await request(server)
      .post('/api/v1/decisions')
      .send({ question, options: ['现在做', '明天再看'], criteria: ['先确认事实', '情绪强度:8/10'] })
      .expect(201);
    const decisionId = created.body.item.id as string;
    expect(created.body.item.status).toBe('draft');

    const cooling = await request(server)
      .post('/api/v1/cooldowns')
      .send({ decisionId, title: question, reason: '不想在情绪很高的时候仓促发出。', hours: 1 })
      .expect(201);
    const cooldownId = cooling.body.item.id as string;
    const followUpId = cooling.body.followUp.id as string;
    expect(cooling.body.followUp.kind).toBe('DECISION_COOLDOWN');
    await request(server).patch(`/api/v1/decisions/${decisionId}`).send({ status: 'ready' }).expect(400);

    // Advance only this isolated test record, then let the real BullMQ worker consume it.
    const past = new Date(Date.now() - 2_000);
    await prisma.$transaction([
      prisma.decisionRecord.update({ where: { id: decisionId }, data: { cooldownUntil: past } }),
      prisma.cooldownItem.update({ where: { id: cooldownId }, data: { releaseAt: past } }),
      prisma.followUpJob.update({ where: { id: followUpId }, data: { dueAt: past, status: 'pending', completedAt: null } }),
    ]);
    const queue = new Queue(process.env.FOLLOW_UP_QUEUE_NAME!, { connection: followUpTestConnection() });
    const delayed = await queue.getJob(followUpId);
    if (delayed) await delayed.remove();
    await queue.add(
      'DECISION_COOLDOWN',
      { id: followUpId, kind: 'DECISION_COOLDOWN', userId: 'user_demo', payload: { cooldownId, decisionId } },
      { jobId: followUpId, delay: 0, attempts: 3, backoff: { type: 'exponential', delay: 1_000 }, removeOnComplete: false, removeOnFail: false },
    );
    await queue.close();

    let notification: any;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await request(server).get('/api/v1/notifications').expect(200);
      notification = response.body.items.find((item: any) => item.id === `notification_${followUpId}`);
      if (notification) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect(notification).toMatchObject({ type: 'COOLDOWN_RELEASED', targetRoute: `/pages/decision/index?id=${decisionId}`, status: 'unread' });
    expect((await request(server).get('/api/v1/decisions').expect(200)).body.items.find((item: any) => item.id === decisionId)).toMatchObject({ status: 'ready' });

    const decided = await request(server)
      .patch(`/api/v1/decisions/${decisionId}`)
      .send({ decision: '我决定明天白天再确认一次。', outcome: '先把需要说的话留在草稿里。', status: 'decided' })
      .expect(200);
    expect(decided.body.item.status).toBe('decided');
    const archived = await request(server).patch(`/api/v1/decisions/${decisionId}`).send({ status: 'archived' }).expect(200);
    expect(archived.body.item.status).toBe('archived');

    expect(await prisma.decisionRecord.findUnique({ where: { id: decisionId } })).toMatchObject({
      status: 'archived',
      decision: '我决定明天白天再确认一次。',
      outcome: '先把需要说的话留在草稿里。',
    });
    expect(await prisma.cooldownItem.findUnique({ where: { id: cooldownId } })).toMatchObject({ status: 'released' });
    expect(await prisma.followUpJob.findUnique({ where: { id: followUpId } })).toMatchObject({ status: 'delivered' });
  }, 30_000);
});
