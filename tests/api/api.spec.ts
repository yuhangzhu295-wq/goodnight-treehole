import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { AnonymousSessionService } from '../../apps/api/src/anonymous-session.service.js';
import { PrismaRuntimeService } from '../../apps/api/src/prisma-runtime.service.js';
import { assertTestDatabaseUrl, demoUserHeaders } from '../business/helpers.js';

describe('api contracts', () => {
  let app: INestApplication;

  beforeAll(async () => {
    assertTestDatabaseUrl();
    const { createServer } = await import('../../apps/api/src/main.js');
    app = await createServer();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves front APIs and moderation affects visibility', async () => {
    const server = app.getHttpServer();
    const login = await request(server)
      .post('/api/admin/v1/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(201);
    const mood = await request(server)
      .post('/api/v1/moods')
      .set(await demoUserHeaders())
      .send({ content: '公开树洞测试', emotion: '工作', visibility: 'PUBLIC' })
      .expect(201);
    const postId = mood.body.post.id;

    await request(server)
      .get('/api/v1/posts')
      .expect(200)
      .expect((res) => {
        expect(res.body.items.some((post: any) => post.id === postId)).toBe(false);
      });
    await request(server)
      .patch(`/api/admin/v1/posts/${postId}/moderation`)
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ action: 'approve' })
      .expect(200);
    await request(server)
      .get('/api/v1/posts')
      .expect((res) => {
        expect(res.body.items.some((post: any) => post.id === postId)).toBe(true);
      });
  });

  it('front FAQ reads admin-created FAQ', async () => {
    const server = app.getHttpServer();
    const login = await request(server)
      .post('/api/admin/v1/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(201);

    await request(server)
      .post('/api/admin/v1/faqs')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ question: '测试 FAQ？', answer: '来自后台。' })
      .expect(201);
    await request(server)
      .get('/api/v1/feedback/faqs')
      .expect((res) => {
        expect(res.body.items.some((faq: any) => faq.question === '测试 FAQ？')).toBe(true);
      });
  });

  /**
   * UI-V2-29: the profile editor and the session list are the two real actions behind the page.
   * These assertions are the contract the page is allowed to rely on - the nickname must survive a
   * fresh read from the database, and a session revocation must actually cut that credential off.
   */
  it('saves a nickname to the database and serves it back from a fresh read', async () => {
    const server = app.getHttpServer();
    const issued = await request(server).post('/api/v1/auth/anonymous').send({ deviceLabel: 'api spec profile' });
    const credential = issued.body.item.credential as string;
    const userId = issued.body.item.userId as string;

    const before = await request(server).get('/api/v1/me/profile').set('x-goodnight-user-id', credential).expect(200);
    expect(before.body.item.id).toBe(userId);
    expect(before.body.item).not.toHaveProperty('openid');
    expect(before.headers['cache-control']).toContain('no-store');

    const saved = await request(server)
      .patch('/api/v1/me/profile')
      .set('x-goodnight-user-id', credential)
      .send({ nickname: '夜行旅人' })
      .expect(200);
    expect(saved.body.item.nickname).toBe('夜行旅人');

    // The row, not a cached object: this is what another instance reads.
    const prisma = app.get(PrismaRuntimeService);
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } });
    expect(row?.nickname).toBe('夜行旅人');

    const after = await request(server).get('/api/v1/me/profile').set('x-goodnight-user-id', credential).expect(200);
    expect(after.body.item.nickname).toBe('夜行旅人');
  });

  it('refuses an invalid nickname and never writes a partial profile', async () => {
    const server = app.getHttpServer();
    const issued = await request(server).post('/api/v1/auth/anonymous').send({ deviceLabel: 'api spec invalid' });
    const credential = issued.body.item.credential as string;
    const userId = issued.body.item.userId as string;
    const prisma = app.get(PrismaRuntimeService);
    const original = (await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } }))?.nickname;

    for (const body of [
      { nickname: '' },
      { nickname: '   ' },
      { nickname: '一二三四五六七八九十一二三四五六七八九十一' },
      { nickname: '换\n行' },
      { nickname: '\n昵称' },
      { nickname: '昵\u2028称' },
      { nickname: '昵\u061C称' },
      { nickname: '昵\u00AD称' },
      { nickname: '昵\u034F称' },
      { nickname: '隐藏\u202E字符' },
      { nickname: 123 },
      { nickname: '正常', userId: 'user_someone_else' },
      { userId: 'user_someone_else' },
    ]) {
      await request(server).patch('/api/v1/me/profile').set('x-goodnight-user-id', credential).send(body).expect(400);
    }

    const row = await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } });
    expect(row?.nickname).toBe(original);
  });

  it('refuses a nickname change for a restricted account', async () => {
    const server = app.getHttpServer();
    const issued = await request(server).post('/api/v1/auth/anonymous').send({ deviceLabel: 'api spec limited' });
    const credential = issued.body.item.credential as string;
    const userId = issued.body.item.userId as string;
    const prisma = app.get(PrismaRuntimeService);
    const before = (await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } }))?.nickname;

    // The status check must be part of the write condition, so a ban that lands first still wins.
    await prisma.user.update({ where: { id: userId }, data: { status: 'limited' } });
    await request(server)
      .patch('/api/v1/me/profile')
      .set('x-goodnight-user-id', credential)
      .send({ nickname: '受限账号' })
      .expect(403);

    const after = await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } });
    expect(after?.nickname).toBe(before);
  });

  it('requires a session credential for the profile and the session list', async () => {
    const server = app.getHttpServer();
    const issued = await request(server).post('/api/v1/auth/anonymous').send({ deviceLabel: 'api spec auth' });
    const userId = issued.body.item.userId as string;

    await request(server).get('/api/v1/me/profile').expect(401);
    await request(server).get('/api/v1/me/profile').set('x-goodnight-user-id', userId).expect(401);
    await request(server).patch('/api/v1/me/profile').send({ nickname: '冒充' }).expect(401);
    await request(server).get('/api/v1/auth/sessions').set('x-goodnight-user-id', userId).expect(401);
    await request(server).post('/api/v1/auth/sessions/anything/revoke').expect(401);
  });

  it('lists only the caller sessions, marks the current one, and refuses to revoke it', async () => {
    const server = app.getHttpServer();
    const sessions = app.get(AnonymousSessionService);
    const issued = await request(server).post('/api/v1/auth/anonymous').send({ deviceLabel: 'api spec sessions' });
    const credential = issued.body.item.credential as string;
    const userId = issued.body.item.userId as string;
    const currentSessionId = credential.split('.')[0];

    // A second live session for the same person, issued by the service rather than by a test route.
    const second = await sessions.issue(userId, { deviceLabel: 'second session' });

    const listed = await request(server).get('/api/v1/auth/sessions').set('x-goodnight-user-id', credential).expect(200);
    expect(listed.headers['cache-control']).toContain('no-store');
    expect(listed.body.items).toHaveLength(2);
    expect(listed.body.items.filter((item: any) => item.current)).toHaveLength(1);
    expect(listed.body.items.find((item: any) => item.current).id).toBe(currentSessionId);
    for (const item of listed.body.items) {
      expect(item).not.toHaveProperty('secretHash');
      expect(item).not.toHaveProperty('deviceId');
    }

    await request(server)
      .post(`/api/v1/auth/sessions/${currentSessionId}/revoke`)
      .set('x-goodnight-user-id', credential)
      .expect(409);

    const revoked = await request(server)
      .post(`/api/v1/auth/sessions/${second.sessionId}/revoke`)
      .set('x-goodnight-user-id', credential)
      .expect(201);
    expect(revoked.body.revoked).toBe(1);

    // The revoked credential is dead; the one that revoked it still works.
    await request(server).get('/api/v1/me/profile').set('x-goodnight-user-id', second.credential).expect(401);
    await request(server).get('/api/v1/me/profile').set('x-goodnight-user-id', credential).expect(200);

    // A repeated revocation is not a second success.
    await request(server)
      .post(`/api/v1/auth/sessions/${second.sessionId}/revoke`)
      .set('x-goodnight-user-id', credential)
      .expect(404);
  });

  it('answers another user session id exactly like an unknown one', async () => {
    const server = app.getHttpServer();
    const alice = await request(server).post('/api/v1/auth/anonymous').send({ deviceLabel: 'api spec alice' });
    const bob = await request(server).post('/api/v1/auth/anonymous').send({ deviceLabel: 'api spec bob' });
    const aliceCredential = alice.body.item.credential as string;
    const bobCredential = bob.body.item.credential as string;
    const bobSessionId = bobCredential.split('.')[0];

    await request(server)
      .post(`/api/v1/auth/sessions/${bobSessionId}/revoke`)
      .set('x-goodnight-user-id', aliceCredential)
      .expect(404);
    await request(server)
      .post('/api/v1/auth/sessions/session_that_does_not_exist/revoke')
      .set('x-goodnight-user-id', aliceCredential)
      .expect(404);

    // Bob's session was not touched by Alice's attempt.
    await request(server).get('/api/v1/me/profile').set('x-goodnight-user-id', bobCredential).expect(200);
  });
});
