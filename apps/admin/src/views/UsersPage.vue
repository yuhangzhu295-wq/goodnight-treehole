<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Layout from './Layout.vue';
import { adminApi } from '../api';

const items = ref<any[]>([]);
const total = ref(0);
const search = ref('');
const filter = ref('all');
const selectedId = ref('');
const detailOpen = ref(false);
const note = ref('');
const status = ref('正在读取用户数据…');
const busy = ref(false);
const confirmation = ref<{ title: string; message: string; run: () => Promise<void> } | null>(null);
const postCountByUser = ref<Record<string, number>>({});
const replyCountByUser = ref<Record<string, number>>({});
const isWideWorkspace = ref(false);
let workspaceMedia: MediaQueryList | undefined;

function syncWideWorkspace() {
  isWideWorkspace.value = Boolean(workspaceMedia?.matches);
}

const selected = computed(() => items.value.find((item) => item.id === selectedId.value));
const normalCount = computed(() => items.value.filter((item) => item.status === 'normal').length);
const restrictedCount = computed(() => items.value.filter((item) => ['limited', 'banned'].includes(item.status)).length);
const bannedCount = computed(() => items.value.filter((item) => item.status === 'banned').length);

function text(value: unknown, fallback = '-') {
  return value == null || value === '' ? fallback : String(value);
}

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-';
}

function statusLabel(value?: string) {
  return ({ normal: '正常', limited: '禁言', banned: '封禁' } as Record<string, string>)[value ?? ''] ?? text(value);
}

async function load() {
  busy.value = true;
  try {
    const params = new URLSearchParams({ page: '1', pageSize: '100' });
    if (search.value.trim()) params.set('q', search.value.trim());
    if (filter.value !== 'all') params.set('status', filter.value);
    const [users, posts, replies] = await Promise.all([
      adminApi.get<any>(`/api/admin/v1/users?${params}`),
      adminApi.get<any>('/api/admin/v1/posts?page=1&pageSize=100'),
      adminApi.get<any>('/api/admin/v1/replies?page=1&pageSize=100'),
    ]);
    postCountByUser.value = (posts.items ?? []).reduce((counts: Record<string, number>, item: any) => ({ ...counts, [item.userId]: (counts[item.userId] ?? 0) + 1 }), {});
    replyCountByUser.value = (replies.items ?? []).reduce((counts: Record<string, number>, item: any) => ({ ...counts, [item.userId]: (counts[item.userId] ?? 0) + 1 }), {});
    items.value = users.items ?? [];
    total.value = users.total ?? items.value.length;
    if (!items.value.some((item) => item.id === selectedId.value)) selectedId.value = '';
    status.value = `已加载 ${total.value} 位用户`;
  } catch (error: any) {
    status.value = error?.message ?? '用户数据加载失败';
  } finally {
    busy.value = false;
  }
}

function openDetail(user: any) {
  selectedId.value = user.id;
  note.value = user.note ?? '';
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

function requestStatus(nextStatus: 'normal' | 'limited' | 'banned') {
  if (!selected.value) return;
  const label = statusLabel(nextStatus);
  const direct = () => mutate(`用户已${label}`, () => adminApi.patch(`/api/admin/v1/users/${selected.value?.id}/status`, { status: nextStatus }));
  if (nextStatus === 'banned') {
    confirmation.value = { title: '确认封禁用户？', message: '封禁后该用户将无法在前台发布内容或回应，直到管理员恢复。', run: direct };
    return;
  }
  void direct();
}

async function saveNote() {
  await mutate('用户备注已保存', () => adminApi.post(`/api/admin/v1/users/${selected.value?.id}/note`, { note: note.value, tags: ['运营关注'] }));
}

async function exportUsers() {
  busy.value = true;
  try {
    const response = await adminApi.get<any>('/api/admin/v1/users/export');
    status.value = response.item?.downloadUrl ? `导出文件已生成：${response.item.downloadUrl}` : '导出文件已生成';
  } catch (error: any) {
    status.value = error?.message ?? '导出失败，请稍后重试';
  } finally {
    busy.value = false;
  }
}

watch([search, filter], () => { void load(); });
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
    <section class="operation-page users-page">
      <h1 class="visually-hidden">用户管理</h1>
      <section class="panel ops-filters users-filters">
        <label><span>搜索用户</span><input data-testid="admin-user-search" v-model="search" aria-label="搜索用户" placeholder="昵称、匿名代号或用户 ID" /></label>
        <label><span>用户状态</span><select data-testid="admin-user-status-filter" v-model="filter"><option value="all">全部状态</option><option value="normal">正常</option><option value="limited">禁言</option><option value="banned">封禁</option></select></label>
        <button type="button" data-testid="admin-user-refresh" @click="load">刷新列表</button>
        <button type="button" data-testid="admin-user-export" @click="exportUsers">导出用户</button>
        <p class="muted users-status" role="status">{{ status }}</p>
      </section>

      <section class="ops-metrics users-metrics" aria-label="用户统计">
        <article><span>用户总数</span><strong data-visual-mask="stat">{{ total }}</strong></article>
        <article><span>当前页正常</span><strong data-visual-mask="stat">{{ normalCount }}</strong></article>
        <article><span>当前页受限</span><strong data-visual-mask="stat">{{ restrictedCount }}</strong></article>
        <article><span>当前页封禁</span><strong data-visual-mask="stat">{{ bannedCount }}</strong></article>
      </section>

      <div class="users-workspace" :class="{ 'has-detail': detailOpen && selected }">
        <section class="panel table-panel ops-table-panel">
          <table class="table resource-table ops-table" :aria-busy="busy">
            <thead><tr><th>用户</th><th>内容与回应</th><th>状态</th><th>注册时间</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="(user, index) in items" :key="user.id" :data-visual-id="user.id" :data-testid="index === 0 ? 'users-row-first' : `users-row-${index}`" tabindex="0" @click="openDetail(user)" @keydown.enter.prevent="openDetail(user)" @keydown.space.prevent="openDetail(user)">
                <td><strong>{{ user.nickname }}</strong><small>{{ user.anonymousCode }}</small><small>{{ user.id }}</small></td>
                <td><span>{{ postCountByUser[user.id] ?? 0 }} 条树洞 · {{ replyCountByUser[user.id] ?? 0 }} 条回应</span></td>
                <td><span class="status-badge">{{ statusLabel(user.status) }}</span></td>
                <td><span>{{ formatTime(user.createdAt) }}</span></td>
                <td><button type="button" class="text-action" @click="openDetail(user)">查看详情</button></td>
              </tr>
              <tr v-if="!items.length"><td colspan="5" class="empty-cell">暂无符合条件的用户</td></tr>
            </tbody>
          </table>
        </section>

        <div v-if="detailOpen && selected" class="detail-drawer-mask" @click.self="!isWideWorkspace && (detailOpen = false)">
          <aside class="detail-drawer" :role="isWideWorkspace ? undefined : 'dialog'" :aria-modal="isWideWorkspace ? undefined : 'true'" aria-label="用户详情" data-testid="admin-detail-drawer">
            <header class="detail-drawer-header"><div><span>用户详情</span><h2>{{ selected.nickname }}</h2></div><button type="button" class="detail-close" data-testid="admin-detail-close" aria-label="关闭详情" @click="detailOpen = false">×</button></header>
            <div class="detail-drawer-body">
              <section class="detail-group"><h3>基本信息</h3><dl><dt>匿名代号</dt><dd data-visual-mask="userText">{{ text(selected.anonymousCode) }}</dd><dt>用户 ID</dt><dd data-visual-mask="userText">{{ text(selected.id) }}</dd><dt>当前状态</dt><dd>{{ statusLabel(selected.status) }}</dd><dt>注册时间</dt><dd data-visual-mask="time">{{ formatTime(selected.createdAt) }}</dd><dt>树洞数量</dt><dd data-visual-mask="stat">{{ postCountByUser[selected.id] ?? 0 }}</dd><dt>回应数量</dt><dd data-visual-mask="stat">{{ replyCountByUser[selected.id] ?? 0 }}</dd></dl></section>
              <section class="detail-group"><h3>运营备注</h3><textarea v-model="note" rows="4" placeholder="仅供管理员内部协作使用"></textarea><div class="drawer-actions"><button class="primary" type="button" data-testid="admin-user-note" :disabled="busy" @click="saveNote">保存备注</button><button class="danger" type="button" data-testid="admin-user-ban" :disabled="busy" @click="requestStatus('banned')">封禁用户</button><details><summary data-testid="admin-user-more">更多操作</summary><button type="button" data-testid="admin-user-mute" :disabled="busy" @click="requestStatus('limited')">禁言</button><button type="button" data-testid="admin-user-restore" :disabled="busy" @click="requestStatus('normal')">恢复正常</button></details></div></section>
              <section v-if="confirmation" class="confirm-panel"><h3>{{ confirmation.title }}</h3><p>{{ confirmation.message }}</p><div><button type="button" @click="confirmation = null">取消</button><button type="button" class="danger" data-testid="admin-confirm-action" @click="confirmation.run().then(() => confirmation = null)">确认封禁</button></div></section>
            </div>
          </aside>
        </div>
      </div>
    </section>
  </Layout>
</template>

<style scoped>
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.users-page {
  gap: 22px;
}

.users-filters {
  align-items: center;
  min-height: 48px;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.users-filters label {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.users-filters label:first-child > span {
  display: none;
}

.users-filters label:first-child {
  flex: 0 0 256px;
  width: 256px;
}

.users-filters label:nth-child(2) {
  flex: 0 0 222px;
  width: 222px;
}

.users-filters input {
  width: 100%;
}

.users-filters label:nth-child(2) > span {
  flex: 0 0 auto;
  white-space: nowrap;
}

.users-filters label:nth-child(2) select {
  width: 152px;
  flex: 0 0 152px;
}

.users-filters button {
  min-height: 36px;
}

.users-filters button[data-testid="admin-user-export"] {
  margin-left: auto;
}

.users-status {
  display: none;
}

.users-metrics {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 23px;
}

.users-metrics article {
  position: relative;
  min-height: 140px;
  padding: 21px;
  overflow: hidden;
  border-color: #e8e5dc;
  border-radius: 13px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(61, 67, 50, .035);
}

.users-metrics article::after {
  position: absolute;
  top: 24px;
  right: 22px;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: #eff4e8;
  content: '';
}

.users-metrics article:nth-child(3)::after {
  background: #fff2d9;
}

.users-metrics article:nth-child(4)::after {
  background: #f7ece9;
}

.users-metrics span,
.users-metrics strong {
  position: relative;
  z-index: 1;
}

.users-metrics span {
  color: #5b5850;
  font-size: 16px;
}

.users-metrics strong {
  margin-top: 13px;
  color: #3e3c37;
  font-size: 36px;
  line-height: 1;
}

.users-workspace {
  min-width: 0;
}

@media (min-width: 1400px) {
  .users-workspace.has-detail {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 346px;
    align-items: start;
    gap: 14px;
  }

  .users-workspace.has-detail .detail-drawer-mask {
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

  .users-workspace.has-detail .detail-drawer {
    width: 100%;
    min-height: 0;
    max-height: calc(100vh - 124px);
    border: 1px solid #e9e6dc;
    border-radius: 14px;
    background: #fffefa;
    box-shadow: 0 10px 28px rgba(65, 59, 46, .06);
  }

  .users-workspace.has-detail .detail-drawer-header {
    align-items: center;
    min-height: 62px;
    padding: 15px 18px;
  }

  .users-workspace.has-detail .detail-drawer-header h2 {
    display: none;
  }

  .users-workspace.has-detail .detail-drawer-header span {
    color: #343330;
    font-size: 18px;
    font-weight: 700;
  }

  .users-workspace.has-detail .detail-drawer-body {
    padding: 9px 18px 24px;
  }

  .users-workspace.has-detail .detail-drawer .detail-group {
    padding: 14px 0;
  }

  .users-workspace.has-detail .ops-table-panel {
    min-width: 0;
    overflow: hidden;
  }

  .users-workspace.has-detail .ops-table {
    width: 100%;
    min-width: 0;
    table-layout: fixed;
  }
}

@media (max-width: 880px) {
  .users-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .users-filters button[data-testid="admin-user-export"] {
    margin-left: 0;
  }
}
</style>
