import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApiTestApp, identityFor } from './helpers';
import { Batch1PersistenceService } from '../../apps/api/src/batch1-persistence.service';
import { SelfPersistenceService } from '../../apps/api/src/self-persistence.service';
import { StoreService } from '../../apps/api/src/store.service';
import { saveRelationalRuntimeState } from '../../apps/api/src/relational-runtime.mapper';

/**
 * RecoverySnapshot database-authoritative persistence & graduation atomicity
 * (Batch 3 design §0.5/A3, §0.6/A3, §0.7/F3, §0.9/H1, §0.10/I1, §0.13, finding 5).
 */
describe('Batch 3: RecoverySnapshot atomicity and database authority', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let batch1Persistence: Batch1PersistenceService;
  let selfPersistence: SelfPersistenceService;
  let store: StoreService;
  const owner = 'user_demo';
  const other = 'user_guest';

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    batch1Persistence = app.get(Batch1PersistenceService);
    selfPersistence = app.get(SelfPersistenceService);
    store = app.get(StoreService);

    // Ensure baseline users exist
    await prisma.user.upsert({
      where: { id: owner },
      create: { id: owner, openid: `openid_${owner}`, anonymousCode: `anon_${owner}`, nickname: '测试用户_主' },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: other },
      create: { id: other, openid: `openid_${other}`, anonymousCode: `anon_${other}`, nickname: '测试用户_客' },
      update: {},
    });

    // Ensure privacy allows recovery data for both users
    for (const uid of [owner, other]) {
      await prisma.privacySetting.upsert({
        where: { userId: uid },
        create: { userId: uid, allowRecoveryData: true },
        update: { allowRecoveryData: true },
      });
    }
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  async function seedJourney(status: 'active' | 'paused' | 'completed' | 'archived', label: string, userId = owner) {
    const id = `journey_rec_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await prisma.lifeJourney.create({
      data: {
        id,
        userId,
        title: `旅程 ${label}`,
        domain: '生活',
        status,
        stage: status === 'completed' ? 'graduated' : 'clarifying',
        visibility: 'PRIVATE',
        completedAt: status === 'completed' ? new Date() : null,
      },
    });
    return id;
  }

  it('1.1 A snapshot is readable from the database through the route, and only by its owner', async () => {
    const journeyId = await seedJourney('active', 'snapshot_owner_read');
    const snapshotId = `recovery_read_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await prisma.recoverySnapshot.create({
      data: {
        id: snapshotId,
        userId: owner,
        journeyId,
        summary: '生活功能记录：规律作息与进食。',
        signals: { sleep: 'yes', eat: 'partial', comfort: 'yes' },
      },
    });

    // 1. Owner can read their snapshot through GET /api/v1/me/recovery
    const ownerRes = await request(app.getHttpServer())
      .get('/api/v1/me/recovery')
      .set('x-goodnight-user-id', identityFor(owner))
      .expect(200);

    const ownerItems = ownerRes.body.items as Array<{ id: string; summary: string; signals: Record<string, unknown> }>;
    expect(ownerItems.some((s) => s.id === snapshotId)).toBe(true);
    const found = ownerItems.find((s) => s.id === snapshotId);
    expect(found?.summary).toBe('生活功能记录：规律作息与进食。');
    expect(found?.signals).toEqual({ sleep: 'yes', eat: 'partial', comfort: 'yes' });

    // 2. Another user CANNOT read owner's snapshot
    const otherRes = await request(app.getHttpServer())
      .get('/api/v1/me/recovery')
      .set('x-goodnight-user-id', identityFor(other))
      .expect(200);

    const otherItems = otherRes.body.items as Array<{ id: string }>;
    expect(otherItems.some((s) => s.id === snapshotId)).toBe(false);

    // 3. Independent client confirms data in DB
    const dbRow = await prisma.recoverySnapshot.findUnique({ where: { id: snapshotId } });
    expect(dbRow?.userId).toBe(owner);
    expect(dbRow?.journeyId).toBe(journeyId);
  });

  it('1.2 Fault injection: failure during snapshot insert rolls back graduation and leaves journey not completed', async () => {
    const journeyId = await seedJourney('active', 'fault_injection');

    // Simulate graduation with injected failure during snapshot insert inside the transaction
    await expect(
      batch1Persistence.graduateJourney(journeyId, owner, {
        summary: '受控失败快照',
        signals: { completedActions: 2 },
        _failDuringSnapshotInsert: true,
      }),
    ).rejects.toThrow(/graduation snapshot insert/);

    // Assert the final database state: journey is NOT left completed
    const journeyRow = await prisma.lifeJourney.findUnique({ where: { id: journeyId } });
    expect(journeyRow?.status).toBe('active');
    expect(journeyRow?.completedAt).toBeNull();

    // Assert no snapshot was persisted for this journey
    const snapshots = await prisma.recoverySnapshot.findMany({ where: { journeyId } });
    expect(snapshots).toHaveLength(0);
  });

  it('1.3 Duplicate graduation appends exactly one snapshot', async () => {
    const journeyId = await seedJourney('active', 'duplicate_grad');

    const first = await batch1Persistence.graduateJourney(journeyId, owner, {
      summary: '第一次毕业快照',
      signals: { completedActions: 3 },
    });
    expect(first.transitioned).toBe(true);
    expect(first.journey.status).toBe('completed');
    expect(first.snapshot).toBeDefined();

    const second = await batch1Persistence.graduateJourney(journeyId, owner, {
      summary: '第二次毕业快照（重复请求）',
      signals: { completedActions: 3 },
    });
    expect(second.transitioned).toBe(false);
    expect(second.journey.status).toBe('completed');
    expect(second.snapshot).toBeUndefined();

    // Final database assertion: exactly 1 snapshot exists for this journey
    const dbSnapshots = await prisma.recoverySnapshot.findMany({ where: { journeyId } });
    expect(dbSnapshots).toHaveLength(1);
    expect(dbSnapshots[0].summary).toBe('第一次毕业快照');
  });

  it('1.4 Two concurrent graduations from separate persistence calls append exactly one snapshot', async () => {
    const journeyId = await seedJourney('active', 'concurrent_grad');

    const results = await Promise.all([
      batch1Persistence.graduateJourney(journeyId, owner, {
        summary: '并发毕业快照A',
        signals: { completedActions: 1 },
      }),
      batch1Persistence.graduateJourney(journeyId, owner, {
        summary: '并发毕业快照B',
        signals: { completedActions: 1 },
      }),
    ]);

    // Exactly one transition succeeded, and the other reported transitioned=false
    const transitionedResults = results.filter((r) => r.transitioned);
    expect(transitionedResults).toHaveLength(1);

    const nonTransitionedResults = results.filter((r) => !r.transitioned);
    expect(nonTransitionedResults).toHaveLength(1);

    expect(results.every((r) => r.journey.status === 'completed')).toBe(true);

    // Exactly one snapshot persisted in DB
    const dbSnapshots = await prisma.recoverySnapshot.findMany({ where: { journeyId } });
    expect(dbSnapshots).toHaveLength(1);
  });

  it('1.5 A stale legacy flush does not overwrite or delete a committed snapshot', async () => {
    const journeyId = await seedJourney('completed', 'stale_flush');
    const snapshotId = `recovery_flush_protect_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await prisma.recoverySnapshot.create({
      data: {
        id: snapshotId,
        userId: owner,
        journeyId,
        summary: '不可被冲刷覆盖的原生快照',
        signals: { sleep: 'yes', comfort: 'yes' },
      },
    });

    const flushClient = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

    // Stale in-memory state: recoverySnapshots is empty [] (or contains modified data)
    const staleState = {
      ...structuredClone(store['data']),
      recoverySnapshots: [
        {
          id: snapshotId,
          userId: owner,
          journeyId,
          summary: '企图恶意篡改的旧快照摘要',
          signals: { sleep: 'no' },
          createdAt: new Date().toISOString(),
        },
      ],
    };

    // Also test absence sweep with an empty recoverySnapshots array
    const emptyState = {
      ...structuredClone(store['data']),
      recoverySnapshots: [],
    };

    // 1. Flush with empty state: absence sweep must NOT delete the committed snapshot
    await saveRelationalRuntimeState(flushClient, emptyState as never);

    let dbRow = await prisma.recoverySnapshot.findUnique({ where: { id: snapshotId } });
    expect(dbRow).not.toBeNull();
    expect(dbRow?.summary).toBe('不可被冲刷覆盖的原生快照');

    // 2. Flush with stale state: legacy upsert must NOT overwrite the committed snapshot
    await saveRelationalRuntimeState(flushClient, staleState as never);

    dbRow = await prisma.recoverySnapshot.findUnique({ where: { id: snapshotId } });
    expect(dbRow).not.toBeNull();
    expect(dbRow?.summary).toBe('不可被冲刷覆盖的原生快照');
    expect(dbRow?.signals).toEqual({ sleep: 'yes', comfort: 'yes' });

    await flushClient.$disconnect();
  });

  it('1.6 The zero-legacy-write trace covers RecoverySnapshot', async () => {
    const queries: string[] = [];
    const tracedPrisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
      log: [{ emit: 'event', level: 'query' }],
    });
    (tracedPrisma as any).$on('query', (e: { query: string }) => {
      queries.push(e.query);
    });

    await saveRelationalRuntimeState(tracedPrisma as any, store['data']);

    // Check queries touching "RecoverySnapshot"
    const recoveryQueries = queries.filter((q) => q.includes('"RecoverySnapshot"'));
    const writeQueries = recoveryQueries.filter((q) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(q));

    expect(writeQueries).toHaveLength(0);

    await tracedPrisma.$disconnect();
  });

  it('1.7 Store isolation: store.recoverySnapshots getter and data.recoverySnapshots are disabled', () => {
    expect(() => (store as any).recoverySnapshots).toThrow(/is disabled/);
    expect(() => (store['data'] as any).recoverySnapshots).toThrow(/is disabled/);
  });

  it('1.8 deleteJourneyArchive detaches recoverySnapshot.journeyId in the database', async () => {
    const journeyId = await seedJourney('completed', 'archive_detach');
    const snapshotId = `recovery_detach_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await prisma.recoverySnapshot.create({
      data: {
        id: snapshotId,
        userId: owner,
        journeyId,
        summary: '归档解除关联测试快照',
        signals: { sleep: 'yes' },
      },
    });

    await batch1Persistence.deleteJourneyArchive({
      journeyId,
      userId: owner,
      archiveRoute: '/pages/archive/index',
    });

    // LifeJourney is deleted
    const dbJourney = await prisma.lifeJourney.findUnique({ where: { id: journeyId } });
    expect(dbJourney).toBeNull();

    // RecoverySnapshot survives with journeyId set to null
    const dbSnapshot = await prisma.recoverySnapshot.findUnique({ where: { id: snapshotId } });
    expect(dbSnapshot).not.toBeNull();
    expect(dbSnapshot?.journeyId).toBeNull();
    expect(dbSnapshot?.summary).toBe('归档解除关联测试快照');
  });

  it('1.9 Recovery data preserves summary and signals faithfully without medical scores or diagnosis', async () => {
    const checkinRes = await request(app.getHttpServer())
      .post('/api/v1/me/recovery')
      .set('x-goodnight-user-id', identityFor(owner))
      .send({
        summary: '今天在公园散步了30分钟，心情稍微平静了些。',
        signals: { sleep: 'yes', walk: 'yes', appetite: 'partial' },
      })
      .expect(201);

    const item = checkinRes.body.item;
    expect(item.summary).toBe('今天在公园散步了30分钟，心情稍微平静了些。');
    expect(item.signals).toEqual({ sleep: 'yes', walk: 'yes', appetite: 'partial' });
    expect(item.medicalScore).toBeUndefined();
    expect(item.diagnosis).toBeUndefined();
    expect(item.recoveryLevel).toBeUndefined();

    const dbRow = await prisma.recoverySnapshot.findUnique({ where: { id: item.id } });
    expect(dbRow?.summary).toBe('今天在公园散步了30分钟，心情稍微平静了些。');
    expect(dbRow?.signals).toEqual({ sleep: 'yes', walk: 'yes', appetite: 'partial' });
    expect((dbRow as any).medicalScore).toBeUndefined();
    expect((dbRow as any).diagnosis).toBeUndefined();
  });

  it('1.10 Linking a recovery snapshot to another user journey is refused', async () => {
    const foreignJourneyId = await seedJourney('active', 'foreign_journey', other);

    await expect(
      selfPersistence.appendRecoverySnapshot({
        userId: owner,
        journeyId: foreignJourneyId,
        summary: '尝试越权关联他人的旅程',
      }),
    ).rejects.toThrow(/旅程不存在或无权访问/);
  });
});
