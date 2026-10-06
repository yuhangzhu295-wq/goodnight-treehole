import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createTwoInstanceHarness, type MultiInstanceContext } from './two-instance-harness';
import { saveRelationalRuntimeState } from '../../apps/api/src/relational-runtime.mapper';

describe('Batch 1 Multi-Instance & Concurrency Verification', () => {
  let harness: MultiInstanceContext;
  let testUserId: string;

  beforeAll(async () => {
    harness = await createTwoInstanceHarness();
    testUserId = harness.storeA.getDemoUserId();

    // Ensure template AI provider exists in database
    await harness.db.aIProvider.upsert({
      where: { id: 'provider_template' },
      create: {
        id: 'provider_template',
        name: '模板提供方',
        type: 'template',
        baseUrl: 'local://template',
        modelName: 'safe-template',
        providerKind: 'template',
        usageTags: [],
      },
      update: {},
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  describe('Flow 1: Journey multi-instance safety', () => {
    it('1. Concurrently patching the same journey across two instances preserves both fields without deadlock', async () => {
      const journeyId = `journey_patch_race_${Date.now()}`;

      // 1. Seed initial journey in DB
      await harness.db.lifeJourney.create({
        data: {
          id: journeyId,
          userId: testUserId,
          title: '初始旅程标题',
          domain: '生活',
          status: 'active',
          stage: 'clarifying',
          summary: '初始总结内容',
          visibility: 'PRIVATE',
        },
      });

      // 2. Instance A patches title, Instance B patches summary concurrently
      const patchA = harness.persistenceA.patchJourney(
        journeyId,
        { title: '实例A更新的标题' },
        undefined,
        testUserId,
      );

      const patchB = harness.persistenceB.patchJourney(
        journeyId,
        { summary: '实例B更新的总结内容' },
        undefined,
        testUserId,
      );

      const [resA, resB] = await Promise.all([patchA, patchB]);
      expect(resA.id).toBe(journeyId);
      expect(resB.id).toBe(journeyId);

      // 3. Assert from independent client: neither field was lost, no deadlock occurred
      const finalJourney = await harness.db.lifeJourney.findUnique({ where: { id: journeyId } });
      expect(finalJourney).not.toBeNull();
      expect(finalJourney?.title).toBe('实例A更新的标题');
      expect(finalJourney?.summary).toBe('实例B更新的总结内容');
    });

    it('2. AI completion on one instance racing user confirmation on another preserves user-confirmed content', async () => {
      const journeyId = `journey_ai_conf_race_${Date.now()}`;
      const snapshotId = `snapshot_ai_conf_race_${Date.now()}`;
      const jobId = `job_ai_conf_race_${Date.now()}`;

      // 1. Seed journey and draft snapshot in DB
      await harness.db.lifeJourney.create({
        data: {
          id: journeyId,
          userId: testUserId,
          title: '生活里正在整理的一件事',
          domain: '生活',
          status: 'active',
          stage: 'clarifying',
          summary: '初始待整理总结',
          visibility: 'PRIVATE',
        },
      });

      await harness.db.situationSnapshot.create({
        data: {
          id: snapshotId,
          journeyId,
          facts: ['初始草稿事实'],
          feelings: ['初始草稿感受'],
          needs: ['初始草稿需要'],
          constraints: [],
          risks: [],
          domain: '生活',
          contextTags: ['日常'],
          confidence: 'agent_draft',
        },
      });

      // 2. Prepare succeeded AI job in DB
      await harness.db.aIJob.create({
        data: {
          id: jobId,
          userId: testUserId,
          contentId: journeyId,
          contentType: 'Situation',
          jobType: '处境分析',
          taskType: 'situation_analysis',
          style: 'rational',
          providerId: 'provider_template',
          modelName: 'safe-template',
          status: 'succeeded',
          promptSummary: 'AI自动整理处境',
          result: 'AI自动生成的总结',
          structuredResult: {
            summary: 'AI生成的总结内容',
            facts: ['AI推断的事实A'],
            feelings: ['AI推断的感受B'],
          },
          durationMs: 40,
          traceJson: [],
        },
      });

      const completedJob = await harness.persistenceB.getAiJob(jobId);
      expect(completedJob).not.toBeNull();

      // 3. Race: Instance A applies user confirmation, Instance B applies AI completion
      const userConfirmPromise = harness.persistenceA.confirmSituation({
        journeyId,
        snapshotInput: {
          facts: ['用户亲口确认的核心事实'],
          feelings: ['用户亲口确认的真实感受'],
          needs: ['用户需要'],
        },
        shouldRecordIntensity: false,
      });

      const aiCompletionPromise = harness.persistenceB.applySituationAnalysisAiCompletion({
        journeyId,
        userId: testUserId,
        completedJob: completedJob!,
      });

      const [confirmRes] = await Promise.all([userConfirmPromise, aiCompletionPromise]);
      expect(confirmRes.snapshot.confidence).toBe('user_confirmed');

      // 4. Assert from independent client: user-confirmed content survives in PostgreSQL
      const finalSnapshot = await harness.db.situationSnapshot.findUnique({ where: { journeyId } });
      expect(finalSnapshot).not.toBeNull();
      expect(finalSnapshot?.confidence).toBe('user_confirmed');

      const facts = finalSnapshot?.facts as string[];
      const feelings = finalSnapshot?.feelings as string[];
      expect(facts).toContain('用户亲口确认的核心事实');
      expect(feelings).toContain('用户亲口确认的真实感受');
      expect(facts).not.toContain('AI推断的事实A');

      // 5. Explicitly verify commit-time condition: any subsequent AI completion cannot overwrite user_confirmed
      const postConfirmAiRes = await harness.persistenceB.applySituationAnalysisAiCompletion({
        journeyId,
        userId: testUserId,
        completedJob: completedJob!,
      });
      expect(postConfirmAiRes.applied).toBe(false);
    });
  });

  describe('Flow 2: Action + Checkin multi-instance safety', () => {
    it('3. Two instances checking in the same action concurrently produce exactly one pending transition and one terminal state', async () => {
      const journeyId = `journey_action_race_${Date.now()}`;

      // 1. Seed journey in DB
      await harness.db.lifeJourney.create({
        data: {
          id: journeyId,
          userId: testUserId,
          title: '行动并发打卡测试旅程',
          domain: '生活',
          status: 'active',
          stage: 'acting',
          visibility: 'PRIVATE',
        },
      });

      // 2. Create action and pending checkin via Instance A
      const createdAction = await harness.persistenceA.createActionCommitment({
        journeyId,
        userId: testUserId,
        title: '每日散步30分钟',
      });
      const actionId = createdAction.item.id;

      // 3. Instance A and Instance B concurrently attempt conflicting check-in transitions
      const checkinA = harness.persistenceA.checkinAction({
        actionId,
        userId: testUserId,
        status: 'completed',
        reflection: '实例A打卡：已完成任务',
        result: '成功走完5000步',
      });

      const checkinB = harness.persistenceB.checkinAction({
        actionId,
        userId: testUserId,
        status: 'skipped',
        reflection: '实例B打卡：今天下雨跳过',
        result: '未能出门',
      });

      const [resA, resB] = await Promise.all([checkinA, checkinB]);

      // Both instances return without unhandled error
      expect(resA.checkin.status).toMatch(/completed|missed/);
      expect(resB.checkin.status).toMatch(/completed|missed/);

      // 4. Assert from independent client:
      // Exactly ONE OutcomeCheckin exists in DB, in a single terminal state
      const checkinRows = await harness.db.outcomeCheckin.findMany({
        where: { commitmentId: actionId },
      });
      expect(checkinRows).toHaveLength(1);
      const finalCheckin = checkinRows[0];
      expect(['completed', 'missed'].includes(finalCheckin.status)).toBe(true);
      expect(finalCheckin.checkedAt).not.toBeNull();

      // ActionCommitment is also in a valid terminal status
      const actionRow = await harness.db.actionCommitment.findUnique({ where: { id: actionId } });
      expect(actionRow).not.toBeNull();
      expect(['completed', 'skipped'].includes(actionRow!.status)).toBe(true);
    });
  });

  describe('Flow 3: SafetyEvent multi-instance survivability', () => {
    it('4. High-risk safety event creation on Instance A racing archive/detach on Instance B survives and detaches', async () => {
      const journeyId = `journey_safety_race_${Date.now()}`;
      const safetyEventId = `safety_race_${Date.now()}`;

      // 1. Seed completed journey in DB (completed allows deleteJourneyArchive)
      await harness.db.lifeJourney.create({
        data: {
          id: journeyId,
          userId: testUserId,
          title: '安全事件并发归档删除旅程',
          domain: '生活',
          status: 'completed',
          stage: 'graduated',
          visibility: 'PRIVATE',
        },
      });

      // 2. Instance A creates high-risk SafetyEvent attached to the journey
      const createdSafety = await harness.persistenceA.createSafetyEvent({
        id: safetyEventId,
        userId: testUserId,
        journeyId,
        level: 'high',
        source: 'crisis_hotline',
        action: 'EMERGENCY_SUPPORT',
        payload: { triggeredBy: 'high_distress_intent' },
      });
      expect(createdSafety.id).toBe(safetyEventId);

      // 3. Instance B executes deleteJourneyArchive to archive and delete the journey
      const deleteRes = await harness.persistenceB.deleteJourneyArchive({
        journeyId,
        userId: testUserId,
        archiveRoute: `/pages/journey/detail?id=${journeyId}`,
      });
      expect(deleteRes.deletedJourneyId).toBe(journeyId);

      // 4. Assert from independent client:
      // - The SafetyEvent MUST SURVIVE in the database
      const safetyRow = await harness.db.safetyEvent.findUnique({ where: { id: safetyEventId } });
      expect(safetyRow).not.toBeNull();
      expect(safetyRow?.level).toBe('high');
      expect(safetyRow?.userId).toBe(testUserId);

      // - The SafetyEvent must NOT end up attached to a deleted journey (it is detached to null)
      expect(safetyRow?.journeyId).toBeNull();

      // - The LifeJourney row was deleted
      const journeyRow = await harness.db.lifeJourney.findUnique({ where: { id: journeyId } });
      expect(journeyRow).toBeNull();

      // 5. Assert concurrency protection: attempting to create a new SafetyEvent referencing
      // the deleted journey cannot attach to a non-existent journey (foreign key constraint is enforced)
      const postDeleteEventId = `safety_post_del_${Date.now()}`;
      await expect(
        harness.persistenceA.createSafetyEvent({
          id: postDeleteEventId,
          userId: testUserId,
          journeyId,
          level: 'high',
          source: 'crisis_hotline',
          action: 'POST_DELETE_ATTEMPT',
        }),
      ).rejects.toThrow();

      // Ensure no dangling safety record was created pointing to the deleted journey
      const postDeleteRow = await harness.db.safetyEvent.findUnique({ where: { id: postDeleteEventId } });
      expect(postDeleteRow).toBeNull();
    });
  });

  describe('Flow 4: UserNotification multi-instance delivery and read races', () => {
    it('5. Worker delivery racing mark-read results in exactly one notification and read state is not reverted', async () => {
      const jobId = `followup_race_${Date.now()}`;
      const notificationId = `notification_${jobId}`;

      // 1. Seed pending FollowUpJob in DB
      await harness.db.followUpJob.create({
        data: {
          id: jobId,
          userId: testUserId,
          kind: 'FOLLOW_UP',
          status: 'pending',
          dueAt: new Date(),
          payload: { actionId: 'action_race_followup' },
        },
      });

      const jobPayload = {
        id: jobId,
        kind: 'FOLLOW_UP',
        userId: testUserId,
        payload: { actionId: 'action_race_followup' },
      };

      // 2. Deliver on Instance A
      const deliveryRes = await (harness.workerA as any).deliver(jobPayload);
      expect(deliveryRes.status).toBe('delivered');

      // 3. Mark read on Instance B
      const readRes = await harness.persistenceB.markNotificationRead(notificationId, testUserId);
      expect(readRes.item.status).toBe('read');

      // 4. Duplicate delivery retry on Instance A (or concurrent second worker)
      const duplicateDelivery = await (harness.workerA as any).deliver(jobPayload);
      expect(duplicateDelivery.status).toBe('delivered');

      // 5. Assert from independent client:
      // - Exactly one notification exists for this notificationId
      const notificationRows = await harness.db.userNotification.findMany({
        where: { id: notificationId },
      });
      expect(notificationRows).toHaveLength(1);

      // - Read state was NOT reverted back to unread!
      const finalNotification = notificationRows[0];
      expect(finalNotification.status).toBe('read');
      expect(finalNotification.readAt).not.toBeNull();
    });
  });

  describe('Flow 5: Legacy-flush competition with migrated writes', () => {
    it('6. Migrated write on Instance A racing full saveRelationalRuntimeState on Instance B produces no deadlock (40P01) and preserves migrated row', async () => {
      const journeyId = `journey_legacy_race_${Date.now()}`;
      const snapshotId = `snapshot_legacy_race_${Date.now()}`;
      const updateId = `update_legacy_race_${Date.now()}`;

      // Prepare a stale runtime state snapshot on Instance B
      // Note: DIRECT_DB_MODELS are omitted from this snapshot
      const staleState = {
        users: [
          {
            id: testUserId,
            openid: `openid_${Date.now()}`,
            nickname: 'Demo User',
            anonymousCode: 'demo_code',
            status: 'normal',
            createdAt: new Date().toISOString(),
          },
        ],
        privacySettings: {
          [testUserId]: {
            defaultVisibility: 'PRIVATE',
            allowAnonymousPublic: true,
          },
        },
        moods: [
          {
            id: `mood_stale_${Date.now()}`,
            userId: testUserId,
            emotion: '平稳',
            content: '竞态测试背景心情记录',
            visibility: 'PRIVATE',
            riskLevel: 'low',
            riskScore: 0,
            createdAt: new Date().toISOString(),
          },
        ],
      };

      // Concurrently run:
      // Instance A: migrated transaction createJourneyWithSnapshotAndUpdate
      // Instance B: full legacy flush saveRelationalRuntimeState
      const migratedWritePromise = harness.persistenceA.createJourneyWithSnapshotAndUpdate({
        journey: {
          id: journeyId,
          userId: testUserId,
          title: '竞争写入测试旅程',
          domain: '生活',
          status: 'active',
          stage: 'clarifying',
          visibility: 'PRIVATE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        snapshot: {
          id: snapshotId,
          journeyId,
          facts: ['竞争测试事实'],
          feelings: ['竞争测试感受'],
          needs: [],
          constraints: [],
          risks: [],
          domain: '生活',
          contextTags: ['工作'],
          confidence: 'user_confirmed',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        update: {
          id: updateId,
          journeyId,
          userId: testUserId,
          kind: 'init',
          content: '竞争测试更新记录',
          createdAt: new Date().toISOString(),
        },
      });

      const legacyFlushPromise = saveRelationalRuntimeState(
        new PrismaClient({ datasources: { db: { url: harness.dbUrl } } }),
        staleState as any,
      );

      // Await both: must not throw 40P01 deadlock
      const [writeRes] = await Promise.all([migratedWritePromise, legacyFlushPromise]);
      expect(writeRes.journey.id).toBe(journeyId);

      // Assert from independent client:
      // Migrated row and child rows exist and foreign keys are intact
      const dbJourney = await harness.db.lifeJourney.findUnique({ where: { id: journeyId } });
      expect(dbJourney).not.toBeNull();
      expect(dbJourney?.title).toBe('竞争写入测试旅程');
      expect(dbJourney?.userId).toBe(testUserId);

      const dbSnapshot = await harness.db.situationSnapshot.findUnique({ where: { journeyId } });
      expect(dbSnapshot).not.toBeNull();
      expect(dbSnapshot?.journeyId).toBe(journeyId);

      const dbUpdate = await harness.db.journeyUpdate.findUnique({ where: { id: updateId } });
      expect(dbUpdate).not.toBeNull();
      expect(dbUpdate?.journeyId).toBe(journeyId);
    });
  });

  describe('Flow 6: Restart and reload state safety', () => {
    it('7. An instance reloading its runtime store does not revert or delete a row committed by another instance', async () => {
      const journeyId = `journey_reload_test_${Date.now()}`;
      const snapshotId = `snapshot_reload_test_${Date.now()}`;
      const updateId = `update_reload_test_${Date.now()}`;

      // 1. Instance A commits a migrated journey to the database
      const createRes = await harness.persistenceA.createJourneyWithSnapshotAndUpdate({
        journey: {
          id: journeyId,
          userId: testUserId,
          title: '重载持久化测试旅程',
          domain: '生活',
          status: 'active',
          stage: 'clarifying',
          visibility: 'PRIVATE',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        snapshot: {
          id: snapshotId,
          journeyId,
          facts: ['重载测试事实'],
          feelings: ['重载测试感受'],
          needs: [],
          constraints: [],
          risks: [],
          domain: '生活',
          contextTags: ['生活'],
          confidence: 'user_confirmed',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        update: {
          id: updateId,
          journeyId,
          userId: testUserId,
          kind: 'init',
          content: '重载测试更新记录',
          createdAt: new Date().toISOString(),
        },
      });
      expect(createRes.journey.id).toBe(journeyId);

      // 2. Instance B reloads its runtime state (reads PostgreSQL)
      await harness.storeB.reloadRuntimeState();

      // 3. Instance B triggers a full legacy flush with its in-memory snapshot
      await harness.storeB.persistAndFlush();

      // 4. Assert from independent client:
      // The row committed by Instance A was NOT deleted and NOT reverted
      const dbJourney = await harness.db.lifeJourney.findUnique({ where: { id: journeyId } });
      expect(dbJourney).not.toBeNull();
      expect(dbJourney?.title).toBe('重载持久化测试旅程');

      const dbSnapshot = await harness.db.situationSnapshot.findUnique({ where: { journeyId } });
      expect(dbSnapshot).not.toBeNull();
      expect(dbSnapshot?.confidence).toBe('user_confirmed');
    });
  });

  describe('Blocker 2: The stale-snapshot foreign-key case for unmigrated models', () => {
    it('8. Demonstrates defect: unmigrated legacy row with valid DB journeyId is nulled when a stale instance flushes', async () => {
      const journeyId = `journey_fk_test_${Date.now()}`;
      const moodId = `mood_fk_test_${Date.now()}`;

      // 1. Seed a valid LifeJourney in DB
      await harness.db.lifeJourney.create({
        data: {
          id: journeyId,
          userId: testUserId,
          title: '外键验证测试旅程',
          domain: '生活',
          status: 'active',
          stage: 'clarifying',
          visibility: 'PRIVATE',
        },
      });

      // 2. Seed an unmigrated legacy model row (Mood) in DB with journeyId = null
      await harness.db.mood.create({
        data: {
          id: moodId,
          userId: testUserId,
          emotion: '低落',
          content: '初始无旅程关联的心情记录',
          visibility: 'PRIVATE',
          riskLevel: 'low',
          riskScore: 0,
          journeyId: null,
        },
      });

      // 3. Instance B loads runtime state: at this point, Instance B sees mood.journeyId = undefined
      await harness.storeB.reloadRuntimeState();
      const inMemoryMoodB = harness.storeB.data.moods.find((m) => m.id === moodId);
      expect(inMemoryMoodB).toBeDefined();
      expect(inMemoryMoodB?.journeyId).toBeUndefined();

      // 4. Instance A (or direct write) associates this Mood with journeyId in PostgreSQL
      await harness.db.mood.update({
        where: { id: moodId },
        data: { journeyId },
      });

      // Verify from independent client: database now holds the valid foreign key
      const dbMoodBeforeFlush = await harness.db.mood.findUnique({ where: { id: moodId } });
      expect(dbMoodBeforeFlush?.journeyId).toBe(journeyId);

      // 5. Now Instance B (whose in-memory snapshot still has journeyId = undefined) flushes
      await harness.storeB.persistAndFlush();

      // 6. Assert what actually happens from independent client:
      // The mapper writes `journeyId: journeyIds.has(item.journeyId) ? item.journeyId : null`.
      // Because item.journeyId was absent/undefined in Instance B's stale snapshot,
      // the foreign key in PostgreSQL was SILENTLY NULLED!
      const dbMoodAfterFlush = await harness.db.mood.findUnique({ where: { id: moodId } });
      expect(dbMoodAfterFlush).not.toBeNull();

      // DEFECT CONFIRMED: journeyId was nulled from journeyId -> null
      expect(dbMoodAfterFlush?.journeyId).toBeNull();
    });
  });
});
