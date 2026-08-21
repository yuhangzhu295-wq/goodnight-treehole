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
});

const hardestMoment = computed(() => recovery.value.mostStuckAction || (report.value?.topEmotion === '暂无' ? '还在慢慢记录' : `${report.value.topEmotion}出现得更多`));
const helpfulAction = computed(() => recovery.value.mostHelpfulAction || '本月还没有标记完成的行动');
const lifeStateLabel: Record<string, string> = {
  unrecorded: '还没有记录',
  returning: '有在回来',
  adjusting: '仍在调整',
  steady: '持续照顾',
};
const lifeRows = computed(() => Array.isArray(recovery.value.lifeFunctions)
  ? recovery.value.lifeFunctions.map((item: any) => ({
      ...item,
      stateLabel: lifeStateLabel[String(item.state)] ?? '如实记录',
      width: `${Math.max(10, Math.min(100, ((Number(item.yesCount) * 2 + Number(item.partialCount)) / Math.max(1, Number(item.recordedCount) * 2)) * 100))}%`,
    }))
  : []);

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
    <header class="monthly-hero">
      <button class="report-back" data-testid="front-report-back" aria-label="返回" @click="router.back()">‹</button>
      <p class="monthly-logo">❧ 晚安树洞</p>
      <h1>这个月，你是怎么<br>走过来的？</h1>
      <button class="monthly-month" data-testid="filter-report-month" @click="monthOpen = true"><span data-visual-mask="time">{{ monthLabel }}</span>⌄</button>
    </header>

    <section class="monthly-brief" aria-label="本月旅程小结">
      <h2>✦ 本月旅程小结</h2>
      <div class="monthly-brief-grid">
        <article><span>本月最容易卡住的</span><strong>{{ hardestMoment }}</strong></article>
        <article><span>你反复回来过</span><strong>{{ recovery.recoveryCheckinCount }}<em>次</em></strong></article>
        <article><span>你尝试过现实行动</span><strong>{{ recovery.actionCount }}<em>个</em></strong></article>
      </div>
    </section>

    <section class="monthly-story-grid" aria-label="这个月的真实经历">
      <article class="monthly-story-card helpful-card">
        <span>● 最有帮助</span>
        <strong>{{ helpfulAction }}</strong>
        <p>本月完成 {{ recovery.completedActionCount }} 个行动，调整过 {{ recovery.adaptedActionCount }} 次。</p>
      </article>
      <article class="monthly-story-card stuck-card">
        <span>☁ 最容易卡住</span>
        <strong>{{ recovery.mostStuckAction || '还在看见自己的节奏' }}</strong>
        <p>{{ recovery.missedActionCount ? `有 ${recovery.missedActionCount} 次回访没有完成` : '没有把未完成当成失败' }}</p>
      </article>
    </section>

    <article class="monthly-life-card">
      <h2>⌁ 生活正在慢慢回来</h2>
      <div v-if="lifeRows.length" class="monthly-life-list">
        <div v-for="item in lifeRows" :key="item.key" class="monthly-life-row">
          <span>{{ item.label }}</span><i><b :style="{ width: item.width }"></b></i><small>{{ item.stateLabel }}</small>
        </div>
      </div>
      <p v-else class="monthly-empty">本月还没有生活恢复记录，先如实写下今天也可以。</p>
    </article>

    <article class="monthly-trend-card">
      <div class="monthly-trend-heading"><div><h2>⌁ 这段时间的起伏</h2><p>来自本月真实记录，不给情绪打分。</p></div><span>{{ report.recordDays }} 天记录</span></div>
      <div class="monthly-trend-plot" data-testid="report-trend-chart">
        <svg viewBox="0 0 320 118" role="img" aria-label="根据真实日记记录生成的本月起伏">
          <path class="trend-grid" d="M22 28H300M22 50H300M22 72H300M22 94H300" />
          <polyline v-if="trendPolyline" class="trend-line" :points="trendPolyline" />
          <circle v-for="point in trendPoints" :key="point.day" class="trend-point" :cx="point.x" :cy="point.y" r="4" />
        </svg>
        <div v-if="!trendPoints.length" class="trend-empty">本月还没有足够的记录来绘制起伏</div>
        <div class="trend-axis"><span v-for="day in trendTickDays" :key="day">{{ month.split('-')[1] }}/{{ day }}</span></div>
      </div>
    </article>

    <article class="monthly-ai-card">
      <h2>这个月，你慢慢走过来了</h2>
      <p v-if="summaryLoading">正在根据你允许的真实记录整理回顾…</p>
      <p v-for="(paragraph, index) in summaryParagraphs.slice(0, 2)" :key="index">{{ paragraph }}</p>
      <p v-if="!summaryLoading && !report.analysisAllowed" class="muted">长期旅程分析已关闭；你仍可以查看上面的真实记录。</p>
      <p v-else-if="!summaryLoading && !summaryParagraphs.length" class="muted">本月回顾暂时不可用，稍后刷新可查看任务状态。</p>
    </article>

    <p v-if="loadError" class="error-text">{{ loadError }}</p>

    <div class="report-actions">
      <button class="primary" data-testid="btn-report-poster" :disabled="summaryLoading || !report.summary" @click="makeShareImage"><span aria-hidden="true">▧</span>生成分享图</button>
      <button data-testid="btn-report-advice" :disabled="adviceLoading || !report.analysisAllowed" @click="loadAdvice"><span aria-hidden="true">♧</span>{{ adviceLoading ? '正在生成建议' : '查看温柔建议' }}</button>
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
.report-page {
  display: block;
  min-height: 100vh;
  padding: 0 12px calc(110px + env(safe-area-inset-bottom));
  overflow-x: clip;
  background: #f5efe2;
  color: #394237;
}

.report-page * { box-sizing: border-box; }

.monthly-hero {
  position: relative;
  height: 145px;
  margin: 0 -12px 10px;
  overflow: hidden;
  padding: 17px 24px;
  background: linear-gradient(145deg, #33404b 0%, #5f6260 62%, #928879 100%);
  color: #fffdf5;
}

.monthly-hero::after {
  position: absolute;
  top: -20px;
  right: -15px;
  width: 232px;
  height: 160px;
  opacity: .72;
  background: url('../assets/goodnight/tree-top-cutout.png') top right / contain no-repeat;
  filter: brightness(.7) saturate(.72) contrast(1.08);
  content: '';
  pointer-events: none;
}

.report-back {
  position: relative;
  z-index: 1;
  width: 28px;
  min-height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  box-shadow: none;
  color: rgba(255,255,255,.88);
  font-size: 28px;
  line-height: 1;
}

.monthly-logo,
.monthly-hero h1,
.monthly-month { position: relative; z-index: 1; }
.monthly-logo { margin: -25px 0 10px 30px; color: rgba(255,253,247,.87); font-size: 11px; font-weight: 700; }
.monthly-hero h1 { margin: 0; font-family: var(--gn-font-display); font-size: 26px; font-weight: 700; letter-spacing: .04em; line-height: 1.22; }
.monthly-month { display: inline-flex; min-height: 24px; margin-top: 8px; padding: 2px 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; color: rgba(255,253,247,.85); font-size: 11px; }

.monthly-brief,
.monthly-story-card,
.monthly-life-card,
.monthly-trend-card,
.monthly-ai-card {
  border: 1px solid rgba(128, 133, 107, .17);
  border-radius: 17px;
  background: rgba(255, 253, 247, .94);
  box-shadow: 0 8px 20px rgba(80, 82, 61, .06);
}

.monthly-brief { padding: 12px 14px 11px; }
.monthly-brief h2,
.monthly-life-card h2,
.monthly-trend-heading h2,
.monthly-ai-card h2 { margin: 0; color: #536c39; font-size: 13px; font-weight: 700; }
.monthly-brief-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 9px; }
.monthly-brief-grid article { min-width: 0; padding: 0 9px; border-right: 1px solid rgba(122, 132, 102, .17); }
.monthly-brief-grid article:first-child { padding-left: 0; }
.monthly-brief-grid article:last-child { padding-right: 0; border-right: 0; }
.monthly-brief-grid span { display: block; overflow: hidden; color: #747a6d; text-overflow: ellipsis; white-space: nowrap; font-size: 9px; }
.monthly-brief-grid strong { display: block; overflow: hidden; margin-top: 7px; color: #526d38; text-overflow: ellipsis; white-space: nowrap; font-family: var(--gn-font-body); font-size: 16px; line-height: 1.1; }
.monthly-brief-grid strong em { margin-left: 2px; font-size: 10px; font-style: normal; }

.monthly-story-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 9px; }
.monthly-story-card { position: relative; min-height: 104px; padding: 12px; overflow: hidden; }
.monthly-story-card::after { position: absolute; right: -8px; bottom: -25px; color: rgba(129, 151, 89, .18); font-size: 76px; content: '❧'; }
.monthly-story-card > * { position: relative; z-index: 1; }
.monthly-story-card span { display: block; color: #71834e; font-size: 10px; }
.monthly-story-card strong { display: -webkit-box; overflow: hidden; margin-top: 9px; color: #536b3c; font-size: 15px; line-height: 1.34; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.monthly-story-card p { display: -webkit-box; overflow: hidden; margin: 6px 0 0; color: #74796c; font-size: 9px; line-height: 1.42; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.stuck-card { background: rgba(252, 249, 239, .96); }

.monthly-life-card { margin-top: 9px; padding: 12px 14px; }
.monthly-life-list { display: grid; gap: 8px; margin-top: 11px; }
.monthly-life-row { display: grid; grid-template-columns: 86px minmax(0, 1fr) 52px; align-items: center; gap: 7px; color: #6e7769; font-size: 10px; }
.monthly-life-row i { display: block; height: 7px; overflow: hidden; border-radius: 999px; background: #e6e7dc; }
.monthly-life-row b { display: block; height: 100%; border-radius: inherit; background: #829b58; }
.monthly-life-row small { color: #748455; font-size: 9px; text-align: right; }
.monthly-empty { margin: 10px 0 0; color: #80867b; font-size: 11px; }

.monthly-trend-card { margin-top: 9px; padding: 12px 14px 10px; }
.monthly-trend-heading { display: flex; justify-content: space-between; align-items: start; gap: 10px; }
.monthly-trend-heading p { margin: 4px 0 0; color: #82877d; font-size: 9px; }
.monthly-trend-heading > span { color: #7d9060; font-size: 9px; white-space: nowrap; }
.monthly-trend-plot { position: relative; min-height: 104px; margin-top: 8px; }
.monthly-trend-plot svg { display: block; width: 100%; height: 82px; overflow: visible; }
.trend-grid { fill: none; stroke: rgba(117, 137, 88, .17); stroke-dasharray: 3 3; }
.trend-line { fill: none; stroke: #789254; stroke-linecap: round; stroke-linejoin: round; stroke-width: 2; }
.trend-point { fill: #fffdf7; stroke: #759052; stroke-width: 2; }
.trend-axis { display: flex; justify-content: space-between; padding: 0 8px; color: #8a8e83; font-size: 9px; }
.trend-empty { position: absolute; top: 30px; right: 0; left: 0; color: #81877d; text-align: center; font-size: 11px; }

.monthly-ai-card { margin-top: 9px; padding: 13px 15px; }
.monthly-ai-card p { margin: 7px 0 0; color: #626a5e; font-size: 11px; line-height: 1.65; }
.monthly-ai-card .muted { color: #848b80; }
.error-text { margin: 9px 4px; color: #b75a51; font-size: 11px; }

.report-page .report-actions { position: static; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; width: auto; margin: 10px 0 0; padding: 0; transform: none; }
.report-page .report-actions button { display: flex; align-items: center; justify-content: center; gap: 5px; min-height: 38px; padding: 7px 9px; border-radius: 999px; font-size: 11px; }
.report-page .report-actions button > span { font-size: 14px; }

@media (max-width: 374px) {
  .monthly-hero h1 { font-size: 24px; }
  .monthly-brief-grid article { padding-right: 6px; padding-left: 6px; }
  .monthly-brief-grid strong { font-size: 14px; }
  .monthly-life-row { grid-template-columns: 78px minmax(0, 1fr) 46px; gap: 5px; }
}
</style>
