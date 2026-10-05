import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApiTestApp, loginAdmin, auth } from './helpers';
import { StoreService } from '../../apps/api/src/store.service';
import { Batch1PersistenceService } from '../../apps/api/src/batch1-persistence.service';
import { saveRelationalRuntimeState } from '../../apps/api/src/relational-runtime.mapper';

describe('Batch 1 Sub-batch D: LifeJourney, SituationSnapshot, JourneyUpdate database authority and lifecycle', () => {
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

  it('1. Database-only read gate: LifeJourney, SituationSnapshot and JourneyUpdate inserted via fresh PrismaClient are read through affected paths and re-read from DB', async () => {
    const server = app.getHttpServer();
    const store = app.get(StoreService);
    const testUserId = store.getDemoUserId();
    const journeyId = `journey_gate_${Date.now()}`;
    const snapshotId = `snapshot_gate_${Date.now()}`;
    const updateId = `update_gate_${Date.now()}`;

    // Verify loud failure on store getters for migrated models
    expect(() => store.lifeJourneys).toThrow(/disabled/i);
    expect(() => (store as any).data.lifeJourneys).toThrow(/disabled/i);
    expect(() => store.situationSnapshots).toThrow(/disabled/i);
    expect(() => (store as any).data.situationSnapshots).toThrow(/disabled/i);
    expect(() => store.journeyUpdates).toThrow(/disabled/i);
    expect(() => (store as any).data.journeyUpdates).toThrow(/disabled/i);

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      // Pause any existing active journeys for this user so this one can be active
      await freshPrisma.lifeJourney.updateMany({
        where: { userId: testUserId, status: 'active' },
        data: { status: 'paused' },
      });

      // Insert directly into PostgreSQL via fresh PrismaClient without touching in-memory store
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId: testUserId,
          title: '数据库门禁专用旅程标题',
          domain: '生活',
          status: 'active',
          stage: 'clarifying',
          currentIntent: 'JUST_LISTEN',
          intentUpdatedAt: new Date(),
          initialIntensity: 6,
          intensity: 6,
          summary: '数据库门禁直接写入的总结内容',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.situationSnapshot.create({
        data: {
          id: snapshotId,
          journeyId,
          facts: ['事实1：直接写入数据库', '事实2：未经过内存数组'],
          feelings: ['感受1：沉重'],
          needs: ['需要1：被听见'],
          constraints: ['约束1：时间有限'],
          risks: ['风险1：暂无'],
          domain: '生活',
          subDomain: '工作压力',
          eventType: '职业变动',
          contextTags: ['工作', '生活'],
          confidence: 'user_confirmed',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.journeyUpdate.create({
        data: {
          id: updateId,
          journeyId,
          userId: testUserId,
          kind: 'created',
          content: '门禁测试创建记录内容',
          createdAt: new Date(),
        },
      });
    } finally {
      await freshPrisma.$disconnect();
    }

    // 1. Read through GET /api/v1/tonight (home read path)
    const tonightRes = await request(server).get('/api/v1/tonight').expect(200);
    expect(tonightRes.body.item.journey).not.toBeNull();
    expect(tonightRes.body.item.journey.id).toBe(journeyId);
    expect(tonightRes.body.item.journey.title).toBe('数据库门禁专用旅程标题');

    // 2. Read through GET /api/v1/journeys (user journey list)
    const listRes = await request(server).get('/api/v1/journeys').expect(200);
    const matched = listRes.body.items.find((item: any) => item.journey.id === journeyId);
    expect(matched).toBeDefined();
    expect(matched.journey.title).toBe('数据库门禁专用旅程标题');
    expect(matched.snapshot.facts).toContain('事实1：直接写入数据库');
    expect(matched.updates.some((u: any) => u.id === updateId)).toBe(true);

    // 3. Read through GET /api/v1/journeys/:id (journey detail)
    const detailRes = await request(server).get(`/api/v1/journeys/${journeyId}`).expect(200);
    expect(detailRes.body.item.journey.title).toBe('数据库门禁专用旅程标题');
    expect(detailRes.body.item.snapshot.subDomain).toBe('工作压力');
    expect(detailRes.body.item.updates.some((u: any) => u.id === updateId)).toBe(true);

    // 4. Read through GET /api/v1/journeys/:id/fingerprint (fingerprint read path)
    const fpRes = await request(server).get(`/api/v1/journeys/${journeyId}/fingerprint`).expect(200);
    expect(fpRes.body.item.journey.id).toBe(journeyId);
    expect(fpRes.body.item.snapshot.facts).toContain('事实1：直接写入数据库');

    // 5. Read through GET /api/v1/journeys/:id/timeline (timeline read path)
    const timelineRes = await request(server).get(`/api/v1/journeys/${journeyId}/timeline`).expect(200);
    expect(timelineRes.body.items.some((u: any) => u.id === updateId)).toBe(true);

    // 6. Admin read paths: admin journeys and overview
    const adminJourneysRes = await request(server)
      .get('/api/admin/v1/journeys')
      .set('authorization', auth(adminToken))
      .expect(200);
    const adminMatched = adminJourneysRes.body.items.find((item: any) => item.id === journeyId);
    expect(adminMatched).toBeDefined();
    expect(adminMatched.title).toBe('数据库门禁专用旅程标题');
    expect(adminMatched.updates).toBeGreaterThanOrEqual(1);

    const adminStatsRes = await request(server)
      .get('/api/admin/v1/dashboard/overview')
      .set('authorization', auth(adminToken))
      .expect(200);
    expect(adminStatsRes.body.item.journeySummary.total).toBeGreaterThanOrEqual(1);
    expect(adminStatsRes.body.item.journeySummary.active).toBeGreaterThanOrEqual(1);

    // 7. Re-read final row from an independent fresh PrismaClient
    const freshPrismaAfter = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const finalJourney = await freshPrismaAfter.lifeJourney.findUnique({ where: { id: journeyId } });
      const finalSnapshot = await freshPrismaAfter.situationSnapshot.findUnique({ where: { journeyId } });
      const finalUpdate = await freshPrismaAfter.journeyUpdate.findUnique({ where: { id: updateId } });

      expect(finalJourney?.title).toBe('数据库门禁专用旅程标题');
      expect(finalJourney?.summary).toBe('数据库门禁直接写入的总结内容');
      expect(finalSnapshot?.confidence).toBe('user_confirmed');
      expect(finalUpdate?.content).toBe('门禁测试创建记录内容');
    } finally {
      await freshPrismaAfter.$disconnect();
    }
  });

  it('2. User-confirmed content is never reverted: user confirmation interleaved with AI completion retains confirmed content in DB', async () => {
    const server = app.getHttpServer();
    const persistence = app.get(Batch1PersistenceService);
    const store = app.get(StoreService);
    const userId = store.getDemoUserId();

    // Create a journey
    const journeyTitle = `CONFIRM_JOURNEY_${Date.now()}`;
    const createRes = await request(server)
      .post('/api/v1/journeys')
      .send({ title: journeyTitle, domain: '生活', content: '初始生活困境描述' })
      .expect(201);
    const journeyId = createRes.body.journey.id as string;

    // User confirms the situation with explicit facts and needs
    const confirmedFacts = ['事实一：我已经和家人沟通过', '事实二：预算已经锁定'];
    const confirmedFeelings = ['感到踏实', '稍微松了口气'];
    const confirmRes = await request(server)
      .patch(`/api/v1/journeys/${journeyId}/situation`)
      .send({
        facts: confirmedFacts,
        feelings: confirmedFeelings,
        intensity: 4,
      })
      .expect(200);

    expect(confirmRes.body.item.confidence).toBe('user_confirmed');
    expect(confirmRes.body.item.facts).toEqual(confirmedFacts);

    // Simulate an interleaved AI completion callback that tries to overwrite with agent draft
    const aiJobPayload = {
      id: `job_interleaved_${Date.now()}`,
      userId,
      contentId: journeyId,
      contentType: 'LifeJourney',
      jobType: '处境分析',
      taskType: 'situation_analysis',
      style: 'rational' as const,
      providerId: 'provider_template',
      modelName: 'safe-template',
      status: 'succeeded' as const,
      promptSummary: 'AI尝试覆写用户确认内容',
      result: 'AI生成的备用总结',
      structuredResult: {
        facts: ['AI妄图覆写的事实X', 'AI妄图覆写的事实Y'],
        feelings: ['AI妄图覆写的感受Z'],
        summary: 'AI妄图覆写为草稿的总结',
        intensity: 9,
      },
      durationMs: 100,
      retryCount: 0,
      traceJson: [],
      routeVersion: 1,
      createdAt: new Date().toISOString(),
    };

    // Test interleaving at the CAS boundary: concurrent confirmSituation and AI completion
    const [concurrentConfirmRes, completionResult] = await Promise.all([
      store.confirmSituation(journeyId, {
        facts: confirmedFacts,
        feelings: confirmedFeelings,
        needs: ['需要：安静的生活节奏'],
        constraints: ['约束：无法立即辞职'],
        risks: ['风险：焦虑加剧'],
        intensity: 4,
      }),
      persistence.applySituationAnalysisAiCompletion({
        journeyId,
        userId,
        completedJob: aiJobPayload as any,
      }),
    ]);

    expect(concurrentConfirmRes.item.confidence).toBe('user_confirmed');
    // The AI write must be rejected at commit time because confidence === 'user_confirmed'
    expect(completionResult.applied).toBe(false);

    // Re-read directly from PostgreSQL via fresh PrismaClient to assert confirmed facts survived
    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const dbSnapshot = await freshPrisma.situationSnapshot.findUnique({ where: { journeyId } });
      expect(dbSnapshot?.confidence).toBe('user_confirmed');
      expect(dbSnapshot?.facts).toEqual(confirmedFacts);
      expect(dbSnapshot?.feelings).toEqual(confirmedFeelings);
      expect(dbSnapshot?.intensity).toBe(4);
    } finally {
      await freshPrisma.$disconnect();
    }
  });

  it('3. persistence-durability Defect 1 invariant: PATCH title and summary survives subsequent AI completion', async () => {
    const server = app.getHttpServer();
    const persistence = app.get(Batch1PersistenceService);
    const store = app.get(StoreService);
    const userId = store.getDemoUserId();

    const initialTitle = `DUR_JOURNEY_${Date.now()}`;
    const initialContent = '持久化耐久性验证内容';
    const created = await request(server)
      .post('/api/v1/journeys')
      .send({ title: initialTitle, domain: '生活', content: initialContent })
      .expect(201);
    const journeyId = created.body.journey.id as string;
    const initialUpdatedAt = created.body.journey.updatedAt;

    // PATCH journey title and summary
    const patchedTitle = `PATCHED_DUR_JOURNEY_${Date.now()}`;
    const patchedSummary = '用户明确确认的持久化总结内容';
    const patchRes = await request(server)
      .patch(`/api/v1/journeys/${journeyId}`)
      .send({ title: patchedTitle, summary: patchedSummary })
      .expect(200);

    expect(patchRes.body.item.title).toBe(patchedTitle);
    expect(patchRes.body.item.summary).toBe(patchedSummary);

    // Run AI completion with expectedJourneyUpdatedAt set to initialUpdatedAt (as captured at creation)
    await persistence.applySituationAnalysisAiCompletion({
      journeyId,
      userId,
      completedJob: {
        id: `job_ai_after_patch_${Date.now()}`,
        userId,
        contentId: journeyId,
        contentType: 'LifeJourney',
        jobType: '处境分析',
        taskType: 'situation_analysis',
        style: 'rational',
        providerId: 'provider_template',
        modelName: 'safe-template',
        status: 'succeeded',
        promptSummary: 'AI完成处理',
        result: 'AI回退总结：不应覆盖用户PATCH的内容',
        structuredResult: {
          summary: 'AI生成的总结：决不能覆写用户已确认的内容',
          title: 'AI生成的标题',
        },
        durationMs: 50,
        retryCount: 0,
        traceJson: [],
        routeVersion: 1,
        createdAt: new Date().toISOString(),
      } as any,
      expectedJourneyUpdatedAt: initialUpdatedAt,
    });

    // Verify in PostgreSQL that the user-patched title and summary were NOT overwritten
    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const persistedRecord = await freshPrisma.lifeJourney.findUnique({ where: { id: journeyId } });
      expect(persistedRecord?.title).toBe(patchedTitle);
      expect(persistedRecord?.summary).toBe(patchedSummary);
    } finally {
      await freshPrisma.$disconnect();
    }
  });

  it('4. Two writers lose no field: concurrent PATCHes to the same Journey do not lose either writer field', async () => {
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/api/v1/journeys')
      .send({ title: `BASE_CONCUR_${Date.now()}`, domain: '生活', content: '初始内容' })
      .expect(201);
    const journeyId = created.body.journey.id as string;

    const writer1Title = `CONCURRENT_WRITER1_TITLE_${Date.now()}`;
    const writer2Summary = `CONCURRENT_WRITER2_SUMMARY_${Date.now()}`;

    // Writer 1 PATCHes only title; Writer 2 PATCHes only summary
    const [res1, res2] = await Promise.all([
      request(server).patch(`/api/v1/journeys/${journeyId}`).send({ title: writer1Title }),
      request(server).patch(`/api/v1/journeys/${journeyId}`).send({ summary: writer2Summary }),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Read directly from PostgreSQL: both writer 1's title and writer 2's summary must be preserved
    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const finalRow = await freshPrisma.lifeJourney.findUnique({ where: { id: journeyId } });
      expect(finalRow).not.toBeNull();
      expect(finalRow?.title).toBe(writer1Title);
      expect(finalRow?.summary).toBe(writer2Summary);

      // In addition: conflicting PATCHes to the SAME field with expectedUpdatedAt enforce CAS (409 Conflict)
      const versionBeforeConflict = finalRow!.updatedAt.toISOString();

      const [casRes1, casRes2] = await Promise.all([
        request(server).patch(`/api/v1/journeys/${journeyId}`).send({
          title: `CAS_WINNER_${Date.now()}`,
          expectedUpdatedAt: versionBeforeConflict,
        }),
        request(server).patch(`/api/v1/journeys/${journeyId}`).send({
          title: `CAS_LOSER_${Date.now()}`,
          expectedUpdatedAt: versionBeforeConflict,
        }),
      ]);

      const statuses = [casRes1.status, casRes2.status].sort();
      expect(statuses).toEqual([200, 409]);
    } finally {
      await freshPrisma.$disconnect();
    }
  });

  it('5. Journey single-active: two concurrent restores for the same user do not both end up active', async () => {
    const server = app.getHttpServer();
    const store = app.get(StoreService);
    const userId = store.getDemoUserId();

    // Create two journeys for the demo user
    const j1Res = await request(server)
      .post('/api/v1/journeys')
      .send({ title: `J1_RESTORE_${Date.now()}`, domain: '生活', content: '旅程1' })
      .expect(201);
    const j2Res = await request(server)
      .post('/api/v1/journeys')
      .send({ title: `J2_RESTORE_${Date.now()}`, domain: '生活', content: '旅程2' })
      .expect(201);

    const j1Id = j1Res.body.journey.id as string;
    const j2Id = j2Res.body.journey.id as string;

    // Archive both journeys via direct DB update
    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.lifeJourney.updateMany({
        where: { id: { in: [j1Id, j2Id] } },
        data: { status: 'archived' },
      });
      // Ensure no active journey remains for this user before testing concurrent restore
      await freshPrisma.lifeJourney.updateMany({
        where: { userId, status: 'active' },
        data: { status: 'paused' },
      });
    } finally {
      await freshPrisma.$disconnect();
    }

    // Concurrently trigger restore for both archived journeys
    const [result1, result2] = await Promise.allSettled([
      request(server).post(`/api/v1/archive/journeys/${j1Id}/restore`),
      request(server).post(`/api/v1/archive/journeys/${j2Id}/restore`),
    ]);

    const statuses = [
      result1.status === 'fulfilled' ? result1.value.status : null,
      result2.status === 'fulfilled' ? result2.value.status : null,
    ];

    // Exactly one should succeed (201), the other should fail (400)
    expect(statuses).toContain(201);
    expect(statuses).toContain(400);

    // Assert database state: exactly ONE of the two journeys is active
    const checkPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const activeJourneys = await checkPrisma.lifeJourney.findMany({
        where: { id: { in: [j1Id, j2Id] }, status: 'active' },
      });
      expect(activeJourneys.length).toBe(1);

      // Create vs restore invariant: while an active journey exists, restore is rejected
      const theArchivedId = activeJourneys[0].id === j1Id ? j2Id : j1Id;
      const rejectRestore = await request(server).post(`/api/v1/archive/journeys/${theArchivedId}/restore`);
      expect(rejectRestore.status).toBe(400);
      expect(rejectRestore.body.message).toContain('请先结束或暂停当前旅程，再恢复这段归档');
    } finally {
      await checkPrisma.$disconnect();
    }
  });

  it('6. Legacy FK preservation: a legacy flush must not null the journeyId of legacy models and must not delete the Journey', async () => {
    const store = app.get(StoreService);
    const userId = store.getDemoUserId();
    const journeyId = `fk_preserve_journey_${Date.now()}`;
    const moodId = `fk_mood_${Date.now()}`;
    const postId = `fk_post_${Date.now()}`;
    const diaryId = `fk_diary_${Date.now()}`;
    const peerExpId = `fk_peerexp_${Date.now()}`;
    const decisionId = `fk_decision_${Date.now()}`;
    const followUpId = `fk_followup_${Date.now()}`;
    const safetyId = `fk_safety_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      // 1. Insert Journey directly in PostgreSQL
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId,
          title: 'FK保护验证旅程',
          domain: '生活',
          status: 'active',
          stage: 'clarifying',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // Also ensure the user exists in DB for foreign key checks
      await freshPrisma.user.upsert({
        where: { id: userId },
        create: {
          id: userId,
          openid: 'test_openid_fk',
          nickname: 'Demo',
          anonymousCode: 'demo_fk',
          status: 'normal',
        },
        update: {},
      });

      // Insert SafetyEvent in PostgreSQL (SafetyEvent is database-authoritative since sub-batch B)
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

      // 2. Trigger a legacy flush simulating another API instance running saveRelationalRuntimeState
      // with in-memory records pointing to journeyId, while lifeJourneys is NOT loaded in that instance
      const testState = {
        users: [
          {
            id: userId,
            openid: 'test_openid_fk',
            nickname: 'Demo',
            anonymousCode: 'demo_fk',
            status: 'normal',
            createdAt: new Date().toISOString(),
          },
        ],
        lifeJourneys: [], // LifeJourney is database-authoritative so it is not in the legacy array
        moods: [
          {
            id: moodId,
            userId,
            emotion: '焦虑',
            content: '关联到旅程的心情内容',
            visibility: 'PRIVATE',
            riskLevel: 'low',
            riskScore: 0,
            status: 'active',
            journeyId,
            createdAt: new Date().toISOString(),
          },
        ],
        posts: [
          {
            id: postId,
            moodId,
            userId,
            emotion: '焦虑',
            content: '关联到旅程的帖子内容',
            visibility: 'PUBLIC',
            status: 'active',
            reviewStatus: 'published',
            hugCount: 0,
            replyCount: 0,
            favoriteCount: 0,
            reportCount: 0,
            journeyId,
            createdAt: new Date().toISOString(),
          },
        ],
        diaries: [
          {
            id: diaryId,
            userId,
            moodId,
            journeyId,
            emotion: '焦虑',
            content: '关联到旅程的日记内容',
            hasLetter: false,
            createdAt: new Date().toISOString(),
          },
        ],
        peerExperiences: [
          {
            id: peerExpId,
            userId,
            journeyId,
            title: '同路经验',
            domain: '生活',
            stage: 'graduated',
            content: '内容',
            tags: [],
            status: 'published',
            consentedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        decisionRecords: [
          {
            id: decisionId,
            userId,
            journeyId,
            question: '关联到旅程的决策问题',
            options: ['选项A', '选项B'],
            criteria: ['标准1'],
            status: 'draft',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        followUpJobs: [
          {
            id: followUpId,
            userId,
            journeyId,
            kind: 'action_checkin',
            dueAt: new Date(Date.now() + 86400000).toISOString(),
            status: 'pending',
            createdAt: new Date().toISOString(),
          },
        ],
        safetyEvents: [], // Stale snapshot does not hold the direct-written SafetyEvent
      };
      await saveRelationalRuntimeState(freshPrisma, testState);

      // 3. Assert with fresh client: journeyId on every model is preserved and Journey was NOT deleted
      const checkPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
      try {
        const dbJourney = await checkPrisma.lifeJourney.findUnique({ where: { id: journeyId } });
        expect(dbJourney).not.toBeNull();
        expect(dbJourney?.id).toBe(journeyId);

        const dbMood = await checkPrisma.mood.findUnique({ where: { id: moodId } });
        expect(dbMood?.journeyId).toBe(journeyId);

        const dbPost = await checkPrisma.post.findUnique({ where: { id: postId } });
        expect(dbPost?.journeyId).toBe(journeyId);

        const dbDiary = await checkPrisma.diary.findUnique({ where: { id: diaryId } });
        expect(dbDiary?.journeyId).toBe(journeyId);

        const dbPeer = await checkPrisma.peerExperience.findUnique({ where: { id: peerExpId } });
        expect(dbPeer?.journeyId).toBe(journeyId);

        const dbDecision = await checkPrisma.decisionRecord.findUnique({ where: { id: decisionId } });
        expect(dbDecision?.journeyId).toBe(journeyId);

        const dbFollowUp = await checkPrisma.followUpJob.findUnique({ where: { id: followUpId } });
        expect(dbFollowUp?.journeyId).toBe(journeyId);

        const dbSafety = await checkPrisma.safetyEvent.findUnique({ where: { id: safetyId } });
        expect(dbSafety?.journeyId).toBe(journeyId);
      } finally {
        await checkPrisma.$disconnect();
      }
    } finally {
      await freshPrisma.$disconnect();
    }
  });

  it('7. Archive deletion: deletes only the agreed objects and detaches the rest', async () => {
    const server = app.getHttpServer();
    const store = app.get(StoreService);
    const persistence = app.get(Batch1PersistenceService);
    const userId = store.getDemoUserId();
    const journeyId = `del_archive_j_${Date.now()}`;
    const snapshotId = `del_archive_snap_${Date.now()}`;
    const updateId = `del_archive_up_${Date.now()}`;
    const moodId = `del_attach_mood_${Date.now()}`;
    const diaryId = `del_attach_diary_${Date.now()}`;
    const safetyId = `del_attach_safety_${Date.now()}`;
    const decisionId = `del_attach_dec_${Date.now()}`;

    // 1. Create journey and children directly in DB
    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId,
          title: '待删除归档旅程',
          domain: '生活',
          status: 'archived',
          stage: 'clarifying',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await freshPrisma.situationSnapshot.create({
        data: {
          id: snapshotId,
          journeyId,
          facts: ['归档事实'],
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
          kind: 'created',
          content: '归档进展内容',
          createdAt: new Date(),
        },
      });

      // Attach legacy models that should survive detached
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

      await freshPrisma.decisionRecord.create({
        data: {
          id: decisionId,
          userId,
          journeyId,
          question: '应保留的决定',
          options: ['A'],
          criteria: ['C'],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } finally {
      await freshPrisma.$disconnect();
    }

    // Call deleteJourneyArchive directly on persistence to test the exact detachment/deletion transaction
    const archiveRoute = `/pages/journey/detail?id=${journeyId}`;
    const delRes = await persistence.deleteJourneyArchive({
      journeyId,
      userId,
      actionIds: [],
      archiveRoute,
    });

    expect(delRes.deletedJourneyId).toBe(journeyId);

    // Verify in PostgreSQL: agreed objects deleted, attached objects detached
    const checkPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const deletedJourney = await checkPrisma.lifeJourney.findUnique({ where: { id: journeyId } });
      expect(deletedJourney).toBeNull();

      const deletedSnapshot = await checkPrisma.situationSnapshot.findFirst({ where: { journeyId } });
      expect(deletedSnapshot).toBeNull();

      const deletedUpdates = await checkPrisma.journeyUpdate.findMany({ where: { journeyId } });
      expect(deletedUpdates.length).toBe(0);

      // Attached models MUST SURVIVE with journeyId = null
      const survivingMood = await checkPrisma.mood.findUnique({ where: { id: moodId } });
      expect(survivingMood).not.toBeNull();
      expect(survivingMood?.journeyId).toBeNull();

      const survivingDiary = await checkPrisma.diary.findUnique({ where: { id: diaryId } });
      expect(survivingDiary).not.toBeNull();
      expect(survivingDiary?.journeyId).toBeNull();

      const survivingSafety = await checkPrisma.safetyEvent.findUnique({ where: { id: safetyId } });
      expect(survivingSafety).not.toBeNull();
      expect(survivingSafety?.journeyId).toBeNull();

      const survivingDecision = await checkPrisma.decisionRecord.findUnique({ where: { id: decisionId } });
      expect(survivingDecision).not.toBeNull();
      expect(survivingDecision?.journeyId).toBeNull();
    } finally {
      await checkPrisma.$disconnect();
    }
  });
});
