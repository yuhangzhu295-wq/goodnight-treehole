import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApiTestApp, waitForAiJob, identityFor } from './helpers';

describe('third-stage AI memory context transparency', () => {
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

  it('uses only consented, active, in-scope memory in a real DAPI AI job and records the exact memory ids', async () => {
    const server = app.getHttpServer();
    const userId = 'user_demo';
    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', await identityFor(userId))
      .send({ allowLongTermMemory: true, allowAiMemoryUse: true })
      .expect(200);
    const create = async (title: string, scope: string) =>
      (await request(server)
        .post('/api/v1/memory')
        .set('x-goodnight-user-id', await identityFor(userId))
        .send({ title, content: `${title}：仅作为用户明确同意的有限上下文。`, scope, days: 30 })
        .expect(201)).body.item;
    const allowed = await create('可用于本次 AI 的记忆', 'all_ai');
    const outOfScope = await create('只给恢复摘要的记忆', 'recovery');
    const expired = await create('已经过期的记忆', 'all_ai');
    const disabled = await create('被暂停的记忆', 'all_ai');
    const deleted = await create('随后删除的记忆', 'all_ai');
    await request(server).patch(`/api/v1/me/memories/${expired.id}`).set('x-goodnight-user-id', await identityFor(userId)).send({ status: 'expired' }).expect(200);
    await request(server).patch(`/api/v1/me/memories/${disabled.id}`).set('x-goodnight-user-id', await identityFor(userId)).send({ status: 'disabled' }).expect(200);
    await request(server).delete(`/api/v1/me/memories/${deleted.id}`).set('x-goodnight-user-id', await identityFor(userId)).expect(200);

    const queued = await request(server)
      .post('/api/v1/ai/tasks')
      .set('x-goodnight-user-id', await identityFor(userId))
      .send({ taskType: 'negative_rewrite', style: 'warm', content: '我今天有点累，想把这段话说得更温和一点。' })
      .expect(201);
    const completed = await waitForAiJob(server, queued.body.jobId, 90_000);
    expect(completed.job).toMatchObject({
      status: 'succeeded',
      providerId: 'provider_dapi_deepseek',
      fallbackUsed: false,
      modelName: expect.stringMatching(/deepseek/i),
    });
    const persisted = await prisma.aIJob.findUnique({ where: { id: queued.body.jobId } });
    const trace = (persisted?.traceJson as Array<any>) ?? [];
    const memoryTrace = trace.find((item) => item.event === 'memory-context');
    expect(memoryTrace).toMatchObject({ status: 'used', memoryIds: [allowed.id] });
    expect(memoryTrace.memoryIds).not.toEqual(expect.arrayContaining([outOfScope.id, expired.id, disabled.id, deleted.id]));

    const visible = await request(server).get('/api/v1/me/memories').set('x-goodnight-user-id', await identityFor(userId)).expect(200);
    const visibleAllowed = visible.body.items.find((item: any) => item.id === allowed.id);
    expect(visibleAllowed).toMatchObject({ title: allowed.title, source: 'user_saved', scope: 'all_ai', status: 'active', expiresAt: expect.any(String) });
    expect(visibleAllowed.usages).toEqual(expect.arrayContaining([expect.objectContaining({ jobId: queued.body.jobId })]));

    await request(server).patch('/api/v1/me/privacy').set('x-goodnight-user-id', await identityFor(userId)).send({ allowAiMemoryUse: false }).expect(200);
    const denied = await request(server)
      .post('/api/v1/ai/tasks')
      .set('x-goodnight-user-id', await identityFor(userId))
      .send({ taskType: 'negative_rewrite', style: 'warm', content: '这次不允许读取任何记忆。' })
      .expect(201);
    const deniedCompleted = await waitForAiJob(server, denied.body.jobId, 90_000);
    expect(deniedCompleted.status).toBe('succeeded');
    const deniedJob = await prisma.aIJob.findUnique({ where: { id: denied.body.jobId } });
    expect((deniedJob?.traceJson as Array<any>)?.some((item) => item.event === 'memory-context')).toBe(false);
  }, 210_000);
});
