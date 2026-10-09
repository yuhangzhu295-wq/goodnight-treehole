import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createTwoInstanceHarness, type MultiInstanceContext } from './two-instance-harness';
import { saveRelationalRuntimeState } from '../../apps/api/src/relational-runtime.mapper';

class StrictBarrier {
  private parties = new Set<string>();
  private arrived = new Set<string>();
  private resolvers = new Map<string, () => void>();

  constructor(names: string[]) {
    for (const name of names) this.parties.add(name);
  }

  async enter(name: string, timeoutMs = 2500): Promise<void> {
    if (!this.parties.has(name)) throw new Error(`Unknown barrier party: ${name}`);
    this.arrived.add(name);
    if (this.arrived.size === this.parties.size) {
      for (const resolve of this.resolvers.values()) {
        resolve();
      }
      this.resolvers.clear();
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.resolvers.delete(name);
        reject(
          new Error(
            `StrictBarrier timeout: "${name}" arrived and waited ${timeoutMs}ms, but expected parties [${[...this.parties].join(', ')}]; arrived: [${[...this.arrived].join(', ')}]`,
          ),
        );
      }, timeoutMs);
      this.resolvers.set(name, () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  assertAllArrived(): void {
    for (const name of this.parties) {
      expect(this.arrived.has(name)).toBe(true);
    }
  }
}

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

      // Interleaving 1: SafetyEvent creation in-flight overlaps deleteJourneyArchive in-flight
      // StrictBarrier ensures both sides arrive mid-operation; neither can proceed unless both reach the barrier.
      const barrier1 = new StrictBarrier(['creationInFlight', 'archiveBeforeLock']);

      const creationPromise = harness.persistenceA.createSafetyEvent({
        id: safetyEventId,
        userId: testUserId,
        journeyId,
        level: 'high',
        source: 'crisis_hotline',
        action: 'EMERGENCY_SUPPORT',
        payload: { triggeredBy: 'high_distress_intent' },
        _onInFlight: async () => {
          await barrier1.enter('creationInFlight');
          // Hold the transaction open briefly so deleteJourneyArchive's lock attempt is blocked
          await new Promise((r) => setTimeout(r, 40));
        },
      });

      const archivePromise = harness.persistenceB.deleteJourneyArchive({
        journeyId,
        userId: testUserId,
        archiveRoute: `/pages/journey/detail?id=${journeyId}`,
        _onBeforeLock: async () => {
          await barrier1.enter('archiveBeforeLock');
        },
      });

      const [createdSafety, deleteRes] = await Promise.all([creationPromise, archivePromise]);
      barrier1.assertAllArrived();
      expect(createdSafety.id).toBe(safetyEventId);
      expect(deleteRes.deletedJourneyId).toBe(journeyId);

      // Assert from independent client:
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

      // Interleaving 2: Reverse race where deleteJourneyArchive is holding the lock in-flight
      // and creation attempts to attach to the in-flight deleted journey.
      const journey2Id = `journey_safety_race2_${Date.now()}`;
      await harness.db.lifeJourney.create({
        data: {
          id: journey2Id,
          userId: testUserId,
          title: '安全事件锁内删除测试旅程',
          domain: '生活',
          status: 'completed',
          stage: 'graduated',
          visibility: 'PRIVATE',
        },
      });

      const barrier2 = new StrictBarrier(['archiveLocked', 'createStarted']);

      const lockedArchivePromise = harness.persistenceB.deleteJourneyArchive({
        journeyId: journey2Id,
        userId: testUserId,
        archiveRoute: `/pages/journey/detail?id=${journey2Id}`,
        _onLockedJourney: async () => {
          await barrier2.enter('archiveLocked');
        },
      });

      const postDeleteEventId = `safety_post_del_${Date.now()}`;
      const racingCreationPromise = harness.persistenceA.createSafetyEvent({
        id: postDeleteEventId,
        userId: testUserId,
        journeyId: journey2Id,
        level: 'high',
        source: 'crisis_hotline',
        action: 'POST_DELETE_ATTEMPT',
        _onBeforeInsert: async () => {
          await barrier2.enter('createStarted');
        },
      });

      // Creation racing against in-flight deletion either rejects with FK violation or fails to attach
      const [archiveRes2, creationErr] = await Promise.allSettled([lockedArchivePromise, racingCreationPromise]);
      barrier2.assertAllArrived();
      expect(archiveRes2.status).toBe('fulfilled');
      expect(creationErr.status).toBe('rejected');

      const postDeleteRow = await harness.db.safetyEvent.findUnique({ where: { id: postDeleteEventId } });
      expect(postDeleteRow).toBeNull();
    });
  });

  describe('Flow 4: UserNotification multi-instance delivery and read idempotency', () => {
    it('5. Worker delivery retry overlapping mark-read preserves read state idempotently without reverting to unread', async () => {
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

      // 2. Initial delivery on Instance A establishes the notification row in 'unread' status
      const deliveryRes = await (harness.workerA as any).deliver(jobPayload);
      expect(deliveryRes.status).toBe('delivered');

      // 3. Concurrent race: Worker delivery retry on Instance A overlapping mark-read on Instance B.
      // StrictBarrier ensures both operations overlap in execution time.
      //
      // Since design A6 the retry cannot clobber the row at all: the claim is conditional on the job
      // still being pending, so a duplicate delivery short-circuits before it writes anything. The
      // race therefore overlaps the retry's claim attempt (not a notification write) with the
      // mark-read, and the assertion below checks the stronger property that follows: the retry is a
      // no-op AND the read state survives it.
      const barrier = new StrictBarrier(['deliveryRetryInTx', 'markReadInTx']);

      const retryDeliveryPromise = (harness.workerA as any).deliver({
        ...jobPayload,
        _onBeforeClaim: async () => {
          await barrier.enter('deliveryRetryInTx');
        },
      });

      const markReadPromise = harness.persistenceB.markNotificationRead(notificationId, testUserId, {
        _onInTransaction: async () => {
          await barrier.enter('markReadInTx');
        },
      });

      const [retryRes, readRes] = await Promise.all([retryDeliveryPromise, markReadPromise]);
      barrier.assertAllArrived();
      expect(retryRes.status).toBe('delivered');
      // The duplicate delivery found the job already claimed and wrote nothing.
      expect(retryRes.skipped).toBe(true);
      expect(retryRes.notificationId).toBeUndefined();
      expect(readRes.item.status).toBe('read');

      // 4. Assert from independent client:
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
        adminUsers: [
          {
            id: `admin_race_${Date.now()}`,
            username: `admin_${Date.now()}`,
            passwordHash: 'hashed_pw',
            displayName: 'Admin User',
            role: 'super_admin',
            status: 'active',
          },
        ],
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

      // StrictBarrier ensures both transactions demonstrably hold locks in PostgreSQL at the same time
      const barrier = new StrictBarrier(['migratedWriteLocked', 'legacyFlushLocked']);

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
        _onBeforeCommit: async () => {
          await barrier.enter('migratedWriteLocked');
        },
      });

      const legacyFlushPromise = saveRelationalRuntimeState(
        new PrismaClient({ datasources: { db: { url: harness.dbUrl } } }),
        staleState as any,
        {
          _onInTransaction: async () => {
            await barrier.enter('legacyFlushLocked');
          },
        },
      );

      // Await both: must not throw 40P01 deadlock
      const [writeRes] = await Promise.all([migratedWritePromise, legacyFlushPromise]);
      barrier.assertAllArrived();
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
    it('7. An instance reloading its runtime store during an open commit window does not revert or delete a row committed by another instance', async () => {
      const journeyId = `journey_reload_test_${Date.now()}`;
      const snapshotId = `snapshot_reload_test_${Date.now()}`;
      const updateId = `update_reload_test_${Date.now()}`;

      // StrictBarriers ensure reload occurs strictly inside Instance A's open commit window
      const startBarrier = new StrictBarrier(['commitWindowOpen', 'reloadBeforeLoad']);
      const finishBarrier = new StrictBarrier(['commitWindowHold', 'reloadAfterLoad']);

      // 1. Instance A starts committing a migrated journey with _onBeforeCommit barrier
      const createPromise = harness.persistenceA.createJourneyWithSnapshotAndUpdate({
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
        _onBeforeCommit: async () => {
          await startBarrier.enter('commitWindowOpen');
          await finishBarrier.enter('commitWindowHold');
        },
      });

      // 2. Instance B reloads its runtime state (reads PostgreSQL) strictly DURING Instance A's open commit window
      const reloadPromise = harness.storeB.reloadRuntimeState({
        _onBeforeLoad: async () => {
          await startBarrier.enter('reloadBeforeLoad');
        },
        _onAfterLoad: async () => {
          await finishBarrier.enter('reloadAfterLoad');
        },
      });

      const [createRes] = await Promise.all([createPromise, reloadPromise]);
      startBarrier.assertAllArrived();
      finishBarrier.assertAllArrived();
      expect(createRes.journey.id).toBe(journeyId);

      // 3. Instance B triggers a full legacy flush with its in-memory snapshot (which missed the uncommitted row)
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
    it('8. Distinguishes snapshot omission (survives) from explicit detach (null) for unmigrated legacy relations', async () => {
      const journeyId = `journey_fk_test_${Date.now()}`;
      const journey2Id = `journey_fk_test2_${Date.now()}`;
      const moodId = `mood_fk_test_${Date.now()}`;

      // 1. Seed valid LifeJourneys in DB
      await harness.db.lifeJourney.createMany({
        data: [
          {
            id: journeyId,
            userId: testUserId,
            title: '外键验证测试旅程',
            domain: '生活',
            status: 'active',
            stage: 'clarifying',
            visibility: 'PRIVATE',
          },
          {
            id: journey2Id,
            userId: testUserId,
            title: '外键切换测试旅程',
            domain: '生活',
            status: 'active',
            stage: 'clarifying',
            visibility: 'PRIVATE',
          },
        ],
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

      // 5. Stale snapshot case (undefined): Instance B flushes with mood.journeyId = undefined.
      // The committed foreign key in PostgreSQL MUST SURVIVE.
      await harness.storeB.persistAndFlush();

      const dbMoodAfterFlush = await harness.db.mood.findUnique({ where: { id: moodId } });
      expect(dbMoodAfterFlush).not.toBeNull();
      expect(dbMoodAfterFlush?.journeyId).toBe(journeyId);

      // 6. Explicit detach case (null): Instance B explicitly detaches by setting journeyId = null.
      // The update must write NULL to PostgreSQL.
      inMemoryMoodB!.journeyId = null as any;
      await harness.storeB.persistAndFlush();

      const dbMoodAfterDetach = await harness.db.mood.findUnique({ where: { id: moodId } });
      expect(dbMoodAfterDetach?.journeyId).toBeNull();

      // 7. Explicit update case (string): Instance B sets a valid journeyId.
      // The update must write the referenced journeyId.
      inMemoryMoodB!.journeyId = journey2Id;
      await harness.storeB.persistAndFlush();

      const dbMoodAfterUpdate = await harness.db.mood.findUnique({ where: { id: moodId } });
      expect(dbMoodAfterUpdate?.journeyId).toBe(journey2Id);
    });
  });
});
