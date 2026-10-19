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

  /**
   * Upsert on the caller's id, when there is one.
   *
   * `writeSnapshotPostsAndMoods` writes the snapshot's moods at boot and after every state reload,
   * and the snapshot's ids are stable, so a second instance - or the same instance after a reload
   * that re-read the snapshot - would hit a unique-constraint failure on `create`. The boot path is
   * therefore idempotent on id, which is the same reason the reply seed upserts.
   */
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
    if (!input.id) {
      return this.prisma.mood.create({
        data: {
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
    // Read-then-create rather than upsert: an `upsert` is not the concurrency-safe operation it
    // looks like, because Postgres raises a unique violation when two instances insert the same
    // primary key at the same moment, even as the `update` branch of an ON CONFLICT. Two instances
    // booting against one database do exactly that with the deterministic seed ids
    // (`ensureSeedCoverage`), and the crash took the whole boot with it.
    const existing = await this.prisma.mood.findUnique({ where: { id: input.id } });
    if (existing) return existing;
    try {
      return await this.prisma.mood.create({
        data: {
          id: input.id,
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
    } catch (error) {
      // The race the read above cannot close: the other instance committed between the read and
      // this insert. Its row is the same one this caller wanted, so returning it is correct rather
      // than a failure - the seed is identical on every instance by construction.
      //
      // Only the unique-key conflict gets this treatment. Swallowing any other error here would
      // turn an unrelated write failure into a silent success, which is how a broken save starts
      // looking like it worked.
      if ((error as { code?: string })?.code === 'P2002') {
        const raced = await this.prisma.mood.findUnique({ where: { id: input.id } });
        if (raced) return raced;
      }
      throw error;
    }
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
