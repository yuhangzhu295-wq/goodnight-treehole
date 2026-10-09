import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApiTestApp, loginAdmin, auth, identityFor, DEMO_USER_ID } from './helpers';
import {
  IDENTITY_CREDENTIAL_TTL_MS,
  issueIdentityCredential,
} from '../../apps/api/src/identity-credential';

/**
 * B3-R11: the C-end identity header is a server-issued credential, not a user id.
 *
 * Before this change every ownership check compared against a value the caller supplied, so knowing
 * any existing user id was enough to read and write that user's private data. These tests pin the
 * claim that a caller who knows a user id still cannot act as that user.
 */
describe('Batch 3: C-end identity credential (B3-R11)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: any;
  const userA = 'user_demo';
  const userB = 'user_guest';

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    server = app.getHttpServer();

    await prisma.user.upsert({
      where: { id: userA },
      create: { id: userA, openid: `openid_${userA}`, anonymousCode: `anon_${userA}`, nickname: '测试用户A' },
      update: {},
    });
    await prisma.user.upsert({
      where: { id: userB },
      create: { id: userB, openid: `openid_${userB}`, anonymousCode: `anon_${userB}`, nickname: '测试用户B' },
      update: {},
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  it('1.1 Knowing a user id is not enough: the bare id is refused with 401 on a private route', async () => {
    // This is the exact request an attacker would send after learning the id.
    await request(server).get('/api/v1/me/memories').set('x-goodnight-user-id', userB).expect(401);
    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', userB).expect(401);
    await request(server).get('/api/v1/me/letters').set('x-goodnight-user-id', userB).expect(401);
    await request(server).get('/api/v1/journeys').set('x-goodnight-user-id', userB).expect(401);
  });

  it('1.2 A valid credential still works, so 1.1 is not passing because everything is refused', async () => {
    const response = await request(server)
      .get('/api/v1/me/privacy')
      .set('x-goodnight-user-id', identityFor(userB))
      .expect(200);
    expect(response.body).toBeDefined();
  });

  it('1.3 Changing the user id inside a credential invalidates it', async () => {
    // Take a credential legitimately issued for userA and rewrite the id to userB, keeping the
    // signature. This is the impersonation attempt the signature exists to stop.
    const credential = identityFor(userA);
    const decoded = Buffer.from(credential, 'base64url').toString('utf8');
    const lastColon = decoded.lastIndexOf(':');
    const withoutSignature = decoded.slice(0, lastColon);
    const signature = decoded.slice(lastColon + 1);
    const secondColon = withoutSignature.lastIndexOf(':');
    const issuedAt = withoutSignature.slice(secondColon + 1);
    const forged = Buffer.from(`${userB}:${issuedAt}:${signature}`).toString('base64url');

    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', forged).expect(401);
    await request(server).get('/api/v1/me/memories').set('x-goodnight-user-id', forged).expect(401);
  });

  it('1.4 A credential signed with the wrong secret is refused', async () => {
    const saved = process.env.CEND_TOKEN_SECRET;
    let foreign: string;
    try {
      process.env.CEND_TOKEN_SECRET = 'a-different-secret-entirely';
      foreign = issueIdentityCredential(userB);
    } finally {
      process.env.CEND_TOKEN_SECRET = saved;
    }

    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', foreign).expect(401);
  });

  it('1.5 An expired credential is refused', async () => {
    const expired = issueIdentityCredential(userB, Date.now() - IDENTITY_CREDENTIAL_TTL_MS - 1000);

    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', expired).expect(401);
  });

  it('1.6 A far-future credential is refused rather than treated as long-lived', async () => {
    const future = issueIdentityCredential(userB, Date.now() + 60 * 60 * 1000);

    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', future).expect(401);
  });

  it('1.7 A malformed value is refused rather than degrading to an anonymous request', async () => {
    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', 'not-a-credential').expect(401);
    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', '   ').expect(401);
    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', 'a:b:c').expect(401);
  });

  it('1.8 A valid credential for one user cannot reach another user’s private resource', async () => {
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

    // Holding a genuine credential for A must not open B's journey.
    await request(server)
      .get(`/api/v1/journeys/${journey.id}`)
      .set('x-goodnight-user-id', identityFor(userA))
      .expect(404);

    await prisma.lifeJourney.delete({ where: { id: journey.id } }).catch(() => undefined);
  });

  it('1.9 The anonymous bootstrap issues a usable credential for a brand-new, isolated user', async () => {
    const bootstrap = await request(server).post('/api/v1/auth/anonymous').send({}).expect(201);
    const { userId, credential } = bootstrap.body.item;
    expect(typeof userId).toBe('string');
    expect(userId.startsWith('user_anon_')).toBe(true);

    // The issued credential works.
    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', credential).expect(200);

    // And the new user is not the demo user: the id is server-chosen and distinct.
    expect(userId).not.toBe(DEMO_USER_ID);

    // The credential is bound to that id, so rewriting it to the demo user is refused.
    const decoded = Buffer.from(credential, 'base64url').toString('utf8');
    const lastColon = decoded.lastIndexOf(':');
    const withoutSignature = decoded.slice(0, lastColon);
    const signature = decoded.slice(lastColon + 1);
    const secondColon = withoutSignature.lastIndexOf(':');
    const issuedAt = withoutSignature.slice(secondColon + 1);
    const forged = Buffer.from(`${DEMO_USER_ID}:${issuedAt}:${signature}`).toString('base64url');
    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', forged).expect(401);
  });

  it('1.10 The demo identity endpoint is refused unless demo mode is explicitly enabled', async () => {
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

  it('1.11 An admin bearer token is not accepted as a C-end identity', async () => {
    const adminToken = await loginAdmin(server);

    await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', adminToken).expect(401);
  });

  it('1.12 A C-end credential is not accepted as an admin bearer token', async () => {
    const credential = identityFor(userA);

    await request(server)
      .get('/api/v1/admin/memory/mem_anything')
      .set('authorization', auth(credential))
      .expect((res) => {
        expect([401, 403, 404]).toContain(res.status);
        expect(res.status).not.toBe(200);
      });
  });

  it('1.13 Domain separation holds even when both secrets are configured to the same value', async () => {
    // The two credential kinds normally use different secrets, which alone would stop one being
    // accepted as the other. This test removes that accident: with a shared secret, only the
    // purpose prefix in the signed payload keeps an admin token from verifying as a C-end identity.
    const savedCend = process.env.CEND_TOKEN_SECRET;
    const savedAdmin = process.env.ADMIN_TOKEN_SECRET;
    try {
      process.env.CEND_TOKEN_SECRET = 'shared-secret-for-domain-separation';
      process.env.ADMIN_TOKEN_SECRET = 'shared-secret-for-domain-separation';

      const adminToken = await loginAdmin(server);

      // An admin token whose signed payload is adminId:timestamp must not verify as a user credential.
      await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', adminToken).expect(401);

      // And the C-end credential minted under the same secret must not open an admin route.
      const credential = issueIdentityCredential(userA);
      await request(server)
        .get('/api/v1/admin/memory/mem_anything')
        .set('authorization', auth(credential))
        .expect((res) => {
          expect(res.status).not.toBe(200);
        });
    } finally {
      if (savedCend === undefined) delete process.env.CEND_TOKEN_SECRET;
      else process.env.CEND_TOKEN_SECRET = savedCend;
      if (savedAdmin === undefined) delete process.env.ADMIN_TOKEN_SECRET;
      else process.env.ADMIN_TOKEN_SECRET = savedAdmin;
    }
  });
});
