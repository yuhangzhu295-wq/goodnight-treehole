import crypto from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { UserNotification, AIStyle, AIJobStatus } from '@goodnight/shared-types';
import { PrismaRuntimeService } from './prisma-runtime.service.js';

export type AIJobRecord = {
  id: string;
  userId: string;
  contentId: string;
  contentType: string;
  taskType?: string;
  jobType: string;
  style: AIStyle;
  providerId: string;
  modelName: string;
  status: AIJobStatus;
  promptSummary: string;
  promptVersion?: string;
  result?: string;
  structuredResult?: Record<string, unknown>;
  errorMessage?: string;
  durationMs: number;
  retryCount: number;
  fallbackUsed?: boolean;
  traceJson: Array<Record<string, unknown>>;
  routeVersion: number;
  createdAt: string;
  completedAt?: string;
};

export function mapAiJobRow(row: {
  id: string;
  userId: string;
  contentId: string;
  contentType: string;
  jobType: string;
  taskType?: string | null;
  style: string;
  providerId: string;
  modelName: string;
  status: string;
  promptSummary: string;
  promptVersion?: string | null;
  result?: string | null;
  structuredResult?: any;
  errorMessage?: string | null;
  durationMs?: number | null;
  retryCount: number;
  fallbackUsed: boolean;
  routeVersion: number;
  traceJson: any;
  createdAt: Date | string;
  completedAt?: Date | string | null;
}): AIJobRecord {
  return {
    id: row.id,
    userId: row.userId,
    contentId: row.contentId,
    contentType: row.contentType,
    taskType: row.taskType ?? undefined,
    jobType: row.jobType,
    style: row.style as AIStyle,
    providerId: row.providerId,
    modelName: row.modelName,
    status: row.status as AIJobStatus,
    promptSummary: row.promptSummary,
    promptVersion: row.promptVersion ?? undefined,
    result: row.result ?? '',
    structuredResult:
      row.structuredResult && typeof row.structuredResult === 'object'
        ? (row.structuredResult as Record<string, unknown>)
        : undefined,
    errorMessage: row.errorMessage ?? undefined,
    durationMs: row.durationMs ?? 0,
    retryCount: row.retryCount,
    fallbackUsed: row.fallbackUsed,
    routeVersion: row.routeVersion,
    traceJson: Array.isArray(row.traceJson) ? row.traceJson : [],
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
    completedAt: row.completedAt
      ? row.completedAt instanceof Date
        ? row.completedAt.toISOString()
        : new Date(row.completedAt).toISOString()
      : undefined,
  };
}

export function mapUserNotificationRow(row: {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  targetRoute?: string | null;
  status: string;
  createdAt: Date | string;
  readAt?: Date | string | null;
}): UserNotification {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as UserNotification['type'],
    title: row.title,
    body: row.body,
    targetRoute: row.targetRoute ?? undefined,
    status: row.status as 'unread' | 'read',
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
    readAt: row.readAt ? (row.readAt instanceof Date ? row.readAt.toISOString() : new Date(row.readAt).toISOString()) : undefined,
  };
}

export type SafetyEventRecord = {
  id: string;
  userId: string;
  journeyId?: string;
  level: string;
  source: string;
  action: string;
  payload?: any;
  status: 'open' | 'handled';
  handledAt?: string;
  handledBy?: string;
  note?: string;
  createdAt: string;
};

export function safetyTriggerText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  return [record.triggerExcerpt, record.intent]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' · ');
}

export function mapSafetyEventRow(row: {
  id: string;
  userId: string;
  journeyId?: string | null;
  level: string;
  source: string;
  action: string;
  payload?: any;
  status: string;
  handledAt?: Date | string | null;
  handledBy?: string | null;
  note?: string | null;
  createdAt: Date | string;
}): SafetyEventRecord {
  return {
    id: row.id,
    userId: row.userId,
    journeyId: row.journeyId ?? undefined,
    level: row.level,
    source: row.source,
    action: row.action,
    payload: row.payload ?? undefined,
    status: (row.status === 'handled' ? 'handled' : 'open') as 'open' | 'handled',
    handledAt: row.handledAt
      ? (row.handledAt instanceof Date ? row.handledAt.toISOString() : new Date(row.handledAt).toISOString())
      : undefined,
    handledBy: row.handledBy ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
  };
}

@Injectable()
export class Batch1PersistenceService {
  constructor(
    @Inject(PrismaRuntimeService)
    private readonly prisma: PrismaRuntimeService,
  ) {}

  async listUserNotifications(userId: string): Promise<UserNotification[]> {
    const rows = await this.prisma.userNotification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapUserNotificationRow);
  }

  async listAdminNotifications(filter?: { q?: string; status?: string }): Promise<UserNotification[]> {
    const where: Prisma.UserNotificationWhereInput = {};
    if (filter?.status && filter.status !== 'all') {
      where.status = filter.status;
    }
    const needle = filter?.q?.trim().toLowerCase();
    if (needle) {
      where.OR = [
        { id: { contains: needle, mode: 'insensitive' } },
        { userId: { contains: needle, mode: 'insensitive' } },
        { type: { contains: needle, mode: 'insensitive' } },
        { title: { contains: needle, mode: 'insensitive' } },
        { body: { contains: needle, mode: 'insensitive' } },
        { targetRoute: { contains: needle, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.userNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapUserNotificationRow);
  }

  async countUnreadNotifications(userId?: string): Promise<number> {
    return await this.prisma.userNotification.count({
      where: {
        status: 'unread',
        ...(userId ? { userId } : {}),
      },
    });
  }

  async markNotificationRead(notificationId: string, userId: string): Promise<{ item: UserNotification }> {
    const existing = await this.prisma.userNotification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!existing) {
      throw new NotFoundException('提醒不存在');
    }
    if (existing.status === 'read') {
      return { item: mapUserNotificationRow(existing) };
    }
    const now = new Date();
    await this.prisma.userNotification.updateMany({
      where: { id: notificationId, userId, status: { not: 'read' } },
      data: { status: 'read', readAt: now },
    });
    const updated = await this.prisma.userNotification.findUnique({
      where: { id: notificationId },
    });
    return { item: mapUserNotificationRow(updated!) };
  }

  async upsertPeerNotification(params: {
    userId: string;
    type: UserNotification['type'];
    suffix: string;
    title: string;
    body: string;
    targetRoute: string;
  }): Promise<UserNotification> {
    const notificationId = `notification_peer_${params.suffix}_${params.userId}`;
    const row = await this.prisma.userNotification.upsert({
      where: { id: notificationId },
      create: {
        id: notificationId,
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        targetRoute: params.targetRoute,
        status: 'unread',
        createdAt: new Date(),
      },
      update: {
        title: params.title,
        body: params.body,
        targetRoute: params.targetRoute,
      },
    });
    return mapUserNotificationRow(row);
  }

  async deleteNotificationsForTestCleanup(params: {
    userId: string;
    explicitIds: string[];
    journeyIds: string[];
  }): Promise<{ count: number }> {
    const orConditions: Prisma.UserNotificationWhereInput[] = [];
    if (params.explicitIds.length > 0) {
      orConditions.push({ id: { in: params.explicitIds } });
    }
    for (const journeyId of params.journeyIds) {
      orConditions.push({ targetRoute: { contains: journeyId } });
    }
    if (orConditions.length === 0) {
      return { count: 0 };
    }
    const result = await this.prisma.userNotification.deleteMany({
      where: {
        userId: params.userId,
        OR: orConditions,
      },
    });
    return { count: result.count };
  }

  async deleteNotificationsForArchive(params: {
    userId: string;
    archiveRoute: string;
  }): Promise<{ count: number }> {
    const result = await this.prisma.userNotification.deleteMany({
      where: {
        userId: params.userId,
        targetRoute: { contains: params.archiveRoute },
      },
    });
    return { count: result.count };
  }

  async listAdminSafetyEvents(filter?: {
    status?: string;
  }): Promise<Array<SafetyEventRecord & { triggerExcerpt: string; userNickname?: string }>> {
    const where: Prisma.SafetyEventWhereInput = {};
    if (filter?.status && filter.status !== 'all') {
      where.status = filter.status;
    }
    const rows = await this.prisma.safetyEvent.findMany({
      where,
      include: { user: { select: { nickname: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => {
      const item = mapSafetyEventRow(row);
      return {
        ...item,
        triggerExcerpt: safetyTriggerText(item.payload),
        userNickname: row.user?.nickname ?? undefined,
      };
    });
  }

  async getSafetyEvent(id: string): Promise<SafetyEventRecord | null> {
    const row = await this.prisma.safetyEvent.findUnique({
      where: { id },
    });
    return row ? mapSafetyEventRow(row) : null;
  }

  async countHighRiskSafetyEvents(): Promise<number> {
    return await this.prisma.safetyEvent.count({
      where: { level: 'high' },
    });
  }

  async hasHighRiskSafetyEventForJourney(journeyId: string): Promise<boolean> {
    const count = await this.prisma.safetyEvent.count({
      where: { journeyId, level: 'high' },
    });
    return count > 0;
  }

  async createSafetyEvent(params: {
    id?: string;
    userId: string;
    journeyId?: string | null;
    level: string;
    source: string;
    action: string;
    payload?: any;
    status?: 'open' | 'handled';
    createdAt?: Date | string;
  }): Promise<SafetyEventRecord> {
    const eventId = params.id ?? `safety_${crypto.randomBytes(5).toString('hex')}`;
    const row = await this.prisma.safetyEvent.create({
      data: {
        id: eventId,
        userId: params.userId,
        journeyId: params.journeyId ?? null,
        level: params.level,
        source: params.source,
        action: params.action,
        payload: params.payload === undefined ? Prisma.JsonNull : params.payload,
        status: params.status ?? 'open',
        createdAt: params.createdAt ? new Date(params.createdAt) : new Date(),
      },
    });
    return mapSafetyEventRow(row);
  }

  async handleSafetyEvent(
    eventId: string,
    adminUserId: string,
    input: { status?: unknown; note?: unknown; _failAfterUpdate?: boolean },
  ): Promise<{ item: SafetyEventRecord; auditId: string; auditCreatedAt: string; before: SafetyEventRecord }> {
    return await this.prisma.$transaction(async (tx) => {
      const existing = await tx.safetyEvent.findUnique({
        where: { id: eventId },
      });
      if (!existing) {
        throw new NotFoundException('安全事件不存在');
      }

      const status = input.status === 'open' ? 'open' : input.status === 'handled' ? 'handled' : undefined;
      if (!status) {
        throw new BadRequestException('处理状态无效');
      }

      const beforeItem = mapSafetyEventRow(existing);
      const now = new Date();
      let handledAt: Date | null = null;
      let handledBy: string | null = null;
      let note: string | null = null;

      if (status === 'handled') {
        handledAt = now;
        handledBy = adminUserId;
        note = typeof input.note === 'string' && input.note.trim()
          ? input.note.trim().slice(0, 500)
          : null;
      }

      const updated = await tx.safetyEvent.update({
        where: { id: eventId },
        data: {
          status,
          handledAt,
          handledBy,
          note,
        },
      });
      const afterItem = mapSafetyEventRow(updated);

      if (input._failAfterUpdate) {
        throw new Error('Simulated failure during handleSafetyEvent transaction');
      }

      const auditId = `audit_${crypto.randomBytes(5).toString('hex')}`;
      const auditCreatedAt = now.toISOString();
      await tx.auditLog.create({
        data: {
          id: auditId,
          adminUserId,
          action: 'SAFETY_EVENT_HANDLE',
          resourceType: 'SafetyEvent',
          resourceId: eventId,
          beforeJson: beforeItem as any,
          afterJson: afterItem as any,
          ip: '127.0.0.1',
          userAgent: 'local-dev',
          createdAt: now,
        },
      });

      return { item: afterItem, auditId, auditCreatedAt, before: beforeItem };
    });
  }

  async detachSafetyEventsForJourney(journeyId: string): Promise<{ count: number }> {
    const result = await this.prisma.safetyEvent.updateMany({
      where: { journeyId },
      data: { journeyId: null },
    });
    return { count: result.count };
  }

  async detachSafetyEventsForJourneys(journeyIds: string[]): Promise<{ count: number }> {
    if (!journeyIds.length) return { count: 0 };
    const result = await this.prisma.safetyEvent.updateMany({
      where: { journeyId: { in: journeyIds } },
      data: { journeyId: null },
    });
    return { count: result.count };
  }

  async ensureProvider(providerId?: string, tx?: any): Promise<string> {
    const client = tx ?? this.prisma;
    const key = providerId && providerId.trim() ? providerId.trim() : 'provider_template';
    if (!client?.aIProvider?.findUnique) return key;
    const existing = await client.aIProvider.findUnique({ where: { id: key }, select: { id: true } });
    if (!existing) {
      await client.aIProvider.upsert({
        where: { id: key },
        create: {
          id: key,
          name: `系统提供方 ${key}`,
          type: 'template',
          baseUrl: 'local://template',
          modelName: key,
          apiKeyStatus: 'configured',
          enabled: true,
          priority: 999,
          dailyLimit: 99999,
          timeoutSeconds: 1,
          failoverEnabled: false,
          usageTags: [],
          failureRate: 0,
          avgLatencyMs: 0,
          todayCalls: 0,
          providerKind: 'template',
        },
        update: {},
      });
    }
    return key;
  }

  private readonly inMemoryAiJobs = new Map<string, any>();

  async createAiJob(params: {
    id: string;
    userId: string;
    contentId: string;
    contentType: string;
    jobType: string;
    taskType?: string;
    style: AIStyle;
    providerId?: string;
    modelName?: string;
    status?: AIJobStatus;
    promptSummary: string;
    promptVersion?: string;
    result?: string;
    structuredResult?: any;
    errorMessage?: string;
    durationMs?: number;
    retryCount?: number;
    fallbackUsed?: boolean;
    routeVersion?: number;
    traceJson?: any[];
    createdAt?: Date | string;
  }): Promise<AIJobRecord> {
    const providerId = await this.ensureProvider(params.providerId);
    if (!this.prisma?.aIJob?.create) {
      const memoryRow: any = {
        id: params.id,
        userId: params.userId,
        contentId: params.contentId,
        contentType: params.contentType,
        jobType: params.jobType,
        taskType: params.taskType ?? null,
        style: params.style,
        providerId,
        modelName: params.modelName ?? '',
        status: (params.status ?? 'queued') as any,
        promptSummary: params.promptSummary,
        promptVersion: params.promptVersion ?? null,
        result: params.result ?? null,
        structuredResult: params.structuredResult ?? null,
        errorMessage: params.errorMessage ?? null,
        durationMs: params.durationMs ?? 0,
        retryCount: params.retryCount ?? 0,
        fallbackUsed: params.fallbackUsed ?? false,
        routeVersion: params.routeVersion ?? 0,
        traceJson: params.traceJson ?? [],
        createdAt: params.createdAt ? new Date(params.createdAt) : new Date(),
        completedAt: null,
      };
      this.inMemoryAiJobs.set(params.id, memoryRow);
      return mapAiJobRow(memoryRow);
    }
    const row = await this.prisma.aIJob.create({
      data: {
        id: params.id,
        userId: params.userId,
        contentId: params.contentId,
        contentType: params.contentType,
        jobType: params.jobType,
        taskType: params.taskType ?? null,
        style: params.style,
        providerId,
        modelName: params.modelName ?? '',
        status: (params.status ?? 'queued') as any,
        promptSummary: params.promptSummary,
        promptVersion: params.promptVersion ?? null,
        result: params.result ?? null,
        structuredResult: params.structuredResult === undefined ? Prisma.JsonNull : params.structuredResult,
        errorMessage: params.errorMessage ?? null,
        durationMs: params.durationMs ?? 0,
        retryCount: params.retryCount ?? 0,
        fallbackUsed: params.fallbackUsed ?? false,
        routeVersion: params.routeVersion ?? 0,
        traceJson: (params.traceJson ?? []) as any,
        createdAt: params.createdAt ? new Date(params.createdAt) : new Date(),
      },
    });
    return mapAiJobRow(row);
  }

  async updateJobRunning(params: {
    id: string;
    traceEntry: Record<string, unknown>;
  }): Promise<{ claimed: boolean; job: AIJobRecord | null }> {
    if (!this.prisma?.aIJob?.findUnique) {
      const existing = this.inMemoryAiJobs.get(params.id);
      if (!existing) return { claimed: false, job: null };
      if (existing.status !== 'queued') return { claimed: false, job: mapAiJobRow(existing) };
      existing.status = 'running';
      existing.traceJson = [...(existing.traceJson ?? []), params.traceEntry];
      return { claimed: true, job: mapAiJobRow(existing) };
    }
    const existing = await this.prisma.aIJob.findUnique({ where: { id: params.id } });
    if (!existing) return { claimed: false, job: null };

    const traces = Array.isArray(existing.traceJson) ? [...existing.traceJson, params.traceEntry] : [params.traceEntry];
    const updateResult = await this.prisma.aIJob.updateMany({
      where: {
        id: params.id,
        status: 'queued',
      },
      data: {
        status: 'running',
        traceJson: traces as any,
      },
    });

    const claimed = updateResult.count > 0;
    const finalRow = await this.prisma.aIJob.findUnique({ where: { id: params.id } });
    return { claimed, job: finalRow ? mapAiJobRow(finalRow) : null };
  }

  async updateJobTerminal(params: {
    id: string;
    status: AIJobStatus;
    result?: string;
    structuredResult?: any;
    errorMessage?: string;
    durationMs?: number;
    retryCount?: number;
    fallbackUsed?: boolean;
    providerId?: string;
    modelName?: string;
    completedAt?: Date | string;
    traceJson?: any[];
  }): Promise<{ updated: boolean; job: AIJobRecord }> {
    const providerId = params.providerId ? await this.ensureProvider(params.providerId) : undefined;
    const completedAt = params.completedAt ? new Date(params.completedAt) : new Date();

    if (!this.prisma?.aIJob?.updateMany) {
      const existing = this.inMemoryAiJobs.get(params.id);
      if (!existing) throw new Error('AIJob not found');
      if (!['queued', 'running'].includes(existing.status)) {
        return { updated: false, job: mapAiJobRow(existing) };
      }
      existing.status = params.status;
      if (params.result !== undefined) existing.result = params.result;
      if (params.structuredResult !== undefined) existing.structuredResult = params.structuredResult;
      if (params.errorMessage !== undefined) existing.errorMessage = params.errorMessage;
      if (params.durationMs !== undefined) existing.durationMs = params.durationMs;
      if (params.retryCount !== undefined) existing.retryCount = params.retryCount;
      if (params.fallbackUsed !== undefined) existing.fallbackUsed = params.fallbackUsed;
      if (providerId) existing.providerId = providerId;
      if (params.modelName !== undefined) existing.modelName = params.modelName;
      existing.completedAt = completedAt;
      if (params.traceJson !== undefined) existing.traceJson = params.traceJson;
      return { updated: true, job: mapAiJobRow(existing) };
    }

    const updateResult = await this.prisma.aIJob.updateMany({
      where: {
        id: params.id,
        status: { in: ['queued', 'running'] },
      },
      data: {
        status: params.status as any,
        result: params.result ?? null,
        structuredResult: params.structuredResult === undefined ? Prisma.JsonNull : params.structuredResult,
        errorMessage: params.errorMessage ?? null,
        durationMs: params.durationMs ?? 0,
        retryCount: params.retryCount ?? 0,
        fallbackUsed: params.fallbackUsed ?? false,
        ...(providerId ? { providerId } : {}),
        ...(params.modelName !== undefined ? { modelName: params.modelName } : {}),
        completedAt,
        ...(params.traceJson !== undefined ? { traceJson: params.traceJson as any } : {}),
      },
    });

    const updated = updateResult.count > 0;
    const finalRow = await this.prisma.aIJob.findUniqueOrThrow({ where: { id: params.id } });
    return { updated, job: mapAiJobRow(finalRow) };
  }

  async getAiJob(id: string): Promise<AIJobRecord | null> {
    if (!this.prisma?.aIJob?.findUnique) {
      const existing = this.inMemoryAiJobs.get(id);
      return existing ? mapAiJobRow(existing) : null;
    }
    const row = await this.prisma.aIJob.findUnique({ where: { id } });
    return row ? mapAiJobRow(row) : null;
  }

  async findPendingAiJob(id?: string): Promise<AIJobRecord | null> {
    if (!id) return null;
    const row = await this.prisma.aIJob.findFirst({
      where: { id, status: { in: ['queued', 'running'] } },
    });
    return row ? mapAiJobRow(row) : null;
  }

  async getLatestSuccessfulAiJob(userId: string, taskType: string): Promise<AIJobRecord | null> {
    const row = await this.prisma.aIJob.findFirst({
      where: {
        userId,
        taskType,
        status: { in: ['succeeded', 'fallback'] },
        result: { not: '' },
      },
      orderBy: { createdAt: 'desc' },
    });
    return row ? mapAiJobRow(row) : null;
  }

  async listAdminAiJobs(page?: string, pageSize?: string): Promise<{
    items: AIJobRecord[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const pageNum = Math.max(1, Number(page || 1));
    const size = Math.min(100, Math.max(1, Number(pageSize || 20)));
    const skip = (pageNum - 1) * size;
    const [rows, total] = await Promise.all([
      this.prisma.aIJob.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: size,
      }),
      this.prisma.aIJob.count(),
    ]);
    return {
      items: rows.map(mapAiJobRow),
      total,
      page: pageNum,
      pageSize: size,
      totalPages: Math.max(1, Math.ceil(total / size)),
    };
  }

  async listAiJobsForUser(userId: string): Promise<AIJobRecord[]> {
    const rows = await this.prisma.aIJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapAiJobRow);
  }

  async getAiJobDashboardMetrics(dayKeys: string[], today: string) {
    const rows = await this.prisma.aIJob.findMany({
      select: {
        id: true,
        userId: true,
        contentId: true,
        contentType: true,
        jobType: true,
        taskType: true,
        style: true,
        providerId: true,
        modelName: true,
        status: true,
        promptSummary: true,
        promptVersion: true,
        result: true,
        structuredResult: true,
        errorMessage: true,
        durationMs: true,
        retryCount: true,
        fallbackUsed: true,
        routeVersion: true,
        traceJson: true,
        createdAt: true,
        completedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const mapped = rows.map(mapAiJobRow);
    const successfulJobs = mapped.filter((job) => ['succeeded', 'fallback'].includes(job.status)).length;
    const todayJobs = mapped.filter((job) => job.createdAt?.startsWith(today));
    const completedJobs = mapped.filter((job) => ['succeeded', 'failed', 'fallback'].includes(job.status));
    const failedJobs = completedJobs.filter((job) => job.status === 'failed');
    const fallbackJobs = completedJobs.filter((job) => job.status === 'fallback');
    const averageDurationMs = completedJobs.length
      ? Math.round(completedJobs.reduce((sum, job) => sum + job.durationMs, 0) / completedJobs.length)
      : 0;

    const trendByDay = Object.fromEntries(dayKeys.map((day) => [day, 0]));
    for (const job of mapped) {
      const day = job.createdAt.slice(0, 10);
      if (trendByDay[day] !== undefined) {
        trendByDay[day] += 1;
      }
    }

    return {
      trendByDay,
      successfulJobs,
      todayJobsCount: todayJobs.length,
      completedJobsCount: completedJobs.length,
      failedJobsCount: failedJobs.length,
      fallbackJobsCount: fallbackJobs.length,
      averageDurationMs,
      aiSuccessRate: mapped.length ? Math.round((successfulJobs / mapped.length) * 1000) / 10 : 100,
      latestJobs: mapped.slice(0, 8),
      summary: {
        total: mapped.length,
        succeeded: mapped.filter((job) => job.status === 'succeeded').length,
        fallback: fallbackJobs.length,
        failed: failedJobs.length,
      },
    };
  }

  async recoverInterruptedAiJobs(): Promise<{ count: number }> {
    const now = new Date();
    const result = await this.prisma.aIJob.updateMany({
      where: {
        status: { in: ['queued', 'running'] },
      },
      data: {
        status: 'failed',
        completedAt: now,
        errorMessage: '任务在服务重启时未完成，已标记为失败，可在后台重试。',
      },
    });
    return { count: result.count };
  }

  async deleteAiJobsForTestCleanup(params: {
    demoUserId: string;
    journeyIds: string[];
    actionIds: string[];
    legacy?: boolean;
    fixturePattern?: RegExp;
  }): Promise<{ count: number }> {
    const orConditions: Prisma.AIJobWhereInput[] = [];
    const contentIds = [...params.journeyIds, ...params.actionIds];
    if (contentIds.length > 0) {
      orConditions.push({ contentId: { in: contentIds } });
    }
    if (params.legacy && params.demoUserId) {
      if (params.fixturePattern) {
        const userJobs = await this.prisma.aIJob.findMany({
          where: { userId: params.demoUserId },
          select: { id: true, contentId: true, promptSummary: true },
        });
        const matchedIds = userJobs
          .filter((job) => params.fixturePattern!.test(`${job.contentId}\n${job.promptSummary}`))
          .map((job) => job.id);
        if (matchedIds.length > 0) {
          orConditions.push({ id: { in: matchedIds } });
        }
      } else {
        orConditions.push({ userId: params.demoUserId });
      }
    }
    if (orConditions.length === 0) return { count: 0 };
    const result = await this.prisma.aIJob.deleteMany({
      where: { OR: orConditions },
    });
    return { count: result.count };
  }

  async deleteAiJobsForArchive(params: {
    journeyId: string;
    actionIds: string[];
  }): Promise<{ count: number }> {
    const contentIds = [params.journeyId, ...params.actionIds];
    const result = await this.prisma.aIJob.deleteMany({
      where: { contentId: { in: contentIds } },
    });
    return { count: result.count };
  }

  async updateJobRetryCount(id: string, retryCount: number): Promise<void> {
    await this.prisma.aIJob.update({
      where: { id },
      data: { retryCount },
    });
  }

  async applySituationAnalysisAiCompletion(params: {
    journeyId: string;
    userId: string;
    completedJob: AIJobRecord;
    isGeneratedTitle?: (title: string) => boolean;
  }): Promise<{ applied: boolean }> {
    const { journeyId, userId, completedJob } = params;
    if (!['succeeded', 'fallback'].includes(completedJob.status)) return { applied: false };

    return await this.prisma.$transaction(async (tx) => {
      const dbSnapshot = await tx.situationSnapshot.findFirst({
        where: { journeyId },
      });
      const dbJourney = await tx.lifeJourney.findUnique({
        where: { id: journeyId },
      });

      if (!dbJourney || !dbSnapshot) return { applied: false };
      if (dbSnapshot.confidence === 'user_confirmed') return { applied: false };

      const structured = (completedJob.structuredResult && typeof completedJob.structuredResult === 'object'
        ? completedJob.structuredResult
        : {}) as Record<string, any>;

      const toList = (value: unknown, fallback: any[] = [], max = 8): string[] => {
        if (!Array.isArray(value)) return fallback.map(String);
        return value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, max);
      };

      const existingFacts = Array.isArray(dbSnapshot.facts) ? (dbSnapshot.facts as any[]) : [];
      const existingFeelings = Array.isArray(dbSnapshot.feelings) ? (dbSnapshot.feelings as any[]) : [];
      const existingNeeds = Array.isArray(dbSnapshot.needs) ? (dbSnapshot.needs as any[]) : [];
      const existingConstraints = Array.isArray(dbSnapshot.constraints) ? (dbSnapshot.constraints as any[]) : [];
      const existingRisks = Array.isArray(dbSnapshot.risks) ? (dbSnapshot.risks as any[]) : [];
      const existingTags = Array.isArray(dbSnapshot.contextTags) ? (dbSnapshot.contextTags as any[]) : [];

      const facts = structured.facts ? toList(structured.facts, existingFacts) : existingFacts;
      const feelings = structured.feelings ? toList(structured.feelings, existingFeelings) : existingFeelings;
      const needs = structured.needs ? toList(structured.needs, existingNeeds) : existingNeeds;
      const constraints = structured.constraints ? toList(structured.constraints, existingConstraints) : existingConstraints;
      const risks = structured.risks ? toList(structured.risks, existingRisks) : existingRisks;
      const domain = typeof structured.domain === 'string' ? structured.domain : dbSnapshot.domain;
      const subDomain = typeof structured.subDomain === 'string' ? structured.subDomain : dbSnapshot.subDomain;
      const eventType = typeof structured.eventType === 'string' ? structured.eventType : dbSnapshot.eventType;
      const stage = typeof structured.stage === 'string' ? structured.stage : (dbSnapshot.stage ?? 'clarifying');
      const contextTags = structured.contextTags ? toList(structured.contextTags, existingTags, 12) : existingTags;
      const peopleContext = Array.isArray(structured.peopleContext) ? structured.peopleContext.map(String).slice(0, 8) : [];
      const decisionContext = Array.isArray(structured.decisionContext) ? structured.decisionContext.map(String).slice(0, 8) : [];
      const behaviorSignals = Array.isArray(structured.behaviorSignals) ? structured.behaviorSignals.map(String).slice(0, 8) : [];
      const recoverySignals = Array.isArray(structured.recoverySignals) ? structured.recoverySignals.map(String).slice(0, 8) : [];
      const intensity = Number.isFinite(Number(structured.intensity))
        ? Math.max(0, Math.min(10, Number(structured.intensity)))
        : (dbSnapshot.intensity ?? undefined);
      const urgency = Number.isFinite(Number(structured.urgency))
        ? Math.max(0, Math.min(10, Number(structured.urgency)))
        : (dbSnapshot.urgency ?? undefined);

      const fingerprintJson = {
        domain,
        subDomain,
        eventType,
        stage,
        contextTags,
        peopleContext,
        decisionContext,
        behaviorSignals,
        recoverySignals,
      };

      const now = new Date();

      await tx.situationSnapshot.update({
        where: { id: dbSnapshot.id },
        data: {
          facts: facts as any,
          feelings: feelings as any,
          needs: needs as any,
          constraints: constraints as any,
          risks: risks as any,
          domain: domain ?? null,
          subDomain: subDomain ?? null,
          eventType: eventType ?? null,
          stage: stage ?? null,
          contextTags: contextTags as any,
          peopleContext: peopleContext as any,
          decisionContext: decisionContext as any,
          behaviorSignals: behaviorSignals as any,
          recoverySignals: recoverySignals as any,
          intensity: intensity ?? null,
          urgency: urgency ?? null,
          fingerprintJson: fingerprintJson as any,
          confidence: 'agent_draft',
          updatedAt: now,
        },
      });

      const nextSummary = String(structured.summary ?? completedJob.result).slice(0, 500);
      let nextTitle = dbJourney.title;
      const isGen = params.isGeneratedTitle ?? ((t: string) => /里正在整理的一件事|旅程/.test(t));
      if (isGen(dbJourney.title) && typeof structured.title === 'string' && structured.title.trim()) {
        nextTitle = structured.title.trim().slice(0, 80);
      }

      await tx.lifeJourney.update({
        where: { id: journeyId },
        data: {
          summary: nextSummary,
          title: nextTitle,
          ...(intensity !== undefined ? { intensity } : {}),
          updatedAt: now,
        },
      });

      await tx.agentDecisionLog.create({
        data: {
          id: `agent_decision_${crypto.randomBytes(5).toString('hex')}`,
          userId,
          journeyId,
          aiJobId: completedJob.id,
          taskType: 'situation_analysis',
          decision: structured as Prisma.InputJsonValue,
          createdAt: now,
        },
      });

      return { applied: true };
    });
  }
}
