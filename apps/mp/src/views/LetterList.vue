<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

type Letter = {
  id: string;
  title?: string;
  content?: string;
  status?: string;
  createdAt?: string;
  sourceMoodId?: string | null;
};

type Filter = 'all' | 'unread' | 'read';
type LetterGroup = { key: string; label: string; older: boolean; items: Letter[] };

const router = useRouter();
const letters = ref<Letter[]>([]);
const filter = ref<Filter>('all');
const loading = ref(true);
const loadError = ref('');
const searchOpen = ref(false);
const searchTerm = ref('');

function formatMonthDay(value?: string) {
  const date = new Date(value ?? '');
  if (Number.isNaN(date.getTime())) return '日期未记录';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatFullDate(value?: string) {
  const date = new Date(value ?? '');
  if (Number.isNaN(date.getTime())) return '日期未记录';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return sameYear ? formatMonthDay(value) : `${date.getFullYear()}年${formatMonthDay(value)}`;
}

/** The real source of a letter; the design's 匿名同行者 is a layout sample, not a stored field. */
function sourceLabel(letter: Letter) {
  return letter.sourceMoodId ? '来自你的心情记录' : '来自晚安树洞';
}

const filtered = computed(() => {
  const term = searchTerm.value.trim().toLowerCase();
  if (!term) return letters.value;
  return letters.value.filter((letter) =>
    `${letter.title ?? ''}\n${letter.content ?? ''}`.toLowerCase().includes(term),
  );
});

/**
 * Re-reads the clock every 30 seconds.
 *
 * The group labels are relative ("今天"), so a page that stays open past local midnight has to
 * re-derive them. `Date.now()` is a plain read with no reactive dependency, so without this tick the
 * labels would keep yesterday's grouping until the reader navigated.
 */
const nowTick = ref(Date.now());
let clockTimer: number | undefined;

function localMidnight(offsetDays = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date.getTime();
}

/**
 * Today, the three previous natural days individually, then 更早.
 *
 * The boundary is the device's local calendar day, not a fixed millisecond distance: a letter written
 * at 23:59 yesterday belongs to yesterday even if it was only minutes ago.
 *
 * `now` is re-read on every evaluation rather than captured once: the labels are "今天"/"昨天", so a
 * page left open past local midnight has to move its letters into the right group without a reload.
 */
const groups = computed<LetterGroup[]>(() => {
  // Reading `nowTick` here is what makes this computed re-evaluate as the clock advances.
  void nowTick.value;
  const today = localMidnight();
  const dayMs = 24 * 60 * 60 * 1000;
  const buckets = new Map<string, LetterGroup>();
  for (const letter of filtered.value) {
    const created = new Date(letter.createdAt ?? '');
    let key: string;
    let label: string;
    let older = false;
    if (Number.isNaN(created.getTime())) {
      key = 'unknown';
      label = '日期未记录';
      older = true;
    } else {
      const start = new Date(created.getFullYear(), created.getMonth(), created.getDate()).getTime();
      const distance = Math.round((today - start) / dayMs);
      if (distance <= 0) {
        key = 'today';
        label = '今天';
      } else if (distance <= 3) {
        key = `day-${start}`;
        label = formatMonthDay(letter.createdAt);
      } else {
        key = 'older';
        label = '更早';
        older = true;
      }
    }
    const bucket = buckets.get(key) ?? { key, label, older, items: [] };
    bucket.items.push(letter);
    buckets.set(key, bucket);
  }
  return [...buckets.values()];
});

/** Keeps the contract's `letter-card-first` on the first rendered row, whichever group it is in. */
const firstLetterId = computed(() => groups.value[0]?.items[0]?.id ?? '');

const emptyMessage = computed(() => {
  if (searchTerm.value.trim()) return '没有匹配的回信';
  if (filter.value === 'unread') return '未读里暂时没有回信';
  if (filter.value === 'read') return '已读里暂时没有回信';
  return '还没有回信';
});

const emptyHint = computed(() => {
  if (searchTerm.value.trim()) return '换一个词试试，搜索只覆盖已经加载的回信。';
  if (filter.value !== 'all') return '切换上方标签可以查看其他回信。';
  return '写下一次心情后，新的回信会出现在这里。';
});

async function load(next: Filter = filter.value) {
  filter.value = next;
  loading.value = true;
  loadError.value = '';
  const query = next === 'all' ? '' : `?status=${next}`;
  try {
    const result = await api.get<{ items: Letter[] }>(`/api/v1/letters${query}`);
    letters.value = result.items ?? [];
  } catch (cause: any) {
    // A failed read used to leave an empty list that said there were no letters at all.
    letters.value = [];
    loadError.value = cause?.message ?? '回信加载失败，请稍后重试';
  } finally {
    loading.value = false;
  }
}

function toggleSearch() {
  searchOpen.value = !searchOpen.value;
  if (!searchOpen.value) searchTerm.value = '';
}

/** Reading is marked by the detail page once it has actually shown the letter. */
function openLetter(letter: Letter) {
  router.push(`/pages/letter/detail?id=${encodeURIComponent(letter.id)}`);
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
  <section class="page goodnight-page rest-page list-page letter-list-page">
    <header class="letter-list-bar">
      <button
        class="back-icon"
        data-testid="front-letter-list-back"
        type="button"
        aria-label="返回"
        @click="router.back()"
      >‹</button>
      <h1>我的回信</h1>
      <button
        class="search-toggle"
        data-testid="btn-letter-search"
        type="button"
        aria-label="搜索回信"
        :aria-expanded="searchOpen"
        @click="toggleSearch"
      >⌕</button>
    </header>

    <div v-if="searchOpen" class="letter-search">
      <input
        v-model="searchTerm"
        data-testid="input-letter-search"
        type="search"
        placeholder="搜索标题或内容"
        aria-label="搜索回信"
      />
      <button v-if="searchTerm" type="button" data-testid="btn-letter-search-clear" @click="searchTerm = ''">
        清除
      </button>
    </div>

    <div class="letter-tabs" role="tablist" aria-label="回信筛选">
      <button
        type="button"
        role="tab"
        data-testid="filter-letter-all"
        :aria-selected="filter === 'all'"
        :class="{ active: filter === 'all' }"
        @click="load('all')"
      >全部</button>
      <button
        type="button"
        role="tab"
        data-testid="filter-letter-unread"
        :aria-selected="filter === 'unread'"
        :class="{ active: filter === 'unread' }"
        @click="load('unread')"
      >未读</button>
      <button
        type="button"
        role="tab"
        data-testid="filter-letter-read"
        :aria-selected="filter === 'read'"
        :class="{ active: filter === 'read' }"
        @click="load('read')"
      >已读</button>
    </div>

    <p v-if="loading" class="letter-state" data-testid="letter-list-loading">正在读取回信…</p>
    <LoadErrorBanner v-else-if="loadError" :message="loadError" retry-label="重新加载" @retry="load()" />

    <template v-else>
      <section v-for="group in groups" :key="group.key" class="letter-group" :aria-label="group.label">
        <h2 class="letter-group-title">{{ group.label }}</h2>
        <button
          v-for="letter in group.items"
          :key="letter.id"
          type="button"
          class="letter-row"
          :data-testid="letter.id === firstLetterId ? 'letter-card-first' : `letter-card-${letter.id}`"
          @click="openLetter(letter)"
        >
          <span class="letter-icon" :class="{ unread: letter.status === 'unread' }" aria-hidden="true">
            <span v-if="letter.status === 'unread'" class="letter-unread-dot"></span>
            <span v-else class="letter-envelope">✉</span>
          </span>
          <span class="letter-copy">
            <strong class="letter-title">{{ letter.title || '给今晚的你' }}</strong>
            <span class="letter-meta">
              {{ sourceLabel(letter) }} · {{ letter.status === 'unread' ? '尚未阅读' : '已读' }}
              <template v-if="group.older">· {{ formatFullDate(letter.createdAt) }}</template>
            </span>
          </span>
          <span class="letter-chevron" aria-hidden="true">›</span>
        </button>
      </section>

      <div v-if="!groups.length" class="letter-empty" data-testid="letter-list-empty">
        <strong>{{ emptyMessage }}</strong>
        <p>{{ emptyHint }}</p>
        <button
          v-if="filter === 'all' && !searchTerm"
          class="primary"
          type="button"
          @click="router.push('/pages/mood/create')"
        >
          写下心情
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.letter-list-page.goodnight-page {
  display: block;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 0;
  /* The bar and tabs below are exactly viewport-wide; `.goodnight-page` clips them at the inset. */
  overflow-x: visible;
  padding: 0 0 calc(130px + env(safe-area-inset-bottom));
}

/* Full-bleed bar and tabs: the shell insets 15px, the design's hairlines reach both edges. */
.letter-list-page .letter-list-bar {
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

.letter-list-page .back-icon {
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
  font-size: 26px;
  font-weight: 300;
  line-height: 1;
}

.letter-list-page .letter-list-bar h1 {
  margin: 0;
  color: var(--gn-ink);
  text-align: left;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.2px;
  line-height: 1.3;
}

.letter-list-page .search-toggle {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: 24px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--gn-ink);
  font-size: 20px;
  line-height: 1;
}

.letter-search {
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

.letter-search input {
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

.letter-search input:focus {
  outline: none;
  border-color: var(--gn-leaf);
}

.letter-search button {
  flex: none;
  height: 38px;
  padding: 0 10px;
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--gn-muted);
  font-size: 13px;
}

.letter-tabs {
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

.letter-tabs button {
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

.letter-tabs button.active {
  color: var(--gn-leaf);
  font-weight: 600;
}

.letter-tabs button.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--gn-leaf);
}

.letter-state {
  margin: 24px 0 0;
  color: var(--gn-muted);
  font-size: 14px;
}

.letter-group-title {
  margin: 20px 0 2px;
  color: var(--gn-ink);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.35;
}

.letter-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 0;
  /* The global button rule sets a 999px radius, which curls the row's hairline into a capsule. */
  border: 0;
  border-bottom: 1px solid var(--gn-line);
  border-radius: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
}

.letter-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--gn-paper-warm);
}

/* A global `.letter-unread-dot` carries `margin-left: auto`, which pushes the dot to the icon's
   right edge instead of centring it. */
.letter-unread-dot {
  width: 17px;
  height: 17px;
  margin: 0;
  border-radius: 50%;
  background: #5a626a;
}

.letter-envelope {
  color: #8a929b;
  font-size: 18px;
  line-height: 1;
}

.letter-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.letter-title {
  overflow: hidden;
  color: var(--gn-ink);
  font-size: 16.5px;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.letter-meta {
  overflow: hidden;
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.letter-chevron {
  color: #b6bcc4;
  font-size: 20px;
  line-height: 1;
  text-align: right;
}

.letter-empty {
  margin: 26px 0 0;
  padding: 20px 0;
}

.letter-empty strong {
  display: block;
  color: var(--gn-ink);
  font-size: 15px;
  font-weight: 600;
}

.letter-empty p {
  margin: 6px 0 0;
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.6;
}

.letter-empty .primary {
  width: 100%;
  height: 46px;
  margin-top: 16px;
  border: 0;
  border-radius: 10px;
  background: var(--gn-leaf);
  color: #ffffff;
  font-family: var(--gn-font-body);
  font-size: 15px;
  font-weight: 600;
}
</style>
