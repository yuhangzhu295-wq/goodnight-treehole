import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { auth, createApiTestApp, loginAdmin } from '../business/helpers';
import { createIdentity } from './helpers/identity';
import { FlowEvidence } from './helpers/evidence';

/**
 * F12 - a community post through moderation, a human reply through moderation, and the counters.
 *
 * Every public post is written as `pending_review` on purpose; the feed shows only `published`. The
 * same is true of human replies. This flow checks that ordering from both sides - absent before the
 * operator acts, present after - and that the counters follow the published rows rather than the
 * act of writing.
 *
 * The hug counter is checked for idempotence: the same user tapping twice must not add a second hug.
 */
describe('F12 community post', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let evidence: FlowEvidence;
  let server: any;
  let adminToken: string;

  let authorCredential: string;
  let authorUserId: string;
  let readerCredential: string;
  let strangerCredential: string;

  let postId: string;
  let replyId: string;
  const marker = `F12-${Date.now()}`;

  beforeAll(async () => {
    app = await createApiTestApp();
    server = app.getHttpServer();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    evidence = new FlowEvidence('F12');
    adminToken = await loginAdmin(server);
    const author = await createIdentity(server, 'F12 author');
    authorCredential = author.credential;
    authorUserId = author.userId;
    readerCredential = (await createIdentity(server, 'F12 reader')).credential;
    strangerCredential = (await createIdentity(server, 'F12 stranger')).credential;
  });

  afterAll(async () => {
    evidence.flush();
    await prisma?.$disconnect();
    await app?.close();
  });

  it('publishes only after moderation and keeps replies and counters attached', async () => {
    // 1. A public post is written as pending_review and is not in the feed.
    const created = await request(server)
      .post('/api/v1/posts')
      .set('x-goodnight-user-id', authorCredential)
      .send({ content: `${marker} 今天想说的是，慢一点也没关系。`, emotion: '平静', visibility: 'PUBLIC' });
    postId = created.body?.post?.id;
    const feedBefore = await request(server).get('/api/v1/posts');
    const postRow = postId ? await prisma.post.findUnique({ where: { id: postId } }) : null;
    evidence.check({
      step: 'a public post starts pending review and stays out of the feed',
      layer: 'DATABASE_EVIDENCE',
      expected: {
        status: 201,
        responseReviewStatus: 'pending_review',
        rowReviewStatus: 'pending_review',
        inFeed: false,
      },
      actual: {
        status: created.status,
        responseReviewStatus: created.body?.reviewStatus,
        rowReviewStatus: postRow?.reviewStatus,
        inFeed: (feedBefore.body?.items ?? []).some((item: any) => item.id === postId),
      },
      request: { method: 'POST', path: '/api/v1/posts', body: { visibility: 'PUBLIC' } },
      response: { status: created.status, postId },
      sql: `select "reviewStatus", status from "Post" where id = '${postId}'`,
    });
    expect(created.status).toBe(201);
    expect(postRow?.reviewStatus).toBe('pending_review');
    expect((feedBefore.body?.items ?? []).some((item: any) => item.id === postId)).toBe(false);

    // 2. The operator publishes it, and only then does it reach the feed.
    const approved = await request(server)
      .patch(`/api/admin/v1/posts/${postId}/review`)
      .set('Authorization', auth(adminToken))
      .send({ status: 'published' });
    const feedAfter = await request(server).get('/api/v1/posts');
    const approvedRow = await prisma.post.findUnique({ where: { id: postId } });
    evidence.check({
      step: 'an operator publishes the post and it appears in the feed',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 200, rowReviewStatus: 'published', inFeed: true },
      actual: {
        status: approved.status,
        rowReviewStatus: approvedRow?.reviewStatus,
        inFeed: (feedAfter.body?.items ?? []).some((item: any) => item.id === postId),
      },
      request: { method: 'PATCH', path: `/api/admin/v1/posts/${postId}/review`, body: { status: 'published' } },
      response: { status: approved.status },
      sql: `select "reviewStatus" from "Post" where id = '${postId}'`,
    });
    expect(approved.status).toBe(200);
    expect(approvedRow?.reviewStatus).toBe('published');
    expect((feedAfter.body?.items ?? []).some((item: any) => item.id === postId)).toBe(true);

    // 3. A human reply is written as pending_review and is not visible yet.
    const replied = await request(server)
      .post(`/api/v1/posts/${postId}/replies`)
      .set('x-goodnight-user-id', readerCredential)
      .send({ content: `${marker} 读到这里，我也松了一口气。`, anonymous: false });
    replyId = replied.body?.item?.id;
    const visibleBefore = await request(server).get(`/api/v1/posts/${postId}/replies`);
    const replyRow = replyId ? await prisma.reply.findUnique({ where: { id: replyId } }) : null;
    evidence.check({
      step: 'a human reply starts pending review and is not visible',
      layer: 'DATABASE_EVIDENCE',
      expected: {
        status: 201,
        rowStatus: 'pending_review',
        visible: false,
        authorRecorded: true,
      },
      actual: {
        status: replied.status,
        rowStatus: replyRow?.status,
        visible: (visibleBefore.body?.items ?? []).some((item: any) => item.id === replyId),
        authorRecorded: Boolean(replyRow?.userId),
      },
      request: { method: 'POST', path: `/api/v1/posts/${postId}/replies` },
      response: { status: replied.status, replyId },
      sql: `select status, "userId" from "Reply" where id = '${replyId}'`,
    });
    expect(replied.status).toBe(201);
    expect(replyRow?.status).toBe('pending_review');
    expect((visibleBefore.body?.items ?? []).some((item: any) => item.id === replyId)).toBe(false);

    // 4. The operator publishes the reply; the public list then contains it.
    const replyApproved = await request(server)
      .patch(`/api/admin/v1/replies/${replyId}/review`)
      .set('Authorization', auth(adminToken))
      .send({ status: 'published' });
    const visibleAfter = await request(server).get(`/api/v1/posts/${postId}/replies`);
    const replyRowAfter = await prisma.reply.findUnique({ where: { id: replyId } });
    const postAfterReply = await prisma.post.findUnique({ where: { id: postId } });
    evidence.check({
      step: 'the approved reply becomes visible and is counted',
      layer: 'DATABASE_EVIDENCE',
      expected: {
        status: 200,
        rowStatus: 'published',
        visible: true,
        counterAtLeastOne: true,
      },
      actual: {
        status: replyApproved.status,
        rowStatus: replyRowAfter?.status,
        visible: (visibleAfter.body?.items ?? []).some((item: any) => item.id === replyId),
        counterAtLeastOne: (postAfterReply?.replyCount ?? 0) >= 1,
      },
      request: { method: 'PATCH', path: `/api/admin/v1/replies/${replyId}/review`, body: { status: 'published' } },
      response: { status: replyApproved.status, replyCount: postAfterReply?.replyCount },
      sql: `select status from "Reply" where id = '${replyId}'; select "replyCount" from "Post" where id = '${postId}'`,
    });
    expect(replyApproved.status).toBe(200);
    expect(replyRowAfter?.status).toBe('published');
    expect((visibleAfter.body?.items ?? []).some((item: any) => item.id === replyId)).toBe(true);

    // 5. A hug is idempotent per user.
    const firstHug = await request(server)
      .post(`/api/v1/posts/${postId}/hug`)
      .set('x-goodnight-user-id', readerCredential)
      .send({});
    const secondHug = await request(server)
      .post(`/api/v1/posts/${postId}/hug`)
      .set('x-goodnight-user-id', readerCredential)
      .send({});
    const hugRows = await prisma.hugAction.count({ where: { postId } });
    evidence.check({
      step: 'a second hug from the same user does not add another',
      layer: 'DATABASE_EVIDENCE',
      expected: {
        firstStatus: 201,
        firstAlready: false,
        secondStatus: 201,
        secondAlready: true,
        hugRows: 1,
      },
      actual: {
        firstStatus: firstHug.status,
        firstAlready: firstHug.body?.alreadyHugged,
        secondStatus: secondHug.status,
        secondAlready: secondHug.body?.alreadyHugged,
        hugRows,
      },
      request: { method: 'POST', path: `/api/v1/posts/${postId}/hug`, body: { twice: true } },
      response: {
        firstHugCount: firstHug.body?.item?.hugCount,
        secondHugCount: secondHug.body?.item?.hugCount,
      },
      sql: `select count(*) from "HugAction" where "postId" = '${postId}'`,
    });
    expect(firstHug.status).toBe(201);
    expect(firstHug.body?.alreadyHugged).toBe(false);
    expect(secondHug.body?.alreadyHugged).toBe(true);
    expect(hugRows).toBe(1);

    // 6. Reporting increments the post's report counter.
    const report = await request(server)
      .post(`/api/v1/posts/${postId}/report`)
      .set('x-goodnight-user-id', readerCredential)
      .send({});
    const reportedRow = await prisma.post.findUnique({ where: { id: postId } });
    evidence.check({
      step: 'reporting increments the persisted report counter',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 201, reportCount: 1 },
      actual: { status: report.status, reportCount: reportedRow?.reportCount },
      request: { method: 'POST', path: `/api/v1/posts/${postId}/report` },
      response: { status: report.status },
      sql: `select "reportCount" from "Post" where id = '${postId}'`,
    });
    expect(report.status).toBe(201);
    expect(reportedRow?.reportCount).toBe(1);

    // 7. Only the author can delete. A stranger gets 404 and the post stays active.
    const strangerDelete = await request(server)
      .delete(`/api/v1/posts/${postId}`)
      .set('x-goodnight-user-id', strangerCredential);
    const rowAfterStranger = await prisma.post.findUnique({ where: { id: postId } });
    const authorDelete = await request(server)
      .delete(`/api/v1/posts/${postId}`)
      .set('x-goodnight-user-id', authorCredential);
    const rowAfterAuthor = await prisma.post.findUnique({ where: { id: postId } });
    const feedAfterDelete = await request(server).get('/api/v1/posts');
    evidence.check({
      step: 'only the author can delete, and deletion removes it from the feed',
      layer: 'SECURITY_EVIDENCE',
      expected: {
        strangerStatus: 404,
        stillActive: true,
        authorStatus: 200,
        authorRowStatus: 'deleted',
        inFeed: false,
      },
      actual: {
        strangerStatus: strangerDelete.status,
        stillActive: rowAfterStranger?.status === 'active',
        authorStatus: authorDelete.status,
        authorRowStatus: rowAfterAuthor?.status,
        inFeed: (feedAfterDelete.body?.items ?? []).some((item: any) => item.id === postId),
      },
      request: { method: 'DELETE', path: `/api/v1/posts/${postId}`, identity: 'stranger then author' },
      response: { strangerStatus: strangerDelete.status, authorStatus: authorDelete.status },
      sql: `select status from "Post" where id = '${postId}'`,
    });
    expect(strangerDelete.status).toBe(404);
    expect(rowAfterStranger?.status).toBe('active');
    expect(authorDelete.status).toBe(200);
    expect(rowAfterAuthor?.status).toBe('deleted');
    expect((feedAfterDelete.body?.items ?? []).some((item: any) => item.id === postId)).toBe(false);
  });
});
