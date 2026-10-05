import crypto from 'node:crypto';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { UserNotification } from '@goodnight/shared-types';
import { PrismaRuntimeService } from './prisma-runtime.service.js';

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
  ): Promise<{ item: SafetyEventRecord; auditId: string; before: SafetyEventRecord }> {
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

      return { item: afterItem, auditId, before: beforeItem };
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
}
