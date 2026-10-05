import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApiTestApp, loginAdmin, auth } from './helpers';
import { StoreService } from '../../apps/api/src/store.service';
import { FollowUpWorkerService } from '../../apps/api/src/follow-up-worker.service';
import { saveRelationalRuntimeState } from '../../apps/api/src/relational-runtime.mapper';

describe('Batch 1 Sub-batch A: UserNotification and D2 FollowUpJob protections', () => {
  let app: INestApplication;
  let adminToken: string;
  const dbUrl = process.env.DATABASE_URL!;

  beforeAll(async () => {
    app = await createApiTestApp();
    const server = app.getHttpServer();
    adminToken = await loginAdmin(server);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('1. Database-only read gate: row inserted via fresh PrismaClient is read via API and re-read from DB', async () => {
    const server = app.getHttpServer();
    const store = app.get(StoreService);
    const notificationId = `notif_gate_${Date.now()}`;
    const testUserId = store.getDemoUserId();

    // Verify loud failure on store.notifications getter
    expect(() => store.notifications).toThrow(/disabled|deprecated/i);

    // Insert directly into PostgreSQL using a fresh PrismaClient (bypassing any store cache)
    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.userNotification.create({
        data: {
          id: notificationId,
          userId: testUserId,
          type: 'FOLLOW_UP',
          title: '数据库专用验证标题',
          body: '这是一条直接写入PostgreSQL的提醒消息',
          targetRoute: '/pages/action/index?test=1',
          status: 'unread',
        },
      });
    } finally {
      await freshPrisma.$disconnect();
    }

    // Path A: User notifications list endpoint (GET /api/v1/notifications)
    const userListRes = await request(server)
      .get('/api/v1/notifications')
      .set('x-goodnight-user-id', testUserId)
      .expect(200);

    const foundInUserList = userListRes.body.items?.find((item: any) => item.id === notificationId);
    expect(foundInUserList).toBeDefined();
    expect(foundInUserList.title).toBe('数据库专用验证标题');
    expect(foundInUserList.status).toBe('unread');
    expect(userListRes.body.unreadCount).toBeGreaterThanOrEqual(1);

    // Path B: Admin notifications list endpoint (GET /api/admin/v1/notifications)
    const adminListRes = await request(server)
      .get('/api/admin/v1/notifications')
      .set('Authorization', auth(adminToken))
      .query({ q: notificationId })
      .expect(200);

    const foundInAdminList = adminListRes.body.items?.find((item: any) => item.id === notificationId);
    expect(foundInAdminList).toBeDefined();
    expect(foundInAdminList.id).toBe(notificationId);

    // Path C: Admin overview dashboard unread count (GET /api/admin/v1/dashboard/overview)
    const overviewRes = await request(server)
      .get('/api/admin/v1/dashboard/overview')
      .set('Authorization', auth(adminToken))
      .expect(200);

    expect(overviewRes.body.item.journeySummary.unreadNotifications).toBeGreaterThanOrEqual(1);

    // Path D: Mark as read via API (PATCH /api/v1/notifications/:id/read)
    const readRes = await request(server)
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set('x-goodnight-user-id', testUserId)
      .expect(200);

    expect(readRes.body.item.status).toBe('read');
    expect(readRes.body.item.readAt).toBeDefined();

    // Re-read row from database with a fresh PrismaClient to prove database was updated
    const freshPrismaAfter = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const dbRow = await freshPrismaAfter.userNotification.findUnique({
        where: { id: notificationId },
      });
      expect(dbRow).not.toBeNull();
      expect(dbRow?.status).toBe('read');
      expect(dbRow?.readAt).not.toBeNull();
    } finally {
      await freshPrismaAfter.$disconnect();
    }
  });

  it('2. Worker idempotency: delivering identical BullMQ job twice produces exactly one notification and leaves job delivered', async () => {
    const store = app.get(StoreService);
    const worker = app.get(FollowUpWorkerService);
    const jobId = `job_idem_${Date.now()}`;
    const testUserId = store.getDemoUserId();

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.followUpJob.create({
        data: {
          id: jobId,
          userId: testUserId,
          kind: 'FOLLOW_UP',
          status: 'pending',
          dueAt: new Date(),
          payload: { actionId: 'action_test_123' },
        },
      });
    } finally {
      await freshPrisma.$disconnect();
    }

    const payload = { id: jobId, kind: 'FOLLOW_UP', userId: testUserId, payload: { actionId: 'action_test_123' } };

    // Deliver job the first time
    const firstDelivery = await (worker as any).deliver(payload);
    expect(firstDelivery.status).toBe('delivered');
    expect(firstDelivery.notificationId).toBe(`notification_${jobId}`);

    // Deliver identical job a second time (racing or duplicate BullMQ retry)
    const secondDelivery = await (worker as any).deliver(payload);
    expect(secondDelivery.skipped).toBe(true);
    expect(secondDelivery.status).toBe('delivered');

    // Verify DB state with fresh client: job is delivered and exactly ONE notification exists
    const freshPrismaVerify = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const job = await freshPrismaVerify.followUpJob.findUnique({ where: { id: jobId } });
      expect(job?.status).toBe('delivered');
      expect(job?.completedAt).not.toBeNull();

      const notifications = await freshPrismaVerify.userNotification.findMany({
        where: { id: `notification_${jobId}` },
      });
      expect(notifications).toHaveLength(1);
    } finally {
      await freshPrismaVerify.$disconnect();
    }
  });

  it('3. Read state does not revert: after marking read, subsequent legacy flush does not revert it to unread', async () => {
    const server = app.getHttpServer();
    const store = app.get(StoreService);
    const notificationId = `notif_norevert_${Date.now()}`;
    const testUserId = store.getDemoUserId();

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.userNotification.create({
        data: {
          id: notificationId,
          userId: testUserId,
          type: 'FOLLOW_UP',
          title: '状态不回退测试',
          body: '测试已读状态在legacy flush后保持已读',
          status: 'unread',
        },
      });
    } finally {
      await freshPrisma.$disconnect();
    }

    // Mark as read via API
    await request(server)
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set('x-goodnight-user-id', testUserId)
      .expect(200);

    // Verify read in DB
    const freshPrismaAfterRead = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const row = await freshPrismaAfterRead.userNotification.findUnique({ where: { id: notificationId } });
      expect(row?.status).toBe('read');
    } finally {
      await freshPrismaAfterRead.$disconnect();
    }

    // Trigger a legacy flush
    await store.persistAndFlush();

    // Assert that the database row still has status 'read'
    const freshPrismaAfterFlush = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const rowAfterFlush = await freshPrismaAfterFlush.userNotification.findUnique({ where: { id: notificationId } });
      expect(rowAfterFlush).not.toBeNull();
      expect(rowAfterFlush?.status).toBe('read');
    } finally {
      await freshPrismaAfterFlush.$disconnect();
    }
  });

  it('4. FK/reference preservation regression: legacy flush preserves committed notification, journeyId, and delivered status', async () => {
    const store = app.get(StoreService);
    const testUserId = store.getDemoUserId();
    const journeyId = `journey_fk_${Date.now()}`;
    const jobId = `job_fk_${Date.now()}`;
    const notifId = `notif_fk_${Date.now()}`;
    const completedAt = new Date();

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId: testUserId,
          title: '外键保护旅程',
          domain: '生活',
          status: 'active',
          stage: 'clarifying',
        },
      });
      await freshPrisma.followUpJob.create({
        data: {
          id: jobId,
          userId: testUserId,
          journeyId,
          kind: 'FOLLOW_UP',
          status: 'delivered',
          dueAt: new Date(),
          completedAt,
        },
      });
      await freshPrisma.userNotification.create({
        data: {
          id: notifId,
          userId: testUserId,
          type: 'FOLLOW_UP',
          title: '持久化通知',
          body: '不应被legacy flush清除',
          status: 'unread',
        },
      });
    } finally {
      await freshPrisma.$disconnect();
    }

    // Keep the life journey in the unmigrated store so LifeJourney absence sweep does not cascade
    store.lifeJourneys.push({
      id: journeyId,
      userId: testUserId,
      title: '外键保护旅程',
      domain: '生活',
      status: 'active',
      stage: 'clarifying',
      visibility: 'PRIVATE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Simulate in-memory store holding a stale pending FollowUpJob without the journeyId
    store.followUpJobs.push({
      id: jobId,
      userId: testUserId,
      kind: 'FOLLOW_UP',
      status: 'pending',
      dueAt: new Date().toISOString(),
    });

    // Trigger legacy flush
    await store.persistAndFlush();

    // Verify DB state with fresh PrismaClient
    const freshPrismaVerify = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      // Notification must survive (no sweep)
      const notif = await freshPrismaVerify.userNotification.findUnique({ where: { id: notifId } });
      expect(notif).not.toBeNull();

      // FollowUpJob must remain delivered, journeyId must not be nulled, completedAt preserved
      const job = await freshPrismaVerify.followUpJob.findUnique({ where: { id: jobId } });
      expect(job).not.toBeNull();
      expect(job?.status).toBe('delivered');
      expect(job?.journeyId).toBe(journeyId);
      expect(job?.completedAt?.toISOString()).toBe(completedAt.toISOString());
    } finally {
      await freshPrismaVerify.$disconnect();
    }
  });

  it('5. Cross-instance survivability: stale instance flush cannot delete notification nor regress FollowUpJob', async () => {
    const store = app.get(StoreService);
    const testUserId = store.getDemoUserId();
    const jobId = `job_cross_${Date.now()}`;
    const notifId = `notif_cross_${Date.now()}`;
    const completedAt = new Date();

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.followUpJob.create({
        data: {
          id: jobId,
          userId: testUserId,
          kind: 'FOLLOW_UP',
          status: 'delivered',
          dueAt: new Date(),
          completedAt,
        },
      });
      await freshPrisma.userNotification.create({
        data: {
          id: notifId,
          userId: testUserId,
          type: 'FOLLOW_UP',
          title: '跨实例通知',
          body: '跨实例存活性测试',
          status: 'read',
        },
      });
    } finally {
      await freshPrisma.$disconnect();
    }

    // Simulate a second API instance running saveRelationalRuntimeState with a stale snapshot:
    // Its notifications array is empty ([]), and its followUpJobs has the job in 'pending' status.
    const freshPrismaInstance2 = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const staleInstance2State = {
        users: [{ id: testUserId, openid: 'test_openid', nickname: 'Demo', anonymousCode: 'demo_code', status: 'normal', createdAt: new Date().toISOString() }],
        followUpJobs: [{
          id: jobId,
          userId: testUserId,
          kind: 'FOLLOW_UP',
          status: 'pending',
          dueAt: new Date().toISOString(),
          completedAt: undefined,
        }],
        notifications: [], // Stale second instance has no knowledge of the notification
      };

      await saveRelationalRuntimeState(freshPrismaInstance2, staleInstance2State);
    } finally {
      await freshPrismaInstance2.$disconnect();
    }

    // Verify DB with fresh client:
    // 1. Notification must not have been deleted by instance 2's empty notifications array
    // 2. FollowUpJob must not have been regressed to 'pending'
    const freshPrismaVerify = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const notif = await freshPrismaVerify.userNotification.findUnique({ where: { id: notifId } });
      expect(notif).not.toBeNull();
      expect(notif?.status).toBe('read');

      const job = await freshPrismaVerify.followUpJob.findUnique({ where: { id: jobId } });
      expect(job).not.toBeNull();
      expect(job?.status).toBe('delivered');
      expect(job?.completedAt?.toISOString()).toBe(completedAt.toISOString());
    } finally {
      await freshPrismaVerify.$disconnect();
    }
  });
});
