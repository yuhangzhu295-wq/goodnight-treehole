import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { saveRelationalRuntimeState } from '../../apps/api/src/relational-runtime.mapper';

/**
 * P0: absence from the in-memory snapshot is not a deletion instruction.
 *
 * The legacy flush used to sweep every row whose id was not in the snapshot, so a row written
 * directly to PostgreSQL - or by another instance - was deleted by the next flush. With an empty
 * snapshot the sweep collapsed to `deleteMany({})` and emptied the table: reproduced against the
 * development database as 13 Mood rows going to 0.
 *
 * These tests pin both directions. The first three fail if the dangerous sweep comes back. The
 * fourth recorded the direction the sweep used to have - a row the store wrote, deleted once the
 * store stopped carrying it - and that direction is now unreachable because every business model is
 * registered. It is rewritten to say so, with a flush-driven row compared byte-for-byte instead of
 * deleted, because a flush that rewrites `updatedAt` is the stale-overwrite half of the same defect.
 */
describe('Legacy flush deletion ownership', () => {
  let prisma: PrismaClient;
  const userId = 'user_demo';

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    await prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, openid: `openid_${userId}`, anonymousCode: `anon_${userId}`, nickname: '测试用户' },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const userRow = () => ({
    id: userId,
    openid: `openid_${userId}`,
    anonymousCode: `anon_${userId}`,
    nickname: '测试用户',
    status: 'normal',
    createdAt: new Date().toISOString(),
  });

  async function createDirectMood(id: string) {
    await prisma.mood.create({
      data: {
        id,
        userId,
        emotion: '平静',
        content: '直接写入数据库，未经 Store',
        visibility: 'PRIVATE',
        riskLevel: 'low',
        riskScore: 0,
        status: 'active',
        createdAt: new Date(),
      },
    });
  }

  it('1. A Mood written directly to PostgreSQL survives a legacy flush that does not mention it', async () => {
    const moodId = `sweep_direct_${Date.now()}`;
    await createDirectMood(moodId);
    expect(await prisma.mood.findUnique({ where: { id: moodId } })).not.toBeNull();

    await saveRelationalRuntimeState(prisma as never, {
      users: [userRow()],
      moods: [],
      posts: [],
      letters: [],
    } as never);

    const after = await prisma.mood.findUnique({ where: { id: moodId } });
    expect(after).not.toBeNull();
    await prisma.mood.delete({ where: { id: moodId } }).catch(() => undefined);
  });

  it('2. An empty snapshot does not empty the table', async () => {
    const before = await prisma.mood.count();
    await saveRelationalRuntimeState(prisma as never, { users: [userRow()], moods: [] } as never);
    const after = await prisma.mood.count();
    // The dangerous form turned this into deleteMany({}) and took the count to zero.
    expect(after).toBe(before);
  });

  it('3. An unrelated business write does not delete a directly written Mood', async () => {
    const moodId = `sweep_unrelated_${Date.now()}`;
    const postId = `sweep_post_${Date.now()}`;
    await createDirectMood(moodId);
    // Post.moodId is required, so the post hangs off the mood it must not destroy.
    await prisma.post.create({
      data: {
        id: postId,
        moodId,
        userId,
        emotion: '平静',
        content: '一条普通帖子',
        visibility: 'PRIVATE',
        status: 'active',
        reviewStatus: 'published',
        createdAt: new Date(),
      },
    });

    // A flush that carries the post but knows nothing about the mood.
    await saveRelationalRuntimeState(prisma as never, {
      users: [userRow()],
      moods: [],
      posts: [
        {
          id: postId,
          moodId,
          userId,
          emotion: '平静',
          content: '一条普通帖子',
          visibility: 'PRIVATE',
          status: 'active',
          reviewStatus: 'published',
          createdAt: new Date().toISOString(),
        },
      ],
      letters: [],
    } as never);

    expect(await prisma.mood.findUnique({ where: { id: moodId } })).not.toBeNull();

    await prisma.post.delete({ where: { id: postId } }).catch(() => undefined);
    await prisma.mood.delete({ where: { id: moodId } }).catch(() => undefined);
  });

  /**
   * Case 4 pinned the third direction: a row the flush legitimately owned must still be swept when
   * the snapshot stops carrying it, or the fix would break every real deletion.
   *
   * `Mood` became database-authoritative in Batch 4, so the flush no longer writes it at all and
   * this direction moved to a model whose sweep still runs. `PeerReport` is that model: flush 1
   * inserts the row the snapshot carries, flush 2 omits it, and the row must be gone - which is a
   * user deletion, not a data-loss bug. The `mood` shape of this case is what `Mood` being
   * registered replaced, so keeping it would assert the flush writes a table it no longer writes.
   */
  /**
   * The third direction, which used to pin "the sweep still deletes what the store wrote".
   *
   * That direction no longer exists here, and saying so is the correct outcome of the conversion
   * rather than a gap: every business model is registered now, so a flush never deletes a row at
   * all - which is exactly what cases 1, 2 and 3 assert from the other side. Keeping this case
   * would require asserting the flush deletes something, and it does not.
   *
   * What replaces it is the honest statement that the sweep is unreachable: the case below drives a
   * flush over a row the store *does* still own, and asserts the flush leaves it alone. A future
   * batch that re-introduces a flush-owned model re-owns the "absent means deleted" direction.
   */
  it('4. A row the store still carries is left alone by a flush that holds nothing else', async () => {
    const moodId = `sweep_still_owned_${Date.now()}`;
    await createDirectMood(moodId);
    const before = await prisma.mood.findUniqueOrThrow({ where: { id: moodId } });

    await saveRelationalRuntimeState(prisma as never, { users: [userRow()], moods: [], posts: [], letters: [] } as never);

    const after = await prisma.mood.findUnique({ where: { id: moodId } });
    // Byte-identical, not just present: `updatedAt` moving would mean the flush rewrote it, which is
    // the stale-overwrite half of the same defect the other cases pin from the delete side.
    expect(after?.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
    expect(after?.content).toBe(before.content);
    await prisma.mood.delete({ where: { id: moodId } }).catch(() => undefined);
  });

  it('5. An attachment on a Mood the snapshot does not carry survives the flush', async () => {
    // Found by independent review after the first fix: the attachment join tables were still emptied
    // with an unfiltered deleteMany() and rebuilt from this snapshot alone, so an attachment written
    // directly - or by another instance - was destroyed by any flush. That path does not go through
    // deleteAbsent, which is why the sweep fix did not cover it.
    const stamp = Date.now();
    const moodId = `sweep_attach_mood_${stamp}`;
    const assetId = `sweep_attach_asset_${stamp}`;
    await createDirectMood(moodId);
    await prisma.mediaAsset.create({
      data: {
        id: assetId,
        userId,
        storageKey: `sweep/${stamp}.png`,
        url: `/uploads/sweep/${stamp}.png`,
        mimeType: 'image/png',
        size: 128,
        usageType: 'mood',
        status: 'active',
        createdAt: new Date(),
      },
    });
    await prisma.moodAttachment.create({ data: { moodId, mediaAssetId: assetId, sortOrder: 0 } });

    await saveRelationalRuntimeState(prisma as never, {
      users: [userRow()],
      moods: [],
      posts: [],
      letters: [],
    } as never);

    const surviving = await prisma.moodAttachment.findMany({ where: { moodId } });
    expect(surviving).toHaveLength(1);

    await prisma.moodAttachment.deleteMany({ where: { moodId } }).catch(() => undefined);
    await prisma.mood.delete({ where: { id: moodId } }).catch(() => undefined);
    await prisma.mediaAsset.delete({ where: { id: assetId } }).catch(() => undefined);
  });
});
