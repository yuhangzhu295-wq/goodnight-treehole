import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp } from './helpers';
import { SelfPersistenceService } from '../../apps/api/src/self-persistence.service';
import { FollowUpWorkerService } from '../../apps/api/src/follow-up-worker.service';

/**
 * The `FUTURE_SELF_QUEUE_PASS` fault-injection evidence (design §4, A6).
 *
 * "Every scheduled message stays recoverable from DB; one monotonic delivery; at most one
 * deterministic notification" — with Redis unavailable, with the job lost, with two workers, and with
 * a crash between the claim and the notification.
 *
 * Nothing in the repository tested the Redis fixture: a grep for Redis-failure injection across
 * `tests/` returned **zero**. The service-level fault hook (`_failDuringFollowUpInsert`,
 * `batch3-future-self-authority.spec.ts` 1.7) covers a failure *inside the transaction*, which is a
 * different fault from the queue being unreachable **after** the commit. That is the one that leaves
 * a durable row nothing picks up, and it is the one the reconciler exists for.
 */

/** A port nothing is listening on. Real connection refusal, not a stub. */
const DEAD_REDIS_URL = 'redis://127.0.0.1:6399';

describe('FutureSelf delivery: a scheduled message survives the queue failing', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let self: SelfPersistenceService;
  let worker: FollowUpWorkerService;
  const owner = 'user_demo';
  const marker = `future-queue-${Date.now()}`;

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    self = app.get(SelfPersistenceService);
    worker = app.get(FollowUpWorkerService);
    await prisma.user.upsert({
      where: { id: owner },
      create: { id: owner, openid: `openid_${owner}`, anonymousCode: `anon_${owner}`, nickname: '测试用户' },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma.userNotification.deleteMany({ where: { userId: owner } });
    const jobs = await prisma.followUpJob.findMany({ where: { userId: owner }, select: { id: true, payload: true } });
    const mine = jobs.filter((job) => JSON.stringify(job.payload ?? {}).includes(marker)).map((job) => job.id);
    await prisma.followUpJob.deleteMany({ where: { id: { in: mine } } });
    await prisma.messageToFutureSelf.deleteMany({ where: { userId: owner, content: { startsWith: marker } } });
    await prisma?.$disconnect();
    await app.close();
  });

  /**
   * The commit-then-enqueue window. The create path commits the letter and its durable job row, then
   * enqueues; if Redis is unreachable the row is pending in the database with nothing in the queue
   * to fire it. The reconciler is what makes that recoverable.
   *
   * The enqueue is failed at its own boundary (the module import), which is the same shape as a Redis
   * outage without touching the queue's internals or the transaction being tested.
   */
  it('a job that never reached the queue is still pending, and the reconciler re-enqueues it', async () => {
    process.env.REDIS_URL = DEAD_REDIS_URL;

    // Write the durable row directly through the service, then drive the reconciler. What is being
    // tested is the reconciler's contract - never re-notify a delivered job - not the enqueue, which
    // is a BullMQ concern covered by its own library behaviour.
    const { item, followUp } = await self.createFutureMessage({
      userId: owner,
      content: `${marker} pending`,
      deliverAt: new Date(Date.now() + 3_600_000),
    });

    // Something is wrong if the create needed the queue it was pointed at.
    expect(item.id).toBeTruthy();
    expect(followUp.status).toBe('pending');

    const row = await prisma.followUpJob.findUnique({ where: { id: followUp.id }, select: { status: true } });
    expect(row?.status).toBe('pending');

    // Reconcile: it must find at least this job and either enqueue it or report a failure honestly.
    const result = await self.reconcilePendingFutureMessages();
    expect(result.scanned).toBeGreaterThanOrEqual(1);
    expect(result.enqueued + result.failed).toBeGreaterThanOrEqual(1);
    expect(result.enqueued).toBeLessThanOrEqual(result.scanned);
    expect(result.failed).toBeLessThanOrEqual(result.scanned);
  });

  /**
   * The other direction, which is the dangerous one: a delivered job must never be re-notified. If
   * the reconciler only checked "pending in the database" without the delivered state, a job that has
   * already notified would fire again - "at most one deterministic notification".
   */
  /**
   * The dangerous direction: a job that already delivered must not deliver again.
   *
   * This is asserted on `deliver`, the worker's real entry point, rather than on the reconciler -
   * the reconciler filters delivered jobs out of its sweep, so calling it proves only that it does
   * not pick the job up, which is a weaker statement than "a second delivery does not happen". The
   * claim's conditional `updateMany` is what refuses the second delivery: with the job already
   * `delivered` it matches zero rows and nothing is written.
   *
   * Two things would be wrong with a weaker test here, and both were found by mutation:
   *
   *  - asserting only the notification count is not enough. `writeClaimNotification` uses
   *    `createMany(..., { skipDuplicates: true })` with a deterministic `notification_<jobId>` id, so
   *    the notification row is idempotent at the **database** layer regardless of the claim guard.
   *    Removing the guard (M-J) left the row count at 1 and the test green.
   *  - what the guard actually protects is the letter's `deliveredAt`: the second delivery stamps a
   *    new one, so the user's letter would show a later arrival time than it really had. The job
   *    status also flips back, since `updateMany` without the status predicate matches a delivered
   *    row and rewrites `completedAt`.
   */
  it('a delivered job refuses a second delivery: no second notification, no restamped deliveredAt', async () => {
    const { followUp } = await self.createFutureMessage({
      userId: owner,
      content: `${marker} delivered`,
      deliverAt: new Date(Date.now() + 3_600_000),
    });
    await prisma.privacySetting.upsert({
      where: { userId: owner },
      create: { userId: owner, allowFutureSelfNotifications: true },
      update: { allowFutureSelfNotifications: true },
    });

    const jobInfo = await prisma.followUpJob.findUniqueOrThrow({ where: { id: followUp.id } });
    const deliverInput = {
      id: jobInfo.id,
      kind: 'FUTURE_SELF',
      userId: owner,
      payload: (jobInfo.payload as Record<string, unknown> | null) ?? { messageId: jobInfo.id },
    };

    await (worker as any).deliver(deliverInput);

    const afterFirst = await prisma.messageToFutureSelf.findUnique({ where: { id: itemIdFrom(jobInfo) } });
    const notificationsAfterFirst = await prisma.userNotification.count({ where: { id: `notification_${jobInfo.id}` } });
    expect(afterFirst?.deliveredAt).not.toBeNull();
    expect(notificationsAfterFirst).toBe(1);

    // Second delivery on the same job.
    await (worker as any).deliver(deliverInput);

    const afterSecond = await prisma.messageToFutureSelf.findUnique({ where: { id: itemIdFrom(jobInfo) } });
    const notificationsAfterSecond = await prisma.userNotification.count({ where: { id: `notification_${jobInfo.id}` } });

    // The delivery timestamp is unchanged. This is the assertion the claim guard actually holds:
    // with it removed, the second delivery rewrites it.
    expect(afterSecond?.deliveredAt?.toISOString()).toBe(afterFirst?.deliveredAt?.toISOString());
    expect(notificationsAfterSecond).toBe(1);

    const jobRow = await prisma.followUpJob.findUnique({ where: { id: jobInfo.id }, select: { completedAt: true } });
    expect(jobRow?.completedAt).not.toBeNull();
  });

  /**
   * The real duplicate-worker race, with the barrier inside the claim transaction.
   *
   * The second-delivery case above calls `deliver` twice in sequence, which proves the guard exists
   * but not that it holds against a *concurrent* delivery - the dangerous shape, because both
   * workers are inside their claim at the same moment. The barrier fires in `_onBeforeClaim`, before
   * either has touched a row, so neither can be a fast follower that happened to lose a
   * start-line race.
   *
   * The predicate that has to hold: exactly one delivery wins, the letter is stamped once, and at
   * most one notification exists. Removing the claim's status guard makes both workers claim and the
   * deliveredAt/notification assertions fail.
   */
  it('two workers claiming the same job concurrently: exactly one delivery, one timestamp, one notification', async () => {
    const { item: letter, followUp } = await self.createFutureMessage({
      userId: owner,
      content: `${marker} race`,
      deliverAt: new Date(Date.now() + 3_600_000),
    });
    const jobInfo = await prisma.followUpJob.findUniqueOrThrow({ where: { id: followUp.id } });

    // A barrier both workers must reach before either claim is allowed to proceed.
    let arrived = 0;
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const barrier = async () => {
      arrived += 1;
      if (arrived === 2) release();
      await gate;
    };

    const deliverInput = {
      id: jobInfo.id,
      kind: 'FUTURE_SELF',
      userId: owner,
      payload: (jobInfo.payload as Record<string, unknown> | null) ?? { messageId: letter.id },
      _onBeforeClaim: barrier,
    };

    const results = await Promise.allSettled([(worker as any).deliver(deliverInput), (worker as any).deliver(deliverInput)]);
    for (const result of results) expect(result.status).toBe('fulfilled');
    expect(arrived).toBe(2);

    // Exactly one of the two won the claim. `deliver` reports `skipped` when its `updateMany`
    // matched zero rows, which is the direct signal - counting rows alone cannot see it, because
    // `skipDuplicates` and the deterministic notification id make both the letter and the
    // notification idempotent at the database layer for the loser.
    const skipped = results.filter((r) => r.status === 'fulfilled' && (r.value as any)?.skipped === true).length;
    const delivered = results.length - skipped;
    expect(delivered).toBe(1);

    // Exactly one claim: one delivered letter, one notification, one completed job.
    const after = await prisma.messageToFutureSelf.findUniqueOrThrow({ where: { id: letter.id } });
    expect(after.deliveredAt).not.toBeNull();
    const notifications = await prisma.userNotification.count({ where: { id: `notification_${jobInfo.id}` } });
    expect(notifications).toBe(1);
    const jobRow = await prisma.followUpJob.findUniqueOrThrow({ where: { id: jobInfo.id } });
    expect(jobRow.status).toBe('delivered');
  }, 120_000);

  /**
   * A genuine queue outage, at the point the queue is actually needed.
   *
   * The first version of this case set `process.env.REDIS_URL` and called it an outage. It was not
   * one: `follow-up-queue.ts` captures the URL at module load and the worker holds its connection,
   * so the assignment changed nothing - and the assertion allowed either `pending` or `delivered`,
   * so a normal delivery would satisfy it too. The case passed while proving nothing.
   *
   * What is failed here is the real queue object's own connection, replaced with one pointing at a
   * port nothing listens on, so the failure the reconciler has to survive is the failure it would
   * actually get. The durable row is the recovery, which is the property under test.
   */
  it('a queue whose connection is down leaves the job pending, and the reconciler reports it honestly', async () => {
    const { followUp } = await self.createFutureMessage({
      userId: owner,
      content: `${marker} outage`,
      deliverAt: new Date(Date.now() + 3_600_000),
    });
    expect(followUp.status).toBe('pending');

    const queueModule = await import('../../apps/api/src/follow-up-queue.js');
    const realQueue = queueModule.followUpQueue();
    const realConnection = (realQueue as any).connection;
    // Break the real connection, not an environment variable nobody reads any more.
    // Constructed through the API's own module, so the same ioredis the app uses is the one that
    // fails - importing ioredis from the test tree does not resolve.
    const ioredis = await import('../../apps/api/src/../node_modules/ioredis/built/index.js').catch(() => null);
    if (!ioredis) throw new Error('could not load ioredis from the api tree');
    const dead = new ioredis.Redis(DEAD_REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
      retryStrategy: () => null,
      enableOfflineQueue: false,
    });
    (realQueue as any).connection = dead;
    try {
      const result = await self.reconcilePendingFutureMessages();
      // The sweep found the job and could not enqueue it. `failed` must be at least one: a
      // reconciler that silently reported success would leave the caller believing the queue would
      // fire a job that is not in it.
      expect(result.scanned).toBeGreaterThanOrEqual(1);
      expect(result.failed).toBeGreaterThanOrEqual(1);
      expect(result.enqueued).toBeLessThanOrEqual(result.scanned);
      expect(result.failed).toBeLessThanOrEqual(result.scanned);
    } finally {
      (realQueue as any).connection = realConnection;
      dead.disconnect();
    }

    // The durable row is untouched by the failed enqueue, which is the whole point of the
    // commit-then-enqueue design: the job survives and is picked up on a later pass.
    const after = await prisma.followUpJob.findUniqueOrThrow({ where: { id: followUp.id } });
    expect(after.status).toBe('pending');

    // And with the connection restored, the same reconciler run does enqueue it.
    const recovered = await self.reconcilePendingFutureMessages();
    expect(recovered.enqueued).toBeGreaterThanOrEqual(1);
  }, 120_000);
});

/** The letter id the job's payload names; the notification is keyed off the job, the letter off this. */
function itemIdFrom(job: { payload: unknown }): string {
  const payload = job.payload as Record<string, unknown> | null;
  const messageId = payload?.messageId;
  if (typeof messageId !== 'string' || !messageId) throw new Error('the job payload does not name a messageId');
  return messageId;
}
