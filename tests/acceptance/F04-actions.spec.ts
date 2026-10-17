import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp } from '../business/helpers';
import { createIdentity } from './helpers/identity';
import { FlowEvidence } from './helpers/evidence';

/**
 * F04 - an action commitment from creation to a terminal check-in.
 *
 * The interesting part is the check-in, because it is a conditional write: the product transitions a
 * check-in out of `pending` exactly once. A second submission must not move the state again or create
 * a second terminal record - that is what makes "mark done" safe to tap twice on a flaky connection.
 */
describe('F04 action commitment lifecycle', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let evidence: FlowEvidence;
  let server: any;
  let credential: string;
  let strangerCredential: string;
  let journeyId: string;
  let actionId: string;

  beforeAll(async () => {
    app = await createApiTestApp();
    server = app.getHttpServer();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    evidence = new FlowEvidence('F04');
    credential = (await createIdentity(server, 'F04 owner')).credential;
    strangerCredential = (await createIdentity(server, 'F04 stranger')).credential;

    const journey = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', credential)
      .send({ title: `F04 行动 ${Date.now()}`, domain: '生活', content: 'F04：验证行动闭环。' });
    journeyId = journey.body?.journey?.id;
  });

  afterAll(async () => {
    evidence.flush();
    await prisma?.$disconnect();
    await app?.close();
  });

  it('creates an action, completes it once, and refuses a stranger', async () => {
    // 1. Create the action.
    const created = await request(server)
      .post(`/api/v1/journeys/${journeyId}/actions`)
      .set('x-goodnight-user-id', credential)
      .send({ title: 'F04：给朋友发一条消息' });
    actionId = created.body?.item?.id;
    evidence.check({
      step: 'action created',
      layer: 'API_EVIDENCE',
      expected: { status: 201, hasId: true },
      actual: { status: created.status, hasId: Boolean(actionId) },
      request: { method: 'POST', path: `/api/v1/journeys/${journeyId}/actions` },
      response: { status: created.status, actionId },
    });
    expect(created.status).toBe(201);
    expect(actionId).toBeTruthy();

    // 2. It appears in the journey's action list.
    const listed = await request(server).get(`/api/v1/journeys/${journeyId}/actions`).set('x-goodnight-user-id', credential);
    evidence.check({
      step: 'action listed under its journey',
      layer: 'API_EVIDENCE',
      expected: { status: 200, containsIt: true },
      actual: {
        status: listed.status,
        containsIt: (listed.body?.items ?? []).some((item: any) => item.id === actionId),
      },
    });
    expect((listed.body?.items ?? []).some((item: any) => item.id === actionId)).toBe(true);

    // 3. Complete it.
    const checkin = await request(server)
      .post(`/api/v1/actions/${actionId}/checkin`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'completed', reflection: 'F04：做完了。' });
    const actionRow = await prisma.actionCommitment.findUnique({ where: { id: actionId } });
    const checkinRows = await prisma.outcomeCheckin.findMany({ where: { commitmentId: actionId } });
    evidence.check({
      step: 'check-in completes the action and records it',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 201, actionStatus: 'completed', terminalCheckins: 1 },
      actual: {
        status: checkin.status,
        actionStatus: actionRow?.status,
        terminalCheckins: checkinRows.filter((row) => row.status !== 'pending').length,
      },
      request: { method: 'POST', path: `/api/v1/actions/${actionId}/checkin`, body: { status: 'completed' } },
      response: { status: checkin.status },
      sql: `select status from "ActionCommitment" where id = '${actionId}'; select id, status from "OutcomeCheckin" where "commitmentId" = '${actionId}'`,
    });
    expect(checkin.status).toBe(201);
    expect(actionRow?.status).toBe('completed');
    expect(checkinRows.filter((row) => row.status !== 'pending')).toHaveLength(1);

    // 4. A repeated submission does not move the state a second time.
    const again = await request(server)
      .post(`/api/v1/actions/${actionId}/checkin`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'completed', reflection: 'F04：重复提交。' });
    const actionRowAfter = await prisma.actionCommitment.findUnique({ where: { id: actionId } });
    const checkinRowsAfter = await prisma.outcomeCheckin.findMany({ where: { commitmentId: actionId } });
    evidence.check({
      step: 'a repeated check-in does not apply twice',
      layer: 'PERSISTENCE_EVIDENCE',
      expected: { actionStatus: 'completed', terminalCheckins: 1 },
      actual: {
        actionStatus: actionRowAfter?.status,
        terminalCheckins: checkinRowsAfter.filter((row) => row.status !== 'pending').length,
      },
      response: { status: again.status },
    });
    expect(actionRowAfter?.status).toBe('completed');
    expect(checkinRowsAfter.filter((row) => row.status !== 'pending')).toHaveLength(1);

    // 5. A second action can be skipped, which is a different terminal state.
    const second = await request(server)
      .post(`/api/v1/journeys/${journeyId}/actions`)
      .set('x-goodnight-user-id', credential)
      .send({ title: 'F04：另一件没做成的事' });
    const secondId = second.body?.item?.id;
    const skipped = await request(server)
      .post(`/api/v1/actions/${secondId}/checkin`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'skipped', reflection: 'F04：今天没做成。' });
    const secondRow = await prisma.actionCommitment.findUnique({ where: { id: secondId } });
    evidence.check({
      step: 'skipped is a distinct terminal state',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 201, actionStatus: 'skipped' },
      actual: { status: skipped.status, actionStatus: secondRow?.status },
    });
    expect(skipped.status).toBe(201);
    expect(secondRow?.status).toBe('skipped');

    // 6. A stranger cannot check in someone else's action.
    const strangerCheckin = await request(server)
      .post(`/api/v1/actions/${actionId}/checkin`)
      .set('x-goodnight-user-id', strangerCredential)
      .send({ status: 'completed' });
    evidence.check({
      step: 'a stranger cannot check in the action',
      layer: 'SECURITY_EVIDENCE',
      expected: 404,
      actual: strangerCheckin.status,
      request: { method: 'POST', path: `/api/v1/actions/${actionId}/checkin`, identity: 'unrelated user' },
      response: { status: strangerCheckin.status },
    });
    expect(strangerCheckin.status).toBe(404);
  });
});
