<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, resolveApiUrl } from '../api';
import { aiDegradationNotice } from '../aiStatus';
import AiDegradationNotice from '../components/AiDegradationNotice.vue';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

const router = useRouter();
const route = useRoute();
const requestedMonth = typeof route.query.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(route.query.month)
  ? route.query.month
  : undefined;
const month = ref(requestedMonth ?? new Date().toISOString().slice(0, 7));
const report = ref<any>();
const poster = ref<any>();
const advice = ref<any>();
const availableMonths = ref<string[]>([]);
const monthOpen = ref(false);
const saved = ref(false);
const summaryLoading = ref(false);
const adviceLoading = ref(false);
const loadError = ref('');
const aiNotice = ref('');

let isUnmounted = false;
onBeforeUnmount(() => {
  isUnmounted = true;
});

async function waitForAiJob(jobId: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (isUnmounted) return { status: 'cancelled' };
    const state = await api.get<any>(`/api/v1/ai/tasks/${jobId}`);
    if (isUnmounted) return { status: 'cancelled' };
    if (!['queued', 'running'].includes(state.status)) return state;
    await new Promise((resolve) => window.setTimeout(resolve, 450));
  }
  throw new Error('月报生成超时，请稍后刷新重试');
}

function cleanLine(value: string) {
  return value
    .replace(/^\s*(#{1,6}|[-*+]\s+|\d+[.)]\s*)/, '')
    .replace(/\*\*/g, '')
    .replace(/\?\?/g, '')
    .replace(/\bjiaolv\b/gi, '焦虑')
    .trim();
}

function richParagraphs(value?: string) {
  return String(value ?? '')
    .split(/\n+/)
    .map(cleanLine)
    .filter(Boolean)
    .slice(0, 5);
}

const summaryParagraphs = computed(() => richParagraphs(report.value?.summary));
const adviceParagraphs = computed(() => richParagraphs(advice.value?.content));

/** The month the report actually describes; the query string is only a request. */
const activeMonth = computed(() => String(report.value?.month ?? month.value));

const monthLabel = computed(() => {
  const [year, selectedMonth] = activeMonth.value.split('-');
  return year && selectedMonth ? `${year} 年 ${Number(selectedMonth)} 月` : month.value;
});

/**
 * The heading doubles as the month picker, which is why it is not a static "月度回顾": the design
 * shows "10月回顾", and the only control that changes the month is this one, so it is the heading.
 */
const monthHeading = computed(() => {
  const [year, selectedMonth] = activeMonth.value.split('-');
  if (!year || !selectedMonth) return '月度回顾';
  return String(new Date().getFullYear()) === year
    ? `${Number(selectedMonth)}月回顾`
    : `${year}年${Number(selectedMonth)}月回顾`;
});

const recovery = computed(() => report.value?.recovery ?? {
  journeyCount: 0,
  completedJourneyCount: 0,
  actionCount: 0,
  completedActionCount: 0,
  adaptedActionCount: 0,
  missedActionCount: 0,
  recoveryCheckinCount: 0,
  peerConversationCount: 0,
  peerExperienceCount: 0,
  decisionCount: 0,
  lifeFunctions: [],
  recentActions: [],
});

/**
 * The three numbers the design leads with: records written, actions that reached a result, and life
 * areas with any record at all. All three are counts of real rows - no index, no score.
 */
const totals = computed(() => ({
  records: Number(report.value?.totalRecords ?? 0),
  actions: Number(recovery.value.completedActionCount ?? 0),
  life: (Array.isArray(recovery.value.lifeFunctions) ? recovery.value.lifeFunctions : [])
    .filter((item: any) => String(item.state) !== 'unrecorded').length,
}));

const recentActions = computed<any[]>(() => (Array.isArray(recovery.value.recentActions) ? recovery.value.recentActions : []));
const quote = computed<{ content: string; date: string } | null>(() => report.value?.quote ?? null);

/** Days with at least one record, newest first - the design's "按日期查看". */
const dayRows = computed(() => {
  const points = Array.isArray(report.value?.dailyTrend) ? report.value.dailyTrend : [];
  return points
    .filter((point: any) => Number(point?.count) > 0)
    .map((point: any) => ({
      day: Number(point.day),
      date: `${activeMonth.value}-${String(point.day).padStart(2, '0')}`,
      count: Number(point.count),
    }))
    .sort((left: { day: number }, right: { day: number }) => right.day - left.day);
});

const actionStatusLabel: Record<string, string> = {
  completed: '已完成',
  adapted: '已调整',
  missed: '未完成',
  open: '待行动',
};

/** `2026-10-09` -> `10月9日`, the form the design uses. */
function dayLabel(value?: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  return match ? `${Number(match[2])}月${Number(match[3])}日` : '';
}

async function loadMonths() {
  const result = await api.get<any>('/api/v1/reports/monthly/months');
  availableMonths.value = Array.isArray(result.items) ? result.items : [];
  if (!availableMonths.value.length) return;
  if (availableMonths.value.includes(month.value)) return;
  // A deep link that names a month must open that month. Falling back to the newest one silently
  // showed October for a URL that said 2020-01 - a wrong answer, and it also made "this month has no
  // records" impossible to reach. Only an unspecified month defaults to the newest with data.
  if (requestedMonth) availableMonths.value = [month.value, ...availableMonths.value];
  else month.value = availableMonths.value[0];
}

async function load() {
  loadError.value = '';
  aiNotice.value = '';
  try {
    report.value = (await api.get<any>(`/api/v1/reports/monthly?month=${encodeURIComponent(month.value)}`)).item;
    if (report.value.aiJobId && !report.value.summary && ['queued', 'running'].includes(report.value.aiJobStatus)) {
      summaryLoading.value = true;
      const completed = await waitForAiJob(report.value.aiJobId);
      aiNotice.value = aiDegradationNotice(completed);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        report.value = (await api.get<any>(`/api/v1/reports/monthly?month=${encodeURIComponent(month.value)}`)).item;
        if (report.value.summary || !['succeeded', 'fallback'].includes(completed.status)) break;
        await new Promise((resolve) => window.setTimeout(resolve, 350));
      }
    }
  } catch (cause: any) {
    loadError.value = cause?.message ?? '月报加载失败，请稍后重试';
  } finally {
    summaryLoading.value = false;
  }
}

async function selectMonth(value: string) {
  month.value = value;
  monthOpen.value = false;
  await load();
}

async function makeShareImage() {
  if (!report.value || summaryLoading.value) return;
  loadError.value = '';
  try {
    poster.value = await api.post<any>(`/api/v1/reports/monthly/${encodeURIComponent(report.value.month)}/poster`);
    saved.value = false;
  } catch (cause: any) {
    loadError.value = cause?.message ?? '分享图生成失败，请稍后重试';
  }
}

function saveShareImage() {
  const source = poster.value?.posterUrl ? resolveApiUrl(poster.value.posterUrl) : '';
  if (!source) return;
  const link = document.createElement('a');
  link.href = source;
  link.download = `${report.value?.month ?? '情绪月报'}-情绪月报.svg`;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  saved.value = true;
}

async function loadAdvice() {
  if (!report.value) return;
  loadError.value = '';
  aiNotice.value = '';
  try {
    advice.value = (await api.get<any>(`/api/v1/reports/monthly/${encodeURIComponent(report.value.month)}/advice`)).item;
    if (advice.value.aiJobId && !advice.value.content && ['queued', 'running'].includes(advice.value.aiJobStatus)) {
      adviceLoading.value = true;
      const completed = await waitForAiJob(advice.value.aiJobId);
      aiNotice.value = aiDegradationNotice(completed);
      advice.value = (await api.get<any>(`/api/v1/reports/monthly/${encodeURIComponent(report.value.month)}/advice`)).item;
    }
  } catch (cause: any) {
    advice.value = undefined;
    loadError.value = cause?.message ?? '建议加载失败，请稍后重试';
  } finally {
    adviceLoading.value = false;
  }
}

onMounted(async () => {
  try {
    await loadMonths();
  } catch {
    availableMonths.value = [month.value];
  }
  await load();
});
</script>

<template>
  <section v-if="report" class="page goodnight-page rest-page report-page">
    <header class="report-bar">
      <button class="report-back" data-testid="front-report-back" aria-label="返回" @click="router.back()">‹</button>
      <h1 class="report-bar-title">月度回顾</h1>
    </header>

    <div class="report-lead">
      <button class="report-heading" data-testid="filter-report-month" :aria-label="`${monthLabel}，切换月份`" @click="monthOpen = true">
        <span>{{ monthHeading }}</span>
        <span class="report-heading-caret" aria-hidden="true">⌄</span>
      </button>
      <p>记录的是实际发生的事，不是情绪成绩。</p>
    </div>

    <AiDegradationNotice :notice="aiNotice" />
    <LoadErrorBanner :message="loadError" retry-label="重新加载" @retry="load" />

    <section class="report-counts" aria-label="本月数量">
      <div class="report-count">
        <strong data-testid="report-count-records">{{ totals.records }}</strong>
        <span>记录</span>
      </div>
      <div class="report-count">
        <strong data-testid="report-count-actions">{{ totals.actions }}</strong>
        <span>行动结果</span>
      </div>
      <div class="report-count">
        <strong data-testid="report-count-life">{{ totals.life }}</strong>
        <span>生活状态</span>
      </div>
    </section>

    <section v-if="recentActions.length" class="report-section" data-testid="report-actions">
      <h2 class="report-section-title">这个月做过的事</h2>
      <ul class="report-rows">
        <li v-for="(item, index) in recentActions" :key="`${item.title}-${index}`" class="report-row" data-testid="report-action-row">
          <span class="report-row-copy">
            <strong>{{ item.title }}</strong>
            <small>{{ dayLabel(item.date) }} · {{ actionStatusLabel[item.status] ?? '待行动' }}</small>
          </span>
          <span class="report-chev" aria-hidden="true">›</span>
        </li>
      </ul>
    </section>

    <section v-if="quote" class="report-section" data-testid="report-quote">
      <h2 class="report-section-title">你留下的话</h2>
      <blockquote class="report-quote">
        <p>“{{ quote.content }}”</p>
      </blockquote>
    </section>

    <section class="report-section" data-testid="report-days">
      <div class="report-section-head">
        <h2 class="report-section-title">按日期查看</h2>
        <button class="report-more" type="button" data-testid="report-all-records" @click="router.push('/pages/diary/index')">全部记录 ›</button>
      </div>
      <ul v-if="dayRows.length" class="report-rows">
        <li v-for="row in dayRows" :key="row.date" class="report-row" :data-testid="`report-day-${row.day}`">
          <span class="report-row-copy">
            <strong>{{ dayLabel(row.date) }}</strong>
            <small>{{ row.count }} 条记录</small>
          </span>
          <span class="report-chev" aria-hidden="true">›</span>
        </li>
      </ul>
      <p v-else class="report-empty" data-testid="report-days-empty">这个月还没有记录。先写下今天的一句也可以。</p>
    </section>

    <!--
      The AI summary stays, after the facts and only when long-term analysis was allowed: it is a real
      capability with its own consent switch, and removing it to look more like the mock would delete a
      feature. Nothing above depends on it.
    -->
    <section v-if="report.analysisAllowed" class="report-section" data-testid="report-summary">
      <h2 class="report-section-title">这个月，你慢慢走过来了</h2>
      <p v-if="summaryLoading" class="report-muted">正在根据你允许的真实记录整理回顾…</p>
      <p v-for="(paragraph, index) in summaryParagraphs.slice(0, 2)" :key="index" class="report-summary-text">{{ paragraph }}</p>
      <p v-if="!summaryLoading && !summaryParagraphs.length" class="report-muted">本月回顾暂时不可用，稍后刷新可查看任务状态。</p>
    </section>
    <p v-else class="report-muted" data-testid="report-analysis-off">长期旅程分析已关闭；上面这些记录不受影响。</p>

    <!-- The design ends on the date list. These two are real capabilities (a share image and a longer
         advice pass), so they stay - as quiet text under the facts instead of two filled buttons that
         compete with the page's actual content. -->
    <div class="report-actions">
      <button type="button" data-testid="btn-report-poster" :disabled="summaryLoading || !report.summary" @click="makeShareImage">生成分享图</button>
      <button type="button" data-testid="btn-report-advice" :disabled="adviceLoading || !report.analysisAllowed" @click="loadAdvice">{{ adviceLoading ? '正在生成建议' : '查看温柔建议' }}</button>
    </div>

    <div v-if="monthOpen" class="sheet-mask">
      <div class="sheet menu-sheet">
        <h2>选择月份</h2>
        <button v-for="value in availableMonths" :key="value" :data-testid="`report-month-${value}`" @click="selectMonth(value)">{{ value.replace('-', ' 年 ') }} 月</button>
      </div>
    </div>

    <div v-if="poster" class="modal" data-state="report-poster">
      <div class="share-card">
        <h2>月报分享图预览</h2>
        <img class="report-poster-preview" :src="resolveApiUrl(poster.posterUrl)" alt="已生成的情绪月报分享图">
        <div class="sheet-actions">
          <button data-testid="btn-report-poster-close" @click="poster = undefined">关闭</button>
          <button class="primary" data-testid="btn-report-poster-save" @click="saveShareImage">{{ saved ? '已开始下载' : '下载分享图' }}</button>
        </div>
      </div>
    </div>

    <div v-if="advice" class="sheet-mask" data-testid="report-advice-panel">
      <div class="sheet menu-sheet">
        <h2>给你的详细建议</h2>
        <p v-if="adviceLoading">正在生成建议…</p>
        <p v-for="(paragraph, index) in adviceParagraphs" :key="index">{{ paragraph }}</p>
        <p v-if="!adviceLoading && !adviceParagraphs.length" class="report-muted">建议暂时未生成，请稍后再试。</p>
        <button class="primary" data-testid="btn-report-advice-close" @click="advice = undefined">知道了</button>
      </div>
    </div>
  </section>

  <section v-else class="page goodnight-page rest-page report-page report-loading"><p>{{ loadError || '正在读取你的月报…' }}</p></section>
</template>

<style scoped>
/* Matches 设计图/32_ReportMonth.png: a white fact sheet. No card, no gradient, no chart - the month
   report is a list of what happened, and anything that reads as a score is deliberately absent. */
.report-page {
  display: block;
  min-height: 100vh;
  padding: 0 20px calc(110px + env(safe-area-inset-bottom));
  overflow-x: clip;
  background: #ffffff;
  color: #242a32;
}

.report-page * { box-sizing: border-box; }

.report-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 58px;
  margin: 0 -20px;
  padding: 6px 20px;
  border-bottom: 1px solid #f0f1f3;
}

.report-back {
  width: 26px;
  height: 30px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #242a32;
  font-size: 24px;
  line-height: 1;
}

.report-bar-title {
  margin: 0;
  color: #242a32;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.4px;
}

.report-lead { padding: 18px 0 0; }

/* The heading is the month picker; it keeps the design's type scale rather than looking like a field. */
.report-heading {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #242a32;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.4px;
  line-height: 1.3;
}

.report-heading-caret { color: #9aa1a9; font-size: 15px; font-weight: 400; }

.report-lead p {
  margin: 7px 0 0;
  color: #6c747d;
  font-size: 12.5px;
  line-height: 1.6;
}

/* Three numbers separated by hairlines, as in the design - no boxes around them. */
.report-counts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 22px 0 4px;
}

.report-count {
  padding: 4px 0;
  border-right: 1px solid #e6e9ed;
  text-align: center;
}

.report-count:last-child { border-right: 0; }

.report-count strong {
  display: block;
  color: #242a32;
  font-size: 27px;
  font-weight: 700;
  line-height: 1.15;
}

.report-count span {
  display: block;
  margin-top: 6px;
  color: #8b939c;
  font-size: 11px;
}

.report-section { margin-top: 26px; }

.report-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.report-section-title {
  margin: 0;
  color: #242a32;
  font-size: 14.5px;
  font-weight: 700;
}

.report-more {
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: #275f56;
  font-size: 12px;
  font-weight: 600;
}

.report-rows {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
}

.report-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 62px;
  padding: 12px 0;
  border-bottom: 1px solid #ebedf0;
}

.report-row:last-child { border-bottom: 0; }

.report-row-copy {
  display: block;
  flex: 1;
  min-width: 0;
}

.report-row-copy strong {
  display: block;
  color: #242a32;
  font-size: 15px;
  font-weight: 650;
  line-height: 1.45;
}

.report-row-copy small {
  display: block;
  margin-top: 5px;
  color: #8b939c;
  font-size: 11.5px;
  line-height: 1.45;
}

.report-chev { flex: 0 0 auto; color: #aab0b8; font-size: 20px; }

/* The quote keeps a single left rule - the only ornament in the design, and it marks "these are your
   words" rather than decorating the page. */
.report-quote {
  margin: 10px 0 0;
  padding: 2px 0 2px 14px;
  border-left: 2px solid #cfe0d8;
}

.report-quote p {
  margin: 0;
  color: #333c44;
  font-size: 15px;
  line-height: 1.85;
  white-space: pre-wrap;
}

.report-empty,
.report-muted {
  margin: 10px 0 0;
  color: #8b939c;
  font-size: 12.5px;
  line-height: 1.7;
}

.report-summary-text {
  margin: 8px 0 0;
  color: #3d4650;
  font-size: 13px;
  line-height: 1.8;
}

.report-page .report-actions {
  /* One per line: side by side, the two labels ran into each other. */
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  margin: 30px 0 0;
  padding: 18px 0 0;
  border-top: 1px solid #ebedf0;
}

.report-page .report-actions button {
  /* The shared button rule makes buttons flex items that can shrink; a Chinese label then collapses
     to one character per line or overlaps its neighbour. Pin the size and the alignment. */
  display: block;
  flex: 0 0 auto;
  width: auto;
  min-width: 0;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #275f56;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.5;
  text-align: left;
  white-space: nowrap;
}

.report-page .report-actions button:disabled { color: #b3b9c0; }

.report-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8b939c;
  font-size: 13px;
}

.report-poster-preview { display: block; width: 100%; max-width: 320px; margin: 0 auto 12px; }

@media (max-width: 374px) {
  .report-page { padding-right: 16px; padding-left: 16px; }
  .report-count strong { font-size: 24px; }
  .report-heading { font-size: 20px; }
}
</style>
