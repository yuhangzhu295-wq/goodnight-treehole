import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { StoreService } from '../../apps/api/src/store.service.js';
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

  /**
   * UI-V2-29-D1: the nickname is database-authoritative.
   *
   * The failure this guards against is subtle: the runtime snapshot is loaded once at boot, so an
   * instance that cached a user before an edit would write the old nickname back on its next flush,
   * and a restart would then show the old name even though the save reported success. The assertion
   * is therefore not "GET returns what PATCH sent" - it is "a stale instance's flush cannot undo it".
   */
  it('keeps a saved nickname across a stale instance flush and a restart', async () => {
    const issued = await request(server).post('/api/v1/auth/anonymous').send({ deviceLabel: 'F01 profile' });
    const credential = issued.body?.item?.credential as string;
    const userId = issued.body?.item?.userId as string;

    // Make the second instance cache this user *before* the edit, so its copy is genuinely stale.
    await request(secondServer).get('/api/v1/me/profile').set('x-goodnight-user-id', credential).expect(200);

    const saved = await request(server)
      .patch('/api/v1/me/profile')
      .set('x-goodnight-user-id', credential)
      .send({ nickname: '夜行旅人' })
      .expect(200);
    expect(saved.body.item.nickname).toBe('夜行旅人');

    // The other instance reads the row, not its boot-time copy.
    const fromSecond = await request(secondServer)
      .get('/api/v1/me/profile')
      .set('x-goodnight-user-id', credential)
      .expect(200);
    expect(fromSecond.body.item.nickname).toBe('夜行旅人');

    // Its flush rewrites the whole snapshot, including that stale user object. `flush()` alone only
    // drains the queue, so it would write nothing here; `persist()` is what enqueues the stale
    // snapshot that the mapper then upserts.
    const secondStore = secondApp.get(StoreService);
    secondStore.persist();
    await secondStore.flush();
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { nickname: true } });
    expect(row?.nickname).toBe('夜行旅人');

    // A fresh process (the restart) reads the same value.
    let afterRestartNickname = '';
    const restarted = await createApiTestApp();
    try {
      const afterRestart = await request(restarted.getHttpServer())
        .get('/api/v1/me/profile')
        .set('x-goodnight-user-id', credential)
        .expect(200);
      afterRestartNickname = afterRestart.body.item.nickname;
      expect(afterRestartNickname).toBe('夜行旅人');
    } finally {
      await closeAppBounded(restarted, 'restarted');
    }

    evidence.check({
      step: 'a saved nickname survives a stale flush and a restart',
      layer: 'PERSISTENCE_EVIDENCE',
      expected: { saved: '夜行旅人', fromSecond: '夜行旅人', afterStaleFlush: '夜行旅人', afterRestart: '夜行旅人' },
      actual: {
        saved: saved.body.item.nickname,
        fromSecond: fromSecond.body.item.nickname,
        afterStaleFlush: row?.nickname,
        afterRestart: afterRestartNickname,
      },
      request: { method: 'PATCH', path: '/api/v1/me/profile' },
      response: { status: saved.status },
    });
  });

  /**
   * The operator view reads the in-memory user list, which an instance that did not serve the edit
   * would hold stale. Both the list and the export must show the database value.
   */
  it('serves the saved nickname from another instance admin list and export', async () => {
    const issued = await request(server).post('/api/v1/auth/anonymous').send({ deviceLabel: 'F01 admin profile' });
    const credential = issued.body?.item?.credential as string;
    const userId = issued.body?.item?.userId as string;

    // Load the user into the second instance's list before the edit, so its copy is stale.
    await request(secondServer).get('/api/v1/me/profile').set('x-goodnight-user-id', credential).expect(200);
    await request(server)
      .patch('/api/v1/me/profile')
      .set('x-goodnight-user-id', credential)
      .send({ nickname: '后台可见' })
      .expect(200);

    const login = await request(secondServer)
      .post('/api/admin/v1/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(201);
    const listed = await request(secondServer)
      .get(`/api/admin/v1/users?q=${encodeURIComponent(userId)}`)
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);
    const listedUser = listed.body.items.find((user: any) => user.id === userId);
    expect(listedUser?.nickname).toBe('后台可见');

    const exported = await request(secondServer)
      .get('/api/admin/v1/users/export')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);
    const download = await request(secondServer)
      .get(`/api/admin/v1/users/export/${exported.body.item.assetId}/download`)
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);
    // Supertest parses JSON responses into `body`; the stream may still be text depending on the
    // content type it saw, so accept either rather than depending on the parser's choice.
    const document = download.body && Array.isArray(download.body.users) ? download.body : JSON.parse(download.text);
    const exportedUser = document.users.find((user: any) => user.id === userId);
    expect(exportedUser?.nickname).toBe('后台可见');

    evidence.check({
      step: 'another instance admin list and export show the saved nickname',
      layer: 'PERSISTENCE_EVIDENCE',
      expected: { listed: '后台可见', exported: '后台可见' },
      actual: { listed: listedUser?.nickname, exported: exportedUser?.nickname },
      request: { method: 'GET', path: '/api/admin/v1/users' },
      response: { status: listed.status },
    });
  });

  /**
   * Status is database-authoritative for the same reason as the nickname: a stale instance's flush
   * must not lift a ban. The in-memory copy is deliberately left stale here.
   */
  it('does not let a stale instance restore a banned status', async () => {
    const issued = await request(server).post('/api/v1/auth/anonymous').send({ deviceLabel: 'F01 status' });
    const credential = issued.body?.item?.credential as string;
    const userId = issued.body?.item?.userId as string;

    // Cache the user as `normal` on the second instance.
    await request(secondServer).get('/api/v1/me/profile').set('x-goodnight-user-id', credential).expect(200);

    const login = await request(server)
      .post('/api/admin/v1/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(201);
    await request(server)
      .patch(`/api/admin/v1/users/${userId}/status`)
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ status: 'banned' })
      .expect(200);

    // The stale instance writes its whole snapshot, including the old `normal` status.
    const secondStore = secondApp.get(StoreService);
    secondStore.persist();
    await secondStore.flush();

    const row = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    expect(row?.status).toBe('banned');

    await request(server)
      .patch('/api/v1/me/profile')
      .set('x-goodnight-user-id', credential)
      .send({ nickname: '封禁后改名' })
      .expect(403);

    // The operator list reads the database, so it sees the ban even on the instance that did not
    // apply it.
    const listed = await request(secondServer)
      .get(`/api/admin/v1/users?q=${encodeURIComponent(userId)}`)
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);
    expect(listed.body.items.find((user: any) => user.id === userId)?.status).toBe('banned');

    evidence.check({
      step: 'a stale instance cannot restore a banned status',
      layer: 'PERSISTENCE_EVIDENCE',
      expected: { afterStaleFlush: 'banned', profileWrite: 403, listedStatus: 'banned' },
      actual: { afterStaleFlush: row?.status, profileWrite: 403, listedStatus: listed.body.items.find((u: any) => u.id === userId)?.status },
      request: { method: 'PATCH', path: '/api/admin/v1/users/:id/status' },
      response: { status: 200 },
    });
  });
});
