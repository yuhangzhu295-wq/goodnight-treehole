import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { auth, createApiTestApp, loginAdmin, waitForAiJob } from './helpers';

describe('GoodnightTreeHole 2.0 incremental business loop', () => {
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

  it('persists situation, action, peer, safety and recovery records across refreshes', async () => {
    const server = app.getHttpServer();
    const content = `今晚需要和家人讨论一个现实安排 ${Date.now()}`;

    const privacy = await request(server)
      .patch('/api/v1/me/privacy')
      .send({ allowPeerMatching: true, allowAnonymousExperienceStats: true, allowRecoveryData: true, allowLongTermMemory: true })
      .expect(200);
    expect(privacy.body.item.allowPeerMatching).toBe(true);

    const created = await request(server)
      .post('/api/v1/journeys')
      .send({ title: '一次重要沟通', domain: '家庭', content, feelings: ['紧张'], needs: ['先理清表达顺序'], visibility: 'PRIVATE', intensity: 6 })
      .expect(201);
    expect(created.body.journey.id).toMatch(/^journey_/);
    expect(created.body.snapshot.journeyId).toBe(created.body.journey.id);
    expect(created.body.job.id).toBeTruthy();

    const completedJob = await waitForAiJob(server, created.body.job.id);
    expect(completedJob.status).toMatch(/succeeded|fallback/);
    expect(completedJob.job.providerId).not.toMatch(/ollama|local/i);
    expect(completedJob.result).toBeTruthy();

    const journeyId = created.body.journey.id as string;
    const detailAfterAi = await request(server).get(`/api/v1/journeys/${journeyId}`).expect(200);
    expect(detailAfterAi.body.item.journey.id).toBe(journeyId);
    expect(detailAfterAi.body.item.snapshot).toBeTruthy();

    const confirmed = await request(server)
      .patch(`/api/v1/journeys/${journeyId}/situation`)
      .send({ facts: [content], feelings: ['紧张'], needs: ['明确下一步'], constraints: ['今晚只做一个小沟通'] })
      .expect(200);
    expect(confirmed.body.item.confidence).toBe('user_confirmed');

    const update = await request(server)
      .post(`/api/v1/journeys/${journeyId}/updates`)
      .send({ kind: 'note', content: '我已经把想说的三句话写下来了。' })
      .expect(201);
    expect(update.body.item.journeyId).toBe(journeyId);

    const action = await request(server)
      .post(`/api/v1/journeys/${journeyId}/actions`)
      .send({ title: '先写下开场的一句话', description: '只准备开场，不要求一次说完。' })
      .expect(201);
    const actionId = action.body.item.id as string;
    expect(action.body.item.status).toBe('active');
    expect(action.body.followUp.status).toBe('pending');
    expect(action.body.checkin.status).toBe('pending');

    const checkin = await request(server)
      .post(`/api/v1/actions/${actionId}/checkin`)
      .send({ status: 'completed', reflection: '我完成了开场准备。', intensity: 4 })
      .expect(201);
    expect(checkin.body.checkin.status).toBe('completed');
    expect(checkin.body.action.status).toBe('completed');
    expect(checkin.body.followUp.status).toBe('completed');

    const experience = await request(server)
      .post('/api/v1/peer-experiences')
      .send({ journeyId, title: '从准备表达开始', domain: '家庭', stage: '沟通前', content: '我先把想说的话写成三句，再决定什么时候开口。', tags: ['沟通'], consented: true })
      .expect(201);
    const experienceId = experience.body.item.id as string;
    expect(experience.body.item.status).toBe('pending_review');

    const adminToken = await loginAdmin(server);
    await request(server)
      .patch(`/api/admin/v1/peer-experiences/${experienceId}/review`)
      .set('Authorization', auth(adminToken))
      .send({ status: 'published' })
      .expect(200);
    const adminList = await request(server)
      .get('/api/admin/v1/peer-experiences?pageSize=50')
      .set('Authorization', auth(adminToken))
      .expect(200);
    expect(adminList.body.items.some((item: any) => item.id === experienceId && item.status === 'published')).toBe(true);
    expect((await request(server).get('/api/v1/peers').expect(200)).body.item.experiences.some((item: any) => item.id === experienceId)).toBe(false);

    const decision = await request(server)
      .post('/api/v1/decisions')
      .send({ journeyId, question: '我今晚要不要立刻沟通？', options: ['今晚先试探', '明天再谈'], criteria: ['精力', '对方是否方便'] })
      .expect(201);
    const cooldown = await request(server)
      .post('/api/v1/cooldowns')
      .send({ decisionId: decision.body.item.id, title: '先暂停半小时', reason: '让身体先降速', hours: 1 })
      .expect(201);
    expect(cooldown.body.item.status).toBe('active');

    const handoff = await request(server)
      .post('/api/v1/handoffs')
      .send({ journeyId, recipient: '家人', channel: '当面', summary: '我今晚只想先说明感受，不急着解决全部问题。' })
      .expect(201);
    const shared = await request(server).post(`/api/v1/handoffs/${handoff.body.item.id}/share`).expect(201);
    expect(shared.body.item.status).toBe('shared');

    const contact = await request(server)
      .post('/api/v1/trusted-contacts')
      .send({ nickname: '小林', relation: '朋友', contactHint: '通讯录中的小林' })
      .expect(201);
    expect(contact.body.item.enabled).toBe(true);

    const futureMessage = await request(server)
      .post('/api/v1/future-messages')
      .send({ journeyId, content: '你已经把第一步做完了。', deliverAt: new Date(Date.now() + 86_400_000).toISOString() })
      .expect(201);
    expect(Date.parse(futureMessage.body.item.deliverAt)).toBeGreaterThan(Date.now());

    const supportPlan = await request(server)
      .post('/api/v1/support-plans')
      .send({ journeyId, title: '我的沟通支持计划', plan: { before: ['喝水', '写三句话'], during: ['允许暂停'], after: ['记录感受'] } })
      .expect(201);
    expect(supportPlan.body.item.active).toBe(true);

    const memory = await request(server)
      .post('/api/v1/memory')
      .send({ journeyId, category: '有效做法', content: '先写下来，再开口。', days: 7 })
      .expect(201);
    expect(memory.body.item.id).toMatch(/^memory_/);

    const graduated = await request(server).post(`/api/v1/journeys/${journeyId}/graduate`).expect(201);
    expect(graduated.body.journey.status).toBe('completed');
    expect(graduated.body.recovery).toHaveLength(1);

    const refreshed = await request(server).get('/api/v1/tonight').expect(200);
    expect(refreshed.body.item.journey).toBeNull();

    const persisted = await prisma.lifeJourney.findUnique({ where: { id: journeyId }, include: { snapshot: true, commitments: true, peerExperiences: true, recoverySnapshots: true } });
    expect(persisted?.status).toBe('completed');
    expect(persisted?.snapshot?.confidence).toBe('user_confirmed');
    expect(persisted?.commitments[0]?.status).toBe('completed');
    expect(persisted?.peerExperiences[0]?.status).toBe('published');
    expect(persisted?.recoverySnapshots).toHaveLength(1);
    expect(await prisma.followUpJob.findFirst({ where: { journeyId, payload: { path: ['actionId'], equals: actionId } } })).toMatchObject({ status: 'completed' });
    expect(await prisma.agentDecisionLog.findFirst({ where: { journeyId } })).toBeTruthy();
    expect(await prisma.aIJob.findUnique({ where: { id: created.body.job.id } })).toMatchObject({ providerId: expect.not.stringMatching(/ollama|local/i) });
  }, 120_000);
});
