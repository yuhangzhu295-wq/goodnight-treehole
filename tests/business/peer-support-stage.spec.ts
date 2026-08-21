import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { auth, createApiTestApp, loginAdmin, waitForAiJob } from './helpers';

describe('Peer Support Network second-stage loop', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const owner = 'user_guest';
  const requester = 'user_demo';

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('requires privacy, consent, and an active conversation before messages can cross users', async () => {
    const server = app.getHttpServer();
    await request(server).patch('/api/v1/me/privacy').set('x-goodnight-user-id', requester).send({ allowPeerMatching: false }).expect(200);
    const hiddenNetwork = await request(server).get('/api/v1/peers').set('x-goodnight-user-id', requester).expect(200);
    expect(hiddenNetwork.body.item).toMatchObject({ privacyEnabled: false, matches: [], experiences: [] });
    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', requester)
      .send({ allowPeerMatching: true, allowAnonymousExperienceShare: true })
      .expect(200);
    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', owner)
      .send({ allowPeerMatching: true, allowAnonymousExperienceShare: true })
      .expect(200);
    const redactedDraft = await request(server).post('/api/v1/peer-experiences').set('x-goodnight-user-id', owner).send({ title: '我叫王小明的后来', domain: '关系', stage: 'graduated', content: '手机号 13800138000，邮箱 peer@example.com，住在杭州市西湖区文三路。', tags: ['微信:peertest'], consented: true, laterSummary: { summary: '地址在杭州市西湖区文三路。' } }).expect(201);
    expect(JSON.stringify(redactedDraft.body.item)).not.toMatch(/13800138000|peer@example\.com|杭州市西湖区文三路|peertest|王小明/);
    await request(server).get(`/api/v1/peer-experiences/${redactedDraft.body.item.id}`).set('x-goodnight-user-id', requester).expect(404);
    const persistedRedactedDraft = await prisma.peerExperience.findUnique({ where: { id: redactedDraft.body.item.id } });
    expect(JSON.stringify(persistedRedactedDraft)).not.toMatch(/13800138000|peer@example\.com|杭州市西湖区文三路|peertest|王小明/);

    const ownerJourney = await request(server).post('/api/v1/journeys').set('x-goodnight-user-id', owner).send({ title: '慢慢放下联系冲动', domain: '关系', content: `先把话写下来 ${Date.now()}`, intensity: 5 }).expect(201);
    const experience = await request(server).post('/api/v1/peer-experiences').set('x-goodnight-user-id', owner).send({ journeyId: ownerJourney.body.journey.id, title: '我把消息留到明天再看', domain: '关系', stage: 'graduated', content: '我没有马上让难过消失，只先照顾今天的自己。', tags: ['分开后想联系'], consented: true }).expect(201);
    const adminToken = await loginAdmin(server);
    await request(server).patch(`/api/admin/v1/peer-experiences/${experience.body.item.id}/review`).set('Authorization', auth(adminToken)).send({ status: 'published' }).expect(200);
    const adminExperiences = await request(server).get('/api/admin/v1/peer-experiences?status=published&pageSize=100').set('Authorization', auth(adminToken)).expect(200);
    expect(adminExperiences.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: experience.body.item.id, status: 'published', userId: owner })]));

    const requesterJourney = await request(server).post('/api/v1/journeys').set('x-goodnight-user-id', requester).send({ title: '今晚又想联系 TA', domain: '关系', content: `我想立刻去联系对方 ${Date.now()}`, intensity: 7 }).expect(201);
    const ownExperience = await request(server).post('/api/v1/peer-experiences').set('x-goodnight-user-id', requester).send({ journeyId: requesterJourney.body.journey.id, title: '不应匹配给自己', domain: '关系', stage: 'graduated', content: '这是自己的匿名经历，不应出现在自己的同路推荐里。', tags: ['分开后想联系'], consented: true }).expect(201);
    await request(server).patch(`/api/v1/peer-experiences/${ownExperience.body.item.id}`).set('x-goodnight-user-id', owner).send({ title: '越权修改' }).expect(404);
    await request(server).patch(`/api/v1/peer-experiences/${ownExperience.body.item.id}`).set('x-goodnight-user-id', requester).send({ title: '自己的匿名经历，仍不应匹配给自己' }).expect(200);
    await request(server).patch(`/api/admin/v1/peer-experiences/${ownExperience.body.item.id}/review`).set('Authorization', auth(adminToken)).send({ status: 'published' }).expect(200);
    const suggested = await request(server).post(`/api/v1/journeys/${requesterJourney.body.journey.id}/peer-matches`).set('x-goodnight-user-id', requester).send({}).expect(201);
    expect(suggested.body.items.some((item: { peerExperienceId: string }) => item.peerExperienceId === ownExperience.body.item.id)).toBe(false);
    expect(JSON.stringify(suggested.body.items)).not.toMatch(/scoreBreakdown|trustScore|fingerprintSimilarity|stageDistance|"score"/);
    const ownJourneyPeers = await request(server).get(`/api/v1/journeys/${requesterJourney.body.journey.id}/peers`).set('x-goodnight-user-id', requester).expect(200);
    expect(JSON.stringify(ownJourneyPeers.body.items)).not.toMatch(/scoreBreakdown|trustScore|fingerprintSimilarity|stageDistance|"score"/);
    await request(server).get(`/api/v1/journeys/${requesterJourney.body.journey.id}/peers`).set('x-goodnight-user-id', owner).expect(404);
    await request(server).get(`/api/v1/journeys/${requesterJourney.body.journey.id}/peers`).set('x-goodnight-user-id', 'peer_intruder').expect(404);
    const match = suggested.body.items.find((item: { peerExperienceId: string }) => item.peerExperienceId === experience.body.item.id);
    expect(match).toBeTruthy();
    const adminMatches = await request(server).get('/api/admin/v1/peer-matches?pageSize=100').set('Authorization', auth(adminToken)).expect(200);
    expect(adminMatches.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: match.id, userId: requester, peerExperienceId: experience.body.item.id, score: expect.any(Number) })]));

    await request(server).patch(`/api/v1/peer-matches/${match.id}`).set('x-goodnight-user-id', requester).send({ status: 'requested', requestReason: '我的手机号是 13800138000' }).expect(400);
    await request(server).patch(`/api/v1/peer-matches/${match.id}`).set('x-goodnight-user-id', requester).send({ status: 'requested', requestReason: '我的邮箱是 peer@example.com' }).expect(400);
    await request(server).patch(`/api/v1/peer-matches/${match.id}`).set('x-goodnight-user-id', requester).send({ status: 'requested', requestReason: '我住在杭州市西湖区文三路附近' }).expect(400);
    await request(server).patch(`/api/v1/peer-matches/${match.id}`).set('x-goodnight-user-id', requester).send({ status: 'requested', requestReason: '我的微信号是 peerwx2026' }).expect(400);
    await request(server).patch(`/api/v1/peer-matches/${match.id}`).set('x-goodnight-user-id', requester).send({ status: 'requested', requestReason: '身份证号 11010519491231002X' }).expect(400);
    await request(server).patch(`/api/v1/peer-matches/${match.id}`).set('x-goodnight-user-id', requester).send({ status: 'requested', requestReason: '我也在学着别急着联系。', requestQuestion: '你当时怎么熬过第一晚？' }).expect(200);
    const requestNotification = await request(server).get('/api/v1/notifications').set('x-goodnight-user-id', owner).expect(200);
    expect(requestNotification.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'PEER_REQUEST', targetRoute: expect.stringContaining('/pages/peer/requests') })]));

    await request(server).post(`/api/v1/peer-conversations/${match.id}/messages`).set('x-goodnight-user-id', requester).send({ content: '现在还不能说话。' }).expect(404);
    await request(server).post(`/api/v1/peer-matches/${match.id}/consent`).set('x-goodnight-user-id', requester).send({}).expect(403);
    const accepted = await request(server).post(`/api/v1/peer-matches/${match.id}/respond`).set('x-goodnight-user-id', owner).send({ status: 'connected' }).expect(201);
    expect(accepted.body.conversation).toBeNull();
    await request(server).post(`/api/v1/peer-conversations/${match.id}/messages`).set('x-goodnight-user-id', requester).send({ content: '还是不能说话。' }).expect(404);

    const active = await request(server).post(`/api/v1/peer-matches/${match.id}/consent`).set('x-goodnight-user-id', owner).send({}).expect(201);
    expect(active.body.conversation.matchId).toBe(match.id);
    expect(active.body.conversation.consentAcceptedAt).toBeTruthy();
    const acceptedNotifications = await request(server).get('/api/v1/notifications').set('x-goodnight-user-id', requester).expect(200);
    const acceptedNotification = acceptedNotifications.body.items.find((item: { type: string; targetRoute: string }) => item.type === 'PEER_ACCEPTED' && item.targetRoute.includes(match.id));
    expect(acceptedNotification).toBeTruthy();
    await request(server).patch(`/api/v1/notifications/${acceptedNotification.id}/read`).set('x-goodnight-user-id', requester).send({}).expect(200);
    const readNotifications = await request(server).get('/api/v1/notifications').set('x-goodnight-user-id', requester).expect(200);
    expect(readNotifications.body.items.find((item: { id: string }) => item.id === acceptedNotification.id)).toMatchObject({ status: 'read' });

    await request(server).post(`/api/v1/peer-conversations/${match.id}/close`).set('x-goodnight-user-id', 'peer_intruder').send({}).expect(404);
    await request(server).post(`/api/v1/peer-conversations/${match.id}/block`).set('x-goodnight-user-id', 'peer_intruder').send({}).expect(404);
    await request(server).post(`/api/v1/peer-conversations/${match.id}/report`).set('x-goodnight-user-id', 'peer_intruder').send({ reason: '越权举报' }).expect(404);

    const messageCountBeforeAssist = await prisma.peerMessage.count({ where: { conversationId: active.body.conversation.id } });
    const assist = await request(server).post(`/api/v1/peer-conversations/${match.id}/assist`).set('x-goodnight-user-id', requester).send({ content: '我想先把这十分钟过完，再决定要不要联系 TA。' }).expect(201);
    const completedAssist = await waitForAiJob(server, assist.body.job.id, 45_000);
    expect(completedAssist.status).toBe('succeeded');
    const persistedAssist = await prisma.aIJob.findUnique({ where: { id: assist.body.job.id } });
    expect(persistedAssist).toMatchObject({ taskType: 'peer_response_assist', providerId: 'provider_dapi_deepseek', fallbackUsed: false });
    expect(persistedAssist?.modelName).toBeTruthy();
    expect(await prisma.peerMessage.count({ where: { conversationId: active.body.conversation.id } })).toBe(messageCountBeforeAssist);
    const { StoreService } = await import('../../apps/api/src/store.service');
    const store = app.get(StoreService);
    const failedPeerDraft = await store.runAiJob({
      userId: requester,
      contentId: active.body.conversation.id,
      contentType: 'peer-conversation',
      jobType: 'peer_response_assist',
      taskType: 'peer_response_assist',
      mood: '委屈',
      style: 'warm',
      promptSummary: '我先把想说的话写下来，不让 AI 自动代替我发送。',
      simulatePrimaryFail: true,
    });
    expect(failedPeerDraft).toMatchObject({ status: 'failed', providerId: 'provider_dapi_deepseek', fallbackUsed: false });
    expect((failedPeerDraft.traceJson as Array<{ providerId?: string }>).every((entry) => !entry.providerId || entry.providerId === 'provider_dapi_deepseek')).toBe(true);

    await request(server).post(`/api/v1/peer-conversations/${match.id}/messages`).set('x-goodnight-user-id', requester).send({ content: '我现在很想联系 TA，但准备先等十分钟。' }).expect(201);
    await request(server).post(`/api/v1/peer-conversations/${match.id}/messages`).set('x-goodnight-user-id', owner).send({ content: '我当时先喝口水，再把消息留在草稿里。' }).expect(201);
    await request(server).post(`/api/v1/peer-conversations/${match.id}/messages`).set('x-goodnight-user-id', owner).send({ content: '加我微信:peertest' }).expect(400);
    await request(server).post(`/api/v1/peer-conversations/${match.id}/messages`).set('x-goodnight-user-id', owner).send({ content: '请发到 peer@example.com' }).expect(400);
    await request(server).post(`/api/v1/peer-conversations/${match.id}/messages`).set('x-goodnight-user-id', owner).send({ content: '我的 QQ: 12345678' }).expect(400);
    await request(server).post(`/api/v1/peer-conversations/${match.id}/messages`).set('x-goodnight-user-id', owner).send({ content: '身份证是 11010519491231002X' }).expect(400);
    await request(server).post(`/api/v1/peer-conversations/${match.id}/messages`).set('x-goodnight-user-id', owner).send({ content: '我住在杭州市西湖区文三路附近' }).expect(400);
    const anonymousConversation = await request(server).get('/api/v1/peer-conversations').set('x-goodnight-user-id', requester).expect(200);
    const anonymousMatchConversation = anonymousConversation.body.items.find((item: { matchId: string }) => item.matchId === match.id);
    expect(JSON.stringify(anonymousMatchConversation)).not.toMatch(/user_guest|user_demo|senderUserId|starterUserId|receiverUserId|viewerUserId/);
    expect(anonymousMatchConversation.messages.map((item: { author: string }) => item.author)).toEqual(expect.arrayContaining(['self', 'peer']));
    await request(server).get('/api/v1/peer-conversations').set('x-goodnight-user-id', 'peer_intruder').expect(404);
    await request(server).post(`/api/v1/peer-conversations/${match.id}/messages`).set('x-goodnight-user-id', 'peer_intruder').send({ content: '越权消息' }).expect(404);

    await request(server).post(`/api/v1/peer-conversations/${match.id}/report`).set('x-goodnight-user-id', requester).send({ reason: '这是一次用于验证真实举报链路的反馈。' }).expect(201);
    const adminConversations = await request(server)
      .get('/api/admin/v1/peer-conversations?pageSize=100')
      .set('Authorization', auth(adminToken))
      .expect(200);
    expect(adminConversations.body.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ matchId: match.id, reporterUserId: requester, reportReason: '这是一次用于验证真实举报链路的反馈。', messageCount: 2 }),
    ]));
    const memoryConversation = store.peerConversations.find((item) => item.matchId === match.id);
    expect(memoryConversation).toBeTruthy();
    const persistedStartsAt = new Date(Date.now() - 73 * 60 * 60 * 1_000).toISOString();
    const persistedExpiresAt = new Date(Date.now() - 1_000).toISOString();
    memoryConversation!.startsAt = persistedStartsAt;
    memoryConversation!.expiresAt = persistedExpiresAt;
    await (store as any).persistAndFlush();
    const preReloadConversation = await prisma.peerConversation.findUnique({ where: { matchId: match.id } });
    expect(preReloadConversation?.startsAt.getTime()).toBe(new Date(persistedStartsAt).getTime());
    expect(preReloadConversation?.expiresAt.getTime()).toBe(new Date(persistedExpiresAt).getTime());
    await store.reloadRuntimeState();
    expect(store.peerConversations.find((item) => item.matchId === match.id)?.expiresAt).toBe(persistedExpiresAt);
    const expired = await request(server).get('/api/v1/peer-conversations').set('x-goodnight-user-id', requester).expect(200);
    const closed = expired.body.items.find((item: { matchId: string }) => item.matchId === match.id);
    expect(closed).toMatchObject({ status: 'closed', closedReason: 'expired' });
    await request(server).post(`/api/v1/peer-conversations/${match.id}/messages`).set('x-goodnight-user-id', requester).send({ content: '会话结束后不能发送。' }).expect(400);
    const expiredNotifications = await request(server).get('/api/v1/notifications').set('x-goodnight-user-id', requester).expect(200);
    expect(expiredNotifications.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'CONVERSATION_CLOSED', targetRoute: expect.stringContaining(match.id) })]));
    const ownerExpiredNotifications = await request(server).get('/api/v1/notifications').set('x-goodnight-user-id', owner).expect(200);
    expect(ownerExpiredNotifications.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'CONVERSATION_CLOSED', targetRoute: expect.stringContaining(match.id) })]));
    await request(server).post(`/api/v1/peer-conversations/${match.id}/feedback`).set('x-goodnight-user-id', requester).send({ feedback: 'helpful', note: '这段同行让我先把消息留在草稿里。', shareLater: true }).expect(201);

    const persisted = await prisma.peerConversation.findUnique({ where: { matchId: match.id }, include: { messages: true } });
    expect(persisted).toMatchObject({ status: 'closed', closedReason: 'expired', reporterUserId: requester, feedback: 'helpful' });
    expect(persisted?.messages).toHaveLength(2);
    expect(await prisma.peerExperience.findFirst({ where: { userId: requester, status: 'pending_review', title: '这段同行之后，我慢慢走了一点出来' } })).toBeTruthy();

    const declinedExperience = await request(server).post('/api/v1/peer-experiences').set('x-goodnight-user-id', owner).send({ journeyId: ownerJourney.body.journey.id, title: '这次只想先听一听', domain: '关系', stage: 'graduated', content: '我后来先不急着做决定，给自己留一点空间。', tags: ['分开后想联系'], consented: true }).expect(201);
    const blockedExperience = await request(server).post('/api/v1/peer-experiences').set('x-goodnight-user-id', owner).send({ journeyId: ownerJourney.body.journey.id, title: '把冲动留到明天', domain: '关系', stage: 'graduated', content: '我后来发现晚一点回答，也是一种照顾自己。', tags: ['分开后想联系'], consented: true }).expect(201);
    const closedExperience = await request(server).post('/api/v1/peer-experiences').set('x-goodnight-user-id', owner).send({ journeyId: ownerJourney.body.journey.id, title: '学会在结束前说再见', domain: '关系', stage: 'graduated', content: '结束一段交流时，也可以平静地说一声谢谢。', tags: ['分开后想联系'], consented: true }).expect(201);
    const activeBlockExperience = await request(server).post('/api/v1/peer-experiences').set('x-goodnight-user-id', owner).send({ journeyId: ownerJourney.body.journey.id, title: '不舒服时可以立刻离开', domain: '关系', stage: 'graduated', content: '不继续解释，也是一种保护自己的边界。', tags: ['分开后想联系'], consented: true }).expect(201);
    await request(server).patch(`/api/admin/v1/peer-experiences/${declinedExperience.body.item.id}/review`).set('Authorization', auth(adminToken)).send({ status: 'published' }).expect(200);
    await request(server).patch(`/api/admin/v1/peer-experiences/${blockedExperience.body.item.id}/review`).set('Authorization', auth(adminToken)).send({ status: 'published' }).expect(200);
    await request(server).patch(`/api/admin/v1/peer-experiences/${closedExperience.body.item.id}/review`).set('Authorization', auth(adminToken)).send({ status: 'published' }).expect(200);
    await request(server).patch(`/api/admin/v1/peer-experiences/${activeBlockExperience.body.item.id}/review`).set('Authorization', auth(adminToken)).send({ status: 'published' }).expect(200);
    const followUpMatches = await request(server).post(`/api/v1/journeys/${requesterJourney.body.journey.id}/peer-matches`).set('x-goodnight-user-id', requester).send({}).expect(201);
    const declinedMatch = followUpMatches.body.items.find((item: { peerExperienceId: string }) => item.peerExperienceId === declinedExperience.body.item.id);
    const blockedMatch = followUpMatches.body.items.find((item: { peerExperienceId: string }) => item.peerExperienceId === blockedExperience.body.item.id);
    const closedMatch = followUpMatches.body.items.find((item: { peerExperienceId: string }) => item.peerExperienceId === closedExperience.body.item.id);
    const activeBlockMatch = followUpMatches.body.items.find((item: { peerExperienceId: string }) => item.peerExperienceId === activeBlockExperience.body.item.id);
    expect(declinedMatch).toBeTruthy();
    expect(blockedMatch).toBeTruthy();
    expect(closedMatch).toBeTruthy();
    expect(activeBlockMatch).toBeTruthy();
    await request(server).patch(`/api/v1/peer-matches/${declinedMatch.id}`).set('x-goodnight-user-id', requester).send({ status: 'requested', requestReason: '我想再听一点你的经验。' }).expect(200);
    await request(server).post(`/api/v1/peer-matches/${declinedMatch.id}/respond`).set('x-goodnight-user-id', owner).send({ status: 'declined' }).expect(201);
    await request(server).post(`/api/v1/peer-conversations/${declinedMatch.id}/messages`).set('x-goodnight-user-id', requester).send({ content: '被拒绝后不能发送。' }).expect(404);
    await request(server).patch(`/api/v1/peer-matches/${declinedMatch.id}`).set('x-goodnight-user-id', requester).send({ status: 'requested' }).expect(400);
    await request(server).patch(`/api/v1/peer-matches/${blockedMatch.id}`).set('x-goodnight-user-id', requester).send({ status: 'requested', requestReason: '我想先问一句。' }).expect(200);
    await request(server).post(`/api/v1/peer-matches/${blockedMatch.id}/respond`).set('x-goodnight-user-id', owner).send({ status: 'blocked' }).expect(201);
    await request(server).patch(`/api/v1/peer-matches/${blockedMatch.id}`).set('x-goodnight-user-id', requester).send({ status: 'requested' }).expect(400);

    await request(server).patch(`/api/v1/peer-matches/${closedMatch.id}`).set('x-goodnight-user-id', requester).send({ status: 'requested', requestReason: '想在结束时留下感谢。' }).expect(200);
    await request(server).post(`/api/v1/peer-matches/${closedMatch.id}/respond`).set('x-goodnight-user-id', owner).send({ status: 'connected' }).expect(201);
    await request(server).post(`/api/v1/peer-matches/${closedMatch.id}/consent`).set('x-goodnight-user-id', owner).send({}).expect(201);
    await request(server).post(`/api/v1/peer-conversations/${closedMatch.id}/close`).set('x-goodnight-user-id', requester).send({}).expect(201);
    await request(server).post(`/api/v1/peer-conversations/${closedMatch.id}/messages`).set('x-goodnight-user-id', requester).send({ content: '结束后不能再发。' }).expect(400);
    await request(server).post(`/api/v1/peer-conversations/${closedMatch.id}/messages`).set('x-goodnight-user-id', owner).send({ content: '结束后不能再发。' }).expect(400);

    await request(server).patch(`/api/v1/peer-matches/${activeBlockMatch.id}`).set('x-goodnight-user-id', requester).send({ status: 'requested', requestReason: '想验证随时退出的边界。' }).expect(200);
    await request(server).post(`/api/v1/peer-matches/${activeBlockMatch.id}/respond`).set('x-goodnight-user-id', owner).send({ status: 'connected' }).expect(201);
    await request(server).post(`/api/v1/peer-matches/${activeBlockMatch.id}/consent`).set('x-goodnight-user-id', owner).send({}).expect(201);
    const blockedConversation = await request(server).post(`/api/v1/peer-conversations/${activeBlockMatch.id}/block`).set('x-goodnight-user-id', requester).send({}).expect(201);
    expect(blockedConversation.body).toMatchObject({ item: { status: 'closed', closedReason: 'blocked' }, match: { status: 'blocked' } });
    await request(server).post(`/api/v1/peer-conversations/${activeBlockMatch.id}/messages`).set('x-goodnight-user-id', requester).send({ content: '拉黑后不能再发。' }).expect(400);
    await request(server).post(`/api/v1/peer-conversations/${activeBlockMatch.id}/messages`).set('x-goodnight-user-id', owner).send({ content: '拉黑后不能再发。' }).expect(400);
    const ownerAfterBlock = await request(server).get('/api/v1/peer-conversations').set('x-goodnight-user-id', owner).expect(200);
    expect(ownerAfterBlock.body.items.find((item: { matchId: string }) => item.matchId === activeBlockMatch.id)).toMatchObject({ status: 'closed', closedReason: 'blocked' });
  }, 60_000);
});
