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
const requestOpen = ref(false);
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
      <section v-if="matchId" class="request-callout"><span aria-hidden="true">⌘</span><div><strong>想问问 TA 吗？</strong><p>先写下真正想知道的事，再把请求安静地递出去。</p></div><button type="button" @click="requestOpen = true">请求匿名交流</button></section>
      <article v-if="detail.timeline.length" class="snippet-card"><h2>走过的片段</h2><p v-for="entry in detail.timeline" :key="entry.id">{{ entry.content }}</p></article>
      <section v-if="matchId && requestOpen" class="request-sheet" role="dialog" aria-modal="true" aria-labelledby="peer-request-title"><div class="request-panel"><div class="sheet-heading"><div><span>匿名同路</span><h2 id="peer-request-title">想问问 TA 吗？</h2></div><button type="button" aria-label="关闭请求面板" @click="requestOpen = false">×</button></div><p>不会展示昵称、联系方式或任何身份信息。</p><label>我为什么想聊 <textarea v-model="requestReason" maxlength="280" /></label><label>我最想问的一句 <input v-model="requestQuestion" maxlength="160"></label><button :disabled="requesting || !requestReason.trim()" @click="requestConversation">{{ requesting ? '正在递出请求…' : '递出匿名请求' }}</button></div></section>
    </template>
  </section>
</template>

<style scoped>
.peer-detail-page{display:grid;gap:12px;padding:0 16px 46px;background:linear-gradient(180deg,#1b323b 0 116px,#fbf8ef 116px)}.detail-hero{display:grid;grid-template-columns:42px 1fr;align-items:center;gap:8px;min-height:94px;color:#f7f2df}.detail-hero button{width:38px;height:38px;border:1px solid rgba(255,255,255,.32);border-radius:50%;background:rgba(255,255,255,.1);color:#fff;font-size:30px;line-height:1;cursor:pointer}.detail-hero div{display:grid;gap:3px}.detail-hero span{font-family:var(--gn-font-display);font-size:22px}.detail-hero small{color:#d7e0ce;font-size:12px}.story-paper,.later-card,.snippet-card,.request-callout,.request-panel,.attempt-grid article{border:1px solid var(--gn-border);border-radius:22px;background:var(--gn-card);box-shadow:var(--gn-shadow-card)}.story-paper{position:relative;padding:18px 18px 17px;overflow:hidden}.story-paper::after{position:absolute;right:-7px;bottom:-8px;width:118px;height:91px;background:url('../assets/goodnight/peer/peer-bench-scene.png') right bottom/contain no-repeat;opacity:.52;content:'';pointer-events:none}.story-dot{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--gn-green-light);color:var(--gn-green);font-size:18px}.eyebrow{margin:10px 0 0;color:var(--gn-green);font-size:11px}.story-paper h1{max-width:285px;margin:5px 0 9px;color:var(--gn-green-dark);font-family:var(--gn-font-display);font-size:25px;line-height:1.23}.body-copy{position:relative;z-index:1;max-width:300px;margin:0;color:var(--gn-text);font-size:14px;line-height:1.72;white-space:pre-wrap}.tag-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}.tag-row span{padding:4px 8px;border-radius:999px;background:var(--gn-green-light);color:var(--gn-green-dark);font-size:11px}.later-card,.snippet-card{padding:16px}.section-label{display:flex;align-items:center;gap:9px;color:var(--gn-green);font-size:12px}.section-label i{display:block;flex:1;border-top:1px dashed var(--gn-border)}.later-card h2,.attempt-grid h2,.snippet-card h2,.request-panel h2{margin:7px 0;color:var(--gn-text);font-size:17px}.later-card p,.snippet-card p,.request-panel>p{margin:0;color:var(--gn-subtext);font-size:13px;line-height:1.62}.later-card .reflection{margin-top:8px;color:var(--gn-text)}.attempt-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.attempt-grid article{padding:13px}.attempt-icon{display:grid;place-items:center;width:25px;height:25px;border-radius:50%;font-weight:700}.attempt-icon.good{background:var(--gn-green-light);color:var(--gn-green)}.attempt-icon.soft{background:#f8eedf;color:#a67755}.attempt-grid h2{font-size:14px}.attempt-grid ul{margin:0;padding-left:15px;color:var(--gn-subtext);font-size:12px;line-height:1.55}.snippet-card{display:grid;gap:8px}.snippet-card h2{margin:0}.snippet-card p{padding-bottom:8px;border-bottom:1px solid var(--gn-border);font-size:13px}.request-callout{display:grid;grid-template-columns:29px minmax(0,1fr) auto;align-items:center;gap:9px;padding:12px 14px}.request-callout>span{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--gn-green-light);color:var(--gn-green)}.request-callout div{display:grid;gap:3px}.request-callout strong{color:var(--gn-text);font-size:14px}.request-callout p{margin:0;color:var(--gn-subtext);font-size:11px;line-height:1.45}.request-callout>button{min-height:37px;border:0;border-radius:999px;background:var(--gn-green);color:#fff;padding:0 11px;font:inherit;font-size:12px;cursor:pointer}.request-sheet{position:fixed;z-index:20;inset:0;display:grid;align-items:end;padding:16px;background:rgba(14,31,34,.43)}.request-panel{display:grid;gap:11px;width:100%;max-width:388px;margin:0 auto;border-radius:26px;background:#fffdf8;padding:20px}.sheet-heading{display:flex;align-items:start;justify-content:space-between;gap:12px}.sheet-heading span{color:var(--gn-green);font-size:12px}.sheet-heading h2{margin:4px 0 0}.sheet-heading button{width:32px;min-height:32px;border:1px solid var(--gn-border);border-radius:50%;background:#fffef9;color:var(--gn-green-dark);font-size:22px;line-height:1;cursor:pointer}.request-panel label{display:grid;gap:6px;color:var(--gn-text);font-size:13px}.request-panel textarea,.request-panel input{box-sizing:border-box;width:100%;border:1px solid var(--gn-border);border-radius:13px;background:#fffef9;padding:9px;color:var(--gn-text);font:inherit;line-height:1.55}.request-panel textarea{min-height:72px;resize:none}.request-panel>button{min-height:48px;border:0;border-radius:999px;background:var(--gn-green);color:#fff;font:inherit;cursor:pointer}.request-panel>button:disabled{opacity:.6}.state-note,.error-note{padding:24px;color:var(--gn-subtext);text-align:center}.error-note{color:var(--gn-danger)}
.detail-hero{position:relative;overflow:hidden}.detail-hero::after{position:absolute;right:0;bottom:0;width:205px;height:126px;background:url('../assets/goodnight/peer/peer-night-hero.png') right bottom/auto 126px no-repeat;content:'';opacity:.92;pointer-events:none;-webkit-mask-image:linear-gradient(90deg,transparent 0%,#000 36%,#000);mask-image:linear-gradient(90deg,transparent 0%,#000 36%,#000)}.detail-hero>*{position:relative;z-index:1}
.peer-detail-page{align-content:start;padding-bottom:142px}
.request-sheet{z-index:120}
</style>
