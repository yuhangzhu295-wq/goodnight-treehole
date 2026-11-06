<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

type RequestItem = {
  id: string;
  status: 'requested' | 'connected' | 'declined' | 'blocked';
  requestReason?: string;
  requestQuestion?: string;
  experience?: { title?: string; domain?: string };
};
const router = useRouter();
const items = ref<RequestItem[]>([]);
const loading = ref(true);
const busyId = ref('');
const error = ref('');
const pending = computed(() => items.value.filter((item) => item.status === 'requested'));
const accepted = computed(() => items.value.filter((item) => item.status === 'connected'));
const closed = computed(() =>
  items.value.filter((item) => ['declined', 'blocked'].includes(item.status)),
);
/** Which lifecycle stage the reader is looking at. */
type RequestTab = 'pending' | 'accepted' | 'closed';
const TABS: RequestTab[] = ['pending', 'accepted', 'closed'];
const TAB_LABELS: Record<RequestTab, string> = { pending: '待回应', accepted: '已接受', closed: '已结束' };
const EMPTY_TITLES: Record<RequestTab, string> = {
  pending: '暂无待回应的请求',
  accepted: '暂无待确认边界的同行',
  closed: '还没有已结束的请求',
};
const TAB_HINTS: Record<RequestTab, string> = {
  pending: '有人阅读了你留下的后来记录，希望与你开启限时匿名交流。',
  accepted: '你已同意交流，确认匿名边界后即可开启会话。',
  closed: '这些请求已经有了结果：你拒绝了、屏蔽了，或会话已经结束。',
};
const tab = ref<RequestTab>('pending');
const tabCounts = computed(() => ({
  pending: pending.value.length,
  accepted: accepted.value.length,
  closed: closed.value.length,
}));
const visible = computed(() => (tab.value === 'pending' ? pending.value : tab.value === 'accepted' ? accepted.value : closed.value));

async function load() {
  error.value = '';
  loading.value = true;
  try {
    items.value = (await api.get<{ items: RequestItem[] }>('/api/v1/peer-requests')).items;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '请求加载失败';
  } finally {
    loading.value = false;
  }
}

function itemStatusLabel(item: RequestItem) {
  if (item.status === 'requested') return '待回应';
  if (item.status === 'connected') return '待确认边界';
  if (item.status === 'declined') return '已婉拒';
  return '已结束';
}

function itemMetaText(item: RequestItem) {
  const domain = item.experience?.domain || '匿名经历';
  if (item.status === 'requested') return `${domain} · 等待你的回应`;
  if (item.status === 'connected') return `${domain} · 已同意，等待确认同行边界`;
  return `${domain} · 请求已结束`;
}

async function respond(item: RequestItem, status: 'connected' | 'declined' | 'blocked') {
  busyId.value = item.id;
  error.value = '';
  try {
    await api.post(`/api/v1/peer-matches/${encodeURIComponent(item.id)}/respond`, { status });
    if (status === 'connected') {
      await router.push(`/pages/peer/consent?matchId=${encodeURIComponent(item.id)}`);
    } else {
      await load();
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '请求处理失败';
  } finally {
    busyId.value = '';
  }
}

function openConsent(item: RequestItem) {
  router.push(`/pages/peer/consent?matchId=${encodeURIComponent(item.id)}`);
}

onMounted(load);
</script>

<template>
  <section class="goodnight-page peer-requests-page">
    <header class="peer-header">
      <div class="header-titles">
        <h1 class="peer-title">同行请求</h1>
        <p class="peer-subtitle">查看收到的匿名同行交流请求与处理状态</p>
      </div>
    </header>

    <div class="segmented-control" role="tablist" aria-label="请求状态">
      <button
        v-for="key in TABS"
        :key="key"
        type="button"
        role="tab"
        :aria-selected="tab === key"
        :class="{ active: tab === key }"
        :data-testid="'peer-request-tab-' + key"
        @click="tab = key"
      >
        {{ TAB_LABELS[key] }} <b>{{ tabCounts[key] }}</b>
      </button>
    </div>
    <p class="tab-hint">{{ TAB_HINTS[tab] }}</p>

    <LoadErrorBanner :message="error" retry-label="重新加载" @retry="load" />
    <p v-if="loading" class="state-note">正在读取请求…</p>

    <template v-else>
      <section v-if="visible.length" class="request-section">
        <article v-for="item in visible" :key="item.id" class="request-item">
          <div class="request-identity">
            <div class="avatar-box">
              <span class="avatar-text">求</span>
            </div>
            <div class="identity-info">
              <strong class="identity-name">匿名同行者</strong>
              <span class="identity-meta">{{ itemMetaText(item) }}</span>
            </div>
            <span class="status-pill" :class="item.status">{{ itemStatusLabel(item) }}</span>
          </div>

          <div class="request-content">
            <h2 class="experience-ref-title">{{ item.experience?.title || '一段匿名经历' }}</h2>
            <blockquote v-if="item.requestQuestion" class="request-question">“{{ item.requestQuestion }}”</blockquote>
            <p v-if="item.requestReason" class="request-reason">{{ item.requestReason }}</p>
          </div>

          <div class="request-actions">
            <button
              v-if="tab === 'pending'"
              :disabled="busyId === item.id"
              class="btn-accept"
              :data-testid="'peer-request-accept-' + item.id"
              type="button"
              @click="respond(item, 'connected')"
            >
              我愿意聊聊
            </button>
            <button
              v-if="tab === 'pending'"
              :disabled="busyId === item.id"
              class="btn-decline"
              :data-testid="'peer-request-decline-' + item.id"
              type="button"
              @click="respond(item, 'declined')"
            >
              这次先不了
            </button>
            <template v-else-if="tab === 'accepted'">
              <button
                class="btn-text"
                :data-testid="'peer-request-consent-' + item.id"
                type="button"
                @click="openConsent(item)"
              >
                确认同行边界
              </button>
            </template>
            <button
              v-if="tab !== 'closed'"
              :disabled="busyId === item.id"
              class="btn-text"
              type="button"
              @click="respond(item, 'blocked')"
            >
              暂时不想
            </button>
          </div>
        </article>
      </section>

      <section v-else-if="!error" class="empty-panel" :data-testid="'peer-request-empty-' + tab">
        <h2>{{ EMPTY_TITLES[tab] }}</h2>
        <p>
          <template v-if="tab === 'pending'">当有人阅读你留下的后来记录并希望交流时，请求会显示在这里。</template>
          <template v-else-if="tab === 'accepted'">你接受一个请求后，它会出现在这里等待边界确认。</template>
          <template v-else>你拒绝、屏蔽或结束的请求会留在这里，方便回看。</template>
        </p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.peer-requests-page {
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
  padding: 8px 4px 4px;
}

.peer-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--gn-ink);
}

.peer-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--gn-muted);
}

/* Three lifecycle stages now, not two: the grid has to follow. */
.segmented-control {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
  padding: 3px;
  border: 1px solid #e8eaed;
  border-radius: 10px;
  background: #ffffff;
}

/* One line explaining what the current stage means, instead of the per-section intro copy. */
.tab-hint {
  margin: 10px 0 0;
  color: #7a838e;
  font-size: 12px;
  line-height: 1.6;
}

.segmented-control button {
  min-height: 36px;
  border: 0;
  border-radius: var(--gn-radius-small);
  background: transparent;
  color: var(--gn-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.segmented-control button.active {
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-weight: 600;
}

.segmented-control b {
  font-size: 12px;
  margin-left: 2px;
}

.state-note {
  margin: 24px 0;
  color: var(--gn-muted);
  font-size: 13px;
  text-align: center;
}

.request-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.request-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.request-identity {
  display: flex;
  align-items: center;
  gap: 10px;
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
  flex-shrink: 0;
}

.identity-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.identity-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--gn-ink);
  line-height: 1.3;
}

.identity-meta {
  font-size: 11px;
  color: var(--gn-muted);
  line-height: 1.3;
}

.status-pill {
  padding: 2px 7px;
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-size: 11px;
  font-weight: 500;
  flex-shrink: 0;
}

.request-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.experience-ref-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--gn-ink);
  line-height: 1.35;
}

.request-question {
  margin: 2px 0 0;
  padding: 8px 10px;
  border-left: 2px solid var(--gn-leaf);
  border-radius: 0 var(--gn-radius-small) var(--gn-radius-small) 0;
  background: var(--gn-paper-warm);
  color: var(--gn-ink-soft);
  font-size: 13px;
  line-height: 1.5;
}

.request-reason {
  margin: 0;
  font-size: 12px;
  color: var(--gn-muted);
  line-height: 1.5;
}

.request-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--gn-line);
}

.btn-accept {
  min-height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf);
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.btn-decline {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper);
  color: var(--gn-ink-soft);
  font-size: 12px;
  cursor: pointer;
}

.btn-text {
  min-height: 32px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--gn-muted);
  font-size: 12px;
  cursor: pointer;
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

.empty-panel h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--gn-ink);
}

.empty-panel p {
  margin: 0;
  max-width: 280px;
  font-size: 13px;
  color: var(--gn-muted);
  line-height: 1.5;
}

</style>
