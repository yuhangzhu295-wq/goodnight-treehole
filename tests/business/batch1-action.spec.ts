import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
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

  it('P0-D discriminating test: An idempotent check-in returns guidance matching the returned row in both directions', async () => {
    const store = app.get(StoreService);
    const userId = store.getDemoUserId();
    const journeyId = `journey_p0d_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId,
          title: 'P0-D打卡客户端引导测试旅程',
          domain: '生活',
          status: 'active',
          stage: 'acting',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Direction 1: Action completed first, then retried with status: 'missed'
      const action1 = await store.createActionCommitment(journeyId, {
        title: '行动1：已完成',
      });
      const firstRes1 = await store.checkinAction(action1.item.id, {
        status: 'completed',
        reflection: '完成感悟',
      });
      expect(firstRes1.checkin.status).toBe('completed');
      expect(firstRes1.adaptive.required).toBe(false);

      // Retry completed action with status: 'missed' -> must return completed checkin and adaptive.required: false
      const retryMissed = await store.checkinAction(action1.item.id, {
        status: 'missed',
        reflection: '试图报告未完成',
        barrier: 'forgot',
      });
      expect(retryMissed.checkin.status).toBe('completed');
      expect(retryMissed.adaptive.required).toBe(false);

      // Direction 2: Action missed first, then retried with status: 'completed'
      const action2 = await store.createActionCommitment(journeyId, {
        title: '行动2：未完成',
      });
      const firstRes2 = await store.checkinAction(action2.item.id, {
        status: 'missed',
        reflection: '未完成感悟',
        barrier: 'too_hard',
      });
      expect(firstRes2.checkin.status).toBe('missed');
      expect(firstRes2.adaptive.required).toBe(true);
      expect((firstRes2.adaptive as any).nextRoute).toContain('barrier');

      // Retry missed action with status: 'completed' -> must return missed checkin and adaptive.required: true
      const retryCompleted = await store.checkinAction(action2.item.id, {
        status: 'completed',
        reflection: '试图报告已完成',
      });
      expect(retryCompleted.checkin.status).toBe('missed');
      expect(retryCompleted.adaptive.required).toBe(true);
      expect((retryCompleted.adaptive as any).nextRoute).toContain('barrier');
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

  it('P0-C discriminating test: store.deleteJourneyArchive route path resolves action set and AIJob deletion inside transaction', async () => {
    const store = app.get(StoreService);
    const userId = store.getDemoUserId();
    const journeyId = `del_route_j_${Date.now()}`;
    const actionId = `del_route_act_${Date.now()}`;
    const aiJobId = `del_route_job_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId,
          title: '已归档旅程（测试路由级删除）',
          domain: '生活',
          status: 'archived',
          stage: 'graduated',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.actionCommitment.create({
        data: {
          id: actionId,
          journeyId,
          userId,
          title: '待删除行动',
          status: 'completed',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.aIProvider.upsert({
        where: { id: 'provider_template' },
        create: {
          id: 'provider_template',
          name: 'Template Provider',
          type: 'template',
          baseUrl: 'local://template',
          modelName: 'safe-template',
          providerKind: 'template',
          usageTags: [],
        },
        update: {},
      });

      await freshPrisma.aIJob.create({
        data: {
          id: aiJobId,
          userId,
          contentId: actionId, // Linked to the action!
          contentType: 'ActionCommitment',
          jobType: '自适应行动',
          taskType: 'adaptive_action',
          style: 'rational',
          providerId: 'provider_template',
          modelName: 'safe-template',
          status: 'succeeded',
          promptSummary: '行动规划',
          retryCount: 0,
          fallbackUsed: false,
          routeVersion: 1,
          durationMs: 50,
          traceJson: [],
          createdAt: new Date(),
        },
      });

      // Call store.deleteJourneyArchive (the route-level path)
      const result = await store.deleteJourneyArchive(journeyId, userId);
      expect(result.deletedJourneyId).toBe(journeyId);

      // Verify in PostgreSQL that BOTH the Action AND its linked AIJob were deleted inside the transaction!
      const checkAction = await freshPrisma.actionCommitment.findUnique({ where: { id: actionId } });
      expect(checkAction).toBeNull();

      const checkAiJob = await freshPrisma.aIJob.findUnique({ where: { id: aiJobId } });
      expect(checkAiJob).toBeNull();
    } finally {
      await freshPrisma.$disconnect();
    }
  });

  it('P0-4 discriminating test: deleteJourneyArchive locks LifeJourney with FOR UPDATE, serializing concurrent action creation', async () => {
    const store = app.get(StoreService);
    const persistence = app.get(Batch1PersistenceService);
    const userId = store.getDemoUserId();
    const journeyId = `del_lock_j_${Date.now()}`;
    const initialActionId = `del_lock_act_${Date.now()}`;
    const initialAiJobId = `del_lock_job_${Date.now()}`;
    const concurrentActionTitle = `CONCURRENT_INSERTED_ACTION_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId,
          title: '锁定归档删除测试旅程',
          domain: '生活',
          status: 'archived',
          stage: 'graduated',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.actionCommitment.create({
        data: {
          id: initialActionId,
          journeyId,
          userId,
          title: '初始行动',
          status: 'completed',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.aIProvider.upsert({
        where: { id: 'provider_template' },
        create: {
          id: 'provider_template',
          name: 'Template Provider',
          type: 'template',
          baseUrl: 'local://template',
          modelName: 'safe-template',
          providerKind: 'template',
          usageTags: [],
        },
        update: {},
      });

      await freshPrisma.aIJob.create({
        data: {
          id: initialAiJobId,
          userId,
          contentId: initialActionId,
          contentType: 'ActionCommitment',
          jobType: '自适应行动',
          taskType: 'adaptive_action',
          style: 'rational',
          providerId: 'provider_template',
          modelName: 'safe-template',
          status: 'succeeded',
          promptSummary: '行动规划',
          retryCount: 0,
          fallbackUsed: false,
          routeVersion: 1,
          durationMs: 50,
          traceJson: [],
          createdAt: new Date(),
        },
      });

      let concurrentActionCompleted = false;

      // When deleteJourneyArchive holds the FOR UPDATE lock on LifeJourney,
      // dispatch a concurrent createActionCommitment attempt on that same journey
      const deletePromise = persistence.deleteJourneyArchive({
        journeyId,
        userId,
        archiveRoute: `/pages/journey/detail?id=${journeyId}`,
        _onLockedJourney: async () => {
          // Attempt concurrent action insert in background: must block because LifeJourney is locked!
          store.createActionCommitment(journeyId, { title: concurrentActionTitle })
            .then(() => { concurrentActionCompleted = true; })
            .catch(() => { concurrentActionCompleted = true; });

          // Wait a short time slice: verify concurrentAction has NOT completed because it is blocked on the row lock!
          await new Promise((resolve) => setTimeout(resolve, 80));
          expect(concurrentActionCompleted).toBe(false);
        },
      });

      await deletePromise;

      // Verify that LifeJourney and initial action + AIJob are deleted
      const checkJourney = await freshPrisma.lifeJourney.findUnique({ where: { id: journeyId } });
      expect(checkJourney).toBeNull();

      const checkAction = await freshPrisma.actionCommitment.findUnique({ where: { id: initialActionId } });
      expect(checkAction).toBeNull();

      const checkAiJob = await freshPrisma.aIJob.findUnique({ where: { id: initialAiJobId } });
      expect(checkAiJob).toBeNull();

      // Ensure concurrent action did not escape deletion
      const orphanedAction = await freshPrisma.actionCommitment.findFirst({
        where: { journeyId, title: concurrentActionTitle },
      });
      expect(orphanedAction).toBeNull();
    } finally {
      await freshPrisma.$disconnect();
    }
  });

  it('P0-Lock discriminating test: concurrent check-in and archive deletion enforce Journey -> Action lock order without 40P01 deadlock', async () => {
    const store = app.get(StoreService);
    const persistence = app.get(Batch1PersistenceService);
    const userId = store.getDemoUserId();
    const journeyId = `deadlock_test_j_${Date.now()}`;
    const actionId = `deadlock_test_act_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId,
          title: '死锁防护测试旅程',
          domain: '生活',
          status: 'archived',
          stage: 'graduated',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.actionCommitment.create({
        data: {
          id: actionId,
          journeyId,
          userId,
          title: '竞争行动',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.outcomeCheckin.create({
        data: {
          id: `checkin_${Date.now()}`,
          journeyId,
          commitmentId: actionId,
          userId,
          status: 'pending',
          createdAt: new Date(),
        },
      });

      // Under global Journey -> Action lock ordering, both transactions lock LifeJourney first.
      // They serialize cleanly without deadlock (no 40P01).
      const [checkinRes, deleteRes] = await Promise.allSettled([
        store.checkinAction(actionId, { status: 'completed', reflection: '竞争打卡' }),
        persistence.deleteJourneyArchive({
          journeyId,
          userId,
          archiveRoute: `/pages/journey/detail?id=${journeyId}`,
        }),
      ]);

      // Assert that neither transaction aborted with 40P01 Postgres deadlock error
      const checkinError = checkinRes.status === 'rejected' ? String(checkinRes.reason) : '';
      const deleteError = deleteRes.status === 'rejected' ? String(deleteRes.reason) : '';
      expect(checkinError).not.toMatch(/40P01|deadlock/i);
      expect(deleteError).not.toMatch(/40P01|deadlock/i);

      // And archive deletion succeeded
      expect(deleteRes.status).toBe('fulfilled');
    } finally {
      await freshPrisma.$disconnect();
    }
  });

  it('P0-Lock mutation check: inverting lock order between Action and Journey reproduces 40P01 deadlock', async () => {
    const userId = `user_mutation_${Date.now()}`;
    const journeyId = `deadlock_mut_j_${Date.now()}`;
    const actionId = `deadlock_mut_act_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.user.create({
        data: {
          id: userId,
          openid: `openid_${userId}`,
          nickname: 'Mutation User',
          anonymousCode: `code_${userId}`,
          createdAt: new Date(),
        },
      });

      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId,
          title: '死锁变异测试旅程',
          domain: '生活',
          status: 'archived',
          stage: 'graduated',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.actionCommitment.create({
        data: {
          id: actionId,
          journeyId,
          userId,
          title: '变异竞争行动',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.outcomeCheckin.create({
        data: {
          id: `checkin_${Date.now()}`,
          journeyId,
          commitmentId: actionId,
          userId,
          status: 'pending',
          createdAt: new Date(),
        },
      });

      let t1AcquiredAction = false;
      let t2AcquiredJourney = false;

      // Two concurrent transactions with inverted lock order executed directly via independent Prisma clients:
      // T1: Locks Action first, then attempts to lock Journey
      // T2: Locks Journey first, then attempts to lock Action
      const client1 = new PrismaClient({ datasources: { db: { url: dbUrl } } });
      const client2 = new PrismaClient({ datasources: { db: { url: dbUrl } } });

      try {
        const [t1Result, t2Result] = await Promise.allSettled([
          client1.$transaction(async (tx) => {
            await tx.$queryRaw(Prisma.sql`SELECT id FROM "ActionCommitment" WHERE id = ${actionId} FOR UPDATE`);
            t1AcquiredAction = true;
            const start = Date.now();
            while (!t2AcquiredJourney && Date.now() - start < 2000) {
              await new Promise((r) => setTimeout(r, 20));
            }
            await tx.$queryRaw(Prisma.sql`SELECT id FROM "LifeJourney" WHERE id = ${journeyId} FOR UPDATE`);
          }),
          client2.$transaction(async (tx) => {
            await tx.$queryRaw(Prisma.sql`SELECT id FROM "LifeJourney" WHERE id = ${journeyId} FOR UPDATE`);
            t2AcquiredJourney = true;
            const start = Date.now();
            while (!t1AcquiredAction && Date.now() - start < 2000) {
              await new Promise((r) => setTimeout(r, 20));
            }
            await tx.$queryRaw(Prisma.sql`SELECT id FROM "ActionCommitment" WHERE id = ${actionId} FOR UPDATE`);
          }),
        ]);

        // When lock order is inverted, PostgreSQL detects cyclic wait-for and aborts one with 40P01
        const r1 = (t1Result as any)?.reason;
        const r2 = (t2Result as any)?.reason;
        const reasons = [
          String(r1?.message || r1 || ''),
          String(r2?.message || r2 || ''),
        ];
        const deadlockDetected = reasons.some((r) => /40P01|deadlock/i.test(r));
        expect(deadlockDetected).toBe(true);
      } finally {
        await client1.$disconnect();
        await client2.$disconnect();
      }
    } finally {
      await freshPrisma.$disconnect();
    }
  });

  it('P0-RootLock discriminating test: concurrent action creation and legacy flush (saveRelationalRuntimeState) enforce User -> LifeJourney lock hierarchy without 40P01 deadlock', async () => {
    const store = app.get(StoreService);
    const userId = store.getDemoUserId();
    const journeyId = `core_deadlock_j_${Date.now()}`;
    const moodId = `core_deadlock_m_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId,
          title: '核心循环死锁防护测试旅程',
          domain: '生活',
          status: 'active',
          stage: 'clarifying',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.situationSnapshot.create({
        data: {
          id: `snap_${Date.now()}`,
          journeyId,
          facts: ['事实1'],
          feelings: ['感受1'],
          needs: [],
          constraints: [],
          risks: [],
          contextTags: ['生活'],
          confidence: 'agent_draft',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Prepare a legacy flush state that updates User and upserts Mood with journeyId
      const staleState = {
        users: [
          {
            id: userId,
            openid: 'demo_openid_rootlock',
            nickname: 'Demo User',
            anonymousCode: 'demo_rl',
            status: 'normal',
            createdAt: new Date().toISOString(),
          },
        ],
        moods: [
          {
            id: moodId,
            userId,
            emotion: '焦虑',
            content: '并发刷新心情记录',
            visibility: 'PRIVATE',
            riskLevel: 'low',
            riskScore: 0,
            status: 'active',
            journeyId,
            createdAt: new Date().toISOString(),
          },
        ],
      };

      // Concurrently run action creation and legacy flush (the exact counterparty in the core-loop deadlock)
      const [actionRes, flushRes] = await Promise.allSettled([
        store.createActionCommitment(journeyId, {
          title: '并发创建行动',
          dueAt: new Date(Date.now() + 86400000).toISOString(),
        }),
        saveRelationalRuntimeState(freshPrisma, staleState),
      ]);

      const actionError = actionRes.status === 'rejected' ? String(actionRes.reason) : '';
      const flushError = flushRes.status === 'rejected' ? String(flushRes.reason) : '';

      // Both serialize cleanly under User -> LifeJourney -> ActionCommitment hierarchy without 40P01 deadlock
      expect(actionError).not.toMatch(/40P01|deadlock/i);
      expect(flushError).not.toMatch(/40P01|deadlock/i);

      expect(actionRes.status).toBe('fulfilled');
      expect(flushRes.status).toBe('fulfilled');
    } finally {
      await freshPrisma.$disconnect();
    }
  });

  it('P0-CleanupOrder discriminating test: concurrent cleanup requests covering journeys in opposite order serialize under deterministic lock order without 40P01 deadlock', async () => {
    const persistence = app.get(Batch1PersistenceService);
    const user1 = `user_clean1_${Date.now()}`;
    const user2 = `user_clean2_${Date.now()}`;
    const jA = `journey_cleana_${Date.now()}`;
    const jB = `journey_cleanb_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.user.createMany({
        data: [
          { id: user1, openid: `openid_${user1}`, nickname: 'Clean User 1', anonymousCode: `code_${user1}`, createdAt: new Date() },
          { id: user2, openid: `openid_${user2}`, nickname: 'Clean User 2', anonymousCode: `code_${user2}`, createdAt: new Date() },
        ],
      });

      await freshPrisma.lifeJourney.createMany({
        data: [
          { id: jA, userId: user1, title: '旅程 A', domain: '生活', status: 'archived', stage: 'graduated', createdAt: new Date(), updatedAt: new Date() },
          { id: jB, userId: user2, title: '旅程 B', domain: '生活', status: 'archived', stage: 'graduated', createdAt: new Date(), updatedAt: new Date() },
        ],
      });

      let res1AcquiredFirst = false;
      let res2AcquiredFirst = false;

      // Concurrently run two cleanup requests with opposite journey orders: [jA, jB] vs [jB, jA]
      // with a mid-transaction barrier ensuring both hold competing locks if ordering is non-deterministic
      const [res1, res2] = await Promise.allSettled([
        persistence.deleteJourneysForTestCleanup({
          journeyIds: [jA, jB],
          actionIds: [],
          _onAfterFirstLock: async () => {
            res1AcquiredFirst = true;
            const start = Date.now();
            while (!res2AcquiredFirst && Date.now() - start < 150) {
              await new Promise((r) => setTimeout(r, 10));
            }
          },
        }),
        persistence.deleteJourneysForTestCleanup({
          journeyIds: [jB, jA],
          actionIds: [],
          _onAfterFirstLock: async () => {
            res2AcquiredFirst = true;
            const start = Date.now();
            while (!res1AcquiredFirst && Date.now() - start < 150) {
              await new Promise((r) => setTimeout(r, 10));
            }
          },
        }),
      ]);

      const err1 = res1.status === 'rejected' ? String(res1.reason) : '';
      const err2 = res2.status === 'rejected' ? String(res2.reason) : '';

      // Under sorted, deterministic User -> LifeJourney locking, no 40P01 deadlock occurs
      expect(err1).not.toMatch(/40P01|deadlock/i);
      expect(err2).not.toMatch(/40P01|deadlock/i);

      // Verify journeys were deleted
      const checkJA = await freshPrisma.lifeJourney.findUnique({ where: { id: jA } });
      expect(checkJA).toBeNull();

      const checkJB = await freshPrisma.lifeJourney.findUnique({ where: { id: jB } });
      expect(checkJB).toBeNull();
    } finally {
      await freshPrisma.$disconnect();
    }
  });

  it('P0-CheckinOwner discriminating test: POST /actions/:id/checkin enforces caller ownership, positive control, and anonymous fallback', async () => {
    const server = app.getHttpServer();
    const store = app.get(StoreService);
    const userA = store.getDemoUserId();
    const userB = 'user_guest';
    const journeyAId = `act_own_ja_${Date.now()}`;
    const journeyBId = `act_own_jb_${Date.now()}`;
    const actionAId = `act_own_a_${Date.now()}`;
    const actionBId = `act_own_b_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      // 1. Ensure userB exists in DB
      await freshPrisma.user.upsert({
        where: { id: userB },
        create: {
          id: userB,
          openid: `openid_${userB}`,
          nickname: 'User B Guest',
          anonymousCode: `code_${userB}`,
          status: 'normal',
          createdAt: new Date(),
        },
        update: {},
      });

      // 2. Create User A's journey and action
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyAId,
          userId: userA,
          title: 'User A 行动旅程',
          domain: '生活',
          status: 'active',
          stage: 'acting',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await freshPrisma.actionCommitment.create({
        data: {
          id: actionAId,
          journeyId: journeyAId,
          userId: userA,
          title: 'User A 私有行动',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // 3. Create User B's journey and action
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyBId,
          userId: userB,
          title: 'User B 行动旅程',
          domain: '工作',
          status: 'active',
          stage: 'acting',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await freshPrisma.actionCommitment.create({
        data: {
          id: actionBId,
          journeyId: journeyBId,
          userId: userB,
          title: 'User B 私有行动',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // --- Cross-user write: User B attempting to check in User A's action -> MUST return 404 ---
      const crossCheckinRes = await request(server)
        .post(`/api/v1/actions/${actionAId}/checkin`)
        .set('x-goodnight-user-id', userB)
        .send({ status: 'completed', reflection: '越权打卡尝试' });
      expect(crossCheckinRes.status).toBe(404);
      expect(crossCheckinRes.body.message).toContain('行动不存在');

      // Verify in DB that actionA has NOT been modified by User B
      const actionABefore = await freshPrisma.actionCommitment.findUnique({ where: { id: actionAId } });
      expect(actionABefore?.status).toBe('active');

      // --- Positive control: Legitimate owner checks in own action -> 200/201 with completed checkin ---
      const ownerCheckinRes = await request(server)
        .post(`/api/v1/actions/${actionAId}/checkin`)
        .set('x-goodnight-user-id', userA)
        .send({ status: 'completed', reflection: '合法所有者打卡成功' });
      expect([200, 201]).toContain(ownerCheckinRes.status);
      expect(ownerCheckinRes.body.checkin.status).toBe('completed');
      expect(ownerCheckinRes.body.checkin.reflection).toBe('合法所有者打卡成功');

      const actionAAfter = await freshPrisma.actionCommitment.findUnique({ where: { id: actionAId } });
      expect(actionAAfter?.status).toBe('completed');

      // Positive control for User B checking in User B's action
      const userBCheckinRes = await request(server)
        .post(`/api/v1/actions/${actionBId}/checkin`)
        .set('x-goodnight-user-id', userB)
        .send({ status: 'completed', reflection: 'User B 打卡成功' });
      expect([200, 201]).toContain(userBCheckinRes.status);
      expect(userBCheckinRes.body.checkin.status).toBe('completed');

      // --- Anonymous case: with no x-goodnight-user-id header at all ---
      // Behavior rule: The runtime defaults anonymous callers to demoUserId ('user_demo').
      // Therefore, checking in an action owned by userB with NO header evaluates as user_demo -> MUST return 404!
      // It must never mistakenly update userB's action.
      const anonCheckinB = await request(server)
        .post(`/api/v1/actions/${actionBId}/checkin`)
        .send({ status: 'completed', reflection: '匿名冒名打卡尝试' });
      expect(anonCheckinB.status).toBe(404);
      expect(anonCheckinB.body.message).toContain('行动不存在');
    } finally {
      await freshPrisma.$disconnect();
    }
  });
});
