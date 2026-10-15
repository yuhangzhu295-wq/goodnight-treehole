import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp } from './helpers';
import { FollowUpWorkerService } from '../../apps/api/src/follow-up-worker.service';

/**
 * The multi-instance half of the Batch 3 gate for one selected Self flow: a decision cooldown
 * (`MULTI_INSTANCE_SELECTED_FLOWS_PASS`).
 *
 * The gate asks for strict-barrier races, independent-client final rows, and DB-only reads on Self
 * flows. `batch1-multi-instance` covers journeys, actions, AI jobs and safety events; `batch2-peer-
 * verification` covers the peer tables. **No Self table has any cross-instance evidence.**
 *
 * The races chosen here are the two the design names:
 *
 *  1. **Two workers delivering the same cooldown job.** `deliver` claims with a conditional
 *     `updateMany` and then releases the cooldown inside the claim transaction (A6), so the
 *     question is whether the loser's release also lands - which would notify twice or re-release a
 *     cooldown that is already `released`.
 *  2. **A deliver overlapping the creation of the *next* cooldown.** If the old job's release landed
 *     after the new cooldown was written, the decision would go `ready` while its current cooldown is
 *     still running - the "stale worker sets a superseded decision ready early" failure.
 *
 * The barrier enters **inside** the transaction (`_onBeforeClaim`), and `assertAllArrived` fails if a
 * party never arrived, so a sequential run cannot produce a green result here.
 *
 * Final rows are read with an independent PrismaClient, never through the app's cached arrays.
 */
class StrictBarrier {
  private readonly parties: Set<string>;
  private readonly arrived = new Set<string>();
  private readonly resolvers = new Map<string, () => void>();
  private readonly timeoutMs: number;

  constructor(names: string[], timeoutMs = 8000) {
    this.parties = new Set(names);
    this.timeoutMs = timeoutMs;
  }

  async enter(name: string): Promise<void> {
    if (!this.parties.has(name)) throw new Error(`Unknown barrier party: ${name}`);
    this.arrived.add(name);
    if (this.arrived.size === this.parties.size) {
      for (const resolve of this.resolvers.values()) resolve();
      this.resolvers.clear();
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.resolvers.delete(name);
        reject(
          new Error(
            `StrictBarrier timeout: "${name}" waited ${this.timeoutMs}ms; arrived: [${[...this.arrived].join(', ')}]`,
          ),
        );
      }, this.timeoutMs);
      this.resolvers.set(name, () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  assertAllArrived(): void {
    for (const name of this.parties) expect(this.arrived.has(name), `barrier party "${name}" never arrived`).toBe(true);
  }
}

describe('Batch 3 multi-instance: a decision cooldown race', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let worker: FollowUpWorkerService;
  const userA = 'user_demo';
  const marker = `cooldown-race-${Date.now()}`;

  /** An independent client, so the final row is read from the database rather than a cached array. */
  let rows: PrismaClient;

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    rows = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    worker = app.get(FollowUpWorkerService);
    await prisma.user.upsert({
      where: { id: userA },
      create: { id: userA, openid: `openid_${userA}`, anonymousCode: `anon_${userA}`, nickname: '测试用户' },
      update: {},
    });
  });

  afterAll(async () => {
    const decisions = await prisma.decisionRecord.findMany({ where: { question: { startsWith: marker } }, select: { id: true } });
    const decisionIds = decisions.map((row) => row.id);
    const cooldowns = await prisma.cooldownItem.findMany({ where: { decisionId: { in: decisionIds } }, select: { id: true } });
    // FollowUpJob carries no decisionId column: the association is in payload, so the job ids are
    // collected by the marker in their payload rather than queried on a column that does not exist.
    const jobs = await prisma.followUpJob.findMany({ where: { userId: userA }, select: { id: true, payload: true } });
    const mine = jobs.filter((job) => JSON.stringify(job.payload ?? {}).includes('cooldown-race-')).map((job) => job.id);
    await prisma.followUpJob.deleteMany({ where: { id: { in: mine } } });
    await prisma.cooldownItem.deleteMany({ where: { id: { in: cooldowns.map((c) => c.id) } } });
    await prisma.decisionRecord.deleteMany({ where: { id: { in: decisionIds } } });
    await rows.$disconnect();
    await prisma?.$disconnect();
    await app.close();
  });

  it('two workers delivering the same cooldown job leave exactly one delivered job and one release', async () => {
    const decision = await prisma.decisionRecord.create({
      data: {
        userId: userA,
        question: `${marker} two workers?`,
        options: ['先开口', '先等一周'],
        criteria: ['成本', '对方感受'],
        status: 'cooling',
        cooldownUntil: new Date(Date.now() - 60_000),
      },
    });
    const cooldown = await prisma.cooldownItem.create({
      data: {
        userId: userA,
        decisionId: decision.id,
        title: `${marker} cooldown`,
        status: 'active',
        releaseAt: new Date(Date.now() - 60_000),
      },
    });
    const job = await prisma.followUpJob.create({
      data: {
        id: `job_${Date.now()}_a`,
        userId: userA,
        kind: 'DECISION_COOLDOWN',
        status: 'pending',
        dueAt: new Date(Date.now() - 60_000),
        payload: { decisionId: decision.id, cooldownId: cooldown.id },
      },
    });

    const barrier = new StrictBarrier(['workerA', 'workerB']);
    const jobInput = {
      id: job.id,
      kind: 'DECISION_COOLDOWN',
      userId: userA,
      decisionId: decision.id,
      payload: { decisionId: decision.id, cooldownId: cooldown.id },
    };
    const runA = (worker as any).deliver({ ...jobInput, _onBeforeClaim: () => barrier.enter('workerA') });
    const runB = (worker as any).deliver({ ...jobInput, _onBeforeClaim: () => barrier.enter('workerB') });
    await Promise.allSettled([runA, runB]);
    barrier.assertAllArrived();

    // Independent read of the final rows.
    const jobRow = await rows.followUpJob.findUnique({ where: { id: job.id } });
    const cooldownRow = await rows.cooldownItem.findUnique({ where: { id: cooldown.id } });
    const decisionRow = await rows.decisionRecord.findUnique({ where: { id: decision.id } });

    // Exactly one delivered claim: 'delivered' is a terminal state written by the winner, so two
    // winners would leave the second as 'pending' or flip it back.
    expect(jobRow?.status).toBe('delivered');
    expect(cooldownRow?.status).toBe('released');
    expect(decisionRow?.status).toBe('ready');
  });

  it('a competing deliver after a re-cool does not set the decision ready early', async () => {
    // Fresh decision on its own cooldown, so this test does not depend on the first one's leftovers.
    const decision = await prisma.decisionRecord.create({
      data: {
        userId: userA,
        question: `${marker} re-cool?`,
        options: ['先开口', '先等一周'],
        criteria: ['成本', '对方感受'],
        status: 'cooling',
        cooldownUntil: new Date(Date.now() + 3_600_000),
      },
    });
    const stale = await prisma.cooldownItem.create({
      data: {
        userId: userA,
        decisionId: decision.id,
        title: `${marker} cooldown`,
        status: 'active',
        releaseAt: new Date(Date.now() - 60_000),
      },
    });
    const job = await prisma.followUpJob.create({
      data: {
        id: `job_${Date.now()}_b`,
        userId: userA,
        kind: 'DECISION_COOLDOWN',
        status: 'pending',
        dueAt: new Date(Date.now() - 60_000),
        payload: { decisionId: decision.id, cooldownId: stale.id },
      },
    });

    // Before the job is delivered, the user re-cools the decision: the old cooldown becomes
    // superseded and a new, running one takes its place. That is the state a stale worker would see.
    await prisma.cooldownItem.updateMany({
      where: { id: stale.id, status: 'active' },
      data: { status: 'superseded' },
    });
    const current = await prisma.cooldownItem.create({
      data: {
        userId: userA,
        decisionId: decision.id,
        title: `${marker} current cooldown`,
        status: 'active',
        releaseAt: new Date(Date.now() + 3_600_000),
      },
    });

    await (worker as any).deliver({
      id: job.id,
      kind: 'DECISION_COOLDOWN',
      userId: userA,
      decisionId: decision.id,
      payload: { decisionId: decision.id, cooldownId: stale.id },
    });

    const decisionRow = await rows.decisionRecord.findUnique({ where: { id: decision.id } });
    const currentRow = await rows.cooldownItem.findUnique({ where: { id: current.id } });

    // The stale job's cooldown is superseded and its release is refused, so the decision stays
    // cooling and the current cooldown is untouched.
    expect(decisionRow?.status).toBe('cooling');
    expect(currentRow?.status).toBe('active');

    const active = await rows.cooldownItem.count({ where: { decisionId: decision.id, status: 'active' } });
    expect(active).toBe(1);
  });
});
