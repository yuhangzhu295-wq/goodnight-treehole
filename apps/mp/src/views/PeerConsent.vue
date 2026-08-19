<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

const route = useRoute(); const router = useRouter(); const matchId = computed(() => String(route.query.matchId ?? ''));
const loading = ref(true); const busy = ref(false); const error = ref(''); const match = ref<any>(null);
async function load() { loading.value = true; try { match.value = (await api.get<any>('/api/v1/peer-requests')).items.find((item: any) => item.id === matchId.value) ?? null; } catch (cause: any) { error.value = cause?.message ?? '会话前信息没有加载成功'; } finally { loading.value = false; } }
async function consent() { if (!matchId.value) return; busy.value = true; error.value = ''; try { const response = await api.post<{ conversation: { matchId: string } }>(`/api/v1/peer-matches/${encodeURIComponent(matchId.value)}/consent`, {}); await router.replace(`/pages/peer/conversation?matchId=${encodeURIComponent(response.conversation.matchId)}`); } catch (cause: any) { error.value = cause?.message ?? '暂时无法开启会话'; } finally { busy.value = false; } }
onMounted(load);
</script>

<template>
  <section class="goodnight-page peer-consent-page">
    <header class="consent-hero"><button aria-label="返回请求" @click="router.back()">‹</button><div><span>匿名同路</span><h1>开始前，先确认边界</h1></div></header>
    <p v-if="loading" class="state-note">正在确认这段同行…</p>
    <article v-else class="consent-card"><div class="people"><span>⌘</span><i>↔</i><span>✦</span></div><h2>你们都没有义务继续</h2><p>你将以匿名身份进入一段限时会话。没有头像、昵称、联系方式或任何可识别信息。</p><ul><li>会话从此刻开始，最长 72 小时。</li><li>不交换联系方式，不询问真实身份或具体住址。</li><li>任何一方都可以结束、举报或拉黑，会话会立即停止。</li><li>AI 只能帮你整理草稿，内容不会自动发送。</li></ul><label class="confirm-row"><input type="checkbox" checked disabled><span>我理解并愿意遵守这些匿名边界。</span></label><button :disabled="busy || !match" @click="consent">{{ busy ? '正在开启…' : '同意并开始同行' }}</button><button class="later" :disabled="busy" @click="router.push('/pages/peer/requests')">我想再想想</button></article>
    <p v-if="error" class="error-note">{{ error }}</p>
  </section>
</template>

<style scoped>
.peer-consent-page{display:grid;gap:16px;padding:0 16px 142px;background:linear-gradient(180deg,#213c40 0 218px,#fbf8ef 218px)}.consent-hero{display:grid;grid-template-columns:40px 1fr;align-items:center;gap:10px;min-height:201px;color:#f8f1dc}.consent-hero button{width:36px;height:36px;border:1px solid rgba(255,255,255,.35);border-radius:50%;background:transparent;color:#fff;font-size:28px;line-height:1;cursor:pointer}.consent-hero span{font-size:12px}.consent-hero h1{margin:11px 0 0;font-family:var(--gn-font-display);font-size:31px;line-height:1.26}.consent-card{display:grid;gap:15px;margin-top:-15px;border:1px solid var(--gn-border);border-radius:28px;background:#fffdf7;box-shadow:var(--gn-shadow-card);padding:26px}.people{display:flex;align-items:center;justify-content:center;gap:12px}.people span{display:grid;place-items:center;width:58px;height:58px;border-radius:50%;background:var(--gn-green-light);color:var(--gn-green);font-size:27px}.people i{color:var(--gn-subtext);font-style:normal}.consent-card h2{margin:0;color:var(--gn-text);font-size:21px;text-align:center}.consent-card>p{margin:0;color:var(--gn-subtext);line-height:1.7;text-align:center}.consent-card ul{display:grid;gap:9px;margin:0;padding:0;list-style:none}.consent-card li{position:relative;padding-left:19px;color:var(--gn-text);font-size:13px;line-height:1.65}.consent-card li::before{position:absolute;left:0;color:var(--gn-green);content:'•'}.confirm-row{display:flex;gap:8px;align-items:start;padding:12px;border-radius:14px;background:#f2f5ea;color:var(--gn-green-dark);font-size:13px;line-height:1.55}.confirm-row input{accent-color:var(--gn-green);margin-top:3px}.consent-card button{min-height:50px;border:0;border-radius:999px;background:var(--gn-green);color:#fff;font:inherit;cursor:pointer}.consent-card .later{min-height:36px;background:transparent;color:var(--gn-subtext)}.state-note,.error-note{margin:0;color:var(--gn-subtext);text-align:center}.error-note{color:var(--gn-danger)}
.consent-hero{position:relative;overflow:hidden}.consent-hero::after{position:absolute;right:-12px;bottom:-12px;width:206px;height:178px;background:url('../assets/goodnight/peer/peer-night-tree.png') right bottom/contain no-repeat;content:'';opacity:.79;pointer-events:none;-webkit-mask-image:radial-gradient(ellipse at 100% 0%,#000 42%,transparent 88%);mask-image:radial-gradient(ellipse at 100% 0%,#000 42%,transparent 88%)}.consent-hero>*{position:relative;z-index:1}
</style>
