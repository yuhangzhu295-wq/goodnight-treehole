<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

type Match = {
  id: string;
  status: string;
  requestReason?: string;
  requestQuestion?: string;
  acceptedAt?: string;
  requesterConsentAt?: string;
  ownerConsentAt?: string;
  experience?: { title?: string; domain?: string; tags?: string[] };
};
const route = useRoute();
const router = useRouter();
const matchId = computed(() => String(route.query.matchId ?? ''));
const match = ref<Match | null>(null);
const error = ref('');
let timer: number | undefined;

const isConnected = computed(() => match.value?.status === 'connected');
const hasRequesterConsented = computed(() => Boolean(match.value?.requesterConsentAt));
const hasOwnerConsented = computed(() => Boolean(match.value?.ownerConsentAt));
const bothConsented = computed(() => Boolean(hasRequesterConsented.value && hasOwnerConsented.value));

async function load() {
  try {
    // `matchId` is passed so the server includes this match even when the capped discovery list
    // would have dropped it — otherwise the page falls back to its empty state.
    const payload = (
      await api.get<{ item: { matches: Match[] } }>(
        `/api/v1/peers?matchId=${encodeURIComponent(matchId.value)}`,
      )
    ).item;
    match.value = payload.matches.find((item) => item.id === matchId.value) ?? null;
    if (match.value?.status === 'connected') {
      const conversations = await api.get<{ items: Array<{ matchId: string }> }>('/api/v1/peer-conversations');
      if (conversations.items.some((item) => item.matchId === matchId.value)) {
        await router.replace(`/pages/peer/conversation?matchId=${encodeURIComponent(matchId.value)}`);
      }
    }
  } catch (cause: any) {
    error.value = cause?.message ?? '等待状态暂时无法更新';
  }
}

function goToConsent() {
  if (matchId.value) {
    router.push(`/pages/peer/consent?matchId=${encodeURIComponent(matchId.value)}`);
  }
}

function back() {
  router.push('/pages/peers/index');
}

onMounted(() => {
  load();
  timer = window.setInterval(load, 7000);
});

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
});
</script>

<template>
  <section class="goodnight-page peer-wait-page">
    <header class="peer-header">
      <button class="back-btn" aria-label="返回同路" type="button" @click="back">‹</button>
      <div class="header-titles">
        <h1 class="peer-title">请求状态</h1>
        <p class="peer-subtitle">已递出匿名请求，等待对方确认</p>
      </div>
    </header>

    <section class="status-panel">
      <span class="status-badge">
        {{
          bothConsented
            ? '会话准备就绪'
            : hasRequesterConsented
              ? '等待对方确认边界'
              : isConnected
                ? '待确认边界'
                : '等待回应中'
        }}
      </span>
      <h2 class="status-heading">
        {{
          bothConsented
            ? '双方已确认边界'
            : hasRequesterConsented
              ? '你已确认边界，等待对方确认'
              : isConnected
                ? '对方已同意，请确认同行边界'
                : '正在等待对方决定'
        }}
      </h2>
      <p class="status-desc">
        {{
          bothConsented
            ? '双方均已确认匿名边界，会话即将开启。'
            : hasRequesterConsented
              ? '你已完成规则确认。对方确认边界后，将自动开启最长 72 小时的匿名会话。'
              : isConnected
                ? '对方愿意开启交流。请先确认匿名边界，双方均确认后会话方可正式开启。'
                : '对方可以自主决定是否回应。双方均确认匿名边界后，会话方可正式开启。'
        }}
      </p>

      <div class="request-preview">
        <div class="preview-meta">
          <span class="preview-tag">你的提问</span>
          <span class="preview-domain">{{ match?.experience?.domain || '匿名经历' }}</span>
        </div>
        <h3 class="preview-title">{{ match?.experience?.title || '这段经历正在等待回应' }}</h3>
        <div v-if="match?.experience?.tags?.length" class="preview-tags">
          <span v-for="tag in match.experience.tags.slice(0, 3)" :key="tag">{{ tag }}</span>
        </div>
        <blockquote v-if="match?.requestQuestion" class="preview-quote">“{{ match.requestQuestion }}”</blockquote>
        <p v-else class="preview-reason">{{ match?.requestReason || '你留下的请求正在等待对方决定。' }}</p>
      </div>

      <div class="action-row">
        <button
          v-if="isConnected && !hasRequesterConsented"
          class="btn-primary"
          type="button"
          @click="goToConsent"
        >
          确认边界
        </button>
        <button v-else class="btn-primary" type="button" @click="load">刷新状态</button>
        <button class="btn-secondary" type="button" @click="back">返回同路</button>
      </div>
    </section>

    <section class="steps-section">
      <h2 class="steps-title">同行开启步骤</h2>
      <ol class="steps-list">
        <li class="step-item done">
          <span class="step-num" aria-hidden="true">1</span>
          <div class="step-body">
            <strong>你递出请求</strong>
            <small>已留下想聊的原因与具体问题。</small>
          </div>
        </li>
        <li :class="['step-item', { done: isConnected }]">
          <span class="step-num" aria-hidden="true">2</span>
          <div class="step-body">
            <strong>对方自主决定</strong>
            <small>对方可自由决定是否接受或暂不回应。</small>
          </div>
        </li>
        <li :class="['step-item', { done: bothConsented }]">
          <span class="step-num" aria-hidden="true">3</span>
          <div class="step-body">
            <strong>双方确认边界</strong>
            <small v-if="bothConsented">双方均已确认边界，正在进入会话。</small>
            <small v-else-if="hasRequesterConsented">你已确认边界，等待对方确认。</small>
            <small v-else-if="isConnected">对方已接受，待你确认边界后开启。</small>
            <small v-else>双方确认后开启最长 72 小时的匿名会话。</small>
          </div>
        </li>
      </ol>
    </section>

    <p class="quiet-tip">无需在此持续停留，对方回应后将在请求列表中提示。</p>
    <p v-if="error" class="error-note" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.peer-wait-page {
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

.status-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 20px 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  text-align: center;
}

.status-badge {
  padding: 3px 10px;
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-size: 12px;
  font-weight: 600;
}

.status-heading {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--gn-ink);
}

.status-desc {
  margin: 0;
  max-width: 290px;
  font-size: 13px;
  color: var(--gn-muted);
  line-height: 1.5;
}

.request-preview {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 8px;
  margin-top: 4px;
  padding: 12px 14px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  text-align: left;
  box-sizing: border-box;
}

.preview-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.preview-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--gn-leaf-deep);
}

.preview-domain {
  font-size: 11px;
  color: var(--gn-muted);
}

.preview-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--gn-ink);
  line-height: 1.35;
}

.preview-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.preview-tags span {
  padding: 2px 7px;
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper);
  border: 1px solid var(--gn-line);
  color: var(--gn-ink-soft);
  font-size: 11px;
}

.preview-quote {
  margin: 2px 0 0;
  padding: 6px 10px;
  border-left: 2px solid var(--gn-leaf);
  background: var(--gn-paper);
  color: var(--gn-ink);
  font-size: 13px;
  line-height: 1.5;
}

.preview-reason {
  margin: 0;
  font-size: 12px;
  color: var(--gn-muted);
  line-height: 1.5;
}

.action-row {
  display: flex;
  gap: 10px;
  margin-top: 4px;
  width: 100%;
}

.btn-primary {
  flex: 1;
  min-height: 38px;
  border: 0;
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf);
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn-secondary {
  flex: 1;
  min-height: 38px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper);
  color: var(--gn-ink-soft);
  font-size: 13px;
  cursor: pointer;
}

.steps-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.steps-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--gn-ink);
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.step-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.step-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 11px;
  background: var(--gn-paper-warm);
  border: 1px solid var(--gn-line);
  color: var(--gn-muted);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.step-item.done .step-num {
  background: var(--gn-leaf);
  border-color: var(--gn-leaf);
  color: #ffffff;
}

.step-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.step-body strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--gn-ink);
}

.step-body small {
  font-size: 12px;
  color: var(--gn-muted);
  line-height: 1.4;
}

.quiet-tip {
  margin: 4px 0 0;
  color: var(--gn-muted);
  font-size: 12px;
  text-align: center;
  line-height: 1.5;
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
</style>
