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

    const plan = await request(server)
      .post(`/api/v1/journeys/${journeyId}/action-plan`)
      .send({ content })
      .expect(201);
    const plannedJob = await waitForAiJob(server, plan.body.job.id);
    expect(plannedJob.status).toMatch(/succeeded|fallback/);
    expect(plannedJob.structured.title).toBeTruthy();

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

    const missedAction = await request(server)
      .post(`/api/v1/journeys/${journeyId}/actions`)
      .send({ title: '稍后再试的沟通动作' })
      .expect(201);
    const missed = await request(server)
      .post(`/api/v1/actions/${missedAction.body.item.id}/checkin`)
      .send({ status: 'missed', barrier: 'too_hard', reflection: '今天还是太难了。' })
      .expect(201);
    expect(missed.body.adaptive.required).toBe(true);
    const adaptivePlan = await request(server)
      .post(`/api/v1/actions/${missedAction.body.item.id}/adaptive-plan`)
      .send({ barrier: 'too_hard' })
      .expect(201);
    const adaptiveJob = await waitForAiJob(server, adaptivePlan.body.job.id);
    expect(adaptiveJob.status).toMatch(/succeeded|fallback/);
    expect(adaptiveJob.structured.title).toBeTruthy();
    const adapted = await request(server)
      .post(`/api/v1/actions/${missedAction.body.item.id}/adapt`)
      .send({ title: adaptiveJob.structured.title, description: adaptiveJob.structured.completionDefinition, barrier: 'too_hard' })
      .expect(201);
    expect(adapted.body.item.parentActionId).toBe(missedAction.body.item.id);
    expect(adapted.body.item.attemptNumber).toBe(2);

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
    expect(graduated.body.graduation.completedActions).toBeGreaterThanOrEqual(1);

    const consent = await request(server)
      .post(`/api/v1/journeys/${journeyId}/graduation-consent`)
      .send({ decision: 'willing' })
      .expect(201);
    expect(consent.body.draft.status).toBe('pending_review');
    expect(await prisma.peerExperience.findUnique({ where: { id: consent.body.draft.id } })).toMatchObject({ status: 'pending_review', journeyId });

    const refreshed = await request(server).get('/api/v1/tonight').expect(200);
    expect(refreshed.body.item.journey).toBeNull();

    const persisted = await prisma.lifeJourney.findUnique({ where: { id: journeyId }, include: { snapshot: true, commitments: true, peerExperiences: true, recoverySnapshots: true } });
    expect(persisted?.status).toBe('completed');
    expect(persisted?.snapshot?.confidence).toBe('user_confirmed');
    expect(persisted?.commitments[0]?.status).toBe('completed');
    expect(persisted?.peerExperiences.some((item) => item.status === 'published')).toBe(true);
    expect(persisted?.peerExperiences.some((item) => item.status === 'pending_review')).toBe(true);
    expect(persisted?.recoverySnapshots).toHaveLength(1);
    expect(await prisma.followUpJob.findFirst({ where: { journeyId, payload: { path: ['actionId'], equals: actionId } } })).toMatchObject({ status: 'completed' });
    expect(await prisma.agentDecisionLog.findFirst({ where: { journeyId } })).toBeTruthy();
    expect(await prisma.aIJob.findUnique({ where: { id: created.body.job.id } })).toMatchObject({ providerId: expect.not.stringMatching(/ollama|local/i) });
  }, 120_000);

  it('delivers an overdue follow-up through Redis/BullMQ and persists the unread notification', async () => {
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/api/v1/journeys')
      .send({ title: '随访队列验证', domain: '其他', content: `验证队列消费 ${Date.now()}`, visibility: 'PRIVATE' })
      .expect(201);
    const action = await request(server)
      .post(`/api/v1/journeys/${created.body.journey.id}/actions`)
      .send({ title: '队列验证的小行动', dueAt: new Date(Date.now() - 5_000).toISOString() })
      .expect(201);
    const followUpId = action.body.followUp.id as string;

    let notification: any;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await request(server).get('/api/v1/notifications').expect(200);
      notification = response.body.items.find((item: any) => item.id === `notification_${followUpId}`);
      if (notification) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    expect(notification).toMatchObject({ id: `notification_${followUpId}`, status: 'unread', type: 'FOLLOW_UP' });
    const persisted = await prisma.followUpJob.findUnique({ where: { id: followUpId } });
    expect(persisted).toMatchObject({ status: 'delivered' });
    expect(await prisma.userNotification.findUnique({ where: { id: `notification_${followUpId}` } })).toMatchObject({ status: 'unread', type: 'FOLLOW_UP' });
  }, 30_000);

  it('connects two distinct persisted users through a reviewed experience and a 72 hour human conversation', async () => {
    const server = app.getHttpServer();
    const guest = 'user_guest';
    const peerPrivacy = { allowPeerMatching: true, allowAnonymousExperienceStats: true };

    await request(server).patch('/api/v1/me/privacy').send(peerPrivacy).expect(200);
    await request(server).patch('/api/v1/me/privacy').set('x-goodnight-user-id', guest).send(peerPrivacy).expect(200);

    const peerJourney = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', guest)
      .send({
        title: '从分开后的晚上慢慢走出来',
        domain: '关系',
        content: `三个月前分开后总想立刻联系对方 ${Date.now()}`,
        scenario: '分开后想联系',
        intensity: 4,
      })
      .expect(201);

    const peerExperience = await request(server)
      .post('/api/v1/peer-experiences')
      .set('x-goodnight-user-id', guest)
      .send({
        journeyId: peerJourney.body.journey.id,
        title: '我先把想发的话放进冷静箱',
        domain: '关系',
        stage: 'graduated',
        content: '我没有立刻解决想念，只先把要发的话写下来，等情绪过去一点再看。',
        tags: ['分开后想联系', '关系'],
        laterSummary: { summary: '三个月后，我能先照顾自己，再决定是否回应关系。' },
        helpfulActions: ['先延迟十分钟', '写下但不发送'],
        consented: true,
      })
      .expect(201);

    const adminToken = await loginAdmin(server);
    await request(server)
      .patch(`/api/admin/v1/peer-experiences/${peerExperience.body.item.id}/review`)
      .set('Authorization', auth(adminToken))
      .send({ status: 'published' })
      .expect(200);

    const requesterJourney = await request(server)
      .post('/api/v1/journeys')
      .send({
        title: '今晚很想给前任发消息',
        domain: '关系',
        content: `分开后我又想马上联系对方 ${Date.now()}`,
        scenario: '分开后想联系',
        intensity: 7,
      })
      .expect(201);
    const requesterJourneyId = requesterJourney.body.journey.id as string;
    await request(server)
      .patch(`/api/v1/journeys/${requesterJourneyId}/situation`)
      .send({
        facts: ['关系已经结束，但今晚很想联系对方'],
        feelings: ['想念'],
        needs: ['先别冲动'],
        domain: '关系',
        subDomain: '分开后想联系',
        contextTags: ['分开后想联系', '关系'],
        intensity: 7,
      })
      .expect(200);

    const matches = await request(server).post(`/api/v1/journeys/${requesterJourneyId}/peer-matches`).send({}).expect(201);
    const exactMatch = matches.body.items.find((item: { peerExperienceId: string }) => item.peerExperienceId === peerExperience.body.item.id);
    expect(exactMatch).toBeTruthy();
    expect(exactMatch.score).toBeGreaterThan(0.5);
    expect(exactMatch.fingerprintSimilarity).toBeGreaterThan(0);

    await request(server).patch(`/api/v1/peer-matches/${exactMatch.id}`).send({ status: 'requested' }).expect(200);
    await request(server).patch(`/api/v1/peer-matches/${exactMatch.id}`).send({ status: 'connected' }).expect(400);

    const guestRequests = await request(server).get('/api/v1/peer-requests').set('x-goodnight-user-id', guest).expect(200);
    expect(guestRequests.body.items.map((item: { id: string }) => item.id)).toContain(exactMatch.id);
    const guestNotifications = await request(server).get('/api/v1/notifications').set('x-goodnight-user-id', guest).expect(200);
    const peerNotificationId = `notification_peer_${exactMatch.id}`;
    expect(guestNotifications.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: peerNotificationId, userId: guest, type: 'PEER_REQUEST', status: 'unread' })]));
    expect(await prisma.userNotification.findUnique({ where: { id: peerNotificationId } })).toMatchObject({ userId: guest, type: 'PEER_REQUEST', status: 'unread' });
    await request(server).patch(`/api/v1/notifications/${peerNotificationId}/read`).set('x-goodnight-user-id', guest).expect(200);
    expect(await prisma.userNotification.findUnique({ where: { id: peerNotificationId } })).toMatchObject({ userId: guest, status: 'read' });

    const accepted = await request(server)
      .post(`/api/v1/peer-matches/${exactMatch.id}/respond`)
      .set('x-goodnight-user-id', guest)
      .send({ status: 'connected' })
      .expect(201);
    expect(accepted.body.conversation.matchId).toBe(exactMatch.id);

    const requesterConversations = await request(server).get('/api/v1/peer-conversations').expect(200);
    const guestConversations = await request(server).get('/api/v1/peer-conversations').set('x-goodnight-user-id', guest).expect(200);
    expect(requesterConversations.body.items.map((item: { matchId: string }) => item.matchId)).toContain(exactMatch.id);
    expect(guestConversations.body.items.map((item: { matchId: string }) => item.matchId)).toContain(exactMatch.id);

    await request(server).post(`/api/v1/peer-conversations/${exactMatch.id}/messages`).send({ content: '我今晚还是很想联系对方。' }).expect(201);
    await request(server)
      .post(`/api/v1/peer-conversations/${exactMatch.id}/messages`)
      .set('x-goodnight-user-id', guest)
      .send({ content: '我当时先把话写下，等十分钟再决定。' })
      .expect(201);

    const detail = await request(server).get(`/api/v1/peer-experiences/${peerExperience.body.item.id}`).expect(200);
    expect(detail.body.item.journey).toBeTruthy();
    expect(detail.body.item.timeline.length).toBeGreaterThan(0);
    expect(detail.body.item.later.summary).toContain('三个月后');

    const persistedConversation = await prisma.peerConversation.findUnique({ where: { matchId: exactMatch.id }, include: { messages: true } });
    expect(persistedConversation?.starterUserId).toBe('user_demo');
    expect(persistedConversation?.receiverUserId).toBe(guest);
    expect(Date.parse(persistedConversation?.expiresAt.toISOString() ?? '') - Date.parse(persistedConversation?.createdAt.toISOString() ?? '')).toBeGreaterThanOrEqual(71 * 3_600_000);
    expect(persistedConversation?.messages.map((message) => message.senderUserId)).toEqual(expect.arrayContaining(['user_demo', guest]));
    expect(persistedConversation?.messages.every((message) => message.authorType === 'HUMAN')).toBe(true);
  }, 60_000);
});
