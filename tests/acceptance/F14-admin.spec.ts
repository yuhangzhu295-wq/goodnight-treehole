import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { auth, createApiTestApp, loginAdmin } from '../business/helpers';
import { createIdentity } from './helpers/identity';
import { FlowEvidence } from './helpers/evidence';

/**
 * F14 - the admin console: minimal disclosure, audited reads, moderation, and the audit trail.
 *
 * The rule this flow protects is that an operator can act without being handed private text. Lists
 * and search return metadata only; the full record is a separate read that writes an audit row in
 * the same request; and the audit row records who and which record but never the content. Moderation
 * actions are audited the same way.
 *
 * The user in this flow is a real anonymous session, not the seeded demo account, so "the admin sees
 * this user's rows" is about the product's own identity path.
 */
describe('F14 admin console', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let evidence: FlowEvidence;
  let server: any;
  let adminToken: string;

  let credential: string;
  let userId: string;
  const secret = `F14-private-${Date.now()}`;

  let memoryId: string;
  let postId: string;

  beforeAll(async () => {
    app = await createApiTestApp();
    server = app.getHttpServer();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    evidence = new FlowEvidence('F14');
    adminToken = await loginAdmin(server);
    const identity = await createIdentity(server, 'F14 user');
    credential = identity.credential;
    userId = identity.userId;
  });

  afterAll(async () => {
    evidence.flush();
    await prisma?.$disconnect();
    await app?.close();
  });

  it('keeps lists metadata-only, audits full reads, and records moderation', async () => {
    // 1. Admin login is a real credential check.
    const wrongPassword = await request(server)
      .post('/api/admin/v1/login')
      .send({ username: 'admin', password: 'not-the-password' });
    evidence.check({
      step: 'admin login refuses a wrong password',
      layer: 'SECURITY_EVIDENCE',
      expected: { status: 401, hasToken: false },
      actual: { status: wrongPassword.status, hasToken: Boolean(wrongPassword.body?.token) },
      request: { method: 'POST', path: '/api/admin/v1/login' },
      response: { status: wrongPassword.status },
    });
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body?.token).toBeUndefined();

    // 2. The user writes a memory with private text and a public post.
    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', credential)
      .send({ allowLongTermMemory: true })
      .expect(200);
    const memory = await request(server)
      .post('/api/v1/memory')
      .set('x-goodnight-user-id', credential)
      .send({ title: 'F14：一条私密记忆', content: `${secret} 我不想让列表把它带出来。`, days: 30 });
    memoryId = memory.body?.item?.id;
    const post = await request(server)
      .post('/api/v1/posts')
      .set('x-goodnight-user-id', credential)
      .send({ content: `F14：需要审核的一条树洞 ${Date.now()}`, emotion: '平静', visibility: 'PUBLIC' });
    postId = post.body?.post?.id;
    evidence.check({
      step: 'the user has a memory and a pending post for the console',
      layer: 'API_EVIDENCE',
      expected: { memoryStatus: 201, postStatus: 201, memoryId: true, postId: true },
      actual: {
        memoryStatus: memory.status,
        postStatus: post.status,
        memoryId: Boolean(memoryId),
        postId: Boolean(postId),
      },
      response: { memoryId, postId },
    });
    expect(memory.status).toBe(201);
    expect(post.status).toBe(201);

    // 3. The list returns metadata only, and search does not run over private text.
    const list = await request(server).get('/api/admin/v1/memory').set('Authorization', auth(adminToken));
    const listed = (list.body?.items ?? []).find((item: any) => item.id === memoryId);
    const searched = await request(server)
      .get(`/api/admin/v1/memory?q=${encodeURIComponent(secret)}`)
      .set('Authorization', auth(adminToken));
    evidence.check({
      step: 'the admin list is metadata-only and search ignores private text',
      layer: 'SECURITY_EVIDENCE',
      expected: {
        listStatus: 200,
        listed: true,
        contentAbsent: true,
        searchMatches: 0,
      },
      actual: {
        listStatus: list.status,
        listed: Boolean(listed),
        contentAbsent: listed ? listed.content === undefined : false,
        searchMatches: (searched.body?.items ?? []).length,
      },
      request: { method: 'GET', path: '/api/admin/v1/memory' },
      response: { listStatus: list.status, searchStatus: searched.status, total: searched.body?.total },
    });
    expect(listed).toBeTruthy();
    expect(listed?.content).toBeUndefined();
    expect((searched.body?.items ?? []).length).toBe(0);

    // 4. The single-record read returns the content and writes an audit row without it.
    const detail = await request(server)
      .get(`/api/admin/v1/memory/${memoryId}`)
      .set('Authorization', auth(adminToken));
    const audit = await prisma.auditLog.findFirst({
      where: { resourceType: 'MemoryItem', resourceId: memoryId, action: 'MEMORY_READ_FULL' },
      orderBy: { createdAt: 'desc' },
    });
    evidence.check({
      step: 'the audited full read returns content and the audit row omits it',
      layer: 'DATABASE_EVIDENCE',
      expected: {
        status: 200,
        contentMatches: true,
        auditWritten: true,
        auditHidesContent: true,
        auditNamesTarget: true,
      },
      actual: {
        status: detail.status,
        contentMatches: detail.body?.item?.content === `${secret} 我不想让列表把它带出来。`,
        auditWritten: Boolean(audit),
        auditHidesContent: audit ? !JSON.stringify(audit).includes(secret) : false,
        auditNamesTarget: (audit?.afterJson as any)?.targetUserId === userId,
      },
      request: { method: 'GET', path: `/api/admin/v1/memory/${memoryId}` },
      response: { status: detail.status },
      sql: `select action, "resourceType", "resourceId" from "AuditLog" where "resourceId" = '${memoryId}'`,
    });
    expect(detail.status).toBe(200);
    expect(detail.body?.item?.content).toContain(secret);
    expect(audit).toBeTruthy();
    expect(JSON.stringify(audit)).not.toContain(secret);

    // 5. Moderation publishes the post and is audited.
    const approved = await request(server)
      .patch(`/api/admin/v1/posts/${postId}/review`)
      .set('Authorization', auth(adminToken))
      .send({ status: 'published' });
    const postRow = await prisma.post.findUnique({ where: { id: postId } });
    const moderationAudit = await prisma.auditLog.findFirst({
      where: { resourceType: 'Post', resourceId: postId, action: 'POST_APPROVE' },
      orderBy: { createdAt: 'desc' },
    });
    evidence.check({
      step: 'moderation publishes the post and writes an audit row',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 200, reviewStatus: 'published', auditWritten: true },
      actual: {
        status: approved.status,
        reviewStatus: postRow?.reviewStatus,
        auditWritten: Boolean(moderationAudit),
      },
      request: { method: 'PATCH', path: `/api/admin/v1/posts/${postId}/review`, body: { status: 'published' } },
      response: { status: approved.status },
      sql: `select "reviewStatus" from "Post" where id = '${postId}'; select action from "AuditLog" where "resourceId" = '${postId}'`,
    });
    expect(approved.status).toBe(200);
    expect(postRow?.reviewStatus).toBe('published');
    expect(moderationAudit).toBeTruthy();

    // 6. The audit list is readable by the admin and closed to everyone else.
    const auditList = await request(server).get('/api/admin/v1/audit-logs').set('Authorization', auth(adminToken));
    const asUser = await request(server).get('/api/admin/v1/audit-logs').set('x-goodnight-user-id', credential);
    const anonymous = await request(server).get('/api/admin/v1/audit-logs');
    evidence.check({
      step: 'the audit list is admin-only',
      layer: 'SECURITY_EVIDENCE',
      expected: {
        adminStatus: 200,
        containsRead: true,
        containsModeration: true,
        userStatus: 401,
        anonymousStatus: 401,
      },
      actual: {
        adminStatus: auditList.status,
        containsRead: (auditList.body?.items ?? []).some((item: any) => item.resourceId === memoryId),
        containsModeration: (auditList.body?.items ?? []).some((item: any) => item.resourceId === postId),
        userStatus: asUser.status,
        anonymousStatus: anonymous.status,
      },
      request: { method: 'GET', path: '/api/admin/v1/audit-logs' },
      response: { adminStatus: auditList.status, userStatus: asUser.status, anonymousStatus: anonymous.status },
    });
    expect(auditList.status).toBe(200);
    expect((auditList.body?.items ?? []).some((item: any) => item.resourceId === memoryId)).toBe(true);
    expect((auditList.body?.items ?? []).some((item: any) => item.resourceId === postId)).toBe(true);
    expect(asUser.status).toBe(401);
    expect(anonymous.status).toBe(401);
  });
});
