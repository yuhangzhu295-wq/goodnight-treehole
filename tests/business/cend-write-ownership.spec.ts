import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApiTestApp, loginAdmin, identityFor } from './helpers';
import { StoreService } from '../../apps/api/src/store.service';

/**
 * Ownership of records the C-end creates.
 *
 * The defect this covers: `createMood` resolved its owner with `getDemoUserId()`, a fixed string,
 * and never consulted the request identity. A mood created by an anonymous session was therefore
 * stored under `user_demo`. Because the read side is per-user, the consequence was that the person
 * who wrote the mood could not see it in their own diary list while the demo account could - the
 * request returned 201 and the record was lost to its author.
 *
 * These assertions are written so that restoring the old behaviour makes them fail, rather than so
 * that they merely pass: each one names a user and states which of them should see the record.
 */
describe('C-end write ownership follows the caller, not a fixed demo id', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: any;
  let adminToken: string;
  const owner = 'user_demo';
  const other = 'user_guest';
  const marker = `write-ownership-${Date.now()}`;

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    server = app.getHttpServer();
    adminToken = await loginAdmin(server);
    for (const id of [owner, other]) {
      await prisma.user.upsert({
        where: { id },
        create: { id, openid: `openid_${id}`, anonymousCode: `anon_${id}`, nickname: `测试用户 ${id}` },
        update: {},
      });
    }
  });

  afterAll(async () => {
    // Only the rows this spec created, identified by its own marker, and in foreign-key order.
    // Reply, HugAction and HiddenPost all reference Post, so the post cannot go first.
    const posts = await prisma.post.findMany({
      where: { content: { startsWith: marker } },
      select: { id: true },
    });
    const postIds = posts.map((post) => post.id);
    await prisma.reply.deleteMany({ where: { postId: { in: postIds } } });
    await prisma.hugAction.deleteMany({ where: { postId: { in: postIds } } });
    await prisma.hiddenPost.deleteMany({ where: { postId: { in: postIds } } });
    await prisma.post.deleteMany({ where: { id: { in: postIds } } });
    await prisma.diary.deleteMany({ where: { content: { startsWith: marker } } });
    await prisma.mood.deleteMany({ where: { content: { startsWith: marker } } });
    await prisma?.$disconnect();
    await app.close();
  });

  async function diariesVisibleTo(userId: string, content: string) {
    const res = await request(server)
      .get('/api/v1/diaries')
      .set('x-goodnight-user-id', await identityFor(userId))
      .expect(200);
    return (res.body.items ?? []).some((item: any) => item.content === content);
  }

  it('files a mood under the identity that created it, and shows it back to that identity', async () => {
    const content = `${marker}-private`;
    await request(server)
      .post('/api/v1/moods')
      .set('x-goodnight-user-id', await identityFor(other))
      .send({ content, emotion: 'anxious', visibility: 'PRIVATE' })
      .expect(201);

    // The database decides ownership; the response is not the thing under test.
    const row = await prisma.mood.findFirst({ where: { content } });
    expect(row?.userId).toBe(other);

    // The part that was broken: the author can read their own record back.
    expect(await diariesVisibleTo(other, content)).toBe(true);
    // And the other user cannot.
    expect(await diariesVisibleTo(owner, content)).toBe(false);
  });

  it('refuses a mood with no identity rather than choosing an owner for it', async () => {
    await request(server)
      .post('/api/v1/moods')
      .send({ content: `${marker}-anonymous`, emotion: 'calm', visibility: 'PRIVATE' })
      .expect(401);

    const row = await prisma.mood.findFirst({ where: { content: `${marker}-anonymous` } });
    expect(row).toBeNull();
  });

  /**
   * The guard lives in the store, so it is tested there too. A route-level check alone would let the
   * service-level one be removed without any test going red, which is how the demo fallback survived
   * the first pass over these routes.
   */
  it('the store itself refuses to file a mood for a caller with no identity', async () => {
    const store = app.get(StoreService);
    await expect(
      store.createMood({ content: `${marker}-service`, emotion: 'calm', visibility: 'PRIVATE' } as any),
    ).rejects.toThrow(/身份/);
    const row = await prisma.mood.findFirst({ where: { content: `${marker}-service` } });
    expect(row).toBeNull();
  });

  it('hides a post only for the user who asked', async () => {
    const content = `${marker}-hide`;
    const created = await request(server)
      .post('/api/v1/moods')
      .set('x-goodnight-user-id', await identityFor(owner))
      .send({ content, emotion: 'work', visibility: 'PUBLIC' })
      .expect(201);
    const postId = created.body.post.id;
    await request(server)
      .patch(`/api/admin/v1/posts/${postId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'approve' })
      .expect(200);

    const visibleTo = async (userId: string) => {
      const res = await request(server)
        .get('/api/v1/posts')
        .set('x-goodnight-user-id', await identityFor(userId))
        .expect(200);
      return (res.body.items ?? []).some((item: any) => item.id === postId);
    };

    expect(await visibleTo(owner)).toBe(true);
    expect(await visibleTo(other)).toBe(true);

    await request(server)
      .post(`/api/v1/posts/${postId}/hide`)
      .set('x-goodnight-user-id', await identityFor(other))
      .expect(201);

    // Hiding was previously global: the write landed on the demo account and the feed read the same
    // constant back, so one user's "not interested" removed the post for everybody.
    expect(await visibleTo(other)).toBe(false);
    expect(await visibleTo(owner)).toBe(true);
  });

  it('reports favourited state for the caller, not for the demo account', async () => {
    const content = `${marker}-favorite`;
    const created = await request(server)
      .post('/api/v1/moods')
      .set('x-goodnight-user-id', await identityFor(owner))
      .send({ content, emotion: 'work', visibility: 'PUBLIC' })
      .expect(201);
    const postId = created.body.post.id;
    await request(server)
      .patch(`/api/admin/v1/posts/${postId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'approve' })
      .expect(200);

    const favoritedFor = async (userId: string) => {
      const res = await request(server)
        .get('/api/v1/posts')
        .set('x-goodnight-user-id', await identityFor(userId))
        .expect(200);
      const item = (res.body.items ?? []).find((post: any) => post.id === postId);
      return Boolean(item?.favoritedByCurrentUser);
    };

    await request(server)
      .post(`/api/v1/posts/${postId}/favorite`)
      .set('x-goodnight-user-id', await identityFor(other))
      .expect(201);

    expect(await favoritedFor(other)).toBe(true);
    expect(await favoritedFor(owner)).toBe(false);

    await request(server)
      .delete(`/api/v1/posts/${postId}/favorite`)
      .set('x-goodnight-user-id', await identityFor(other))
      .expect(200);
  });
});
