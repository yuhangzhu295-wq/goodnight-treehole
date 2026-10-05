import crypto from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { UserNotification, AIStyle, AIJobStatus, SupportIntent, Visibility } from '@goodnight/shared-types';
import { PrismaRuntimeService } from './prisma-runtime.service.js';

export type LifeJourneyRecord = {
  id: string;
  userId: string;
  title: string;
  domain: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
  stage: string;
  currentIntent?: SupportIntent;
  intentUpdatedAt?: string;
  initialIntensity?: number;
  visibility: Visibility;
  intensity?: number;
  summary?: string;
  nextReviewAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type SituationSnapshotRecord = {
  id: string;
  journeyId: string;
  facts: string[];
  feelings: string[];
  needs: string[];
  constraints: string[];
  risks: string[];
  domain?: string;
  subDomain?: string;
  eventType?: string;
  eventStartedAt?: string;
  daysSinceEvent?: number;
  stage?: string;
  contextTags: string[];
  peopleContext?: string[];
  decisionContext?: string[];
  behaviorSignals?: string[];
  recoverySignals?: string[];
  intensity?: number;
  urgency?: number;
  fingerprintJson?: Record<string, unknown>;
  confidence: 'user_confirmed' | 'agent_draft';
  createdAt: string;
  updatedAt: string;
};

export type JourneyUpdateRecord = {
  id: string;
  journeyId: string;
  userId: string;
  kind: string;
  content: string;
  payload?: Record<string, unknown>;
  stage?: string;
  intensity?: number;
  lifeFunction?: string;
  actionResult?: string;
  decisionChange?: string;
  contactState?: string;
  sleepState?: string;
  socialState?: string;
  selfReportedHelpfulness?: number;
  eventDate?: string;
  createdAt: string;
};

export type ActionCommitmentRecord = {
  id: string;
  journeyId: string;
  userId: string;
  title: string;
  description?: string;
  status: 'active' | 'completed' | 'skipped' | 'paused';
  dueAt?: string;
  reminderAt?: string;
  evidence?: Record<string, unknown>;
  parentActionId?: string;
  adaptationReason?: string;
  attemptNumber?: number;
  createdAt: string;
  updatedAt: string;
};

export type OutcomeCheckinRecord = {
  id: string;
  journeyId: string;
  commitmentId?: string;
  userId: string;
  status: 'pending' | 'completed' | 'missed';
  reflection?: string;
  result?: string;
  intensity?: number;
  checkedAt?: string;
  dueAt?: string;
  barrier?: string;
  createdAt: string;
};

export function mapActionCommitmentRow(row: {
  id: string;
  journeyId: string;
  userId: string;
  title: string;
  description?: string | null;
  status: string;
  dueAt?: Date | string | null;
  reminderAt?: Date | string | null;
  evidence?: any;
  parentActionId?: string | null;
  adaptationReason?: string | null;
  attemptNumber?: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): ActionCommitmentRecord {
  return {
    id: row.id,
    journeyId: row.journeyId,
    userId: row.userId,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status as ActionCommitmentRecord['status'],
    dueAt: row.dueAt
      ? row.dueAt instanceof Date
        ? row.dueAt.toISOString()
        : new Date(row.dueAt).toISOString()
      : undefined,
    reminderAt: row.reminderAt
      ? row.reminderAt instanceof Date
        ? row.reminderAt.toISOString()
        : new Date(row.reminderAt).toISOString()
      : undefined,
    evidence:
      row.evidence && typeof row.evidence === 'object'
        ? (row.evidence as Record<string, unknown>)
        : undefined,
    parentActionId: row.parentActionId ?? undefined,
    adaptationReason: row.adaptationReason ?? undefined,
    attemptNumber: row.attemptNumber ?? 1,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : new Date(row.updatedAt).toISOString(),
  };
}

export function mapOutcomeCheckinRow(row: {
  id: string;
  journeyId: string;
  commitmentId?: string | null;
  userId: string;
  status: string;
  reflection?: string | null;
  result?: string | null;
  intensity?: number | null;
  checkedAt?: Date | string | null;
  dueAt?: Date | string | null;
  barrier?: string | null;
  createdAt: Date | string;
}): OutcomeCheckinRecord {
  return {
    id: row.id,
    journeyId: row.journeyId,
    commitmentId: row.commitmentId ?? undefined,
    userId: row.userId,
    status: row.status as OutcomeCheckinRecord['status'],
    reflection: row.reflection ?? undefined,
    result: row.result ?? undefined,
    intensity: row.intensity ?? undefined,
    checkedAt: row.checkedAt
      ? row.checkedAt instanceof Date
        ? row.checkedAt.toISOString()
        : new Date(row.checkedAt).toISOString()
      : undefined,
    dueAt: row.dueAt
      ? row.dueAt instanceof Date
        ? row.dueAt.toISOString()
        : new Date(row.dueAt).toISOString()
      : undefined,
    barrier: row.barrier ?? undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
  };
}

export function isGeneratedJourneyTitle(title: string): boolean {
  const value = title.trim();
  return value === '正在整理的一件事' || /^.{1,12}里正在整理的一件事$/.test(value);
}

export function mapLifeJourneyRow(row: {
  id: string;
  userId: string;
  title: string;
  domain: string;
  status: string;
  stage: string;
  currentIntent?: string | null;
  intentUpdatedAt?: Date | string | null;
  initialIntensity?: number | null;
  visibility: string;
  intensity?: number | null;
  summary?: string | null;
  nextReviewAt?: Date | string | null;
  completedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): LifeJourneyRecord {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    domain: row.domain,
    status: row.status as LifeJourneyRecord['status'],
    stage: row.stage,
    currentIntent: (row.currentIntent as SupportIntent) ?? undefined,
    intentUpdatedAt: row.intentUpdatedAt
      ? row.intentUpdatedAt instanceof Date
        ? row.intentUpdatedAt.toISOString()
        : new Date(row.intentUpdatedAt).toISOString()
      : undefined,
    initialIntensity: row.initialIntensity ?? undefined,
    visibility: (row.visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE') as Visibility,
    intensity: row.intensity ?? undefined,
    summary: row.summary ?? undefined,
    nextReviewAt: row.nextReviewAt
      ? row.nextReviewAt instanceof Date
        ? row.nextReviewAt.toISOString()
        : new Date(row.nextReviewAt).toISOString()
      : undefined,
    completedAt: row.completedAt
      ? row.completedAt instanceof Date
        ? row.completedAt.toISOString()
        : new Date(row.completedAt).toISOString()
      : undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : new Date(row.updatedAt).toISOString(),
  };
}

export function mapSituationSnapshotRow(row: {
  id: string;
  journeyId: string;
  facts: any;
  feelings: any;
  needs: any;
  constraints: any;
  risks: any;
  domain?: string | null;
  subDomain?: string | null;
  eventType?: string | null;
  eventStartedAt?: Date | string | null;
  daysSinceEvent?: number | null;
  stage?: string | null;
  contextTags?: any;
  peopleContext?: any;
  decisionContext?: any;
  behaviorSignals?: any;
  recoverySignals?: any;
  intensity?: number | null;
  urgency?: number | null;
  fingerprintJson?: any;
  confidence: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}): SituationSnapshotRecord {
  const toList = (val: any) => (Array.isArray(val) ? val.map(String) : []);
  return {
    id: row.id,
    journeyId: row.journeyId,
    facts: toList(row.facts),
    feelings: toList(row.feelings),
    needs: toList(row.needs),
    constraints: toList(row.constraints),
    risks: toList(row.risks),
    domain: row.domain ?? undefined,
    subDomain: row.subDomain ?? undefined,
    eventType: row.eventType ?? undefined,
    eventStartedAt: row.eventStartedAt
      ? row.eventStartedAt instanceof Date
        ? row.eventStartedAt.toISOString()
        : new Date(row.eventStartedAt).toISOString()
      : undefined,
    daysSinceEvent: row.daysSinceEvent ?? undefined,
    stage: row.stage ?? undefined,
    contextTags: toList(row.contextTags),
    peopleContext: Array.isArray(row.peopleContext) ? row.peopleContext.map(String) : undefined,
    decisionContext: Array.isArray(row.decisionContext) ? row.decisionContext.map(String) : undefined,
    behaviorSignals: Array.isArray(row.behaviorSignals) ? row.behaviorSignals.map(String) : undefined,
    recoverySignals: Array.isArray(row.recoverySignals) ? row.recoverySignals.map(String) : undefined,
    intensity: row.intensity ?? undefined,
    urgency: row.urgency ?? undefined,
    fingerprintJson:
      row.fingerprintJson && typeof row.fingerprintJson === 'object'
        ? (row.fingerprintJson as Record<string, unknown>)
        : undefined,
    confidence: (row.confidence === 'user_confirmed' ? 'user_confirmed' : 'agent_draft') as
      'user_confirmed' | 'agent_draft',
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : new Date(row.updatedAt).toISOString(),
  };
}

export function mapJourneyUpdateRow(row: {
  id: string;
  journeyId: string;
  userId: string;
  kind: string;
  content: string;
  payload?: any;
  stage?: string | null;
  intensity?: number | null;
  lifeFunction?: string | null;
  actionResult?: string | null;
  decisionChange?: string | null;
  contactState?: string | null;
  sleepState?: string | null;
  socialState?: string | null;
  selfReportedHelpfulness?: number | null;
  eventDate?: Date | string | null;
  createdAt: Date | string;
}): JourneyUpdateRecord {
  return {
    id: row.id,
    journeyId: row.journeyId,
    userId: row.userId,
    kind: row.kind,
    content: row.content,
    payload: row.payload && typeof row.payload === 'object' ? (row.payload as Record<string, unknown>) : undefined,
    stage: row.stage ?? undefined,
    intensity: row.intensity ?? undefined,
    lifeFunction: row.lifeFunction ?? undefined,
    actionResult: row.actionResult ?? undefined,
    decisionChange: row.decisionChange ?? undefined,
    contactState: row.contactState ?? undefined,
    sleepState: row.sleepState ?? undefined,
    socialState: row.socialState ?? undefined,
    selfReportedHelpfulness: row.selfReportedHelpfulness ?? undefined,
    eventDate: row.eventDate
      ? row.eventDate instanceof Date
        ? row.eventDate.toISOString()
        : new Date(row.eventDate).toISOString()
      : undefined,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(row.createdAt).toISOString(),
  };
}

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
    readAt: row.readAt
      ? row.readAt instanceof Date
        ? row.readAt.toISOString()
        : new Date(row.readAt).toISOString()
      : undefined,
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
      ? row.handledAt instanceof Date
        ? row.handledAt.toISOString()
        : new Date(row.handledAt).toISOString()
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

  async deleteNotificationsForArchive(params: { userId: string; archiveRoute: string }): Promise<{ count: number }> {
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
        note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 500) : null;
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

  async detachSafetyEventsForJourney(journeyId: string, tx?: any): Promise<{ count: number }> {
    const client = tx ?? this.prisma;
    const result = await client.safetyEvent.updateMany({
      where: { journeyId },
      data: { journeyId: null },
    });
    return { count: result.count };
  }

  async detachSafetyEventsForJourneys(journeyIds: string[], tx?: any): Promise<{ count: number }> {
    if (!journeyIds.length) return { count: 0 };
    const client = tx ?? this.prisma;
    const result = await client.safetyEvent.updateMany({
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
      const dbTraces = Array.isArray(existing.traceJson) ? (existing.traceJson as any[]) : [];
      const callerTraces = Array.isArray(params.traceJson) ? params.traceJson : [];
      const existingSignatures = new Set(dbTraces.map((t) => JSON.stringify(t)));
      const mergedTraces = [...dbTraces];
      for (const entry of callerTraces) {
        const sig = JSON.stringify(entry);
        if (!existingSignatures.has(sig)) {
          mergedTraces.push(entry);
          existingSignatures.add(sig);
        }
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
      existing.traceJson = mergedTraces;
      return { updated: true, job: mapAiJobRow(existing) };
    }

    // 1. Fetch latest traceJson from database row to merge onto it (P0-3)
    const existing = await this.prisma.aIJob.findUnique({ where: { id: params.id } });
    if (!existing) throw new NotFoundException('AI 任务不存在');
    if (!['queued', 'running'].includes(existing.status)) {
      return { updated: false, job: mapAiJobRow(existing) };
    }

    const dbTraces = Array.isArray(existing.traceJson) ? (existing.traceJson as any[]) : [];
    const callerTraces = Array.isArray(params.traceJson) ? params.traceJson : [];
    const existingSignatures = new Set(dbTraces.map((t) => JSON.stringify(t)));
    const mergedTraces = [...dbTraces];
    for (const entry of callerTraces) {
      const sig = JSON.stringify(entry);
      if (!existingSignatures.has(sig)) {
        mergedTraces.push(entry);
        existingSignatures.add(sig);
      }
    }

    // 2. Perform atomic CAS conditional update so only one racer wins under concurrency
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
        traceJson: mergedTraces as any,
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

  async listAdminAiJobs(
    page?: string,
    pageSize?: string,
  ): Promise<{
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

  async deleteAiJobsForArchive(params: { journeyId: string; actionIds: string[] }): Promise<{ count: number }> {
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

  // ==========================================
  // Batch 1 Sub-batch D: Journey, SituationSnapshot, JourneyUpdate
  // ==========================================

  async getJourneyById(id: string): Promise<LifeJourneyRecord | null> {
    const row = await this.prisma.lifeJourney.findUnique({ where: { id } });
    return row ? mapLifeJourneyRow(row) : null;
  }

  async getJourneyByIdAndUser(id: string, userId: string): Promise<LifeJourneyRecord | null> {
    const row = await this.prisma.lifeJourney.findFirst({ where: { id, userId } });
    return row ? mapLifeJourneyRow(row) : null;
  }

  async getActiveJourneyForUser(userId: string): Promise<LifeJourneyRecord | null> {
    const row = await this.prisma.lifeJourney.findFirst({
      where: { userId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
    });
    return row ? mapLifeJourneyRow(row) : null;
  }

  async listJourneysForUser(userId: string, filter?: { status?: string }): Promise<LifeJourneyRecord[]> {
    const where: Prisma.LifeJourneyWhereInput = { userId };
    if (filter?.status && filter.status !== 'all') {
      where.status = filter.status as any;
    }
    const rows = await this.prisma.lifeJourney.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(mapLifeJourneyRow);
  }

  async listArchivedJourneysForUser(userId: string): Promise<LifeJourneyRecord[]> {
    const rows = await this.prisma.lifeJourney.findMany({
      where: { userId, status: { in: ['archived', 'completed'] } },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(mapLifeJourneyRow);
  }

  async getSnapshotByJourneyId(journeyId: string): Promise<SituationSnapshotRecord | null> {
    const row = await this.prisma.situationSnapshot.findUnique({ where: { journeyId } });
    return row ? mapSituationSnapshotRow(row) : null;
  }

  async listUpdatesForJourney(journeyId: string, limit?: number): Promise<JourneyUpdateRecord[]> {
    const rows = await this.prisma.journeyUpdate.findMany({
      where: { journeyId },
      orderBy: { createdAt: 'desc' },
      ...(limit ? { take: limit } : {}),
    });
    return rows.map(mapJourneyUpdateRow);
  }

  async countUpdatesForJourney(journeyId: string): Promise<number> {
    return await this.prisma.journeyUpdate.count({ where: { journeyId } });
  }

  async countUpdatesByJourneyIds(journeyIds: string[]): Promise<Map<string, number>> {
    if (journeyIds.length === 0) return new Map();
    const rows = await this.prisma.journeyUpdate.groupBy({
      by: ['journeyId'],
      where: { journeyId: { in: journeyIds } },
      _count: { id: true },
    });
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(r.journeyId, r._count.id);
    }
    return map;
  }

  async countActiveJourneys(userId?: string): Promise<number> {
    return await this.prisma.lifeJourney.count({
      where: {
        status: 'active',
        ...(userId ? { userId } : {}),
      },
    });
  }

  async countTotalJourneys(): Promise<number> {
    return await this.prisma.lifeJourney.count();
  }

  async getSupportIntentDistribution(): Promise<Record<string, number>> {
    const rows = await this.prisma.lifeJourney.groupBy({
      by: ['currentIntent'],
      where: { currentIntent: { not: null } },
      _count: { currentIntent: true },
    });
    const dist: Record<string, number> = {};
    for (const r of rows) {
      if (r.currentIntent) dist[r.currentIntent] = r._count.currentIntent;
    }
    return dist;
  }

  async getAvailableMonthsForJourneys(userId: string): Promise<string[]> {
    const journeys = await this.prisma.lifeJourney.findMany({
      where: { userId },
      select: { createdAt: true, updatedAt: true, completedAt: true, intentUpdatedAt: true },
    });
    const months = new Set<string>();
    const addDate = (d?: Date | null) => {
      if (d) {
        const isoStr = d.toISOString();
        if (/^\d{4}-\d{2}/.test(isoStr)) months.add(isoStr.slice(0, 7));
      }
    };
    for (const j of journeys) {
      addDate(j.createdAt);
      addDate(j.updatedAt);
      addDate(j.completedAt);
      addDate(j.intentUpdatedAt);
    }
    return Array.from(months);
  }

  async getJourneysForMonth(userId: string): Promise<LifeJourneyRecord[]> {
    const rows = await this.prisma.lifeJourney.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(mapLifeJourneyRow);
  }

  async listAdminJourneys(): Promise<LifeJourneyRecord[]> {
    const rows = await this.prisma.lifeJourney.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(mapLifeJourneyRow);
  }

  async getJourneysByIds(ids: string[]): Promise<LifeJourneyRecord[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.lifeJourney.findMany({
      where: { id: { in: ids } },
    });
    return rows.map(mapLifeJourneyRow);
  }

  async listUpdatesForLegacyCleanup(params: {
    demoUserId: string;
    fixturePattern: RegExp;
  }): Promise<JourneyUpdateRecord[]> {
    const rows = await this.prisma.journeyUpdate.findMany({
      where: { userId: params.demoUserId },
    });
    return rows.filter((row) => params.fixturePattern.test(row.content)).map(mapJourneyUpdateRow);
  }

  async listJourneysForLegacyCleanup(params: {
    demoUserId: string;
    fixturePattern: RegExp;
  }): Promise<LifeJourneyRecord[]> {
    const rows = await this.prisma.lifeJourney.findMany({
      where: { userId: params.demoUserId },
    });
    return rows
      .filter((row) => params.fixturePattern.test(`${row.title}\n${row.summary ?? ''}`))
      .map(mapLifeJourneyRow);
  }

  async createJourneyWithSnapshotAndUpdate(params: {
    journey: {
      id: string;
      userId: string;
      title: string;
      domain: string;
      status: 'active' | 'paused' | 'completed' | 'archived';
      stage: string;
      visibility: Visibility;
      intensity?: number;
      initialIntensity?: number;
      summary?: string;
      createdAt: string;
      updatedAt: string;
    };
    snapshot: {
      id: string;
      journeyId: string;
      facts: string[];
      feelings: string[];
      needs: string[];
      constraints: string[];
      risks: string[];
      domain: string;
      contextTags: string[];
      confidence: 'user_confirmed' | 'agent_draft';
      createdAt: string;
      updatedAt: string;
    };
    update: {
      id: string;
      journeyId: string;
      userId: string;
      kind: string;
      content: string;
      createdAt: string;
    };
    safetyEvent?: {
      id: string;
      level: 'high';
      source: string;
      action: string;
      payload?: Record<string, unknown>;
      _failDuringSafetyEvent?: boolean;
    };
  }): Promise<{
    journey: LifeJourneyRecord;
    snapshot: SituationSnapshotRecord;
    update: JourneyUpdateRecord;
    safetyEvent?: SafetyEventRecord;
  }> {
    return await this.prisma.$transaction(async (tx) => {
      // Global lock hierarchy: User -> LifeJourney -> child records
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id = ${params.journey.userId} FOR UPDATE`);
      const createdJourney = await tx.lifeJourney.create({
        data: {
          id: params.journey.id,
          userId: params.journey.userId,
          title: params.journey.title,
          domain: params.journey.domain,
          status: params.journey.status,
          stage: params.journey.stage,
          visibility: params.journey.visibility,
          intensity: params.journey.intensity ?? null,
          initialIntensity: params.journey.initialIntensity ?? null,
          summary: params.journey.summary ?? null,
          createdAt: new Date(params.journey.createdAt),
          updatedAt: new Date(params.journey.updatedAt),
        },
      });

      const createdSnapshot = await tx.situationSnapshot.create({
        data: {
          id: params.snapshot.id,
          journeyId: params.snapshot.journeyId,
          facts: params.snapshot.facts as Prisma.InputJsonValue,
          feelings: params.snapshot.feelings as Prisma.InputJsonValue,
          needs: params.snapshot.needs as Prisma.InputJsonValue,
          constraints: params.snapshot.constraints as Prisma.InputJsonValue,
          risks: params.snapshot.risks as Prisma.InputJsonValue,
          domain: params.snapshot.domain,
          contextTags: params.snapshot.contextTags as Prisma.InputJsonValue,
          confidence: params.snapshot.confidence,
          createdAt: new Date(params.snapshot.createdAt),
          updatedAt: new Date(params.snapshot.updatedAt),
        },
      });

      const createdUpdate = await tx.journeyUpdate.create({
        data: {
          id: params.update.id,
          journeyId: params.update.journeyId,
          userId: params.update.userId,
          kind: params.update.kind,
          content: params.update.content,
          createdAt: new Date(params.update.createdAt),
        },
      });

      let createdSafetyEvent: any = undefined;
      if (params.safetyEvent) {
        if (params.safetyEvent._failDuringSafetyEvent) {
          throw new Error('Simulated failure during atomic safety event creation');
        }
        createdSafetyEvent = await tx.safetyEvent.create({
          data: {
            id: params.safetyEvent.id,
            userId: params.journey.userId,
            journeyId: createdJourney.id,
            level: params.safetyEvent.level,
            source: params.safetyEvent.source,
            action: params.safetyEvent.action,
            payload: params.safetyEvent.payload
              ? (params.safetyEvent.payload as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            status: 'open',
            createdAt: new Date(params.journey.createdAt),
          },
        });
      }

      return {
        journey: mapLifeJourneyRow(createdJourney),
        snapshot: mapSituationSnapshotRow(createdSnapshot),
        update: mapJourneyUpdateRow(createdUpdate),
        safetyEvent: createdSafetyEvent ? mapSafetyEventRow(createdSafetyEvent) : undefined,
      };
    });
  }

  async patchJourney(
    journeyId: string,
    body: { status?: 'active' | 'paused' | 'archived'; title?: string; summary?: string; expectedUpdatedAt?: Date | string },
    expectedUpdatedAt: Date | string | undefined,
    userId: string,
  ): Promise<LifeJourneyRecord> {
    return await this.prisma.$transaction(async (tx) => {
      // P0-3: If requested status is 'active', lock the parent User row FIRST before any read that informs the activation decision
      if (body.status === 'active') {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`);
        const activeCount = await tx.lifeJourney.count({
          where: { userId, status: 'active', id: { not: journeyId } },
        });
        if (activeCount > 0) {
          throw new BadRequestException('请先结束或暂停当前旅程，再恢复这段归档');
        }
      }

      const existing = await tx.lifeJourney.findUnique({ where: { id: journeyId } });
      if (!existing || existing.userId !== userId) {
        throw new NotFoundException('旅程不存在或无权访问');
      }

      const data: Prisma.LifeJourneyUpdateInput = {};
      if (typeof body.title === 'string' && body.title.trim()) {
        data.title = body.title.trim().slice(0, 120);
      }
      if (typeof body.summary === 'string') {
        data.summary = body.summary.trim().slice(0, 500);
      }
      if (body.status) {
        data.status = body.status;
      }
      data.updatedAt = new Date();

      const expectedVersion = expectedUpdatedAt ?? (body as any).expectedUpdatedAt;
      if (expectedVersion) {
        const result = await tx.lifeJourney.updateMany({
          where: { id: journeyId, updatedAt: new Date(expectedVersion) },
          data,
        });
        if (result.count === 0) {
          throw new ConflictException('旅程已被并发更新，请刷新重试');
        }
      } else {
        await tx.lifeJourney.update({
          where: { id: journeyId },
          data,
        });
      }

      const updated = await tx.lifeJourney.findUnique({ where: { id: journeyId } });
      return mapLifeJourneyRow(updated!);
    });
  }

  async setJourneyIntent(params: {
    journeyId: string;
    intent: SupportIntent;
    stage: string;
    intentUpdatedAt: string;
    updatedAt: string;
    safetyEvent?: {
      id: string;
      userId: string;
      level: 'high';
      source: string;
      action: string;
      payload?: Record<string, unknown>;
      _failDuringSafetyEvent?: boolean;
    };
  }): Promise<{ journey: LifeJourneyRecord; safetyEvent?: SafetyEventRecord }> {
    return await this.prisma.$transaction(async (tx) => {
      // Global lock hierarchy: User -> LifeJourney
      const preCheck = await tx.lifeJourney.findUnique({ where: { id: params.journeyId }, select: { userId: true } });
      if (!preCheck) throw new NotFoundException('旅程不存在');
      const targetUserId = params.safetyEvent?.userId ?? preCheck.userId;
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id = ${targetUserId} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "LifeJourney" WHERE id = ${params.journeyId} FOR UPDATE`);
      const updated = await tx.lifeJourney.update({
        where: { id: params.journeyId },
        data: {
          currentIntent: params.intent,
          stage: params.stage,
          intentUpdatedAt: new Date(params.intentUpdatedAt),
          updatedAt: new Date(params.updatedAt),
        },
      });

      let createdSafetyEvent: any = undefined;
      if (params.safetyEvent) {
        if (params.safetyEvent._failDuringSafetyEvent) {
          throw new Error('Simulated failure during atomic safety event creation on intent transition');
        }
        createdSafetyEvent = await tx.safetyEvent.create({
          data: {
            id: params.safetyEvent.id,
            userId: params.safetyEvent.userId,
            journeyId: updated.id,
            level: params.safetyEvent.level,
            source: params.safetyEvent.source,
            action: params.safetyEvent.action,
            payload: params.safetyEvent.payload
              ? (params.safetyEvent.payload as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            status: 'open',
            createdAt: new Date(params.updatedAt),
          },
        });
      }

      return {
        journey: mapLifeJourneyRow(updated),
        safetyEvent: createdSafetyEvent ? mapSafetyEventRow(createdSafetyEvent) : undefined,
      };
    });
  }

  async confirmSituation(params: {
    journeyId: string;
    snapshotInput: {
      facts?: string[];
      feelings?: string[];
      needs?: string[];
      constraints?: string[];
      risks?: string[];
      domain?: string;
      subDomain?: string;
      eventType?: string;
      stage?: string;
      contextTags?: string[];
      peopleContext?: string[];
      decisionContext?: string[];
      behaviorSignals?: string[];
      recoverySignals?: string[];
      intensity?: number;
      urgency?: number;
    };
    submittedIntensity?: number;
    shouldRecordIntensity: boolean;
    updateContent?: string;
  }): Promise<{ snapshot: SituationSnapshotRecord; journey: LifeJourneyRecord }> {
    return await this.prisma.$transaction(async (tx) => {
      // Global lock hierarchy: User -> LifeJourney
      const preCheck = await tx.lifeJourney.findUnique({ where: { id: params.journeyId }, select: { userId: true } });
      if (!preCheck) throw new NotFoundException('旅程不存在');
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id = ${preCheck.userId} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "LifeJourney" WHERE id = ${params.journeyId} FOR UPDATE`);
      const dbSnapshot = await tx.situationSnapshot.findUnique({ where: { journeyId: params.journeyId } });
      if (!dbSnapshot) throw new NotFoundException('情境快照不存在');
      const dbJourney = await tx.lifeJourney.findUnique({ where: { id: params.journeyId } });
      if (!dbJourney) throw new NotFoundException('旅程不存在');

      const nowTime = new Date();
      const updatedSnapshot = await tx.situationSnapshot.update({
        where: { journeyId: params.journeyId },
        data: {
          facts: (params.snapshotInput.facts ?? (dbSnapshot.facts as any)) as Prisma.InputJsonValue,
          feelings: (params.snapshotInput.feelings ?? (dbSnapshot.feelings as any)) as Prisma.InputJsonValue,
          needs: (params.snapshotInput.needs ?? (dbSnapshot.needs as any)) as Prisma.InputJsonValue,
          constraints: (params.snapshotInput.constraints ?? (dbSnapshot.constraints as any)) as Prisma.InputJsonValue,
          risks: (params.snapshotInput.risks ?? (dbSnapshot.risks as any)) as Prisma.InputJsonValue,
          domain: params.snapshotInput.domain ?? dbSnapshot.domain,
          subDomain: params.snapshotInput.subDomain ?? dbSnapshot.subDomain,
          eventType: params.snapshotInput.eventType ?? dbSnapshot.eventType,
          stage: params.snapshotInput.stage ?? dbSnapshot.stage,
          contextTags: (params.snapshotInput.contextTags ?? (dbSnapshot.contextTags as any)) as Prisma.InputJsonValue,
          peopleContext: (params.snapshotInput.peopleContext ??
            (dbSnapshot.peopleContext as any)) as Prisma.InputJsonValue,
          decisionContext: (params.snapshotInput.decisionContext ??
            (dbSnapshot.decisionContext as any)) as Prisma.InputJsonValue,
          behaviorSignals: (params.snapshotInput.behaviorSignals ??
            (dbSnapshot.behaviorSignals as any)) as Prisma.InputJsonValue,
          recoverySignals: (params.snapshotInput.recoverySignals ??
            (dbSnapshot.recoverySignals as any)) as Prisma.InputJsonValue,
          intensity: params.snapshotInput.intensity ?? dbSnapshot.intensity,
          urgency: params.snapshotInput.urgency ?? dbSnapshot.urgency,
          fingerprintJson: {
            domain: params.snapshotInput.domain ?? dbSnapshot.domain,
            subDomain: params.snapshotInput.subDomain ?? dbSnapshot.subDomain,
            eventType: params.snapshotInput.eventType ?? dbSnapshot.eventType,
            stage: params.snapshotInput.stage ?? dbSnapshot.stage,
            contextTags: params.snapshotInput.contextTags ?? dbSnapshot.contextTags,
            peopleContext: params.snapshotInput.peopleContext ?? dbSnapshot.peopleContext,
            decisionContext: params.snapshotInput.decisionContext ?? dbSnapshot.decisionContext,
            behaviorSignals: params.snapshotInput.behaviorSignals ?? dbSnapshot.behaviorSignals,
            recoverySignals: params.snapshotInput.recoverySignals ?? dbSnapshot.recoverySignals,
          } as Prisma.InputJsonValue,
          confidence: 'user_confirmed',
          updatedAt: nowTime,
        },
      });

      const journeyData: Prisma.LifeJourneyUpdateInput = { updatedAt: nowTime };
      if (params.submittedIntensity !== undefined) {
        journeyData.intensity = params.submittedIntensity;
        if (dbJourney.initialIntensity == null) {
          journeyData.initialIntensity = params.submittedIntensity;
        }
      }
      const updatedJourney = await tx.lifeJourney.update({
        where: { id: params.journeyId },
        data: journeyData,
      });

      if (params.shouldRecordIntensity && params.updateContent) {
        await tx.journeyUpdate.create({
          data: {
            id: `journey_update_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            journeyId: params.journeyId,
            userId: dbJourney.userId,
            kind: 'intensity',
            content: params.updateContent,
            intensity: params.submittedIntensity,
            createdAt: nowTime,
          },
        });
      }

      return {
        snapshot: mapSituationSnapshotRow(updatedSnapshot),
        journey: mapLifeJourneyRow(updatedJourney),
      };
    });
  }

  async reanalyzeSituation(params: {
    journeyId: string;
    userId: string;
    updateId: string;
  }): Promise<{ snapshot: SituationSnapshotRecord }> {
    return await this.prisma.$transaction(async (tx) => {
      // Global lock hierarchy: User -> LifeJourney
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id = ${params.userId} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "LifeJourney" WHERE id = ${params.journeyId} FOR UPDATE`);
      const nowTime = new Date();
      const updatedSnapshot = await tx.situationSnapshot.update({
        where: { journeyId: params.journeyId },
        data: {
          confidence: 'agent_draft',
          updatedAt: nowTime,
        },
      });
      await tx.journeyUpdate.create({
        data: {
          id: params.updateId,
          journeyId: params.journeyId,
          userId: params.userId,
          kind: 'fingerprint_reanalysis_requested',
          content: '我请求系统根据原话重新整理了这段经历。',
          createdAt: nowTime,
        },
      });
      return { snapshot: mapSituationSnapshotRow(updatedSnapshot) };
    });
  }

  async acknowledgeSafety(params: {
    journeyId: string;
    userId: string;
    updateId: string;
  }): Promise<{ journey: LifeJourneyRecord }> {
    return await this.prisma.$transaction(async (tx) => {
      // Global lock hierarchy: User -> LifeJourney
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id = ${params.userId} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "LifeJourney" WHERE id = ${params.journeyId} FOR UPDATE`);
      const nowTime = new Date();
      const updatedJourney = await tx.lifeJourney.update({
        where: { id: params.journeyId },
        data: {
          stage: 'stabilizing',
          currentIntent: 'JUST_LISTEN',
          intentUpdatedAt: nowTime,
          updatedAt: nowTime,
        },
      });
      await tx.journeyUpdate.create({
        data: {
          id: params.updateId,
          journeyId: params.journeyId,
          userId: params.userId,
          kind: 'safety_acknowledged',
          content: '我暂时安全，决定继续留在这里，先让自己稳定下来。',
          createdAt: nowTime,
        },
      });
      return { journey: mapLifeJourneyRow(updatedJourney) };
    });
  }

  async addJourneyUpdate(
    journeyId: string,
    userId: string,
    update: {
      id: string;
      kind: string;
      content: string;
      stage?: string;
      intensity?: number;
      lifeFunction?: string;
      actionResult?: string;
      decisionChange?: string;
      contactState?: string;
      sleepState?: string;
      socialState?: string;
      selfReportedHelpfulness?: number;
      eventDate?: string;
      payload?: Record<string, unknown>;
      createdAt: string;
    },
  ): Promise<JourneyUpdateRecord> {
    return await this.prisma.$transaction(async (tx) => {
      // Global lock hierarchy: User -> LifeJourney
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "LifeJourney" WHERE id = ${journeyId} FOR UPDATE`);
      const created = await tx.journeyUpdate.create({
        data: {
          id: update.id,
          journeyId,
          userId,
          kind: update.kind,
          content: update.content,
          stage: update.stage ?? null,
          intensity: update.intensity ?? null,
          lifeFunction: update.lifeFunction ?? null,
          actionResult: update.actionResult ?? null,
          decisionChange: update.decisionChange ?? null,
          contactState: update.contactState ?? null,
          sleepState: update.sleepState ?? null,
          socialState: update.socialState ?? null,
          selfReportedHelpfulness: update.selfReportedHelpfulness ?? null,
          eventDate: update.eventDate ? new Date(update.eventDate) : null,
          payload: update.payload ? (update.payload as Prisma.InputJsonValue) : Prisma.JsonNull,
          createdAt: new Date(update.createdAt),
        },
      });
      await tx.lifeJourney.update({
        where: { id: journeyId },
        data: { updatedAt: new Date() },
      });
      return mapJourneyUpdateRow(created);
    });
  }

  async restoreArchivedJourney(journeyId: string, userId: string): Promise<LifeJourneyRecord> {
    return await this.prisma.$transaction(async (tx) => {
      // D3: Lock parent User row to serialize check-then-act against concurrent restores/inserts
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "LifeJourney" WHERE id = ${journeyId} FOR UPDATE`);

      const journey = await tx.lifeJourney.findUnique({ where: { id: journeyId } });
      if (!journey || journey.userId !== userId) throw new NotFoundException('旅程不存在或无权访问');
      if (journey.status !== 'archived') {
        throw new BadRequestException('只有手动归档的旅程可以恢复；已完成的旅程会保留在归档中');
      }

      const activeCount = await tx.lifeJourney.count({
        where: { userId, status: 'active', id: { not: journeyId } },
      });
      if (activeCount > 0) {
        throw new BadRequestException('请先结束或暂停当前旅程，再恢复这段归档');
      }

      const updated = await tx.lifeJourney.update({
        where: { id: journeyId },
        data: { status: 'active', updatedAt: new Date() },
      });
      return mapLifeJourneyRow(updated);
    });
  }

  async updateJourneyStatus(
    journeyId: string,
    status: 'active' | 'paused' | 'archived',
    userId?: string,
  ): Promise<LifeJourneyRecord> {
    return await this.prisma.$transaction(async (tx) => {
      const journey = await tx.lifeJourney.findUnique({ where: { id: journeyId } });
      if (!journey) throw new NotFoundException('旅程不存在');
      const targetUserId = userId ?? journey.userId;

      if (status === 'active') {
        // D3: Lock parent User row when activating
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id = ${targetUserId} FOR UPDATE`);
        const activeCount = await tx.lifeJourney.count({
          where: { userId: targetUserId, status: 'active', id: { not: journeyId } },
        });
        if (activeCount > 0) {
          throw new BadRequestException('请先结束或暂停当前旅程，再恢复这段归档');
        }
      }

      await tx.$queryRaw(Prisma.sql`SELECT id FROM "LifeJourney" WHERE id = ${journeyId} FOR UPDATE`);

      const updated = await tx.lifeJourney.update({
        where: { id: journeyId },
        data: { status, updatedAt: new Date() },
      });
      return mapLifeJourneyRow(updated);
    });
  }

  async graduateJourney(journeyId: string, userId: string): Promise<LifeJourneyRecord> {
    return await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "LifeJourney" WHERE id = ${journeyId} FOR UPDATE`);
      const journey = await tx.lifeJourney.findUnique({ where: { id: journeyId } });
      if (!journey || journey.userId !== userId) throw new NotFoundException('旅程不存在或无权访问');

      const nowTime = new Date();
      const updated = await tx.lifeJourney.update({
        where: { id: journeyId },
        data: {
          status: 'completed',
          stage: 'graduated',
          completedAt: nowTime,
          updatedAt: nowTime,
        },
      });
      return mapLifeJourneyRow(updated);
    });
  }

  async deleteJourneyArchive(params: {
    journeyId: string;
    userId: string;
    actionIds?: string[];
    archiveRoute: string;
    _failDuringTransaction?: boolean;
    _onLockedJourney?: () => Promise<void>;
  }): Promise<{ deletedJourneyId: string; deletedActionIds: string[] }> {
    return await this.prisma.$transaction(async (tx) => {
      // Global lock hierarchy: User -> LifeJourney -> child records
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id = ${params.userId} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "LifeJourney" WHERE id = ${params.journeyId} FOR UPDATE`);
      const journey = await tx.lifeJourney.findUnique({ where: { id: params.journeyId } });
      if (!journey || journey.userId !== params.userId) throw new NotFoundException('旅程不存在或无权访问');
      if (!['archived', 'completed'].includes(journey.status)) {
        throw new BadRequestException('只能删除已归档或已完成的旅程');
      }

      if (params._onLockedJourney) {
        await params._onLockedJourney();
      }

      const { journeyId } = params;

      // 1. Explicitly detach legacy relations
      await tx.diary.updateMany({ where: { journeyId }, data: { journeyId: null } });
      await tx.mood.updateMany({ where: { journeyId }, data: { journeyId: null } });
      await tx.post.updateMany({ where: { journeyId }, data: { journeyId: null } });
      await tx.peerExperience.updateMany({ where: { journeyId }, data: { journeyId: null } });
      await tx.peerMatch.updateMany({ where: { journeyId }, data: { journeyId: null } });
      await tx.decisionRecord.updateMany({ where: { journeyId }, data: { journeyId: null } });
      await tx.realityHandoff.updateMany({ where: { journeyId }, data: { journeyId: null } });
      await tx.messageToFutureSelf.updateMany({ where: { journeyId }, data: { journeyId: null } });
      await tx.personalSupportPlan.updateMany({ where: { journeyId }, data: { journeyId: null } });
      await tx.memoryItem.updateMany({ where: { journeyId }, data: { journeyId: null } });
      await tx.recoverySnapshot.updateMany({ where: { journeyId }, data: { journeyId: null } });
      await tx.agentDecisionLog.updateMany({ where: { journeyId }, data: { journeyId: null } });
      await tx.followUpJob.updateMany({ where: { journeyId }, data: { journeyId: null } });
      await this.detachSafetyEventsForJourney(journeyId, tx);

      // 2. Resolve action set inside the transaction
      const dbActions = await tx.actionCommitment.findMany({
        where: { journeyId },
        select: { id: true },
      });
      const resolvedActionIds = dbActions.map((a) => a.id);

      // 3. Delete child records using in-transaction resolved actionIds
      if (resolvedActionIds.length > 0) {
        await tx.outcomeCheckin.deleteMany({
          where: { OR: [{ journeyId }, { commitmentId: { in: resolvedActionIds } }] },
        });
        await tx.actionCommitment.deleteMany({ where: { id: { in: resolvedActionIds } } });
      } else {
        await tx.outcomeCheckin.deleteMany({ where: { journeyId } });
        await tx.actionCommitment.deleteMany({ where: { journeyId } });
      }
      await tx.journeyUpdate.deleteMany({ where: { journeyId } });
      await tx.situationSnapshot.deleteMany({ where: { journeyId } });

      const contentIds = [journeyId, ...resolvedActionIds];
      await tx.aIJob.deleteMany({ where: { contentId: { in: contentIds } } });
      await tx.userNotification.deleteMany({ where: { userId: params.userId, targetRoute: params.archiveRoute } });

      // 4. Delete LifeJourney row
      await tx.lifeJourney.delete({ where: { id: journeyId } });

      if (params._failDuringTransaction) {
        throw new Error('Simulated failure during deleteJourneyArchive transaction');
      }

      return { deletedJourneyId: journeyId, deletedActionIds: resolvedActionIds };
    });
  }

  async deleteJourneysForTestCleanup(params: {
    journeyIds: string[];
    actionIds: string[];
  }): Promise<{ count: number }> {
    if (params.journeyIds.length === 0) return { count: 0 };
    return await this.prisma.$transaction(async (tx) => {
      for (const journeyId of params.journeyIds) {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "LifeJourney" WHERE id = ${journeyId} FOR UPDATE`);
        await tx.diary.updateMany({ where: { journeyId }, data: { journeyId: null } });
        await tx.mood.updateMany({ where: { journeyId }, data: { journeyId: null } });
        await tx.post.updateMany({ where: { journeyId }, data: { journeyId: null } });
        await tx.peerExperience.updateMany({ where: { journeyId }, data: { journeyId: null } });
        await tx.peerMatch.updateMany({ where: { journeyId }, data: { journeyId: null } });
        await tx.decisionRecord.updateMany({ where: { journeyId }, data: { journeyId: null } });
        await tx.realityHandoff.updateMany({ where: { journeyId }, data: { journeyId: null } });
        await tx.messageToFutureSelf.updateMany({ where: { journeyId }, data: { journeyId: null } });
        await tx.personalSupportPlan.updateMany({ where: { journeyId }, data: { journeyId: null } });
        await tx.memoryItem.updateMany({ where: { journeyId }, data: { journeyId: null } });
        await tx.recoverySnapshot.updateMany({ where: { journeyId }, data: { journeyId: null } });
        await tx.agentDecisionLog.updateMany({ where: { journeyId }, data: { journeyId: null } });
        await tx.followUpJob.updateMany({ where: { journeyId }, data: { journeyId: null } });
        await this.detachSafetyEventsForJourney(journeyId, tx);
      }

      await tx.outcomeCheckin.deleteMany({
        where: {
          OR: [
            { journeyId: { in: params.journeyIds } },
            ...(params.actionIds.length ? [{ commitmentId: { in: params.actionIds } }] : []),
          ],
        },
      });
      if (params.actionIds.length > 0) {
        await tx.actionCommitment.deleteMany({ where: { id: { in: params.actionIds } } });
      }
      await tx.journeyUpdate.deleteMany({ where: { journeyId: { in: params.journeyIds } } });
      await tx.situationSnapshot.deleteMany({ where: { journeyId: { in: params.journeyIds } } });
      const delRes = await tx.lifeJourney.deleteMany({ where: { id: { in: params.journeyIds } } });
      return { count: delRes.count };
    });
  }

  async applySituationAnalysisAiCompletion(params: {
    journeyId: string;
    userId: string;
    completedJob: AIJobRecord;
    expectedJourneyUpdatedAt?: Date | string;
    expectedSnapshotUpdatedAt?: Date | string;
    isGeneratedTitle?: (title: string) => boolean;
  }): Promise<{ applied: boolean }> {
    const { journeyId, completedJob } = params;
    if (!['succeeded', 'fallback'].includes(completedJob.status)) return { applied: false };

    return await this.prisma.$transaction(async (tx) => {
      // Global lock hierarchy: User -> LifeJourney
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id = ${params.userId} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "LifeJourney" WHERE id = ${journeyId} FOR UPDATE`);
      const dbSnapshot = await tx.situationSnapshot.findUnique({
        where: { journeyId },
      });
      const dbJourney = await tx.lifeJourney.findUnique({
        where: { id: journeyId },
      });

      if (!dbJourney || !dbSnapshot) return { applied: false };

      // Commit-time condition: user_confirmed is NEVER overwritten or reverted by AI!
      if (dbSnapshot.confidence === 'user_confirmed') {
        return { applied: false };
      }

      const structured = (
        completedJob.structuredResult && typeof completedJob.structuredResult === 'object'
          ? completedJob.structuredResult
          : {}
      ) as Record<string, any>;

      const toList = (value: unknown, fallback: string[] = [], max = 8): string[] => {
        if (!Array.isArray(value)) return fallback;
        return value
          .map(String)
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, max);
      };

      const existingFacts = Array.isArray(dbSnapshot.facts) ? (dbSnapshot.facts as any[]).map(String) : [];
      const existingFeelings = Array.isArray(dbSnapshot.feelings) ? (dbSnapshot.feelings as any[]).map(String) : [];
      const existingNeeds = Array.isArray(dbSnapshot.needs) ? (dbSnapshot.needs as any[]).map(String) : [];
      const existingConstraints = Array.isArray(dbSnapshot.constraints)
        ? (dbSnapshot.constraints as any[]).map(String)
        : [];
      const existingRisks = Array.isArray(dbSnapshot.risks) ? (dbSnapshot.risks as any[]).map(String) : [];
      const existingContextTags = Array.isArray(dbSnapshot.contextTags)
        ? (dbSnapshot.contextTags as any[]).map(String)
        : [];

      const facts = toList(structured.facts, existingFacts);
      const feelings = toList(structured.feelings, existingFeelings);
      const needs = toList(structured.needs, existingNeeds);
      const constraints = toList(structured.constraints, existingConstraints);
      const risks = toList(structured.risks, existingRisks);
      const contextTags = toList(structured.contextTags, existingContextTags, 12);
      const peopleContext = toList(structured.peopleContext, []);
      const decisionContext = toList(structured.decisionContext, []);
      const behaviorSignals = toList(structured.behaviorSignals, []);
      const recoverySignals = toList(structured.recoverySignals, []);

      const domain = typeof structured.domain === 'string' ? structured.domain : dbSnapshot.domain;
      const subDomain = typeof structured.subDomain === 'string' ? structured.subDomain : dbSnapshot.subDomain;
      const eventType = typeof structured.eventType === 'string' ? structured.eventType : dbSnapshot.eventType;
      const stage = typeof structured.stage === 'string' ? structured.stage : (dbSnapshot.stage ?? 'clarifying');
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

      const nowTime = new Date();

      // Conditional CAS update on SituationSnapshot: confidence != user_confirmed at commit time
      const snapshotWhere: Prisma.SituationSnapshotWhereInput = {
        journeyId,
        confidence: { not: 'user_confirmed' },
      };
      if (params.expectedSnapshotUpdatedAt) {
        snapshotWhere.updatedAt = new Date(params.expectedSnapshotUpdatedAt);
      }

      const snapshotUpdate = await tx.situationSnapshot.updateMany({
        where: snapshotWhere,
        data: {
          facts: facts as Prisma.InputJsonValue,
          feelings: feelings as Prisma.InputJsonValue,
          needs: needs as Prisma.InputJsonValue,
          constraints: constraints as Prisma.InputJsonValue,
          risks: risks as Prisma.InputJsonValue,
          domain,
          subDomain,
          eventType,
          stage,
          contextTags: contextTags as Prisma.InputJsonValue,
          peopleContext: peopleContext as Prisma.InputJsonValue,
          decisionContext: decisionContext as Prisma.InputJsonValue,
          behaviorSignals: behaviorSignals as Prisma.InputJsonValue,
          recoverySignals: recoverySignals as Prisma.InputJsonValue,
          intensity: intensity ?? null,
          urgency: urgency ?? null,
          fingerprintJson: fingerprintJson as Prisma.InputJsonValue,
          confidence: 'agent_draft',
          updatedAt: nowTime,
        },
      });

      // CAS update on LifeJourney: only if not modified since queueing AI job
      const journeyWhere: Prisma.LifeJourneyWhereInput = {
        id: journeyId,
      };
      if (params.expectedJourneyUpdatedAt) {
        journeyWhere.updatedAt = new Date(params.expectedJourneyUpdatedAt);
      }

      const journeyData: Prisma.LifeJourneyUpdateInput = {
        summary: String(structured.summary ?? completedJob.result ?? '').slice(0, 500),
        updatedAt: nowTime,
      };
      const checkTitle = params.isGeneratedTitle ?? isGeneratedJourneyTitle;
      if (checkTitle(dbJourney.title) && typeof structured.title === 'string' && structured.title.trim()) {
        journeyData.title = structured.title.trim().slice(0, 80);
      }
      if (intensity !== undefined) {
        journeyData.intensity = intensity;
      }

      await tx.lifeJourney.updateMany({
        where: journeyWhere,
        data: journeyData,
      });

      return { applied: snapshotUpdate.count > 0 };
    });
  }

  async createActionCommitment(params: {
    journeyId: string;
    userId: string;
    title: string;
    description?: string;
    dueAt?: string;
    reminderAt?: string;
    parentActionId?: string;
    adaptationReason?: string;
    attemptNumber?: number;
  }): Promise<{
    item: ActionCommitmentRecord;
    checkin: OutcomeCheckinRecord;
    followUp: {
      id: string;
      userId: string;
      journeyId: string;
      kind: string;
      dueAt: string;
      status: string;
      payload: Record<string, unknown>;
      createdAt: string;
    };
  }> {
    return await this.prisma.$transaction(async (tx) => {
      // Global lock hierarchy: User -> LifeJourney -> ActionCommitment
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id = ${params.userId} FOR UPDATE`);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "LifeJourney" WHERE id = ${params.journeyId} FOR UPDATE`);
      const journey = await tx.lifeJourney.findUnique({ where: { id: params.journeyId } });
      if (!journey || journey.userId !== params.userId) {
        throw new NotFoundException('旅程不存在或无权访问');
      }

      // Validate parentActionId if provided
      if (params.parentActionId) {
        const parent = await tx.actionCommitment.findFirst({
          where: { id: params.parentActionId, userId: params.userId },
        });
        if (!parent) {
          throw new NotFoundException('原行动不存在');
        }
      }

      const nowTime = new Date();
      const actionId = `action_${crypto.randomBytes(5).toString('hex')}`;
      const checkinId = `checkin_${crypto.randomBytes(5).toString('hex')}`;
      const followUpId = `follow_up_${crypto.randomBytes(5).toString('hex')}`;
      const updateId = `journey_update_${crypto.randomBytes(5).toString('hex')}`;

      const dueAtDate = params.dueAt
        ? new Date(params.dueAt)
        : new Date(nowTime.getTime() + 24 * 3_600_000);
      const reminderAtDate = params.reminderAt ? new Date(params.reminderAt) : null;

      const actionRow = await tx.actionCommitment.create({
        data: {
          id: actionId,
          journeyId: params.journeyId,
          userId: params.userId,
          title: params.title,
          description: params.description ?? null,
          status: 'active',
          dueAt: dueAtDate,
          reminderAt: reminderAtDate,
          parentActionId: params.parentActionId ?? null,
          adaptationReason: params.adaptationReason ?? null,
          attemptNumber: params.attemptNumber ?? (params.parentActionId ? 2 : 1),
          createdAt: nowTime,
          updatedAt: nowTime,
        },
      });

      const checkinRow = await tx.outcomeCheckin.create({
        data: {
          id: checkinId,
          journeyId: params.journeyId,
          commitmentId: actionId,
          userId: params.userId,
          status: 'pending',
          dueAt: dueAtDate,
          createdAt: nowTime,
        },
      });

      // Update journey stage and touch updatedAt (LifeJourney before FollowUpJob)
      await tx.lifeJourney.update({
        where: { id: params.journeyId },
        data: {
          stage: 'acting',
          updatedAt: nowTime,
        },
      });

      // Create journeyUpdate
      await tx.journeyUpdate.create({
        data: {
          id: updateId,
          journeyId: params.journeyId,
          userId: params.userId,
          kind: 'commitment_created',
          content: params.title,
          payload: {
            parentActionId: params.parentActionId,
            adaptationReason: params.adaptationReason,
          } as any,
          createdAt: nowTime,
        },
      });

      const followUpPayload = { actionId, title: params.title };
      const followUpRow = await tx.followUpJob.create({
        data: {
          id: followUpId,
          userId: params.userId,
          journeyId: params.journeyId,
          kind: 'action_checkin',
          dueAt: dueAtDate,
          status: 'pending',
          payload: followUpPayload,
          createdAt: nowTime,
        },
      });

      return {
        item: mapActionCommitmentRow(actionRow),
        checkin: mapOutcomeCheckinRow(checkinRow),
        followUp: {
          id: followUpRow.id,
          userId: followUpRow.userId,
          journeyId: followUpRow.journeyId ?? params.journeyId,
          kind: followUpRow.kind,
          dueAt: followUpRow.dueAt.toISOString(),
          status: followUpRow.status,
          payload: followUpPayload,
          createdAt: followUpRow.createdAt.toISOString(),
        },
      };
    });
  }

  async checkinAction(params: {
    actionId: string;
    userId?: string;
    status?: string;
    reflection?: string;
    result?: string;
    intensity?: number;
    barrier?: string;
    outcome?: Record<string, unknown>;
    _failDuringTransaction?: boolean;
  }): Promise<{
    action: ActionCommitmentRecord;
    checkin: OutcomeCheckinRecord;
    followUp: {
      id: string;
      userId: string;
      journeyId: string;
      kind: string;
      dueAt: string;
      status: string;
      payload: Record<string, unknown>;
      completedAt?: string;
      createdAt: string;
    } | null;
  }> {
    return await this.prisma.$transaction(async (tx) => {
      // Query target action metadata without row lock to obtain journeyId under READ COMMITTED
      const actionMeta = await tx.actionCommitment.findUnique({
        where: { id: params.actionId },
        select: { id: true, journeyId: true, userId: true },
      });
      if (!actionMeta) throw new NotFoundException('行动不存在');
      if (params.userId && actionMeta.userId !== params.userId) {
        throw new NotFoundException('行动不存在');
      }

      // Global row-lock hierarchy: User -> LifeJourney -> Action
      // Step 1: Lock User row FIRST
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id = ${actionMeta.userId} FOR UPDATE`);

      // Step 2: Lock LifeJourney row SECOND
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "LifeJourney" WHERE id = ${actionMeta.journeyId} FOR UPDATE`);

      // Step 3: Lock parent Action row THIRD
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "ActionCommitment" WHERE id = ${params.actionId} FOR UPDATE`);

      const action = await tx.actionCommitment.findUnique({
        where: { id: params.actionId },
      });
      if (!action) throw new NotFoundException('行动不存在');

      // Find pending checkin for this action
      const pendingCheckin = await tx.outcomeCheckin.findFirst({
        where: { commitmentId: action.id, status: 'pending' },
        orderBy: { createdAt: 'desc' },
      });

      const rawStatus = ['completed', 'skipped', 'missed'].includes(String(params.status))
        ? String(params.status)
        : 'completed';
      const actionStatus = rawStatus === 'completed' ? 'completed' : rawStatus === 'skipped' ? 'skipped' : 'paused';
      const checkinStatus = rawStatus === 'completed' ? 'completed' : 'missed';
      const nowTime = new Date();

      let finalCheckinRow: any;
      if (pendingCheckin) {
        // D3: Status CAS - transition out of pending only once
        const casResult = await tx.outcomeCheckin.updateMany({
          where: { id: pendingCheckin.id, status: 'pending' },
          data: {
            status: checkinStatus,
            reflection: params.reflection ?? null,
            result: params.result ?? null,
            intensity: params.intensity ?? null,
            barrier: params.barrier ?? null,
            checkedAt: nowTime,
          },
        });
        if (casResult.count === 0) {
          // Already transitioned out of pending by concurrent write
          const terminalCheckin = await tx.outcomeCheckin.findUnique({ where: { id: pendingCheckin.id } });
          return {
            action: mapActionCommitmentRow(action),
            checkin: mapOutcomeCheckinRow(terminalCheckin!),
            followUp: null,
          };
        }
        finalCheckinRow = await tx.outcomeCheckin.findUnique({ where: { id: pendingCheckin.id } });
      } else {
        // No pending checkin: check if there is an existing terminal checkin for this action
        const existingTerminalCheckin = await tx.outcomeCheckin.findFirst({
          where: { commitmentId: action.id, status: { in: ['completed', 'missed'] } },
          orderBy: { createdAt: 'desc' },
        });
        if (existingTerminalCheckin) {
          // Idempotent: action is already in a terminal check-in state.
          // Return the existing terminal checkin unchanged — do NOT rewrite reflection, checkedAt, etc.
          // Do NOT emit a duplicate JourneyUpdate.
          return {
            action: mapActionCommitmentRow(action),
            checkin: mapOutcomeCheckinRow(existingTerminalCheckin),
            followUp: null,
          };
        }

        // Edge case: action had no checkin row at all (created without checkin)
        finalCheckinRow = await tx.outcomeCheckin.create({
          data: {
            id: `checkin_${crypto.randomBytes(5).toString('hex')}`,
            journeyId: action.journeyId,
            commitmentId: action.id,
            userId: action.userId,
            status: checkinStatus,
            reflection: params.reflection ?? null,
            result: params.result ?? null,
            intensity: params.intensity ?? null,
            barrier: params.barrier ?? null,
            checkedAt: nowTime,
            dueAt: action.dueAt,
            createdAt: nowTime,
          },
        });
      }

      const updatedAction = await tx.actionCommitment.update({
        where: { id: params.actionId },
        data: {
          status: actionStatus,
          updatedAt: nowTime,
        },
      });

      // Create JourneyUpdate and update LifeJourney (LifeJourney locked before FollowUpJob)
      const outcome = params.outcome ?? {};
      const checkinRecord = mapOutcomeCheckinRow(finalCheckinRow);
      const updateId = `journey_update_${crypto.randomBytes(5).toString('hex')}`;
      await tx.journeyUpdate.create({
        data: {
          id: updateId,
          journeyId: action.journeyId,
          userId: action.userId,
          kind: 'checkin',
          content: checkinRecord.reflection || `行动${actionStatus === 'completed' ? '已完成' : '已更新'}`,
          payload: { ...outcome, barrier: params.barrier } as any,
          stage: typeof outcome.stage === 'string' ? outcome.stage : null,
          intensity: Number.isFinite(Number(outcome.intensity))
            ? Number(outcome.intensity)
            : (checkinRecord.intensity ?? null),
          lifeFunction: (outcome.lifeFunction as string) ?? null,
          actionResult: (outcome.actionResult as string) ?? null,
          decisionChange: (outcome.decisionChange as string) ?? null,
          contactState: (outcome.contactState as string) ?? null,
          sleepState: (outcome.sleepState as string) ?? null,
          socialState: (outcome.socialState as string) ?? null,
          selfReportedHelpfulness: Number.isFinite(Number(outcome.selfReportedHelpfulness))
            ? Number(outcome.selfReportedHelpfulness)
            : null,
          createdAt: nowTime,
        },
      });

      await tx.lifeJourney.update({
        where: { id: action.journeyId },
        data: { updatedAt: nowTime },
      });

      // Update matching pending followUpJob (FollowUpJob locked after LifeJourney)
      const pendingFollowUps = await tx.followUpJob.findMany({
        where: {
          userId: action.userId,
          status: 'pending',
          kind: 'action_checkin',
        },
      });
      const matchingFollowUp = pendingFollowUps.find(
        (item: any) => (item.payload as any)?.actionId === action.id,
      );
      let updatedFollowUp: any = null;
      if (matchingFollowUp) {
        updatedFollowUp = await tx.followUpJob.update({
          where: { id: matchingFollowUp.id },
          data: {
            status: 'completed',
            completedAt: nowTime,
          },
        });
      }

      if (params._failDuringTransaction) {
        throw new Error('Simulated failure during checkinAction transaction');
      }

      return {
        action: mapActionCommitmentRow(updatedAction),
        checkin: checkinRecord,
        followUp: updatedFollowUp
          ? {
              id: updatedFollowUp.id,
              userId: updatedFollowUp.userId,
              journeyId: updatedFollowUp.journeyId ?? action.journeyId,
              kind: updatedFollowUp.kind,
              dueAt: updatedFollowUp.dueAt.toISOString(),
              status: updatedFollowUp.status,
              payload: updatedFollowUp.payload as Record<string, unknown>,
              completedAt: updatedFollowUp.completedAt?.toISOString(),
              createdAt: updatedFollowUp.createdAt.toISOString(),
            }
          : null,
      };
    });
  }

  async ensurePendingCheckin(
    actionId: string,
    params?: { dueAt?: string | Date; now?: Date },
  ): Promise<OutcomeCheckinRecord> {
    return await this.prisma.$transaction(async (tx) => {
      // Global row-lock hierarchy: User -> LifeJourney -> Action
      const actionMeta = await tx.actionCommitment.findUnique({
        where: { id: actionId },
        select: { id: true, journeyId: true, userId: true },
      });
      if (!actionMeta) throw new NotFoundException('行动不存在');

      // Step 1: Lock User row FIRST
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id = ${actionMeta.userId} FOR UPDATE`);

      // Step 2: Lock LifeJourney row SECOND
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "LifeJourney" WHERE id = ${actionMeta.journeyId} FOR UPDATE`);

      // Step 3: Lock parent Action row THIRD
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "ActionCommitment" WHERE id = ${actionId} FOR UPDATE`);
      const action = await tx.actionCommitment.findUnique({ where: { id: actionId } });
      if (!action) throw new NotFoundException('行动不存在');

      const existingPending = await tx.outcomeCheckin.findFirst({
        where: { commitmentId: actionId, status: 'pending' },
        orderBy: { createdAt: 'desc' },
      });
      if (existingPending) {
        return mapOutcomeCheckinRow(existingPending);
      }

      const nowTime = params?.now ?? new Date();
      const dueAt = params?.dueAt ? new Date(params.dueAt) : (action.dueAt ?? nowTime);
      const created = await tx.outcomeCheckin.create({
        data: {
          id: `checkin_${crypto.randomBytes(5).toString('hex')}`,
          journeyId: action.journeyId,
          commitmentId: action.id,
          userId: action.userId,
          status: 'pending',
          dueAt,
          createdAt: nowTime,
        },
      });
      return mapOutcomeCheckinRow(created);
    });
  }

  async getActionById(id: string): Promise<ActionCommitmentRecord | null> {
    const row = await this.prisma.actionCommitment.findUnique({ where: { id } });
    return row ? mapActionCommitmentRow(row) : null;
  }

  async getActionByIdAndUser(id: string, userId: string): Promise<ActionCommitmentRecord | null> {
    const row = await this.prisma.actionCommitment.findFirst({ where: { id, userId } });
    return row ? mapActionCommitmentRow(row) : null;
  }

  async getCheckinById(id: string): Promise<OutcomeCheckinRecord | null> {
    const row = await this.prisma.outcomeCheckin.findUnique({ where: { id } });
    return row ? mapOutcomeCheckinRow(row) : null;
  }

  async listActionsForJourney(journeyId: string, limit?: number): Promise<ActionCommitmentRecord[]> {
    const rows = await this.prisma.actionCommitment.findMany({
      where: { journeyId },
      orderBy: { createdAt: 'desc' },
      ...(limit ? { take: limit } : {}),
    });
    return rows.map(mapActionCommitmentRow);
  }

  async listCheckinsForJourney(journeyId: string, limit?: number): Promise<OutcomeCheckinRecord[]> {
    const rows = await this.prisma.outcomeCheckin.findMany({
      where: { journeyId },
      orderBy: { createdAt: 'desc' },
      ...(limit ? { take: limit } : {}),
    });
    return rows.map(mapOutcomeCheckinRow);
  }

  async listActiveActionsForUser(userId: string, limit = 3): Promise<ActionCommitmentRecord[]> {
    const rows = await this.prisma.actionCommitment.findMany({
      where: { userId, status: 'active' },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(mapActionCommitmentRow);
  }

  async listDueCheckinsForUser(userId: string, limit = 3): Promise<OutcomeCheckinRecord[]> {
    const nowTime = new Date();
    const rows = await this.prisma.outcomeCheckin.findMany({
      where: {
        userId,
        status: 'pending',
        OR: [{ dueAt: null }, { dueAt: { lte: nowTime } }],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(mapOutcomeCheckinRow);
  }

  async getLatestActionForJourney(journeyId: string): Promise<ActionCommitmentRecord | null> {
    const row = await this.prisma.actionCommitment.findFirst({
      where: { journeyId },
      orderBy: { createdAt: 'desc' },
    });
    return row ? mapActionCommitmentRow(row) : null;
  }

  async countActionsByJourneyIds(journeyIds: string[]): Promise<Map<string, number>> {
    if (journeyIds.length === 0) return new Map();
    const grouped = await this.prisma.actionCommitment.groupBy({
      by: ['journeyId'],
      where: { journeyId: { in: journeyIds } },
      _count: { id: true },
    });
    const map = new Map<string, number>();
    for (const g of grouped) {
      map.set(g.journeyId, g._count.id);
    }
    return map;
  }

  async countCheckinsByJourneyIds(journeyIds: string[]): Promise<Map<string, number>> {
    if (journeyIds.length === 0) return new Map();
    const grouped = await this.prisma.outcomeCheckin.groupBy({
      by: ['journeyId'],
      where: { journeyId: { in: journeyIds } },
      _count: { id: true },
    });
    const map = new Map<string, number>();
    for (const g of grouped) {
      map.set(g.journeyId, g._count.id);
    }
    return map;
  }

  async countCheckinsForJourney(journeyId: string): Promise<number> {
    return await this.prisma.outcomeCheckin.count({ where: { journeyId } });
  }

  async countCompletedActionsForJourney(journeyId: string): Promise<number> {
    return await this.prisma.actionCommitment.count({
      where: { journeyId, status: 'completed' },
    });
  }

  async getLatestIntensityForJourney(journeyId: string): Promise<number | undefined> {
    const row = await this.prisma.outcomeCheckin.findFirst({
      where: { journeyId, intensity: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    return row?.intensity ?? undefined;
  }

  async countActiveActions(): Promise<number> {
    return await this.prisma.actionCommitment.count({ where: { status: 'active' } });
  }

  async countDueCheckins(): Promise<number> {
    const nowTime = new Date();
    return await this.prisma.outcomeCheckin.count({
      where: {
        status: 'pending',
        OR: [{ dueAt: null }, { dueAt: { lte: nowTime } }],
      },
    });
  }

  async countTotalActions(): Promise<number> {
    return await this.prisma.actionCommitment.count();
  }

  async listAdminActions(): Promise<ActionCommitmentRecord[]> {
    const rows = await this.prisma.actionCommitment.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapActionCommitmentRow);
  }

  async listAdminCheckins(): Promise<OutcomeCheckinRecord[]> {
    const rows = await this.prisma.outcomeCheckin.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapOutcomeCheckinRow);
  }

  async getActionsForUser(userId: string): Promise<ActionCommitmentRecord[]> {
    const rows = await this.prisma.actionCommitment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapActionCommitmentRow);
  }

  async getCheckinsForUser(userId: string): Promise<OutcomeCheckinRecord[]> {
    const rows = await this.prisma.outcomeCheckin.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapOutcomeCheckinRow);
  }

  async getAvailableMonthsForActions(userId: string): Promise<string[]> {
    const actions = await this.prisma.actionCommitment.findMany({
      where: { userId },
      select: { createdAt: true, updatedAt: true, dueAt: true, reminderAt: true },
    });
    const months = new Set<string>();
    const addDate = (d?: Date | null) => {
      if (d) {
        const isoStr = d.toISOString();
        if (/^\d{4}-\d{2}/.test(isoStr)) months.add(isoStr.slice(0, 7));
      }
    };
    for (const a of actions) {
      addDate(a.createdAt);
      addDate(a.updatedAt);
      addDate(a.dueAt);
      addDate(a.reminderAt);
    }
    return Array.from(months);
  }

  async getAvailableMonthsForCheckins(userId: string): Promise<string[]> {
    const checkins = await this.prisma.outcomeCheckin.findMany({
      where: { userId },
      select: { createdAt: true, checkedAt: true, dueAt: true },
    });
    const months = new Set<string>();
    const addDate = (d?: Date | null) => {
      if (d) {
        const isoStr = d.toISOString();
        if (/^\d{4}-\d{2}/.test(isoStr)) months.add(isoStr.slice(0, 7));
      }
    };
    for (const c of checkins) {
      addDate(c.createdAt);
      addDate(c.checkedAt);
      addDate(c.dueAt);
    }
    return Array.from(months);
  }

  async getActionIdsForJourney(journeyId: string): Promise<string[]> {
    const rows = await this.prisma.actionCommitment.findMany({
      where: { journeyId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  async listActionsForTestCleanup(params: {
    journeyIds: string[];
    demoUserId: string;
    legacy?: boolean;
    fixturePattern?: RegExp;
  }): Promise<{ actionIds: string[]; actionJourneyIds: string[] }> {
    const rows = await this.prisma.actionCommitment.findMany({
      where: {
        OR: [
          ...(params.journeyIds.length ? [{ journeyId: { in: params.journeyIds } }] : []),
          ...(params.legacy ? [{ userId: params.demoUserId }] : []),
        ],
      },
      select: { id: true, journeyId: true, title: true, userId: true },
    });
    const actionIds = new Set<string>();
    const actionJourneyIds = new Set<string>();
    for (const r of rows) {
      if (params.journeyIds.includes(r.journeyId)) {
        actionIds.add(r.id);
        actionJourneyIds.add(r.journeyId);
      } else if (params.legacy && r.userId === params.demoUserId && params.fixturePattern?.test(r.title)) {
        actionIds.add(r.id);
        actionJourneyIds.add(r.journeyId);
      }
    }
    return {
      actionIds: Array.from(actionIds),
      actionJourneyIds: Array.from(actionJourneyIds),
    };
  }
}
