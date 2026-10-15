import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApiTestApp, loginAdmin, identityFor } from './helpers';
import { SelfPersistenceService } from '../../apps/api/src/self-persistence.service';

/**
 * The human-reply gate must read the committed privacy row, not the process cache.
 *
 * The cache is per-process, so a revocation committed by another instance (or by the database
 * directly) is invisible to this process until it happens to read again. If the gate consulted the
 * cache, a revoked owner would still receive replies - an authorization decision made on a stale
 * value. The gate reads the database today; nothing pinned that, so a change back to the cached
 * accessor would not have turned any test red. This is that test.
 *
 * The revocation is written straight to PostgreSQL rather than through the API on purpose: going
 * through the API would update this process's cache and the scenario would not exist.
 */
describe('the human-reply gate reads the committed privacy row', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: any;
  let adminToken: string;
  let privacy: SelfPersistenceService;
  let ownerCred: string;
  let replierCred: string;
  const owner = 'user_demo';
  const replier = 'user_guest';
  const marker = `privacy-gate-${Date.now()}`;

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    server = app.getHttpServer();
    adminToken = await loginAdmin(server);
    privacy = app.get(SelfPersistenceService);
    for (const id of [owner, replier]) {
      await prisma.user.upsert({
        where: { id },
        create: { id, openid: `openid_${id}`, anonymousCode: `anon_${id}`, nickname: `测试用户 ${id}` },
        update: {},
      });
    }
    // Resolved once: a credential is issued asynchronously, and putting the promise itself in a
    // header would send "[object Promise]" and be refused for the wrong reason.
    ownerCred = await identityFor(owner);
    replierCred = await identityFor(replier);
  });

  afterAll(async () => {
    // Walk the foreign keys in the direction they point: the post references the mood, so the mood
    // cannot be deleted first.
    const moods = await prisma.mood.findMany({ where: { content: { startsWith: marker } }, select: { id: true } });
    const posts = await prisma.post.findMany({
      where: { moodId: { in: moods.map((mood) => mood.id) } },
      select: { id: true },
    });
    const postIds = posts.map((post) => post.id);
    await prisma.reply.deleteMany({ where: { postId: { in: postIds } } });
    await prisma.hugAction.deleteMany({ where: { postId: { in: postIds } } });
    await prisma.hiddenPost.deleteMany({ where: { postId: { in: postIds } } });
    await prisma.post.deleteMany({ where: { id: { in: postIds } } });
    await prisma.diary.deleteMany({ where: { content: { startsWith: marker } } });
    await prisma.mood.deleteMany({ where: { id: { in: moods.map((mood) => mood.id) } } });
    await prisma?.$disconnect();
    await app.close();
  });

  async function setOwnerConsent(allow: boolean) {
    await prisma.privacySetting.upsert({
      where: { userId: owner },
      create: { userId: owner, allowHumanReplies: allow },
      update: { allowHumanReplies: allow },
    });
  }

  async function publishedPost(content: string) {
    const created = await request(server)
      .post('/api/v1/moods')
      .set('x-goodnight-user-id', ownerCred)
      .send({ content, emotion: 'work', visibility: 'PUBLIC' })
      .expect(201);
    const postId = created.body.post.id as string;
    await request(server)
      .patch(`/api/admin/v1/posts/${postId}/moderation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'approve' })
      .expect(200);
    return postId;
  }

  function replyAsReplier(postId: string, content: string) {
    // The body is not incidental: createReply refuses an empty one with 404 before the gate is
    // reached, so omitting it makes the "allowed" half fail for a reason unrelated to privacy.
    return request(server)
      .post(`/api/v1/posts/${postId}/replies`)
      .set('x-goodnight-user-id', replierCred)
      .send({ content });
  }

  it('refuses after a revocation committed behind this process, and allows again when consent returns', async () => {
    const postId = await publishedPost(`${marker}-consent`);

    // Consent on. Read it once so this process's cache holds `true` - that is the stale value the
    // gate must not trust once the row changes underneath it.
    await setOwnerConsent(true);
    await privacy.getPrivacySettings(owner);
    expect(privacy.getCachedPrivacySettings(owner).allowHumanReplies).toBe(true);

    // Revoke directly in the database: the cache in this process is not touched.
    await prisma.privacySetting.update({ where: { userId: owner }, data: { allowHumanReplies: false } });

    // The instrument has to be honest about the scenario: the cache really is stale here.
    expect(privacy.getCachedPrivacySettings(owner).allowHumanReplies).toBe(true);

    const refused = await replyAsReplier(postId, `${marker} refused reply`).expect(403);
    expect(JSON.stringify(refused.body)).toContain('不允许真人回应');

    // The other direction: with consent restored, the same request succeeds. Without this, a 403
    // caused by something else (visibility, review status, the system setting) would look like a
    // pass.
    await setOwnerConsent(true);
    await replyAsReplier(postId, `${marker} allowed reply`).expect(201);
  });
});
