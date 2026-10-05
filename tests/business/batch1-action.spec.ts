import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApiTestApp, loginAdmin, auth } from './helpers';
import { StoreService } from '../../apps/api/src/store.service';
import { Batch1PersistenceService } from '../../apps/api/src/batch1-persistence.service';
import { MonthlyReportService } from '../../apps/api/src/monthly-report.service';
import { saveRelationalRuntimeState } from '../../apps/api/src/relational-runtime.mapper';

describe('Batch 1 Sub-batch E: ActionCommitment and OutcomeCheckin database authority, concurrency and lifecycle', () => {
  let app: INestApplication;
  let adminToken: string;
  const dbUrl = process.env.DATABASE_URL!;

  beforeAll(async () => {
    app = await createApiTestApp();
    const server = app.getHttpServer();
    adminToken = await loginAdmin(server);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('1. Database-only read gate: ActionCommitment and OutcomeCheckin inserted via fresh PrismaClient are read through affected paths and re-read from DB', async () => {
    const server = app.getHttpServer();
    const store = app.get(StoreService);
    const monthlyService = app.get(MonthlyReportService);
    const testUserId = store.getDemoUserId();
    const journeyId = `journey_action_gate_${Date.now()}`;
    const actionId = `action_gate_${Date.now()}`;
    const checkinId = `checkin_gate_${Date.now()}`;

    // Verify loud failure on store getters for migrated models
    expect(() => store.actionCommitments).toThrow(/disabled/i);
    expect(() => (store as any).data.actionCommitments).toThrow(/disabled/i);
    expect(() => store.outcomeCheckins).toThrow(/disabled/i);
    expect(() => (store as any).data.outcomeCheckins).toThrow(/disabled/i);

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      // Pause existing active journeys for this user so this one can be active
      await freshPrisma.lifeJourney.updateMany({
        where: { userId: testUserId, status: 'active' },
        data: { status: 'paused' },
      });

      // Insert LifeJourney directly into PostgreSQL
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId: testUserId,
          title: '行动门禁测试旅程',
          domain: '生活',
          status: 'active',
          stage: 'acting',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Insert ActionCommitment directly into PostgreSQL
      await freshPrisma.actionCommitment.create({
        data: {
          id: actionId,
          journeyId,
          userId: testUserId,
          title: '门禁专用行动：直接写入PostgreSQL',
          description: '未经内存数组的行动说明',
          status: 'active',
          dueAt: new Date(Date.now() - 3600000), // Due 1 hour ago so it qualifies as due
          reminderAt: new Date(),
          attemptNumber: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Insert OutcomeCheckin directly into PostgreSQL
      await freshPrisma.outcomeCheckin.create({
        data: {
          id: checkinId,
          journeyId,
          commitmentId: actionId,
          userId: testUserId,
          status: 'pending',
          dueAt: new Date(Date.now() - 3600000), // Due
          createdAt: new Date(),
        },
      });
    } finally {
      await freshPrisma.$disconnect();
    }

    // Read path 1: GET /api/v1/tonight (Home)
    const homeRes = await request(server).get('/api/v1/tonight').expect(200);
    const homeItem = homeRes.body.item ?? {};
    const homeActiveActions = homeItem.activeActions ?? [];
    const homeDueCheckins = homeItem.dueCheckins ?? [];
    expect(homeActiveActions.some((a: { id: string }) => a.id === actionId)).toBe(true);
    expect(homeDueCheckins.some((c: { id: string }) => c.id === checkinId)).toBe(true);

    // Read path 2: GET /api/v1/journeys/:id/actions
    const journeyActionsRes = await request(server).get(`/api/v1/journeys/${journeyId}/actions`).expect(200);
    expect(journeyActionsRes.body.items.some((a: { id: string }) => a.id === actionId)).toBe(true);

    // Read path 3: GET /api/v1/journeys/:id (Journey Detail)
    const journeyDetailRes = await request(server).get(`/api/v1/journeys/${journeyId}`).expect(200);
    expect(journeyDetailRes.body.item.commitments.some((a: { id: string }) => a.id === actionId)).toBe(true);
    expect(journeyDetailRes.body.item.checkins.some((c: { id: string }) => c.id === checkinId)).toBe(true);

    // Read path 4: GET /api/admin/v1/actions
    const adminActionsRes = await request(server)
      .get('/api/admin/v1/actions')
      .set('authorization', auth(adminToken))
      .expect(200);
    expect(adminActionsRes.body.items.some((a: { id: string }) => a.id === actionId)).toBe(true);

    // Read path 5: GET /api/admin/v1/checkins
    const adminCheckinsRes = await request(server)
      .get('/api/admin/v1/checkins')
      .set('authorization', auth(adminToken))
      .expect(200);
    expect(adminCheckinsRes.body.items.some((c: { id: string }) => c.id === checkinId)).toBe(true);

    // Read path 6: GET /api/admin/v1/dashboard/overview
    const adminOverviewRes = await request(server)
      .get('/api/admin/v1/dashboard/overview')
      .set('authorization', auth(adminToken))
      .expect(200);
    expect(adminOverviewRes.body.item.journeySummary.actions).toBeGreaterThan(0);
    expect(adminOverviewRes.body.item.journeySummary.dueCheckins).toBeGreaterThan(0);

    // Read path 7: Monthly report available months
    const availableMonths = await monthlyService.availableMonths(testUserId);
    const thisMonth = new Date().toISOString().slice(0, 7);
    expect(availableMonths.items.includes(thisMonth)).toBe(true);

    // Re-read final row from fresh client after API response to ensure persistence
    const verifyPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const dbAction = await verifyPrisma.actionCommitment.findUnique({ where: { id: actionId } });
      expect(dbAction).not.toBeNull();
      expect(dbAction?.title).toBe('门禁专用行动：直接写入PostgreSQL');

      const dbCheckin = await verifyPrisma.outcomeCheckin.findUnique({ where: { id: checkinId } });
      expect(dbCheckin).not.toBeNull();
      expect(dbCheckin?.commitmentId).toBe(actionId);
      expect(dbCheckin?.status).toBe('pending');
    } finally {
      await verifyPrisma.$disconnect();
    }
  });

  it('2. One pending check-in per action under two concurrent check-ins / ensurePendingCheckin', async () => {
    const store = app.get(StoreService);
    const persistence = app.get(Batch1PersistenceService);
    const userId = store.getDemoUserId();
    const journeyId = `journey_concurrent_${Date.now()}`;
    const actionId = `action_concurrent_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId,
          title: '并发行动旅程',
          domain: '生活',
          status: 'active',
          stage: 'acting',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.actionCommitment.create({
        data: {
          id: actionId,
          journeyId,
          userId,
          title: '并发测试行动',
          status: 'active',
          dueAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // 1. Concurrent ensurePendingCheckin: two concurrent calls must produce at most ONE pending checkin
      const [res1, res2] = await Promise.all([
        persistence.ensurePendingCheckin(actionId),
        persistence.ensurePendingCheckin(actionId),
      ]);

      expect(res1.status).toBe('pending');
      expect(res2.status).toBe('pending');
      expect(res1.id).toBe(res2.id);

      const pendingCount = await freshPrisma.outcomeCheckin.count({
        where: { commitmentId: actionId, status: 'pending' },
      });
      expect(pendingCount).toBe(1);

      // 2. Concurrent checkinAction: two concurrent checkins on the same action
      const [checkinRes1, checkinRes2] = await Promise.all([
        store.checkinAction(actionId, { status: 'completed', reflection: '并发打卡1' }),
        store.checkinAction(actionId, { status: 'completed', reflection: '并发打卡2' }),
      ]);

      expect(checkinRes1.action.status).toBe('completed');
      expect(checkinRes2.action.status).toBe('completed');
      expect(checkinRes1.checkin.status).toBe('completed');
      expect(checkinRes2.checkin.status).toBe('completed');

      // The checkin transitioned out of pending exactly once; no pending checkins remain
      const finalPendingCount = await freshPrisma.outcomeCheckin.count({
        where: { commitmentId: actionId, status: 'pending' },
      });
      expect(finalPendingCount).toBe(0);

      const totalCheckinCount = await freshPrisma.outcomeCheckin.count({
        where: { commitmentId: actionId },
      });
      expect(totalCheckinCount).toBe(1);
    } finally {
      await freshPrisma.$disconnect();
    }
  });

  it('P0-1 discriminating test: A second check-in request on a completed check-in is idempotent and never rewrites reflection, checkedAt, intensity, or creates duplicate JourneyUpdates', async () => {
    const store = app.get(StoreService);
    const userId = store.getDemoUserId();
    const journeyId = `journey_p01_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId,
          title: 'P0-1幂等打卡测试旅程',
          domain: '生活',
          status: 'active',
          stage: 'acting',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // 1. Create action commitment with initial pending checkin
      const createRes = await store.createActionCommitment(journeyId, {
        title: '初始测试行动',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      });
      const actId = createRes.item.id;

      // 2. Perform first checkin
      const firstCheckin = await store.checkinAction(actId, {
        status: 'completed',
        reflection: '最初的真实感悟内容',
        result: '第一版结果',
        intensity: 8,
      });

      expect(firstCheckin.action.status).toBe('completed');
      expect(firstCheckin.checkin.status).toBe('completed');
      expect(firstCheckin.checkin.reflection).toBe('最初的真实感悟内容');
      const originalCheckedAt = firstCheckin.checkin.checkedAt;
      expect(originalCheckedAt).toBeDefined();

      // Read from DB to record original state
      const dbCheckin1 = await freshPrisma.outcomeCheckin.findFirst({
        where: { commitmentId: actId },
      });
      expect(dbCheckin1?.reflection).toBe('最初的真实感悟内容');
      expect(dbCheckin1?.intensity).toBe(8);

      const updateCountBefore = await freshPrisma.journeyUpdate.count({
        where: { journeyId, kind: 'checkin' },
      });
      expect(updateCountBefore).toBe(1);

      // 3. Attempt second checkin with different reflection, intensity, and result
      const secondCheckin = await store.checkinAction(actId, {
        status: 'completed',
        reflection: '试图非法覆写的篡改内容',
        result: '篡改结果',
        intensity: 2,
      });

      // Idempotent: must return the original reflection and original checkedAt
      expect(secondCheckin.checkin.reflection).toBe('最初的真实感悟内容');
      expect(secondCheckin.checkin.checkedAt).toBe(originalCheckedAt);

      // Verify in PostgreSQL that DB row was NOT rewritten
      const dbCheckin2 = await freshPrisma.outcomeCheckin.findFirst({
        where: { commitmentId: actId },
      });
      expect(dbCheckin2?.reflection).toBe('最初的真实感悟内容');
      expect(dbCheckin2?.result).toBe('第一版结果');
      expect(dbCheckin2?.intensity).toBe(8);
      expect(dbCheckin2?.checkedAt?.toISOString()).toBe(dbCheckin1?.checkedAt?.toISOString());

      // Verify no duplicate JourneyUpdate was created
      const updateCountAfter = await freshPrisma.journeyUpdate.count({
        where: { journeyId, kind: 'checkin' },
      });
      expect(updateCountAfter).toBe(1);
    } finally {
      await freshPrisma.$disconnect();
    }
  });

  it('P0-2 discriminating test: A failed archive deletion does NOT detach SafetyEvents prematurely', async () => {
    const store = app.get(StoreService);
    const userId = store.getDemoUserId();
    const journeyId = `journey_p02_${Date.now()}`;
    const safetyId = `safety_p02_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      // Create an ACTIVE journey (not archived)
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId,
          title: '活跃旅程（不可删除归档）',
          domain: '生活',
          status: 'active', // Active!
          stage: 'acting',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.safetyEvent.create({
        data: {
          id: safetyId,
          userId,
          journeyId,
          level: 'high',
          source: 'journey_create',
          action: 'real_world_support_prompt',
          status: 'open',
          createdAt: new Date(),
        },
      });

      // Attempt store.deleteJourneyArchive on an active journey -> must fail with BadRequestException
      await expect(store.deleteJourneyArchive(journeyId, userId)).rejects.toThrow(
        /只能删除已归档或已完成的旅程/,
      );

      // Verify in PostgreSQL that SafetyEvent was NOT prematurely detached!
      const dbSafety = await freshPrisma.safetyEvent.findUnique({ where: { id: safetyId } });
      expect(dbSafety).not.toBeNull();
      expect(dbSafety?.journeyId).toBe(journeyId); // Still attached!

      // Also test: an archived journey where deleteJourneyArchive transaction fails
      const archivedJourneyId = `journey_p02_fail_${Date.now()}`;
      const archivedSafetyId = `safety_p02_fail_${Date.now()}`;

      await freshPrisma.lifeJourney.create({
        data: {
          id: archivedJourneyId,
          userId,
          title: '已归档旅程（事务失败回滚测试）',
          domain: '生活',
          status: 'archived',
          stage: 'graduated',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.safetyEvent.create({
        data: {
          id: archivedSafetyId,
          userId,
          journeyId: archivedJourneyId,
          level: 'high',
          source: 'journey_create',
          action: 'real_world_support_prompt',
          status: 'open',
          createdAt: new Date(),
        },
      });

      const persistence = app.get(Batch1PersistenceService);
      await expect(
        persistence.deleteJourneyArchive({
          journeyId: archivedJourneyId,
          userId,
          actionIds: [],
          archiveRoute: `/pages/journey/detail?id=${archivedJourneyId}`,
          _failDuringTransaction: true,
        }),
      ).rejects.toThrow(/Simulated failure during deleteJourneyArchive transaction/);

      // Verify in PostgreSQL: SafetyEvent was NOT detached because transaction rolled back!
      const dbSafety2 = await freshPrisma.safetyEvent.findUnique({ where: { id: archivedSafetyId } });
      expect(dbSafety2).not.toBeNull();
      expect(dbSafety2?.journeyId).toBe(archivedJourneyId); // Preserved!
    } finally {
      await freshPrisma.$disconnect();
    }
  });

  it('P0-3 discriminating test: High-risk Journey creation commits SafetyEvent atomically in one transaction, and a SafetyEvent failure rolls back the entire Journey', async () => {
    const persistence = app.get(Batch1PersistenceService);
    const store = app.get(StoreService);
    const userId = store.getDemoUserId();
    const failJourneyId = `journey_p03_fail_${Date.now()}`;
    const failSafetyId = `safety_p03_fail_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      // 1. Simulated failure during SafetyEvent creation within createJourneyWithSnapshotAndUpdate
      await expect(
        persistence.createJourneyWithSnapshotAndUpdate({
          journey: {
            id: failJourneyId,
            userId,
            title: '高风险失败旅程',
            domain: '情绪',
            status: 'active',
            stage: 'safety_first',
            visibility: 'PRIVATE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          snapshot: {
            id: `snap_${Date.now()}`,
            journeyId: failJourneyId,
            facts: ['高风险事实'],
            feelings: ['绝望'],
            needs: ['援助'],
            constraints: [],
            risks: ['危机'],
            contextTags: ['紧急'],
            confidence: 'agent_draft',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          update: {
            id: `update_${Date.now()}`,
            journeyId: failJourneyId,
            userId,
            kind: 'created',
            content: '事情发生',
            createdAt: new Date().toISOString(),
          },
          safetyEvent: {
            id: failSafetyId,
            level: 'high',
            source: 'journey_create',
            action: 'real_world_support_prompt',
            _failDuringSafetyEvent: true,
          },
        }),
      ).rejects.toThrow(/Simulated failure during atomic safety event creation/);

      // Verify in PostgreSQL: LifeJourney, SituationSnapshot, JourneyUpdate were completely rolled back!
      const dbJourney = await freshPrisma.lifeJourney.findUnique({ where: { id: failJourneyId } });
      expect(dbJourney).toBeNull();

      const dbSafety = await freshPrisma.safetyEvent.findUnique({ where: { id: failSafetyId } });
      expect(dbSafety).toBeNull();

      // 2. Successful high-risk journey creation via store.createJourney: atomically commits both
      const highRiskText = `高风险测试内容 ${Date.now()}：我有自杀的冲动和自伤行为，撑不下去了，需要有人救我。`;
      const created = await store.createJourney({
        title: '高风险成功旅程',
        domain: '情绪',
        content: highRiskText,
      });

      const successJourneyId = created.journey.id;
      const successDbJourney = await freshPrisma.lifeJourney.findUnique({ where: { id: successJourneyId } });
      expect(successDbJourney).not.toBeNull();
      expect(successDbJourney?.stage).toBe('safety_first');

      const successDbSafety = await freshPrisma.safetyEvent.findFirst({
        where: { journeyId: successJourneyId, level: 'high' },
      });
      expect(successDbSafety).not.toBeNull();
      expect(successDbSafety?.journeyId).toBe(successJourneyId);
    } finally {
      await freshPrisma.$disconnect();
    }
  });

  it('3. Atomic check-in: a failure leaves no half-written JourneyUpdate or FollowUpJob state', async () => {
    const store = app.get(StoreService);
    const persistence = app.get(Batch1PersistenceService);
    const userId = store.getDemoUserId();
    const journeyId = `journey_atomic_${Date.now()}`;
    const actionId = `action_atomic_${Date.now()}`;
    const checkinId = `checkin_atomic_${Date.now()}`;
    const followUpId = `followup_atomic_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId,
          title: '原子测试旅程',
          domain: '生活',
          status: 'active',
          stage: 'acting',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.actionCommitment.create({
        data: {
          id: actionId,
          journeyId,
          userId,
          title: '原子打卡测试行动',
          status: 'active',
          dueAt: new Date(Date.now() + 86400000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.outcomeCheckin.create({
        data: {
          id: checkinId,
          journeyId,
          commitmentId: actionId,
          userId,
          status: 'pending',
          createdAt: new Date(),
        },
      });

      await freshPrisma.followUpJob.create({
        data: {
          id: followUpId,
          userId,
          journeyId,
          kind: 'action_checkin',
          status: 'pending',
          dueAt: new Date(Date.now() + 86400000),
          payload: { actionId, title: '原子打卡测试行动' },
          createdAt: new Date(),
        },
      });

      // 1. Simulated transaction failure during checkinAction
      await expect(
        persistence.checkinAction({
          actionId,
          userId,
          status: 'completed',
          reflection: '这一步应当完全回滚',
          _failDuringTransaction: true,
        }),
      ).rejects.toThrow(/Simulated failure during checkinAction transaction/);

      // Verify PostgreSQL state is completely untouched after rollback
      const actionAfterFail = await freshPrisma.actionCommitment.findUnique({ where: { id: actionId } });
      expect(actionAfterFail?.status).toBe('active');

      const checkinAfterFail = await freshPrisma.outcomeCheckin.findUnique({ where: { id: checkinId } });
      expect(checkinAfterFail?.status).toBe('pending');
      expect(checkinAfterFail?.checkedAt).toBeNull();

      const followUpAfterFail = await freshPrisma.followUpJob.findUnique({ where: { id: followUpId } });
      expect(followUpAfterFail?.status).toBe('pending');
      expect(followUpAfterFail?.completedAt).toBeNull();

      const updatesAfterFail = await freshPrisma.journeyUpdate.findMany({
        where: { journeyId, kind: 'checkin' },
      });
      expect(updatesAfterFail.length).toBe(0);

      // 2. Successful checkinAction commits all states atomically
      const successRes = await persistence.checkinAction({
        actionId,
        userId,
        status: 'completed',
        reflection: '成功完成打卡',
      });

      expect(successRes.action.status).toBe('completed');
      expect(successRes.checkin.status).toBe('completed');
      expect(successRes.followUp?.status).toBe('completed');

      const actionFinal = await freshPrisma.actionCommitment.findUnique({ where: { id: actionId } });
      expect(actionFinal?.status).toBe('completed');

      const checkinFinal = await freshPrisma.outcomeCheckin.findUnique({ where: { id: checkinId } });
      expect(checkinFinal?.status).toBe('completed');
      expect(checkinFinal?.reflection).toBe('成功完成打卡');
      expect(checkinFinal?.checkedAt).not.toBeNull();

      const followUpFinal = await freshPrisma.followUpJob.findUnique({ where: { id: followUpId } });
      expect(followUpFinal?.status).toBe('completed');
      expect(followUpFinal?.completedAt).not.toBeNull();

      const updatesFinal = await freshPrisma.journeyUpdate.findMany({
        where: { journeyId, kind: 'checkin' },
      });
      expect(updatesFinal.length).toBe(1);
      expect(updatesFinal[0].content).toContain('成功完成打卡');
    } finally {
      await freshPrisma.$disconnect();
    }
  });

  it('4. FK preservation: a legacy flush must not null OutcomeCheckin.commitmentId nor delete commitment or check-in', async () => {
    const store = app.get(StoreService);
    const userId = store.getDemoUserId();
    const journeyId = `journey_fk_${Date.now()}`;
    const actionId = `action_fk_${Date.now()}`;
    const checkinId = `checkin_fk_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId,
          title: 'FK保护测试旅程',
          domain: '生活',
          status: 'active',
          stage: 'acting',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.actionCommitment.create({
        data: {
          id: actionId,
          journeyId,
          userId,
          title: 'FK保护测试行动',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.outcomeCheckin.create({
        data: {
          id: checkinId,
          journeyId,
          commitmentId: actionId,
          userId,
          status: 'pending',
          createdAt: new Date(),
        },
      });

      // Simulate a legacy flush from another instance with empty/stale actionCommitments & outcomeCheckins arrays
      const staleState = {
        users: [
          {
            id: userId,
            openid: 'demo_openid_fk',
            nickname: 'Demo',
            anonymousCode: 'demo_fk',
            status: 'normal',
            createdAt: new Date().toISOString(),
          },
        ],
        actionCommitments: [], // Empty in legacy snapshot because direct-db-model is not loaded
        outcomeCheckins: [
          {
            id: checkinId,
            journeyId,
            commitmentId: actionId,
            userId,
            status: 'pending',
            createdAt: new Date().toISOString(),
          },
        ],
      };

      await saveRelationalRuntimeState(freshPrisma, staleState);

      // Verify that commitmentId was NOT nulled and neither record was deleted
      const checkPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
      try {
        const dbAction = await checkPrisma.actionCommitment.findUnique({ where: { id: actionId } });
        expect(dbAction).not.toBeNull();
        expect(dbAction?.id).toBe(actionId);

        const dbCheckin = await checkPrisma.outcomeCheckin.findUnique({ where: { id: checkinId } });
        expect(dbCheckin).not.toBeNull();
        expect(dbCheckin?.commitmentId).toBe(actionId);
        expect(dbCheckin?.status).toBe('pending');
      } finally {
        await checkPrisma.$disconnect();
      }
    } finally {
      await freshPrisma.$disconnect();
    }
  });

  it('5. Archive deletion: still deletes only the agreed objects and detaches the rest', async () => {
    const store = app.get(StoreService);
    const userId = store.getDemoUserId();
    const journeyId = `del_j_archive_${Date.now()}`;
    const snapshotId = `del_snap_archive_${Date.now()}`;
    const updateId = `del_up_archive_${Date.now()}`;
    const actionId = `del_act_archive_${Date.now()}`;
    const checkinId = `del_chk_archive_${Date.now()}`;
    const moodId = `del_mood_archive_${Date.now()}`;
    const diaryId = `del_diary_archive_${Date.now()}`;
    const safetyId = `del_safety_archive_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId,
          title: '待删除归档旅程',
          domain: '生活',
          status: 'archived',
          stage: 'graduated',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.situationSnapshot.create({
        data: {
          id: snapshotId,
          journeyId,
          facts: ['归档处境事实'],
          feelings: [],
          needs: [],
          constraints: [],
          risks: [],
          confidence: 'user_confirmed',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.journeyUpdate.create({
        data: {
          id: updateId,
          journeyId,
          userId,
          kind: 'note',
          content: '归档进展内容',
          createdAt: new Date(),
        },
      });

      await freshPrisma.actionCommitment.create({
        data: {
          id: actionId,
          journeyId,
          userId,
          title: '待归档删除行动',
          status: 'completed',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.outcomeCheckin.create({
        data: {
          id: checkinId,
          journeyId,
          commitmentId: actionId,
          userId,
          status: 'completed',
          createdAt: new Date(),
        },
      });

      // Create linked objects that must survive detached
      await freshPrisma.mood.create({
        data: {
          id: moodId,
          userId,
          emotion: '焦虑',
          content: '应保留的心情',
          visibility: 'PRIVATE',
          riskLevel: 'low',
          riskScore: 0,
          journeyId,
          createdAt: new Date(),
        },
      });

      await freshPrisma.diary.create({
        data: {
          id: diaryId,
          userId,
          moodId,
          journeyId,
          emotion: '焦虑',
          content: '应保留的日记',
          createdAt: new Date(),
        },
      });

      await freshPrisma.safetyEvent.create({
        data: {
          id: safetyId,
          userId,
          journeyId,
          level: 'high',
          source: 'journey_create',
          action: 'real_world_support_prompt',
          status: 'open',
          createdAt: new Date(),
        },
      });
    } finally {
      await freshPrisma.$disconnect();
    }

    // Call persistence.deleteJourneyArchive directly to test transactional deletion and detachment
    const persistence = app.get(Batch1PersistenceService);
    const archiveRoute = `/pages/journey/detail?id=${journeyId}`;
    const result = await persistence.deleteJourneyArchive({
      journeyId,
      userId,
      actionIds: [actionId],
      archiveRoute,
    });
    expect(result.deletedJourneyId).toBe(journeyId);

    // Verify in PostgreSQL: child objects deleted, attached objects detached
    const verifyPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const deletedJourney = await verifyPrisma.lifeJourney.findUnique({ where: { id: journeyId } });
      expect(deletedJourney).toBeNull();

      const deletedSnapshot = await verifyPrisma.situationSnapshot.findUnique({ where: { id: snapshotId } });
      expect(deletedSnapshot).toBeNull();

      const deletedUpdate = await verifyPrisma.journeyUpdate.findUnique({ where: { id: updateId } });
      expect(deletedUpdate).toBeNull();

      const deletedAction = await verifyPrisma.actionCommitment.findUnique({ where: { id: actionId } });
      expect(deletedAction).toBeNull();

      const deletedCheckin = await verifyPrisma.outcomeCheckin.findUnique({ where: { id: checkinId } });
      expect(deletedCheckin).toBeNull();

      // Attached objects must survive detached (journeyId = null)
      const survivingMood = await verifyPrisma.mood.findUnique({ where: { id: moodId } });
      expect(survivingMood).not.toBeNull();
      expect(survivingMood?.journeyId).toBeNull();

      const survivingDiary = await verifyPrisma.diary.findUnique({ where: { id: diaryId } });
      expect(survivingDiary).not.toBeNull();
      expect(survivingDiary?.journeyId).toBeNull();

      const survivingSafety = await verifyPrisma.safetyEvent.findUnique({ where: { id: safetyId } });
      expect(survivingSafety).not.toBeNull();
      expect(survivingSafety?.journeyId).toBeNull();
    } finally {
      await verifyPrisma.$disconnect();
    }
  });
});
