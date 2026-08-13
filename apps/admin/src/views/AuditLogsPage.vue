<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Layout from './Layout.vue';
import { adminApi } from '../api';

type AuditLog = { id: string; adminUserId: string; action: string; resourceType: string; resourceId: string; beforeJson: unknown; afterJson: unknown; createdAt: string };

const items = ref<AuditLog[]>([]);
const status = ref('正在读取审计日志…');
const selectedId = ref('');
const detailOpen = ref(false);
const selected = computed(() => items.value.find((item) => item.id === selectedId.value));

function time(value?: string) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'; }
function result(item: AuditLog) { return item.action.includes('DELETE') ? '已删除' : '成功'; }
function summary(item: AuditLog) {
  if (item.afterJson == null) return `已移除 ${item.resourceType}`;
  if (typeof item.afterJson !== 'object') return String(item.afterJson);
  const fields = Object.keys(item.afterJson as Record<string, unknown>).filter((key) => !['id', 'createdAt', 'updatedAt'].includes(key)).slice(0, 3);
  return fields.length ? `变更字段：${fields.join('、')}` : '已记录本次操作';
}
function pretty(value: unknown) { return value == null ? '无' : JSON.stringify(value, null, 2); }
function open(item: AuditLog) { selectedId.value = item.id; detailOpen.value = true; }
async function load() {
  try {
    const result = await adminApi.get<any>('/api/admin/v1/audit-logs?page=1&pageSize=100');
    items.value = result.items ?? [];
    status.value = `已从服务端读取 ${items.value.length} 条审计日志`;
  } catch (error: any) {
    status.value = error?.message ?? '审计日志加载失败';
  }
}
onMounted(load);
</script>

<template>
  <Layout>
    <section class="operation-page">
      <header class="page-intro"><div><h1>审计日志</h1><p>记录后台真实操作的管理员、对象、摘要、结果和变更前后信息。</p></div><button data-testid="admin-audit-refresh" @click="load">刷新日志</button></header>
      <p class="panel muted" role="status">{{ status }}</p>
      <section class="panel table-panel ops-table-panel">
        <table class="table resource-table ops-table">
          <thead><tr><th>管理员</th><th>操作类型</th><th>操作对象</th><th>操作摘要</th><th>结果</th><th>操作时间</th></tr></thead><tbody>
            <tr v-for="item in items" :key="item.id" @click="open(item)"><td>{{ item.adminUserId }}</td><td>{{ item.action }}</td><td>{{ item.resourceType }} / {{ item.resourceId }}</td><td>{{ summary(item) }}</td><td><span class="status-badge">{{ result(item) }}</span></td><td>{{ time(item.createdAt) }}</td></tr>
            <tr v-if="!items.length"><td colspan="6" class="empty-cell">暂无审计日志</td></tr>
          </tbody>
        </table>
      </section>
      <div v-if="detailOpen && selected" class="detail-drawer-mask" @click.self="detailOpen = false"><aside class="detail-drawer" role="dialog" aria-label="审计日志详情"><header class="detail-drawer-header"><div><span>审计日志</span><h2>{{ selected.action }}</h2></div><button class="detail-close" @click="detailOpen = false">×</button></header><div class="detail-drawer-body"><section class="detail-group"><h3>操作信息</h3><dl><dt>管理员</dt><dd>{{ selected.adminUserId }}</dd><dt>操作对象</dt><dd>{{ selected.resourceType }} / {{ selected.resourceId }}</dd><dt>操作时间</dt><dd>{{ time(selected.createdAt) }}</dd><dt>操作结果</dt><dd>{{ result(selected) }}</dd></dl></section><section class="detail-group"><h3>变更前摘要</h3><pre class="long-copy">{{ pretty(selected.beforeJson) }}</pre></section><section class="detail-group"><h3>变更后摘要</h3><pre class="long-copy">{{ pretty(selected.afterJson) }}</pre></section></div></aside></div>
    </section>
  </Layout>
</template>
