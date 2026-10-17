import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { auth, createApiTestApp, loginAdmin } from '../business/helpers';
import { createIdentity } from './helpers/identity';
import { FlowEvidence } from './helpers/evidence';

/**
 * F05 - one user shares an anonymised experience, another user is matched to it.
 *
 * The flow has a moderation gate in the middle that is easy to mistake for a formality: an experience
 * is written as `pending_review` and must not be suggestible, readable, or matchable until an
 * operator publishes it. The second half of the file exercises that gate from both directions -
 * the author can read their own draft, an unrelated user cannot read it at all.
 *
 * All three participants are real sessions from `POST /auth/anonymous`, so the identity checks are
 * about the product's own credential path rather than a fixture header.
 */
describe('F05 peer experience sharing between two users', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let evidence: FlowEvidence;
  let server: any;
  let adminToken: string;

  let ownerCredential: string;
  let requesterCredential: string;
  let strangerCredential: string;

  let ownerJourneyId: string;
  let requesterJourneyId: string;
  let experienceId: string;

  beforeAll(async () => {
    app = await createApiTestApp();
    server = app.getHttpServer();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    evidence = new FlowEvidence('F05');
    adminToken = await loginAdmin(server);

    ownerCredential = (await createIdentity(server, 'F05 owner')).credential;
    requesterCredential = (await createIdentity(server, 'F05 requester')).credential;
    strangerCredential = (await createIdentity(server, 'F05 stranger')).credential;

    for (const [label, credential] of [
      ['owner', ownerCredential],
      ['requester', requesterCredential],
      ['stranger', strangerCredential],
    ] as const) {
      const privacy = await request(server)
        .patch('/api/v1/me/privacy')
        .set('x-goodnight-user-id', credential)
        .send({ allowPeerMatching: true, allowAnonymousExperienceShare: true });
      if (privacy.status !== 200) throw new Error(`F05 setup: privacy for ${label} returned ${privacy.status}`);
    }

    const ownerJourney = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', ownerCredential)
      .send({ title: `F05 所有者旅程 ${Date.now()}`, domain: '关系', content: 'F05：一段已经走过的关系。', intensity: 5 });
    ownerJourneyId = ownerJourney.body?.journey?.id;

    const requesterJourney = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', requesterCredential)
      .send({ title: `F05 求助者旅程 ${Date.now()}`, domain: '关系', content: 'F05：想听听走过的人怎么说。', intensity: 7 });
    requesterJourneyId = requesterJourney.body?.journey?.id;
  });

  afterAll(async () => {
    evidence.flush();
    await prisma?.$disconnect();
    await app?.close();
  });

  it('publishes a consented experience, matches a second user, and keeps the draft private', async () => {
    // 1. Sharing requires explicit consent. Without it the write is refused.
    const withoutConsent = await request(server)
      .post('/api/v1/peer-experiences')
      .set('x-goodnight-user-id', ownerCredential)
      .send({
        journeyId: ownerJourneyId,
        title: 'F05：未同意的分享',
        domain: '关系',
        stage: 'graduated',
        content: '这段不应该被写入。',
      });
    const draftsAfterRefusal = await prisma.peerExperience.count({
      where: { journeyId: ownerJourneyId, title: 'F05：未同意的分享' },
    });
    evidence.check({
      step: 'sharing without consent is refused and writes nothing',
      layer: 'SECURITY_EVIDENCE',
      expected: { status: 400, rowsWritten: 0 },
      actual: { status: withoutConsent.status, rowsWritten: draftsAfterRefusal },
      request: { method: 'POST', path: '/api/v1/peer-experiences', body: { consented: 'omitted' } },
      response: { status: withoutConsent.status },
    });
    expect(withoutConsent.status).toBe(400);
    expect(draftsAfterRefusal).toBe(0);

    // 2. With consent it is written, and it is written as a draft awaiting review.
    const created = await request(server)
      .post('/api/v1/peer-experiences')
      .set('x-goodnight-user-id', ownerCredential)
      .send({
        journeyId: ownerJourneyId,
        title: 'F05：分开以后我学到的',
        domain: '关系',
        stage: 'graduated',
        content: 'F05：最难的那段时间，我先把生活节奏捡了回来。',
        tags: ['分开后想联系'],
        consented: true,
      });
    experienceId = created.body?.item?.id;
    const draftRow = experienceId
      ? await prisma.peerExperience.findUnique({ where: { id: experienceId } })
      : null;
    evidence.check({
      step: 'a consented experience is stored as pending_review',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 201, rowStatus: 'pending_review', rowOwnerMatchesCaller: true },
      actual: {
        status: created.status,
        rowStatus: draftRow?.status,
        rowOwnerMatchesCaller: Boolean(draftRow?.userId),
      },
      detail: { responseStatus: created.body?.item?.status },
      request: { method: 'POST', path: '/api/v1/peer-experiences', body: { consented: true } },
      response: { status: created.status, experienceId },
      sql: `select id, status, "journeyId" from "PeerExperience" where id = '${experienceId}'`,
    });
    expect(created.status).toBe(201);
    expect(draftRow?.status).toBe('pending_review');

    // 3. Before publication the draft is invisible to the matching engine.
    const beforePublish = await request(server)
      .post(`/api/v1/journeys/${requesterJourneyId}/peer-matches`)
      .set('x-goodnight-user-id', requesterCredential)
      .send({});
    const suggestedBefore = (beforePublish.body?.items ?? []).filter(
      (item: any) => item.peerExperienceId === experienceId,
    );
    evidence.check({
      step: 'an unpublished experience is never suggested',
      layer: 'SECURITY_EVIDENCE',
      expected: { status: 201, suggestionsForIt: 0 },
      actual: { status: beforePublish.status, suggestionsForIt: suggestedBefore.length },
      request: { method: 'POST', path: `/api/v1/journeys/${requesterJourneyId}/peer-matches` },
      response: { status: beforePublish.status },
    });
    expect(beforePublish.status).toBe(201);
    expect(suggestedBefore).toHaveLength(0);

    // 4. The author can read their own draft; an unrelated user gets 404, not a redacted copy.
    const ownerRead = await request(server)
      .get(`/api/v1/peer-experiences/${experienceId}`)
      .set('x-goodnight-user-id', ownerCredential);
    const strangerRead = await request(server)
      .get(`/api/v1/peer-experiences/${experienceId}`)
      .set('x-goodnight-user-id', strangerCredential);
    evidence.check({
      step: 'a draft is readable by its author and absent for everyone else',
      layer: 'SECURITY_EVIDENCE',
      expected: { ownerStatus: 200, strangerStatus: 404 },
      actual: { ownerStatus: ownerRead.status, strangerStatus: strangerRead.status },
      request: { method: 'GET', path: `/api/v1/peer-experiences/${experienceId}` },
      response: { ownerStatus: ownerRead.status, strangerStatus: strangerRead.status },
    });
    expect(ownerRead.status).toBe(200);
    expect(strangerRead.status).toBe(404);

    // 5. An operator publishes it.
    const review = await request(server)
      .patch(`/api/admin/v1/peer-experiences/${experienceId}/review`)
      .set('Authorization', auth(adminToken))
      .send({ status: 'published' });
    const publishedRow = await prisma.peerExperience.findUnique({ where: { id: experienceId } });
    evidence.check({
      step: 'an operator publishes the draft',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 200, rowStatus: 'published' },
      actual: { status: review.status, rowStatus: publishedRow?.status },
      request: { method: 'PATCH', path: `/api/admin/v1/peer-experiences/${experienceId}/review` },
      response: { status: review.status },
      sql: `select status from "PeerExperience" where id = '${experienceId}'`,
    });
    expect(review.status).toBe(200);
    expect(publishedRow?.status).toBe('published');

    // 6. Now the matching engine offers it, and the suggestion is persisted.
    const suggested = await request(server)
      .post(`/api/v1/journeys/${requesterJourneyId}/peer-matches`)
      .set('x-goodnight-user-id', requesterCredential)
      .send({});
    const match = (suggested.body?.items ?? []).find(
      (item: any) => item.peerExperienceId === experienceId,
    );
    const matchRow = match ? await prisma.peerMatch.findUnique({ where: { id: match.id } }) : null;
    evidence.check({
      step: 'a published experience is suggested and the suggestion is persisted',
      layer: 'API_EVIDENCE',
      expected: { status: 201, suggested: true, rowStatus: 'suggested' },
      actual: {
        status: suggested.status,
        suggested: Boolean(match),
        rowStatus: matchRow?.status,
      },
      detail: { score: matchRow?.score },
      request: { method: 'POST', path: `/api/v1/journeys/${requesterJourneyId}/peer-matches` },
      response: { status: suggested.status, matchId: match?.id },
      sql: `select id, status, score from "PeerMatch" where "peerExperienceId" = '${experienceId}'`,
    });
    expect(suggested.status).toBe(201);
    expect(match).toBeTruthy();
    expect(matchRow?.status).toBe('suggested');

    // 7. A match is what opens the detail; the stranger still cannot read it.
    const requesterRead = await request(server)
      .get(`/api/v1/peer-experiences/${experienceId}`)
      .set('x-goodnight-user-id', requesterCredential);
    const strangerReadAfter = await request(server)
      .get(`/api/v1/peer-experiences/${experienceId}`)
      .set('x-goodnight-user-id', strangerCredential);
    evidence.check({
      step: 'a matched user reads it, an unmatched user is refused',
      layer: 'SECURITY_EVIDENCE',
      expected: { matchedStatus: 200, unmatchedStatus: 403 },
      actual: { matchedStatus: requesterRead.status, unmatchedStatus: strangerReadAfter.status },
      request: { method: 'GET', path: `/api/v1/peer-experiences/${experienceId}` },
      response: { matchedStatus: requesterRead.status, unmatchedStatus: strangerReadAfter.status },
    });
    expect(requesterRead.status).toBe(200);
    expect(strangerReadAfter.status).toBe(403);

    // 8. Requesting the match records who asked and why.
    const requested = await request(server)
      .patch(`/api/v1/peer-matches/${match.id}`)
      .set('x-goodnight-user-id', requesterCredential)
      .send({ status: 'requested', requestReason: 'F05：想问问你当时怎么熬过来的。' });
    const requestedRow = await prisma.peerMatch.findUnique({ where: { id: match.id } });
    evidence.check({
      step: 'the requester can ask, and the reason is persisted',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 200, rowStatus: 'requested', reasonStored: true },
      actual: {
        status: requested.status,
        rowStatus: requestedRow?.status,
        reasonStored: Boolean(requestedRow?.requestReason),
      },
      request: { method: 'PATCH', path: `/api/v1/peer-matches/${match.id}`, body: { status: 'requested' } },
      response: { status: requested.status },
      sql: `select status, "requestReason" from "PeerMatch" where id = '${match.id}'`,
    });
    expect(requested.status).toBe(200);
    expect(requestedRow?.status).toBe('requested');
    expect(requestedRow?.requestReason).toContain('F05');

    // 9. The owner sees the request in their inbox; the stranger does not see it in theirs.
    const ownerInbox = await request(server)
      .get('/api/v1/peer-requests')
      .set('x-goodnight-user-id', ownerCredential);
    const strangerInbox = await request(server)
      .get('/api/v1/peer-requests')
      .set('x-goodnight-user-id', strangerCredential);
    evidence.check({
      step: 'the request reaches the owner inbox and no one else',
      layer: 'API_EVIDENCE',
      expected: { ownerSeesIt: true, strangerSeesIt: false },
      actual: {
        ownerSeesIt: (ownerInbox.body?.items ?? []).some((item: any) => item.id === match.id),
        strangerSeesIt: (strangerInbox.body?.items ?? []).some((item: any) => item.id === match.id),
      },
      request: { method: 'GET', path: '/api/v1/peer-requests' },
      response: { ownerStatus: ownerInbox.status, strangerStatus: strangerInbox.status },
    });
    expect((ownerInbox.body?.items ?? []).some((item: any) => item.id === match.id)).toBe(true);
    expect((strangerInbox.body?.items ?? []).some((item: any) => item.id === match.id)).toBe(false);
  });
});
