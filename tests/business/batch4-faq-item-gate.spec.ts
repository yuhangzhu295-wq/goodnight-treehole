import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp, loginAdmin, auth, identityFor, DEMO_USER_ID } from './helpers';

/**
 * Batch 4 gate — `FAQ_ITEM_FULL_FLUSH=false` and `REPLY_PRESET_FULL_FLUSH=false`.
 *
 * `FaqItem` and `ReplyPreset` are the first two of the 16 models retired from the legacy flush
 * (`BATCH4_LEGACY_FLUSH_RETIREMENT.md`). The claim, in the shape
 * `BATCH3_SELF_FULL_FLUSH_GATE.md` established: after registration, a forced legacy flush issues **no
 * statement** against either table, and a row written **directly to PostgreSQL** is still served by
 * the read path.
 *
 * The second half is the one that matters. Registering a model stops the flush from upserting and
 * sweeping it, but a table nobody reads from the database would also show an empty probe — so the
 * read-back proves the route now serves the table rather than a boot-time snapshot.
 *
 * The probe is statement-level and self-tests first, for the same reason as the Batch 3 gate: a
 * row-level trigger sees nothing in a zero-row `DELETE`, which is precisely the old sweep's shape.
 */
const TARGET_TABLES = ['FaqItem', 'ReplyPreset'];

describe('Batch 4 gate — the legacy flush writes nothing to FaqItem', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: any;
  let adminToken: string;

  const probeRows = async () =>
    (await prisma.$queryRawUnsafe(
      'SELECT "table_name" AS "table", "op", count(*)::int AS "n" FROM "batch4_flush_probe" GROUP BY 1, 2 ORDER BY 1, 2',
    )) as Array<{ table: string; op: string; n: number }>;
  const clearProbe = () => prisma.$executeRawUnsafe('TRUNCATE "batch4_flush_probe"');

  beforeAll(async () => {
    app = await createApiTestApp();
    server = app.getHttpServer();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    adminToken = await loginAdmin(server);

    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "batch4_flush_probe" (id serial PRIMARY KEY, "table_name" text NOT NULL, "op" text NOT NULL, "at" timestamptz NOT NULL DEFAULT now())',
    );
    await prisma.$executeRawUnsafe(
      'CREATE OR REPLACE FUNCTION batch4_flush_probe_fn() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN INSERT INTO "batch4_flush_probe"("table_name","op") VALUES (TG_TABLE_NAME, TG_OP); RETURN NULL; END $fn$',
    );
    for (const table of TARGET_TABLES) {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS batch4_flush_probe ON "${table}"`);
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER batch4_flush_probe AFTER INSERT OR UPDATE OR DELETE ON "${table}" FOR EACH STATEMENT EXECUTE FUNCTION batch4_flush_probe_fn()`,
      );
    }
  }, 120_000);

  afterAll(async () => {
    for (const table of TARGET_TABLES) {
      await prisma?.$executeRawUnsafe(`DROP TRIGGER IF EXISTS batch4_flush_probe ON "${table}"`).catch(() => undefined);
    }
    await prisma?.$executeRawUnsafe('DROP FUNCTION IF EXISTS batch4_flush_probe_fn()').catch(() => undefined);
    await prisma?.$executeRawUnsafe('DROP TABLE IF EXISTS "batch4_flush_probe"').catch(() => undefined);
    await prisma.faqItem.deleteMany({ where: { question: { startsWith: 'batch4 probe' } } });
    await prisma.replyPreset.deleteMany({ where: { text: { startsWith: 'batch4 probe' } } });
    await prisma.feedbackCategory.deleteMany({ where: { name: { startsWith: 'batch4 probe' } } });
    await prisma?.$disconnect();
    await app?.close();
  });

  it('the probe sees a statement that changes no rows (self-test)', async () => {
    // A blind detector would report an empty probe as success, which is the failure mode this rules out.
    await clearProbe();
    await prisma.$executeRawUnsafe('UPDATE "FaqItem" SET "sortOrder" = "sortOrder" WHERE false');
    await prisma.$executeRawUnsafe('UPDATE "ReplyPreset" SET "sortOrder" = "sortOrder" WHERE false');
    expect(await probeRows()).toEqual([
      { table: 'FaqItem', op: 'UPDATE', n: 1 },
      { table: 'ReplyPreset', op: 'UPDATE', n: 1 },
    ]);
  });

  it('the probe sees a zero-row DELETE, the exact shape of the old sweep', async () => {
    await clearProbe();
    await prisma.$executeRawUnsafe('DELETE FROM "FaqItem" WHERE false');
    await prisma.$executeRawUnsafe('DELETE FROM "ReplyPreset" WHERE false');
    expect(await probeRows()).toEqual([
      { table: 'FaqItem', op: 'DELETE', n: 1 },
      { table: 'ReplyPreset', op: 'DELETE', n: 1 },
    ]);
  });

  it('a legacy flush writes nothing to FaqItem', async () => {
    // The flush needs real work to do, or it is not a flush. A Mood is still legacy-owned in Batch 4,
    // so creating one forces persist + flush while the probe is watching FaqItem.
    const headers = { 'x-goodnight-user-id': await identityFor(DEMO_USER_ID) };
    await clearProbe();
    await request(server)
      .post('/api/v1/moods')
      .set(headers)
      .send({ content: `batch4 flush probe ${Date.now()}`, emotion: 'calm', visibility: 'PRIVATE' })
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const rows = await probeRows();
    expect(rows.map((row) => `${row.table}:${row.op}x${row.n}`)).toEqual([]);
  }, 120_000);

  /**
   * Reverse guard: remove `FaqItem` from `DIRECT_DB_MODELS` and the flush upserts it again, so this
   * case fails. Without it, an empty probe could equally mean the flush never had the table to write
   * (for example if hydration also stopped for an unrelated reason).
   */
  it('a row written straight to PostgreSQL is served by the read path, and survives a flush', async () => {
    const question = `batch4 probe direct write ${Date.now()}`;
    const direct = await prisma.faqItem.create({
      data: { question, answer: '这条是绕过 API 直接写库的。', sortOrder: 999, enabled: true },
    });

    // The C-end read path must show it.
    const front = await request(server).get('/api/v1/feedback/faqs').expect(200);
    expect((front.body.items ?? []).some((item: any) => item.id === direct.id)).toBe(true);

    // Force a flush while it is there.
    await request(server)
      .post('/api/v1/moods')
      .set('x-goodnight-user-id', await identityFor(DEMO_USER_ID))
      .send({ content: `batch4 flush probe ${Date.now()}`, emotion: 'calm', visibility: 'PRIVATE' })
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // Still there: the sweep no longer treats it as absent.
    const afterFlush = await prisma.faqItem.findUnique({ where: { id: direct.id } });
    expect(afterFlush).not.toBeNull();

    const frontAfter = await request(server).get('/api/v1/feedback/faqs').expect(200);
    expect((frontAfter.body.items ?? []).some((item: any) => item.id === direct.id)).toBe(true);

    // And the console write path works against the same table.
    const admin = await request(server)
      .get('/api/admin/v1/faqs')
      .set('Authorization', auth(adminToken))
      .expect(200);
    expect((admin.body.items ?? []).some((item: any) => item.id === direct.id)).toBe(true);
  }, 120_000);

  it('a preset written straight to PostgreSQL is served by the read path and survives a flush', async () => {
    const text = `batch4 probe preset ${Date.now()}`;
    const direct = await prisma.replyPreset.create({
      data: { text, scene: 'comfort', sortOrder: 999, enabled: true },
    });

    const front = await request(server).get('/api/v1/reply-presets').expect(200);
    expect((front.body.items ?? []).some((item: any) => item.id === direct.id)).toBe(true);

    // The five guaranteed chips are hardcoded in the route, not stored. They are the product's
    // minimum set for an empty install, and converting the model must not remove them.
    for (const required of ['抱抱你', '我懂你的感受', '会好起来的', '今晚早点休息', '你已经很棒了']) {
      expect((front.body.items ?? []).some((item: any) => item.text === required)).toBe(true);
    }

    await request(server)
      .post('/api/v1/moods')
      .set('x-goodnight-user-id', await identityFor(DEMO_USER_ID))
      .send({ content: `batch4 flush probe ${Date.now()}`, emotion: 'calm', visibility: 'PRIVATE' })
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const after = await prisma.replyPreset.findUnique({ where: { id: direct.id } });
    expect(after).not.toBeNull();
    const frontAfter = await request(server).get('/api/v1/reply-presets').expect(200);
    expect((frontAfter.body.items ?? []).some((item: any) => item.id === direct.id)).toBe(true);
  }, 120_000);

  it('the console can create, disable and delete a preset through the database path', async () => {
    const created = await request(server)
      .post('/api/admin/v1/reply-presets')
      .set('Authorization', auth(adminToken))
      .send({ text: `batch4 probe preset ${Date.now()}`, scene: 'comfort' })
      .expect(201);
    const id = created.body.item.id as string;
    expect(id).toBeTruthy();

    const front = await request(server).get('/api/v1/reply-presets').expect(200);
    expect((front.body.items ?? []).some((item: any) => item.id === id)).toBe(true);

    await request(server)
      .patch(`/api/admin/v1/reply-presets/${id}`)
      .set('Authorization', auth(adminToken))
      .send({ enabled: false })
      .expect(200);

    const frontAfter = await request(server).get('/api/v1/reply-presets').expect(200);
    expect((frontAfter.body.items ?? []).some((item: any) => item.id === id)).toBe(false);

    await request(server)
      .delete(`/api/admin/v1/reply-presets/${id}`)
      .set('Authorization', auth(adminToken))
      .expect(200);
    const gone = await prisma.replyPreset.findUnique({ where: { id } });
    expect(gone).toBeNull();
  }, 120_000);

  /**
   * FeedbackCategory is in the **dual-write** state on purpose: its routes read and write the table,
   * but the model is not registered, because `FeedbackTicket` - still flush-owned - carries a
   * `categoryId` FK whose rows are hydrated from the same legacy snapshot. Registering the category
   * alone strands every stored ticket on a category the flush no longer writes. The pair converts
   * together.
   *
   * What this test therefore pins is the state that holds *until then*: a directly written category
   * is served by the read path, and the console tally counts from the table rather than from the
   * legacy array. It deliberately does **not** assert the category survives a flush, because right now
   * the flush still owns it and it would not.
   */
  it('a category written straight to PostgreSQL is served, with a tally counted from the table', async () => {
    const name = `batch4 probe category ${Date.now()}`;
    const direct = await prisma.feedbackCategory.create({
      data: { name, sortOrder: 998, enabled: true },
    });

    const front = await request(server).get('/api/v1/feedback/categories').expect(200);
    expect((front.body.items ?? []).some((item: any) => item.id === direct.id)).toBe(true);

    // The admin tally is computed by the database, not by the legacy feedbackTickets array. A
    // directly-written ticket must show up in it, which is what proves the count reads the table.
    await prisma.feedbackTicket.create({
      data: {
        userId: 'user_demo',
        categoryId: direct.id,
        content: 'batch4 probe ticket',
        sourcePage: '/pages/help/feedback',
        // priority has no schema default, so a fixture has to state it.
        priority: 'medium',
      },
    });

    const admin = await request(server)
      .get('/api/admin/v1/feedback-categories')
      .set('Authorization', auth(adminToken))
      .expect(200);
    const row = (admin.body.items ?? []).find((item: any) => item.id === direct.id);
    expect(row?.ticketCount).toBe(1);

    await prisma.feedbackTicket.deleteMany({ where: { content: 'batch4 probe ticket' } });
    const adminAfter = await request(server)
      .get('/api/admin/v1/feedback-categories')
      .set('Authorization', auth(adminToken))
      .expect(200);
    expect((adminAfter.body.items ?? []).find((item: any) => item.id === direct.id)?.ticketCount).toBe(0);
  }, 120_000);

  it('the console can create, disable a category, and the form stops offering it', async () => {
    const created = await request(server)
      .post('/api/admin/v1/feedback-categories')
      .set('Authorization', auth(adminToken))
      .send({ name: `batch4 probe category ${Date.now()}` })
      .expect(201);
    const id = created.body.item.id as string;

    const front = await request(server).get('/api/v1/feedback/categories').expect(200);
    expect((front.body.items ?? []).some((item: any) => item.id === id)).toBe(true);

    await request(server)
      .patch(`/api/admin/v1/feedback-categories/${id}`)
      .set('Authorization', auth(adminToken))
      .send({ enabled: false })
      .expect(200);

    const frontAfter = await request(server).get('/api/v1/feedback/categories').expect(200);
    expect((frontAfter.body.items ?? []).some((item: any) => item.id === id)).toBe(false);
  }, 120_000);

  it('the console can create, update and disable a FAQ through the database path', async () => {
    const created = await request(server)
      .post('/api/admin/v1/faqs')
      .set('Authorization', auth(adminToken))
      .send({ question: 'batch4 probe created?', answer: '通过控制台创建。' })
      .expect(201);
    const id = created.body.item.id as string;
    expect(id).toBeTruthy();
    expect(created.body.item.enabled).toBe(true);

    // It is visible to the C-end immediately.
    const front = await request(server).get('/api/v1/feedback/faqs').expect(200);
    expect((front.body.items ?? []).some((item: any) => item.id === id)).toBe(true);

    // Disable it, and the C-end must stop showing it without a reload of anything but the table.
    await request(server)
      .patch(`/api/admin/v1/faqs/${id}`)
      .set('Authorization', auth(adminToken))
      .send({ enabled: false })
      .expect(200);

    const frontAfter = await request(server).get('/api/v1/feedback/faqs').expect(200);
    expect((frontAfter.body.items ?? []).some((item: any) => item.id === id)).toBe(false);
    const adminAfter = await request(server)
      .get('/api/admin/v1/faqs')
      .set('Authorization', auth(adminToken))
      .expect(200);
    expect((adminAfter.body.items ?? []).some((item: any) => item.id === id)).toBe(true);

    await request(server)
      .delete(`/api/admin/v1/faqs/${id}`)
      .set('Authorization', auth(adminToken))
      .expect(200);
    const gone = await prisma.faqItem.findUnique({ where: { id } });
    expect(gone).toBeNull();
  }, 120_000);
});
