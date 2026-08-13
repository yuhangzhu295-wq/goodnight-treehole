<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, resolveApiUrl } from '../api';

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

async function waitForAiJob(jobId: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const state = await api.get<any>(`/api/v1/ai/tasks/${jobId}`);
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
const monthLabel = computed(() => {
  const [year, selectedMonth] = String(report.value?.month ?? month.value).split('-');
  return year && selectedMonth ? `${year} 年 ${Number(selectedMonth)} 月` : month.value;
});

const distributionEntries = computed(() => Object.entries(report.value?.emotionDistribution ?? {})
  .map(([label, count]) => ({ label, count: Number(count) || 0 }))
  .sort((left, right) => right.count - left.count));

const distributionTotal = computed(() => distributionEntries.value.reduce((sum, item) => sum + item.count, 0));
const donutColors = ['#82945b', '#b0ba7c', '#f0ba55', '#d79b8b', '#aaa2ca', '#a7b6be'];
const donutStyle = computed(() => {
  if (!distributionTotal.value) return { background: 'conic-gradient(#e9eadf 0 100%)' };
  let offset = 0;
  const stops = distributionEntries.value.map((item, index) => {
    const next = offset + (item.count / distributionTotal.value) * 100;
    const stop = `${donutColors[index % donutColors.length]} ${offset.toFixed(2)}% ${next.toFixed(2)}%`;
    offset = next;
    return stop;
  });
  return { background: `conic-gradient(${stops.join(', ')})` };
});

const keywordEntries = computed(() => {
  const counts = Array.isArray(report.value?.keywordCounts) ? report.value.keywordCounts : [];
  const max = Math.max(1, ...counts.map((item: any) => Number(item.count) || 0));
  return counts.map((item: any) => ({ keyword: String(item.keyword), count: Number(item.count) || 0, width: `${Math.max(18, ((Number(item.count) || 0) / max) * 100)}%` }));
});

const trendPoints = computed(() => {
  const points = Array.isArray(report.value?.dailyTrend) ? report.value.dailyTrend : [];
  const lastDay = Math.max(1, points.length);
  return points
    .filter((point: any) => point?.score !== null && point?.score !== undefined && Number.isFinite(Number(point.score)))
    .map((point: any) => {
      const score = Math.max(1, Math.min(4, Number(point.score)));
      return {
        day: Number(point.day),
        score,
        x: 22 + ((Math.max(1, Number(point.day)) - 1) / Math.max(1, lastDay - 1)) * 278,
        y: 94 - ((score - 1) / 3) * 66,
      };
    });
});

const trendPolyline = computed(() => trendPoints.value.map((point: { x: number; y: number }) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '));
const trendTickDays = computed(() => {
  const count = Array.isArray(report.value?.dailyTrend) ? report.value.dailyTrend.length : 30;
  return [1, Math.max(1, Math.round(count * 0.33)), Math.max(1, Math.round(count * 0.66)), count];
});

async function loadMonths() {
  const result = await api.get<any>('/api/v1/reports/monthly/months');
  availableMonths.value = Array.isArray(result.items) ? result.items : [];
  if (availableMonths.value.length && !availableMonths.value.includes(month.value)) month.value = availableMonths.value[0];
}

async function load() {
  loadError.value = '';
  try {
    report.value = (await api.get<any>(`/api/v1/reports/monthly?month=${encodeURIComponent(month.value)}`)).item;
    if (report.value.aiJobId && !report.value.summary && ['queued', 'running'].includes(report.value.aiJobStatus)) {
      summaryLoading.value = true;
      const completed = await waitForAiJob(report.value.aiJobId);
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
  try {
    advice.value = (await api.get<any>(`/api/v1/reports/monthly/${encodeURIComponent(report.value.month)}/advice`)).item;
    if (advice.value.aiJobId && !advice.value.content && ['queued', 'running'].includes(advice.value.aiJobStatus)) {
      adviceLoading.value = true;
      await waitForAiJob(advice.value.aiJobId);
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
    <header class="report-hero">
      <div class="report-topbar">
        <button class="back-icon" data-testid="front-report-back" aria-label="返回" @click="router.back()">‹</button>
        <h1>情绪月报</h1>
      </div>
      <div class="report-brand">
        <strong>晚安树洞</strong>
        <p><span data-visual-mask="time">{{ monthLabel }}</span>情绪总结</p>
      </div>
    </header>

    <section class="report-stat-grid" aria-label="本月统计">
      <article class="report-stat-card record-days">
        <span class="report-stat-icon" aria-hidden="true">▣</span>
        <div><small>本月记录天数</small><strong>{{ report.recordDays }}<em>天</em></strong><p>共记录情绪 {{ report.totalRecords }} 条</p></div>
      </article>
      <article class="report-stat-card top-emotion">
        <span class="report-stat-icon" aria-hidden="true">♧</span>
        <div><small>高频情绪</small><strong>{{ report.topEmotion }}</strong><p>出现 {{ report.topEmotionCount }} 次</p></div>
      </article>
      <article class="report-stat-card replies">
        <span class="report-stat-icon" aria-hidden="true">♡</span>
        <div><small>温柔回应次数</small><strong>{{ report.replyCount }}<em>次</em></strong><p>感谢你的真诚分享</p></div>
      </article>
    </section>

    <article class="report-trend-card">
      <div class="report-card-heading">
        <div><h2>情绪趋势</h2><p>每天的情绪就像天气，起起落落都是成长。</p></div>
        <button class="report-month-select" data-testid="filter-report-month" @click="monthOpen = true">{{ report.month }}⌄</button>
      </div>
      <div class="report-trend-plot" data-testid="report-trend-chart">
        <div class="trend-levels" aria-hidden="true"><span>很棒</span><span>平静</span><span>有点难</span><span>很低落</span></div>
        <svg viewBox="0 0 320 118" role="img" aria-label="根据真实日记记录生成的情绪趋势">
          <path class="trend-grid" d="M22 28H300M22 50H300M22 72H300M22 94H300" />
          <polyline v-if="trendPolyline" class="trend-line" :points="trendPolyline" />
          <circle v-for="point in trendPoints" :key="point.day" class="trend-point" :cx="point.x" :cy="point.y" r="4" />
        </svg>
        <div v-if="!trendPoints.length" class="trend-empty">本月还没有足够的记录来绘制趋势</div>
        <div class="trend-axis"><span v-for="day in trendTickDays" :key="day">{{ month.split('-')[1] }}/{{ day }}</span></div>
      </div>
    </article>

    <section class="report-insights-grid">
      <article class="report-insight-card distribution-card">
        <h2>情绪分布</h2>
        <div class="distribution-content">
          <div class="report-donut" :style="donutStyle"><span><strong>{{ report.totalRecords }}</strong><small>总记录</small></span></div>
          <ul v-if="distributionEntries.length" class="distribution-legend">
            <li v-for="(item, index) in distributionEntries" :key="item.label"><i :style="{ background: donutColors[index % donutColors.length] }"></i><span>{{ item.label }}</span><b>{{ Math.round((item.count / distributionTotal) * 100) }}%</b><small>({{ item.count }}次)</small></li>
          </ul>
          <p v-else class="muted">暂无本月情绪分布</p>
        </div>
      </article>
      <article class="report-insight-card keywords-card">
        <h2>高频关键词</h2>
        <div v-if="keywordEntries.length" class="keyword-list">
          <div v-for="item in keywordEntries" :key="item.keyword" class="keyword-row"><span>{{ item.keyword }}</span><i><b :style="{ width: item.width }"></b></i><strong>{{ item.count }}次</strong></div>
        </div>
        <p v-else class="muted">本月暂无可统计的关键词</p>
      </article>
    </section>

    <article class="report-reflection">
      <span class="reflection-illustration" aria-hidden="true"></span>
      <div>
        <h2>这个月的你很努力，也在慢慢看见自己</h2>
        <p v-if="summaryLoading">正在基于真实记录生成本月回顾…</p>
        <p v-for="(paragraph, index) in summaryParagraphs.slice(0, 2)" :key="index">{{ paragraph }}</p>
        <p v-if="!summaryLoading && !summaryParagraphs.length" class="muted">本月回顾暂时不可用，记录会在下次生成后呈现。</p>
      </div>
    </article>

    <p v-if="loadError" class="error-text">{{ loadError }}</p>

    <div class="report-actions">
      <button class="primary" data-testid="btn-report-poster" :disabled="summaryLoading || !report.summary" @click="makeShareImage"><span aria-hidden="true">▧</span>生成分享图<small>生成专属月报分享给自己或朋友</small></button>
      <button data-testid="btn-report-advice" :disabled="adviceLoading" @click="loadAdvice"><span aria-hidden="true">♧</span>{{ adviceLoading ? '正在生成建议' : '查看详细建议' }}<small>获取个性化温柔建议</small></button>
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
        <p v-if="!adviceLoading && !adviceParagraphs.length" class="muted">建议暂时未生成，请稍后再试。</p>
        <button class="primary" data-testid="btn-report-advice-close" @click="advice = undefined">知道了</button>
      </div>
    </div>
  </section>

  <section v-else class="page goodnight-page rest-page report-page report-loading"><p>{{ loadError || '正在读取你的月报…' }}</p></section>
</template>

<style scoped>
/* Keep live report values intact while matching the supplied handset's calmer
   type hierarchy.  These overrides only affect the rendered report shell;
   charts, counts, and AI-generated copy remain API-backed. */
.report-page .report-hero {
  min-height: 154px;
  padding-top: 16px;
  padding-bottom: 14px;
}

.report-page .reflection-illustration {
  background-image: url("../assets/goodnight/square-baby.png");
  background-size: contain;
  mix-blend-mode: multiply;
}

.report-page .report-topbar h1 { font-size: 21px; }
.report-page .report-brand { margin-top: 17px; }
.report-page .report-brand strong { font-size: 35px; line-height: 1.08; }
.report-page .report-brand p { margin-top: 7px; font-size: 14px; }
.report-page .report-stat-card { min-height: 86px; }
.report-page .report-stat-card strong { font-size: 21px; }
.report-page .report-card-heading h2,
.report-page .report-insight-card h2 { font-size: 19px; }
.report-page .report-trend-card { gap: 9px; padding-top: 13px; padding-bottom: 11px; }
.report-page .report-trend-plot { min-height: 108px; }
.report-page .report-trend-plot svg { height: 88px; }
.report-page .trend-levels { bottom: 20px; }
.report-page .report-reflection h2 { font-size: 17px; }
.report-page .report-reflection { min-height: 118px; }
.report-page .report-actions button { min-height: 60px; }
</style>
