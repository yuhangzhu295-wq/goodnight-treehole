<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import Layout from './Layout.vue';
import { adminApi } from '../api';

const items = ref<any[]>([]);
const total = ref(0);
const busy = ref(false);
const detailLoading = ref(false);
const status = ref('正在读取 AI 任务记录…');
const search = ref('');
const taskFilter = ref('all');
const styleFilter = ref('all');
const providerFilter = ref('all');
const stateFilter = ref('all');
const createdFrom = ref('');
const createdTo = ref('');
const page = ref(1);
// The reference work surface is a five-record review queue.  Keeping this
// small is deliberate: the selected, real task can remain visible directly
// beneath the current page instead of being pushed below a long list.
const pageSize = ref(5);
const selectedId = ref('');

const taskLabels: Record<string, string> = {
  public_ai_reply: '公开树洞回应',
  warm_letter: '今日回信',
  healing_phrase: '治愈短句',
  emotion_analysis: '情绪拆解',
  breakdown: '情绪拆解',
  monthly_report: '情绪月报',
  month_report: '情绪月报',
  future_letter: '写给未来',
  work_support: '工作支持',
  work: '工作支持',
  sleep_comfort: '睡前安慰',
  sleep: '睡前安慰',
  heal: '治愈短句',
  negative_rewrite: '表达改写',
  rewrite: '表达改写',
  rant: '轻松吐槽',
};
const styleLabels: Record<string, string> = {
  warm: '暖心陪伴',
  rational: '理性分析',
  light: '轻松一点',
  clear: '清醒提醒',
  poetic: '诗意治愈',
  human: '真人支持',
};
const stateLabels: Record<string, string> = {
  queued: '排队中',
  running: '运行中',
  succeeded: '成功',
  failed: '失败',
  cancelled: '已取消',
  fallback: '历史模板记录',
  fallback_completed: '历史模板记录',
};
function taskLabel(value?: string) {
  return taskLabels[value ?? ''] ?? '未标注任务';
}
function styleLabel(value?: string) {
  return styleLabels[value ?? ''] ?? '未标注风格';
}
function stateLabel(value?: string) {
  return stateLabels[value ?? ''] ?? '状态未记录';
}
function providerLabel(job: any) {
  const id = String(job?.providerId ?? '').toLowerCase();
  if (!id) return '未记录供应商';
  if (id.includes('stub')) return 'Fixture Stub';
  if (id.includes('ollama')) return '已禁用本地模型';
  if (id.includes('template') || id.includes('safe')) return '历史模板记录';
  if (id.includes('risk')) return '安全策略';
  return '已配置供应商';
}
function time(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-';
}
function timeShort(value?: string) {
  return value ? new Date(value).toLocaleTimeString('zh-CN', { hour12: false }) : '-';
}
function dateKey(value?: string) {
  return value ? value.slice(0, 10) : '';
}
function duration(value?: number, state?: string) {
  if (value == null || value <= 0) return ['queued', 'running'].includes(state ?? '') ? '进行中' : '-';
  if (value < 1_000) return `${value}ms`;
  if (value < 60_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}s`;
  const minutes = Math.floor(value / 60_000);
  return `${minutes}分${Math.round((value % 60_000) / 1_000)}秒`;
}
function rawJob(job: any) {
  return JSON.stringify(job?._raw ?? job, null, 2);
}
function stateTone(value?: string) {
  if (value === 'failed') return 'is-failed';
  if (['queued', 'running'].includes(value ?? '')) return 'is-pending';
  if (['fallback', 'fallback_completed'].includes(value ?? '')) return 'is-fallback';
  return 'is-success';
}
function decorate(item: any) {
  return {
    ...item,
    _raw: item,
    displayTaskType: taskLabel(item.jobType || item.taskType),
    displayStyle: styleLabel(item.style),
    displayProvider: providerLabel(item),
  };
}
function traceEntries(job: any) {
  return Array.isArray(job?.traceJson) ? job.traceJson : [];
}
function traceLabel(entry: any) {
  return ({
    queued: '任务已排队',
    running: '任务开始运行',
    'provider-attempt': '模型调用',
    terminal: '任务完成',
  } as Record<string, string>)[entry?.event] ?? '调用记录';
}
function traceSummary(entry: any) {
  const parts = [
    entry?.role === 'primary' ? '主模型' : entry?.role === 'backup' ? '备用模型' : '',
    entry?.modelName,
    entry?.reason ? `原因：${entry.reason}` : '',
    entry?.durationMs != null ? `耗时 ${duration(entry.durationMs)}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : stateLabel(entry?.status);
}

const selected = computed(() => items.value.find((item) => item.id === selectedId.value));
const taskOptions = computed(() => Array.from(new Set(items.value.map((item) => item.jobType || item.taskType).filter(Boolean)))
  .map((value) => ({ value, label: taskLabel(value) }))
  .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN')));
const styleOptions = computed(() => Array.from(new Set(items.value.map((item) => item.style).filter(Boolean)))
  .map((value) => ({ value, label: styleLabel(value) }))
  .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN')));
const providerOptions = computed(() => Array.from(new Set(items.value.map((item) => item.modelName).filter(Boolean)))
  .sort((a, b) => String(a).localeCompare(String(b), 'zh-CN')));
const filteredItems = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase();
  return items.value.filter((item) => {
    const matchesSearch = !needle || [
      item.id,
      item.userId,
      item.contentId,
      item.displayTaskType,
      item.displayStyle,
      item.modelName,
    ].some((value) => String(value ?? '').toLocaleLowerCase().includes(needle));
    const matchesTask = taskFilter.value === 'all' || (item.jobType || item.taskType) === taskFilter.value;
    const matchesStyle = styleFilter.value === 'all' || item.style === styleFilter.value;
    const matchesProvider = providerFilter.value === 'all' || item.modelName === providerFilter.value;
    const matchesState = stateFilter.value === 'all' || item.status === stateFilter.value;
    const day = dateKey(item.createdAt);
    const matchesFrom = !createdFrom.value || day >= createdFrom.value;
    const matchesTo = !createdTo.value || day <= createdTo.value;
    return matchesSearch && matchesTask && matchesStyle && matchesProvider && matchesState && matchesFrom && matchesTo;
  });
});
const totalPages = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / pageSize.value)));
const visibleItems = computed(() => {
  const current = Math.min(page.value, totalPages.value);
  const start = (current - 1) * pageSize.value;
  return filteredItems.value.slice(start, start + pageSize.value);
});
const currentRange = computed(() => {
  if (!filteredItems.value.length) return '0';
  const start = (Math.min(page.value, totalPages.value) - 1) * pageSize.value + 1;
  return `${start}–${Math.min(start + pageSize.value - 1, filteredItems.value.length)}`;
});
const stats = computed(() => {
  const today = new Date().toISOString().slice(0, 10);
  const terminal = items.value.filter((item) => ['succeeded', 'failed', 'fallback', 'fallback_completed'].includes(item.status) && Number(item.durationMs) > 0);
  const average = terminal.length ? Math.round(terminal.reduce((sum, item) => sum + Number(item.durationMs), 0) / terminal.length) : 0;
  return {
    today: items.value.filter((item) => dateKey(item.createdAt) === today).length,
    failed: items.value.filter((item) => item.status === 'failed').length,
    average,
    fallback: items.value.filter((item) => item.fallbackUsed || ['fallback', 'fallback_completed'].includes(item.status)).length,
  };
});
const dataNotice = computed(() => total.value > items.value.length
  ? `为保持页面响应，当前展示最近 ${items.value.length} 条记录；服务端共 ${total.value} 条。`
  : `已从服务端读取 ${total.value} 条任务记录。`);

function resetFilters() {
  search.value = '';
  taskFilter.value = 'all';
  styleFilter.value = 'all';
  providerFilter.value = 'all';
  stateFilter.value = 'all';
  createdFrom.value = '';
  createdTo.value = '';
  page.value = 1;
}
async function load() {
  busy.value = true;
  try {
    const response = await adminApi.get<any>('/api/admin/v1/ai/jobs?page=1&pageSize=100');
    items.value = (response.items ?? []).map(decorate);
    total.value = Number(response.total ?? items.value.length);
    const row = currentPageSelection();
    if (row) await open(row);
    else selectedId.value = '';
    status.value = dataNotice.value;
  } catch (error: any) {
    status.value = error?.message ?? '任务记录加载失败';
  } finally {
    busy.value = false;
  }
}
async function open(source: any) {
  selectedId.value = source.id;
  detailLoading.value = true;
  try {
    const response = await adminApi.get<any>(`/api/admin/v1/ai/jobs/${source.id}`);
    if (!response?.item) return;
    const latest = decorate(response.item);
    const index = items.value.findIndex((item) => item.id === latest.id);
    if (index >= 0) items.value.splice(index, 1, latest);
  } catch (error: any) {
    status.value = error?.message ?? '无法读取这条任务详情';
  } finally {
    detailLoading.value = false;
  }
}
function closeDetail() {
  selectedId.value = '';
}
function currentPageSelection() {
  const pageRows = visibleItems.value;
  return pageRows.find((item) => item.id === selectedId.value)
    ?? pageRows.find((item) => item.status === 'failed')
    ?? pageRows[0];
}
function selectCurrentPage() {
  const row = currentPageSelection();
  if (!row) {
    closeDetail();
    return;
  }
  if (row.id !== selectedId.value) void open(row);
}
function changePage(nextPage: number) {
  page.value = Math.min(Math.max(1, nextPage), totalPages.value);
  selectCurrentPage();
}
async function act(message: string, request: () => Promise<any>) {
  if (!selected.value) return;
  busy.value = true;
  try {
    const response = await request();
    const nextId = response?.item?.id ?? response?.jobId;
    await load();
    if (nextId) {
      selectedId.value = nextId;
      const latest = items.value.find((item) => item.id === nextId);
      if (latest) await open(latest);
    }
    status.value = nextId ? `${message}，已创建任务 ${nextId}` : message;
  } catch (error: any) {
    status.value = error?.message ?? '操作失败';
  } finally {
    busy.value = false;
  }
}
async function runAction(source: any) {
  await open(source);
  await act('已提交重试任务', () => adminApi.post(`/api/admin/v1/ai/jobs/${source.id}/retry`));
}

watch([search, taskFilter, styleFilter, providerFilter, stateFilter, createdFrom, createdTo, pageSize], () => {
  page.value = 1;
  selectCurrentPage();
});
watch(totalPages, (value) => {
  if (page.value > value) {
    page.value = value;
    selectCurrentPage();
  }
});
onMounted(load);
</script>

<template>
  <Layout>
    <section class="operation-page ai-jobs-page">
      <header class="page-intro ai-jobs-intro">
        <div>
          <h1>AI 任务记录</h1>
          <p>按真实任务状态、实际模型和耗时查看运行情况；输入、结果与调用轨迹仅在选中任务详情中展开。</p>
        </div>
      </header>

      <section class="panel ai-jobs-filters" aria-label="AI 任务筛选">
        <label><span>任务类型</span><select v-model="taskFilter"><option value="all">全部任务</option><option v-for="option in taskOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
        <label><span>风格</span><select v-model="styleFilter"><option value="all">全部风格</option><option v-for="option in styleOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
        <label><span>实际模型</span><select v-model="providerFilter"><option value="all">全部模型</option><option v-for="option in providerOptions" :key="option" :value="option">{{ option }}</option></select></label>
        <label><span>状态</span><select v-model="stateFilter"><option value="all">全部状态</option><option v-for="(label, value) in stateLabels" :key="value" :value="value">{{ label }}</option></select></label>
        <label class="job-date-range"><span>创建时间</span><span class="date-range-inputs"><input v-model="createdFrom" type="date" aria-label="创建开始日期" /><i>至</i><input v-model="createdTo" type="date" aria-label="创建结束日期" /></span></label>
        <label class="job-search"><span>搜索</span><input v-model="search" placeholder="任务、用户、内容或模型" /></label>
        <div class="filter-actions"><button type="button" :disabled="busy" @click="resetFilters">重置</button><button type="button" class="primary" :disabled="busy" data-testid="admin-ai-jobs-refresh" @click="load">查询</button></div>
        <p class="filter-status muted" role="status" aria-live="polite">{{ status }}</p>
      </section>

      <section class="ai-job-metrics" aria-label="AI 任务统计">
        <article><span>今日任务数</span><strong>{{ stats.today }}</strong><small>按任务创建时间统计</small></article>
        <article><span>失败任务</span><strong>{{ stats.failed }}</strong><small>当前加载记录中的失败项</small></article>
        <article><span>平均耗时</span><strong>{{ duration(stats.average) }}</strong><small>已完成任务的真实平均值</small></article>
        <article><span>历史模板记录</span><strong>{{ stats.fallback }}</strong><small>仅用于保留既有审计记录，不参与当前远程路由</small></article>
      </section>

      <section class="panel ai-job-table-panel" aria-label="AI 运行任务">
        <h2 class="visually-hidden">运行任务</h2>
        <div class="ai-job-table-shell">
          <table class="table ai-job-table">
            <thead><tr><th>任务 ID</th><th>用户 ID</th><th>内容 ID</th><th>任务类型</th><th>风格</th><th>供应商/模型</th><th>状态</th><th>耗时</th><th>创建时间</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="(job, index) in visibleItems" :key="job.id" :data-visual-id="job.id" :data-testid="index === 0 ? 'jobs-row-first' : `jobs-row-${index}`" :class="{ selected: job.id === selectedId }" tabindex="0" @click="open(job)" @keyup.enter="open(job)">
                <td class="job-id-cell"><strong :title="job.id">{{ job.id }}</strong></td>
                <td class="job-source-cell" :title="job.userId"><span :data-visual-mask="index === 0 ? 'userText' : undefined">{{ job.userId || '匿名用户' }}</span></td>
                <td class="content-id-cell" :title="job.contentId"><span :data-visual-mask="index === 0 ? 'userText' : undefined">{{ job.contentId || '-' }}</span></td>
                <td>{{ job.displayTaskType }}</td><td>{{ job.displayStyle }}</td>
                <td class="model-cell"><strong :title="job.modelName || job.displayProvider">{{ job.modelName || job.displayProvider }}</strong><small>{{ job.displayProvider }}</small></td>
                <td><span class="status-badge job-state" :class="stateTone(job.status)">{{ stateLabel(job.status) }}</span></td>
                <td class="duration-cell"><span :data-visual-mask="index === 0 ? 'stat' : undefined">{{ duration(job.durationMs, job.status) }}</span></td><td class="time-cell"><span :data-visual-mask="index === 0 ? 'time' : undefined">{{ time(job.createdAt) }}</span></td>
                <td class="job-actions-cell" @click.stop><div class="job-row-actions"><button type="button" class="text-action" @click="open(job)">查看详情</button><template v-if="job.status === 'failed'"><button type="button" class="text-action" :disabled="busy" @click="runAction(job)">重试</button></template></div></td>
              </tr>
              <tr v-if="!visibleItems.length"><td colspan="10" class="empty-cell">暂无匹配的 AI 任务</td></tr>
            </tbody>
          </table>
        </div>
        <footer class="ai-job-pagination"><span>{{ filteredItems.length === total ? `共 ${total} 条` : `筛选到 ${filteredItems.length} 条 / 共 ${total} 条` }}</span><div><button type="button" :disabled="page <= 1" @click="changePage(page - 1)">上一页</button><span>第 {{ Math.min(page, totalPages) }} / {{ totalPages }} 页 · {{ currentRange }}</span><button type="button" :disabled="page >= totalPages" @click="changePage(page + 1)">下一页</button><select v-model.number="pageSize" aria-label="每页数量"><option :value="5">5 条/页</option><option :value="10">10 条/页</option><option :value="20">20 条/页</option></select></div></footer>
      </section>

      <section v-if="selected" class="panel ai-job-detail" data-testid="admin-ai-job-detail" aria-label="AI 任务详情">
        <header class="ai-job-detail-header"><div><h2>任务详情（{{ selected.id }}）</h2></div><div><span v-if="detailLoading" class="detail-loading">正在同步详情…</span><button type="button" class="detail-close" aria-label="关闭详情" @click="closeDetail">×</button></div></header>
        <div class="ai-job-detail-grid">
          <section class="job-detail-summary"><h3>基本信息</h3><dl><dt>任务 ID</dt><dd>{{ selected.id }}</dd><dt>用户 ID</dt><dd :data-visual-mask="selected.userId ? 'userText' : undefined">{{ selected.userId || '-' }}</dd><dt>内容 ID</dt><dd :data-visual-mask="selected.contentId ? 'userText' : undefined">{{ selected.contentId || '-' }}</dd><dt>任务类型</dt><dd>{{ selected.displayTaskType }}</dd><dt>风格</dt><dd>{{ selected.displayStyle }}</dd><dt>实际模型</dt><dd>{{ selected.modelName || selected.displayProvider }}</dd><dt>创建时间</dt><dd data-visual-mask="time">{{ time(selected.createdAt) }}</dd><dt>状态</dt><dd><span class="status-badge job-state" :class="stateTone(selected.status)">{{ stateLabel(selected.status) }}</span></dd><dt>耗时</dt><dd data-visual-mask="stat">{{ duration(selected.durationMs, selected.status) }}</dd></dl></section>

          <section class="job-detail-focus"><h3>原始 Prompt 摘要</h3><p class="job-brief-copy">{{ selected.promptSummary || '该任务未记录可展示的输入摘要。' }}</p><h3 class="detail-section-title">错误信息</h3><p class="job-brief-copy" :data-visual-mask="selected.errorMessage ? 'aiText' : undefined" :class="{ 'is-error-copy': selected.errorMessage }">{{ selected.errorMessage || '未记录调用错误。' }}</p><h3 class="detail-section-title">失败处理</h3><p class="job-brief-copy is-fallback-copy">{{ selected.fallbackUsed ? '这是保留的历史模板记录；当前远程策略不会自动模板兜底。' : '主备远程 Provider 均失败时会保持真实失败状态。' }}</p><details class="job-detail-more"><summary>查看完整输入、结果和原始记录</summary><div><h4>完整输入</h4><pre class="job-long-copy">{{ selected.promptSummary || '未记录输入摘要' }}</pre><h4>生成结果</h4><pre class="job-long-copy">{{ selected.result || '尚未生成结果' }}</pre><h4>原始数据</h4><pre class="job-long-copy job-raw-copy">{{ rawJob(selected) }}</pre></div></details><div v-if="selected.status === 'failed'" class="detail-actions"><button type="button" class="primary" :disabled="busy" @click="act('已提交重试任务', () => adminApi.post(`/api/admin/v1/ai/jobs/${selected.id}/retry`))">重试任务</button></div></section>

          <section class="job-trace"><h3>任务追踪</h3><ol v-if="traceEntries(selected).length"><li v-for="(entry, index) in traceEntries(selected)" :key="`${entry.at || index}-${entry.event || index}`"><i :class="stateTone(entry.status)" /><div><strong>{{ traceLabel(entry) }}</strong><p>{{ traceSummary(entry) }}</p></div><time>{{ timeShort(entry.at) }}</time></li></ol><p v-else class="muted">该任务暂未记录调用轨迹。</p></section>
        </div>
      </section>
    </section>
  </Layout>
</template>

<style scoped>
.ai-jobs-page { min-width: 0; gap: 20px; }

/* The route is already named in the shell's top bar.  Removing this repeated
   hero preserves the reference page's compact review queue at desktop size. */
.ai-jobs-intro { display: none; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }

.ai-jobs-filters { display: grid; grid-template-columns: minmax(105px, .82fr) minmax(105px, .82fr) minmax(132px, 1fr) minmax(105px, .78fr) minmax(207px, 1.52fr) minmax(155px, 1.12fr) auto; gap: 9px 10px; align-items: end; padding: 0; border: 0; background: transparent; box-shadow: none; }
.ai-jobs-filters label { display: grid; min-width: 0; gap: 4px; color: #667067; font-size: 12px; }
.ai-jobs-filters input, .ai-jobs-filters select { width: 100%; min-width: 0; min-height: 36px; padding: 7px 9px; font-size: 13px; }
.job-date-range { min-width: 0; }.date-range-inputs { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 5px; align-items: center; min-width: 0; }.date-range-inputs i { color: #899187; font-style: normal; font-size: 12px; }.date-range-inputs input { min-width: 0; padding-inline: 6px; }
.filter-actions { display: flex; gap: 7px; align-items: end; justify-content: flex-end; }.filter-actions button { min-width: 57px; min-height: 36px; padding: 7px 11px; font-size: 13px; }
.filter-status { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }

.ai-job-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.ai-job-metrics article { position: relative; display: flex; min-width: 0; min-height: 132px; flex-direction: column; align-items: flex-start; padding: 18px 20px; border: 1px solid #e6e8df; border-radius: 12px; background: linear-gradient(135deg, #fff 0%, #fbfcf8 100%); box-shadow: 0 10px 22px rgba(44, 60, 49, .045); }
.ai-job-metrics article::after { position: absolute; top: 22px; right: 20px; width: 42px; height: 42px; border-radius: 50%; background: #eef4e9; content: ''; }
.ai-job-metrics article:nth-child(2)::after { background: #fbf0dc; }.ai-job-metrics article:nth-child(3)::after { background: #eff4e8; }.ai-job-metrics article:nth-child(4)::after { background: #eef3e9; }
.ai-job-metrics span { color: #65695f; font-size: 14px; }.ai-job-metrics strong { display: block; max-width: calc(100% - 54px); margin-top: 10px; overflow: hidden; color: #3e413a; font-size: 34px; line-height: 1; text-overflow: ellipsis; white-space: nowrap; }.ai-job-metrics small { margin-top: auto; color: #899187; font-size: 12px; line-height: 1.35; }

.ai-job-table-panel { min-width: 0; padding: 0; overflow: hidden; }
.ai-job-table-shell { width: 100%; overflow-x: auto; }
.ai-job-table { width: 100%; min-width: 0; table-layout: fixed; }
.ai-job-table th, .ai-job-table td { padding: 8px 8px; vertical-align: middle; }
.ai-job-table th { padding-top: 11px; padding-bottom: 11px; color: #5d645b; font-size: 12px; font-weight: 600; white-space: nowrap; background: #fafbf8; }
.ai-job-table th:nth-child(1) { width: 13.2%; }.ai-job-table th:nth-child(2) { width: 9%; }.ai-job-table th:nth-child(3) { width: 9%; }.ai-job-table th:nth-child(4) { width: 8.5%; }.ai-job-table th:nth-child(5) { width: 7.6%; }.ai-job-table th:nth-child(6) { width: 13.8%; }.ai-job-table th:nth-child(7) { width: 7%; }.ai-job-table th:nth-child(8) { width: 5.5%; }.ai-job-table th:nth-child(9) { width: 12.1%; }.ai-job-table th:nth-child(10) { width: 14.3%; }
.ai-job-table tbody tr { height: 49px; transition: background .16s ease; }.ai-job-table tbody tr:hover, .ai-job-table tbody tr.selected { background: #f4f8f0; }.ai-job-table tbody tr.selected { box-shadow: inset 0 0 0 1px #b2cda7; }.ai-job-table tbody tr:focus { outline: 2px solid #b8cfa9; outline-offset: -2px; }
.ai-job-table td { padding-top: 7px; padding-bottom: 7px; overflow: hidden; color: #4e584e; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.ai-job-table td strong, .ai-job-table td small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.ai-job-table td strong { color: #425043; font-weight: 600; }.ai-job-table td small { margin-top: 3px; color: #899188; font-size: 11px; }
.job-id-cell strong { color: #536d4d; }.job-source-cell, .content-id-cell { color: #59645a; }.model-cell strong { color: #46584a; }.duration-cell, .time-cell { color: #687268; font-variant-numeric: tabular-nums; }
.job-actions-cell { overflow: visible !important; white-space: nowrap !important; }.job-row-actions { display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; }.job-row-actions .text-action { flex: 0 0 auto; min-height: 26px; padding: 3px 0; color: #55794c; font-size: 12px; }.job-row-actions .text-action + .text-action { color: #6d8057; }
.job-state { min-height: 24px; padding: 2px 7px; font-size: 12px; }.job-state.is-success { border-color: #d7e8d0; color: #4a7641; background: #f0f8ed; }.job-state.is-pending { border-color: #f0dfb8; color: #9a6c24; background: #fff9e9; }.job-state.is-failed { border-color: #f0cfd0; color: #b34e52; background: #fff2f2; }.job-state.is-fallback { border-color: #d3e1f2; color: #527aa2; background: #f0f6ff; }
.ai-job-pagination { display: flex; align-items: center; justify-content: space-between; gap: 14px; min-height: 47px; padding: 8px 16px; color: #738073; font-size: 12px; border-top: 1px solid #edf0e9; }.ai-job-pagination > div { display: flex; align-items: center; gap: 7px; }.ai-job-pagination button { min-height: 28px; padding: 4px 8px; font-size: 12px; }.ai-job-pagination select { min-height: 28px; padding: 3px 6px; font-size: 12px; }

.ai-job-detail { padding: 0; overflow: hidden; }.ai-job-detail-header { display: flex; align-items: center; justify-content: space-between; gap: 18px; min-height: 42px; padding: 8px 18px; border-bottom: 1px solid #e9eee6; background: #fffefa; }.ai-job-detail-header > div:last-child { display: flex; align-items: center; gap: 10px; }.ai-job-detail-header h2 { max-width: min(760px, 65vw); margin: 0; overflow: hidden; color: #405040; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }.detail-loading { color: #628358; font-size: 12px; white-space: nowrap; }.ai-job-detail .detail-close { min-width: 26px; min-height: 26px; padding: 0; border: 0; border-radius: 50%; color: #849082; background: transparent; font-size: 22px; line-height: 1; }
.ai-job-detail-grid { display: grid; grid-template-columns: minmax(232px, .72fr) minmax(354px, 1.12fr) minmax(286px, .92fr); min-height: 292px; align-items: stretch; }.ai-job-detail-grid > section { min-width: 0; padding: 13px 18px 15px; border-right: 1px solid #edf0ea; }.ai-job-detail-grid > section:last-child { border-right: 0; }.ai-job-detail h3 { margin: 0 0 8px; color: #405040; font-size: 14px; }.detail-section-title { margin-top: 10px !important; }
.job-detail-summary dl { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 6px 10px; margin: 0; }.job-detail-summary dt { color: #829082; font-size: 12px; }.job-detail-summary dd { min-width: 0; margin: 0; overflow-wrap: anywhere; color: #445044; font-size: 12px; line-height: 1.42; }.job-detail-summary .job-state { min-height: 21px; padding: 1px 6px; font-size: 11px; }
.job-brief-copy { display: -webkit-box; max-height: 38px; margin: 0; overflow: hidden; color: #4b574b; font-size: 12px; line-height: 1.55; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }.job-brief-copy.is-error-copy { padding: 6px 8px; border: 1px solid #f1d9d5; border-radius: 7px; color: #a6544e; background: #fff8f6; }.job-brief-copy.is-fallback-copy { padding: 6px 8px; border: 1px solid #d7e5f2; border-radius: 7px; color: #54769e; background: #f5f9ff; }.job-detail-more { margin-top: 9px; }.job-detail-more summary { color: #5b7b53; cursor: pointer; font-size: 12px; }.job-detail-more[open] summary { margin-bottom: 8px; }.job-detail-more h4 { margin: 9px 0 5px; color: #566853; font-size: 12px; }.job-long-copy { max-height: 185px; margin: 0; overflow: auto; padding: 9px; border: 1px solid #e3ebdf; border-radius: 8px; color: #3e4c3f; background: #fafcf8; font: 11px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }.job-raw-copy { border-color: #dce7d6; background: #f6faf3; }.detail-actions { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 8px; }.detail-actions button { min-height: 29px; padding: 4px 8px; font-size: 12px; }
.job-trace ol { display: grid; gap: 0; max-height: 239px; margin: 0; padding: 0; overflow-y: auto; list-style: none; }.job-trace li { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 8px; min-height: 38px; }.job-trace li > i { position: relative; width: 8px; height: 8px; margin-top: 4px; border-radius: 50%; background: #74a36a; }.job-trace li:not(:last-child) > i::after { position: absolute; top: 8px; left: 3px; width: 1px; height: 31px; content: ''; background: #dce9d5; }.job-trace li > i.is-failed { background: #d46b5b; }.job-trace li > i.is-pending { background: #d6a246; }.job-trace li > i.is-fallback { background: #6d91ba; }.job-trace strong { display: block; color: #465447; font-size: 12px; }.job-trace p { margin: 2px 0 0; color: #7d887e; font-size: 11px; line-height: 1.35; overflow-wrap: anywhere; }.job-trace time { color: #929a91; font-size: 10px; white-space: nowrap; }

@media (max-width: 1199px) { .ai-jobs-filters { grid-template-columns: repeat(3, minmax(0, 1fr)); }.job-date-range { grid-column: span 2; }.filter-actions { justify-content: flex-start; }.ai-job-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }.ai-job-detail-grid { grid-template-columns: minmax(220px, .82fr) minmax(300px, 1.18fr); }.job-trace { grid-column: 1 / -1; border-top: 1px solid #edf0ea; }.job-trace ol { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 18px; }.job-trace li:not(:last-child) > i::after { display: none; } }
@media (max-width: 980px) { .ai-job-table { min-width: 1020px; }.ai-job-pagination { align-items: flex-start; flex-direction: column; }.ai-job-pagination > div { flex-wrap: wrap; } }
@media (max-width: 820px) { .ai-jobs-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 14px; }.job-date-range, .job-search, .filter-actions { grid-column: span 2; }.ai-job-metrics { grid-template-columns: 1fr; }.ai-job-detail-header { align-items: flex-start; }.ai-job-detail-header h2 { max-width: 68vw; }.ai-job-detail-grid { grid-template-columns: 1fr; }.ai-job-detail-grid > section { border-right: 0; border-bottom: 1px solid #edf0ea; }.ai-job-detail-grid > section:last-child { border-bottom: 0; }.job-trace ol { grid-template-columns: 1fr; }.job-trace li:not(:last-child) > i::after { display: block; } }
</style>
