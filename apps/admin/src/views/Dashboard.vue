<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Layout from './Layout.vue';
import { adminApi } from '../api';

const router = useRouter();
const overview = ref<any>();
const loading = ref(false);
const error = ref('');

const emotionItems = computed(() => Object.entries(overview.value?.emotionDistribution ?? {}) as Array<[string, number]>);
const emotionTotal = computed(() => emotionItems.value.reduce((total, [, count]) => total + Number(count || 0), 0));
const emotionColors = ['#5f8d65', '#a8bc80', '#ecc866', '#e7a493', '#a8b9d9', '#9787b6'];
const emotionGradient = computed(() => {
  if (!emotionTotal.value) return '#eaf0e7 0 100%';
  let offset = 0;
  return emotionItems.value.map(([, count], index) => {
    const start = (offset / emotionTotal.value) * 100;
    offset += Number(count || 0);
    const end = (offset / emotionTotal.value) * 100;
    return `${emotionColors[index % emotionColors.length]} ${start}% ${end}%`;
  }).join(', ');
});

/** The overview endpoint already provides seven dated samples.  Render that
 * real series as a line chart here instead of inventing a second summary just
 * for the dashboard. */
const activitySeries = computed(() => (overview.value?.activeTrend ?? []).map((day: any) => ({
  ...day,
  value: Number(day.users ?? 0) + Number(day.posts ?? 0) + Number(day.replies ?? 0),
})));
const activityMax = computed(() => Math.max(1, ...activitySeries.value.map((day: any) => day.value)));
const activityPoints = computed(() => {
  const series = activitySeries.value;
  if (!series.length) return '';
  return series.map((day: any, index: number) => {
    const x = series.length === 1 ? 350 : 42 + (616 * index) / (series.length - 1);
    const y = 176 - (Math.max(0, day.value) / activityMax.value) * 132;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
});
const activityArea = computed(() => activityPoints.value ? `42,176 ${activityPoints.value} 658,176` : '');
const aiOverviewRows = computed(() => {
  const summary = overview.value?.aiSummary ?? {};
  const succeeded = Number(summary.succeeded ?? 0);
  const fallback = Number(summary.fallback ?? 0);
  const failed = Number(summary.failed ?? 0);
  const total = Math.max(1, succeeded + fallback + failed);
  return [
    { key: 'succeeded', label: '成功任务', count: succeeded, note: '已完成', ratio: (succeeded / total) * 100, tone: 'is-succeeded' },
    { key: 'fallback', label: '模板兜底', count: fallback, note: '安全兜底', ratio: (fallback / total) * 100, tone: 'is-fallback' },
    { key: 'failed', label: '失败任务', count: failed, note: '需要关注', ratio: (failed / total) * 100, tone: 'is-failed' },
  ];
});

const reviewLabels: Record<string, string> = {
  published: '已发布',
  pending_review: '待审核',
  hidden: '已隐藏',
  rejected: '已驳回',
};
function reviewLabel(post: any) {
  return reviewLabels[post?.reviewStatus] ?? post?.reviewStatus ?? '未标注';
}
function reviewTone(post: any) {
  if (post?.reviewStatus === 'pending_review') return 'is-pending';
  if (post?.reviewStatus === 'hidden' || post?.reviewStatus === 'rejected') return 'is-muted';
  return 'is-published';
}
function postTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(/\//g, '-');
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    overview.value = (await adminApi.get<any>('/api/admin/v1/dashboard/overview')).item;
  } catch (event: any) {
    error.value = event?.message ?? '数据总览加载失败';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <Layout>
    <p v-if="loading" class="panel muted dashboard-message">正在读取后台实时数据…</p>
    <p v-if="error" class="panel danger dashboard-message">{{ error }}</p>

    <section v-if="overview" class="dashboard-page">
      <div class="metrics dashboard-metrics">
        <article class="metric">
          <span>今日新增用户</span>
          <strong data-visual-mask="stat">{{ overview.todayUsers }}</strong>
          <small>实时统计</small><i class="metric-art metric-users" aria-hidden="true">♟</i>
        </article>
        <article class="metric">
          <span>今日树洞发布</span>
          <strong data-visual-mask="stat">{{ overview.todayPosts }}</strong>
          <small>实时统计</small><i class="metric-art metric-posts" aria-hidden="true">▤</i>
        </article>
        <article class="metric">
          <span>待审核内容</span>
          <strong data-visual-mask="stat">{{ overview.pendingReviews }}</strong>
          <small>等待运营处理</small><i class="metric-art metric-pending" aria-hidden="true">!</i>
        </article>
        <article class="metric">
          <span>AI 成功率</span>
          <strong data-visual-mask="stat">{{ overview.aiSuccessRate }}%</strong>
          <small>近 24 小时任务</small><i class="metric-art metric-ai" aria-hidden="true">✦</i>
        </article>
      </div>

      <section class="panel journey-ops-strip" aria-label="现实陪跑实时统计">
        <div class="panel-heading"><h2>现实陪跑实时统计</h2><span>与用户端同一数据源</span></div>
        <div class="journey-ops-grid">
          <button type="button" @click="router.push('/experience/journeys')"><strong>{{ overview.journeySummary?.active ?? 0 }}</strong><span>进行中旅程</span></button>
          <button type="button" @click="router.push('/experience/actions')"><strong>{{ overview.journeySummary?.actions ?? 0 }}</strong><span>进行中行动</span></button>
          <button type="button" @click="router.push('/experience/checkins')"><strong>{{ overview.journeySummary?.dueCheckins ?? 0 }}</strong><span>到期回访</span></button>
          <button type="button" @click="router.push('/experience/peers')"><strong>{{ overview.journeySummary?.peerExperiences ?? 0 }}</strong><span>已发布经历</span></button>
          <button type="button" @click="router.push('/safety/events')"><strong>{{ overview.journeySummary?.safetyEvents ?? 0 }}</strong><span>高风险事件</span></button>
          <button type="button" @click="router.push('/experience/follow-ups')"><strong>{{ overview.journeySummary?.followUps ?? 0 }}</strong><span>待处理随访</span></button>
          <button type="button" @click="router.push('/experience/peer-conversations')"><strong>{{ overview.journeySummary?.connectedPeerConversations ?? 0 }}</strong><span>进行中会话</span></button>
          <button type="button" @click="router.push('/experience/notifications')"><strong>{{ overview.journeySummary?.unreadNotifications ?? 0 }}</strong><span>未读提醒</span></button>
        </div>
      </section>

      <div class="dashboard-grid dashboard-primary-grid">
        <section class="panel trend-panel">
          <div class="panel-heading">
            <h2>最近 7 天活跃趋势</h2>
            <span>{{ overview.activeTrend?.length ?? 0 }} 天</span>
          </div>
          <div class="trend-chart trend-chart-line" data-testid="admin-dashboard-trend">
            <svg viewBox="0 0 700 202" preserveAspectRatio="none" role="img" aria-label="最近七天的真实活跃趋势">
              <line v-for="line in [44, 88, 132, 176]" :key="line" x1="42" x2="658" :y1="line" :y2="line" />
              <polygon v-if="activityArea" :points="activityArea" />
              <polyline v-if="activityPoints" :points="activityPoints" />
              <circle v-for="(point, index) in activityPoints.split(' ')" :key="index" :cx="point.split(',')[0]" :cy="point.split(',')[1]" r="4.5" />
            </svg>
            <div class="trend-xlabels"><small v-for="day in activitySeries" :key="day.date">{{ day.date.slice(5) }}</small></div>
          </div>
          <div class="chart-legend"><span><i class="users"></i>真实活跃总量（用户、树洞、回应）</span></div>
        </section>

        <section class="panel emotion-panel">
          <div class="panel-heading">
            <h2>情绪分类分布</h2>
            <span>{{ emotionItems.length }} 类</span>
          </div>
          <div class="emotion-content" data-testid="admin-dashboard-emotions">
            <div class="emotion-donut" :style="{ background: `conic-gradient(${emotionGradient})` }">
              <div><span>总数</span><strong>{{ emotionTotal }}</strong></div>
            </div>
            <div class="emotion-list">
              <label v-for="([name, count], index) in emotionItems" :key="name">
                <span><i :style="{ background: emotionColors[index % emotionColors.length] }"></i>{{ name }}</span>
                <strong>{{ count }}</strong>
              </label>
            </div>
          </div>
        </section>
      </div>

      <div class="dashboard-grid lower">
        <section class="panel dashboard-feed-panel">
          <div class="panel-heading">
            <h2>最新树洞动态</h2>
          </div>
          <div class="dashboard-post-table" aria-label="最新树洞动态列表">
            <div class="dashboard-post-table-head" aria-hidden="true"><span>时间</span><span>情绪</span><span>内容摘要</span><span>状态</span></div>
            <article v-for="(post, index) in overview.latestPosts.slice(0, 5)" :key="post.id" class="dashboard-post-row">
              <time :data-visual-mask="index === 0 ? 'time' : undefined">{{ postTime(post.createdAt) }}</time>
              <span class="post-emotion">{{ post.emotion }}</span>
              <p :data-visual-mask="index === 0 ? 'userText' : undefined" :title="post.content">{{ post.content }}</p>
              <span class="post-review" :class="reviewTone(post)">{{ reviewLabel(post) }}</span>
            </article>
            <button data-testid="admin-dashboard-open-posts" class="dashboard-posts-more" @click="router.push('/posts')">查看全部 <span aria-hidden="true">→</span></button>
          </div>
        </section>

        <div class="dashboard-side-stack">
          <section class="panel dashboard-ai-panel">
            <div class="panel-heading">
              <h2>AI 任务概览</h2>
              <button class="dashboard-ai-link" data-testid="admin-dashboard-open-jobs" @click="router.push('/ai/jobs')">查看全部</button>
            </div>
            <div class="dashboard-ai-table" aria-label="真实 AI 任务状态概览">
              <div class="dashboard-ai-table-head"><span>任务状态</span><span>今日任务数</span><span>占比</span><span>状态</span></div>
              <article v-for="row in aiOverviewRows" :key="row.key" class="dashboard-ai-table-row">
                <span>{{ row.label }}</span>
                <strong data-visual-mask="stat">{{ row.count }}</strong>
                <span data-visual-mask="stat">{{ row.ratio.toFixed(1) }}%</span>
                <span class="dashboard-ai-status" :class="row.tone">{{ row.note }}</span>
              </article>
            </div>
          </section>
          <section class="panel dashboard-quick-actions" aria-label="快捷操作">
            <div class="panel-heading"><h2>快捷操作</h2><button data-testid="admin-dashboard-refresh" @click="load">刷新数据</button></div>
            <div>
              <button data-testid="admin-shortcut-posts" @click="router.push('/posts')">审核内容</button>
              <button class="primary" data-testid="admin-shortcut-ai" @click="router.push('/ai/providers')">查看 AI 配置</button>
              <button data-testid="admin-shortcut-feedback" @click="router.push('/ops/feedback')">处理反馈</button>
            </div>
          </section>
        </div>
      </div>

      <details class="panel ai-monitor-details">
        <summary>AI 运行监控</summary>
        <div class="metrics ai-monitor-metrics" data-testid="admin-ai-monitor">
          <div class="metric"><span>本地推理</span><strong>已禁用</strong></div>
          <div class="metric"><span>远程主路由</span><strong>CLI Proxy</strong></div>
          <div class="metric"><span>今日调用</span><strong>{{ overview.aiMonitor?.todayCalls ?? 0 }}</strong></div>
          <div class="metric"><span>平均耗时</span><strong>{{ overview.aiMonitor?.averageDurationMs ?? 0 }}ms</strong></div>
          <div class="metric"><span>失败率</span><strong>{{ overview.aiMonitor?.failureRate ?? 0 }}%</strong></div>
          <div class="metric"><span>远程备用</span><strong>DeepSeek</strong></div>
        </div>
      </details>
    </section>
  </Layout>
</template>

<style scoped>
.dashboard-page { gap: 24px; }
.journey-ops-strip { padding: 20px 22px; }
.journey-ops-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.journey-ops-grid button { display: grid; gap: 5px; min-height: 74px; border: 1px solid rgba(95, 127, 62, .16); border-radius: 14px; background: #fbfaf3; color: #3f6330; cursor: pointer; font: inherit; text-align: left; padding: 12px; }
.journey-ops-grid button:hover { border-color: rgba(95, 127, 62, .42); background: #f1f6e9; }
.journey-ops-grid strong { font-size: 24px; }
.journey-ops-grid span { color: #75806f; font-size: 13px; }
@media (max-width: 960px) { .journey-ops-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 620px) { .journey-ops-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.dashboard-metrics .metric { position: relative; overflow: hidden; }
.dashboard-metrics .metric small { margin-top: auto; color: #75826f; font-size: 13px; }
.metric-art { position: absolute; top: 24px; right: 22px; display: grid; width: 54px; height: 54px; place-items: center; border-radius: 50%; font-style: normal; font-size: 25px; }
.metric-users, .metric-posts, .metric-ai { color: #5d8347; background: #eff4e8; }
.metric-pending { color: #c5881f; background: #fff2d9; font-weight: 800; }
.trend-chart-line {
  /* `.trend-chart` is also used by the legacy seven-column bar chart.  This
   * chart has one SVG surface plus its labels, so inheriting that grid made
   * the SVG only one column wide and collapsed the real trend into the left
   * edge of the panel. */
  display: block;
  position: relative;
  min-height: 216px;
  padding: 8px 0 25px;
}
.trend-chart-line svg { width: 100%; height: 182px; overflow: visible; }
.trend-chart-line line { stroke: #e9e4da; stroke-dasharray: 3 4; stroke-width: 1; }
.trend-chart-line polygon { fill: rgba(106, 142, 82, .10); }
.trend-chart-line polyline { fill: none; stroke: #58804c; stroke-linecap: round; stroke-linejoin: round; stroke-width: 3.5; }
.trend-chart-line circle { fill: #fff; stroke: #58804c; stroke-width: 3; }
.trend-xlabels { position: absolute; right: 5%; bottom: 0; left: 5%; display: flex; justify-content: space-between; color: #706b63; }
.dashboard-grid.lower { align-items: start; }
.dashboard-side-stack { display: grid; grid-template-rows: 248px auto; align-content: start; gap: 16px; min-width: 0; }
.dashboard-grid.lower .dashboard-ai-panel { min-height: 248px; max-height: 248px; overflow: hidden; }
.dashboard-grid.lower .dashboard-feed-panel { min-height: 385px; }
.dashboard-grid.lower .dashboard-quick-actions { min-height: 122px; height: 122px; padding: 15px 17px 16px; }
.dashboard-quick-actions .panel-heading { margin-bottom: 11px; }
.dashboard-quick-actions h2 { font-size: 17px; }
.dashboard-quick-actions button { min-height: 42px; }
.dashboard-post-table { overflow: hidden; border: 1px solid #e8e9e3; border-radius: 11px; background: #fff; }
.dashboard-post-table-head,
.dashboard-post-row { display: grid; grid-template-columns: 112px 76px minmax(0, 1fr) 60px; gap: 10px; align-items: center; }
.dashboard-post-table-head { min-height: 39px; padding: 0 14px; color: #62665f; font-size: 12px; font-weight: 600; background: #fafbf8; }
.dashboard-post-row { min-height: 42px; padding: 0 14px; border-top: 1px solid #edf0ea; color: #555f55; font-size: 12px; }
.dashboard-post-row time { color: #687268; font-variant-numeric: tabular-nums; white-space: nowrap; }
.dashboard-post-row p { min-width: 0; margin: 0; overflow: hidden; color: #4b574c; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.post-emotion { display: inline-flex; align-items: center; gap: 6px; min-width: 0; color: #5a6758; white-space: nowrap; }
.post-emotion::before { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%; background: #9eb785; content: ''; }
.post-review { justify-self: end; padding: 4px 7px; border-radius: 7px; font-size: 11px; line-height: 1; white-space: nowrap; }
.post-review.is-published { color: #5c8652; background: #eff7ec; }
.post-review.is-pending { color: #bd8126; background: #fff5e2; }
.post-review.is-muted { color: #7a8280; background: #f0f2f0; }
.dashboard-posts-more { display: flex; width: 100%; min-height: 51px; align-items: center; justify-content: center; gap: 8px; border: 0; border-top: 1px solid #edf0ea; border-radius: 0; color: #5b824d; background: #fff; font-size: 13px; font-weight: 600; }
.dashboard-posts-more:hover { color: #456d3a; background: #f8fbf5; }
.dashboard-ai-panel { padding: 19px 20px 18px; }
.dashboard-ai-panel .panel-heading { margin-bottom: 12px; }
.dashboard-ai-link { min-height: auto; padding: 3px 0; border: 0; border-radius: 0; color: #5c824d; background: transparent; font-size: 13px; font-weight: 600; }
.dashboard-ai-link:hover { color: #456d3a; background: transparent; }
.dashboard-ai-table { overflow: hidden; border: 1px solid #e8e9e3; border-radius: 11px; background: #fff; }
.dashboard-ai-table-head,
.dashboard-ai-table-row { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(68px, .9fr) minmax(56px, .7fr) minmax(66px, .9fr); gap: 8px; align-items: center; padding: 0 13px; }
.dashboard-ai-table-head { min-height: 35px; color: #62665f; background: #fafbf8; font-size: 11px; font-weight: 600; }
.dashboard-ai-table-row { min-height: 42px; border-top: 1px solid #edf0ea; color: #4b574c; font-size: 12px; }
.dashboard-ai-table-row strong { color: #3d493d; font-size: 13px; }
.dashboard-ai-status { justify-self: start; padding: 4px 7px; border-radius: 7px; font-size: 11px; line-height: 1; white-space: nowrap; }
.dashboard-ai-status.is-succeeded { color: #5c8652; background: #eff7ec; }
.dashboard-ai-status.is-fallback { color: #96752e; background: #fff5e2; }
.dashboard-ai-status.is-failed { color: #ad6358; background: #fff0ed; }
@media (max-width: 980px) {
  .dashboard-side-stack { grid-template-rows: auto auto; }
  .dashboard-grid.lower .dashboard-ai-panel { max-height: none; }
}
</style>
