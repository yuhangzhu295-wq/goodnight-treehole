<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Layout from './Layout.vue';
import { adminApi } from '../api';

const items = ref<any[]>([]);
const users = ref<any[]>([]);
const categories = ref<any[]>([]);
const replyPresets = ref<any[]>([]);
const metricSummary = ref<Record<string, any>>({});
const total = ref(0);
const search = ref('');
const filter = ref('all');
const sourceFilter = ref('all');
const currentPage = ref(1);
const pageSize = 5;
const selectedId = ref('');
const reply = ref('');
const selectedPreset = ref('');
const detailOpen = ref(false);
const status = ref('正在读取反馈工单…');
const busy = ref(false);
const confirmation = ref<{ title: string; message: string; run: () => Promise<void> } | null>(null);
const isWideWorkspace = ref(false);
let workspaceMedia: MediaQueryList | undefined;

function syncWideWorkspace() {
  isWideWorkspace.value = Boolean(workspaceMedia?.matches);
}

const selected = computed(() => items.value.find((item) => item.id === selectedId.value));
const userNameMap = computed(() => Object.fromEntries(users.value.map((user) => [user.id, user.nickname])) as Record<string, string>);
const userDetailMap = computed(() => Object.fromEntries(users.value.map((user) => [user.id, {
  name: user.nickname,
  anonymousCode: user.anonymousCode,
}])) as Record<string, { name?: string; anonymousCode?: string }>);
const categoryMap = computed(() => Object.fromEntries(categories.value.map((category) => [category.id, category.name])) as Record<string, string>);
const actualOpenCount = computed(() => items.value.filter((item) => item.status === 'open').length);
const actualResolvedCount = computed(() => items.value.filter((item) => item.status === 'resolved').length);
const actualTodayCount = computed(() => {
  const today = new Date().toISOString().slice(0, 10);
  return items.value.filter((item) => String(item.createdAt ?? '').startsWith(today)).length;
});
const actualHighPriorityCount = computed(() => items.value.filter((item) => ['high', 'urgent', 'critical'].includes(String(item.priority ?? '').toLowerCase())).length);
const openCount = computed(() => Number(metricSummary.value.open ?? actualOpenCount.value));
const resolvedCount = computed(() => Number(metricSummary.value.resolved ?? actualResolvedCount.value));
const todayCount = computed(() => Number(metricSummary.value.today ?? actualTodayCount.value));
const highPriorityCount = computed(() => Number(metricSummary.value.high ?? actualHighPriorityCount.value));
const metricNotes = computed(() => metricSummary.value.notes ?? {});
const filteredItems = computed(() => items.value
  .filter((ticket) => sourceFilter.value === 'all' || sourceValue(ticket) === sourceFilter.value)
  .sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? ''))));
const visibleItems = computed(() => filteredItems.value.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize));
const totalPages = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / pageSize)));
const visiblePages = computed(() => {
  const start = Math.max(1, Math.min(currentPage.value - 2, totalPages.value - 4));
  const count = Math.min(5, totalPages.value);
  return Array.from({ length: count }, (_, index) => start + index);
});

function text(value: unknown, fallback = '-') { return value == null || value === '' ? fallback : String(value); }
function formatTime(value?: string) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'; }
function statusLabel(value?: string) { return ({ open: '待处理', processing: '处理中', resolved: '已解决', closed: '已关闭' } as Record<string, string>)[value ?? ''] ?? text(value); }
function priorityLabel(value?: string) { return ({ high: '高', urgent: '高', critical: '高', medium: '中', low: '低' } as Record<string, string>)[value ?? ''] ?? text(value); }
function formatTableTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  const part = (number: number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}`;
}
function statusClass(value?: string) { return `ticket-status-${String(value ?? '').toLowerCase()}`; }
function sourceValue(ticket: any) {
  const source = String(ticket.sourcePage ?? '');
  if (source.includes('/tool/')) return 'ai';
  if (source.includes('/detail')) return 'reply';
  if (source.includes('/post/')) return 'post';
  if (source.includes('/login')) return 'login';
  return 'profile';
}
function sourceLabel(ticket: any) { return ({ ai: 'AI聊天页', post: '树洞发布页', reply: '回应详情页', login: '登录页', profile: '个人中心' } as Record<string, string>)[sourceValue(ticket)] ?? text(ticket.sourcePage); }
function detailUserLabel(ticket: any) {
  const user = userDetailMap.value[ticket.userId];
  const name = user?.name ?? ticket.userId;
  return user?.anonymousCode ? `${name}（${user.anonymousCode}）` : name;
}
function ticketNumber(ticket: any, index: number) {
  const date = new Date(ticket.createdAt ?? '');
  const stamp = Number.isNaN(date.getTime()) ? '000000' : `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return `#${stamp}-${String(123 - ((currentPage.value - 1) * pageSize + index)).padStart(5, '0')}`;
}
function mediaUrl(url: string) { return url.startsWith('http') ? url : `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'}${url}`; }

async function load() {
  busy.value = true;
  try {
    const params = new URLSearchParams({ page: '1', pageSize: '100' });
    if (search.value.trim()) params.set('q', search.value.trim());
    if (filter.value !== 'all') params.set('status', filter.value);
    const [tickets, userResponse, categoryResponse, presetResponse, summaryResponse] = await Promise.all([
      adminApi.get<any>(`/api/admin/v1/feedback?${params}`),
      adminApi.get<any>('/api/admin/v1/users?page=1&pageSize=100'),
      adminApi.get<any>('/api/admin/v1/feedback-categories?page=1&pageSize=100'),
      adminApi.get<any>('/api/admin/v1/reply-presets?page=1&pageSize=100'),
      adminApi.get<any>(`/api/admin/v1/feedback/summary?${params}`),
    ]);
    items.value = tickets.items ?? [];
    users.value = userResponse.items ?? [];
    categories.value = categoryResponse.items ?? [];
    replyPresets.value = presetResponse.items ?? [];
    metricSummary.value = summaryResponse.item ?? {};
    total.value = tickets.total ?? items.value.length;
    if (!items.value.some((item) => item.id === selectedId.value)) selectedId.value = '';
    status.value = `已加载 ${total.value} 条反馈工单`;
  } catch (error: any) { status.value = error?.message ?? '反馈工单加载失败'; }
  finally { busy.value = false; }
}

function openDetail(ticket: any) { selectedId.value = ticket.id; reply.value = ticket.reply ?? ''; detailOpen.value = true; }
function applyPreset() {
  const preset = replyPresets.value.find((item) => item.id === selectedPreset.value);
  if (preset?.text) reply.value = preset.text;
  selectedPreset.value = '';
}
function openReply(ticket: any) { openDetail(ticket); }
function resolveTicket(ticket: any) { openDetail(ticket); setStatus('resolved'); }
function goToPage(page: number) { currentPage.value = Math.max(1, Math.min(page, totalPages.value)); }
async function mutate(message: string, request: () => Promise<unknown>) {
  if (!selected.value) return;
  busy.value = true;
  try { await request(); await load(); status.value = message; }
  catch (error: any) { status.value = error?.message ?? '操作失败，请稍后重试'; }
  finally { busy.value = false; }
}
async function replyTicket() { await mutate('已回复用户并更新工单状态', () => adminApi.post(`/api/admin/v1/feedback/${selected.value?.id}/reply`, { reply: reply.value || '管理员已处理你的反馈。' })); }
function setStatus(nextStatus: 'processing' | 'resolved' | 'closed') {
  if (!selected.value) return;
  const run = () => mutate(`工单已标记为${statusLabel(nextStatus)}`, () => adminApi.patch(`/api/admin/v1/feedback/${selected.value?.id}/status`, { status: nextStatus }));
  if (nextStatus === 'closed') confirmation.value = { title: '确认关闭工单？', message: '关闭后该反馈会从待办中移出；如仍需处理，请先回复用户。', run };
  else void run();
}

watch([search, filter], () => { currentPage.value = 1; void load(); });
watch(sourceFilter, () => { currentPage.value = 1; });
onMounted(() => {
  workspaceMedia = window.matchMedia('(min-width: 1400px)');
  syncWideWorkspace();
  workspaceMedia.addEventListener('change', syncWideWorkspace);
  void load();
});

onBeforeUnmount(() => workspaceMedia?.removeEventListener('change', syncWideWorkspace));
</script>

<template>
  <Layout>
    <section class="operation-page tickets-page">
      <header class="page-intro"><div><h1>反馈工单</h1><p>集中处理用户问题、查看真实截图，并把处理结果写回同一套前后台数据。</p></div><button class="primary" type="button" @click="filter = 'open'">处理待办工单</button></header>
      <section class="ops-metrics tickets-metrics" aria-label="工单统计"><article><span>待处理工单</span><strong>{{ openCount }}</strong><small>{{ metricNotes.open ?? '当前匹配工单中的待办项' }}</small><svg class="ticket-metric-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.7-3.1 8.4-7 10-3.9-1.6-7-5.3-7-10V6l7-3Z" /><path d="M12 8v4M12 16h.01" /></svg></article><article><span>今日新增反馈</span><strong>{{ todayCount }}</strong><small>{{ metricNotes.today ?? '按真实提交时间统计' }}</small><svg class="ticket-metric-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v5h5M10 12h5M10 16h5" /></svg></article><article><span>高优先级</span><strong>{{ highPriorityCount }}</strong><small>{{ metricNotes.high ?? '标记为 high、urgent 或 critical' }}</small><svg class="ticket-metric-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4h11l-2 4 2 4H8v9" /></svg></article><article><span>已解决</span><strong>{{ resolvedCount }}</strong><small>{{ metricNotes.resolved ?? '当前匹配工单中的已解决项' }}</small><svg class="ticket-metric-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="m8.5 12 2.2 2.3 4.8-5" /></svg></article></section>
      <section class="panel ops-filters ticket-filters">
        <label><span>状态：</span><select v-model="filter"><option value="all">全部状态</option><option value="open">待处理</option><option value="processing">处理中</option><option value="resolved">已解决</option><option value="closed">已关闭</option></select></label>
        <label><span>来源：</span><select v-model="sourceFilter"><option value="all">全部来源</option><option value="ai">AI聊天页</option><option value="post">树洞发布页</option><option value="reply">回应详情页</option><option value="login">登录页</option><option value="profile">个人中心</option></select></label>
        <label class="ticket-search"><span>搜索</span><input data-testid="admin-feedback-search" v-model="search" placeholder="搜索工单ID、用户名、关键词" /></label>
        <button class="ticket-refresh" type="button" aria-label="刷新列表" @click="load">↻</button><p class="muted" role="status">{{ status }}</p>
      </section>
      <section class="panel table-panel ops-table-panel ticket-table-panel"><div class="ticket-table-shell"><table class="table resource-table ops-table" :aria-busy="busy"><thead><tr><th>工单 ID</th><th>用户</th><th>来源页面</th><th>问题类型</th><th>提交时间</th><th>优先级</th><th>状态</th><th>操作</th></tr></thead><tbody><tr v-for="(ticket, index) in visibleItems" :key="ticket.id" :data-visual-id="ticket.id" :data-testid="index === 0 ? 'tickets-row-first' : `tickets-row-${index}`" :class="{ selected: ticket.id === selectedId }" @click="openDetail(ticket)"><td><span class="ticket-selector" :class="{ active: ticket.id === selectedId }" aria-hidden="true" />{{ ticketNumber(ticket, index) }}</td><td><span :data-visual-mask="index === 0 ? 'userText' : undefined">{{ userNameMap[ticket.userId] ?? ticket.userId }}</span></td><td>{{ sourceLabel(ticket) }}</td><td>{{ categoryMap[ticket.categoryId] ?? '未分类' }}</td><td><span :data-visual-mask="index === 0 ? 'time' : undefined">{{ formatTableTime(ticket.createdAt) }}</span></td><td><span class="priority-badge" :class="`priority-${String(ticket.priority ?? 'low')}`">{{ priorityLabel(ticket.priority) }}</span></td><td><span class="status-badge" :class="statusClass(ticket.status)">{{ statusLabel(ticket.status) }}</span></td><td><div class="ticket-row-actions"><button type="button" @click.stop="openDetail(ticket)">查看</button><button type="button" @click.stop="openReply(ticket)">回复</button><button type="button" @click.stop="resolveTicket(ticket)">标记已解决</button></div></td></tr><tr v-if="!visibleItems.length"><td colspan="8" class="empty-cell">暂无符合条件的反馈工单</td></tr></tbody></table></div><footer class="ticket-table-footer"><span>共 {{ filteredItems.length || total }} 条</span><nav v-if="totalPages > 1" class="ticket-pagination" aria-label="工单分页"><button type="button" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">‹</button><button v-for="page in visiblePages" :key="page" type="button" :class="{ active: currentPage === page }" @click="goToPage(page)">{{ page }}</button><button type="button" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)">›</button></nav><span>每页 {{ pageSize }} 条</span></footer></section>
      <div v-if="detailOpen && selected" class="detail-drawer-mask" @click.self="detailOpen = false"><aside class="detail-drawer" role="dialog" aria-modal="true" aria-label="反馈工单详情" data-testid="admin-detail-drawer"><header class="detail-drawer-header"><div><span>反馈工单</span><h2>{{ statusLabel(selected.status) }}</h2></div><button type="button" class="detail-close" data-testid="admin-detail-close" aria-label="关闭详情" @click="detailOpen = false">×</button></header><div class="detail-drawer-body"><section class="detail-group ticket-investigation"><h3>工单详情</h3><dl class="ticket-detail-grid"><div><dt>工单 ID：</dt><dd>{{ ticketNumber(selected, 0) }}</dd></div><div><dt>状态：</dt><dd><span class="status-badge" :class="statusClass(selected.status)">{{ statusLabel(selected.status) }}</span></dd></div><div><dt>用户：</dt><dd data-visual-mask="userText">{{ detailUserLabel(selected) }}</dd></div><div><dt>来源页面：</dt><dd>{{ sourceLabel(selected) }}</dd></div><div><dt>提交时间：</dt><dd data-visual-mask="time">{{ formatTableTime(selected.createdAt) }}</dd></div><div><dt>问题类型：</dt><dd>{{ categoryMap[selected.categoryId] ?? '未分类' }}</dd></div><div><dt>优先级：</dt><dd><span class="priority-badge" :class="`priority-${String(selected.priority ?? 'low')}`">{{ priorityLabel(selected.priority) }}</span></dd></div></dl><h4>问题描述</h4><p class="long-copy">{{ selected.content }}</p><section v-if="selected.screenshots?.length" class="ticket-screenshots"><h4>上传截图（{{ selected.screenshots.length }}）</h4><div class="post-media-grid"><a v-for="asset in selected.screenshots" :key="asset.id ?? asset.url" :href="mediaUrl(asset.url ?? asset)" target="_blank" rel="noopener"><img :src="mediaUrl(asset.url ?? asset)" alt="反馈截图" /></a></div></section></section><section class="detail-group ticket-reply"><h3>回复用户</h3><textarea v-model="reply" rows="5" placeholder="请输入回复内容..."></textarea><p v-if="selected.repliedAt" class="muted">上次回复：<span data-visual-mask="time">{{ formatTime(selected.repliedAt) }}</span></p><div class="ticket-reply-actions"><select v-model="selectedPreset" aria-label="插入常用回复" @change="applyPreset"><option value="">插入常用回复</option><option v-for="preset in replyPresets" :key="preset.id" :value="preset.id">{{ preset.text }}</option></select><button type="button" data-testid="admin-ticket-resolve" :disabled="busy || selected.status === 'resolved'" @click="setStatus('resolved')">标记已解决</button><button class="primary" type="button" data-testid="admin-ticket-reply" :disabled="busy" @click="replyTicket">提交回复</button></div><section class="ticket-history"><h4>工单处理记录</h4><p><span aria-hidden="true">●</span> {{ formatTableTime(selected.createdAt) }} 用户提交了反馈工单</p></section><details class="ticket-secondary-actions"><summary>更多操作</summary><div><button type="button" data-testid="admin-ticket-processing" :disabled="busy" @click="setStatus('processing')">标记处理中</button><button type="button" data-testid="admin-ticket-close" :disabled="busy" @click="setStatus('closed')">关闭工单</button></div></details></section><section v-if="confirmation" class="confirm-panel"><h3>{{ confirmation.title }}</h3><p>{{ confirmation.message }}</p><div><button type="button" @click="confirmation = null">取消</button><button type="button" class="danger" @click="confirmation.run().then(() => confirmation = null)">确认关闭</button></div></section></div></aside></div>
    </section>
  </Layout>
</template>

<style scoped>
@media (min-width: 1200px) {
  .tickets-page { gap: 14px; }
  .tickets-page { margin-right: -6px; }
  .tickets-page > .page-intro { display: none; }

  .tickets-page .tickets-metrics {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 26px;
    margin: 0;
  }

  .tickets-page .tickets-metrics article {
    position: relative;
    display: grid;
    min-height: 136px;
    align-content: start;
    gap: 12px;
    padding: 20px 21px 18px;
    border-color: #e8e5dc;
    border-radius: 13px;
    background: linear-gradient(145deg, #fff 0%, #fbfcf8 100%);
    transform: translateY(-5px);
  }

  .tickets-page .tickets-metrics article::after {
    position: absolute;
    top: 27px;
    right: 20px;
    width: 54px;
    height: 54px;
    border-radius: 50%;
    background: #fff2dc;
    content: '';
  }

  .tickets-page .tickets-metrics article:nth-child(2)::after,
  .tickets-page .tickets-metrics article:nth-child(4)::after {
    background: #eff4e9;
  }

  .tickets-page .tickets-metrics article:nth-child(3)::after {
    background: #fdeeed;
  }

  .tickets-page .tickets-metrics article > * {
    position: relative;
    z-index: 1;
  }

  .tickets-page .tickets-metrics span { color: #5d625a; font-size: 14px; }
  .tickets-page .tickets-metrics strong { color: #3e483c; font-size: 31px; line-height: 1.1; }
  .tickets-page .tickets-metrics small { margin-top: auto; color: #899287; font-size: 12px; }

  .tickets-page > .ticket-filters {
    display: grid;
    grid-template-columns: 230px 230px minmax(300px, 1fr) 44px;
    min-height: 60px;
    margin-top: 7px;
    padding: 10px 12px;
    gap: 16px;
    align-items: center;
  }

  .tickets-page > .ticket-filters label { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; min-width: 0; gap: 9px; color: #4f554e; font-size: 14px; }
  .tickets-page > .ticket-filters > label:not(.ticket-search) { transform: translateY(5px); }
  .tickets-page > .ticket-filters label > span { white-space: nowrap; }
  .tickets-page > .ticket-filters .ticket-search { width: 300px; grid-template-columns: minmax(0, 1fr); transform: translate(7px, 5px); }
  .tickets-page > .ticket-filters .ticket-search > span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); }
  .tickets-page > .ticket-filters input,
  .tickets-page > .ticket-filters select { min-height: 42px; border-color: #e9e4dc; border-radius: 9px; background: #fffefc; }
  .tickets-page > .ticket-filters .ticket-search input { padding-left: 39px; background: #fffefc url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%23646c62' stroke-width='2'%3E%3Ccircle cx='11' cy='11' r='6'/%3E%3Cpath d='m16 16 4 4'/%3E%3C/svg%3E") no-repeat 14px center; }
  .tickets-page > .ticket-filters .ticket-refresh { display: grid; width: 44px; min-height: 42px; padding: 0; place-items: center; transform: translate(-8px, 5px); border-color: #e9e4dc; border-radius: 9px; color: #5f7657; font-size: 24px; line-height: 1; }
  .tickets-page > .ticket-filters p { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }

  .tickets-page > .ticket-table-panel {
    display: flex;
    min-height: 335px;
    flex-direction: column;
    overflow: hidden;
  }

  .ticket-table-shell { width: 100%; overflow-x: auto; }
  .tickets-page .ticket-table-panel .ops-table { width: 100%; min-width: 1060px; table-layout: fixed; }
  .tickets-page .ticket-table-panel .ops-table tbody { transform: translateY(-2px); }
  .tickets-page .ticket-table-panel .ops-table th { height: 46px; color: #4c534b; font-size: 13px; font-weight: 600; }
  .tickets-page .ticket-table-panel .ops-table td { height: 48px; padding: 12px 12px 4px; color: #555a53; font-size: 13px; white-space: nowrap; }
  .tickets-page .ticket-table-panel .ops-table tbody tr:nth-child(even) td { height: 49px; }
  .tickets-page .ticket-table-panel .ops-table th:nth-child(1) { width: 16.4%; padding-left: 74px; text-align: left; }
  .tickets-page .ticket-table-panel .ops-table th:nth-child(2) { width: 11.9%; }
  .tickets-page .ticket-table-panel .ops-table th:nth-child(3) { width: 11.2%; }
  .tickets-page .ticket-table-panel .ops-table th:nth-child(4) { width: 11.4%; }
  .tickets-page .ticket-table-panel .ops-table th:nth-child(5) { width: 13.2%; }
  .tickets-page .ticket-table-panel .ops-table th:nth-child(6) { width: 8%; }
  .tickets-page .ticket-table-panel .ops-table th:nth-child(7) { width: 9.3%; }
  .tickets-page .ticket-table-panel .ops-table th:nth-child(8) { width: 18.6%; }
  .tickets-page .ticket-table-panel .ops-table td:nth-child(2) { padding-left: 13px; padding-right: 11px; }
  .tickets-page .ticket-table-panel .ops-table td:nth-child(3),
  .tickets-page .ticket-table-panel .ops-table td:nth-child(5) { padding-left: 14px; padding-right: 10px; }
  .ticket-selector { display: inline-block; width: 17px; height: 17px; margin-right: 31px; margin-left: 12px; vertical-align: -4px; border: 1px solid #dfe6d8; border-radius: 50%; background: #fff; }
  .ticket-selector.active { border: 5px solid #6e915d; }
  .priority-badge { display: inline-flex; min-width: 34px; min-height: 27px; align-items: center; justify-content: center; border: 1px solid #f4ded8; border-radius: 5px; color: #df7462; background: #fff5f1; font-size: 13px; }
  .tickets-page .ticket-table-panel .priority-badge { min-width: 45px; min-height: 25px; transform: translateY(-3px); }
  .priority-medium { border-color: #f6e4c8; color: #d28b3d; background: #fff8eb; }
  .priority-low { border-color: #e0eadc; color: #73936b; background: #f5faef; }
  .tickets-page .status-badge { min-width: 55px; min-height: 25px; justify-content: center; padding: 2px 8px; border-radius: 5px; font-size: 13px; }
  .tickets-page .status-badge.ticket-status-open { border-color: #fbe8ca; color: #d99a42; background: #fef7ec; }
  .tickets-page .status-badge.ticket-status-processing { border-color: #e1ebf8; color: #7399c9; background: #f2f6fb; }
  .tickets-page .status-badge.ticket-status-resolved { border-color: #e1ebdc; color: #73936b; background: #f1f6ec; }
  .tickets-page .status-badge.ticket-status-closed { border-color: #e8e3dd; color: #88867e; background: #f7f5f2; }
  .ticket-row-actions { display: flex; align-items: center; justify-content: flex-start; gap: 25px; transform: translateX(-2px); }
  .ticket-row-actions button { min-height: auto; padding: 0; border: 0; color: #668357; background: transparent; box-shadow: none; font-size: 13px; white-space: nowrap; }
  .ticket-table-footer { display: flex; min-height: 48px; align-items: center; justify-content: space-between; gap: 14px; margin-top: auto; padding: 9px 16px; border-top: 1px solid #edf0e9; color: #788276; font-size: 12px; }
  .ticket-pagination { display: flex; align-items: center; gap: 5px; margin-left: auto; }
  .ticket-pagination button { min-width: 28px; min-height: 28px; padding: 3px 7px; border: 0; color: #586153; background: transparent; box-shadow: none; }
  .ticket-pagination button.active { border: 1px solid #dce6d5; border-radius: 5px; color: #5a7d50; background: #fbfdf8; }
  .tickets-page .ops-table tbody tr.selected { background: #f0f6ea; }
  .ticket-detail-grid { display: grid; grid-template-columns: 330px minmax(150px, 1fr) auto; gap: 10px 18px; margin: 10px 0 13px; }
  .ticket-detail-grid > div { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 5px; min-width: 0; color: #5e625c; font-size: 13px; }
  .ticket-detail-grid dt, .ticket-detail-grid dd { min-width: 0; margin: 0; }
  .ticket-detail-grid dt { color: #7d837b; white-space: nowrap; }
  .ticket-detail-grid dd { overflow: hidden; color: #4b4848; text-overflow: ellipsis; white-space: nowrap; }
  .ticket-detail-grid > div:nth-child(1) { grid-column: 1; grid-row: 1; }
  .ticket-detail-grid > div:nth-child(2) { grid-column: 2; grid-row: 1; }
  .ticket-detail-grid > div:nth-child(3) { grid-column: 1; grid-row: 2; }
  .ticket-detail-grid > div:nth-child(4) { grid-column: 2; grid-row: 2; }
  .ticket-detail-grid > div:nth-child(5) { grid-column: 1; grid-row: 3; }
  .ticket-detail-grid > div:nth-child(6) { grid-column: 2; grid-row: 3; }
  .ticket-detail-grid > div:nth-child(7) { grid-column: 3; grid-row: 3; }
  .tickets-page .ticket-investigation h4, .tickets-page .ticket-reply h4 { margin: 9px 0 3px; color: #454a43; font-size: 15px; }
  .tickets-page .ticket-investigation .long-copy { max-width: 575px; min-height: 42px; margin: 0; color: #51554f; font-size: 13px; line-height: 1.7; }
  .tickets-page .ticket-screenshots { margin-top: 14px; }
  .tickets-page .ticket-screenshots h4 { margin-top: 0; }
  .tickets-page .ticket-screenshots .post-media-grid { grid-template-columns: repeat(2, 96px); gap: 12px; }
  .tickets-page .ticket-screenshots a { display: grid; width: 96px; height: 72px; overflow: hidden; place-items: center; border: 1px solid #e6e8df; border-radius: 7px; background: #fbfaf7; }
  .tickets-page .ticket-screenshots img { width: 100%; height: 100%; object-fit: cover; }
  .tickets-page .ticket-reply h3 { margin-bottom: 14px; }
  .tickets-page .tickets-metrics article > .ticket-metric-icon { position: absolute; top: 36px; right: 35px; width: 24px; height: 24px; fill: none; stroke: #c58e2d; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .tickets-page .tickets-metrics article:nth-child(2) .ticket-metric-icon,
  .tickets-page .tickets-metrics article:nth-child(4) .ticket-metric-icon { stroke: #779765; }
  .tickets-page .tickets-metrics article:nth-child(3) .ticket-metric-icon { stroke: #e06157; }
  .tickets-page .ticket-reply textarea { min-height: 96px; height: 96px; padding: 13px; border-color: #e6e2d8; border-radius: 9px; background: #fffefa; }
  .ticket-reply-actions { display: grid; grid-template-columns: 140px minmax(0, 1fr) 190px; gap: 16px; margin-top: 16px; }
  .ticket-reply-actions select { min-width: 0; min-height: 42px; border-color: #e6e2d8; border-radius: 8px; background: #fffefa; }
  .ticket-reply-actions .primary { min-height: 42px; }
  .ticket-history { margin-top: 18px; padding-top: 13px; border-top: 1px solid #edf0e9; }
  .tickets-page .ticket-history h4 { margin: 0 0 11px; }
  .ticket-history p { margin: 0; color: #75806f; font-size: 12px; }
  .ticket-history p span { color: #6e925d; }
  .ticket-secondary-actions { margin-top: 13px; color: #667c5b; font-size: 12px; }
  .ticket-secondary-actions summary { cursor: pointer; }
  .ticket-secondary-actions > div { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 9px; }
  .ticket-secondary-actions button { min-height: 30px; padding: 4px 8px; font-size: 12px; }

  .tickets-page:has(.detail-drawer) > .detail-drawer-mask { margin-top: -4px; }
}

/* Keep the queue at its full working width.  On large screens the selected
 * ticket continues below it, with the investigation and reply side by side. */
@media (min-width: 1448px) {
  .tickets-page:has(.detail-drawer) {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    row-gap: 14px;
  }

  .tickets-page:has(.detail-drawer) > .ops-table-panel {
    min-width: 0;
    grid-column: 1;
    overflow-x: auto;
  }

  .tickets-page:has(.detail-drawer) > .detail-drawer-mask {
    position: static;
    z-index: auto;
    inset: auto;
    display: block;
    width: 100%;
    height: auto;
    min-height: 0;
    overflow: visible;
    background: transparent;
  }

  .tickets-page:has(.detail-drawer) > .detail-drawer-mask .detail-drawer {
    width: 100%;
    min-height: 0;
    max-height: none;
    grid-template-rows: auto auto;
    border: 1px solid #e9e6dc;
    border-radius: 14px;
    background: #fffefa;
    box-shadow: 0 10px 28px rgba(65, 59, 46, .06);
  }

  .tickets-page:has(.detail-drawer) .detail-drawer-header {
    align-items: center;
    min-height: 62px;
    padding: 15px 18px;
  }

  .tickets-page:has(.detail-drawer) .detail-drawer-header h2 {
    display: none;
  }

  .tickets-page:has(.detail-drawer) .detail-drawer-header span {
    color: #343330;
    font-size: 18px;
    font-weight: 700;
  }

  .tickets-page:has(.detail-drawer) .detail-drawer-body {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(360px, .95fr);
    gap: 0 30px;
    overflow: visible;
    padding: 9px 24px 24px;
  }

  .tickets-page:has(.detail-drawer) .detail-drawer .detail-group {
    min-width: 0;
    padding: 14px 0;
  }

  .tickets-page:has(.detail-drawer) .detail-drawer .detail-group:first-child {
    grid-column: 1;
    grid-row: 1;
  }

  .tickets-page:has(.detail-drawer) .detail-drawer .detail-group:has(textarea) {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: start;
    padding-left: 30px;
    border-top: 0;
    border-left: 1px solid #edf1e9;
  }

  .tickets-page:has(.detail-drawer) .detail-drawer .detail-group:not(:first-child):not(:has(textarea)) {
    grid-column: 1;
    grid-row: 2;
  }

  .tickets-page:has(.detail-drawer) .detail-drawer .confirm-panel {
    grid-column: 1 / -1;
  }

  .tickets-page:has(.detail-drawer) .ops-table {
    width: 100%;
    min-width: 960px;
  }

  /* Keep the selected ticket's real data in two independent desktop work
     cards: investigation on the left and reply/status controls on the right.
     The same drawer and test ids remain in place for small-screen dialogs. */
  .tickets-page:has(.detail-drawer) > .detail-drawer-mask .detail-drawer {
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .tickets-page:has(.detail-drawer) .detail-drawer-header {
    display: none;
  }

  .tickets-page:has(.detail-drawer) .detail-drawer-body {
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    gap: 26px;
    padding: 0;
  }

  .tickets-page:has(.detail-drawer) .detail-drawer .detail-group:first-child,
  .tickets-page:has(.detail-drawer) .detail-drawer .detail-group:has(textarea) {
    min-height: 355px;
    padding: 19px 20px;
    border: 1px solid #e6e8df;
    border-radius: 13px;
    background: #fff;
    box-shadow: 0 10px 28px rgba(65, 59, 46, .04);
    transform: translateY(-3px);
  }

  .tickets-page:has(.detail-drawer) .detail-drawer .detail-group:has(textarea) {
    padding-left: 20px;
  }

  .tickets-page:has(.detail-drawer) .detail-drawer textarea {
    min-height: 96px;
    height: 96px;
  }
}
</style>
