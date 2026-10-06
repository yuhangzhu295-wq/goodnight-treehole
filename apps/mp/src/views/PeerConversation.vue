<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const router = useRouter();
const matchId = computed(() => String(route.query.matchId ?? ''));
const conversation = ref<any>(null);
const draft = ref('');
const busy = ref(false);
const assistBusy = ref(false);
const assistNotice = ref('');
const error = ref('');
const closeConfirmOpen = ref(false);
const safetyOpen = ref(false);
const reportReason = ref('');

async function load() {
  try {
    const response = await api.get<any>('/api/v1/peer-conversations');
    conversation.value = response.items.find((item: any) => item.matchId === matchId.value) ?? null;
  } catch (cause: any) {
    error.value = cause?.message ?? '匿名会话加载失败';
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
  if (!content || !matchId.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api.post(`/api/v1/peer-conversations/${encodeURIComponent(matchId.value)}/messages`, { content });
    draft.value = '';
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '消息没有送出';
  } finally {
    busy.value = false;
  }
}

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

async function assist() {
  if (!draft.value.trim() || !matchId.value) return;
  assistBusy.value = true;
  error.value = '';
  assistNotice.value = '';
  try {
    const response = await api.post<{ job: { id: string }; notice: string }>(
      `/api/v1/peer-conversations/${encodeURIComponent(matchId.value)}/assist`,
      { content: draft.value },
    );
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await wait(400);
      const task = await api.get<{ status: string; result: string }>(`/api/v1/ai/tasks/${response.job.id}`);
      if (['succeeded', 'fallback', 'failed'].includes(task.status)) {
        if (task.status !== 'succeeded') throw new Error('DAPI 整理失败，请保留原话发送');
        draft.value = task.result;
        assistNotice.value = response.notice;
        break;
      }
    }
  } catch (cause: any) {
    error.value = cause?.message ?? '暂时无法整理这段话';
  } finally {
    assistBusy.value = false;
  }
}

async function closeConversation() {
  if (!matchId.value) return;
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
  if (!reason || !matchId.value) {
    error.value = '请简短说明需要处理的原因';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    await api.post(`/api/v1/peer-conversations/${encodeURIComponent(matchId.value)}/report`, { reason });
    safetyOpen.value = false;
    reportReason.value = '';
    error.value = '已收到这条反馈，我们会按规则处理。';
  } catch (cause: any) {
    error.value = cause?.message ?? '反馈没有提交成功';
  } finally {
    busy.value = false;
  }
}

async function block() {
  if (!matchId.value) return;
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

onMounted(load);
</script>

<template>
  <section class="goodnight-page conversation-page">
    <header class="chat-header">
      <button class="back-btn" aria-label="返回" type="button" @click="router.back()">‹</button>
      <div class="chat-header-info">
        <span class="chat-header-badge">匿名同行会话</span>
        <strong class="chat-header-status">{{ remaining }}</strong>
      </div>
      <div class="chat-header-actions">
        <button
          class="btn-end"
          :disabled="busy || conversation?.status !== 'active'"
          type="button"
          @click="closeConfirmOpen = true"
        >
          结束
        </button>
        <button
          class="btn-more"
          aria-label="安全操作"
          :disabled="busy"
          type="button"
          @click="safetyOpen = true"
        >
          •••
        </button>
      </div>
    </header>

    <p v-if="error" class="error-note" role="alert">{{ error }}</p>

    <section v-if="!conversation" class="empty-panel">
      <span class="empty-glyph" aria-hidden="true">⌘</span>
      <h1 class="empty-title">会话尚未建立</h1>
      <p>双方均确认匿名边界后，方可开启限时同行会话。</p>
      <button class="btn-primary" type="button" @click="router.push('/pages/peers/index')">回到同路</button>
    </section>

    <template v-else>
      <p class="boundary-tip">不交换联系方式，不透露真实身份</p>

      <main class="chat-messages">
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
          maxlength="1000"
          placeholder="写下你想说的话…"
        />
        <p class="composer-safety">请勿发送联系方式或任何可识别身份信息。</p>
        <p v-if="assistNotice" class="assist-note">{{ assistNotice }} 内容仍需由你确认后发送。</p>
        <div class="composer-bar">
          <button
            class="btn-assist"
            :disabled="assistBusy || busy || !draft.trim()"
            type="button"
            @click="assist"
          >
            {{ assistBusy ? '整理中…' : '帮我整理一下' }}
          </button>
          <small class="char-count">{{ draft.length }}/1000</small>
          <button
            class="btn-send"
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
          <button type="button" class="btn-danger" :disabled="busy" @click="closeConversation">确认结束</button>
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
          举报原因（可选）
          <textarea v-model="reportReason" maxlength="300" placeholder="请简要描述需要处理的问题" />
        </label>
        <div class="dialog-actions">
          <button type="button" :disabled="busy" @click="safetyOpen = false">取消</button>
          <button
            type="button"
            class="btn-danger"
            :disabled="busy || !reportReason.trim()"
            @click="report"
          >
            提交举报
          </button>
        </div>
        <button
          type="button"
          class="btn-block-action"
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
.conversation-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 100vh;
  overflow-x: hidden;
  padding: 12px 16px calc(24px + env(safe-area-inset-bottom));
  background: var(--gn-bg);
  color: var(--gn-text);
  font-family: var(--gn-font-body);
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px 4px;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  color: var(--gn-ink);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
}

.chat-header-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.chat-header-badge {
  font-size: 11px;
  color: var(--gn-muted);
}

.chat-header-status {
  font-size: 14px;
  font-weight: 600;
  color: var(--gn-ink);
}

.chat-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-end {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper);
  color: var(--gn-ink);
  font-size: 12px;
  cursor: pointer;
}

.btn-more {
  width: 32px;
  height: 32px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper);
  color: var(--gn-ink);
  font-size: 12px;
  cursor: pointer;
}

.boundary-tip {
  margin: 0;
  color: var(--gn-muted);
  font-size: 11px;
  text-align: center;
}

.error-note {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--gn-radius-card);
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
  color: var(--gn-danger);
  font-size: 13px;
}

.empty-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  text-align: center;
}

.empty-glyph {
  font-size: 24px;
  color: var(--gn-muted);
}

.empty-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--gn-ink);
}

.empty-panel p {
  margin: 0;
  font-size: 13px;
  color: var(--gn-muted);
  line-height: 1.5;
}

.chat-messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 280px;
  padding: 8px 0;
}

.empty-message {
  margin: auto;
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.6;
  text-align: center;
}

.message-unit {
  display: flex;
  flex-direction: column;
  align-self: flex-start;
  max-width: 82%;
  gap: 3px;
}

.message-unit.mine {
  align-self: flex-end;
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--gn-muted);
  padding: 0 4px;
}

.message-unit.mine .message-meta {
  justify-content: flex-end;
}

.message-bubble {
  padding: 10px 14px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.message-unit.mine .message-bubble {
  border-color: rgba(46, 125, 50, 0.25);
  background: var(--gn-leaf-soft);
}

.message-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--gn-ink);
  white-space: pre-wrap;
  word-break: break-word;
}

.composer {
  position: sticky;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.composer textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 60px;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--gn-ink);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
}

.composer-safety {
  margin: 0;
  font-size: 11px;
  color: var(--gn-muted);
}

.assist-note {
  margin: 0;
  font-size: 11px;
  color: var(--gn-leaf-deep);
}

.composer-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.char-count {
  margin-left: auto;
  color: var(--gn-muted);
  font-size: 11px;
}

.btn-assist {
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  color: var(--gn-ink-soft);
  font-size: 12px;
  cursor: pointer;
}

.btn-send {
  min-height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf);
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.btn-send:disabled {
  opacity: 0.5;
}

.closed-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 24px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  text-align: center;
}

.closed-panel p {
  margin: 0;
  font-size: 14px;
  color: var(--gn-muted);
}

.btn-primary {
  min-height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf);
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.dialog-backdrop {
  position: fixed;
  z-index: 120;
  inset: 0;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.4);
  padding: 16px;
  box-sizing: border-box;
}

.dialog-box {
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.dialog-box h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--gn-ink);
}

.dialog-box p {
  margin: 0;
  font-size: 13px;
  color: var(--gn-muted);
  line-height: 1.5;
}

.dialog-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 4px;
}

.dialog-actions button {
  min-height: 40px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper);
  color: var(--gn-ink);
  font-size: 13px;
  cursor: pointer;
}

.dialog-actions .btn-danger {
  border-color: var(--gn-danger);
  background: var(--gn-danger);
  color: #ffffff;
}

.safety-dialog {
  gap: 10px;
}

.report-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--gn-ink);
}

.report-label textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 72px;
  resize: none;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  padding: 8px 10px;
  font-family: inherit;
  font-size: 13px;
  color: var(--gn-ink);
  line-height: 1.5;
}

.btn-block-action {
  min-height: 36px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper);
  color: var(--gn-danger);
  font-size: 13px;
  cursor: pointer;
  margin-top: 2px;
}
</style>
