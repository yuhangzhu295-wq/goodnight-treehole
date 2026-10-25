import { Inject, Injectable } from '@nestjs/common';
import { PrismaRuntimeService } from './prisma-runtime.service.js';

/**
 * Database authority for `Favorite`.
 *
 * `Favorite` is the first member of the Post cluster (`BATCH4_LEGACY_FLUSH_RETIREMENT.md` §5d) to
 * move. It is not a leaf: the same rows maintain `Post.favoriteCount` and `Letter.favorite`, and the
 * feed's `favoritedByCurrentUser` flag is read through the pre-fetch seam. Converting it therefore
 * means those three readers stop consulting the in-memory array:
 *
 *  - `buildPostDecorationContext` reads the viewer's post ids from this table, once per request;
 *  - the two counters are recomputed from the table after a write, the same way `hugPost` derives
 *    `hugCount` from `HugAction`;
 *  - `Letter.favorite` is kept as a denormalised column because `decorateLetter` is synchronous and
 *    called from eight places. The service updates it in the same transaction as the favourite row,
 *    and boot reconciliation recomputes it from the table.
 *
 * Nothing here depends on the legacy flush. Once `DIRECT_DB_MODELS.Favorite` is registered the flush
 * neither hydrates the array nor writes or sweeps the table.
 */
export type FavoriteTargetType = 'post' | 'letter' | 'diary';

@Injectable()
export class FavoritePersistenceService {
  constructor(@Inject(PrismaRuntimeService) private readonly prisma: PrismaRuntimeService) {}

  async listForUser(userId: string, targetType?: string) {
    return this.prisma.favorite.findMany({
      where: { userId, ...(targetType ? { targetType: targetType as FavoriteTargetType } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** The viewer's post favourites, as ids. Used once per feed request by the decoration context. */
  async postIdsForUser(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId, targetType: 'post' },
      select: { targetId: true },
    });
    return new Set(rows.map((row) => row.targetId));
  }

  async isFavorite(userId: string, targetType: FavoriteTargetType, targetId: string): Promise<boolean> {
    const row = await this.prisma.favorite.findUnique({
      where: { userId_targetType_targetId: { userId, targetType, targetId } },
      select: { id: true },
    });
    return Boolean(row);
  }

  async countForUser(userId: string): Promise<number> {
    return this.prisma.favorite.count({ where: { userId } });
  }

  /**
   * Adds a favourite. The unique constraint makes this idempotent: a second call returns the row
   * that already exists and reports `created: false`, which is what the legacy method did by scanning
   * the array.
   */
  async add(userId: string, targetType: FavoriteTargetType, targetId: string) {
    const existing = await this.prisma.favorite.findUnique({
      where: { userId_targetType_targetId: { userId, targetType, targetId } },
    });
    if (existing) return { item: existing, created: false };

    const item = await this.prisma.favorite.create({ data: { userId, targetType, targetId } });
    await this.afterWrite(userId, targetType, targetId);
    return { item, created: true };
  }

  async removeByTarget(userId: string, targetType: FavoriteTargetType, targetId: string) {
    const removed = await this.prisma.favorite.findMany({
      where: { userId, targetType, targetId },
    });
    if (!removed.length) return removed;
    await this.prisma.favorite.deleteMany({ where: { userId, targetType, targetId } });
    await this.afterWrite(userId, targetType, targetId);
    return removed;
  }

  /**
   * Removes one favourite by id, returning the row it actually deleted.
   *
   * The row is read first only to know which projection to refresh; the delete itself is a single
   * conditional statement whose affected count decides the answer. Two devices removing the same
   * favourite would both see the row, and only the statement that deleted a row reports success.
   */
  async removeById(userId: string, favoriteId: string) {
    const favorite = await this.prisma.favorite.findFirst({ where: { id: favoriteId, userId } });
    if (!favorite) return undefined;
    const result = await this.prisma.favorite.deleteMany({ where: { id: favoriteId, userId } });
    if (result.count === 0) return undefined;
    await this.afterWrite(favorite.userId, favorite.targetType as FavoriteTargetType, favorite.targetId);
    return favorite;
  }

  async clearForUser(userId: string) {
    const removed = await this.prisma.favorite.findMany({ where: { userId } });
    if (!removed.length) return removed;
    await this.prisma.favorite.deleteMany({ where: { userId } });
    for (const item of removed) {
      await this.afterWrite(item.userId, item.targetType as FavoriteTargetType, item.targetId);
    }
    return removed;
  }

  /** Post id → favourite count, for the rows the caller is about to serve. */
  async countsForPosts(postIds: string[]): Promise<Map<string, number>> {
    if (!postIds.length) return new Map();
    const grouped = await this.prisma.favorite.groupBy({
      by: ['targetId'],
      where: { targetType: 'post', targetId: { in: postIds } },
      _count: { _all: true },
    });
    return new Map(grouped.map((row) => [row.targetId, row._count._all]));
  }

  /** Every letter favourite as `userId:letterId`, for boot reconciliation of the denormalised flag. */
  async letterFavoriteKeys(): Promise<Set<string>> {
    const rows = await this.prisma.favorite.findMany({
      where: { targetType: 'letter' },
      select: { userId: true, targetId: true },
    });
    return new Set(rows.map((row) => `${row.userId}:${row.targetId}`));
  }

  /** Recomputes the denormalised counters a favourite row owns, after the row changed. */
  private async afterWrite(userId: string, targetType: FavoriteTargetType, targetId: string) {
    if (targetType === 'post') {
      await this.prisma.$executeRaw`
        UPDATE "Post"
        SET "favoriteCount" = (
          SELECT count(*) FROM "Favorite"
          WHERE "targetType" = 'post' AND "targetId" = ${targetId}
        )
        WHERE id = ${targetId}
      `;
      return;
    }
    if (targetType === 'letter') {
      const stillFavorited = await this.prisma.favorite.findFirst({
        where: { userId, targetType: 'letter', targetId },
        select: { id: true },
      });
      await this.prisma.letter.updateMany({
        where: { id: targetId, userId },
        data: { favorite: Boolean(stillFavorited) },
      });
    }
  }

  /**
   * Boot reconciliation for the denormalised columns. The legacy boot recomputed them from the
   * in-memory array, which will no longer hold favourites; these two statements recompute the same
   * values from the table instead.
   */
  async reconcileCounters(): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "Post"
      SET "favoriteCount" = counts.total
      FROM (
        SELECT "targetId", count(*)::int AS total
        FROM "Favorite"
        WHERE "targetType" = 'post'
        GROUP BY "targetId"
      ) AS counts
      WHERE "Post".id = counts."targetId"
    `;
    await this.prisma.$executeRaw`
      UPDATE "Post"
      SET "favoriteCount" = 0
      WHERE "favoriteCount" <> 0
        AND NOT EXISTS (
          SELECT 1 FROM "Favorite"
          WHERE "targetType" = 'post' AND "Favorite"."targetId" = "Post".id
        )
    `;
    await this.prisma.$executeRaw`
      UPDATE "Letter"
      SET favorite = EXISTS (
        SELECT 1 FROM "Favorite"
        WHERE "Favorite"."userId" = "Letter"."userId"
          AND "targetType" = 'letter'
          AND "Favorite"."targetId" = "Letter".id
      )
    `;
  }
}
