import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp } from '../business/helpers';
import { createIdentity } from './helpers/identity';
import { FlowEvidence } from './helpers/evidence';

/**
 * F09 - the decision vault's cooldown gate.
 *
 * A decision under cooldown must not be markable ready early, and a decision cannot be `decided`
 * until it is `ready` and carries the user's own words. The deadline is compared against the
 * database clock, so the fixture moves it into the past with `clock_timestamp()` rather than
 * `Date.now()`: after a WSL suspend the two clocks disagree by more than a second, and a
 * host-derived "past" date can still be in the database's future.
 */
describe('F09 decision vault and cooldown', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let evidence: FlowEvidence;
  let server: any;
  let credential: string;
  let strangerCredential: string;
  let decisionId: string;
  let cooldownId: string;
  let followUpId: string;

  beforeAll(async () => {
    app = await createApiTestApp();
    server = app.getHttpServer();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    evidence = new FlowEvidence('F09');
    credential = (await createIdentity(server, 'F09 owner')).credential;
    strangerCredential = (await createIdentity(server, 'F09 stranger')).credential;
  });

  afterAll(async () => {
    evidence.flush();
    await prisma?.$disconnect();
    await app?.close();
  });

  it('holds the decision through the cooldown, then lets the user decide and archive', async () => {
    // 1. A new decision starts as a draft owned by the caller.
    const created = await request(server)
      .post('/api/v1/decisions')
      .set('x-goodnight-user-id', credential)
      .send({
        question: `F09：要不要在今晚发那条消息 ${Date.now()}`,
        options: ['现在发', '明天再说'],
        criteria: ['先确认事实', '情绪强度:8/10'],
      });
    decisionId = created.body?.item?.id;
    const draftRow = decisionId
      ? await prisma.decisionRecord.findUnique({ where: { id: decisionId } })
      : null;
    evidence.check({
      step: 'a decision is created as a draft',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 201, status_in_db: 'draft', hasOwner: true },
      actual: {
        status: created.status,
        status_in_db: draftRow?.status,
        hasOwner: Boolean(draftRow?.userId),
      },
      request: { method: 'POST', path: '/api/v1/decisions' },
      response: { status: created.status, decisionId },
      sql: `select status, "userId" from "DecisionRecord" where id = '${decisionId}'`,
    });
    expect(created.status).toBe(201);
    expect(draftRow?.status).toBe('draft');

    // 2. Asking for a cooldown moves the decision to cooling and writes both the item and its follow-up.
    const cooling = await request(server)
      .post('/api/v1/cooldowns')
      .set('x-goodnight-user-id', credential)
      .send({ decisionId, title: 'F09：先放一晚', reason: '不想在情绪很高的时候决定。', hours: 1 });
    cooldownId = cooling.body?.item?.id;
    followUpId = cooling.body?.followUp?.id;
    const coolingRow = await prisma.decisionRecord.findUnique({ where: { id: decisionId } });
    const cooldownRow = cooldownId
      ? await prisma.cooldownItem.findUnique({ where: { id: cooldownId } })
      : null;
    const followUpRow = followUpId
      ? await prisma.followUpJob.findUnique({ where: { id: followUpId } })
      : null;
    evidence.check({
      step: 'a cooldown moves the decision to cooling and schedules a follow-up',
      layer: 'DATABASE_EVIDENCE',
      expected: {
        status: 201,
        decisionStatus: 'cooling',
        hasCooldownUntil: true,
        cooldownStatus: 'active',
        followUpKind: 'DECISION_COOLDOWN',
        followUpStatus: 'pending',
      },
      actual: {
        status: cooling.status,
        decisionStatus: coolingRow?.status,
        hasCooldownUntil: Boolean(coolingRow?.cooldownUntil),
        cooldownStatus: cooldownRow?.status,
        followUpKind: followUpRow?.kind,
        followUpStatus: followUpRow?.status,
      },
      request: { method: 'POST', path: '/api/v1/cooldowns', body: { decisionId, hours: 1 } },
      response: { status: cooling.status, cooldownId, followUpId },
      sql: `select status, "cooldownUntil" from "DecisionRecord" where id = '${decisionId}'; select status from "CooldownItem" where id = '${cooldownId}'`,
    });
    expect(cooling.status).toBe(201);
    expect(coolingRow?.status).toBe('cooling');
    expect(cooldownRow?.status).toBe('active');
    expect(followUpRow?.kind).toBe('DECISION_COOLDOWN');

    // 3. Neither `ready` nor `decided` can be forced while the cooldown is live.
    const earlyReady = await request(server)
      .patch(`/api/v1/decisions/${decisionId}`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'ready' });
    const earlyDecided = await request(server)
      .patch(`/api/v1/decisions/${decisionId}`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'decided', decision: 'F09：提前决定' });
    const rowAfterEarly = await prisma.decisionRecord.findUnique({ where: { id: decisionId } });
    evidence.check({
      step: 'the cooldown refuses an early ready and an early decision',
      layer: 'SECURITY_EVIDENCE',
      expected: {
        readyStatus: 400,
        decidedStatus: 400,
        decisionStill: 'cooling',
        decisionTextStill: null,
      },
      actual: {
        readyStatus: earlyReady.status,
        decidedStatus: earlyDecided.status,
        decisionStill: rowAfterEarly?.status,
        decisionTextStill: rowAfterEarly?.decision ?? null,
      },
      request: { method: 'PATCH', path: `/api/v1/decisions/${decisionId}`, body: { status: 'ready' } },
      response: {
        readyStatus: earlyReady.status,
        readyMessage: earlyReady.body?.message,
        decidedStatus: earlyDecided.status,
      },
    });
    expect(earlyReady.status).toBe(400);
    expect(String(earlyReady.body?.message ?? '')).toContain('冷静');
    expect(earlyDecided.status).toBe(400);
    expect(rowAfterEarly?.status).toBe('cooling');
    expect(rowAfterEarly?.decision).toBeNull();

    // 4. A stranger can neither read it in a list nor transition it.
    const strangerList = await request(server).get('/api/v1/decisions').set('x-goodnight-user-id', strangerCredential);
    const strangerPatch = await request(server)
      .patch(`/api/v1/decisions/${decisionId}`)
      .set('x-goodnight-user-id', strangerCredential)
      .send({ status: 'ready' });
    evidence.check({
      step: 'a stranger cannot see or transition the decision',
      layer: 'SECURITY_EVIDENCE',
      expected: { listContainsIt: false, patchStatus: 404 },
      actual: {
        listContainsIt: (strangerList.body?.items ?? []).some((item: any) => item.id === decisionId),
        patchStatus: strangerPatch.status,
      },
      request: { method: 'PATCH', path: `/api/v1/decisions/${decisionId}`, identity: 'unrelated user' },
      response: { patchStatus: strangerPatch.status },
    });
    expect((strangerList.body?.items ?? []).some((item: any) => item.id === decisionId)).toBe(false);
    expect(strangerPatch.status).toBe(404);

    // 5. Once the deadline passes, `ready` is allowed. The fixture uses the database clock.
    await prisma.$executeRaw`
      UPDATE "DecisionRecord"
      SET "cooldownUntil" = clock_timestamp() - interval '1 second'
      WHERE id = ${decisionId}
    `;
    const ready = await request(server)
      .patch(`/api/v1/decisions/${decisionId}`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'ready' });
    const readyRow = await prisma.decisionRecord.findUnique({ where: { id: decisionId } });
    evidence.check({
      step: 'the decision becomes ready once the deadline has passed',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 200, status_in_db: 'ready', hasReviewedAt: true },
      actual: {
        status: ready.status,
        status_in_db: readyRow?.status,
        hasReviewedAt: Boolean(readyRow?.reviewedAt),
      },
      request: { method: 'PATCH', path: `/api/v1/decisions/${decisionId}`, body: { status: 'ready' } },
      response: { status: ready.status },
      sql: `select status, "reviewedAt" from "DecisionRecord" where id = '${decisionId}'`,
    });
    expect(ready.status).toBe(200);
    expect(readyRow?.status).toBe('ready');
    expect(readyRow?.reviewedAt).toBeTruthy();

    // 6. `decided` requires the user's own words.
    const emptyDecision = await request(server)
      .patch(`/api/v1/decisions/${decisionId}`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'decided' });
    const rowAfterEmpty = await prisma.decisionRecord.findUnique({ where: { id: decisionId } });
    evidence.check({
      step: 'a decision without the user’s own words is refused',
      layer: 'SECURITY_EVIDENCE',
      expected: { status: 400, status_in_db: 'ready' },
      actual: { status: emptyDecision.status, status_in_db: rowAfterEmpty?.status },
      request: { method: 'PATCH', path: `/api/v1/decisions/${decisionId}`, body: { status: 'decided' } },
      response: { status: emptyDecision.status, body: emptyDecision.body },
    });
    expect(emptyDecision.status).toBe(400);
    expect(rowAfterEmpty?.status).toBe('ready');

    // 7. With the words, the decision is recorded and then archived.
    const decided = await request(server)
      .patch(`/api/v1/decisions/${decisionId}`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'decided', decision: 'F09：明天白天再确认一次。', outcome: '先把想说的话留在草稿里。' });
    const decidedRow = await prisma.decisionRecord.findUnique({ where: { id: decisionId } });
    const archived = await request(server)
      .patch(`/api/v1/decisions/${decisionId}`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'archived' });
    const archivedRow = await prisma.decisionRecord.findUnique({ where: { id: decisionId } });
    evidence.check({
      step: 'the decision is recorded and archived with its text intact',
      layer: 'DATABASE_EVIDENCE',
      expected: {
        decidedStatus: 200,
        decidedValue: 'decided',
        decisionText: 'F09：明天白天再确认一次。',
        archivedStatus: 200,
        archivedValue: 'archived',
      },
      actual: {
        decidedStatus: decided.status,
        decidedValue: decidedRow?.status,
        decisionText: decidedRow?.decision,
        archivedStatus: archived.status,
        archivedValue: archivedRow?.status,
      },
      request: { method: 'PATCH', path: `/api/v1/decisions/${decisionId}`, body: { status: 'archived' } },
      response: { decidedStatus: decided.status, archivedStatus: archived.status },
      sql: `select status, decision, outcome from "DecisionRecord" where id = '${decisionId}'`,
    });
    expect(decided.status).toBe(200);
    expect(decidedRow?.status).toBe('decided');
    expect(decidedRow?.decision).toBe('F09：明天白天再确认一次。');
    expect(archived.status).toBe(200);
    expect(archivedRow?.status).toBe('archived');

    // 8. The owner's list still shows it after the state machine is done.
    const ownerList = await request(server).get('/api/v1/decisions').set('x-goodnight-user-id', credential);
    evidence.check({
      step: 'the archived decision is still listed for its owner',
      layer: 'API_EVIDENCE',
      expected: { status: 200, listed: true, listedStatus: 'archived' },
      actual: {
        status: ownerList.status,
        listed: (ownerList.body?.items ?? []).some((item: any) => item.id === decisionId),
        listedStatus: (ownerList.body?.items ?? []).find((item: any) => item.id === decisionId)?.status,
      },
      request: { method: 'GET', path: '/api/v1/decisions' },
      response: { status: ownerList.status },
    });
    expect(ownerList.status).toBe(200);
    expect((ownerList.body?.items ?? []).some((item: any) => item.id === decisionId)).toBe(true);
  });
});
