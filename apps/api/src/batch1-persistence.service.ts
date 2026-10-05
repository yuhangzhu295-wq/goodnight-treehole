import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { UserNotification } from '@goodnight/shared-types';
import { PrismaRuntimeService } from './prisma-runtime.service.js';

export const DIRECT_DB_MODELS = {
  UserNotification: 'notifications',
} as const;

export type DirectDbModelName = keyof typeof DIRECT_DB_MODELS;
export type DirectDbCollectionName = (typeof DIRECT_DB_MODELS)[DirectDbModelName];

export function isDirectDbModel(modelName: string): modelName is DirectDbModelName {
  return Object.prototype.hasOwnProperty.call(DIRECT_DB_MODELS, modelName);
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
}
