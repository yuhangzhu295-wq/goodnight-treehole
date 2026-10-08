import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApiTestApp } from './helpers';
import { PrismaRuntimeService } from '../../apps/api/src/prisma-runtime.service';
import { SelfPersistenceService } from '../../apps/api/src/self-persistence.service';
import { StoreService } from '../../apps/api/src/store.service';
import { saveRelationalRuntimeState } from '../../apps/api/src/relational-runtime.mapper';

/**
 * Batch 3: DecisionRecord + CooldownItem database authority, lifecycle,
 * CAS supersede concurrency, and clock_timestamp() deadline guards (B3-S3).
 */
describe('Batch 3: DecisionRecord + CooldownItem database authority and lifecycle', () => {
  let app: INestApplication;
  let prisma: any;
  let selfPersistence: SelfPersistenceService;
  let store: StoreService;
  const owner = 'user_demo';
  const other = 'user_guest';

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = app.get(PrismaRuntimeService);
    selfPersistence = app.get(SelfPersistenceService);
    store = app.get(StoreService);

    // Ensure baseline users exist in DB
    await prisma.user.upsert({
      where: { id: owner },
      create: { id: owner, openid: `openid_${owner}`, anonymousCode: `anon_${owner}`, nickname: '测试用户_主' },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: other },
      create: { id: other, openid: `openid_${other}`, anonymousCode: `anon_${other}`, nickname: '测试用户_客' },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  it('1.1 A cooldown that is still running refuses the ready action', async () => {
    const server = app.getHttpServer();
    const question = `冷静中拒绝变更_${Date.now()}`;

    // 1. Create a decision (draft)
    const createRes = await request(server)
      .post('/api/v1/decisions')
      .set('x-goodnight-user-id', owner)
      .send({ question, options: ['选项A', '选项B'], criteria: ['标准1'] })
      .expect(201);
    const decisionId = createRes.body.item.id as string;
    expect(createRes.body.item.status).toBe('draft');

    // 2. Put it into cooldown (24 hours into future)
    const cdRes = await request(server)
      .post('/api/v1/cooldowns')
      .set('x-goodnight-user-id', owner)
      .send({ decisionId, title: '未过期的冷静期', reason: '需要降温', hours: 24 })
      .expect(201);
    expect(cdRes.body.item.status).toBe('active');

    // 3. Attempt to prematurely mark as ready -> must be refused with 400
    const patchRes = await request(server)
      .patch(`/api/v1/decisions/${decisionId}`)
      .set('x-goodnight-user-id', owner)
      .send({ status: 'ready' })
      .expect(400);
    expect(patchRes.body.message).toContain('冷静时间还没有结束');

    // 4. Assert in DB directly: decision status remains cooling
    const dbRow = await prisma.decisionRecord.findUnique({ where: { id: decisionId } });
    expect(dbRow?.status).toBe('cooling');
  });

  it('1.2 A cooldown whose deadline passed during a held lock does not let the action through', async () => {
    const question = `锁期间过期决策_${Date.now()}`;

    // Create decision directly via service
    const decision = await selfPersistence.createDecision({
      userId: owner,
      question,
      options: ['A', 'B'],
    });

    // Create a cooling item whose deadline is 1.0 second in the future
    const nearFuture = new Date(Date.now() + 1000);
    const cooldownId = `cd_expire_tx_${Date.now()}`;
    await prisma.cooldownItem.create({
      data: {
        id: cooldownId,
        userId: owner,
        decisionId: decision.id,
        title: '短暂冷静事项',
        releaseAt: nearFuture,
        status: 'active',
      },
    });
    await prisma.decisionRecord.update({
      where: { id: decision.id },
      data: { status: 'cooling', cooldownUntil: nearFuture },
    });

    // Attempt to add a new cooldown to this cooling decision with _onBeforeLock holding 1.8s
    // so the deadline passes while the transaction is open.
    // Under clock_timestamp(), the check sees the deadline has passed, so the cooling phase ended:
    // throws "这个决定已经结束冷静期".
    await expect(
      selfPersistence.createCooldown(
        {
          userId: owner,
          decisionId: decision.id,
          title: '试图在过期后再次冷静',
          hours: 12,
        },
        {
          _onBeforeLock: () => new Promise<void>((resolve) => setTimeout(resolve, 1800)),
        },
      ),
    ).rejects.toThrow(/这个决定已经结束冷静期/);

    // Verify DB: no second active cooldown was created
    const activeCds = await prisma.cooldownItem.findMany({
      where: { decisionId: decision.id, status: 'active' },
    });
    expect(activeCds.length).toBe(1);
    expect(activeCds[0].id).toBe(cooldownId);
  }, 30_000);

  it('1.3 Two concurrent supersedes for the same subject: exactly one wins and the loser gets 409 conflict', async () => {
    const server = app.getHttpServer();
    const subject = `并发取代测试主题_${Date.now()}`;

    // Initial open decision
    const baseRes = await request(server)
      .post('/api/v1/decisions')
      .set('x-goodnight-user-id', owner)
      .send({ question: subject, options: ['基础A', '基础B'] })
      .expect(201);
    const baseId = baseRes.body.item.id as string;

    // Concurrently dispatch two supersedes targeting baseId
    const [race1, race2] = await Promise.allSettled([
      request(server)
        .post('/api/v1/decisions')
        .set('x-goodnight-user-id', owner)
        .send({ question: subject, supersedesId: baseId, options: ['竞争者1'] }),
      request(server)
        .post('/api/v1/decisions')
        .set('x-goodnight-user-id', owner)
        .send({ question: subject, supersedesId: baseId, options: ['竞争者2'] }),
    ]);

    const statuses = [
      race1.status === 'fulfilled' ? race1.value.status : null,
      race2.status === 'fulfilled' ? race2.value.status : null,
    ];

    // Exactly one wins (201), the other gets 409 Conflict
    expect(statuses).toContain(201);
    expect(statuses).toContain(409);

    // Verify in PostgreSQL: baseId is superseded
    const baseRow = await prisma.decisionRecord.findUnique({ where: { id: baseId } });
    expect(baseRow?.status).toBe('superseded');

    // And exactly ONE open decision remains for this subject
    const openRows = await prisma.decisionRecord.findMany({
      where: { userId: owner, question: subject, status: { in: ['draft', 'cooling', 'ready'] } },
    });
    expect(openRows.length).toBe(1);
  });

  it('1.4 The superseded decision is not readable as open', async () => {
    const server = app.getHttpServer();
    const question = `被取代不可作为开启读写_${Date.now()}`;

    const created = await selfPersistence.createDecision({
      userId: owner,
      question,
      options: ['初始'],
    });

    // Supersede it
    await selfPersistence.createDecision({
      userId: owner,
      question,
      supersedesId: created.id,
      options: ['取代新决定'],
    });

    // Read the superseded decision from DB
    const oldRow = await prisma.decisionRecord.findUnique({ where: { id: created.id } });
    expect(oldRow?.status).toBe('superseded');

    // Open decision list does not treat it as open
    const openDecisions = await prisma.decisionRecord.findMany({
      where: { id: created.id, status: { in: ['draft', 'cooling', 'ready'] } },
    });
    expect(openDecisions.length).toBe(0);

    // Attempting to patch question/options on superseded decision must be rejected (cannot edit)
    const patchRes = await request(server)
      .patch(`/api/v1/decisions/${created.id}`)
      .set('x-goodnight-user-id', owner)
      .send({ question: '试图修改已取代决定' })
      .expect(200); // Does not change question since not in ['draft', 'cooling', 'ready']
    expect(patchRes.body.item.question).toBe(question);

    // Attempting to transition superseded to ready must be rejected with 400
    const transitionRes = await request(server)
      .patch(`/api/v1/decisions/${created.id}`)
      .set('x-goodnight-user-id', owner)
      .send({ status: 'ready' })
      .expect(400);
    expect(transitionRes.body.message).toContain('不能从 superseded 变更为 ready');

    // Attempting to create cooldown on superseded decision fails
    const cdRes = await request(server)
      .post('/api/v1/cooldowns')
      .set('x-goodnight-user-id', owner)
      .send({ decisionId: created.id, title: '非法冷静' })
      .expect(400);
    expect(cdRes.body.message).toContain('这个决定已经结束冷静期');
  });

  it('1.5 A decision whose owner differs is not readable or mutable at all by foreign user', async () => {
    const server = app.getHttpServer();
    const question = `所有权隔离决策_${Date.now()}`;

    // Owner creates decision
    const createRes = await request(server)
      .post('/api/v1/decisions')
      .set('x-goodnight-user-id', owner)
      .send({ question, options: ['私密A'] })
      .expect(201);
    const decisionId = createRes.body.item.id as string;

    // Foreign user (other) cannot see owner's decision in list
    const otherList = await request(server)
      .get('/api/v1/decisions')
      .set('x-goodnight-user-id', other)
      .expect(200);
    expect(otherList.body.items.some((d: any) => d.id === decisionId)).toBe(false);

    // Foreign user cannot PATCH owner's decision -> 404
    const foreignPatch = await request(server)
      .patch(`/api/v1/decisions/${decisionId}`)
      .set('x-goodnight-user-id', other)
      .send({ decision: '非法决定' });
    expect(foreignPatch.status).toBe(404);
    expect(foreignPatch.body.message).toContain('决策记录不存在或无权访问');

    // Foreign user cannot create cooldown on owner's decision -> 404
    const foreignCd = await request(server)
      .post('/api/v1/cooldowns')
      .set('x-goodnight-user-id', other)
      .send({ decisionId, title: '非法冷静', hours: 24 });
    expect(foreignCd.status).toBe(404);
    expect(foreignCd.body.message).toContain('决策记录不存在或无权访问');
  });

  it('1.6 Full flush survival: DecisionRecord and CooldownItem survive saveRelationalRuntimeState without being swept or overwritten', async () => {
    const decisionId = `dec_flush_survive_${Date.now()}`;
    const cooldownId = `cd_flush_survive_${Date.now()}`;

    // 1. Insert directly into PostgreSQL via PrismaClient
    await prisma.decisionRecord.create({
      data: {
        id: decisionId,
        userId: owner,
        question: '持久化耐久验证决策',
        options: ['A', 'B'],
        criteria: ['C1'],
        decision: '最终决定文本',
        status: 'decided',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await prisma.cooldownItem.create({
      data: {
        id: cooldownId,
        userId: owner,
        decisionId,
        title: '持久化冷静事项',
        reason: '冷静理由',
        releaseAt: new Date(Date.now() + 86400000),
        status: 'active',
        createdAt: new Date(),
      },
    });

    // 2. Simulate another instance triggering saveRelationalRuntimeState
    // with empty decisionRecords and cooldownItems arrays (e.g. state without in-memory entries)
    const testState = {
      users: [
        {
          id: owner,
          openid: `openid_${owner}`,
          nickname: '测试用户_主',
          anonymousCode: `anon_${owner}`,
          status: 'normal',
          createdAt: new Date().toISOString(),
        },
      ],
      decisionRecords: [], // Empty: direct DB model must not be swept by deleteAbsent
      cooldownItems: [],   // Empty: direct DB model must not be swept by deleteAbsent
    };

    await saveRelationalRuntimeState(prisma as any, testState);

    // 3. Verify with fresh read that both DecisionRecord and CooldownItem survived intact
    const dbDecision = await prisma.decisionRecord.findUnique({ where: { id: decisionId } });
    expect(dbDecision).not.toBeNull();
    expect(dbDecision?.question).toBe('持久化耐久验证决策');
    expect(dbDecision?.decision).toBe('最终决定文本');
    expect(dbDecision?.status).toBe('decided');

    const dbCooldown = await prisma.cooldownItem.findUnique({ where: { id: cooldownId } });
    expect(dbCooldown).not.toBeNull();
    expect(dbCooldown?.title).toBe('持久化冷静事项');
    expect(dbCooldown?.status).toBe('active');
  });

  it('1.7 FK three-case rule: undefined omits, null detaches, foreign journeyId is rejected with 404', async () => {
    const server = app.getHttpServer();

    // Create a journey for owner
    const journey = await prisma.lifeJourney.create({
      data: {
        id: `journey_fk_test_${Date.now()}`,
        userId: owner,
        title: '所有权验证旅程',
        domain: '生活',
        status: 'active',
        stage: 'clarifying',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Create a foreign journey for other user
    const foreignJourney = await prisma.lifeJourney.create({
      data: {
        id: `journey_foreign_${Date.now()}`,
        userId: other,
        title: '他人私密旅程',
        domain: '工作',
        status: 'active',
        stage: 'clarifying',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Case 1: String reference validated for existence and ownership -> succeeds
    const dRes = await request(server)
      .post('/api/v1/decisions')
      .set('x-goodnight-user-id', owner)
      .send({ journeyId: journey.id, question: '关联旅程的决定' })
      .expect(201);
    const decisionId = dRes.body.item.id as string;
    expect(dRes.body.item.journeyId).toBe(journey.id);

    // Case 2: Attempting to connect foreign journey -> rejected with 404
    const foreignRes = await request(server)
      .post('/api/v1/decisions')
      .set('x-goodnight-user-id', owner)
      .send({ journeyId: foreignJourney.id, question: '非法关联他人旅程' });
    expect(foreignRes.status).toBe(404);
    expect(foreignRes.body.message).toContain('旅程不存在或无权访问');

    // Case 3: undefined omits column -> committed journeyId survives
    await selfPersistence.updateDecision(decisionId, owner, {
      question: '更新问题文本保持旅程不变',
    });
    const rowPreserved = await prisma.decisionRecord.findUnique({ where: { id: decisionId } });
    expect(rowPreserved?.journeyId).toBe(journey.id);

    // Case 4: null detaches explicitly
    await selfPersistence.updateDecision(decisionId, owner, {
      journeyId: null,
    });
    const rowDetached = await prisma.decisionRecord.findUnique({ where: { id: decisionId } });
    expect(rowDetached?.journeyId).toBeNull();
  });

  it('1.8 Cooldown release: worker delivers intact cooldown and readies decision, while mismatched or expired cooldown closes job as superseded', async () => {
    // 1. Valid intact case: cooldown and decision linked, deadline passed
    const decision = await selfPersistence.createDecision({
      userId: owner,
      question: `有效冷静交付_${Date.now()}`,
    });

    const past = new Date(Date.now() - 5000);
    const validCdId = `cd_valid_${Date.now()}`;
    const validJobId = `job_valid_${Date.now()}`;

    await prisma.cooldownItem.create({
      data: {
        id: validCdId,
        userId: owner,
        decisionId: decision.id,
        title: '已到期冷静事项',
        releaseAt: past,
        status: 'active',
      },
    });

    await prisma.decisionRecord.update({
      where: { id: decision.id },
      data: { status: 'cooling', cooldownUntil: past },
    });

    await prisma.followUpJob.create({
      data: {
        id: validJobId,
        userId: owner,
        kind: 'DECISION_COOLDOWN',
        dueAt: past,
        status: 'pending',
        payload: { cooldownId: validCdId, decisionId: decision.id },
      },
    });

    // Deliver through selfPersistence.deliverCooldownJob in transaction
    const deliverResult = await prisma.$transaction(async (tx) => {
      return await selfPersistence.deliverCooldownJob(
        tx,
        { id: validJobId, userId: owner, payload: { cooldownId: validCdId, decisionId: decision.id } },
        new Date(),
      );
    });
    expect(deliverResult.status).toBe('delivered');

    // Assert rows in DB
    const dbCd = await prisma.cooldownItem.findUnique({ where: { id: validCdId } });
    expect(dbCd?.status).toBe('released');
    const dbDec = await prisma.decisionRecord.findUnique({ where: { id: decision.id } });
    expect(dbDec?.status).toBe('ready');

    // 2. Mismatched case: job payload decisionId does NOT match cooldown decisionId (or lost decision)
    const mismatchedCdId = `cd_mismatch_${Date.now()}`;
    const mismatchedJobId = `job_mismatch_${Date.now()}`;

    await prisma.cooldownItem.create({
      data: {
        id: mismatchedCdId,
        userId: owner,
        decisionId: null, // Lost decision or different
        title: '丢失决策的冷静事项',
        releaseAt: past,
        status: 'active',
      },
    });

    await prisma.followUpJob.create({
      data: {
        id: mismatchedJobId,
        userId: owner,
        kind: 'DECISION_COOLDOWN',
        dueAt: past,
        status: 'pending',
        payload: { cooldownId: mismatchedCdId, decisionId: 'non_existent_decision' },
      },
    });

    const mismatchResult = await prisma.$transaction(async (tx) => {
      return await selfPersistence.deliverCooldownJob(
        tx,
        { id: mismatchedJobId, userId: owner, payload: { cooldownId: mismatchedCdId, decisionId: 'non_existent_decision' } },
        new Date(),
      );
    });
    // According to §0.9/H2: lost decision closes as superseded
    expect(mismatchResult.status).toBe('superseded');
    const dbJob = await prisma.followUpJob.findUnique({ where: { id: mismatchedJobId } });
    expect(dbJob?.status).toBe('superseded');
  });
});
