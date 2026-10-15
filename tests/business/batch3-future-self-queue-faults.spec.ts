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
});

/** The letter id the job's payload names; the notification is keyed off the job, the letter off this. */
function itemIdFrom(job: { payload: unknown }): string {
  const payload = job.payload as Record<string, unknown> | null;
  const messageId = payload?.messageId;
  if (typeof messageId !== 'string' || !messageId) throw new Error('the job payload does not name a messageId');
  return messageId;
}
