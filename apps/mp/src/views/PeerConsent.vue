<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const router = useRouter();
const matchId = computed(() => String(route.query.matchId ?? ''));
const loading = ref(true);
const busy = ref(false);
const error = ref('');
const match = ref<any>(null);

async function load() {
  loading.value = true;
  try {
    const [requestsRes, peersRes] = await Promise.allSettled([
      api.get<any>('/api/v1/peer-requests'),
      api.get<{ item: { matches: any[] } }>('/api/v1/peers'),
    ]);
    const fromRequests = requestsRes.status === 'fulfilled' ? requestsRes.value?.items?.find((item: any) => item.id === matchId.value) : null;
    const fromPeers = peersRes.status === 'fulfilled' ? peersRes.value?.item?.matches?.find((item: any) => item.id === matchId.value) : null;
    match.value = fromRequests ?? fromPeers ?? null;
  } catch (cause: any) {
    error.value = cause?.message ?? '会话前信息没有加载成功';
  } finally {
    loading.value = false;
  }
}

async function consent() {
  if (!matchId.value) return;
  busy.value = true;
  error.value = '';
  try {
    const response = await api.post<{ conversation?: { matchId: string } | null; pending?: boolean }>(
      `/api/v1/peer-matches/${encodeURIComponent(matchId.value)}/consent`,
      {},
    );
    if (response.conversation?.matchId) {
      await router.replace(`/pages/peer/conversation?matchId=${encodeURIComponent(response.conversation.matchId)}`);
    } else {
      await router.replace(`/pages/peer/wait?matchId=${encodeURIComponent(matchId.value)}`);
    }
  } catch (cause: any) {
    error.value = cause?.message ?? '暂时无法开启会话';
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="goodnight-page peer-consent-page">
    <header class="peer-header">
      <button class="back-btn" aria-label="返回请求" type="button" @click="router.back()">‹</button>
      <div class="header-titles">
        <h1 class="peer-title">确认同行边界</h1>
        <p class="peer-subtitle">开启最长 72 小时对话前的规则确认</p>
      </div>
    </header>

    <p v-if="loading" class="state-note">正在确认这段同行…</p>

    <section v-else class="consent-panel">
      <div class="participant-strip">
        <div class="participant-box">
          <div class="avatar-box">
            <span class="avatar-text">我</span>
          </div>
          <span class="participant-label">我</span>
        </div>
        <span class="connection-line">匿名同行</span>
        <div class="participant-box">
          <div class="avatar-box">
            <span class="avatar-text">同</span>
          </div>
          <span class="participant-label">同路人</span>
        </div>
      </div>

      <h2 class="panel-title">开启对话前的四项边界</h2>
      <p class="panel-desc">你将以匿名身份进入限时会话。彼此不会显示头像、昵称或联系方式。</p>

      <ul class="boundary-rules">
        <li>
          <span class="rule-icon" aria-hidden="true">1</span>
          <div class="rule-body">
            <strong>不展示真实身份</strong>
            <small>彼此完全匿名，不涉及真实姓名、账号或位置。</small>
          </div>
        </li>
        <li>
          <span class="rule-icon" aria-hidden="true">2</span>
          <div class="rule-body">
            <strong>最长 72 小时后结束</strong>
            <small>限时会话，到期后自动关闭，减轻社交负担。</small>
          </div>
        </li>
        <li>
          <span class="rule-icon" aria-hidden="true">3</span>
          <div class="rule-body">
            <strong>不交换联系方式</strong>
            <small>专注讨论当前处境与经验，不带走私人联系。</small>
          </div>
        </li>
        <li>
          <span class="rule-icon" aria-hidden="true">4</span>
          <div class="rule-body">
            <strong>可以随时结束</strong>
            <small>支持随时退出会话、提交反馈或停止匹配。</small>
          </div>
        </li>
      </ul>

      <p class="draft-note">AI 仅用于整理草稿，内容需经你本人确认后发出。</p>

      <label class="confirm-row">
        <input type="checkbox" checked disabled>
        <span>我已知晓并遵守上述匿名同行边界。</span>
      </label>

      <div class="consent-actions">
        <button
          class="btn-primary"
          :disabled="busy || !match"
          type="button"
          @click="consent"
        >
          {{ busy ? '正在开启…' : '同意并开始同行' }}
        </button>
        <button
          class="btn-secondary"
          :disabled="busy"
          type="button"
          @click="router.back()"
        >
          我想再想想
        </button>
      </div>
    </section>

    <p v-if="error" class="error-note" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.peer-consent-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
  padding: 12px 16px calc(112px + env(safe-area-inset-bottom));
  background: var(--gn-bg);
  color: var(--gn-text);
  font-family: var(--gn-font-body);
}

.peer-header {
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

.header-titles {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.peer-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--gn-ink);
}

.peer-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--gn-muted);
}

.state-note {
  margin: 24px 0;
  color: var(--gn-muted);
  font-size: 13px;
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

.consent-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.participant-strip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 12px;
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
}

.participant-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.avatar-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 18px;
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
}

.avatar-text {
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
}

.participant-label {
  font-size: 11px;
  color: var(--gn-muted);
}

.connection-line {
  padding: 2px 8px;
  border-radius: var(--gn-radius-small);
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
  color: var(--gn-leaf-deep);
  font-size: 11px;
  font-weight: 500;
}

.panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--gn-ink);
  text-align: center;
}

.panel-desc {
  margin: 0;
  font-size: 13px;
  color: var(--gn-muted);
  line-height: 1.5;
  text-align: center;
}

.boundary-rules {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  overflow: hidden;
}

.boundary-rules li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--gn-line);
}

.boundary-rules li:last-child {
  border-bottom: 0;
}

.rule-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 10px;
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
  margin-top: 1px;
}

.rule-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rule-body strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--gn-ink);
}

.rule-body small {
  font-size: 12px;
  color: var(--gn-muted);
  line-height: 1.4;
}

.draft-note {
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  border: 1px solid var(--gn-line);
  color: var(--gn-ink-soft);
  font-size: 12px;
  line-height: 1.45;
}

.confirm-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
}

.confirm-row input {
  accent-color: var(--gn-leaf);
  margin: 0;
}

.consent-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.btn-primary {
  min-height: 42px;
  border: 0;
  border-radius: var(--gn-radius-card);
  background: var(--gn-leaf);
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.6;
}

.btn-secondary {
  min-height: 36px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  color: var(--gn-muted);
  font-size: 13px;
  cursor: pointer;
}
</style>
