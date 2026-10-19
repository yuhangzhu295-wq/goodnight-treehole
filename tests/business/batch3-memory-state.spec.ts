import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApiTestApp, identityFor } from './helpers'
import { expiredAt } from './helpers';
import { StoreService } from '../../apps/api/src/store.service';
import { SelfPersistenceService } from '../../apps/api/src/self-persistence.service';

/**
 * The MemoryItem state machine (Batch 3 design §0.5/A5, §0.6/A5).
 *
 * The plan's prohibition is specific: a date change must never quietly re-authorise a memory the
 * user had already stopped, and deletion must be a state of its own. Both were violated before this
 * batch — an extension set any non-`disabled` row back to `active`, and deletion wrote `expired`.
 */
describe('Batch 3: MemoryItem state machine', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let store: StoreService;
  let self: SelfPersistenceService;
  const owner = 'user_demo';
  const other = 'user_guest';

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    store = app.get(StoreService);
    self = app.get(SelfPersistenceService);
    // allowLongTermMemory governs saving; allowAiMemoryUse governs injecting into a prompt. They
    // are independent on purpose, and the eligibility tests below turn the second one off alone.
    for (const userId of [owner, other]) {
      await prisma.privacySetting.upsert({
        where: { userId },
        create: { userId, allowLongTermMemory: true, allowAiMemoryUse: true },
        update: { allowLongTermMemory: true, allowAiMemoryUse: true },
      });
    }
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  async function createMemory(label: string, days = 30) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/memory')
      .set('x-goodnight-user-id', await identityFor(owner))
      .send({ title: `记忆 ${label}`, content: `内容 ${label}`, scope: 'all_ai', days })
      .expect(201);
    return res.body.item.id as string;
  }

  it('1.1 A memory is readable from the database through the route, and only by its owner', async () => {
    const id = await createMemory('读取');
    const row = await prisma.memoryItem.findUnique({ where: { id } });
    expect(row?.userId).toBe(owner);

    const mine = await request(app.getHttpServer())
      .get('/api/v1/me/memories')
      .set('x-goodnight-user-id', await identityFor(owner))
      .expect(200);
    expect(mine.body.items.map((item: { id: string }) => item.id)).toContain(id);

    const theirs = await request(app.getHttpServer())
      .get('/api/v1/me/memories')
      .set('x-goodnight-user-id', await identityFor(other))
      .expect(200);
    expect(theirs.body.items.map((item: { id: string }) => item.id)).not.toContain(id);
  });

  it('1.2 An expired memory is not editable, and extending the window cannot revive it', async () => {
    const id = await createMemory('过期');
    await prisma.memoryItem.update({ where: { id }, data: { expiresAt: await expiredAt() } });

    await request(app.getHttpServer())
      .patch(`/api/v1/me/memories/${id}`)
      .set('x-goodnight-user-id', await identityFor(owner))
      .send({ days: 30 })
      .expect(400);

    const row = await prisma.memoryItem.findUnique({ where: { id } });
    expect(row?.status).toBe('active');
    expect(new Date(row!.expiresAt).getTime()).toBeLessThan(Date.now());
  });

  it('1.3 A disabled memory stays disabled when its window is extended', async () => {
    const id = await createMemory('停用');
    await self.disableMemory(id, owner);

    await request(app.getHttpServer())
      .patch(`/api/v1/me/memories/${id}`)
      .set('x-goodnight-user-id', await identityFor(owner))
      .send({ days: 60 })
      .expect(200);

    const row = await prisma.memoryItem.findUnique({ where: { id } });
    expect(row?.status).toBe('disabled');
  });

  it('1.4 Deletion is terminal: status=deleted plus deletedAt, hidden from the list, and not revivable', async () => {
    const id = await createMemory('删除');

    await request(app.getHttpServer())
      .delete(`/api/v1/me/memories/${id}`)
      .set('x-goodnight-user-id', await identityFor(owner))
      .expect(200);

    const row = await prisma.memoryItem.findUnique({ where: { id } });
    expect(row?.status).toBe('deleted');
    expect(row?.deletedAt).not.toBeNull();

    const list = await request(app.getHttpServer())
      .get('/api/v1/me/memories')
      .set('x-goodnight-user-id', await identityFor(owner))
      .expect(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).not.toContain(id);

    // The re-consent action is the only way back, and it refuses a deleted row.
    await request(app.getHttpServer())
      .post(`/api/v1/me/memories/${id}/reactivate`)
      .set('x-goodnight-user-id', await identityFor(owner))
      .send({ days: 30 })
      .expect(400);
    expect((await prisma.memoryItem.findUnique({ where: { id } }))?.status).toBe('deleted');
  });

  it('1.5 Re-consent is the only route back from an expired row, and it writes a fresh consent', async () => {
    const id = await createMemory('重同意');
    await prisma.memoryItem.update({
      where: { id },
      data: { expiresAt: await expiredAt(), consentedAt: new Date(Date.now() - 90 * 86_400_000) },
    });
    const before = await prisma.memoryItem.findUnique({ where: { id } });

    await request(app.getHttpServer())
      .post(`/api/v1/me/memories/${id}/reactivate`)
      .set('x-goodnight-user-id', await identityFor(owner))
      .send({ days: 30 })
      .expect(201);

    const after = await prisma.memoryItem.findUnique({ where: { id } });
    expect(after?.status).toBe('active');
    expect(new Date(after!.expiresAt).getTime()).toBeGreaterThan(Date.now());
    // A fresh consent, not the one from before it lapsed.
    expect(new Date(after!.consentedAt).getTime()).toBeGreaterThan(new Date(before!.consentedAt).getTime());
  });

  it('1.6 A disabled row whose date has passed goes through re-consent rather than being re-enabled in place', async () => {
    const id = await createMemory('停用且过期');
    await prisma.memoryItem.update({
      where: { id },
      data: { status: 'disabled', expiresAt: await expiredAt() },
    });

    // The user's own switch would be 'active'; the service refuses an in-place edit of an
    // effectively expired row, so the only way back is the explicit re-consent action.
    await request(app.getHttpServer())
      .patch(`/api/v1/me/memories/${id}`)
      .set('x-goodnight-user-id', await identityFor(owner))
      .send({ days: 30 })
      .expect(400);
    await request(app.getHttpServer())
      .post(`/api/v1/me/memories/${id}/reactivate`)
      .set('x-goodnight-user-id', await identityFor(owner))
      .send({ days: 30 })
      .expect(201);

    expect((await prisma.memoryItem.findUnique({ where: { id } }))?.status).toBe('active');
  });

  it('2.1 AI eligibility requires all four predicates, and removing any one of them empties the context', async () => {
    const id = await createMemory('资格');
    const eligible = async () => (await self.listAiEligibleMemories(owner, 'breakdown', 'Mood')).map((m) => m.id);
    expect(await eligible()).toContain(id);

    // 1. consent revoked
    await prisma.privacySetting.update({ where: { userId: owner }, data: { allowAiMemoryUse: false } });
    expect(await eligible()).not.toContain(id);
    await prisma.privacySetting.update({ where: { userId: owner }, data: { allowAiMemoryUse: true } });

    // 2. disabled
    await prisma.memoryItem.update({ where: { id }, data: { status: 'disabled' } });
    expect(await eligible()).not.toContain(id);
    await prisma.memoryItem.update({ where: { id }, data: { status: 'active' } });

    // 3. effectively expired (the stored status is still 'active')
    await prisma.memoryItem.update({ where: { id }, data: { expiresAt: await expiredAt() } });
    expect(await eligible()).not.toContain(id);
    await prisma.memoryItem.update({ where: { id }, data: { expiresAt: new Date(Date.now() + 86_400_000) } });

    // 4. deleted
    await prisma.memoryItem.update({ where: { id }, data: { status: 'deleted', deletedAt: new Date() } });
    expect(await eligible()).not.toContain(id);
  });

  /**
   * 2.1 sets `status: 'deleted'` and `deletedAt` together, so it is stopped by the `status` predicate
   * and never demonstrates the `deletedAt IS NULL` predicate at all. Mutation M-I3 (that predicate
   * removed from the query) left 2.1 green — proof the predicate was unpinned rather than redundant.
   *
   * This case isolates it: `status` stays `'active'` while `deletedAt` is set. The row's stored status
   * claims it is live and only the tombstone says it is gone, so only the `deletedAt` predicate can
   * exclude it.
   *
   * Scope, stated plainly: the product's single delete path (`self-persistence.service.ts:1128-1131`)
   * writes both fields in one update, so a row with `status='active'` and a set `deletedAt` is not
   * reachable through the app today. That is defence in depth, not a fix — the value is that a future
   * migration, script, or a change to the delete path that separates the two writes cannot silently
   * put a deleted row into a prompt.
   */
  it('2.1b a tombstone alone excludes a memory even when status still says active', async () => {
    const id = await createMemory('墓碑');
    await prisma.memoryItem.update({ where: { id }, data: { status: 'active', deletedAt: new Date() } });

    const row = await prisma.memoryItem.findUnique({ where: { id } });
    expect(row?.status).toBe('active');
    expect(row?.deletedAt).not.toBeNull();

    const eligibleIds = (await self.listAiEligibleMemories(owner, 'breakdown', 'Mood')).map((m) => m.id);
    expect(eligibleIds).not.toContain(id);
  });

  it('2.2 The scope allowlist still applies on top of the four predicates', async () => {
    const journeyScoped = await createMemory('范围');
    await prisma.memoryItem.update({ where: { id: journeyScoped }, data: { scope: 'journey' } });

    expect((await self.listAiEligibleMemories(owner, 'breakdown', 'Mood')).map((m) => m.id)).not.toContain(journeyScoped);
    expect((await self.listAiEligibleMemories(owner, 'breakdown', 'Journey')).map((m) => m.id)).toContain(journeyScoped);
  });

  /**
   * The AI linearization point from §0.5/A5, stated so a later change cannot quietly move it.
   *
   * Eligibility is decided by ONE statement that joins the consent flag, so the decision
   * linearizes at that statement: a revocation committing before it excludes the memory, and one
   * committing after it lets the in-flight request finish and applies to the next one. 2.3 pins the
   * first half by revoking between two calls and observing the boundary; it cannot pin the second
   * half, which is a window inside a dispatch, so it is not claimed.
   */
  /**
   * The consent is a join predicate of the same statement - that is the linearization point the
   * design claims, and it has to be pinned on the statement itself rather than on two sequential
   * calls. A revocation observed between call 1 and call 2 is equally consistent with "consent is a
   * join in one statement" and "consent is read separately and then the memories", so the earlier
   * shape of this case could not tell the two apart.
   *
   * This counts the statements one eligibility call issues, and asserts the consent is decided
   * inside the one that reads the memories: exactly one statement, and it names the consent column.
   * A separate consent read would make it two statements, and a consent read after the memories
   * would make the order wrong even at two.
   */
  it('2.3b Eligibility decides consent inside the single statement that reads the memories', async () => {
    const id = await createMemory('单语句');
    const statements: string[] = [];
    const realQueryRaw = (self as any).prisma.$queryRaw.bind((self as any).prisma);
    (self as any).prisma.$queryRaw = async (strings: any, ...values: any[]) => {
      statements.push(String(strings?.raw ?? strings));
      return realQueryRaw(strings, ...values);
    };
    try {
      const eligible = (await self.listAiEligibleMemories(owner, 'breakdown', 'Mood')).map((m) => m.id);
      expect(eligible).toContain(id);
    } finally {
      (self as any).prisma.$queryRaw = realQueryRaw;
    }

    // Exactly one raw statement for one call - no separate consent read, no separate memories read.
    expect(statements).toHaveLength(1);
    // And that statement carries the consent as a predicate, not as a filter applied afterwards.
    expect(statements[0]).toContain('allowAiMemoryUse');
    expect(statements[0]).toContain('MemoryItem');
    // The join is the same statement, so the linearization point is this statement.
    expect(statements[0]).toMatch(/PrivacySetting[\s\S]*MemoryItem|MemoryItem[\s\S]*PrivacySetting/);

    await prisma.memoryItem.deleteMany({ where: { id } });
  });

  it('2.3 Revocation takes effect at the next eligibility statement, and the boundary is observable', async () => {
    const id = await createMemory('撤销边界');
    expect((await self.listAiEligibleMemories(owner, 'breakdown', 'Mood')).map((m) => m.id)).toContain(id);

    // The consent is a join predicate of the same statement, so this update must be visible to the
    // very next call. If the consent were read in a separate statement - the earlier shape - this is
    // where the two reads could interleave and the memory would still be served.
    await prisma.privacySetting.update({ where: { userId: owner }, data: { allowAiMemoryUse: false } });
    expect((await self.listAiEligibleMemories(owner, 'breakdown', 'Mood')).map((m) => m.id)).not.toContain(id);

    // And re-consent restores it with no other change to the row.
    await prisma.privacySetting.update({ where: { userId: owner }, data: { allowAiMemoryUse: true } });
    expect((await self.listAiEligibleMemories(owner, 'breakdown', 'Mood')).map((m) => m.id)).toContain(id);

    await prisma.memoryItem.deleteMany({ where: { id } });
  });

  it('2.4 Concurrent extension and expiry: the extension of an expired row is refused, and re-consent is the only way back', async () => {
    // The A5 hazard is not a single write but the order of two: a user extending a memory while the
    // window lapses. Both are issued at once through the real service so whichever lands second has
    // to be refused on its own merits rather than by luck.
    const id = await createMemory('并发延期');
    await prisma.memoryItem.update({ where: { id }, data: { status: 'active', expiresAt: await expiredAt() } });

    const [extend, reconsent] = await Promise.allSettled([
      self.updateMemory(id, owner, { days: 60 }),
      self.reactivateMemory(id, owner, 60),
    ]);

    const row = await prisma.memoryItem.findUniqueOrThrow({ where: { id } });
    // One of the two must have succeeded. "Both refused" is what this case watches for: the row
    // would be left expired with no way forward, which is the same user-visible stuck state A5
    // forbids from the other direction.
    expect(extend.status === 'fulfilled' || reconsent.status === 'fulfilled').toBe(true);
    // `updateMemory` writes no status field, so a fulfilled extension on this row means the
    // re-consent landed first and the extension followed a row that was active again. It is never
    // evidence that the extension alone revived an expired row - 2.5 pins that sequentially.
    if (extend.status === 'fulfilled') {
      expect(reconsent.status).toBe('fulfilled');
    }
    expect(row.status).toBe('active');
    expect(row.deletedAt).toBeNull();
    expect(Date.parse(String(row.expiresAt))).toBeGreaterThan(Date.now());
    expect(Date.parse(String(row.consentedAt))).toBeGreaterThan(Date.now() - 3_600_000);
    await prisma.memoryItem.deleteMany({ where: { id } });
  });

  /**
   * 2.4 races the two writes, so it cannot say which one succeeded. This case states the sequential
   * behaviour: an extension alone is refused on an expired row, the refused extension moves no date,
   * and only then does re-consent open the row. Together they cover both halves - the race proves
   * the pair never leaves the row stuck, and this proves the extension alone never revives it.
   */
  it('2.5 An extension alone on an expired row is refused, and re-consent then opens it', async () => {
    const id = await createMemory('单独延期');
    await prisma.memoryItem.update({ where: { id }, data: { status: 'active', expiresAt: await expiredAt() } });

    await expect(self.updateMemory(id, owner, { days: 60 })).rejects.toThrow(/已经过期/);

    const afterRefused = await prisma.memoryItem.findUniqueOrThrow({ where: { id } });
    expect(afterRefused.status).toBe('active');
    // The refused extension did not move the date, so the row is still effectively expired and
    // therefore still invisible to a prompt.
    expect((await self.listAiEligibleMemories(owner, 'breakdown', 'Mood')).map((m) => m.id)).not.toContain(id);

    const revived = await self.reactivateMemory(id, owner, 60);
    expect(revived.status).toBe('active');
    expect(Date.parse(String(revived.expiresAt))).toBeGreaterThan(Date.now());
    expect((await self.listAiEligibleMemories(owner, 'breakdown', 'Mood')).map((m) => m.id)).toContain(id);
    await prisma.memoryItem.deleteMany({ where: { id } });
  });

  it('3.1 The admin memory list is metadata-only and never searches the memory text', async () => {
    const id = await createMemory('后台披露');
    const adminLogin = await request(app.getHttpServer())
      .post('/api/admin/v1/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(201);
    const token = adminLogin.body.token as string;

    const listed = await request(app.getHttpServer())
      .get('/api/admin/v1/memory')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const payload = JSON.stringify(listed.body);
    expect(payload).not.toContain('内容 后台披露');
    expect(payload).not.toContain('记忆 后台披露');

    const byText = await request(app.getHttpServer())
      .get(`/api/admin/v1/memory?q=${encodeURIComponent('内容 后台披露')}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(byText.body.items.map((item: { id: string }) => item.id)).not.toContain(id);
  });
});
