import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { auth, createApiTestApp, loginAdmin, waitForAiJob } from './helpers';

describe('third-stage monthly recovery report facts', () => {
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

  it('summarizes persisted recovery facts without sending data to AI before long-term analysis is allowed', async () => {
    const server = app.getHttpServer();
    const month = new Date().toISOString().slice(0, 7);
    const demo = 'user_demo';
    const owner = 'user_guest';
    const privacy = {
      allowRecoveryData: true,
      allowJourneyLongTermAnalysis: false,
      allowMonthlyReportShare: false,
      allowPeerMatching: true,
      allowAnonymousExperienceShare: true,
    };
    await request(server).patch('/api/v1/me/privacy').set('x-goodnight-user-id', demo).send(privacy).expect(200);
    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', owner)
      .send({ allowPeerMatching: true, allowAnonymousExperienceShare: true })
      .expect(200);

    const before = (await request(server).get(`/api/v1/reports/monthly?month=${month}`).expect(200)).body.item;
    const baseline = before.recovery;

    const ownerJourney = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', owner)
      .send({ title: `月报同路人经历 ${Date.now()}`, domain: '关系', content: '我先给自己留十分钟，再决定要不要联系。', intensity: 5 })
      .expect(201);
    const ownerExperience = await request(server)
      .post('/api/v1/peer-experiences')
      .set('x-goodnight-user-id', owner)
      .send({
        journeyId: ownerJourney.body.journey.id,
        title: '把冲动留到明天',
        domain: '关系',
        stage: 'graduated',
        content: '我没有急着解决难过，只先照顾今天的自己。',
        tags: ['关系里的拉扯'],
        consented: true,
      })
      .expect(201);
    const adminToken = await loginAdmin(server);
    await request(server)
      .patch(`/api/admin/v1/peer-experiences/${ownerExperience.body.item.id}/review`)
      .set('Authorization', auth(adminToken))
      .send({ status: 'published' })
      .expect(200);

    const journey = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', demo)
      .send({
        title: `月报恢复事实 ${Date.now()}`,
        domain: '关系',
        content: '我有点想马上解释，但准备先让自己缓下来。',
        intensity: 8,
      })
      .expect(201);
    const journeyId = journey.body.journey.id as string;
    await request(server).patch(`/api/v1/journeys/${journeyId}/intent`).set('x-goodnight-user-id', demo).send({ intent: 'NEXT_STEP' }).expect(200);

    const completedAction = await request(server)
      .post(`/api/v1/journeys/${journeyId}/actions`)
      .set('x-goodnight-user-id', demo)
      .send({ title: '先喝一杯温水', description: '把注意力带回身体。' })
      .expect(201);
    const missedAction = await request(server)
      .post(`/api/v1/journeys/${journeyId}/actions`)
      .set('x-goodnight-user-id', demo)
      .send({ title: '今晚十点前关掉对话框', description: '给自己一个休息边界。' })
      .expect(201);
    await request(server)
      .post(`/api/v1/actions/${completedAction.body.item.id}/checkin`)
      .set('x-goodnight-user-id', demo)
      .send({ status: 'completed', reflection: '喝水以后能慢一点想。', intensity: 6 })
      .expect(201);
    await request(server)
      .post(`/api/v1/actions/${missedAction.body.item.id}/checkin`)
      .set('x-goodnight-user-id', demo)
      .send({ status: 'missed', reflection: '今晚忘记了，明天再缩小一步。', intensity: 7, barrier: 'forgot' })
      .expect(201);
    await request(server)
      .post(`/api/v1/actions/${missedAction.body.item.id}/adapt`)
      .set('x-goodnight-user-id', demo)
      .send({ title: '先设一个十分钟提醒', description: '把行动缩小到可以开始。', barrier: 'forgot' })
      .expect(201);

    await request(server)
      .post('/api/v1/me/recovery')
      .set('x-goodnight-user-id', demo)
      .send({ journeyId, signals: { sleep: 'partial', humanContact: 'yes', comfort: 'yes' }, summary: '我给朋友发了一句近况。' })
      .expect(201);
    await request(server)
      .post('/api/v1/me/recovery')
      .set('x-goodnight-user-id', demo)
      .send({ journeyId, signals: { sleep: 'yes', humanContact: 'partial', comfort: 'no' }, summary: '今晚提前一点躺下。' })
      .expect(201);
    await request(server)
      .post('/api/v1/decisions')
      .set('x-goodnight-user-id', demo)
      .send({ question: '今晚是否立刻回复？', options: ['现在回复', '明天再看'], criteria: ['先照顾睡眠', '不在高强度时决定'] })
      .expect(201);
    await request(server)
      .post('/api/v1/peer-experiences')
      .set('x-goodnight-user-id', demo)
      .send({ journeyId, title: '先让自己缓一缓', domain: '关系', stage: 'acting', content: '我先不急着做决定。', tags: ['关系里的拉扯'], consented: true })
      .expect(201);

    const suggestions = await request(server)
      .post(`/api/v1/journeys/${journeyId}/peer-matches`)
      .set('x-goodnight-user-id', demo)
      .send({})
      .expect(201);
    const match = suggestions.body.items.find((item: { peerExperienceId: string }) => item.peerExperienceId === ownerExperience.body.item.id);
    expect(match).toBeTruthy();
    await request(server)
      .patch(`/api/v1/peer-matches/${match.id}`)
      .set('x-goodnight-user-id', demo)
      .send({ status: 'requested', requestReason: '我也想先把决定放慢一点。' })
      .expect(200);
    await request(server).post(`/api/v1/peer-matches/${match.id}/respond`).set('x-goodnight-user-id', owner).send({ status: 'connected' }).expect(201);
    await request(server).post(`/api/v1/peer-matches/${match.id}/consent`).set('x-goodnight-user-id', owner).send({}).expect(201);

    const current = (await request(server).get(`/api/v1/reports/monthly?month=${month}`).expect(200)).body.item;
    expect(current).toMatchObject({ month, analysisAllowed: false, aiJobStatus: 'disabled', summary: '' });
    expect(current.recovery).toMatchObject({
      journeyCount: baseline.journeyCount + 1,
      supportIntentCount: baseline.supportIntentCount + 1,
      actionCount: baseline.actionCount + 3,
      completedActionCount: baseline.completedActionCount + 1,
      adaptedActionCount: baseline.adaptedActionCount + 1,
      missedActionCount: baseline.missedActionCount + 1,
      recoveryCheckinCount: baseline.recoveryCheckinCount + 2,
      peerConversationCount: baseline.peerConversationCount + 1,
      peerExperienceCount: baseline.peerExperienceCount + 1,
      decisionCount: baseline.decisionCount + 1,
      intensityCheckinCount: baseline.intensityCheckinCount + 2,
      intensityChangeCount: baseline.intensityChangeCount + 2,
    });
    expect(current.recovery.mostHelpfulAction).toBe('先喝一杯温水');
    expect(current.recovery.mostStuckAction).toBe('今晚十点前关掉对话框');
    expect(current.recovery.lifeFunctions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'sleep', recordedCount: 2, yesCount: 1, partialCount: 1 }),
        expect.objectContaining({ key: 'humanContact', recordedCount: 2, yesCount: 1, partialCount: 1 }),
        expect.objectContaining({ key: 'comfort', recordedCount: 2, yesCount: 1, noCount: 1 }),
      ]),
    );
    expect(await prisma.aIJob.count({ where: { taskType: 'monthly_recovery_summary' } })).toBe(0);
    expect(await prisma.monthlyReport.findUnique({ where: { userId_month: { userId: demo, month } } })).toMatchObject({ month, userId: demo });

    const { StoreService } = await import('../../apps/api/src/store.service.js');
    await app.get(StoreService).reloadRuntimeState();
    const afterReload = (await request(server).get(`/api/v1/reports/monthly?month=${month}`).expect(200)).body.item;
    expect(afterReload.recovery).toMatchObject(current.recovery);

    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', demo)
      .send({ allowJourneyLongTermAnalysis: true, allowAiMemoryUse: false })
      .expect(200);
    const queued = (await request(server).get(`/api/v1/reports/monthly?month=${month}`).expect(200)).body.item;
    expect(queued).toMatchObject({ analysisAllowed: true, aiJobId: expect.any(String) });
    const completed = await waitForAiJob(server, queued.aiJobId, 60_000);
    expect(completed.status).toBe('succeeded');
    const persistedSummaryJob = await prisma.aIJob.findUnique({ where: { id: queued.aiJobId } });
    expect(persistedSummaryJob).toMatchObject({
      taskType: 'monthly_recovery_summary',
      status: 'succeeded',
      providerId: 'provider_dapi_deepseek',
      fallbackUsed: false,
      modelName: expect.stringMatching(/deepseek/i),
    });
    const withSummary = (await request(server).get(`/api/v1/reports/monthly?month=${month}`).expect(200)).body.item;
    expect(withSummary).toMatchObject({ analysisAllowed: true, aiJobStatus: 'succeeded' });
    expect(withSummary.summary.trim().length).toBeGreaterThan(20);
    expect(persistedSummaryJob).toMatchObject({
      taskType: 'monthly_recovery_summary',
      status: 'succeeded',
      providerId: 'provider_dapi_deepseek',
      fallbackUsed: false,
    });
  }, 60_000);
});
