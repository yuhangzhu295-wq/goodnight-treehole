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

let pollTimer: ReturnType<typeof setInterval> | null = null;

async function scrollToLatest() {
  await nextTick();
  const list = listRef.value;
  if (list) list.scrollTop = list.scrollHeight;
}

async function load({ silent = false } = {}) {
  if (!silent) {
    loading.value = true;
    error.value = '';
  }
  try {
    const response = await api.get<any>('/api/v1/peer-conversations');
    const prevCount = conversation.value?.messages?.length ?? 0;
    conversation.value =
      response.items.find((item: any) => item.matchId === matchId.value) ?? null;
    const newCount = conversation.value?.messages?.length ?? 0;
    if (newCount > prevCount || !silent) {
      await scrollToLatest();
    }
  } catch (cause: any) {
    if (!silent) {
      error.value = cause?.message ?? '匿名会话加载失败';
    }
  } finally {
    if (!silent) loading.value = false;
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

async function send() {
  const content = draft.value.trim();
  if (!content || !matchId.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api.post(`/api/v1/peer-conversations/${encodeURIComponent(matchId.value)}/messages`, {
      content,
    });
    draft.value = '';
    await load({ silent: true });
  } catch (cause: any) {
    error.value = cause?.message ?? '消息没有送出';
    // If the conversation expired or was closed by the other party, reload to converge state
    await load({ silent: true });
  } finally {
    busy.value = false;
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
      await wait(400);
      const task = await api.get<{ status: string; result: string }>(`/api/v1/ai/tasks/${response.job.id}`);
      if (['succeeded', 'fallback', 'failed'].includes(task.status)) {
        if (task.status !== 'succeeded') throw new Error('内容整理未完成，请保留原话发送');
        draft.value = task.result;
        assistNotice.value = response.notice;
        settled = true;
        break;
      }
    }
    if (!settled) {
      assistNotice.value = '整理耗时较长，请保留原话发送。';
    }
  } catch (cause: any) {
    error.value = cause?.message ?? '暂时无法整理这段话';
  } finally {
    assistBusy.value = false;
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
  load();
  pollTimer = setInterval(() => {
    if (conversation.value?.status === 'active') {
      load({ silent: true });
    }
  }, 3000);
});

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
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
      <p class="boundary-tip">不交换联系方式，不透露真实身份</p>

      <main ref="listRef" class="chat-messages">
        <p v-if="!conversation.messages.length" class="empty-message">
          可以从具体经历或当下感受开始交流。
        </p>
        <article
          v-for="message in conversation.messages"
          :key="message.id"
          :class="['message-unit', { mine: isMine(message) }]"
        >
          <div class="message-meta">
            <span class="message-author">{{ isMine(message) ? '我' : '同路人' }}</span>
            <time class="message-time">
              {{ new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}
            </time>
          </div>
          <div class="message-bubble">
            <p class="message-text">{{ message.content }}</p>
          </div>
        </article>
      </main>

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
  gap: 8px;
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
  cursor: default;
}

.closed-panel {
  padding: 24px 16px;
  text-align: center;
  background: #f7f8fa;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
}

.dialog-box {
  width: 100%;
  max-width: 320px;
  padding: 20px;
  border-radius: 12px;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dialog-box h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--gn-ink, #242a32);
}

.dialog-box p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--gn-muted, #757d87);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}

.dialog-actions button {
  padding: 6px 14px;
  border: 1px solid var(--gn-line, #e5e7eb);
  border-radius: 6px;
  background: #ffffff;
  font-size: 13px;
  cursor: pointer;
}

.btn-danger {
  border-color: #ef4444 !important;
  background: #ef4444 !important;
  color: #ffffff !important;
}

.btn-block-action {
  padding: 8px 12px;
  border: 1px solid #fecaca;
  border-radius: 6px;
  background: #fff5f5;
  color: #ef4444;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 6px;
}
</style>
