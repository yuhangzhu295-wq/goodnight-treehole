<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

const route = useRoute();
const router = useRouter();
const matchId = computed(() => String(route.query.matchId ?? ''));
const conversation = ref<any>(null);
const listRef = ref<HTMLElement | null>(null);
const draft = ref('');
const loading = ref(true);
const busy = ref(false);
const assistBusy = ref(false);
const assistNotice = ref('');
const error = ref('');
const notice = ref('');
const closeConfirmOpen = ref(false);
const safetyOpen = ref(false);
const reportReason = ref('');

// V3 Social States
const replyingTo = ref<any>(null);
const emojiPanelOpen = ref(false);
const stickerTab = ref<'emoji' | 'stickers' | 'favorites'>('emoji');
const stickers = ref<any[]>([]);
const favoriteStickerIds = ref<string[]>([]);

// Lifecycle guard
let isUnmounted = false;
let syncTimeout: any = null;

const EMOJI_LIST = [
  '🌙', '🕯️', '🍃', '☕', '🕊️', '🌧️', '🌤️', '🫂', '🪵', '💭',
  '💫', '🌿', '🌸', '🍂', '🍵', '💤', '✨', '🤍', '🌼', '🌧️'
];

async function scrollToLatest() {
  await nextTick();
  const list = listRef.value;
  if (list) list.scrollTop = list.scrollHeight;
}

async function load({ silent = false } = {}) {
  if (isUnmounted) return;
  if (!silent) {
    loading.value = true;
    error.value = '';
  }
  try {
    const response = await api.get<any>('/api/v1/peer-conversations');
    if (isUnmounted) return;
    const prevCount = conversation.value?.messages?.length ?? 0;
    conversation.value =
      response.items.find((item: any) => item.matchId === matchId.value) ?? null;
    const newCount = conversation.value?.messages?.length ?? 0;
    if (newCount > prevCount || !silent) {
      await scrollToLatest();
    }
  } catch (cause: any) {
    if (!silent && !isUnmounted) {
      error.value = cause?.message ?? '匿名会话加载失败';
    }
  } finally {
    if (!silent && !isUnmounted) loading.value = false;
  }
}

async function pollSync() {
  if (isUnmounted) return;
  if (conversation.value?.status === 'active') {
    try {
      const maxSeq = (conversation.value.messages ?? []).reduce(
        (max: number, m: any) => Math.max(max, typeof m.seq === 'number' ? m.seq : 0),
        0,
      );
      const syncRes = await api.get<any>(
        `/api/v1/peer-conversations/${encodeURIComponent(matchId.value)}/sync?afterSeq=${maxSeq}`,
      );
      if (isUnmounted) return;
      if (syncRes.messages && syncRes.messages.length > 0) {
        const existingMap = new Map<string, any>(
          conversation.value.messages.map((m: any) => [m.id, m]),
        );
        let changed = false;
        for (const m of syncRes.messages) {
          const old = existingMap.get(m.id);
          if (!old) {
            conversation.value.messages.push(m);
            existingMap.set(m.id, m);
            changed = true;
          } else if (m.recalledAt && !old.recalledAt) {
            old.recalledAt = m.recalledAt;
            old.content = m.content;
            changed = true;
          }
        }
        for (const m of conversation.value.messages) {
          if (m.replyToId) {
            const target = existingMap.get(m.replyToId);
            if (target?.recalledAt && m.replyToContent !== '一条消息已撤回') {
              m.replyToContent = '一条消息已撤回';
              changed = true;
            }
          }
        }
        if (changed) await scrollToLatest();
      }
      if (syncRes.conversationStatus && syncRes.conversationStatus !== conversation.value.status) {
        conversation.value.status = syncRes.conversationStatus;
      }
    } catch {
      // Silent error during background poll
    }
  }
  if (!isUnmounted) {
    syncTimeout = setTimeout(pollSync, 3000);
  }
}

const remaining = computed(() => {
  if (!conversation.value?.expiresAt) return '';
  const ms = Math.max(0, Date.parse(conversation.value.expiresAt) - Date.now());
  const hours = Math.floor(ms / 3_600_000);
  return conversation.value.status === 'active' ? `还剩约 ${hours} 小时` : '会话已经结束';
});

function isMine(message: any) {
  return message.author === 'self';
}

function canRecall(message: any) {
  if (!isMine(message) || message.recalledAt || conversation.value?.status !== 'active') return false;
  const elapsed = Date.now() - Date.parse(message.createdAt);
  return elapsed <= 120_000; // 2 minutes
}

async function recall(message: any) {
  if (!confirm('确定撤回这条消息吗？撤回后双方均不可见。')) return;
  busy.value = true;
  try {
    await api.post(
      `/api/v1/peer-conversations/${encodeURIComponent(matchId.value)}/messages/${message.id}/recall`,
      {},
    );
    notice.value = '已撤回消息';
    await load({ silent: true });
  } catch (cause: any) {
    error.value = cause?.message ?? '撤回失败';
  } finally {
    busy.value = false;
  }
}

function setReply(message: any) {
  replyingTo.value = message;
}

function cancelReply() {
  replyingTo.value = null;
}

async function send() {
  const content = draft.value.trim();
  if (!content || !matchId.value || busy.value) return;
  busy.value = true;
  error.value = '';
  const clientMsgId = `cmsg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    await api.post(`/api/v1/peer-conversations/${encodeURIComponent(matchId.value)}/messages`, {
      content,
      msgType: 'TEXT',
      replyToId: replyingTo.value?.id,
      clientMsgId,
    });
    draft.value = '';
    replyingTo.value = null;
    emojiPanelOpen.value = false;
    await load({ silent: true });
  } catch (cause: any) {
    error.value = cause?.message ?? '消息没有送出';
    await load({ silent: true });
  } finally {
    busy.value = false;
  }
}

async function sendSticker(sticker: any) {
  if (!matchId.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api.post(`/api/v1/peer-conversations/${encodeURIComponent(matchId.value)}/messages`, {
      content: `[表情包: ${sticker.name}]`,
      msgType: 'STICKER',
      mediaUrl: sticker.url,
      replyToId: replyingTo.value?.id,
      clientMsgId: `cmsg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    });
    replyingTo.value = null;
    emojiPanelOpen.value = false;
    await load({ silent: true });
  } catch (cause: any) {
    error.value = cause?.message ?? '表情包发送失败';
  } finally {
    busy.value = false;
  }
}

async function loadStickers() {
  try {
    const res = await api.get<{ items: any[] }>('/api/v1/stickers');
    stickers.value = res.items ?? [];
    const favRes = await api.get<{ favoriteIds: string[] }>('/api/v1/stickers/favorites');
    favoriteStickerIds.value = favRes.favoriteIds ?? [];
  } catch {
    // optional sticker load
  }
}

async function toggleFavoriteSticker(sticker: any) {
  const isFav = favoriteStickerIds.value.includes(sticker.id);
  try {
    if (isFav) {
      await api.delete(`/api/v1/stickers/favorites/${sticker.id}`);
      favoriteStickerIds.value = favoriteStickerIds.value.filter((id) => id !== sticker.id);
    } else {
      await api.post('/api/v1/stickers/favorites', { stickerId: sticker.id });
      favoriteStickerIds.value.push(sticker.id);
    }
  } catch {
    // silent
  }
}

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function assist() {
  if (!draft.value.trim() || !matchId.value || assistBusy.value) return;
  assistBusy.value = true;
  error.value = '';
  assistNotice.value = '';
  try {
    const response = await api.post<{ job: { id: string }; notice: string }>(
      `/api/v1/peer-conversations/${encodeURIComponent(matchId.value)}/assist`,
      { content: draft.value },
    );
    let settled = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (isUnmounted) return;
      await wait(400);
      const task = await api.get<{ status: string; result: string }>(`/api/v1/ai/tasks/${response.job.id}`);
      if (isUnmounted) return;
      if (['succeeded', 'fallback', 'failed'].includes(task.status)) {
        if (task.status !== 'succeeded') throw new Error('内容整理未完成，请保留原话发送');
        draft.value = task.result;
        assistNotice.value = response.notice;
        settled = true;
        break;
      }
    }
    if (!settled && !isUnmounted) {
      assistNotice.value = '整理耗时较长，请保留原话发送。';
    }
  } catch (cause: any) {
    if (!isUnmounted) error.value = cause?.message ?? '暂时无法整理这段话';
  } finally {
    if (!isUnmounted) assistBusy.value = false;
  }
}

async function closeConversation() {
  if (!matchId.value || busy.value) return;
  busy.value = true;
  try {
    await api.post(`/api/v1/peer-conversations/${encodeURIComponent(matchId.value)}/close`, {});
    closeConfirmOpen.value = false;
    await router.replace(`/pages/peer/graduate?matchId=${encodeURIComponent(matchId.value)}`);
  } catch (cause: any) {
    error.value = cause?.message ?? '会话关闭失败';
  } finally {
    busy.value = false;
  }
}

async function report() {
  const reason = reportReason.value.trim();
  if (!reason || !matchId.value || busy.value) {
    error.value = '请简短说明需要处理的原因';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    await api.post(`/api/v1/peer-conversations/${encodeURIComponent(matchId.value)}/report`, { reason });
    safetyOpen.value = false;
    reportReason.value = '';
    notice.value = '已收到这条反馈，我们会按规则处理。';
  } catch (cause: any) {
    error.value = cause?.message ?? '反馈没有提交成功';
  } finally {
    busy.value = false;
  }
}

async function block() {
  if (!matchId.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api.post(`/api/v1/peer-conversations/${encodeURIComponent(matchId.value)}/block`, {});
    safetyOpen.value = false;
    await router.replace(`/pages/peer/graduate?matchId=${encodeURIComponent(matchId.value)}`);
  } catch (cause: any) {
    error.value = cause?.message ?? '停止匹配没有完成';
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  isUnmounted = false;
  load();
  loadStickers();
  syncTimeout = setTimeout(pollSync, 3000);
});

onBeforeUnmount(() => {
  isUnmounted = true;
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
});
</script>

<template>
  <section class="goodnight-page conversation-page">
    <header class="chat-header">
      <button class="back-btn" data-testid="peer-conv-back" aria-label="返回" type="button" @click="router.back()">‹</button>
      <div class="chat-header-info">
        <span class="chat-header-badge">匿名同行会话</span>
        <strong class="chat-header-status">{{ remaining }}</strong>
      </div>
      <div class="chat-header-actions">
        <button
          class="btn-end"
          data-testid="peer-conv-end"
          :disabled="busy || conversation?.status !== 'active'"
          type="button"
          @click="closeConfirmOpen = true"
        >
          结束
        </button>
        <button
          class="btn-more"
          data-testid="peer-conv-safety"
          aria-label="安全操作"
          :disabled="busy || !conversation || conversation.status !== 'active'"
          type="button"
          @click="safetyOpen = true"
        >
          •••
        </button>
      </div>
    </header>

    <LoadErrorBanner :message="error" retry-label="重新加载" @retry="load()" />
    <p v-if="notice" class="notice-toast" role="status">{{ notice }}</p>

    <p v-if="loading" class="state-note">正在进入会话…</p>

    <section v-else-if="!conversation" class="empty-panel">
      <span class="empty-glyph" aria-hidden="true">⌘</span>
      <h1 class="empty-title">会话尚未建立</h1>
      <p>双方均确认匿名边界后，方可开启限时同行会话。</p>
      <button class="btn-primary" type="button" @click="router.push('/pages/peers/index')">回到同路</button>
    </section>

    <template v-else>
      <p class="boundary-tip">不交换联系方式，不透露真实身份 · 72小时自动保护</p>

      <main ref="listRef" class="chat-messages">
        <p v-if="!conversation.messages.length" class="empty-message">
          可以从具体经历或当下感受开始交流。
        </p>
        <article
          v-for="message in conversation.messages"
          :key="message.id"
          :class="['message-unit', { mine: isMine(message), recalled: Boolean(message.recalledAt) }]"
        >
          <!-- Recalled Placeholder -->
          <div v-if="message.recalledAt" class="recalled-pill">
            一条消息已撤回
          </div>

          <template v-else>
            <div class="message-meta">
              <span class="message-author">{{ isMine(message) ? '我' : '同路人' }}</span>
              <time class="message-time">
                {{ new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}
              </time>
              <button
                v-if="canRecall(message)"
                class="btn-recall"
                type="button"
                @click="recall(message)"
              >
                撤回
              </button>
              <button
                class="btn-reply-quote"
                type="button"
                @click="setReply(message)"
              >
                引用
              </button>
            </div>

            <!-- Quoted preview block -->
            <div v-if="message.replyToContent" class="quoted-preview">
              <span class="quote-bar"></span>
              <p class="quote-text">{{ message.replyToContent }}</p>
            </div>

            <!-- Message Body Rendering -->
            <div class="message-bubble">
              <!-- Sticker Message -->
              <div v-if="message.msgType === 'STICKER'" class="sticker-msg">
                <img :src="message.mediaUrl" alt="贴纸" class="sticker-img" />
              </div>

              <!-- Call Log Message -->
              <div v-else-if="message.msgType === 'CALL_LOG'" class="call-log-msg">
                <span class="call-log-icon">📞</span>
                <span class="call-log-text">{{ message.content }}</span>
              </div>

              <!-- Plain Text Message -->
              <p v-else class="message-text">{{ message.content }}</p>
            </div>
          </template>
        </article>
      </main>

      <!-- Active Quoted Banner -->
      <div v-if="replyingTo" class="replying-banner">
        <span class="replying-label">引用：</span>
        <span class="replying-text">{{ replyingTo.content.slice(0, 40) }}</span>
        <button class="replying-close" type="button" @click="cancelReply">&times;</button>
      </div>

      <!-- Emoji & Sticker Panel -->
      <section v-if="emojiPanelOpen" class="emoji-sticker-panel">
        <div class="panel-tabs">
          <button :class="{ active: stickerTab === 'emoji' }" type="button" @click="stickerTab = 'emoji'">Emoji</button>
          <button :class="{ active: stickerTab === 'stickers' }" type="button" @click="stickerTab = 'stickers'">暖心贴纸</button>
          <button :class="{ active: stickerTab === 'favorites' }" type="button" @click="stickerTab = 'favorites'">收藏</button>
        </div>
        <div v-if="stickerTab === 'emoji'" class="emoji-grid">
          <button v-for="em in EMOJI_LIST" :key="em" type="button" class="emoji-btn" @click="draft += em">{{ em }}</button>
        </div>
        <div v-else class="stickers-grid">
          <div
            v-for="stk in (stickerTab === 'favorites' ? stickers.filter(s => favoriteStickerIds.includes(s.id)) : stickers)"
            :key="stk.id"
            class="sticker-card"
          >
            <div class="sticker-click-area" @click="sendSticker(stk)">
              <img :src="stk.url" :alt="stk.name" class="stk-icon" />
              <span class="stk-name">{{ stk.name }}</span>
            </div>
            <button class="stk-fav-btn" type="button" @click.stop="toggleFavoriteSticker(stk)">
              {{ favoriteStickerIds.includes(stk.id) ? '★' : '☆' }}
            </button>
          </div>
        </div>
      </section>

      <footer v-if="conversation.status === 'active'" class="composer">
        <textarea
          v-model="draft"
          data-testid="input-peer-conv"
          maxlength="1000"
          placeholder="写下你想说的话…"
        />
        <p class="composer-safety">请勿发送联系方式或任何可识别身份信息。</p>
        <p v-if="assistNotice" class="assist-note">{{ assistNotice }} 内容仍需由你确认后发送。</p>
        <div class="composer-bar">
          <button
            class="btn-panel-toggle"
            type="button"
            :class="{ active: emojiPanelOpen }"
            @click="emojiPanelOpen = !emojiPanelOpen"
          >
            😊
          </button>
          <button
            class="btn-assist"
            data-testid="btn-peer-conv-assist"
            :disabled="assistBusy || busy || !draft.trim()"
            type="button"
            @click="assist"
          >
            {{ assistBusy ? '整理中…' : '帮我整理一下' }}
          </button>
          <small class="char-count">{{ draft.length }}/1000</small>
          <button
            class="btn-send"
            data-testid="btn-peer-conv-send"
            :disabled="busy || assistBusy || !draft.trim()"
            type="button"
            @click="send"
          >
            {{ busy ? '发送中…' : '发送' }}
          </button>
        </div>
      </footer>

      <section v-else class="closed-panel">
        <p>这段匿名同行已经结束。</p>
        <button
          class="btn-primary"
          data-testid="peer-conv-graduate"
          type="button"
          @click="router.push(`/pages/peer/graduate?matchId=${encodeURIComponent(matchId)}`)"
        >
          留下感受
        </button>
      </section>
    </template>

    <!-- Confirm End Dialog -->
    <div
      v-if="closeConfirmOpen"
      class="dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="end-confirm-title"
      @click.self="closeConfirmOpen = false"
    >
      <div class="dialog-box">
        <h2 id="end-confirm-title">结束这段同行？</h2>
        <p>结束后将无法继续发送消息。会话内容将作为历史记录保留在各自账号中。</p>
        <div class="dialog-actions">
          <button type="button" :disabled="busy" @click="closeConfirmOpen = false">再想想</button>
          <button
            type="button"
            class="btn-danger"
            data-testid="peer-conv-confirm-end"
            :disabled="busy"
            @click="closeConversation"
          >
            确认结束
          </button>
        </div>
      </div>
    </div>

    <!-- Safety / Report / Block Dialog -->
    <div
      v-if="safetyOpen"
      class="dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="safety-title"
      @click.self="safetyOpen = false"
    >
      <div class="dialog-box safety-dialog">
        <h2 id="safety-title">会话安全与边界保护</h2>
        <p>提交举报将由管理员核实处理；停止匹配将立即关闭会话，双方均无法再次联络。</p>
        <label class="report-label">
          举报原因（必填）
          <textarea v-model="reportReason" maxlength="300" placeholder="请简要描述需要处理的问题" />
        </label>
        <div class="dialog-actions">
          <button type="button" :disabled="busy" @click="safetyOpen = false">取消</button>
          <button
            type="button"
            class="btn-danger"
            data-testid="peer-conv-report"
            :disabled="busy || !reportReason.trim()"
            @click="report"
          >
            提交举报
          </button>
        </div>
        <button
          type="button"
          class="btn-block-action"
          data-testid="peer-conv-block"
          :disabled="busy"
          @click="block"
        >
          停止匹配并结束会话
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
:global(.phone-shell:has(.conversation-page)) {
  padding-bottom: 0;
}

.conversation-page {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  height: 100vh;
  overflow: hidden;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  background: var(--gn-bg, #ffffff);
  color: var(--gn-text, #242a32);
  font-family: var(--gn-font-body);
}

.chat-header {
  display: grid;
  grid-template-columns: 32px 1fr auto;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0 0 10px;
  border-bottom: 1px solid var(--gn-divider, #e8ebef);
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 28px;
  height: 40px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--gn-ink, #242a32);
  font-size: 24px;
  cursor: pointer;
}

.chat-header-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chat-header-badge {
  font-size: 11px;
  color: var(--gn-muted, #757d87);
}

.chat-header-status {
  font-size: 16px;
  font-weight: 700;
  color: var(--gn-ink, #242a32);
}

.chat-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-end {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--gn-line, #e5e7eb);
  border-radius: 6px;
  background: transparent;
  color: var(--gn-ink, #242a32);
  font-size: 13px;
  cursor: pointer;
}

.btn-more {
  min-height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--gn-muted, #757d87);
  font-size: 16px;
  cursor: pointer;
}

.boundary-tip {
  margin: 8px 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: #f4f5f7;
  color: var(--gn-muted, #757d87);
  font-size: 12px;
  text-align: center;
}

.notice-toast {
  margin: 6px 0;
  padding: 8px 12px;
  border-radius: 6px;
  background: #eaf4ee;
  color: #1e4d45;
  font-size: 13px;
  text-align: center;
}

.state-note {
  margin: 40px 0;
  text-align: center;
  color: var(--gn-muted, #757d87);
  font-size: 14px;
}

.chat-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 8px 0;
}

.empty-message {
  margin: 32px 0;
  text-align: center;
  color: var(--gn-muted, #757d87);
  font-size: 13px;
}

.message-unit {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 82%;
}

.message-unit.mine {
  align-self: flex-end;
}

.message-unit.recalled {
  align-self: center;
}

.recalled-pill {
  padding: 4px 12px;
  border-radius: 12px;
  background: #f1f5f9;
  color: #94a3b8;
  font-size: 12px;
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--gn-muted, #757d87);
}

.message-unit.mine .message-meta {
  justify-content: flex-end;
}

.btn-recall, .btn-reply-quote {
  background: transparent;
  border: none;
  font-size: 11px;
  color: #64748b;
  cursor: pointer;
  padding: 0 2px;
}
.btn-recall:hover, .btn-reply-quote:hover {
  color: #275f56;
}

.quoted-preview {
  display: flex;
  gap: 6px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 4px;
  font-size: 11px;
  color: #64748b;
}

.quote-bar {
  width: 2px;
  background: #94a3b8;
  border-radius: 1px;
}

.quote-text {
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.message-bubble {
  padding: 10px 14px;
  border-radius: 12px;
  background: #f3f4f6;
  color: var(--gn-ink, #242a32);
}

.message-unit.mine .message-bubble {
  background: #e8f3ed;
}

.message-text {
  margin: 0;
  font-size: 14.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.sticker-img {
  width: 80px;
  height: 80px;
  object-fit: contain;
}

.call-log-msg {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #475569;
}

.replying-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #f1f5f9;
  border-radius: 6px;
  font-size: 12px;
  color: #475569;
  margin-bottom: 4px;
}

.replying-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.replying-close {
  background: transparent;
  border: none;
  font-size: 16px;
  cursor: pointer;
  color: #94a3b8;
}

.emoji-sticker-panel {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #ffffff;
  padding: 10px;
  margin-bottom: 6px;
  max-height: 180px;
  overflow-y: auto;
}

.panel-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 6px;
}

.panel-tabs button {
  background: transparent;
  border: none;
  font-size: 12px;
  color: #64748b;
  cursor: pointer;
  padding: 2px 6px;
}

.panel-tabs button.active {
  color: #275f56;
  font-weight: 600;
  border-bottom: 2px solid #275f56;
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 6px;
}

.emoji-btn {
  background: transparent;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
}

.stickers-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.sticker-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  border: 1px solid #f1f5f9;
  border-radius: 8px;
  padding: 6px;
}

.sticker-click-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
}

.stk-icon {
  width: 44px;
  height: 44px;
}

.stk-name {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}

.stk-fav-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  background: transparent;
  border: none;
  font-size: 12px;
  color: #f59e0b;
  cursor: pointer;
}

.composer {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--gn-divider, #e8ebef);
}

.composer textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 68px;
  padding: 8px 10px;
  border: 1px solid var(--gn-line, #e5e7eb);
  border-radius: 8px;
  font: inherit;
  font-size: 14px;
  line-height: 1.4;
  resize: none;
}

.composer-safety {
  margin: 0;
  font-size: 11px;
  color: var(--gn-muted, #9ca3af);
}

.assist-note {
  margin: 0;
  font-size: 11px;
  color: var(--gn-primary, #275f56);
}

.composer-bar {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-panel-toggle {
  padding: 6px 8px;
  border: 1px solid var(--gn-line, #e5e7eb);
  border-radius: 6px;
  background: #ffffff;
  color: #475569;
  font-size: 12px;
  cursor: pointer;
}

.btn-panel-toggle.active {
  background: #eaf4ee;
  border-color: #275f56;
}

.btn-assist {
  padding: 6px 10px;
  border: 1px solid var(--gn-line, #e5e7eb);
  border-radius: 6px;
  background: #ffffff;
  color: var(--gn-primary, #275f56);
  font-size: 12px;
  cursor: pointer;
}

.char-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--gn-muted, #9ca3af);
}

.btn-send {
  padding: 6px 14px;
  border: 0;
  border-radius: 6px;
  background: var(--gn-primary, #275f56);
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.empty-panel,
.closed-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  text-align: center;
  color: var(--gn-muted, #757d87);
}

.empty-glyph {
  font-size: 32px;
}

.empty-title {
  margin: 0;
  font-size: 18px;
  color: var(--gn-ink, #242a32);
}

.btn-primary {
  min-height: 40px;
  padding: 0 20px;
  border: 0;
  border-radius: 8px;
  background: var(--gn-primary, #275f56);
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 100;
}

.dialog-box {
  width: 100%;
  max-width: 320px;
  border-radius: 12px;
  background: #ffffff;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dialog-box h2 {
  margin: 0;
  font-size: 17px;
  color: var(--gn-ink, #242a32);
}

.dialog-box p {
  margin: 0;
  font-size: 13px;
  color: var(--gn-muted, #757d87);
  line-height: 1.4;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.dialog-actions button {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--gn-line, #e5e7eb);
  border-radius: 6px;
  background: transparent;
  color: var(--gn-ink, #242a32);
  font-size: 13px;
  cursor: pointer;
}

.dialog-actions .btn-danger {
  border: 0;
  background: #c53030;
  color: #ffffff;
}

.safety-dialog {
  max-width: 340px;
}

.report-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--gn-ink, #242a32);
}

.report-label textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 60px;
  padding: 8px;
  border: 1px solid var(--gn-line, #e5e7eb);
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
  resize: none;
}

.btn-block-action {
  min-height: 36px;
  border: 1px solid #fecaca;
  border-radius: 6px;
  background: #fff5f5;
  color: #c53030;
  font-size: 13px;
  cursor: pointer;
}
</style>
