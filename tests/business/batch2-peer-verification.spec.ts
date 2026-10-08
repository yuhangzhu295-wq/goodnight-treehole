import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { auth, createApiTestApp, loginAdmin } from './helpers';
import { createTwoInstanceHarness, type MultiInstanceContext } from './two-instance-harness';
import { saveRelationalRuntimeState } from '../../apps/api/src/relational-runtime.mapper';
import { PeerPersistenceService } from '../../apps/api/src/peer-persistence.service';

class StrictBarrier {
  private parties = new Set<string>();
  private arrived = new Set<string>();
  private resolvers = new Map<string, () => void>();
  private timeoutMs: number;

  constructor(names: string[], timeoutMs = 4000) {
    for (const name of names) this.parties.add(name);
    this.timeoutMs = timeoutMs;
  }

  async enter(name: string, timeoutMs = this.timeoutMs): Promise<void> {
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

  // Teardown here closes three Nest applications plus the extra Prisma clients this file creates.
  // It is bounded on purpose. A shutdown that cannot finish must be REPORTED, not left to fail the
  // file: this file's subject is peer persistence, and a stalled close is not evidence about it.
  // The underlying product weakness (an unbounded graceful Redis shutdown) is bounded in
  // `follow-up-worker.service.ts`, but the test must not depend on that fix holding in every case.
  afterAll(async () => {
    const bounded = async (label: string, run: () => Promise<unknown>, budgetMs: number) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expired = new Promise<'expired'>((resolve) => {
        timer = setTimeout(() => resolve('expired'), budgetMs);
      });
      try {
        const outcome = await Promise.race([run().then(() => 'done' as const), expired]);
        if (outcome === 'expired') {
          console.error(`[batch2-peer] teardown: ${label} did not finish within ${budgetMs}ms`);
        }
      } catch (error) {
        console.error(`[batch2-peer] teardown: ${label} failed (${(error as Error).message})`);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    await bounded('prisma.$disconnect', () => prisma.$disconnect(), 15_000);
    await bounded('app.close', () => app.close(), 45_000);
  }, 120_000);

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

    it('1.4 Both consenting concurrently: the barrier meets inside the transactions, so both are open when they contend, and exactly ONE conversation results', async () => {
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

      // `_onBeforeLock` fires inside the open transaction before any lock, so both consent
      // transactions are demonstrably open when they race for the same match row. Rendezvousing
      // the HTTP requests before they start would let the two run one after the other.
      const barrier = new StrictBarrier(['owner', 'requester']);
      const peerService = app.get(PeerPersistenceService);

      const [resOwner, resReq] = await Promise.allSettled([
        peerService.consentMatch(match.id, owner, { _onBeforeLock: () => barrier.enter('owner') }),
        peerService.consentMatch(match.id, requester, { _onBeforeLock: () => barrier.enter('requester') }),
      ]);
      barrier.assertAllArrived();

      expect(resOwner.status).toBe('fulfilled');
      expect(resReq.status).toBe('fulfilled');

      // Exactly ONE conversation created in PostgreSQL
      const convRows = await prisma.peerConversation.findMany({ where: { matchId: match.id } });
      expect(convRows).toHaveLength(1);
      expect(convRows[0].status).toBe('active');

      // Exactly one of the two calls is the one that activated it.
      const activations = [resOwner, resReq].filter(
        (r) => (r as PromiseFulfilledResult<{ activated: boolean }>).value.activated,
      );
      expect(activations).toHaveLength(1);

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

  describe('2. Concurrency: barriers rendezvous inside the transaction (§5)', () => {
    // Every case below calls the persistence layer directly with `_onBeforeLock`. That hook fires
    // *inside* the open transaction and before any lock is taken, so two parties meeting at the
    // barrier are demonstrably both open and then genuinely contend for the same rows. A barrier
    // that only rendezvouses the HTTP requests before they start would let the two operations run
    // one after the other and prove nothing.
    const peer = (): PeerPersistenceService => app.get(PeerPersistenceService);

    async function openConversation(matchId: string) {
      const server = app.getHttpServer();
      await request(server)
        .patch(`/api/v1/peer-matches/${matchId}`)
        .set('x-goodnight-user-id', requester)
        .send({ status: 'requested', requestReason: '并发用例准备。' })
        .expect(200);
      await request(server)
        .post(`/api/v1/peer-matches/${matchId}/respond`)
        .set('x-goodnight-user-id', owner)
        .send({ status: 'connected' })
        .expect(201);
      await peer().consentMatch(matchId, owner);
      const second = await peer().consentMatch(matchId, requester);
      expect(second.conversation).not.toBeNull();
      return second.conversation!;
    }

    it('2.1 Simultaneous accept: exactly one connected transition commits and the other is rejected', async () => {
      const server = app.getHttpServer();
      const { match } = await createFixtureMatch('RaceAccept');

      await request(server)
        .patch(`/api/v1/peer-matches/${match.id}`)
        .set('x-goodnight-user-id', requester)
        .send({ status: 'requested', requestReason: '并发接收。' })
        .expect(200);

      const barrier = new StrictBarrier(['acceptA', 'acceptB']);
      const [resA, resB] = await Promise.allSettled([
        peer().respondMatch(match.id, owner, 'connected', { _onBeforeLock: () => barrier.enter('acceptA') }),
        peer().respondMatch(match.id, owner, 'connected', { _onBeforeLock: () => barrier.enter('acceptB') }),
      ]);
      barrier.assertAllArrived();

      const fulfilled = [resA, resB].filter((r) => r.status === 'fulfilled');
      const rejected = [resA, resB].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      // The loser is refused by whichever guard it reaches first: the post-lock status re-read or
      // the compare-and-swap predicate. Both are legitimate; "no error at all" is not.
      expect(String(rejected[0].reason?.message ?? '')).toMatch(/状态已经变化|只有经历发布者/);

      const finalMatch = await prisma.peerMatch.findUnique({ where: { id: match.id } });
      expect(finalMatch?.status).toBe('connected');
      expect(finalMatch?.acceptedAt).not.toBeNull();
      // Accepting is not consenting: no conversation may exist yet.
      expect(await prisma.peerConversation.count({ where: { matchId: match.id } })).toBe(0);
    }, 20_000);

    it('2.2 Duplicate request: exactly one suggested->requested transition commits, and the loser does not overwrite it', async () => {
      const { match } = await createFixtureMatch('DuplicateReq');

      const barrier = new StrictBarrier(['reqA', 'reqB']);
      const [resA, resB] = await Promise.allSettled([
        peer().updateMatchRequest(match.id, requester, 'requested', '并发请求 A', undefined, {
          _onBeforeLock: () => barrier.enter('reqA'),
        }),
        peer().updateMatchRequest(match.id, requester, 'requested', '并发请求 B', undefined, {
          _onBeforeLock: () => barrier.enter('reqB'),
        }),
      ]);
      barrier.assertAllArrived();

      const fulfilled = [resA, resB].filter((r) => r.status === 'fulfilled');
      const rejected = [resA, resB].filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const dbMatch = await prisma.peerMatch.findUnique({ where: { id: match.id } });
      expect(dbMatch?.status).toBe('requested');
      // The committed reason is exactly one of the two, never a mixture and never the loser's.
      expect(['并发请求 A', '并发请求 B']).toContain(dbMatch?.requestReason);
      const winner = (fulfilled[0] as PromiseFulfilledResult<{ match: { requestReason?: string } }>).value;
      expect(dbMatch?.requestReason).toBe(winner.match.requestReason);
    }, 20_000);

    it('2.3 Simultaneous messages from both parties: both commit under distinct ids with no lost insert', async () => {
      const { match } = await createFixtureMatch('SimulMsg');
      await openConversation(match.id);

      const barrier = new StrictBarrier(['msgRequester', 'msgOwner']);
      const [resReq, resOwner] = await Promise.allSettled([
        peer().sendMessage(match.id, requester, '请求者并发消息内容', { _onBeforeLock: () => barrier.enter('msgRequester') }),
        peer().sendMessage(match.id, owner, '经历者并发消息内容', { _onBeforeLock: () => barrier.enter('msgOwner') }),
      ]);
      barrier.assertAllArrived();

      expect(resReq.status).toBe('fulfilled');
      expect(resOwner.status).toBe('fulfilled');

      const conv = await prisma.peerConversation.findUnique({ where: { matchId: match.id } });
      const dbMsgs = await prisma.peerMessage.findMany({
        where: { conversationId: conv!.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(dbMsgs).toHaveLength(2);
      expect(dbMsgs.map((m) => m.content)).toEqual(
        expect.arrayContaining(['请求者并发消息内容', '经历者并发消息内容']),
      );
      expect(dbMsgs.map((m) => m.senderUserId)).toEqual(expect.arrayContaining([requester, owner]));
    }, 20_000);

    it('2.4a Close vs Send, concurrent: the send either commits before the close or is refused; never a message after a close', async () => {
      const { match } = await createFixtureMatch('CloseVsSendRace');
      const conv = await openConversation(match.id);

      const barrier = new StrictBarrier(['close', 'send']);
      const [closeRes, sendRes] = await Promise.allSettled([
        peer().closeConversation(match.id, owner, 'closed', { _onBeforeLock: () => barrier.enter('close') }),
        peer().sendMessage(match.id, requester, '关闭竞态消息', { _onBeforeLock: () => barrier.enter('send') }),
      ]);
      barrier.assertAllArrived();

      expect(closeRes.status).toBe('fulfilled');

      const dbConv = await prisma.peerConversation.findUnique({ where: { matchId: match.id } });
      const messages = await prisma.peerMessage.findMany({ where: { conversationId: conv.id } });
      expect(dbConv?.status).toBe('closed');

      if (sendRes.status === 'fulfilled') {
        // The send won the race: exactly one message, and the close still ended the conversation.
        expect(messages).toHaveLength(1);
        expect(messages[0].content).toBe('关闭竞态消息');
      } else {
        // The close won: the message must not exist, and the refusal names the ended conversation.
        expect(messages).toHaveLength(0);
        expect(String((sendRes as PromiseRejectedResult).reason?.message ?? '')).toMatch(/已经结束/);
      }
    }, 20_000);

    it('2.4b Close vs Send, both orderings forced: send-then-close keeps the message; close-then-send is refused with no message', async () => {
      const { match: matchA } = await createFixtureMatch('CloseAfterSend');
      const convA = await openConversation(matchA.id);
      // Ordering 1: the send commits first.
      await peer().sendMessage(matchA.id, requester, '先发送再关闭');
      await peer().closeConversation(matchA.id, owner, 'closed');
      const msgsA = await prisma.peerMessage.findMany({ where: { conversationId: convA.id } });
      expect(msgsA).toHaveLength(1);
      expect(msgsA[0].content).toBe('先发送再关闭');
      expect((await prisma.peerConversation.findUnique({ where: { matchId: matchA.id } }))?.status).toBe('closed');

      const { match: matchB } = await createFixtureMatch('SendAfterClose');
      const convB = await openConversation(matchB.id);
      // Ordering 2: the close commits first.
      await peer().closeConversation(matchB.id, owner, 'closed');
      await expect(peer().sendMessage(matchB.id, requester, '关闭后再发送')).rejects.toThrow(/已经结束/);
      expect(await prisma.peerMessage.count({ where: { conversationId: convB.id } })).toBe(0);
    }, 20_000);

    it('2.5 Concurrent reports by the same reporter: exactly one open report is created, the other is a repeat', async () => {
      const { match } = await createFixtureMatch('ConcurrentReport');
      const conv = await openConversation(match.id);

      const barrier = new StrictBarrier(['rep1', 'rep2']);
      const [res1, res2] = await Promise.allSettled([
        peer().reportConversation(match.id, requester, '并发举报原因一', { _onBeforeLock: () => barrier.enter('rep1') }),
        peer().reportConversation(match.id, requester, '并发举报原因二', { _onBeforeLock: () => barrier.enter('rep2') }),
      ]);
      barrier.assertAllArrived();
      expect(res1.status).toBe('fulfilled');
      expect(res2.status).toBe('fulfilled');

      const reports = await prisma.peerReport.findMany({
        where: { conversationId: conv.id, reporterUserId: requester, status: 'open' },
      });
      expect(reports).toHaveLength(1);

      const results = [res1, res2].map(
        (r) => (r as PromiseFulfilledResult<{ isRepeat: boolean }>).value,
      );
      // Exactly one insert; the other observes the open report and reports it as a repeat.
      expect(results.filter((r) => r.isRepeat === false)).toHaveLength(1);
      expect(results.filter((r) => r.isRepeat === true)).toHaveLength(1);
    }, 20_000);

    it('2.6a Expire vs Send: a send at/after the deadline is refused AND the expiry closure is committed, not rolled back', async () => {
      const { match } = await createFixtureMatch('ExpireVsSend');
      const conv = await openConversation(match.id);

      await peer().sendMessage(match.id, requester, '过期前消息');

      // Move the deadline into the past in the database.
      await prisma.peerConversation.update({
        where: { id: conv.id },
        data: { startsAt: new Date(Date.now() - 73 * 3600 * 1000), expiresAt: new Date(Date.now() - 5000) },
      });

      // Call the persistence layer directly: the HTTP entry runs the expiry sweep first, which is
      // exactly why the previous version of this test passed while the closure was being rolled
      // back by the throw. Bypassing the sweep is what makes this discriminating.
      await expect(peer().sendMessage(match.id, requester, '过期后发送应被拒绝')).rejects.toThrow(/已经结束/);

      const dbConv = await prisma.peerConversation.findUnique({ where: { matchId: match.id } });
      expect(dbConv?.status).toBe('closed');
      expect(dbConv?.closedReason).toBe('expired');
      expect(dbConv?.closedAt).not.toBeNull();

      const messages = await prisma.peerMessage.findMany({ where: { conversationId: conv.id } });
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('过期前消息');
    }, 20_000);

    it('2.6b Expire sweep and send, both orderings: a live deadline still accepts, a past deadline is swept', async () => {
      const { match: liveMatch } = await createFixtureMatch('ExpireLive');
      const liveConv = await openConversation(liveMatch.id);
      // Ordering 1: send first while the deadline is live.
      await peer().sendMessage(liveMatch.id, requester, '期限内消息');
      const swept = await peer().expireDueConversations();
      expect(swept.map((row) => row.id)).not.toContain(liveConv.id);
      expect((await prisma.peerConversation.findUnique({ where: { id: liveConv.id } }))?.status).toBe('active');

      // Ordering 2: sweep first on a past deadline.
      await prisma.peerConversation.update({
        where: { id: liveConv.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const swept2 = await peer().expireDueConversations();
      const sweptRow = swept2.find((row) => row.id === liveConv.id);
      expect(sweptRow).toBeDefined();
      expect(sweptRow?.status).toBe('closed');
      expect(sweptRow?.closedReason).toBe('expired');

      const dbConv = await prisma.peerConversation.findUnique({ where: { id: liveConv.id } });
      expect(dbConv?.status).toBe('closed');
      expect(dbConv?.closedReason).toBe('expired');
      // A sweep that closes the row must not invent a message or reopen the conversation.
      expect(await prisma.peerMessage.count({ where: { conversationId: liveConv.id } })).toBe(1);
    }, 20_000);

    it('2.6c A send transaction held open ACROSS the deadline is refused on the post-lock clock, not the transaction-start clock', async () => {
      const { match } = await createFixtureMatch('ExpireDuringTx');
      const conv = await openConversation(match.id);

      // The deadline is 1.2 s away and the send transaction is held open for 2 s before it reads
      // the clock, so the deadline passes while the transaction is open.
      await prisma.peerConversation.update({
        where: { id: conv.id },
        data: { expiresAt: new Date(Date.now() + 1200) },
      });

      // PostgreSQL's NOW() is the transaction-start timestamp. A transaction that began before the
      // deadline but reached its clock read after it would compare against the pre-deadline instant
      // and let the message through; clock_timestamp() is evaluated at the call, after the lock.
      await expect(
        peer().sendMessage(match.id, requester, '截止时刻跨过的消息', {
          _onBeforeLock: () => new Promise<void>((resolve) => setTimeout(resolve, 2000)),
        }),
      ).rejects.toThrow(/已经结束/);

      const dbConv = await prisma.peerConversation.findUnique({ where: { id: conv.id } });
      expect(dbConv?.status).toBe('closed');
      expect(dbConv?.closedReason).toBe('expired');
      expect(await prisma.peerMessage.count({ where: { conversationId: conv.id } })).toBe(0);
    }, 30_000);
  });

  describe('3. Two Instances, One Database (§5)', () => {
    let harness: MultiInstanceContext;

    beforeAll(async () => {
      harness = await createTwoInstanceHarness();
    });

    afterAll(async () => {
      await harness.close();
    }, 120_000);

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
    }, 20_000);

    it('3.2 The waiting page receives the consent fields it renders: /api/v1/peers exposes requesterConsentAt and ownerConsentAt for the pending match', async () => {
      const server = app.getHttpServer();
      const { match } = await createFixtureMatch('WaitingFields');

      await request(server)
        .patch(`/api/v1/peer-matches/${match.id}`)
        .set('x-goodnight-user-id', requester)
        .send({ status: 'requested', requestReason: '等待页字段验证。' })
        .expect(200);
      await request(server)
        .post(`/api/v1/peer-matches/${match.id}/respond`)
        .set('x-goodnight-user-id', owner)
        .send({ status: 'connected' })
        .expect(201);

      // The requester consents first: the page must be able to tell that it already consented.
      await request(server)
        .post(`/api/v1/peer-matches/${match.id}/consent`)
        .set('x-goodnight-user-id', requester)
        .send({})
        .expect(201);

      const peers = await request(server)
        .get('/api/v1/peers')
        .set('x-goodnight-user-id', requester)
        .expect(200);
      const payloadMatch = peers.body.item.matches.find((item: { id: string }) => item.id === match.id);
      // The match must be reachable from the list the waiting page reads, and must carry the
      // fields `PeerMatchWaiting.vue` derives its "已确认边界，等待对方确认" state from.
      expect(payloadMatch).toBeTruthy();
      expect(payloadMatch.requesterConsentAt).toBeTruthy();
      expect(payloadMatch.ownerConsentAt ?? null).toBeNull();

      // After the owner consents too, both fields are present (the page then shows "准备就绪").
      await request(server)
        .post(`/api/v1/peer-matches/${match.id}/consent`)
        .set('x-goodnight-user-id', owner)
        .send({})
        .expect(201);

      const peersAfter = await request(server)
        .get('/api/v1/peers')
        .set('x-goodnight-user-id', requester)
        .expect(200);
      const afterMatch = peersAfter.body.item.matches.find((item: { id: string }) => item.id === match.id);
      expect(afterMatch?.requesterConsentAt).toBeTruthy();
      expect(afterMatch?.ownerConsentAt).toBeTruthy();
    }, 20_000);

    it('3.3 Database-layer ownership negatives: every direct peer operation refuses a caller who is not a participant', async () => {
      const { match } = await createFixtureMatch('OwnershipNegatives');
      const outsider = 'user_outsider_not_a_participant';
      const peerService = harness.peerPersistenceA;

      await harness.db.user.upsert({
        where: { id: outsider },
        create: {
          id: outsider,
          openid: `openid_${outsider}`,
          nickname: '无关第三方',
          anonymousCode: 'outsider_code',
          status: 'normal',
        },
        update: {},
      });

      await expect(peerService.updateMatchRequest(match.id, outsider, 'requested', '越权请求')).rejects.toThrow();
      await expect(peerService.respondMatch(match.id, outsider, 'connected')).rejects.toThrow();
      await expect(peerService.blockMatchDirect(match.id, outsider)).rejects.toThrow();
      await expect(peerService.sendMessage(match.id, outsider, '越权消息')).rejects.toThrow();
      await expect(peerService.reportConversation(match.id, outsider, '越权举报')).rejects.toThrow();
      await expect(peerService.closeConversation(match.id, outsider, 'closed')).rejects.toThrow();
      await expect(peerService.blockConversation(match.id, outsider)).rejects.toThrow();
      await expect(peerService.requireOpenConversation(match.id, outsider)).rejects.toThrow();
      await expect(peerService.saveConversationFeedback(match.id, outsider, 'helpful')).rejects.toThrow();
      await expect(peerService.consentMatch(match.id, outsider)).rejects.toThrow();

      // Nothing the outsider attempted may have landed.
      expect(await harness.db.peerMatch.findUnique({ where: { id: match.id } })).not.toBeNull();
      expect(await harness.db.peerConversation.findUnique({ where: { matchId: match.id } })).toBeNull();
      expect(await harness.db.peerMessage.count({ where: { conversation: { matchId: match.id } } })).toBe(0);
      expect(await harness.db.peerReport.count({ where: { matchId: match.id } })).toBe(0);
    }, 20_000);

    it('3.4 Lock order: a peer write held open after its root locks overlaps a journey delete and a full legacy flush, with no deadlock', async () => {
      const journeyId = `journey_lock_order_${Date.now()}`;
      await harness.db.lifeJourney.create({
        data: {
          id: journeyId,
          userId: requester,
          title: '锁序验证旅程',
          domain: '生活',
          status: 'completed',
          stage: 'graduated',
          visibility: 'PRIVATE',
        },
      });

      const experience = await harness.peerPersistenceB.createExperience({
        userId: owner,
        title: '锁序验证经历',
        domain: '生活',
        stage: 'graduated',
        content: '用于锁序验证的公开经历。',
        tags: ['锁序'],
        consentedAt: new Date().toISOString(),
        status: 'published',
      });

      // Three parties meet inside their transactions: the peer write holds its root locks, the
      // journey delete has begun, and the legacy flush is inside its transaction. A barrier that
      // times out throws, so a run in which the operations did not actually overlap cannot pass.
      const barrier = new StrictBarrier(['peerWriteLocked', 'deleteStarted', 'flushStarted'], 8000);

      // The flush starts first and must reach its own transaction before the other two start. If it
      // were started last it would have to wait for a pooled connection while the other two hold
      // theirs and wait at the barrier, and the delete's 5-second transaction timeout would fire
      // under pool pressure — a fixture artifact that made this case flaky, not a product finding.
      let flushEnteredTx: () => void = () => {};
      const flushInTransaction = new Promise<void>((resolve) => {
        flushEnteredTx = resolve;
      });
      const flushClient = new PrismaClient({ datasources: { db: { url: harness.dbUrl } } });
      const legacyFlush = saveRelationalRuntimeState(
        flushClient,
        (harness.storeB as unknown as { data: Record<string, unknown> }).data,
        {
          _onInTransaction: async () => {
            flushEnteredTx();
            await barrier.enter('flushStarted');
          },
        },
      );
      await flushInTransaction;

      const peerWrite = harness.peerPersistenceA.createMatches(
        [
          {
            userId: requester,
            journeyId,
            peerExperienceId: experience.id,
            score: 0.42,
            reasons: ['锁序验证'],
            status: 'suggested',
          },
        ],
        { _onAfterLock: () => barrier.enter('peerWriteLocked') },
      );

      const journeyDelete = harness.persistenceB.deleteJourneyArchive({
        journeyId,
        userId: requester,
        archiveRoute: `/pages/journey/detail?id=${journeyId}`,
        _onBeforeLock: () => barrier.enter('deleteStarted'),
      });

      const results = await Promise.allSettled([peerWrite, journeyDelete, legacyFlush]);
      barrier.assertAllArrived();
      await flushClient.$disconnect();

      for (const result of results) {
        if (result.status === 'rejected') {
          const message = String((result as PromiseRejectedResult).reason?.message ?? result.reason ?? '');
          expect(message).not.toMatch(/40P01|deadlock/i);
        }
      }
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('fulfilled');

      // The peer row survived the journey delete, and the delete detached it rather than removing it.
      const rows = await harness.db.peerMatch.findMany({ where: { userId: requester, peerExperienceId: experience.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].journeyId).toBeNull();
      expect(await harness.db.lifeJourney.findUnique({ where: { id: journeyId } })).toBeNull();
    }, 30_000);

    it('3.5 Lock order: a peer write supplying a journey that a concurrent delete removes ends detached, not as an FK error', async () => {
      const journeyId = `journey_ref_race_${Date.now()}`;
      await harness.db.lifeJourney.create({
        data: {
          id: journeyId,
          userId: requester,
          title: '引用竞态旅程',
          domain: '生活',
          status: 'completed',
          stage: 'graduated',
          visibility: 'PRIVATE',
        },
      });

      const experience = await harness.peerPersistenceB.createExperience({
        userId: owner,
        title: '引用竞态经历',
        domain: '生活',
        stage: 'graduated',
        content: '用于引用竞态的公开经历。',
        tags: ['引用竞态'],
        consentedAt: new Date().toISOString(),
        status: 'published',
      });

      const barrier = new StrictBarrier(['deleteLocked', 'peerCreateStarted'], 8000);

      const journeyDelete = harness.persistenceB.deleteJourneyArchive({
        journeyId,
        userId: requester,
        archiveRoute: `/pages/journey/detail?id=${journeyId}`,
        _onLockedJourney: () => barrier.enter('deleteLocked'),
      });

      const peerCreate = harness.peerPersistenceA.createMatches(
        [
          {
            userId: requester,
            journeyId,
            peerExperienceId: experience.id,
            score: 0.33,
            reasons: ['引用竞态'],
            status: 'suggested',
          },
        ],
        { _onBeforeLock: () => barrier.enter('peerCreateStarted') },
      );

      const results = await Promise.allSettled([journeyDelete, peerCreate]);
      barrier.assertAllArrived();

      // The delete holds the journey; the peer create waits for it and then resolves the reference
      // under the lock. One deterministic outcome: the peer row exists, detached.
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('fulfilled');

      const rows = await harness.db.peerMatch.findMany({ where: { userId: requester, peerExperienceId: experience.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0].journeyId).toBeNull();
      expect(await harness.db.lifeJourney.findUnique({ where: { id: journeyId } })).toBeNull();
    }, 30_000);

    it('3.7 A match beyond the capped discovery list is still reachable when the page names it, and is genuinely dropped without it', async () => {
      const server = app.getHttpServer();
      const { match } = await createFixtureMatch('FocusMatch');
      await request(server)
        .patch(`/api/v1/peer-matches/${match.id}`)
        .set('x-goodnight-user-id', requester)
        .send({ status: 'requested', requestReason: '焦点可达性验证。' })
        .expect(200);
      await request(server)
        .post(`/api/v1/peer-matches/${match.id}/respond`)
        .set('x-goodnight-user-id', owner)
        .send({ status: 'connected' })
        .expect(201);

      // Push the target past the cap: 60 higher-scoring in-flight matches for the same user, then
      // the target at the bottom. A cap alone cannot guarantee reachability; `matchId` must.
      const stamp = Date.now();
      const fillerExperiences = Array.from({ length: 60 }, (_, index) => ({
        id: `peerexp_focus_filler_${stamp}_${index}`,
        userId: owner,
        title: `焦点填充经历 ${index}`,
        domain: '关系',
        stage: 'graduated',
        content: '用于把目标匹配挤出列表的填充经历。',
        tags: [] as unknown as Prisma.InputJsonValue,
        consentedAt: new Date(),
        status: 'published' as const,
      }));
      await prisma.peerExperience.createMany({ data: fillerExperiences });
      await prisma.peerMatch.createMany({
        data: fillerExperiences.map((experience, index) => ({
          id: `peermatch_focus_filler_${stamp}_${index}`,
          userId: requester,
          peerExperienceId: experience.id,
          score: 0.99,
          reasons: ['填充'],
          status: 'connected',
        })),
      });
      await prisma.peerMatch.update({ where: { id: match.id }, data: { score: 0.01 } });

      const withoutFocus = await request(server)
        .get('/api/v1/peers')
        .set('x-goodnight-user-id', requester)
        .expect(200);
      expect(withoutFocus.body.item.matches.find((item: { id: string }) => item.id === match.id)).toBeUndefined();

      const withFocus = await request(server)
        .get(`/api/v1/peers?matchId=${encodeURIComponent(match.id)}`)
        .set('x-goodnight-user-id', requester)
        .expect(200);
      const found = withFocus.body.item.matches.find((item: { id: string }) => item.id === match.id);
      expect(found).toBeTruthy();
      expect(found.status).toBe('connected');
      // The focus match must be the only thing added: the discovery list stays bounded.
      expect(withFocus.body.item.matches.length).toBe(withoutFocus.body.item.matches.length + 1);
    }, 60_000);

    it('3.6 The lock order is enforced, not merely documented: while a peer write is inside its transaction it already holds FOR UPDATE on the User and LifeJourney roots', async () => {
      const journeyId = `journey_lock_probe_${Date.now()}`;
      await harness.db.lifeJourney.create({
        data: {
          id: journeyId,
          userId: requester,
          title: '锁探针旅程',
          domain: '生活',
          status: 'active',
          stage: 'clarifying',
          visibility: 'PRIVATE',
        },
      });
      const experience = await harness.peerPersistenceB.createExperience({
        userId: owner,
        title: '锁探针经历',
        domain: '生活',
        stage: 'graduated',
        content: '用于锁探针的公开经历。',
        tags: ['锁探针'],
        consentedAt: new Date().toISOString(),
        status: 'published',
      });

      /** True when a separate connection cannot take FOR UPDATE on the row — i.e. the peer transaction holds it. */
      async function probeHeld(table: string, id: string): Promise<boolean> {
        const probe = new PrismaClient({ datasources: { db: { url: harness.dbUrl } } });
        try {
          await probe.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '500ms'`);
            await tx.$executeRawUnsafe(`SELECT 1 FROM "${table}" WHERE id = $1 FOR UPDATE`, id);
          });
          return false;
        } catch (error) {
          return /lock timeout|55P03/i.test(String((error as Error).message ?? error));
        } finally {
          await probe.$disconnect();
        }
      }

      let userRootHeld = false;
      let journeyRootHeld = false;

      await harness.peerPersistenceA.createMatches(
        [
          {
            userId: requester,
            journeyId,
            peerExperienceId: experience.id,
            score: 0.11,
            reasons: ['锁探针'],
            status: 'suggested',
          },
        ],
        {
          _onAfterLock: async () => {
            userRootHeld = await probeHeld('User', requester);
            journeyRootHeld = await probeHeld('LifeJourney', journeyId);
          },
        },
      );

      expect(userRootHeld).toBe(true);
      expect(journeyRootHeld).toBe(true);
    }, 30_000);
  });

  describe('4. Reference Safety: the omitted-field case (§0.4/A5)', () => {
    it('4.1 A peer row is present in the stale snapshot with its journey FK omitted while another instance has committed a value; the committed value survives the reload and legacy flush', async () => {
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

      const { StoreService } = await import('../../apps/api/src/store.service');
      const storeB = app.get(StoreService);
      await storeB.reloadRuntimeState();

      // The live store refuses to hold a peer row at all (its accessors throw), so the §0.4/A5
      // case is constructed the way the flush actually receives a snapshot: a plain state object
      // handed to `saveRelationalRuntimeState`. That is the same entry point `persistAndFlush`
      // uses, and it is the only way a row can be "present with one FK field omitted".
      const plainState = {
        ...(storeB as unknown as { data: Record<string, unknown> }).data,
      } as Record<string, unknown>;

      const staleExperience: Record<string, unknown> = {
        id: expId,
        userId: owner,
        title: '保留外键经历',
        domain: '关系',
        stage: 'graduated',
        content: '经历文本',
        tags: ['安全'],
        status: 'published',
        consentedAt: new Date().toISOString(),
        reportCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // journeyId deliberately omitted
      };
      const staleMatch: Record<string, unknown> = {
        id: matchId,
        userId: requester,
        peerExperienceId: expId,
        score: 0.95,
        reasons: ['相似'],
        status: 'suggested',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // journeyId deliberately omitted
      };
      expect('journeyId' in staleExperience).toBe(false);
      expect('journeyId' in staleMatch).toBe(false);

      // One client for the three flushes, disconnected at the end: a client left open per call
      // kept connections alive and made the harness teardown time out.
      const flushClient = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
      const flushState = async (peerExperiences: unknown[], peerMatches: unknown[]) => {
        await saveRelationalRuntimeState(flushClient, { ...plainState, peerExperiences, peerMatches } as never);
      };

      // Case A — the row is present with the FK omitted ("no opinion"): the committed value survives.
      await flushState([staleExperience], [staleMatch]);

      const finalExp = await prisma.peerExperience.findUnique({ where: { id: expId } });
      expect(finalExp).not.toBeNull();
      expect(finalExp?.journeyId).toBe(journeyId);

      const finalMatch = await prisma.peerMatch.findUnique({ where: { id: matchId } });
      expect(finalMatch).not.toBeNull();
      expect(finalMatch?.journeyId).toBe(journeyId);
      expect(finalMatch?.peerExperienceId).toBe(expId);

      // Case B — the row is present with the FK **explicitly null**. This is the discriminating
      // case: before the registry exits the flush wrote `journeyId = NULL` here. After Batch 2 the
      // legacy flush has no authority over a peer foreign key at all, so the committed value must
      // still survive.
      await flushState([{ ...staleExperience, journeyId: null }], [{ ...staleMatch, journeyId: null }]);

      const afterExplicitNullExp = await prisma.peerExperience.findUnique({ where: { id: expId } });
      expect(afterExplicitNullExp?.journeyId).toBe(journeyId);
      const afterExplicitNullMatch = await prisma.peerMatch.findUnique({ where: { id: matchId } });
      expect(afterExplicitNullMatch?.journeyId).toBe(journeyId);

      // Case C — the empty-set case, kept from the original test: a row absent from the snapshot is
      // not swept either.
      await flushState([], []);
      expect(await prisma.peerExperience.findUnique({ where: { id: expId } })).not.toBeNull();
      expect(await prisma.peerMatch.findUnique({ where: { id: matchId } })).not.toBeNull();
      await flushClient.$disconnect();

      // And the guard that makes the omitted-field case unreachable in production: the live store
      // refuses to hold a peer row at all, so a real instance can never flush one.
      expect(() => {
        (storeB as unknown as { data: { peerExperiences: unknown[] } }).data.peerExperiences = [];
      }).toThrow(/database-authoritative/);

      // Control for the three-case contract on a model the flush still writes (omit / explicit
      // null / supplied): `batch1-multi-instance.spec.ts` case 8.
    }, 60_000);
  });

  describe('5. SQL Scope & Zero-Legacy-Write Verification (§5, §0.4/A7)', () => {
    const PEER_TABLES = ['PeerExperience', 'PeerMatch', 'PeerConversation', 'PeerMessage', 'PeerReport'];

    /**
     * Tables named by the INSERT/UPDATE/DELETE statements in a captured query log.
     *
     * The target is matched with or without the `"public".` schema prefix. Raw SQL issued by the
     * peer service is unqualified (`UPDATE "PeerConversation" ...`), so a parser that required the
     * prefix would silently miss those writes and let the scope assertion pass vacuously.
     */
    function writtenTables(queries: string[]) {
      const writes = queries.filter((q) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(q));
      const tables = new Set<string>();
      for (const statement of writes) {
        const target = statement.match(
          /^\s*(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:"public"\.)?"(\w+)"/i,
        );
        if (target) tables.add(target[1]);
      }
      return { writes, tables: [...tables] };
    }

    it('5.1 The legacy flush writes nothing at all against the five peer tables: no upsert, no absence sweep', async () => {
      const queries: string[] = [];
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

      const peerQueries = queries.filter((q) => PEER_TABLES.some((table) => q.includes(`"${table}"`)));
      expect(peerQueries.filter((q) => /^\s*DELETE\b/i.test(q))).toHaveLength(0);
      expect(peerQueries.filter((q) => /^\s*(INSERT|UPDATE)\b/i.test(q))).toHaveLength(0);

      await tracedPrisma.$disconnect();
    }, 20_000);

    it('5.2 Every direct peer operation writes only the five peer tables — no operation reaches back into the legacy store', async () => {
      const adminUser = await prisma.adminUser.findFirst();
      expect(adminUser).not.toBeNull();

      const traced = new PrismaClient({
        datasources: { db: { url: process.env.DATABASE_URL } },
        log: [{ emit: 'event', level: 'query' }],
      });
      const tracedPeer = new PeerPersistenceService(traced as never);

      // One listener for the whole test, sliced per operation. Registering and removing a listener
      // per operation leaked (Prisma exposes no `$off`), which produced a MaxListenersExceeded
      // warning and made the captured window ambiguous.
      const allQueries: string[] = [];
      (traced as any).$on('query', (event: { query: string }) => allQueries.push(event.query));

      const observed: Array<{ operation: string; tables: string[]; writes: string[] }> = [];
      async function record(operation: string, run: () => Promise<unknown>) {
        const start = allQueries.length;
        await run();
        const { writes, tables } = writtenTables(allQueries.slice(start));
        observed.push({ operation, tables, writes });
      }

      const { match: baseMatch, expId } = await createFixtureMatch('SqlScope');

      await record('createExperience', () =>
        tracedPeer.createExperience({
          userId: owner,
          title: 'SQL 范围经历',
          domain: '关系',
          stage: 'graduated',
          content: '用于 SQL 范围验证。',
          tags: ['范围'],
          consentedAt: new Date().toISOString(),
          status: 'pending_review',
        }),
      );

      await record('createMatches', () =>
        tracedPeer.createMatches([
          { userId: requester, peerExperienceId: expId, score: 0.5, reasons: ['范围'], status: 'suggested' },
        ]),
      );

      await record('updateMatchRequest', () =>
        tracedPeer.updateMatchRequest(baseMatch.id, requester, 'requested', '范围验证请求。'),
      );
      await record('respondMatch', () => tracedPeer.respondMatch(baseMatch.id, owner, 'connected'));
      await record('consentMatch(first)', () => tracedPeer.consentMatch(baseMatch.id, owner));
      await record('consentMatch(second)', () => tracedPeer.consentMatch(baseMatch.id, requester));
      await record('requireOpenConversation', () => tracedPeer.requireOpenConversation(baseMatch.id, requester));
      await record('sendMessage', () => tracedPeer.sendMessage(baseMatch.id, requester, '范围验证消息'));
      await record('reportConversation', () => tracedPeer.reportConversation(baseMatch.id, requester, '范围验证举报'));
      await record('closeConversation', () => tracedPeer.closeConversation(baseMatch.id, owner, 'closed'));
      await record('saveConversationFeedback', () =>
        tracedPeer.saveConversationFeedback(baseMatch.id, requester, 'helpful', '范围验证感受'),
      );
      await record('expireDueConversations', () => tracedPeer.expireDueConversations());

      // The remaining write paths, so the captured set is every direct operation and not a subset:
      // the experience edit/review paths and the admin report handler were previously omitted.
      const created = await tracedPeer.createExperience({
        userId: owner,
        title: 'SQL 范围待审经历',
        domain: '关系',
        stage: 'graduated',
        content: '用于 updateExperience 与 reviewExperience 的范围验证。',
        tags: ['范围'],
        consentedAt: new Date().toISOString(),
        status: 'pending_review',
      });
      await record('updateExperience', () =>
        tracedPeer.updateExperience(created.id, owner, { content: '编辑后的经历内容。' }),
      );
      await record('reviewExperience', () =>
        tracedPeer.reviewExperience(created.id, adminUser!.id, 'published'),
      );

      const { report: scopedReport } = await tracedPeer.reportConversation(baseMatch.id, requester, '范围验证举报二');
      await record('handleReport', () => tracedPeer.handleReport(scopedReport.id, adminUser!.id, 'handled'));

      // A second match fixture, so the block paths are exercised on a fresh row.
      const { match: blockMatch } = await createFixtureMatch('SqlScopeBlock');
      await record('blockMatchDirect', () => tracedPeer.blockMatchDirect(blockMatch.id, owner));
      const { match: blockConvMatch } = await createFixtureMatch('SqlScopeBlockConv');
      await tracedPeer.updateMatchRequest(blockConvMatch.id, requester, 'requested', '范围验证请求。');
      await tracedPeer.respondMatch(blockConvMatch.id, owner, 'connected');
      await tracedPeer.consentMatch(blockConvMatch.id, owner);
      await tracedPeer.consentMatch(blockConvMatch.id, requester);
      await record('blockConversation', () => tracedPeer.blockConversation(blockConvMatch.id, owner));

      // Asserted after every operation has been recorded, so the loop covers the whole write set
      // rather than a prefix of it.
      //
      // The contract is not literally "peer tables only": the two audited admin actions
      // (`reviewExperience`, `handleReport`) also append to `AuditLog` by design. That is the only
      // non-peer table any peer operation may write, and only for those two — anything else means
      // an operation reached back into the legacy store.
      const AUDITED_OPERATIONS = new Set(['reviewExperience', 'handleReport']);
      expect(observed.length).toBeGreaterThanOrEqual(17);
      for (const entry of observed) {
        const allowed = AUDITED_OPERATIONS.has(entry.operation)
          ? [...PEER_TABLES, 'AuditLog']
          : PEER_TABLES;
        const unexpected = entry.tables.filter((table) => !allowed.includes(table));
        expect({ operation: entry.operation, unexpected }).toEqual({ operation: entry.operation, unexpected: [] });
        expect(entry.writes.filter((q) => /^\s*DELETE\b/i.test(q))).toHaveLength(0);
      }

      await traced.$disconnect();
    }, 60_000);
  });

  describe('6. Notification failure after a committed transition', () => {
    it('6.1 A notification write that fails leaves the peer transition committed, records the obligation and reports it as pending', async () => {
      const server = app.getHttpServer();
      const { match } = await createFixtureMatch('NotifyFailure');

      await request(server)
        .patch(`/api/v1/peer-matches/${match.id}`)
        .set('x-goodnight-user-id', requester)
        .send({ status: 'requested', requestReason: '通知失败语义验证。' })
        .expect(200);
      await request(server)
        .post(`/api/v1/peer-matches/${match.id}/respond`)
        .set('x-goodnight-user-id', owner)
        .send({ status: 'connected' })
        .expect(201);

      const { StoreService } = await import('../../apps/api/src/store.service');
      const { Batch1PersistenceService } = await import('../../apps/api/src/batch1-persistence.service');
      const store = app.get(StoreService);
      const batch1 = app.get(Batch1PersistenceService);

      // Both consents first, so the activation notification has already been delivered and the
      // injected failure lands on the close's notification, which is the transition under test.
      const consentRes = await request(server)
        .post(`/api/v1/peer-matches/${match.id}/consent`)
        .set('x-goodnight-user-id', owner)
        .send({})
        .expect(201);
      expect(consentRes.body.conversation).toBeNull();
      const activationRes = await request(server)
        .post(`/api/v1/peer-matches/${match.id}/consent`)
        .set('x-goodnight-user-id', requester)
        .send({})
        .expect(201);
      expect(activationRes.body.conversation).not.toBeNull();
      expect(activationRes.body.notificationPending).toBe(false);

      const failuresBefore = store.peerNotificationFailures.length;
      const spy = vi
        .spyOn(batch1, 'upsertPeerNotification')
        .mockRejectedValueOnce(new Error('injected notification failure'));

      const closeRes = await request(server)
        .post(`/api/v1/peer-conversations/${match.id}/close`)
        .set('x-goodnight-user-id', owner)
        .send({})
        .expect(201);

      spy.mockRestore();

      // The transition is committed and the response says so, while the undelivered notification
      // is reported instead of being presented as a failure of the transition.
      expect(closeRes.body.notificationPending).toBe(true);
      const dbConv = await prisma.peerConversation.findUnique({ where: { matchId: match.id } });
      expect(dbConv?.status).toBe('closed');
      expect(dbConv?.closedReason).toBe('closed');

      expect(store.peerNotificationFailures.length).toBeGreaterThan(failuresBefore);
      expect(store.peerNotificationFailures.at(-1)?.message).toContain('injected notification failure');

      // The obligation is retryable: the deterministic id means a later successful write produces
      // exactly one row, not a duplicate.
      await batch1.upsertPeerNotification({
        userId: owner,
        type: 'CONVERSATION_CLOSED',
        suffix: `closed_${dbConv!.id}`,
        title: '这段同行到这里了',
        body: '重试写入',
        targetRoute: `/pages/peer/conversation?matchId=${encodeURIComponent(match.id)}`,
      });
      const notifications = await prisma.userNotification.findMany({
        where: { id: `notification_peer_closed_${dbConv!.id}_${owner}` },
      });
      expect(notifications).toHaveLength(1);
    }, 30_000);
  });

  describe('7. Model-generated peer draft PII boundary (review P1-5)', () => {
    const PHONE = '13800138000';
    const EMAIL = 'helper@example.com';

    async function waitForTerminalJob(jobId: string, timeoutMs = 20_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const row = await prisma.aIJob.findUnique({ where: { id: jobId } });
        if (row && !['queued', 'running'].includes(row.status)) return row;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`AI job ${jobId} did not reach a terminal state within ${timeoutMs}ms`);
    }

    it('7.1 A completion whose draft and reminders carry a phone number and an email is redacted at persistence and at the response boundary', async () => {
      const server = app.getHttpServer();
      const { match } = await createFixtureMatch('AssistPii');
      await request(server)
        .patch(`/api/v1/peer-matches/${match.id}`)
        .set('x-goodnight-user-id', requester)
        .send({ status: 'requested', requestReason: 'AI 草稿隐私验证。' })
        .expect(200);
      await request(server)
        .post(`/api/v1/peer-matches/${match.id}/respond`)
        .set('x-goodnight-user-id', owner)
        .send({ status: 'connected' })
        .expect(201);
      await app.get(PeerPersistenceService).consentMatch(match.id, owner);
      await app.get(PeerPersistenceService).consentMatch(match.id, requester);

      const { StoreService } = await import('../../apps/api/src/store.service');
      const { RemoteAiProviderService, DAPI_PROVIDER_ID } = await import(
        '../../apps/api/src/remote-ai-provider.service'
      );
      const store = app.get(StoreService);
      const remoteAi = app.get(RemoteAiProviderService);

      let provider = store.aiProviders.find((item) => item.id === DAPI_PROVIDER_ID);
      if (!provider) {
        provider = { ...remoteAi.primaryDefinition(), enabled: true };
        store.aiProviders.unshift(provider);
      }
      const previousEnabled = provider.enabled;
      provider.enabled = true;

      // The model's own output is the untrusted side of this boundary: it repeats identifiers the
      // other party wrote. Injecting the completion is what makes the redaction observable.
      const generateSpy = vi.spyOn(remoteAi, 'generate').mockResolvedValue({
        model: 'deepseek-chat',
        result: JSON.stringify({
          draft: `你可以加我微信 ${PHONE}，也可以发邮件到 ${EMAIL} 问我。`,
          reminders: [`先别急着回，号码 ${PHONE} 我留在这里了。`],
        }),
        durationMs: 30,
      });

      let jobId = '';
      try {
        const assist = await request(server)
          .post(`/api/v1/peer-conversations/${match.id}/assist`)
          .set('x-goodnight-user-id', requester)
          .send({ content: '我想把这段话整理一下。' })
          .expect(201);
        jobId = assist.body.job.id;
        expect(jobId).toBeTruthy();

        const row = await waitForTerminalJob(jobId);
        expect(row.status).toBe('succeeded');

        // Persistence boundary: what was written to PostgreSQL is already redacted.
        expect(row.result).not.toContain(PHONE);
        expect(row.result).not.toContain(EMAIL);
        const stored = JSON.stringify(row.structuredResult ?? {});
        expect(stored).not.toContain(PHONE);
        expect(stored).not.toContain(EMAIL);
        expect(stored).toContain('已隐藏');
      } finally {
        generateSpy.mockRestore();
        provider.enabled = previousEnabled;
      }

      // Response boundary: nothing the client receives may carry the identifiers either.
      const status = await request(server)
        .get(`/api/v1/ai/tasks/${jobId}`)
        .set('x-goodnight-user-id', requester)
        .expect(200);
      const payload = JSON.stringify(status.body);
      expect(payload).not.toContain(PHONE);
      expect(payload).not.toContain(EMAIL);
      expect(payload).toContain('已隐藏');

      // A draft is still only a draft: no message may have been written by the assist path.
      const conv = await prisma.peerConversation.findUnique({ where: { matchId: match.id } });
      expect(await prisma.peerMessage.count({ where: { conversationId: conv!.id } })).toBe(0);
    }, 60_000);

    it('7.2 The response boundary redacts on read, independently of what persistence stored', async () => {
      const server = app.getHttpServer();
      const { StoreService } = await import('../../apps/api/src/store.service');
      const store = app.get(StoreService);
      const userId = store.resolveRuntimeUserId(requester);

      // A row written by an older build, or by any other writer, must still not leak on read.
      const jobId = `job_peer_assist_raw_${Date.now()}`;
      await prisma.aIJob.create({
        data: {
          id: jobId,
          userId,
          contentId: 'peer_conversation_raw',
          contentType: 'PeerConversation',
          jobType: 'peer_response_assist',
          taskType: 'peer_response_assist',
          style: 'warm',
          providerId: 'provider_dapi_deepseek',
          modelName: 'deepseek-chat',
          status: 'succeeded',
          promptSummary: '未脱敏的历史草稿',
          result: `草稿里带着 ${PHONE} 和 ${EMAIL}`,
          structuredResult: { draft: `草稿里带着 ${PHONE}`, reminders: [EMAIL] },
          durationMs: 10,
          traceJson: [],
        },
      });

      const status = await request(server)
        .get(`/api/v1/ai/tasks/${jobId}`)
        .set('x-goodnight-user-id', requester)
        .expect(200);
      const payload = JSON.stringify(status.body);
      expect(payload).not.toContain(PHONE);
      expect(payload).not.toContain(EMAIL);
      expect(payload).toContain('已隐藏');

      const latest = await request(server)
        .get('/api/v1/ai/tasks/latest?taskType=peer_response_assist')
        .set('x-goodnight-user-id', requester)
        .expect(200);
      const latestPayload = JSON.stringify(latest.body);
      expect(latestPayload).not.toContain(PHONE);
      expect(latestPayload).not.toContain(EMAIL);
    }, 30_000);
  });
});
