<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Layout from './Layout.vue';
import { adminApi } from '../api';

type Faq = { id: string; question: string; answer: string; sortOrder: number; enabled: boolean };

const items = ref<Faq[]>([]);
const question = ref('');
const answer = ref('');
const query = ref('');
const status = ref('正在读取 FAQ…');
const busy = ref(false);
const editing = ref<Faq | null>(null);
const editQuestion = ref('');
const editAnswer = ref('');
const editSortOrder = ref(1);
const deleting = ref<Faq | null>(null);

const sortedItems = computed(() => [...items.value].sort((a, b) => a.sortOrder - b.sortOrder));
const visibleItems = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  return !keyword ? sortedItems.value : sortedItems.value.filter((item) => `${item.question} ${item.answer}`.toLowerCase().includes(keyword));
});

async function load() {
  busy.value = true;
  try {
    const result = await adminApi.get<any>('/api/admin/v1/faqs?page=1&pageSize=100');
    items.value = result.items ?? [];
    status.value = `已从服务端读取 ${items.value.length} 条 FAQ`;
  } catch (error: any) {
    status.value = error?.message ?? 'FAQ 加载失败';
  } finally {
    busy.value = false;
  }
}

async function add() {
  if (!question.value.trim() || !answer.value.trim()) {
    status.value = '请完整填写问题和答案';
    return;
  }
  busy.value = true;
  try {
    await adminApi.post('/api/admin/v1/faqs', { question: question.value, answer: answer.value });
    question.value = '';
    answer.value = '';
    await load();
    status.value = 'FAQ 已新增并完成回读';
  } catch (error: any) {
    status.value = error?.message ?? '新增 FAQ 失败';
  } finally {
    busy.value = false;
  }
}

function openEdit(item: Faq) {
  editing.value = item;
  editQuestion.value = item.question;
  editAnswer.value = item.answer;
  editSortOrder.value = item.sortOrder;
}

async function saveEdit() {
  if (!editing.value || !editQuestion.value.trim() || !editAnswer.value.trim()) return;
  busy.value = true;
  try {
    await adminApi.put(`/api/admin/v1/faqs/${editing.value.id}`, { question: editQuestion.value, answer: editAnswer.value, sortOrder: Number(editSortOrder.value) });
    editing.value = null;
    await load();
    status.value = 'FAQ 已保存并完成回读';
  } catch (error: any) {
    status.value = error?.message ?? '保存 FAQ 失败';
  } finally {
    busy.value = false;
  }
}

async function toggle(item: Faq) {
  busy.value = true;
  try {
    await adminApi.patch(`/api/admin/v1/faqs/${item.id}`, { enabled: !item.enabled });
    await load();
    status.value = item.enabled ? 'FAQ 已停用并完成回读' : 'FAQ 已启用并完成回读';
  } catch (error: any) {
    status.value = error?.message ?? '更新 FAQ 失败';
  } finally {
    busy.value = false;
  }
}

async function move(item: Faq, direction: -1 | 1) {
  const index = sortedItems.value.findIndex((candidate) => candidate.id === item.id);
  const target = sortedItems.value[index + direction];
  if (!target) return;
  busy.value = true;
  try {
    await adminApi.patch(`/api/admin/v1/faqs/${item.id}`, { sortOrder: target.sortOrder });
    await adminApi.patch(`/api/admin/v1/faqs/${target.id}`, { sortOrder: item.sortOrder });
    await load();
    status.value = 'FAQ 排序已保存并完成回读';
  } catch (error: any) {
    status.value = error?.message ?? '调整 FAQ 排序失败';
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (!deleting.value) return;
  busy.value = true;
  try {
    await adminApi.delete(`/api/admin/v1/faqs/${deleting.value.id}`);
    deleting.value = null;
    await load();
    status.value = 'FAQ 已删除并完成回读';
  } catch (error: any) {
    status.value = error?.message ?? '删除 FAQ 失败';
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <Layout>
    <section class="operation-page">
      <header class="page-intro"><div><h1>FAQ 管理</h1><p>维护前台可见的帮助说明；搜索、编辑、排序、启停和删除都会写入服务端。</p></div></header>
      <section class="panel ops-filters">
        <label><span>搜索 FAQ</span><input v-model="query" placeholder="搜索问题或答案" /></label>
        <label><span>问题</span><input v-model="question" data-testid="admin-faq-question" placeholder="输入常见问题" /></label>
        <label><span>答案</span><input v-model="answer" data-testid="admin-faq-answer" placeholder="输入清晰的中文说明" /></label>
        <button class="primary" data-testid="admin-faq-add" :disabled="busy" @click="add">新增 FAQ</button>
        <p class="muted" role="status">{{ status }}</p>
      </section>
      <section class="panel table-panel ops-table-panel">
        <table class="table resource-table ops-table">
          <thead><tr><th>问题</th><th>答案</th><th>排序</th><th>状态</th><th>操作</th></tr></thead><tbody>
            <tr v-for="item in visibleItems" :key="item.id"><td>{{ item.question }}</td><td>{{ item.answer }}</td><td>{{ item.sortOrder }}</td><td><span class="status-badge">{{ item.enabled ? '启用' : '停用' }}</span></td><td class="row-actions"><button :disabled="busy" @click="openEdit(item)">编辑</button><button :disabled="busy" @click="move(item, -1)">上移</button><button :disabled="busy" @click="move(item, 1)">下移</button><button :disabled="busy" @click="toggle(item)">{{ item.enabled ? '停用' : '启用' }}</button><button class="danger" :disabled="busy" @click="deleting = item">删除</button></td></tr>
            <tr v-if="!visibleItems.length"><td colspan="5" class="empty-cell">没有匹配的 FAQ</td></tr>
          </tbody>
        </table>
      </section>
      <div v-if="editing" class="detail-drawer-mask" @click.self="editing = null"><aside class="detail-drawer" role="dialog" aria-label="编辑 FAQ"><header class="detail-drawer-header"><div><span>FAQ 管理</span><h2>编辑 FAQ</h2></div><button class="detail-close" @click="editing = null">×</button></header><div class="detail-drawer-body"><label>问题<input v-model="editQuestion" /></label><label>答案<textarea v-model="editAnswer" rows="6" /></label><label>排序<input v-model.number="editSortOrder" type="number" min="1" /></label><div class="drawer-actions"><button class="primary" data-testid="admin-faq-save" :disabled="busy" @click="saveEdit">保存修改</button><button :disabled="busy" @click="editing = null">取消</button></div></div></aside></div>
      <div v-if="deleting" class="detail-drawer-mask" @click.self="deleting = null"><section class="panel confirmation-dialog" role="dialog" aria-label="确认删除 FAQ"><h2>确认删除这条 FAQ？</h2><p>{{ deleting.question }}</p><div class="drawer-actions"><button class="danger" data-testid="admin-faq-delete-confirm" :disabled="busy" @click="remove">确认删除</button><button :disabled="busy" @click="deleting = null">取消</button></div></section></div>
    </section>
  </Layout>
</template>
