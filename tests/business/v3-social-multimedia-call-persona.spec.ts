import { describe, expect, it } from 'vitest';
import { SocialMultimediaService } from '../../apps/api/src/social-multimedia.service.js';
import { AiPersonaService } from '../../apps/api/src/ai-persona.service.js';
import { StoreService } from '../../apps/api/src/store.service.js';

describe('V3 Social Multimedia, Call Signaling and AI Persona Contracts', () => {
  describe('1. Sticker System & Deduplication', () => {
    it('provides standard curated sticker library with tag search and favorites', () => {
      const social = new SocialMultimediaService();
      const list = social.listStickers('user_test_01');
      expect(list.length).toBeGreaterThanOrEqual(8);
      expect(list.every((s) => s.id && s.name && s.url && s.category && s.tags)).toBe(true);

      // Favorite toggle
      const firstId = list[0].id;
      expect(list[0].isFavorite).toBe(false);

      social.addFavoriteSticker('user_test_01', firstId);
      const afterAdd = social.listStickers('user_test_01');
      expect(afterAdd[0].isFavorite).toBe(true);
      expect(social.getUserFavoriteStickerIds('user_test_01')).toContain(firstId);

      social.removeFavoriteSticker('user_test_01', firstId);
      const afterRemove = social.listStickers('user_test_01');
      expect(afterRemove[0].isFavorite).toBe(false);
      expect(social.getUserFavoriteStickerIds('user_test_01')).not.toContain(firstId);
    });

    it('allocates strictly monotonic sequence numbers per conversation', () => {
      const social = new SocialMultimediaService();
      const s1 = social.getNextSeq('conv_1');
      const s2 = social.getNextSeq('conv_1');
      const s3 = social.getNextSeq('conv_1');
      expect(s1).toBe(1);
      expect(s2).toBe(2);
      expect(s3).toBe(3);

      // Separate conversation starts at 1
      const otherSeq = social.getNextSeq('conv_2');
      expect(otherSeq).toBe(1);
    });

    it('deduplicates messages with the same clientMsgId', () => {
      const social = new SocialMultimediaService();
      const clientMsgId = 'client_uuid_abc';
      expect(social.isDuplicateMessage('conv_1', clientMsgId)).toBeNull();

      social.recordClientMessage('conv_1', clientMsgId, 'msg_001');
      expect(social.isDuplicateMessage('conv_1', clientMsgId)).toBe('msg_001');

      // Different clientMsgId is not duplicate
      expect(social.isDuplicateMessage('conv_1', 'other_id')).toBeNull();
    });
  });

  describe('2. Real-time Audio/Video Call Signaling & Anonymous Protection', () => {
    it('executes call lifecycle and strips internal user IDs for client', () => {
      const social = new SocialMultimediaService();
      const matchId = 'match_test_01';
      const convId = 'conv_test_01';

      // 1. Caller offers a call
      const offer = social.createCallOffer(matchId, convId, 'user_caller', 'user_callee', 'AUDIO');
      expect(offer.id).toBeDefined();
      expect(offer.callType).toBe('AUDIO');
      expect(offer.status).toBe('OFFERED');

      // 2. Client status check MUST NOT leak callerUserId or calleeUserId
      const callerClientStatus = social.getCallStatusForClient(matchId, 'user_caller');
      expect(callerClientStatus).toBeDefined();
      expect(callerClientStatus?.isIncoming).toBe(false);
      expect((callerClientStatus as any).callerUserId).toBeUndefined();
      expect((callerClientStatus as any).calleeUserId).toBeUndefined();

      const calleeClientStatus = social.getCallStatusForClient(matchId, 'user_callee');
      expect(calleeClientStatus?.isIncoming).toBe(true);

      // 3. Callee accepts the call
      const accepted = social.respondCall(matchId, 'user_callee', offer.id, 'ACCEPT');
      expect(accepted.status).toBe('ACCEPTED');
      expect(accepted.startedAt).toBeDefined();

      // 4. End the call
      const { call: ended, durationSeconds } = social.endCall(matchId, 'user_caller', offer.id);
      expect(ended.status).toBe('ENDED');
      expect(typeof durationSeconds).toBe('number');
    });

    it('rejects duplicate concurrent call offers while one is ringing', () => {
      const social = new SocialMultimediaService();
      social.createCallOffer('match_test_02', 'conv_02', 'user_a', 'user_b', 'VIDEO');
      expect(() => {
        social.createCallOffer('match_test_02', 'conv_02', 'user_a', 'user_b', 'VIDEO');
      }).toThrow('已有正在响铃的通话请求');
    });

    it('handles call declined by callee', () => {
      const social = new SocialMultimediaService();
      const offer = social.createCallOffer('match_test_03', 'conv_03', 'user_a', 'user_b', 'AUDIO');
      const declined = social.respondCall('match_test_03', 'user_b', offer.id, 'DECLINED');
      expect(declined.status).toBe('DECLINED');
    });
  });

  describe('3. AI Persona Architecture, Dynamic Memory Filtering & Prototype Safety', () => {
    it('composes prompt strictly prioritizing SystemSafetyPolicy and filters expired memories', () => {
      const aiPersona = new AiPersonaService();

      // Case A: User consented with memories, but one is expired and one is deleted
      const promptConsented = aiPersona.assemblePrompt({
        taskType: 'today_letter',
        personaId: 'gentle_listener',
        taskInstruction: '写一封温暖的信',
        userContent: '今天工作遇到一些挫折',
        allowAiMemoryUse: true,
        memories: [
          {
            id: 'mem_valid',
            userId: 'u1',
            title: '近期困惑',
            content: '项目进度比较紧张',
            scope: 'all_ai',
            status: 'active',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
          {
            id: 'mem_expired',
            userId: 'u1',
            title: '已过期的困惑',
            content: '旧的过期秘密信息',
            scope: 'all_ai',
            status: 'active',
            expiresAt: new Date(Date.now() - 86400000).toISOString(),
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-01T00:00:00.000Z',
          },
          {
            id: 'mem_deleted',
            userId: 'u1',
            title: '已删除的记忆',
            content: '用户删除的机密信息',
            scope: 'all_ai',
            status: 'deleted',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
        ],
      });

      // System safety is at the very beginning
      expect(promptConsented.indexOf('【系统最高安全规则】')).toBe(0);
      expect(promptConsented).toContain('温和倾听者');
      expect(promptConsented).toContain('项目进度比较紧张');
      // Expired and deleted memories are filtered out completely
      expect(promptConsented).not.toContain('旧的过期秘密信息');
      expect(promptConsented).not.toContain('用户删除的机密信息');

      // Case B: User revoked memory consent (allowAiMemoryUse = false)
      const promptRevoked = aiPersona.assemblePrompt({
        taskType: 'today_letter',
        personaId: 'gentle_listener',
        taskInstruction: '写一封温暖的信',
        userContent: '今天工作遇到一些挫折',
        allowAiMemoryUse: false,
        memories: [
          {
            id: 'mem_valid',
            userId: 'u1',
            title: '有效但未授权',
            content: '机密个人隐私信息绝对不能泄露',
            scope: 'all_ai',
            status: 'active',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
        ],
      });

      // Zero leakage of revoked memory
      expect(promptRevoked).toContain('用户未授权引用任何历史记忆');
      expect(promptRevoked).not.toContain('机密个人隐私信息绝对不能泄露');
    });

    it('rejects invalid or prototype persona IDs against injection', () => {
      const aiPersona = new AiPersonaService();
      expect(() => aiPersona.setUserPersona('u1', 'constructor')).toThrow('无效的人格标识');
      expect(() => aiPersona.setUserPersona('u1', '__proto__')).toThrow('无效的人格标识');
      expect(() => aiPersona.setUserPersona('u1', 'random_hacker')).toThrow('无效的人格标识');

      // Valid persona succeeds
      aiPersona.setUserPersona('u1', 'rational_clarifier');
      expect(aiPersona.getUserPersona('u1').id).toBe('rational_clarifier');
    });
  });

  describe('4. StoreService Integration for Rich Messaging & Recall', () => {
    it('supports rich message sending, server-side verified quote and 2-minute message recall', async () => {
      const store = new StoreService({} as any);

      const starterId = 'user_alice';
      const receiverId = 'user_bob';
      const matchId = 'match_rich_test';

      store.users.push(
        {
          id: starterId,
          nickname: 'Alice',
          anonymousCode: 'ANON_A',
          openid: 'oa',
          avatarUrl: '',
          status: 'normal',
          createdAt: new Date().toISOString(),
        },
        {
          id: receiverId,
          nickname: 'Bob',
          anonymousCode: 'ANON_B',
          openid: 'ob',
          avatarUrl: '',
          status: 'normal',
          createdAt: new Date().toISOString(),
        },
      );

      const messages: any[] = [];
      const mockPeerPersistence = {
        getConversationByMatchId: async (mId: string) => ({
          id: 'conv_rich_test',
          matchId: mId,
          starterUserId: starterId,
          receiverUserId: receiverId,
          status: 'active',
          expiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
        }),
        requireConversation: async (mId: string, uId: string) => ({
          conversation: {
            id: 'conv_rich_test',
            matchId: mId,
            starterUserId: starterId,
            receiverUserId: receiverId,
            status: 'active',
            expiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
          },
          userId: uId,
        }),
        sendMessage: async (mId: string, sender: string, content: string, hooks: any, extraMeta: any) => {
          const newMsg = {
            id: `msg_${messages.length + 1}`,
            conversationId: 'conv_rich_test',
            senderUserId: sender,
            content,
            authorType: 'HUMAN',
            createdAt: new Date().toISOString(),
            piiFlags: extraMeta,
            msgType: extraMeta?.msgType,
            replyToId: extraMeta?.replyToId,
            replyToContent: extraMeta?.replyToContent,
            mediaUrl: extraMeta?.mediaUrl,
            clientMsgId: extraMeta?.clientMsgId,
          };
          messages.push(newMsg);
          return newMsg;
        },
        getMessagesForConversation: async () => messages,
        recallMessage: async (_mId: string, sender: string, messageId: string) => {
          const target = messages.find((m) => m.id === messageId);
          if (!target) throw new Error('消息不存在');
          if (target.senderUserId !== sender) throw new Error('只有发送方可以撤回消息');
          target.content = '一条消息已撤回';
          target.recalledAt = new Date().toISOString();
          delete target.mediaUrl;
          delete target.replyToContent;
          return target;
        },
      };

      (store as any).peerPersistence = mockPeerPersistence;
      (store as any).expirePeerConversations = async () => {};

      // 1. Send sticker message with clientMsgId
      const stickerRes = await store.sendPeerMessage(
        matchId,
        {
          msgType: 'STICKER',
          content: '[表情包: 暖心拥抱]',
          mediaUrl: 'data:image/svg+xml;utf8,<svg></svg>',
          clientMsgId: 'cmsg_1001',
        },
        starterId,
      );
      expect(stickerRes.item.id).toBeDefined();
      expect(stickerRes.item.msgType).toBe('STICKER');
      expect(stickerRes.item.content).toContain('暖心拥抱');

      // Deduplication: sending same clientMsgId returns existing message
      const dupRes = await store.sendPeerMessage(
        matchId,
        {
          msgType: 'STICKER',
          content: '[表情包: 暖心拥抱]',
          clientMsgId: 'cmsg_1001',
        },
        starterId,
      );
      expect(dupRes.item.id).toBe(stickerRes.item.id);

      // 2. Client cannot manually post CALL_LOG
      await expect(
        store.sendPeerMessage(matchId, { msgType: 'CALL_LOG', content: '假通话' }, starterId),
      ).rejects.toThrow('不能手动发送通话记录');

      // 3. Send text message quoting previous message (quote content is derived server-side)
      const replyRes = await store.sendPeerMessage(
        matchId,
        {
          msgType: 'TEXT',
          content: '我也抱抱你',
          replyToId: stickerRes.item.id,
        },
        receiverId,
      );
      expect(replyRes.item.msgType).toBe('TEXT');
      expect(replyRes.item.replyToId).toBe(stickerRes.item.id);
      expect(replyRes.item.replyToContent).toContain('暖心拥抱');

      // 4. Sender recalls their own message within 2 minutes
      const recallRes = await store.recallPeerMessage(matchId, replyRes.item.id, receiverId);
      expect(recallRes.item.content).toBe('一条消息已撤回');
      expect(recallRes.item.recalledAt).toBeDefined();
      expect(recallRes.item.mediaUrl).toBeUndefined();

      // 5. Other user cannot recall someone else's message
      await expect(
        store.recallPeerMessage(matchId, stickerRes.item.id, receiverId),
      ).rejects.toThrow('只有发送方可以撤回消息');

      // 6. Quoting a message that has been recalled masks quote content to '一条消息已撤回'
      const quoteRecalledRes = await store.sendPeerMessage(
        matchId,
        {
          msgType: 'TEXT',
          content: '你刚才说了什么呀？',
          replyToId: replyRes.item.id,
        },
        starterId,
      );
      expect(quoteRecalledRes.item.replyToContent).toBe('一条消息已撤回');

      // 7. Non-sticker message has mediaUrl stripped
      const textWithMedia = await store.sendPeerMessage(
        matchId,
        {
          msgType: 'TEXT',
          content: '纯文字消息',
          mediaUrl: 'https://malicious-tracking.com/pixel.png',
        },
        starterId,
      );
      expect(textWithMedia.item.mediaUrl).toBeUndefined();

      // 8. syncPeerConversation honors afterSeq, syncs recalled tombstones and masks quoted text on recall
      const syncResult = await store.syncPeerConversation(matchId, 2, starterId);
      expect(syncResult.messages.length).toBeGreaterThan(0);
      expect(syncResult.call).toBeNull();
      // Recalled message is included in sync even if its seq <= afterSeq
      expect(syncResult.messages.some((m) => m.id === replyRes.item.id)).toBe(true);

      // Full sync verifies that quote targeting a recalled message has replyToContent masked
      const syncFull = await store.syncPeerConversation(matchId, 0, starterId);
      const quoteInSync = syncFull.messages.find((m) => m.id === quoteRecalledRes.item.id);
      expect(quoteInSync?.replyToContent).toBe('一条消息已撤回');
    });
  });

  describe('5. PublicController HTTP Parameter Forwarding & Validation', () => {
    it('forwards whitelisted fields (msgType, replyToId, mediaUrl, clientMsgId) from controller body to store', async () => {
      const { PublicController } = await import('../../apps/api/src/controllers.js');
      const { runWithIdentity } = await import('../../apps/api/src/anonymous-session.service.js');

      let capturedPayload: any = null;
      const mockStore = {
        sendPeerMessage: async (_mId: string, payload: any, _uId: string) => {
          capturedPayload = payload;
          return { item: { id: 'msg_test', ...payload } };
        },
      } as any;

      const controller = new PublicController(mockStore, {} as any, {} as any);

      await runWithIdentity({ userId: 'u_alice', sessionId: 's1' }, async () => {
        await controller.peerMessage(
          'match_01',
          {
            content: '[表情包: 暖心]',
            msgType: 'STICKER',
            replyToId: 'msg_000',
            mediaUrl: 'data:image/svg+xml;utf8,<svg></svg>',
            clientMsgId: 'cmsg_forward_01',
            __internal: true, // Should be stripped by controller whitelist!
          } as any,
          'u_alice',
        );
      });

      expect(capturedPayload).toBeDefined();
      expect(capturedPayload.content).toBe('[表情包: 暖心]');
      expect(capturedPayload.msgType).toBe('STICKER');
      expect(capturedPayload.replyToId).toBe('msg_000');
      expect(capturedPayload.mediaUrl).toBe('data:image/svg+xml;utf8,<svg></svg>');
      expect(capturedPayload.clientMsgId).toBe('cmsg_forward_01');
      expect(capturedPayload.__internal).toBeUndefined(); // Stripped!
    });

    it('rejects invalid or missing personaId on POST /me/ai-persona', async () => {
      const { PublicController } = await import('../../apps/api/src/controllers.js');
      const { runWithIdentity } = await import('../../apps/api/src/anonymous-session.service.js');

      const mockStore = {
        setAiPersona: (_id: string) => {},
      } as any;
      const controller = new PublicController(mockStore, {} as any, {} as any);

      await runWithIdentity({ userId: 'u_alice', sessionId: 's1' }, async () => {
        await expect(controller.setAiPersona({} as any, 'u_alice')).rejects.toThrow('缺少有效的人格标识');
        await expect(controller.setAiPersona({ personaId: 123 as any }, 'u_alice')).rejects.toThrow('缺少有效的人格标识');
        await expect(controller.setAiPersona(null as any, 'u_alice')).rejects.toThrow('缺少有效的人格标识');
      });
    });
  });
});
