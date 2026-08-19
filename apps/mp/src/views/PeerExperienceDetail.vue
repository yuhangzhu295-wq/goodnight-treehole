<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const router = useRouter();
const detail = ref<any>(null);
const loading = ref(true);
const requesting = ref(false);
const requestReason = ref('我想听听你后来是怎么把这段日子走过去的。');
const requestQuestion = ref('如果只留一句给当时的自己，你会说什么？');
const error = ref('');
const experienceId = computed(() => String(route.query.id ?? ''));
const matchId = computed(() => String(route.query.matchId ?? ''));

async function load() {
  if (!experienceId.value) { error.value = '没有找到要查看的经历'; loading.value = false; return; }
  loading.value = true;
  try { detail.value = (await api.get<any>(`/api/v1/peer-experiences/${encodeURIComponent(experienceId.value)}`)).item; }
  catch (cause: any) { error.value = cause?.message ?? '经历加载失败'; }
  finally { loading.value = false; }
}

async function requestConversation() {
  if (!matchId.value) return;
  requesting.value = true; error.value = '';
  try {
    await api.patch(`/api/v1/peer-matches/${encodeURIComponent(matchId.value)}`, { status: 'requested', requestReason: requestReason.value, requestQuestion: requestQuestion.value });
    await router.push(`/pages/peer/wait?matchId=${encodeURIComponent(matchId.value)}`);
  } catch (cause: any) { error.value = cause?.message ?? '请求发送失败'; }
  finally { requesting.value = false; }
}
onMounted(load);
</script>

<template>
  <section class="goodnight-page peer-detail-page">
    <header class="detail-hero"><button aria-label="返回同路经历" @click="router.back()">‹</button><div><span>匿名经历详情</span><small>只展示经同意的后来</small></div></header>
    <p v-if="loading" class="state-note">正在展开这段后来…</p><p v-else-if="error" class="error-note">{{ error }}</p>
    <template v-else-if="detail">
      <article class="story-paper"><span class="story-dot">⌘</span><p class="eyebrow">{{ detail.experience.domain }} · 一段匿名经历</p><h1>{{ detail.experience.title }}</h1><p class="body-copy">{{ detail.experience.content }}</p><div class="tag-row"><span v-for="tag in detail.experience.tags" :key="tag">{{ tag }}</span></div></article>
      <article class="later-card"><div class="section-label"><span>后来</span><i></i></div><h2>TA 后来是这样走过来的</h2><p>{{ detail.later.summary || detail.later.message || '这段后来还在慢慢展开。' }}</p><p v-if="detail.retrospective" class="reflection">{{ detail.retrospective }}</p></article>
      <section class="attempt-grid"><article><span class="attempt-icon good">✓</span><h2>有一点帮助的</h2><ul><li v-for="action in detail.helpfulActions" :key="action">{{ action }}</li><li v-if="!detail.helpfulActions.length">TA还没有留下具体方法。</li></ul></article><article><span class="attempt-icon soft">~</span><h2>不太适合的</h2><ul><li v-for="action in detail.notHelpfulActions" :key="action">{{ action }}</li><li v-if="!detail.notHelpfulActions.length">每个人的节奏都不一样。</li></ul></article></section>
      <article v-if="detail.timeline.length" class="snippet-card"><h2>走过的片段</h2><p v-for="entry in detail.timeline" :key="entry.id">{{ entry.content }}</p></article>
      <section v-if="matchId" class="request-panel"><h2>想问问 TA 吗？</h2><p>先写下你真正想知道的事。不会展示昵称、联系方式或任何身份信息。</p><label>我为什么想聊 <textarea v-model="requestReason" maxlength="280" /></label><label>我最想问的一句 <input v-model="requestQuestion" maxlength="160"></label><button :disabled="requesting || !requestReason.trim()" @click="requestConversation">{{ requesting ? '正在递出请求…' : '递出匿名请求' }}</button></section>
    </template>
  </section>
</template>

<style scoped>
.peer-detail-page{display:grid;gap:15px;padding:0 16px 46px;background:linear-gradient(180deg,#1b323b 0 160px,#fbf8ef 160px)}.detail-hero{display:grid;grid-template-columns:42px 1fr;align-items:center;gap:8px;min-height:126px;color:#f7f2df}.detail-hero button{width:38px;height:38px;border:1px solid rgba(255,255,255,.32);border-radius:50%;background:rgba(255,255,255,.1);color:#fff;font-size:30px;line-height:1;cursor:pointer}.detail-hero div{display:grid;gap:5px}.detail-hero span{font-family:var(--gn-font-display);font-size:26px}.detail-hero small{color:#d7e0ce;font-size:12px}.story-paper,.later-card,.snippet-card,.request-panel,.attempt-grid article{border:1px solid var(--gn-border);border-radius:24px;background:var(--gn-card);box-shadow:var(--gn-shadow-card)}.story-paper{position:relative;padding:26px 22px;overflow:hidden}.story-paper::after{position:absolute;right:-16px;bottom:-18px;width:118px;height:118px;background:url('../assets/goodnight/leaf-corner.png') center/contain no-repeat;opacity:.48;content:'';pointer-events:none}.story-dot{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:var(--gn-green-light);color:var(--gn-green);font-size:21px}.eyebrow{margin:16px 0 0;color:var(--gn-green);font-size:12px}.story-paper h1{margin:7px 0 12px;color:var(--gn-green-dark);font-family:var(--gn-font-display);font-size:29px;line-height:1.27}.body-copy{position:relative;z-index:1;margin:0;color:var(--gn-text);line-height:1.86;white-space:pre-wrap}.tag-row{display:flex;flex-wrap:wrap;gap:7px;margin-top:16px}.tag-row span{padding:5px 9px;border-radius:999px;background:var(--gn-green-light);color:var(--gn-green-dark);font-size:12px}.later-card,.snippet-card,.request-panel{padding:21px}.section-label{display:flex;align-items:center;gap:9px;color:var(--gn-green);font-size:13px}.section-label i{display:block;flex:1;border-top:1px dashed var(--gn-border)}.later-card h2,.attempt-grid h2,.snippet-card h2,.request-panel h2{margin:10px 0;color:var(--gn-text);font-size:19px}.later-card p,.snippet-card p,.request-panel>p{margin:0;color:var(--gn-subtext);line-height:1.76}.later-card .reflection{margin-top:12px;color:var(--gn-text)}.attempt-grid{display:grid;grid-template-columns:1fr 1fr;gap:11px}.attempt-grid article{padding:17px}.attempt-icon{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;font-weight:700}.attempt-icon.good{background:var(--gn-green-light);color:var(--gn-green)}.attempt-icon.soft{background:#f8eedf;color:#a67755}.attempt-grid h2{font-size:15px}.attempt-grid ul{margin:0;padding-left:17px;color:var(--gn-subtext);font-size:13px;line-height:1.65}.snippet-card{display:grid;gap:10px}.snippet-card h2{margin:0}.snippet-card p{padding-bottom:10px;border-bottom:1px solid var(--gn-border);font-size:14px}.request-panel{display:grid;gap:12px}.request-panel h2{margin:0}.request-panel label{display:grid;gap:7px;color:var(--gn-text);font-size:13px}.request-panel textarea,.request-panel input{box-sizing:border-box;width:100%;border:1px solid var(--gn-border);border-radius:13px;background:#fffef9;padding:10px;color:var(--gn-text);font:inherit;line-height:1.6}.request-panel textarea{min-height:76px;resize:none}.request-panel button{min-height:50px;border:0;border-radius:999px;background:var(--gn-green);color:#fff;font:inherit;cursor:pointer}.request-panel button:disabled{opacity:.6}.state-note,.error-note{padding:24px;color:var(--gn-subtext);text-align:center}.error-note{color:var(--gn-danger)}
.detail-hero{position:relative;overflow:hidden}.detail-hero::after{position:absolute;right:-12px;bottom:-8px;width:190px;height:142px;background:url('../assets/goodnight/peer/peer-night-tree.png') right bottom/contain no-repeat;content:'';opacity:.76;pointer-events:none;-webkit-mask-image:radial-gradient(ellipse at 100% 0%,#000 42%,transparent 88%);mask-image:radial-gradient(ellipse at 100% 0%,#000 42%,transparent 88%)}.detail-hero>*{position:relative;z-index:1}
</style>
