import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaRuntimeService } from './prisma-runtime.service.js';

/**
 * Database authority for `Post` — the hub of the last Batch 4 cluster.
 *
 * `Post` was the last model still written by the legacy flush, while `Favorite` and `Reply` had
 * already moved to the database. That is why the cluster could not move a piece at a time: the hub
 * owned the two denormalised counters (`favoriteCount`, `replyCount`) and the sweep around it had
 * to respect the FKs of the tables that had already moved. With this service the post row, both
 * counters and every read go to the table, and the flush no longer touches it at all.
 *
 * `hugCount` keeps the seeded baseline and layers the real `HugAction` rows on top, exactly as
 * `hugPost` did: the seeded numbers (28, 31, 16, 22) predate reaction rows and are content, not a
 * counter to recount. `hugPost` writes the derived value to the column, so nothing recomputes it at
 * boot and a recount cannot silently drop the seeded numbers.
 */
export type ReviewStatus = 'pending_review' | 'published' | 'hidden' | 'rejected';

@Injectable()
export class PostPersistenceService {
  constructor(@Inject(PrismaRuntimeService) private readonly prisma: PrismaRuntimeService) {}

  async listAll() {
    return this.prisma.post.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async get(id: string) {
    return this.prisma.post.findUnique({ where: { id } });
  }

  /**
   * `latest` is the publication order the feed has always used; `hot` is what the community actually
   * responded to. The counters are real columns, so this is an order-by rather than a client-side
   * re-sort of one page pretending to be a ranking. Ties break on the next counter and finally on
   * time, so two requests for the same feed agree on the order.
   */
  async listPublished(filter?: { emotion?: string; sort?: 'latest' | 'hot' }) {
    return this.prisma.post.findMany({
      where: {
        status: 'active',
        reviewStatus: 'published',
        ...(filter?.emotion ? { emotion: filter.emotion } : {}),
      },
      orderBy:
        filter?.sort === 'hot'
          ? [{ hugCount: 'desc' }, { replyCount: 'desc' }, { createdAt: 'desc' }]
          : { createdAt: 'desc' },
    });
  }

  async listPendingReview() {
    return this.prisma.post.findMany({ where: { reviewStatus: 'pending_review' } });
  }

  async countCreatedSince(since: Date): Promise<number> {
    return this.prisma.post.count({ where: { createdAt: { gte: since } } });
  }

  async listRecent(limit: number) {
    return this.prisma.post.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }

  async idsForAdmin(filter: { type?: string; status?: string; q?: string }) {
    return this.prisma.post.findMany({
      where: {
        ...(filter.status && filter.status !== 'all'
          ? { reviewStatus: filter.status as ReviewStatus }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
  }

  async idByMoodId(moodId: string): Promise<string | null> {
    const row = await this.prisma.post.findFirst({ where: { moodId }, select: { id: true } });
    return row?.id ?? null;
  }

  async findByIds(ids: string[]) {
    if (!ids.length) return [];
    return this.prisma.post.findMany({ where: { id: { in: ids } } });
  }

  async create(input: {
    id?: string;
    moodId: string;
    userId: string;
    emotion: string;
    content: string;
    visibility: string;
    reviewStatus?: ReviewStatus;
    journeyId?: string | null;
    createdAt?: Date;
  }) {
    // `Post` has no attachment column: the feed reads them off the mood (`moodId` is `@unique` on
    // this model), and the legacy mapper did the same. Taking them here would invent a column.
    const data = {
      moodId: input.moodId,
      userId: input.userId,
      emotion: input.emotion,
      content: input.content,
      visibility: input.visibility as 'PRIVATE' | 'PUBLIC',
      status: 'active',
      reviewStatus: input.reviewStatus ?? 'pending_review',
      journeyId: input.journeyId ?? null,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    };
    // A caller-supplied id makes this idempotent, because two instances booting against one database
    // both write the seed posts. Read-then-create rather than upsert: Postgres raises a unique
    // violation when two instances insert the same primary key at the same moment even as the update
    // branch of an ON CONFLICT, and `batch1-multi-instance` proved that takes the boot with it.
    if (input.id) {
      const existing = await this.prisma.post.findUnique({ where: { id: input.id } });
      if (existing) return existing;
      try {
        return await this.prisma.post.create({ data: { id: input.id, ...data } });
      } catch (error) {
        // The race the read cannot close. The other instance's row is the same seed row, so
        // returning it is correct rather than a failure. Only the unique-key conflict gets this
        // treatment; any other error must surface, or a broken save would look like it worked.
        if ((error as { code?: string })?.code === 'P2002') {
          const raced = await this.prisma.post.findUnique({ where: { id: input.id } });
          if (raced) return raced;
        }
        throw error;
      }
    }
    return this.prisma.post.create({ data });
  }

  async moderate(id: string, action: 'approve' | 'hide' | 'reject' | 'risk') {
    const existing = await this.prisma.post.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('树洞不存在');
    if (action === 'risk') {
      return this.prisma.post.update({ where: { id }, data: { reportCount: { increment: 1 } } });
    }
    const reviewStatus: ReviewStatus =
      action === 'approve' ? 'published' : action === 'hide' ? 'hidden' : 'rejected';
    return this.prisma.post.update({
      where: { id },
      data: {
        reviewStatus,
        // `approve` publishes for the first time; re-approving keeps the original date.
        ...(reviewStatus === 'published' && !existing.publishedAt ? { publishedAt: new Date() } : {}),
      },
    });
  }

  async markDeleted(id: string) {
    return this.prisma.post.update({ where: { id }, data: { status: 'deleted' } });
  }

  /**
   * `hugCount` keeps the seeded baseline and layers the real `HugAction` rows on top. It is written
   * by `hugPost` rather than recomputed at boot, so a recount cannot drop the seeded numbers.
   */
  async setHugCount(id: string, count: number) {
    return this.prisma.post.update({ where: { id }, data: { hugCount: count } });
  }

  async incrementReport(id: string) {
    return this.prisma.post.update({ where: { id }, data: { reportCount: { increment: 1 } } });
  }

  /** Favourite counts, maintained by the favourite path and by reconciliation. */
  async setFavoriteCount(id: string, count: number) {
    return this.prisma.post.update({ where: { id }, data: { favoriteCount: count } });
  }

  async setReplyCount(id: string, count: number) {
    return this.prisma.post.update({ where: { id }, data: { replyCount: count } });
  }

  /** Published-reply counts for the rows the caller is about to serve. */
  async replyCountsForPosts(postIds: string[]): Promise<Map<string, number>> {
    if (!postIds.length) return new Map();
    const grouped = await this.prisma.reply.groupBy({
      by: ['postId'],
      where: { postId: { in: postIds }, status: 'published' },
      _count: { _all: true },
    });
    return new Map(grouped.map((row) => [row.postId, row._count._all]));
  }

  /**
   * Boot reconciliation for the two denormalised counters, from the tables that own them. Both are
   * recomputed as exact row counts: unlike `hugCount`, neither carries a seeded baseline, and the old
   * array-based reconciliation already treated them that way.
   */
  async reconcileCounters(): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "Post"
      SET "favoriteCount" = f.total
      FROM (
        SELECT "targetId", count(*)::int AS total
        FROM "Favorite"
        WHERE "targetType" = 'post'
        GROUP BY "targetId"
      ) AS f
      WHERE "Post".id = f."targetId"
    `;
    await this.prisma.$executeRaw`
      UPDATE "Post" SET "favoriteCount" = 0
      WHERE "favoriteCount" <> 0
        AND NOT EXISTS (SELECT 1 FROM "Favorite" WHERE "targetType" = 'post' AND "Favorite"."targetId" = "Post".id)
    `;
    await this.prisma.$executeRaw`
      UPDATE "Post"
      SET "replyCount" = r.total
      FROM (
        SELECT "postId", count(*)::int AS total
        FROM "Reply"
        WHERE status = 'published'
        GROUP BY "postId"
      ) AS r
      WHERE "Post".id = r."postId"
    `;
    await this.prisma.$executeRaw`
      UPDATE "Post" SET "replyCount" = 0
      WHERE "replyCount" <> 0
        AND NOT EXISTS (SELECT 1 FROM "Reply" WHERE "Reply"."postId" = "Post".id AND "Reply".status = 'published')
    `;
  }
}
