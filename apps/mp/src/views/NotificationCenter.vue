<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import AppIcon from '../components/icons/AppIcon.vue';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

type Notice = { id: string; title: string; body: string; type: string; targetRoute?: string; status: 'unread' | 'read' | 'dismissed'; createdAt: string };
const router = useRouter();
const loading = ref(true);
const error = ref('');
const markingAll = ref(false);
const tab = ref<'all' | 'unread'>('all');
const notices = ref<Notice[]>([]);
const unreadCount = computed(() => notices.value.filter((item) => item.status === 'unread').length);
const visibleNotices = computed(() => (tab.value === 'all' ? notices.value : notices.value.filter((item) => item.status === 'unread')));

const noticeIcon = (type: string) =>
  ({ FOLLOW_UP: 'clock', JOURNEY_CHECKIN: 'clock', PEER_REQUEST: 'people', PEER_ACCEPTED: 'people', FUTURE_SELF: 'message', COOLDOWN_RELEASED: 'pause' })[type] ?? 'bell';

/** What the reminder is about, shown next to the time rather than as a decorative illustration. */
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

/** Date buckets, so a long list stays scannable. */
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
    notices.value = (await api.get<{ items: Notice[] }>('/api/v1/notifications')).items;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '提醒暂时没有加载出来';
  } finally {
    loading.value = false;
  }
}

/**
 * Marks everything read by calling the per-item endpoint that already exists.
 *
 * There is no bulk endpoint on the server and inventing one is not this change's job, so this issues
 * the same PATCH per unread item. It is honest about partial failure: whatever succeeded stays read
 * on screen, and the error names what happened.
 */
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
  // Navigation must not depend on the read receipt. Previously both were in one try block,
  // so a failed mark-read stopped the tap from opening its target at all (UI2-009).
  if (item.status === 'unread') {
    try {
      await api.patch(`/api/v1/notifications/${item.id}/read`);
      notices.value = notices.value.map((notice) => (notice.id === item.id ? { ...notice, status: 'read' } : notice));
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
  <section class="goodnight-page notice-v2">
    <header class="notice-header">
      <button aria-label="返回" @click="router.back()"><AppIcon name="back" /></button>
      <h1>消息与回访</h1>
      <button class="mark-all" type="button" :disabled="!unreadCount || markingAll" @click="markAllRead">
        {{ markingAll ? '处理中…' : '全部已读' }}
      </button>
    </header>

    <div class="notice-tabs" role="tablist">
      <button :class="{ active: tab === 'all' }" role="tab" @click="tab = 'all'">全部</button>
      <button :class="{ active: tab === 'unread' }" role="tab" @click="tab = 'unread'">
        未读<template v-if="unreadCount"> {{ unreadCount }}</template>
      </button>
    </div>

    <LoadErrorBanner :message="error" retry-label="重新加载" @retry="load" />
    <p v-if="loading" class="loading-note">正在读取提醒…</p>

    <template v-else>
      <section v-for="group in grouped" :key="group.key" class="notice-group">
        <h2>{{ group.key }}</h2>
        <ul>
          <li v-for="item in group.items" :key="item.id">
            <button
              class="notice-row"
              :class="{ unread: item.status === 'unread' }"
              type="button"
              :data-testid="`notification-${item.id}`"
              @click="open(item)"
            >
              <span class="notice-icon" aria-hidden="true"><AppIcon :name="noticeIcon(item.type)" :size="20" /></span>
              <span class="notice-copy">
                <strong>{{ item.title }}</strong>
                <small>{{ typeLabel(item.type) }} · {{ relative(item.createdAt) }}</small>
              </span>
              <i v-if="item.status === 'unread'" aria-label="未读" />
              <AppIcon name="arrow" :size="18" />
            </button>
          </li>
        </ul>
      </section>
      <p v-if="!visibleNotices.length" class="empty-note">
        {{ tab === 'unread' ? '没有未读的提醒。' : '这里暂时没有需要你回应的提醒。' }}
      </p>
      <p class="notice-foot">仅显示真实通知 · 已读状态会同步保存</p>
    </template>
  </section>
</template>

<style scoped>
.notice-v2 {
  padding-bottom: 40px;
}

.notice-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0 14px;
  border-bottom: 1px solid var(--gn-divider, #e8ebef);
}

.notice-header > button:first-child {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-left: -10px;
  border: 0;
  background: transparent;
  color: var(--gn-ink, #242a32);
  cursor: pointer;
}

.notice-header h1 {
  flex: 1;
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--gn-ink, #242a32);
}

.mark-all {
  min-height: 40px;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--gn-primary, #275f56);
  font-size: 15px;
  cursor: pointer;
}

.mark-all:disabled {
  color: var(--gn-muted, #757d87);
  cursor: default;
}

.notice-tabs {
  display: flex;
  gap: 22px;
  margin-top: 4px;
  border-bottom: 1px solid var(--gn-divider, #e8ebef);
}

.notice-tabs button {
  position: relative;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 15px;
  color: var(--gn-muted, #757d87);
  cursor: pointer;
}

.notice-tabs button.active {
  color: var(--gn-ink, #242a32);
  font-weight: 600;
}

.notice-tabs button.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--gn-primary, #275f56);
}

.notice-group {
  margin-top: 20px;
}

.notice-group h2 {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 500;
  color: var(--gn-muted, #757d87);
}

.notice-group ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.notice-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 64px;
  padding: 12px 0;
  border: 0;
  border-bottom: 1px solid var(--gn-divider, #e8ebef);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.notice-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--gn-surface-soft, #f7f8fa);
  color: var(--gn-muted, #757d87);
}

.notice-row.unread .notice-icon {
  background: var(--gn-selected, #eaf1ed);
  color: var(--gn-primary, #275f56);
}

.notice-copy {
  flex: 1;
  min-width: 0;
}

.notice-copy strong {
  display: block;
  font-size: 15px;
  font-weight: 500;
  color: var(--gn-ink, #242a32);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notice-row.unread .notice-copy strong {
  font-weight: 600;
}

.notice-copy small {
  display: block;
  margin-top: 3px;
  font-size: 13px;
  color: var(--gn-muted, #757d87);
}

.notice-row i {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--gn-primary, #275f56);
}

.notice-row > :last-child {
  flex: 0 0 auto;
  color: var(--gn-muted, #757d87);
}

.empty-note,
.loading-note {
  margin: 40px 0 0;
  text-align: center;
  font-size: 14px;
  color: var(--gn-muted, #757d87);
}

.notice-foot {
  margin: 28px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--gn-muted, #757d87);
}

</style>
