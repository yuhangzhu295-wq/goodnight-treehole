<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

type Match = { id: string; status: string; experience?: { title?: string; domain?: string } };
const route = useRoute(); const router = useRouter(); const matchId = computed(() => String(route.query.matchId ?? ''));
const match = ref<Match | null>(null); const error = ref(''); let timer: number | undefined;
async function load() { try { const payload = (await api.get<{ item: { matches: Match[] } }>('/api/v1/peers')).item; match.value = payload.matches.find((item) => item.id === matchId.value) ?? null; if (match.value?.status === 'connected') { const conversations = await api.get<{ items: Array<{ matchId: string }> }>('/api/v1/peer-conversations'); if (conversations.items.some((item) => item.matchId === matchId.value)) await router.replace(`/pages/peer/conversation?matchId=${encodeURIComponent(matchId.value)}`); } } catch (cause: any) { error.value = cause?.message ?? '等待状态暂时无法更新'; } }
function back() { router.push('/pages/peers/index'); }
onMounted(() => { load(); timer = window.setInterval(load, 7000); }); onBeforeUnmount(() => { if (timer) window.clearInterval(timer); });
</script>

<template>
  <section class="goodnight-page peer-wait-page">
    <header class="wait-hero"><button aria-label="返回同路" @click="back">‹</button><div><span>匿名同路</span><h1>慢一点等一等</h1><p>请求已经安静地送到对方那里。</p></div></header>
    <article class="waiting-card"><div class="orbit"><span>⌘</span></div><p class="status-kicker">{{ match?.status === 'connected' ? '对方愿意聊聊' : '正在等待对方决定' }}</p><h2>{{ match?.experience?.title || '这段经历正在等待回应' }}</h2><p>对方可以接受、拒绝或暂时不想。只有对方再次确认匿名边界后，会话才会开始。</p><button type="button" @click="load">刷新状态</button></article>
    <section class="steps-card"><h2>一段同行会这样开始</h2><ol><li class="done"><b>1</b><span><strong>你递出请求</strong><small>你留下了想聊的原因和问题。</small></span></li><li :class="{ done: match?.status === 'connected' }"><b>2</b><span><strong>对方自己决定</strong><small>对方可以不解释地拒绝或暂时不想。</small></span></li><li :class="{ done: match?.status === 'connected' }"><b>3</b><span><strong>双方确认边界</strong><small>确认后才会开启最长 72 小时的匿名会话。</small></span></li></ol></section>
    <aside class="soft-tip"><span>☾</span><p>不用盯着倒计时。去喝口水，等回应自然发生。</p></aside><p v-if="error" class="error-note">{{ error }}</p>
  </section>
</template>

<style scoped>
.peer-wait-page{display:grid;gap:16px;padding:0 16px 142px;background:linear-gradient(180deg,#203d43 0 208px,#fbf8ef 208px)}.wait-hero{display:grid;grid-template-columns:40px 1fr;gap:10px;align-items:center;min-height:192px;color:#f8f1de}.wait-hero button{width:36px;height:36px;border:1px solid rgba(255,255,255,.35);border-radius:50%;background:transparent;color:#fff;font-size:28px;line-height:1;cursor:pointer}.wait-hero span{font-size:12px}.wait-hero h1{margin:13px 0 6px;font-family:var(--gn-font-display);font-size:32px}.wait-hero p{margin:0;color:#dbe5d2;font-size:13px}.waiting-card,.steps-card{border:1px solid var(--gn-border);border-radius:26px;background:var(--gn-card);box-shadow:var(--gn-shadow-card)}.waiting-card{display:grid;justify-items:center;padding:25px;text-align:center}.orbit{display:grid;place-items:center;width:72px;height:72px;border:1px solid rgba(95,127,62,.35);border-radius:50%;box-shadow:0 0 0 10px #f4f6ed}.orbit span{color:var(--gn-green);font-size:32px}.status-kicker{margin:20px 0 3px;color:var(--gn-green);font-size:13px}.waiting-card h2{margin:4px 0 10px;color:var(--gn-text);font-size:20px}.waiting-card p:not(.status-kicker){margin:0;color:var(--gn-subtext);line-height:1.75}.waiting-card button{min-height:42px;margin-top:17px;border:1px solid var(--gn-border);border-radius:999px;background:#fffef9;color:var(--gn-green-dark);padding:0 18px;font:inherit;cursor:pointer}.steps-card{padding:21px}.steps-card h2{margin:0 0 15px;color:var(--gn-text);font-size:18px}.steps-card ol{display:grid;gap:15px;margin:0;padding:0;list-style:none}.steps-card li{display:grid;grid-template-columns:28px 1fr;gap:10px;align-items:start}.steps-card li b{display:grid;place-items:center;width:27px;height:27px;border-radius:50%;background:#edf0e8;color:var(--gn-subtext);font-size:12px}.steps-card li.done b{background:var(--gn-green);color:#fff}.steps-card span{display:grid;gap:3px}.steps-card strong{color:var(--gn-text);font-size:14px}.steps-card small{color:var(--gn-subtext);font-size:12px;line-height:1.55}.soft-tip{display:flex;gap:10px;align-items:center;padding:15px;color:var(--gn-green-dark);background:#f3f5e9;border-radius:18px}.soft-tip span{font-size:22px}.soft-tip p{margin:0;line-height:1.65}.error-note{margin:0;color:var(--gn-danger);text-align:center}
.wait-hero{position:relative;overflow:hidden}.wait-hero::after{position:absolute;right:-11px;bottom:-10px;width:202px;height:174px;background:url('../assets/goodnight/peer/peer-night-tree.png') right bottom/contain no-repeat;content:'';opacity:.8;pointer-events:none;-webkit-mask-image:radial-gradient(ellipse at 100% 0%,#000 42%,transparent 88%);mask-image:radial-gradient(ellipse at 100% 0%,#000 42%,transparent 88%)}.wait-hero>*{position:relative;z-index:1}
</style>
