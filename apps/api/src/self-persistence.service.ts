import crypto from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaRuntimeService } from './prisma-runtime.service.js';

export type PrivacySettingRecord = {
  id: string;
  userId: string;
  defaultVisibility: 'PRIVATE' | 'PUBLIC';
  allowAnonymousPublic: boolean;
  allowHumanReplies: boolean;
  allowMonthlyReportShare: boolean;
  allowPeerMatching: boolean;
  allowAnonymousExperienceStats: boolean;
  allowRecoveryData: boolean;
  allowJourneyLongTermAnalysis: boolean;
  allowLongTermMemory: boolean;
  allowAiMemoryUse: boolean;
  allowAnonymousExperienceShare: boolean;
  allowJourneyArchiveRetention: boolean;
  allowFutureSelfNotifications: boolean;
  allowDataExport: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TrustedContactRecord = {
  id: string;
  userId: string;
  nickname: string;
  relation: string;
  contactHint: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StableSelfProfileRecord = {
  id: string;
  userId: string;
  profile: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type RealityHandoffRecord = {
  id: string;
  userId: string;
  journeyId?: string;
  recipient: string;
  channel: string;
  summary: string;
  status: 'draft' | 'ready' | 'shared' | 'completed';
  sharedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type PersonalSupportPlanRecord = {
  id: string;
  userId: string;
  journeyId?: string;
  title: string;
  plan: Record<string, unknown>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SelfWriteHooks = {
  _onBeforeLock?: () => Promise<void>;
  _onAfterLock?: () => Promise<void>;
};

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

const iso = (d: Date | string | null | undefined): string => {
  if (!d) return new Date(0).toISOString();
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
};

export function defaultPrivacySettings(userId: string): PrivacySettingRecord {
  return {
    id: `privacy_${userId}`,
    userId,
    defaultVisibility: 'PRIVATE',
    allowAnonymousPublic: true,
    allowHumanReplies: true,
    allowMonthlyReportShare: true,
    allowPeerMatching: false,
    allowAnonymousExperienceStats: false,
    allowRecoveryData: false,
    allowJourneyLongTermAnalysis: false,
    allowLongTermMemory: false,
    allowAiMemoryUse: false,
    allowAnonymousExperienceShare: false,
    allowJourneyArchiveRetention: false,
    allowFutureSelfNotifications: false,
    allowDataExport: false,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

export function mapPrivacySettingRow(row: any): PrivacySettingRecord {
  return {
    id: row.id,
    userId: row.userId,
    defaultVisibility: row.defaultVisibility as 'PRIVATE' | 'PUBLIC',
    allowAnonymousPublic: Boolean(row.allowAnonymousPublic),
    allowHumanReplies: Boolean(row.allowHumanReplies),
    allowMonthlyReportShare: Boolean(row.allowMonthlyReportShare),
    allowPeerMatching: Boolean(row.allowPeerMatching),
    allowAnonymousExperienceStats: Boolean(row.allowAnonymousExperienceStats),
    allowRecoveryData: Boolean(row.allowRecoveryData),
    allowJourneyLongTermAnalysis: Boolean(row.allowJourneyLongTermAnalysis),
    allowLongTermMemory: Boolean(row.allowLongTermMemory),
    allowAiMemoryUse: Boolean(row.allowAiMemoryUse),
    allowAnonymousExperienceShare: Boolean(row.allowAnonymousExperienceShare),
    allowJourneyArchiveRetention: Boolean(row.allowJourneyArchiveRetention),
    allowFutureSelfNotifications: Boolean(row.allowFutureSelfNotifications),
    allowDataExport: Boolean(row.allowDataExport),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function mapTrustedContactRow(row: any): TrustedContactRecord {
  return {
    id: row.id,
    userId: row.userId,
    nickname: row.nickname,
    relation: row.relation,
    contactHint: row.contactHint,
    enabled: Boolean(row.enabled),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function mapStableSelfProfileRow(row: any): StableSelfProfileRecord {
  return {
    id: row.id,
    userId: row.userId,
    profile: row.profile && typeof row.profile === 'object' ? row.profile : {},
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function mapRealityHandoffRow(row: any): RealityHandoffRecord {
  return {
    id: row.id,
    userId: row.userId,
    journeyId: row.journeyId ?? undefined,
    recipient: row.recipient,
    channel: row.channel,
    summary: row.summary,
    status: row.status as 'draft' | 'ready' | 'shared' | 'completed',
    sharedAt: row.sharedAt ? iso(row.sharedAt) : undefined,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function mapPersonalSupportPlanRow(row: any): PersonalSupportPlanRecord {
  return {
    id: row.id,
    userId: row.userId,
    journeyId: row.journeyId ?? undefined,
    title: row.title,
    plan: row.plan && typeof row.plan === 'object' ? row.plan : {},
    active: Boolean(row.active),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

async function lockUsers(tx: any, uids: string[]) {
  const sorted = [...new Set(uids.filter(Boolean))].sort();
  for (const uid of sorted) {
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${uid} FOR UPDATE`;
  }
}

/**
 * Global lock hierarchy for Self writes: `User(owner)` -> `LifeJourney` (if referenced) -> Self row.
 * Multi-row locks take sorted id order.
 */
async function lockSelfWriteRoots(
  tx: any,
  userIds: Array<string | null | undefined>,
  journeyIds: Array<string | null | undefined> = [],
) {
  await lockUsers(tx, userIds.filter((id): id is string => Boolean(id)));
  const journeys = [...new Set(journeyIds.filter((id): id is string => Boolean(id)))].sort() as string[];
  for (const journeyId of journeys) {
    await tx.$executeRaw`SELECT 1 FROM "LifeJourney" WHERE id = ${journeyId} FOR UPDATE`;
  }
}

@Injectable()
export class SelfPersistenceService {
  private readonly privacyCache = new Map<string, PrivacySettingRecord>();

  constructor(
    @Inject(PrismaRuntimeService)
    private readonly prisma: PrismaRuntimeService,
  ) {}

  // ==========================================
  // PrivacySetting
  // ==========================================

  getCachedPrivacySettings(userId: string): PrivacySettingRecord {
    return this.privacyCache.get(userId) ?? defaultPrivacySettings(userId);
  }

  async getPrivacySettings(userId: string): Promise<PrivacySettingRecord> {
    const row = await this.prisma.privacySetting.findUnique({ where: { userId } });
    const res = row ? mapPrivacySettingRow(row) : defaultPrivacySettings(userId);
    this.privacyCache.set(userId, res);
    return res;
  }

  async updatePrivacySettings(
    userId: string,
    patch: Partial<PrivacySettingRecord>,
    hooks: SelfWriteHooks = {},
  ): Promise<PrivacySettingRecord> {
    const res = await this.prisma.$transaction(async (tx) => {
      if (hooks._onBeforeLock) await hooks._onBeforeLock();
      await lockSelfWriteRoots(tx, [userId]);
      if (hooks._onAfterLock) await hooks._onAfterLock();

      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('用户不存在');

      const existing = await tx.privacySetting.findUnique({ where: { userId } });
      if (existing) {
        const data: Prisma.PrivacySettingUpdateInput = {};
        if (patch.defaultVisibility !== undefined) data.defaultVisibility = patch.defaultVisibility;
        if (patch.allowAnonymousPublic !== undefined) data.allowAnonymousPublic = patch.allowAnonymousPublic;
        if (patch.allowHumanReplies !== undefined) data.allowHumanReplies = patch.allowHumanReplies;
        if (patch.allowMonthlyReportShare !== undefined) data.allowMonthlyReportShare = patch.allowMonthlyReportShare;
        if (patch.allowPeerMatching !== undefined) data.allowPeerMatching = patch.allowPeerMatching;
        if (patch.allowAnonymousExperienceStats !== undefined)
          data.allowAnonymousExperienceStats = patch.allowAnonymousExperienceStats;
        if (patch.allowRecoveryData !== undefined) data.allowRecoveryData = patch.allowRecoveryData;
        if (patch.allowJourneyLongTermAnalysis !== undefined)
          data.allowJourneyLongTermAnalysis = patch.allowJourneyLongTermAnalysis;
        if (patch.allowLongTermMemory !== undefined) data.allowLongTermMemory = patch.allowLongTermMemory;
        if (patch.allowAiMemoryUse !== undefined) data.allowAiMemoryUse = patch.allowAiMemoryUse;
        if (patch.allowAnonymousExperienceShare !== undefined)
          data.allowAnonymousExperienceShare = patch.allowAnonymousExperienceShare;
        if (patch.allowJourneyArchiveRetention !== undefined)
          data.allowJourneyArchiveRetention = patch.allowJourneyArchiveRetention;
        if (patch.allowFutureSelfNotifications !== undefined)
          data.allowFutureSelfNotifications = patch.allowFutureSelfNotifications;
        if (patch.allowDataExport !== undefined) data.allowDataExport = patch.allowDataExport;

        const updated = await tx.privacySetting.update({
          where: { userId },
          data,
        });
        return mapPrivacySettingRow(updated);
      }

      const defaults = defaultPrivacySettings(userId);
      const created = await tx.privacySetting.create({
        data: {
          userId,
          defaultVisibility: patch.defaultVisibility ?? defaults.defaultVisibility,
          allowAnonymousPublic: patch.allowAnonymousPublic ?? defaults.allowAnonymousPublic,
          allowHumanReplies: patch.allowHumanReplies ?? defaults.allowHumanReplies,
          allowMonthlyReportShare: patch.allowMonthlyReportShare ?? defaults.allowMonthlyReportShare,
          allowPeerMatching: patch.allowPeerMatching ?? defaults.allowPeerMatching,
          allowAnonymousExperienceStats:
            patch.allowAnonymousExperienceStats ?? defaults.allowAnonymousExperienceStats,
          allowRecoveryData: patch.allowRecoveryData ?? defaults.allowRecoveryData,
          allowJourneyLongTermAnalysis:
            patch.allowJourneyLongTermAnalysis ?? defaults.allowJourneyLongTermAnalysis,
          allowLongTermMemory: patch.allowLongTermMemory ?? defaults.allowLongTermMemory,
          allowAiMemoryUse: patch.allowAiMemoryUse ?? defaults.allowAiMemoryUse,
          allowAnonymousExperienceShare:
            patch.allowAnonymousExperienceShare ?? defaults.allowAnonymousExperienceShare,
          allowJourneyArchiveRetention:
            patch.allowJourneyArchiveRetention ?? defaults.allowJourneyArchiveRetention,
          allowFutureSelfNotifications:
            patch.allowFutureSelfNotifications ?? defaults.allowFutureSelfNotifications,
          allowDataExport: patch.allowDataExport ?? defaults.allowDataExport,
        },
      });
      return mapPrivacySettingRow(created);
    });
    this.privacyCache.set(userId, res);
    return res;
  }

  async updateDefaultVisibilityFanOut(value: 'PUBLIC' | 'PRIVATE'): Promise<number> {
    const count = await this.prisma.$transaction(async (tx) => {
      const users = await tx.user.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
      const userIds = users.map((u: any) => u.id);
      await lockUsers(tx, userIds);

      const result = await tx.privacySetting.updateMany({
        data: { defaultVisibility: value },
      });
      return result.count;
    });
    for (const [userId, record] of this.privacyCache.entries()) {
      this.privacyCache.set(userId, { ...record, defaultVisibility: value });
    }
    return count;
  }

  async repairPrivacyDefaults(): Promise<number> {
    return await this.prisma.$transaction(async (tx) => {
      const usersWithoutPrivacy = await tx.user.findMany({
        where: { privacySetting: null },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      const userIds = usersWithoutPrivacy.map((u: any) => u.id);
      if (!userIds.length) return 0;

      await lockUsers(tx, userIds);
      let count = 0;
      for (const uid of userIds) {
        const existing = await tx.privacySetting.findUnique({ where: { userId: uid } });
        if (!existing) {
          const defaults = defaultPrivacySettings(uid);
          await tx.privacySetting.create({
            data: {
              userId: uid,
              defaultVisibility: defaults.defaultVisibility,
              allowAnonymousPublic: defaults.allowAnonymousPublic,
              allowHumanReplies: defaults.allowHumanReplies,
              allowMonthlyReportShare: defaults.allowMonthlyReportShare,
              allowPeerMatching: defaults.allowPeerMatching,
              allowAnonymousExperienceStats: defaults.allowAnonymousExperienceStats,
              allowRecoveryData: defaults.allowRecoveryData,
              allowJourneyLongTermAnalysis: defaults.allowJourneyLongTermAnalysis,
              allowLongTermMemory: defaults.allowLongTermMemory,
              allowAiMemoryUse: defaults.allowAiMemoryUse,
              allowAnonymousExperienceShare: defaults.allowAnonymousExperienceShare,
              allowJourneyArchiveRetention: defaults.allowJourneyArchiveRetention,
              allowFutureSelfNotifications: defaults.allowFutureSelfNotifications,
              allowDataExport: defaults.allowDataExport,
            },
          });
          count++;
        }
      }
      return count;
    });
  }

  // ==========================================
  // TrustedContact
  // ==========================================

  async createTrustedContact(
    params: {
      userId: string;
      nickname: string;
      relation: string;
      contactHint: string;
    },
    hooks: SelfWriteHooks = {},
  ): Promise<TrustedContactRecord> {
    return await this.prisma.$transaction(async (tx) => {
      if (hooks._onBeforeLock) await hooks._onBeforeLock();
      await lockSelfWriteRoots(tx, [params.userId]);
      if (hooks._onAfterLock) await hooks._onAfterLock();

      const user = await tx.user.findUnique({ where: { id: params.userId } });
      if (!user) throw new NotFoundException('用户不存在');

      const id = genId('contact');
      const created = await tx.trustedContact.create({
        data: {
          id,
          userId: params.userId,
          nickname: params.nickname,
          relation: params.relation,
          contactHint: params.contactHint,
          enabled: true,
        },
      });
      return mapTrustedContactRow(created);
    });
  }

  async listTrustedContacts(userId: string): Promise<TrustedContactRecord[]> {
    const rows = await this.prisma.trustedContact.findMany({
      where: { userId, enabled: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapTrustedContactRow);
  }

  // ==========================================
  // StableSelfProfile
  // ==========================================

  async getStableSelfProfile(userId: string): Promise<StableSelfProfileRecord | null> {
    const privacy = await this.getPrivacySettings(userId);
    if (privacy.allowRecoveryData !== true) {
      throw new ForbiddenException('请先在隐私设置中允许保存稳定状态资料');
    }
    const row = await this.prisma.stableSelfProfile.findUnique({ where: { userId } });
    return row ? mapStableSelfProfileRow(row) : null;
  }

  async saveStableSelfProfile(
    params: {
      userId: string;
      profile: Record<string, unknown>;
    },
    hooks: SelfWriteHooks = {},
  ): Promise<StableSelfProfileRecord> {
    return await this.prisma.$transaction(async (tx) => {
      if (hooks._onBeforeLock) await hooks._onBeforeLock();
      await lockSelfWriteRoots(tx, [params.userId]);
      if (hooks._onAfterLock) await hooks._onAfterLock();

      const user = await tx.user.findUnique({ where: { id: params.userId } });
      if (!user) throw new NotFoundException('用户不存在');

      const privacy = await tx.privacySetting.findUnique({ where: { userId: params.userId } });
      if (privacy?.allowRecoveryData !== true) {
        throw new ForbiddenException('请先在隐私设置中允许保存稳定状态资料');
      }

      if (
        !Object.values(params.profile).some((value) =>
          Array.isArray(value) ? value.length > 0 : Boolean(value),
        )
      ) {
        throw new BadRequestException('请至少写下一条属于你的稳定状态信息');
      }

      const id = genId('stable_self');
      const upserted = await tx.stableSelfProfile.upsert({
        where: { userId: params.userId },
        create: {
          id,
          userId: params.userId,
          profile: params.profile as Prisma.InputJsonValue,
        },
        update: {
          profile: params.profile as Prisma.InputJsonValue,
        },
      });
      return mapStableSelfProfileRow(upserted);
    });
  }

  // ==========================================
  // RealityHandoff
  // ==========================================

  async createRealityHandoff(
    params: {
      userId: string;
      journeyId?: string | null;
      recipient: string;
      channel: string;
      summary: string;
    },
    hooks: SelfWriteHooks = {},
  ): Promise<RealityHandoffRecord> {
    const targetJourneyId =
      typeof params.journeyId === 'string' && params.journeyId.trim() ? params.journeyId.trim() : null;

    return await this.prisma.$transaction(async (tx) => {
      if (hooks._onBeforeLock) await hooks._onBeforeLock();
      await lockSelfWriteRoots(tx, [params.userId], targetJourneyId ? [targetJourneyId] : []);
      if (hooks._onAfterLock) await hooks._onAfterLock();

      const user = await tx.user.findUnique({ where: { id: params.userId } });
      if (!user) throw new NotFoundException('用户不存在');

      if (targetJourneyId) {
        const journey = await tx.lifeJourney.findUnique({ where: { id: targetJourneyId } });
        if (!journey || journey.userId !== params.userId) {
          throw new NotFoundException('旅程不存在或无权访问');
        }
      }

      const id = genId('handoff');
      const created = await tx.realityHandoff.create({
        data: {
          id,
          userId: params.userId,
          journeyId: targetJourneyId,
          recipient: params.recipient,
          channel: params.channel,
          summary: params.summary,
          status: 'ready',
        },
      });
      return mapRealityHandoffRow(created);
    });
  }

  async shareRealityHandoff(
    id: string,
    userId: string,
    hooks: SelfWriteHooks = {},
  ): Promise<RealityHandoffRecord> {
    return await this.prisma.$transaction(async (tx) => {
      if (hooks._onBeforeLock) await hooks._onBeforeLock();
      await lockSelfWriteRoots(tx, [userId]);
      if (hooks._onAfterLock) await hooks._onAfterLock();

      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('用户不存在');

      const existing = await tx.realityHandoff.findUnique({ where: { id } });
      if (!existing || existing.userId !== userId) {
        throw new NotFoundException('现实交接不存在');
      }

      const updated = await tx.realityHandoff.update({
        where: { id },
        data: {
          status: 'shared',
          sharedAt: new Date(),
        },
      });
      return mapRealityHandoffRow(updated);
    });
  }

  async listRealityHandoffs(userId: string): Promise<RealityHandoffRecord[]> {
    const rows = await this.prisma.realityHandoff.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapRealityHandoffRow);
  }

  // ==========================================
  // PersonalSupportPlan
  // ==========================================

  async getSupportPlan(userId: string): Promise<PersonalSupportPlanRecord | null> {
    const row = await this.prisma.personalSupportPlan.findFirst({
      where: { userId, active: true },
      orderBy: { updatedAt: 'desc' },
    });
    return row ? mapPersonalSupportPlanRow(row) : null;
  }

  async countActiveSupportPlans(): Promise<number> {
    return await this.prisma.personalSupportPlan.count({
      where: { active: true },
    });
  }

  async saveSupportPlan(
    params: {
      userId: string;
      journeyId?: string | null;
      title?: string;
      plan?: Record<string, unknown>;
    },
    hooks: SelfWriteHooks = {},
  ): Promise<PersonalSupportPlanRecord> {
    const journeyIdSpecified = params.journeyId !== undefined;
    const suppliedJourneyId =
      typeof params.journeyId === 'string' && params.journeyId.trim() ? params.journeyId.trim() : null;

    return await this.prisma.$transaction(async (tx) => {
      if (hooks._onBeforeLock) await hooks._onBeforeLock();
      await lockSelfWriteRoots(tx, [params.userId], suppliedJourneyId ? [suppliedJourneyId] : []);
      if (hooks._onAfterLock) await hooks._onAfterLock();

      const user = await tx.user.findUnique({ where: { id: params.userId } });
      if (!user) throw new NotFoundException('用户不存在');

      const privacy = await tx.privacySetting.findUnique({ where: { userId: params.userId } });
      if (privacy?.allowRecoveryData !== true) {
        throw new ForbiddenException('请先在隐私设置中允许保存支持计划');
      }

      const existing = await tx.personalSupportPlan.findFirst({
        where: { userId: params.userId, active: true },
        orderBy: { updatedAt: 'desc' },
      });

      if (suppliedJourneyId) {
        const journey = await tx.lifeJourney.findUnique({ where: { id: suppliedJourneyId } });
        if (!journey || journey.userId !== params.userId) {
          throw new NotFoundException('旅程不存在或无权访问');
        }
      }

      if (existing) {
        const updateData: Prisma.PersonalSupportPlanUpdateInput = {};
        if (params.title !== undefined) updateData.title = params.title;
        if (params.plan !== undefined) updateData.plan = params.plan as Prisma.InputJsonValue;

        if (journeyIdSpecified) {
          if (params.journeyId === null) {
            updateData.journey = { disconnect: true };
          } else if (suppliedJourneyId) {
            updateData.journey = { connect: { id: suppliedJourneyId } };
          }
        }
        // When journeyId is undefined: omit the column from the update so the committed value survives.

        const updated = await tx.personalSupportPlan.update({
          where: { id: existing.id },
          data: updateData,
        });
        return mapPersonalSupportPlanRow(updated);
      }

      let createJourneyId: string | null = null;
      if (journeyIdSpecified) {
        createJourneyId = suppliedJourneyId;
      } else {
        const activeJourney = await tx.lifeJourney.findFirst({
          where: { userId: params.userId, status: 'active' },
          orderBy: { updatedAt: 'desc' },
        });
        createJourneyId = activeJourney?.id ?? null;
      }

      const id = genId('support_plan');
      const created = await tx.personalSupportPlan.create({
        data: {
          id,
          userId: params.userId,
          journeyId: createJourneyId,
          title: params.title ?? '我的低谷预案',
          plan: (params.plan ?? {}) as Prisma.InputJsonValue,
          active: true,
        },
      });
      return mapPersonalSupportPlanRow(created);
    });
  }

  async listSupportPlansForAdmin(options: {
    q?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: any[]; total: number; page: number; pageSize: number; totalPages: number }> {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
    const where: Prisma.PersonalSupportPlanWhereInput = {};
    if (options.q?.trim()) {
      const needle = options.q.trim();
      where.OR = [
        { id: { contains: needle, mode: 'insensitive' } },
        { userId: { contains: needle, mode: 'insensitive' } },
        { title: { contains: needle, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.personalSupportPlan.count({ where }),
      this.prisma.personalSupportPlan.findMany({
        where,
        select: {
          id: true,
          userId: true,
          journeyId: true,
          title: true,
          active: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        journeyId: r.journeyId ?? undefined,
        title: r.title,
        active: r.active,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  async getAuditedSupportPlanForAdmin(
    id: string,
    adminUserId: string,
  ): Promise<{ item: PersonalSupportPlanRecord }> {
    const row = await this.prisma.personalSupportPlan.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('支持计划不存在');

    await this.prisma.auditLog.create({
      data: {
        id: genId('audit'),
        adminUserId,
        action: 'SUPPORT_PLAN_READ_FULL',
        resourceType: 'PersonalSupportPlan',
        resourceId: id,
        beforeJson: Prisma.JsonNull,
        afterJson: { targetUserId: row.userId, title: row.title } as Prisma.InputJsonValue,
        ip: '127.0.0.1',
        userAgent: 'admin-console',
      },
    });

    return { item: mapPersonalSupportPlanRow(row) };
  }
}
