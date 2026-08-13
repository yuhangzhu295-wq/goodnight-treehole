<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Layout from './Layout.vue';
import { adminApi } from '../api';

type ReplyTypeFilter = 'all' | 'USER' | 'AI';

const items = ref<any[]>([]);
const posts = ref<any[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 10;
const totalPages = ref(1);
const search = ref('');
const filter = ref('all');
const typeFilter = ref<ReplyTypeFilter>('all');
const selectedId = ref('');
const editContent = ref('');
const detailOpen = ref(false);
const status = ref('正在读取回应审核数据…');
const busy = ref(false);
const confirmation = ref<{ title: string; message: string; run: () => Promise<void> } | null>(null);
const isWideWorkspace = ref(false);
let workspaceMedia: MediaQueryList | undefined;

function syncWideWorkspace() {
  isWideWorkspace.value = Boolean(workspaceMedia?.matches);
}

const selected = computed(() => items.value.find((item) => item.id === selectedId.value));
const postMap = computed(() => Object.fromEntries(posts.value.map((post) => [post.id, post])) as Record<string, any>);
const pendingCount = computed(() => items.value.filter((item) => normalise(item.status) === 'pending_review').length);
const blockedCount = computed(() => items.value.filter((item) => normalise(item.status) === 'blocked').length);
const aiCount = computed(() => items.value.filter((item) => isAiReply(item)).length);
const humanCount = computed(() => items.value.filter((item) => !isAiReply(item)).length);

function normalise(value: unknown) { return String(value ?? '').trim().toLowerCase(); }
function clip(value: string, length = 60) { return value.length > length ? `${value.slice(0, length)}…` : value; }
function formatTime(value?: string) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'; }
function isAiReply(reply: { type?: unknown }) { return normalise(reply.type) === 'ai'; }
function statusLabel(value?: string) {
  return ({ pending_review: '待审核', published: '已通过', blocked: '已拦截' } as Record<string, string>)[normalise(value)] ?? '未知状态';
}
function statusClass(value?: string) { return `is-${normalise(value) || 'unknown'}`; }
function typeLabel(value?: string) { return normalise(value) === 'ai' ? 'AI 回应' : '真人回应'; }
function typeClass(value?: string) { return normalise(value) === 'ai' ? 'is-ai' : 'is-human'; }
function riskLabel(value?: string) {
  return ({ low: '低风险', medium: '中风险', high: '高风险' } as Record<string, string>)[normalise(value)] ?? '待评估';
}
function riskClass(value?: string) { return `is-${normalise(value) || 'unknown'}`; }
function styleLabel(value?: string) {
  return ({
    human: '真人陪伴',
    warm: '温柔陪伴',
    poetic: '诗意陪伴',
    clear: '清晰支持',
    light: '轻柔倾听',
    rational: '理性梳理',
    concise: '简洁回应',
    companion: '陪伴回应',
  } as Record<string, string>)[normalise(value)] ?? '自定义风格';
}
function sourcePost(reply: any) { return postMap.value[reply.postId]?.content || '来源树洞已不可用'; }
function sourceExcerpt(reply: any) { return clip(sourcePost(reply), 28); }

async function load() {
  busy.value = true;
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize) });
    if (search.value.trim()) params.set('q', search.value.trim());
    if (filter.value !== 'all') params.set('status', filter.value);
    if (typeFilter.value !== 'all') params.set('type', typeFilter.value);
    const [replies, postResponse] = await Promise.all([
      adminApi.get<any>(`/api/admin/v1/replies?${params}`),
      adminApi.get<any>('/api/admin/v1/posts?page=1&pageSize=100'),
    ]);
    items.value = replies.items ?? [];
    posts.value = postResponse.items ?? [];
    total.value = replies.total ?? items.value.length;
    totalPages.value = Math.max(1, Number(replies.totalPages ?? Math.ceil(total.value / pageSize)));
    if (!items.value.some((item) => item.id === selectedId.value)) {
      selectedId.value = '';
      detailOpen.value = false;
    }
    status.value = `已加载 ${total.value} 条回应`;
  } catch (error: any) {
    status.value = error?.message ?? '回应数据加载失败';
  } finally {
    busy.value = false;
  }
}

function setQueue(nextStatus: string, nextType: ReplyTypeFilter = 'all') {
  const unchanged = filter.value === nextStatus && typeFilter.value === nextType;
  filter.value = nextStatus;
  typeFilter.value = nextType;
  if (unchanged) void load();
}

function changePage(nextPage: number) {
  const bounded = Math.max(1, Math.min(totalPages.value, nextPage));
  if (bounded === page.value || busy.value) return;
  page.value = bounded;
  void load();
}

function openDetail(reply: any) {
  selectedId.value = reply.id;
  editContent.value = reply.content ?? '';
  detailOpen.value = true;
}

async function mutate(message: string, request: () => Promise<unknown>) {
  if (!selected.value) return;
  busy.value = true;
  try {
    await request();
    await load();
    status.value = message;
  } catch (error: any) {
    status.value = error?.message ?? '操作失败，请稍后重试';
  } finally {
    busy.value = false;
  }
}

function review(action: 'approve' | 'block') {
  if (!selected.value) return;
  const run = () => mutate(
    action === 'approve' ? '回应已通过' : '回应已拦截',
    () => adminApi.patch(`/api/admin/v1/replies/${selected.value?.id}/review`, {
      action,
      content: action === 'approve' ? editContent.value || undefined : undefined,
    }),
  );
  if (action === 'block') {
    confirmation.value = {
      title: '确认拦截这条回应？',
      message: '被拦截的回应将不再对前台用户可见。',
      run,
    };
  } else {
    void run();
  }
}

async function saveContent() {
  await mutate(
    '回应内容已保存',
    () => adminApi.patch(`/api/admin/v1/replies/${selected.value?.id}/content`, { content: editContent.value }),
  );
}

watch([search, filter, typeFilter], () => {
  page.value = 1;
  void load();
});
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
    <section class="operation-page replies-page">
      <header class="page-intro">
        <div>
          <h1>回应审核</h1>
          <p>审核 AI 与真人回应；通过后的内容才会在对应树洞中对用户可见。</p>
        </div>
        <button class="primary" type="button" @click="setQueue('pending_review')">处理待审核回应</button>
      </header>

      <div class="replies-workspace" :class="{ 'has-detail': detailOpen && selected }">
        <div class="replies-list-area">
          <section class="reply-queue" aria-label="回应队列筛选">
            <button type="button" :class="{ active: filter === 'all' && typeFilter === 'all' }" @click="setQueue('all')">
              <span>全部回应</span><strong>{{ total }}</strong>
            </button>
            <button type="button" :class="{ active: typeFilter === 'USER' }" @click="setQueue('all', 'USER')">
              <span>用户回应</span><strong>{{ humanCount }}</strong>
            </button>
            <button type="button" :class="{ active: typeFilter === 'AI' }" @click="setQueue('all', 'AI')">
              <span>AI 回应</span><strong>{{ aiCount }}</strong>
            </button>
            <button type="button" :class="{ active: filter === 'pending_review' }" @click="setQueue('pending_review')">
              <span>待审核</span><strong>{{ pendingCount }}</strong>
            </button>
            <button type="button" :class="{ active: filter === 'blocked' }" @click="setQueue('blocked')">
              <span>已拦截</span><strong>{{ blockedCount }}</strong>
            </button>
          </section>

          <section class="panel ops-filters">
            <label>
              <span>搜索回应</span>
              <input data-testid="admin-reply-search" v-model="search" aria-label="搜索回应" placeholder="搜索回应内容或来源树洞" />
            </label>
            <label>
              <span>审核状态</span>
              <select v-model="filter" aria-label="审核状态">
                <option value="all">全部审核状态</option>
                <option value="pending_review">待审核</option>
                <option value="published">已通过</option>
                <option value="blocked">已拦截</option>
              </select>
            </label>
            <button type="button" @click="load">刷新列表</button>
            <p class="visually-hidden" role="status">{{ status }}</p>
          </section>

          <section class="panel table-panel ops-table-panel">
            <table class="table resource-table ops-table" :aria-busy="busy">
              <thead>
                <tr>
                  <th scope="col">时间</th>
                  <th scope="col">来源树洞</th>
                  <th scope="col">回应类型</th>
                  <th scope="col">内容摘要</th>
                  <th scope="col">风险等级</th>
                  <th scope="col">状态</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(reply, index) in items"
                  :key="reply.id"
                  :class="{ 'is-selected': reply.id === selectedId }"
                  :data-visual-id="reply.id"
                  :data-testid="index === 0 ? 'replies-row-first' : `replies-row-${index}`"
                  :aria-selected="reply.id === selectedId"
                  @click="openDetail(reply)"
                >
                  <td class="time-cell"><span :data-visual-mask="index === 0 ? 'time' : undefined">{{ formatTime(reply.createdAt) }}</span></td>
                  <td><span class="source-copy" :title="sourcePost(reply)"><strong>{{ reply.postId }}</strong><small :data-visual-mask="index === 0 ? 'userText' : undefined">{{ sourceExcerpt(reply) }}</small></span></td>
                  <td><span class="type-badge" :class="typeClass(reply.type)">{{ typeLabel(reply.type) }}</span></td>
                  <td><span class="reply-summary" :data-visual-mask="index === 0 ? (isAiReply(reply) ? 'aiText' : 'userText') : undefined" :title="reply.content">{{ clip(reply.content ?? '', 48) }}</span></td>
                  <td><span class="risk-badge" :class="riskClass(reply.riskLevel)">{{ riskLabel(reply.riskLevel) }}</span></td>
                  <td><span class="status-badge" :class="statusClass(reply.status)">{{ statusLabel(reply.status) }}</span></td>
                  <td><button type="button" class="text-action" @click.stop="openDetail(reply)">查看</button></td>
                </tr>
                <tr v-if="!items.length">
                  <td colspan="7" class="empty-cell">暂无符合条件的回应</td>
                </tr>
              </tbody>
            </table>
            <nav class="table-pagination" aria-label="回应审核分页">
              <span>共 {{ total }} 条</span>
              <div>
                <button type="button" :disabled="page <= 1 || busy" @click="changePage(page - 1)">上一页</button>
                <strong>{{ page }} / {{ totalPages }}</strong>
                <button type="button" :disabled="page >= totalPages || busy" @click="changePage(page + 1)">下一页</button>
              </div>
            </nav>
          </section>
        </div>

        <div v-if="detailOpen && selected" class="detail-drawer-mask" @click.self="!isWideWorkspace && (detailOpen = false)">
          <aside class="detail-drawer" :role="isWideWorkspace ? undefined : 'dialog'" :aria-modal="isWideWorkspace ? undefined : 'true'" aria-label="回应详情" data-testid="admin-detail-drawer">
            <header class="detail-drawer-header">
              <div>
                <span>回应详情</span>
                <h2>{{ typeLabel(selected.type) }}</h2>
              </div>
              <button type="button" class="detail-close" data-testid="admin-detail-close" aria-label="关闭详情" @click="detailOpen = false">×</button>
            </header>
            <div class="detail-drawer-body">
              <section class="detail-group">
                <h3>来源树洞</h3>
                <p class="long-copy">{{ sourcePost(selected) }}</p>
              </section>
              <section class="detail-group">
                <h3>回应内容</h3>
                <textarea v-model="editContent" rows="7" aria-label="回应内容"></textarea>
                <dl class="reply-meta">
                  <dt>来源类型</dt><dd>{{ typeLabel(selected.type) }}</dd>
                  <dt>回应风格</dt><dd>{{ styleLabel(selected.style) }}</dd>
                  <dt>风险等级</dt><dd><span class="risk-badge" :class="riskClass(selected.riskLevel)">{{ riskLabel(selected.riskLevel) }}</span></dd>
                  <dt>当前状态</dt><dd><span class="status-badge" :class="statusClass(selected.status)">{{ statusLabel(selected.status) }}</span></dd>
                  <dt>提交时间</dt><dd data-visual-mask="time">{{ formatTime(selected.createdAt) }}</dd>
                </dl>
              </section>
              <section v-if="isAiReply(selected)" class="detail-group ai-origin">
                <h3>生成来源</h3>
                <p>该回应由 AI 服务生成。相关任务状态可在「AI 任务记录」中继续核查。</p>
              </section>
              <section class="detail-group">
                <h3>审核操作</h3>
                <div class="drawer-actions">
                  <button type="button" class="primary" data-testid="admin-reply-approve" :disabled="busy" @click="review('approve')">保存并通过</button>
                  <button type="button" data-testid="admin-reply-edit-approve" :disabled="busy" @click="saveContent">仅保存修改</button>
                  <button type="button" class="danger" data-testid="admin-reply-block" :disabled="busy" @click="review('block')">拦截回应</button>
                </div>
              </section>
              <section v-if="confirmation" class="confirm-panel">
                <h3>{{ confirmation.title }}</h3>
                <p>{{ confirmation.message }}</p>
                <div>
                  <button type="button" @click="confirmation = null">取消</button>
                  <button type="button" class="danger" data-testid="admin-confirm-action" @click="confirmation.run().then(() => confirmation = null)">确认拦截</button>
                </div>
              </section>
            </div>
          </aside>
        </div>
      </div>
    </section>
  </Layout>
</template>

<style scoped>
.replies-page {
  gap: 14px;
}

.replies-page .page-intro {
  align-items: center;
  min-height: 52px;
}

.replies-page .page-intro h1 {
  font-size: 24px;
  line-height: 1.2;
}

.replies-page .page-intro p {
  margin-top: 5px;
  font-size: 14px;
  line-height: 1.48;
}

.replies-page .page-intro .primary {
  flex: 0 0 auto;
}

.reply-queue {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.reply-queue button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  min-height: 56px;
  padding: 11px 15px;
  border-color: #edf0e9;
  border-radius: 11px;
  color: #596458;
  background: linear-gradient(135deg, #fff 0%, #fafbf8 100%);
  font-weight: 500;
  text-align: left;
}

.reply-queue button:hover,
.reply-queue button.active {
  border-color: #aabf9c;
  color: #4e7445;
  background: #f3f7ee;
}

.reply-queue span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reply-queue strong {
  flex: 0 0 auto;
  margin-left: 9px;
  color: inherit;
  font-size: 20px;
  line-height: 1;
}

.replies-page .ops-filters {
  gap: 10px;
  min-height: 58px;
  padding: 9px 14px;
}

.replies-page .ops-filters label {
  gap: 4px;
}

.replies-page .ops-table-panel {
  overflow: auto;
}

.replies-page .ops-table {
  min-width: 980px;
  table-layout: fixed;
}

.replies-page .ops-table th,
.replies-page .ops-table td {
  padding: 10px 12px;
  line-height: 1.4;
  vertical-align: middle;
}

.replies-page .ops-table th:nth-child(1) { width: 14%; }
.replies-page .ops-table th:nth-child(2) { width: 21%; }
.replies-page .ops-table th:nth-child(3) { width: 11%; }
.replies-page .ops-table th:nth-child(4) { width: 27%; }
.replies-page .ops-table th:nth-child(5) { width: 9%; }
.replies-page .ops-table th:nth-child(6) { width: 10%; }
.replies-page .ops-table th:nth-child(7) { width: 8%; }

.replies-page .ops-table tbody tr.is-selected {
  background: #f4f8ef;
}

.time-cell,
.source-copy,
.reply-summary {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time-cell {
  color: #687267;
  font-variant-numeric: tabular-nums;
}

.source-copy {
  color: #526154;
}

.reply-summary {
  color: #35463a;
  font-weight: 500;
}

.type-badge,
.risk-badge {
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}

.type-badge.is-ai {
  color: #597ca7;
  background: #edf4fb;
}

.type-badge.is-human {
  color: #607750;
  background: #f0f5eb;
}

.risk-badge.is-low {
  color: #5c7c54;
  background: #eef5eb;
}

.risk-badge.is-medium {
  color: #b17422;
  background: #fff4df;
}

.risk-badge.is-high {
  color: #bc5b50;
  background: #fdeeed;
}

.risk-badge.is-unknown {
  color: #737a72;
  background: #f1f3f0;
}

.status-badge.is-pending_review {
  color: #b17722;
  background: #fff3df;
}

.status-badge.is-published {
  color: #5c7c54;
  background: #eef5eb;
}

.status-badge.is-blocked {
  color: #bc5b50;
  background: #fdeeed;
}

.status-badge.is-unknown {
  color: #737a72;
  background: #f1f3f0;
}

.replies-page .text-action {
  min-width: auto;
  color: #58794e;
  font-weight: 600;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.replies-page .detail-drawer-mask {
  z-index: 30;
  background: rgba(43, 49, 42, .24);
  pointer-events: auto;
}

.replies-page .detail-drawer {
  width: min(440px, calc(100vw - 24px));
  min-height: 100%;
  border-left: 1px solid #dfe7d9;
  border-radius: 0;
  box-shadow: -20px 0 45px rgba(44, 55, 43, .18);
}

.replies-page .detail-drawer-header h2 {
  display: block;
}

.reply-meta {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 9px 12px;
  margin: 15px 0 0;
  font-size: 13px;
}

.reply-meta dt {
  color: #718077;
}

.reply-meta dd {
  min-width: 0;
  margin: 0;
  color: #334238;
}

.ai-origin p {
  margin: 0;
  color: #667266;
  font-size: 13px;
  line-height: 1.65;
}

@media (min-width: 1200px) {
  .replies-page .page-intro {
    display: none;
  }

  .reply-queue {
    grid-template-columns: repeat(5, minmax(0, 136px));
    gap: 12px;
  }

  .reply-queue button {
    min-height: 52px;
    padding: 10px 13px;
  }

  .reply-queue strong {
    font-size: 18px;
  }

  .replies-page .ops-filters {
    flex-wrap: nowrap;
    min-height: 48px;
    padding: 7px 12px;
  }

  .replies-page .ops-filters label {
    display: block;
    min-width: 0;
  }

  .replies-page .ops-filters label:first-child {
    flex: 0 1 285px;
  }

  .replies-page .ops-filters label:nth-child(2) {
    flex: 0 0 170px;
  }

  .replies-page .ops-filters label > span {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  .replies-page .ops-filters input,
  .replies-page .ops-filters select,
  .replies-page .ops-filters button {
    min-height: 36px;
  }

  .replies-page .ops-table th,
  .replies-page .ops-table td {
    padding-block: 11px;
  }

  /* The selected detail is a modal drawer, never a persistent desktop column:
   * the operational table keeps its full width and is not squeezed by detail. */
  .replies-page .detail-drawer-mask {
    position: fixed;
    z-index: 30;
    inset: 0;
    display: flex;
    width: auto;
    background: rgba(43, 49, 42, .24);
    pointer-events: auto;
  }

  .replies-page .detail-drawer {
    width: min(440px, calc(100vw - 32px));
    min-height: 100%;
    border: 0;
    border-left: 1px solid #dfe7d9;
    border-radius: 0;
    background: #fffefa;
    box-shadow: -20px 0 45px rgba(44, 55, 43, .18);
    pointer-events: auto;
  }

  .replies-page .detail-drawer-header {
    align-items: flex-start;
    min-height: auto;
    padding: 25px 24px 18px;
  }

  .replies-page .detail-drawer-header span {
    color: #87917f;
    font-size: 13px;
    font-weight: 400;
  }

  .replies-page .detail-drawer-header h2 {
    display: block;
    margin: 5px 0 0;
    color: #2f4135;
    font-size: 20px;
  }

  .replies-page .detail-drawer-body {
    padding: 8px 24px 30px;
  }

  .replies-page .detail-drawer .detail-group {
    padding: 16px 0;
  }

  .replies-page .detail-drawer textarea {
    min-height: 148px;
  }
}

@media (max-width: 1080px) {
  .reply-queue {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .reply-queue {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* The selected record is a real in-flow desktop work area, never a fixed
 * overlay that hides or squeezes the moderation table.  Below 1400px the
 * established modal remains available for compact operational viewports. */
@media (min-width: 1400px) {
  .reply-queue {
    grid-template-columns: 136px 126px 112px 108px 100px;
    gap: 16px;
  }

  .reply-queue button {
    min-height: 43px;
    padding: 7px 11px;
  }

  .replies-page .ops-filters {
    min-height: 46px;
    padding: 0;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }

  .replies-page .ops-filters input,
  .replies-page .ops-filters select,
  .replies-page .ops-filters button {
    min-height: 42px;
  }

  .replies-page .source-copy {
    display: grid;
    gap: 2px;
    overflow: visible;
    white-space: normal;
  }

  .replies-page .source-copy strong,
  .replies-page .source-copy small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .replies-page .source-copy strong {
    color: #4d5d4e;
    font-size: 12px;
    font-weight: 650;
  }

  .replies-page .source-copy small {
    color: #81887d;
    font-size: 11px;
  }

  .replies-workspace.has-detail {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 362px;
    align-items: start;
    gap: 26px;
  }

  .replies-workspace.has-detail .replies-list-area {
    display: grid;
    min-width: 0;
    gap: 14px;
  }

  .replies-workspace.has-detail .detail-drawer-mask {
    position: sticky;
    z-index: 1;
    inset: auto;
    top: 0;
    display: block;
    width: auto;
    height: auto;
    min-height: 0;
    max-height: calc(100vh - 124px);
    overflow: hidden;
    background: transparent;
    pointer-events: auto;
  }

  .replies-workspace.has-detail .detail-drawer {
    width: 100%;
    min-height: calc(100vh - 162px);
    max-height: calc(100vh - 124px);
    border: 1px solid #e9e6dc;
    border-radius: 14px;
    background: #fffefa;
    box-shadow: 0 10px 28px rgba(65, 59, 46, .06);
  }

  .replies-workspace.has-detail .detail-drawer-header {
    align-items: center;
    min-height: 62px;
    padding: 15px 18px;
  }

  .replies-workspace.has-detail .detail-drawer-header h2 {
    display: none;
  }

  .replies-workspace.has-detail .detail-drawer-header span {
    color: #343330;
    font-size: 18px;
    font-weight: 700;
  }

  .replies-workspace.has-detail .detail-drawer-body {
    padding: 9px 18px 24px;
  }

  .replies-workspace.has-detail .detail-drawer .detail-group {
    padding: 14px 0;
  }

  .replies-workspace.has-detail .detail-drawer textarea {
    min-height: 122px;
  }

  .replies-workspace.has-detail .ops-table-panel {
    min-width: 0;
    overflow: hidden;
  }

  .replies-workspace.has-detail .ops-table {
    width: 100%;
    min-width: 0;
    table-layout: fixed;
  }

  .replies-workspace.has-detail .ops-table th,
  .replies-workspace.has-detail .ops-table td {
    padding: 9px 8px;
  }
}

.replies-page .table-pagination { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; color: #74796f; font-size: 13px; }
.replies-page .table-pagination > div { display: flex; align-items: center; gap: 8px; }
.replies-page .table-pagination button { min-height: 30px; padding: 4px 10px; font-size: 12px; }
.replies-page .table-pagination button:disabled { cursor: not-allowed; opacity: .48; }
.replies-page .table-pagination strong { color: #586e4a; font-size: 12px; }

/* At the reference desktop width the selected response is an in-flow review
   surface.  Keep that real detail open, but give the moderation queue the
   same breathing room and row rhythm as the supplied workbench. */
@media (min-width: 1400px) {
  .replies-workspace.has-detail { grid-template-columns: minmax(0, 1fr) 369px; }
  .replies-workspace.has-detail .replies-list-area { padding-top: 10px; }
  .replies-workspace.has-detail .detail-drawer-mask,
  .replies-workspace.has-detail .detail-drawer {
    min-height: calc(100vh - 164px);
    max-height: calc(100vh - 164px);
  }
  .replies-workspace.has-detail .detail-drawer-mask { margin-top: 2px; }
  .replies-workspace.has-detail .ops-table-panel { margin-top: 8px; padding-bottom: 10px; }
  .replies-workspace.has-detail .ops-table th,
  .replies-workspace.has-detail .ops-table td { padding-block: 15px; }
}
</style>
