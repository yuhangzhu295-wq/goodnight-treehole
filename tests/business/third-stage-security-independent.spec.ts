import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApiTestApp } from './helpers';

describe('third-stage privacy and anonymous-user isolation', () => {
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

  it('uses minimum defaults and prevents User B from reading, editing, or deleting User A third-stage records', async () => {
    const server = app.getHttpServer();
    const userA = 'user_demo';
    const userB = 'user_guest';
    const initial = await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', userA).expect(200);
    expect(initial.body.item).toMatchObject({
      allowRecoveryData: false,
      allowLongTermMemory: false,
      allowAiMemoryUse: false,
      allowAnonymousExperienceShare: false,
      allowJourneyArchiveRetention: false,
      allowFutureSelfNotifications: false,
      allowDataExport: false,
    });

    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', userA)
      .send({ allowRecoveryData: true, allowLongTermMemory: true, allowAiMemoryUse: true })
      .expect(200);
    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', userB)
      .send({ allowRecoveryData: true, allowLongTermMemory: true, allowAiMemoryUse: false })
      .expect(200);

    const stableA = await request(server)
      .put('/api/v1/me/stable-self')
      .set('x-goodnight-user-id', userA)
      .send({ profile: { stableDescription: '只有 A 自己写下的稳定提醒。', stabilityAnchors: ['先睡一觉'] } })
      .expect(200);
    const supportA = await request(server)
      .put('/api/v1/me/support-plan')
      .set('x-goodnight-user-id', userA)
      .send({ title: 'A 的预案', plan: { safePeople: ['A 的朋友'], smallActions: ['A 的小行动'] } })
      .expect(200);
    const recoveryA = await request(server)
      .post('/api/v1/me/recovery')
      .set('x-goodnight-user-id', userA)
      .send({ summary: 'A 的恢复记录。', signals: { food: 'yes', sleep: 'partial' } })
      .expect(201);
    const memoryA = await request(server)
      .post('/api/v1/memory')
      .set('x-goodnight-user-id', userA)
      .send({ title: 'A 私有记忆', content: '只能由 A 查看或改动。', scope: 'all_ai' })
      .expect(201);

    expect((await request(server).get('/api/v1/me/stable-self').set('x-goodnight-user-id', userB).expect(200)).body.item).toBeNull();
    expect((await request(server).get('/api/v1/me/support-plan').set('x-goodnight-user-id', userB).expect(200)).body.item).toBeNull();
    expect((await request(server).get('/api/v1/me/recovery').set('x-goodnight-user-id', userB).expect(200)).body.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: recoveryA.body.item.id })]));
    expect((await request(server).get('/api/v1/me/memories').set('x-goodnight-user-id', userB).expect(200)).body.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: memoryA.body.item.id })]));

    await request(server)
      .patch(`/api/v1/me/memories/${memoryA.body.item.id}`)
      .set('x-goodnight-user-id', userB)
      .send({ content: 'B 尝试篡改 A 的内容。' })
      .expect(404);
    await request(server).delete(`/api/v1/me/memories/${memoryA.body.item.id}`).set('x-goodnight-user-id', userB).expect(404);
    expect(await prisma.memoryItem.findUnique({ where: { id: memoryA.body.item.id } })).toMatchObject({ userId: userA, deletedAt: null, content: '只能由 A 查看或改动。' });
    expect(await prisma.stableSelfProfile.findUnique({ where: { id: stableA.body.item.id } })).toMatchObject({ userId: userA });
    expect(await prisma.personalSupportPlan.findUnique({ where: { id: supportA.body.item.id } })).toMatchObject({ userId: userA });

    const forgedAiJob = await request(server)
      .post('/api/v1/ai/tasks')
      .set('x-goodnight-user-id', userB)
      .send({
        userId: userA,
        taskType: 'negative_rewrite',
        style: 'warm',
        content: 'B 不能借由请求体伪造 A 的 AI 身份。',
      })
      .expect(201);
    expect(forgedAiJob.body.job).toMatchObject({ userId: userB });
    await request(server)
      .get(`/api/v1/ai/tasks/${forgedAiJob.body.jobId}`)
      .set('x-goodnight-user-id', userA)
      .expect(404);
    await request(server)
      .get(`/api/v1/ai/tasks/${forgedAiJob.body.jobId}`)
      .set('x-goodnight-user-id', userB)
      .expect(200);

    await request(server).post('/api/v1/memory').set('x-goodnight-user-id', 'unknown-user').send({ title: '越权', content: '不能创建' }).expect(404);
    await request(server).post('/api/v1/me/recovery').set('x-goodnight-user-id', 'unknown-user').send({ signals: {} }).expect(404);
  });
});
