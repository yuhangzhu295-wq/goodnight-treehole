import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { auth, createApiTestApp, loginAdmin } from '../business/helpers';
import { createIdentity } from './helpers/identity';
import { FlowEvidence } from './helpers/evidence';
import { closeAppBounded } from './helpers/teardown';

/**
 * F07 - withdrawing a privacy consent removes what that consent controlled, and nothing else.
 *
 * Two failure modes are worth a flow of their own. The first is a switch that only changes a field
 * and leaves the read path open: the setting says "off" while the data keeps flowing. The second is
 * the opposite - a revocation wired too widely, so turning off peer matching also hides the user's
 * own journey, or turning off recovery data removes the safety event an operator needs to act on.
 *
 * Both are asserted here against the row and against a second process, because a per-process cache
 * is exactly how a revocation can look applied while another instance still serves the old answer.
 */
describe('F07 privacy revocation', () => {
  let app: INestApplication;
  let secondApp: INestApplication;
  let prisma: PrismaClient;
  let evidence: FlowEvidence;
  let server: any;
  let secondServer: any;
  let adminToken: string;

  let credential: string;
  let userId: string;
  let journeyId: string;
  let experienceId: string;
  let safetyEventId: string;

  beforeAll(async () => {
    app = await createApiTestApp();
    secondApp = await createApiTestApp();
    server = app.getHttpServer();
    secondServer = secondApp.getHttpServer();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    evidence = new FlowEvidence('F07');
    adminToken = await loginAdmin(server);

    const identity = await createIdentity(server, 'F07 owner');
    credential = identity.credential;
    userId = identity.userId;
  });

  afterAll(async () => {
    evidence.flush();
    await prisma?.$disconnect();
    await closeAppBounded(secondApp, 'secondApp');
    await closeAppBounded(app, 'app');
  });

  const privacyRow = () => prisma.privacySetting.findUnique({ where: { userId } });

  it('turns access off without turning the data into someone else’s loss', async () => {
    // 1. A fresh identity starts with the sharing switches off. There is no row yet: the defaults
    //    are the product's, and the first write is what creates the row. Recording both facts keeps
    //    a later "defaults changed" from hiding behind a row that always exists.
    const initial = await request(server).get('/api/v1/me/privacy').set('x-goodnight-user-id', credential);
    const initialRow = await privacyRow();
    evidence.check({
      step: 'a new identity starts with peer sharing switched off',
      layer: 'DATABASE_EVIDENCE',
      expected: {
        status: 200,
        rows: 0,
        allowPeerMatching: false,
        allowAnonymousExperienceShare: false,
        allowRecoveryData: false,
      },
      actual: {
        status: initial.status,
        rows: initialRow ? 1 : 0,
        allowPeerMatching: initial.body?.item?.allowPeerMatching,
        allowAnonymousExperienceShare: initial.body?.item?.allowAnonymousExperienceShare,
        allowRecoveryData: initial.body?.item?.allowRecoveryData,
      },
      response: { status: initial.status, body: initial.body },
      sql: `select count(*) from "PrivacySetting" where "userId" = '${userId}'`,
    });
    expect(initial.status).toBe(200);
    expect(initialRow).toBeNull();
    expect(initial.body?.item?.allowPeerMatching).toBe(false);
    expect(initial.body?.item?.allowAnonymousExperienceShare).toBe(false);
    expect(initial.body?.item?.allowRecoveryData).toBe(false);

    // 2. Granting consent is written to the table.
    const granted = await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', credential)
      .send({ allowPeerMatching: true, allowAnonymousExperienceShare: true, allowRecoveryData: true });
    const grantedRow = await privacyRow();
    evidence.check({
      step: 'granting consent is persisted',
      layer: 'DATABASE_EVIDENCE',
      expected: {
        status: 200,
        allowPeerMatching: true,
        allowAnonymousExperienceShare: true,
        allowRecoveryData: true,
      },
      actual: {
        status: granted.status,
        allowPeerMatching: grantedRow?.allowPeerMatching,
        allowAnonymousExperienceShare: grantedRow?.allowAnonymousExperienceShare,
        allowRecoveryData: grantedRow?.allowRecoveryData,
      },
      request: { method: 'PATCH', path: '/api/v1/me/privacy' },
      response: { status: granted.status },
    });
    expect(granted.status).toBe(200);
    expect(grantedRow?.allowPeerMatching).toBe(true);

    // 3. With consent, the user can create a journey and share an experience.
    const journey = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', credential)
      .send({ title: `F07 旅程 ${Date.now()}`, domain: '关系', content: 'F07：撤回前的记录。', intensity: 4 });
    journeyId = journey.body?.journey?.id;
    const experience = await request(server)
      .post('/api/v1/peer-experiences')
      .set('x-goodnight-user-id', credential)
      .send({
        journeyId,
        title: 'F07：愿意匿名分享的一段',
        domain: '关系',
        stage: 'recovering',
        content: 'F07：这段在撤回之后仍然属于我。',
        consented: true,
      });
    experienceId = experience.body?.item?.id;
    const published = await request(server)
      .patch(`/api/admin/v1/peer-experiences/${experienceId}/review`)
      .set('Authorization', auth(adminToken))
      .send({ status: 'published' });
    evidence.check({
      step: 'consented sharing produces a journey and a published experience',
      layer: 'API_EVIDENCE',
      expected: { journeyStatus: 201, experienceStatus: 201, publishStatus: 200, hasExperienceId: true },
      actual: {
        journeyStatus: journey.status,
        experienceStatus: experience.status,
        publishStatus: published.status,
        hasExperienceId: Boolean(experienceId),
      },
      response: { journeyId, experienceId },
    });
    expect(journey.status).toBe(201);
    expect(experience.status).toBe(201);
    expect(published.status).toBe(200);

    // 4. Revoking the share consent stops new shares at the gate.
    const revokeShare = await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', credential)
      .send({ allowAnonymousExperienceShare: false });
    const afterRevokeShare = await privacyRow();
    const newShare = await request(server)
      .post('/api/v1/peer-experiences')
      .set('x-goodnight-user-id', credential)
      .send({
        journeyId,
        title: 'F07：撤回后不应写入',
        domain: '关系',
        stage: 'recovering',
        content: 'F07：这段不应该存在。',
        consented: true,
      });
    const sharesAfterRevoke = await prisma.peerExperience.count({
      where: { userId, title: 'F07：撤回后不应写入' },
    });
    evidence.check({
      step: 'revoking the share consent refuses new shares and writes nothing',
      layer: 'SECURITY_EVIDENCE',
      expected: { revokeStatus: 200, rowValue: false, createStatus: 403, rowsWritten: 0 },
      actual: {
        revokeStatus: revokeShare.status,
        rowValue: afterRevokeShare?.allowAnonymousExperienceShare,
        createStatus: newShare.status,
        rowsWritten: sharesAfterRevoke,
      },
      request: { method: 'POST', path: '/api/v1/peer-experiences', identity: 'consent withdrawn' },
      response: { status: newShare.status, body: newShare.body },
    });
    expect(revokeShare.status).toBe(200);
    expect(afterRevokeShare?.allowAnonymousExperienceShare).toBe(false);
    expect(newShare.status).toBe(403);
    expect(sharesAfterRevoke).toBe(0);

    // 5. Revoking peer matching closes the network and the matching engine. The author's own detail
    //    read stays open on purpose: the switch governs who may reach the network, not whether a
    //    person can still read what they wrote. (The published copy also stays published - documented
    //    in docs/product-audit/pages/admin/peer-experiences.md.)
    const revokeMatching = await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', credential)
      .send({ allowPeerMatching: false });
    const network = await request(server).get('/api/v1/peers').set('x-goodnight-user-id', credential);
    const suggestion = await request(server)
      .post(`/api/v1/journeys/${journeyId}/peer-matches`)
      .set('x-goodnight-user-id', credential)
      .send({});
    const ownDetail = await request(server)
      .get(`/api/v1/peer-experiences/${experienceId}`)
      .set('x-goodnight-user-id', credential);
    evidence.check({
      step: 'revoking peer matching closes the network and matching, and keeps the author’s own read',
      layer: 'SECURITY_EVIDENCE',
      expected: {
        revokeStatus: 200,
        privacyEnabled: false,
        experiences: 0,
        suggestionStatus: 403,
        authorDetailStatus: 200,
      },
      actual: {
        revokeStatus: revokeMatching.status,
        privacyEnabled: network.body?.item?.privacyEnabled,
        experiences: (network.body?.item?.experiences ?? []).length,
        suggestionStatus: suggestion.status,
        authorDetailStatus: ownDetail.status,
      },
      request: { method: 'GET', path: '/api/v1/peers', identity: 'consent withdrawn' },
      response: { networkStatus: network.status, suggestionStatus: suggestion.status, ownDetailStatus: ownDetail.status },
    });
    expect(revokeMatching.status).toBe(200);
    expect(network.body?.item?.privacyEnabled).toBe(false);
    expect((network.body?.item?.experiences ?? []).length).toBe(0);
    expect(suggestion.status).toBe(403);
    expect(ownDetail.status).toBe(200);

    // 6. A viewer's own revocation is what closes the detail read for that viewer. This is the
    //    direction the owner-side switch cannot test: access is decided by the reader's consent.
    const viewer = await createIdentity(server, 'F07 viewer');
    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', viewer.credential)
      .send({ allowPeerMatching: true });
    const viewerJourney = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', viewer.credential)
      .send({ title: `F07 观察者旅程 ${Date.now()}`, domain: '关系', content: 'F07：想看看这段经历。', intensity: 6 });
    const viewerMatches = await request(server)
      .post(`/api/v1/journeys/${viewerJourney.body?.journey?.id}/peer-matches`)
      .set('x-goodnight-user-id', viewer.credential)
      .send({});
    const viewerMatch = (viewerMatches.body?.items ?? []).find(
      (item: any) => item.peerExperienceId === experienceId,
    );
    const viewerBefore = await request(server)
      .get(`/api/v1/peer-experiences/${experienceId}`)
      .set('x-goodnight-user-id', viewer.credential);
    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', viewer.credential)
      .send({ allowPeerMatching: false });
    const viewerAfter = await request(server)
      .get(`/api/v1/peer-experiences/${experienceId}`)
      .set('x-goodnight-user-id', viewer.credential);
    evidence.check({
      step: 'a matched viewer loses the detail read when they revoke their own consent',
      layer: 'SECURITY_EVIDENCE',
      expected: { matched: true, beforeStatus: 200, afterStatus: 403 },
      actual: {
        matched: Boolean(viewerMatch),
        beforeStatus: viewerBefore.status,
        afterStatus: viewerAfter.status,
      },
      request: { method: 'GET', path: `/api/v1/peer-experiences/${experienceId}`, identity: 'viewer, consent withdrawn' },
      response: { beforeStatus: viewerBefore.status, afterStatus: viewerAfter.status },
    });
    expect(viewerMatch).toBeTruthy();
    expect(viewerBefore.status).toBe(200);
    expect(viewerAfter.status).toBe(403);

    // 7. A second process reads the same revoked state. A per-process cache cannot answer differently.
    const secondRead = await request(secondServer).get('/api/v1/me/privacy').set('x-goodnight-user-id', credential);
    evidence.check({
      step: 'a second process serves the revoked state',
      layer: 'PERSISTENCE_EVIDENCE',
      expected: { status: 200, allowPeerMatching: false, allowAnonymousExperienceShare: false },
      actual: {
        status: secondRead.status,
        allowPeerMatching: secondRead.body?.item?.allowPeerMatching,
        allowAnonymousExperienceShare: secondRead.body?.item?.allowAnonymousExperienceShare,
      },
      request: { method: 'GET', path: '/api/v1/me/privacy', identity: 'same user, fresh process' },
      response: { status: secondRead.status },
    });
    expect(secondRead.status).toBe(200);
    expect(secondRead.body?.item?.allowPeerMatching).toBe(false);
    expect(secondRead.body?.item?.allowAnonymousExperienceShare).toBe(false);

    // 8. Revocation is not deletion: the journey and the experience are still there, still the user's.
    const ownJourney = await request(server)
      .get(`/api/v1/journeys/${journeyId}`)
      .set('x-goodnight-user-id', credential);
    const experienceRow = await prisma.peerExperience.findUnique({ where: { id: experienceId } });
    evidence.check({
      step: 'revocation hides access without deleting the user’s own records',
      layer: 'DATABASE_EVIDENCE',
      expected: { journeyStatus: 200, experienceStillOwned: true, experienceRowStatus: 'published' },
      actual: {
        journeyStatus: ownJourney.status,
        experienceStillOwned: experienceRow?.userId === userId,
        experienceRowStatus: experienceRow?.status,
      },
      sql: `select id, "userId", status from "PeerExperience" where id = '${experienceId}'`,
    });
    expect(ownJourney.status).toBe(200);
    expect(experienceRow?.userId).toBe(userId);
    expect(experienceRow?.status).toBe('published');

    // 9. The recovery consent behaves the same way, and safety support survives it.
    const recoveryOn = await request(server).get('/api/v1/me/recovery').set('x-goodnight-user-id', credential);
    safetyEventId = `safety_f07_${Date.now()}`;
    await prisma.safetyEvent.create({
      data: {
        id: safetyEventId,
        userId,
        level: 'high',
        source: 'journey_create',
        action: 'real_world_support_prompt',
        status: 'open',
        createdAt: new Date(),
      },
    });
    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', credential)
      .send({ allowRecoveryData: false });
    const recoveryOff = await request(server).get('/api/v1/me/recovery').set('x-goodnight-user-id', credential);
    const adminSafety = await request(server)
      .get(`/api/admin/v1/safety/events/${safetyEventId}`)
      .set('Authorization', auth(adminToken));
    evidence.check({
      step: 'revoking recovery data closes that read and keeps the safety path open',
      layer: 'SECURITY_EVIDENCE',
      expected: {
        beforeStatus: 200,
        afterStatus: 403,
        messageMentionsRecovery: true,
        adminSafetyStatus: 200,
      },
      actual: {
        beforeStatus: recoveryOn.status,
        afterStatus: recoveryOff.status,
        messageMentionsRecovery: String(recoveryOff.body?.message ?? '').includes('恢复记录'),
        adminSafetyStatus: adminSafety.status,
      },
      request: { method: 'GET', path: '/api/v1/me/recovery', identity: 'recovery consent withdrawn' },
      response: { beforeStatus: recoveryOn.status, afterStatus: recoveryOff.status, adminSafetyStatus: adminSafety.status },
    });
    expect(recoveryOn.status).toBe(200);
    expect(recoveryOff.status).toBe(403);
    expect(adminSafety.status).toBe(200);
  });
});
