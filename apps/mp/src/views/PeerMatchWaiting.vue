<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

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
const isOwner = ref(false);
const loading = ref(true);
const error = ref('');
let timer: number | undefined;
let isUnmounted = false;
/** Discards a poll that started before the page was left or reloaded by hand. */
let loadSeq = 0;

const isConnected = computed(() => match.value?.status === 'connected');
const isClosed = computed(() =>
  ['declined', 'blocked', 'closed', 'expired'].includes(String(match.value?.status ?? '')),
);
const hasRequesterConsented = computed(() => Boolean(match.value?.requesterConsentAt));
const hasOwnerConsented = computed(() => Boolean(match.value?.ownerConsentAt));
const hasMyConsent = computed(() =>
  isOwner.value ? hasOwnerConsented.value : hasRequesterConsented.value,
);
const hasOtherConsent = computed(() =>
  isOwner.value ? hasRequesterConsented.value : hasOwnerConsented.value,
);
const bothConsented = computed(() => Boolean(hasRequesterConsented.value && hasOwnerConsented.value));
/** The reader's own consent is the only action this page can offer. */
const needsConsent = computed(() => !isClosed.value && isConnected.value && !hasMyConsent.value);

const statusText = computed(() => {
  if (isClosed.value) return '这次请求没有继续';
  if (bothConsented.value) return '双方已确认边界，会话已开启';
  if (isConnected.value && hasMyConsent.value) return '你已确认边界，等待对方确认';
  if (isConnected.value) return '对方已同意，等待你确认边界';
  return '等待对方回应';
});

const badge = computed<{ text: string; tone: 'waiting' | 'action' | 'closed' | 'ready' }>(() => {
  if (isClosed.value) return { text: '已结束', tone: 'closed' };
  if (bothConsented.value) return { text: '已开启', tone: 'ready' };
  if (isConnected.value) return { text: '待确认', tone: 'action' };
  return { text: '待回复', tone: 'waiting' };
});

const note = computed(() => {
  if (isClosed.value) return '这次请求没有继续。你仍可以浏览其他经历，或重新选择一段想聊的经历。';
  if (bothConsented.value) return '会话已建立，正在进入对话。';
  if (isConnected.value) return '对方已同意。双方确认边界后，会话才会开启。';
  return isOwner.value
    ? '你已同意交流，双方均确认匿名边界后，会话方可正式开启。'
    : '等待期间仍可以浏览其他经历。尚未建立聊天会话。';
});

const targetText = computed(() => {
  const experience = match.value?.experience;
  if (!experience) return '这段经历正在等待回应';
  const domain = String(experience.domain ?? '').trim();
  const title = String(experience.title ?? '').trim();
  if (domain && title) return `${domain} · ${title}`;
  return title || domain || '这段经历正在等待回应';
});

async function load() {
  if (timer) {
    window.clearTimeout(timer);
    timer = undefined;
  }
  const ticket = ++loadSeq;
  error.value = '';
  try {
    // 1. Check conversations first: once both parties consent, the conversation opens for both roles,
    // so both requester and owner navigate to the chat without depending on pending inbox queries.
    const conversations = await api.get<{ items: Array<{ matchId: string; status?: string }> }>('/api/v1/peer-conversations');
    if (ticket !== loadSeq) return;
    const activeConv = (conversations.items ?? []).find((c) => c.matchId === matchId.value);
    if (activeConv) {
      await router.replace(`/pages/peer/conversation?matchId=${encodeURIComponent(matchId.value)}`);
      return;
    }

    // 2. Check both peers (requester view) and peer-requests (experience owner view), so an owner
    // navigated here after consenting sees their pending state rather than "request not found".
    const [peersRes, requestsRes] = await Promise.allSettled([
      api.get<{ item: { matches: Match[] } }>(
        `/api/v1/peers?matchId=${encodeURIComponent(matchId.value)}`,
      ),
      api.get<{ items: any[] }>('/api/v1/peer-requests?scope=received'),
    ]);
    if (ticket !== loadSeq) return;

    const fromPeers =
      peersRes.status === 'fulfilled'
        ? peersRes.value.item?.matches?.find((item) => item.id === matchId.value) ?? null
        : null;
    const fromRequests =
      requestsRes.status === 'fulfilled'
        ? requestsRes.value.items?.find((item: any) => item.id === matchId.value) ?? null
        : null;

    // Distinguish network/server errors from true absence: if neither list yielded the match but
    // a query was rejected, render a retryable error instead of falsely claiming the request does not exist.
    if (!fromPeers && !fromRequests) {
      if (peersRes.status === 'rejected' || requestsRes.status === 'rejected') {
        const failure: any = peersRes.status === 'rejected' ? peersRes.reason : (requestsRes as any).reason;
        throw new Error(failure?.message ?? '请求状态暂时无法更新，请稍后重试。');
      }
    }

    isOwner.value = Boolean(fromRequests && !fromPeers);
    match.value = fromRequests ?? fromPeers ?? null;
  } catch (cause: any) {
    if (ticket !== loadSeq) return;
    error.value = cause?.message ?? '等待状态暂时无法更新';
  } finally {
    if (ticket === loadSeq) {
      loading.value = false;
      // Strictly serialized: schedule next poll only after this request has fully settled.
      if (!isUnmounted) {
        timer = window.setTimeout(load, 7000);
      }
    }
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
});

onBeforeUnmount(() => {
  isUnmounted = true;
  loadSeq += 1;
  if (timer) window.clearTimeout(timer);
  timer = undefined;
});
</script>

<template>
  <section class="peer-wait-page">
    <header class="wait-bar">
      <button class="back-btn" data-testid="peer-wait-back" type="button" aria-label="返回同路" @click="back">
        ‹
      </button>
      <h1>等待回应</h1>
      <span aria-hidden="true"></span>
    </header>

    <div class="wait-body">
      <p v-if="loading" class="wait-state" data-testid="wait-loading">正在确认请求状态…</p>
      <LoadErrorBanner v-else-if="error" :message="error" retry-label="重新加载" @retry="load" />

      <template v-else-if="match">
        <section class="wait-hero" aria-label="请求状态">
          <span class="wait-ring" aria-hidden="true"></span>
          <h2>{{ isClosed ? '请求已结束' : bothConsented ? '会话已开启' : '请求已发出' }}</h2>
          <p>{{ isClosed ? '这次没有继续，也不会建立聊天会话。' : '对方同意后，还需要双方确认交流边界。' }}</p>
        </section>

        <section class="wait-card">
          <div class="wait-row">
            <span class="wait-label">请求对象</span>
            <p class="wait-value" data-testid="wait-target">{{ targetText }}</p>
          </div>
          <div class="wait-row">
            <span class="wait-label">当前状态</span>
            <div class="wait-status">
              <span class="wait-status-text">{{ statusText }}</span>
              <span class="wait-badge" :class="badge.tone" data-testid="wait-status-badge">{{ badge.text }}</span>
            </div>
          </div>
        </section>

        <p class="wait-note" data-testid="wait-note">{{ note }}</p>

        <div class="wait-actions">
          <button
            v-if="needsConsent"
            class="btn-primary"
            data-testid="wait-primary"
            type="button"
            @click="goToConsent"
          >
            确认边界
          </button>
          <button
            v-else
            class="btn-primary"
            data-testid="wait-primary"
            type="button"
            @click="back"
          >
            返回同路
          </button>
          <button
            v-if="needsConsent"
            class="btn-text"
            data-testid="wait-secondary"
            type="button"
            @click="back"
          >
            稍后再说
          </button>
        </div>
      </template>

      <template v-else>
        <section class="wait-hero" aria-label="请求不存在">
          <span class="wait-ring" aria-hidden="true"></span>
          <h2>没有找到这条请求</h2>
          <p>它可能已经被撤回。可以从同路列表重新选择一段经历。</p>
        </section>
        <div class="wait-actions">
          <button class="btn-primary" data-testid="wait-primary" type="button" @click="back">返回同路</button>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
/*
 * This route has no tab bar, but the shell reserves 88px for one. Left in place, the primary action
 * sat below the fold on a short screen.
 */
.peer-wait-page {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 100%;
  overflow-x: hidden;
  background: var(--gn-paper);
  color: var(--gn-text);
  font-family: var(--gn-font-body);
}

:global(.phone-shell:has(.peer-wait-page)) {
  padding-bottom: 0;
}

.wait-bar {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 0;
  box-sizing: border-box;
  width: 100%;
  min-height: 52px;
  padding: 0 16px;
  border-bottom: 1px solid var(--gn-line);
  background: var(--gn-paper);
}

.wait-bar h1 {
  margin: 0;
  color: var(--gn-ink);
  text-align: left;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.2px;
  line-height: 1.3;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 24px;
  height: 44px;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--gn-ink);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.wait-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 0 16px calc(16px + env(safe-area-inset-bottom));
}

.wait-state {
  margin: 32px 0;
  color: var(--gn-muted);
  font-size: 13px;
  text-align: center;
}

.wait-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 44px 8px 32px;
  text-align: center;
}

/* A ring of dots, static: a moving spinner would imply progress the page cannot observe. */
.wait-ring {
  box-sizing: border-box;
  width: 54px;
  height: 54px;
  margin-bottom: 6px;
  border: 6px dotted #9fb8ae;
  border-radius: 50%;
}

.wait-hero h2 {
  margin: 0;
  color: var(--gn-ink);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
}

.wait-hero p {
  margin: 0;
  max-width: 300px;
  color: var(--gn-muted);
  font-size: 14px;
  line-height: 1.6;
}

.wait-card {
  border: 1px solid var(--gn-line);
  border-radius: 12px;
  background: var(--gn-paper);
}

.wait-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
}

.wait-row + .wait-row {
  border-top: 1px solid var(--gn-line);
}

.wait-label {
  color: var(--gn-ink);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.wait-value {
  margin: 0;
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.5;
}

.wait-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.wait-status-text {
  min-width: 0;
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.5;
}

.wait-badge {
  flex: none;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
}

.wait-badge.waiting {
  background: #fbf0dd;
  color: #b26a00;
}

.wait-badge.action,
.wait-badge.ready {
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
}

.wait-badge.closed {
  background: #f0f2f4;
  color: #6b727b;
}

.wait-note {
  margin: 14px 0 0;
  padding: 14px 16px;
  border-radius: 8px;
  background: #f2f4f6;
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.6;
}

.wait-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: auto;
  padding-top: 28px;
}

.btn-primary {
  width: 100%;
  min-height: 48px;
  border: 0;
  border-radius: 8px;
  background: var(--gn-leaf);
  color: #ffffff;
  font-family: var(--gn-font-body);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.btn-text {
  width: 100%;
  min-height: 40px;
  border: 0;
  background: none;
  color: var(--gn-muted);
  font-family: var(--gn-font-body);
  font-size: 14px;
  cursor: pointer;
}
</style>
