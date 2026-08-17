<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

type Journey = { id: string; title: string; domain: string; stage: string; summary?: string };
type TonightItem = { journey: Journey | null; activeActions: Array<{ id: string; title: string }>; counts: { activeActions: number; dueCheckins: number; followUps: number; matches: number } };
type Notice = { id: string; title: string; body: string; targetRoute?: string; status: string };

const router = useRouter();
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const home = ref<TonightItem | null>(null);
const notices = ref<Notice[]>([]);
const relationSheet = ref(false);
const selectedRelation = ref('');
const form = ref({ domain: '其他', content: '' });
const shortcuts = ['感情', '工作', '家里', '睡不着', '孤独', '说不清'];
const relationScenes = ['刚分手', '放不下', '想联系 TA', '吵架了', '暧昧很累', '被背叛', '不知道要不要继续'];
const unreadCount = computed(() => notices.value.filter((item) => item.status === 'unread').length);

async function load() {
  loading.value = true; error.value = '';
  try {
    const [tonight, notification] = await Promise.all([api.get<{ item: TonightItem }>('/api/v1/tonight'), api.get<{ items: Notice[] }>('/api/v1/notifications')]);
    home.value = tonight.item;
    notices.value = notification.items;
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '今晚的内容暂时没有加载出来'; } finally { loading.value = false; }
}

function chooseShortcut(value: string) {
  if (value === '感情') { form.value.domain = '关系'; relationSheet.value = true; return; }
  form.value.domain = ({ 工作: '工作', 家里: '家庭', '睡不着': '睡眠', 孤独: '孤独', '说不清': '其他' } as Record<string, string>)[value] ?? '其他';
}

function chooseRelation(value: string) {
  selectedRelation.value = value;
  form.value.domain = '关系';
  relationSheet.value = false;
}

function shortcutSelected(value: string) {
  const domains: Record<string, string> = { 工作: '工作', 家里: '家庭', '睡不着': '睡眠', 孤独: '孤独', '说不清': '其他' };
  return (value === '感情' && form.value.domain === '关系') || domains[value] === form.value.domain;
}

async function createJourney() {
  if (!form.value.content.trim()) { error.value = '先写下一句也可以。'; return; }
  saving.value = true; error.value = '';
  try {
    const response = await api.post<{ journey: Journey; job: { id: string }; safety?: { needsRealWorldSupport?: boolean } }>('/api/v1/journeys', { domain: form.value.domain, relationScene: selectedRelation.value, content: form.value.content.trim() });
    if (response.safety?.needsRealWorldSupport) { await router.push(`/pages/safety/index?journeyId=${response.journey.id}`); return; }
    await router.push(`/pages/journey/detail?id=${response.journey.id}&analysisJob=${response.job.id}`);
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '这段经历暂时没有保存成功'; } finally { saving.value = false; }
}

async function openNotice(item: Notice) {
  try { await api.patch(`/api/v1/notifications/${item.id}/read`); } catch { error.value = '提醒状态没有更新成功'; return; }
  notices.value = notices.value.map((notice) => notice.id === item.id ? { ...notice, status: 'read' } : notice);
  if (item.targetRoute) await router.push(item.targetRoute);
}

onMounted(load);
</script>

<template>
  <section class="goodnight-page tonight-page">
    <header class="night-hero">
      <div class="hero-top"><span class="brand">◉ 晚安树洞</span><button class="notice-button" data-testid="notification-bell" aria-label="提醒与回访" @click="router.push('/pages/notifications/index')">♧<b v-if="unreadCount">{{ unreadCount > 9 ? '9+' : unreadCount }}</b></button></div>
      <div class="hero-copy"><h1>今晚怎么了？</h1><p>不用整理好再说，先把它放在这里。</p></div>
    </header>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <p v-if="loading" class="loading-note">正在把今晚的记录带回来…</p>
    <template v-else>
      <section class="entry-card" data-testid="tonight-entry">
        <label><span>把心里的话说给树洞听吧</span><textarea v-model="form.content" maxlength="1000" data-testid="tonight-input" placeholder="比如：我今天又想起他了，心里很乱，不知道该怎么办……" /></label>
        <div class="entry-footer"><span>◌ 你也可以只写一句。</span><small>{{ form.content.length }}/1000</small></div>
      </section>
      <div class="shortcut-row" aria-label="今晚从哪里开始"><button v-for="item in shortcuts" :key="item" type="button" :class="{ selected: shortcutSelected(item) }" @click="chooseShortcut(item)">{{ item }}</button></div>
      <section v-if="home?.journey" class="active-journey"><div><p>你已经在走的一段路</p><strong>{{ home.journey.title }}</strong><small>{{ home.journey.summary || '这件事还在这里，想继续时随时回来。' }}</small></div><button @click="router.push(`/pages/journey/detail?id=${home.journey?.id}`)">继续 ›</button></section>
      <section v-if="notices.some((item) => item.status === 'unread')" class="notice-preview"><button v-for="item in notices.filter((notice) => notice.status === 'unread').slice(0, 2)" :key="item.id" @click="openNotice(item)"><span><strong>{{ item.title }}</strong><small>{{ item.body }}</small></span><b>›</b></button></section>
      <section class="quiet-note"><span aria-hidden="true">♥</span><p>如果你不想立刻整理，我也可以先陪你待一会。</p></section>
      <button class="continue-button" data-testid="tonight-continue" :disabled="saving" @click="createJourney">{{ saving ? '正在开始整理…' : '继续' }}</button>
    </template>
    <Teleport to="body"><div v-if="relationSheet" class="sheet-mask" @click.self="relationSheet = false"><section class="relation-sheet" data-testid="relation-sheet"><span class="sheet-handle" /><header><h2>这段感情里，什么最让你难受？</h2><button aria-label="关闭" @click="relationSheet = false">×</button></header><div class="relation-list"><button v-for="scene in relationScenes" :key="scene" type="button" :class="{ selected: selectedRelation === scene }" @click="chooseRelation(scene)">{{ scene }}</button></div><button class="relation-other" @click="chooseRelation('其他')">说不清，也可以直接写</button></section></div></Teleport>
  </section>
</template>

<style scoped>
.tonight-page{display:grid;gap:14px;padding:0 14px 144px;background:#f6f1e5}.night-hero{position:relative;min-height:252px;margin:0 -14px;overflow:hidden;padding:20px 22px;background:radial-gradient(circle at 74% 67%,rgba(238,176,127,.54),transparent 25%),linear-gradient(165deg,#101d2a 0%,#243747 47%,#6e665b 100%)}.night-hero::after{position:absolute;right:-8px;bottom:-14px;width:205px;height:205px;background:url('../assets/goodnight/tree-top-cutout.png') right bottom/contain no-repeat;opacity:.52;content:'';pointer-events:none;filter:saturate(.74) brightness(.72)}.night-hero::before{position:absolute;inset:0;background:radial-gradient(circle at 85% 20%,#f8e5a3 0 3px,transparent 4px),radial-gradient(circle at 60% 13%,rgba(255,255,255,.75) 0 1px,transparent 2px),radial-gradient(circle at 25% 36%,rgba(255,255,255,.5) 0 1px,transparent 2px);content:'';pointer-events:none}.hero-top,.hero-copy{position:relative;z-index:1}.hero-top{display:flex;align-items:center;justify-content:space-between;color:#f9f5e8}.brand{font-size:14px}.notice-button{position:relative;border:0;background:transparent;color:#f8f4e6;font-size:24px;cursor:pointer}.notice-button b{position:absolute;right:-9px;top:-6px;min-width:17px;border-radius:9px;background:#bf6757;padding:2px;color:#fff;font-size:10px}.hero-copy{margin-top:70px}.hero-copy h1{margin:0;color:#fffaf0;font-family:var(--gn-font-display);font-size:39px;line-height:1.18}.hero-copy p{margin:10px 0 0;color:rgba(255,250,240,.8);font-size:15px}.entry-card{display:grid;gap:10px;margin-top:-48px;border-radius:25px;background:rgba(255,253,247,.97);padding:19px;box-shadow:0 17px 36px rgba(25,38,42,.19)}.entry-card label{display:grid;gap:10px;color:#697a5c;font-size:14px}.entry-card textarea{min-height:158px;width:100%;border:1px solid rgba(98,126,79,.15);border-radius:14px;background:#fffdfa;padding:13px;color:#334036;font:inherit;line-height:1.7;resize:none}.entry-footer{display:flex;justify-content:space-between;color:#899083;font-size:12px}.shortcut-row{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 7px;scrollbar-width:none}.shortcut-row::-webkit-scrollbar{display:none}.shortcut-row button{flex:0 0 auto;min-height:38px;border:1px solid rgba(95,127,62,.16);border-radius:999px;background:#fffdf8;padding:8px 14px;color:#586e50;font:inherit;white-space:nowrap;cursor:pointer}.shortcut-row button.selected{border-color:#4e704d;background:#4e704d;color:#fff}.active-journey{display:flex;align-items:center;justify-content:space-between;gap:12px;border-radius:18px;background:#fffdf8;padding:15px 16px;box-shadow:0 8px 18px rgba(44,58,42,.08)}.active-journey p,.active-journey small{display:block;margin:0;color:#7a8177;font-size:12px}.active-journey strong{display:block;margin:4px 0;color:#2d4330}.active-journey button{border:0;background:transparent;color:#4b6a46;font:inherit;cursor:pointer}.notice-preview{display:grid;border-radius:18px;background:#fffdf8;padding:2px 15px;box-shadow:0 8px 18px rgba(44,58,42,.08)}.notice-preview button{display:flex;align-items:center;justify-content:space-between;gap:12px;border:0;border-bottom:1px solid rgba(95,127,62,.12);background:transparent;padding:13px 0;color:#354b36;text-align:left;font:inherit;cursor:pointer}.notice-preview button:last-child{border-bottom:0}.notice-preview strong,.notice-preview small{display:block}.notice-preview small{margin-top:3px;color:#7b8379;font-size:12px;line-height:1.45}.quiet-note{display:flex;gap:10px;align-items:center;border-radius:17px;background:linear-gradient(120deg,#e6eadb,#f3eee1);padding:14px;color:#566b4d}.quiet-note span{display:grid;place-items:center;width:29px;height:29px;border-radius:50%;background:#587854;color:#fff}.quiet-note p{margin:0;line-height:1.55}.continue-button{min-height:51px;border:0;border-radius:16px;background:#496d49;color:#fff;font:inherit;box-shadow:0 12px 23px rgba(44,76,48,.24);cursor:pointer}.continue-button:disabled{opacity:.6;cursor:wait}.error-text{margin:0;color:var(--gn-danger)}.loading-note{margin:0;padding:20px;color:#65745e;text-align:center}.sheet-mask{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;background:rgba(8,18,22,.52)}.relation-sheet{display:grid;gap:18px;width:min(430px,100vw);max-height:78vh;overflow:auto;border-radius:26px 26px 0 0;background:#fffaf1;padding:14px 18px calc(24px + env(safe-area-inset-bottom));box-shadow:0 -18px 46px rgba(0,0,0,.25)}.sheet-handle{justify-self:center;width:48px;height:5px;border-radius:999px;background:rgba(60,71,57,.22)}.relation-sheet header{display:flex;align-items:start;justify-content:space-between;gap:12px}.relation-sheet h2{margin:0;color:#304930;font-size:21px;line-height:1.4}.relation-sheet header button{width:30px;height:30px;border:0;border-radius:50%;background:#edf1e4;color:#405c3d;font-size:20px;cursor:pointer}.relation-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.relation-list button,.relation-other{min-height:48px;border:1px solid rgba(95,127,62,.18);border-radius:14px;background:#fffdf8;padding:10px;color:#4a6442;font:inherit;cursor:pointer}.relation-list button.selected{background:#5a7b51;color:#fff}.relation-other{background:transparent}@media(max-width:350px){.relation-list{grid-template-columns:1fr}.hero-copy h1{font-size:34px}}
</style>
