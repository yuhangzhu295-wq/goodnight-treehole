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

  /**
   * UI-V2-35: a favourite outlives a soft-deleted post. Serving it anyway showed the original text
   * and then a 404 on tap, so the list must drop the row instead of advertising an unopenable item.
   */
  it('drops a favourite whose post was deleted instead of serving unopenable text', async () => {
    const server = app.getHttpServer();
    const mood = await request(server)
      .post('/api/v1/moods')
      .set(await demoUserHeaders())
      .send({ content: '收藏后删除的树洞', emotion: '工作', visibility: 'PUBLIC' })
      .expect(201);
    const postId = mood.body.post.id as string;

    await request(server).post(`/api/v1/posts/${postId}/favorite`).set(await demoUserHeaders()).expect(201);
    const before = await request(server).get('/api/v1/favorites').set(await demoUserHeaders()).expect(200);
    expect(before.body.items.find((item: any) => item.targetId === postId)).toMatchObject({
      targetId: postId,
      preview: '收藏后删除的树洞',
    });

    await request(server).delete(`/api/v1/posts/${postId}`).set(await demoUserHeaders()).expect(200);
    const after = await request(server).get('/api/v1/favorites').set(await demoUserHeaders()).expect(200);
    expect(after.body.items.find((item: any) => item.targetId === postId)).toBeUndefined();
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
   * UI-V2-38: the console used to read the in-memory ticket array, which never held a ticket the
   * C-end route wrote. The operator could not see, open, reply to or resolve a real submission.
   * This is the whole loop: submit, list, detail, reply, resolve, and the user's own copy.
   */
  it('carries a C-end feedback ticket through the operator console and back', async () => {
    const server = app.getHttpServer();
    const login = await request(server)
      .post('/api/admin/v1/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(201);
    const admin = { Authorization: `Bearer ${login.body.token}` };
    const issued = await request(server)
      .post('/api/v1/auth/anonymous')
      .send({ deviceLabel: 'api spec feedback' })
      .expect(201);
    const user = { 'x-goodnight-user-id': issued.body.item.credential as string };

    const text = `api 反馈-${Date.now()}`;
    const created = await request(server)
      .post('/api/v1/feedback')
      .set(user)
      .send({ content: text, sourcePage: '/pages/help/feedback' })
      .expect(201);
    const ticketId = created.body.item.id as string;
    expect(ticketId).toBeTruthy();

    const listed = await request(server).get('/api/admin/v1/feedback/tickets').set(admin).expect(200);
    expect(listed.body.items.find((ticket: any) => ticket.id === ticketId)).toMatchObject({
      id: ticketId,
      content: text,
      status: 'open',
    });

    const detail = await request(server)
      .get(`/api/admin/v1/feedback/tickets/${ticketId}`)
      .set(admin)
      .expect(200);
    expect(detail.body.item).toMatchObject({ id: ticketId, content: text });

    const reply = `已收到-${Date.now()}`;
    const replied = await request(server)
      .post(`/api/admin/v1/feedback/tickets/${ticketId}/reply`)
      .set(admin)
      .send({ reply })
      .expect(201);
    expect(replied.body.item).toMatchObject({ id: ticketId, status: 'processing', reply });

    const resolved = await request(server)
      .patch(`/api/admin/v1/feedback/tickets/${ticketId}/status`)
      .set(admin)
      .send({ status: 'resolved' })
      .expect(200);
    expect(resolved.body.item).toMatchObject({ id: ticketId, status: 'resolved', reply });

    // The user's list is the other half of the answer: the reply must be readable where they look.
    const mine = await request(server).get('/api/v1/feedback').set(user).expect(200);
    expect(mine.body.items.find((ticket: any) => ticket.id === ticketId)).toMatchObject({
      id: ticketId,
      status: 'resolved',
      reply,
    });
  });

  /**
   * UI-V2-37: `DELETE /api/v1/me/data` must delete private moods so they cannot be re-projected
   * onto the diary list, and must clean up server-side export files.
   */
  it('clearData completely cleans up private moods and server export downloads', async () => {
    const server = app.getHttpServer();
    const issued = await request(server).post('/api/v1/auth/anonymous').send({ deviceLabel: 'api spec clearData' }).expect(201);
    const user = { 'x-goodnight-user-id': issued.body.item.credential as string };

    // 1. Upload an image and create a private mood with that attachment (projects as a diary)
    const upload = await request(server)
      .post('/api/v1/media/upload')
      .set(user)
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'test.png')
      .field('usageType', 'mood')
      .expect(201);
    const assetId = upload.body.item.id as string;
    const assetUrl = upload.body.item.url as string;

    await request(server)
      .post('/api/v1/moods')
      .set(user)
      .send({ content: '私密心情待删除', emotion: '工作', visibility: 'PRIVATE', assetIds: [assetId] })
      .expect(201);

    // 2. Export diaries (creates server-side export file)
    await request(server).patch('/api/v1/settings/privacy').set(user).send({ allowDataExport: true }).expect(200);
    const exported = await request(server).post('/api/v1/diaries/export').set(user).expect(201);
    const downloadUrl = exported.body.item.downloadUrl as string;
    expect(downloadUrl).toBeTruthy();

    // Verify diary list shows the projected private mood and export file can be read
    const diariesBefore = await request(server).get('/api/v1/diaries').set(user).expect(200);
    expect(diariesBefore.body.items.some((d: any) => d.content === '私密心情待删除')).toBe(true);
    await request(server).get(downloadUrl).set(user).expect(200);
    await request(server).get(assetUrl).expect(200);

    // 3. Clear data
    await request(server).delete('/api/v1/me/data').set(user).expect(200);

    // 4. Verify private mood is gone and diary list is completely empty
    const diariesAfter = await request(server).get('/api/v1/diaries').set(user).expect(200);
    expect(diariesAfter.body.items).toHaveLength(0);

    // 5. Verify server export download and deleted attachment file return 404
    await request(server).get(downloadUrl).set(user).expect(404);
    await request(server).get(assetUrl).expect(404);
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
      { nickname: '昵\u115F称' },
      { nickname: '昵\u17B4称' },
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

  it('persists letter read and like, and filters by read status', async () => {
    const server = app.getHttpServer();
    const issued = await request(server).post('/api/v1/auth/anonymous').send({ deviceLabel: 'api spec letters' });
    const credential = issued.body.item.credential as string;
    const userId = issued.body.item.userId as string;
    const other = await request(server).post('/api/v1/auth/anonymous').send({ deviceLabel: 'api spec letters b' });
    const otherCredential = other.body.item.credential as string;
    const prisma = app.get(PrismaRuntimeService);
    const letter = await prisma.letter.create({
      data: { userId, title: '测试回信', content: '正文', style: 'warm', status: 'unread' },
    });

    const unread = await request(server).get('/api/v1/letters?status=unread').set('x-goodnight-user-id', credential).expect(200);
    expect(unread.body.items.some((item: any) => item.id === letter.id)).toBe(true);
    const readBefore = await request(server).get('/api/v1/letters?status=read').set('x-goodnight-user-id', credential).expect(200);
    expect(readBefore.body.items.some((item: any) => item.id === letter.id)).toBe(false);

    // The read state must be a database write, not a snapshot mutation.
    await request(server).patch(`/api/v1/letters/${letter.id}/read`).set('x-goodnight-user-id', credential).expect(200);
    const rowAfterRead = await prisma.letter.findUnique({ where: { id: letter.id }, select: { status: true } });
    expect(rowAfterRead?.status).toBe('read');
    const readAfter = await request(server).get('/api/v1/letters?status=read').set('x-goodnight-user-id', credential).expect(200);
    expect(readAfter.body.items.some((item: any) => item.id === letter.id)).toBe(true);

    // The like is an increment, persisted.
    await request(server).post(`/api/v1/letters/${letter.id}/like`).set('x-goodnight-user-id', credential).expect(201);
    await request(server).post(`/api/v1/letters/${letter.id}/like`).set('x-goodnight-user-id', credential).expect(201);
    const rowAfterLike = await prisma.letter.findUnique({ where: { id: letter.id }, select: { likeCount: true } });
    expect(rowAfterLike?.likeCount).toBe(2);

    // Another user cannot see or mutate this letter.
    await request(server).patch(`/api/v1/letters/${letter.id}/read`).set('x-goodnight-user-id', otherCredential).expect(404);
    await request(server).post(`/api/v1/letters/${letter.id}/like`).set('x-goodnight-user-id', otherCredential).expect(404);
    const otherList = await request(server).get('/api/v1/letters').set('x-goodnight-user-id', otherCredential).expect(200);
    expect(otherList.body.items.some((item: any) => item.id === letter.id)).toBe(false);

    // An unknown filter is a client error, not "the whole inbox".
    await request(server).get('/api/v1/letters?status=typo').set('x-goodnight-user-id', credential).expect(400);
  });

  it('persists the tool result attached to a diary', async () => {
    const server = app.getHttpServer();
    const issued = await request(server).post('/api/v1/auth/anonymous').send({ deviceLabel: 'api spec tool result' });
    const credential = issued.body.item.credential as string;
    const toolResult = {
      triggerEvent: '明天要汇报',
      coreEmotions: ['紧张'],
      realNeeds: ['确定感'],
      nextSmallStep: '先写三行提纲',
      advice: ['写三行提纲', '读一遍并标出卡住的地方'],
    };

    const created = await request(server)
      .post('/api/v1/diaries')
      .set('x-goodnight-user-id', credential)
      .send({ content: '拆解后保存', emotion: '焦虑', source: 'emotion-analysis', toolResult })
      .expect(201);

    // The row, not just the response: the page says 已保存到日记, so the breakdown must be there.
    const prisma = app.get(PrismaRuntimeService);
    const row = await prisma.diary.findUnique({
      where: { id: created.body.item.id },
      select: { toolResult: true },
    });
    expect(row?.toolResult).toEqual(toolResult);
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
