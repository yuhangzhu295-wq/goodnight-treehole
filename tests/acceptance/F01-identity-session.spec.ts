import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp } from '../business/helpers';
import { FlowEvidence } from './helpers/evidence';
import { closeAppBounded } from './helpers/teardown';

/**
 * F01 - anonymous identity and session lifecycle.
 *
 * The claim: a client that has never seen this product gets a server-issued identity, that identity
 * survives a process restart, a revocation takes effect immediately and across instances, and a bare
 * user id cannot be used in place of a credential.
 *
 * The restart is simulated by booting a **second** app instance against the same database rather than
 * by reusing the first one's in-memory state: the session must live in PostgreSQL, and a test that
 * only reuses one process cannot tell the difference.
 */
describe('F01 anonymous identity and session lifecycle', () => {
  let app: INestApplication;
  let secondApp: INestApplication;
  let prisma: PrismaClient;
  let evidence: FlowEvidence;
  let server: any;
  let secondServer: any;

  beforeAll(async () => {
    app = await createApiTestApp();
    secondApp = await createApiTestApp();
    server = app.getHttpServer();
    secondServer = secondApp.getHttpServer();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    evidence = new FlowEvidence('F01');
  });

  afterAll(async () => {
    evidence.flush();
    await prisma?.$disconnect();
    await closeAppBounded(secondApp, 'secondApp');
    await closeAppBounded(app, 'app');
  });

  it('issues an identity, keeps it across a restart, revokes it across instances, and refuses a forged id', async () => {
    // 1. A brand-new client asks for an identity. The server picks it; the client never does.
    const issued = await request(server).post('/api/v1/auth/anonymous').send({ deviceLabel: 'F01 probe' });
    const userId = issued.body?.item?.userId as string;
    const credential = issued.body?.item?.credential as string;

    evidence.check({
      step: 'anonymous session issued',
      layer: 'API_EVIDENCE',
      expected: { status: 201, hasUserId: true, credentialIsSessionDotSecret: true },
      actual: {
        status: issued.status,
        hasUserId: Boolean(userId),
        credentialIsSessionDotSecret: /^[^.]+\./.test(credential ?? ''),
      },
      request: { method: 'POST', path: '/api/v1/auth/anonymous' },
      response: { status: issued.status, userId },
    });
    expect(issued.status).toBe(201);
    expect(userId).toBeTruthy();
    expect(credential).toMatch(/^[^.]+\./);

    // The row exists and stores only a hash - the plaintext secret must not be recoverable from it.
    const sessionId = credential.split('.')[0];
    const row = await prisma.anonymousSession.findUnique({ where: { id: sessionId } });
    const secret = credential.split('.')[1];
    evidence.check({
      step: 'session row stores a hash, not the secret',
      layer: 'DATABASE_EVIDENCE',
      expected: { rowExists: true, storesPlaintextSecret: false, revokedAt: null },
      actual: {
        rowExists: Boolean(row),
        storesPlaintextSecret: JSON.stringify(row ?? {}).includes(secret),
        revokedAt: row?.revokedAt ?? null,
      },
      sql: `select id, "userId", "secretHash", "revokedAt" from "AnonymousSession" where id = '${sessionId}'`,
    });
    expect(row).not.toBeNull();
    expect(JSON.stringify(row)).not.toContain(secret);

    // 2. The credential opens a protected route.
    const firstUse = await request(server).get('/api/v1/tonight').set('x-goodnight-user-id', credential);
    evidence.check({
      step: 'credential opens a protected route',
      layer: 'API_EVIDENCE',
      expected: 200,
      actual: firstUse.status,
      request: { method: 'GET', path: '/api/v1/tonight', identity: 'issued credential' },
      response: { status: firstUse.status },
    });
    expect(firstUse.status).toBe(200);

    // 3. Restart: a second instance, sharing only the database, accepts the same credential.
    const afterRestart = await request(secondServer).get('/api/v1/tonight').set('x-goodnight-user-id', credential);
    evidence.check({
      step: 'identity survives a restart (second instance)',
      layer: 'PERSISTENCE_EVIDENCE',
      expected: { status: 200, journeyOwnerMatches: true },
      actual: {
        status: afterRestart.status,
        journeyOwnerMatches: (afterRestart.body?.item?.journey?.userId ?? userId) === userId,
      },
      request: { method: 'GET', path: '/api/v1/tonight', identity: 'same credential, second app instance' },
      response: { status: afterRestart.status },
    });
    expect(afterRestart.status).toBe(200);

    // 4. A bare user id is not a credential. This is the impersonation path R-06 closed.
    const forged = await request(server).get('/api/v1/tonight').set('x-goodnight-user-id', userId);
    evidence.check({
      step: 'a bare user id is refused',
      layer: 'SECURITY_EVIDENCE',
      expected: 401,
      actual: forged.status,
      request: { method: 'GET', path: '/api/v1/tonight', identity: `bare userId "${userId}"` },
      response: { status: forged.status, body: forged.body },
    });
    expect(forged.status).toBe(401);

    // 5. Revocation on one instance is immediate on the other.
    await request(secondServer).post('/api/v1/auth/logout').set('x-goodnight-user-id', credential).expect(201);
    const afterRevoke = await request(server).get('/api/v1/tonight').set('x-goodnight-user-id', credential);
    evidence.check({
      step: 'revocation applies across instances',
      layer: 'SECURITY_EVIDENCE',
      expected: 401,
      actual: afterRevoke.status,
      request: { method: 'GET', path: '/api/v1/tonight', identity: 'credential revoked on the other instance' },
      response: { status: afterRevoke.status },
    });
    expect(afterRevoke.status).toBe(401);

    const revokedRow = await prisma.anonymousSession.findUnique({ where: { id: sessionId } });
    evidence.check({
      step: 'the revocation is recorded, not deleted',
      layer: 'DATABASE_EVIDENCE',
      expected: { revokedAtSet: true },
      actual: { revokedAtSet: Boolean(revokedRow?.revokedAt) },
      sql: `select id, "revokedAt", "revokedReason" from "AnonymousSession" where id = '${sessionId}'`,
    });
    expect(revokedRow?.revokedAt).not.toBeNull();

    // 6. Rotation: the old credential dies in the same transaction the new one is born in.
    const second = await request(server).post('/api/v1/auth/anonymous').send({ deviceLabel: 'F01 rotate' });
    const oldCredential = second.body?.item?.credential as string;
    const rotated = await request(server).post('/api/v1/auth/rotate').set('x-goodnight-user-id', oldCredential);
    const newCredential = rotated.body?.item?.credential as string;
    const oldAfterRotate = await request(server).get('/api/v1/tonight').set('x-goodnight-user-id', oldCredential);
    const newAfterRotate = await request(server).get('/api/v1/tonight').set('x-goodnight-user-id', newCredential);
    evidence.check({
      step: 'rotation revokes the predecessor',
      layer: 'SECURITY_EVIDENCE',
      expected: { rotateStatus: 201, oldStatus: 401, newStatus: 200 },
      actual: { rotateStatus: rotated.status, oldStatus: oldAfterRotate.status, newStatus: newAfterRotate.status },
      request: { method: 'POST', path: '/api/v1/auth/rotate' },
      response: { status: rotated.status },
    });
    expect(rotated.status).toBe(201);
    expect(oldAfterRotate.status).toBe(401);
    expect(newAfterRotate.status).toBe(200);
  });
});
