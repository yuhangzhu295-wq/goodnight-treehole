<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

const router = useRouter();
const route = useRoute();
const diaries = ref<any[]>([]);
const initialMonth = typeof route.query.month === 'string' && /^\d{4}-\d{2}$/.test(route.query.month) ? route.query.month : '';
const month = ref(initialMonth);
const availableMonths = ref<string[]>([]);
const emotion = ref('');
const hasLetter = ref('');
const filterOpen = ref(false);
const monthOpen = ref(false);
const loadError = ref('');

/**
 * The two tabs the design shows that this product can actually honour.
 *
 * The mock has 全部 / 仅自己 / 有回信, but every diary entry is private by construction - the public
 * ones are posts, not diaries - so a 仅自己 tab could never narrow the list. A tab that always returns
 * everything is a dead control, so it is not rendered; the list is private and the page says so in the
 * row meta instead.
 */
const activeTab = computed<'all' | 'letter'>(() => (hasLetter.value === 'true' ? 'letter' : 'all'));

function selectTab(tab: 'all' | 'letter') {
  hasLetter.value = tab === 'letter' ? 'true' : '';
  load();
}

/**
 * Guards against a slow earlier response overwriting a newer filter's result: switching filters twice
 * issues two requests, and without a ticket the first to *finish* wins.
 */
let loadSeq = 0;

async function load() {
  const ticket = ++loadSeq;
  loadError.value = '';
  const params = new URLSearchParams();
  if (month.value) params.set('month', month.value);
  if (emotion.value) params.set('emotion', emotion.value);
  if (hasLetter.value) params.set('hasLetter', hasLetter.value);
  try {
    const result = await api.get<any>(`/api/v1/diaries?${params.toString()}`);
    if (ticket !== loadSeq) return;
    diaries.value = result.items ?? [];
  } catch (cause) {
    // A failed read used to leave the list empty, which the page rendered as "还没有日记" - the user
    // was told they had written nothing when in fact nothing had loaded.
    if (ticket !== loadSeq) return;
    diaries.value = [];
    loadError.value = cause instanceof Error ? cause.message : '日记加载失败，请稍后重试';
  }
}

/**
 * The month list is a filter aid, not the content. It used to run first and uncaught, so a failure
 * here stopped `onMounted` before the diary list was ever requested - the page showed a spinner that
 * never resolved. It now degrades on its own and the list loads regardless.
 */
async function loadMonths() {
  try {
    const result = await api.get<any>('/api/v1/diaries/months');
    availableMonths.value = Array.isArray(result.items) ? result.items : [];
  } catch {
    availableMonths.value = [];
  }
  if (!month.value || !availableMonths.value.includes(month.value)) {
    month.value = availableMonths.value[0] ?? new Date().toISOString().slice(0, 7);
  }
}

async function confirmFilter() {
  await load();
  filterOpen.value = false;
}

async function resetFilter() {
  emotion.value = '';
  hasLetter.value = '';
  await load();
}

async function selectMonth(value: string) {
  month.value = value;
  monthOpen.value = false;
  await load();
}

function openDiary(diary: any) {
  router.push(`/pages/diary/detail?id=${encodeURIComponent(diary.id)}`);
}

function timeOf(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** `今天 · 10月11日` / `昨天 · 10月10日` / `10月7日`, the headings the design uses. */
function dayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未记录';
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(date)) / 86_400_000);
  const stamp = `${date.getMonth() + 1}月${date.getDate()}日`;
  if (days === 0) return `今天 · ${stamp}`;
  if (days === 1) return `昨天 · ${stamp}`;
  return stamp;
}

/**
 * Grouped by calendar day rather than by month: the design's rhythm is "what happened on this day",
 * and a month heading over rows that each repeat their own date said the same thing twice.
 */
const dayGroups = computed(() => {
  const groups: Array<{ key: string; label: string; items: Array<{ diary: any; index: number }> }> = [];
  const byKey = new Map<string, (typeof groups)[number]>();
  diaries.value.forEach((diary, index) => {
    const date = new Date(diary.createdAt);
    const key = Number.isNaN(date.getTime())
      ? 'unknown'
      : `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: dayLabel(diary.createdAt), items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push({ diary, index });
  });
  return groups;
});

const hasFilter = computed(() => Boolean(emotion.value || hasLetter.value));

onMounted(async () => {
  // The list is the page; the month filter is an extra. Both start together so neither can block the
  // other, and the filter settles whenever its own request does.
  await Promise.allSettled([loadMonths(), load()]);
});
</script>

<template>
  <section class="page goodnight-page rest-page diary-list-page">
    <header class="diary-bar">
      <button class="diary-back" data-testid="front-diary-back" aria-label="返回" @click="router.back()">‹</button>
      <h1 class="diary-bar-title">日记</h1>
      <button class="diary-write" type="button" data-testid="btn-new-diary" @click="router.push('/pages/mood/create')">写日记</button>
    </header>

    <!--
      The design's tabs are text with an underline, not pills: this page is a reading list and the
      filter should not be the loudest thing on it. The month and the emotion filter keep their own
      small text controls on the same row so both capabilities survive.
    -->
    <div class="diary-tabs" role="tablist" aria-label="日记筛选">
      <button
        type="button"
        role="tab"
        class="diary-tab"
        :class="{ active: activeTab === 'all' }"
        :aria-selected="activeTab === 'all'"
        data-testid="diary-tab-all"
        @click="selectTab('all')"
      >全部</button>
      <button
        type="button"
        role="tab"
        class="diary-tab"
        :class="{ active: activeTab === 'letter' }"
        :aria-selected="activeTab === 'letter'"
        data-testid="diary-tab-letter"
        @click="selectTab('letter')"
      >有回信</button>
      <span class="diary-tabs-spacer" />
      <button class="diary-quiet" type="button" data-testid="filter-diary-month" @click="monthOpen = true">
        {{ month }} <span aria-hidden="true">⌄</span>
      </button>
      <button class="diary-quiet" type="button" data-testid="btn-diary-filter" @click="filterOpen = true">
        筛选<span v-if="emotion"> · {{ emotion }}</span>
      </button>
    </div>

    <LoadErrorBanner :message="loadError" retry-label="重新加载日记" @retry="load" />

    <div class="diary-timeline">
      <section v-for="group in dayGroups" :key="group.key" class="diary-day">
        <h2 class="diary-day-label">{{ group.label }}</h2>
        <article
          v-for="entry in group.items"
          :key="entry.diary.id"
          class="diary-row"
          :data-testid="entry.index === 0 ? 'diary-card-first' : `diary-card-${entry.diary.id}`"
          @click="openDiary(entry.diary)"
        >
          <time class="diary-row-time">{{ timeOf(entry.diary.createdAt) }}</time>
          <p class="diary-row-body">{{ entry.diary.content }}</p>
          <small class="diary-row-meta">
            仅自己<template v-if="entry.diary.emotionLabel || entry.diary.emotion"> · {{ entry.diary.emotionLabel || entry.diary.emotion }}</template><template v-if="entry.diary.hasLetter"> · 有回信</template>
          </small>
        </article>
      </section>
      <article v-if="!loadError && !diaries.length" class="diary-empty" data-testid="diary-empty-state">
        <strong>{{ hasFilter ? '没有符合筛选的日记' : `${month} 还没有日记` }}</strong>
        <p>{{ hasFilter ? '可以调整筛选条件，或写下一篇新的日记。' : '写下一点今天的心情，它会在这里长成记录。' }}</p>
      </article>
    </div>

    <div class="sheet-mask" v-if="monthOpen">
      <div class="sheet menu-sheet">
        <h2>选择月份</h2>
        <button v-for="value in availableMonths" :key="value" :data-testid="`diary-month-${value}`" @click="selectMonth(value)">{{ value.replace('-', ' 年 ') }} 月</button>
        <p v-if="!availableMonths.length" class="muted">暂时没有可选择的日记月份</p>
      </div>
    </div>

    <div class="sheet-mask" v-if="filterOpen">
      <div class="sheet menu-sheet">
        <h2>筛选日记</h2>
        <div class="style-row">
          <button data-testid="filter-diary-emotion-all" :class="{ primary: !emotion }" @click="emotion = ''">全部</button>
          <button data-testid="filter-diary-emotion-jiaolv" :class="{ primary: emotion === '焦虑' }" @click="emotion = '焦虑'">焦虑</button>
          <button data-testid="filter-diary-emotion-weiqu" :class="{ primary: emotion === '委屈' }" @click="emotion = '委屈'">委屈</button>
          <button data-testid="filter-diary-emotion-shimian" :class="{ primary: emotion === '失眠' }" @click="emotion = '失眠'">失眠</button>
        </div>
        <div class="style-row">
          <button data-testid="filter-diary-letter-all" :class="{ primary: !hasLetter }" @click="hasLetter = ''">不限回信</button>
          <button data-testid="filter-diary-letter-true" :class="{ primary: hasLetter === 'true' }" @click="hasLetter = 'true'">已有回信</button>
          <button data-testid="filter-diary-letter-false" :class="{ primary: hasLetter === 'false' }" @click="hasLetter = 'false'">暂无回信</button>
        </div>
        <div class="sheet-actions">
          <button data-testid="btn-diary-filter-reset" @click="resetFilter">重置</button>
          <button class="primary" data-testid="btn-diary-filter-confirm" @click="confirmFilter">确认筛选</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 设计图 30_DiaryList.png: a date-grouped reading list on white. Rows are separated by hairlines, the
   filters are text, and there is no card, chip or bottom CTA anywhere on the page. */
.diary-list-page {
  display: block;
  min-height: 100vh;
  padding: 0 20px calc(40px + env(safe-area-inset-bottom));
  background: #ffffff;
  color: #242a32;
}

.diary-list-page * { box-sizing: border-box; }

.diary-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 58px;
  margin: 0 -20px;
  padding: 6px 20px;
  border-bottom: 1px solid #f0f1f3;
}

.diary-back {
  width: 26px;
  height: 30px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #242a32;
  font-size: 24px;
  line-height: 1;
}

.diary-bar-title {
  flex: 1;
  margin: 0;
  color: #242a32;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.4px;
}

.diary-write {
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: #275f56;
  font-size: 13px;
  font-weight: 600;
}

.diary-tabs {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 44px;
  margin: 0 -20px;
  padding: 0 20px;
  border-bottom: 1px solid #e8eaed;
}

.diary-tab {
  height: 44px;
  padding: 0;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #7e8690;
  font-size: 13px;
}

.diary-tab.active {
  border-bottom-color: #275f56;
  color: #275f56;
  font-weight: 650;
}

.diary-tabs-spacer { flex: 1; }

.diary-quiet {
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: #8b939c;
  font-size: 12px;
}

.diary-timeline { margin-top: 4px; }

.diary-day-label {
  margin: 22px 0 2px;
  color: #242a32;
  font-size: 15px;
  font-weight: 700;
}

.diary-row {
  display: block;
  padding: 14px 0;
  border-bottom: 1px solid #ebedf0;
  cursor: pointer;
}

.diary-day:last-child .diary-row:last-child { border-bottom: 0; }

.diary-row-time {
  display: block;
  color: #8b939c;
  font-size: 11.5px;
}

.diary-row-body {
  display: -webkit-box;
  overflow: hidden;
  margin: 7px 0 0;
  color: #333c44;
  font-size: 14.5px;
  line-height: 1.7;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.diary-row-meta {
  display: block;
  margin-top: 6px;
  color: #8b939c;
  font-size: 11.5px;
}

.diary-empty {
  margin: 40px 0 0;
  color: #6c747d;
  text-align: center;
}

.diary-empty strong { display: block; color: #242a32; font-size: 15px; }
.diary-empty p { margin: 8px 0 0; font-size: 12.5px; line-height: 1.7; }
</style>
