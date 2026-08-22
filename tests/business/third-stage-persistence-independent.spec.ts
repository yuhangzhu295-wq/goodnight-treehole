import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApiTestApp } from './helpers';

describe('third-stage PostgreSQL persistence and API restart', () => {
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

  it('reads the same recovery, support, stable self, memory, decision, future-self, privacy, report, and archive facts after an API restart', async () => {
    const userId = 'user_demo';
    let server = app.getHttpServer();
    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', userId)
      .send({
        allowRecoveryData: true,
        allowLongTermMemory: true,
        allowAiMemoryUse: false,
        allowJourneyArchiveRetention: true,
        allowFutureSelfNotifications: false,
        allowDataExport: false,
      })
      .expect(200);
    const journey = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', userId)
      .send({ title: `持久化旅程 ${Date.now()}`, domain: '生活', content: '我要验证重启后仍能读到这些事实。' })
      .expect(201);
    const journeyId = journey.body.journey.id as string;
    const recovery = await request(server)
      .post('/api/v1/me/recovery')
      .set('x-goodnight-user-id', userId)
      .send({ journeyId, summary: '按时吃饭，也出门晒了太阳。', signals: { food: 'yes', outside: 'yes', sleep: 'partial' } })
      .expect(201);
    const support = await request(server)
      .put('/api/v1/me/support-plan')
      .set('x-goodnight-user-id', userId)
      .send({ title: '重启验真预案', plan: { safePeople: ['小林'], smallActions: ['先喝水'] } })
      .expect(200);
    const stable = await request(server)
      .put('/api/v1/me/stable-self')
      .set('x-goodnight-user-id', userId)
      .send({ profile: { stableDescription: '我会让决定等一晚。', stabilityAnchors: ['先睡一觉'] } })
      .expect(200);
    const memory = await request(server)
      .post('/api/v1/memory')
      .set('x-goodnight-user-id', userId)
      .send({ title: '重启后也能看到', content: '由用户主动保存的有限记忆。', scope: 'all_ai', days: 30 })
      .expect(201);
    const decision = await request(server)
      .post('/api/v1/decisions')
      .send({ question: '明天再回吗？', options: ['现在回', '明天回'], criteria: ['先睡一觉'] })
      .expect(201);
    const future = await request(server)
      .post('/api/v1/future-messages')
      .send({ content: '明天醒来再读这一句。', deliverAt: new Date(Date.now() + 86_400_000).toISOString() })
      .expect(201);
    const month = new Date().toISOString().slice(0, 7);
    await request(server).get(`/api/v1/reports/monthly?month=${month}`).expect(200);
    await request(server).patch(`/api/v1/journeys/${journeyId}/status`).set('x-goodnight-user-id', userId).send({ status: 'archived' }).expect(200);

    await app.close();
    app = await createApiTestApp();
    await app.init();
    server = app.getHttpServer();

    expect((await request(server).get('/api/v1/me/recovery').set('x-goodnight-user-id', userId).expect(200)).body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: recovery.body.item.id })]));
    expect((await request(server).get('/api/v1/me/support-plan').set('x-goodnight-user-id', userId).expect(200)).body.item).toMatchObject({ id: support.body.item.id, title: '重启验真预案' });
    expect((await request(server).get('/api/v1/me/stable-self').set('x-goodnight-user-id', userId).expect(200)).body.item).toMatchObject({ id: stable.body.item.id });
    expect((await request(server).get('/api/v1/me/memories').set('x-goodnight-user-id', userId).expect(200)).body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: memory.body.item.id })]));
    expect((await request(server).get('/api/v1/decisions').expect(200)).body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: decision.body.item.id })]));
    expect((await request(server).get('/api/v1/future-messages').expect(200)).body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: future.body.item.id })]));
    expect((await request(server).get('/api/v1/archive/journeys').set('x-goodnight-user-id', userId).expect(200)).body.items).toEqual(expect.arrayContaining([expect.objectContaining({ journey: expect.objectContaining({ id: journeyId, status: 'archived' }) })]));
    expect(await prisma.monthlyReport.findUnique({ where: { userId_month: { userId, month } } })).toMatchObject({ userId, month });
  }, 45_000);

  it('keeps all third-stage persisted counts unchanged across twenty read-only passes', async () => {
    const server = app.getHttpServer();
    const userId = 'user_demo';
    const month = new Date().toISOString().slice(0, 7);
    const countPersistedFacts = async () => ({
      privacy: await prisma.privacySetting.count({ where: { userId } }),
      recovery: await prisma.recoverySnapshot.count({ where: { userId } }),
      supportPlan: await prisma.personalSupportPlan.count({ where: { userId } }),
      stableSelf: await prisma.stableSelfProfile.count({ where: { userId } }),
      memory: await prisma.memoryItem.count({ where: { userId } }),
      decisions: await prisma.decisionRecord.count({ where: { userId } }),
      futureMessages: await prisma.messageToFutureSelf.count({ where: { userId } }),
      reports: await prisma.monthlyReport.count({ where: { userId } }),
      journeys: await prisma.lifeJourney.count({ where: { userId } }),
    });
    const before = await countPersistedFacts();

    for (let pass = 0; pass < 20; pass += 1) {
      const responses = await Promise.all([
        request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', userId),
        request(server).get('/api/v1/me/recovery').set('x-goodnight-user-id', userId),
        request(server).get('/api/v1/me/support-plan').set('x-goodnight-user-id', userId),
        request(server).get('/api/v1/me/stable-self').set('x-goodnight-user-id', userId),
        request(server).get('/api/v1/me/memories').set('x-goodnight-user-id', userId),
        request(server).get('/api/v1/decisions').set('x-goodnight-user-id', userId),
        request(server).get('/api/v1/future-messages').set('x-goodnight-user-id', userId),
        request(server).get(`/api/v1/reports/monthly?month=${month}`).set('x-goodnight-user-id', userId),
        request(server).get('/api/v1/archive/journeys').set('x-goodnight-user-id', userId),
      ]);
      for (const response of responses) expect(response.status).toBe(200);
    }

    expect(await countPersistedFacts()).toEqual(before);
  }, 45_000);
});
