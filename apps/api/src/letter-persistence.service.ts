import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Letter } from './store.service.js';
import { PrismaRuntimeService } from './prisma-runtime.service.js';

/**
 * Database authority for `Letter`.
 *
 * The last of the Post cluster. A letter is derived from a mood (`sourceMoodId`), carries its own
 * generation state, and is the thing the home dashboard shows first. `Diary.letterId` points at it,
 * which is why the diary's `hasLetter` flag and this row have to agree.
 *
 * The projection (`favorite`, the usage list) is read here too, so a letter is never served from an
 * array the flush owns.
 */
/**
 * The row shape the rest of the application uses. Aliased rather than re-declared so the narrowed
 * fields (`style: AIStyle`, `status: 'unread' | 'read'`, `createdAt: string`) stay in one place.
 */
export type LetterRow = Letter;

@Injectable()
export class LetterPersistenceService {
  constructor(@Inject(PrismaRuntimeService) private readonly prisma: PrismaRuntimeService) {}

  /**
   * Normalises a table row to the shape the in-memory `Letter` uses.
   *
   * The difference is `null` versus `undefined`: the table returns null for an absent optional,
   * the application type uses `undefined`. Without this, every caller after a conversion has to
   * choose between a cast and a run of `?? undefined`, and the ones that miss it fail to typecheck
   * in a way that has nothing to do with behaviour.
   */
  private static normalize(row: Record<string, any> | null): LetterRow | null {
    if (!row) return null;
    const shaped: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
      if (value === null) continue;
      shaped[key] = value instanceof Date ? value.toISOString() : value;
    }
    return shaped as LetterRow;
  }

  async listForUser(userId: string): Promise<LetterRow[]> {
    const rows = await this.prisma.letter.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => LetterPersistenceService.normalize(row)!);
  }

  /**
   * One bounded page for the list screen, with the filter pushed into SQL.
   *
   * The list used to fetch every letter and filter in this process. That is both unbounded in
   * transfer and wrong for a page: a `read` filter would miss older read letters once a window was
   * applied after the fetch. `total` is the count for the same filter, so the page can say it is
   * showing a window rather than pretending the window is the inbox.
   */
  async listPageForUser(
    userId: string,
    filter: { status?: 'unread' | 'read' | 'favorited'; take?: number } = {},
  ): Promise<{ rows: LetterRow[]; total: number }> {
    const where: Prisma.LetterWhereInput = { userId };
    if (filter.status === 'unread') where.status = 'unread';
    else if (filter.status === 'read') where.status = { not: 'unread' };
    else if (filter.status === 'favorited') where.favorite = true;

    const [rows, total] = await Promise.all([
      this.prisma.letter.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: filter.take ?? LetterPersistenceService.PAGE_SIZE,
      }),
      this.prisma.letter.count({ where }),
    ]);
    return { rows: rows.map((row) => LetterPersistenceService.normalize(row)!), total };
  }

  /** Enough for a long inbox; the list screen names the limit when it truncates. */
  static readonly PAGE_SIZE = 200;

  async listRecentForUser(userId: string, limit = 1): Promise<LetterRow[]> {
    const rows = await this.prisma.letter.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limit });
    return rows.map((row) => LetterPersistenceService.normalize(row)!);
  }

  /** The letter the home dashboard shows first - the newest one that actually has content. */
  async findLatestWithContent(userId: string): Promise<LetterRow | null> {
    const rows = await this.prisma.letter.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return LetterPersistenceService.normalize(rows.find((row) => row.content) ?? null);
  }

  async get(id: string): Promise<LetterRow | null> {
    return LetterPersistenceService.normalize(await this.prisma.letter.findUnique({ where: { id } }));
  }

  async findOwned(id: string, userId: string): Promise<LetterRow | null> {
    return LetterPersistenceService.normalize(await this.prisma.letter.findFirst({ where: { id, userId } }));
  }

  async findBySourceMood(sourceMoodId: string, userId: string): Promise<LetterRow | null> {
    const row = await this.prisma.letter.findFirst({ where: { sourceMoodId, userId }, orderBy: { createdAt: 'desc' } });
    return LetterPersistenceService.normalize(row);
  }

  /**
   * The newest letter per source mood, for the private-mood diary projection.
   *
   * One query for the whole set. The projection reads the companion letter for every row that
   * survives its filter, and asking per row would be an N+1 over the same ids.
   */
  async latestBySourceMoods(sourceMoodIds: string[], userId: string): Promise<Map<string, LetterRow>> {
    const result = new Map<string, LetterRow>();
    if (!sourceMoodIds.length) return result;
    const rows = await this.prisma.letter.findMany({
      where: { sourceMoodId: { in: sourceMoodIds }, userId },
      orderBy: { createdAt: 'desc' },
    });
    for (const row of rows) {
      const key = row.sourceMoodId;
      if (!key || result.has(key)) continue;
      result.set(key, LetterPersistenceService.normalize(row)!);
    }
    return result;
  }

  async countForUser(userId: string): Promise<number> {
    return this.prisma.letter.count({ where: { userId } });
  }

  async idsForUser(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.letter.findMany({ where: { userId }, select: { id: true } });
    return new Set(rows.map((row) => row.id));
  }

  async create(input: {
    id?: string;
    userId: string;
    content: string;
    title?: string;
    style: string;
    sourceMoodId?: string | null;
    aiJobId?: string | null;
    generationStatus?: string | null;
    createdAt?: Date;
  }) {
    return this.prisma.letter.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        userId: input.userId,
        content: input.content,
        title: input.title ?? '给今晚的你',
        style: input.style,
        sourceMoodId: input.sourceMoodId ?? null,
        aiJobId: input.aiJobId ?? null,
        generationStatus: input.generationStatus ?? null,
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      },
    });
  }

  /**
   * Flips the `favourite` projection for the owner, mirroring what the favourite service wrote.
   * `userId` is part of the where-clause so one user can never move another user's flag.
   */
  async setFavorite(id: string, userId: string, favorite: boolean) {
    return this.prisma.letter.updateMany({ where: { id, userId }, data: { favorite } });
  }

  async markRead(id: string, userId: string) {
    return this.prisma.letter.updateMany({ where: { id, userId }, data: { status: 'read' } });
  }

  async incrementLike(id: string, userId: string) {
    return this.prisma.letter.updateMany({ where: { id, userId }, data: { likeCount: { increment: 1 } } });
  }

  async markSavedToDiary(id: string, userId: string) {
    return this.prisma.letter.updateMany({ where: { id, userId }, data: { savedToDiary: true } });
  }

  /**
   * Marks the letter saved and creates its diary entry as one unit.
   *
   * These were two separate writes: if the diary insert failed, the letter stayed flagged as saved with
   * no diary behind it, and the reader saw 已收藏 with nothing to open. The update runs first inside the
   * transaction, so a letter that does not belong to the caller cannot leave a diary behind either.
   */
  async saveToDiaryAtomically(
    letterId: string,
    userId: string,
    diary: { id: string; emotion: string; content: string; createdAt: Date },
  ) {
    return await this.prisma.$transaction(async (tx) => {
      const updated = await tx.letter.updateMany({ where: { id: letterId, userId }, data: { savedToDiary: true } });
      if (updated.count === 0) return { saved: false };
      await tx.diary.create({
        data: {
          id: diary.id,
          userId,
          letterId,
          emotion: diary.emotion,
          content: diary.content,
          hasLetter: true,
          createdAt: diary.createdAt,
        },
      });
      return { saved: true };
    });
  }

  /**
   * Applies an AI completion to the letter, mirroring what the in-memory path wrote.
   *
   * `style` and `content` are only carried when the job actually produced text: a failed job
   * records its status but leaves the previous content alone, so a person is not shown a blank
   * letter because a generation failed.
   */
  async applyGenerationResult(
    id: string,
    userId: string,
    result: { aiJobId: string; generationStatus: string; style?: string; content?: string },
    expectedAiJobId?: string,
  ) {
    const data: Record<string, unknown> = {
      aiJobId: result.aiJobId,
      generationStatus: result.generationStatus,
    };
    if (result.style !== undefined) data.style = result.style;
    if (result.content !== undefined) {
      data.content = result.content;
      data.status = 'unread';
    }
    const whereClause: any = { id, userId };
    if (expectedAiJobId) {
      whereClause.aiJobId = expectedAiJobId;
    }
    return this.prisma.letter.updateMany({ where: whereClause, data: data as never });
  }

  async deleteAllForUser(userId: string) {
    await this.prisma.letter.deleteMany({ where: { userId } });
  }
}
