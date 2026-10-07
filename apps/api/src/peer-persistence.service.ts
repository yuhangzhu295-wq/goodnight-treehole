import crypto from 'node:crypto';
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaRuntimeService } from './prisma-runtime.service.js';

export type PeerExperienceRecord = {
  id: string;
  userId: string;
  journeyId?: string;
  title: string;
  domain: string;
  subDomain?: string;
  stage: string;
  content: string;
  tags: string[];
  fingerprintJson?: Record<string, unknown>;
  laterSummary?: Record<string, unknown>;
  helpfulActions?: string[];
  notHelpfulActions?: string[];
  retrospective?: string;
  consentedAt: string;
  status: 'draft' | 'pending_review' | 'published' | 'hidden' | 'rejected';
  reportCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PeerMatchRecord = {
  id: string;
  userId: string;
  journeyId?: string;
  peerExperienceId: string;
  score: number;
  reasons: string[];
  stageDistance?: number;
  recoveryLead?: number;
  trustScore?: number;
  fingerprintSimilarity?: number;
  scoreBreakdown?: Record<string, number>;
  explanation?: string;
  requestReason?: string;
  requestQuestion?: string;
  acceptedAt?: string;
  requesterConsentAt?: string;
  ownerConsentAt?: string;
  status: 'suggested' | 'requested' | 'connected' | 'declined' | 'blocked';
  createdAt: string;
  updatedAt: string;
};

export type PeerConversationRecord = {
  id: string;
  matchId: string;
  starterUserId: string;
  receiverUserId: string;
  status: 'active' | 'closed' | 'extended';
  startsAt: string;
  consentAcceptedAt?: string;
  expiresAt: string;
  createdAt: string;
  closedAt?: string;
  closedReason?: 'closed' | 'expired' | 'blocked' | string;
  feedback?: 'helpful' | 'unchanged' | 'uncomfortable';
  feedbackNote?: string;
  reportedAt?: string;
  reporterUserId?: string;
  reportReason?: string;
};

export type PeerMessageRecord = {
  id: string;
  conversationId: string;
  senderUserId: string;
  content: string;
  authorType: 'HUMAN' | 'AI_ASSIST';
  createdAt: string;
  reportedAt?: string;
  blockedAt?: string;
  piiFlags?: string[];
};

export type PeerReportRecord = {
  id: string;
  conversationId: string;
  experienceId?: string;
  matchId?: string;
  reporterUserId: string;
  reason: string;
  status: 'open' | 'handled';
  handledAt?: string;
  handledBy?: string;
  note?: string;
  createdAt: string;
};

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

const iso = (d: Date | string | null | undefined): string => {
  if (!d) return new Date(0).toISOString();
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
};

export function mapPeerExperienceRow(row: any): PeerExperienceRecord {
  return {
    id: row.id,
    userId: row.userId,
    journeyId: row.journeyId ?? undefined,
    title: row.title,
    domain: row.domain,
    subDomain: row.subDomain ?? undefined,
    stage: row.stage,
    content: row.content,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    fingerprintJson: row.fingerprintJson && typeof row.fingerprintJson === 'object' ? row.fingerprintJson : undefined,
    laterSummary: row.laterSummary && typeof row.laterSummary === 'object' ? row.laterSummary : undefined,
    helpfulActions: Array.isArray(row.helpfulActions) ? row.helpfulActions.map(String) : undefined,
    notHelpfulActions: Array.isArray(row.notHelpfulActions) ? row.notHelpfulActions.map(String) : undefined,
    retrospective: row.retrospective ?? undefined,
    consentedAt: iso(row.consentedAt),
    status: row.status,
    reportCount: Number(row.reportCount ?? 0),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function mapPeerMatchRow(row: any): PeerMatchRecord {
  return {
    id: row.id,
    userId: row.userId,
    journeyId: row.journeyId ?? undefined,
    peerExperienceId: row.peerExperienceId,
    score: Number(row.score ?? 0),
    reasons: Array.isArray(row.reasons) ? row.reasons.map(String) : [],
    stageDistance: row.stageDistance == null ? undefined : Number(row.stageDistance),
    recoveryLead: row.recoveryLead == null ? undefined : Number(row.recoveryLead),
    trustScore: row.trustScore == null ? undefined : Number(row.trustScore),
    fingerprintSimilarity: row.fingerprintSimilarity == null ? undefined : Number(row.fingerprintSimilarity),
    scoreBreakdown: row.scoreBreakdown && typeof row.scoreBreakdown === 'object' ? (row.scoreBreakdown as Record<string, number>) : undefined,
    explanation: row.explanation ?? undefined,
    requestReason: row.requestReason ?? undefined,
    requestQuestion: row.requestQuestion ?? undefined,
    acceptedAt: row.acceptedAt ? iso(row.acceptedAt) : undefined,
    requesterConsentAt: row.requesterConsentAt ? iso(row.requesterConsentAt) : undefined,
    ownerConsentAt: row.ownerConsentAt ? iso(row.ownerConsentAt) : undefined,
    status: row.status,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function mapPeerConversationRow(row: any): PeerConversationRecord {
  return {
    id: row.id,
    matchId: row.matchId,
    starterUserId: row.starterUserId,
    receiverUserId: row.receiverUserId,
    status: row.status as 'active' | 'closed',
    startsAt: iso(row.startsAt),
    consentAcceptedAt: row.consentAcceptedAt ? iso(row.consentAcceptedAt) : undefined,
    expiresAt: iso(row.expiresAt),
    createdAt: iso(row.createdAt),
    closedAt: row.closedAt ? iso(row.closedAt) : undefined,
    closedReason: row.closedReason ?? undefined,
    feedback: row.feedback ?? undefined,
    feedbackNote: row.feedbackNote ?? undefined,
    reportedAt: row.reportedAt ? iso(row.reportedAt) : undefined,
    reporterUserId: row.reporterUserId ?? undefined,
    reportReason: row.reportReason ?? undefined,
  };
}

export function mapPeerMessageRow(row: any): PeerMessageRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderUserId: row.senderUserId,
    content: row.content,
    authorType: (row.authorType as 'HUMAN' | 'AI_ASSIST') ?? 'HUMAN',
    createdAt: iso(row.createdAt),
    reportedAt: row.reportedAt ? iso(row.reportedAt) : undefined,
    blockedAt: row.blockedAt ? iso(row.blockedAt) : undefined,
    piiFlags: Array.isArray(row.piiFlags) ? row.piiFlags.map(String) : [],
  };
}

export function mapPeerReportRow(row: any): PeerReportRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    experienceId: row.experienceId ?? undefined,
    matchId: row.matchId ?? undefined,
    reporterUserId: row.reporterUserId,
    reason: row.reason,
    status: (row.status as 'open' | 'handled') ?? 'open',
    handledAt: row.handledAt ? iso(row.handledAt) : undefined,
    handledBy: row.handledBy ?? undefined,
    note: row.note ?? undefined,
    createdAt: iso(row.createdAt),
  };
}

async function lockUsers(tx: any, uids: string[]) {
  const sorted = [...new Set(uids.filter(Boolean))].sort();
  for (const uid of sorted) {
    await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${uid} FOR UPDATE`;
  }
}

/**
 * Global lock hierarchy for peer writes: `User` (sorted) -> `LifeJourney` (sorted) -> peer row.
 *
 * Every peer table carries a `User` foreign key (`PeerExperience.userId`, `PeerMatch.userId`,
 * `PeerMessage.senderUserId`, `PeerReport.reporterUserId`, `PeerConversation.starter/receiver`),
 * and `PeerExperience`/`PeerMatch` also carry an optional `LifeJourney` foreign key. Inserting or
 * updating a row whose foreign key column is written takes an implicit `FOR KEY SHARE` on the
 * referenced row, which conflicts with the `FOR UPDATE` the legacy full-flush takes on `User` as
 * its first statement (`relational-runtime.mapper.ts`), and with the `User` -> `LifeJourney` order
 * `deleteJourneyArchive` uses (`batch1-persistence.service.ts:deleteJourneyArchive`). A peer
 * transaction that locks its own child row before these roots therefore cycles against both and
 * raises `40P01`; this project has already produced that deadlock twice.
 *
 * So peer writes acquire the roots first, in the same deterministic (sorted) order as every other
 * writer, and only then touch their own rows. Sorting is what makes two multi-party paths
 * (consent, block, feedback) safe against each other.
 */
async function lockPeerWriteRoots(
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

/**
 * Test-only rendezvous points, so a barrier can meet *inside* an open transaction.
 *
 * `_onBeforeLock` fires after the transaction has begun and before any lock is taken: two
 * transactions meeting there are both open and will then genuinely contend for the same roots.
 * `_onAfterLock` fires once this transaction holds its root locks, which is the point a test
 * needs to hold open while a different writer (a journey delete, a legacy flush) runs.
 */
export type PeerWriteHooks = {
  _onBeforeLock?: () => Promise<void>;
  _onAfterLock?: () => Promise<void>;
};

/**
 * Resolve a supplied `LifeJourney` reference **under the lock** taken by `lockPeerWriteRoots`.
 *
 * A journey that a concurrent delete removed resolves to `null`. That is deliberately the same
 * post-state the delete produces for rows already attached to it: `fkUpdate`
 * (`relational-runtime.mapper.ts:790`) treats a supplied-but-invalid reference as a detach, so
 * both orderings of the create/delete race end in one deterministic state instead of a foreign
 * key error that discards the user's write.
 */
async function resolveJourneyRefUnderLock(tx: any, journeyId: string | null | undefined): Promise<string | null> {
  if (!journeyId) return null;
  const rows = await tx.$queryRaw<any[]>`SELECT id FROM "LifeJourney" WHERE id = ${journeyId}`;
  return rows.length ? journeyId : null;
}

@Injectable()
export class PeerPersistenceService {
  constructor(
    @Inject(PrismaRuntimeService)
    private readonly prisma: PrismaRuntimeService,
  ) {}

  // ==========================================
  // PeerExperience
  // ==========================================

  async getExperienceById(id: string): Promise<PeerExperienceRecord | null> {
    const row = await this.prisma.peerExperience.findUnique({ where: { id } });
    return row ? mapPeerExperienceRow(row) : null;
  }

  async getPublishedExperienceById(id: string): Promise<PeerExperienceRecord | null> {
    const row = await this.prisma.peerExperience.findFirst({
      where: { id, status: 'published' },
    });
    return row ? mapPeerExperienceRow(row) : null;
  }

  async findPendingReviewExperienceByJourneyAndUser(journeyId: string, userId: string): Promise<PeerExperienceRecord | null> {
    const row = await this.prisma.peerExperience.findFirst({
      where: { journeyId, userId, status: 'pending_review' },
      orderBy: { createdAt: 'desc' },
    });
    return row ? mapPeerExperienceRow(row) : null;
  }

  async createExperience(
    params: {
      userId: string;
      journeyId?: string;
      title: string;
      domain: string;
      subDomain?: string;
      stage: string;
      content: string;
      tags: string[];
      fingerprintJson?: Record<string, unknown>;
      laterSummary?: Record<string, unknown>;
      helpfulActions?: string[];
      notHelpfulActions?: string[];
      retrospective?: string;
      consentedAt: string;
      status: 'draft' | 'pending_review' | 'published' | 'hidden' | 'rejected';
    },
    hooks: PeerWriteHooks = {},
  ): Promise<PeerExperienceRecord> {
    const id = genId('experience');
    return await this.prisma.$transaction(async (tx) => {
      if (hooks._onBeforeLock) await hooks._onBeforeLock();
      // Writes `PeerExperience.journeyId`: join the global lock order first.
      await lockPeerWriteRoots(tx, [params.userId], [params.journeyId]);
      if (hooks._onAfterLock) await hooks._onAfterLock();
      const journeyId = await resolveJourneyRefUnderLock(tx, params.journeyId);
      const created = await tx.peerExperience.create({
        data: {
          id,
          userId: params.userId,
          journeyId,
          title: params.title,
          domain: params.domain,
          subDomain: params.subDomain ?? null,
          stage: params.stage,
          content: params.content,
          tags: params.tags,
          fingerprintJson: params.fingerprintJson ? (params.fingerprintJson as Prisma.InputJsonValue) : Prisma.JsonNull,
          laterSummary: params.laterSummary ? (params.laterSummary as Prisma.InputJsonValue) : Prisma.JsonNull,
          helpfulActions: params.helpfulActions ? (params.helpfulActions as Prisma.InputJsonValue) : Prisma.JsonNull,
          notHelpfulActions: params.notHelpfulActions ? (params.notHelpfulActions as Prisma.InputJsonValue) : Prisma.JsonNull,
          retrospective: params.retrospective ?? null,
          consentedAt: new Date(params.consentedAt),
          status: params.status,
          reportCount: 0,
        },
      });
      return mapPeerExperienceRow(created);
    });
  }

  async updateExperience(
    experienceId: string,
    userId: string,
    input: {
      title?: string;
      content?: string;
      laterSummary?: Record<string, unknown>;
      helpfulActions?: string[];
      notHelpfulActions?: string[];
      retrospective?: string;
    },
  ): Promise<PeerExperienceRecord> {
    const existing = await this.prisma.peerExperience.findFirst({
      where: { id: experienceId, userId, status: 'pending_review' },
    });
    if (!existing) throw new NotFoundException('待确认的经历不存在');

    const updated = await this.prisma.peerExperience.update({
      where: { id: experienceId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.laterSummary !== undefined ? { laterSummary: input.laterSummary as Prisma.InputJsonValue } : {}),
        ...(input.helpfulActions !== undefined ? { helpfulActions: input.helpfulActions as Prisma.InputJsonValue } : {}),
        ...(input.notHelpfulActions !== undefined ? { notHelpfulActions: input.notHelpfulActions as Prisma.InputJsonValue } : {}),
        ...(input.retrospective !== undefined ? { retrospective: input.retrospective } : {}),
        updatedAt: new Date(),
      },
    });
    return mapPeerExperienceRow(updated);
  }

  async reviewExperience(
    id: string,
    adminUserId: string,
    status: 'published' | 'hidden' | 'rejected',
  ): Promise<PeerExperienceRecord> {
    return await this.prisma.$transaction(async (tx) => {
      const existing = await tx.peerExperience.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('同路经历不存在');
      const updated = await tx.peerExperience.update({
        where: { id },
        data: { status, updatedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          id: genId('audit'),
          adminUserId,
          action: 'PEER_EXPERIENCE_REVIEW',
          resourceType: 'PeerExperience',
          resourceId: id,
          beforeJson: existing as unknown as Prisma.InputJsonValue,
          afterJson: updated as unknown as Prisma.InputJsonValue,
        },
      });
      return mapPeerExperienceRow(updated);
    });
  }

  async getPublishedExperiences(limit = 100, excludeUserId?: string): Promise<PeerExperienceRecord[]> {
    const rows = await this.prisma.peerExperience.findMany({
      where: {
        status: 'published',
        ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(mapPeerExperienceRow);
  }

  async countPublishedExperiences(): Promise<number> {
    return await this.prisma.peerExperience.count({ where: { status: 'published' } });
  }

  async listExperiencesForAdmin(params: { q?: string; status?: string }): Promise<PeerExperienceRecord[]> {
    const rows = await this.prisma.peerExperience.findMany({
      orderBy: { createdAt: 'desc' },
    });
    const needle = params.q?.trim().toLowerCase();
    const status = params.status;
    return rows
      .map(mapPeerExperienceRow)
      .filter((item) => {
        const matchesQuery =
          !needle ||
          [item.id, item.userId, item.title, item.domain, item.subDomain, item.content]
            .filter((v): v is string => Boolean(v))
            .some((field) => field.toLowerCase().includes(needle));
        const matchesStatus = !status || status === 'all' || item.status === status;
        return matchesQuery && matchesStatus;
      });
  }

  async countReportsForExperience(experienceId: string): Promise<number> {
    return await this.prisma.peerReport.count({ where: { experienceId } });
  }

  async getExperiencesByIds(ids: string[]): Promise<PeerExperienceRecord[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.peerExperience.findMany({
      where: { id: { in: ids } },
    });
    return rows.map(mapPeerExperienceRow);
  }

  // ==========================================
  // PeerMatch
  // ==========================================

  async getMatchById(id: string): Promise<PeerMatchRecord | null> {
    const row = await this.prisma.peerMatch.findUnique({ where: { id } });
    return row ? mapPeerMatchRow(row) : null;
  }

  async createMatches(
    matches: Array<Omit<PeerMatchRecord, 'id' | 'createdAt' | 'updatedAt'>>,
    hooks: PeerWriteHooks = {},
  ): Promise<PeerMatchRecord[]> {
    if (!matches.length) return [];
    return await this.prisma.$transaction(async (tx) => {
      if (hooks._onBeforeLock) await hooks._onBeforeLock();
      // This path writes `PeerMatch.journeyId`, so it joins the global lock order
      // (`User` -> `LifeJourney` -> peer row) before touching any match row.
      await lockPeerWriteRoots(
        tx,
        matches.map((m) => m.userId),
        matches.map((m) => m.journeyId),
      );
      if (hooks._onAfterLock) await hooks._onAfterLock();

      const created: PeerMatchRecord[] = [];
      for (const m of matches) {
        const key = { userId: m.userId, peerExperienceId: m.peerExperienceId };        // A suggestion refresh must not rewrite a match that has already left `suggested`:
        // its request reason, accepted timestamp and status belong to the peer flow now.
        const existing = await tx.peerMatch.findUnique({ where: { userId_peerExperienceId: key } });
        if (existing) {
          if (existing.status === 'suggested') {
            await tx.peerMatch.updateMany({
              where: { id: existing.id, status: 'suggested' },
              data: {
                score: m.score,
                reasons: m.reasons,
                stageDistance: m.stageDistance ?? null,
                recoveryLead: m.recoveryLead ?? null,
                trustScore: m.trustScore ?? null,
                fingerprintSimilarity: m.fingerprintSimilarity ?? null,
                scoreBreakdown: m.scoreBreakdown ? (m.scoreBreakdown as Prisma.InputJsonValue) : Prisma.JsonNull,
                explanation: m.explanation ?? null,
              },
            });
          }
          created.push(mapPeerMatchRow((await tx.peerMatch.findUnique({ where: { id: existing.id } }))!));
          continue;
        }
        const row = await tx.peerMatch.create({
          data: {
            id: genId('peer_match'),
            userId: m.userId,
            journeyId: await resolveJourneyRefUnderLock(tx, m.journeyId),
            peerExperienceId: m.peerExperienceId,
            score: m.score,
            reasons: m.reasons,
            stageDistance: m.stageDistance ?? null,
            recoveryLead: m.recoveryLead ?? null,
            trustScore: m.trustScore ?? null,
            fingerprintSimilarity: m.fingerprintSimilarity ?? null,
            scoreBreakdown: m.scoreBreakdown ? (m.scoreBreakdown as Prisma.InputJsonValue) : Prisma.JsonNull,
            explanation: m.explanation ?? null,
            requestReason: m.requestReason ?? null,
            requestQuestion: m.requestQuestion ?? null,
            acceptedAt: m.acceptedAt ? new Date(m.acceptedAt) : null,
            status: m.status,
          },
        });
        created.push(mapPeerMatchRow(row));
      }
      return created;
    });
  }

  async updateMatchRequest(
    matchId: string,
    userId: string,
    status: 'requested',
    requestReason: string,
    requestQuestion?: string,
    hooks: PeerWriteHooks = {},
  ): Promise<{ match: PeerMatchRecord; ownerUserId: string }> {
    return await this.prisma.$transaction(async (tx) => {
      if (hooks._onBeforeLock) await hooks._onBeforeLock();
      const pre = await tx.peerMatch.findUnique({
        where: { id: matchId },
        include: { peerExperience: true },
      });
      if (!pre) throw new NotFoundException('同路匹配不存在');

      // Global lock order: both participants' `User` rows, then this peer row. The match is
      // re-read after locking so the identity/status decision below is made on locked data.
      await lockPeerWriteRoots(tx, [pre.userId, pre.peerExperience?.userId]);
      if (hooks._onAfterLock) await hooks._onAfterLock();

      const match = await tx.peerMatch.findUniqueOrThrow({
        where: { id: matchId },
        include: { peerExperience: true },
      });
      if (match.userId !== userId || match.status !== 'suggested') {
        throw new BadRequestException('只有发起方可以对待匹配经历发出一次请求');
      }

      // Compare-and-swap: the status that was read above is part of the write predicate,
      // so a concurrent transition cannot be silently overwritten.
      const cas = await tx.peerMatch.updateMany({
        where: { id: matchId, userId, status: 'suggested' },
        data: {
          status: 'requested',
          requestReason,
          requestQuestion: requestQuestion ?? null,
          updatedAt: new Date(),
        },
      });
      if (cas.count === 0) {
        throw new BadRequestException('这条同路匹配的状态已经变化，请刷新后再试');
      }
      const updated = await tx.peerMatch.findUniqueOrThrow({ where: { id: matchId } });

      return {
        match: mapPeerMatchRow(updated),
        ownerUserId: match.peerExperience.userId,
      };
    });
  }

  async respondMatch(
    matchId: string,
    userId: string,
    status: 'connected' | 'declined' | 'blocked',
    hooks: PeerWriteHooks = {},
  ): Promise<{ match: PeerMatchRecord }> {
    return await this.prisma.$transaction(async (tx) => {
      if (hooks._onBeforeLock) await hooks._onBeforeLock();
      const pre = await tx.peerMatch.findUnique({
        where: { id: matchId },
        include: { peerExperience: true },
      });
      if (!pre) throw new NotFoundException('同路匹配不存在');

      await lockPeerWriteRoots(tx, [pre.userId, pre.peerExperience?.userId]);
      if (hooks._onAfterLock) await hooks._onAfterLock();

      const match = await tx.peerMatch.findUniqueOrThrow({
        where: { id: matchId },
        include: { peerExperience: true },
      });

      const isExperienceOwner = match.peerExperience?.userId === userId;
      const isRequester = match.userId === userId;

      if ((status === 'connected' || status === 'declined') && (!isExperienceOwner || match.status !== 'requested')) {
        throw new BadRequestException('只有经历发布者可以处理待确认的同路请求');
      }
      if (status === 'blocked' && !isRequester && !isExperienceOwner) {
        throw new BadRequestException('你无权处理这条同路匹配');
      }

      const now = new Date();
      // Compare-and-swap. `connected`/`declined` may only leave `requested`, so a
      // concurrent accept and decline cannot both land and the later one cannot
      // overwrite the earlier. `blocked` may terminate any non-terminal state but can
      // never overwrite an already-blocked row.
      const allowedFrom: Array<'suggested' | 'requested' | 'connected'> =
        status === 'blocked' ? ['suggested', 'requested', 'connected'] : ['requested'];
      const cas = await tx.peerMatch.updateMany({
        where: { id: matchId, status: { in: allowedFrom } },
        data: {
          status,
          ...(status === 'connected' ? { acceptedAt: now } : {}),
          updatedAt: now,
        },
      });
      if (cas.count === 0) {
        throw new BadRequestException('这条同路匹配的状态已经变化，请刷新后再试');
      }
      const updated = await tx.peerMatch.findUniqueOrThrow({ where: { id: matchId } });

      return { match: mapPeerMatchRow(updated) };
    });
  }

  async blockMatchDirect(matchId: string, userId: string, hooks: PeerWriteHooks = {}): Promise<PeerMatchRecord> {
    return await this.prisma.$transaction(async (tx) => {
      if (hooks._onBeforeLock) await hooks._onBeforeLock();
      const pre = await tx.peerMatch.findUnique({
        where: { id: matchId },
        include: { peerExperience: true },
      });
      if (!pre) throw new NotFoundException('同路匹配不存在');

      await lockPeerWriteRoots(tx, [pre.userId, pre.peerExperience?.userId]);
      if (hooks._onAfterLock) await hooks._onAfterLock();

      const match = await tx.peerMatch.findUniqueOrThrow({
        where: { id: matchId },
        include: { peerExperience: true },
      });
      if (match.userId !== userId && match.peerExperience?.userId !== userId) {
        throw new BadRequestException('你无权处理这条同路匹配');
      }
      const cas = await tx.peerMatch.updateMany({
        where: { id: matchId, status: { in: ['suggested', 'requested', 'connected'] } },
        data: { status: 'blocked', updatedAt: new Date() },
      });
      if (cas.count === 0) {
        throw new BadRequestException('这条同路匹配的状态已经变化，请刷新后再试');
      }
      return mapPeerMatchRow(await tx.peerMatch.findUniqueOrThrow({ where: { id: matchId } }));
    });
  }

  async listMatchesForJourney(journeyId: string): Promise<PeerMatchRecord[]> {
    const rows = await this.prisma.peerMatch.findMany({
      where: { journeyId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapPeerMatchRow);
  }

  async listMatchesForUser(userId: string): Promise<PeerMatchRecord[]> {
    const rows = await this.prisma.peerMatch.findMany({
      where: { userId },
      orderBy: { score: 'desc' },
    });
    return rows.map(mapPeerMatchRow);
  }

  async listRequestsForOwner(ownerUserId: string): Promise<PeerMatchRecord[]> {
    const rows = await this.prisma.peerMatch.findMany({
      where: {
        peerExperience: { userId: ownerUserId },
        OR: [
          { status: 'requested' },
          { status: 'connected', conversation: null },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapPeerMatchRow);
  }

  async listMatchesForAdmin(params: { q?: string; status?: string }): Promise<PeerMatchRecord[]> {
    const rows = await this.prisma.peerMatch.findMany({
      orderBy: { createdAt: 'desc' },
    });
    const needle = params.q?.trim().toLowerCase();
    const status = params.status;
    return rows
      .map(mapPeerMatchRow)
      .filter((item) => {
        const matchesQuery =
          !needle ||
          [item.id, item.userId, item.peerExperienceId, item.explanation, item.requestReason, item.requestQuestion]
            .filter((v): v is string => Boolean(v))
            .some((f) => f.toLowerCase().includes(needle));
        const matchesStatus = !status || status === 'all' || item.status === status;
        return matchesQuery && matchesStatus;
      });
  }

  async countRequestedMatches(): Promise<number> {
    return await this.prisma.peerMatch.count({ where: { status: 'requested' } });
  }

  // ==========================================
  // Bilateral Consent & PeerConversation Activation
  // ==========================================

  async consentMatch(
    matchId: string,
    callerUserId: string,
    hooks: PeerWriteHooks = {},
  ): Promise<{
    conversation: PeerConversationRecord | null;
    pending: boolean;
    activated: boolean;
    match: PeerMatchRecord;
    starterUserId?: string;
    receiverUserId?: string;
  }> {
    return await this.prisma.$transaction(async (tx) => {
      if (hooks._onBeforeLock) await hooks._onBeforeLock();
      // 1. Fetch match to determine requester & owner
      const preCheck = await tx.peerMatch.findUnique({
        where: { id: matchId },
        include: { peerExperience: true },
      });
      if (!preCheck) throw new NotFoundException('同路匹配不存在');

      const requesterId = preCheck.userId;
      const ownerId = preCheck.peerExperience.userId;

      if (callerUserId !== requesterId && callerUserId !== ownerId) {
        throw new ForbiddenException('只有匹配参与方可以确认同行边界');
      }

      if (preCheck.status !== 'connected') {
        throw new ForbiddenException('只有接受请求的经历发布者可以确认同行边界');
      }

      // 2. Lock the roots in the global order (User rows, sorted) before the peer row
      await lockPeerWriteRoots(tx, [requesterId, ownerId]);
      if (hooks._onAfterLock) await hooks._onAfterLock();

      // 3. Lock PeerMatch under row lock
      const [lockedMatch] = await tx.$queryRaw<any[]>`SELECT * FROM "PeerMatch" WHERE id = ${matchId} FOR UPDATE`;
      if (!lockedMatch) throw new NotFoundException('同路匹配不存在');

      if (lockedMatch.status !== 'connected') {
        throw new ForbiddenException('匹配已被拒绝或关闭，无法确认边界');
      }

      // Check if conversation already exists (e.g. concurrent second consent or grandfathered)
      const existingConv = await tx.peerConversation.findUnique({ where: { matchId } });
      if (existingConv) {
        return {
          conversation: mapPeerConversationRow(existingConv),
          pending: false,
          activated: false,
          match: mapPeerMatchRow(lockedMatch),
          starterUserId: existingConv.starterUserId,
          receiverUserId: existingConv.receiverUserId,
        };
      }

      const isRequester = callerUserId === requesterId;
      const isOwner = callerUserId === ownerId;

      const now = new Date();
      let requesterConsentAt = lockedMatch.requesterConsentAt;
      let ownerConsentAt = lockedMatch.ownerConsentAt;

      // Duplicate check: if caller has already consented and no conversation yet
      if (isRequester && requesterConsentAt && !ownerConsentAt) {
        return {
          conversation: null,
          pending: true,
          activated: false,
          match: mapPeerMatchRow(lockedMatch),
          starterUserId: requesterId,
          receiverUserId: ownerId,
        };
      }
      if (isOwner && ownerConsentAt && !requesterConsentAt) {
        return {
          conversation: null,
          pending: true,
          activated: false,
          match: mapPeerMatchRow(lockedMatch),
          starterUserId: requesterId,
          receiverUserId: ownerId,
        };
      }

      // Stamp caller's consent timestamp
      if (isRequester && !requesterConsentAt) {
        requesterConsentAt = now;
      }
      if (isOwner && !ownerConsentAt) {
        ownerConsentAt = now;
      }

      const bothConsented = Boolean(requesterConsentAt && ownerConsentAt);

      // §0.4/A4: a consent call writes ONLY the caller's own consent column. Writing the
      // other party's value back — even the value just read under the row lock — would
      // widen the write set beyond what this request owns, so a future change to how the
      // counterpart value is derived would silently overwrite it.
      const callerConsentWrite = isRequester ? { requesterConsentAt: now } : { ownerConsentAt: now };

      if (bothConsented) {
        // Second consent: atomically write the caller's consent field AND create PeerConversation
        await tx.peerMatch.update({
          where: { id: matchId },
          data: {
            ...callerConsentWrite,
            updatedAt: now,
          },
        });

        const convId = genId('peer_conversation');
        const expiresAt = new Date(now.getTime() + 72 * 3600 * 1000);
        const createdConv = await tx.peerConversation.create({
          data: {
            id: convId,
            matchId,
            starterUserId: requesterId,
            receiverUserId: ownerId,
            status: 'active',
            startsAt: now,
            consentAcceptedAt: now,
            expiresAt,
            createdAt: now,
          },
        });

        const updatedMatchRow = await tx.peerMatch.findUnique({ where: { id: matchId } });
        return {
          conversation: mapPeerConversationRow(createdConv),
          pending: false,
          activated: true,
          match: mapPeerMatchRow(updatedMatchRow),
          starterUserId: requesterId,
          receiverUserId: ownerId,
        };
      } else {
        // First consent: write only caller's field and return pending
        const updatedMatch = await tx.peerMatch.update({
          where: { id: matchId },
          data: {
            ...callerConsentWrite,
            updatedAt: now,
          },
        });

        return {
          conversation: null,
          pending: true,
          activated: false,
          match: mapPeerMatchRow(updatedMatch),
          starterUserId: requesterId,
          receiverUserId: ownerId,
        };
      }
    });
  }

  // ==========================================
  // PeerConversation Lifecycle
  // ==========================================

  async getConversationByMatchId(matchId: string): Promise<PeerConversationRecord | null> {
    const row = await this.prisma.peerConversation.findUnique({ where: { matchId } });
    return row ? mapPeerConversationRow(row) : null;
  }

  async getConversationById(id: string): Promise<PeerConversationRecord | null> {
    const row = await this.prisma.peerConversation.findUnique({ where: { id } });
    return row ? mapPeerConversationRow(row) : null;
  }

  async expireDueConversations(): Promise<PeerConversationRecord[]> {
    // §0.4/A8: due-ness is decided by the database clock, not the application clock, and
    // the transition is one conditional statement so two instances cannot both "close"
    // the same conversation or close one that a concurrent consent just extended.
    const closed = await this.prisma.$queryRaw<any[]>`
      UPDATE "PeerConversation"
      SET status = 'closed', "closedAt" = NOW(), "closedReason" = 'expired'
      WHERE status = 'active' AND "expiresAt" <= NOW()
      RETURNING *
    `;
    return closed.map(mapPeerConversationRow);
  }

  async requireConversation(matchId: string, userId: string): Promise<{ conversation: PeerConversationRecord; expiredJustNow?: boolean }> {
    const row = await this.prisma.peerConversation.findUnique({ where: { matchId } });
    if (!row || (row.starterUserId !== userId && row.receiverUserId !== userId)) {
      throw new NotFoundException('匿名会话不存在');
    }
    return { conversation: mapPeerConversationRow(row) };
  }

  /**
   * Participant + deadline boundary for anything that will act on a live conversation.
   *
   * The check runs under `FOR UPDATE` with database time (§0.4/A8), so a concurrent close
   * cannot slip between the check and the caller's next step. When the deadline has passed
   * the closure is **committed** — a rejected action must not roll back the very transition
   * it detected — and the caller is told the conversation is over.
   *
   * What this does NOT provide: atomicity between this check and the caller's own write,
   * which happens in a later transaction. Callers must not describe it as such.
   */
  async requireOpenConversation(matchId: string, userId: string): Promise<PeerConversationRecord> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const [conv] = await tx.$queryRaw<any[]>`
        SELECT * FROM "PeerConversation" WHERE "matchId" = ${matchId} FOR UPDATE
      `;
      if (!conv || (conv.starterUserId !== userId && conv.receiverUserId !== userId)) {
        throw new NotFoundException('匿名会话不存在');
      }
      if (conv.status !== 'active') return { open: false as const, conversation: mapPeerConversationRow(conv) };

      const [timeRow] = await tx.$queryRaw<any[]>`SELECT NOW() as db_now`;
      const dbNow = new Date(timeRow.db_now);
      if (new Date(conv.expiresAt).getTime() <= dbNow.getTime()) {
        await tx.$executeRaw`
          UPDATE "PeerConversation"
          SET status = 'closed', "closedAt" = NOW(), "closedReason" = 'expired'
          WHERE id = ${conv.id} AND status = 'active' AND "expiresAt" <= NOW()
        `;
        return {
          open: false as const,
          conversation: { ...mapPeerConversationRow(conv), status: 'closed', closedReason: 'expired' } as PeerConversationRecord,
        };
      }
      return { open: true as const, conversation: mapPeerConversationRow(conv) };
    });

    if (!outcome.open) throw new BadRequestException('这段 72 小时会话已经结束');
    return outcome.conversation;
  }

  async listConversationsForUser(userId: string): Promise<PeerConversationRecord[]> {
    const rows = await this.prisma.peerConversation.findMany({
      where: {
        OR: [{ starterUserId: userId }, { receiverUserId: userId }],
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapPeerConversationRow);
  }

  async closeConversation(
    matchId: string,
    userId: string,
    reason: 'closed' | 'expired' | 'blocked' = 'closed',
    hooks: PeerWriteHooks = {},
  ): Promise<{ conversation: PeerConversationRecord; wasActive: boolean }> {
    return await this.prisma.$transaction(async (tx) => {
      if (hooks._onBeforeLock) await hooks._onBeforeLock();
      const pre = await tx.peerConversation.findUnique({ where: { matchId } });
      if (!pre || (pre.starterUserId !== userId && pre.receiverUserId !== userId)) {
        throw new NotFoundException('匿名会话不存在');
      }

      // Global lock order: both participants' `User` rows, then the conversation row.
      await lockPeerWriteRoots(tx, [pre.starterUserId, pre.receiverUserId]);
      if (hooks._onAfterLock) await hooks._onAfterLock();

      const conv = await tx.peerConversation.findUniqueOrThrow({ where: { matchId } });
      if (conv.status === 'closed') {
        return { conversation: mapPeerConversationRow(conv), wasActive: false };
      }

      const now = new Date();
      // CAS: the first closer commits the reason; a second close is a no-op that returns
      // the already-closed row rather than overwriting the winner's close reason.
      const cas = await tx.peerConversation.updateMany({
        where: { id: conv.id, status: 'active' },
        data: {
          status: 'closed',
          closedAt: now,
          closedReason: reason,
        },
      });
      if (cas.count === 0) {
        return {
          conversation: mapPeerConversationRow(await tx.peerConversation.findUniqueOrThrow({ where: { id: conv.id } })),
          wasActive: false,
        };
      }

      return {
        conversation: mapPeerConversationRow(await tx.peerConversation.findUniqueOrThrow({ where: { id: conv.id } })),
        wasActive: true,
      };
    });
  }

  async blockConversation(
    matchId: string,
    userId: string,
    hooks: PeerWriteHooks = {},
  ): Promise<{ conversation: PeerConversationRecord; match: PeerMatchRecord }> {
    return await this.prisma.$transaction(async (tx) => {
      if (hooks._onBeforeLock) await hooks._onBeforeLock();
      const pre = await tx.peerConversation.findUnique({ where: { matchId } });
      if (!pre || (pre.starterUserId !== userId && pre.receiverUserId !== userId)) {
        throw new NotFoundException('匿名会话不存在');
      }

      // Global lock order: both participants' `User` rows, then the peer rows.
      await lockPeerWriteRoots(tx, [pre.starterUserId, pre.receiverUserId]);
      if (hooks._onAfterLock) await hooks._onAfterLock();

      const conv = await tx.peerConversation.findUniqueOrThrow({ where: { matchId } });
      const match = await tx.peerMatch.findUnique({ where: { id: matchId } });
      if (!match) throw new NotFoundException('同路匹配不存在');

      const now = new Date();
      // CAS on the match: a concurrent accept must not be reported as "blocked" by this
      // path's return value, and an already-blocked match is left as it is.
      const matchCas = await tx.peerMatch.updateMany({
        where: { id: matchId, status: { in: ['suggested', 'requested', 'connected'] } },
        data: { status: 'blocked', updatedAt: now },
      });
      if (matchCas.count === 0 && match.status !== 'blocked') {
        throw new BadRequestException('这条同路匹配的状态已经变化，请刷新后再试');
      }

      const convCas = await tx.peerConversation.updateMany({
        where: { id: conv.id, status: 'active' },
        data: {
          status: 'closed',
          closedAt: now,
          closedReason: 'blocked',
        },
      });
      if (convCas.count === 0 && conv.status !== 'closed') {
        throw new BadRequestException('这段匿名会话的状态已经变化，请刷新后再试');
      }

      return {
        conversation: mapPeerConversationRow(await tx.peerConversation.findUniqueOrThrow({ where: { id: conv.id } })),
        match: mapPeerMatchRow(await tx.peerMatch.findUniqueOrThrow({ where: { id: matchId } })),
      };
    });
  }

  async listConversationsForAdmin(params: {
    q?: string;
    status?: string;
    reported?: string;
  }): Promise<Array<PeerConversationRecord & { messageCount: number }>> {
    const conversations = await this.prisma.peerConversation.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        reports: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 1,
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    const needle = params.q?.trim().toLowerCase();
    const status = params.status;
    const reported = params.reported;

    return conversations
      .map((c) => {
        const latestReport = c.reports[0];
        const record = mapPeerConversationRow(c);
        // Derived report pointers (§0.2, §0.4/A7)
        if (latestReport) {
          record.reportReason = latestReport.reason;
          record.reportedAt = iso(latestReport.createdAt);
          record.reporterUserId = latestReport.reporterUserId;
        } else {
          record.reportReason = undefined;
          record.reportedAt = undefined;
          record.reporterUserId = undefined;
        }

        return {
          ...record,
          messageCount: c._count.messages,
        };
      })
      .filter((item) => {
        const matchesQuery =
          !needle ||
          [item.id, item.matchId, item.starterUserId, item.receiverUserId, item.reportReason]
            .filter((v): v is string => Boolean(v))
            .some((f) => f.toLowerCase().includes(needle));
        const matchesStatus = !status || status === 'all' || item.status === status;
        const matchesReported = reported !== 'true' || Boolean(item.reportedAt);
        return matchesQuery && matchesStatus && matchesReported;
      });
  }

  async countConnectedConversations(): Promise<number> {
    const now = new Date();
    return await this.prisma.peerConversation.count({
      where: {
        status: 'active',
        expiresAt: { gt: now },
      },
    });
  }

  // ==========================================
  // PeerMessage
  // ==========================================

  async sendMessage(
    matchId: string,
    senderUserId: string,
    content: string,
    hooks: PeerWriteHooks = {},
  ): Promise<PeerMessageRecord> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      if (hooks._onBeforeLock) await hooks._onBeforeLock();
      // 0. Roots first: the message insert takes an implicit key-share on its `User` row, so
      //    the user lock must be acquired before the conversation row (global lock order).
      await lockPeerWriteRoots(tx, [senderUserId]);
      if (hooks._onAfterLock) await hooks._onAfterLock();

      // 1. Lock conversation under row lock
      const [conv] = await tx.$queryRaw<any[]>`
        SELECT * FROM "PeerConversation"
        WHERE "matchId" = ${matchId}
        FOR UPDATE
      `;
      if (!conv || (conv.starterUserId !== senderUserId && conv.receiverUserId !== senderUserId)) {
        throw new NotFoundException('匿名会话不存在');
      }

      // 2. Under lock, compare database time against expiresAt (§0.4/A8)
      const [timeRow] = await tx.$queryRaw<any[]>`SELECT NOW() as db_now`;
      const dbNow = new Date(timeRow.db_now);
      const expiresAt = new Date(conv.expiresAt);

      if (conv.status !== 'active' || dbNow.getTime() >= expiresAt.getTime()) {
        if (conv.status === 'active' && dbNow.getTime() >= expiresAt.getTime()) {
          // Committable closure: the UPDATE and the rejection share one transaction, so
          // this returns a value instead of throwing. Throwing here rolled the closure
          // back, which meant a message that was refused for expiry never actually
          // expired the conversation (review P1-4).
          await tx.$executeRaw`
            UPDATE "PeerConversation"
            SET status = 'closed', "closedAt" = NOW(), "closedReason" = 'expired'
            WHERE id = ${conv.id} AND status = 'active' AND "expiresAt" <= NOW()
          `;
        }
        return { expired: true as const };
      }

      const msgId = genId('peer_message');
      const created = await tx.peerMessage.create({
        data: {
          id: msgId,
          conversationId: conv.id,
          senderUserId,
          content,
          authorType: 'HUMAN',
          createdAt: dbNow,
          piiFlags: [],
        },
      });

      return { expired: false as const, message: mapPeerMessageRow(created) };
    });

    if (outcome.expired) throw new BadRequestException('这段 72 小时会话已经结束');
    return outcome.message;
  }

  async getMessagesForConversation(conversationId: string): Promise<PeerMessageRecord[]> {
    const rows = await this.prisma.peerMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(mapPeerMessageRow);
  }

  // ==========================================
  // PeerReport
  // ==========================================

  async reportConversation(
    matchId: string,
    reporterUserId: string,
    reason: string,
    hooks: PeerWriteHooks = {},
  ): Promise<{ report: PeerReportRecord; conversation: PeerConversationRecord; isRepeat: boolean }> {
    return await this.prisma.$transaction(async (tx) => {
      if (hooks._onBeforeLock) await hooks._onBeforeLock();
      // Roots first: the report insert takes an implicit key-share on its `User` row.
      await lockPeerWriteRoots(tx, [reporterUserId]);

      // Serialize repeat-report on the conversation row lock (§0.4/A7)
      const [conv] = await tx.$queryRaw<any[]>`
        SELECT * FROM "PeerConversation"
        WHERE "matchId" = ${matchId}
        FOR UPDATE
      `;
      if (!conv || (conv.starterUserId !== reporterUserId && conv.receiverUserId !== reporterUserId)) {
        throw new NotFoundException('匿名会话不存在');
      }

      const match = await tx.peerMatch.findUnique({ where: { id: matchId } });

      // Check existing open report by same reporter on this conversation
      const existingOpen = await tx.peerReport.findFirst({
        where: {
          conversationId: conv.id,
          reporterUserId,
          status: 'open',
        },
      });

      if (existingOpen) {
        // Return existing open report without writing a second row (§0.2)
        return {
          report: mapPeerReportRow(existingOpen),
          conversation: mapPeerConversationRow(conv),
          isRepeat: true,
        };
      }

      const reportId = genId('peer_report');
      const now = new Date();
      const created = await tx.peerReport.create({
        data: {
          id: reportId,
          conversationId: conv.id,
          experienceId: match?.peerExperienceId ?? null,
          matchId,
          reporterUserId,
          reason,
          status: 'open',
          createdAt: now,
        },
      });

      return {
        report: mapPeerReportRow(created),
        conversation: mapPeerConversationRow(conv),
        isRepeat: false,
      };
    });
  }

  async listReportsForAdmin(params: { q?: string; status?: string }): Promise<any[]> {
    const reports = await this.prisma.peerReport.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        conversation: true,
        experience: true,
        reporter: true,
      },
    });

    const needle = params.q?.trim().toLowerCase();
    const status = params.status;

    return reports
      .filter((r) => {
        const matchesStatus = !status || status === 'all' || r.status === status;
        if (!matchesStatus) return false;
        if (!needle) return true;
        const reporterNickname = r.reporter?.nickname;
        const matchId = r.matchId ?? r.conversation?.matchId;
        const experienceTitle = r.experience?.title;
        return [r.id, r.reason, r.reporterUserId, reporterNickname, matchId, experienceTitle]
          .filter((v): v is string => Boolean(v))
          .some((f) => f.toLowerCase().includes(needle));
      })
      .map((r) => ({
        ...mapPeerReportRow(r),
        matchId: r.matchId ?? r.conversation?.matchId,
        conversationStatus: r.conversation?.status,
        experienceTitle: r.experience?.title,
        experienceStatus: r.experience?.status,
        reporterNickname: r.reporter?.nickname,
        reporterAnonymousCode: r.reporter?.anonymousCode,
      }));
  }

  async handleReport(
    reportId: string,
    adminUserId: string,
    status: 'open' | 'handled',
    note?: string,
  ): Promise<{ item: PeerReportRecord }> {
    return await this.prisma.$transaction(async (tx) => {
      const existing = await tx.peerReport.findUnique({ where: { id: reportId } });
      if (!existing) throw new NotFoundException('举报记录不存在');

      const now = new Date();
      const updated = await tx.peerReport.update({
        where: { id: reportId },
        data: {
          status,
          handledAt: status === 'handled' ? now : null,
          handledBy: status === 'handled' ? adminUserId : null,
          note: status === 'handled' && note ? note.trim().slice(0, 500) : null,
        },
      });

      await tx.auditLog.create({
        data: {
          id: genId('audit'),
          adminUserId,
          action: 'PEER_REPORT_HANDLE',
          resourceType: 'PeerReport',
          resourceId: reportId,
          beforeJson: existing as unknown as Prisma.InputJsonValue,
          afterJson: updated as unknown as Prisma.InputJsonValue,
        },
      });

      return { item: mapPeerReportRow(updated) };
    });
  }

  // ==========================================
  // Feedback
  // ==========================================

  async saveConversationFeedback(
    matchId: string,
    userId: string,
    feedback: 'helpful' | 'unchanged' | 'uncomfortable',
    note?: string,
    shareExperienceData?: {
      title: string;
      domain: string;
      subDomain?: string;
      stage: string;
      content: string;
      tags: string[];
      fingerprintJson?: Record<string, unknown>;
      journeyId?: string;
    },
    hooks: PeerWriteHooks = {},
  ): Promise<{
    conversation: PeerConversationRecord;
    sharedExperience?: PeerExperienceRecord;
  }> {
    return await this.prisma.$transaction(async (tx) => {
      if (hooks._onBeforeLock) await hooks._onBeforeLock();
      // Roots first: the feedback write and the derived experience carry `User`/`LifeJourney`
      // foreign keys, so they must be locked before the conversation row (global lock order).
      await lockPeerWriteRoots(tx, [userId], [shareExperienceData?.journeyId]);
      if (hooks._onAfterLock) await hooks._onAfterLock();

      // Participant, status and deadline are all decided here, under the row lock, so the
      // feedback cannot be written against a state that a concurrent close has already
      // changed (review P0-2). The deadline uses database time (§0.4/A8).
      const [conv] = await tx.$queryRaw<any[]>`
        SELECT * FROM "PeerConversation" WHERE "matchId" = ${matchId} FOR UPDATE
      `;
      if (!conv || (conv.starterUserId !== userId && conv.receiverUserId !== userId)) {
        throw new NotFoundException('匿名会话不存在');
      }

      const [timeRow] = await tx.$queryRaw<any[]>`SELECT NOW() as db_now`;
      const dbNow = new Date(timeRow.db_now);
      const now = dbNow;
      if (conv.status === 'active' && new Date(conv.expiresAt).getTime() > dbNow.getTime()) {
        throw new BadRequestException('请先结束这段同行，再留下感受');
      }

      const updatedConv = await tx.peerConversation.update({
        where: { id: conv.id },
        data: {
          feedback,
          feedbackNote: note ?? null,
        },
      });

      let sharedExperience: PeerExperienceRecord | undefined;
      if (shareExperienceData) {
        const expId = genId('experience');
        const createdExp = await tx.peerExperience.create({
          data: {
            id: expId,
            userId,
            journeyId: await resolveJourneyRefUnderLock(tx, shareExperienceData.journeyId),
            title: shareExperienceData.title,
            domain: shareExperienceData.domain,
            subDomain: shareExperienceData.subDomain ?? null,
            stage: shareExperienceData.stage,
            content: shareExperienceData.content,
            tags: shareExperienceData.tags,
            fingerprintJson: shareExperienceData.fingerprintJson
              ? (shareExperienceData.fingerprintJson as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            laterSummary: { summary: shareExperienceData.content } as Prisma.InputJsonValue,
            helpfulActions: [],
            notHelpfulActions: [],
            consentedAt: now,
            status: 'pending_review',
            reportCount: 0,
            createdAt: now,
            updatedAt: now,
          },
        });
        sharedExperience = mapPeerExperienceRow(createdExp);
      }

      return {
        conversation: mapPeerConversationRow(updatedConv),
        sharedExperience,
      };
    });
  }
}
