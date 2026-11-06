<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

type Notice = {
  id: string;
  title: string;
  body: string;
  type: string;
  targetRoute?: string;
  status: 'unread' | 'read' | 'dismissed';
  createdAt: string;
};

const router = useRouter();
const loading = ref(true);
const error = ref('');
const markingAll = ref(false);
const tab = ref<'all' | 'unread'>('all');
const notices = ref<Notice[]>([]);

const unreadCount = computed(() => notices.value.filter((item) => item.status === 'unread').length);
const visibleNotices = computed(() =>
  tab.value === 'all' ? notices.value : notices.value.filter((item) => item.status === 'unread'),
);

const typeLabel = (type: string) =>
  ({
    FOLLOW_UP: '行动回访',
    JOURNEY_CHECKIN: '旅程回访',
    PEER_REQUEST: '同路',
    PEER_ACCEPTED: '同路',
    FUTURE_SELF: '写给未来的我',
    COOLDOWN_RELEASED: '决定',
  })[type] ?? '提醒';

function relative(value: string) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '昨天';
  if (days < 30) return `${days}天前`;
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date(then));
}

function subtitle(item: Notice) {
  if (bucket(item.createdAt) === '今天') {
    return `${typeLabel(item.type)} · ${relative(item.createdAt)}`;
  }
  return item.body || `${typeLabel(item.type)} · ${relative(item.createdAt)}`;
}

function bucket(value: string) {
  const then = new Date(value);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (then.getTime() >= startOfToday.getTime()) return '今天';
  if (then.getTime() >= startOfToday.getTime() - 86_400_000) return '昨天';
  return '更早';
}

const grouped = computed(() => {
  const order = ['今天', '昨天', '更早'];
  const groups = new Map<string, Notice[]>();
  for (const item of visibleNotices.value) {
    const key = bucket(item.createdAt);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return order.filter((key) => groups.has(key)).map((key) => ({ key, items: groups.get(key)! }));
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const response = await api.get<{ items: Notice[] }>('/api/v1/notifications');
    notices.value = response.items ?? [];
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '提醒暂时没有加载出来';
  } finally {
    loading.value = false;
  }
}

async function markAllRead() {
  const unread = notices.value.filter((item) => item.status === 'unread');
  if (!unread.length || markingAll.value) return;
  markingAll.value = true;
  error.value = '';
  try {
    await Promise.all(unread.map((item) => api.patch(`/api/v1/notifications/${item.id}/read`)));
    notices.value = notices.value.map((item) => ({ ...item, status: 'read' as const }));
  } catch {
    error.value = '部分提醒没能标记为已读，请稍后再试。';
    await load();
  } finally {
    markingAll.value = false;
  }
}

async function open(item: Notice) {
  if (item.status === 'unread') {
    try {
      await api.patch(`/api/v1/notifications/${item.id}/read`);
      notices.value = notices.value.map((notice) =>
        notice.id === item.id ? { ...notice, status: 'read' } : notice,
      );
    } catch {
      error.value = '这条提醒暂时没能标记为已读，但内容仍然可以打开。';
    }
  }
  if (!item.targetRoute) return;
  try {
    await router.push(item.targetRoute);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '这个提醒的目标暂时打不开';
  }
}

onMounted(load);
</script>

<template>
  <section class="goodnight-page notice-page">
    <header class="notice-header">
      <button class="back-btn" data-testid="notifications-back" aria-label="返回" type="button" @click="router.back()">‹</button>
      <h1 class="notice-title-main">消息与回访</h1>
      <button
        class="mark-all"
        data-testid="notifications-mark-all"
        type="button"
        :disabled="!unreadCount || markingAll"
        @click="markAllRead"
      >
        {{ markingAll ? '处理中…' : '全部已读' }}
      </button>
    </header>

    <div class="notice-tabs" role="tablist">
      <button
        class="tab-btn"
        data-testid="notifications-tab-all"
        :class="{ active: tab === 'all' }"
        role="tab"
        type="button"
        @click="tab = 'all'"
      >
        全部
      </button>
      <button
        class="tab-btn"
        data-testid="notifications-tab-unread"
        :class="{ active: tab === 'unread' }"
        role="tab"
        type="button"
        @click="tab = 'unread'"
      >
        未读
      </button>
    </div>

    <div class="notice-body">
      <LoadErrorBanner :message="error" retry-label="重新加载" @retry="load" />
      <p v-if="loading" class="loading-note">正在读取提醒…</p>

      <template v-else>
        <section v-for="group in grouped" :key="group.key" class="notice-group">
          <h2 class="group-title">{{ group.key }}</h2>
          <ul class="notice-list">
            <li v-for="item in group.items" :key="item.id">
              <button
                class="notice-row"
                :class="{ unread: item.status === 'unread' }"
                type="button"
                :data-testid="`notification-${item.id}`"
                @click="open(item)"
              >
                <span class="notice-icon-box" aria-hidden="true">
                  <!-- Envelope icon for FUTURE_SELF -->
                  <svg
                    v-if="item.type === 'FUTURE_SELF'"
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="#5c6b73"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  <!-- Checkmark icon for checkin/finished action -->
                  <svg
                    v-else-if="item.type === 'JOURNEY_CHECKIN' || item.type === 'COOLDOWN_RELEASED'"
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="#5c6b73"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <!-- Filled circle for follow-up and peer messages -->
                  <span v-else class="notice-dot-icon"></span>
                </span>
                <span class="notice-copy">
                  <strong class="row-title">{{ item.title }}</strong>
                  <span class="row-sub">{{ subtitle(item) }}</span>
                </span>
                <span class="notice-chevron" aria-hidden="true">›</span>
              </button>
            </li>
          </ul>
        </section>
        <p v-if="!visibleNotices.length" class="empty-note">
          {{ tab === 'unread' ? '没有未读的提醒。' : '这里暂时没有需要你回应的提醒。' }}
        </p>
        <p class="notice-foot">已读状态会自动保存</p>
      </template>
    </div>
  </section>
</template>

<style scoped>
.notice-page {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 100%;
  overflow-x: hidden;
  background: var(--gn-paper, #ffffff);
  color: var(--gn-text, #242a32);
  font-family: var(--gn-font-body);
}

:global(.phone-shell:has(.notice-page)) {
  padding-bottom: 0;
}

.notice-header {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  width: 100%;
  min-height: 52px;
  padding: 0 16px;
  border-bottom: 1px solid var(--gn-line, #eef0f2);
  background: var(--gn-paper, #ffffff);
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 28px;
  height: 44px;
  min-height: 44px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--gn-ink, #242a32);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.notice-title-main {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--gn-ink, #242a32);
  letter-spacing: -0.2px;
}

.mark-all {
  min-height: 36px;
  padding: 0 4px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--gn-primary, #275f56);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
}

.mark-all:disabled {
  color: var(--gn-muted, #9ca3af);
  cursor: default;
}

.notice-tabs {
  display: flex;
  gap: 24px;
  padding: 0 16px;
  border-bottom: 1px solid var(--gn-line, #eef0f2);
}

.notice-tabs .tab-btn {
  position: relative;
  min-height: 40px;
  padding: 0 2px;
  border: 0;
  border-radius: 0;
  background: transparent;
  font-size: 15px;
  font-weight: 500;
  color: var(--gn-muted, #757d87);
  cursor: pointer;
}

.notice-tabs .tab-btn.active {
  color: var(--gn-ink, #242a32);
  font-weight: 700;
}

.notice-tabs .tab-btn.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  border-radius: 1px;
  background: var(--gn-primary, #275f56);
}

.notice-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 0 16px calc(24px + env(safe-area-inset-bottom));
}

.notice-group {
  margin-top: 24px;
}

.group-title {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 700;
  color: var(--gn-ink, #242a32);
}

.notice-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.notice-row {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 68px;
  padding: 14px 0;
  border: 0;
  border-radius: 0;
  border-bottom: 1px solid var(--gn-line, #eef0f2);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.notice-icon-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: #f4f5f7;
  color: #5c6b73;
}

.notice-dot-icon {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #5c6b73;
}

.notice-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.row-title {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: var(--gn-ink, #242a32);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-sub {
  display: block;
  font-size: 13px;
  color: var(--gn-muted, #757d87);
}

.notice-chevron {
  color: #b6bcc4;
  font-size: 20px;
  flex-shrink: 0;
}

.empty-note,
.loading-note {
  margin: 40px 0;
  text-align: center;
  font-size: 14px;
  color: var(--gn-muted, #757d87);
}

.notice-foot {
  margin: 32px 0 16px;
  text-align: center;
  font-size: 13px;
  color: #88929c;
}
</style>
