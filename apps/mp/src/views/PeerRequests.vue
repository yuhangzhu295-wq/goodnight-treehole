<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

type RequestItem = { id: string; status: string; explanation?: string; experience?: { title?: string; domain?: string; stage?: string } };
const router = useRouter();
const items = ref<RequestItem[]>([]);
const loading = ref(true);
const busyId = ref('');
const error = ref('');

async function load() {
  loading.value = true;
  try { items.value = (await api.get<{ items: RequestItem[] }>('/api/v1/peer-requests')).items; } catch (cause) { error.value = cause instanceof Error ? cause.message : '请求加载失败'; } finally { loading.value = false; }
}

async function respond(item: RequestItem, status: 'connected' | 'declined' | 'blocked') {
  busyId.value = item.id;
  error.value = '';
  try {
    const response = await api.post<{ conversation?: { matchId: string } }>(`/api/v1/peer-matches/${encodeURIComponent(item.id)}/respond`, { status });
    if (status === 'connected' && response.conversation) await router.push(`/pages/peer/conversation?matchId=${encodeURIComponent(response.conversation.matchId)}`);
    else await load();
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '请求处理失败'; } finally { busyId.value = ''; }
}

onMounted(load);
</script>

<template>
  <section class="goodnight-page requests-page">
    <header class="simple-header"><button aria-label="返回" @click="router.back()">‹</button><strong>同路请求</strong><span></span></header>
    <p class="intro">只有你明确接受后，匿名 72 小时会话才会开始。你可以拒绝或暂时不想。</p>
    <p v-if="error" class="error-note">{{ error }}</p>
    <p v-if="loading" class="muted">正在读取请求...</p>
    <section v-else class="paper-card">
      <p v-if="!items.length" class="muted">暂时没有新的同路请求。</p>
      <article v-for="item in items" :key="item.id" class="request-row">
        <div><strong>{{ item.experience?.title || '一段匿名经历' }}</strong><small>{{ item.experience?.domain }} · {{ item.experience?.stage }}</small><p>{{ item.explanation || '对方看见了你留下的后来记录。' }}</p></div>
        <div class="request-actions"><button :disabled="busyId === item.id" @click="respond(item, 'connected')">接受</button><button :disabled="busyId === item.id" @click="respond(item, 'declined')">拒绝</button><button :disabled="busyId === item.id" @click="respond(item, 'blocked')">暂时不想</button></div>
      </article>
    </section>
  </section>
</template>

<style scoped>
.requests-page{display:grid;gap:14px;padding:18px 16px 44px;background:#fbf8ef}.simple-header{display:grid;grid-template-columns:40px 1fr 40px;align-items:center;text-align:center;color:var(--gn-green-dark)}.simple-header button{width:36px;height:36px;border:0;border-radius:50%;background:#fff;color:var(--gn-green-dark);font-size:30px;cursor:pointer}.intro,.muted,.error-note{color:var(--gn-subtext);line-height:1.7}.error-note{color:var(--gn-danger)}.paper-card{display:grid;gap:12px;border:1px solid var(--gn-border);border-radius:24px;background:var(--gn-card);box-shadow:var(--gn-shadow-card);padding:20px}.request-row{display:grid;gap:12px;padding:14px 0;border-bottom:1px solid var(--gn-border)}.request-row strong,.request-row small{display:block}.request-row small{margin-top:5px;color:var(--gn-subtext);font-size:12px}.request-row p{margin:8px 0 0;color:var(--gn-text);line-height:1.6}.request-actions{display:flex;flex-wrap:wrap;gap:8px}.request-actions button{min-height:40px;border:1px solid var(--gn-border);border-radius:13px;padding:0 13px;background:#fffef9;color:var(--gn-green-dark);font:inherit;cursor:pointer}.request-actions button:first-child{border-color:var(--gn-green);background:var(--gn-green);color:#fff}
</style>
