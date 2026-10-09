import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApiTestApp, identityFor } from './helpers';
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
    await prisma.memoryItem.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });

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
      data: { expiresAt: new Date(Date.now() - 1000), consentedAt: new Date(Date.now() - 90 * 86_400_000) },
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
      data: { status: 'disabled', expiresAt: new Date(Date.now() - 1000) },
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
    await prisma.memoryItem.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await eligible()).not.toContain(id);
    await prisma.memoryItem.update({ where: { id }, data: { expiresAt: new Date(Date.now() + 86_400_000) } });

    // 4. deleted
    await prisma.memoryItem.update({ where: { id }, data: { status: 'deleted', deletedAt: new Date() } });
    expect(await eligible()).not.toContain(id);
  });

  it('2.2 The scope allowlist still applies on top of the four predicates', async () => {
    const journeyScoped = await createMemory('范围');
    await prisma.memoryItem.update({ where: { id: journeyScoped }, data: { scope: 'journey' } });

    expect((await self.listAiEligibleMemories(owner, 'breakdown', 'Mood')).map((m) => m.id)).not.toContain(journeyScoped);
    expect((await self.listAiEligibleMemories(owner, 'breakdown', 'Journey')).map((m) => m.id)).toContain(journeyScoped);
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
