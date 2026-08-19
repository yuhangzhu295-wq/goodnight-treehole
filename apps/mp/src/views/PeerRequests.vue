<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

type RequestItem = { id: string; status: string; requestReason?: string; requestQuestion?: string; experience?: { title?: string; domain?: string } };
const router = useRouter();
const items = ref<RequestItem[]>([]);
const loading = ref(true);
const busyId = ref('');
const error = ref('');
const pending = computed(() => items.value.filter((item) => item.status === 'requested'));
const accepted = computed(() => items.value.filter((item) => item.status === 'connected'));

async function load() { loading.value = true; try { items.value = (await api.get<{ items: RequestItem[] }>('/api/v1/peer-requests')).items; } catch (cause) { error.value = cause instanceof Error ? cause.message : '请求加载失败'; } finally { loading.value = false; } }
async function respond(item: RequestItem, status: 'connected' | 'declined' | 'blocked') { busyId.value = item.id; error.value = ''; try { await api.post(`/api/v1/peer-matches/${encodeURIComponent(item.id)}/respond`, { status }); if (status === 'connected') await router.push(`/pages/peer/consent?matchId=${encodeURIComponent(item.id)}`); else await load(); } catch (cause) { error.value = cause instanceof Error ? cause.message : '请求处理失败'; } finally { busyId.value = ''; } }
function openConsent(item: RequestItem) { router.push(`/pages/peer/consent?matchId=${encodeURIComponent(item.id)}`); }
onMounted(load);
</script>

<template>
  <section class="goodnight-page peer-requests-page">
    <header class="request-hero"><div><span>匿名同路</span><h1>我的请求</h1><p>你可以慢一点决定，也可以随时结束。</p></div></header>
    <div class="request-tabs"><button type="button" class="active">收到的请求 <b>{{ pending.length }}</b></button><button type="button" @click="router.push('/pages/peers/index')">推荐给你</button></div>
    <p v-if="error" class="error-note">{{ error }}</p><p v-if="loading" class="state-note">正在读取请求…</p>
    <template v-else>
      <section v-if="pending.length" class="request-list"><article v-for="item in pending" :key="item.id" class="request-card"><div class="request-icon">⌘</div><div class="request-main"><p class="request-kicker">有人想听听你的后来</p><h2>{{ item.experience?.title || '一段匿名经历' }}</h2><p>{{ item.requestReason || '对方看见了你留下的后来。' }}</p><blockquote v-if="item.requestQuestion">“{{ item.requestQuestion }}”</blockquote><div class="request-actions"><button :disabled="busyId === item.id" class="accept" @click="respond(item, 'connected')">我愿意聊聊</button><button :disabled="busyId === item.id" @click="respond(item, 'declined')">这次先不了</button><button :disabled="busyId === item.id" class="text-only" @click="respond(item, 'blocked')">暂时不想</button></div></div></article></section>
      <section v-else class="empty-card"><span>☾</span><h2>还没有新的请求</h2><p>有人看见你的后来时，会先把请求放在这里，等你自己决定。</p></section>
      <section v-if="accepted.length" class="accepted-card"><h2>等待你确认边界</h2><p>你已表示愿意，但会话还没开始。请再次确认匿名同行规则。</p><button v-for="item in accepted" :key="item.id" @click="openConsent(item)">确认这段同行 <b>›</b></button></section>
    </template>
  </section>
</template>

<style scoped>
.peer-requests-page{display:grid;gap:15px;padding:0 16px 142px;background:linear-gradient(180deg,#213e42 0 184px,#fbf8ef 184px)}.request-hero{min-height:170px;margin:0 -16px;padding:28px 24px;color:#f8f1dd;background:linear-gradient(145deg,#172d34,#3d5d56)}.request-hero span{font-size:12px;letter-spacing:.08em}.request-hero h1{margin:33px 0 6px;font-family:var(--gn-font-display);font-size:32px}.request-hero p{margin:0;color:#dbe5d2;font-size:13px}.request-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:-9px;padding:6px;border:1px solid var(--gn-border);border-radius:999px;background:#fffdfa;box-shadow:var(--gn-shadow-card)}.request-tabs button{min-height:40px;border:0;border-radius:999px;background:transparent;color:var(--gn-subtext);font:inherit;cursor:pointer}.request-tabs .active{background:var(--gn-green);color:#fff}.request-tabs b{font-size:12px}.request-list{display:grid;gap:12px}.request-card,.empty-card,.accepted-card{border:1px solid var(--gn-border);border-radius:24px;background:var(--gn-card);box-shadow:var(--gn-shadow-card)}.request-card{display:grid;grid-template-columns:42px minmax(0,1fr);gap:12px;padding:19px}.request-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--gn-green-light);color:var(--gn-green);font-size:22px}.request-kicker{margin:0;color:var(--gn-green);font-size:12px}.request-main h2{margin:6px 0;color:var(--gn-text);font-size:19px}.request-main>p:not(.request-kicker){margin:0;color:var(--gn-subtext);line-height:1.7}.request-main blockquote{margin:12px 0;padding:10px;border-left:2px solid var(--gn-green);background:#f7f4ea;color:var(--gn-text);line-height:1.6}.request-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:15px}.request-actions button,.accepted-card button{min-height:40px;border:1px solid var(--gn-border);border-radius:999px;background:#fffef9;color:var(--gn-green-dark);padding:0 13px;font:inherit;cursor:pointer}.request-actions .accept{border-color:var(--gn-green);background:var(--gn-green);color:#fff}.request-actions .text-only{border:0;background:transparent;padding:0;color:var(--gn-subtext)}.empty-card{padding:30px 24px;text-align:center}.empty-card span{color:var(--gn-green);font-size:32px}.empty-card h2,.accepted-card h2{margin:8px 0;color:var(--gn-text);font-size:20px}.empty-card p,.accepted-card p{margin:0;color:var(--gn-subtext);line-height:1.7}.accepted-card{display:grid;gap:12px;padding:20px}.accepted-card h2{margin:0}.accepted-card button{display:flex;align-items:center;justify-content:space-between;text-align:left}.accepted-card b{font-size:23px;font-weight:400}.state-note,.error-note{margin:16px 0;color:var(--gn-subtext);text-align:center}.error-note{color:var(--gn-danger)}
.request-hero{position:relative;overflow:hidden}.request-hero::after{position:absolute;right:-12px;bottom:-16px;width:208px;height:178px;background:url('../assets/goodnight/peer/peer-night-tree.png') right bottom/contain no-repeat;content:'';opacity:.8;pointer-events:none;-webkit-mask-image:radial-gradient(ellipse at 100% 0%,#000 42%,transparent 88%);mask-image:radial-gradient(ellipse at 100% 0%,#000 42%,transparent 88%)}.request-hero>div{position:relative;z-index:1}
</style>
