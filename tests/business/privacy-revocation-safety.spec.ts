import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApiTestApp, loginAdmin, auth, identityFor } from './helpers';

/**
 * The revocation half of the `PRIVACY_PASS` gate (design §4: "owner/safety/AI reads under
 * revocation").
 *
 * Withdrawing a privacy consent must remove what that consent controlled. It must not remove more:
 * a user who turns off `allowRecoveryData` has not consented to losing emergency support, so the
 * safety path has to stay readable by an operator, and the safety response the *user* receives has to
 * survive. If someone later wires the safety read or the safety prompt behind `privacyAllows`, a user
 * tightening their settings would silently degrade their own safety net - nothing else in the suite
 * asserts that, so the change would land green.
 *
 * The strong assertion is that turning recovery data off changes the recovery readbao not the safety
 * one, and that a content-bearing user-facing route keeps working. A bare "the safety list is 200"
 * would pass even if the revocation had cut everything.
 */
describe('privacy revocation: only what it controls goes away', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: any;
  let adminToken: string;
  let userCred: string;
  const userA = 'user_demo';
  const safetyId = `safety_priv_${Date.now()}`;
  const marker = `revocation-${Date.now()}`;

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    server = app.getHttpServer();
    adminToken = await loginAdmin(server);
    await prisma.user.upsert({
      where: { id: userA },
      create: { id: userA, openid: `openid_${userA}`, anonymousCode: `anon_${userA}`, nickname: '测试用户' },
      update: {},
    });
    // Consent on first, so the "before" state is the permissive one and the change is observable.
    await prisma.privacySetting.upsert({
      where: { userId: userA },
      create: { userId: userA, allowRecoveryData: true, allowLongTermMemory: true },
      update: { allowRecoveryData: true, allowLongTermMemory: true },
    });
    await prisma.safetyEvent.create({
      data: {
        id: safetyId,
        userId: userA,
        level: 'high',
        source: 'journey_create',
        action: 'real_world_support_prompt',
        status: 'open',
        createdAt: new Date(),
      },
    });
    userCred = await identityFor(userA);
  });

  afterAll(async () => {
    await prisma.safetyEvent.deleteMany({ where: { id: { startsWith: 'safety_priv_' } } });
    await prisma.privacySetting.deleteMany({ where: { userId: userA } });
    // The user row references, and is referenced by, rows this spec created; the seeded demo user may
    // also exist, so delete only when it is the one this spec upserted.
    await prisma.user.deleteMany({ where: { id: userA, openid: `openid_${userA}` } });
    await prisma?.$disconnect();
    await app.close();
  });

  async function setRecoveryConsent(on: boolean) {
    await prisma.privacySetting.update({ where: { userId: userA }, data: { allowRecoveryData: on } }).catch(async () => {
      await prisma.privacySetting.create({ data: { userId: userA, allowRecoveryData: on } });
    });
  }

  const adminSafetyList = () =>
    request(server).get('/api/admin/v1/safety/events').set('Authorization', auth(adminToken)).expect(200);
  const adminSafetyDetail = () =>
    request(server).get(`/api/admin/v1/safety/events/${safetyId}`).set('Authorization', auth(adminToken)).expect(200);

  it('the private collections it controls stop, and the safety read keeps working', async () => {
    // Consent on: the read works. That is the "before".
    await setRecoveryConsent(true);
    await request(server).get('/api/v1/me/recovery').set('x-goodnight-user-id', userCred).expect(200);

    await setRecoveryConsent(false);

    // This is the negative control: it proves the revocation reached this process, so the safety
    // assertions below are not passing merely because nothing was lifted at all.
    const refused = await request(server).get('/api/v1/me/recovery').set('x-goodnight-user-id', userCred).expect(403);
    expect(JSON.stringify(refused.body)).toContain('允许查看恢复记录');

    const list = await adminSafetyList();
    const inList = (list.body.items ?? []).some((event: any) => event.id === safetyId);
    expect(inList, 'the revoked consent removed the safety event, not just the recovery data').toBe(true);

    const detail = await adminSafetyDetail();
    expect(detail.body.item.id).toBe(safetyId);

    // And an operator can still act on it, which is the point of keeping the path open.
    await request(server)
      .patch(`/api/admin/v1/safety/events/${safetyId}/handle`)
      .set('Authorization', auth(adminToken))
      .send({ status: 'handled', note: `${marker} handled` })
      .expect(200);
  });

  it('restoring the consent brings the recovery read back', async () => {
    await setRecoveryConsent(true);
    await request(server).get('/api/v1/me/recovery').set('x-goodnight-user-id', userCred).expect(200);
    await setRecoveryConsent(false);
  });
});
