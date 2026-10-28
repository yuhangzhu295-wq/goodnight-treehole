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
const TARGET_TABLES = [
  'FaqItem',
  'ReplyPreset',
  'FeedbackCategory',
  'FeedbackTicket',
  'AdminUserNote',
  'PeerReputation',
  'AgentDecisionLog',
  'Favorite',
  'Reply',
  'Post',
  'AIProvider',
  'AIStyleRoute',
  'Mood',
  'Diary',
  'Letter',
  'MediaAsset',
];

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

  /**
   * Runs a statement the way the flush does, i.e. with the session mark the probe honours.
   *
   * The self-tests need this because the probe records only a marked session — that is what lets it
   * tell a flush write from a direct write to the same table. An unmarked statement must produce
   * nothing, which is the other half of the discrimination.
   */
  const marked = (sql: string) =>
    prisma.$transaction([
      // One transaction, because set_config(..., true) is transaction-scoped: a separate statement
      // would already have dropped the mark by the time the probe fires.
      prisma.$executeRawUnsafe("SELECT set_config('batch4.in_flush', 'on', true)"),
      prisma.$executeRawUnsafe(sql),
    ]);

  beforeAll(async () => {
    app = await createApiTestApp();
    server = app.getHttpServer();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    adminToken = await loginAdmin(server);

    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "batch4_flush_probe" (id serial PRIMARY KEY, "table_name" text NOT NULL, "op" text NOT NULL, "at" timestamptz NOT NULL DEFAULT now())',
    );
    await prisma.$executeRawUnsafe(
      // The probe records only what the flush writes. A statement-level trigger cannot tell a flush
      // from a legitimate direct write to the same table - the AI routing tables, for one, are written
      // outside the flush once their models are registered - so the flush marks its own session and
      // the probe honours that mark. Without the mark, converting a model makes this gate fail on the
      // product doing exactly what the conversion asked for.
      [
        'CREATE OR REPLACE FUNCTION batch4_flush_probe_fn() RETURNS trigger LANGUAGE plpgsql AS $probe$',
        "BEGIN IF current_setting('batch4.in_flush', true) = 'on' THEN",
        '  INSERT INTO "batch4_flush_probe"("table_name","op") VALUES (TG_TABLE_NAME, TG_OP);',
        'END IF; RETURN NULL; END;',
        '$probe$',
      ].join(' '),
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
    await marked('UPDATE "FaqItem" SET "sortOrder" = "sortOrder" WHERE false');
    await marked('UPDATE "ReplyPreset" SET "sortOrder" = "sortOrder" WHERE false');
    await marked('UPDATE "FeedbackCategory" SET "sortOrder" = "sortOrder" WHERE false');
    await marked('UPDATE "FeedbackTicket" SET "content" = "content" WHERE false');
    await marked('UPDATE "AdminUserNote" SET "content" = "content" WHERE false');
    await marked('UPDATE "PeerReputation" SET "helpfulCount" = "helpfulCount" WHERE false');
    await marked('UPDATE "AgentDecisionLog" SET "taskType" = "taskType" WHERE false');
    await marked('UPDATE "Favorite" SET "targetType" = "targetType" WHERE false');
    await marked('UPDATE "Reply" SET "style" = "style" WHERE false');
    await marked('UPDATE "Post" SET "reviewStatus" = "reviewStatus" WHERE false');
    await marked('UPDATE "AIStyleRoute" SET "promptVersion" = "promptVersion" WHERE false');
    await marked('UPDATE "AIProvider" SET "priority" = "priority" WHERE false');
    await marked('UPDATE "Mood" SET "riskLevel" = "riskLevel" WHERE false');
    await marked('UPDATE "Diary" SET "source" = "source" WHERE false');
    await marked('UPDATE "Letter" SET "style" = "style" WHERE false');
    await marked('UPDATE "MediaAsset" SET "status" = "status" WHERE false');
    expect(await probeRows()).toEqual([
      { table: 'AIProvider', op: 'UPDATE', n: 1 },
      { table: 'AIStyleRoute', op: 'UPDATE', n: 1 },
      { table: 'AdminUserNote', op: 'UPDATE', n: 1 },
      { table: 'AgentDecisionLog', op: 'UPDATE', n: 1 },
      { table: 'Diary', op: 'UPDATE', n: 1 },
      { table: 'FaqItem', op: 'UPDATE', n: 1 },
      { table: 'Favorite', op: 'UPDATE', n: 1 },
      { table: 'FeedbackCategory', op: 'UPDATE', n: 1 },
      { table: 'FeedbackTicket', op: 'UPDATE', n: 1 },
      { table: 'Letter', op: 'UPDATE', n: 1 },
      { table: 'MediaAsset', op: 'UPDATE', n: 1 },
      { table: 'Mood', op: 'UPDATE', n: 1 },
      { table: 'PeerReputation', op: 'UPDATE', n: 1 },
      { table: 'Post', op: 'UPDATE', n: 1 },
      { table: 'Reply', op: 'UPDATE', n: 1 },
      { table: 'ReplyPreset', op: 'UPDATE', n: 1 },
    ]);
  });

  it('the probe sees a zero-row DELETE, the exact shape of the old sweep', async () => {
    await clearProbe();
    await marked('DELETE FROM "FaqItem" WHERE false');
    await marked('DELETE FROM "ReplyPreset" WHERE false');
    await marked('DELETE FROM "FeedbackCategory" WHERE false');
    await marked('DELETE FROM "FeedbackTicket" WHERE false');
    await marked('DELETE FROM "AdminUserNote" WHERE false');
    await marked('DELETE FROM "PeerReputation" WHERE false');
    await marked('DELETE FROM "AgentDecisionLog" WHERE false');
    await marked('DELETE FROM "Favorite" WHERE false');
    await marked('DELETE FROM "Reply" WHERE false');
    await marked('DELETE FROM "Post" WHERE false');
    await marked('DELETE FROM "AIStyleRoute" WHERE false');
    await marked('DELETE FROM "AIProvider" WHERE false');
    await marked('DELETE FROM "Mood" WHERE false');
    await marked('DELETE FROM "Diary" WHERE false');
    await marked('DELETE FROM "Letter" WHERE false');
    await marked('DELETE FROM "MediaAsset" WHERE false');
    expect(await probeRows()).toEqual([
      { table: 'AIProvider', op: 'DELETE', n: 1 },
      { table: 'AIStyleRoute', op: 'DELETE', n: 1 },
      { table: 'AdminUserNote', op: 'DELETE', n: 1 },
      { table: 'AgentDecisionLog', op: 'DELETE', n: 1 },
      { table: 'Diary', op: 'DELETE', n: 1 },
      { table: 'FaqItem', op: 'DELETE', n: 1 },
      { table: 'Favorite', op: 'DELETE', n: 1 },
      { table: 'FeedbackCategory', op: 'DELETE', n: 1 },
      { table: 'FeedbackTicket', op: 'DELETE', n: 1 },
      { table: 'Letter', op: 'DELETE', n: 1 },
      { table: 'MediaAsset', op: 'DELETE', n: 1 },
      { table: 'Mood', op: 'DELETE', n: 1 },
      { table: 'PeerReputation', op: 'DELETE', n: 1 },
      { table: 'Post', op: 'DELETE', n: 1 },
      { table: 'Reply', op: 'DELETE', n: 1 },
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
   * FeedbackCategory and FeedbackTicket are registered **together** - §2a of the plan records why:
   * the ticket's `categoryId` FK and both rows' hydration come from the same legacy snapshot, so
   * registering the category alone strands every stored ticket on a row the flush no longer writes.
   *
   * So this case asserts both: the directly written category is served, its tally is counted from the
   * table, and it now survives a flush.
   */
  it('a category written straight to PostgreSQL is served, counted, and survives a flush', async () => {
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

    // A flush must leave the directly written category alone.
    await request(server)
      .post('/api/v1/moods')
      .set('x-goodnight-user-id', await identityFor(DEMO_USER_ID))
      .send({ content: `batch4 flush probe ${Date.now()}`, emotion: 'calm', visibility: 'PRIVATE' })
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(await prisma.feedbackCategory.findUnique({ where: { id: direct.id } })).not.toBeNull();
  }, 120_000);

  it('a ticket written through the API is filed against the named category and read back only by its author', async () => {
    // A category has to exist for a ticket to be filed. The API resolves a default when none is named,
    // so an explicit id is what makes this test's claim specific.
    const category = await prisma.feedbackCategory.create({
      data: { name: `batch4 probe category ${Date.now()}`, sortOrder: 997, enabled: true },
    });

    const created = await request(server)
      .post('/api/v1/feedback')
      .set('x-goodnight-user-id', await identityFor(DEMO_USER_ID))
      .send({ categoryId: category.id, content: 'batch4 probe ticket', sourcePage: '/pages/help/feedback' })
      .expect(201);

    const ticketId = created.body.item.id as string;
    expect(ticketId).toBeTruthy();
    expect(created.body.item.categoryId).toBe(category.id);

    const mine = await request(server)
      .get('/api/v1/feedback')
      .set('x-goodnight-user-id', await identityFor(DEMO_USER_ID))
      .expect(200);
    expect((mine.body.items ?? []).some((item: any) => item.id === ticketId)).toBe(true);

    // Another user must not see it.
    const other = await request(server)
      .get('/api/v1/feedback')
      .set('x-goodnight-user-id', await identityFor('user_guest'))
      .expect(200);
    expect((other.body.items ?? []).some((item: any) => item.id === ticketId)).toBe(false);

    await prisma.feedbackTicket.deleteMany({ where: { id: ticketId } });
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

  /**
   * `AdminUserNote` is append-only operator data: a save adds a row and the "current" note is the
   * newest that has not been retracted. Two things this case has to show, because the conversion
   * changed both:
   *
   *  - a note written through the console is read back from the table, not from a boot-time snapshot;
   *  - the users list carries each row's current note from **one** query for the page. The legacy
   *    code called a per-user lookup inside the map, which the database version would have turned into
   *    an N+1; `currentNotesForUsers` exists to avoid that, and this asserts the projection still
   *    works rather than asserting the query count (which the response cannot show).
   */
  it('an operator note is written to the table, read back as the current note, and retracted softly', async () => {
    const userId = 'user_demo';
    await prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, openid: `openid_${userId}`, anonymousCode: `anon_${userId}`, nickname: '测试用户' },
      update: {},
    });

    const content = `batch4 probe note ${Date.now()}`;
    const created = await request(server)
      .post(`/api/admin/v1/users/${userId}/notes`)
      .set('Authorization', auth(adminToken))
      .send({ content })
      .expect(201);
    const noteId = created.body.item.id as string;
    expect(noteId).toBeTruthy();

    // Read back from the table.
    const listed = await request(server)
      .get(`/api/admin/v1/users/${userId}/notes`)
      .set('Authorization', auth(adminToken))
      .expect(200);
    expect((listed.body.items ?? []).some((item: any) => item.id === noteId)).toBe(true);
    expect(listed.body.current?.id).toBe(noteId);

    // The users list carries it as the row's current note.
    const users = await request(server)
      .get('/api/admin/v1/users')
      .set('Authorization', auth(adminToken))
      .expect(200);
    const row = (users.body.items ?? []).find((item: any) => item.id === userId);
    expect(row?.note).toBe(content);

    // Survives a flush: the sweep must no longer treat it as absent.
    await request(server)
      .post('/api/v1/moods')
      .set('x-goodnight-user-id', await identityFor(DEMO_USER_ID))
      .send({ content: `batch4 flush probe ${Date.now()}`, emotion: 'calm', visibility: 'PRIVATE' })
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(await prisma.adminUserNote.findUnique({ where: { id: noteId } })).not.toBeNull();

    // Retraction is soft: the row stays, marked, and leaves the operator view.
    await request(server)
      .delete(`/api/admin/v1/users/${userId}/notes/${noteId}`)
      .set('Authorization', auth(adminToken))
      .expect(200);

    const afterDelete = await prisma.adminUserNote.findUnique({ where: { id: noteId } });
    expect(afterDelete).not.toBeNull();
    expect(afterDelete?.deletedAt).not.toBeNull();

    const listedAfter = await request(server)
      .get(`/api/admin/v1/users/${userId}/notes`)
      .set('Authorization', auth(adminToken))
      .expect(200);
    expect((listedAfter.body.items ?? []).some((item: any) => item.id === noteId)).toBe(false);

    await prisma.adminUserNote.deleteMany({ where: { id: noteId } });
  }, 120_000);

  /**
   * The discriminating case for `AdminUserNote`, and the reason the two cases above are not enough.
   *
   * Removing the registration (mutation M-N) left them green. That is not a hole in the product: the
   * ownership rule (`deleteAbsent` may only remove ids this process previously wrote through the
   * flush) already stops the sweep deleting a note written straight to the table, and a fresh test
   * database has an empty note snapshot at boot, so the flush's upsert loop has nothing to iterate.
   * Both halves of the registration are therefore inert until the snapshot is **non-empty**.
   *
   * This case makes it non-empty: it boots a second app, which hydrates the note from the database,
   * and then flushes that instance. With the model registered the flush issues no statement against
   * `AdminUserNote`; unregistered it writes the note it just hydrated (mutation M-N reports
   * `['AdminUserNote:INSERTx4', ...]`). The probe is what makes the difference visible, so this is the
   * reverse proof the gate needs.
   *
   * The statement recorded is an INSERT, not the UPDATE a stale-snapshot overwrite would suggest, and
   * the exact number (4) was not traced further: what the gate needs is that the statement exists when
   * the model is unregistered and does not when it is, and that is what is asserted.
   */
  it('a note present at boot is not rewritten by that instance\'s flush', async () => {
    const userId = 'user_demo';
    const content = `batch4 probe boot note ${Date.now()}`;
    const created = await request(server)
      .post(`/api/admin/v1/users/${userId}/notes`)
      .set('Authorization', auth(adminToken))
      .send({ content })
      .expect(201);
    const noteId = created.body.item.id as string;

    // A second instance hydrates the note into its in-memory snapshot at boot.
    const secondApp = await createApiTestApp();
    const secondServer = secondApp.getHttpServer();
    try {
      await clearProbe();
      await request(secondServer)
        .post('/api/v1/moods')
        .set('x-goodnight-user-id', await identityFor(DEMO_USER_ID))
        .send({ content: `batch4 flush probe ${Date.now()}`, emotion: 'calm', visibility: 'PRIVATE' })
        .expect(201);
      await new Promise((resolve) => setTimeout(resolve, 2500));

      const rows = await probeRows();
      expect(rows.map((row) => `${row.table}:${row.op}x${row.n}`)).toEqual([]);

      // And the note is still there, untouched.
      const after = await prisma.adminUserNote.findUnique({ where: { id: noteId } });
      expect(after?.content).toBe(content);
      expect(after?.deletedAt).toBeNull();
    } finally {
      await prisma.adminUserNote.deleteMany({ where: { id: noteId } });
      await secondApp.close();
    }
  }, 120_000);

  /**
   * `PeerReputation` is inert today: nothing in the product creates a row (§5b of the plan), so this
   * case writes one **directly** to prove the two things the conversion must not break - the row
   * survives a flush, and the matcher that reads the trust term still answers. It does not assert a
   * scoring effect, because with no writer there is no effect to observe; asserting one would be
   * asserting a capability the product does not have.
   */
  it('a reputation row written straight to PostgreSQL survives a flush and the matcher still runs', async () => {
    const userId = 'user_guest';
    await prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, openid: `openid_${userId}`, anonymousCode: `anon_${userId}`, nickname: '测试用户' },
      update: {},
    });
    const direct = await prisma.peerReputation.create({
      data: { userId, helpfulCount: 7, reportCount: 1 },
    });

    // The matcher is gated on peer matching, which defaults to off. The subject here is the
    // reputation read, not the consent gate, so the consent is opened for the probe.
    await prisma.privacySetting.upsert({
      where: { userId: DEMO_USER_ID },
      create: { userId: DEMO_USER_ID, allowPeerMatching: true },
      update: { allowPeerMatching: true },
    });

    // A flush must not sweep it. A Mood forces the flush because Mood is still legacy-owned.
    await request(server)
      .post('/api/v1/moods')
      .set('x-goodnight-user-id', await identityFor(DEMO_USER_ID))
      .send({ content: `batch4 flush probe ${Date.now()}`, emotion: 'calm', visibility: 'PRIVATE' })
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(await prisma.peerReputation.findUnique({ where: { id: direct.id } })).not.toBeNull();

    // The matcher reads the trust term from the table now. The assertion is that the route answers
    // rather than throwing on the converted read.
    const journey = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', await identityFor(DEMO_USER_ID))
      .send({ title: `batch4 probe journey ${Date.now()}`, domain: '生活', content: '同路人匹配探针' })
      .expect(201);
    await request(server)
      .post(`/api/v1/journeys/${journey.body.journey.id}/peer-matches`)
      .set('x-goodnight-user-id', await identityFor(DEMO_USER_ID))
      .expect(201);

    // The discriminating half (§5a): a fresh instance hydrates the reputation row, so its snapshot is
    // non-empty and its flush would rewrite the row if the model were not registered.
    const secondApp = await createApiTestApp();
    try {
      await clearProbe();
      await request(secondApp.getHttpServer())
        .post('/api/v1/moods')
        .set('x-goodnight-user-id', await identityFor(DEMO_USER_ID))
        .send({ content: `batch4 flush probe ${Date.now()}`, emotion: 'calm', visibility: 'PRIVATE' })
        .expect(201);
      await new Promise((resolve) => setTimeout(resolve, 2500));
      // Row survival is asserted before the probe: it is the claim that matters, and a statement-level
      // probe cannot tell a one-row DELETE from a zero-row one, so the probe alone cannot say whether
      // anything was lost.
      expect(await prisma.peerReputation.findUnique({ where: { id: direct.id } })).not.toBeNull();
      expect((await probeRows()).map((row) => `${row.table}:${row.op}x${row.n}`)).toEqual([]);
    } finally {
      await secondApp.close();
    }

    await prisma.peerReputation.deleteMany({ where: { userId } });
    await prisma.peerMatch.deleteMany({ where: { journeyId: journey.body.journey.id } });
    await prisma.lifeJourney.deleteMany({ where: { id: journey.body.journey.id } });
  }, 120_000);

  /**
   * `AgentDecisionLog` has a real writer (recording what the AI decided for a situation analysis), so
   * unlike `PeerReputation` this model is live. The row is written **directly** here rather than by
   * driving a whole AI flow: the subject is the flush's behaviour toward the table, not the flow.
   *
   * Same discriminating shape as the cases above (§5a): a fresh instance hydrates the row, so its
   * snapshot is non-empty and its flush would rewrite the row if the model were not registered. The
   * row-survival assertion comes first, because a statement-level probe cannot tell a one-row DELETE
   * from a zero-row one (§5c).
   */
  it('a decision log written straight to PostgreSQL survives a flush', async () => {
    const userId = 'user_demo';
    const direct = await prisma.agentDecisionLog.create({
      data: { userId, taskType: 'batch4_probe', decision: { probe: true } },
    });

    const secondApp = await createApiTestApp();
    try {
      await clearProbe();
      await request(secondApp.getHttpServer())
        .post('/api/v1/moods')
        .set('x-goodnight-user-id', await identityFor(DEMO_USER_ID))
        .send({ content: `batch4 flush probe ${Date.now()}`, emotion: 'calm', visibility: 'PRIVATE' })
        .expect(201);
      await new Promise((resolve) => setTimeout(resolve, 2500));

      expect(await prisma.agentDecisionLog.findUnique({ where: { id: direct.id } })).not.toBeNull();
      expect((await probeRows()).map((row) => `${row.table}:${row.op}x${row.n}`)).toEqual([]);
    } finally {
      await prisma.agentDecisionLog.deleteMany({ where: { id: direct.id } });
      await secondApp.close();
    }
  }, 120_000);

  /**
   * `Favorite` is the first member of the Post cluster (§5d). Its read-back has to cover the two
   * projections the same rows own, because converting it without those would leave the feed saying
   * "not favourited" and the counter frozen at zero - both silently.
   */
  it('a favourite written straight to PostgreSQL is served, flags the post, and survives a flush', async () => {
    const headers = { 'x-goodnight-user-id': await identityFor(DEMO_USER_ID) };
    const post = await request(server)
      .post('/api/v1/posts')
      .set(headers)
      .send({ content: `batch4 probe favourite ${Date.now()}`, emotion: 'calm', visibility: 'PUBLIC' })
      .expect(201);
    const postId = post.body.post.id as string;
    // Creating a public post queues AI replies; let those settle before the probe window, or their
    // INSERT would be attributed to the flush.
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const direct = await prisma.favorite.create({
      data: { userId: DEMO_USER_ID, targetType: 'post', targetId: postId },
    });

    // The feed flag comes from the decoration context, which now reads the table.
    const detail = await request(server).get(`/api/v1/posts/${postId}`).set(headers).expect(200);
    expect(detail.body.item.favoritedByCurrentUser).toBe(true);

    // The favourites list reads the table too.
    const list = await request(server).get('/api/v1/favorites').set(headers).expect(200);
    expect((list.body.items ?? []).some((item: any) => item.id === direct.id)).toBe(true);

    // A flush must neither rewrite nor sweep the row.
    await clearProbe();
    await request(server)
      .post('/api/v1/moods')
      .set(headers)
      .send({ content: `batch4 flush probe ${Date.now()}`, emotion: 'calm', visibility: 'PRIVATE' })
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(await prisma.favorite.findUnique({ where: { id: direct.id } })).not.toBeNull();
    expect((await probeRows()).map((row) => `${row.table}:${row.op}x${row.n}`)).toEqual([]);

    // The write path removes the row and flips the flag back.
    await request(server).delete(`/api/v1/posts/${postId}/favorite`).set(headers).expect(200);
    expect(await prisma.favorite.findUnique({ where: { id: direct.id } })).toBeNull();
    const afterRemove = await request(server).get(`/api/v1/posts/${postId}`).set(headers).expect(200);
    expect(afterRemove.body.item.favoritedByCurrentUser).toBe(false);

    // Adding it back updates both the table and the post's counter projection.
    await request(server).post(`/api/v1/posts/${postId}/favorite`).set(headers).expect(201);
    const reAdded = await prisma.favorite.findFirst({
      where: { userId: DEMO_USER_ID, targetType: 'post', targetId: postId },
    });
    expect(reAdded).not.toBeNull();
    const postRow = await prisma.post.findUnique({ where: { id: postId } });
    expect(postRow?.favoriteCount).toBe(1);
  }, 120_000);

  /**
   * `Post` is the hub: converting it is what lets the favourite and reply counters be plain row
   * counts. The case covers the read path, the moderation gate, and the two things the flush used
   * to own - hydration and the sweep - by asserting both that a directly written post is served and
   * that a flush leaves it alone.
   */
  it('a post written straight to PostgreSQL is served, moderated, and survives a flush', async () => {
    const headers = { 'x-goodnight-user-id': await identityFor(DEMO_USER_ID) };
    const content = `batch4 probe post ${Date.now()}`;
    await request(server)
      .post('/api/v1/moods')
      .set(headers)
      .send({ content, emotion: 'calm', visibility: 'PRIVATE' })
      .expect(201);

    // The mood is still legacy-owned, so its row is written by the flush; the post is written by the
    // publish path and needs the mood row to exist first.
    const published = await request(server)
      .post('/api/v1/posts')
      .set(headers)
      .send({ content, emotion: 'calm', visibility: 'PUBLIC' })
      .expect(201);
    const postId = published.body.post.id as string;
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Direct read path: the post is served from the table, pending review, out of the feed.
    const feedBefore = await request(server).get('/api/v1/posts').expect(200);
    expect((feedBefore.body.items ?? []).some((item: any) => item.id === postId)).toBe(false);
    const detail = await request(server).get(`/api/v1/posts/${postId}`).set(headers).expect(200);
    expect(detail.body.item.reviewStatus).toBe('pending_review');

    // A flush must neither rewrite nor sweep it.
    await clearProbe();
    await request(server)
      .post('/api/v1/moods')
      .set(headers)
      .send({ content: `batch4 flush probe ${Date.now()}`, emotion: 'calm', visibility: 'PRIVATE' })
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(await prisma.post.findUnique({ where: { id: postId } })).not.toBeNull();
    expect((await probeRows()).map((row) => `${row.table}:${row.op}x${row.n}`)).toEqual([]);

    // Moderation publishes it, and the counter projections follow.
    await request(server)
      .patch(`/api/admin/v1/posts/${postId}/review`)
      .set('Authorization', auth(adminToken))
      .send({ status: 'published' })
      .expect(200);
    const postRow = await prisma.post.findUnique({ where: { id: postId } });
    expect(postRow?.reviewStatus).toBe('published');
    const feedAfter = await request(server).get('/api/v1/posts').expect(200);
    const feedItem = (feedAfter.body.items ?? []).find((item: any) => item.id === postId);
    expect(feedItem).toBeTruthy();
    expect(typeof feedItem.replyCount).toBe('number');
    expect(typeof feedItem.favoriteCount).toBe('number');

    // Author deletion is terminal for the feed.
    await request(server).delete(`/api/v1/posts/${postId}`).set(headers).expect(200);
    const afterDelete = await prisma.post.findUnique({ where: { id: postId } });
    expect(afterDelete?.status).toBe('deleted');
    const feedDeleted = await request(server).get('/api/v1/posts').expect(200);
    expect((feedDeleted.body.items ?? []).some((item: any) => item.id === postId)).toBe(false);
  }, 120_000);

  /**
   * `Reply` owns `Post.replyCount`. The counter is compared against the table at the moment of the
   * assertion rather than against a fixed number, because creating a public post also queues AI
   * replies; the property under test is "the counter equals the published rows", not "there are N".
   */
  it('a reply written straight to PostgreSQL is served, moderated, and counted from the table', async () => {
    const headers = { 'x-goodnight-user-id': await identityFor(DEMO_USER_ID) };
    const post = await request(server)
      .post('/api/v1/posts')
      .set(headers)
      .send({ content: `batch4 probe reply ${Date.now()}`, emotion: 'calm', visibility: 'PUBLIC' })
      .expect(201);
    const postId = post.body.post.id as string;
    await new Promise((resolve) => setTimeout(resolve, 3000));
    // Human replies are gated on `reviewStatus === 'published'`; the operator publishes it here.
    await request(server)
      .patch(`/api/admin/v1/posts/${postId}/review`)
      .set('Authorization', auth(adminToken))
      .send({ status: 'published' })
      .expect(200);

    const direct = await prisma.reply.create({
      data: {
        postId,
        type: 'AI',
        style: 'warm',
        content: 'batch4 probe direct reply',
        status: 'published',
        riskLevel: 'low',
      },
    });

    // The public list reads the table.
    const publicList = await request(server).get(`/api/v1/posts/${postId}/replies`).expect(200);
    expect((publicList.body.items ?? []).some((item: any) => item.id === direct.id)).toBe(true);

    // The admin detail reads it too.
    const adminDetail = await request(server)
      .get(`/api/admin/v1/posts/${postId}`)
      .set('Authorization', auth(adminToken))
      .expect(200);
    expect((adminDetail.body.replies ?? []).some((item: any) => item.id === direct.id)).toBe(true);

    // A flush must neither rewrite nor sweep the row.
    await clearProbe();
    await request(server)
      .post('/api/v1/moods')
      .set(headers)
      .send({ content: `batch4 flush probe ${Date.now()}`, emotion: 'calm', visibility: 'PRIVATE' })
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(await prisma.reply.findUnique({ where: { id: direct.id } })).not.toBeNull();
    expect((await probeRows()).map((row) => `${row.table}:${row.op}x${row.n}`)).toEqual([]);

    // A human reply is written pending, then approving it moves the counter to the table's count.
    const human = await request(server)
      .post(`/api/v1/posts/${postId}/replies`)
      .set(headers)
      .send({ content: `batch4 probe human reply ${Date.now()}`, anonymous: false })
      .expect(201);
    const humanId = human.body.item.id as string;
    const pendingRow = await prisma.reply.findUnique({ where: { id: humanId } });
    expect(pendingRow?.status).toBe('pending_review');

    await request(server)
      .patch(`/api/admin/v1/replies/${humanId}/review`)
      .set('Authorization', auth(adminToken))
      .send({ status: 'published' })
      .expect(200);

    const published = await prisma.reply.count({ where: { postId, status: 'published' } });
    const postRow = await prisma.post.findUnique({ where: { id: postId } });
    expect(postRow?.replyCount).toBe(published);
    const afterApprove = await request(server).get(`/api/v1/posts/${postId}/replies`).expect(200);
    expect((afterApprove.body.items ?? []).some((item: any) => item.id === humanId)).toBe(true);
  }, 120_000);

  /**
   * MediaAsset, the sixteenth and last model. The two encodeable facts are the ones the flush used
   * to own: hydration (the snapshot's asset rows were re-inserted at boot) and the sweep (rows the
   * snapshot did not carry were soft-deleted as absent).
   *
   * Removing `MediaAsset` from `DIRECT_DB_MODELS` has to fail this case, which is what makes it a
   * guard rather than a restatement of the flag: without the registration the flush hydrates the
   * snapshot's assets into the table and then sweeps this directly written row, so the row
   * disappears and the read path stops serving it.
   */
  it('a media asset written straight to PostgreSQL is served, and survives a flush', async () => {
    const stamp = Date.now();
    const assetId = `batch4_asset_${stamp}`;
    const storageKey = `batch4/probe-${stamp}.png`;
    await prisma.mediaAsset.create({
      data: {
        id: assetId,
        userId: DEMO_USER_ID,
        storageKey,
        url: `/uploads/${storageKey}`,
        mimeType: 'image/png',
        size: 64,
        width: 1,
        height: 1,
        usageType: 'mood',
        status: 'ready',
        createdAt: new Date(),
      },
    });

    // A flush must neither rewrite nor sweep the directly written row.
    await clearProbe();
    await request(server)
      .post('/api/v1/moods')
      .set('x-goodnight-user-id', await identityFor(DEMO_USER_ID))
      .send({ content: `batch4 flush probe ${Date.now()}`, emotion: 'calm', visibility: 'PRIVATE' })
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const afterFlush = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
    expect(afterFlush).not.toBeNull();
    expect(afterFlush?.status).toBe('ready');
    expect((await probeRows()).map((row) => `${row.table}:${row.op}x${row.n}`)).toEqual([]);

    // The write path is the same table: an upload through the route lands as its own row, and the
    // draft delete marks that one deleted without touching the row written above.
    const uploaded = await request(server)
      .post('/api/v1/media/upload')
      .set('x-goodnight-user-id', await identityFor(DEMO_USER_ID))
      .field('usageType', 'mood')
      .attach('file', Buffer.from('batch4 upload probe'), { filename: `probe-${stamp}.png`, contentType: 'image/png' })
      .expect(201);
    const uploadedId = uploaded.body.item.id as string;
    expect(await prisma.mediaAsset.findUnique({ where: { id: uploadedId } })).not.toBeNull();

    await request(server)
      .delete(`/api/v1/media/${uploadedId}`)
      .set('x-goodnight-user-id', await identityFor(DEMO_USER_ID))
      .expect(200);
    const deletedUpload = await prisma.mediaAsset.findUnique({ where: { id: uploadedId } });
    expect(deletedUpload?.status).toBe('deleted');
    // The direct row is untouched by the delete above: the sweep must not run and take it with it.
    expect(await prisma.mediaAsset.findUnique({ where: { id: assetId } })).not.toBeNull();

    // The deleted row must stay deleted across a flush. Without the registration the flush's upsert
    // re-inserts the snapshot's asset rows, so a file the user just removed through the draft
    // endpoint comes back ready — which is exactly what the model was registered to stop.
    await clearProbe();
    await request(server)
      .post('/api/v1/moods')
      .set('x-goodnight-user-id', await identityFor(DEMO_USER_ID))
      .send({ content: `batch4 flush probe ${Date.now()}`, emotion: 'calm', visibility: 'PRIVATE' })
      .expect(201);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const stillDeleted = await prisma.mediaAsset.findUnique({ where: { id: uploadedId } });
    expect(stillDeleted?.status).toBe('deleted');
    expect((await probeRows()).map((row) => `${row.table}:${row.op}x${row.n}`)).toEqual([]);
  }, 120_000);
});
