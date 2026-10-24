import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApiTestApp, identityFor } from './helpers';

/**
 * The per-route half of the `SELF_ROUTE_IDENTITY_PASS` gate (design §0.5/A8).
 *
 * `batch3-identity-matrix.spec.ts` asserts 401 for every route in the matrix without a credential,
 * and cross-user isolation for nine areas - but the parameterised routes (`/journeys/:id/...`,
 * `/actions/:id/...`, `DELETE /memory/:id`) are never called with **another user's id**. The matrix
 * document's "Negative Test" column named tests for them that exist nowhere in the repository, so
 * the claim of per-route coverage was reading as evidence without being one.
 * `scripts/audit-identity-gate-coverage.mjs` measures that gap; this closes the C-end part of it.
 * (The peer family is covered by `batch2-peer-verification.spec.ts` test 3.3, "every direct peer
 * operation refuses a caller who is not a participant" - the gap was the doc's attribution, not the
 * coverage.)
 *
 * Every case carries its own control: the same request is also sent by the record's **owner**. A
 * route that is misspelled, or one whose id never resolves for anybody, would refuse the stranger
 * too, and a stranger-only assertion would call that a pass. The control only requires that the owner
 * does not get 404 - it does not demand the business action succeed, because several of these routes
 * have state preconditions that are not the subject here.
 */
describe('Batch 3 identity: every parameterised C-end route refuses a foreign id', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let server: any;
  let ownerCred: string;
  let strangerCred: string;
  let journeyId: string;
  let actionId: string;
  let memoryId: string;
  const owner = 'user_demo';
  const stranger = 'user_guest';
  const marker = `foreign-id-${Date.now()}`;

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    server = app.getHttpServer();
    for (const id of [owner, stranger]) {
      await prisma.user.upsert({
        where: { id },
        create: { id, openid: `openid_${id}`, anonymousCode: `anon_${id}`, nickname: `测试用户 ${id}` },
        update: {},
      });
    }
    ownerCred = await identityFor(owner);
    strangerCred = await identityFor(stranger);

    // The optional-consent flags default to off, and several of these routes are gated on them. The
    // subject here is ownership, not consent, so the owner is given every consent up front and the
    // stranger none - which also means a stranger reaching a route would be refused for consent
    // reasons, so each case's owner control is what proves the refusal was about ownership.
    await prisma.privacySetting.upsert({
      where: { userId: owner },
      create: {
        userId: owner,
        allowLongTermMemory: true,
        allowRecoveryData: true,
        allowJourneyArchiveRetention: true,
        allowAnonymousExperienceShare: true,
        allowAnonymousExperienceStats: true,
        allowPeerMatching: true,
        allowFutureSelfNotifications: true,
        allowDataExport: true,
      },
      update: {
        allowLongTermMemory: true,
        allowRecoveryData: true,
        allowJourneyArchiveRetention: true,
        allowAnonymousExperienceShare: true,
        allowAnonymousExperienceStats: true,
        allowPeerMatching: true,
        allowFutureSelfNotifications: true,
        allowDataExport: true,
      },
    });

    const journey = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', ownerCred)
      .send({ title: `${marker} journey`, domain: '生活', content: '外键归属探针' })
      .expect(201);
    journeyId = journey.body.journey.id as string;

    const action = await request(server)
      .post(`/api/v1/journeys/${journeyId}/actions`)
      .set('x-goodnight-user-id', ownerCred)
      .send({ title: `${marker} action` })
      .expect(201);
    actionId = action.body.item.id as string;

    const memory = await request(server)
      .post('/api/v1/memory')
      .set('x-goodnight-user-id', ownerCred)
      .send({ journeyId, category: '有效做法', content: `${marker} memory`, days: 7 })
      .expect(201);
    memoryId = memory.body.item.id as string;
  });

  afterAll(async () => {
    const journeys = await prisma.lifeJourney.findMany({ where: { title: { startsWith: marker } }, select: { id: true } });
    const journeyIds = journeys.map((row) => row.id);
    await prisma.actionCommitment.deleteMany({ where: { journeyId: { in: journeyIds } } });
    await prisma.memoryItem.deleteMany({ where: { journeyId: { in: journeyIds } } });
    await prisma.recoverySnapshot.deleteMany({ where: { journeyId: { in: journeyIds } } });
    await prisma.journeyUpdate.deleteMany({ where: { journeyId: { in: journeyIds } } });
    await prisma.safetyEvent.deleteMany({ where: { journeyId: { in: journeyIds } } });
    await prisma.situationSnapshot.deleteMany({ where: { journeyId: { in: journeyIds } } });
    await prisma.lifeJourney.deleteMany({ where: { id: { in: journeyIds } } });
    await prisma?.$disconnect();
    await app.close();
  });

  /**
   * Ordered so the cases that move the fixture into a terminal state (graduation) come last: the
   * owner control for those really does complete the journey.
   */
  const cases: Array<{ label: string; method: 'get' | 'post' | 'patch' | 'delete'; path: () => string; body?: () => unknown }> = [
    { label: 'DELETE /memory/:id', method: 'delete', path: () => `/api/v1/memory/${memoryId}` },
    // `intent` is the field this route reads, and it validates the body before it resolves the
    // caller: an invalid body answers 400 for anyone, stranger included. The body therefore has to
    // be valid for this case to say anything about ownership.
    { label: 'PATCH /journeys/:id/intent', method: 'patch', path: () => `/api/v1/journeys/${journeyId}/intent`, body: () => ({ intent: 'JUST_LISTEN' }) },
    { label: 'POST /journeys/:id/snapshots', method: 'post', path: () => `/api/v1/journeys/${journeyId}/snapshots`, body: () => ({ summary: `${marker} snapshot` }) },
    { label: 'POST /journeys/:id/situation/reanalyze', method: 'post', path: () => `/api/v1/journeys/${journeyId}/situation/reanalyze`, body: () => ({}) },
    { label: 'POST /journeys/:id/safety/acknowledge', method: 'post', path: () => `/api/v1/journeys/${journeyId}/safety/acknowledge`, body: () => ({}) },
    { label: 'POST /journeys/:id/updates', method: 'post', path: () => `/api/v1/journeys/${journeyId}/updates`, body: () => ({ summary: `${marker} update` }) },
    { label: 'POST /journeys/:id/action-plan', method: 'post', path: () => `/api/v1/journeys/${journeyId}/action-plan`, body: () => ({}) },
    // Journey-scoped peer routes: their ownership runs through the same journey guard as the family
    // above, but they sit under /journeys/:id/ so a peer-prefix rule does not classify them.
    { label: 'POST /journeys/:id/peer-matches', method: 'post', path: () => `/api/v1/journeys/${journeyId}/peer-matches` },
    { label: 'GET /journeys/:id/peers', method: 'get', path: () => `/api/v1/journeys/${journeyId}/peers` },
    { label: 'POST /actions/:id/checkin', method: 'post', path: () => `/api/v1/actions/${actionId}/checkin`, body: () => ({ note: `${marker} checkin` }) },
    { label: 'POST /actions/:id/checkins', method: 'post', path: () => `/api/v1/actions/${actionId}/checkins`, body: () => ({ note: `${marker} checkins` }) },
    { label: 'POST /actions/:id/adaptive-plan', method: 'post', path: () => `/api/v1/actions/${actionId}/adaptive-plan`, body: () => ({}) },
    { label: 'POST /actions/:id/adapt', method: 'post', path: () => `/api/v1/actions/${actionId}/adapt`, body: () => ({}) },
    { label: 'POST /journeys/:id/graduation-consent', method: 'post', path: () => `/api/v1/journeys/${journeyId}/graduation-consent`, body: () => ({ decision: 'willing' }) },
    { label: 'POST /journeys/:id/graduate', method: 'post', path: () => `/api/v1/journeys/${journeyId}/graduate`, body: () => ({}) },
  ];

  for (const testCase of cases) {
    it(`${testCase.label} refuses a foreign id and still resolves for its owner`, async () => {
      const send = (cred: string) => {
        const req = request(server)[testCase.method](testCase.path()).set('x-goodnight-user-id', cred);
        return testCase.body ? req.send(testCase.body()) : req;
      };

      // Stranger first: a refusal must leave the fixture untouched for the owner control below.
      const strangerRes = await send(strangerCred);
      expect(
        [403, 404],
        `stranger got ${strangerRes.status} on ${testCase.label}: ${JSON.stringify(strangerRes.body).slice(0, 200)}`,
      ).toContain(strangerRes.status);

      const ownerRes = await send(ownerCred);
      expect(
        ownerRes.status,
        `owner got 404 on ${testCase.label}, so the control cannot tell a refusal from a misspelled route`,
      ).not.toBe(404);
    });
  }

  it('the stranger calls left the owner record intact', async () => {
    const journey = await prisma.lifeJourney.findUnique({ where: { id: journeyId }, select: { status: true, title: true } });
    expect(journey?.title).toBe(`${marker} journey`);
    const action = await prisma.actionCommitment.findUnique({ where: { id: actionId }, select: { title: true } });
    expect(action?.title).toBe(`${marker} action`);
    // The stranger's DELETE /memory/:id was refused, so the row is still there.
    const memory = await prisma.memoryItem.findUnique({ where: { id: memoryId }, select: { content: true } });
    expect(memory?.content).toBe(`${marker} memory`);
  });
});
