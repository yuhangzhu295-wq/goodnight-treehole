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

  /**
   * Reshapes a row into the application shape.
   *
   * The callers compare and slice `createdAt` as a string and pass `moodId` around as
   * `string | undefined`, both of which a `Date` and a nullable column break. Normalising here - the
   * same way `LetterPersistenceService` does - keeps those two shapes from having to be reconciled at
   * every call site.
   */
  private static normalize(row: Record<string, any>) {
    return {
      id: row.id,
      userId: row.userId,
      moodId: row.moodId ?? undefined,
      journeyId: row.journeyId ?? undefined,
      letterId: row.letterId ?? undefined,
      content: row.content ?? '',
      emotion: row.emotion,
      source: row.source ?? undefined,
      hasLetter: row.hasLetter ?? false,
      toolResult: row.toolResult ?? undefined,
      attachmentIds: (row.attachments ?? []).map((item: any) => item.mediaAssetId),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    };
  }

  async get(id: string) {
    const row = await this.prisma.diary.findUnique({ where: { id } });
    return row ? DiaryPersistenceService.normalize(row) : null;
  }

  async listForUser(userId: string) {
    const rows = await this.prisma.diary.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { attachments: { orderBy: { sortOrder: 'asc' } } },
    });
    return rows.map((row) => DiaryPersistenceService.normalize(row));
  }

  async findLatestWithContent(userId: string) {
    const row = await this.prisma.diary.findFirst({
      where: { userId, content: { not: '' } },
      orderBy: { createdAt: 'desc' },
    });
    return row ? DiaryPersistenceService.normalize(row) : null;
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
    toolResult?: unknown;
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
        // The tool's structured result was accepted by the route and then dropped here, so a diary saved
        // from a tool kept only the text and lost the breakdown it came from.
        ...(input.toolResult === undefined ? {} : { toolResult: input.toolResult as any }),
        attachments: {
          create: (input.attachmentIds ?? []).map((mediaAssetId, sortOrder) => ({ mediaAssetId, sortOrder })),
        },
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      },
    });
  }

  /** The diary's attachment ids, the equivalent of the legacy `attachmentIds` array. */
  /**
   * Whether this asset is attached to any diary, by the join row's own column.
   *
   * The diary-delete guard needs "is this file in use", and the join table is keyed `mediaAssetId`;
   * scanning the diary rows in application code would answer it only for the rows loaded here.
   */
  async isAttachedToAnyRow(mediaAssetId: string): Promise<boolean> {
    const count = await this.prisma.diaryAttachment.count({ where: { mediaAssetId } });
    return count > 0;
  }

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

  async deleteAllForUser(userId: string): Promise<string[]> {
    const diaries = await this.prisma.diary.findMany({
      where: { userId },
      select: { id: true },
    });
    const diaryIds = diaries.map((d) => d.id);
    if (!diaryIds.length) return [];
    const attachments = await this.prisma.diaryAttachment.findMany({
      where: { diaryId: { in: diaryIds } },
      select: { mediaAssetId: true },
    });
    const assetIds = attachments.map((a) => a.mediaAssetId);
    await this.prisma.diaryAttachment.deleteMany({ where: { diaryId: { in: diaryIds } } });
    await this.prisma.diary.deleteMany({ where: { userId } });
    return assetIds;
  }
}
