import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Queue } from '../../apps/api/node_modules/bullmq';
import request from 'supertest';
import { createApiTestApp, followUpTestConnection } from './helpers';

describe('third-stage privacy 2.0 business boundaries', () => {
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

  it('persists independent consent and enforces export, memory, peer, archive, and future-notification boundaries', async () => {
    const server = app.getHttpServer();
    const initial = await request(server).get('/api/v1/settings/privacy').expect(200);
    expect(initial.body.item).toEqual(
      expect.objectContaining({
        allowAiMemoryUse: expect.any(Boolean),
        allowAnonymousExperienceShare: expect.any(Boolean),
        allowJourneyArchiveRetention: expect.any(Boolean),
        allowFutureSelfNotifications: expect.any(Boolean),
        allowDataExport: expect.any(Boolean),
      }),
    );

    const denied = {
      allowDataExport: false,
      allowLongTermMemory: false,
      allowAiMemoryUse: false,
      allowPeerMatching: false,
      allowMonthlyReportShare: false,
      allowAnonymousExperienceShare: false,
      allowJourneyArchiveRetention: false,
      allowFutureSelfNotifications: false,
    };
    const savedDenied = await request(server).put('/api/v1/settings/privacy').send(denied).expect(200);
    expect(savedDenied.body.item).toMatchObject(denied);
    expect(await prisma.privacySetting.findUnique({ where: { userId: 'user_demo' } })).toMatchObject(denied);

    const journey = await request(server)
      .post('/api/v1/journeys')
      .send({ title: `隐私边界回归 ${Date.now()}`, domain: '关系', content: '我先把需要保护的内容留在这里。', visibility: 'PRIVATE' })
      .expect(201);
    const journeyId = journey.body.journey.id as string;

    await request(server).post('/api/v1/diaries/export').expect(403);
    await request(server).post(`/api/v1/reports/monthly/${new Date().toISOString().slice(0, 7)}/poster`).expect(403);
    await request(server).post('/api/v1/memory').send({ title: '有限记忆', content: '这条记忆必须经过同意。' }).expect(403);
    await request(server).get(`/api/v1/journeys/${journeyId}/peers`).expect(403);
    await request(server)
      .post('/api/v1/peer-experiences')
      .send({ journeyId, title: '匿名经历', domain: '关系', content: '这段经历没有经过分享许可。', consented: true })
      .expect(403);
    await request(server).patch(`/api/v1/journeys/${journeyId}/status`).send({ status: 'archived' }).expect(403);

    const allowed = {
      allowDataExport: true,
      allowLongTermMemory: true,
      allowPeerMatching: true,
      allowMonthlyReportShare: true,
      allowAnonymousExperienceShare: true,
      allowJourneyArchiveRetention: true,
      allowFutureSelfNotifications: false,
    };
    await request(server).patch('/api/v1/settings/privacy').send(allowed).expect(200);

    expect((await request(server).post('/api/v1/diaries/export').expect(201)).body.item.asset).toMatchObject({ status: 'ready' });
    expect(
      (await request(server).post('/api/v1/memory').send({ title: '有限记忆', content: '由我自己选择保存。', scope: 'all_ai' }).expect(201)).body.item,
    ).toMatchObject({ title: '有限记忆', status: 'active' });
    await request(server).get(`/api/v1/journeys/${journeyId}/peers`).expect(200);
    expect(
      (await request(server)
        .post('/api/v1/peer-experiences')
        .send({ journeyId, title: '匿名经历', domain: '关系', content: '我明确同意留下去标识化的经历。', consented: true })
        .expect(201)).body.item,
    ).toMatchObject({ title: '匿名经历', domain: '关系' });
    expect((await request(server).patch(`/api/v1/journeys/${journeyId}/status`).send({ status: 'archived' }).expect(200)).body.journey).toMatchObject({ status: 'archived' });

    const future = await request(server)
      .post('/api/v1/future-messages')
      .send({ content: '未来信提醒关闭时，信仍应准时送达。', deliverAt: new Date(Date.now() + 86_400_000).toISOString() })
      .expect(201);
    const messageId = future.body.item.id as string;
    const followUpId = future.body.followUp.id as string;
    const past = new Date(Date.now() - 2_000);
    await prisma.$transaction([
      prisma.messageToFutureSelf.update({ where: { id: messageId }, data: { deliverAt: past } }),
      prisma.followUpJob.update({ where: { id: followUpId }, data: { dueAt: past, status: 'pending', completedAt: null } }),
    ]);

    const queue = new Queue(process.env.FOLLOW_UP_QUEUE_NAME!, { connection: followUpTestConnection() });
    await queue.add(
      'FUTURE_SELF',
      { id: followUpId, kind: 'FUTURE_SELF', userId: 'user_demo', payload: { messageId } },
      {
        // The original future message keeps its delayed job. This immediate job
        // exercises the same worker against the same persisted record without
        // colliding with BullMQ's job-id de-duplication.
        jobId: `${followUpId}-privacy-delivery`,
        delay: 0,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: false,
        removeOnFail: false,
      },
    );
    await queue.close();

    let delivered = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const item = await prisma.messageToFutureSelf.findUnique({ where: { id: messageId } });
      if (item?.deliveredAt) {
        delivered = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect(delivered).toBe(true);
    expect(await prisma.followUpJob.findUnique({ where: { id: followUpId } })).toMatchObject({ status: 'delivered' });
    expect(await prisma.userNotification.findUnique({ where: { id: `notification_${followUpId}` } })).toBeNull();

    const reloaded = await request(server).get('/api/v1/settings/privacy').expect(200);
    expect(reloaded.body.item).toMatchObject({ ...allowed, allowAiMemoryUse: false });
  }, 45_000);
});
