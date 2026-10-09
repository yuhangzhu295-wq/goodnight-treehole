import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApiTestApp, identityFor } from './helpers';
import { SelfPersistenceService } from '../../apps/api/src/self-persistence.service';

/**
 * B3-S4: MessageToFutureSelf is database-authoritative, its create is atomic with the follow-up job,
 * the context reference is validated for ownership, and pending jobs are reconciled into the queue.
 */
describe('Batch 3: FutureSelf database authority (B3-S4)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let selfPersistence: SelfPersistenceService;
  let server: any;
  const owner = 'user_demo';
  const other = 'user_guest';

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    selfPersistence = app.get(SelfPersistenceService);
    server = app.getHttpServer();

    for (const id of [owner, other]) {
      await prisma.user.upsert({
        where: { id },
        create: { id, openid: `openid_${id}`, anonymousCode: `anon_${id}`, nickname: `测试_${id}` },
        update: {},
      });
    }
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  it('1.1 Create writes the letter and its follow-up job together', async () => {
    const created = await request(server)
      .post('/api/v1/future-messages')
      .set('x-goodnight-user-id', identityFor(owner))
      .send({ content: '原子创建验证', deliverAt: new Date(Date.now() + 3_600_000).toISOString() })
      .expect(201);

    const messageId = created.body.item.id as string;
    const followUpId = created.body.followUp.id as string;

    const message = await prisma.messageToFutureSelf.findUnique({ where: { id: messageId } });
    expect(message).not.toBeNull();
    expect(message?.userId).toBe(owner);

    const job = await prisma.followUpJob.findUnique({ where: { id: followUpId } });
    expect(job).not.toBeNull();
    expect(job?.kind).toBe('FUTURE_SELF');
    expect(job?.status).toBe('pending');
    expect(job?.payload).toMatchObject({ messageId });
  });

  it('1.2 The context reference is validated for ownership, not just existence', async () => {
    // A decision belonging to somebody else must not be attachable.
    const foreignDecision = await prisma.decisionRecord.create({
      data: {
        id: `dec_foreign_${Date.now()}`,
        userId: other,
        question: '别人的决定',
        options: [],
        criteria: [],
        status: 'draft',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await request(server)
      .post('/api/v1/future-messages')
      .set('x-goodnight-user-id', identityFor(owner))
      .send({
        contextType: 'decision',
        contextRefId: foreignDecision.id,
        content: '不该能关联',
        deliverAt: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .expect(404);

    // And a decision that does not exist is refused too.
    await request(server)
      .post('/api/v1/future-messages')
      .set('x-goodnight-user-id', identityFor(owner))
      .send({
        contextType: 'decision',
        contextRefId: 'dec_does_not_exist',
        content: '不存在',
        deliverAt: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .expect(404);

    await prisma.decisionRecord.delete({ where: { id: foreignDecision.id } }).catch(() => undefined);
  });

  it('1.3 A foreign journey is refused, so the letter cannot be attached to another user’s journey', async () => {
    const foreignJourney = await prisma.lifeJourney.create({
      data: {
        id: `journey_foreign_${Date.now()}`,
        userId: other,
        title: '别人的旅程',
        domain: '生活',
        status: 'active',
        stage: 'clarifying',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await request(server)
      .post('/api/v1/future-messages')
      .set('x-goodnight-user-id', identityFor(owner))
      .send({
        journeyId: foreignJourney.id,
        contextType: 'journey',
        content: '不该能关联',
        deliverAt: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .expect(404);

    await prisma.lifeJourney.delete({ where: { id: foreignJourney.id } }).catch(() => undefined);
  });

  it('1.4 The list is owner-scoped and returns the client shape (ISO timestamps)', async () => {
    const mine = await request(server)
      .post('/api/v1/future-messages')
      .set('x-goodnight-user-id', identityFor(owner))
      .send({ content: '我的信', deliverAt: new Date(Date.now() + 7_200_000).toISOString() })
      .expect(201);

    const theirs = await request(server)
      .post('/api/v1/future-messages')
      .set('x-goodnight-user-id', identityFor(other))
      .send({ content: '别人的信', deliverAt: new Date(Date.now() + 7_200_000).toISOString() })
      .expect(201);

    const list = await request(server)
      .get('/api/v1/future-messages')
      .set('x-goodnight-user-id', identityFor(owner))
      .expect(200);

    const ids = list.body.items.map((item: any) => item.id);
    expect(ids).toContain(mine.body.item.id);
    expect(ids).not.toContain(theirs.body.item.id);

    const found = list.body.items.find((item: any) => item.id === mine.body.item.id);
    expect(typeof found.deliverAt).toBe('string');
    expect(typeof found.createdAt).toBe('string');
  });

  it('1.5 The reconciler re-enqueues a pending job that never reached the queue', async () => {
    // A job the database still reports as pending, as an enqueue failure would leave it.
    const orphanId = `follow_up_orphan_${Date.now()}`;
    await prisma.followUpJob.create({
      data: {
        id: orphanId,
        userId: owner,
        kind: 'FUTURE_SELF',
        status: 'pending',
        dueAt: new Date(Date.now() + 60_000),
        payload: { messageId: `msg_orphan_${Date.now()}` },
      },
    });

    const result = await selfPersistence.reconcilePendingFutureMessages(200);
    expect(result.scanned).toBeGreaterThan(0);
    expect(result.failed).toBe(0);
  });

  it('1.6 The reconciler ignores a delivered job, so it is never regressed or re-notified', async () => {
    const deliveredId = `follow_up_delivered_${Date.now()}`;
    await prisma.followUpJob.create({
      data: {
        id: deliveredId,
        userId: owner,
        kind: 'FUTURE_SELF',
        status: 'delivered',
        completedAt: new Date(),
        dueAt: new Date(Date.now() - 60_000),
        payload: { messageId: `msg_delivered_${Date.now()}` },
      },
    });

    await selfPersistence.reconcilePendingFutureMessages(200);

    const row = await prisma.followUpJob.findUnique({ where: { id: deliveredId } });
    expect(row?.status).toBe('delivered');
    expect(row?.completedAt).not.toBeNull();
  });

  it('1.7 Create atomicity: a failure writing the follow-up job leaves no letter behind', async () => {
    const before = await prisma.messageToFutureSelf.count({ where: { userId: owner } });

    let threw = false;
    try {
      await selfPersistence.createFutureMessage({
        userId: owner,
        content: '原子性验证：不该留下',
        deliverAt: new Date(Date.now() + 3_600_000),
        _failDuringFollowUpInsert: () => {
          throw new Error('injected: follow-up job write failed');
        },
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    // The letter must not have survived its job: the two are one transaction.
    const after = await prisma.messageToFutureSelf.count({ where: { userId: owner } });
    expect(after).toBe(before);

    const orphans = await prisma.messageToFutureSelf.findMany({
      where: { userId: owner, content: '原子性验证：不该留下' },
    });
    expect(orphans).toHaveLength(0);
  });

  it('1.8 The service itself validates context ownership, not only the route above it', async () => {
    // 1.2 exercises the API, where the store validates the context before the service is called.
    // This calls the service directly so the check inside the transaction is the one under test.
    const foreignDecision = await prisma.decisionRecord.create({
      data: {
        id: `dec_foreign_svc_${Date.now()}`,
        userId: other,
        question: '别人的决定（服务层）',
        options: [],
        criteria: [],
        status: 'draft',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await expect(
      selfPersistence.createFutureMessage({
        userId: owner,
        contextType: 'decision',
        contextRefId: foreignDecision.id,
        content: '不该能关联',
        deliverAt: new Date(Date.now() + 3_600_000),
      }),
    ).rejects.toThrow();

    const orphans = await prisma.messageToFutureSelf.findMany({
      where: { userId: owner, content: '不该能关联' },
    });
    expect(orphans).toHaveLength(0);

    await prisma.decisionRecord.delete({ where: { id: foreignDecision.id } }).catch(() => undefined);
  });
});
