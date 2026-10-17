import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp } from '../business/helpers';
import { createIdentity } from './helpers/identity';
import { FlowEvidence } from './helpers/evidence';

/**
 * F02 - what the user writes on the Tonight page becomes a journey that is really theirs.
 *
 * The chain that matters: the UI action reaches the API, the API writes a row, the row belongs to the
 * caller, the home page reads it back, it survives an API restart, and another user cannot read it.
 *
 * "Survives a restart" is checked against a second app instance sharing only the database. Reading it
 * back through the same instance would prove nothing about persistence.
 */
describe('F02 tonight entry creates a journey owned by the caller', () => {
  let app: INestApplication;
  let secondApp: INestApplication;
  let prisma: PrismaClient;
  let evidence: FlowEvidence;
  let server: any;
  let secondServer: any;
  let ownerCredential: string;
  let strangerCredential: string;
  const title = `F02 今晚记录 ${Date.now()}`;
  // Identities are issued through the API, which is the path a first launch takes. Creating user rows
  // directly would bypass the server's own registration and be rejected as "unknown user".
  let owner: string;
  let stranger: string;

  beforeAll(async () => {
    app = await createApiTestApp();
    secondApp = await createApiTestApp();
    server = app.getHttpServer();
    secondServer = secondApp.getHttpServer();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    evidence = new FlowEvidence('F02');
    const ownerIdentity = await createIdentity(server, 'F02 owner');
    const strangerIdentity = await createIdentity(server, 'F02 stranger');
    owner = ownerIdentity.userId;
    stranger = strangerIdentity.userId;
    ownerCredential = ownerIdentity.credential;
    strangerCredential = strangerIdentity.credential;
  });

  afterAll(async () => {
    evidence.flush();
    await prisma?.$disconnect();
    await secondApp?.close();
    await app?.close();
  });

  it('writes a journey for its author, reads it back after a restart, and hides it from another user', async () => {
    // 1. A new user's home page has no journey yet.
    const before = await request(server).get('/api/v1/tonight').set('x-goodnight-user-id', ownerCredential);
    evidence.check({
      step: 'a new identity has no journey',
      layer: 'API_EVIDENCE',
      expected: { status: 200, journey: null },
      actual: { status: before.status, journey: before.body?.item?.journey ?? null },
      request: { method: 'GET', path: '/api/v1/tonight' },
      response: { status: before.status, journey: before.body?.item?.journey ?? null },
    });
    expect(before.status).toBe(200);
    expect(before.body?.item?.journey ?? null).toBeNull();

    // 2. The entry is submitted.
    const created = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', ownerCredential)
      .send({ title, domain: '生活', content: 'F02：今晚想说的一件真实的事。' });
    const journeyId = created.body?.journey?.id as string;
    evidence.check({
      step: 'journey created through the API',
      layer: 'API_EVIDENCE',
      expected: { status: 201, hasId: true, userId: owner },
      actual: { status: created.status, hasId: Boolean(journeyId), userId: created.body?.journey?.userId },
      request: { method: 'POST', path: '/api/v1/journeys', body: { title, domain: '生活' } },
      response: { status: created.status, journeyId, userId: created.body?.journey?.userId },
    });
    expect(created.status).toBe(201);
    expect(journeyId).toBeTruthy();
    expect(created.body.journey.userId).toBe(owner);

    // 3. The row is in PostgreSQL, read with an independent client rather than the API.
    const row = await prisma.lifeJourney.findUnique({ where: { id: journeyId } });
    evidence.check({
      step: 'row read back with an independent client',
      layer: 'DATABASE_EVIDENCE',
      expected: { exists: true, userId: owner, title },
      actual: { exists: Boolean(row), userId: row?.userId, title: row?.title },
      sql: `select id, "userId", title from "LifeJourney" where id = '${journeyId}'`,
    });
    expect(row?.userId).toBe(owner);
    expect(row?.title).toBe(title);

    // 4. The home page now carries it.
    const afterCreate = await request(server).get('/api/v1/tonight').set('x-goodnight-user-id', ownerCredential);
    evidence.check({
      step: 'home page shows the journey it just created',
      layer: 'API_EVIDENCE',
      expected: { status: 200, journeyId },
      actual: { status: afterCreate.status, journeyId: afterCreate.body?.item?.journey?.id },
    });
    expect(afterCreate.body?.item?.journey?.id).toBe(journeyId);

    // 5. Restart: the second instance, sharing only the database, sees the same journey.
    const afterRestart = await request(secondServer).get('/api/v1/tonight').set('x-goodnight-user-id', ownerCredential);
    evidence.check({
      step: 'journey survives an API restart',
      layer: 'PERSISTENCE_EVIDENCE',
      expected: { status: 200, journeyId },
      actual: { status: afterRestart.status, journeyId: afterRestart.body?.item?.journey?.id },
      request: { method: 'GET', path: '/api/v1/tonight', identity: 'same credential, second app instance' },
    });
    expect(afterRestart.body?.item?.journey?.id).toBe(journeyId);

    // 6. Another user cannot read it, and cannot list it.
    const strangerRead = await request(server)
      .get(`/api/v1/journeys/${journeyId}`)
      .set('x-goodnight-user-id', strangerCredential);
    const strangerList = await request(server).get('/api/v1/journeys').set('x-goodnight-user-id', strangerCredential);
    evidence.check({
      step: 'another user is refused on the journey',
      layer: 'SECURITY_EVIDENCE',
      expected: { readStatus: 404, listContainsIt: false },
      actual: {
        readStatus: strangerRead.status,
        listContainsIt: (strangerList.body?.items ?? []).some((item: any) => item.id === journeyId),
      },
      request: { method: 'GET', path: `/api/v1/journeys/${journeyId}`, identity: stranger },
      response: { status: strangerRead.status },
    });
    expect(strangerRead.status).toBe(404);
    expect((strangerList.body?.items ?? []).some((item: any) => item.id === journeyId)).toBe(false);
  });
});
