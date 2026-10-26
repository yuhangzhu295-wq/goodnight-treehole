<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

type FavoriteItem = {
  id: string;
  targetType: 'letter' | 'post' | 'diary';
  targetId: string;
  createdAt?: string;
  title?: string;
  preview?: string;
};

type Filter = 'all' | 'letter' | 'post' | 'diary';

const router = useRouter();
const items = ref<FavoriteItem[]>([]);
/** The server caps the list; when it does, the page says so instead of looking complete. */
const truncated = ref(false);
const filter = ref<Filter>('all');
const loading = ref(true);
const loadError = ref('');
/** Set while a removal is in flight, so a double tap cannot fire two deletes for one row. */
const removingId = ref('');
/** A failed removal is a write error, not a load failure: the list itself is still readable. */
const removeError = ref('');
const searchOpen = ref(false);
const searchTerm = ref('');
/** Re-read on every tick so relative labels follow the clock. */
const nowTick = ref(Date.now());
let clockTimer: number | undefined;
/** Discards a list response that started before the reader switched tabs. */
let loadSeq = 0;
/**
 * Ids this page has deleted. A GET that started before the delete committed still carries the row;
 * filtering by the in-flight id alone stopped covering it the moment `removingId` was cleared, so a
 * slow response could put a removed favourite back on screen. This page never re-adds a favourite,
 * so an id that stays here for the life of the component is accurate.
 */
const removedIds = new Set<string>();

const tabs: Array<{ key: Filter; label: string; testId: string }> = [
  { key: 'all', label: '全部', testId: 'filter-fav-all' },
  { key: 'letter', label: '回信', testId: 'filter-fav-letter' },
  { key: 'post', label: '树洞', testId: 'filter-fav-post' },
  { key: 'diary', label: '记录', testId: 'filter-fav-diary' },
];

/** The type a favourite actually points at. `post` is a tree-hole post, not a peer experience. */
const typeLabel: Record<FavoriteItem['targetType'], string> = {
  letter: '回信',
  post: '树洞',
  diary: '我的日记',
};

function favoriteMonthDay(value?: string) {
  const date = new Date(value ?? '');
  if (Number.isNaN(date.getTime())) return '收藏时间未记录';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * The date the person saved this, in their own calendar.
 *
 * Reading `nowTick` is what makes this re-evaluate as the clock advances: the labels are relative, so
 * a page left open past local midnight has to move a row from 今天收藏 to 昨天收藏 on its own.
 */
function favoriteDateLabel(value?: string) {
  void nowTick.value;
  const date = new Date(value ?? '');
  if (Number.isNaN(date.getTime())) return '收藏时间未记录';
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const days = Math.round(
    (midnight.getTime() - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86400000,
  );
  if (days <= 0) return '今天收藏';
  if (days === 1) return '昨天收藏';
  const sameYear = date.getFullYear() === midnight.getFullYear();
  return sameYear ? `${favoriteMonthDay(value)}收藏` : `${date.getFullYear()}年${favoriteMonthDay(value)}收藏`;
}

/**
 * A single readable title from the target's own text; the API's post title is a fixed string, so a
 * post is titled from its content. The first 18 characters are kept whole rather than split on
 * whitespace, which would shorten a sentence with a space near the start.
 */
function itemTitle(item: FavoriteItem) {
  const own = String(item.title ?? '').trim();
  if (item.targetType !== 'post' && own) return own;
  const preview = String(item.preview ?? '').trim().replace(/\s+/g, '');
  return preview ? `${preview.slice(0, 18)}…` : own || '收藏的内容';
}

const filtered = computed(() => {
  const term = searchTerm.value.trim().toLowerCase();
  if (!term) return items.value;
  return items.value.filter((item) =>
    `${itemTitle(item)}\n${item.preview ?? ''}`.toLowerCase().includes(term),
  );
});

const emptyMessage = computed(() => {
  if (searchTerm.value.trim()) return '没有匹配的收藏';
  if (filter.value === 'all') return '还没有收藏';
  return `${typeLabel[filter.value]}里暂时没有收藏`;
});

const emptyHint = computed(() => {
  if (searchTerm.value.trim()) return '换一个词试试，搜索只覆盖已经加载的收藏。';
  return '在回信、树洞或日记里点收藏，内容会出现在这里。';
});

async function load(next: Filter = filter.value) {
  filter.value = next;
  // A response that started before the reader switched tabs must not land on the new tab's list.
  const ticket = ++loadSeq;
  loading.value = true;
  loadError.value = '';
  const query = next === 'all' ? '' : `?type=${next}`;
  try {
    const result = await api.get<{ items: FavoriteItem[]; total?: number; truncated?: boolean }>(
      `/api/v1/favorites${query}`,
    );
    if (ticket !== loadSeq) return;
    // A removal in flight has already taken its row off screen; a list read that started before it
    // committed would put it back, and the delete would then look like it did nothing.
    const pending = removingId.value;
    items.value = (result.items ?? []).filter((row) => row.id !== pending && !removedIds.has(row.id));
    truncated.value = Boolean(result.truncated);
  } catch (cause: any) {
    if (ticket !== loadSeq) return;
    // An empty list must not stand in for a request that failed.
    items.value = [];
    loadError.value = cause?.message ?? '收藏加载失败，请稍后重试';
  } finally {
    if (ticket === loadSeq) loading.value = false;
  }
}

function toggleSearch() {
  searchOpen.value = !searchOpen.value;
  if (!searchOpen.value) searchTerm.value = '';
}

function openItem(item: FavoriteItem) {
  const id = encodeURIComponent(item.targetId);
  if (item.targetType === 'post') router.push(`/pages/post/detail?id=${id}`);
  else if (item.targetType === 'letter') router.push(`/pages/letter/detail?id=${id}`);
  else router.push(`/pages/diary/detail?id=${id}`);
}

/**
 * Removes the row the reader tapped, and only that row.
 *
 * The optimistic removal is what "即时同步" means; if the delete fails the row comes back rather than
 * the page claiming a removal that did not happen.
 */
async function removeFavorite(item: FavoriteItem) {
  if (removingId.value) return;
  removingId.value = item.id;
  removeError.value = '';
  const snapshot = items.value;
  const ticket = loadSeq;
  items.value = snapshot.filter((row) => row.id !== item.id);
  try {
    const result = await api.delete<{ ok: boolean }>(`/api/v1/favorites/${item.id}`);
    if (!result?.ok) throw new Error('取消收藏没有成功');
    removedIds.add(item.id);
  } catch (cause: any) {
    if (ticket === loadSeq) {
      // Put this row back in the list the reader is looking at, not in a snapshot from another tab.
      items.value = snapshot;
    } else {
      // The reader moved to another tab while the delete was in flight: re-read the current one so
      // the row is restored where it belongs, rather than waiting for them to navigate again.
      void load();
    }
    removeError.value = cause?.message ?? '取消收藏失败，请稍后重试';
  } finally {
    removingId.value = '';
  }
}

onMounted(() => {
  load('all');
  clockTimer = window.setInterval(() => {
    nowTick.value = Date.now();
  }, 30_000);
});

onUnmounted(() => {
  if (clockTimer) window.clearInterval(clockTimer);
});
</script>

<template>
  <section class="page goodnight-page rest-page list-page favorite-list-page">
    <header class="favorite-list-bar">
      <button
        class="back-icon"
        data-testid="front-favorite-back"
        type="button"
        aria-label="返回"
        @click="router.back()"
      >‹</button>
      <h1>收藏</h1>
      <button
        class="search-toggle"
        data-testid="btn-favorite-search"
        type="button"
        aria-label="搜索收藏"
        :aria-expanded="searchOpen"
        @click="toggleSearch"
      >⌕</button>
    </header>

    <div v-if="searchOpen" class="favorite-search">
      <input
        v-model="searchTerm"
        data-testid="input-favorite-search"
        type="search"
        placeholder="搜索收藏"
        aria-label="搜索收藏"
      />
      <button v-if="searchTerm" type="button" data-testid="btn-favorite-search-clear" @click="searchTerm = ''">
        清除
      </button>
    </div>

    <div class="favorite-tabs" role="tablist" aria-label="收藏筛选">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        role="tab"
        :data-testid="tab.testId"
        :aria-selected="filter === tab.key"
        :class="{ active: filter === tab.key }"
        @click="load(tab.key)"
      >{{ tab.label }}</button>
    </div>

    <p v-if="loading" class="favorite-state" data-testid="favorite-list-loading">正在读取收藏…</p>
    <LoadErrorBanner v-else-if="loadError" :message="loadError" retry-label="重新加载" @retry="load()" />

    <template v-else>
      <p v-if="truncated" class="favorite-window-note" data-testid="favorite-window-note">
        收藏较多，这里只显示最近 {{ items.length }} 条。
      </p>
      <p v-if="removeError" class="favorite-remove-error" role="status" data-testid="favorite-remove-error">
        {{ removeError }}
        <button type="button" @click="removeError = ''">知道了</button>
      </p>
      <h2 v-if="filtered.length" class="favorite-group-title">最近收藏</h2>
      <div
        v-for="(item, index) in filtered"
        :key="item.id"
        class="favorite-row"
        :data-testid="index === 0 ? 'favorite-card-first' : `favorite-card-${item.id}`"
      >
        <button class="favorite-main" type="button" @click="openItem(item)">
          <span class="favorite-icon" aria-hidden="true">♡</span>
          <span class="favorite-copy">
            <strong class="favorite-title">{{ itemTitle(item) }}</strong>
            <span class="favorite-meta">{{ typeLabel[item.targetType] }} · {{ favoriteDateLabel(item.createdAt) }}</span>
          </span>
          <span class="favorite-chevron" aria-hidden="true">›</span>
        </button>
        <button
          class="favorite-remove"
          type="button"
          :aria-label="`取消收藏 ${itemTitle(item)}`"
          :data-testid="index === 0 ? 'btn-favorite-remove' : `btn-favorite-remove-${item.id}`"
          :disabled="Boolean(removingId)"
          @click="removeFavorite(item)"
        >
          <span aria-hidden="true">♡</span>
        </button>
      </div>

      <div v-if="!filtered.length" class="favorite-empty" data-testid="favorite-list-empty">
        <strong>{{ emptyMessage }}</strong>
        <p>{{ emptyHint }}</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.favorite-list-page.goodnight-page {
  display: block;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 0;
  /* The bar and tabs below are exactly viewport-wide; `.goodnight-page` clips them at the inset. */
  overflow-x: visible;
  padding: 0 0 calc(130px + env(safe-area-inset-bottom));
}

.favorite-list-page .favorite-list-bar {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 0;
  box-sizing: border-box;
  width: calc(100% + 30px);
  max-width: none;
  min-height: 52px;
  margin: 0 -15px;
  padding: 0 18px;
  border: 0;
  border-bottom: 1px solid var(--gn-line);
  border-radius: 0;
  background: var(--gn-paper);
}

.favorite-list-page .back-icon,
.favorite-list-page .search-toggle {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 24px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--gn-ink);
  font-size: 22px;
  line-height: 1;
}

.favorite-list-page .search-toggle { justify-content: flex-end; }

.favorite-list-page .favorite-list-bar h1 {
  margin: 0;
  color: var(--gn-ink);
  text-align: left;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.2px;
  line-height: 1.3;
}

.favorite-search {
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  width: calc(100% + 30px);
  margin: 0 -15px;
  padding: 10px 18px;
  border: 0;
  border-bottom: 1px solid var(--gn-line);
  border-radius: 0;
  background: var(--gn-paper);
}

.favorite-search input {
  flex: 1;
  min-width: 0;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--gn-line);
  border-radius: 8px;
  background: var(--gn-paper);
  color: var(--gn-ink);
  font-family: var(--gn-font-body);
  font-size: 14px;
}

.favorite-search input:focus {
  outline: none;
  border-color: var(--gn-leaf);
}

.favorite-search button {
  flex: none;
  height: 38px;
  padding: 0 10px;
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--gn-muted);
  font-size: 13px;
}

.favorite-tabs {
  display: flex;
  gap: 30px;
  box-sizing: border-box;
  width: calc(100% + 30px);
  margin: 0 -15px;
  padding: 0 18px;
  border: 0;
  border-bottom: 1px solid var(--gn-line);
  border-radius: 0;
}

.favorite-tabs button {
  position: relative;
  height: 46px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--gn-muted);
  font-family: var(--gn-font-body);
  font-size: 15px;
  line-height: 1;
}

.favorite-tabs button.active {
  color: var(--gn-leaf);
  font-weight: 600;
}

.favorite-tabs button.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--gn-leaf);
}

.favorite-state {
  margin: 24px 0 0;
  color: var(--gn-muted);
  font-size: 14px;
}

.favorite-window-note {
  margin: 12px 0 0;
  padding: 8px 10px;
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  color: var(--gn-muted);
  font-size: 12px;
  line-height: 1.5;
}

.favorite-group-title {
  margin: 20px 0 2px;
  color: var(--gn-ink);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.35;
}

.favorite-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px;
  align-items: center;
  border: 0;
  border-bottom: 1px solid var(--gn-line);
}

.favorite-main {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 12px;
  width: 100%;
  /* The legacy page set a 106px minimum on `.favorite-main`, which nearly doubled every row. */
  min-height: 0;
  padding: 12px 0;
  border: 0;
  border-radius: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
}

.favorite-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--gn-paper-warm);
  color: #8a929b;
  font-size: 18px;
  line-height: 1;
}

.favorite-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.favorite-title {
  overflow: hidden;
  color: var(--gn-ink);
  font-size: 16.5px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.favorite-meta {
  overflow: hidden;
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.favorite-chevron {
  color: #b6bcc4;
  font-size: 20px;
  line-height: 1;
  text-align: right;
}

/* A separate, reachable control: the row itself navigates, this one unfavorites. */
.favorite-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--gn-muted);
  font-size: 16px;
  line-height: 1;
}

/* The legacy rule gave this span a 27px orange heart; the page's palette is ink and leaf. */
.favorite-remove > span {
  color: var(--gn-muted);
  font-size: 16px;
}

.favorite-remove:disabled {
  opacity: 0.6;
}

.favorite-remove-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 12px 0 0;
  padding: 10px 12px;
  border: 1px solid #e3c9c9;
  border-radius: 8px;
  background: #fdf7f7;
  color: #8f2f2f;
  font-size: 13px;
  line-height: 1.5;
}

.favorite-remove-error button {
  flex: none;
  border: 0;
  background: none;
  color: #8f2f2f;
  font-family: var(--gn-font-body);
  font-size: 13px;
  text-decoration: underline;
}

.favorite-empty {
  margin: 26px 0 0;
  padding: 20px 0;
}

.favorite-empty strong {
  display: block;
  color: var(--gn-ink);
  font-size: 15px;
  font-weight: 600;
}

.favorite-empty p {
  margin: 6px 0 0;
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.6;
}
</style>
