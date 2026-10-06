import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { auth, createApiTestApp, loginAdmin } from './helpers';
import { createTwoInstanceHarness, type MultiInstanceContext } from './two-instance-harness';
import { saveRelationalRuntimeState } from '../../apps/api/src/relational-runtime.mapper';

class StrictBarrier {
  private parties = new Set<string>();
  private arrived = new Set<string>();
  private resolvers = new Map<string, () => void>();

  constructor(names: string[]) {
    for (const name of names) this.parties.add(name);
  }

  async enter(name: string, timeoutMs = 4000): Promise<void> {
    if (!this.parties.has(name)) throw new Error(`Unknown barrier party: ${name}`);
    this.arrived.add(name);
    if (this.arrived.size === this.parties.size) {
      for (const resolve of this.resolvers.values()) {
        resolve();
      }
      this.resolvers.clear();
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.resolvers.delete(name);
        reject(
          new Error(
            `StrictBarrier timeout: "${name}" arrived and waited ${timeoutMs}ms, but expected parties [${[...this.parties].join(', ')}]; arrived: [${[...this.arrived].join(', ')}]`,
          ),
        );
      }, timeoutMs);
      this.resolvers.set(name, () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  assertAllArrived(): void {
    for (const name of this.parties) {
      expect(this.arrived.has(name)).toBe(true);
    }
  }
}

describe('Batch 2 Peer Persistence: Bilateral Consent, Races & Multi-Instance', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let adminToken: string;
  const owner = 'user_guest';
  const requester = 'user_demo';

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    const server = app.getHttpServer();
    adminToken = await loginAdmin(server);

    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', requester)
      .send({ allowPeerMatching: true, allowAnonymousExperienceShare: true })
      .expect(200);
    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', owner)
      .send({ allowPeerMatching: true, allowAnonymousExperienceShare: true })
      .expect(200);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  async function createFixtureMatch(titlePrefix = '经历') {
    const server = app.getHttpServer();
    const ownerJourney = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', owner)
      .send({ title: `${titlePrefix}所有者旅程`, domain: '关系', content: `内容 ${Date.now()}_${Math.random()}`, intensity: 5 })
      .expect(201);
    const expRes = await request(server)
      .post('/api/v1/peer-experiences')
      .set('x-goodnight-user-id', owner)
      .send({
        journeyId: ownerJourney.body.journey.id,
        title: `${titlePrefix}经历分享`,
        domain: '关系',
        stage: 'graduated',
        content: '我整理了后来的经过。',
        tags: ['分开后想联系'],
        consented: true,
      })
      .expect(201);
    await request(server)
      .patch(`/api/admin/v1/peer-experiences/${expRes.body.item.id}/review`)
      .set('Authorization', auth(adminToken))
      .send({ status: 'published' })
      .expect(200);

    const requesterJourney = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', requester)
      .send({ title: `${titlePrefix}请求者旅程`, domain: '关系', content: `求助内容 ${Date.now()}_${Math.random()}`, intensity: 7 })
      .expect(201);
    const suggested = await request(server)
      .post(`/api/v1/journeys/${requesterJourney.body.journey.id}/peer-matches`)
      .set('x-goodnight-user-id', requester)
      .send({})
      .expect(201);
    const match = suggested.body.items.find((item: { peerExperienceId: string }) => item.peerExperienceId === expRes.body.item.id);
    return { match, expId: expRes.body.item.id, ownerJourney, requesterJourney };
  }

  describe('1. Bilateral Consent State Machine (§0.1, §0.4/A3, A4, A6)', () => {
    it('1.1 Owner-first activation: owner consents first (pending, no conversation row) -> requester consents second -> exactly one active conversation created', async () => {
      const server = app.getHttpServer();
      const { match } = await createFixtureMatch('OwnerFirst');

      // Request match
      await request(server)
        .patch(`/api/v1/peer-matches/${match.id}`)
        .set('x-goodnight-user-id', requester)
        .send({ status: 'requested', requestReason: '想聊聊走出来的感受。' })
        .expect(200);

      // Owner responds connected
      await request(server)
        .post(`/api/v1/peer-matches/${match.id}/respond`)
        .set('x-goodnight-user-id', owner)
        .send({ status: 'connected' })
        .expect(201);

      // Step A: Owner consents first
      const ownerConsentRes = await request(server)
        .post(`/api/v1/peer-matches/${match.id}/consent`)
        .set('x-goodnight-user-id', owner)
        .send({})
        .expect(201);

      // Must be pending: conversation is null, no active conversation fabricated
      expect(ownerConsentRes.body.conversation).toBeNull();

      // Independent Prisma client check: owner timestamp written, requester timestamp null, NO conversation row!
      const dbMatchAfterFirst = await prisma.peerMatch.findUnique({ where: { id: match.id } });
      expect(dbMatchAfterFirst?.ownerConsentAt).not.toBeNull();
      expect(dbMatchAfterFirst?.requesterConsentAt).toBeNull();
      const dbConvAfterFirst = await prisma.peerConversation.findUnique({ where: { matchId: match.id } });
      expect(dbConvAfterFirst).toBeNull();

      // Step B: Requester consents second
      const requesterConsentRes = await request(server)
        .post(`/api/v1/peer-matches/${match.id}/consent`)
        .set('x-goodnight-user-id', requester)
        .send({})
        .expect(201);

      // Second consent activates conversation!
      expect(requesterConsentRes.body.conversation).not.toBeNull();
      expect(requesterConsentRes.body.conversation.matchId).toBe(match.id);
      expect(requesterConsentRes.body.conversation.status).toBe('active');
      expect(requesterConsentRes.body.conversation.consentAcceptedAt).toBeTruthy();

      // Independent Prisma client check: both timestamps written, exactly ONE conversation exists
      const dbMatchAfterSecond = await prisma.peerMatch.findUnique({ where: { id: match.id } });
      expect(dbMatchAfterSecond?.ownerConsentAt).not.toBeNull();
      expect(dbMatchAfterSecond?.requesterConsentAt).not.toBeNull();
      const dbConvAfterSecond = await prisma.peerConversation.findUnique({ where: { matchId: match.id } });
      expect(dbConvAfterSecond).not.toBeNull();
      expect(dbConvAfterSecond?.status).toBe('active');
      expect(dbConvAfterSecond?.startsAt).toBeDefined();
      expect(dbConvAfterSecond?.expiresAt.getTime()).toBeGreaterThan(dbConvAfterSecond!.startsAt.getTime() + 71 * 3600 * 1000);
    });

    it('1.2 Requester-first activation: requester consents first (pending, no conversation) -> owner consents second -> active conversation created', async () => {
      const server = app.getHttpServer();
      const { match } = await createFixtureMatch('RequesterFirst');

      await request(server)
        .patch(`/api/v1/peer-matches/${match.id}`)
        .set('x-goodnight-user-id', requester)
        .send({ status: 'requested', requestReason: '想问问第一步怎么迈出。' })
        .expect(200);

      await request(server)
        .post(`/api/v1/peer-matches/${match.id}/respond`)
        .set('x-goodnight-user-id', owner)
        .send({ status: 'connected' })
        .expect(201);

      // Requester consents first
      const reqConsentRes = await request(server)
        .post(`/api/v1/peer-matches/${match.id}/consent`)
        .set('x-goodnight-user-id', requester)
        .send({})
        .expect(201);

      expect(reqConsentRes.body.conversation).toBeNull();

      // Independent Prisma check
      const dbMatch1 = await prisma.peerMatch.findUnique({ where: { id: match.id } });
      expect(dbMatch1?.requesterConsentAt).not.toBeNull();
      expect(dbMatch1?.ownerConsentAt).toBeNull();
      expect(await prisma.peerConversation.findUnique({ where: { matchId: match.id } })).toBeNull();

      // Owner consents second
      const ownerConsentRes = await request(server)
        .post(`/api/v1/peer-matches/${match.id}/consent`)
        .set('x-goodnight-user-id', owner)
        .send({})
        .expect(201);

      expect(ownerConsentRes.body.conversation).not.toBeNull();
      expect(ownerConsentRes.body.conversation.matchId).toBe(match.id);
      expect(ownerConsentRes.body.conversation.status).toBe('active');

      const dbConv = await prisma.peerConversation.findUnique({ where: { matchId: match.id } });
      expect(dbConv).not.toBeNull();
      expect(dbConv?.status).toBe('active');
    });

    it('1.3 Requester consenting twice before owner: timestamp and deadline unchanged, no conversation created', async () => {
      const server = app.getHttpServer();
      const { match } = await createFixtureMatch('ReqTwice');

      await request(server)
        .patch(`/api/v1/peer-matches/${match.id}`)
        .set('x-goodnight-user-id', requester)
        .send({ status: 'requested', requestReason: '重复确认测试。' })
        .expect(200);
      await request(server)
        .post(`/api/v1/peer-matches/${match.id}/respond`)
        .set('x-goodnight-user-id', owner)
        .send({ status: 'connected' })
        .expect(201);

      // First requester consent
      await request(server)
        .post(`/api/v1/peer-matches/${match.id}/consent`)
        .set('x-goodnight-user-id', requester)
        .send({})
        .expect(201);

      const dbMatchAfter1 = await prisma.peerMatch.findUnique({ where: { id: match.id } });
      const firstTimestamp = dbMatchAfter1?.requesterConsentAt?.getTime();
      expect(firstTimestamp).toBeTruthy();

      // Wait a tiny bit then requester consents again
      await new Promise((r) => setTimeout(r, 50));
      const secondCall = await request(server)
        .post(`/api/v1/peer-matches/${match.id}/consent`)
        .set('x-goodnight-user-id', requester)
        .send({})
        .expect(201);

      expect(secondCall.body.conversation).toBeNull();

      const dbMatchAfter2 = await prisma.peerMatch.findUnique({ where: { id: match.id } });
      expect(dbMatchAfter2?.requesterConsentAt?.getTime()).toBe(firstTimestamp);
      expect(dbMatchAfter2?.ownerConsentAt).toBeNull();
      expect(await prisma.peerConversation.findUnique({ where: { matchId: match.id } })).toBeNull();
    });

    it('1.4 Both consenting concurrently: strict barrier rendezvous produces exactly ONE conversation', async () => {
      const server = app.getHttpServer();
      const { match } = await createFixtureMatch('ConcurrentConsent');

      await request(server)
        .patch(`/api/v1/peer-matches/${match.id}`)
        .set('x-goodnight-user-id', requester)
        .send({ status: 'requested', requestReason: '并发确认测试。' })
        .expect(200);
      await request(server)
        .post(`/api/v1/peer-matches/${match.id}/respond`)
        .set('x-goodnight-user-id', owner)
        .send({ status: 'connected' })
        .expect(201);

      const barrier = new StrictBarrier(['owner', 'requester']);

      const ownerTask = (async () => {
        await barrier.enter('owner');
        return await request(server)
          .post(`/api/v1/peer-matches/${match.id}/consent`)
          .set('x-goodnight-user-id', owner)
          .send({});
      })();

      const requesterTask = (async () => {
        await barrier.enter('requester');
        return await request(server)
          .post(`/api/v1/peer-matches/${match.id}/consent`)
          .set('x-goodnight-user-id', requester)
          .send({});
      })();

      const [resOwner, resReq] = await Promise.all([ownerTask, requesterTask]);
      barrier.assertAllArrived();

      expect([200, 201]).toContain(resOwner.status);
      expect([200, 201]).toContain(resReq.status);

      // Exactly ONE conversation created in PostgreSQL
      const convRows = await prisma.peerConversation.findMany({ where: { matchId: match.id } });
      expect(convRows).toHaveLength(1);
      expect(convRows[0].status).toBe('active');

      const finalMatch = await prisma.peerMatch.findUnique({ where: { id: match.id } });
      expect(finalMatch?.ownerConsentAt).not.toBeNull();
      expect(finalMatch?.requesterConsentAt).not.toBeNull();
    });

    it('1.5 Consent racing block: a blocked match never becomes active, even if one party consented before block', async () => {
      const server = app.getHttpServer();
      const { match } = await createFixtureMatch('ConsentVsBlock');

      await request(server)
        .patch(`/api/v1/peer-matches/${match.id}`)
        .set('x-goodnight-user-id', requester)
        .send({ status: 'requested', requestReason: '拉黑竞态测试。' })
        .expect(200);
      await request(server)
        .post(`/api/v1/peer-matches/${match.id}/respond`)
        .set('x-goodnight-user-id', owner)
        .send({ status: 'connected' })
        .expect(201);

      // Step 1: Owner consents first
      await request(server)
        .post(`/api/v1/peer-matches/${match.id}/consent`)
        .set('x-goodnight-user-id', owner)
        .send({})
        .expect(201);

      // Step 2: Requester blocks the match before consenting
      await request(server)
        .patch(`/api/v1/peer-matches/${match.id}`)
        .set('x-goodnight-user-id', requester)
        .send({ status: 'blocked' })
        .expect(200);

      // Step 3: Requester (or owner) attempts second consent on blocked match -> rejected!
      await request(server)
        .post(`/api/v1/peer-matches/${match.id}/consent`)
        .set('x-goodnight-user-id', requester)
        .send({})
        .expect(403);

      // Invariant: NO conversation created; match stays blocked!
      const dbMatch = await prisma.peerMatch.findUnique({ where: { id: match.id } });
      expect(dbMatch?.status).toBe('blocked');
      const dbConv = await prisma.peerConversation.findUnique({ where: { matchId: match.id } });
      expect(dbConv).toBeNull();
    });

    it('1.6 Declined match cannot consent: terminal match cannot be revived', async () => {
      const server = app.getHttpServer();
      const { match } = await createFixtureMatch('DeclineConsent');

      await request(server)
        .patch(`/api/v1/peer-matches/${match.id}`)
        .set('x-goodnight-user-id', requester)
        .send({ status: 'requested', requestReason: '拒绝竞态测试。' })
        .expect(200);

      await request(server)
        .post(`/api/v1/peer-matches/${match.id}/respond`)
        .set('x-goodnight-user-id', owner)
        .send({ status: 'declined' })
        .expect(201);

      // Consent after decline is rejected with 403
      await request(server)
        .post(`/api/v1/peer-matches/${match.id}/consent`)
        .set('x-goodnight-user-id', owner)
        .send({})
        .expect(403);

      await request(server)
        .post(`/api/v1/peer-matches/${match.id}/consent`)
        .set('x-goodnight-user-id', requester)
        .send({})
        .expect(403);

      const dbMatch = await prisma.peerMatch.findUnique({ where: { id: match.id } });
      expect(dbMatch?.status).toBe('declined');
      expect(await prisma.peerConversation.findUnique({ where: { matchId: match.id } })).toBeNull();
    });
  });

  describe('2. The 7 Concurrency Races (§5)', () => {
    it('2.1 Simultaneous accept: exactly one connected transition, no duplicate conversation, no status rollback', async () => {
      const server = app.getHttpServer();
      const { match } = await createFixtureMatch('RaceAccept');

      await request(server)
        .patch(`/api/v1/peer-matches/${match.id}`)
        .set('x-goodnight-user-id', requester)
        .send({ status: 'requested', requestReason: '并发接收。' })
        .expect(200);

      const barrier = new StrictBarrier(['acceptA', 'acceptB']);

      const callA = (async () => {
        await barrier.enter('acceptA');
        return await request(server)
          .post(`/api/v1/peer-matches/${match.id}/respond`)
          .set('x-goodnight-user-id', owner)
          .send({ status: 'connected' });
      })();

      const callB = (async () => {
        await barrier.enter('acceptB');
        return await request(server)
          .post(`/api/v1/peer-matches/${match.id}/respond`)
          .set('x-goodnight-user-id', owner)
          .send({ status: 'connected' });
      })();

      const [resA, resB] = await Promise.all([callA, callB]);
      barrier.assertAllArrived();

      // At least one succeeds; both status are safe
      const statuses = [resA.status, resB.status];
      expect(statuses).toContain(201);

      const finalMatch = await prisma.peerMatch.findUnique({ where: { id: match.id } });
      expect(finalMatch?.status).toBe('connected');
      expect(finalMatch?.acceptedAt).not.toBeNull();
    });

    it('2.2 Duplicate request: exactly one transition from suggested to requested', async () => {
      const server = app.getHttpServer();
      const { match } = await createFixtureMatch('DuplicateReq');

      const barrier = new StrictBarrier(['reqA', 'reqB']);

      const reqA = (async () => {
        await barrier.enter('reqA');
        return await request(server)
          .patch(`/api/v1/peer-matches/${match.id}`)
          .set('x-goodnight-user-id', requester)
          .send({ status: 'requested', requestReason: '并发请求 A' });
      })();

      const reqB = (async () => {
        await barrier.enter('reqB');
        return await request(server)
          .patch(`/api/v1/peer-matches/${match.id}`)
          .set('x-goodnight-user-id', requester)
          .send({ status: 'requested', requestReason: '并发请求 B' });
      })();

      const [resA, resB] = await Promise.all([reqA, reqB]);
      barrier.assertAllArrived();

      expect([resA.status, resB.status]).toContain(200);

      const dbMatch = await prisma.peerMatch.findUnique({ where: { id: match.id } });
      expect(dbMatch?.status).toBe('requested');
      expect(dbMatch?.requestReason).toMatch(/并发请求/);
    });

    it('2.3 Simultaneous messages: both persist under distinct IDs, no lost insert, no author spoof', async () => {
      const server = app.getHttpServer();
      const { match } = await createFixtureMatch('SimulMsg');

      await request(server).patch(`/api/v1/peer-matches/${match.id}`).set('x-goodnight-user-id', requester).send({ status: 'requested' }).expect(200);
      await request(server).post(`/api/v1/peer-matches/${match.id}/respond`).set('x-goodnight-user-id', owner).send({ status: 'connected' }).expect(201);
      await request(server).post(`/api/v1/peer-matches/${match.id}/consent`).set('x-goodnight-user-id', owner).send({}).expect(201);
      await request(server).post(`/api/v1/peer-matches/${match.id}/consent`).set('x-goodnight-user-id', requester).send({}).expect(201);

      const barrier = new StrictBarrier(['msgRequester', 'msgOwner']);

      const sendReq = (async () => {
        await barrier.enter('msgRequester');
        return await request(server)
          .post(`/api/v1/peer-conversations/${match.id}/messages`)
          .set('x-goodnight-user-id', requester)
          .send({ content: '请求者并发消息内容' });
      })();

      const sendOwner = (async () => {
        await barrier.enter('msgOwner');
        return await request(server)
          .post(`/api/v1/peer-conversations/${match.id}/messages`)
          .set('x-goodnight-user-id', owner)
          .send({ content: '经历者并发消息内容' });
      })();

      const [resReq, resOwner] = await Promise.all([sendReq, sendOwner]);
      barrier.assertAllArrived();

      expect(resReq.status).toBe(201);
      expect(resOwner.status).toBe(201);

      // Independent client check: exactly 2 messages in PostgreSQL
      const conv = await prisma.peerConversation.findUnique({ where: { matchId: match.id } });
      const dbMsgs = await prisma.peerMessage.findMany({
        where: { conversationId: conv!.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(dbMsgs).toHaveLength(2);
      expect(dbMsgs.map((m) => m.content)).toEqual(
        expect.arrayContaining(['请求者并发消息内容', '经历者并发消息内容']),
      );
      expect(dbMsgs.map((m) => m.senderUserId)).toEqual(
        expect.arrayContaining([requester, owner]),
      );
    });

    it('2.4 Close vs Send: send committed before close remains; send after close rejected', async () => {
      const server = app.getHttpServer();
      const { match } = await createFixtureMatch('CloseVsSend');

      await request(server).patch(`/api/v1/peer-matches/${match.id}`).set('x-goodnight-user-id', requester).send({ status: 'requested' }).expect(200);
      await request(server).post(`/api/v1/peer-matches/${match.id}/respond`).set('x-goodnight-user-id', owner).send({ status: 'connected' }).expect(201);
      await request(server).post(`/api/v1/peer-matches/${match.id}/consent`).set('x-goodnight-user-id', owner).send({}).expect(201);
      await request(server).post(`/api/v1/peer-matches/${match.id}/consent`).set('x-goodnight-user-id', requester).send({}).expect(201);

      // Send prior message
      await request(server)
        .post(`/api/v1/peer-conversations/${match.id}/messages`)
        .set('x-goodnight-user-id', requester)
        .send({ content: '关闭前发送成功的消息' })
        .expect(201);

      // Close conversation
      await request(server)
        .post(`/api/v1/peer-conversations/${match.id}/close`)
        .set('x-goodnight-user-id', owner)
        .send({})
        .expect(201);

      // Send after close must be rejected with 400
      await request(server)
        .post(`/api/v1/peer-conversations/${match.id}/messages`)
        .set('x-goodnight-user-id', requester)
        .send({ content: '关闭后发送的消息应该被拒绝' })
        .expect(400);

      // Invariant: only the 1 prior message exists
      const conv = await prisma.peerConversation.findUnique({ where: { matchId: match.id } });
      expect(conv?.status).toBe('closed');
      const messages = await prisma.peerMessage.findMany({ where: { conversationId: conv!.id } });
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('关闭前发送成功的消息');
    });

    it('2.5 Concurrent reports by same reporter: serialized on conversation lock, exactly one open report created; repeat returns open report without duplicate', async () => {
      const server = app.getHttpServer();
      const { match } = await createFixtureMatch('ConcurrentReport');

      await request(server).patch(`/api/v1/peer-matches/${match.id}`).set('x-goodnight-user-id', requester).send({ status: 'requested' }).expect(200);
      await request(server).post(`/api/v1/peer-matches/${match.id}/respond`).set('x-goodnight-user-id', owner).send({ status: 'connected' }).expect(201);
      await request(server).post(`/api/v1/peer-matches/${match.id}/consent`).set('x-goodnight-user-id', owner).send({}).expect(201);
      await request(server).post(`/api/v1/peer-matches/${match.id}/consent`).set('x-goodnight-user-id', requester).send({}).expect(201);

      const barrier = new StrictBarrier(['rep1', 'rep2']);

      const rep1 = (async () => {
        await barrier.enter('rep1');
        return await request(server)
          .post(`/api/v1/peer-conversations/${match.id}/report`)
          .set('x-goodnight-user-id', requester)
          .send({ reason: '并发举报原因一' });
      })();

      const rep2 = (async () => {
        await barrier.enter('rep2');
        return await request(server)
          .post(`/api/v1/peer-conversations/${match.id}/report`)
          .set('x-goodnight-user-id', requester)
          .send({ reason: '并发举报原因二' });
      })();

      const [res1, res2] = await Promise.all([rep1, rep2]);
      barrier.assertAllArrived();

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);

      // Invariant (§0.2, §0.4/A7): Exactly ONE open report in PostgreSQL for this reporter!
      const conv = await prisma.peerConversation.findUnique({ where: { matchId: match.id } });
      const reports = await prisma.peerReport.findMany({
        where: { conversationId: conv!.id, reporterUserId: requester, status: 'open' },
      });
      expect(reports).toHaveLength(1);
    });

    it('2.6 Expire vs Send: message attempted at/after 72h DB deadline rejected under lock; prior messages preserved', async () => {
      const server = app.getHttpServer();
      const { match } = await createFixtureMatch('ExpireVsSend');

      await request(server).patch(`/api/v1/peer-matches/${match.id}`).set('x-goodnight-user-id', requester).send({ status: 'requested' }).expect(200);
      await request(server).post(`/api/v1/peer-matches/${match.id}/respond`).set('x-goodnight-user-id', owner).send({ status: 'connected' }).expect(201);
      await request(server).post(`/api/v1/peer-matches/${match.id}/consent`).set('x-goodnight-user-id', owner).send({}).expect(201);
      await request(server).post(`/api/v1/peer-matches/${match.id}/consent`).set('x-goodnight-user-id', requester).send({}).expect(201);

      // Message 1 sent before expiry
      await request(server)
        .post(`/api/v1/peer-conversations/${match.id}/messages`)
        .set('x-goodnight-user-id', requester)
        .send({ content: '过期前消息' })
        .expect(201);

      // Fast forward expiresAt in DB to past
      const past = new Date(Date.now() - 5000);
      await prisma.peerConversation.update({
        where: { matchId: match.id },
        data: {
          startsAt: new Date(Date.now() - 73 * 3600 * 1000),
          expiresAt: past,
        },
      });

      // Attempt send message at/after deadline: must be rejected with 400
      await request(server)
        .post(`/api/v1/peer-conversations/${match.id}/messages`)
        .set('x-goodnight-user-id', requester)
        .send({ content: '过期后发送应被拒绝' })
        .expect(400);

      // Prior message remains in PostgreSQL
      const conv = await prisma.peerConversation.findUnique({ where: { matchId: match.id } });
      expect(conv?.status).toBe('closed');
      expect(conv?.closedReason).toBe('expired');
      const messages = await prisma.peerMessage.findMany({ where: { conversationId: conv!.id } });
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('过期前消息');
    });
  });

  describe('3. Two Instances, One Database (§5)', () => {
    let harness: MultiInstanceContext;

    beforeAll(async () => {
      harness = await createTwoInstanceHarness();
    });

    afterAll(async () => {
      await harness.close();
    });

    it('3.1 Cross-instance flow: A requests on InstA -> B accepts on InstB -> A consents on InstA -> B consents on InstB -> A and B alternate messages -> both observe same PostgreSQL state without reload', async () => {
      const serverA = harness.appA.getHttpServer();
      const serverB = harness.appB.getHttpServer();

      // Ensure privacy settings in DB
      await request(serverA).patch('/api/v1/me/privacy').set('x-goodnight-user-id', requester).send({ allowPeerMatching: true, allowAnonymousExperienceShare: true }).expect(200);
      await request(serverB).patch('/api/v1/me/privacy').set('x-goodnight-user-id', owner).send({ allowPeerMatching: true, allowAnonymousExperienceShare: true }).expect(200);

      // 1. Owner creates and publishes experience on Instance B
      const ownerJourney = await request(serverB)
        .post('/api/v1/journeys')
        .set('x-goodnight-user-id', owner)
        .send({ title: '跨实例测试经验旅程', domain: '关系', content: '经历内容', intensity: 5 })
        .expect(201);

      const expRes = await request(serverB)
        .post('/api/v1/peer-experiences')
        .set('x-goodnight-user-id', owner)
        .send({
          journeyId: ownerJourney.body.journey.id,
          title: '跨实例同路经验',
          domain: '关系',
          stage: 'graduated',
          content: '我如何度过最难受的日子。',
          tags: ['分开后想联系'],
          consented: true,
        })
        .expect(201);

      const adminUser = await harness.db.adminUser.findFirst();
      await harness.peerPersistenceB.reviewExperience(expRes.body.item.id, adminUser!.id, 'published');

      // 2. Requester creates journey and gets suggested matches on Instance A
      const reqJourney = await request(serverA)
        .post('/api/v1/journeys')
        .set('x-goodnight-user-id', requester)
        .send({ title: '跨实例请求旅程', domain: '关系', content: '求助内容', intensity: 7 })
        .expect(201);

      const suggestedRes = await request(serverA)
        .post(`/api/v1/journeys/${reqJourney.body.journey.id}/peer-matches`)
        .set('x-goodnight-user-id', requester)
        .send({})
        .expect(201);

      const match = suggestedRes.body.items.find((item: { peerExperienceId: string }) => item.peerExperienceId === expRes.body.item.id);
      expect(match).toBeTruthy();

      // 3. A requests on Instance A
      await request(serverA)
        .patch(`/api/v1/peer-matches/${match.id}`)
        .set('x-goodnight-user-id', requester)
        .send({ status: 'requested', requestReason: '来自实例 A 的同路请求。' })
        .expect(200);

      // 4. B accepts on Instance B
      await request(serverB)
        .post(`/api/v1/peer-matches/${match.id}/respond`)
        .set('x-goodnight-user-id', owner)
        .send({ status: 'connected' })
        .expect(201);

      // 5. A consents on Instance A -> returns pending
      const consentA = await request(serverA)
        .post(`/api/v1/peer-matches/${match.id}/consent`)
        .set('x-goodnight-user-id', requester)
        .send({})
        .expect(201);
      expect(consentA.body.conversation).toBeNull();

      // 6. B consents on Instance B -> activates conversation!
      const consentB = await request(serverB)
        .post(`/api/v1/peer-matches/${match.id}/consent`)
        .set('x-goodnight-user-id', owner)
        .send({})
        .expect(201);
      expect(consentB.body.conversation).not.toBeNull();
      expect(consentB.body.conversation.status).toBe('active');

      // 7. A sends message on Instance A
      const msg1 = await request(serverA)
        .post(`/api/v1/peer-conversations/${match.id}/messages`)
        .set('x-goodnight-user-id', requester)
        .send({ content: '消息 1 来自实例 A' })
        .expect(201);
      expect(msg1.body.item.content).toBe('消息 1 来自实例 A');

      // 8. B sends message on Instance B
      const msg2 = await request(serverB)
        .post(`/api/v1/peer-conversations/${match.id}/messages`)
        .set('x-goodnight-user-id', owner)
        .send({ content: '消息 2 来自实例 B' })
        .expect(201);
      expect(msg2.body.item.content).toBe('消息 2 来自实例 B');

      // 9. Both instances query conversation list WITHOUT reload -> observe same state!
      const listA = await request(serverA)
        .get('/api/v1/peer-conversations')
        .set('x-goodnight-user-id', requester)
        .expect(200);
      const convA = listA.body.items.find((item: { matchId: string }) => item.matchId === match.id);
      expect(convA).toBeTruthy();
      expect(convA.messages).toHaveLength(2);

      const listB = await request(serverB)
        .get('/api/v1/peer-conversations')
        .set('x-goodnight-user-id', owner)
        .expect(200);
      const convB = listB.body.items.find((item: { matchId: string }) => item.matchId === match.id);
      expect(convB).toBeTruthy();
      expect(convB.messages).toHaveLength(2);

      // Independent Prisma client check
      const independentConv = await harness.db.peerConversation.findUnique({
        where: { matchId: match.id },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
      expect(independentConv?.status).toBe('active');
      expect(independentConv?.messages).toHaveLength(2);
      expect(independentConv?.messages[0].content).toBe('消息 1 来自实例 A');
      expect(independentConv?.messages[1].content).toBe('消息 2 来自实例 B');
    });
  });

  describe('4. Reference Safety: Omitted-Field Case (§0.4/A5)', () => {
    it('4.1 One instance commits a peer FK (PeerExperience.journeyId, PeerMatch.journeyId), while another instance has stale snapshot omitting it; reload and legacy-flush preserves the committed FKs and peer rows', async () => {
      // 1. Create a journey
      const journeyId = `journey_fk_safety_${Date.now()}`;
      await prisma.lifeJourney.create({
        data: {
          id: journeyId,
          userId: owner,
          title: '外键安全验证旅程',
          domain: '关系',
          status: 'active',
          stage: 'acting',
          visibility: 'PRIVATE',
        },
      });

      // 2. Direct-DB writes committed by one instance (Instance A)
      const expId = `peerexp_fk_${Date.now()}`;
      await prisma.peerExperience.create({
        data: {
          id: expId,
          userId: owner,
          journeyId,
          title: '保留外键经历',
          domain: '关系',
          stage: 'graduated',
          content: '经历文本',
          tags: ['安全'],
          status: 'published',
          consentedAt: new Date(),
        },
      });

      const matchId = `peermatch_fk_${Date.now()}`;
      await prisma.peerMatch.create({
        data: {
          id: matchId,
          userId: requester,
          journeyId,
          peerExperienceId: expId,
          score: 0.95,
          reasons: ['相似'],
          status: 'suggested',
        },
      });

      // 3. Stale instance snapshot (Instance B) completely omits peerExperiences and peerMatches
      // Reload and legacy-flush on Instance B
      const { StoreService } = await import('../../apps/api/src/store.service');
      const storeB = app.get(StoreService);
      await storeB.reloadRuntimeState();
      await storeB.persistAndFlush();

      // 4. Assert: The committed PeerExperience and PeerMatch rows survived!
      // Their journeyId foreign keys were NOT nulled out, and rows were NOT swept!
      const finalExp = await prisma.peerExperience.findUnique({ where: { id: expId } });
      expect(finalExp).not.toBeNull();
      expect(finalExp?.journeyId).toBe(journeyId);

      const finalMatch = await prisma.peerMatch.findUnique({ where: { id: matchId } });
      expect(finalMatch).not.toBeNull();
      expect(finalMatch?.journeyId).toBe(journeyId);
      expect(finalMatch?.peerExperienceId).toBe(expId);
    }, 60_000);
  });

  describe('5. SQL Scope & Zero-Legacy-Sweep Verification (§5, §0.4/A7)', () => {
    it('5.1 Instrumenting peer operations confirms zero legacy upserts and zero absence sweeps against the five peer tables', async () => {
      const queries: string[] = [];

      // Create Prisma client with logging to capture executed queries
      const tracedPrisma = new PrismaClient({
        datasources: { db: { url: process.env.DATABASE_URL } },
        log: [{ emit: 'event', level: 'query' }],
      });

      (tracedPrisma as any).$on('query', (e: { query: string }) => {
        queries.push(e.query);
      });

      const { StoreService } = await import('../../apps/api/src/store.service');
      const store = app.get(StoreService);
      await saveRelationalRuntimeState(tracedPrisma as any, store.data);

      // Filter queries executed against the 5 peer tables
      const peerQueries = queries.filter((q) =>
        /"PeerExperience"|"PeerMatch"|"PeerConversation"|"PeerMessage"|"PeerReport"/i.test(q),
      );
      const deleteSweeps = peerQueries.filter((q) => /DELETE\s+FROM/i.test(q));
      const upsertQueries = peerQueries.filter((q) => /INSERT\s+INTO.*ON\s+CONFLICT/i.test(q) || /UPDATE\s+"public"\."Peer/i.test(q));
      expect(deleteSweeps).toHaveLength(0);
      expect(upsertQueries).toHaveLength(0);

      await tracedPrisma.$disconnect();
    }, 20_000);
  });
});
