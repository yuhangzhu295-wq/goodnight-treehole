import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { PeerCallSession, PeerCallType, StickerItem } from '@goodnight/shared-types';

export interface StickerFavoriteRecord {
  userId: string;
  stickerId: string;
  createdAt: string;
}

export interface CallSignalingRecord extends PeerCallSession {
  roomToken?: string;
  expiresAt: string;
}

@Injectable()
export class SocialMultimediaService {
  /** In-memory sticker library (safe curated stickers with strict tag sanitization) */
  private readonly stickers: StickerItem[] = [
    {
      id: 'stk_01',
      name: '暖心拥抱',
      category: '温暖陪伴',
      url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="%23e0f2fe"/><text x="50" y="58" font-size="36" text-anchor="middle">🫂</text></svg>',
      tags: ['拥抱', '安慰', '温暖'],
    },
    {
      id: 'stk_02',
      name: '递一杯热茶',
      category: '温暖陪伴',
      url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="%23fef3c7"/><text x="50" y="58" font-size="36" text-anchor="middle">🍵</text></svg>',
      tags: ['喝茶', '休息', '放松'],
    },
    {
      id: 'stk_03',
      name: '静静听你说',
      category: '温暖陪伴',
      url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="%23f3e8ff"/><text x="50" y="58" font-size="36" text-anchor="middle">👂</text></svg>',
      tags: ['倾听', '理解', '在这里'],
    },
    {
      id: 'stk_04',
      name: '深呼吸一下',
      category: '日常抚慰',
      url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="%23dcfce7"/><text x="50" y="58" font-size="36" text-anchor="middle">🍃</text></svg>',
      tags: ['深呼吸', '平复', '放松'],
    },
    {
      id: 'stk_05',
      name: '点亮一盏微光',
      category: '日常抚慰',
      url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="%23fef9c3"/><text x="50" y="58" font-size="36" text-anchor="middle">🕯️</text></svg>',
      tags: ['微光', '陪伴', '黑夜'],
    },
    {
      id: 'stk_06',
      name: '晚安好梦',
      category: '日常抚慰',
      url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="%23e0e7ff"/><text x="50" y="58" font-size="36" text-anchor="middle">🌙</text></svg>',
      tags: ['晚安', '好梦', '睡眠'],
    },
    {
      id: 'stk_07',
      name: '今天辛苦了',
      category: '情绪气泡',
      url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="%23fee2e2"/><text x="50" y="58" font-size="36" text-anchor="middle">☕</text></svg>',
      tags: ['辛苦了', '歇歇', '理解'],
    },
    {
      id: 'stk_08',
      name: '慢慢来，不着急',
      category: '情绪气泡',
      url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="%23ecfdf5"/><text x="50" y="58" font-size="36" text-anchor="middle">🕊️</text></svg>',
      tags: ['慢慢来', '放轻松', '接纳'],
    },
  ];

  /** User favorites store */
  private favorites: StickerFavoriteRecord[] = [];

  /** Active and recent call sessions: matchId -> CallSignalingRecord */
  private activeCalls = new Map<string, CallSignalingRecord>();

  /** Sequence counters for conversation messages: conversationId -> lastSeq */
  private conversationSeqMap = new Map<string, number>();

  /** Deduplication cache: `${conversationId}:${clientMsgId}` -> messageId */
  private deduplicationMap = new Map<string, string>();

  getNextSeq(conversationId: string): number {
    const current = this.conversationSeqMap.get(conversationId) ?? 0;
    const next = current + 1;
    this.conversationSeqMap.set(conversationId, next);
    return next;
  }

  isDuplicateMessage(conversationId: string, clientMsgId?: string): string | null {
    if (!clientMsgId) return null;
    return this.deduplicationMap.get(`${conversationId}:${clientMsgId}`) ?? null;
  }

  recordClientMessage(conversationId: string, clientMsgId: string, messageId: string): void {
    this.deduplicationMap.set(`${conversationId}:${clientMsgId}`, messageId);
  }

  listStickers(userId: string): StickerItem[] {
    const userFavs = new Set(
      this.favorites.filter((f) => f.userId === userId).map((f) => f.stickerId),
    );
    return this.stickers.map((s) => ({
      ...s,
      isFavorite: userFavs.has(s.id),
    }));
  }

  getUserFavoriteStickerIds(userId: string): string[] {
    return this.favorites.filter((f) => f.userId === userId).map((f) => f.stickerId);
  }

  addFavoriteSticker(userId: string, stickerId: string): { success: boolean } {
    const exists = this.stickers.some((s) => s.id === stickerId);
    if (!exists) throw new NotFoundException('表情包不存在');
    const already = this.favorites.some((f) => f.userId === userId && f.stickerId === stickerId);
    if (!already) {
      this.favorites.unshift({
        userId,
        stickerId,
        createdAt: new Date().toISOString(),
      });
    }
    return { success: true };
  }

  removeFavoriteSticker(userId: string, stickerId: string): { success: boolean } {
    this.favorites = this.favorites.filter(
      (f) => !(f.userId === userId && f.stickerId === stickerId),
    );
    return { success: true };
  }

  /**
   * Real-time Call Signaling: Offer a call (30s timeout)
   */
  createCallOffer(
    matchId: string,
    conversationId: string,
    callerUserId: string,
    calleeUserId: string,
    callType: PeerCallType,
  ): CallSignalingRecord {
    // Check if there is an active ongoing call in this match
    const existing = this.activeCalls.get(matchId);
    if (existing && existing.status === 'ACCEPTED') {
      throw new BadRequestException('通话正在进行中');
    }
    if (existing && existing.status === 'OFFERED') {
      const isExpired = Date.parse(existing.expiresAt) <= Date.now();
      if (!isExpired) {
        throw new BadRequestException('已有正在响铃的通话请求');
      }
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30_000).toISOString(); // 30s deadline
    const callSession: CallSignalingRecord = {
      id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      conversationId,
      callerUserId,
      calleeUserId,
      callType,
      status: 'OFFERED',
      createdAt: now.toISOString(),
      expiresAt,
    };

    this.activeCalls.set(matchId, callSession);
    return callSession;
  }

  /**
   * Callee responds to call offer (ACCEPT / DECLINE)
   */
  respondCall(
    matchId: string,
    calleeUserId: string,
    offerId: string,
    action: 'ACCEPT' | 'DECLINED',
  ): CallSignalingRecord {
    const call = this.activeCalls.get(matchId);
    if (!call || call.id !== offerId) {
      throw new NotFoundException('通话请求不存在或已过期');
    }
    if (call.calleeUserId !== calleeUserId) {
      throw new BadRequestException('你不是该通话的被叫方');
    }
    if (call.status !== 'OFFERED') {
      throw new BadRequestException('通话状态已经变化');
    }
    if (Date.parse(call.expiresAt) <= Date.now()) {
      call.status = 'MISSED';
      throw new BadRequestException('通话请求已超时');
    }

    if (action === 'ACCEPT') {
      call.status = 'ACCEPTED';
      call.startedAt = new Date().toISOString();
      call.roomToken = `rt_token_${Math.random().toString(36).slice(2, 12)}`;
    } else {
      call.status = 'DECLINED';
      call.endedAt = new Date().toISOString();
    }

    return call;
  }

  /**
   * End or cancel an active call
   */
  endCall(
    matchId: string,
    userId: string,
    callId: string,
    _reason = 'normal',
  ): { call: CallSignalingRecord; durationSeconds: number } {
    const call = this.activeCalls.get(matchId);
    if (!call || call.id !== callId) {
      throw new NotFoundException('通话会话不存在');
    }
    if (call.callerUserId !== userId && call.calleeUserId !== userId) {
      throw new BadRequestException('无权操作该通话');
    }

    const now = new Date();
    call.endedAt = now.toISOString();

    let durationSeconds = 0;
    if (call.status === 'ACCEPTED' && call.startedAt) {
      durationSeconds = Math.max(0, Math.floor((now.getTime() - Date.parse(call.startedAt)) / 1000));
      call.durationSeconds = durationSeconds;
      call.status = 'ENDED';
    } else if (call.status === 'OFFERED') {
      call.status = call.callerUserId === userId ? 'CANCELLED' : 'DECLINED';
    }

    return { call, durationSeconds };
  }

  /**
   * Get active call status for polling/sync
   */
  getCallStatus(matchId: string, userId: string): CallSignalingRecord | null {
    const call = this.activeCalls.get(matchId);
    if (!call) return null;
    if (call.callerUserId !== userId && call.calleeUserId !== userId) return null;

    // Check timeout
    if (call.status === 'OFFERED' && Date.parse(call.expiresAt) <= Date.now()) {
      call.status = 'MISSED';
      call.endedAt = new Date().toISOString();
    }
    return call;
  }
}
