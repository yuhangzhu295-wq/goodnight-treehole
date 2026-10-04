import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { auth, createApiTestApp, loginAdmin } from './helpers';

describe('deprecated endpoints regression', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createApiTestApp();
    const server = app.getHttpServer();
    adminToken = await loginAdmin(server);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('authorization guard enforcement', () => {
    it('returns 401 for unauthenticated calls to PATCH users/:id/tags', async () => {
      const server = app.getHttpServer();
      await request(server)
        .patch('/api/admin/v1/users/user_demo/tags')
        .send({ tags: ['test-tag'] })
        .expect(401);
    });

    it('returns 401 for unauthenticated calls to POST users/:id/tags', async () => {
      const server = app.getHttpServer();
      await request(server)
        .post('/api/admin/v1/users/user_demo/tags')
        .send({ tags: ['test-tag'] })
        .expect(401);
    });

    it('returns 401 for unauthenticated calls to PATCH posts/:id/visibility', async () => {
      const server = app.getHttpServer();
      await request(server)
        .patch('/api/admin/v1/posts/nonexistent_post_id/visibility')
        .send({ visibility: 'PRIVATE' })
        .expect(401);
    });
  });

  describe('Item 1: user-tags endpoints deprecation (HTTP 410)', () => {
    it('PATCH users/:id/tags returns 410 Gone and does not claim a save in response', async () => {
      const server = app.getHttpServer();
      const res = await request(server)
        .patch('/api/admin/v1/users/user_demo/tags')
        .set('Authorization', auth(adminToken))
        .send({ tags: ['vip', 'custom_tag'] })
        .expect(410);

      // Note: User has no tags column in schema.prisma or StoreService, so re-reading the
      // user cannot falsify the regression (it yielded undefined tags even before this fix).
      // The regression guard specifically asserts that the endpoint no longer reports success:
      // HTTP 410 instead of 200, code ENDPOINT_DEPRECATED, and neither `item` nor `tags` key present.
      expect(res.body.code).toBe('ENDPOINT_DEPRECATED');
      expect(res.body.message).toContain('用户标签功能未实现；本请求未保存任何标签');
      expect('item' in res.body).toBe(false);
      expect('tags' in res.body).toBe(false);
      expect(res.body.item).toBeUndefined();
      expect(res.body.tags).toBeUndefined();
    });

    it('POST users/:id/tags returns 410 Gone and does not claim a save in response', async () => {
      const server = app.getHttpServer();
      const res = await request(server)
        .post('/api/admin/v1/users/user_demo/tags')
        .set('Authorization', auth(adminToken))
        .send({ tags: ['vip', 'custom_tag'] })
        .expect(410);

      // Note: User has no tags column in schema.prisma or StoreService, so re-reading the
      // user cannot falsify the regression (it yielded undefined tags even before this fix).
      // The regression guard specifically asserts that the endpoint no longer reports success:
      // HTTP 410 instead of 200, code ENDPOINT_DEPRECATED, and neither `item` nor `tags` key present.
      expect(res.body.code).toBe('ENDPOINT_DEPRECATED');
      expect(res.body.message).toContain('用户标签功能未实现；本请求未保存任何标签');
      expect('item' in res.body).toBe(false);
      expect('tags' in res.body).toBe(false);
      expect(res.body.item).toBeUndefined();
      expect(res.body.tags).toBeUndefined();
    });
  });

  describe('Item 2: post-visibility endpoint deprecation (HTTP 410) vs review route', () => {
    it('PATCH posts/:id/visibility returns 410, leaves post status, visibility, and audit log unchanged', async () => {
      const server = app.getHttpServer();
      const content = `post visibility test ${Date.now()}`;
      const created = await request(server)
        .post('/api/v1/posts')
        .send({ content, mood: 'work', visibility: 'PUBLIC' })
        .expect(201);

      const postId = created.body.post.id as string;
      expect(postId).toBeTruthy();

      // Read initial audit logs
      const auditLogsBefore = await request(server)
        .get('/api/admin/v1/audit-logs')
        .set('Authorization', auth(adminToken))
        .expect(200);

      const visibilityAuditCountBefore = (auditLogsBefore.body.items ?? []).filter(
        (log: any) => log.resourceId === postId && log.action === 'POST_VISIBILITY',
      ).length;

      // Attempt mutating via deprecated visibility endpoint
      const res = await request(server)
        .patch(`/api/admin/v1/posts/${postId}/visibility`)
        .set('Authorization', auth(adminToken))
        .send({ visibility: 'PRIVATE', reviewStatus: 'published' })
        .expect(410);

      expect(res.body.code).toBe('ENDPOINT_DEPRECATED');
      expect(res.body.message).toContain('PATCH /api/admin/v1/posts/:id/review');
      expect(res.body.item).toBeUndefined();

      // Re-read post from admin API: status, visibility, and publishedAt are unchanged
      const postAfter = await request(server)
        .get(`/api/admin/v1/posts/${postId}`)
        .set('Authorization', auth(adminToken))
        .expect(200);

      expect(postAfter.body.item.visibility).toBe('PUBLIC');
      expect(postAfter.body.item.reviewStatus).toBe('pending_review');
      expect(postAfter.body.item.publishedAt).toBeFalsy();

      // Check database directly: untouched
      const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
      try {
        const dbPost = await prisma.post.findUnique({ where: { id: postId } });
        expect(dbPost?.visibility).toBe('PUBLIC');
        expect(dbPost?.reviewStatus).toBe('pending_review');
      } finally {
        await prisma.$disconnect();
      }

      // Check audit logs: no POST_VISIBILITY row was added
      const auditLogsAfter = await request(server)
        .get('/api/admin/v1/audit-logs')
        .set('Authorization', auth(adminToken))
        .expect(200);

      const visibilityAuditCountAfter = (auditLogsAfter.body.items ?? []).filter(
        (log: any) => log.resourceId === postId && log.action === 'POST_VISIBILITY',
      ).length;
      expect(visibilityAuditCountAfter).toBe(visibilityAuditCountBefore);
    });

    it('PATCH posts/:id/review still persists its actions to memory and PostgreSQL', async () => {
      const server = app.getHttpServer();
      const content = `post review test ${Date.now()}`;
      const created = await request(server)
        .post('/api/v1/posts')
        .send({ content, mood: 'work', visibility: 'PUBLIC' })
        .expect(201);

      const postId = created.body.post.id as string;
      expect(postId).toBeTruthy();

      // Approve through review endpoint
      const reviewRes = await request(server)
        .patch(`/api/admin/v1/posts/${postId}/review`)
        .set('Authorization', auth(adminToken))
        .send({ status: 'published' })
        .expect(200);

      expect(reviewRes.body.item.reviewStatus).toBe('published');
      expect(reviewRes.body.item.publishedAt).toBeTruthy();

      // Re-read post from admin API
      const postAfter = await request(server)
        .get(`/api/admin/v1/posts/${postId}`)
        .set('Authorization', auth(adminToken))
        .expect(200);

      expect(postAfter.body.item.reviewStatus).toBe('published');
      expect(postAfter.body.item.publishedAt).toBeTruthy();

      // Verify PostgreSQL state
      const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
      try {
        const dbPost = await prisma.post.findUnique({ where: { id: postId } });
        expect(dbPost?.reviewStatus).toBe('published');
        expect(dbPost?.publishedAt).toBeTruthy();
      } finally {
        await prisma.$disconnect();
      }

      // Verify audit log has POST_APPROVE
      const auditLogs = await request(server)
        .get('/api/admin/v1/audit-logs')
        .set('Authorization', auth(adminToken))
        .expect(200);

      const approveLog = (auditLogs.body.items ?? []).find(
        (log: any) => log.resourceId === postId && log.action === 'POST_APPROVE',
      );
      expect(approveLog).toBeDefined();
    });
  });

  describe('OpenAPI documentation updates', () => {
    it('documents deprecation in OpenAPI and removes success claims for deprecated routes', async () => {
      const server = app.getHttpServer();
      const res = await request(server).get('/docs-json').expect(200);

      const paths = res.body.paths;
      expect(paths).toBeDefined();

      // Check users/:id/tags
      const tagPath = paths['/api/admin/v1/users/{id}/tags'];
      expect(tagPath).toBeDefined();
      expect(tagPath.patch.deprecated).toBe(true);
      expect(tagPath.patch.responses['410']).toBeDefined();
      expect(tagPath.patch.responses['200']).toBeUndefined();
      expect(tagPath.patch.responses['201']).toBeUndefined();

      expect(tagPath.post.deprecated).toBe(true);
      expect(tagPath.post.responses['410']).toBeDefined();
      expect(tagPath.post.responses['200']).toBeUndefined();
      expect(tagPath.post.responses['201']).toBeUndefined();

      // Check posts/:id/visibility
      const visibilityPath = paths['/api/admin/v1/posts/{id}/visibility'];
      expect(visibilityPath).toBeDefined();
      expect(visibilityPath.patch.deprecated).toBe(true);
      expect(visibilityPath.patch.responses['410']).toBeDefined();
      expect(visibilityPath.patch.responses['200']).toBeUndefined();
      expect(visibilityPath.patch.responses['201']).toBeUndefined();

      // Check posts/:id/review as the moderation entry point
      const reviewPath = paths['/api/admin/v1/posts/{id}/review'];
      expect(reviewPath).toBeDefined();
      expect(reviewPath.patch.description).toContain('审核统一入口');
      expect(reviewPath.patch.responses['200']).toBeDefined();
    });
  });
});
