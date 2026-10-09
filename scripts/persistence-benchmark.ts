import { identityFor } from '../tests/business/helpers';
import 'reflect-metadata';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../apps/api/src/app.module.js';
import { PrismaRuntimeService } from '../apps/api/src/prisma-runtime.service.js';
import {
  loadRelationalRuntimeState,
  saveRelationalRuntimeState,
  isRelationalPrimary,
} from '../apps/api/src/relational-runtime.mapper.js';
import { StoreService } from '../apps/api/src/store.service.js';

// Configuration
const PG_BIN = process.env.TEST_PG_BIN ?? 'C:\\Program Files\\PostgreSQL\\18\\bin';
const PG_HOST = process.env.TEST_PG_HOST ?? '127.0.0.1';
const PG_PORT = process.env.TEST_PG_PORT ?? process.env.PGPORT ?? '15432';
const PG_USER = process.env.TEST_PG_USER ?? 'goodnight';
const PG_PASSWORD = process.env.TEST_PG_PASSWORD ?? 'goodnight';
const BENCHMARK_DB_NAME = 'goodnight_benchmark';
const BENCHMARK_DB_URL = `postgresql://${PG_USER}:${encodeURIComponent(PG_PASSWORD)}@${PG_HOST}:${PG_PORT}/${BENCHMARK_DB_NAME}?schema=public`;

const DATASET_SIZES = [1_000, 5_000, 10_000, 12_600];
const ITERATIONS_PER_OP = 3;

// Instrumented Prisma Client to capture SQL statements via Prisma query events
export class BenchmarkPrismaService extends PrismaClient {
  public recording = false;
  public capturedQueries: Array<{ query: string; params?: string; duration?: number }> = [];

  constructor(url = BENCHMARK_DB_URL) {
    super({
      datasources: { db: { url } },
      log: [{ emit: 'event', level: 'query' }],
    });

    // @ts-expect-error the 'query' overload only exists when the client is constructed with the
    // event-level log option, which this subclass does, but the inherited type does not carry it.
    this.$on('query', (e: any) => {
      if (this.recording) {
        this.capturedQueries.push({
          query: e.query,
          params: e.params,
          duration: e.duration,
        });
      }
    });
  }

  async loadRuntimeState<T>() {
    const row = await this.runtimeState.findUnique({ where: { id: 'default' } });
    if (row && isRelationalPrimary(row.payload)) {
      return (await loadRelationalRuntimeState(this)) as T | undefined;
    }
    return row?.payload as T | undefined;
  }

  async saveRuntimeState(payload: unknown) {
    await saveRelationalRuntimeState(this, payload as Record<string, unknown>);
  }

  startRecording() {
    this.capturedQueries = [];
    this.recording = true;
  }

  stopRecording() {
    this.recording = false;
    return [...this.capturedQueries];
  }
}

// Database creation and migration helper
function execPsql(command: string) {
  const psqlPath = path.join(PG_BIN, 'psql.exe');
  const env = { ...process.env, PGPASSWORD: PG_PASSWORD };
  const res = spawnSync(
    psqlPath,
    ['-h', PG_HOST, '-p', PG_PORT, '-U', PG_USER, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', command],
    { encoding: 'utf8', env, windowsHide: true }
  );
  if (res.error || res.status !== 0) {
    throw new Error(`psql error: ${res.error?.message ?? res.stderr}`);
  }
}

export function resetBenchmarkDatabase() {
  console.log(`[DB] Recreating isolated benchmark database: ${BENCHMARK_DB_NAME}...`);
  execPsql(`DROP DATABASE IF EXISTS ${BENCHMARK_DB_NAME};`);
  execPsql(`CREATE DATABASE ${BENCHMARK_DB_NAME};`);

  console.log('[DB] Running prisma migrate deploy on isolated database...');
  const prismaCli = path.resolve('node_modules/prisma/build/index.js');
  const res = spawnSync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
    {
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: BENCHMARK_DB_URL },
      windowsHide: true,
    }
  );
  if (res.error || res.status !== 0) {
    throw new Error(`Migration error: ${res.error?.message ?? res.stderr ?? res.stdout}`);
  }
  console.log('[DB] Migrations deployed successfully.');
}

// Deterministic StoreData generator
export function generateBenchmarkStoreData(targetCount: number) {
  const nowStr = new Date('2026-10-04T00:00:00.000Z').toISOString();
  const users = [
    {
      id: 'user_demo',
      openid: 'openid_demo',
      nickname: '晚安旅人',
      anonymousCode: '树洞 0427',
      avatarUrl: '/avatar.svg',
      status: 'normal',
      createdAt: nowStr,
    },
    {
      id: 'user_guest',
      openid: 'openid_guest',
      nickname: '今天也在努力',
      anonymousCode: '树洞 1024',
      avatarUrl: '/avatar.svg',
      status: 'normal',
      createdAt: nowStr,
    },
  ];
  const adminUsers = [
    {
      id: 'admin_1',
      username: 'admin',
      passwordHash: 'plain:admin123',
      displayName: '值班管理员',
      role: 'super_admin',
      status: 'active',
    },
  ];
  const privacySettings: Record<string, any> = {
    user_demo: {
      defaultVisibility: 'PRIVATE',
      allowAnonymousPublic: true,
      allowHumanReplies: true,
      allowMonthlyReportShare: true,
      allowPeerMatching: true,
      allowAnonymousExperienceStats: true,
      allowRecoveryData: true,
      allowJourneyLongTermAnalysis: true,
      allowLongTermMemory: true,
      allowAiMemoryUse: true,
      allowAnonymousExperienceShare: true,
      allowJourneyArchiveRetention: true,
      allowFutureSelfNotifications: true,
      allowDataExport: true,
    },
    user_guest: {
      defaultVisibility: 'PUBLIC',
      allowAnonymousPublic: true,
      allowHumanReplies: false,
      allowMonthlyReportShare: true,
      allowPeerMatching: true,
      allowAnonymousExperienceStats: true,
      allowRecoveryData: true,
      allowJourneyLongTermAnalysis: true,
      allowLongTermMemory: true,
      allowAiMemoryUse: true,
      allowAnonymousExperienceShare: true,
      allowJourneyArchiveRetention: true,
      allowFutureSelfNotifications: true,
      allowDataExport: true,
    },
  };
  const aiProviders = [
    {
      id: 'provider_legacy_template',
      name: '迁移兼容 template',
      type: 'template',
      baseUrl: 'local://template',
      modelName: 'legacy-template',
      apiKeyStatus: 'configured',
      enabled: true,
      priority: 999,
      dailyLimit: 99999,
      timeoutSeconds: 1,
      failoverEnabled: false,
      usageTags: ['compatibility'],
      failureRate: 0,
      avgLatencyMs: 0,
      todayCalls: 0,
      providerKind: 'template',
    },
  ];
  const aiRoutes = [
    {
      id: 'route_rational',
      style: 'rational',
      label: '理性拆解',
      primaryProviderId: 'provider_legacy_template',
      backupProviderId: 'provider_legacy_template',
      fallbackTemplateId: 'provider_legacy_template',
      promptVersion: 'v1',
      promptTemplate: '',
      enabled: true,
      routeVersion: 1,
    },
    {
      id: 'route_warm',
      style: 'warm',
      label: '温暖共情',
      primaryProviderId: 'provider_legacy_template',
      backupProviderId: 'provider_legacy_template',
      fallbackTemplateId: 'provider_legacy_template',
      promptVersion: 'v1',
      promptTemplate: '',
      enabled: true,
      routeVersion: 1,
    },
  ];
  const feedbackCategories = [
    { id: 'cat_1', name: '使用问题', sortOrder: 1, enabled: true },
    { id: 'cat_2', name: '功能建议', sortOrder: 2, enabled: true },
    { id: 'cat_3', name: '违规举报', sortOrder: 3, enabled: true },
  ];
  const faqs = [
    { id: 'faq_1', question: '树洞数据安全吗？', answer: '所有数据经过加密和隐私保护。', sortOrder: 1, enabled: true, createdAt: nowStr },
    { id: 'faq_2', question: '如何联系同路人？', answer: '通过匿名匹配机制可以建立同行交流。', sortOrder: 2, enabled: true, createdAt: nowStr },
  ];
  const replyPresets = [
    { id: 'preset_1', text: '抱抱你，明天会更好的。', scene: '温暖', sortOrder: 1, enabled: true, createdAt: nowStr },
    { id: 'preset_2', text: '深呼吸，慢慢来。', scene: '理性', sortOrder: 2, enabled: true, createdAt: nowStr },
  ];
  const systemSettings: Record<string, any> = {
    defaultPageSize: { value: 20, description: '默认分页大小' },
    siteTitle: { value: '晚安树洞', description: '站点标题' },
  };

  const lifeJourneys: any[] = [];
  const situationSnapshots: any[] = [];
  const journeyUpdates: any[] = [];
  const actionCommitments: any[] = [];
  const outcomeCheckins: any[] = [];
  const moods: any[] = [];
  const posts: any[] = [];
  const replies: any[] = [];
  const aiJobs: any[] = [];
  const auditLogs: any[] = [];
  const notifications: any[] = [];
  const peerExperiences: any[] = [];
  const peerMatches: any[] = [];
  const peerConversations: any[] = [];
  const peerMessages: any[] = [];
  const safetyEvents: any[] = [];
  const diaries: any[] = [];
  const letters: any[] = [];
  const memoryItems: any[] = [];

  let currentCount =
    users.length +
    adminUsers.length +
    Object.keys(privacySettings).length +
    aiProviders.length +
    aiRoutes.length +
    feedbackCategories.length +
    faqs.length +
    replyPresets.length +
    Object.keys(systemSettings).length;

  let i = 0;
  while (currentCount < targetCount) {
    const jId = `journey_bench_${i}`;
    const snapId = `snapshot_bench_${i}`;
    const updId = `update_bench_${i}`;
    const actId = `action_bench_${i}`;
    const chkId = `checkin_bench_${i}`;
    const moodId = `mood_bench_${i}`;
    const postId = `post_bench_${i}`;
    const replyId = `reply_bench_${i}`;
    const jobId = `job_bench_${i}`;
    const auditId = `audit_bench_${i}`;
    const notifId = `notif_bench_${i}`;
    const expId = `exp_bench_${i}`;
    const matchId = `match_bench_${i}`;
    const convId = `conv_bench_${i}`;
    const msgId = `msg_bench_${i}`;
    const safetyId = `safety_bench_${i}`;
    const diaryId = `diary_bench_${i}`;
    const letterId = `letter_bench_${i}`;
    const memId = `mem_bench_${i}`;

    lifeJourneys.push({
      id: jId,
      userId: 'user_demo',
      title: `旅程 ${i}`,
      domain: '工作',
      status: 'active',
      stage: 'clarifying',
      visibility: 'PRIVATE',
      intensity: 5,
      createdAt: nowStr,
      updatedAt: nowStr,
    });
    currentCount++;
    if (currentCount >= targetCount) break;

    situationSnapshots.push({
      id: snapId,
      journeyId: jId,
      facts: [`事实 ${i}`],
      feelings: ['焦虑'],
      needs: ['支持'],
      constraints: [],
      risks: [],
      domain: '工作',
      confidence: 'agent_draft',
      createdAt: nowStr,
      updatedAt: nowStr,
    });
    currentCount++;
    if (currentCount >= targetCount) break;

    journeyUpdates.push({
      id: updId,
      journeyId: jId,
      userId: 'user_demo',
      kind: 'created',
      content: `进展更新 ${i}`,
      createdAt: nowStr,
    });
    currentCount++;
    if (currentCount >= targetCount) break;

    actionCommitments.push({
      id: actId,
      journeyId: jId,
      userId: 'user_demo',
      title: `行动计划 ${i}`,
      status: 'active',
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      createdAt: nowStr,
      updatedAt: nowStr,
    });
    currentCount++;
    if (currentCount >= targetCount) break;

    outcomeCheckins.push({
      id: chkId,
      journeyId: jId,
      commitmentId: actId,
      userId: 'user_demo',
      status: 'pending',
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      createdAt: nowStr,
    });
    currentCount++;
    if (currentCount >= targetCount) break;

    moods.push({
      id: moodId,
      userId: 'user_demo',
      emotion: '困惑',
      content: `心情记录 ${i}`,
      visibility: 'PUBLIC',
      riskLevel: 'low',
      riskScore: 0.1,
      status: 'active',
      journeyId: jId,
      createdAt: nowStr,
    });
    currentCount++;
    if (currentCount >= targetCount) break;

    posts.push({
      id: postId,
      moodId,
      userId: 'user_demo',
      emotion: '困惑',
      content: `帖子内容 ${i}`,
      visibility: 'PUBLIC',
      status: 'active',
      reviewStatus: 'published',
      hugCount: 0,
      replyCount: 1,
      favoriteCount: 0,
      reportCount: 0,
      journeyId: jId,
      createdAt: nowStr,
    });
    currentCount++;
    if (currentCount >= targetCount) break;

    replies.push({
      id: replyId,
      postId,
      userId: 'user_guest',
      type: 'USER',
      style: 'warm',
      content: `回复内容 ${i}`,
      status: 'published',
      riskLevel: 'low',
      likeCount: 0,
      createdAt: nowStr,
    });
    currentCount++;
    if (currentCount >= targetCount) break;

    aiJobs.push({
      id: jobId,
      userId: 'user_demo',
      contentId: jId,
      contentType: 'journey',
      jobType: 'situation_analysis',
      style: 'rational',
      providerId: 'provider_legacy_template',
      modelName: 'legacy-template',
      status: 'succeeded',
      promptSummary: `AI分析摘要 ${i}`,
      result: `AI分析结果 ${i}`,
      durationMs: 120,
      retryCount: 0,
      fallbackUsed: false,
      traceJson: [],
      routeVersion: 1,
      createdAt: nowStr,
    });
    currentCount++;
    if (currentCount >= targetCount) break;

    auditLogs.push({
      id: auditId,
      adminUserId: 'admin_1',
      action: 'BENCHMARK_AUDIT',
      resourceType: 'LifeJourney',
      resourceId: jId,
      createdAt: nowStr,
    });
    currentCount++;
    if (currentCount >= targetCount) break;

    notifications.push({
      id: notifId,
      userId: 'user_demo',
      type: 'action_reminder',
      title: `行动提醒 ${i}`,
      body: `请检查你的待办行动 ${i}`,
      status: 'unread',
      createdAt: nowStr,
    });
    currentCount++;
    if (currentCount >= targetCount) break;

    peerExperiences.push({
      id: expId,
      userId: 'user_demo',
      journeyId: jId,
      title: `同路经验分享 ${i}`,
      domain: '工作',
      stage: 'clarifying',
      content: `经历分享内容 ${i}`,
      tags: ['职场', '压力'],
      consentedAt: nowStr,
      status: 'published',
      reportCount: 0,
      createdAt: nowStr,
      updatedAt: nowStr,
    });
    currentCount++;
    if (currentCount >= targetCount) break;

    peerMatches.push({
      id: matchId,
      userId: 'user_guest',
      journeyId: jId,
      peerExperienceId: expId,
      score: 88,
      reasons: ['相似的职场挑战'],
      status: 'connected',
      acceptedAt: nowStr,
      createdAt: nowStr,
      updatedAt: nowStr,
    });
    currentCount++;
    if (currentCount >= targetCount) break;

    peerConversations.push({
      id: convId,
      matchId,
      starterUserId: 'user_guest',
      receiverUserId: 'user_demo',
      status: 'active',
      startsAt: nowStr,
      expiresAt: new Date(Date.now() + 86400000 * 3).toISOString(),
      createdAt: nowStr,
    });
    currentCount++;
    if (currentCount >= targetCount) break;

    peerMessages.push({
      id: msgId,
      conversationId: convId,
      senderUserId: 'user_guest',
      content: `同行鼓励消息 ${i}`,
      authorType: 'HUMAN',
      createdAt: nowStr,
      piiFlags: [],
    });
    currentCount++;
    if (currentCount >= targetCount) break;

    safetyEvents.push({
      id: safetyId,
      userId: 'user_demo',
      journeyId: jId,
      level: 'medium',
      source: 'journey_create',
      action: 'real_world_support_prompt',
      payload: { escalation: false, triggerExcerpt: `安全事件描述 ${i}` },
      status: 'open',
      createdAt: nowStr,
    });
    currentCount++;
    if (currentCount >= targetCount) break;

    diaries.push({
      id: diaryId,
      userId: 'user_demo',
      journeyId: jId,
      emotion: '平静',
      content: `日记内容 ${i}`,
      hasLetter: false,
      createdAt: nowStr,
    });
    currentCount++;
    if (currentCount >= targetCount) break;

    letters.push({
      id: letterId,
      userId: 'user_demo',
      sourceMoodId: moodId,
      style: 'warm',
      title: `给自己的信 ${i}`,
      content: `信件内容 ${i}`,
      status: 'read',
      savedToDiary: false,
      createdAt: nowStr,
    });
    currentCount++;
    if (currentCount >= targetCount) break;

    memoryItems.push({
      id: memId,
      userId: 'user_demo',
      journeyId: jId,
      category: 'work_pattern',
      title: `关键记忆 ${i}`,
      content: `记忆记录 ${i}`,
      source: 'user_saved',
      scope: 'all_ai',
      status: 'active',
      consentedAt: nowStr,
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      createdAt: nowStr,
      updatedAt: nowStr,
    });
    currentCount++;
    if (currentCount >= targetCount) break;

    i++;
  }

  return {
    users,
    adminUsers,
    privacySettings,
    moods,
    posts,
    replies,
    letters,
    diaries,
    favorites: [],
    feedbackCategories,
    faqs,
    replyPresets,
    feedbackTickets: [],
    systemSettings,
    aiProviders,
    aiRoutes,
    aiJobs,
    assets: [],
    auditLogs,
    lifeJourneys,
    situationSnapshots,
    journeyUpdates,
    actionCommitments,
    outcomeCheckins,
    peerExperiences,
    peerMatches,
    peerReputations: [],
    decisionRecords: [],
    cooldownItems: [],
    realityHandoffs: [],
    trustedContacts: [],
    messagesToFutureSelf: [],
    personalSupportPlans: [],
    stableSelfProfiles: [],
    memoryItems,
    recoverySnapshots: [],
    safetyEvents,
    agentDecisionLogs: [],
    followUpJobs: [],
    notifications,
    peerConversations,
    peerMessages,
    peerReports: [],
    adminUserNotes: [],
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

export interface OperationBenchmarkResult {
  operation: string;
  endpoint: string;
  datasetSize: number;
  successfulSamples: number;
  failedSamples: number;
  durationsMs: number[];
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  sqlStatementsAvg: number;
  sqlStatementsPerSample: number[];
  failedSampleIndices: number[];
  errorNotes?: string;
  statementBreakdown: {
    upserts: number;
    deletes: number;
    transactionControl: number;
    others: number;
  };
  businessRowsAffected: number;
  rowsWrittenByFlush: number;
  natureOfOperation: string;
}

export interface DatasetBenchmarkResult {
  datasetSize: number;
  actualStoreRows: number;
  hydrationTimeMs: number;
  bootTimeMs: number;
  operations: OperationBenchmarkResult[];
}

export interface ConcurrencyRunResult {
  concurrency: number;
  attempts: number;
  successes: number;
  failures: number;
  lostUpdates: number;
  timeouts: number;
  connectionClosed: number;
  errors: string[];
}

export interface FullBenchmarkArtifact {
  timestamp: string;
  database: string;
  methodology: string;
  system: {
    platform: string;
    node: string;
    pgVersion: string;
  };
  datasets: DatasetBenchmarkResult[];
  concurrency: ConcurrencyRunResult[];
}

async function measureBootAndHydration(
  prisma: BenchmarkPrismaService
): Promise<{ hydrationMs: number; bootMs: number }> {
  // Pure hydration time (reading all 43 collections from DB and mapping)
  const hydrations: number[] = [];
  for (let s = 0; s < 3; s++) {
    const t0 = performance.now();
    await prisma.loadRuntimeState();
    hydrations.push(performance.now() - t0);
  }
  const hydrationMs = Number(percentile(hydrations, 50).toFixed(1));

  // Store service onModuleInit time (hydrate + reconciliation + initial flush)
  const store = new StoreService(prisma as any);
  const t0 = performance.now();
  await store.onModuleInit();
  const bootMs = Number((performance.now() - t0).toFixed(1));

  return { hydrationMs, bootMs };
}

async function runSingleWriterBenchmarks(
  app: any,
  prisma: BenchmarkPrismaService,
  datasetSize: number,
  storeRows: number
): Promise<OperationBenchmarkResult[]> {
  const server = app.getHttpServer();
  const store = app.get(StoreService);
  const results: OperationBenchmarkResult[] = [];

  // Authenticate admin once
  const loginRes = await request(server)
    .post('/api/admin/v1/login')
    .send({ username: 'admin', password: 'admin123' })
    .expect(201);
  const adminToken = loginRes.body.token as string;

  // Ensure store write queue is clean before benchmarking operations
  await store.flush();

  const operations = [
    {
      name: 'createJourney',
      endpoint: 'POST /api/v1/journeys',
      businessRows: 3, // Journey + SituationSnapshot + JourneyUpdate
      nature: 'Full request lifecycle: synchronous journey creation flush + asynchronous AI analysis lifecycle flushes (up to 5 flushes combined)',
      isAiTriggering: true,
      execute: (idx: number) =>
        request(server)
          .post('/api/v1/journeys')
          .set('x-goodnight-user-id', identityFor('user_demo'))
          .send({
            title: `基准测试旅程 ${idx}`,
            domain: '工作',
            content: `测试创建新旅程内容 ${idx}，这是一段用于基准测试的详尽描述。`,
            intensity: 5,
          }),
    },
    {
      name: 'writeAction',
      endpoint: 'POST /api/v1/journeys/:id/actions',
      businessRows: 3, // ActionCommitment + OutcomeCheckin + JourneyUpdate
      nature: 'Single-flush business write',
      isAiTriggering: false,
      execute: (idx: number) =>
        request(server)
          .post('/api/v1/journeys/journey_bench_0/actions')
          .set('x-goodnight-user-id', identityFor('user_demo'))
          .send({
            title: `基准行动承诺 ${idx}`,
            description: `行动承诺详细描述 ${idx}`,
          }),
    },
    {
      name: 'readNotification',
      endpoint: 'PATCH /api/v1/notifications/:id/read',
      businessRows: 1, // UserNotification status changed
      nature: 'Single-flush business write',
      isAiTriggering: false,
      execute: (idx: number) =>
        request(server)
          .patch(`/api/v1/notifications/notif_bench_${idx}/read`)
          .set('x-goodnight-user-id', identityFor('user_demo'))
          .send(),
    },
    {
      name: 'sendPeerMessage',
      endpoint: 'POST /api/v1/peer-conversations/:matchId/messages',
      businessRows: 1, // PeerMessage created
      nature: 'Single-flush business write',
      isAiTriggering: false,
      execute: (idx: number) =>
        request(server)
          .post('/api/v1/peer-conversations/match_bench_0/messages')
          .set('x-goodnight-user-id', identityFor('user_guest'))
          .send({
            content: `你好，我也经历过类似困扰，加油！消息 ${idx}`,
          }),
    },
    {
      name: 'adminHandleSafetyEvent',
      endpoint: 'PATCH /api/admin/v1/safety/events/:id/handle',
      businessRows: 2, // SafetyEvent updated + AuditLog created
      nature: 'Single-flush business write',
      isAiTriggering: false,
      execute: (idx: number) =>
        request(server)
          .patch(`/api/admin/v1/safety/events/safety_bench_${idx}/handle`)
          .set('authorization', `Bearer ${adminToken}`)
          .send({
            status: 'handled',
            note: `管理员已完成支持处理 ${idx}`,
          }),
    },
  ];

  for (const op of operations) {
    console.log(`  -> Benchmarking ${op.name} (${op.endpoint}) across ${ITERATIONS_PER_OP} iterations...`);
    const successfulDurations: number[] = [];
    const allDurations: number[] = [];
    const successfulStatementCounts: number[] = [];
    const allStatementCounts: number[] = [];
    const failedIndices: number[] = [];
    let lastSuccessfulQueries: Array<{ query: string; params?: string }> = [];
    let errorNotes: string | undefined;

    for (let i = 0; i < ITERATIONS_PER_OP; i++) {
      // Ensure previous background work has quiesced before recording starts
      try {
        await store.flush();
      } catch {
        (store as any).persistenceError = undefined;
      }

      prisma.startRecording();
      const t0 = performance.now();
      const res = await op.execute(i);

      let flushError: string | undefined;
      // If the operation queues asynchronous AI jobs, drain the AI job and its flushes to quiescence
      if (op.isAiTriggering && res.body?.job?.id) {
        try {
          await store.waitForAiJob(res.body.job.id);
        } catch (err: any) {
          flushError = err.message ?? String(err);
        }
      }
      try {
        await store.flush();
      } catch (err: any) {
        flushError = err.message ?? String(err);
        (store as any).persistenceError = undefined;
      }

      const t1 = performance.now();
      const queries = prisma.stopRecording();
      const durationMs = t1 - t0;

      console.log(`    [iter ${i + 1}/${ITERATIONS_PER_OP}] status: ${res.status}, duration: ${durationMs.toFixed(1)} ms, statements: ${queries.length}`);

      allDurations.push(durationMs);
      allStatementCounts.push(queries.length);

      if (res.status >= 500 || flushError) {
        failedIndices.push(i);
        errorNotes = `Iteration ${i + 1} failed (${res.status >= 500 ? `HTTP ${res.status}` : flushError}). Excluded from successful average.`;
        console.warn(`    ⚠️ ${errorNotes}`);
      } else if (res.status >= 400) {
        throw new Error(`Operation ${op.name} failed with status ${res.status}: ${JSON.stringify(res.body)}`);
      } else {
        successfulDurations.push(durationMs);
        successfulStatementCounts.push(queries.length);
        lastSuccessfulQueries = queries;
      }
    }

    // Ensure store is completely quiet before the next operation starts
    try {
      await store.flush();
    } catch {
      (store as any).persistenceError = undefined;
    }

    const targetDurations = successfulDurations.length > 0 ? successfulDurations : allDurations;
    const targetStatementCounts = successfulStatementCounts.length > 0 ? successfulStatementCounts : allStatementCounts;

    const p50 = percentile(targetDurations, 50);
    const p95 = percentile(targetDurations, 95);
    const max = Math.max(...targetDurations);
    const avgStatements = Math.round(targetStatementCounts.reduce((a, b) => a + b, 0) / targetStatementCounts.length);

    // Analyze statement breakdown from the last successful sample
    const breakdownSource = lastSuccessfulQueries.length > 0 ? lastSuccessfulQueries : prisma.capturedQueries;
    const upserts = breakdownSource.filter(q => q.query.includes('INSERT INTO') || q.query.includes('ON CONFLICT')).length;
    const deletes = breakdownSource.filter(q => q.query.includes('DELETE FROM')).length;
    const transactionControl = breakdownSource.filter(q => q.query === 'BEGIN' || q.query === 'COMMIT' || q.query === 'ROLLBACK').length;
    const others = breakdownSource.length - (upserts + deletes + transactionControl);

    results.push({
      operation: op.name,
      endpoint: op.endpoint,
      datasetSize,
      successfulSamples: successfulDurations.length,
      failedSamples: failedIndices.length,
      durationsMs: allDurations.map(d => Number(d.toFixed(1))),
      p50Ms: Number(p50.toFixed(1)),
      p95Ms: Number(p95.toFixed(1)),
      maxMs: Number(max.toFixed(1)),
      sqlStatementsAvg: avgStatements,
      sqlStatementsPerSample: allStatementCounts,
      failedSampleIndices: failedIndices,
      errorNotes,
      statementBreakdown: {
        upserts,
        deletes,
        transactionControl,
        others,
      },
      businessRowsAffected: op.businessRows,
      rowsWrittenByFlush: storeRows,
      natureOfOperation: op.nature,
    });
  }

  return results;
}

export async function runConcurrencyBenchmarks(): Promise<ConcurrencyRunResult[]> {
  console.log('\n========================================');
  console.log('Running Concurrency Benchmark on Isolated Database');
  console.log('========================================');

  const concurrencyLevels = [1, 5, 10];
  const results: ConcurrencyRunResult[] = [];

  for (const concurrency of concurrencyLevels) {
    console.log(`\n[Concurrency] Running test with ${concurrency} concurrent coroutines in one process...`);

    // Ensure initial target row exists
    const setupPrisma = new PrismaClient({ datasources: { db: { url: BENCHMARK_DB_URL } } });
    const baseState = await loadRelationalRuntimeState(setupPrisma);
    if (!baseState) throw new Error('Failed to load base state for concurrency test');

    const targetJourneyId = 'journey_concurrency_target';
    let target = baseState.lifeJourneys.find((j: any) => j.id === targetJourneyId);
    if (!target) {
      target = {
        id: targetJourneyId,
        userId: 'user_demo',
        title: '并发竞争测试目标旅程',
        domain: '工作',
        status: 'active',
        stage: 'clarifying',
        visibility: 'PRIVATE',
        summary: 'v0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      baseState.lifeJourneys.unshift(target);
    } else {
      target.summary = 'v0';
    }
    await saveRelationalRuntimeState(setupPrisma, baseState);
    await setupPrisma.$disconnect();

    const runRecords: Array<{ id: number; success: boolean; error?: string }> = [];
    const writerIds = Array.from({ length: concurrency }, (_, i) => i + 1);

    // Launch concurrent coroutines simultaneously within this single Node process
    await Promise.all(
      writerIds.map(async (id) => {
        const prisma = new PrismaClient({ datasources: { db: { url: BENCHMARK_DB_URL } } });
        try {
          // Read phase: 43 parallel queries per coroutine
          const state = await loadRelationalRuntimeState(prisma);
          if (!state) throw new Error('State load failed');
          const row = state.lifeJourneys.find((j: any) => j.id === targetJourneyId);
          if (!row) throw new Error('Target journey not found');

          // Mutate in memory
          row.summary = (row.summary || '') + `|W${id}`;

          // Write phase: whole-store flush in interactive transaction
          await saveRelationalRuntimeState(prisma, state);
          runRecords.push({ id, success: true });
        } catch (err: any) {
          runRecords.push({ id, success: false, error: err.message ?? String(err) });
        } finally {
          await prisma.$disconnect();
        }
      })
    );

    // Inspect database row to detect observable lost updates among successful writes
    const verifyPrisma = new PrismaClient({ datasources: { db: { url: BENCHMARK_DB_URL } } });
    const finalState = await loadRelationalRuntimeState(verifyPrisma);
    const finalRow = finalState?.lifeJourneys.find((j: any) => j.id === targetJourneyId);
    await verifyPrisma.$disconnect();

    const finalSummary = finalRow?.summary ?? '';
    const successfulWriters = runRecords.filter(r => r.success).map(r => `W${r.id}`);
    const preservedWriters = successfulWriters.filter(w => finalSummary.includes(w));
    const lostUpdates = successfulWriters.length > 1 ? successfulWriters.length - preservedWriters.length : 0;

    const failures = runRecords.filter(r => !r.success);
    const timeouts = runRecords.filter(r => r.error && (r.error.includes('timeout') || r.error.includes('timed out'))).length;
    const connectionClosed = runRecords.filter(r => r.error && (r.error.includes('closed') || r.error.includes('connection') || r.error.includes('too many clients'))).length;
    const errorMessages = Array.from(new Set(failures.map(f => f.error?.slice(0, 120) ?? 'unknown')));

    console.log(`  Results for ${concurrency} concurrent coroutines:`);
    console.log(`  - Total attempts: ${concurrency}`);
    console.log(`  - Successes: ${successfulWriters.length}`);
    console.log(`  - Failures: ${failures.length}`);
    console.log(`  - Lost updates: ${lostUpdates} (observable among successfully committed writes)`);
    console.log(`  - Timeouts: ${timeouts}`);
    console.log(`  - Connection closed / pool exhausted: ${connectionClosed}`);
    if (errorMessages.length > 0) {
      console.log(`  - Sample errors: ${errorMessages.join(' | ')}`);
    }

    results.push({
      concurrency,
      attempts: concurrency,
      successes: successfulWriters.length,
      failures: failures.length,
      lostUpdates,
      timeouts,
      connectionClosed,
      errors: errorMessages,
    });
  }

  return results;
}

export async function main() {
  console.log('====================================================');
  console.log('PERSISTENCE WRITE GRAPH BENCHMARK (BEFORE MIGRATION)');
  console.log('====================================================');
  console.log(`Target database: ${BENCHMARK_DB_URL}`);
  console.log(`Dataset sizes: ${DATASET_SIZES.join(', ')} rows\n`);

  process.env.DATABASE_URL = BENCHMARK_DB_URL;
  process.env.VISUAL_FIXTURE_MODE = '1';
  process.env.FOLLOW_UP_QUEUE_NAME = 'goodnight-follow-ups-benchmark';
  process.env.REDIS_URL = 'redis://127.0.0.1:6379';

  // 1. Reset isolated database and apply prisma migrate deploy
  resetBenchmarkDatabase();

  const datasetResults: DatasetBenchmarkResult[] = [];

  for (const size of DATASET_SIZES) {
    console.log(`\n----------------------------------------------------`);
    console.log(`[DATASET SCALE] Seeding & Benchmarking ${size} rows...`);
    console.log(`----------------------------------------------------`);

    // Generate dataset
    const storeData = generateBenchmarkStoreData(size);
    const initialPrisma = new BenchmarkPrismaService();
    await initialPrisma.$connect();

    console.log(`[Seed] Flushing ${size} rows into isolated database...`);
    const tSeed0 = performance.now();
    await initialPrisma.saveRuntimeState(storeData);
    const seedDuration = performance.now() - tSeed0;
    console.log(`[Seed] Initial save completed in ${seedDuration.toFixed(1)} ms.`);

    // Measure boot and hydration time
    console.log(`[Boot] Measuring store hydration and boot duration...`);
    const { hydrationMs, bootMs } = await measureBootAndHydration(initialPrisma);
    console.log(`[Boot] Hydration time: ${hydrationMs} ms, Full boot time: ${bootMs} ms.`);

    // Initialize NestJS App with instrumented BenchmarkPrismaService
    const appPrisma = new BenchmarkPrismaService();
    await appPrisma.$connect();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaRuntimeService)
      .useValue(appPrisma)
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    // Run single-writer benchmark for all 5 operations
    const opResults = await runSingleWriterBenchmarks(app, appPrisma, size, size);

    await app.close();
    await appPrisma.$disconnect();
    await initialPrisma.$disconnect();

    datasetResults.push({
      datasetSize: size,
      actualStoreRows: size,
      hydrationTimeMs: hydrationMs,
      bootTimeMs: bootMs,
      operations: opResults,
    });
  }

  // Run concurrency benchmarks
  const concurrencyResults = await runConcurrencyBenchmarks();

  // Print readable summary tables
  console.log('\n====================================================');
  console.log('BENCHMARK RESULTS SUMMARY (BEFORE PERSISTENCE MIGRATION)');
  console.log('====================================================');

  console.log('\n--- 1. HYDRATION & BOOT DURATION BY DATASET SIZE ---');
  console.log('| Dataset Size | Hydration Time (ms) | Store Boot Time (ms) | Note |');
  console.log('|--------------|---------------------|----------------------|------|');
  for (const ds of datasetResults) {
    console.log(
      `| ${String(ds.datasetSize).padEnd(12)} | ${String(ds.hydrationTimeMs).padEnd(19)} | ${String(ds.bootTimeMs).padEnd(20)} | single sample, flush I/O variance |`
    );
  }

  console.log('\n--- 2. WRITE OPERATION BENCHMARKS (LATENCY & SQL STATEMENTS) ---');
  console.log(
    '| Operation | Dataset Size | p50 (ms) | p95 (ms) | max (ms) | SQL Statements (Avg) | Rows Flushed | Business Rows | Status |'
  );
  console.log(
    '|-----------|--------------|----------|----------|----------|----------------------|--------------|---------------|--------|'
  );
  for (const ds of datasetResults) {
    for (const op of ds.operations) {
      const statusStr = op.failedSamples > 0 ? `${op.successfulSamples}/${op.successfulSamples + op.failedSamples} ok` : '3/3 ok';
      console.log(
        `| ${op.operation.padEnd(25)} | ${String(ds.datasetSize).padEnd(12)} | ${String(op.p50Ms).padEnd(8)} | ${String(
          op.p95Ms
        ).padEnd(8)} | ${String(op.maxMs).padEnd(8)} | ${String(op.sqlStatementsAvg).padEnd(20)} | ${String(
          op.rowsWrittenByFlush
        ).padEnd(12)} | ${String(op.businessRowsAffected).padEnd(13)} | ${statusStr.padEnd(6)} |`
      );
    }
  }

  console.log('\n--- 3. CONCURRENCY BENCHMARK RESULTS ---');
  console.log('| Coroutines | Attempts | Successes | Failures | Lost Updates | Timeouts | Conn Closed / Pool Exhausted |');
  console.log('|------------|----------|-----------|----------|--------------|----------|------------------------------|');
  for (const cr of concurrencyResults) {
    console.log(
      `| ${String(cr.concurrency).padEnd(10)} | ${String(cr.attempts).padEnd(8)} | ${String(cr.successes).padEnd(
        9
      )} | ${String(cr.failures).padEnd(8)} | ${String(cr.lostUpdates).padEnd(12)} | ${String(cr.timeouts).padEnd(
        8
      )} | ${String(cr.connectionClosed).padEnd(28)} |`
    );
  }

  // Machine-readable artifact output
  const artifactDir = path.resolve('artifacts');
  await fs.mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, 'persistence-benchmark-results.json');

  const artifactData: FullBenchmarkArtifact = {
    timestamp: new Date().toISOString(),
    database: BENCHMARK_DB_NAME,
    methodology:
      'Direct SQL statement counting via Prisma query event logging ($on query) within interactive transaction; latency timing across 3 samples per operation; quiescence flushing between operations to eliminate cross-request background flush contamination; isolated PostgreSQL database migrated via prisma migrate deploy; multi-coroutine concurrency test assessing read-phase connection exhaustion.',
    system: {
      platform: process.platform,
      node: process.version,
      pgVersion: 'PostgreSQL 18.x on 127.0.0.1:15432',
    },
    datasets: datasetResults,
    concurrency: concurrencyResults,
  };

  await fs.writeFile(artifactPath, JSON.stringify(artifactData, null, 2), 'utf8');
  console.log(`\n[Artifact] Machine-readable results saved to: ${artifactPath}`);
}

// When invoked as CLI
if (process.argv[1]?.includes('persistence-benchmark')) {
  main().catch((err) => {
    console.error('Benchmark fatal error:', err);
    process.exit(1);
  });
}
