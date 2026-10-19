import { Inject, Injectable } from '@nestjs/common';
import { PrismaRuntimeService } from './prisma-runtime.service.js';

/**
 * Database authority for `Mood`.
 *
 * Mood is the third of the last Batch 4 cluster and the one with no incoming foreign key: Post,
 * Diary and Letter all point *at* it, and `deleteJourneyArchive` detaches it rather than deleting it.
 * That makes it the safest of the four to move - what remains is the read surface, which is the
 * diary projection, the monthly report, the letter source lookup, and the attachment check.
 *
 * `Post.moodId` is a Restrict FK, so publishing still has to write the mood row before the post
 * row; the caller in `createMood` already drains the write queue for exactly that reason.
 */
@Injectable()
export class MoodPersistenceService {
  constructor(@Inject(PrismaRuntimeService) private readonly prisma: PrismaRuntimeService) {}

  async get(id: string) {
    return this.prisma.mood.findUnique({ where: { id } });
  }

  async listForUser(userId: string) {
    return this.prisma.mood.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  /** Moods that have a Post of their own, excluded from the diary projection. */
  async moodIdsWithPosts(moodIds: string[]): Promise<Set<string>> {
    if (!moodIds.length) return new Set();
    const rows = await this.prisma.post.findMany({
      where: { moodId: { in: moodIds } },
      select: { moodId: true },
      distinct: ['moodId'],
    });
    return new Set(rows.map((row) => row.moodId));
  }

  /** The newest mood for a user, which is what the letter source lookup uses. */
  async latestForUser(userId: string) {
    return this.prisma.mood.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async create(input: {
    id?: string;
    userId: string;
    emotion: string;
    content: string;
    visibility: string;
    riskLevel: string;
    riskScore: number;
    attachmentIds?: string[];
    journeyId?: string | null;
    createdAt?: Date;
  }) {
    return this.prisma.mood.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        userId: input.userId,
        emotion: input.emotion,
        content: input.content,
        visibility: input.visibility as 'PRIVATE' | 'PUBLIC',
        riskLevel: input.riskLevel,
        riskScore: input.riskScore,
        status: 'active',
        attachments: {
          create: (input.attachmentIds ?? []).map((assetId) => ({ mediaAssetId: assetId })),
        },
        journeyId: input.journeyId ?? null,
        ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      },
    });
  }

  /**
   * The mood's attachment ids - the equivalent of the legacy `attachmentIds` array on the mood
   * object. `MoodAttachment` is a separate table with a composite key, so this is its own read.
   */
  async attachmentIdsFor(moodId: string): Promise<string[]> {
    const rows = await this.prisma.moodAttachment.findMany({
      where: { moodId },
      orderBy: { sortOrder: 'asc' },
      select: { mediaAssetId: true },
    });
    return rows.map((row) => row.mediaAssetId);
  }

  async isAttachedToAny(moodId: string): Promise<boolean> {
    const [post, diary, letter] = await Promise.all([
      this.prisma.post.count({ where: { moodId } }),
      this.prisma.diary.count({ where: { moodId } }),
      this.prisma.letter.count({ where: { sourceMoodId: moodId } }),
    ]);
    return post > 0 || diary > 0 || letter > 0;
  }

  /** Detach a journey from a mood without deleting it (the archive path's behaviour). */
  async detachJourney(moodIds: string[]) {
    if (!moodIds.length) return;
    await this.prisma.mood.updateMany({ where: { id: { in: moodIds } }, data: { journeyId: null } });
  }
}
