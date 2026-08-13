<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Layout from './Layout.vue';
import { adminApi } from '../api';

type ReplyPreset = { id: string; text: string; scene: string; sortOrder: number; enabled: boolean };

const items = ref<ReplyPreset[]>([]);
const text = ref('');
const scene = ref('comfort');
const status = ref('正在读取回复预设…');
const busy = ref(false);
const editing = ref<ReplyPreset | null>(null);
const editText = ref('');
const editScene = ref('comfort');
const editSortOrder = ref(1);
const deleting = ref<ReplyPreset | null>(null);

const sceneLabels: Record<string, string> = { comfort: '陪伴安慰', support: '行动支持' };
const sortedItems = computed(() => [...items.value].sort((a, b) => a.sortOrder - b.sortOrder));

async function load() {
  busy.value = true;
  try {
    const result = await adminApi.get<any>('/api/admin/v1/reply-presets?page=1&pageSize=100');
    items.value = result.items ?? [];
    status.value = `已从服务端读取 ${items.value.length} 条回复预设`;
  } catch (error: any) {
    status.value = error?.message ?? '回复预设加载失败';
  } finally {
    busy.value = false;
  }
}

async function add() {
  if (!text.value.trim()) {
    status.value = '请先填写预设内容';
    return;
  }
  busy.value = true;
  try {
    await adminApi.post('/api/admin/v1/reply-presets', { text: text.value, scene: scene.value });
    text.value = '';
    await load();
    status.value = '回复预设已新增并完成回读';
  } catch (error: any) {
    status.value = error?.message ?? '新增回复预设失败';
  } finally {
    busy.value = false;
  }
}

function openEdit(item: ReplyPreset) {
  editing.value = item;
  editText.value = item.text;
  editScene.value = item.scene;
  editSortOrder.value = item.sortOrder;
}

async function saveEdit() {
  if (!editing.value || !editText.value.trim()) return;
  busy.value = true;
  try {
    await adminApi.put(`/api/admin/v1/reply-presets/${editing.value.id}`, { text: editText.value, scene: editScene.value, sortOrder: Number(editSortOrder.value) });
    editing.value = null;
    await load();
    status.value = '回复预设已保存并完成回读';
  } catch (error: any) {
    status.value = error?.message ?? '保存回复预设失败';
  } finally {
    busy.value = false;
  }
}

async function toggle(item: ReplyPreset) {
  busy.value = true;
  try {
    await adminApi.patch(`/api/admin/v1/reply-presets/${item.id}`, { enabled: !item.enabled });
    await load();
    status.value = item.enabled ? '回复预设已停用并完成回读' : '回复预设已启用并完成回读';
  } catch (error: any) {
    status.value = error?.message ?? '更新回复预设失败';
  } finally {
    busy.value = false;
  }
}

async function move(item: ReplyPreset, direction: -1 | 1) {
  const index = sortedItems.value.findIndex((candidate) => candidate.id === item.id);
  const target = sortedItems.value[index + direction];
  if (!target) return;
  busy.value = true;
  try {
    await adminApi.patch(`/api/admin/v1/reply-presets/${item.id}`, { sortOrder: target.sortOrder });
    await adminApi.patch(`/api/admin/v1/reply-presets/${target.id}`, { sortOrder: item.sortOrder });
    await load();
    status.value = '回复预设排序已保存并完成回读';
  } catch (error: any) {
    status.value = error?.message ?? '调整排序失败';
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!deleting.value) return;
  busy.value = true;
  try {
    await adminApi.delete(`/api/admin/v1/reply-presets/${deleting.value.id}`);
    deleting.value = null;
    await load();
    status.value = '回复预设已删除并完成回读';
  } catch (error: any) {
    status.value = error?.message ?? '删除回复预设失败';
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <Layout>
    <section class="operation-page">
      <header class="page-intro">
        <div><h1>回复预设</h1><p>维护运营可复用的真实回应文案，新增、编辑、排序、启停和删除都会写入服务端。</p></div>
      </header>
      <section class="panel ops-filters">
        <label><span>预设内容</span><input v-model="text" data-testid="admin-preset-text" placeholder="输入新回复预设" /></label>
        <label><span>使用场景</span><select v-model="scene"><option value="comfort">陪伴安慰</option><option value="support">行动支持</option></select></label>
        <button class="primary" data-testid="admin-preset-add" :disabled="busy" @click="add">新增预设</button>
        <p class="muted" role="status">{{ status }}</p>
      </section>
      <section class="panel table-panel ops-table-panel">
        <table class="table resource-table ops-table">
          <thead><tr><th>内容</th><th>场景</th><th>排序</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="item in sortedItems" :key="item.id">
              <td>{{ item.text }}</td><td>{{ sceneLabels[item.scene] ?? item.scene }}</td><td>{{ item.sortOrder }}</td><td><span class="status-badge">{{ item.enabled ? '启用' : '停用' }}</span></td>
              <td class="row-actions"><button :disabled="busy" @click="openEdit(item)">编辑</button><button :disabled="busy" @click="move(item, -1)">上移</button><button :disabled="busy" @click="move(item, 1)">下移</button><button :disabled="busy" @click="toggle(item)">{{ item.enabled ? '停用' : '启用' }}</button><button class="danger" :disabled="busy" @click="deleting = item">删除</button></td>
            </tr>
            <tr v-if="!sortedItems.length"><td colspan="5" class="empty-cell">暂无回复预设</td></tr>
          </tbody>
        </table>
      </section>
      <div v-if="editing" class="detail-drawer-mask" @click.self="editing = null"><aside class="detail-drawer" role="dialog" aria-label="编辑回复预设"><header class="detail-drawer-header"><div><span>回复预设</span><h2>编辑预设</h2></div><button class="detail-close" @click="editing = null">×</button></header><div class="detail-drawer-body"><label>预设内容<textarea v-model="editText" rows="5" /></label><label>使用场景<select v-model="editScene"><option value="comfort">陪伴安慰</option><option value="support">行动支持</option></select></label><label>排序<input v-model.number="editSortOrder" type="number" min="1" /></label><div class="drawer-actions"><button class="primary" data-testid="admin-preset-save" :disabled="busy" @click="saveEdit">保存修改</button><button :disabled="busy" @click="editing = null">取消</button></div></div></aside></div>
      <div v-if="deleting" class="detail-drawer-mask" @click.self="deleting = null"><section class="panel confirmation-dialog" role="dialog" aria-label="确认删除回复预设"><h2>确认删除这条回复预设？</h2><p>{{ deleting.text }}</p><div class="drawer-actions"><button class="danger" data-testid="admin-preset-delete-confirm" :disabled="busy" @click="remove">确认删除</button><button :disabled="busy" @click="deleting = null">取消</button></div></section></div>
    </section>
  </Layout>
</template>
