<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const router = useRouter();
const matchId = computed(() => String(route.query.matchId ?? ''));
const conversation = ref<any>(null);
const draft = ref('');
const busy = ref(false);
const assistBusy = ref(false);
const assistNotice = ref('');
const error = ref('');

async function load() {
  try {
    const response = await api.get<any>('/api/v1/peer-conversations');
    conversation.value = response.items.find((item: any) => item.matchId === matchId.value) ?? null;
  } catch (cause: any) { error.value = cause?.message ?? '匿名会话加载失败'; }
}
async function send() {
  const content = draft.value.trim();
  if (!content || !matchId.value) return;
  busy.value = true;
  try { await api.post(`/api/v1/peer-conversations/${encodeURIComponent(matchId.value)}/messages`, { content }); draft.value = ''; await load(); } catch (cause: any) { error.value = cause?.message ?? '消息没有送出'; } finally { busy.value = false; }
}
const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
async function assist() {
  if (!draft.value.trim() || !matchId.value) return;
  assistBusy.value = true;
  error.value = '';
  assistNotice.value = '';
  try {
    const response = await api.post<{ job: { id: string }; notice: string }>(`/api/v1/peer-conversations/${encodeURIComponent(matchId.value)}/assist`, { content: draft.value });
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await wait(400);
      const task = await api.get<{ status: string; result: string }>(`/api/v1/ai/tasks/${response.job.id}`);
      if (['succeeded', 'fallback', 'failed'].includes(task.status)) {
        if (task.status === 'failed') throw new Error('整理失败，请保留原话发送');
        draft.value = task.result;
        assistNotice.value = `${response.notice} 当前内容仍是你的草稿。`;
        break;
      }
    }
  } catch (cause: any) { error.value = cause?.message ?? '暂时无法整理这段话'; } finally { assistBusy.value = false; }
}
async function closeConversation() {
  if (!matchId.value) return;
  busy.value = true;
  try { await api.post(`/api/v1/peer-conversations/${encodeURIComponent(matchId.value)}/close`, {}); await load(); } catch (cause: any) { error.value = cause?.message ?? '会话关闭失败'; } finally { busy.value = false; }
}
onMounted(load);
</script>

<template>
  <section class="goodnight-page conversation-page">
    <header class="conversation-header"><button aria-label="返回" @click="router.back()">‹</button><div><strong>匿名同路会话</strong><small>不展示真实身份 · 最多 72 小时</small></div><button class="close-button" :disabled="!conversation || busy || conversation.status !== 'active'" @click="closeConversation">结束</button></header>
    <p v-if="error" class="error-note">{{ error }}</p>
    <section v-if="!conversation" class="empty-card"><h1>还没有可用会话</h1><p>只有经历发布者在自己的认证会话中明确接受请求后，系统才会创建这段限时匿名对话。</p></section>
    <template v-else>
      <p class="expiry">{{ conversation.status === 'active' ? `会话将在 ${new Date(conversation.expiresAt).toLocaleString('zh-CN')} 结束` : '这段会话已经结束' }}</p>
      <main class="messages"><p v-if="!conversation.messages.length" class="empty-message">从一个真实、具体的感受开始就好。不要分享联系方式或可识别信息。</p><article v-for="message in conversation.messages" :key="message.id" class="message"><span>匿名参与者</span><p>{{ message.content }}</p><time>{{ new Date(message.createdAt).toLocaleString('zh-CN') }}</time></article></main>
      <form class="composer" @submit.prevent="send"><textarea v-model="draft" maxlength="1000" :disabled="conversation.status !== 'active'" placeholder="写下你想说的话，不要包含联系方式或真实身份信息。"></textarea><p v-if="assistNotice" class="assist-note">{{ assistNotice }}</p><div><small>{{ draft.length }}/1000</small><span class="composer-actions"><button type="button" :disabled="assistBusy || busy || conversation.status !== 'active' || !draft.trim()" @click="assist">{{ assistBusy ? '整理中...' : '帮我整理一下' }}</button><button type="submit" :disabled="busy || assistBusy || conversation.status !== 'active' || !draft.trim()">{{ busy ? '发送中...' : '发送' }}</button></span></div></form>
    </template>
  </section>
</template>

<style scoped>
.conversation-page{display:grid;grid-template-rows:auto auto 1fr auto;min-height:100vh;padding:16px;background:#fbf8ef}.conversation-header{display:grid;grid-template-columns:40px minmax(0,1fr)54px;align-items:center;gap:10px}.conversation-header button{min-height:38px;border:0;border-radius:12px;background:#fff;color:var(--gn-green-dark);font:inherit;cursor:pointer}.conversation-header>button:first-child{font-size:30px;line-height:1}.conversation-header strong,.conversation-header small{display:block}.conversation-header small,.expiry,time{margin-top:3px;color:var(--gn-subtext);font-size:12px}.close-button:disabled{opacity:.5}.messages{display:flex;flex-direction:column;gap:12px;min-height:320px;padding:20px 0}.message{align-self:flex-start;max-width:86%;border:1px solid var(--gn-border);border-radius:18px 18px 18px 4px;background:#fff;padding:12px 14px}.message span{color:var(--gn-green);font-size:12px}.message p{margin:6px 0;color:var(--gn-text);line-height:1.7;white-space:pre-wrap}.empty-card{align-self:center;border:1px solid var(--gn-border);border-radius:24px;background:var(--gn-card);padding:24px;text-align:center}.empty-card h1{color:var(--gn-green-dark);font-size:22px}.empty-card p,.empty-message{color:var(--gn-subtext);line-height:1.7}.composer{position:sticky;bottom:0;border:1px solid var(--gn-border);border-radius:20px;background:#fff;padding:12px}.composer textarea{box-sizing:border-box;width:100%;min-height:84px;resize:none;border:0;outline:0;color:var(--gn-text);font:inherit;line-height:1.6}.composer div{display:flex;align-items:center;justify-content:space-between}.composer small{color:var(--gn-subtext)}.composer button{min-width:82px;min-height:38px;border:0;border-radius:12px;background:var(--gn-green);color:#fff;font:inherit}.error-note{color:var(--gn-danger)}
.composer-actions{display:flex;flex-wrap:wrap;gap:8px}.composer-actions button:first-child{background:transparent;border:1px solid var(--gn-border);color:var(--gn-green-dark)}.assist-note{margin:4px 0;color:var(--gn-subtext);font-size:12px;line-height:1.5}
</style>
