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

  async createExperience(params: {
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
  }): Promise<PeerExperienceRecord> {
    const id = genId('experience');
    const created = await this.prisma.peerExperience.create({
      data: {
        id,
        userId: params.userId,
        journeyId: params.journeyId ?? null,
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

  async createMatches(matches: Array<Omit<PeerMatchRecord, 'id' | 'createdAt' | 'updatedAt'>>): Promise<PeerMatchRecord[]> {
    const created: PeerMatchRecord[] = [];
    for (const m of matches) {
      const row = await this.prisma.peerMatch.upsert({
        where: { userId_peerExperienceId: { userId: m.userId, peerExperienceId: m.peerExperienceId } },
        create: {
          id: genId('peer_match'),
          userId: m.userId,
          journeyId: m.journeyId ?? null,
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
        update: {
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
      created.push(mapPeerMatchRow(row));
    }
    return created;
  }

  async updateMatchRequest(
    matchId: string,
    userId: string,
    status: 'requested',
    requestReason: string,
    requestQuestion?: string,
  ): Promise<{ match: PeerMatchRecord; ownerUserId: string }> {
    return await this.prisma.$transaction(async (tx) => {
      const match = await tx.peerMatch.findUnique({
        where: { id: matchId },
        include: { peerExperience: true },
      });
      if (!match) throw new NotFoundException('同路匹配不存在');
      if (match.userId !== userId || match.status !== 'suggested') {
        throw new BadRequestException('只有发起方可以对待匹配经历发出一次请求');
      }

      const updated = await tx.peerMatch.update({
        where: { id: matchId },
        data: {
          status: 'requested',
          requestReason,
          requestQuestion: requestQuestion ?? null,
          updatedAt: new Date(),
        },
      });

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
  ): Promise<{ match: PeerMatchRecord }> {
    return await this.prisma.$transaction(async (tx) => {
      const match = await tx.peerMatch.findUnique({
        where: { id: matchId },
        include: { peerExperience: true },
      });
      if (!match) throw new NotFoundException('同路匹配不存在');

      const isExperienceOwner = match.peerExperience?.userId === userId;
      const isRequester = match.userId === userId;

      if ((status === 'connected' || status === 'declined') && (!isExperienceOwner || match.status !== 'requested')) {
        throw new BadRequestException('只有经历发布者可以处理待确认的同路请求');
      }
      if (status === 'blocked' && !isRequester && !isExperienceOwner) {
        throw new BadRequestException('你无权处理这条同路匹配');
      }

      const now = new Date();
      const updated = await tx.peerMatch.update({
        where: { id: matchId },
        data: {
          status,
          ...(status === 'connected' ? { acceptedAt: now } : {}),
          updatedAt: now,
        },
      });

      return { match: mapPeerMatchRow(updated) };
    });
  }

  async blockMatchDirect(matchId: string, userId: string): Promise<PeerMatchRecord> {
    return await this.prisma.$transaction(async (tx) => {
      const match = await tx.peerMatch.findUnique({
        where: { id: matchId },
        include: { peerExperience: true },
      });
      if (!match) throw new NotFoundException('同路匹配不存在');
      if (match.userId !== userId && match.peerExperience?.userId !== userId) {
        throw new BadRequestException('你无权处理这条同路匹配');
      }
      const updated = await tx.peerMatch.update({
        where: { id: matchId },
        data: { status: 'blocked', updatedAt: new Date() },
      });
      return mapPeerMatchRow(updated);
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
  ): Promise<{
    conversation: PeerConversationRecord | null;
    pending: boolean;
    activated: boolean;
    match: PeerMatchRecord;
    starterUserId?: string;
    receiverUserId?: string;
  }> {
    return await this.prisma.$transaction(async (tx) => {
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

      // 2. Lock Users in deterministic sorted order
      await lockUsers(tx, [requesterId, ownerId]);

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

      if (bothConsented) {
        // Second consent: atomically write match consent field AND create PeerConversation
        await tx.peerMatch.update({
          where: { id: matchId },
          data: {
            requesterConsentAt,
            ownerConsentAt,
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
            requesterConsentAt,
            ownerConsentAt,
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
    const now = new Date();
    const dueRows = await this.prisma.peerConversation.findMany({
      where: {
        status: 'active',
        expiresAt: { lte: now },
      },
    });

    if (!dueRows.length) return [];

    const closed: PeerConversationRecord[] = [];
    for (const due of dueRows) {
      const updated = await this.prisma.peerConversation.updateMany({
        where: { id: due.id, status: 'active', expiresAt: { lte: now } },
        data: {
          status: 'closed',
          closedAt: now,
          closedReason: 'expired',
        },
      });
      if (updated.count > 0) {
        closed.push({
          ...mapPeerConversationRow(due),
          status: 'closed',
          closedAt: now.toISOString(),
          closedReason: 'expired',
        });
      }
    }
    return closed;
  }

  async requireConversation(matchId: string, userId: string): Promise<{ conversation: PeerConversationRecord; expiredJustNow?: boolean }> {
    const row = await this.prisma.peerConversation.findUnique({ where: { matchId } });
    if (!row || (row.starterUserId !== userId && row.receiverUserId !== userId)) {
      throw new NotFoundException('匿名会话不存在');
    }
    return { conversation: mapPeerConversationRow(row) };
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
  ): Promise<{ conversation: PeerConversationRecord; wasActive: boolean }> {
    return await this.prisma.$transaction(async (tx) => {
      const conv = await tx.peerConversation.findUnique({ where: { matchId } });
      if (!conv || (conv.starterUserId !== userId && conv.receiverUserId !== userId)) {
        throw new NotFoundException('匿名会话不存在');
      }

      if (conv.status === 'closed') {
        return { conversation: mapPeerConversationRow(conv), wasActive: false };
      }

      const now = new Date();
      const updated = await tx.peerConversation.update({
        where: { id: conv.id },
        data: {
          status: 'closed',
          closedAt: now,
          closedReason: reason,
        },
      });

      return { conversation: mapPeerConversationRow(updated), wasActive: true };
    });
  }

  async blockConversation(
    matchId: string,
    userId: string,
  ): Promise<{ conversation: PeerConversationRecord; match: PeerMatchRecord }> {
    return await this.prisma.$transaction(async (tx) => {
      const conv = await tx.peerConversation.findUnique({ where: { matchId } });
      if (!conv || (conv.starterUserId !== userId && conv.receiverUserId !== userId)) {
        throw new NotFoundException('匿名会话不存在');
      }

      const match = await tx.peerMatch.findUnique({ where: { id: matchId } });
      if (!match) throw new NotFoundException('同路匹配不存在');

      await lockUsers(tx, [conv.starterUserId, conv.receiverUserId]);

      const now = new Date();
      const updatedMatch = await tx.peerMatch.update({
        where: { id: matchId },
        data: { status: 'blocked', updatedAt: now },
      });

      const updatedConv = await tx.peerConversation.update({
        where: { id: conv.id },
        data: {
          status: 'closed',
          closedAt: now,
          closedReason: 'blocked',
        },
      });

      return {
        conversation: mapPeerConversationRow(updatedConv),
        match: mapPeerMatchRow(updatedMatch),
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
  ): Promise<PeerMessageRecord> {
    return await this.prisma.$transaction(async (tx) => {
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
          await tx.peerConversation.update({
            where: { id: conv.id },
            data: {
              status: 'closed',
              closedAt: dbNow,
              closedReason: 'expired',
            },
          });
        }
        throw new BadRequestException('这段 72 小时会话已经结束');
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

      return mapPeerMessageRow(created);
    });
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
  ): Promise<{ report: PeerReportRecord; conversation: PeerConversationRecord; isRepeat: boolean }> {
    return await this.prisma.$transaction(async (tx) => {
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
  ): Promise<{
    conversation: PeerConversationRecord;
    sharedExperience?: PeerExperienceRecord;
  }> {
    return await this.prisma.$transaction(async (tx) => {
      const conv = await tx.peerConversation.findUnique({ where: { matchId } });
      if (!conv || (conv.starterUserId !== userId && conv.receiverUserId !== userId)) {
        throw new NotFoundException('匿名会话不存在');
      }

      const now = new Date();
      if (conv.status === 'active' && new Date(conv.expiresAt).getTime() > now.getTime()) {
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
            journeyId: shareExperienceData.journeyId ?? null,
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
