import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaRuntimeService } from './prisma-runtime.service.js';

/**
 * Database authority for `Diary`.
 *
 * A diary row is derived from a mood (`moodId`), optionally linked to a journey, and carries the
 * attachments the mood had. Deleting is per-owner and per-id, which is what makes "a diary id is not
 * a capability" a property of the table rather than of the handler.
 *
 * `Diary.moodId` is unique, which is what the diary projection relies on: a private mood with no
 * companion row is projected, and the set of ids that do have one is the exclusion.
 */
@Injectable()
export class DiaryPersistenceService {
  constructor(@Inject(PrismaRuntimeService) private readonly prisma: PrismaRuntimeService) {}

  async get(id: string) {
    return this.prisma.diary.findUnique({ where: { id } });
  }

  async listForUser(userId: string) {
    return this.prisma.diary.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  /** The mood ids that already have a diary row - the exclusion the projection needs. */
  async moodIdsWithDiaries(moodIds: string[]): Promise<Set<string>> {
    if (!moodIds.length) return new Set();
    const rows = await this.prisma.diary.findMany({
      where: { moodId: { in: moodIds } },
      select: { moodId: true },
      distinct: ['moodId'],
    });
    return new Set(rows.map((row) => row.moodId).filter((value): value is string => Boolean(value)));
  }

  async findOwned(id: string, userId: string) {
    return this.prisma.diary.findFirst({ where: { id, userId } });
  }

  async countForUser(userId: string): Promise<number> {
    return this.prisma.diary.count({ where: { userId } });
  }

  async countCreatedSince(since: Date): Promise<number> {
    return this.prisma.diary.count({ where: { createdAt: { gte: since } } });
  }

  async create(input: {
    id?: string;
    userId: string;
    content: string;
    emotion: string;
    moodId?: string | null;
    letterId?: string | null;
    journeyId?: string | null;
    hasLetter?: boolean;
    source?: string;
    attachmentIds?: string[];
    createdAt?: Date;
  }) {
    // `Diary` keeps its attachments in the `DiaryAttachment` join table, not as an array column.
    return this.prisma.diary.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        userId: input.userId,
        content: input.content,
        emotion: input.emotion,
        moodId: input.moodId ?? null,
        letterId: input.letterId ?? null,
        journeyId: input.journeyId ?? null,
        hasLetter: input.hasLetter ?? Boolean(input.letterId),
        source: input.source ?? 'manual',
        attachments: {
          create: (input.attachmentIds ?? []).map((mediaAssetId, sortOrder) => ({ mediaAssetId, sortOrder })),
        },
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      },
    });
  }

  /** The diary's attachment ids, the equivalent of the legacy `attachmentIds` array. */
  async attachmentIdsFor(diaryId: string): Promise<string[]> {
    const rows = await this.prisma.diaryAttachment.findMany({
      where: { diaryId },
      orderBy: { sortOrder: 'asc' },
      select: { mediaAssetId: true },
    });
    return rows.map((row) => row.mediaAssetId);
  }

  /** Set when the letter the diary is waiting for has been generated. */
  async setHasLetter(id: string, hasLetter: boolean) {
    return this.prisma.diary.update({ where: { id }, data: { hasLetter } });
  }

  /** Per-owner delete: the row must belong to the caller or nothing is removed. */
  async deleteOwned(id: string, userId: string) {
    const existing = await this.findOwned(id, userId);
    if (!existing) throw new NotFoundException('日记不存在');
    await this.prisma.diary.delete({ where: { id: existing.id } });
    return existing;
  }

  async deleteAllForUser(userId: string) {
    await this.prisma.diary.deleteMany({ where: { userId } });
  }
}
