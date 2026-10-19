import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp } from './helpers';

/**
 * AI routes must exist in the table after boot, not only in the store's snapshot.
 *
 * `AIStyleRoute` is database-authoritative since Batch 4, so the flush no longer hydrates or upserts
 * the routes the legacy seed carried. On a fresh database that left the table empty and every AI job
 * failed with "no AI route" - which is how `batch1-aijob` found the defect, but that spec also mocks
 * the provider and seeds its own routes, so it could not have caught the seed itself disappearing.
 *
 * This asserts against the database after a real boot, which is the state a fresh install starts in.
 */
describe('AI route seeding at boot', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  it('boots with the five styles in the table, pointing at providers that exist', async () => {
    const routes = await prisma.aIStyleRoute.findMany({ orderBy: { style: 'asc' } });
    const styles = routes.map((route) => route.style);
    for (const required of ['warm', 'rational', 'light', 'clear', 'poetic']) {
      expect(styles).toContain(required);
    }
    // Every provider the routes name must exist, because those relations are required foreign keys.
    // A route seeded against a provider that was never written would fail to insert, which is the
    // other half of "the seed is real".
    const providerIds = [...new Set(routes.flatMap((r) => [r.primaryProviderId, r.backupProviderId, r.fallbackTemplateId]))];
    const providers = await prisma.aIProvider.findMany({ where: { id: { in: providerIds } }, select: { id: true } });
    expect(providers.map((p) => p.id).sort()).toEqual(providerIds.sort());
    expect(routes.every((route) => route.enabled)).toBe(true);
  }, 120_000);

  it('a boot on an empty route table re-seeds it', async () => {
    // Exactly the state a fresh install is in: routes gone, providers present (the policy writes
    // those at boot). Re-running the store's own coverage pass must restore the routes.
    await prisma.aIStyleRoute.deleteMany({});
    expect(await prisma.aIStyleRoute.count()).toBe(0);

    const { StoreService } = await import('../../apps/api/src/store.service.js');
    const store = app.get(StoreService);
    await (store as any).ensureAiRouteSeedCoverage();

    const after = await prisma.aIStyleRoute.count();
    expect(after).toBeGreaterThanOrEqual(5);
  }, 120_000);
});
