<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Layout from './Layout.vue';
import { adminApi } from '../api';

const items = ref<any[]>([]);
const users = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 10;
const totalPages = ref(1);
const route = useRoute();
const search = ref(typeof route.query.q === 'string' ? route.query.q : '');
const filter = ref('all');
const emotionFilter = ref('all');
const visibilityFilter = ref('all');
const dateStart = ref('');
const dateEnd = ref('');
const selectedId = ref('');
const selectedIds = ref<string[]>([]);
const detailOpen = ref(false);
const status = ref('正在读取树洞内容…');
const busy = ref(false);
const confirmation = ref<{ title: string; message: string; run: () => Promise<void> } | null>(null);

const selected = computed(() => items.value.find((item) => item.id === selectedId.value));
const visibleItems = computed(() => items.value.filter((item) => isWithinDateRange(item.createdAt)));
const pendingCount = computed(() => visibleItems.value.filter((item) => item.reviewStatus === 'pending_review').length);
const publicCount = computed(() => visibleItems.value.filter((item) => item.visibility === 'PUBLIC').length);
const userNames = computed(() => Object.fromEntries(users.value.map((user) => [user.id, `${user.nickname} / ${user.anonymousCode}`])) as Record<string, string>);
const selectedCount = computed(() => selectedIds.value.length);
const allVisibleSelected = computed(() => visibleItems.value.length > 0 && visibleItems.value.every((item) => selectedIds.value.includes(item.id)));
const emotionOptions = ['焦虑', '委屈', '失眠', '恋爱', '工作'];

function text(value: unknown, fallback = '-') { return value == null || value === '' ? fallback : String(value); }
function clip(value: string, length = 72) { return value.length > length ? `${value.slice(0, length)}…` : value; }
function formatTime(value?: string) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'; }
function reviewLabel(value?: string) { return ({ pending_review: '待审核', published: '已发布', hidden: '已隐藏', rejected: '已拒绝' } as Record<string, string>)[value ?? ''] ?? text(value); }
function mediaUrl(url: string) { return url.startsWith('http') ? url : `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'}${url}`; }
function userLabel(userId?: string) { return userNames.value[userId ?? ''] ?? '匿名用户'; }
function emotionTone(emotion?: string) { return ({ 焦虑: 'tone-anxious', 委屈: 'tone-sad', 失眠: 'tone-sleepless', 恋爱: 'tone-love', 工作: 'tone-work' } as Record<string, string>)[emotion ?? ''] ?? 'tone-default'; }
function isWithinDateRange(value?: string) {
  const timestamp = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(timestamp)) return !dateStart.value && !dateEnd.value;
  const afterStart = !dateStart.value || timestamp >= new Date(`${dateStart.value}T00:00:00`).getTime();
  const beforeEnd = !dateEnd.value || timestamp <= new Date(`${dateEnd.value}T23:59:59.999`).getTime();
  return afterStart && beforeEnd;
}

async function load() {
  busy.value = true;
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize) });
    if (search.value.trim()) params.set('q', search.value.trim());
    if (filter.value !== 'all') params.set('reviewStatus', filter.value);
    if (emotionFilter.value !== 'all') params.set('emotion', emotionFilter.value);
    if (visibilityFilter.value !== 'all') params.set('visibility', visibilityFilter.value);
    const [posts, userResponse] = await Promise.all([
      adminApi.get<any>(`/api/admin/v1/posts?${params}`),
      adminApi.get<any>('/api/admin/v1/users?page=1&pageSize=100'),
    ]);
    items.value = posts.items ?? [];
    users.value = userResponse.items ?? [];
    total.value = posts.total ?? items.value.length;
    totalPages.value = Math.max(1, Number(posts.totalPages ?? Math.ceil(total.value / pageSize) ?? 1));
    selectedIds.value = selectedIds.value.filter((id) => items.value.some((item) => item.id === id));
    if (!items.value.some((item) => item.id === selectedId.value)) {
      selectedId.value = '';
      detailOpen.value = false;
    }
    status.value = `已加载 ${total.value} 条树洞内容`;
  } catch (error: any) {
    status.value = error?.message ?? '树洞内容加载失败';
  } finally { busy.value = false; }
}

function openDetail(post: any) { selectedId.value = post.id; detailOpen.value = true; }

function toggleSelection(id: string, checked: boolean) {
  selectedIds.value = checked
    ? [...new Set([...selectedIds.value, id])]
    : selectedIds.value.filter((selected) => selected !== id);
}

function toggleAll(checked: boolean) {
  selectedIds.value = checked ? visibleItems.value.map((item) => item.id) : [];
}

async function mutate(message: string, request: () => Promise<unknown>) {
  if (!selected.value) return;
  busy.value = true;
  try { await request(); await load(); status.value = message; }
  catch (error: any) { status.value = error?.message ?? '操作失败，请稍后重试'; }
  finally { busy.value = false; }
}

function review(action: 'approve' | 'reject' | 'hide' | 'risk') {
  if (!selected.value) return;
  const label = ({ approve: '审核通过', reject: '拒绝发布', hide: '隐藏内容', risk: '标记为风险内容' } as Record<string, string>)[action];
  const run = () => mutate(`树洞已${label}`, () => adminApi.patch(`/api/admin/v1/posts/${selected.value?.id}/review`, { action }));
  if (action === 'reject' || action === 'hide') {
    confirmation.value = { title: `确认${label}？`, message: '这会立即影响该内容在前台的可见性，确认后可在后台继续恢复或复核。', run };
  } else { void run(); }
}

async function restore() { await mutate('树洞已恢复公开', () => adminApi.patch(`/api/admin/v1/posts/${selected.value?.id}/review`, { status: 'published' })); }
async function regenerate() { await mutate('已创建新的 AI 回应任务', () => adminApi.post(`/api/admin/v1/posts/${selected.value?.id}/regenerate-replies`)); }

function hidePost(post: any) {
  openDetail(post);
  review('hide');
}

function restorePost(post: any) {
  openDetail(post);
  void restore();
}

function hideSelected() {
  const ids = [...selectedIds.value];
  if (!ids.length) {
    status.value = '请先勾选需要隐藏的内容';
    return;
  }
  confirmation.value = {
    title: `确认隐藏 ${ids.length} 条内容？`,
    message: '这些内容将立即从前台公开列表中移除。你仍可在详情中恢复公开状态。',
    run: async () => {
      busy.value = true;
      try {
        await Promise.all(ids.map((id) => adminApi.patch(`/api/admin/v1/posts/${id}/review`, { action: 'hide' })));
        selectedIds.value = [];
        await load();
        status.value = `已隐藏 ${ids.length} 条内容`;
      } catch (error: any) {
        status.value = error?.message ?? '批量隐藏失败，请稍后重试';
        throw error;
      } finally { busy.value = false; }
    },
  };
}

function changePage(nextPage: number) {
  const bounded = Math.max(1, Math.min(totalPages.value, nextPage));
  if (bounded === page.value || busy.value) return;
  page.value = bounded;
  void load();
}

watch([search, filter, emotionFilter, visibilityFilter], () => {
  page.value = 1;
  void load();
});
watch([dateStart, dateEnd], () => {
  const visible = new Set(visibleItems.value.map((item) => item.id));
  selectedIds.value = selectedIds.value.filter((id) => visible.has(id));
  if (selectedId.value && !visible.has(selectedId.value)) {
    selectedId.value = '';
    detailOpen.value = false;
  }
});
watch(() => route.query.q, (query) => {
  const next = typeof query === 'string' ? query : '';
  if (search.value !== next) search.value = next;
});
onMounted(load);
</script>

<template>
  <Layout>
    <section class="operation-page posts-page">
      <header class="page-intro">
        <div><h1>树洞内容</h1><p>审核公开内容、识别风险，并通过详情查看正文、图片与真实互动数据。</p></div>
        <button type="button" class="primary" @click="filter = 'pending_review'">优先处理待审核</button>
      </header>
      <section class="ops-metrics" aria-label="树洞统计">
        <article><span>内容总数</span><strong>{{ total }}</strong></article>
        <article><span>当前筛选待审核</span><strong>{{ pendingCount }}</strong></article>
        <article><span>当前筛选公开内容</span><strong>{{ publicCount }}</strong></article>
      </section>

      <section class="posts-workspace" :class="{ 'has-detail': detailOpen && selected }">
        <div class="posts-list-area">
          <section class="panel ops-filters" aria-label="树洞内容筛选">
            <label class="filter-field filter-emotion"><span>情绪分类</span><select v-model="emotionFilter"><option value="all">全部</option><option v-for="emotion in emotionOptions" :key="emotion" :value="emotion">{{ emotion }}</option></select></label>
            <label class="filter-field filter-review"><span>内容状态</span><select v-model="filter"><option value="all">全部</option><option value="pending_review">待审核</option><option value="published">已发布</option><option value="hidden">已隐藏</option><option value="rejected">已拒绝</option></select></label>
            <label class="filter-field filter-visibility"><span>可见范围</span><select v-model="visibilityFilter"><option value="all">全部</option><option value="PUBLIC">公开</option><option value="PRIVATE">仅自己可见</option></select></label>
            <fieldset class="filter-field filter-date"><legend>时间范围</legend><div><input v-model="dateStart" type="date" aria-label="开始日期" /><span>至</span><input v-model="dateEnd" type="date" aria-label="结束日期" /></div></fieldset>
            <label class="filter-field filter-search"><span>搜索内容</span><input data-testid="admin-post-search" v-model="search" placeholder="内容、树洞 ID 或用户" /></label>
            <div class="filter-actions"><button type="button" @click="load">刷新列表</button><button type="button" class="batch-hide" :disabled="!selectedCount || busy" @click="hideSelected">批量隐藏<span v-if="selectedCount">（{{ selectedCount }}）</span></button></div>
            <p class="muted filter-status" role="status">{{ status }}</p>
          </section>

          <section class="panel table-panel ops-table-panel">
            <table class="table resource-table ops-table" :aria-busy="busy">
              <thead><tr><th class="select-column"><input type="checkbox" :checked="allVisibleSelected" aria-label="全选当前筛选内容" @change="toggleAll(($event.target as HTMLInputElement).checked)" /></th><th>发布时间</th><th>情绪</th><th>内容摘要</th><th>可见范围</th><th>回应数</th><th>抱抱数</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                <tr v-for="(post, index) in visibleItems" :key="post.id" :data-visual-id="post.id" :data-testid="index === 0 ? 'posts-row-first' : `posts-row-${index}`" :class="{ active: selectedId === post.id }" @click="openDetail(post)">
                  <td class="select-column" @click.stop><input type="checkbox" :checked="selectedIds.includes(post.id)" :aria-label="`选择 ${clip(post.content ?? '', 24)}`" @change="toggleSelection(post.id, ($event.target as HTMLInputElement).checked)" /></td>
                  <td class="created-cell"><span :data-visual-mask="index === 0 ? 'time' : undefined">{{ formatTime(post.createdAt) }}</span></td>
                  <td><span class="emotion-token" :class="emotionTone(post.emotion)"><i></i>{{ text(post.emotion) }}</span></td>
                  <td class="content-cell"><strong :data-visual-mask="index === 0 ? 'userText' : undefined">{{ clip(post.content ?? '') }}</strong></td>
                  <td>{{ post.visibility === 'PUBLIC' ? '公开' : '仅自己可见' }}</td>
                  <td class="number-cell"><span :data-visual-mask="index === 0 ? 'stat' : undefined">{{ post.replyCount ?? 0 }}</span></td>
                  <td class="number-cell"><span :data-visual-mask="index === 0 ? 'stat' : undefined">{{ post.hugCount ?? 0 }}</span></td>
                  <td><span class="status-badge">{{ reviewLabel(post.reviewStatus) }}</span></td>
                  <td class="row-actions"><button type="button" class="text-action" @click.stop="openDetail(post)">查看</button><button v-if="post.reviewStatus === 'hidden'" type="button" class="text-action" :disabled="busy" @click.stop="restorePost(post)">恢复</button><button v-else type="button" class="text-action" :disabled="busy" @click.stop="hidePost(post)">隐藏</button></td>
                </tr>
                <tr v-if="!visibleItems.length"><td colspan="9" class="empty-cell">暂无符合条件的树洞内容</td></tr>
              </tbody>
            </table>
            <nav class="table-pagination" aria-label="树洞内容分页">
              <span>共 {{ total }} 条</span>
              <div>
                <button type="button" :disabled="page <= 1 || busy" @click="changePage(page - 1)">上一页</button>
                <strong>{{ page }} / {{ totalPages }}</strong>
                <button type="button" :disabled="page >= totalPages || busy" @click="changePage(page + 1)">下一页</button>
              </div>
            </nav>
          </section>
        </div>

        <div v-if="detailOpen && selected" class="detail-drawer-mask" @click.self="detailOpen = false">
          <aside class="detail-drawer" role="dialog" aria-modal="true" aria-label="树洞详情" data-testid="admin-detail-drawer">
            <header class="detail-drawer-header"><div><span>内容详情</span><h2>{{ reviewLabel(selected.reviewStatus) }}</h2></div><button type="button" class="detail-close" data-testid="admin-detail-close" aria-label="关闭详情" @click="detailOpen = false">×</button></header>
            <div class="detail-drawer-body">
              <section class="detail-group"><h3>正文与发布信息</h3><p class="long-copy">{{ selected.content }}</p><dl><dt>发布用户</dt><dd data-visual-mask="userText">{{ userLabel(selected.userId) }}</dd><dt>情绪</dt><dd>{{ text(selected.emotion) }}</dd><dt>可见范围</dt><dd>{{ selected.visibility === 'PUBLIC' ? '匿名公开' : '仅自己可见' }}</dd><dt>审核状态</dt><dd>{{ reviewLabel(selected.reviewStatus) }}</dd><dt>发布时间</dt><dd data-visual-mask="time">{{ formatTime(selected.createdAt) }}</dd></dl></section>
              <section v-if="selected.attachments?.length" class="detail-group" data-testid="admin-post-media"><h3>图片附件</h3><div class="post-media-grid"><a v-for="asset in selected.attachments" :key="asset.id" :href="mediaUrl(asset.url)" target="_blank" rel="noopener"><img :src="mediaUrl(asset.url)" :alt="`树洞图片 ${asset.id}`" /></a></div></section>
              <section class="detail-group"><h3>互动与审核操作</h3><dl><dt>回应</dt><dd>{{ selected.replyCount ?? 0 }}</dd><dt>抱抱</dt><dd>{{ selected.hugCount ?? 0 }}</dd><dt>收藏</dt><dd>{{ selected.favoriteCount ?? 0 }}</dd><dt>举报</dt><dd>{{ selected.reportCount ?? 0 }}</dd></dl><div class="drawer-actions"><button class="primary" type="button" data-testid="admin-post-approve" :disabled="busy" @click="review('approve')">审核通过</button><button class="danger" type="button" data-testid="admin-post-reject" :disabled="busy" @click="review('reject')">拒绝</button><details><summary data-testid="admin-post-more">更多操作</summary><button type="button" data-testid="admin-post-hide" :disabled="busy" @click="review('hide')">隐藏</button><button type="button" data-testid="admin-post-restore" :disabled="busy" @click="restore">恢复公开</button><button type="button" data-testid="admin-post-risk" :disabled="busy" @click="review('risk')">标记风险</button><button type="button" data-testid="admin-post-ai-reply" :disabled="busy" @click="regenerate">重新生成 AI 回应</button></details></div></section>
            </div>
          </aside>
        </div>
      </section>

      <div v-if="confirmation" class="confirmation-overlay" @click.self="confirmation = null"><section class="confirmation-dialog" role="alertdialog" aria-modal="true" :aria-label="confirmation.title"><h2>{{ confirmation.title }}</h2><p>{{ confirmation.message }}</p><div><button type="button" @click="confirmation = null">取消</button><button type="button" class="danger" data-testid="admin-confirm-action" @click="confirmation.run().then(() => confirmation = null)">确认操作</button></div></section></div>
    </section>
  </Layout>
</template>

<style scoped>
.posts-page { gap: 14px; }
.posts-page .page-intro { align-items: center; min-height: 52px; }
.posts-page .page-intro h1 { font-size: 24px; line-height: 1.2; }
.posts-page .page-intro p { margin-top: 5px; font-size: 14px; line-height: 1.48; }
.posts-page .page-intro .primary { flex: 0 0 auto; }
.posts-page .ops-metrics { gap: 12px; }
.posts-page .ops-metrics article { min-height: 76px; padding: 12px 17px; gap: 5px; }
.posts-page .ops-metrics span { font-size: 13px; }
.posts-page .ops-metrics strong { font-size: 27px; }

.posts-workspace,
.posts-list-area {
  display: grid;
  min-width: 0;
  gap: 20px;
}

.posts-page .ops-filters {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, .85fr)) minmax(186px, 1.55fr);
  grid-template-rows: auto auto;
  gap: 12px 14px;
  align-items: end;
  min-height: 164px;
  padding: 16px;
}

.posts-page .ops-filters .filter-field {
  display: grid;
  min-width: 0;
  gap: 5px;
  margin: 0;
  color: #6e786e;
  font-size: 13px;
  grid-column: auto;
  grid-row: auto;
}

.posts-page .ops-filters .filter-field > select,
.posts-page .ops-filters .filter-field > input {
  width: 100%;
  min-width: 0;
}

.posts-page .filter-date { min-inline-size: 0; padding: 0; border: 0; }
.posts-page .filter-date legend { padding: 0; }
.posts-page .filter-date > div { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 5px; align-items: center; }
.posts-page .filter-date span { color: #9a9f98; font-size: 12px; }
.posts-page .filter-date input { width: 100%; min-width: 0; padding-inline: 6px; font-size: 12px; }
.posts-page .filter-emotion { grid-column: 1; grid-row: 1; }
.posts-page .filter-review { grid-column: 2; grid-row: 1; }
.posts-page .filter-visibility { grid-column: 3; grid-row: 1; }
.posts-page .filter-date { grid-column: 4; grid-row: 1; }
.posts-page .filter-search { grid-column: 1 / span 2; grid-row: 2; }
.posts-page .filter-actions { display: flex; grid-column: 3 / -1; grid-row: 2; gap: 10px; align-items: end; justify-content: flex-end; }
.posts-page .filter-actions button { min-width: 96px; }
.posts-page .filter-actions .batch-hide { border-color: #f0d6b8; color: #a86a21; background: #fff8ed; }
.posts-page .filter-actions .batch-hide:disabled { cursor: not-allowed; opacity: .55; }
.posts-page .filter-status { grid-column: 1 / -1; margin: -5px 0 0; font-size: 12px; }

.posts-page .ops-table-panel { min-width: 0; overflow: auto; }
.posts-page .ops-table { min-width: 700px; table-layout: fixed; }
.posts-page .ops-table th,
.posts-page .ops-table td { padding: 10px 8px; color: #4b514b; font-size: 13px; line-height: 1.36; vertical-align: middle; }
.posts-page .ops-table th { white-space: nowrap; }
.posts-page .ops-table th:nth-child(1) { width: 34px; }
.posts-page .ops-table th:nth-child(2) { width: 112px; }
.posts-page .ops-table th:nth-child(3) { width: 58px; }
.posts-page .ops-table th:nth-child(4) { width: auto; }
.posts-page .ops-table th:nth-child(5) { width: 74px; }
.posts-page .ops-table th:nth-child(6),
.posts-page .ops-table th:nth-child(7) { width: 52px; }
.posts-page .ops-table th:nth-child(8) { width: 72px; }
.posts-page .ops-table th:nth-child(9) { width: 76px; }
.posts-page .table-pagination { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; color: #74796f; font-size: 13px; }
.posts-page .table-pagination > div { display: flex; align-items: center; gap: 8px; }
.posts-page .table-pagination button { min-height: 30px; padding: 4px 10px; font-size: 12px; }
.posts-page .table-pagination button:disabled { cursor: not-allowed; opacity: .48; }
.posts-page .table-pagination strong { color: #586e4a; font-size: 12px; }
.posts-page .select-column { width: 34px; padding-right: 2px !important; padding-left: 10px !important; }
.posts-page .select-column input { display: block; width: 16px; height: 16px; min-height: 16px; margin: 0; accent-color: #63895b; }
.posts-page .ops-table td strong { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; color: #3b493e; line-height: 1.42; }
.posts-page .created-cell,
.posts-page .number-cell { white-space: nowrap; }
.posts-page .number-cell { color: #4f5e52; text-align: center; }
.posts-page .emotion-token { display: inline-flex; gap: 6px; align-items: center; white-space: nowrap; }
.posts-page .emotion-token i { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%; background: #a4b0a0; }
.posts-page .emotion-token.tone-anxious i { background: #7da171; }
.posts-page .emotion-token.tone-sad i { background: #a6bc79; }
.posts-page .emotion-token.tone-sleepless i { background: #958fb6; }
.posts-page .emotion-token.tone-love i { background: #d7998f; }
.posts-page .emotion-token.tone-work i { background: #e5b86d; }
.posts-page .row-actions { display: flex; min-width: 0; gap: 8px; flex-wrap: nowrap; }
.posts-page .row-actions .text-action { min-height: 0; padding: 2px 0; color: #557b47; font-size: 12px; white-space: nowrap; }
.posts-page .row-actions .text-action:last-child { color: #a86a21; }
.posts-page .row-actions .text-action:disabled { opacity: .5; }
.posts-page .status-badge { min-height: 24px; padding: 2px 7px; font-size: 12px; }
.posts-page .ops-table td:nth-child(5) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.posts-page .detail-drawer-mask { z-index: 40; }
.posts-page .confirmation-overlay { position: fixed; z-index: 60; inset: 0; display: grid; place-items: center; padding: 16px; background: rgba(43, 49, 42, .28); }
.posts-page .confirmation-dialog { width: min(440px, 100%); border-radius: 14px; }
.posts-page .confirmation-dialog > div { display: flex; justify-content: flex-end; gap: 8px; }

@media (min-width: 1240px) {
  .posts-page .page-intro,
  .posts-page .ops-metrics { display: none; }
  .posts-page .posts-workspace.has-detail { grid-template-columns: minmax(0, 1fr) 328px; gap: 24px; align-items: start; }
  .posts-page .posts-workspace.has-detail .detail-drawer-mask { position: sticky; z-index: 1; inset: auto; top: 0; display: block; width: auto; height: auto; min-height: 0; max-height: calc(100vh - 138px); overflow: hidden; background: transparent; }
  .posts-page .posts-workspace.has-detail .detail-drawer { width: 100%; min-height: calc(100vh - 138px); max-height: calc(100vh - 138px); border: 1px solid #e9e6dc; border-radius: 14px; background: #fffefa; box-shadow: 0 10px 28px rgba(65, 59, 46, .06); }
  .posts-page .posts-workspace.has-detail .detail-drawer-header { align-items: center; min-height: 62px; padding: 15px 18px; }
  .posts-page .posts-workspace.has-detail .detail-drawer-header h2 { display: none; }
  .posts-page .posts-workspace.has-detail .detail-drawer-header span { color: #343330; font-size: 18px; font-weight: 700; }
  .posts-page .posts-workspace.has-detail .detail-drawer-body { padding: 9px 18px 22px; }
  .posts-page .posts-workspace.has-detail .detail-drawer .detail-group { padding: 14px 0; }
  .posts-page .ops-filters { min-height: 164px; }
  .posts-page .filter-status { display: none; }
}

@media (max-width: 1239px) {
  .posts-page .ops-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .posts-page .filter-emotion,
  .posts-page .filter-review,
  .posts-page .filter-visibility,
  .posts-page .filter-date,
  .posts-page .filter-search,
  .posts-page .filter-actions { grid-column: auto; grid-row: auto; }
  .posts-page .filter-actions { justify-content: flex-start; }
}

@media (max-width: 760px) {
  .posts-page .ops-filters { grid-template-columns: minmax(0, 1fr); }
  .posts-page .filter-search,
  .posts-page .filter-actions { grid-column: span 1; }
  .posts-page .filter-actions { flex-wrap: wrap; }
}

/* The supplied desktop reference keeps the selected post in a compact,
   in-flow review column while the actual table retains its full review
   fields.  These dimensions also leave the two-column search control intact
   instead of collapsing it when a real record is selected. */
@media (min-width: 1240px) {
  .posts-page .posts-workspace.has-detail { grid-template-columns: minmax(0, 1fr) 326px; }
  .posts-page .posts-workspace.has-detail .detail-drawer-mask,
  .posts-page .posts-workspace.has-detail .detail-drawer {
    min-height: calc(100vh - 162px);
    max-height: calc(100vh - 162px);
  }

  .posts-page .posts-workspace.has-detail .ops-filters {
    grid-template-columns: 151px 137px 137px 287px;
    column-gap: 18px;
    row-gap: 12px;
    justify-content: start;
  }
  .posts-page .posts-workspace.has-detail .filter-emotion { grid-column: 1; grid-row: 1; }
  .posts-page .posts-workspace.has-detail .filter-review { grid-column: 2; grid-row: 1; }
  .posts-page .posts-workspace.has-detail .filter-visibility { grid-column: 3; grid-row: 1; }
  .posts-page .posts-workspace.has-detail .filter-date { grid-column: 4; grid-row: 1; }
  .posts-page .posts-workspace.has-detail .filter-search { grid-column: 1 / span 2; grid-row: 2; }
  .posts-page .posts-workspace.has-detail .filter-actions { grid-column: 3 / -1; grid-row: 2; }

  .posts-page .posts-workspace.has-detail .ops-table th { padding-block: 12px; }
  .posts-page .posts-workspace.has-detail .ops-table tbody tr { height: 74px; }
}
</style>
