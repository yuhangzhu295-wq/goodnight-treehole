import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { auth, createApiTestApp, loginAdmin } from '../business/helpers';
import { createIdentity } from './helpers/identity';
import { FlowEvidence } from './helpers/evidence';
import { closeAppBounded } from './helpers/teardown';

/**
 * F06 - the two-sided consent gate and the 72-hour anonymous conversation.
 *
 * The state machine here is the point: one consent is recorded and nothing else happens; the
 * conversation only exists after the second consent, and the first consent must not fabricate one.
 * That is checked against the row, not against the response shape alone. The file then sends in
 * both directions, closes, and proves that a closed conversation refuses further messages and that
 * both participants were notified.
 *
 * A second Nest application is started up front and used for the final read, so "it survived a
 * restart" is measured against a process that never held the in-memory copy.
 */
describe('F06 peer consent and conversation', () => {
  let app: INestApplication;
  let secondApp: INestApplication;
  let prisma: PrismaClient;
  let evidence: FlowEvidence;
  let server: any;
  let secondServer: any;
  let adminToken: string;

  let ownerCredential: string;
  let requesterCredential: string;
  let strangerCredential: string;
  let ownerUserId: string;
  let requesterUserId: string;

  let ownerJourneyId: string;
  let requesterJourneyId: string;
  let experienceId: string;
  let matchId: string;
  let conversationId: string;

  beforeAll(async () => {
    app = await createApiTestApp();
    secondApp = await createApiTestApp();
    server = app.getHttpServer();
    secondServer = secondApp.getHttpServer();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    evidence = new FlowEvidence('F06');
    adminToken = await loginAdmin(server);

    const owner = await createIdentity(server, 'F06 owner');
    ownerCredential = owner.credential;
    ownerUserId = owner.userId;
    const requester = await createIdentity(server, 'F06 requester');
    requesterCredential = requester.credential;
    requesterUserId = requester.userId;
    strangerCredential = (await createIdentity(server, 'F06 stranger')).credential;

    for (const credential of [ownerCredential, requesterCredential, strangerCredential]) {
      const privacy = await request(server)
        .patch('/api/v1/me/privacy')
        .set('x-goodnight-user-id', credential)
        .send({ allowPeerMatching: true, allowAnonymousExperienceShare: true });
      if (privacy.status !== 200) throw new Error(`F06 setup: privacy returned ${privacy.status}`);
    }

    const ownerJourney = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', ownerCredential)
      .send({ title: `F06 所有者旅程 ${Date.now()}`, domain: '关系', content: 'F06：已经走过的一段。', intensity: 5 });
    ownerJourneyId = ownerJourney.body?.journey?.id;

    const requesterJourney = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', requesterCredential)
      .send({ title: `F06 求助者旅程 ${Date.now()}`, domain: '关系', content: 'F06：想找走过的人聊聊。', intensity: 7 });
    requesterJourneyId = requesterJourney.body?.journey?.id;

    const experience = await request(server)
      .post('/api/v1/peer-experiences')
      .set('x-goodnight-user-id', ownerCredential)
      .send({
        journeyId: ownerJourneyId,
        title: 'F06：后来的我怎么看那段',
        domain: '关系',
        stage: 'graduated',
        content: 'F06：先把睡眠和吃饭找回来，再谈别的。',
        tags: ['分开后想联系'],
        consented: true,
      });
    experienceId = experience.body?.item?.id;
    const published = await request(server)
      .patch(`/api/admin/v1/peer-experiences/${experienceId}/review`)
      .set('Authorization', auth(adminToken))
      .send({ status: 'published' });
    if (published.status !== 200) throw new Error(`F06 setup: publish returned ${published.status}`);

    const suggested = await request(server)
      .post(`/api/v1/journeys/${requesterJourneyId}/peer-matches`)
      .set('x-goodnight-user-id', requesterCredential)
      .send({});
    const match = (suggested.body?.items ?? []).find((item: any) => item.peerExperienceId === experienceId);
    if (!match) throw new Error('F06 setup: the published experience was not suggested');
    matchId = match.id;

    await request(server)
      .patch(`/api/v1/peer-matches/${matchId}`)
      .set('x-goodnight-user-id', requesterCredential)
      .send({ status: 'requested', requestReason: 'F06：想问问当时怎么过来的。' });
    const connected = await request(server)
      .post(`/api/v1/peer-matches/${matchId}/respond`)
      .set('x-goodnight-user-id', ownerCredential)
      .send({ status: 'connected' });
    if (connected.status !== 201) throw new Error(`F06 setup: respond returned ${connected.status}`);
  });

  afterAll(async () => {
    evidence.flush();
    await prisma?.$disconnect();
    await closeAppBounded(secondApp, 'secondApp');
    await closeAppBounded(app, 'app');
  });

  it('activates only after both consents, carries both sides of the conversation, and closes once', async () => {
    // 1. First consent records only the caller and creates no conversation.
    const firstConsent = await request(server)
      .post(`/api/v1/peer-matches/${matchId}/consent`)
      .set('x-goodnight-user-id', ownerCredential)
      .send({});
    const matchAfterFirst = await prisma.peerMatch.findUnique({ where: { id: matchId } });
    const conversationAfterFirst = await prisma.peerConversation.findUnique({ where: { matchId } });
    evidence.check({
      step: 'the first consent is recorded alone and creates no conversation',
      layer: 'DATABASE_EVIDENCE',
      expected: {
        status: 201,
        responseConversation: null,
        ownerConsentAt: 'set',
        requesterConsentAt: 'unset',
        conversationRows: 0,
      },
      actual: {
        status: firstConsent.status,
        responseConversation: firstConsent.body?.conversation ?? null,
        ownerConsentAt: matchAfterFirst?.ownerConsentAt ? 'set' : 'unset',
        requesterConsentAt: matchAfterFirst?.requesterConsentAt ? 'set' : 'unset',
        conversationRows: conversationAfterFirst ? 1 : 0,
      },
      request: { method: 'POST', path: `/api/v1/peer-matches/${matchId}/consent`, identity: 'experience owner' },
      response: { status: firstConsent.status, body: firstConsent.body },
      sql: `select "ownerConsentAt", "requesterConsentAt" from "PeerMatch" where id = '${matchId}'; select id from "PeerConversation" where "matchId" = '${matchId}'`,
    });
    expect(firstConsent.status).toBe(201);
    expect(firstConsent.body?.conversation ?? null).toBeNull();
    expect(matchAfterFirst?.ownerConsentAt).toBeTruthy();
    expect(matchAfterFirst?.requesterConsentAt).toBeNull();
    expect(conversationAfterFirst).toBeNull();

    // 2. Second consent activates exactly one conversation with a 72-hour deadline.
    const secondConsent = await request(server)
      .post(`/api/v1/peer-matches/${matchId}/consent`)
      .set('x-goodnight-user-id', requesterCredential)
      .send({});
    conversationId = secondConsent.body?.conversation?.id;
    const conversationRows = await prisma.peerConversation.findMany({ where: { matchId } });
    const conversation = conversationRows[0];
    const matchAfterSecond = await prisma.peerMatch.findUnique({ where: { id: matchId } });
    const windowHours = conversation
      ? Math.round((conversation.expiresAt.getTime() - conversation.startsAt.getTime()) / 3_600_000)
      : null;
    evidence.check({
      step: 'the second consent activates exactly one conversation for 72 hours',
      layer: 'DATABASE_EVIDENCE',
      expected: {
        status: 201,
        conversationRows: 1,
        status_in_db: 'active',
        bothConsentsRecorded: true,
        windowHours: 72,
      },
      actual: {
        status: secondConsent.status,
        conversationRows: conversationRows.length,
        status_in_db: conversation?.status,
        bothConsentsRecorded: Boolean(matchAfterSecond?.ownerConsentAt && matchAfterSecond?.requesterConsentAt),
        windowHours,
      },
      request: { method: 'POST', path: `/api/v1/peer-matches/${matchId}/consent`, identity: 'requester' },
      response: { status: secondConsent.status, conversationId },
      sql: `select id, status, "startsAt", "expiresAt" from "PeerConversation" where "matchId" = '${matchId}'`,
    });
    expect(secondConsent.status).toBe(201);
    expect(conversationRows).toHaveLength(1);
    expect(conversation?.status).toBe('active');
    expect(windowHours).toBe(72);
    expect(matchAfterSecond?.ownerConsentAt).toBeTruthy();
    expect(matchAfterSecond?.requesterConsentAt).toBeTruthy();

    // 3. Both sides can speak, and each message is stored against its sender.
    const fromOwner = await request(server)
      .post(`/api/v1/peer-conversations/${matchId}/messages`)
      .set('x-goodnight-user-id', ownerCredential)
      .send({ content: 'F06：我那时候是先把作息调回来。' });
    const fromRequester = await request(server)
      .post(`/api/v1/peer-conversations/${matchId}/messages`)
      .set('x-goodnight-user-id', requesterCredential)
      .send({ content: 'F06：谢谢，我也想从作息开始。' });
    const messageRows = await prisma.peerMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
    evidence.check({
      step: 'both participants can send, and messages carry the right sender',
      layer: 'DATABASE_EVIDENCE',
      expected: {
        ownerStatus: 201,
        requesterStatus: 201,
        messageRows: 2,
        senders: [ownerUserId, requesterUserId],
      },
      actual: {
        ownerStatus: fromOwner.status,
        requesterStatus: fromRequester.status,
        messageRows: messageRows.length,
        senders: messageRows.map((row) => row.senderUserId),
      },
      request: { method: 'POST', path: `/api/v1/peer-conversations/${matchId}/messages` },
      response: { ownerStatus: fromOwner.status, requesterStatus: fromRequester.status },
      sql: `select "senderUserId", content from "PeerMessage" where "conversationId" = '${conversationId}' order by "createdAt"`,
    });
    expect(fromOwner.status).toBe(201);
    expect(fromRequester.status).toBe(201);
    expect(messageRows.map((row) => row.senderUserId)).toEqual([ownerUserId, requesterUserId]);

    // 3b. The same two messages are served back through the API, not only readable in the table.
    const served = await request(server)
      .get('/api/v1/peer-conversations')
      .set('x-goodnight-user-id', ownerCredential);
    const servedConversation = (served.body?.items ?? []).find((item: any) => item.matchId === matchId);
    evidence.check({
      step: 'the API serves the conversation with both messages',
      layer: 'API_EVIDENCE',
      expected: { status: 200, found: true, messageCount: 2, contentsPresent: true },
      actual: {
        status: served.status,
        found: Boolean(servedConversation),
        messageCount: (servedConversation?.messages ?? []).length,
        contentsPresent: ['F06：我那时候是先把作息调回来。', 'F06：谢谢，我也想从作息开始。'].every((text) =>
          (servedConversation?.messages ?? []).some((message: any) => message.content === text),
        ),
      },
      request: { method: 'GET', path: '/api/v1/peer-conversations', identity: 'owner' },
      response: { status: served.status, conversationId: servedConversation?.id },
    });
    expect(served.status).toBe(200);
    expect(servedConversation).toBeTruthy();
    expect((servedConversation?.messages ?? []).length).toBe(2);

    // 4. A non-participant can neither speak nor close.
    const strangerSend = await request(server)
      .post(`/api/v1/peer-conversations/${matchId}/messages`)
      .set('x-goodnight-user-id', strangerCredential)
      .send({ content: 'F06：我不在这段对话里。' });
    const strangerClose = await request(server)
      .post(`/api/v1/peer-conversations/${matchId}/close`)
      .set('x-goodnight-user-id', strangerCredential)
      .send({});
    const conversationAfterStranger = await prisma.peerConversation.findUnique({ where: { matchId } });
    evidence.check({
      step: 'a non-participant is refused and changes nothing',
      layer: 'SECURITY_EVIDENCE',
      expected: { sendStatus: 404, closeStatus: 404, conversationStatus: 'active' },
      actual: {
        sendStatus: strangerSend.status,
        closeStatus: strangerClose.status,
        conversationStatus: conversationAfterStranger?.status,
      },
      request: { method: 'POST', path: `/api/v1/peer-conversations/${matchId}/messages`, identity: 'unrelated user' },
      response: { sendStatus: strangerSend.status, closeStatus: strangerClose.status },
    });
    expect(strangerSend.status).toBe(404);
    expect(strangerClose.status).toBe(404);
    expect(conversationAfterStranger?.status).toBe('active');

    // 5. Closing is a one-way transition and both participants are notified.
    const closed = await request(server)
      .post(`/api/v1/peer-conversations/${matchId}/close`)
      .set('x-goodnight-user-id', ownerCredential)
      .send({});
    const closedRow = await prisma.peerConversation.findUnique({ where: { matchId } });
    const notifications = await prisma.userNotification.findMany({
      where: { id: { in: [`notification_peer_closed_${conversationId}_${ownerUserId}`, `notification_peer_closed_${conversationId}_${requesterUserId}`] } },
    });
    evidence.check({
      step: 'closing is recorded and both participants are notified',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 201, rowStatus: 'closed', closedReason: 'closed', notifications: 2 },
      actual: {
        status: closed.status,
        rowStatus: closedRow?.status,
        closedReason: closedRow?.closedReason,
        notifications: notifications.length,
      },
      request: { method: 'POST', path: `/api/v1/peer-conversations/${matchId}/close` },
      response: { status: closed.status },
      sql: `select status, "closedReason" from "PeerConversation" where "matchId" = '${matchId}'; select id from "UserNotification" where id like 'notification_peer_closed_%'`,
    });
    expect(closed.status).toBe(201);
    expect(closedRow?.status).toBe('closed');
    expect(closedRow?.closedReason).toBe('closed');
    expect(notifications).toHaveLength(2);

    // 6. A closed conversation refuses further messages.
    const afterClose = await request(server)
      .post(`/api/v1/peer-conversations/${matchId}/messages`)
      .set('x-goodnight-user-id', requesterCredential)
      .send({ content: 'F06：关掉之后还能说吗？' });
    const messageRowsAfterClose = await prisma.peerMessage.count({ where: { conversationId } });
    evidence.check({
      step: 'a closed conversation refuses new messages and stores none',
      layer: 'SECURITY_EVIDENCE',
      expected: { status: 400, messageRows: 2 },
      actual: { status: afterClose.status, messageRows: messageRowsAfterClose },
      request: { method: 'POST', path: `/api/v1/peer-conversations/${matchId}/messages` },
      response: { status: afterClose.status, body: afterClose.body },
    });
    expect(afterClose.status).toBe(400);
    expect(messageRowsAfterClose).toBe(2);

    // 7. A second process reads the same closed conversation and both messages back.
    const afterRestart = await request(secondServer)
      .get('/api/v1/peer-conversations')
      .set('x-goodnight-user-id', requesterCredential);
    const restored = (afterRestart.body?.items ?? []).find((item: any) => item.matchId === matchId);
    evidence.check({
      step: 'a second process sees the closed conversation and its messages',
      layer: 'PERSISTENCE_EVIDENCE',
      expected: { status: 200, found: true, conversationStatus: 'closed', messages: 2 },
      actual: {
        status: afterRestart.status,
        found: Boolean(restored),
        conversationStatus: restored?.status,
        messages: (restored?.messages ?? []).length,
      },
      request: { method: 'GET', path: '/api/v1/peer-conversations', identity: 'requester, fresh process' },
      response: { status: afterRestart.status, conversationId: restored?.id },
    });
    expect(afterRestart.status).toBe(200);
    expect(restored?.status).toBe('closed');
    expect(restored?.messages ?? []).toHaveLength(2);
  });
});
