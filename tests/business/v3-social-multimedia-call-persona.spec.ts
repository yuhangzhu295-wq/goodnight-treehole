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

  describe('2. Real-time Audio/Video Call Signaling Lifecycle', () => {
    it('executes full call lifecycle: offer -> accept -> end with duration', () => {
      const social = new SocialMultimediaService();
      const matchId = 'match_test_01';
      const convId = 'conv_test_01';

      // 1. Caller offers a call
      const offer = social.createCallOffer(matchId, convId, 'user_caller', 'user_callee', 'AUDIO');
      expect(offer.id).toBeDefined();
      expect(offer.callType).toBe('AUDIO');
      expect(offer.status).toBe('OFFERED');
      expect(Date.parse(offer.expiresAt)).toBeGreaterThan(Date.now());

      // 2. Caller checking status sees OFFERED
      const callerStatus = social.getCallStatus(matchId, 'user_caller');
      expect(callerStatus?.status).toBe('OFFERED');

      // 3. Callee accepts the call
      const accepted = social.respondCall(matchId, 'user_callee', offer.id, 'ACCEPT');
      expect(accepted.status).toBe('ACCEPTED');
      expect(accepted.startedAt).toBeDefined();
      expect(accepted.roomToken).toBeDefined();

      // 4. End the call
      const { call: ended, durationSeconds } = social.endCall(matchId, 'user_caller', offer.id);
      expect(ended.status).toBe('ENDED');
      expect(ended.endedAt).toBeDefined();
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

  describe('3. AI Persona Architecture & Dynamically Scoped Memory', () => {
    it('composes prompt strictly prioritizing SystemSafetyPolicy over persona and memory', () => {
      const aiPersona = new AiPersonaService();

      // Case A: User consented with memories
      const promptConsented = aiPersona.assemblePrompt({
        taskType: 'today_letter',
        personaId: 'gentle_listener',
        taskInstruction: '写一封温暖的信',
        userContent: '今天工作遇到一些挫折',
        allowAiMemoryUse: true,
        memories: [
          {
            id: 'mem_1',
            userId: 'u1',
            title: '近期困惑',
            content: '项目进度比较紧张',
            scope: 'all_ai',
            status: 'active',
            expiresAt: '2026-12-31T00:00:00.000Z',
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
        ],
      });

      // System safety is at the very beginning
      expect(promptConsented.indexOf('【系统最高安全规则】')).toBe(0);
      expect(promptConsented).toContain('温和倾听者');
      expect(promptConsented).toContain('项目进度比较紧张');

      // Case B: User revoked memory consent (allowAiMemoryUse = false)
      const promptRevoked = aiPersona.assemblePrompt({
        taskType: 'today_letter',
        personaId: 'gentle_listener',
        taskInstruction: '写一封温暖的信',
        userContent: '今天工作遇到一些挫折',
        allowAiMemoryUse: false,
        memories: [
          {
            id: 'mem_1',
            userId: 'u1',
            title: '已撤销的记忆',
            content: '机密个人隐私信息绝对不能泄露',
            scope: 'all_ai',
            status: 'active',
            expiresAt: '2026-12-31T00:00:00.000Z',
            createdAt: '2026-10-01T00:00:00.000Z',
            updatedAt: '2026-10-01T00:00:00.000Z',
          },
        ],
      });

      // Zero leakage of revoked memory
      expect(promptRevoked).toContain('用户未授权引用任何历史记忆');
      expect(promptRevoked).not.toContain('机密个人隐私信息绝对不能泄露');
    });

    it('switches persona profiles and persists user preferences', () => {
      const aiPersona = new AiPersonaService();
      const def = aiPersona.getUserPersona('user_x');
      expect(def.id).toBe('night_companion');

      aiPersona.setUserPersona('user_x', 'rational_clarifier');
      const updated = aiPersona.getUserPersona('user_x');
      expect(updated.id).toBe('rational_clarifier');
      expect(updated.name).toBe('理性梳理官');
    });
  });

  describe('4. StoreService Integration for Rich Messaging & Recall', () => {
    it('supports rich message sending, quoted reply and 2-minute message recall', async () => {
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
        sendMessage: async (mId: string, sender: string, content: string, extraMeta: any) => {
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
          mediaUrl: 'data:image/svg+xml;sample',
          clientMsgId: 'cmsg_1001',
        },
        starterId,
      );
      expect(stickerRes.item.id).toBeDefined();
      expect(stickerRes.item.msgType).toBe('STICKER');
      expect(stickerRes.item.content).toContain('暖心拥抱');
      expect(stickerRes.item.author).toBe('self');

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

      // 2. Send text message quoting previous message
      const replyRes = await store.sendPeerMessage(
        matchId,
        {
          msgType: 'TEXT',
          content: '我也抱抱你',
          replyToId: stickerRes.item.id,
          replyToContent: stickerRes.item.content,
        },
        receiverId,
      );
      expect(replyRes.item.msgType).toBe('TEXT');
      expect(replyRes.item.replyToId).toBe(stickerRes.item.id);
      expect(replyRes.item.replyToContent).toContain('暖心拥抱');

      // 3. Sender recalls their own message within 2 minutes
      const recallRes = await store.recallPeerMessage(matchId, replyRes.item.id, receiverId);
      expect(recallRes.item.content).toBe('一条消息已撤回');
      expect(recallRes.item.recalledAt).toBeDefined();

      // 4. Other user cannot recall someone else's message
      await expect(
        store.recallPeerMessage(matchId, stickerRes.item.id, receiverId),
      ).rejects.toThrow('只有发送方可以撤回消息');
    });
  });
});
