import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaRuntimeService } from './prisma-runtime.service.js';

/**
 * Database authority for `Reply`.
 *
 * Second member of the Post cluster (`BATCH4_LEGACY_FLUSH_RETIREMENT.md` §5d). The coupling that
 * made it unsafe to convert alone is `Post.replyCount`: it was recomputed from the in-memory array
 * on every publish and every moderation, and the AI-reply completion in `createMood` overwrote it
 * with the number of completed AI jobs - dropping any human reply that had been published first.
 * Both are now derived from this table, which fixes that overwrite as a side effect.
 *
 * `Reply` also has a nullable `aiJobId` FK. The AI writers used `reply_<jobId>` as the row id but
 * never set the column; that stays null here, so the FK is not a new requirement on the writers.
 */
export type ReplyTypeValue = 'AI' | 'USER';
export type ReplyStatusValue = 'published' | 'pending_review' | 'blocked';

@Injectable()
export class ReplyPersistenceService {
  constructor(@Inject(PrismaRuntimeService) private readonly prisma: PrismaRuntimeService) {}

  async listPublishedForPost(postId: string) {
    return this.prisma.reply.findMany({
      where: { postId, status: 'published' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listForPost(postId: string) {
    return this.prisma.reply.findMany({
      where: { postId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    return this.prisma.reply.findUnique({ where: { id } });
  }

  async create(input: {
    id?: string;
    postId: string;
    userId?: string | null;
    type: ReplyTypeValue;
    style: string;
    content: string;
    status: ReplyStatusValue;
    riskLevel: string;
    createdAt?: Date;
  }) {
    const data = {
      postId: input.postId,
      userId: input.userId ?? null,
      type: input.type,
      style: input.style,
      content: input.content,
      status: input.status,
      riskLevel: input.riskLevel,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    };
    // A caller-supplied id makes the insert idempotent. Two instances booting against the same
    // database both try to write the same seed reply (`reply_seed_*`), and a retried AI delivery
    // carries the same `reply_<jobId>`; a plain create would fail the second one with P2002.
    const item = input.id
      ? await this.prisma.reply.upsert({
          where: { id: input.id },
          create: { id: input.id, ...data },
          update: {},
        })
      : await this.prisma.reply.create({ data });
    await this.recountPost(input.postId);
    return item;
  }

  async like(id: string) {
    const existing = await this.prisma.reply.findFirst({ where: { id, status: 'published' } });
    if (!existing) throw new NotFoundException('回应不存在');
    return this.prisma.reply.update({ where: { id }, data: { likeCount: { increment: 1 } } });
  }

  async moderate(id: string, action: 'approve' | 'block', content?: string) {
    const existing = await this.prisma.reply.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('回应不存在');
    const item = await this.prisma.reply.update({
      where: { id },
      data: {
        ...(content ? { content } : {}),
        status: action === 'approve' ? 'published' : 'blocked',
      },
    });
    await this.recountPost(existing.postId);
    return item;
  }

  async listForAdmin(filter: { type?: string; status?: string; q?: string }) {
    const needle = filter.q?.trim();
    const typeCondition: Array<Record<string, unknown>> = [];
    if (needle && ['ai', 'user'].includes(needle.toLowerCase())) {
      typeCondition.push({ type: needle.toUpperCase() });
    }
    return this.prisma.reply.findMany({
      where: {
        ...(filter.type && filter.type !== 'all' ? { type: filter.type as ReplyTypeValue } : {}),
        ...(filter.status && filter.status !== 'all' ? { status: filter.status as ReplyStatusValue } : {}),
        ...(needle
          ? {
              OR: [
                { id: { contains: needle, mode: 'insensitive' as const } },
                { postId: { contains: needle, mode: 'insensitive' as const } },
                { content: { contains: needle, mode: 'insensitive' as const } },
                ...typeCondition,
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async countPending(): Promise<number> {
    return this.prisma.reply.count({ where: { status: 'pending_review' } });
  }

  /** `{ 'YYYY-MM-DD': n }` for the window the dashboard renders. */
  async countsByDay(from: Date): Promise<Record<string, number>> {
    const rows = await this.prisma.$queryRaw<Array<{ day: string; n: number }>>`
      SELECT to_char("createdAt", 'YYYY-MM-DD') AS day, count(*)::int AS n
      FROM "Reply"
      WHERE "createdAt" >= ${from}
      GROUP BY 1
    `;
    return Object.fromEntries(rows.map((row) => [row.day, Number(row.n)]));
  }

  async countsForPosts(postIds: string[]): Promise<Map<string, number>> {
    if (!postIds.length) return new Map();
    const grouped = await this.prisma.reply.groupBy({
      by: ['postId'],
      where: { postId: { in: postIds }, status: 'published' },
      _count: { _all: true },
    });
    return new Map(grouped.map((row) => [row.postId, row._count._all]));
  }

  private async recountPost(postId: string) {
    await this.prisma.$executeRaw`
      UPDATE "Post"
      SET "replyCount" = (
        SELECT count(*) FROM "Reply"
        WHERE "postId" = ${postId} AND status = 'published'
      )
      WHERE id = ${postId}
    `;
  }

  /** Boot reconciliation for the denormalised `Post.replyCount`. */
  async reconcileCounts(): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "Post"
      SET "replyCount" = counts.total
      FROM (
        SELECT "postId", count(*)::int AS total
        FROM "Reply"
        WHERE status = 'published'
        GROUP BY "postId"
      ) AS counts
      WHERE "Post".id = counts."postId"
    `;
    await this.prisma.$executeRaw`
      UPDATE "Post"
      SET "replyCount" = 0
      WHERE "replyCount" <> 0
        AND NOT EXISTS (
          SELECT 1 FROM "Reply"
          WHERE "Reply"."postId" = "Post".id AND "Reply".status = 'published'
        )
    `;
  }
}
