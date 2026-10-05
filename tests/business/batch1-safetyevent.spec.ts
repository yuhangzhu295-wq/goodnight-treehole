import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApiTestApp, loginAdmin, auth } from './helpers';
import { StoreService } from '../../apps/api/src/store.service';
import { Batch1PersistenceService } from '../../apps/api/src/batch1-persistence.service';
import { saveRelationalRuntimeState } from '../../apps/api/src/relational-runtime.mapper';
import { DIRECT_DB_MODELS } from '../../apps/api/src/direct-db-models';

describe('Batch 1 Sub-batch B: SafetyEvent and D1 AuditLog protections', () => {
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
    const testUserId = store.getDemoUserId();
    const eventId = `safety_gate_${Date.now()}`;
    const journeyId = `journey_gate_${Date.now()}`;

    // Verify loud failure on store.safetyEvents getter and store.data.safetyEvents
    expect(() => store.safetyEvents).toThrow(/disabled|deprecated/i);
    expect(() => (store as any).data.safetyEvents).toThrow(/disabled/i);

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      // Create journey with stage: safety_first
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId: testUserId,
          title: '安全门禁测试旅程',
          domain: '情绪',
          status: 'active',
          stage: 'safety_first',
        },
      });

      // Insert high-risk SafetyEvent directly via fresh PrismaClient
      await freshPrisma.safetyEvent.create({
        data: {
          id: eventId,
          userId: testUserId,
          journeyId,
          level: 'high',
          source: 'journey_create',
          action: 'real_world_support_prompt',
          payload: { escalation: true, triggerExcerpt: '绝密高风险测试文本' },
          status: 'open',
        },
      });
    } finally {
      await freshPrisma.$disconnect();
    }

    // Keep store legacy array aware of journey for requireJourney / journey reads (prior to Sub-batch D)
    if (!DIRECT_DB_MODELS.LifeJourney) {
      store.lifeJourneys.push({
        id: journeyId,
        userId: testUserId,
        title: '安全门禁测试旅程',
        domain: '情绪',
        status: 'active',
        stage: 'safety_first',
        visibility: 'PRIVATE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Path A: Admin safety events list (GET /api/admin/v1/safety/events)
    const adminListRes = await request(server)
      .get('/api/admin/v1/safety/events')
      .set('Authorization', auth(adminToken))
      .query({ q: eventId })
      .expect(200);

    const foundInAdminList = adminListRes.body.items?.find((item: any) => item.id === eventId);
    expect(foundInAdminList).toBeDefined();
    expect(foundInAdminList.id).toBe(eventId);
    expect(foundInAdminList.level).toBe('high');
    expect(foundInAdminList.status).toBe('open');
    expect(foundInAdminList.triggerExcerpt).toContain('绝密高风险测试文本');

    // Path B: Admin safety event detail (GET /api/admin/v1/safety/events/:id)
    const detailRes = await request(server)
      .get(`/api/admin/v1/safety/events/${eventId}`)
      .set('Authorization', auth(adminToken))
      .expect(200);

    expect(detailRes.body.item).toBeDefined();
    expect(detailRes.body.item.id).toBe(eventId);
    expect(detailRes.body.item.triggerExcerpt).toContain('绝密高风险测试文本');

    // Path C: Admin overview dashboard high risk count (GET /api/admin/v1/dashboard/overview)
    const overviewRes = await request(server)
      .get('/api/admin/v1/dashboard/overview')
      .set('Authorization', auth(adminToken))
      .expect(200);

    expect(overviewRes.body.item.journeySummary.safetyEvents).toBeGreaterThanOrEqual(1);

    // Path D: Intent detection read path reads SafetyEvents from database
    // Journey has stage: 'safety_first' and a high-risk SafetyEvent in the database,
    // so any non-HIGH_DISTRESS intent triggers safety first routing.
    const intentRes = await request(server)
      .patch(`/api/v1/journeys/${journeyId}/intent`)
      .set('x-goodnight-user-id', testUserId)
      .send({ intent: 'NEXT_STEP' })
      .expect(200);

    expect(intentRes.body.journey.stage).toBe('safety_first');
    expect(intentRes.body.journey.currentIntent).toBe('HIGH_DISTRESS');
    expect(intentRes.body.route.targetRoute).toBe('/pages/safety/index');

    // Re-read row from fresh client
    const freshPrismaVerify = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const dbRow = await freshPrismaVerify.safetyEvent.findUnique({ where: { id: eventId } });
      expect(dbRow).not.toBeNull();
      expect(dbRow?.id).toBe(eventId);
      expect(dbRow?.status).toBe('open');
    } finally {
      await freshPrismaVerify.$disconnect();
    }
  });

  it('2. Atomic handling: admin handling updates status and writes AuditLog in one transaction; failure leaves neither', async () => {
    const server = app.getHttpServer();
    const store = app.get(StoreService);
    const persistence = app.get(Batch1PersistenceService);
    const testUserId = store.getDemoUserId();
    const eventId = `safety_atomic_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.safetyEvent.create({
        data: {
          id: eventId,
          userId: testUserId,
          level: 'high',
          source: 'journey_create',
          action: 'real_world_support_prompt',
          status: 'open',
        },
      });
    } finally {
      await freshPrisma.$disconnect();
    }

    // Step 2a: Failure mid-handling rolls back both the status update and the AuditLog insert
    await expect(
      persistence.handleSafetyEvent(eventId, 'admin_user', {
        status: 'handled',
        note: '即将回滚的操作',
        _failAfterUpdate: true,
      }),
    ).rejects.toThrow('Simulated failure during handleSafetyEvent transaction');

    const freshPrismaAfterFail = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const row = await freshPrismaAfterFail.safetyEvent.findUnique({ where: { id: eventId } });
      expect(row?.status).toBe('open');
      expect(row?.handledAt).toBeNull();

      const auditRow = await freshPrismaAfterFail.auditLog.findFirst({
        where: { resourceType: 'SafetyEvent', resourceId: eventId },
      });
      expect(auditRow).toBeNull();
    } finally {
      await freshPrismaAfterFail.$disconnect();
    }

    // Step 2b: Successful handling commits both status update and AuditLog atomically
    const handleRes = await request(server)
      .patch(`/api/admin/v1/safety/events/${eventId}/handle`)
      .set('Authorization', auth(adminToken))
      .send({ status: 'handled', note: '管理员已处理完成' })
      .expect(200);

    expect(handleRes.body.item.status).toBe('handled');
    expect(handleRes.body.item.handledAt).toBeDefined();
    expect(handleRes.body.item.note).toBe('管理员已处理完成');

    const freshPrismaAfterSuccess = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const row = await freshPrismaAfterSuccess.safetyEvent.findUnique({ where: { id: eventId } });
      expect(row?.status).toBe('handled');
      expect(row?.handledAt).not.toBeNull();
      expect(row?.note).toBe('管理员已处理完成');

      const auditRow = await freshPrismaAfterSuccess.auditLog.findFirst({
        where: { resourceType: 'SafetyEvent', resourceId: eventId, action: 'SAFETY_EVENT_HANDLE' },
      });
      expect(auditRow).not.toBeNull();
      expect((auditRow?.afterJson as any)?.status).toBe('handled');
      expect((auditRow?.beforeJson as any)?.status).toBe('open');
    } finally {
      await freshPrismaAfterSuccess.$disconnect();
    }
  });

  it('3. D1 audit survivability: legacy flush from stale instance without the audit row does not delete it', async () => {
    const store = app.get(StoreService);
    const testUserId = store.getDemoUserId();
    const eventId = `safety_d1_${Date.now()}`;
    const auditId = `audit_d1_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const adminUser = await freshPrisma.adminUser.findFirst();
      const adminUserId = adminUser?.id ?? 'admin_default';

      await freshPrisma.safetyEvent.create({
        data: {
          id: eventId,
          userId: testUserId,
          level: 'high',
          source: 'journey_create',
          action: 'real_world_support_prompt',
          status: 'handled',
        },
      });

      // Insert an AuditLog row directly into PostgreSQL
      await freshPrisma.auditLog.create({
        data: {
          id: auditId,
          adminUserId,
          action: 'SAFETY_EVENT_HANDLE',
          resourceType: 'SafetyEvent',
          resourceId: eventId,
          beforeJson: { status: 'open' },
          afterJson: { status: 'handled' },
          ip: '127.0.0.1',
          userAgent: 'test-agent',
        },
      });
    } finally {
      await freshPrisma.$disconnect();
    }

    // Simulate another API instance running saveRelationalRuntimeState with a stale snapshot
    // where auditLogs is an empty array (it does not know about the new audit row)
    const freshPrismaInstance2 = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const staleState = {
        users: [
          {
            id: testUserId,
            openid: 'test_openid_d1',
            nickname: 'Demo',
            anonymousCode: 'demo_d1',
            status: 'normal',
            createdAt: new Date().toISOString(),
          },
        ],
        auditLogs: [], // Stale second instance holds an empty auditLogs array
      };
      await saveRelationalRuntimeState(freshPrismaInstance2, staleState);
    } finally {
      await freshPrismaInstance2.$disconnect();
    }

    // Verify DB with fresh client: AuditLog row MUST survive because D1 removed the absence sweep
    const freshPrismaVerify = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const auditRow = await freshPrismaVerify.auditLog.findUnique({ where: { id: auditId } });
      expect(auditRow).not.toBeNull();
      expect(auditRow?.resourceId).toBe(eventId);
    } finally {
      await freshPrismaVerify.$disconnect();
    }
  });

  it('4. Archive detachment: deleting a Journey archive removes the Journey but SafetyEvent survives with journeyId=NULL', async () => {
    const server = app.getHttpServer();
    const store = app.get(StoreService);
    const testUserId = store.getDemoUserId();
    const journeyId = `journey_detach_${Date.now()}`;
    const eventId = `safety_detach_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId: testUserId,
          title: '归档解除关联测试旅程',
          domain: '生活',
          status: 'archived',
          stage: 'clarifying',
        },
      });
      await freshPrisma.safetyEvent.create({
        data: {
          id: eventId,
          userId: testUserId,
          journeyId,
          level: 'high',
          source: 'journey_create',
          action: 'real_world_support_prompt',
          status: 'open',
        },
      });
    } finally {
      await freshPrisma.$disconnect();
    }

    // Keep store aware of the journey in archived status (prior to Sub-batch D)
    if (!DIRECT_DB_MODELS.LifeJourney) {
      store.lifeJourneys.push({
        id: journeyId,
        userId: testUserId,
        title: '归档解除关联测试旅程',
        domain: '生活',
        status: 'archived',
        stage: 'clarifying',
        visibility: 'PRIVATE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // This test explicitly asserts the ordering: detachSafetyEventsForJourney must execute and commit
    // SafetyEvent.journeyId = NULL before the Journey row is deleted by persistAndFlush().
    // Verifying that SafetyEvent.journeyId === null while the LifeJourney row still exists in PostgreSQL
    // proves that detachment happens via the explicit database update rather than relying on schema onDelete: SetNull cascade.
    const persistence = app.get(Batch1PersistenceService);
    let explicitDetachObservedBeforeJourneyDeletion = false;
    const originalDetach = persistence.detachSafetyEventsForJourney.bind(persistence);
    const detachSpy = vi
      .spyOn(persistence, 'detachSafetyEventsForJourney')
      .mockImplementation(async (targetJourneyId: string) => {
        const res = await originalDetach(targetJourneyId);
        // Immediately after the explicit detach commits, but BEFORE the Journey row is deleted by persistAndFlush:
        // Verify from an independent Prisma client that the SafetyEvent already has journeyId = null,
        // while the LifeJourney row STILL exists in PostgreSQL.
        const separateClient = new PrismaClient({ datasources: { db: { url: dbUrl } } });
        try {
          const journeyStillExists = await separateClient.lifeJourney.findUnique({ where: { id: targetJourneyId } });
          const eventAlreadyDetached = await separateClient.safetyEvent.findUnique({ where: { id: eventId } });
          if (journeyStillExists !== null && eventAlreadyDetached?.journeyId === null) {
            explicitDetachObservedBeforeJourneyDeletion = true;
          }
        } finally {
          await separateClient.$disconnect();
        }
        return res;
      });

    try {
      // Delete the archive via API
      await request(server)
        .delete(`/api/v1/archive/journeys/${journeyId}`)
        .set('x-goodnight-user-id', testUserId)
        .send({ confirmation: 'DELETE_ARCHIVE' })
        .expect(200);

      // Prove that the explicit detach was called with the targeted journeyId
      expect(detachSpy).toHaveBeenCalledWith(journeyId);
      // Prove that SafetyEvent.journeyId was detached BEFORE the Journey row was deleted (not via onDelete: SetNull cascade)
      expect(explicitDetachObservedBeforeJourneyDeletion).toBe(true);

      // Verify in database: LifeJourney is deleted, SafetyEvent survives with journeyId = null
      const freshPrismaVerify = new PrismaClient({ datasources: { db: { url: dbUrl } } });
      try {
        const journey = await freshPrismaVerify.lifeJourney.findUnique({ where: { id: journeyId } });
        expect(journey).toBeNull();

        const event = await freshPrismaVerify.safetyEvent.findUnique({ where: { id: eventId } });
        expect(event).not.toBeNull();
        expect(event?.journeyId).toBeNull();
      } finally {
        await freshPrismaVerify.$disconnect();
      }
    } finally {
      detachSpy.mockRestore();
    }
  });

  it('5. FK preservation: legacy flush must not null a SafetyEvent journeyId when Journey exists, and must not delete SafetyEvent', async () => {
    const store = app.get(StoreService);
    const testUserId = store.getDemoUserId();
    const journeyId = `journey_fk_${Date.now()}`;
    const eventId = `safety_fk_${Date.now()}`;

    const freshPrisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      await freshPrisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId: testUserId,
          title: '外键保持测试旅程',
          domain: '工作',
          status: 'active',
          stage: 'clarifying',
        },
      });
      await freshPrisma.safetyEvent.create({
        data: {
          id: eventId,
          userId: testUserId,
          journeyId,
          level: 'high',
          source: 'journey_create',
          action: 'real_world_support_prompt',
          status: 'open',
        },
      });
    } finally {
      await freshPrisma.$disconnect();
    }

    // Keep the journey in memory store so it is upserted during flush (prior to Sub-batch D)
    if (!DIRECT_DB_MODELS.LifeJourney) {
      store.lifeJourneys.push({
        id: journeyId,
        userId: testUserId,
        title: '外键保持测试旅程',
        domain: '工作',
        status: 'active',
        stage: 'clarifying',
        visibility: 'PRIVATE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Trigger a legacy flush from the store
    await store.persistAndFlush();

    // Also simulate a flush from another instance whose safetyEvents array is empty
    const freshPrismaInstance2 = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const staleState = {
        users: [
          {
            id: testUserId,
            openid: 'test_openid_fk',
            nickname: 'Demo',
            anonymousCode: 'demo_fk',
            status: 'normal',
            createdAt: new Date().toISOString(),
          },
        ],
        lifeJourneys: [
          {
            id: journeyId,
            userId: testUserId,
            title: '外键保持测试旅程',
            domain: '工作',
            status: 'active',
            stage: 'clarifying',
            visibility: 'PRIVATE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        safetyEvents: [], // Stale instance has empty safetyEvents array
      };
      await saveRelationalRuntimeState(freshPrismaInstance2, staleState);
    } finally {
      await freshPrismaInstance2.$disconnect();
    }

    // Verify DB with fresh client: SafetyEvent must NOT be deleted, and journeyId must NOT be nulled
    const freshPrismaVerify = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const event = await freshPrismaVerify.safetyEvent.findUnique({ where: { id: eventId } });
      expect(event).not.toBeNull();
      expect(event?.journeyId).toBe(journeyId);
      expect(event?.level).toBe('high');
      expect(event?.status).toBe('open');
    } finally {
      await freshPrismaVerify.$disconnect();
    }
  });
});
