import 'reflect-metadata';

// Environment variables must be configured before importing any modules that evaluate configuration at import time
process.env.REDIS_URL ??= 'redis://127.0.0.1:16379';
process.env.FOLLOW_UP_QUEUE_NAME = 'goodnight-follow-ups-benchmark-after';
process.env.VISUAL_FIXTURE_MODE = '1';
process.env.GOODNIGHT_UPLOADS_DIR = 'artifacts/visual-fixtures/v1/runtime/uploads';

import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  loadRelationalRuntimeState,
  saveRelationalRuntimeState,
  isRelationalPrimary,
} from '../apps/api/src/relational-runtime.mapper.js';

// Configuration
const PG_HOST = process.env.TEST_PG_HOST ?? '127.0.0.1';
const PG_PORT = process.env.TEST_PG_PORT ?? process.env.PGPORT ?? '15432';
const PG_USER = process.env.TEST_PG_USER ?? 'goodnight';
const PG_PASSWORD = process.env.TEST_PG_PASSWORD ?? 'goodnight';
const PSQL_BIN = 'C:/Program Files/PostgreSQL/18/bin/psql.exe';

const DATASET_SIZES = [1_000, 12_600];
const ITERATIONS_PER_OP = 5;

// Instrumented Prisma Client to capture SQL statements via Prisma query events
export class BenchmarkPrismaService extends PrismaClient {
  public recording = false;
  public capturedQueries: Array<{ query: string; params?: string; duration?: number }> = [];

  constructor(url: string) {
    super({
      datasources: { db: { url } },
      log: [{ emit: 'event', level: 'query' }],
    });

    // @ts-expect-error query event overload
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

function execPsql(command: string) {
  const env = { ...process.env, PGPASSWORD: PG_PASSWORD };
  const res = spawnSync(
    PSQL_BIN,
    ['-h', PG_HOST, '-p', PG_PORT, '-U', PG_USER, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', command],
    { encoding: 'utf8', env, windowsHide: true },
  );
  if (res.error || res.status !== 0) {
    throw new Error(`psql error: ${res.error?.message ?? res.stderr ?? res.stdout}`);
  }
  return res.stdout.trim();
}

function countDatabaseRows(dbName: string): number {
  const env = { ...process.env, PGPASSWORD: PG_PASSWORD };
  const sql = `
    DO $$
    DECLARE
        rec RECORD;
        total BIGINT := 0;
        cnt BIGINT;
    BEGIN
        FOR rec IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' LOOP
            EXECUTE format('SELECT count(*) FROM public.%I', rec.tablename) INTO cnt;
            total := total + cnt;
        END LOOP;
        RAISE NOTICE 'TOTAL_ROWS=%', total;
    END
    $$;
  `;
  const res = spawnSync(PSQL_BIN, ['-h', PG_HOST, '-p', PG_PORT, '-U', PG_USER, '-d', dbName, '-c', sql], {
    encoding: 'utf8',
    env,
    windowsHide: true,
  });
  const match = (res.stderr + res.stdout).match(/TOTAL_ROWS=(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export function generateBenchmarkStoreData(targetCount: number) {
  const now = new Date('2026-10-04T00:00:00.000Z');
  const nowStr = now.toISOString();

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
    {
      id: 'faq_1',
      question: '树洞数据安全吗？',
      answer: '所有数据经过加密和隐私保护。',
      sortOrder: 1,
      enabled: true,
      createdAt: nowStr,
    },
    {
      id: 'faq_2',
      question: '如何联系同路人？',
      answer: '通过匿名匹配机制可以建立同行交流。',
      sortOrder: 2,
      enabled: true,
      createdAt: nowStr,
    },
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
  const followUpJobs: any[] = [];

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
    const fuId = `followup_bench_${i}`;

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
      description: `行动描述 ${i}`,
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

    followUpJobs.push({
      id: fuId,
      userId: 'user_demo',
      journeyId: jId,
      kind: 'action_checkin',
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      status: 'pending',
      payload: { actionId: actId },
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

  // Pre-seed dedicated follow-up jobs for worker delivery benchmark
  for (let w = 0; w < ITERATIONS_PER_OP; w++) {
    followUpJobs.push({
      id: `followup_worker_bench_${w}`,
      userId: 'user_demo',
      journeyId: 'journey_bench_0',
      kind: 'action_checkin',
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      status: 'pending',
      payload: { actionId: 'action_bench_0' },
      createdAt: nowStr,
    });
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
    followUpJobs,
    notifications,
    peerConversations,
    peerMessages,
    peerReports: [],
    adminUserNotes: [],
  };
}

export async function seedIsolatedDatabase(prisma: PrismaClient, storeData: any) {
  const date = (d: any) => (d ? new Date(d) : new Date());

  // 1. Users, Admins, Privacy, AI Providers, System Config
  await prisma.user.createMany({
    data: storeData.users.map((u: any) => ({
      id: u.id,
      openid: u.openid,
      nickname: u.nickname,
      anonymousCode: u.anonymousCode,
      avatarUrl: u.avatarUrl,
      status: u.status ?? 'normal',
      createdAt: date(u.createdAt),
      updatedAt: date(u.updatedAt ?? u.createdAt),
    })),
  });
  await prisma.adminRole.createMany({
    data: [{ id: 'role_super_admin', code: 'super_admin', name: '超级管理员', permissions: [] }],
  });
  await prisma.adminUser.createMany({
    data: storeData.adminUsers.map((a: any) => ({
      id: a.id,
      username: a.username,
      passwordHash: a.passwordHash,
      displayName: a.displayName,
      roleId: `role_${a.role || 'super_admin'}`,
      status: a.status,
      createdAt: date(a.createdAt),
      updatedAt: date(a.updatedAt ?? a.createdAt),
    })),
  });
  await prisma.privacySetting.createMany({
    data: Object.entries(storeData.privacySettings).map(([userId, p]: [string, any]) => ({
      id: `priv_${userId}`,
      userId,
      defaultVisibility: p.defaultVisibility ?? 'PRIVATE',
      allowAnonymousPublic: p.allowAnonymousPublic ?? true,
      allowHumanReplies: p.allowHumanReplies ?? true,
      allowMonthlyReportShare: p.allowMonthlyReportShare ?? true,
      allowPeerMatching: p.allowPeerMatching ?? true,
      allowAnonymousExperienceStats: p.allowAnonymousExperienceStats ?? true,
      allowRecoveryData: p.allowRecoveryData ?? true,
      allowJourneyLongTermAnalysis: p.allowJourneyLongTermAnalysis ?? true,
      allowLongTermMemory: p.allowLongTermMemory ?? true,
      allowAiMemoryUse: p.allowAiMemoryUse ?? true,
      allowAnonymousExperienceShare: p.allowAnonymousExperienceShare ?? true,
      allowJourneyArchiveRetention: p.allowJourneyArchiveRetention ?? true,
      allowFutureSelfNotifications: p.allowFutureSelfNotifications ?? true,
      allowDataExport: p.allowDataExport ?? true,
      createdAt: date(p.createdAt),
      updatedAt: date(p.updatedAt ?? p.createdAt),
    })),
  });
  await prisma.aIProvider.createMany({
    data: storeData.aiProviders.map((p: any) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      baseUrl: p.baseUrl,
      modelName: p.modelName,
      apiKeyStatus: p.apiKeyStatus,
      enabled: p.enabled,
      priority: p.priority,
      dailyLimit: p.dailyLimit,
      timeoutSeconds: p.timeoutSeconds,
      failoverEnabled: p.failoverEnabled,
      usageTags: p.usageTags ?? [],
      failureRate: p.failureRate ?? 0,
      avgLatencyMs: p.avgLatencyMs ?? 0,
      todayCalls: p.todayCalls ?? 0,
      providerKind: p.providerKind,
      createdAt: date(p.createdAt),
      updatedAt: date(p.updatedAt ?? p.createdAt),
    })),
  });
  await prisma.aIStyleRoute.createMany({
    data: storeData.aiRoutes.map((r: any) => ({
      id: r.id,
      style: r.style,
      label: r.label,
      primaryProviderId: r.primaryProviderId,
      backupProviderId: r.backupProviderId,
      fallbackTemplateId: r.fallbackTemplateId,
      promptVersion: r.promptVersion,
      promptTemplate: r.promptTemplate,
      enabled: r.enabled,
      routeVersion: r.routeVersion,
      updatedAt: date(r.updatedAt ?? r.createdAt),
    })),
  });
  await prisma.feedbackCategory.createMany({
    data: storeData.feedbackCategories.map((c: any) => ({
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      enabled: c.enabled,
    })),
  });
  await prisma.faqItem.createMany({
    data: storeData.faqs.map((f: any) => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
      sortOrder: f.sortOrder,
      enabled: f.enabled,
      createdAt: date(f.createdAt),
      updatedAt: date(f.updatedAt ?? f.createdAt),
    })),
  });
  await prisma.replyPreset.createMany({
    data: storeData.replyPresets.map((rp: any) => ({
      id: rp.id,
      text: rp.text,
      scene: rp.scene,
      sortOrder: rp.sortOrder,
      enabled: rp.enabled,
      createdAt: date(rp.createdAt),
      updatedAt: date(rp.updatedAt ?? rp.createdAt),
    })),
  });
  await prisma.systemSetting.createMany({
    data: Object.entries(storeData.systemSettings).map(([key, s]: [string, any]) => ({
      key,
      value: s.value,
      description: s.description ?? key,
      updatedAt: date(s.updatedAt ?? s.createdAt),
    })),
  });

  // 2. Migrated tables (LifeJourney hierarchy)
  await prisma.lifeJourney.createMany({
    data: storeData.lifeJourneys.map((j: any) => ({
      id: j.id,
      userId: j.userId,
      title: j.title,
      domain: j.domain,
      status: j.status ?? 'active',
      stage: j.stage ?? 'clarifying',
      visibility: j.visibility ?? 'PRIVATE',
      intensity: j.intensity == null ? null : Number(j.intensity),
      summary: j.summary ?? null,
      createdAt: date(j.createdAt),
      updatedAt: date(j.updatedAt ?? j.createdAt),
    })),
  });
  await prisma.situationSnapshot.createMany({
    data: storeData.situationSnapshots.map((s: any) => ({
      id: s.id,
      journeyId: s.journeyId,
      facts: s.facts,
      feelings: s.feelings,
      needs: s.needs,
      constraints: s.constraints,
      risks: s.risks,
      domain: s.domain,
      confidence: s.confidence ?? 'agent_draft',
      createdAt: date(s.createdAt),
      updatedAt: date(s.updatedAt ?? s.createdAt),
    })),
  });
  await prisma.journeyUpdate.createMany({
    data: storeData.journeyUpdates.map((u: any) => ({
      id: u.id,
      journeyId: u.journeyId,
      userId: u.userId,
      kind: u.kind,
      content: u.content,
      createdAt: date(u.createdAt),
    })),
  });
  await prisma.actionCommitment.createMany({
    data: storeData.actionCommitments.map((a: any) => ({
      id: a.id,
      journeyId: a.journeyId,
      userId: a.userId,
      title: a.title,
      description: a.description ?? null,
      status: a.status ?? 'active',
      dueAt: date(a.dueAt),
      createdAt: date(a.createdAt),
      updatedAt: date(a.updatedAt ?? a.createdAt),
    })),
  });
  await prisma.outcomeCheckin.createMany({
    data: storeData.outcomeCheckins.map((c: any) => ({
      id: c.id,
      journeyId: c.journeyId,
      commitmentId: c.commitmentId,
      userId: c.userId,
      status: c.status ?? 'pending',
      dueAt: date(c.dueAt),
      createdAt: date(c.createdAt),
    })),
  });
  await prisma.safetyEvent.createMany({
    data: storeData.safetyEvents.map((s: any) => ({
      id: s.id,
      userId: s.userId,
      journeyId: s.journeyId ?? null,
      level: s.level,
      source: s.source,
      action: s.action,
      payload: s.payload,
      status: s.status ?? 'open',
      createdAt: date(s.createdAt),
    })),
  });
  await prisma.userNotification.createMany({
    data: storeData.notifications.map((n: any) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      status: n.status ?? 'unread',
      createdAt: date(n.createdAt),
    })),
  });
  await prisma.aIJob.createMany({
    data: storeData.aiJobs.map((j: any) => ({
      id: j.id,
      userId: j.userId,
      contentId: j.contentId,
      contentType: j.contentType,
      jobType: j.jobType,
      style: j.style,
      providerId: j.providerId,
      modelName: j.modelName,
      status: j.status ?? 'succeeded',
      promptSummary: j.promptSummary,
      result: j.result,
      durationMs: j.durationMs,
      retryCount: j.retryCount,
      fallbackUsed: j.fallbackUsed,
      traceJson: j.traceJson ?? [],
      routeVersion: j.routeVersion ?? 1,
      createdAt: date(j.createdAt),
      updatedAt: date(j.updatedAt ?? j.createdAt),
    })),
  });

  // 3. Unmigrated/Legacy Tables
  await prisma.mood.createMany({
    data: storeData.moods.map((m: any) => ({
      id: m.id,
      userId: m.userId,
      emotion: m.emotion,
      content: m.content,
      visibility: m.visibility ?? 'PUBLIC',
      riskLevel: m.riskLevel ?? 'low',
      riskScore: m.riskScore ?? 0.1,
      status: m.status ?? 'active',
      journeyId: m.journeyId ?? null,
      createdAt: date(m.createdAt),
      updatedAt: date(m.updatedAt ?? m.createdAt),
    })),
  });
  await prisma.post.createMany({
    data: storeData.posts.map((p: any) => ({
      id: p.id,
      moodId: p.moodId ?? null,
      userId: p.userId,
      emotion: p.emotion,
      content: p.content,
      visibility: p.visibility ?? 'PUBLIC',
      status: p.status ?? 'active',
      reviewStatus: p.reviewStatus ?? 'published',
      hugCount: p.hugCount ?? 0,
      replyCount: p.replyCount ?? 0,
      favoriteCount: p.favoriteCount ?? 0,
      reportCount: p.reportCount ?? 0,
      journeyId: p.journeyId ?? null,
      createdAt: date(p.createdAt),
      updatedAt: date(p.updatedAt ?? p.createdAt),
    })),
  });
  await prisma.reply.createMany({
    data: storeData.replies.map((r: any) => ({
      id: r.id,
      postId: r.postId,
      userId: r.userId,
      type: r.type ?? 'USER',
      style: r.style ?? 'warm',
      content: r.content,
      status: r.status ?? 'published',
      riskLevel: r.riskLevel ?? 'low',
      likeCount: r.likeCount ?? 0,
      createdAt: date(r.createdAt),
      updatedAt: date(r.updatedAt ?? r.createdAt),
    })),
  });
  await prisma.auditLog.createMany({
    data: storeData.auditLogs.map((a: any) => ({
      id: a.id,
      adminUserId: a.adminUserId,
      action: a.action,
      resourceType: a.resourceType,
      resourceId: a.resourceId,
      createdAt: date(a.createdAt),
    })),
  });
  await prisma.peerExperience.createMany({
    data: storeData.peerExperiences.map((e: any) => ({
      id: e.id,
      userId: e.userId,
      journeyId: e.journeyId ?? null,
      title: e.title,
      domain: e.domain,
      stage: e.stage,
      content: e.content,
      tags: e.tags ?? [],
      consentedAt: date(e.consentedAt),
      status: e.status ?? 'published',
      reportCount: e.reportCount ?? 0,
      createdAt: date(e.createdAt),
      updatedAt: date(e.updatedAt ?? e.createdAt),
    })),
  });
  await prisma.peerMatch.createMany({
    data: storeData.peerMatches.map((m: any) => ({
      id: m.id,
      userId: m.userId,
      journeyId: m.journeyId ?? null,
      peerExperienceId: m.peerExperienceId,
      score: m.score ?? 80,
      reasons: m.reasons ?? [],
      status: m.status ?? 'connected',
      acceptedAt: date(m.acceptedAt),
      createdAt: date(m.createdAt),
      updatedAt: date(m.updatedAt ?? m.createdAt),
    })),
  });
  await prisma.peerConversation.createMany({
    data: storeData.peerConversations.map((c: any) => ({
      id: c.id,
      matchId: c.matchId,
      starterUserId: c.starterUserId,
      receiverUserId: c.receiverUserId,
      status: c.status ?? 'active',
      startsAt: date(c.startsAt),
      expiresAt: date(c.expiresAt),
      createdAt: date(c.createdAt),
    })),
  });
  await prisma.peerMessage.createMany({
    data: storeData.peerMessages.map((m: any) => ({
      id: m.id,
      conversationId: m.conversationId,
      senderUserId: m.senderUserId,
      content: m.content,
      authorType: m.authorType ?? 'HUMAN',
      piiFlags: m.piiFlags ?? [],
      createdAt: date(m.createdAt),
    })),
  });
  await prisma.diary.createMany({
    data: storeData.diaries.map((d: any) => ({
      id: d.id,
      userId: d.userId,
      journeyId: d.journeyId ?? null,
      emotion: d.emotion,
      content: d.content,
      hasLetter: d.hasLetter ?? false,
      createdAt: date(d.createdAt),
      updatedAt: date(d.updatedAt ?? d.createdAt),
    })),
  });
  await prisma.letter.createMany({
    data: storeData.letters.map((l: any) => ({
      id: l.id,
      userId: l.userId,
      sourceMoodId: l.sourceMoodId ?? null,
      style: l.style ?? 'warm',
      title: l.title,
      content: l.content,
      status: l.status ?? 'read',
      savedToDiary: l.savedToDiary ?? false,
      createdAt: date(l.createdAt),
      updatedAt: date(l.updatedAt ?? l.createdAt),
    })),
  });
  await prisma.memoryItem.createMany({
    data: storeData.memoryItems.map((m: any) => ({
      id: m.id,
      userId: m.userId,
      journeyId: m.journeyId ?? null,
      category: m.category,
      title: m.title,
      content: m.content,
      source: m.source,
      scope: m.scope,
      status: m.status ?? 'active',
      consentedAt: date(m.consentedAt),
      expiresAt: date(m.expiresAt),
      createdAt: date(m.createdAt),
      updatedAt: date(m.updatedAt ?? m.createdAt),
    })),
  });
  await prisma.followUpJob.createMany({
    data: storeData.followUpJobs.map((f: any) => ({
      id: f.id,
      userId: f.userId,
      journeyId: f.journeyId ?? null,
      kind: f.kind,
      dueAt: date(f.dueAt),
      status: f.status ?? 'pending',
      payload: f.payload,
      completedAt: f.completedAt ? date(f.completedAt) : null,
      createdAt: date(f.createdAt),
    })),
  });

  // 4. RuntimeState
  await prisma.runtimeState.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      payload: {
        schemaVersion: 2,
        persistence: 'relational-primary',
        compatibilitySnapshotAt: new Date().toISOString(),
      },
    },
    update: {
      payload: {
        schemaVersion: 2,
        persistence: 'relational-primary',
        compatibilitySnapshotAt: new Date().toISOString(),
      },
    },
  });
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

export interface OperationModeMetric {
  mode: 'A' | 'B';
  modeLabel: string;
  sampleCount: number;
  successfulSamples: number;
  failedSamples: number;
  durationsMs: number[];
  p50Ms: number;
  maxMs: number;
  minMs: number;
  sqlStatementsAvg: number;
  sqlStatementsPerSample: number[];
  failedSampleIndices: number[];
  errorNotes?: string;
  statementBreakdown: {
    selects: number;
    upserts: number;
    inserts: number;
    updates: number;
    deletes: number;
    transactionControl: number;
    others: number;
  };
  sampleStatementList?: string[];
  allSampleStatementLists?: string[][];
}

export interface OperationBenchmarkResult {
  operation: string;
  endpoint: string;
  datasetSize: number;
  actualDbRows: number;
  natureOfOperation: string;
  isAiTriggering: boolean;
  modeA: OperationModeMetric;
  modeB: OperationModeMetric;
}

export interface DatasetBenchmarkResult {
  datasetSize: number;
  actualDbRows: number;
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
  durationsMs: number[];
  p50Ms: number;
  maxMs: number;
  statementsAvg: number;
  errors: string[];
}

async function runSingleWriterBenchmarks(
  app: any,
  prisma: BenchmarkPrismaService,
  datasetSize: number,
  actualDbRows: number,
  StoreService: any,
  FollowUpWorkerService: any,
): Promise<OperationBenchmarkResult[]> {
  const server = app.getHttpServer();
  const store = app.get(StoreService);
  const workerService = app.get(FollowUpWorkerService);
  const results: OperationBenchmarkResult[] = [];

  // Ensure store write queue is clean before benchmarking operations
  await store.flush();

  const operations = [
    {
      name: 'createJourney',
      endpoint: 'POST /api/v1/journeys',
      nature: 'Direct DB write: LifeJourney + SituationSnapshot + JourneyUpdate + AIJob (queued)',
      isAiTriggering: true,
      execute: (idx: number, mode: string) =>
        request(server)
          .post('/api/v1/journeys')
          .set('x-goodnight-user-id', 'user_demo')
          .send({
            title: `基准测试旅程 ${mode} ${idx}`,
            domain: '工作',
            content: `测试创建新旅程内容 ${mode} ${idx}，这是一段用于基准测试的详尽描述。`,
            intensity: 5,
          }),
    },
    {
      name: 'createJourneyHighRisk',
      endpoint: 'POST /api/v1/journeys (high-risk)',
      nature: 'Direct DB write: LifeJourney + SituationSnapshot + JourneyUpdate + SafetyEvent + AIJob (queued)',
      isAiTriggering: true,
      execute: (idx: number, mode: string) =>
        request(server)
          .post('/api/v1/journeys')
          .set('x-goodnight-user-id', 'user_demo')
          .send({
            title: `高危安全旅程 ${mode} ${idx}`,
            domain: '其他',
            content: `我感到极度绝望，想要自伤伤害别人，非常痛苦 ${mode} ${idx}`,
            intensity: 9,
          }),
    },
    {
      name: 'checkinAction',
      endpoint: 'POST /api/v1/actions/:id/checkin',
      nature:
        'Direct DB transaction: Lock User->Journey->Action, CAS OutcomeCheckin, JourneyUpdate, update Action + Journey + FollowUpJob',
      isAiTriggering: false,
      execute: (idx: number, mode: string) =>
        request(server)
          .post(`/api/v1/actions/action_bench_${idx}/checkin`)
          .set('x-goodnight-user-id', 'user_demo')
          .send({
            status: 'completed',
            reflection: `行动已顺利完成，感觉清晰很多 ${mode} ${idx}`,
            result: '完成了全部步骤',
            intensity: 2,
          }),
    },
    {
      name: 'deliverFollowUp',
      endpoint: 'FollowUpWorkerService.deliver (worker path)',
      nature:
        'Worker delivery: claim FollowUpJob (tx), store.reloadRuntimeState (reads legacy models), create UserNotification',
      isAiTriggering: false,
      execute: async (idx: number, _mode: string) => {
        const jobId = `followup_worker_bench_${idx}`;
        const deliverResult = await (workerService as any).deliver({
          id: jobId,
          kind: 'action_checkin',
          userId: 'user_demo',
          journeyId: 'journey_bench_0',
          payload: { actionId: 'action_bench_0' },
        });
        return { status: 200, body: deliverResult };
      },
    },
    {
      name: 'readNotifications',
      endpoint: 'GET /api/v1/notifications',
      nature: 'Direct DB query: listUserNotifications (findMany with indexed userId)',
      isAiTriggering: false,
      execute: () => request(server).get('/api/v1/notifications').set('x-goodnight-user-id', 'user_demo').send(),
    },
    {
      name: 'readJourneyDetail',
      endpoint: 'GET /api/v1/journeys/:id',
      nature: 'Direct DB query: journeyDetail (LifeJourney + SituationSnapshot + updates + commitments + checkins)',
      isAiTriggering: false,
      execute: () =>
        request(server).get('/api/v1/journeys/journey_bench_0').set('x-goodnight-user-id', 'user_demo').send(),
    },
    {
      name: 'readNotification (PATCH)',
      endpoint: 'PATCH /api/v1/notifications/:id/read',
      nature: 'Direct DB write: markNotificationRead (findFirst + updateMany + findUnique)',
      isAiTriggering: false,
      execute: (idx: number) =>
        request(server)
          .patch(`/api/v1/notifications/notif_bench_${idx}/read`)
          .set('x-goodnight-user-id', 'user_demo')
          .send(),
    },
    {
      name: 'writeAction (POST)',
      endpoint: 'POST /api/v1/journeys/:id/actions',
      nature:
        'Direct DB write: createActionCommitment (Lock User->Journey, create Action + Checkin + Update + FollowUpJob)',
      isAiTriggering: false,
      execute: (idx: number, mode: string) =>
        request(server)
          .post('/api/v1/journeys/journey_bench_0/actions')
          .set('x-goodnight-user-id', 'user_demo')
          .send({
            title: `基准新增行动承诺 ${mode} ${idx}`,
            description: `行动承诺详细描述 ${mode} ${idx}`,
          }),
    },
  ];

  for (const op of operations) {
    console.log(`\n  ================================================================`);
    console.log(`  Benchmarking ${op.name} (${op.endpoint}) across ${ITERATIONS_PER_OP} iterations`);
    console.log(`  ================================================================`);

    // Reset helper to ensure clean repeatable database state before each mode
    const resetOpState = async () => {
      if (op.name === 'checkinAction') {
        for (let k = 0; k < ITERATIONS_PER_OP; k++) {
          await (prisma as any).outcomeCheckin.updateMany({
            where: { commitmentId: `action_bench_${k}` },
            data: { status: 'pending', reflection: null, result: null },
          });
          await (prisma as any).actionCommitment.updateMany({
            where: { id: `action_bench_${k}` },
            data: { status: 'active' },
          });
          await (prisma as any).followUpJob.updateMany({
            where: { userId: 'user_demo', kind: 'action_checkin' },
            data: { status: 'pending', completedAt: null },
          });
        }
      } else if (op.name === 'deliverFollowUp') {
        for (let k = 0; k < ITERATIONS_PER_OP; k++) {
          await (prisma as any).followUpJob.updateMany({
            where: { id: `followup_worker_bench_${k}` },
            data: { status: 'pending', completedAt: null },
          });
          await (prisma as any).userNotification.deleteMany({
            where: { id: `notification_followup_worker_bench_${k}` },
          });
        }
      } else if (op.name === 'readNotification (PATCH)') {
        for (let k = 0; k < ITERATIONS_PER_OP; k++) {
          await (prisma as any).userNotification.updateMany({
            where: { id: `notif_bench_${k}` },
            data: { status: 'unread' },
          });
        }
      }
      try {
        await store.flush();
      } catch {
        (store as any).persistenceError = undefined;
      }
    };

    // Helper to run 5 iterations for a specific mode
    const runMode = async (modeType: 'A' | 'B'): Promise<OperationModeMetric> => {
      const modeLabel =
        modeType === 'A' ? 'Mode A (Synchronous Request)' : 'Mode B (Fully Drained Lifecycle)';
      console.log(`  -> Running ${modeLabel}...`);

      await resetOpState();

      const successfulDurations: number[] = [];
      const allDurations: number[] = [];
      const successfulStatementCounts: number[] = [];
      const allStatementCounts: number[] = [];
      const failedIndices: number[] = [];
      const allSampleStatements: string[][] = [];
      let lastSuccessfulQueries: Array<{ query: string; params?: string }> = [];
      let errorNotes: string | undefined;

      for (let i = 0; i < ITERATIONS_PER_OP; i++) {
        // Pre-sample quiescence
        try {
          await store.flush();
        } catch {
          (store as any).persistenceError = undefined;
        }

        let origApply: any;
        if (modeType === 'A' && op.isAiTriggering) {
          origApply = store.applySituationAnalysisCompletion.bind(store);
          store.applySituationAnalysisCompletion = async () => {};
        }

        prisma.startRecording();
        const t0 = performance.now();
        const res = await op.execute(i, modeType);

        if (modeType === 'B') {
          // In Mode B: background work is awaited INSIDE the sample window
          if (op.isAiTriggering) {
            try {
              await store.drainPendingAiCompletions();
            } catch {
              /* ignore background drain error */
            }
          }
          try {
            await store.flush();
          } catch {
            (store as any).persistenceError = undefined;
          }
        }

        const t1 = performance.now();
        const queries = prisma.stopRecording();
        const durationMs = t1 - t0;

        if (modeType === 'A') {
          // In Mode A: background work is drained OUTSIDE the sample window
          if (op.isAiTriggering) {
            store.applySituationAnalysisCompletion = origApply;
            try {
              await store.drainPendingAiCompletions();
            } catch {
              /* ignore background drain error */
            }
          }
          try {
            await store.flush();
          } catch {
            (store as any).persistenceError = undefined;
          }
        }

        console.log(
          `    [${modeType} iter ${i + 1}/${ITERATIONS_PER_OP}] status: ${res.status}, duration: ${durationMs.toFixed(1)} ms, statements: ${queries.length}`,
        );

        allDurations.push(durationMs);
        allStatementCounts.push(queries.length);
        allSampleStatements.push(queries.map((q) => q.query));

        if (res.status >= 500) {
          failedIndices.push(i);
          errorNotes = `Iteration ${i + 1} failed (HTTP ${res.status}). Excluded from successful samples.`;
          console.warn(`    ⚠️ ${errorNotes}`);
        } else if (res.status >= 400) {
          throw new Error(`Operation ${op.name} failed with status ${res.status}: ${JSON.stringify(res.body)}`);
        } else {
          successfulDurations.push(durationMs);
          successfulStatementCounts.push(queries.length);
          lastSuccessfulQueries = queries;
        }
      }

      // Pre-sample quiescence before next mode
      try {
        await store.flush();
      } catch {
        (store as any).persistenceError = undefined;
      }

      const targetDurations = successfulDurations.length > 0 ? successfulDurations : allDurations;
      const targetStatementCounts =
        successfulStatementCounts.length > 0 ? successfulStatementCounts : allStatementCounts;

      const p50 = percentile(targetDurations, 50);
      const max = Math.max(...targetDurations);
      const min = Math.min(...targetDurations);
      const avgStatements = Math.round(
        targetStatementCounts.reduce((a, b) => a + b, 0) / targetStatementCounts.length,
      );

      // Analyze statement breakdown from the last successful sample
      const breakdownSource =
        lastSuccessfulQueries.length > 0 ? lastSuccessfulQueries : prisma.capturedQueries;
      const selects = breakdownSource.filter((q) => q.query.startsWith('SELECT')).length;
      const upserts = breakdownSource.filter((q) => q.query.includes('ON CONFLICT')).length;
      const inserts = breakdownSource.filter(
        (q) => q.query.startsWith('INSERT INTO') && !q.query.includes('ON CONFLICT'),
      ).length;
      const updates = breakdownSource.filter((q) => q.query.startsWith('UPDATE')).length;
      const deletes = breakdownSource.filter((q) => q.query.startsWith('DELETE FROM')).length;
      const transactionControl = breakdownSource.filter(
        (q) => q.query === 'BEGIN' || q.query === 'COMMIT' || q.query === 'ROLLBACK',
      ).length;
      const others =
        breakdownSource.length - (selects + upserts + inserts + updates + deletes + transactionControl);

      // Detailed sample 1 vs steady-state trace check
      if (allSampleStatements.length >= 2 && allSampleStatements[0].length !== allSampleStatements[1].length) {
        console.log(
          `    [Trace Audit] Outlier in Sample 1 (${allSampleStatements[0].length} stmts vs Sample 2 ${allSampleStatements[1].length} stmts):`,
        );
        const extraQueries = allSampleStatements[0].filter((q) => !allSampleStatements[1].includes(q));
        console.log(`      Extra queries count: ${extraQueries.length}`);
        for (const eq of extraQueries.slice(0, 5)) {
          console.log(`      -> ${eq.slice(0, 100)}...`);
        }
      }

      return {
        mode: modeType,
        modeLabel,
        sampleCount: ITERATIONS_PER_OP,
        successfulSamples: successfulDurations.length,
        failedSamples: failedIndices.length,
        durationsMs: allDurations.map((d) => Number(d.toFixed(1))),
        p50Ms: Number(p50.toFixed(1)),
        maxMs: Number(max.toFixed(1)),
        minMs: Number(min.toFixed(1)),
        sqlStatementsAvg: avgStatements,
        sqlStatementsPerSample: allStatementCounts,
        failedSampleIndices: failedIndices,
        errorNotes,
        statementBreakdown: {
          selects,
          upserts,
          inserts,
          updates,
          deletes,
          transactionControl,
          others,
        },
        sampleStatementList: breakdownSource.map((q) => q.query.slice(0, 100)),
        allSampleStatementLists: allSampleStatements.map((stmts) => stmts.map((q) => q.slice(0, 100))),
      };
    };

    const modeA = await runMode('A');
    const modeB = await runMode('B');

    results.push({
      operation: op.name,
      endpoint: op.endpoint,
      datasetSize,
      actualDbRows,
      natureOfOperation: op.nature,
      isAiTriggering: op.isAiTriggering,
      modeA,
      modeB,
    });
  }

  return results;
}

export async function runConcurrencyBenchmarks(dbUrl: string): Promise<ConcurrencyRunResult[]> {
  console.log('\n================================================================');
  console.log('Running Direct DB Concurrency Benchmark on Isolated Database');
  console.log('================================================================');

  const concurrencyLevels = [1, 5, 10];
  const results: ConcurrencyRunResult[] = [];
  const targetJourneyId = 'journey_concurrency_target';

  // Seed target journey
  const setupPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  await setupPrisma.lifeJourney.upsert({
    where: { id: targetJourneyId },
    create: {
      id: targetJourneyId,
      userId: 'user_demo',
      title: '并发竞争测试目标旅程',
      domain: '工作',
      status: 'active',
      stage: 'clarifying',
      visibility: 'PRIVATE',
      summary: 'v0',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    update: { summary: 'v0' },
  });
  await setupPrisma.$disconnect();

  for (const concurrency of concurrencyLevels) {
    console.log(`\n[Concurrency] Running test with ${concurrency} concurrent coroutines in one process...`);
    const runRecords: Array<{ id: number; success: boolean; durationMs: number; error?: string; statements: number }> =
      [];
    const writerIds = Array.from({ length: concurrency }, (_, i) => i + 1);

    await Promise.all(
      writerIds.map(async (id) => {
        const prisma = new BenchmarkPrismaService(dbUrl);
        prisma.startRecording();
        const t0 = performance.now();
        try {
          await prisma.$transaction(async (tx) => {
            await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id = 'user_demo' FOR UPDATE`);
            await tx.$queryRaw(Prisma.sql`SELECT id FROM "LifeJourney" WHERE id = ${targetJourneyId} FOR UPDATE`);
            const row = await tx.lifeJourney.findUnique({ where: { id: targetJourneyId } });
            if (!row) throw new Error('Target journey not found');
            await tx.lifeJourney.update({
              where: { id: targetJourneyId },
              data: { summary: (row.summary ?? '') + `|W${id}` },
            });
          });
          const dur = performance.now() - t0;
          const queries = prisma.stopRecording();
          runRecords.push({ id, success: true, durationMs: dur, statements: queries.length });
        } catch (err: any) {
          const dur = performance.now() - t0;
          const queries = prisma.stopRecording();
          runRecords.push({
            id,
            success: false,
            durationMs: dur,
            error: err.message ?? String(err),
            statements: queries.length,
          });
        } finally {
          await prisma.$disconnect();
        }
      }),
    );

    // Verify row to detect lost updates
    const verifyPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    const finalRow = await verifyPrisma.lifeJourney.findUnique({ where: { id: targetJourneyId } });
    await verifyPrisma.$disconnect();

    const finalSummary = finalRow?.summary ?? '';
    const successfulWriters = runRecords.filter((r) => r.success).map((r) => `W${r.id}`);
    const preservedWriters = successfulWriters.filter((w) => finalSummary.includes(w));
    const lostUpdates = successfulWriters.length - preservedWriters.length;

    const failures = runRecords.filter((r) => !r.success);
    const timeouts = runRecords.filter(
      (r) => r.error && (r.error.includes('timeout') || r.error.includes('timed out')),
    ).length;
    const connectionClosed = runRecords.filter(
      (r) =>
        r.error &&
        (r.error.includes('closed') || r.error.includes('connection') || r.error.includes('too many clients')),
    ).length;
    const errorMessages = Array.from(new Set(failures.map((f) => f.error?.slice(0, 120) ?? 'unknown')));

    const durations = runRecords.filter((r) => r.success).map((r) => r.durationMs);
    const p50 = percentile(durations, 50);
    const max = durations.length > 0 ? Math.max(...durations) : 0;
    const avgStatements =
      runRecords.length > 0 ? Math.round(runRecords.reduce((a, b) => a + b.statements, 0) / runRecords.length) : 0;

    console.log(`  Results for ${concurrency} concurrent coroutines:`);
    console.log(`  - Total attempts: ${concurrency}`);
    console.log(
      `  - Successes: ${successfulWriters.length} (${((successfulWriters.length / concurrency) * 100).toFixed(0)}%)`,
    );
    console.log(`  - Failures: ${failures.length}`);
    console.log(`  - Lost updates: ${lostUpdates}`);
    console.log(`  - Timeouts: ${timeouts}`);
    console.log(`  - Connection closed / pool exhausted: ${connectionClosed}`);
    console.log(`  - Latency: p50 = ${p50.toFixed(1)} ms, max = ${max.toFixed(1)} ms`);

    results.push({
      concurrency,
      attempts: concurrency,
      successes: successfulWriters.length,
      failures: failures.length,
      lostUpdates,
      timeouts,
      connectionClosed,
      durationsMs: durations.map((d) => Number(d.toFixed(1))),
      p50Ms: Number(p50.toFixed(1)),
      maxMs: Number(max.toFixed(1)),
      statementsAvg: avgStatements,
      errors: errorMessages,
    });
  }

  return results;
}

export async function runBenchmark() {
  console.log('================================================================');
  console.log('PERSISTENCE WRITE GRAPH BENCHMARK (AFTER BATCH 1 MIGRATION)');
  console.log('================================================================');
  console.log(`PostgreSQL: ${PG_HOST}:${PG_PORT}, user: ${PG_USER}`);
  console.log(`Target dataset scales: ${DATASET_SIZES.join(', ')} rows\n`);

  // Dynamically import app modules AFTER environment variables are guaranteed to be initialized
  const { AppModule } = await import('../apps/api/src/app.module.js');
  const { PrismaRuntimeService } = await import('../apps/api/src/prisma-runtime.service.js');
  const { StoreService } = await import('../apps/api/src/store.service.js');
  const { FollowUpWorkerService } = await import('../apps/api/src/follow-up-worker.service.js');

  const datasetResults: DatasetBenchmarkResult[] = [];
  let concurrencyResults: ConcurrencyRunResult[] = [];

  for (const size of DATASET_SIZES) {
    const dbName = `goodnight_benchmark_after_${size}`;
    const dbUrl = `postgresql://${PG_USER}:${encodeURIComponent(PG_PASSWORD)}@${PG_HOST}:${PG_PORT}/${dbName}?schema=public`;

    console.log(`\n----------------------------------------------------------------`);
    console.log(`[DATASET SCALE] Provisioning isolated database: ${dbName} (~${size} rows)...`);
    console.log(`----------------------------------------------------------------`);

    // 1. Lease isolated database
    execPsql(`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid();
    `);
    execPsql(`DROP DATABASE IF EXISTS "${dbName}";`);
    execPsql(`CREATE DATABASE "${dbName}";`);

    let app: any;
    let appPrisma: BenchmarkPrismaService | undefined;

    try {
      // 2. Deploy migrations
      console.log(`[DB] Deploying schema with prisma migrate deploy on ${dbName}...`);
      const prismaCli = path.resolve('node_modules/prisma/build/index.js');
      const migrateRes = spawnSync(
        process.execPath,
        [prismaCli, 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
        { encoding: 'utf8', env: { ...process.env, DATABASE_URL: dbUrl }, windowsHide: true },
      );
      if (migrateRes.status !== 0) {
        throw new Error(`Migration error on ${dbName}: ${migrateRes.stderr || migrateRes.stdout}`);
      }

      // 3. Seed database
      const initialPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
      await initialPrisma.$connect();
      console.log(`[Seed] Generating and inserting ${size} rows into ${dbName}...`);
      const tSeed0 = performance.now();
      const storeData = generateBenchmarkStoreData(size);
      await seedIsolatedDatabase(initialPrisma, storeData);
      const seedDuration = performance.now() - tSeed0;
      await initialPrisma.$disconnect();

      // Count actual rows in PostgreSQL
      const actualDbRows = countDatabaseRows(dbName);
      console.log(`[Seed] Seeded ${actualDbRows} total rows in ${seedDuration.toFixed(1)} ms.`);

      // 4. Initialize Nest application with instrumented Prisma client
      process.env.DATABASE_URL = dbUrl;
      appPrisma = new BenchmarkPrismaService(dbUrl);
      await appPrisma.$connect();

      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(PrismaRuntimeService)
        .useValue(appPrisma)
        .compile();

      app = moduleRef.createNestApplication();
      await app.init();

      // Drain initial boot flushes
      const store = app.get(StoreService);
      await store.flush();

      // 5. Run single-writer benchmark across operations
      const opResults = await runSingleWriterBenchmarks(
        app,
        appPrisma,
        size,
        actualDbRows,
        StoreService,
        FollowUpWorkerService,
      );

      datasetResults.push({
        datasetSize: size,
        actualDbRows,
        operations: opResults,
      });

      // Run concurrency benchmark on the large database scale
      if (size === 12_600) {
        concurrencyResults = await runConcurrencyBenchmarks(dbUrl);
      }
    } finally {
      // Cleanup app & connections
      if (app) await app.close();
      if (appPrisma) await appPrisma.$disconnect();

      // Clean up isolated database
      console.log(`[DB] Dropping isolated database ${dbName}...`);
      execPsql(`
        SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid();
      `);
      execPsql(`DROP DATABASE IF EXISTS "${dbName}";`);
      console.log(`[DB] Database ${dbName} dropped successfully.`);
    }
  }

  // Print readable summary tables
  console.log('\n==================================================================================================================');
  console.log('AFTER MIGRATION BENCHMARK RESULTS SUMMARY (MODE A vs MODE B)');
  console.log('==================================================================================================================');
  console.log(
    '| Operation                 | Scale N | Mode | p50 (ms) | max (ms) | SQL Stmts (Avg) | Statements per Sample   | Status |',
  );
  console.log(
    '|---------------------------|---------|------|----------|----------|-----------------|-------------------------|--------|',
  );
  for (const ds of datasetResults) {
    for (const op of ds.operations) {
      for (const m of [op.modeA, op.modeB]) {
        const statusStr =
          m.failedSamples > 0
            ? `${m.successfulSamples}/${m.sampleCount} ok`
            : `${m.sampleCount}/${m.sampleCount} ok`;
        console.log(
          `| ${op.operation.padEnd(25)} | ${String(ds.datasetSize).padEnd(7)} | ${m.mode.padEnd(4)} | ${String(m.p50Ms).padEnd(8)} | ${String(m.maxMs).padEnd(8)} | ${String(m.sqlStatementsAvg).padEnd(15)} | ${JSON.stringify(m.sqlStatementsPerSample).padEnd(23)} | ${statusStr.padEnd(6)} |`,
        );
      }
    }
  }

  if (concurrencyResults.length > 0) {
    console.log('\n================================================================');
    console.log('DIRECT DB CONCURRENCY BENCHMARK SUMMARY (AFTER BATCH 1)');
    console.log('================================================================');
    console.log(
      '| Coroutines | Attempts | Successes | Failures | Lost Updates | Timeouts | Conn Closed / Pool Exhausted | p50 (ms) | Statements |',
    );
    console.log(
      '|------------|----------|-----------|----------|--------------|----------|------------------------------|----------|------------|',
    );
    for (const cr of concurrencyResults) {
      console.log(
        `| ${String(cr.concurrency).padEnd(10)} | ${String(cr.attempts).padEnd(8)} | ${String(cr.successes).padEnd(9)} | ${String(cr.failures).padEnd(8)} | ${String(cr.lostUpdates).padEnd(12)} | ${String(cr.timeouts).padEnd(8)} | ${String(cr.connectionClosed).padEnd(28)} | ${String(cr.p50Ms).padEnd(8)} | ${String(cr.statementsAvg).padEnd(10)} |`,
      );
    }
  }

  // Save machine-readable artifact
  const artifactDir = path.resolve('artifacts');
  await fs.mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, 'persistence-benchmark-after-results.json');
  const artifactData = {
    timestamp: new Date().toISOString(),
    methodology:
      'Direct SQL statement counting via Prisma query event logging ($on query) within isolated operation windows; quiescence draining of background AI jobs and worker reloads outside sample windows; isolated PostgreSQL databases seeded at 1,000 and 12,600 scale; database dropped after test.',
    system: {
      platform: process.platform,
      node: process.version,
      pgVersion: 'PostgreSQL 18.x on 127.0.0.1:15432',
    },
    datasets: datasetResults,
    concurrency: concurrencyResults,
  };
  await fs.writeFile(artifactPath, JSON.stringify(artifactData, null, 2), 'utf8');
  console.log(`\n[Artifact] Results saved to: ${artifactPath}`);

  return datasetResults;
}

if (process.argv[1]?.includes('persistence-benchmark-after')) {
  runBenchmark().catch((err) => {
    console.error('Fatal benchmark error:', err);
    process.exit(1);
  });
}
