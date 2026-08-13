<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Layout from './Layout.vue';
import { adminApi } from '../api';

type FeedbackCategory = { id: string; name: string; sortOrder: number; enabled: boolean; ticketCount: number };

const items = ref<FeedbackCategory[]>([]);
const name = ref('');
const status = ref('正在读取反馈分类…');
const busy = ref(false);
const editing = ref<FeedbackCategory | null>(null);
const editName = ref('');
const editSortOrder = ref(1);
const deleting = ref<FeedbackCategory | null>(null);
const sortedItems = computed(() => [...items.value].sort((a, b) => a.sortOrder - b.sortOrder));

async function load() {
  busy.value = true;
  try {
    const result = await adminApi.get<any>('/api/admin/v1/feedback-categories?page=1&pageSize=100');
    items.value = result.items ?? [];
    status.value = `已从服务端读取 ${items.value.length} 个反馈分类`;
  } catch (error: any) {
    status.value = error?.message ?? '反馈分类加载失败';
  } finally {
    busy.value = false;
  }
}

async function add() {
  if (!name.value.trim()) {
    status.value = '请先填写分类名称';
    return;
  }
  busy.value = true;
  try {
    await adminApi.post('/api/admin/v1/feedback-categories', { name: name.value });
    name.value = '';
    await load();
    status.value = '反馈分类已新增并完成回读';
  } catch (error: any) {
    status.value = error?.message ?? '新增反馈分类失败';
  } finally {
    busy.value = false;
  }
}

function openEdit(item: FeedbackCategory) {
  editing.value = item;
  editName.value = item.name;
  editSortOrder.value = item.sortOrder;
}

async function saveEdit() {
  if (!editing.value || !editName.value.trim()) return;
  busy.value = true;
  try {
    await adminApi.put(`/api/admin/v1/feedback-categories/${editing.value.id}`, { name: editName.value, sortOrder: Number(editSortOrder.value) });
    editing.value = null;
    await load();
    status.value = '反馈分类已保存并完成回读';
  } catch (error: any) {
    status.value = error?.message ?? '保存反馈分类失败';
  } finally {
    busy.value = false;
  }
}

async function toggle(item: FeedbackCategory) {
  busy.value = true;
  try {
    await adminApi.patch(`/api/admin/v1/feedback-categories/${item.id}`, { enabled: !item.enabled });
    await load();
    status.value = item.enabled ? '反馈分类已停用并完成回读' : '反馈分类已启用并完成回读';
  } catch (error: any) {
    status.value = error?.message ?? '更新反馈分类失败';
  } finally {
    busy.value = false;
  }
}

async function move(item: FeedbackCategory, direction: -1 | 1) {
  const index = sortedItems.value.findIndex((candidate) => candidate.id === item.id);
  const target = sortedItems.value[index + direction];
  if (!target) return;
  busy.value = true;
  try {
    await adminApi.patch(`/api/admin/v1/feedback-categories/${item.id}`, { sortOrder: target.sortOrder });
    await adminApi.patch(`/api/admin/v1/feedback-categories/${target.id}`, { sortOrder: item.sortOrder });
    await load();
    status.value = '反馈分类排序已保存并完成回读';
  } catch (error: any) {
    status.value = error?.message ?? '调整反馈分类排序失败';
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!deleting.value) return;
  busy.value = true;
  try {
    await adminApi.delete(`/api/admin/v1/feedback-categories/${deleting.value.id}`);
    deleting.value = null;
    await load();
    status.value = '反馈分类已删除并完成回读';
  } catch (error: any) {
    status.value = error?.message ?? '删除反馈分类失败';
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <Layout>
    <section class="operation-page">
      <header class="page-intro"><div><h1>反馈分类</h1><p>维护前台反馈提交可选的真实分类，工单数量会从服务端实时汇总。</p></div></header>
      <section class="panel ops-filters"><label><span>分类名称</span><input v-model="name" data-testid="admin-category-name" placeholder="输入新分类" /></label><button class="primary" data-testid="admin-category-add" :disabled="busy" @click="add">新增分类</button><p class="muted" role="status">{{ status }}</p></section>
      <section class="panel table-panel ops-table-panel">
        <table class="table resource-table ops-table">
          <thead><tr><th>名称</th><th>关联工单</th><th>排序</th><th>状态</th><th>操作</th></tr></thead><tbody>
            <tr v-for="item in sortedItems" :key="item.id"><td>{{ item.name }}</td><td>{{ item.ticketCount }} 条</td><td>{{ item.sortOrder }}</td><td><span class="status-badge">{{ item.enabled ? '启用' : '停用' }}</span></td><td class="row-actions"><button :disabled="busy" @click="openEdit(item)">编辑</button><button :disabled="busy" @click="move(item, -1)">上移</button><button :disabled="busy" @click="move(item, 1)">下移</button><button :disabled="busy" @click="toggle(item)">{{ item.enabled ? '停用' : '启用' }}</button><button class="danger" :disabled="busy || item.ticketCount > 0" :title="item.ticketCount > 0 ? '仍有关联工单的分类只能停用' : '删除分类'" @click="deleting = item">删除</button></td></tr>
            <tr v-if="!sortedItems.length"><td colspan="5" class="empty-cell">暂无反馈分类</td></tr>
          </tbody>
        </table>
      </section>
      <div v-if="editing" class="detail-drawer-mask" @click.self="editing = null"><aside class="detail-drawer" role="dialog" aria-label="编辑反馈分类"><header class="detail-drawer-header"><div><span>反馈分类</span><h2>编辑分类</h2></div><button class="detail-close" @click="editing = null">×</button></header><div class="detail-drawer-body"><label>分类名称<input v-model="editName" /></label><label>排序<input v-model.number="editSortOrder" type="number" min="1" /></label><div class="drawer-actions"><button class="primary" data-testid="admin-category-save" :disabled="busy" @click="saveEdit">保存修改</button><button :disabled="busy" @click="editing = null">取消</button></div></div></aside></div>
      <div v-if="deleting" class="detail-drawer-mask" @click.self="deleting = null"><section class="panel confirmation-dialog" role="dialog" aria-label="确认删除反馈分类"><h2>确认删除“{{ deleting.name }}”？</h2><p>删除后前台将不再展示该分类。</p><div class="drawer-actions"><button class="danger" data-testid="admin-category-delete-confirm" :disabled="busy" @click="remove">确认删除</button><button :disabled="busy" @click="deleting = null">取消</button></div></section></div>
    </section>
  </Layout>
</template>
