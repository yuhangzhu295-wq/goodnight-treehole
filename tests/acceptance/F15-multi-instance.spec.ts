import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp } from '../business/helpers';
import { createIdentity } from './helpers/identity';
import { FlowEvidence } from './helpers/evidence';

/**
 * F15 - two API instances agreeing through the database.
 *
 * Two Nest applications share one PostgreSQL database and nothing else: each has its own in-memory
 * store. Every assertion here is written so that an in-process cache could not satisfy it - a write
 * on A is read on B, a revocation on A is enforced on B, and a concurrent terminal write from both
 * sides leaves exactly one terminal row.
 */
describe('F15 two instances through the database', () => {
  let appA: INestApplication;
  let appB: INestApplication;
  let prisma: PrismaClient;
  let evidence: FlowEvidence;
  let serverA: any;
  let serverB: any;

  let credential: string;
  let journeyId: string;
  let actionId: string;
  let memoryId: string;

  beforeAll(async () => {
    appA = await createApiTestApp();
    appB = await createApiTestApp();
    serverA = appA.getHttpServer();
    serverB = appB.getHttpServer();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    evidence = new FlowEvidence('F15');
    credential = (await createIdentity(serverA, 'F15 owner')).credential;
  });

  afterAll(async () => {
    evidence.flush();
    await prisma?.$disconnect();
    await appB?.close();
    await appA?.close();
  });

  it('writes on one instance are read, enforced and raced correctly on the other', async () => {
    // 1. A creates a journey; B reads it without ever having seen the write.
    const created = await request(serverA)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', credential)
      .send({ title: `F15 跨实例 ${Date.now()}`, domain: '生活', content: 'F15：实例之间要看到同一份数据。', intensity: 5 });
    journeyId = created.body?.journey?.id;
    const readOnB = await request(serverB)
      .get(`/api/v1/journeys/${journeyId}`)
      .set('x-goodnight-user-id', credential);
    evidence.check({
      step: 'a journey written on A is readable on B',
      layer: 'API_EVIDENCE',
      expected: { createStatus: 201, readStatus: 200, titleMatches: true },
      actual: {
        createStatus: created.status,
        readStatus: readOnB.status,
        titleMatches: String(readOnB.body?.item?.journey?.title ?? '').startsWith('F15 跨实例'),
      },
      request: { method: 'GET', path: `/api/v1/journeys/${journeyId}`, identity: 'instance B' },
      response: { status: readOnB.status },
    });
    expect(created.status).toBe(201);
    expect(readOnB.status).toBe(200);

    // 2. B updates the intent; A reads the new value.
    const intentOnB = await request(serverB)
      .patch(`/api/v1/journeys/${journeyId}/intent`)
      .set('x-goodnight-user-id', credential)
      .send({ intent: 'NEXT_STEP' });
    const readOnA = await request(serverA)
      .get(`/api/v1/journeys/${journeyId}`)
      .set('x-goodnight-user-id', credential);
    evidence.check({
      step: 'an update on B is visible on A',
      layer: 'PERSISTENCE_EVIDENCE',
      expected: { updateStatus: 200, intentOnA: 'NEXT_STEP' },
      actual: { updateStatus: intentOnB.status, intentOnA: readOnA.body?.item?.journey?.currentIntent },
      request: { method: 'PATCH', path: `/api/v1/journeys/${journeyId}/intent`, identity: 'instance B' },
      response: { status: intentOnB.status },
    });
    expect(intentOnB.status).toBe(200);
    expect(readOnA.body?.item?.journey?.currentIntent).toBe('NEXT_STEP');

    // 3. A concurrent terminal check-in from both instances leaves one terminal row.
    const action = await request(serverA)
      .post(`/api/v1/journeys/${journeyId}/actions`)
      .set('x-goodnight-user-id', credential)
      .send({ title: 'F15：两个实例同时点完成' });
    actionId = action.body?.item?.id;
    const [checkinA, checkinB] = await Promise.all([
      request(serverA)
        .post(`/api/v1/actions/${actionId}/checkin`)
        .set('x-goodnight-user-id', credential)
        .send({ status: 'completed', reflection: 'F15：A 点了一次。' }),
      request(serverB)
        .post(`/api/v1/actions/${actionId}/checkin`)
        .set('x-goodnight-user-id', credential)
        .send({ status: 'completed', reflection: 'F15：B 也点了一次。' }),
    ]);
    const terminalRows = await prisma.outcomeCheckin.count({
      where: { commitmentId: actionId, status: { not: 'pending' } },
    });
    const actionRow = await prisma.actionCommitment.findUnique({ where: { id: actionId } });
    evidence.check({
      step: 'a concurrent check-in from both instances leaves one terminal row',
      layer: 'DATABASE_EVIDENCE',
      expected: { aStatus: 201, bStatus: 201, terminalRows: 1, actionStatus: 'completed' },
      actual: {
        aStatus: checkinA.status,
        bStatus: checkinB.status,
        terminalRows,
        actionStatus: actionRow?.status,
      },
      request: { method: 'POST', path: `/api/v1/actions/${actionId}/checkin`, concurrency: 'A and B at once' },
      response: { aStatus: checkinA.status, bStatus: checkinB.status },
      sql: `select count(*) from "OutcomeCheckin" where "commitmentId" = '${actionId}' and status <> 'pending'`,
    });
    expect(terminalRows).toBe(1);
    expect(actionRow?.status).toBe('completed');

    // 4. A revocation on A is enforced on B, because authorization reads the committed row.
    await request(serverA)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', credential)
      .send({ allowPeerMatching: false })
      .expect(200);
    const peersOnB = await request(serverB).get('/api/v1/peers').set('x-goodnight-user-id', credential);
    evidence.check({
      step: 'a revocation committed on A is enforced on B',
      layer: 'SECURITY_EVIDENCE',
      expected: { status: 200, privacyEnabled: false, experiences: 0 },
      actual: {
        status: peersOnB.status,
        privacyEnabled: peersOnB.body?.item?.privacyEnabled,
        experiences: (peersOnB.body?.item?.experiences ?? []).length,
      },
      request: { method: 'GET', path: '/api/v1/peers', identity: 'instance B after A revoked' },
      response: { status: peersOnB.status },
    });
    expect(peersOnB.body?.item?.privacyEnabled).toBe(false);

    // 5. A deletes a memory; B's list no longer contains it.
    await request(serverA)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', credential)
      .send({ allowLongTermMemory: true })
      .expect(200);
    const memory = await request(serverA)
      .post('/api/v1/memory')
      .set('x-goodnight-user-id', credential)
      .send({ title: 'F15：跨实例删除', content: 'F15：这条会在 A 上删除。', days: 30 });
    memoryId = memory.body?.item?.id;
    await request(serverA)
      .delete(`/api/v1/me/memories/${memoryId}`)
      .set('x-goodnight-user-id', credential)
      .expect(200);
    const listOnB = await request(serverB).get('/api/v1/me/memories').set('x-goodnight-user-id', credential);
    const rowAfterDelete = await prisma.memoryItem.findUnique({ where: { id: memoryId } });
    evidence.check({
      step: 'a delete on A is absent from B and from the table',
      layer: 'DATABASE_EVIDENCE',
      expected: { listedOnB: false, rowStatus: 'deleted' },
      actual: {
        listedOnB: (listOnB.body?.items ?? []).some((item: any) => item.id === memoryId),
        rowStatus: rowAfterDelete?.status,
      },
      request: { method: 'GET', path: '/api/v1/me/memories', identity: 'instance B after A deleted' },
      response: { status: listOnB.status },
      sql: `select status from "MemoryItem" where id = '${memoryId}'`,
    });
    expect((listOnB.body?.items ?? []).some((item: any) => item.id === memoryId)).toBe(false);
    expect(rowAfterDelete?.status).toBe('deleted');
  });
});
