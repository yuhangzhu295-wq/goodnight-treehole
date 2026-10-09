import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp, identityFor } from './helpers';

/**
 * Task R-08: MemoryCenter effective state branching and re-consent flow.
 * (§0.4/S2, §0.5/A5, §0.6/A5, autonomous findings 8)
 *
 * Rules:
 * 1. Effective state branching:
 *    - active (future expiresAt): may be edited, disabled, expired, deleted.
 *    - disabled (future expiresAt): gets ordinary re-enable (PATCH status='active').
 *    - expired (past expiresAt, stored active or disabled): edit is refused; ordinary re-enable is
 *      refused; only the explicit re-consent action (POST /me/memories/:id/reactivate) can restore it.
 *    - deleted (status='deleted' / deletedAt != null): terminal, re-consent refused.
 * 2. Re-consent action:
 *    - Calls POST /api/v1/me/memories/:id/reactivate.
 *    - Writes fresh consentedAt and future expiresAt.
 *    - If refused (e.g. deleted), server returns 400 and error message is reflected.
 * 3. Flow end to end:
 *    - Database update commits, survives refresh, and survives API application restart.
 */
describe('Batch 3 Task R-08: MemoryCenter effective state and re-consent', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: any;
  const owner = 'user_demo';

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    server = app.getHttpServer();

    await prisma.user.upsert({
      where: { id: owner },
      create: { id: owner, openid: `openid_${owner}`, anonymousCode: `anon_${owner}`, nickname: '测试用户' },
      update: {},
    });

    await prisma.privacySetting.upsert({
      where: { userId: owner },
      create: { userId: owner, allowRecoveryData: true, allowLongTermMemory: true, allowAiMemoryUse: true },
      update: { allowRecoveryData: true, allowLongTermMemory: true, allowAiMemoryUse: true },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('1.1 Active memory (future expiresAt) allows editing and ordinary disable', async () => {
    const memoryId = `mem_act_${Date.now()}`;
    await prisma.memoryItem.create({
      data: {
        id: memoryId,
        userId: owner,
        title: '初始标题',
        category: '用户主动保存',
        content: '初始内容',
        scope: 'all_ai',
        status: 'active',
        consentedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000 * 30),
      },
    });

    // Edit succeeds
    const editRes = await request(server)
      .patch(`/api/v1/me/memories/${memoryId}`)
      .set('x-goodnight-user-id', identityFor(owner))
      .send({ title: '已修改标题', content: '已修改内容' })
      .expect(200);

    expect(editRes.body.item.title).toBe('已修改标题');

    // Disable succeeds
    const disRes = await request(server)
      .patch(`/api/v1/me/memories/${memoryId}`)
      .set('x-goodnight-user-id', identityFor(owner))
      .send({ status: 'disabled' })
      .expect(200);

    expect(disRes.body.item.status).toBe('disabled');
  });

  it('1.2 Disabled memory with future date allows ordinary re-enable in place', async () => {
    const memoryId = `mem_dis_future_${Date.now()}`;
    await prisma.memoryItem.create({
      data: {
        id: memoryId,
        userId: owner,
        title: '未到期停用记忆',
        category: '用户主动保存',
        content: '未到期内容',
        scope: 'all_ai',
        status: 'disabled',
        consentedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000 * 20),
      },
    });

    // Ordinary re-enable (PATCH status: active) succeeds when date is in future
    const res = await request(server)
      .patch(`/api/v1/me/memories/${memoryId}`)
      .set('x-goodnight-user-id', identityFor(owner))
      .send({ status: 'active' })
      .expect(200);

    expect(res.body.item.status).toBe('active');
    const dbRow = await prisma.memoryItem.findUnique({ where: { id: memoryId } });
    expect(dbRow?.status).toBe('active');
  });

  it('1.3 Stored active memory past its date refuses edit/in-place extension; re-consent restores it', async () => {
    const memoryId = `mem_act_past_${Date.now()}`;
    const pastConsent = new Date(Date.now() - 86_400_000 * 60);
    const pastExpiry = new Date(Date.now() - 1000);
    await prisma.memoryItem.create({
      data: {
        id: memoryId,
        userId: owner,
        title: '过期活跃记忆',
        category: '用户主动保存',
        content: '过期内容',
        scope: 'all_ai',
        status: 'active',
        consentedAt: pastConsent,
        expiresAt: pastExpiry,
      },
    });

    // 1. Edit affordance is refused: cannot edit an effectively expired row
    const editRes = await request(server)
      .patch(`/api/v1/me/memories/${memoryId}`)
      .set('x-goodnight-user-id', identityFor(owner))
      .send({ title: '尝试更新过期记忆' })
      .expect(400);

    expect(editRes.body.message).toContain('这条记忆已经过期，需要重新确认后才能继续使用');

    // 2. Extending the window in-place is also refused
    await request(server)
      .patch(`/api/v1/me/memories/${memoryId}`)
      .set('x-goodnight-user-id', identityFor(owner))
      .send({ days: 60 })
      .expect(400);

    // 3. Re-consent action succeeds
    const reconsentRes = await request(server)
      .post(`/api/v1/me/memories/${memoryId}/reactivate`)
      .set('x-goodnight-user-id', identityFor(owner))
      .send({ days: 90 })
      .expect(201);

    expect(reconsentRes.body.item.status).toBe('active');
    expect(new Date(reconsentRes.body.item.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(reconsentRes.body.item.consentedAt).getTime()).toBeGreaterThan(pastConsent.getTime());
  });

  it('1.4 Stored disabled memory past its date refuses ordinary re-enable; re-consent restores it', async () => {
    const memoryId = `mem_dis_past_${Date.now()}`;
    await prisma.memoryItem.create({
      data: {
        id: memoryId,
        userId: owner,
        title: '停用且已过期的记忆',
        category: '用户主动保存',
        content: '停用过期内容',
        scope: 'all_ai',
        status: 'disabled',
        consentedAt: new Date(Date.now() - 86_400_000 * 90),
        expiresAt: new Date(Date.now() - 2000),
      },
    });

    // 1. Ordinary "恢复使用" (PATCH status: active) is refused because effective state is expired
    const patchRes = await request(server)
      .patch(`/api/v1/me/memories/${memoryId}`)
      .set('x-goodnight-user-id', identityFor(owner))
      .send({ status: 'active' })
      .expect(400);

    expect(patchRes.body.message).toContain('这条记忆已经过期，需要重新确认后才能继续使用');

    // 2. Explicit re-consent succeeds
    const reactivateRes = await request(server)
      .post(`/api/v1/me/memories/${memoryId}/reactivate`)
      .set('x-goodnight-user-id', identityFor(owner))
      .send({ days: 90 })
      .expect(201);

    expect(reactivateRes.body.item.status).toBe('active');
    expect(new Date(reactivateRes.body.item.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('1.5 Deleted memory is terminal: refuses re-consent and reflects refusal', async () => {
    const memoryId = `mem_del_${Date.now()}`;
    await prisma.memoryItem.create({
      data: {
        id: memoryId,
        userId: owner,
        title: '已删除记忆',
        category: '用户主动保存',
        content: '已删除内容',
        scope: 'all_ai',
        status: 'deleted',
        consentedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000 * 10),
        deletedAt: new Date(),
      },
    });

    // Re-consent on deleted row is refused with 400
    const res = await request(server)
      .post(`/api/v1/me/memories/${memoryId}/reactivate`)
      .set('x-goodnight-user-id', identityFor(owner))
      .send({ days: 90 })
      .expect(400);

    expect(res.body.message).toContain('已删除的记忆不能恢复');

    // In-place update is refused with 404
    await request(server)
      .patch(`/api/v1/me/memories/${memoryId}`)
      .set('x-goodnight-user-id', identityFor(owner))
      .send({ title: '已删除试图更新' })
      .expect(404);
  });

  it('1.6 End-to-end durability: re-consented memory persists to PostgreSQL and survives API restart', async () => {
    const memoryId = `mem_durability_${Date.now()}`;
    await prisma.memoryItem.create({
      data: {
        id: memoryId,
        userId: owner,
        title: '耐久性测试记忆',
        category: '用户主动保存',
        content: '重启前内容',
        scope: 'all_ai',
        status: 'expired',
        consentedAt: new Date(Date.now() - 86_400_000 * 100),
        expiresAt: new Date(Date.now() - 10000),
      },
    });

    // 1. Re-consent call
    await request(server)
      .post(`/api/v1/me/memories/${memoryId}/reactivate`)
      .set('x-goodnight-user-id', identityFor(owner))
      .send({ days: 120 })
      .expect(201);

    // 2. Direct PostgreSQL verification
    const dbRow = await prisma.memoryItem.findUnique({ where: { id: memoryId } });
    expect(dbRow?.status).toBe('active');
    expect(new Date(dbRow!.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(dbRow!.consentedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);

    // 3. Simulate API restart
    await app.close();
    app = await createApiTestApp();
    server = app.getHttpServer();

    // 4. Read back after restart
    const res = await request(server)
      .get('/api/v1/me/memories')
      .set('x-goodnight-user-id', identityFor(owner))
      .expect(200);

    const found = res.body.items.find((item: any) => item.id === memoryId);
    expect(found).toBeDefined();
    expect(found.status).toBe('active');
    expect(new Date(found.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(found.title).toBe('耐久性测试记忆');
  });
});
