import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { auth, createApiTestApp, loginAdmin } from '../business/helpers';
import { createIdentity } from './helpers/identity';
import { FlowEvidence } from './helpers/evidence';

/**
 * F13 - safety support reachability.
 *
 * A high-risk expression has to do three things: put the journey into `safety_first` instead of the
 * ordinary intake, write a SafetyEvent an operator can act on, and give the person a path forward
 * that does not depend on the AI job finishing. The negative control matters just as much - ordinary
 * content must not create a safety event, or the queue becomes noise and the signal is lost.
 */
describe('F13 safety support', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let evidence: FlowEvidence;
  let server: any;
  let adminToken: string;

  let credential: string;
  let userId: string;
  let strangerCredential: string;
  let safetyJourneyId: string;
  let safetyEventId: string;

  beforeAll(async () => {
    app = await createApiTestApp();
    server = app.getHttpServer();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    evidence = new FlowEvidence('F13');
    adminToken = await loginAdmin(server);
    const identity = await createIdentity(server, 'F13 owner');
    credential = identity.credential;
    userId = identity.userId;
    strangerCredential = (await createIdentity(server, 'F13 stranger')).credential;
  });

  afterAll(async () => {
    evidence.flush();
    await prisma?.$disconnect();
    await app?.close();
  });

  it('raises a safety event, offers the support path, and records the operator action', async () => {
    // 1. High-risk content creates a safety event and starts the journey in safety_first.
    const highRisk = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', credential)
      .send({
        title: `F13 安全 ${Date.now()}`,
        domain: '其他',
        content: 'F13：我最近又出现了自杀的念头，晚上很难熬。',
        intensity: 9,
      });
    safetyJourneyId = highRisk.body?.journey?.id;
    const safetyRow = await prisma.safetyEvent.findFirst({
      where: { userId, source: 'journey_create' },
      orderBy: { createdAt: 'desc' },
    });
    safetyEventId = safetyRow?.id;
    evidence.check({
      step: 'high-risk content raises a safety event and a support prompt',
      layer: 'DATABASE_EVIDENCE',
      expected: {
        status: 201,
        journeyStage: 'safety_first',
        needsRealWorldSupport: true,
        eventLevel: 'high',
        eventStatus: 'open',
        eventSource: 'journey_create',
      },
      actual: {
        status: highRisk.status,
        journeyStage: highRisk.body?.journey?.stage,
        needsRealWorldSupport: highRisk.body?.safety?.needsRealWorldSupport,
        eventLevel: safetyRow?.level,
        eventStatus: safetyRow?.status,
        eventSource: safetyRow?.source,
      },
      request: { method: 'POST', path: '/api/v1/journeys', body: { intensity: 9 } },
      response: { status: highRisk.status, journeyId: safetyJourneyId, safety: highRisk.body?.safety },
      sql: `select level, status, source from "SafetyEvent" where "userId" = '${userId}'`,
    });
    expect(highRisk.status).toBe(201);
    expect(highRisk.body?.journey?.stage).toBe('safety_first');
    expect(highRisk.body?.safety?.needsRealWorldSupport).toBe(true);
    expect(safetyRow?.level).toBe('high');
    expect(safetyRow?.status).toBe('open');

    // 2. Ordinary content does not create one.
    const ordinary = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', credential)
      .send({ title: `F13 普通 ${Date.now()}`, domain: '生活', content: 'F13：今天只是有点累，想早点睡。', intensity: 3 });
    const ordinarySafetyEvents = await prisma.safetyEvent.count({
      where: { userId, source: 'journey_create', payload: { path: ['triggerExcerpt'], string_contains: 'F13：今天只是有点累' } },
    });
    evidence.check({
      step: 'ordinary content raises no safety event',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 201, needsRealWorldSupport: false, eventsForThisContent: 0 },
      actual: {
        status: ordinary.status,
        needsRealWorldSupport: ordinary.body?.safety?.needsRealWorldSupport,
        eventsForThisContent: ordinarySafetyEvents,
      },
      request: { method: 'POST', path: '/api/v1/journeys', body: { intensity: 3 } },
      response: { status: ordinary.status, journeyStage: ordinary.body?.journey?.stage },
    });
    expect(ordinary.body?.safety?.needsRealWorldSupport).toBe(false);
    expect(ordinarySafetyEvents).toBe(0);

    // 3. A stranger cannot acknowledge someone else's safety prompt.
    const strangerAck = await request(server)
      .post(`/api/v1/journeys/${safetyJourneyId}/safety/acknowledge`)
      .set('x-goodnight-user-id', strangerCredential)
      .send({});
    const journeyBeforeAck = await prisma.lifeJourney.findUnique({ where: { id: safetyJourneyId } });
    evidence.check({
      step: 'a stranger cannot acknowledge the safety prompt',
      layer: 'SECURITY_EVIDENCE',
      expected: { status: 404, stageStill: 'safety_first' },
      actual: { status: strangerAck.status, stageStill: journeyBeforeAck?.stage },
      request: { method: 'POST', path: `/api/v1/journeys/${safetyJourneyId}/safety/acknowledge`, identity: 'unrelated user' },
      response: { status: strangerAck.status },
    });
    expect(strangerAck.status).toBe(404);
    expect(journeyBeforeAck?.stage).toBe('safety_first');

    // 4. The owner acknowledges and the journey moves out of safety_first, with a record.
    const ack = await request(server)
      .post(`/api/v1/journeys/${safetyJourneyId}/safety/acknowledge`)
      .set('x-goodnight-user-id', credential)
      .send({});
    const journeyAfterAck = await prisma.lifeJourney.findUnique({ where: { id: safetyJourneyId } });
    const ackUpdate = await prisma.journeyUpdate.findFirst({
      where: { journeyId: safetyJourneyId, kind: 'safety_acknowledged' },
    });
    evidence.check({
      step: 'acknowledging moves the journey to stabilizing and is recorded',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 201, stage: 'stabilizing', updateKind: 'safety_acknowledged', intent: 'JUST_LISTEN' },
      actual: {
        status: ack.status,
        stage: journeyAfterAck?.stage,
        updateKind: ackUpdate?.kind,
        intent: journeyAfterAck?.currentIntent,
      },
      request: { method: 'POST', path: `/api/v1/journeys/${safetyJourneyId}/safety/acknowledge` },
      response: { status: ack.status },
      sql: `select stage, "currentIntent" from "LifeJourney" where id = '${safetyJourneyId}'; select kind from "JourneyUpdate" where "journeyId" = '${safetyJourneyId}'`,
    });
    expect(ack.status).toBe(201);
    expect(journeyAfterAck?.stage).toBe('stabilizing');
    expect(ackUpdate?.kind).toBe('safety_acknowledged');

    // 5. The operator sees the event, its trigger excerpt, and can handle it with a note.
    const adminList = await request(server)
      .get('/api/admin/v1/safety/events')
      .set('Authorization', auth(adminToken));
    const detail = await request(server)
      .get(`/api/admin/v1/safety/events/${safetyEventId}`)
      .set('Authorization', auth(adminToken));
    const handled = await request(server)
      .patch(`/api/admin/v1/safety/events/${safetyEventId}/handle`)
      .set('Authorization', auth(adminToken))
      .send({ status: 'handled', note: 'F13：已按流程跟进。' });
    const handledRow = await prisma.safetyEvent.findUnique({ where: { id: safetyEventId } });
    const auditRows = await prisma.auditLog.count({
      where: { action: 'SAFETY_EVENT_HANDLE', resourceId: safetyEventId },
    });
    evidence.check({
      step: 'an operator can list, inspect, and handle the event, with an audit row',
      layer: 'DATABASE_EVIDENCE',
      expected: {
        listStatus: 200,
        listed: true,
        detailStatus: 200,
        excerptMentionsContent: true,
        handleStatus: 200,
        eventStatus: 'handled',
        auditRows: 1,
      },
      actual: {
        listStatus: adminList.status,
        listed: (adminList.body?.items ?? []).some((item: any) => item.id === safetyEventId),
        detailStatus: detail.status,
        excerptMentionsContent: String(detail.body?.item?.triggerExcerpt ?? '').includes('自杀'),
        handleStatus: handled.status,
        eventStatus: handledRow?.status,
        auditRows,
      },
      request: {
        method: 'PATCH',
        path: `/api/admin/v1/safety/events/${safetyEventId}/handle`,
        body: { status: 'handled' },
      },
      response: {
        listStatus: adminList.status,
        detailStatus: detail.status,
        handleStatus: handled.status,
      },
      sql: `select status from "SafetyEvent" where id = '${safetyEventId}'; select count(*) from "AuditLog" where "resourceId" = '${safetyEventId}'`,
    });
    expect(adminList.status).toBe(200);
    expect((adminList.body?.items ?? []).some((item: any) => item.id === safetyEventId)).toBe(true);
    expect(detail.status).toBe(200);
    expect(String(detail.body?.item?.triggerExcerpt ?? '')).toContain('自杀');
    expect(handled.status).toBe(200);
    expect(handledRow?.status).toBe('handled');
    expect(auditRows).toBe(1);

    // 6. The operator routes are not reachable without an admin credential.
    const unauthenticated = await request(server).get('/api/admin/v1/safety/events');
    evidence.check({
      step: 'the safety queue is closed to unauthenticated callers',
      layer: 'SECURITY_EVIDENCE',
      expected: { status: 401 },
      actual: { status: unauthenticated.status },
      request: { method: 'GET', path: '/api/admin/v1/safety/events', identity: 'none' },
      response: { status: unauthenticated.status },
    });
    expect(unauthenticated.status).toBe(401);
  });
});
