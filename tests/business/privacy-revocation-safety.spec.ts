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

/**
 * The owner/AI half of the same gate row.
 *
 * Two consents are revoked here and the assertion splits their reach. Withdrawing `allowAiMemoryUse`
 * has to take the AI's memory context with it - the whole point of the flag - and withdrawing
 * `allowLongTermMemory` has to stop the *user's own* memory list, because that flag governs saving and
 * reading back what was saved.
 *
 * The half that must NOT happen is the one nothing else asserts: the user-facing read of their own
 * record (`/api/v1/me/recovery` above, and the diary/letter routes here) must survive an AI-consent
 * revocation. A user who turns off AI use has not asked to lose their own content, and if the AI
 * flag were enforced per route instead of centrally, tightening it would blank the diary.
 */
describe('privacy revocation: AI and memory consents', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: any;
  let userCred: string;
  const userA = 'user_privacy_ai';
  const memoryId = `mem_rev_${Date.now()}`;
  const marker = `privacy-ai-${Date.now()}`;

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    server = app.getHttpServer();
    await prisma.user.upsert({
      where: { id: userA },
      create: { id: userA, openid: `openid_${userA}`, anonymousCode: `anon_${userA}`, nickname: '隐私测试' },
      update: {},
    });
    // Both consents on, so the before state is permissive and the revocation is observable.
    await prisma.privacySetting.upsert({
      where: { userId: userA },
      create: { userId: userA, allowAiMemoryUse: true, allowLongTermMemory: true },
      update: { allowAiMemoryUse: true, allowLongTermMemory: true },
    });
    await prisma.memoryItem.create({
      data: {
        id: memoryId,
        userId: userA,
        title: `记忆 ${marker}`,
        content: `内容 ${marker}`,
        category: '用户主动保存',
        source: 'user_saved',
        scope: 'all_ai',
        status: 'active',
        consentedAt: new Date(),
        expiresAt: new Date(Date.now() + 86_400_000 * 30),
      },
    });
    userCred = await identityFor(userA);
  });

  afterAll(async () => {
    await prisma.memoryItem.deleteMany({ where: { id: { startsWith: 'mem_rev_' } } });
    // The content-bearing-route case calls /letters/today, which queues a real letter for this user;
    // dropping the user first would fail on Letter_userId_fkey and take the whole teardown with it.
    await prisma.letter.deleteMany({ where: { userId: userA } }).catch(() => undefined);
    await prisma.privacySetting.deleteMany({ where: { userId: userA } });
    await prisma.user.deleteMany({ where: { id: userA, openid: `openid_${userA}` } }).catch(() => undefined);
    await prisma?.$disconnect();
    await app.close();
  });

  const setConsent = async (patch: Record<string, boolean>) => {
    await prisma.privacySetting.update({ where: { userId: userA }, data: patch }).catch(async () => {
      await prisma.privacySetting.create({ data: { userId: userA, ...patch } });
    });
  };

  it('withdrawing AI use empties the AI context but keeps the owner-visible read', async () => {
    const { SelfPersistenceService } = await import('../../apps/api/src/self-persistence.service.js');
    const self = app.get(SelfPersistenceService);
    const eligible = async () => (await self.listAiEligibleMemories(userA, 'breakdown', 'Mood')).map((m) => m.id);

    // Before: the memory is in the AI context.
    expect(await eligible()).toContain(memoryId);

    await setConsent({ allowAiMemoryUse: false });
    expect(await eligible(), 'the AI context still contains a memory after consent was withdrawn').not.toContain(memoryId);

    // The user's own read of the same memory is unaffected.
    const mine = await request(server).get('/api/v1/memory').set('x-goodnight-user-id', userCred).expect(200);
    const ids = (mine.body.items ?? []).map((item: any) => item.id);
    expect(ids, 'revoking AI use took the memory away from its own author').toContain(memoryId);
    expect(JSON.stringify(mine.body)).toContain(marker);

    await setConsent({ allowAiMemoryUse: true });
  });

  /**
   * The design is explicit and this case records it rather than guessing: `allowLongTermMemory`
   * governs **saving**, not reading back what was already saved and not injecting it into AI
   * (design §0.5 — "allowLongTermMemory governs saving, not by itself permission to inject existing
   * material into AI"). So withdrawing it must stop a *new* save and must leave an existing row
   * readable by its author. A test that expected the list to empty would have encoded the opposite
   * decision.
   */
  it('withdrawing long-term memory stops saving, not the owner read', async () => {
    const { SelfPersistenceService } = await import('../../apps/api/src/self-persistence.service.js');
    const self = app.get(SelfPersistenceService);
    await setConsent({ allowLongTermMemory: false });

    // The owner read of the already-saved row survives: the flag governs saving, not reading.
    const mine = await request(server).get('/api/v1/memory').set('x-goodnight-user-id', userCred).expect(200);
    expect(JSON.stringify(mine.body), 'withdrawing the saving consent took an existing memory from its author').toContain(marker);

    // A new save is refused.
    const refusedSave = await request(server)
      .post('/api/v1/memory')
      .set('x-goodnight-user-id', userCred)
      .send({ title: 'Revoked save', content: 'test' });
    // Assert on the outcome, and report what happened if it is not the refusal: a 200 here means the
    // consent write never reached the service, which is a fixture problem, not a product claim.
    if (refusedSave.status !== 403) {
      console.error('[revocation] save after revoking saving consent returned', refusedSave.status, JSON.stringify(refusedSave.body).slice(0, 200));
    }
    expect(refusedSave.status).toBe(403);

    // And the AI context, which depends on the AI flag, is unaffected by this one alone - restoring
    // the AI flag below is what brings the memory back into it.
    expect((await self.listAiEligibleMemories(userA, 'breakdown', 'Mood')).map((m) => m.id)).toContain(memoryId);

    await setConsent({ allowLongTermMemory: true });
  });

  it('a content-bearing route survives an AI-consent revocation', async () => {
    await setConsent({ allowAiMemoryUse: false });
    // These are the user's own records; tightening AI use must not blank them.
    await request(server).get('/api/v1/me/diaries').set('x-goodnight-user-id', userCred).expect(200);
    await request(server).get('/api/v1/letters/today').set('x-goodnight-user-id', userCred).expect(200);
    await setConsent({ allowAiMemoryUse: true });
  });
});
