import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp } from '../business/helpers';
import { createIdentity } from './helpers/identity';
import { FlowEvidence } from './helpers/evidence';

/**
 * F03 - the journey state machine, including the transitions it refuses.
 *
 * The allowed set is read from the product's own table (active -> paused/archived/completed,
 * paused -> active/archived/completed, and the two terminal states accept nothing). The refusals are
 * as important as the acceptances: a completed journey must stay completed, and that is checked
 * against the row, not only against the status code.
 */
describe('F03 journey state machine', () => {
  let app: INestApplication;
  let secondApp: INestApplication;
  let prisma: PrismaClient;
  let evidence: FlowEvidence;
  let server: any;
  let secondServer: any;
  let credential: string;
  let strangerCredential: string;
  let journeyId: string;
  let archivedJourneyId: string;

  beforeAll(async () => {
    app = await createApiTestApp();
    secondApp = await createApiTestApp();
    server = app.getHttpServer();
    secondServer = secondApp.getHttpServer();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    evidence = new FlowEvidence('F03');
    credential = (await createIdentity(server, 'F03 owner')).credential;
    strangerCredential = (await createIdentity(server, 'F03 stranger')).credential;
  });

  afterAll(async () => {
    evidence.flush();
    await prisma?.$disconnect();
    await secondApp?.close();
    await app?.close();
  });

  const statusOf = async (id: string) => (await prisma.lifeJourney.findUnique({ where: { id } }))?.status;

  it('walks the allowed transitions and refuses the ones the product forbids', async () => {
    // 1. Create.
    const created = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', credential)
      .send({ title: `F03 状态机 ${Date.now()}`, domain: '生活', content: 'F03：验证状态转移。' });
    journeyId = created.body?.journey?.id;
    evidence.check({
      step: 'journey created active',
      layer: 'API_EVIDENCE',
      expected: { status: 201, journeyStatus: 'active' },
      actual: { status: created.status, journeyStatus: created.body?.journey?.status },
    });
    expect(created.status).toBe(201);
    expect(created.body.journey.status).toBe('active');

    // 2. Support intent is persisted, not just echoed.
    const intent = await request(server)
      .patch(`/api/v1/journeys/${journeyId}/intent`)
      .set('x-goodnight-user-id', credential)
      .send({ intent: 'NEXT_STEP' });
    const afterIntent = await prisma.lifeJourney.findUnique({ where: { id: journeyId } });
    evidence.check({
      step: 'support intent persisted',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 200, currentIntent: 'NEXT_STEP' },
      actual: { status: intent.status, currentIntent: afterIntent?.currentIntent },
      sql: `select "currentIntent" from "LifeJourney" where id = '${journeyId}'`,
    });
    expect(intent.status).toBe(200);
    expect(afterIntent?.currentIntent).toBe('NEXT_STEP');

    // 3. active -> paused -> active. Each row is read immediately after its transition, so the
    //    evidence reflects what was committed rather than what the request asked for.
    const paused = await request(server)
      .patch(`/api/v1/journeys/${journeyId}`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'paused' });
    const rowAfterPause = await statusOf(journeyId);
    const resumed = await request(server)
      .patch(`/api/v1/journeys/${journeyId}`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'active' });
    const rowAfterResume = await statusOf(journeyId);
    evidence.check({
      step: 'active -> paused -> active',
      layer: 'DATABASE_EVIDENCE',
      expected: { pausedStatus: 200, rowAfterPause: 'paused', resumedStatus: 200, rowAfterResume: 'active' },
      actual: {
        pausedStatus: paused.status,
        rowAfterPause,
        resumedStatus: resumed.status,
        rowAfterResume,
      },
      sql: `select status from "LifeJourney" where id = '${journeyId}'`,
    });
    expect(paused.status).toBe(200);
    expect(rowAfterPause).toBe('paused');
    expect(resumed.status).toBe(200);
    expect(rowAfterResume).toBe('active');

    // 4. active -> completed.
    const completed = await request(server)
      .patch(`/api/v1/journeys/${journeyId}`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'completed' });
    evidence.check({
      step: 'active -> completed',
      layer: 'API_EVIDENCE',
      expected: { status: 200, journeyStatus: 'completed' },
      actual: { status: completed.status, journeyStatus: completed.body?.journey?.status ?? completed.body?.item?.status },
    });
    expect(completed.status).toBe(200);
    expect(await statusOf(journeyId)).toBe('completed');

    // 5. completed is terminal: the row must not move, and the message must say why.
    const reopen = await request(server)
      .patch(`/api/v1/journeys/${journeyId}`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'active' });
    evidence.check({
      step: 'completed cannot be reopened',
      layer: 'SECURITY_EVIDENCE',
      expected: { status: 400, rowStill: 'completed', messageMentionsCompleted: true },
      actual: {
        status: reopen.status,
        rowStill: await statusOf(journeyId),
        messageMentionsCompleted: String(reopen.body?.message ?? '').includes('已完成'),
      },
      response: { status: reopen.status, body: reopen.body },
    });
    expect(reopen.status).toBe(400);
    expect(await statusOf(journeyId)).toBe('completed');

    // 6. Archiving is consent-gated. Assert the gate itself first - an archive that silently
    //    succeeded without the retention consent would mean the consent does nothing - then grant it
    //    and archive for real.
    const second = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', credential)
      .send({ title: `F03 归档 ${Date.now()}`, domain: '生活', content: 'F03：归档后不可恢复。' });
    archivedJourneyId = second.body?.journey?.id;

    const archiveWithoutConsent = await request(server)
      .patch(`/api/v1/journeys/${archivedJourneyId}`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'archived' });
    evidence.check({
      step: 'archive is refused without the retention consent',
      layer: 'SECURITY_EVIDENCE',
      expected: { status: 403, messageMentionsPrivacy: true },
      actual: {
        status: archiveWithoutConsent.status,
        messageMentionsPrivacy: String(archiveWithoutConsent.body?.message ?? '').includes('隐私'),
      },
      response: { status: archiveWithoutConsent.status, body: archiveWithoutConsent.body },
    });
    expect(archiveWithoutConsent.status).toBe(403);

    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', credential)
      .send({ allowJourneyArchiveRetention: true })
      .expect(200);

    const archived = await request(server)
      .patch(`/api/v1/journeys/${archivedJourneyId}`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'archived' });
    const rowAfterArchive = await statusOf(archivedJourneyId);
    const reviveArchived = await request(server)
      .patch(`/api/v1/journeys/${archivedJourneyId}`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'active' });
    const rowAfterReviveAttempt = await statusOf(archivedJourneyId);
    evidence.check({
      step: 'archived is terminal',
      layer: 'SECURITY_EVIDENCE',
      expected: { archiveStatus: 200, rowAfterArchive: 'archived', reviveStatus: 400, rowAfterReviveAttempt: 'archived' },
      actual: {
        archiveStatus: archived.status,
        rowAfterArchive,
        reviveStatus: reviveArchived.status,
        rowAfterReviveAttempt,
      },
      sql: `select status from "LifeJourney" where id = '${archivedJourneyId}'`,
    });
    expect(archived.status).toBe(200);
    expect(rowAfterArchive).toBe('archived');
    expect(reviveArchived.status).toBe(400);
    expect(rowAfterReviveAttempt).toBe('archived');

    // 7. Another user cannot transition it.
    const strangerPatch = await request(server)
      .patch(`/api/v1/journeys/${archivedJourneyId}`)
      .set('x-goodnight-user-id', strangerCredential)
      .send({ status: 'active' });
    evidence.check({
      step: 'a stranger cannot transition the journey',
      layer: 'SECURITY_EVIDENCE',
      expected: { status: 404, rowStill: 'archived' },
      actual: { status: strangerPatch.status, rowStill: await statusOf(archivedJourneyId) },
    });
    expect(strangerPatch.status).toBe(404);

    // 8. The state survives a restart.
    const afterRestart = await request(secondServer)
      .get(`/api/v1/journeys/${journeyId}`)
      .set('x-goodnight-user-id', credential);
    evidence.check({
      step: 'state survives an API restart',
      layer: 'PERSISTENCE_EVIDENCE',
      expected: { status: 200, journeyStatus: 'completed' },
      // `GET /journeys/:id` returns { journey, snapshot, commitments, ... }, so the status lives one
      // level down.
      actual: { status: afterRestart.status, journeyStatus: afterRestart.body?.item?.journey?.status },
    });
    expect(afterRestart.status).toBe(200);
    expect(afterRestart.body?.item?.journey?.status).toBe('completed');
  });
});
