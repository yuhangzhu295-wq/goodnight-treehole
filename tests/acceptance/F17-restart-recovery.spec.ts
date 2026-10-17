import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp } from '../business/helpers';
import { createIdentity } from './helpers/identity';
import { FlowEvidence } from './helpers/evidence';

/**
 * F17 - restart and recovery.
 *
 * A process that is killed mid-flight must not leave the product in a state where a job is "running"
 * forever or a record exists only in memory. This flow writes with one instance, closes it, starts a
 * second, and then checks three things: the committed records are still there, the interrupted AI
 * job is moved to a terminal state with a recovery trace, and work that was waiting (an unfinished
 * action) can still be completed.
 *
 * The interrupted job is written straight to the table with a two-day-old `updatedAt`, because a
 * spec cannot actually kill a process mid-job and the recovery rule is staleness-based.
 */
describe('F17 restart and recovery', () => {
  let appA: INestApplication;
  let appB: INestApplication;
  let prisma: PrismaClient;
  let evidence: FlowEvidence;
  let serverA: any;
  let serverB: any;
  let appAClosed = false;

  let credential: string;
  let userId: string;
  let journeyId: string;
  let memoryId: string;
  let actionId: string;
  const staleJobId = `aijob_f17_stale_${Date.now()}`;

  beforeAll(async () => {
    appA = await createApiTestApp();
    serverA = appA.getHttpServer();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    evidence = new FlowEvidence('F17');
    const identity = await createIdentity(serverA, 'F17 owner');
    credential = identity.credential;
    userId = identity.userId;
  });

  afterAll(async () => {
    evidence.flush();
    await prisma?.$disconnect();
    await appB?.close();
    if (!appAClosed) await appA?.close();
  });

  it('survives a restart, recovers a stale job, and finishes waiting work', async () => {
    // 1. Commit the records that must survive.
    await request(serverA)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', credential)
      .send({ allowLongTermMemory: true })
      .expect(200);
    const journey = await request(serverA)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', credential)
      .send({ title: `F17 重启 ${Date.now()}`, domain: '生活', content: 'F17：重启之后还要在。', intensity: 4 });
    journeyId = journey.body?.journey?.id;
    const memory = await request(serverA)
      .post('/api/v1/memory')
      .set('x-goodnight-user-id', credential)
      .send({ title: 'F17：重启后仍要记得', content: 'F17：这条记忆必须活过重启。', days: 30 });
    memoryId = memory.body?.item?.id;
    const action = await request(serverA)
      .post(`/api/v1/journeys/${journeyId}/actions`)
      .set('x-goodnight-user-id', credential)
      .send({ title: 'F17：重启后补上的一次行动' });
    actionId = action.body?.item?.id;

    // 2. Leave a job looking like it was running when the process died.
    await prisma.aIProvider.upsert({
      where: { id: 'provider_template' },
      create: {
        id: 'provider_template',
        name: '模板提供方',
        type: 'template',
        baseUrl: 'local://template',
        modelName: 'safe-template',
        providerKind: 'template',
        usageTags: [],
      },
      update: {},
    });
    await prisma.aIJob.create({
      data: {
        id: staleJobId,
        userId,
        contentId: journeyId,
        contentType: 'LifeJourney',
        jobType: 'F17 恢复检查',
        taskType: 'f17_recovery',
        style: 'warm',
        providerId: 'provider_template',
        modelName: 'safe-template',
        status: 'running',
        promptSummary: 'F17: stale job',
        traceJson: [],
      },
    });
    await prisma.$executeRaw`
      UPDATE "AIJob"
      SET "updatedAt" = clock_timestamp() - interval '2 days'
      WHERE id = ${staleJobId}
    `;
    const staleBefore = await prisma.aIJob.findUnique({ where: { id: staleJobId } });
    evidence.check({
      step: 'the fixture leaves a job in running with an old timestamp',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 'running', olderThanADay: true },
      actual: {
        status: staleBefore?.status,
        olderThanADay: Boolean(staleBefore && staleBefore.updatedAt.getTime() < Date.now() - 86_400_000),
      },
      sql: `select status, "updatedAt" from "AIJob" where id = '${staleJobId}'`,
    });
    expect(staleBefore?.status).toBe('running');

    // 3. Kill the instance that wrote everything, then start a fresh one.
    await appA.close();
    appAClosed = true;
    appB = await createApiTestApp();
    serverB = appB.getHttpServer();

    // 4. The committed records are readable from the new process.
    const journeyAfter = await request(serverB)
      .get(`/api/v1/journeys/${journeyId}`)
      .set('x-goodnight-user-id', credential);
    const memoriesAfter = await request(serverB)
      .get('/api/v1/me/memories')
      .set('x-goodnight-user-id', credential);
    evidence.check({
      step: 'journey and memory survive the restart',
      layer: 'PERSISTENCE_EVIDENCE',
      expected: { journeyStatus: 200, memoryListed: true },
      actual: {
        journeyStatus: journeyAfter.status,
        memoryListed: (memoriesAfter.body?.items ?? []).some((item: any) => item.id === memoryId),
      },
      request: { method: 'GET', path: `/api/v1/journeys/${journeyId}`, identity: 'fresh process' },
      response: { journeyStatus: journeyAfter.status, memoryStatus: memoriesAfter.status },
    });
    expect(journeyAfter.status).toBe(200);
    expect((memoriesAfter.body?.items ?? []).some((item: any) => item.id === memoryId)).toBe(true);

    // 5. Boot recovery moved the stale job to failed with a trace.
    const recovered = await prisma.aIJob.findUnique({ where: { id: staleJobId } });
    const traces = Array.isArray(recovered?.traceJson) ? (recovered!.traceJson as any[]) : [];
    evidence.check({
      step: 'boot recovery terminates the interrupted job and records why',
      layer: 'DATABASE_EVIDENCE',
      expected: {
        status: 'failed',
        hasCompletedAt: true,
        recoveryTrace: 'stale-job-recovered-by-service-restart',
      },
      actual: {
        status: recovered?.status,
        hasCompletedAt: Boolean(recovered?.completedAt),
        recoveryTrace: traces.find((trace) => trace?.reason)?.reason,
      },
      sql: `select status, "completedAt", "traceJson" from "AIJob" where id = '${staleJobId}'`,
    });
    expect(recovered?.status).toBe('failed');
    expect(recovered?.completedAt).toBeTruthy();
    expect(traces.some((trace) => trace?.reason === 'stale-job-recovered-by-service-restart')).toBe(true);

    // 6. Work that was waiting is still completable on the new instance.
    const checkin = await request(serverB)
      .post(`/api/v1/actions/${actionId}/checkin`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'completed', reflection: 'F17：重启之后补上了。' });
    const actionRow = await prisma.actionCommitment.findUnique({ where: { id: actionId } });
    const terminalRows = await prisma.outcomeCheckin.count({
      where: { commitmentId: actionId, status: { not: 'pending' } },
    });
    evidence.check({
      step: 'a waiting action can be completed after the restart',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 201, actionStatus: 'completed', terminalRows: 1 },
      actual: { status: checkin.status, actionStatus: actionRow?.status, terminalRows },
      request: { method: 'POST', path: `/api/v1/actions/${actionId}/checkin`, identity: 'fresh process' },
      response: { status: checkin.status },
      sql: `select status from "ActionCommitment" where id = '${actionId}'`,
    });
    expect(checkin.status).toBe(201);
    expect(actionRow?.status).toBe('completed');
    expect(terminalRows).toBe(1);

    // 7. The new instance answers on its own port.
    const health = await request(serverB).get('/api/health');
    evidence.check({
      step: 'the restarted instance answers',
      layer: 'API_EVIDENCE',
      expected: { status: 200, ok: true },
      actual: { status: health.status, ok: health.body?.ok },
      request: { method: 'GET', path: '/api/health', identity: 'fresh process' },
      response: { status: health.status },
    });
    expect(health.status).toBe(200);
    expect(health.body?.ok).toBe(true);
  });
});
