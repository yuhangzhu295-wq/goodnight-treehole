import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp, loginAdmin } from './helpers';
import { SelfPersistenceService } from '../../apps/api/src/self-persistence.service';

/**
 * Task R-07: Admin minimal disclosure and audited single-record read.
 * (§0.4/S4, §0.5/A7, autonomous findings 7)
 *
 * Rules:
 * 1. Admin list/search returns metadata only. No memory content, no support plan JSON.
 *    Full-text search never matches on private text (content or plan).
 * 2. Full content is available only through an explicit single-record admin read.
 * 3. The single-record read persists an AuditLog row BEFORE returning content. If the audit
 *    insert fails, no content is returned.
 * 4. The AuditLog row records who, which record and why, and never contains private text.
 * 5. Callers without an admin token/role are refused (401).
 */
describe('Batch 3 Task R-07: Admin minimal disclosure and audited reads', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: any;
  let adminToken: string;
  let selfPersistence: SelfPersistenceService;
  const userA = 'user_demo';

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    server = app.getHttpServer();
    adminToken = await loginAdmin(server);
    selfPersistence = app.get(SelfPersistenceService);

    await prisma.user.upsert({
      where: { id: userA },
      create: { id: userA, openid: `openid_${userA}`, anonymousCode: `anon_${userA}`, nickname: '测试用户A' },
      update: {},
    });

    await prisma.privacySetting.upsert({
      where: { userId: userA },
      create: { userId: userA, allowRecoveryData: true, allowLongTermMemory: true, allowAiMemoryUse: true },
      update: { allowRecoveryData: true, allowLongTermMemory: true, allowAiMemoryUse: true },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it('1.1 Admin memory list: returns metadata only, omitting content; query string matching content text returns 0 matches', async () => {
    const memoryId = `mem_priv_${Date.now()}`;
    const secretContent = `secret_memory_text_${Date.now()}`;
    await prisma.memoryItem.create({
      data: {
        id: memoryId,
        userId: userA,
        title: '公开标题',
        category: '用户主动保存',
        content: secretContent,
        scope: 'all_ai',
        status: 'active',
        consentedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000 * 30),
      },
    });

    // 1. Unfiltered list returns the memory metadata, but content MUST be undefined
    const resAll = await request(server)
      .get('/api/admin/v1/memory')
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    const found = resAll.body.items.find((item: any) => item.id === memoryId);
    expect(found).toBeDefined();
    expect(found.id).toBe(memoryId);
    expect(found.userId).toBe(userA);
    expect(found.category).toBe('用户主动保存');
    // Content must be absent
    expect(found.content).toBeUndefined();

    // 2. Searching by the private content word must return 0 matches
    const resSearch = await request(server)
      .get(`/api/admin/v1/memory?q=${encodeURIComponent(secretContent)}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(resSearch.body.items).toHaveLength(0);
    expect(resSearch.body.total).toBe(0);
  });

  it('1.2 Admin support plan list: returns metadata only, omitting plan JSON; query string matching plan content returns 0 matches', async () => {
    const planId = `plan_priv_${Date.now()}`;
    const secretTrigger = `secret_trigger_word_${Date.now()}`;
    await prisma.personalSupportPlan.create({
      data: {
        id: planId,
        userId: userA,
        title: '低谷应对方案',
        plan: {
          warningSigns: [secretTrigger],
          selfHelp: '散步深呼吸',
        },
        active: true,
      },
    });

    // 1. Unfiltered list returns metadata, plan field MUST be undefined
    const resAll = await request(server)
      .get('/api/admin/v1/support/plans')
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    const found = resAll.body.items.find((item: any) => item.id === planId);
    expect(found).toBeDefined();
    expect(found.id).toBe(planId);
    expect(found.title).toBe('低谷应对方案');
    // Plan must be absent
    expect(found.plan).toBeUndefined();

    // 2. Searching by the private trigger word inside plan must return 0 matches
    const resSearch = await request(server)
      .get(`/api/admin/v1/support/plans?q=${encodeURIComponent(secretTrigger)}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(resSearch.body.items).toHaveLength(0);
    expect(resSearch.body.total).toBe(0);
  });

  it('1.3 Admin single-record memory: audited read persists AuditLog row first and returns full content', async () => {
    const memoryId = `mem_audit_${Date.now()}`;
    const secretContent = `audited_private_memory_${Date.now()}`;
    await prisma.memoryItem.create({
      data: {
        id: memoryId,
        userId: userA,
        title: '敏感记忆条目',
        category: '心理倾诉',
        content: secretContent,
        scope: 'journey',
        status: 'active',
        consentedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000 * 30),
      },
    });

    const res = await request(server)
      .get(`/api/admin/v1/memory/${memoryId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.item).toBeDefined();
    expect(res.body.item.id).toBe(memoryId);
    expect(res.body.item.content).toBe(secretContent);

    // AuditLog must be committed in PostgreSQL
    const audit = await prisma.auditLog.findFirst({
      where: {
        resourceType: 'MemoryItem',
        resourceId: memoryId,
        action: 'MEMORY_READ_FULL',
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(audit).not.toBeNull();
    expect(audit?.adminUserId).toBeTruthy();
    const after = audit?.afterJson as Record<string, unknown>;
    expect(after?.targetUserId).toBe(userA);
    expect(after?.category).toBe('心理倾诉');
    // Crucial: audit log must NOT contain the private content
    expect(after?.content).toBeUndefined();
    expect(JSON.stringify(audit)).not.toContain(secretContent);
  });

  it('1.4 Admin single-record support plan: audited read persists AuditLog row first and returns full content', async () => {
    const planId = `plan_audit_${Date.now()}`;
    const secretHelp = `emergency_contact_help_${Date.now()}`;
    await prisma.personalSupportPlan.create({
      data: {
        id: planId,
        userId: userA,
        title: '紧急自救计划',
        plan: { emergency: secretHelp },
        active: true,
      },
    });

    const res = await request(server)
      .get(`/api/admin/v1/support/plans/${planId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.item).toBeDefined();
    expect(res.body.item.id).toBe(planId);
    expect(res.body.item.plan).toEqual({ emergency: secretHelp });

    // AuditLog must be committed in PostgreSQL
    const audit = await prisma.auditLog.findFirst({
      where: {
        resourceType: 'PersonalSupportPlan',
        resourceId: planId,
        action: 'SUPPORT_PLAN_READ_FULL',
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(audit).not.toBeNull();
    expect(audit?.adminUserId).toBeTruthy();
    const after = audit?.afterJson as Record<string, unknown>;
    expect(after?.targetUserId).toBe(userA);
    expect(after?.title).toBe('紧急自救计划');
    // Crucial: audit log must NOT contain the plan JSON
    expect(after?.plan).toBeUndefined();
    expect(JSON.stringify(audit)).not.toContain(secretHelp);
  });

  it('1.5 Audit failure refusal: if audit log insert fails, no content is returned', async () => {
    const memoryId = `mem_fail_audit_${Date.now()}`;
    await prisma.memoryItem.create({
      data: {
        id: memoryId,
        userId: userA,
        title: '审计失败测试',
        category: '测试',
        content: '绝密记忆内容不可泄露',
        scope: 'all_ai',
        status: 'active',
        consentedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000 * 30),
      },
    });

    // Simulating audit insert failure on prisma.auditLog.create
    const origCreate = (prisma as any).auditLog.create;
    const selfPrisma = (selfPersistence as any).prisma;
    const origSelfAuditCreate = selfPrisma.auditLog.create;
    selfPrisma.auditLog.create = async () => {
      throw new Error('Simulated database failure during audit log insertion');
    };

    try {
      const res = await request(server)
        .get(`/api/admin/v1/memory/${memoryId}`)
        .set('authorization', `Bearer ${adminToken}`)
        .expect(500);

      // Verify no memory content was returned in body
      expect(res.body?.item).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('绝密记忆内容不可泄露');
    } finally {
      selfPrisma.auditLog.create = origSelfAuditCreate;
      (prisma as any).auditLog.create = origCreate;
    }
  });

  it('1.6 Caller without admin role or unauthenticated is refused with 401', async () => {
    const memoryId = `mem_auth_check_${Date.now()}`;
    await prisma.memoryItem.create({
      data: {
        id: memoryId,
        userId: userA,
        title: '权限检查',
        category: '测试',
        content: '非管理员不可读',
        scope: 'all_ai',
        status: 'active',
        consentedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000 * 30),
      },
    });

    // 1. Unauthenticated callers
    await request(server).get('/api/admin/v1/memory').expect(401);
    await request(server).get(`/api/admin/v1/memory/${memoryId}`).expect(401);
    await request(server).get('/api/admin/v1/support/plans').expect(401);
    await request(server).get(`/api/admin/v1/support/plans/dummy`).expect(401);

    // 2. Caller sending user header without admin authorization
    await request(server)
      .get(`/api/admin/v1/memory/${memoryId}`)
      .set('x-goodnight-user-id', userA)
      .expect(401);

    await request(server)
      .get(`/api/admin/v1/memory`)
      .set('x-goodnight-user-id', userA)
      .expect(401);

    await request(server)
      .get('/api/admin/v1/support/plans')
      .set('x-goodnight-user-id', userA)
      .expect(401);

    await request(server)
      .get(`/api/admin/v1/support/plans/dummy`)
      .set('x-goodnight-user-id', userA)
      .expect(401);
  });
});
