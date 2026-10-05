import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApiTestApp, loginAdmin, auth } from './helpers';
import { StoreService } from '../../apps/api/src/store.service';
import { Batch1PersistenceService } from '../../apps/api/src/batch1-persistence.service';
import { MonthlyReportService } from '../../apps/api/src/monthly-report.service';
import {
  RemoteAiProviderService,
  RemoteProviderError,
  DAPI_PROVIDER_ID,
} from '../../apps/api/src/remote-ai-provider.service';
import { saveRelationalRuntimeState } from '../../apps/api/src/relational-runtime.mapper';
import { DIRECT_DB_MODELS } from '../../apps/api/src/direct-db-models';

describe('Batch 1 Sub-batch C: AIJob database authority and lifecycle', () => {
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

  it('1. Database-only read gate: row inserted via fresh PrismaClient is read via API and re-read from DB', async () => {
    const server = app.getHttpServer();
    const store = app.get(StoreService);
    const testUserId = store.getDemoUserId();
    const jobId = `job_gate_${Date.now()}`;

    // Verify loud failure on store.aiJobs getter and store.data.aiJobs
    expect(() => store.aiJobs).toThrow(/disabled|deprecated/i);
    expect(() => (store as any).data.aiJobs).toThrow(/disabled/i);

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      // Ensure provider exists in DB
      await freshPrisma.aIProvider.upsert({
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

      // Insert AIJob directly via fresh PrismaClient
      await freshPrisma.aIJob.create({
        data: {
          id: jobId,
          userId: testUserId,
          contentId: `content_${jobId}`,
          contentType: 'Mood',
          jobType: '情绪拆解',
          taskType: 'negative_rewrite',
          style: 'rational',
          providerId: 'provider_template',
          modelName: 'safe-template',
          status: 'succeeded',
          promptSummary: '数据库门禁专用提示词总结',
          result: '这是直接写入PostgreSQL的AI成功生成结果',
          structuredResult: { summary: '结构化拆解结果' },
          durationMs: 42,
          retryCount: 0,
          fallbackUsed: false,
          routeVersion: 1,
          traceJson: [
            {
              event: 'memory-context',
              memoryIds: ['mem_test_gate_1'],
              at: new Date().toISOString(),
            },
            {
              event: 'terminal',
              status: 'succeeded',
              durationMs: 42,
            },
          ],
          createdAt: new Date(),
          completedAt: new Date(),
        },
      });
    } finally {
      await freshPrisma.$disconnect();
    }

    // Path A: User AI task status endpoint (GET /api/v1/ai/tasks/:id)
    const taskStatusRes = await request(server)
      .get(`/api/v1/ai/tasks/${jobId}`)
      .set('x-goodnight-user-id', testUserId)
      .expect(200);

    expect(taskStatusRes.body.jobId).toBe(jobId);
    expect(taskStatusRes.body.status).toBe('succeeded');
    expect(taskStatusRes.body.result).toBe('这是直接写入PostgreSQL的AI成功生成结果');

    // Path B: User AI task latest endpoint (GET /api/v1/ai/tasks/latest?taskType=negative_rewrite)
    const latestRes = await request(server)
      .get('/api/v1/ai/tasks/latest')
      .query({ taskType: 'negative_rewrite' })
      .set('x-goodnight-user-id', testUserId)
      .expect(200);

    expect(latestRes.body.jobId).toBe(jobId);
    expect(latestRes.body.result).toBe('这是直接写入PostgreSQL的AI成功生成结果');

    // Path C: Admin AI jobs list endpoint (GET /api/admin/v1/ai/jobs)
    const adminJobsRes = await request(server)
      .get('/api/admin/v1/ai/jobs')
      .set('Authorization', auth(adminToken))
      .query({ page: 1, pageSize: 50 })
      .expect(200);

    const foundInAdminList = adminJobsRes.body.items?.find((item: any) => item.id === jobId);
    expect(foundInAdminList).toBeDefined();
    expect(foundInAdminList.id).toBe(jobId);
    expect(foundInAdminList.result).toBe('这是直接写入PostgreSQL的AI成功生成结果');

    // Path D: Admin AI job detail endpoint (GET /api/admin/v1/ai/jobs/:id)
    const adminJobDetailRes = await request(server)
      .get(`/api/admin/v1/ai/jobs/${jobId}`)
      .set('Authorization', auth(adminToken))
      .expect(200);

    expect(adminJobDetailRes.body.item).toBeDefined();
    expect(adminJobDetailRes.body.item.id).toBe(jobId);
    expect(adminJobDetailRes.body.item.status).toBe('succeeded');

    // Path E: Admin overview dashboard (GET /api/admin/v1/dashboard/overview)
    const overviewRes = await request(server)
      .get('/api/admin/v1/dashboard/overview')
      .set('Authorization', auth(adminToken))
      .expect(200);

    expect(overviewRes.body.item.aiSummary.total).toBeGreaterThanOrEqual(1);
    expect(overviewRes.body.item.aiSummary.succeeded).toBeGreaterThanOrEqual(1);

    // Path F: Tool save endpoint reads job from database (POST /api/v1/tools/emotion-decompose/:taskId/save)
    const saveDecomposeRes = await request(server)
      .post(`/api/v1/tools/emotion-decompose/${jobId}/save`)
      .set('x-goodnight-user-id', testUserId)
      .expect(201);

    expect(saveDecomposeRes.body.ok).toBe(true);

    // Path G: Memory alias reads usages from database (GET /api/v1/me/memories)
    store.privacySettings[testUserId] = {
      ...(store.privacySettings[testUserId] ?? {}),
      allowLongTermMemory: true,
    } as any;
    await store.saveMemory(
      {
        category: '工作',
        title: '门禁记忆测试',
        content: '门禁记忆内容',
        scope: 'all_ai',
        source: 'user_saved',
      },
      testUserId,
    );
    const memory = store.memoryList(true, testUserId)[0];
    if (memory) {
      // Point the DB job trace to this memory
      const freshPrismaTrace = new PrismaClient({ datasources: { db: { url: dbUrl } } });
      try {
        await freshPrismaTrace.aIJob.update({
          where: { id: jobId },
          data: {
            traceJson: [
              {
                event: 'memory-context',
                memoryIds: [memory.id],
                at: new Date().toISOString(),
              },
            ],
          },
        });
      } finally {
        await freshPrismaTrace.$disconnect();
      }

      const memoriesRes = await request(server)
        .get('/api/v1/me/memories')
        .set('x-goodnight-user-id', testUserId)
        .expect(200);

      const targetMem = memoriesRes.body.items?.find((m: any) => m.id === memory.id);
      expect(targetMem).toBeDefined();
      expect(targetMem.usages.some((u: any) => u.jobId === jobId)).toBe(true);
    }

    // Re-read row from database with a fresh client
    const freshPrismaVerify = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const dbRow = await freshPrismaVerify.aIJob.findUnique({ where: { id: jobId } });
      expect(dbRow).not.toBeNull();
      expect(dbRow?.id).toBe(jobId);
      expect(dbRow?.status).toBe('succeeded');
    } finally {
      await freshPrismaVerify.$disconnect();
    }
  });

  it('2. Lifecycle ordering: job is committed queued before external call, running while executing, and terminal state is written by id under condition', async () => {
    const store = app.get(StoreService);
    const remoteAi = app.get(RemoteAiProviderService);
    const testUserId = store.getDemoUserId();

    // Enable primary provider for the duration of this lifecycle test
    const primaryProv = store.aiProviders.find((p) => p.id === DAPI_PROVIDER_ID);
    const prevEnabled = primaryProv?.enabled;
    if (primaryProv) primaryProv.enabled = true;

    let committedRunningObservedDuringExternalCall = false;

    // Spy on remoteAi.generate: when called, inspect database from fresh client to verify running row exists!
    const generateSpy = vi.spyOn(remoteAi, 'generate').mockImplementation(async (provider, input) => {
      const freshClient = new PrismaClient({ datasources: { db: { url: dbUrl } } });
      try {
        const runningRow = await freshClient.aIJob.findFirst({
          where: {
            userId: testUserId,
            status: 'running',
            promptSummary: { contains: '生命周期排序验证测试' },
          },
        });
        if (runningRow) {
          committedRunningObservedDuringExternalCall = true;
        }
      } finally {
        await freshClient.$disconnect();
      }
      return {
        model: 'deepseek-chat',
        result: '外部远程调用成功生成的回复内容',
        durationMs: 50,
      };
    });

    try {
      const queuedJob = store.queueAiJob({
        userId: testUserId,
        contentId: `lifecycle_${Date.now()}`,
        contentType: 'Letter',
        jobType: '信件回复',
        taskType: 'today_letter',
        style: 'warm',
        promptSummary: '生命周期排序验证测试内容',
      });

      // Immediately assert that row is queued in database via fresh client
      await store.awaitJobCommit(queuedJob.id);
      const freshClientInit = new PrismaClient({ datasources: { db: { url: dbUrl } } });
      try {
        const initialRow = await freshClientInit.aIJob.findUnique({ where: { id: queuedJob.id } });
        expect(initialRow).not.toBeNull();
        expect(['queued', 'running'].includes(initialRow?.status as string)).toBe(true);
      } finally {
        await freshClientInit.$disconnect();
      }

      // Await terminal state from database
      const completed = await store.waitForAiJob(queuedJob.id);
      expect(completed.status).toBe('succeeded');
      expect(committedRunningObservedDuringExternalCall).toBe(true);

      // Verify final terminal row in database with fresh client
      const freshClientFinal = new PrismaClient({ datasources: { db: { url: dbUrl } } });
      try {
        const finalRow = await freshClientFinal.aIJob.findUnique({ where: { id: queuedJob.id } });
        expect(finalRow).not.toBeNull();
        expect(finalRow?.status).toBe('succeeded');
        expect(finalRow?.result).toContain('外部远程调用成功生成的回复内容');
        expect(finalRow?.completedAt).not.toBeNull();
      } finally {
        await freshClientFinal.$disconnect();
      }
    } finally {
      generateSpy.mockRestore();
      if (primaryProv && prevEnabled !== undefined) primaryProv.enabled = prevEnabled;
    }
  });

  it('3. Single terminal state under concurrency: two instances racing the same job produce exactly one terminal state', async () => {
    const persistence = app.get(Batch1PersistenceService);
    const store = app.get(StoreService);
    const testUserId = store.getDemoUserId();
    const jobId = `job_race_${Date.now()}`;

    // Create a running AIJob directly in database
    await persistence.createAiJob({
      id: jobId,
      userId: testUserId,
      contentId: `race_${jobId}`,
      contentType: 'Situation',
      jobType: '处境分析',
      taskType: 'situation_analysis',
      style: 'rational',
      status: 'running',
      promptSummary: '并发竞态测试',
    });

    // Two racers attempt to write terminal state with different outcomes concurrently
    const racer1 = persistence.updateJobTerminal({
      id: jobId,
      status: 'succeeded',
      result: '优胜者1的结果',
      durationMs: 100,
    });

    const racer2 = persistence.updateJobTerminal({
      id: jobId,
      status: 'fallback',
      result: '优胜者2的兜底结果',
      durationMs: 200,
    });

    const [res1, res2] = await Promise.all([racer1, racer2]);

    // Exactly one racer updated the row under the status condition where status in ['queued', 'running']
    const updatedCount = (res1.updated ? 1 : 0) + (res2.updated ? 1 : 0);
    expect(updatedCount).toBe(1);

    // Verify DB row with fresh client
    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const dbRow = await freshPrisma.aIJob.findUnique({ where: { id: jobId } });
      expect(dbRow).not.toBeNull();
      expect(['succeeded', 'fallback'].includes(dbRow?.status as string)).toBe(true);

      if (res1.updated) {
        expect(dbRow?.status).toBe('succeeded');
        expect(dbRow?.result).toBe('优胜者1的结果');
      } else {
        expect(dbRow?.status).toBe('fallback');
        expect(dbRow?.result).toBe('优胜者2的兜底结果');
      }
    } finally {
      await freshPrisma.$disconnect();
    }
  });

  it('4. Injected 402: normal task persists fallback, Peer assist persists failed, error and trace persisted', async () => {
    const store = app.get(StoreService);
    const remoteAi = app.get(RemoteAiProviderService);
    const testUserId = store.getDemoUserId();

    // Enable primary provider so candidate is not skipped as provider-unavailable
    const primaryProv = store.aiProviders.find((p) => p.id === DAPI_PROVIDER_ID);
    const prevEnabled = primaryProv?.enabled;
    if (primaryProv) primaryProv.enabled = true;

    // Inject remote provider error returning fixed HTTP 402 (Payment Required, non-failover)
    const fixed402Error = new RemoteProviderError(
      'HTTP 402 Payment Required: insufficient account balance',
      402,
      false,
    );
    const generateSpy = vi.spyOn(remoteAi, 'generate').mockRejectedValue(fixed402Error);

    try {
      // 4a. Normal task (situation_analysis) under 402 must persist terminal state 'fallback'
      const normalJob = store.queueAiJob({
        userId: testUserId,
        contentId: `normal_402_${Date.now()}`,
        contentType: 'Situation',
        jobType: '处境分析',
        taskType: 'situation_analysis',
        style: 'rational',
        promptSummary: '402正常任务兜底验证',
      });

      const normalCompleted = await store.waitForAiJob(normalJob.id);
      expect(normalCompleted.status).toBe('fallback');
      expect(normalCompleted.fallbackUsed).toBe(true);
      expect(normalCompleted.errorMessage).toContain('402');

      // Verify normal task DB row directly
      const freshPrismaNormal = new PrismaClient({ datasources: { db: { url: dbUrl } } });
      try {
        const row = await freshPrismaNormal.aIJob.findUnique({ where: { id: normalJob.id } });
        expect(row).not.toBeNull();
        expect(row?.status).toBe('fallback');
        expect(row?.fallbackUsed).toBe(true);
        expect(row?.errorMessage).toContain('402');
        expect(row?.result).toBeTruthy(); // safe template fallback text
        const traces = row?.traceJson as Array<any>;
        expect(traces.some((t) => t.event === 'terminal' && t.status === 'fallback')).toBe(true);
      } finally {
        await freshPrismaNormal.$disconnect();
      }

      // 4b. Peer assist task (peer_response_assist) under 402 must persist terminal state 'failed'
      const peerJob = store.queueAiJob({
        userId: testUserId,
        contentId: `peer_402_${Date.now()}`,
        contentType: 'PeerConversation',
        jobType: '同伴回复协助',
        taskType: 'peer_response_assist',
        style: 'warm',
        promptSummary: '402同伴协助失败验证',
      });

      const peerCompleted = await store.waitForAiJob(peerJob.id);
      expect(peerCompleted.status).toBe('failed');
      expect(peerCompleted.fallbackUsed).toBe(false);
      expect(peerCompleted.errorMessage).toContain('402');

      // Verify peer task DB row directly
      const freshPrismaPeer = new PrismaClient({ datasources: { db: { url: dbUrl } } });
      try {
        const row = await freshPrismaPeer.aIJob.findUnique({ where: { id: peerJob.id } });
        expect(row).not.toBeNull();
        expect(row?.status).toBe('failed');
        expect(row?.fallbackUsed).toBe(false);
        expect(row?.errorMessage).toContain('402');
        const traces = row?.traceJson as Array<any>;
        expect(traces.some((t) => t.event === 'terminal' && t.status === 'failed')).toBe(true);
      } finally {
        await freshPrismaPeer.$disconnect();
      }

      // 4c. Verify that a terminal commit failure cannot let the waiter announce success from stale memory array
      const persistence = app.get(Batch1PersistenceService);
      const brokenJobId = `broken_commit_${Date.now()}`;
      await persistence.createAiJob({
        id: brokenJobId,
        userId: testUserId,
        contentId: brokenJobId,
        contentType: 'Letter',
        jobType: '信件回复',
        taskType: 'today_letter',
        style: 'warm',
        status: 'running',
        promptSummary: '提交失败测试',
      });

      // Pass an invalid enum value to updateJobTerminal without mocking:
      // Prisma / PostgreSQL rejects it through the real database execution path!
      await expect(
        persistence.updateJobTerminal({
          id: brokenJobId,
          status: 'invalid_terminal_status' as any,
          result: '假装成功',
        }),
      ).rejects.toThrow();

      // Check fresh client: DB row is still running, not succeeded
      const freshPrismaBroken = new PrismaClient({ datasources: { db: { url: dbUrl } } });
      try {
        const row = await freshPrismaBroken.aIJob.findUnique({ where: { id: brokenJobId } });
        expect(row?.status).toBe('running');
      } finally {
        await freshPrismaBroken.$disconnect();
      }

      // Prove waiter cannot announce success: times out and rejects
      await expect(store.waitForAiJob(brokenJobId, 300)).rejects.toThrow(/did not finish/);
    } finally {
      generateSpy.mockRestore();
      if (primaryProv && prevEnabled !== undefined) primaryProv.enabled = prevEnabled;
    }
  });

  it('5. FK/reference preservation: a legacy flush must not null a Letter/Reply/AgentDecisionLog aiJobId nor delete the AIJob', async () => {
    const store = app.get(StoreService);
    const testUserId = store.getDemoUserId();
    const jobId = `job_fk_${Date.now()}`;
    const moodId = `mood_fk_${Date.now()}`;
    const letterId = `letter_fk_${Date.now()}`;
    const postId = `post_fk_${Date.now()}`;
    const replyId = `reply_fk_${Date.now()}`;
    const logId = `agent_dec_fk_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.aIProvider.upsert({
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

      // 1. Insert AIJob directly
      await freshPrisma.aIJob.create({
        data: {
          id: jobId,
          userId: testUserId,
          contentId: `content_${jobId}`,
          contentType: 'Letter',
          jobType: '信件回复',
          taskType: 'today_letter',
          style: 'warm',
          providerId: 'provider_template',
          modelName: 'safe-template',
          status: 'succeeded',
          promptSummary: '外键测试提示词',
          result: '外键测试AI回复',
          durationMs: 10,
          retryCount: 0,
          fallbackUsed: false,
          routeVersion: 1,
          traceJson: [],
        },
      });

      // 2. Insert Letter referencing aiJobId
      await freshPrisma.letter.create({
        data: {
          id: letterId,
          userId: testUserId,
          style: 'warm',
          title: '外键测试信件',
          content: '信件内容',
          aiJobId: jobId,
        },
      });

      // 3. Insert Mood, Post and Reply referencing aiJobId
      await freshPrisma.mood.create({
        data: {
          id: moodId,
          userId: testUserId,
          emotion: '焦虑',
          content: '心情内容',
          visibility: 'PUBLIC',
          riskLevel: 'low',
          riskScore: 0,
        },
      });

      await freshPrisma.post.create({
        data: {
          id: postId,
          moodId,
          userId: testUserId,
          emotion: '焦虑',
          content: '帖子内容',
          visibility: 'PUBLIC',
        },
      });
      await freshPrisma.reply.create({
        data: {
          id: replyId,
          postId,
          userId: testUserId,
          type: 'AI',
          style: 'warm',
          content: 'AI回复内容',
          riskLevel: 'low',
          aiJobId: jobId,
        },
      });

      // 4. Insert AgentDecisionLog referencing aiJobId
      await freshPrisma.agentDecisionLog.create({
        data: {
          id: logId,
          userId: testUserId,
          taskType: 'situation_analysis',
          decision: { test: true },
          aiJobId: jobId,
        },
      });
    } finally {
      await freshPrisma.$disconnect();
    }

    // Simulate another API instance running saveRelationalRuntimeState with a stale snapshot
    // where aiJobs is empty (it has no in-memory AIJob records)
    const freshPrismaInstance2 = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const staleState = {
        users: [
          {
            id: testUserId,
            openid: `openid_${Date.now()}`,
            nickname: 'Demo',
            anonymousCode: 'demo_code',
            status: 'normal',
            createdAt: new Date().toISOString(),
          },
        ],
        aiJobs: [], // Stale second instance holds an empty aiJobs array
        letters: [
          {
            id: letterId,
            userId: testUserId,
            style: 'warm',
            title: '外键测试信件',
            content: '信件内容',
            status: 'unread',
            aiJobId: jobId,
            createdAt: new Date().toISOString(),
          },
        ],
        moods: [
          {
            id: moodId,
            userId: testUserId,
            emotion: '焦虑',
            content: '心情内容',
            visibility: 'PUBLIC',
            createdAt: new Date().toISOString(),
          },
        ],
        posts: [
          {
            id: postId,
            moodId,
            userId: testUserId,
            emotion: '焦虑',
            content: '帖子内容',
            visibility: 'PUBLIC',
            status: 'active',
            reviewStatus: 'published',
            hugCount: 0,
            replyCount: 1,
            favoriteCount: 0,
            reportCount: 0,
            createdAt: new Date().toISOString(),
          },
        ],
        replies: [
          {
            id: replyId,
            postId,
            userId: testUserId,
            type: 'AI',
            style: 'warm',
            content: 'AI回复内容',
            status: 'published',
            riskLevel: 'low',
            likeCount: 0,
            aiJobId: jobId,
            createdAt: new Date().toISOString(),
          },
        ],
        agentDecisionLogs: [
          {
            id: logId,
            userId: testUserId,
            taskType: 'situation_analysis',
            decision: { test: true },
            aiJobId: jobId,
            createdAt: new Date().toISOString(),
          },
        ],
      };
      await saveRelationalRuntimeState(freshPrismaInstance2, staleState);
    } finally {
      await freshPrismaInstance2.$disconnect();
    }

    // Verify DB with fresh client:
    // AIJob must NOT be deleted, and all three references must NOT be nulled!
    const freshPrismaVerify = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const jobRow = await freshPrismaVerify.aIJob.findUnique({ where: { id: jobId } });
      expect(jobRow).not.toBeNull();
      expect(jobRow?.id).toBe(jobId);

      const letterRow = await freshPrismaVerify.letter.findUnique({ where: { id: letterId } });
      expect(letterRow).not.toBeNull();
      expect(letterRow?.aiJobId).toBe(jobId);

      const replyRow = await freshPrismaVerify.reply.findUnique({ where: { id: replyId } });
      expect(replyRow).not.toBeNull();
      expect(replyRow?.aiJobId).toBe(jobId);

      const logRow = await freshPrismaVerify.agentDecisionLog.findUnique({ where: { id: logId } });
      expect(logRow).not.toBeNull();
      expect(logRow?.aiJobId).toBe(jobId);
    } finally {
      await freshPrismaVerify.$disconnect();
    }
  });

  it('6. Completion callback: after an AI job completes, Journey/Snapshot write lands in DB even when in-memory arrays do not contain object', async () => {
    const store = app.get(StoreService);
    const testUserId = store.getDemoUserId();
    const journeyId = `journey_callback_${Date.now()}`;
    const snapshotId = `snapshot_callback_${Date.now()}`;
    const jobId = `job_callback_${Date.now()}`;

    // 1. Create Journey and Snapshot directly in database
    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.aIProvider.upsert({
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

      await freshPrisma.aIJob.create({
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
          promptSummary: '异步回调测试',
          result: '整理后的新总结',
          durationMs: 50,
          traceJson: [],
        },
      });

      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId: testUserId,
          title: '生活里正在整理的一件事', // generated title pattern
          domain: '生活',
          status: 'active',
          stage: 'clarifying',
          summary: '旧总结',
        },
      });

      await freshPrisma.situationSnapshot.create({
        data: {
          id: snapshotId,
          journeyId,
          facts: ['原始事实1'],
          feelings: ['原始感受1'],
          needs: ['原始需要1'],
          constraints: ['原始限制1'],
          risks: [],
          domain: '生活',
          confidence: 'agent_draft',
          contextTags: ['工作'],
        },
      });
    } finally {
      await freshPrisma.$disconnect();
    }

    // 2. Deliberately ensure that in-memory arrays do NOT contain this journey or snapshot
    if (!DIRECT_DB_MODELS.LifeJourney) {
      (store as any).data.lifeJourneys = (store as any).data.lifeJourneys.filter((item: any) => item.id !== journeyId);
      (store as any).data.situationSnapshots = (store as any).data.situationSnapshots.filter(
        (item: any) => item.journeyId !== journeyId,
      );
    }

    // 3. Execute the completion callback for this journey with a structured result
    // Single-writer pattern: callback hydrates missing object from DB into store and persists through persistAndFlush()
    const completedJob = {
      id: jobId,
      userId: testUserId,
      contentId: journeyId,
      contentType: 'Situation',
      jobType: '处境分析',
      taskType: 'situation_analysis',
      style: 'rational' as const,
      providerId: 'provider_template',
      modelName: 'safe-template',
      status: 'succeeded' as const,
      promptSummary: '异步回调测试',
      result: '整理后的新总结',
      durationMs: 50,
      retryCount: 0,
      fallbackUsed: false,
      routeVersion: 1,
      traceJson: [],
      createdAt: new Date().toISOString(),
      structuredResult: {
        title: '整理后的新标题',
        summary: '这是AI分析后更新的真实总结文本',
        facts: ['新事实A', '新事实B'],
        feelings: ['新感受A'],
        needs: ['新需要A'],
        domain: '生活',
        stage: 'clarifying',
        intensity: 5,
        urgency: 4,
      },
    };

    await store.applySituationAnalysisCompletion(journeyId, testUserId, completedJob);

    // 4. Verify from a fresh PrismaClient that the Journey, SituationSnapshot and AgentDecisionLog writes landed in PostgreSQL!
    const freshPrismaVerify = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const journeyRow = await freshPrismaVerify.lifeJourney.findUnique({ where: { id: journeyId } });
      expect(journeyRow).not.toBeNull();
      expect(journeyRow?.summary).toBe('这是AI分析后更新的真实总结文本');
      expect(journeyRow?.title).toBe('整理后的新标题');
      expect(journeyRow?.intensity).toBe(5);

      const snapshotRow = await freshPrismaVerify.situationSnapshot.findUnique({ where: { id: snapshotId } });
      expect(snapshotRow).not.toBeNull();
      expect(snapshotRow?.facts as string[]).toEqual(['新事实A', '新事实B']);
      expect(snapshotRow?.feelings as string[]).toEqual(['新感受A']);
      expect(snapshotRow?.confidence).toBe('agent_draft');

      const decisionLog = await freshPrismaVerify.agentDecisionLog.findFirst({
        where: { journeyId, aiJobId: jobId },
      });
      expect(decisionLog).not.toBeNull();
      expect(decisionLog?.taskType).toBe('situation_analysis');
      expect((decisionLog?.decision as any)?.title).toBe('整理后的新标题');
    } finally {
      await freshPrismaVerify.$disconnect();
    }
  });

  it('7. P0-1 coverage: AgentDecisionLog created by AI completion survives immediate legacy flush before state reload', async () => {
    const store = app.get(StoreService);
    const testUserId = store.getDemoUserId();
    const journeyId = `journey_p01_${Date.now()}`;
    const snapshotId = `snapshot_p01_${Date.now()}`;
    const jobId = `job_p01_${Date.now()}`;

    // 1. Create Journey, Snapshot, and AIJob directly in database
    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.aIProvider.upsert({
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

      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId: testUserId,
          title: '工作旅程',
          domain: '工作',
          status: 'active',
          stage: 'clarifying',
        },
      });
      await freshPrisma.situationSnapshot.create({
        data: {
          id: snapshotId,
          journeyId,
          facts: ['事实1'],
          feelings: ['感受1'],
          needs: [],
          constraints: [],
          risks: [],
          confidence: 'agent_draft',
        },
      });
      await freshPrisma.aIJob.create({
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
          promptSummary: 'P0-1测试',
          result: '分析结果',
          durationMs: 20,
          traceJson: [],
        },
      });
    } finally {
      await freshPrisma.$disconnect();
    }

    // 2. Run applySituationAnalysisCompletion which updates state and creates AgentDecisionLog with aiJobId
    await store.applySituationAnalysisCompletion(journeyId, testUserId, {
      id: jobId,
      status: 'succeeded',
      result: '分析结果',
      structuredResult: { summary: '分析结果', facts: ['事实1'] },
    });

    // Verify AgentDecisionLog was created in DB
    const freshPrismaMid = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    let createdLogId: string;
    try {
      const log = await freshPrismaMid.agentDecisionLog.findFirstOrThrow({ where: { journeyId, aiJobId: jobId } });
      createdLogId = log.id;
      expect(log.aiJobId).toBe(jobId);
    } finally {
      await freshPrismaMid.$disconnect();
    }

    // 3. Simulate immediate persistAndFlush from an instance whose in-memory snapshot was not reloaded yet
    const freshPrismaStale = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const staleState = {
        users: [
          {
            id: testUserId,
            openid: `openid_${Date.now()}`,
            nickname: 'Demo',
            anonymousCode: 'demo_code',
            status: 'normal',
            createdAt: new Date().toISOString(),
          },
        ],
        lifeJourneys: [
          {
            id: journeyId,
            userId: testUserId,
            title: '工作旅程',
            domain: '工作',
            status: 'active',
            stage: 'clarifying',
            visibility: 'PRIVATE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        agentDecisionLogs: [
          {
            id: createdLogId,
            userId: testUserId,
            journeyId,
            taskType: 'situation_analysis',
            decision: { summary: '分析结果' },
            createdAt: new Date().toISOString(),
          },
        ], // snapshot where aiJobId was not yet populated
      };
      await saveRelationalRuntimeState(freshPrismaStale, staleState);
    } finally {
      await freshPrismaStale.$disconnect();
    }

    // 4. Assert from fresh client that the secondary guard in mapper preserved aiJobId!
    const freshPrismaFinal = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const logAfterFlush = await freshPrismaFinal.agentDecisionLog.findUnique({ where: { id: createdLogId } });
      expect(logAfterFlush).not.toBeNull();
      expect(logAfterFlush?.aiJobId).toBe(jobId);
    } finally {
      await freshPrismaFinal.$disconnect();
    }
  });

  it('8. P0-2 proof: MonthlyReport advice awaits job commit and reads back valid aiJobId rather than null', async () => {
    const store = app.get(StoreService);
    const reports = app.get(MonthlyReportService);
    const testUserId = store.getDemoUserId();

    // Ensure privacy allows report analysis
    store.privacySettings[testUserId] = {
      ...(store.privacySettings[testUserId] ?? {}),
      allowJourneyLongTermAnalysis: true,
      allowMonthlyReportShare: true,
    } as any;

    const month = '2026-09';
    // Call advice - which queues a monthly_recovery_summary job and awaits awaitJobCommit
    const result = await reports.advice(month, testUserId);

    expect(result.item.aiJobId).toBeDefined();
    expect(typeof result.item.aiJobId).toBe('string');
    expect(result.item.aiJobId?.length).toBeGreaterThan(0);
    expect(result.item.aiJobStatus).toBeDefined();

    // Verify row was committed to PostgreSQL
    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const dbRow = await freshPrisma.aIJob.findUnique({ where: { id: result.item.aiJobId! } });
      expect(dbRow).not.toBeNull();
      expect(dbRow?.id).toBe(result.item.aiJobId);
      expect(dbRow?.taskType).toBe('monthly_recovery_summary');
    } finally {
      await freshPrisma.$disconnect();
    }
  });
});
