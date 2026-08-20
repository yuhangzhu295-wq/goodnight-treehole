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
      <article class="story-paper"><span class="story-dot" aria-hidden="true"></span><p class="eyebrow">当时 · {{ detail.experience.domain }} · 一段匿名经历</p><h1>{{ detail.experience.title }}</h1><p class="body-copy">{{ detail.experience.content }}</p><div class="tag-row"><span v-for="tag in detail.experience.tags" :key="tag">{{ tag }}</span></div></article>
      <article class="later-card"><div class="section-label"><span>后来</span><i></i></div><h2>TA 后来是这样走过来的</h2><p>{{ detail.later.summary || detail.later.message || '这段后来还在慢慢展开。' }}</p><p v-if="detail.retrospective" class="reflection">{{ detail.retrospective }}</p></article>
      <article v-if="detail.timeline.length" class="snippet-card"><div class="section-label"><span>走过的片段</span><i></i></div><p v-for="entry in detail.timeline" :key="entry.id">{{ entry.content }}</p></article>
      <section class="attempt-grid"><article><span class="attempt-icon good">✓</span><h2>有一点帮助的</h2><ul><li v-for="action in detail.helpfulActions" :key="action">{{ action }}</li><li v-if="!detail.helpfulActions.length">TA还没有留下具体方法。</li></ul></article><article><span class="attempt-icon soft">~</span><h2>不太适合的</h2><ul><li v-for="action in detail.notHelpfulActions" :key="action">{{ action }}</li><li v-if="!detail.notHelpfulActions.length">每个人的节奏都不一样。</li></ul></article></section>
      <section v-if="matchId" class="request-callout"><span aria-hidden="true">⌘</span><div><strong>想问问 TA 吗？</strong><p>先写下真正想知道的事，再把请求安静地递出去。</p></div><button type="button" @click="requestOpen = true">请求匿名交流</button></section>
      <section v-if="matchId && requestOpen" class="request-sheet" role="dialog" aria-modal="true" aria-labelledby="peer-request-title"><div class="request-panel"><div class="sheet-heading"><div><span>匿名同路</span><h2 id="peer-request-title">想问问 TA 吗？</h2></div><button type="button" aria-label="关闭请求面板" @click="requestOpen = false">×</button></div><p>不会展示昵称、联系方式或任何身份信息。</p><label>我为什么想聊 <textarea v-model="requestReason" maxlength="280" /></label><label>我最想问的一句 <input v-model="requestQuestion" maxlength="160"></label><button :disabled="requesting || !requestReason.trim()" @click="requestConversation">{{ requesting ? '正在递出请求…' : '递出匿名请求' }}</button></div></section>
    </template>
  </section>
</template>

<style scoped>
.peer-detail-page{display:grid;align-content:start;gap:11px;padding:0 16px 142px;background:#fbf8ef}.detail-hero{position:relative;display:grid;grid-template-columns:42px minmax(0,1fr) 42px;align-items:start;gap:0;min-height:108px;margin:0 -16px;padding:10px 20px;overflow:hidden;background:linear-gradient(180deg,#fffdf8 0 54px,#20393d 54px 100%)}.detail-hero button{position:relative;z-index:1;width:32px;height:32px;border:0;border-radius:50%;background:transparent;color:#3d543c;font-size:29px;line-height:1;cursor:pointer}.detail-hero div{position:relative;z-index:1;grid-column:2;display:grid;place-items:center;padding-top:7px;text-align:center}.detail-hero span{color:#344739;font-family:var(--gn-font-display);font-size:19px}.detail-hero small{display:none}.detail-hero::after{position:absolute;right:0;bottom:0;width:218px;height:62px;background:url('../assets/goodnight/peer/peer-night-hero.png') right bottom/auto 146px no-repeat;content:'';opacity:.92;pointer-events:none;-webkit-mask-image:linear-gradient(90deg,transparent 0%,#000 35%,#000);mask-image:linear-gradient(90deg,transparent 0%,#000 35%,#000)}.story-paper,.later-card,.snippet-card,.request-callout,.request-panel,.attempt-grid article{border:1px solid var(--gn-border);border-radius:20px;background:rgba(255,254,249,.95);box-shadow:var(--gn-shadow-card)}.story-paper{position:relative;padding:17px 17px 15px;overflow:hidden}.story-paper::after{position:absolute;right:-8px;bottom:-8px;width:138px;height:106px;background:url('../assets/goodnight/peer/peer-bench-scene.png') right bottom/contain no-repeat;opacity:.5;content:'';pointer-events:none}.story-dot{display:inline-block;width:20px;height:20px;border:1.5px solid var(--gn-green);border-radius:50% 50% 50% 5px;transform:rotate(-35deg)}.eyebrow{position:relative;z-index:1;margin:8px 0 0;color:var(--gn-green);font-size:11px}.story-paper h1{position:relative;z-index:1;max-width:272px;margin:5px 0 9px;color:#344d35;font-family:var(--gn-font-display);font-size:24px;font-weight:400;line-height:1.25}.body-copy{position:relative;z-index:1;max-width:284px;margin:0;color:var(--gn-text);font-size:13px;line-height:1.72;white-space:pre-wrap}.tag-row{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:6px;max-width:260px;margin-top:11px}.tag-row span{padding:4px 8px;border-radius:999px;background:#f2eee2;color:#786f62;font-size:10px}.later-card,.snippet-card{padding:15px 16px}.section-label{display:flex;align-items:center;gap:9px;color:var(--gn-green);font-size:12px}.section-label i{display:block;flex:1;border-top:1px dashed var(--gn-border)}.later-card h2,.attempt-grid h2,.request-panel h2{margin:7px 0;color:#334536;font-family:var(--gn-font-display);font-size:17px;font-weight:400}.later-card p,.snippet-card p,.request-panel>p{margin:0;color:var(--gn-subtext);font-size:13px;line-height:1.68}.later-card .reflection{margin-top:8px;color:var(--gn-text)}.snippet-card{display:grid;gap:8px}.snippet-card p{padding-bottom:8px;border-bottom:1px solid var(--gn-border);font-size:13px}.snippet-card p:last-child{padding-bottom:0;border-bottom:0}.attempt-grid{display:grid;grid-template-columns:1fr;gap:9px}.attempt-grid article{position:relative;min-height:76px;padding:13px 16px 12px 51px;overflow:hidden}.attempt-grid article::after{position:absolute;right:-9px;bottom:-10px;width:86px;height:70px;background:url('../assets/goodnight/peer/peer-bench-scene.png') right bottom/contain no-repeat;content:'';opacity:.24;pointer-events:none}.attempt-icon{position:absolute;left:16px;top:15px;display:grid;place-items:center;width:24px;height:24px;border-radius:50%;font-weight:700}.attempt-icon.good{background:var(--gn-green-light);color:var(--gn-green)}.attempt-icon.soft{background:#f8eedf;color:#a67755}.attempt-grid h2{position:relative;z-index:1;margin:0 0 4px;font-size:15px}.attempt-grid ul{position:relative;z-index:1;margin:0;padding-left:14px;color:var(--gn-subtext);font-size:12px;line-height:1.55}.request-callout{position:relative;display:grid;grid-template-columns:30px minmax(0,1fr);gap:9px;padding:14px 15px 13px;overflow:hidden}.request-callout::after{position:absolute;right:0;bottom:0;width:105px;height:74px;background:url('../assets/goodnight/peer/peer-bench-scene.png') right bottom/contain no-repeat;content:'';opacity:.28;pointer-events:none}.request-callout>span,.request-callout div,.request-callout>button{position:relative;z-index:1}.request-callout>span{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--gn-green-light);color:var(--gn-green)}.request-callout div{display:grid;gap:3px}.request-callout strong{color:var(--gn-text);font-size:14px}.request-callout p{margin:0;max-width:265px;color:var(--gn-subtext);font-size:11px;line-height:1.45}.request-callout>button{grid-column:1 / -1;min-height:42px;border:0;border-radius:999px;background:var(--gn-green);color:#fff;padding:0 11px;font:inherit;font-size:13px;cursor:pointer}.request-sheet{position:fixed;z-index:120;inset:0;display:grid;align-items:end;padding:16px;background:rgba(14,31,34,.43)}.request-panel{display:grid;gap:11px;width:100%;max-width:388px;margin:0 auto;border-radius:26px;background:#fffdf8;padding:20px}.sheet-heading{display:flex;align-items:start;justify-content:space-between;gap:12px}.sheet-heading span{color:var(--gn-green);font-size:12px}.sheet-heading h2{margin:4px 0 0}.sheet-heading button{width:32px;min-height:32px;border:1px solid var(--gn-border);border-radius:50%;background:#fffef9;color:var(--gn-green-dark);font-size:22px;line-height:1;cursor:pointer}.request-panel label{display:grid;gap:6px;color:var(--gn-text);font-size:13px}.request-panel textarea,.request-panel input{box-sizing:border-box;width:100%;border:1px solid var(--gn-border);border-radius:13px;background:#fffef9;padding:9px;color:var(--gn-text);font:inherit;line-height:1.55}.request-panel textarea{min-height:72px;resize:none}.request-panel>button{min-height:48px;border:0;border-radius:999px;background:var(--gn-green);color:#fff;font:inherit;cursor:pointer}.request-panel>button:disabled{opacity:.6}.state-note,.error-note{padding:24px;color:var(--gn-subtext);text-align:center}.error-note{color:var(--gn-danger)}
</style>
