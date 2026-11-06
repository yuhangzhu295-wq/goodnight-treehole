import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp, identityFor, DEMO_USER_ID } from './helpers';

/**
 * Batch 3 gate — `SELF_FULL_FLUSH=false`.
 *
 * The claim to establish: a legacy flush issues **no statement** against the ten Self tables, so it
 * can neither overwrite a DB-authoritative row with a stale snapshot nor sweep one away.
 *
 * The probe is a **statement-level** trigger on each table. Statement-level triggers fire even when
 * the statement matches zero rows, which is exactly the signature of the defect this guards: the old
 * sweep collapsed to `deleteMany({})` and wiped a whole table when the in-memory array was empty. A
 * row-level trigger would see nothing there and report a false pass.
 *
 * The probe self-tests first, so a detector that cannot see a zero-row statement fails the run
 * instead of reporting an empty probe as success.
 */
const SELF_TABLES = [
  'PrivacySetting',
  'TrustedContact',
  'StableSelfProfile',
  'RealityHandoff',
  'PersonalSupportPlan',
  'MemoryItem',
  'RecoverySnapshot',
  'DecisionRecord',
  'CooldownItem',
  'MessageToFutureSelf',
];

describe('Batch 3 gate — the legacy flush writes nothing to the ten Self tables', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: unknown;

  const probeRows = async () =>
    (await prisma.$queryRawUnsafe(
      'SELECT "table_name" AS "table", "op", count(*)::int AS "n" FROM "self_flush_probe" GROUP BY 1, 2 ORDER BY 1, 2',
    )) as Array<{ table: string; op: string; n: number }>;
  const clearProbe = () => prisma.$executeRawUnsafe('TRUNCATE "self_flush_probe"');

  beforeAll(async () => {
    app = await createApiTestApp();
    server = app.getHttpServer();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "self_flush_probe" (id serial PRIMARY KEY, "table_name" text NOT NULL, "op" text NOT NULL, "at" timestamptz NOT NULL DEFAULT now())',
    );
    await prisma.$executeRawUnsafe(
      'CREATE OR REPLACE FUNCTION self_flush_probe_fn() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN INSERT INTO "self_flush_probe"("table_name","op") VALUES (TG_TABLE_NAME, TG_OP); RETURN NULL; END $fn$',
    );
    for (const table of SELF_TABLES) {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS self_flush_probe ON "${table}"`);
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER self_flush_probe AFTER INSERT OR UPDATE OR DELETE ON "${table}" FOR EACH STATEMENT EXECUTE FUNCTION self_flush_probe_fn()`,
      );
    }
  }, 120_000);

  afterAll(async () => {
    for (const table of SELF_TABLES) {
      await prisma?.$executeRawUnsafe(`DROP TRIGGER IF EXISTS self_flush_probe ON "${table}"`).catch(() => undefined);
    }
    await prisma?.$executeRawUnsafe('DROP FUNCTION IF EXISTS self_flush_probe_fn()').catch(() => undefined);
    await prisma?.$executeRawUnsafe('DROP TABLE IF EXISTS "self_flush_probe"').catch(() => undefined);
    await prisma?.$disconnect();
    await app?.close();
  });

  it('the probe sees a statement that changes no rows (self-test)', async () => {
    // Without this, an empty probe result would be indistinguishable from a blind detector: this
    // statement matches zero rows, exactly like `deleteMany({})` on an empty snapshot.
    await clearProbe();
    await prisma.$executeRawUnsafe('UPDATE "StableSelfProfile" SET "updatedAt" = "updatedAt" WHERE false');
    const rows = await probeRows();
    expect(rows).toEqual([{ table: 'StableSelfProfile', op: 'UPDATE', n: 1 }]);
  });

  it('the probe sees a zero-row DELETE, the exact shape of the old sweep', async () => {
    await clearProbe();
    await prisma.$executeRawUnsafe('DELETE FROM "MemoryItem" WHERE false');
    const rows = await probeRows();
    expect(rows).toEqual([{ table: 'MemoryItem', op: 'DELETE', n: 1 }]);
  });

  it('a legacy flush writes nothing to any Self table', async () => {
    const headers = { 'x-goodnight-user-id': await identityFor(DEMO_USER_ID) };

    // A legacy-owned model, so the flush has real work to do and actually runs.
    await clearProbe();
    await request(server)
      .post('/api/v1/moods')
      .set(headers)
      .send({ content: `flush probe ${Date.now()}`, emotion: 'calm', visibility: 'PRIVATE' })
      .expect(201);

    // The flush is asynchronous; give it room to run before reading the probe.
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const rows = await probeRows();
    // Named per table so a failure says which table the flush touched, and with which operation.
    expect(rows.map((row) => `${row.table}:${row.op}x${row.n}`)).toEqual([]);
  }, 120_000);

  it('a Self write goes straight to the database and is never swept by a following flush', async () => {
    const headers = { 'x-goodnight-user-id': await identityFor(DEMO_USER_ID) };

    // The memory gate defaults closed in a fresh database, so the consent has to be given first.
    await request(server)
      .patch('/api/v1/me/privacy')
      .set(headers)
      .send({ allowLongTermMemory: true, allowAiMemoryUse: true })
      .expect(200);

    const created = await request(server)
      .post('/api/v1/memory')
      .set(headers)
      .send({ category: '有效做法', content: `flush gate ${Date.now()}`, days: 7 })
      .expect(201);
    const memoryId = created.body.item.id as string;

    // A row written outside the store entirely — the case the old sweep deleted.
    const outsiderId = `memory_flush_gate_${Date.now()}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "MemoryItem" ("id","userId","category","content","status","consentedAt","expiresAt","createdAt","updatedAt")
       VALUES ($1, $2, '有效做法', 'written by another writer', 'active', now(), now() + interval '7 days', now(), now())`,
      outsiderId,
      DEMO_USER_ID,
    );

    await clearProbe();
    await request(server)
      .post('/api/v1/moods')
      .set(headers)
      .send({ content: `sweep probe ${Date.now()}`, emotion: 'calm', visibility: 'PRIVATE' })
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 2500));

    expect(await probeRows()).toEqual([]);
    expect(await prisma.memoryItem.findUnique({ where: { id: outsiderId } })).not.toBeNull();
    expect(await prisma.memoryItem.findUnique({ where: { id: memoryId } })).not.toBeNull();
  }, 120_000);
});
