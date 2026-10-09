import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApiTestApp, loginAdmin, auth, identityFor } from './helpers';
import { StoreService } from '../../apps/api/src/store.service';

describe('Batch 3: Self Route Identity & Fallback Matrix (R-06)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  let server: any;
  const userA = 'user_demo';
  const userB = 'user_guest';

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    server = app.getHttpServer();
    adminToken = await loginAdmin(server);

    // Ensure test users exist in DB
    await prisma.user.upsert({
      where: { id: userA },
      create: { id: userA, openid: `openid_${userA}`, anonymousCode: `anon_${userA}`, nickname: '测试用户A' },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: userB },
      create: { id: userB, openid: `openid_${userB}`, anonymousCode: `anon_${userB}`, nickname: '测试用户B' },
      update: {},
    });

    // Configure privacy for testing
    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', await identityFor(userA))
      .send({
        allowRecoveryData: true,
        allowLongTermMemory: true,
        allowAiMemoryUse: true,
        allowJourneyArchiveRetention: true,
        allowAnonymousExperienceShare: true,
        allowDataExport: true,
      })
      .expect(200);

    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', await identityFor(userB))
      .send({
        allowRecoveryData: true,
        allowLongTermMemory: true,
        allowAiMemoryUse: true,
        allowJourneyArchiveRetention: true,
        allowAnonymousExperienceShare: true,
        allowDataExport: true,
      })
      .expect(200);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  describe('1. Unauthenticated requests are refused with 401 across Self routes', () => {
    it('1.1 Privacy: unauthenticated request is refused with 401', async () => {
      await request(server).get('/api/v1/settings/privacy').expect(401);
      await request(server).get('/api/v1/me/privacy').expect(401);
      await request(server).get('/api/v1/privacy-settings').expect(401);
      await request(server).put('/api/v1/settings/privacy').send({ allowDataExport: false }).expect(401);
      await request(server).patch('/api/v1/settings/privacy').send({ allowDataExport: false }).expect(401);
      await request(server).patch('/api/v1/me/privacy').send({ allowDataExport: false }).expect(401);
      await request(server).patch('/api/v1/privacy-settings').send({ allowDataExport: false }).expect(401);
    });

    it('1.2 Memory: unauthenticated request is refused with 401', async () => {
      await request(server).get('/api/v1/memory').expect(401);
      await request(server).get('/api/v1/me/memories').expect(401);
      await request(server).post('/api/v1/memory').send({ title: '测试', content: '测试内容' }).expect(401);
      await request(server).patch('/api/v1/me/memories/dummy').send({ title: '新标题' }).expect(401);
      await request(server).delete('/api/v1/memory/dummy').expect(401);
      await request(server).delete('/api/v1/me/memories/dummy').expect(401);
      await request(server).post('/api/v1/me/memories/dummy/reactivate').send({ days: 30 }).expect(401);
    });

    it('1.3 Recovery: unauthenticated request is refused with 401', async () => {
      await request(server).get('/api/v1/me/recovery').expect(401);
      await request(server).post('/api/v1/me/recovery').send({ summary: '恢复打卡' }).expect(401);
    });

    it('1.4 SupportPlan: unauthenticated request is refused with 401', async () => {
      await request(server).get('/api/v1/me/support-plan').expect(401);
      await request(server).post('/api/v1/support-plans').send({ title: '计划', plan: {} }).expect(401);
      await request(server).put('/api/v1/me/support-plan').send({ title: '计划', plan: {} }).expect(401);
    });

    it('1.5 StableSelf: unauthenticated request is refused with 401', async () => {
      await request(server).get('/api/v1/me/stable-self').expect(401);
      await request(server).put('/api/v1/me/stable-self').send({ profile: { trait: '平静' } }).expect(401);
    });

    it('1.6 RealityHandoff: unauthenticated request is refused with 401', async () => {
      await request(server).get('/api/v1/handoffs').expect(401);
      await request(server).post('/api/v1/handoffs').send({ recipient: '张三', channel: '微信', summary: '摘要' }).expect(401);
      await request(server).post('/api/v1/handoffs/dummy/share').expect(401);
    });

    it('1.7 TrustedContact: unauthenticated request is refused with 401', async () => {
      await request(server).get('/api/v1/trusted-contacts').expect(401);
      await request(server).post('/api/v1/trusted-contacts').send({ nickname: '小李', relation: '朋友' }).expect(401);
    });

    it('1.8 Decision: unauthenticated request is refused with 401', async () => {
      await request(server).get('/api/v1/decisions').expect(401);
      await request(server).post('/api/v1/decisions').send({ question: '是否换工作？' }).expect(401);
      await request(server).patch('/api/v1/decisions/dummy').send({ decision: '决定' }).expect(401);
    });

    it('1.9 Cooldown: unauthenticated request is refused with 401', async () => {
      await request(server).get('/api/v1/cooldown').expect(401);
      await request(server).post('/api/v1/cooldowns').send({ title: '冷静', hours: 24 }).expect(401);
    });

    it('1.10 FutureSelf: unauthenticated request is refused with 401', async () => {
      await request(server).get('/api/v1/future-messages').expect(401);
      await request(server).post('/api/v1/future-messages').send({ content: '写给未来的自己', deliverAt: new Date(Date.now() + 86400000).toISOString() }).expect(401);
    });

    it('1.11 Journey & Archive: unauthenticated request is refused with 401', async () => {
      await request(server).get('/api/v1/journeys').expect(401);
      await request(server).post('/api/v1/journeys').send({ title: '旅程', domain: '生活', content: '内容' }).expect(401);
      await request(server).get('/api/v1/journeys/dummy').expect(401);
      await request(server).get('/api/v1/journeys/dummy/fingerprint').expect(401);
      await request(server).patch('/api/v1/journeys/dummy/intent').send({ intent: 'JUST_LISTEN' }).expect(401);
      await request(server).patch('/api/v1/journeys/dummy').send({ title: '新标题' }).expect(401);
      await request(server).patch('/api/v1/journeys/dummy/situation').send({ facts: ['事实'] }).expect(401);
      await request(server).post('/api/v1/journeys/dummy/snapshots').send({ facts: ['事实'] }).expect(401);
      await request(server).post('/api/v1/journeys/dummy/situation/reanalyze').expect(401);
      await request(server).post('/api/v1/journeys/dummy/safety/acknowledge').expect(401);
      await request(server).post('/api/v1/journeys/dummy/updates').send({ content: '进展' }).expect(401);
      await request(server).post('/api/v1/journeys/dummy/action-plan').expect(401);
      await request(server).post('/api/v1/journeys/dummy/actions').send({ title: '小行动' }).expect(401);
      await request(server).get('/api/v1/journeys/dummy/actions').expect(401);
      await request(server).get('/api/v1/journeys/dummy/timeline').expect(401);
      await request(server).patch('/api/v1/journeys/dummy/status').send({ status: 'paused' }).expect(401);
      await request(server).post('/api/v1/journeys/dummy/graduate').expect(401);
      await request(server).post('/api/v1/journeys/dummy/graduation-consent').send({ decision: 'willing' }).expect(401);
      await request(server).post('/api/v1/actions/dummy/checkin').send({ status: 'completed' }).expect(401);
      await request(server).post('/api/v1/actions/dummy/checkins').send({ status: 'completed' }).expect(401);
      await request(server).post('/api/v1/actions/dummy/adaptive-plan').send({ barrier: 'forgot' }).expect(401);
      await request(server).post('/api/v1/actions/dummy/adapt').send({ title: '新行动' }).expect(401);
      await request(server).get('/api/v1/archive/journeys').expect(401);
      await request(server).get('/api/v1/archive/journeys/dummy').expect(401);
      await request(server).post('/api/v1/archive/journeys/dummy/export').expect(401);
      await request(server).post('/api/v1/archive/journeys/dummy/restore').expect(401);
      await request(server).delete('/api/v1/archive/journeys/dummy').send({ confirmation: 'DELETE_ARCHIVE' }).expect(401);
    });

    it('1.12 Peer: unauthenticated request is refused with 401', async () => {
      await request(server).get('/api/v1/peers').expect(401);
      await request(server).post('/api/v1/peer-experiences').send({ title: '经历', domain: '生活', content: '内容' }).expect(401);
      await request(server).post('/api/v1/journeys/dummy/peer-matches').expect(401);
      await request(server).get('/api/v1/journeys/dummy/peers').expect(401);
      await request(server).patch('/api/v1/peer-matches/dummy').send({ status: 'connected' }).expect(401);
      await request(server).post('/api/v1/peer-matches/dummy/respond').send({ status: 'connected' }).expect(401);
      await request(server).post('/api/v1/peer-matches/dummy/consent').expect(401);
      await request(server).get('/api/v1/peer-requests').expect(401);
      await request(server).patch('/api/v1/peer-experiences/dummy').send({ title: '更新' }).expect(401);
      await request(server).get('/api/v1/peer-experiences/dummy').expect(401);
      await request(server).get('/api/v1/peer-conversations').expect(401);
      await request(server).post('/api/v1/peer-conversations/dummy/messages').send({ content: '消息' }).expect(401);
      await request(server).post('/api/v1/peer-conversations/dummy/assist').send({ content: '草稿' }).expect(401);
      await request(server).post('/api/v1/peer-conversations/dummy/close').expect(401);
      await request(server).post('/api/v1/peer-conversations/dummy/report').send({ reason: '违规' }).expect(401);
      await request(server).post('/api/v1/peer-conversations/dummy/block').expect(401);
      await request(server).post('/api/v1/peer-conversations/dummy/feedback').send({ feedback: 'helpful' }).expect(401);
    });

    it('1.13 Private /me aliases: unauthenticated request is refused with 401', async () => {
      await request(server).get('/api/v1/me/letters').expect(401);
      await request(server).get('/api/v1/me/diaries').expect(401);
      await request(server).get('/api/v1/me/diaries/months').expect(401);
      await request(server).post('/api/v1/me/diaries').send({ content: '未认证日记' }).expect(401);
      await request(server).get('/api/v1/me/favorites').expect(401);
      await request(server).get('/api/v1/me/profile').expect(401);
      await request(server).get('/api/v1/me/stats').expect(401);
      await request(server).get('/api/v1/me/growth-card').expect(401);
      await request(server).delete('/api/v1/me/data').expect(401);
      await request(server).get('/api/v1/me/month-report').expect(401);
    });
  });

  describe('2. An identity that no longer exists, and a forged credential, are refused', () => {
    it('2.1 A credential whose user was removed is refused rather than served as an empty account', async () => {
      // Under database-backed sessions a credential cannot exist for a user that does not, so this
      // scenario is reached the only way it can happen in production: the account is removed while a
      // session is outstanding. The session row cascades away with the user, so the credential is an
      // authentication failure (401), not an empty account and not a 404 that would confirm whether
      // the user ever existed.
      const bootstrap = await request(server).post('/api/v1/auth/anonymous').send({}).expect(201);
      const { userId, credential } = bootstrap.body.item;

      await request(server)
        .get('/api/v1/settings/privacy')
        .set('x-goodnight-user-id', credential)
        .expect(200);

      await prisma.user.delete({ where: { id: userId } });

      for (const path of ['/api/v1/settings/privacy', '/api/v1/memory', '/api/v1/journeys', '/api/v1/decisions']) {
        await request(server).get(path).set('x-goodnight-user-id', credential).expect(401);
      }
    });

    it('2.2 A forged credential is refused rather than resolving to an anonymous caller', async () => {
      // A well-formed but unknown session id, and a real session id with the wrong secret.
      const real = await identityFor(userB);
      const [sessionId] = real.split('.');

      await request(server)
        .get('/api/v1/settings/privacy')
        .set('x-goodnight-user-id', 'sess_does_not_exist.somesecret')
        .expect(401);

      await request(server)
        .get('/api/v1/settings/privacy')
        .set('x-goodnight-user-id', `${sessionId}.wrong-secret`)
        .expect(401);

      // A bare user id, which is what the old header carried, is not a credential at all.
      await request(server).get('/api/v1/settings/privacy').set('x-goodnight-user-id', userB).expect(401);
      await request(server).get('/api/v1/settings/privacy').set('x-goodnight-user-id', '').expect(401);
    });
  });

  describe('3. Resource ownership isolation (User A vs User B)', () => {
    it('3.1 Memory: User A owns memory; User B is refused on User A record', async () => {
      // User A creates memory
      const createRes = await request(server)
        .post('/api/v1/memory')
        .set('x-goodnight-user-id', await identityFor(userA))
        .send({ title: 'A的私密记忆', content: 'A的私密内容', scope: 'all_ai' })
        .expect(201);
      const memoryId = createRes.body.item.id as string;

      // User A can read it
      const aList = await request(server).get('/api/v1/memory').set('x-goodnight-user-id', await identityFor(userA)).expect(200);
      expect(aList.body.items.some((m: any) => m.id === memoryId)).toBe(true);

      // User B cannot see it in list
      const bList = await request(server).get('/api/v1/memory').set('x-goodnight-user-id', await identityFor(userB)).expect(200);
      expect(bList.body.items.some((m: any) => m.id === memoryId)).toBe(false);

      // User B is refused on A's record (PATCH, DELETE, REACTIVATE)
      await request(server)
        .patch(`/api/v1/me/memories/${memoryId}`)
        .set('x-goodnight-user-id', await identityFor(userB))
        .send({ title: 'B试图篡改' })
        .expect(404);

      await request(server)
        .delete(`/api/v1/me/memories/${memoryId}`)
        .set('x-goodnight-user-id', await identityFor(userB))
        .expect(404);

      await request(server)
        .post(`/api/v1/me/memories/${memoryId}/reactivate`)
        .set('x-goodnight-user-id', await identityFor(userB))
        .send({ days: 30 })
        .expect(404);

      // User A can delete their own
      await request(server).delete(`/api/v1/me/memories/${memoryId}`).set('x-goodnight-user-id', await identityFor(userA)).expect(200);
    });

    it('3.2 Decision: User A owns decision; User B is refused on User A record', async () => {
      const createRes = await request(server)
        .post('/api/v1/decisions')
        .set('x-goodnight-user-id', await identityFor(userA))
        .send({ question: 'A的决策问题', options: ['A1', 'A2'] })
        .expect(201);
      const decisionId = createRes.body.item.id as string;

      // User A sees it
      const aList = await request(server).get('/api/v1/decisions').set('x-goodnight-user-id', await identityFor(userA)).expect(200);
      expect(aList.body.items.some((d: any) => d.id === decisionId)).toBe(true);

      // User B does not see it
      const bList = await request(server).get('/api/v1/decisions').set('x-goodnight-user-id', await identityFor(userB)).expect(200);
      expect(bList.body.items.some((d: any) => d.id === decisionId)).toBe(false);

      // User B cannot patch User A's decision
      await request(server)
        .patch(`/api/v1/decisions/${decisionId}`)
        .set('x-goodnight-user-id', await identityFor(userB))
        .send({ decision: 'B的结论' })
        .expect(404);
    });

    it('3.3 Cooldown: User A owns cooldown; User B is refused', async () => {
      const createDecision = await request(server)
        .post('/api/v1/decisions')
        .set('x-goodnight-user-id', await identityFor(userA))
        .send({ question: 'A的冷静决定', options: ['A1'] })
        .expect(201);
      const decisionId = createDecision.body.item.id as string;

      // User B cannot create cooldown on A's decision
      await request(server)
        .post('/api/v1/cooldowns')
        .set('x-goodnight-user-id', await identityFor(userB))
        .send({ decisionId, title: 'B非法关联', hours: 24 })
        .expect(404);

      // User A creates cooldown
      const createCd = await request(server)
        .post('/api/v1/cooldowns')
        .set('x-goodnight-user-id', await identityFor(userA))
        .send({ decisionId, title: 'A的冷静事项', hours: 24 })
        .expect(201);
      const cdId = createCd.body.item.id as string;

      // User A sees it in cooldown list
      const aCds = await request(server).get('/api/v1/cooldown').set('x-goodnight-user-id', await identityFor(userA)).expect(200);
      expect(aCds.body.items.some((c: any) => c.id === cdId)).toBe(true);

      // User B does not see A's cooldown
      const bCds = await request(server).get('/api/v1/cooldown').set('x-goodnight-user-id', await identityFor(userB)).expect(200);
      expect(bCds.body.items.some((c: any) => c.id === cdId)).toBe(false);
    });

    it('3.4 FutureSelf: User A owns future letter; User B is refused', async () => {
      const createRes = await request(server)
        .post('/api/v1/future-messages')
        .set('x-goodnight-user-id', await identityFor(userA))
        .send({ content: 'A写给未来的信', deliverAt: new Date(Date.now() + 86400000).toISOString() })
        .expect(201);
      const messageId = createRes.body.item.id as string;

      // User A sees it
      const aList = await request(server).get('/api/v1/future-messages').set('x-goodnight-user-id', await identityFor(userA)).expect(200);
      expect(aList.body.items.some((m: any) => m.id === messageId)).toBe(true);

      // User B does not see it
      const bList = await request(server).get('/api/v1/future-messages').set('x-goodnight-user-id', await identityFor(userB)).expect(200);
      expect(bList.body.items.some((m: any) => m.id === messageId)).toBe(false);
    });

    it('3.5 RealityHandoff: User A owns handoff; User B is refused', async () => {
      const createRes = await request(server)
        .post('/api/v1/handoffs')
        .set('x-goodnight-user-id', await identityFor(userA))
        .send({ recipient: '医生', channel: '线下', summary: 'A的交接内容' })
        .expect(201);
      const handoffId = createRes.body.item.id as string;

      // User A sees it
      const aList = await request(server).get('/api/v1/handoffs').set('x-goodnight-user-id', await identityFor(userA)).expect(200);
      expect(aList.body.items.some((h: any) => h.id === handoffId)).toBe(true);

      // User B does not see it
      const bList = await request(server).get('/api/v1/handoffs').set('x-goodnight-user-id', await identityFor(userB)).expect(200);
      expect(bList.body.items.some((h: any) => h.id === handoffId)).toBe(false);

      // User B cannot share A's handoff
      await request(server)
        .post(`/api/v1/handoffs/${handoffId}/share`)
        .set('x-goodnight-user-id', await identityFor(userB))
        .expect(404);
    });

    it('3.6 Journey & JourneyArchive: User A owns journey; User B is refused on User A record', async () => {
      const createRes = await request(server)
        .post('/api/v1/journeys')
        .set('x-goodnight-user-id', await identityFor(userA))
        .send({ title: 'A专属测试旅程', domain: '生活', content: 'A的生活内容' })
        .expect(201);
      const journeyId = createRes.body.journey.id as string;

      // User A sees it in list and detail
      const aList = await request(server).get('/api/v1/journeys').set('x-goodnight-user-id', await identityFor(userA)).expect(200);
      expect(aList.body.items.some((item: any) => item.journey.id === journeyId)).toBe(true);

      const aDetail = await request(server).get(`/api/v1/journeys/${journeyId}`).set('x-goodnight-user-id', await identityFor(userA)).expect(200);
      expect(aDetail.body.item.journey.id).toBe(journeyId);

      // User B cannot see it in list
      const bList = await request(server).get('/api/v1/journeys').set('x-goodnight-user-id', await identityFor(userB)).expect(200);
      expect(bList.body.items.some((item: any) => item.journey.id === journeyId)).toBe(false);

      // User B is refused on User A's journey
      await request(server).get(`/api/v1/journeys/${journeyId}`).set('x-goodnight-user-id', await identityFor(userB)).expect(404);
      await request(server).get(`/api/v1/journeys/${journeyId}/fingerprint`).set('x-goodnight-user-id', await identityFor(userB)).expect(404);
      await request(server).get(`/api/v1/journeys/${journeyId}/timeline`).set('x-goodnight-user-id', await identityFor(userB)).expect(404);
      await request(server).get(`/api/v1/journeys/${journeyId}/actions`).set('x-goodnight-user-id', await identityFor(userB)).expect(404);
      await request(server).patch(`/api/v1/journeys/${journeyId}`).set('x-goodnight-user-id', await identityFor(userB)).send({ title: 'B篡改' }).expect(404);
      await request(server).patch(`/api/v1/journeys/${journeyId}/situation`).set('x-goodnight-user-id', await identityFor(userB)).send({ facts: ['篡改'] }).expect(404);
      await request(server).post(`/api/v1/journeys/${journeyId}/actions`).set('x-goodnight-user-id', await identityFor(userB)).send({ title: 'B行动' }).expect(404);
      await request(server).patch(`/api/v1/journeys/${journeyId}/status`).set('x-goodnight-user-id', await identityFor(userB)).send({ status: 'paused' }).expect(404);

      // User A archives the journey
      await request(server).patch(`/api/v1/journeys/${journeyId}/status`).set('x-goodnight-user-id', await identityFor(userA)).send({ status: 'archived' }).expect(200);

      // User B is refused on archived journey
      await request(server).get(`/api/v1/archive/journeys/${journeyId}`).set('x-goodnight-user-id', await identityFor(userB)).expect(404);
      await request(server).post(`/api/v1/archive/journeys/${journeyId}/export`).set('x-goodnight-user-id', await identityFor(userB)).expect(404);
      await request(server).post(`/api/v1/archive/journeys/${journeyId}/restore`).set('x-goodnight-user-id', await identityFor(userB)).expect(404);
      await request(server).delete(`/api/v1/archive/journeys/${journeyId}`).set('x-goodnight-user-id', await identityFor(userB)).send({ confirmation: 'DELETE_ARCHIVE' }).expect(404);
    });

    it('3.7 SupportPlan: User B is refused on User A journey', async () => {
      const jRes = await request(server)
        .post('/api/v1/journeys')
        .set('x-goodnight-user-id', await identityFor(userA))
        .send({ title: 'A的支持旅程', domain: '生活', content: '内容' })
        .expect(201);
      const journeyId = jRes.body.journey.id as string;

      // User B cannot attach support plan to A's journey
      await request(server)
        .post('/api/v1/support-plans')
        .set('x-goodnight-user-id', await identityFor(userB))
        .send({ journeyId, title: 'B越权支持计划', plan: {} })
        .expect(404);
    });

    it('3.8 Recovery: User B is refused on User A journey', async () => {
      const jRes = await request(server)
        .post('/api/v1/journeys')
        .set('x-goodnight-user-id', await identityFor(userA))
        .send({ title: 'A的恢复旅程', domain: '生活', content: '内容' })
        .expect(201);
      const journeyId = jRes.body.journey.id as string;

      // User B cannot check in recovery on A's journey
      await request(server)
        .post('/api/v1/me/recovery')
        .set('x-goodnight-user-id', await identityFor(userB))
        .send({ journeyId, summary: 'B试图在A的旅程打卡' })
        .expect(404);
    });

    it('3.9 Private /me aliases: User A owns data; User B is isolated', async () => {
      // User A creates diary through /me/diaries
      const diaryRes = await request(server)
        .post('/api/v1/me/diaries')
        .set('x-goodnight-user-id', await identityFor(userA))
        .send({ content: 'A的私密日记内容', emotion: '开心' })
        .expect(201);
      const diaryId = diaryRes.body.item.id as string;

      // User A reads their diaries through /me/diaries
      const aDiaries = await request(server)
        .get('/api/v1/me/diaries')
        .set('x-goodnight-user-id', await identityFor(userA))
        .expect(200);
      expect(aDiaries.body.items.some((d: any) => d.id === diaryId)).toBe(true);

      // User B cannot see User A's diary through /me/diaries
      const bDiaries = await request(server)
        .get('/api/v1/me/diaries')
        .set('x-goodnight-user-id', await identityFor(userB))
        .expect(200);
      expect(bDiaries.body.items.some((d: any) => d.id === diaryId)).toBe(false);

      // User A profile and stats are scoped
      const aProfile = await request(server)
        .get('/api/v1/me/profile')
        .set('x-goodnight-user-id', await identityFor(userA))
        .expect(200);
      expect(aProfile.body.item.id).toBe(userA);

      const aStats = await request(server)
        .get('/api/v1/me/stats')
        .set('x-goodnight-user-id', await identityFor(userA))
        .expect(200);
      expect(aStats.body.item.diaryCount).toBeGreaterThanOrEqual(1);

      // Unknown user is refused with 404
      // A caller with no data of their own is still isolated: they get their own empty profile, not
      // another user's. (A credential for a user that does not exist at all is refused with 401 -
      // see 2.1 - because under database-backed sessions such a credential cannot be issued.)
      const stranger = await request(server).post('/api/v1/auth/anonymous').send({}).expect(201);
      const strangerProfile = await request(server)
        .get('/api/v1/me/profile')
        .set('x-goodnight-user-id', stranger.body.item.credential)
        .expect(200);
      expect(strangerProfile.body.item.id).toBe(stranger.body.item.userId);
      expect(strangerProfile.body.item.id).not.toBe(userA);
    });
  });

  describe('4. Admin sensitive routes refuse normal user / unauthenticated caller', () => {
    it('4.1 AdminSensitive: normal user or missing token refused with 401', async () => {
      // Unauthenticated caller
      await request(server).get('/api/admin/v1/support/plans').expect(401);
      await request(server).get('/api/admin/v1/support/plans/dummy').expect(401);
      await request(server).get('/api/admin/v1/memory').expect(401);

      // Caller sending user header without admin token
      await request(server)
        .get('/api/admin/v1/support/plans')
        .set('x-goodnight-user-id', await identityFor(userA))
        .expect(401);

      await request(server)
        .get('/api/admin/v1/support/plans/dummy')
        .set('x-goodnight-user-id', await identityFor(userA))
        .expect(401);

      await request(server)
        .get('/api/admin/v1/memory')
        .set('x-goodnight-user-id', await identityFor(userA))
        .expect(401);

      // Legitimate admin succeeds
      await request(server)
        .get('/api/admin/v1/support/plans')
        .set('authorization', auth(adminToken))
        .expect(200);

      await request(server)
        .get('/api/admin/v1/memory')
        .set('authorization', auth(adminToken))
        .expect(200);
    });
  });

  describe('5. Demo-user fallback is eliminated', () => {
    it('5.1 Unauthenticated request never silently reads or writes demo user data', async () => {
      // Create private data under demo user (userA)
      const demoDecision = await request(server)
        .post('/api/v1/decisions')
        .set('x-goodnight-user-id', await identityFor(userA))
        .send({ question: 'Demo用户的隐私决定', options: ['D1'] })
        .expect(201);
      const decisionId = demoDecision.body.item.id as string;

      // An unauthenticated request must NOT get demo user's decisions
      await request(server).get('/api/v1/decisions').expect(401);

      // An unauthenticated request must NOT be able to patch demo user's decision
      await request(server)
        .patch(`/api/v1/decisions/${decisionId}`)
        .send({ decision: '匿名越权决定' })
        .expect(401);

      // An unauthenticated request must NOT get demo user's memories
      await request(server).get('/api/v1/memory').expect(401);

      // An unauthenticated request must NOT get demo user's journeys
      await request(server).get('/api/v1/journeys').expect(401);

      // An unauthenticated request must NOT get demo user's privacy
      await request(server).get('/api/v1/settings/privacy').expect(401);
    });

    it('5.2 StoreService resolveRuntimeUserId throws UnauthorizedException when called without identity', () => {
      const store = app.get(StoreService);
      expect(() => store.resolveRuntimeUserId()).toThrow(/缺少用户身份标识/);
      expect(() => store.resolveRuntimeUserId('')).toThrow(/缺少用户身份标识/);
      expect(() => store.resolveRuntimeUserId('   ')).toThrow(/缺少用户身份标识/);
    });
  });
});
