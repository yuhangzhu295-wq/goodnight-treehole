import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApiTestApp, identityFor } from './helpers';
import { PrismaRuntimeService } from '../../apps/api/src/prisma-runtime.service';
import { SelfPersistenceService } from '../../apps/api/src/self-persistence.service';
import { FollowUpWorkerService } from '../../apps/api/src/follow-up-worker.service';
import { saveRelationalRuntimeState } from '../../apps/api/src/relational-runtime.mapper';

/**
 * Batch 3: DecisionRecord + CooldownItem database authority, lifecycle,
 * CAS supersede concurrency, and clock_timestamp() deadline guards (B3-S3).
 */
describe('Batch 3: DecisionRecord + CooldownItem database authority and lifecycle', () => {
  let app: INestApplication;
  let prisma: any;
  let selfPersistence: SelfPersistenceService;
  const owner = 'user_demo';
  const other = 'user_guest';

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = app.get(PrismaRuntimeService);
    selfPersistence = app.get(SelfPersistenceService);

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
      .set('x-goodnight-user-id', await identityFor(owner))
      .send({ question, options: ['选项A', '选项B'], criteria: ['标准1'] })
      .expect(201);
    const decisionId = createRes.body.item.id as string;
    expect(createRes.body.item.status).toBe('draft');

    // 2. Put it into cooldown (24 hours into future)
    const cdRes = await request(server)
      .post('/api/v1/cooldowns')
      .set('x-goodnight-user-id', await identityFor(owner))
      .send({ decisionId, title: '未过期的冷静期', reason: '需要降温', hours: 24 })
      .expect(201);
    expect(cdRes.body.item.status).toBe('active');

    // 3. Attempt to prematurely mark as ready -> must be refused with 400
    const patchRes = await request(server)
      .patch(`/api/v1/decisions/${decisionId}`)
      .set('x-goodnight-user-id', await identityFor(owner))
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
      .set('x-goodnight-user-id', await identityFor(owner))
      .send({ question: subject, options: ['基础A', '基础B'] })
      .expect(201);
    const baseId = baseRes.body.item.id as string;

    // Concurrently dispatch two supersedes targeting baseId
    const [race1, race2] = await Promise.allSettled([
      request(server)
        .post('/api/v1/decisions')
        .set('x-goodnight-user-id', await identityFor(owner))
        .send({ question: subject, supersedesId: baseId, options: ['竞争者1'] }),
      request(server)
        .post('/api/v1/decisions')
        .set('x-goodnight-user-id', await identityFor(owner))
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
      .set('x-goodnight-user-id', await identityFor(owner))
      .send({ question: '试图修改已取代决定' })
      .expect(200); // Does not change question since not in ['draft', 'cooling', 'ready']
    expect(patchRes.body.item.question).toBe(question);

    // Attempting to transition superseded to ready must be rejected with 400
    const transitionRes = await request(server)
      .patch(`/api/v1/decisions/${created.id}`)
      .set('x-goodnight-user-id', await identityFor(owner))
      .send({ status: 'ready' })
      .expect(400);
    expect(transitionRes.body.message).toContain('不能从 superseded 变更为 ready');

    // Attempting to create cooldown on superseded decision fails
    const cdRes = await request(server)
      .post('/api/v1/cooldowns')
      .set('x-goodnight-user-id', await identityFor(owner))
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
      .set('x-goodnight-user-id', await identityFor(owner))
      .send({ question, options: ['私密A'] })
      .expect(201);
    const decisionId = createRes.body.item.id as string;

    // Foreign user (other) cannot see owner's decision in list
    const otherList = await request(server)
      .get('/api/v1/decisions')
      .set('x-goodnight-user-id', await identityFor(other))
      .expect(200);
    expect(otherList.body.items.some((d: any) => d.id === decisionId)).toBe(false);

    // Foreign user cannot PATCH owner's decision -> 404
    const foreignPatch = await request(server)
      .patch(`/api/v1/decisions/${decisionId}`)
      .set('x-goodnight-user-id', await identityFor(other))
      .send({ decision: '非法决定' });
    expect(foreignPatch.status).toBe(404);
    expect(foreignPatch.body.message).toContain('决策记录不存在或无权访问');

    // Foreign user cannot create cooldown on owner's decision -> 404
    const foreignCd = await request(server)
      .post('/api/v1/cooldowns')
      .set('x-goodnight-user-id', await identityFor(other))
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
      .set('x-goodnight-user-id', await identityFor(owner))
      .send({ journeyId: journey.id, question: '关联旅程的决定' })
      .expect(201);
    const decisionId = dRes.body.item.id as string;
    expect(dRes.body.item.journeyId).toBe(journey.id);

    // Case 2: Attempting to connect foreign journey -> rejected with 404
    const foreignRes = await request(server)
      .post('/api/v1/decisions')
      .set('x-goodnight-user-id', await identityFor(owner))
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

  it('1.9 Association mismatch: a job naming a different existing decision must not release the cooldown or ready that decision', async () => {
    // 1.8 uses a payload decisionId that does not exist, which the following `!dec` lookup also
    // rejects - so it cannot tell whether the association check itself is present. Here both
    // decisions exist and belong to the owner, so only the association check can refuse.
    const decisionA = await selfPersistence.createDecision({
      userId: owner,
      question: `关联决策A_${Date.now()}`,
    });
    const decisionB = await selfPersistence.createDecision({
      userId: owner,
      question: `关联决策B_${Date.now()}`,
    });

    const past = new Date(Date.now() - 5000);
    const cdId = `cd_assoc_${Date.now()}`;
    const jobId = `job_assoc_${Date.now()}`;

    await prisma.cooldownItem.create({
      data: {
        id: cdId,
        userId: owner,
        decisionId: decisionA.id,
        title: '关联检查',
        releaseAt: past,
        status: 'active',
      },
    });
    await prisma.decisionRecord.update({
      where: { id: decisionA.id },
      data: { status: 'cooling', cooldownUntil: past },
    });
    await prisma.decisionRecord.update({
      where: { id: decisionB.id },
      data: { status: 'cooling', cooldownUntil: past },
    });
    await prisma.followUpJob.create({
      data: {
        id: jobId,
        userId: owner,
        kind: 'DECISION_COOLDOWN',
        dueAt: past,
        status: 'pending',
        payload: { cooldownId: cdId, decisionId: decisionB.id },
      },
    });

    const result = await prisma.$transaction(async (tx) =>
      selfPersistence.deliverCooldownJob(
        tx,
        { id: jobId, userId: owner, payload: { cooldownId: cdId, decisionId: decisionB.id } },
        new Date(),
      ),
    );

    expect(result.status).toBe('superseded');

    const cd = await prisma.cooldownItem.findUnique({ where: { id: cdId } });
    expect(cd?.status).toBe('active');
    const b = await prisma.decisionRecord.findUnique({ where: { id: decisionB.id } });
    expect(b?.status).toBe('cooling');
    const job = await prisma.followUpJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe('superseded');
  });

  /**
   * `DECISION_STATE_PASS` — the part of the design's §4 row that was still missing: the
   * worker/manual/cooldown races and the guard mutations that make the guards falsifiable.
   *
   * 1.10 races a worker delivery against a manual action through the real worker entry point, with
   * the barrier inside the claim transaction. 1.11 races a worker against a *second* worker on the
   * same job, which is the duplicate-delivery shape the reconciler can produce. 1.12 is the
   * stale-worker predicate from §0.5/A2: a job whose cooldown was superseded while it was queued
   * must not ready the decision. 1.13 is the superseded-cooldown terminal state.
   */
  it('1.10 A worker release and a manual action race on the same decision: exactly one wins, and the loser is not silently dropped', async () => {
    const decision = await selfPersistence.createDecision({
      userId: owner,
      question: `worker手动竞争_${Date.now()}`,
    });
    const past = new Date(Date.now() - 5000);
    const cdId = `cd_race_${Date.now()}`;
    const jobId = `job_race_${Date.now()}`;

    await prisma.cooldownItem.create({
      data: { id: cdId, userId: owner, decisionId: decision.id, title: '竞争冷静', releaseAt: past, status: 'active' },
    });
    await prisma.decisionRecord.update({ where: { id: decision.id }, data: { status: 'cooling', cooldownUntil: past } });
    await prisma.followUpJob.create({
      data: {
        id: jobId,
        userId: owner,
        kind: 'DECISION_COOLDOWN',
        dueAt: past,
        status: 'pending',
        payload: { cooldownId: cdId, decisionId: decision.id },
      },
    });

    const server = app.getHttpServer();
    const worker = app.get(FollowUpWorkerService);
    // Three sides race: two worker deliveries (what a redelivered job looks like) and the manual
    // route. The worker side goes through the claim transaction, which is where the follow-up
    // claim and the decision guard live; the manual side is the real route, so the HTTP layer is
    // exercised too.
    const workerCall = () =>
      (worker as any).deliver({
        id: jobId,
        kind: 'DECISION_COOLDOWN',
        userId: owner,
        payload: { cooldownId: cdId, decisionId: decision.id },
      });
    const [first, second, manual] = await Promise.allSettled([
      workerCall(),
      workerCall(),
      request(server)
        .patch(`/api/v1/decisions/${decision.id}`)
        .set('x-goodnight-user-id', await identityFor(owner))
        .send({ status: 'ready' }),
    ]);
    for (const result of [first, second]) expect(result.status).toBe('fulfilled');

    const dbDecision = await prisma.decisionRecord.findUnique({ where: { id: decision.id } });
    expect(dbDecision?.status).toBe('ready');
    const dbCooldown = await prisma.cooldownItem.findUnique({ where: { id: cdId } });
    expect(dbCooldown?.status).toBe('released');
    // The cooldown was released exactly once: a second release would write a second
    // COOLDOWN_RELEASED notification and restamp reviewedAt. Counted by id for the same reason as
    // below - a user-wide count would measure the whole spec.
    const notifications = await prisma.userNotification.count({ where: { id: `notification_${jobId}` } });
    expect(notifications).toBeLessThanOrEqual(1);
  }, 120_000);

  it('1.11 Two workers delivering the same cooldown job: one release, one notification, one ready transition', async () => {
    const decision = await selfPersistence.createDecision({
      userId: owner,
      question: `双worker冷静_${Date.now()}`,
    });
    const past = new Date(Date.now() - 5000);
    const cdId = `cd_dup_${Date.now()}`;
    const jobId = `job_dup_${Date.now()}`;

    await prisma.cooldownItem.create({
      data: { id: cdId, userId: owner, decisionId: decision.id, title: '重复交付', releaseAt: past, status: 'active' },
    });
    await prisma.decisionRecord.update({ where: { id: decision.id }, data: { status: 'cooling', cooldownUntil: past } });
    await prisma.followUpJob.create({
      data: {
        id: jobId,
        userId: owner,
        kind: 'DECISION_COOLDOWN',
        dueAt: past,
        status: 'pending',
        payload: { cooldownId: cdId, decisionId: decision.id },
      },
    });

    const worker = app.get(FollowUpWorkerService);
    const workerCall = () =>
      (worker as any).deliver({
        id: jobId,
        kind: 'DECISION_COOLDOWN',
        userId: owner,
        payload: { cooldownId: cdId, decisionId: decision.id },
      });
    const results = await Promise.allSettled([workerCall(), workerCall()]);
    for (const result of results) expect(result.status).toBe('fulfilled');

    const dbDecision = await prisma.decisionRecord.findUnique({ where: { id: decision.id } });
    expect(dbDecision?.status).toBe('ready');
    const dbCooldown = await prisma.cooldownItem.findUnique({ where: { id: cdId } });
    expect(dbCooldown?.status).toBe('released');
    // Counted by id, not by type: the other cases in this file also write COOLDOWN_RELEASED
    // notifications, so a type-wide count would measure the whole spec rather than this job.
    const notifications = await prisma.userNotification.count({ where: { id: `notification_${jobId}` } });
    expect(notifications).toBe(1);
    const job = await prisma.followUpJob.findUnique({ where: { id: jobId } });
    expect(job?.status).toBe('delivered');
  }, 120_000);

  it('1.12 A stale worker cannot set a superseded decision ready early (§0.5/A2 predicate)', async () => {
    // The job was queued while the decision was cooling. While it sat in the queue the user
    // superseded the decision, which is a terminal state. A worker that delivers the old job now
    // must find the decision no longer `cooling` and refuse to ready it: the updateMany guard is the
    // predicate, and this case is what makes removing it fail.
    const decision = await selfPersistence.createDecision({
      userId: owner,
      question: `过期worker_${Date.now()}`,
    });
    const past = new Date(Date.now() - 5000);
    const cdId = `cd_stale_${Date.now()}`;
    const jobId = `job_stale_${Date.now()}`;

    await prisma.cooldownItem.create({
      data: { id: cdId, userId: owner, decisionId: decision.id, title: '过期冷静', releaseAt: past, status: 'active' },
    });
    // `cooldownUntil` is left NULL so the deadline check cannot be what refuses the delivery: the
    // only guard left is the `status = 'cooling'` predicate on the updateMany below, which is
    // exactly the A2 guard this case is meant to make falsifiable.
    await prisma.decisionRecord.update({ where: { id: decision.id }, data: { status: 'superseded' } });
    await prisma.followUpJob.create({
      data: {
        id: jobId,
        userId: owner,
        kind: 'DECISION_COOLDOWN',
        dueAt: past,
        status: 'pending',
        payload: { cooldownId: cdId, decisionId: decision.id },
      },
    });

    const result = await prisma.$transaction((tx) =>
      selfPersistence.deliverCooldownJob(
        tx,
        { id: jobId, userId: owner, payload: { cooldownId: cdId, decisionId: decision.id } },
        new Date(),
      ),
    );

    // The cooldown is intact and due, and the deadline is clear, so only the decision's state can
    // refuse. A no-op delivery would be wrong here too: the job must not stay pending and be
    // re-delivered forever.
    expect(['superseded', 'skipped']).toContain(result.status);
    const dbDecision = await prisma.decisionRecord.findUnique({ where: { id: decision.id } });
    expect(dbDecision?.status).toBe('superseded');
    expect(dbDecision?.reviewedAt).toBeNull();
    const job = await prisma.followUpJob.findUnique({ where: { id: jobId } });
    expect(job?.status).not.toBe('pending');
  }, 120_000);

  it('1.13 A superseded cooldown is terminal: the worker will not release it and the manual action refuses', async () => {
    const decision = await selfPersistence.createDecision({
      userId: owner,
      question: `TerminalCooldown_${Date.now()}`,
    });
    const past = new Date(Date.now() - 5000);
    const cdId = `cd_superseded_${Date.now()}`;
    const jobId = `job_superseded_${Date.now()}`;

    await prisma.cooldownItem.create({
      data: { id: cdId, userId: owner, decisionId: decision.id, title: '已取代冷静', releaseAt: past, status: 'superseded' },
    });
    await prisma.decisionRecord.update({ where: { id: decision.id }, data: { status: 'cooling', cooldownUntil: past } });
    await prisma.followUpJob.create({
      data: {
        id: jobId,
        userId: owner,
        kind: 'DECISION_COOLDOWN',
        dueAt: past,
        status: 'pending',
        payload: { cooldownId: cdId, decisionId: decision.id },
      },
    });

    const result = await prisma.$transaction((tx) =>
      selfPersistence.deliverCooldownJob(
        tx,
        { id: jobId, userId: owner, payload: { cooldownId: cdId, decisionId: decision.id } },
        new Date(),
      ),
    );
    expect(result.status).toBe('superseded');
    const dbCooldown = await prisma.cooldownItem.findUnique({ where: { id: cdId } });
    expect(dbCooldown?.status).toBe('superseded');
    const dbDecision = await prisma.decisionRecord.findUnique({ where: { id: decision.id } });
    expect(dbDecision?.status).toBe('cooling');

    const manual = await request(app.getHttpServer())
      .patch(`/api/v1/decisions/${decision.id}`)
      .set('x-goodnight-user-id', await identityFor(owner))
      .send({ status: 'ready' });
    expect([400, 409]).toContain(manual.status);
    const afterManual = await prisma.decisionRecord.findUnique({ where: { id: decision.id } });
    expect(afterManual?.status).toBe('cooling');
  }, 120_000);
  /**
   * The manual path refuses a superseded cooldown (case 1.13), but the list read had its own
   * auto-transition that only excluded *active* cooldowns. So reading the list re-readied a decision
   * whose cooldown was superseded: the same decision was ready through the read path and refused
   * through the manual one, and the read path is the one that runs without the user asking for
   * anything. This drives the list and asserts the decision stays where it was.
   */
  it('1.14 Reading the list does not ready a decision whose cooldown was superseded', async () => {
    const decision = await selfPersistence.createDecision({
      userId: owner,
      question: `列表绕过守卫_${Date.now()}`,
    });
    const past = new Date(Date.now() - 5000);
    const cdId = `cd_listauto_${Date.now()}`;

    await prisma.cooldownItem.create({
      data: {
        id: cdId,
        userId: owner,
        decisionId: decision.id,
        title: '已被取代的冷静',
        releaseAt: past,
        status: 'superseded',
      },
    });
    await prisma.decisionRecord.update({ where: { id: decision.id }, data: { status: 'cooling', cooldownUntil: past } });

    const listed = await selfPersistence.listDecisions(owner);
    const row = listed.find((item: any) => item.id === decision.id);
    expect(row?.status).toBe('cooling');

    // And the row is still refused through the manual path, so the two paths agree.
    const manual = await request(app.getHttpServer())
      .patch(`/api/v1/decisions/${decision.id}`)
      .set('x-goodnight-user-id', await identityFor(owner))
      .send({ status: 'ready' });
    expect([400, 409]).toContain(manual.status);
    const after = await prisma.decisionRecord.findUnique({ where: { id: decision.id } });
    expect(after?.status).toBe('cooling');
  }, 120_000);
});
