import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApiTestApp, loginAdmin, auth, identityFor, DEMO_USER_ID } from './helpers';
import { AnonymousSessionService, SESSION_TTL_MS } from '../../apps/api/src/anonymous-session.service';

/**
 * B3-R11: the C-end identity is a server-issued, revocable session.
 *
 * Before this, every ownership check compared against a value the caller supplied, so knowing any
 * user id was enough to read and write that user's private data. These tests pin the claim that a
 * caller who knows a user id still cannot act as that user, and that a session can be expired,
 * revoked and rotated.
 */
describe('Batch 3: C-end anonymous session (B3-R11)', () => {
  let app: INestApplication;
  /** A second server instance over the same database, used for the restart and two-instance cases. */
  let secondApp: INestApplication | undefined;
  let prisma: PrismaClient;
  let sessions: AnonymousSessionService;
  let server: any;
  let secondServer: any;
  const userA = 'user_demo';
  const userB = 'user_guest';

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    sessions = app.get(AnonymousSessionService);
    server = app.getHttpServer();

    for (const id of [userA, userB]) {
      await prisma.user.upsert({
        where: { id },
        create: { id, openid: `openid_${id}`, anonymousCode: `anon_${id}`, nickname: `测试_${id}` },
        update: {},
      });
    }
  }, 60_000);

  afterAll(async () => {
    await secondApp?.close();
    await prisma?.$disconnect();
    await app?.close();
  });

  it('1.1 Knowing a user id is not enough: the bare id is refused with 401 on a private route', async () => {
    // Exactly the request an attacker would send after learning the id.
    for (const path of ['/api/v1/me/memories', '/api/v1/me/privacy', '/api/v1/me/letters', '/api/v1/journeys']) {
      await request(server).get(path).set('x-goodnight-user-id', userB).expect(401);
    }
  });

  it('1.2 A valid session works, so 1.1 is not passing because everything is refused', async () => {
    const response = await request(server)
      .get('/api/v1/me/privacy')
      .set('x-goodnight-user-id', await identityFor(userB))
      .expect(200);
    expect(response.body).toBeDefined();
  });

  it('1.3 A well-formed but unknown session, and a wrong secret, are both refused', async () => {
    const real = await identityFor(userA);
    const [sessionId] = real.split('.');

    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', 'sess_nope.secret').expect(401);
    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', `${sessionId}.wrong`).expect(401);
    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', 'not-a-credential').expect(401);
    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', '   ').expect(401);
  });

  it('1.4 An expired session is refused', async () => {
    const expired = await sessions.issue(userB, { ttlMs: -1000 });

    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', expired.credential).expect(401);
  });

  it('1.5 A revoked session is refused, and revocation is what a lost device needs', async () => {
    const session = await sessions.issue(userB, { deviceId: 'device-lost', deviceLabel: '旧手机' });

    // Usable before revocation.
    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', session.credential).expect(200);

    const revoked = await sessions.revokeDevice(userB, 'device-lost', 'device_lost');
    expect(revoked).toBeGreaterThanOrEqual(1);

    // Refused after. A signed token could not do this before its expiry.
    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', session.credential).expect(401);

    // The row is kept so the revocation stays auditable.
    const row = await prisma.anonymousSession.findUnique({ where: { id: session.sessionId } });
    expect(row?.revokedAt).not.toBeNull();
    expect(row?.revokedReason).toBe('device_lost');
  });

  it('1.6 Logging out revokes the session it was called with', async () => {
    const session = await sessions.issue(userB);

    await request(server)
      .post('/api/v1/auth/logout')
      .set('x-goodnight-user-id', session.credential)
      .send({})
      .expect(201);

    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', session.credential).expect(401);
  });

  it('1.7 Rotation issues a working successor and invalidates the predecessor', async () => {
    const session = await sessions.issue(userB);

    const rotated = await request(server)
      .post('/api/v1/auth/rotate')
      .set('x-goodnight-user-id', session.credential)
      .send({})
      .expect(201);

    const successor = rotated.body.item.credential as string;
    expect(successor).not.toBe(session.credential);

    // The successor works and is bound to the same user.
    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', successor).expect(200);

    // The predecessor is dead: a rotation must never leave two live credentials.
    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', session.credential).expect(401);

    const identity = await sessions.verify(successor);
    expect(identity.userId).toBe(userB);
  });

  it('1.8 A credential for one user cannot reach another user’s private resource', async () => {
    const journey = await prisma.lifeJourney.create({
      data: {
        id: `cred_iso_${Date.now()}`,
        userId: userB,
        title: 'B 的私密旅程',
        domain: '生活',
        status: 'active',
        stage: 'clarifying',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await request(server)
      .get(`/api/v1/journeys/${journey.id}`)
      .set('x-goodnight-user-id', await identityFor(userA))
      .expect(404);

    await prisma.lifeJourney.delete({ where: { id: journey.id } }).catch(() => undefined);
  });

  it('1.9 A session survives a server restart, because the server does not hold it in memory', async () => {
    const session = await sessions.issue(userB);

    // A second instance over the same database: the same thing a restart produces.
    secondApp = await createApiTestApp();
    secondServer = secondApp.getHttpServer();

    await request(secondServer).get('/api/v1/me/privacy').set('x-goodnight-user-id', session.credential).expect(200);
  }, 60_000);

  it('1.10 Two instances accept the same credential and agree on who it is', async () => {
    const session = await sessions.issue(userA);

    const first = await request(server)
      .get('/api/v1/me/privacy')
      .set('x-goodnight-user-id', session.credential)
      .expect(200);
    const second = await request(secondServer)
      .get('/api/v1/me/privacy')
      .set('x-goodnight-user-id', session.credential)
      .expect(200);

    expect(first.status).toBe(second.status);
    expect((await sessions.verify(session.credential)).userId).toBe(userA);
  });

  it('1.11 A revocation on one instance is seen by the other', async () => {
    const session = await sessions.issue(userB, { deviceId: 'device-shared' });

    await request(secondServer).get('/api/v1/me/privacy').set('x-goodnight-user-id', session.credential).expect(200);

    await sessions.revokeDevice(userB, 'device-shared', 'device_lost');

    await request(secondServer).get('/api/v1/me/privacy').set('x-goodnight-user-id', session.credential).expect(401);
  });

  it('1.12 The anonymous bootstrap issues a usable session for a new, isolated user', async () => {
    const bootstrap = await request(server).post('/api/v1/auth/anonymous').send({}).expect(201);
    const { userId, credential, expiresAt } = bootstrap.body.item;

    expect(userId.startsWith('user_anon_')).toBe(true);
    expect(userId).not.toBe(DEMO_USER_ID);
    expect(typeof expiresAt).toBe('string');
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());

    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', credential).expect(200);

    // The credential is bound to that user, and the secret half is not stored, so a database read
    // cannot be replayed as a credential.
    const row = await prisma.anonymousSession.findUnique({ where: { id: credential.split('.')[0] } });
    expect(row?.userId).toBe(userId);
    expect(row?.secretHash).not.toContain(credential.split('.')[1]);
  });

  it('1.13 The demo session endpoint is refused unless demo mode is explicitly enabled', async () => {
    const saved = process.env.ALLOW_DEMO_IDENTITY;
    try {
      delete process.env.ALLOW_DEMO_IDENTITY;
      await request(server).post('/api/v1/auth/demo').send({}).expect(403);

      process.env.ALLOW_DEMO_IDENTITY = 'true';
      const allowed = await request(server).post('/api/v1/auth/demo').send({}).expect(201);
      expect(allowed.body.item.userId).toBe(DEMO_USER_ID);
      await request(server)
        .get('/api/v1/me/privacy')
        .set('x-goodnight-user-id', allowed.body.item.credential)
        .expect(200);
    } finally {
      if (saved === undefined) delete process.env.ALLOW_DEMO_IDENTITY;
      else process.env.ALLOW_DEMO_IDENTITY = saved;
    }
  });

  it('1.14 An admin bearer token is not accepted as a C-end session', async () => {
    const adminToken = await loginAdmin(server);

    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', adminToken).expect(401);
  });

  it('1.15 A C-end session is not accepted as an admin bearer token', async () => {
    const credential = await identityFor(userA);

    await request(server)
      .get('/api/v1/admin/memory/mem_anything')
      .set('authorization', auth(credential))
      .expect((res) => {
        expect(res.status).not.toBe(200);
      });
  });

  it('1.16 The session TTL is the documented 30 days', async () => {
    const session = await sessions.issue(userB);
    const row = await prisma.anonymousSession.findUnique({ where: { id: session.sessionId } });
    const ttl = (row?.expiresAt.getTime() ?? 0) - Date.now();
    expect(ttl).toBeGreaterThan(SESSION_TTL_MS - 60_000);
    expect(ttl).toBeLessThanOrEqual(SESSION_TTL_MS);
  });
});
