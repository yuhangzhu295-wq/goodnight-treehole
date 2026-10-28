import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp } from './helpers';
import { Batch1PersistenceService } from '../../apps/api/src/batch1-persistence.service';

/**
 * The journey status transition rule (Batch 3 design §0.7/F3, §0.9/H1, §0.10/I1/J1-J3, §0.13).
 *
 * Two things this file has to establish, and one it must not fake:
 *  - both general status entry points refuse a transition out of a terminal status;
 *  - the guard is evaluated **after** the locks, which a refusal alone cannot show — a guard that
 *    read before locking would also refuse. The ordering is carried by the forced interleaving plus
 *    the mutation recorded in `scripts/batch3-step1-mutation-check.ts`.
 */

class StrictBarrier {
  private readonly parties = new Set<string>();
  private readonly arrived = new Set<string>();
  private readonly resolvers = new Map<string, () => void>();
  private readonly timeoutMs: number;

  constructor(names: string[], timeoutMs = 6000) {
    for (const name of names) this.parties.add(name);
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
    for (const name of this.parties) expect(this.arrived.has(name)).toBe(true);
  }
}

describe('Batch 3: journey status transition rule', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let persistence: Batch1PersistenceService;
  const userId = 'user_demo';

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    persistence = app.get(Batch1PersistenceService);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  async function seedJourney(status: 'active' | 'paused' | 'completed' | 'archived', label: string) {
    const id = `journey_transition_${label}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await prisma.lifeJourney.create({
      data: {
        id,
        userId,
        title: `状态切换用例 ${label}`,
        domain: '生活',
        status,
        stage: status === 'completed' ? 'graduated' : 'clarifying',
        visibility: 'PRIVATE',
        completedAt: status === 'completed' ? new Date() : null,
      },
    });
    return id;
  }

  it('1.1 A completed journey cannot be reopened through updateJourneyStatus', async () => {
    const id = await seedJourney('completed', 'completed_status_endpoint');

    await expect(persistence.updateJourneyStatus(id, 'active', userId)).rejects.toThrow(/完整历史/);
    await expect(persistence.updateJourneyStatus(id, 'paused', userId)).rejects.toThrow(/完整历史/);

    const row = await prisma.lifeJourney.findUnique({ where: { id } });
    expect(row?.status).toBe('completed');
  });

  it('1.2 A completed journey cannot be reopened through patchJourney either', async () => {
    const id = await seedJourney('completed', 'completed_patch_endpoint');

    await expect(persistence.patchJourney(id, { status: 'active' }, undefined, userId)).rejects.toThrow(/完整历史/);

    const row = await prisma.lifeJourney.findUnique({ where: { id } });
    expect(row?.status).toBe('completed');
  });

  it('1.3 An archived journey cannot be reopened through the general endpoints (restore has its own path)', async () => {
    const id = await seedJourney('archived', 'archived_status_endpoint');

    await expect(persistence.updateJourneyStatus(id, 'active', userId)).rejects.toThrow(/不支持/);
    await expect(persistence.patchJourney(id, { status: 'active' }, undefined, userId)).rejects.toThrow(/不支持/);

    expect((await prisma.lifeJourney.findUnique({ where: { id } }))?.status).toBe('archived');
  });

  it('1.4 A same-status request is a status-preserving write, not a refused transition', async () => {
    const id = await seedJourney('paused', 'same_status_metadata');

    // The existing hybrid PATCH contract sends the same status together with metadata.
    const updated = await persistence.patchJourney(id, { status: 'paused', title: '改过的标题' }, undefined, userId);
    expect(updated.status).toBe('paused');
    expect(updated.title).toBe('改过的标题');
  });

  it('1.5 The guard runs after the lock: a graduation committing while a status request waits must still refuse', async () => {
    const id = await seedJourney('active', 'interleaving');

    // The barrier is placed BEFORE either lock, so the request may hold a stale pre-lock read.
    // Graduation must then commit **completely** before the request is released — releasing both at
    // the same moment would only show that they race, not that the guard is evaluated after the
    // lock. A guard that read before locking would see `active`, decide that `paused` is legal, and
    // write, which is what the recorded mutation reproduces.
    const barrier = new StrictBarrier(['statusRequestParked', 'graduationStarting']);
    let graduationDone: () => void = () => {};
    const graduationCommitted = new Promise<void>((resolve) => {
      graduationDone = resolve;
    });

    const statusRequest = persistence.patchJourney(id, { status: 'paused' }, undefined, userId, {
      _onBeforeLock: async () => {
        await barrier.enter('statusRequestParked');
        // Released by the barrier, but held here until graduation has fully committed.
        await graduationCommitted;
      },
    });

    const graduation = (async () => {
      await barrier.enter('graduationStarting');
      const result = await persistence.graduateJourney(id, userId);
      graduationDone();
      return result;
    })();

    const [statusOutcome, graduationOutcome] = await Promise.allSettled([statusRequest, graduation]);
    barrier.assertAllArrived();

    expect(graduationOutcome.status).toBe('fulfilled');
    expect((graduationOutcome as PromiseFulfilledResult<{ transitioned: boolean }>).value.transitioned).toBe(true);
    expect(statusOutcome.status).toBe('rejected');
    expect(String((statusOutcome as PromiseRejectedResult).reason?.message ?? '')).toMatch(/完整历史|不支持/);

    const row = await prisma.lifeJourney.findUnique({ where: { id } });
    expect(row?.status).toBe('completed');
  }, 30_000);

  it('1.6 The same interleaving through updateJourneyStatus must also refuse', async () => {
    const id = await seedJourney('active', 'interleaving_status_endpoint');

    // The design requires the ordering proven **per entry point**: a rule fixed at one of them while
    // the other still reads before locking is exactly the defect this covers. Same shape as 1.5.
    const barrier = new StrictBarrier(['statusRequestParked', 'graduationStarting']);
    let graduationDone: () => void = () => {};
    const graduationCommitted = new Promise<void>((resolve) => {
      graduationDone = resolve;
    });

    const statusRequest = persistence.updateJourneyStatus(id, 'paused', userId, {
      _onBeforeLock: async () => {
        await barrier.enter('statusRequestParked');
        await graduationCommitted;
      },
    });

    const graduation = (async () => {
      await barrier.enter('graduationStarting');
      const result = await persistence.graduateJourney(id, userId);
      graduationDone();
      return result;
    })();

    const [statusOutcome, graduationOutcome] = await Promise.allSettled([statusRequest, graduation]);
    barrier.assertAllArrived();

    expect((graduationOutcome as PromiseFulfilledResult<{ transitioned: boolean }>).value.transitioned).toBe(true);
    expect(statusOutcome.status).toBe('rejected');
    expect(String((statusOutcome as PromiseRejectedResult).reason?.message ?? '')).toMatch(/完整历史|不支持/);
    expect((await prisma.lifeJourney.findUnique({ where: { id } }))?.status).toBe('completed');
  }, 30_000);

  it('2.1 Duplicate graduation transitions once: the second call reports transitioned=false', async () => {
    const id = await seedJourney('active', 'duplicate_graduation');

    const first = await persistence.graduateJourney(id, userId);
    expect(first.transitioned).toBe(true);
    expect(first.journey.status).toBe('completed');

    const second = await persistence.graduateJourney(id, userId);
    expect(second.transitioned).toBe(false);
    expect(second.journey.status).toBe('completed');
  });

  it('2.2 Concurrent graduation from two instances transitions exactly once', async () => {
    const id = await seedJourney('active', 'concurrent_graduation');

    const results = await Promise.all([
      persistence.graduateJourney(id, userId),
      persistence.graduateJourney(id, userId),
    ]);

    expect(results.filter((r) => r.transitioned)).toHaveLength(1);
    expect(results.every((r) => r.journey.status === 'completed')).toBe(true);
    expect((await prisma.lifeJourney.findUnique({ where: { id } }))?.status).toBe('completed');
  });

  it('2.3 Graduating an archived journey is refused and does not transition', async () => {
    const id = await seedJourney('archived', 'graduation_from_archived');

    await expect(persistence.graduateJourney(id, userId)).rejects.toThrow(/不支持/);
    expect((await prisma.lifeJourney.findUnique({ where: { id } }))?.status).toBe('archived');
  });
});
