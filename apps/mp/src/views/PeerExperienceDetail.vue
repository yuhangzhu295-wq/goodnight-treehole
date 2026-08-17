<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const router = useRouter();
const detail = ref<any>(null);
const loading = ref(true);
const requesting = ref(false);
const message = ref('');
const error = ref('');
const experienceId = computed(() => String(route.query.id ?? ''));
const matchId = computed(() => String(route.query.matchId ?? ''));

async function load() {
  if (!experienceId.value) { error.value = '没有找到要查看的经历'; loading.value = false; return; }
  loading.value = true;
  try { detail.value = (await api.get<any>(`/api/v1/peer-experiences/${encodeURIComponent(experienceId.value)}`)).item; } catch (cause: any) { error.value = cause?.message ?? '经历加载失败'; } finally { loading.value = false; }
}

async function requestConversation() {
  if (!matchId.value) return;
  requesting.value = true;
  error.value = '';
  try {
    await api.patch(`/api/v1/peer-matches/${encodeURIComponent(matchId.value)}`, { status: 'requested' });
    message.value = '请求已记录。对方只有在自己的已验证会话中明确接受后，匿名会话才会建立。';
  } catch (cause: any) { error.value = cause?.message ?? '请求发送失败'; } finally { requesting.value = false; }
}

onMounted(load);
</script>

<template>
  <section class="goodnight-page detail-page-two">
    <header class="topline"><button aria-label="返回同路经历" @click="router.back()">‹</button><span>匿名经历详情</span><span></span></header>
    <p v-if="loading" class="state-note">正在读取这段经历...</p>
    <p v-else-if="error" class="error-note">{{ error }}</p>
    <template v-else-if="detail">
      <article class="paper-card intro-card">
        <p class="eyebrow">{{ detail.experience.domain }} · {{ detail.experience.stage }}</p>
        <h1>{{ detail.experience.title }}</h1>
        <p class="body-copy">{{ detail.experience.content }}</p>
        <div class="tag-row"><span v-for="tag in detail.experience.tags" :key="tag">{{ tag }}</span></div>
      </article>

      <article class="paper-card">
        <h2>后来发生了什么</h2>
        <p class="body-copy">{{ detail.later.summary || detail.later.message }}</p>
        <p v-if="detail.retrospective" class="reflection">{{ detail.retrospective }}</p>
      </article>

      <article class="paper-card two-column">
        <div><h2>有帮助的尝试</h2><p v-if="!detail.helpfulActions.length" class="muted">暂未留下。</p><ul><li v-for="action in detail.helpfulActions" :key="action">{{ action }}</li></ul></div>
        <div><h2>不太适合的尝试</h2><p v-if="!detail.notHelpfulActions.length" class="muted">暂未留下。</p><ul><li v-for="action in detail.notHelpfulActions" :key="action">{{ action }}</li></ul></div>
      </article>

      <article v-if="detail.timeline.length || detail.actions.length" class="paper-card">
        <h2>这段路的片段</h2>
        <ol class="timeline"><li v-for="entry in detail.timeline" :key="entry.id"><strong>{{ entry.stage || entry.kind }}</strong><span>{{ entry.content }}</span></li></ol>
        <div v-if="detail.actions.length" class="action-list"><span v-for="action in detail.actions" :key="action.id">{{ action.title }} · {{ action.status }}</span></div>
      </article>

      <section v-if="matchId" class="request-card">
        <p>{{ message || '想交流时，请先把请求交给对方。对方可以接受、拒绝或暂时不想。' }}</p>
        <button :disabled="requesting || !!message" @click="requestConversation">{{ requesting ? '正在发送请求...' : message ? '等待对方决定' : '请求匿名交流' }}</button>
      </section>
    </template>
  </section>
</template>

<style scoped>
.detail-page-two{display:grid;gap:14px;padding:16px 16px 42px;background:linear-gradient(180deg,#f6f4e9,#fbf8ef)}.topline{display:grid;grid-template-columns:42px 1fr 42px;align-items:center;color:var(--gn-green-dark);font-weight:700;text-align:center}.topline button{width:38px;height:38px;border:0;border-radius:50%;background:#fff;color:var(--gn-green-dark);font-size:32px;line-height:1;cursor:pointer}.paper-card,.request-card{border:1px solid var(--gn-border);border-radius:22px;background:var(--gn-card);box-shadow:var(--gn-shadow-card);padding:20px}.intro-card{padding:24px}.eyebrow{margin:0;color:var(--gn-green);font-size:13px}.paper-card h1{margin:8px 0 12px;color:var(--gn-green-dark);font-family:var(--gn-font-display);font-size:30px;line-height:1.25}.paper-card h2{margin:0 0 10px;color:var(--gn-text);font-size:17px}.body-copy{margin:0;color:var(--gn-text);line-height:1.8;white-space:pre-wrap}.reflection,.muted{color:var(--gn-subtext);line-height:1.7}.tag-row,.action-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.tag-row span,.action-list span{padding:5px 9px;border-radius:999px;background:var(--gn-green-light);color:var(--gn-green-dark);font-size:12px}.two-column{display:grid;grid-template-columns:1fr 1fr;gap:16px}.two-column ul{margin:0;padding-left:18px;color:var(--gn-subtext);line-height:1.7}.timeline{display:grid;gap:10px;margin:0;padding-left:18px}.timeline li{display:grid;gap:3px;color:var(--gn-subtext);line-height:1.6}.timeline strong{color:var(--gn-green-dark)}.request-card{display:grid;gap:12px}.request-card p{margin:0;color:var(--gn-subtext);line-height:1.65}.request-card button{min-height:48px;border:0;border-radius:16px;background:var(--gn-green);color:#fff;font:inherit;cursor:pointer}.request-card button:disabled{opacity:.65;cursor:default}.state-note,.error-note{padding:24px;color:var(--gn-subtext);text-align:center}.error-note{color:var(--gn-danger)}
</style>
