import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp, loginAdmin } from './helpers';
import { saveRelationalRuntimeState } from '../../apps/api/src/relational-runtime.mapper';
import { StoreService } from '../../apps/api/src/store.service';
import { SelfPersistenceService } from '../../apps/api/src/self-persistence.service';

const SELF_TABLES = [
  'PrivacySetting',
  'TrustedContact',
  'StableSelfProfile',
  'RealityHandoff',
  'PersonalSupportPlan',
];

describe('Batch 3 Self Persistence: 5 Models Direct-Write & Independence', () => {
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

    // Ensure baseline users exist in DB
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

    // Ensure privacy allows recovery data for userA by default
    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', userA)
      .send({ allowRecoveryData: true, allowLongTermMemory: true, allowAiMemoryUse: true })
      .expect(200);

    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', userB)
      .send({ allowRecoveryData: true, allowLongTermMemory: true, allowAiMemoryUse: true })
      .expect(200);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('1. Database-only reads through every converted route with independent Prisma client', () => {
    it('1.1 PrivacySetting: read directly from database reflected in GET /api/v1/settings/privacy', async () => {
      await prisma.privacySetting.upsert({
        where: { userId: userA },
        create: {
          userId: userA,
          allowDataExport: true,
          allowFutureSelfNotifications: true,
          defaultVisibility: 'PUBLIC',
        },
        update: {
          allowDataExport: true,
          allowFutureSelfNotifications: true,
          defaultVisibility: 'PUBLIC',
        },
      });

      const res = await request(server)
        .get('/api/v1/settings/privacy')
        .set('x-goodnight-user-id', userA)
        .expect(200);

      expect(res.body.item).toMatchObject({
        userId: userA,
        allowDataExport: true,
        allowFutureSelfNotifications: true,
        defaultVisibility: 'PUBLIC',
      });
    });

    it('1.2 RealityHandoff: seeded in database reflected in GET /api/v1/handoffs', async () => {
      const handoffId = `handoff_db_read_${Date.now()}`;
      await prisma.realityHandoff.create({
        data: {
          id: handoffId,
          userId: userA,
          recipient: '好友小张',
          channel: '微信',
          summary: '这是一份直写DB测试的交接',
          status: 'ready',
        },
      });

      const res = await request(server)
        .get('/api/v1/handoffs')
        .set('x-goodnight-user-id', userA)
        .expect(200);

      const found = res.body.items.find((item: any) => item.id === handoffId);
      expect(found).toBeDefined();
      expect(found.recipient).toBe('好友小张');
      expect(found.channel).toBe('微信');
      expect(found.summary).toBe('这是一份直写DB测试的交接');
    });

    it('1.3 TrustedContact: seeded in database reflected in GET /api/v1/trusted-contacts', async () => {
      const contactId = `contact_db_read_${Date.now()}`;
      await prisma.trustedContact.create({
        data: {
          id: contactId,
          userId: userA,
          nickname: '紧急联系人老王',
          relation: '挚友',
          contactHint: '13800000000',
          enabled: true,
        },
      });

      const res = await request(server)
        .get('/api/v1/trusted-contacts')
        .set('x-goodnight-user-id', userA)
        .expect(200);

      const found = res.body.items.find((item: any) => item.id === contactId);
      expect(found).toBeDefined();
      expect(found.nickname).toBe('紧急联系人老王');
      expect(found.relation).toBe('挚友');
      expect(found.contactHint).toBe('13800000000');
    });

    it('1.4 PersonalSupportPlan: seeded in database reflected in GET /api/v1/me/support-plan', async () => {
      const planId = `plan_db_read_${Date.now()}`;
      // Deactivate previous active plans for userA in DB
      await prisma.personalSupportPlan.updateMany({
        where: { userId: userA, active: true },
        data: { active: false },
      });

      await prisma.personalSupportPlan.create({
        data: {
          id: planId,
          userId: userA,
          title: '数据库直读支持预案',
          plan: { steps: ['深呼吸', '出门散步'] },
          active: true,
        },
      });

      const res = await request(server)
        .get('/api/v1/me/support-plan')
        .set('x-goodnight-user-id', userA)
        .expect(200);

      expect(res.body.item).toBeDefined();
      expect(res.body.item.id).toBe(planId);
      expect(res.body.item.title).toBe('数据库直读支持预案');
      expect(res.body.item.plan).toEqual({ steps: ['深呼吸', '出门散步'] });
    });

    it('1.5 StableSelfProfile: seeded in database reflected in GET /api/v1/me/stable-self', async () => {
      await prisma.stableSelfProfile.upsert({
        where: { userId: userA },
        create: {
          userId: userA,
          profile: {
            stableDescription: '平稳状态下的我喜欢喝茶',
            sleepPattern: '23:00-07:00',
          },
        },
        update: {
          profile: {
            stableDescription: '平稳状态下的我喜欢喝茶',
            sleepPattern: '23:00-07:00',
          },
        },
      });

      const res = await request(server)
        .get('/api/v1/me/stable-self')
        .set('x-goodnight-user-id', userA)
        .expect(200);

      expect(res.body.item).toBeDefined();
      expect(res.body.item.profile).toMatchObject({
        stableDescription: '平稳状态下的我喜欢喝茶',
        sleepPattern: '23:00-07:00',
      });
    });

    it('1.6 Admin support plan list: minimal disclosure returns metadata without plan JSON', async () => {
      const secretPlanId = `plan_secret_${Date.now()}`;
      await prisma.personalSupportPlan.create({
        data: {
          id: secretPlanId,
          userId: userA,
          title: '保密支持计划',
          plan: { privateText: '绝对机密的心灵内容不得批量泄露' },
          active: true,
        },
      });

      const res = await request(server)
        .get('/api/admin/v1/support/plans')
        .set('authorization', `Bearer ${adminToken}`)
        .expect(200);

      const item = res.body.items.find((p: any) => p.id === secretPlanId);
      expect(item).toBeDefined();
      expect(item.title).toBe('保密支持计划');
      expect(item.userId).toBe(userA);
      // Minimal disclosure: `plan` field MUST be absent from list items
      expect(item.plan).toBeUndefined();
    });

    it('1.7 Admin single-record support plan: audited read writes AuditLog and returns full content', async () => {
      const secretPlanId = `plan_secret_audit_${Date.now()}`;
      await prisma.personalSupportPlan.create({
        data: {
          id: secretPlanId,
          userId: userA,
          title: '待审计单条支持计划',
          plan: { secretHelp: '审计后方可查阅的内容' },
          active: true,
        },
      });

      const res = await request(server)
        .get(`/api/admin/v1/support/plans/${secretPlanId}`)
        .set('authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.item).toBeDefined();
      expect(res.body.item.id).toBe(secretPlanId);
      expect(res.body.item.plan).toEqual({ secretHelp: '审计后方可查阅的内容' });

      // Verify AuditLog was committed in database
      const audit = await prisma.auditLog.findFirst({
        where: {
          resourceType: 'PersonalSupportPlan',
          resourceId: secretPlanId,
          action: 'SUPPORT_PLAN_READ_FULL',
        },
      });
      expect(audit).not.toBeNull();
      expect(audit?.adminUserId).toBeDefined();
    });

    it('1.8 Admin user detail: returns database-authoritative privacy settings', async () => {
      await prisma.privacySetting.upsert({
        where: { userId: userA },
        create: {
          userId: userA,
          allowMonthlyReportShare: false,
        },
        update: {
          allowMonthlyReportShare: false,
        },
      });

      const res = await request(server)
        .get(`/api/admin/v1/users/${userA}`)
        .set('authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.privacy).toBeDefined();
      expect(res.body.privacy.allowMonthlyReportShare).toBe(false);
    });
  });

  describe('2. Ownership and privacy gate negatives per route', () => {
    it('2.1 Handoff create with foreign journeyId is rejected with 404', async () => {
      // User B creates a journey
      const journeyB = await prisma.lifeJourney.create({
        data: {
          id: `journey_b_${Date.now()}`,
          userId: userB,
          title: '用户B的私有旅程',
          domain: '工作',
          status: 'active',
          stage: 'clarifying',
          visibility: 'PRIVATE',
        },
      });

      // User A attempts to create a handoff referencing User B's journey
      await request(server)
        .post('/api/v1/handoffs')
        .set('x-goodnight-user-id', userA)
        .send({
          journeyId: journeyB.id,
          recipient: '对象',
          channel: '电话',
          summary: '越权关联测试',
        })
        .expect(404);
    });

    it('2.2 Handoff share by non-owner is rejected with 404', async () => {
      const handoffA = await prisma.realityHandoff.create({
        data: {
          id: `handoff_owner_test_${Date.now()}`,
          userId: userA,
          recipient: '小王',
          channel: '短信',
          summary: '用户A专属交接',
          status: 'ready',
        },
      });

      // User B attempts to share User A's handoff
      await request(server)
        .post(`/api/v1/handoffs/${handoffA.id}/share`)
        .set('x-goodnight-user-id', userB)
        .expect(404);

      // Verify status remains ready
      const after = await prisma.realityHandoff.findUnique({ where: { id: handoffA.id } });
      expect(after?.status).toBe('ready');
    });

    it('2.3 Handoff list owner isolation: User B cannot see User A handoffs', async () => {
      const handoffA = await prisma.realityHandoff.create({
        data: {
          id: `handoff_isolated_${Date.now()}`,
          userId: userA,
          recipient: '用户A朋友',
          channel: '微信',
          summary: '用户A的私密交接',
          status: 'ready',
        },
      });

      const resB = await request(server)
        .get('/api/v1/handoffs')
        .set('x-goodnight-user-id', userB)
        .expect(200);

      expect(resB.body.items.some((item: any) => item.id === handoffA.id)).toBe(false);
    });

    it('2.4 Trusted contact list owner isolation: User B cannot see User A contacts', async () => {
      const contactA = await prisma.trustedContact.create({
        data: {
          id: `contact_isolated_${Date.now()}`,
          userId: userA,
          nickname: '用户A的密友',
          relation: '朋友',
          contactHint: 'private-hint',
          enabled: true,
        },
      });

      const resB = await request(server)
        .get('/api/v1/trusted-contacts')
        .set('x-goodnight-user-id', userB)
        .expect(200);

      expect(resB.body.items.some((item: any) => item.id === contactA.id)).toBe(false);
    });

    it('2.5 Support plan create/update with foreign journeyId is rejected with 404', async () => {
      const journeyB = await prisma.lifeJourney.create({
        data: {
          id: `journey_b_plan_${Date.now()}`,
          userId: userB,
          title: '用户B的旅程',
          domain: '健康',
          status: 'active',
          stage: 'clarifying',
          visibility: 'PRIVATE',
        },
      });

      await request(server)
        .post('/api/v1/support-plans')
        .set('x-goodnight-user-id', userA)
        .send({
          journeyId: journeyB.id,
          title: '越权支持计划',
          plan: { note: '不该成功' },
        })
        .expect(404);
    });

    it('2.6 Support plan owner isolation: User B cannot see User A active plan', async () => {
      await prisma.personalSupportPlan.updateMany({
        where: { userId: userA, active: true },
        data: { active: false },
      });
      await prisma.personalSupportPlan.create({
        data: {
          id: `plan_user_a_${Date.now()}`,
          userId: userA,
          title: '用户A专享计划',
          plan: { myPlan: 'A' },
          active: true,
        },
      });

      const resB = await request(server)
        .get('/api/v1/me/support-plan')
        .set('x-goodnight-user-id', userB)
        .expect(200);

      if (resB.body.item) {
        expect(resB.body.item.userId).toBe(userB);
        expect(resB.body.item.title).not.toBe('用户A专享计划');
      }
    });

    it('2.7 Stable self profile owner isolation: User B cannot see User A profile', async () => {
      await prisma.stableSelfProfile.upsert({
        where: { userId: userA },
        create: {
          userId: userA,
          profile: { stableDescription: '用户A独有描述' },
        },
        update: {
          profile: { stableDescription: '用户A独有描述' },
        },
      });

      const resB = await request(server)
        .get('/api/v1/me/stable-self')
        .set('x-goodnight-user-id', userB)
        .expect(200);

      if (resB.body.item) {
        expect(resB.body.item.profile.stableDescription).not.toBe('用户A独有描述');
      }
    });

    it('2.8 Privacy gate negative: when allowRecoveryData is false, recovery-dependent routes refuse with 403', async () => {
      // Revoke allowRecoveryData for userA
      await request(server)
        .patch('/api/v1/me/privacy')
        .set('x-goodnight-user-id', userA)
        .send({ allowRecoveryData: false })
        .expect(200);

      // GET /api/v1/me/stable-self -> 403
      await request(server)
        .get('/api/v1/me/stable-self')
        .set('x-goodnight-user-id', userA)
        .expect(403);

      // PUT /api/v1/me/stable-self -> 403
      await request(server)
        .put('/api/v1/me/stable-self')
        .set('x-goodnight-user-id', userA)
        .send({ profile: { stableDescription: '被拒绝的内容' } })
        .expect(403);

      // POST /api/v1/support-plans -> 403
      await request(server)
        .post('/api/v1/support-plans')
        .set('x-goodnight-user-id', userA)
        .send({ title: '被拒绝的计划', plan: {} })
        .expect(403);

      // Restore permission for subsequent tests
      await request(server)
        .patch('/api/v1/me/privacy')
        .set('x-goodnight-user-id', userA)
        .send({ allowRecoveryData: true })
        .expect(200);
    });
  });

  describe('3. Three-case omitted/null/supplied test for nullable Journey FK (§0.5/A4)', () => {
    it('3.1 PersonalSupportPlan.journeyId: handles supplied, undefined (survives), null (detaches)', async () => {
      const journey = await prisma.lifeJourney.create({
        data: {
          id: `journey_psp_fk_${Date.now()}`,
          userId: userA,
          title: '支持计划关联旅程',
          domain: '生活',
          status: 'active',
          stage: 'acting',
          visibility: 'PRIVATE',
        },
      });

      // Case 1 — Supplied: create with valid journeyId
      const created = await request(server)
        .post('/api/v1/support-plans')
        .set('x-goodnight-user-id', userA)
        .send({
          journeyId: journey.id,
          title: '外键三态计划',
          plan: { initial: true },
        })
        .expect(201);

      expect(created.body.item.journeyId).toBe(journey.id);
      const dbAfterCreate = await prisma.personalSupportPlan.findUnique({
        where: { id: created.body.item.id },
      });
      expect(dbAfterCreate?.journeyId).toBe(journey.id);

      // Case 2 — Undefined (omitted): update plan without sending journeyId ("no opinion")
      // Committed foreign key in PostgreSQL MUST SURVIVE.
      const updatedOmitted = await request(server)
        .post('/api/v1/support-plans')
        .set('x-goodnight-user-id', userA)
        .send({
          title: '更新标题但省略journeyId',
          plan: { updated: true },
        })
        .expect(201);

      expect(updatedOmitted.body.item.journeyId).toBe(journey.id);
      const dbAfterOmit = await prisma.personalSupportPlan.findUnique({
        where: { id: created.body.item.id },
      });
      expect(dbAfterOmit?.journeyId).toBe(journey.id);
      expect(dbAfterOmit?.title).toBe('更新标题但省略journeyId');

      // Case 3 — Null (explicit detach): explicitly pass journeyId: null
      const updatedNull = await request(server)
        .post('/api/v1/support-plans')
        .set('x-goodnight-user-id', userA)
        .send({
          journeyId: null,
          title: '显式解绑旅程',
        })
        .expect(201);

      expect(updatedNull.body.item.journeyId).toBeUndefined();
      const dbAfterNull = await prisma.personalSupportPlan.findUnique({
        where: { id: created.body.item.id },
      });
      expect(dbAfterNull?.journeyId).toBeNull();
      expect(dbAfterNull?.title).toBe('显式解绑旅程');
    });

    it('3.2 RealityHandoff.journeyId: creation supplies FK, share omits FK and survives', async () => {
      const journey = await prisma.lifeJourney.create({
        data: {
          id: `journey_handoff_fk_${Date.now()}`,
          userId: userA,
          title: '交接关联旅程',
          domain: '生活',
          status: 'active',
          stage: 'acting',
          visibility: 'PRIVATE',
        },
      });

      // Create with supplied journeyId
      const created = await request(server)
        .post('/api/v1/handoffs')
        .set('x-goodnight-user-id', userA)
        .send({
          journeyId: journey.id,
          recipient: '接收人',
          channel: '短信',
          summary: '交接外键保留测试',
        })
        .expect(201);

      expect(created.body.item.journeyId).toBe(journey.id);

      // Share handoff (omits journeyId column in update)
      const shared = await request(server)
        .post(`/api/v1/handoffs/${created.body.item.id}/share`)
        .set('x-goodnight-user-id', userA)
        .expect(201);

      expect(shared.body.item.status).toBe('shared');
      expect(shared.body.item.journeyId).toBe(journey.id);

      // Database check: committed journeyId survived share transition
      const dbAfterShare = await prisma.realityHandoff.findUnique({
        where: { id: created.body.item.id },
      });
      expect(dbAfterShare?.status).toBe('shared');
      expect(dbAfterShare?.journeyId).toBe(journey.id);
    });
  });

  describe('4. PrivacySetting legacy flush protections (§0.1, §0.5/A4)', () => {
    it('4.1 A legacy flush whose privacy map omits a user must NOT change that user row', async () => {
      // 1. Commit explicit opted-in consent in DB
      await prisma.privacySetting.upsert({
        where: { userId: userA },
        create: {
          userId: userA,
          allowAiMemoryUse: true,
          allowRecoveryData: true,
          allowPeerMatching: true,
        },
        update: {
          allowAiMemoryUse: true,
          allowRecoveryData: true,
          allowPeerMatching: true,
        },
      });

      const store = app.get(StoreService);
      const flushClient = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

      // Simulate a legacy flush where state.privacySettings omits userA entirely ({})
      const staleState = {
        ...structuredClone(store['data']),
        privacySettings: {}, // userA is omitted!
      };

      await saveRelationalRuntimeState(flushClient, staleState as never);

      // Verify PostgreSQL: userA's consent flags MUST NOT be reverted or overwritten by defaults
      const dbPrivacy = await prisma.privacySetting.findUnique({ where: { userId: userA } });
      expect(dbPrivacy).not.toBeNull();
      expect(dbPrivacy?.allowAiMemoryUse).toBe(true);
      expect(dbPrivacy?.allowRecoveryData).toBe(true);
      expect(dbPrivacy?.allowPeerMatching).toBe(true);

      await flushClient.$disconnect();
    });

    it('4.2 An entry present with one field missing in legacy flush must NOT write a default over the stored value', async () => {
      await prisma.privacySetting.upsert({
        where: { userId: userA },
        create: {
          userId: userA,
          allowAiMemoryUse: true,
          defaultVisibility: 'PUBLIC',
        },
        update: {
          allowAiMemoryUse: true,
          defaultVisibility: 'PUBLIC',
        },
      });

      const store = app.get(StoreService);
      const flushClient = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

      // Stale entry present for userA with allowAiMemoryUse missing
      const partialState = {
        ...structuredClone(store['data']),
        privacySettings: {
          [userA]: {
            defaultVisibility: 'PUBLIC',
            // allowAiMemoryUse is missing!
          },
        },
      };

      await saveRelationalRuntimeState(flushClient, partialState as never);

      const dbPrivacy = await prisma.privacySetting.findUnique({ where: { userId: userA } });
      expect(dbPrivacy?.allowAiMemoryUse).toBe(true);

      await flushClient.$disconnect();
    });
  });

  describe('5. SQL Scope & Zero-Legacy-Write Verification (§5, §0.4/A7)', () => {
    it('5.1 The legacy flush writes nothing at all against the five Self tables: no upsert, no absence sweep', async () => {
      const queries: string[] = [];
      const tracedPrisma = new PrismaClient({
        datasources: { db: { url: process.env.DATABASE_URL } },
        log: [{ emit: 'event', level: 'query' }],
      });
      (tracedPrisma as any).$on('query', (e: { query: string }) => {
        queries.push(e.query);
      });

      const store = app.get(StoreService);
      await saveRelationalRuntimeState(tracedPrisma as any, store['data']);

      const selfQueries = queries.filter((q) =>
        SELF_TABLES.some((table) => q.includes(`"${table}"`)),
      );
      const writeQueries = selfQueries.filter((q) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(q));

      expect(writeQueries).toHaveLength(0);

      await tracedPrisma.$disconnect();
    });

    it('5.2 Store isolation prevents holding in-memory data for all five registered models', () => {
      const store = app.get(StoreService);

      expect(() => (store as any).privacySettings).toThrow(/is disabled/);
      expect(() => (store as any).trustedContacts).toThrow(/is disabled/);
      expect(() => (store as any).stableSelfProfiles).toThrow(/is disabled/);
      expect(() => (store as any).realityHandoffs).toThrow(/is disabled/);
      expect(() => (store as any).personalSupportPlans).toThrow(/is disabled/);

      expect(() => (store as any).data.privacySettings).toThrow(/database-authoritative/);
      expect(() => (store as any).data.trustedContacts).toThrow(/database-authoritative/);
      expect(() => (store as any).data.stableSelfProfiles).toThrow(/database-authoritative/);
      expect(() => (store as any).data.realityHandoffs).toThrow(/database-authoritative/);
      expect(() => (store as any).data.personalSupportPlans).toThrow(/database-authoritative/);
    });
  });
});
