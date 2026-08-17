<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { SupportIntent } from '@goodnight/shared-types';
import { api } from '../api';

type Journey = { id: string; title: string; domain: string; stage: string; currentIntent?: SupportIntent; summary?: string };
type TonightItem = { journey: Journey | null; activeActions: Array<{ id: string; title: string }>; dueCheckins: Array<{ id: string; commitmentId?: string }>; followUps: Array<{ id: string; kind: string }>; matches: Array<{ id: string }>; counts: { activeActions: number; dueCheckins: number; followUps: number; matches: number } };
type Notification = { id: string; title: string; body: string; targetRoute?: string; status: string };

const router = useRouter();
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const home = ref<TonightItem | null>(null);
const notifications = ref<Notification[]>([]);
const form = ref({ domain: '其他', scenario: '', relationScene: '', content: '' });
const sceneCategories = ['感情', '工作', '家庭', '金钱', '学业', '睡眠', '孤独', '说不清，就是很难受'];
const scenarios = ['最近发生的事', '反复想起的事', '今晚必须面对的事', '还说不清楚'];
const relationScenes = ['刚分手', '放不下', '想联系 TA', '吵架了', '暧昧让我很累', '被背叛', '不知道要不要继续', '其他'];
const timeLabel = computed(() => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()));

async function load() {
  loading.value = true; error.value = '';
  try {
    const [tonight, notice] = await Promise.all([api.get<{ item: TonightItem }>('/api/v1/tonight'), api.get<{ items: Notification[] }>('/api/v1/notifications')]);
    home.value = tonight.item; notifications.value = notice.items.filter((item) => item.status === 'unread').slice(0, 2);
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '今晚内容加载失败'; } finally { loading.value = false; }
}

async function createJourney() {
  if (!form.value.content.trim()) { error.value = '先写下今晚想处理的一件事'; return; }
  saving.value = true; error.value = '';
  try {
    const response = await api.post<{ journey: Journey }>('/api/v1/journeys', { domain: form.value.domain, scenario: form.value.scenario, relationScene: form.value.relationScene, content: form.value.content });
    await router.push(`/pages/journey/detail?id=${response.journey.id}`);
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '旅程创建失败'; } finally { saving.value = false; }
}

function openNotification(item: Notification) {
  void api.patch(`/api/v1/notifications/${item.id}/read`).catch(() => undefined);
  if (item.targetRoute) void router.push(item.targetRoute);
}

onMounted(load);
</script>

<template>
  <section class="page goodnight-page modern-page tonight-page">
    <header class="modern-hero"><div class="status-row"><span>{{ timeLabel }}</span><span aria-label="今晚入口">今晚</span></div><p class="eyebrow">晚安树洞</p><h1>今晚怎么了？</h1><p>不用整理好再说。</p></header>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p><p v-if="loading" class="soft-note">正在读取今晚的记录...</p>
    <template v-else>
      <section v-if="notifications.length" class="notice-strip" aria-label="未读提醒"><button v-for="notice in notifications" :key="notice.id" class="notice-item" @click="openNotification(notice)"><span><strong>{{ notice.title }}</strong><small>{{ notice.body }}</small></span><b aria-hidden="true">›</b></button></section>
      <section v-if="home?.journey" class="modern-card journey-summary-card"><div class="card-heading"><div><span class="section-kicker">正在陪跑</span><h2>{{ home.journey.title }}</h2></div><span class="stage-badge">{{ home.journey.stage }}</span></div><p>{{ home.journey.summary || '情境正在整理，下一步会先由你确认。' }}</p><div class="metric-row"><span>{{ home.counts.activeActions }} 个进行中的行动</span><span>{{ home.counts.dueCheckins }} 个待回顾</span></div><button class="primary-button" @click="router.push(`/pages/journey/detail?id=${home.journey.id}`)">打开旅程</button></section>
      <section v-else class="modern-card create-journey-card"><span class="section-kicker">今晚的入口</span><h2>说说发生了什么</h2><p>不用先想好标题。你写下的原话会先由系统整理成一份经历指纹，之后交给你确认。</p><fieldset><legend>可以从一个入口开始，也可以跳过</legend><div class="choice-grid"><button v-for="item in sceneCategories" :key="item" type="button" :class="{ selected: form.domain === item || (item === '说不清，就是很难受' && form.domain === '其他') }" @click="form.domain = item === '说不清，就是很难受' ? '其他' : item">{{ item }}</button></div></fieldset><fieldset><legend>如果和一段关系有关</legend><div class="choice-grid relation-grid"><button v-for="item in relationScenes" :key="item" type="button" :class="{ selected: form.relationScene === item }" @click="form.relationScene = item">{{ item }}</button></div></fieldset><fieldset><legend>它更像哪一种时刻？</legend><div class="choice-grid"><button v-for="item in scenarios" :key="item" type="button" :class="{ selected: form.scenario === item }" @click="form.scenario = item">{{ item }}</button></div></fieldset><label>发生了什么<textarea v-model="form.content" maxlength="1000" placeholder="发生了什么都可以直接说，不需要先想好怎么表达。" /></label><div class="counter">{{ form.content.length }}/1000</div><button class="primary-button" :disabled="saving" @click="createJourney">{{ saving ? '正在整理...' : '开始整理这件事' }}</button></section>
      <section class="modern-card tonight-actions"><div class="card-heading"><h2>今晚的下一步</h2><button class="text-button" @click="router.push('/pages/action/index')">查看行动</button></div><div v-if="home?.activeActions?.length" class="action-list"><button v-for="action in home.activeActions" :key="action.id" @click="router.push(`/pages/action/index?journeyId=${home?.journey?.id ?? ''}`)"><span>{{ action.title }}</span><b>›</b></button></div><p v-else class="empty-note">还没有行动。先把一件事说清楚，下一步会从你的确认里长出来。</p></section>
      <section class="modern-card quiet-entry"><span>想看看有人后来怎么样了？</span><button class="outline-button" @click="router.push('/pages/peers/index')">进入同路</button></section>
    </template>
  </section>
</template>

<style scoped>
.modern-page { display: grid; gap: 16px; padding: 0 14px 150px; }.modern-hero { position: relative; min-height: 214px; padding: 28px 12px 24px; overflow: hidden; border-radius: 0 0 34px 34px; background: linear-gradient(135deg, #f8f4e9 0%, #e9f0df 100%); }.modern-hero::after { position: absolute; right: -14px; bottom: -18px; width: 190px; height: 190px; background: url('../assets/goodnight/tree-top-cutout.png') center / cover no-repeat; opacity: .38; content: ''; pointer-events: none; }.modern-hero .status-row { position: relative; z-index: 1; display: flex; justify-content: space-between; font-weight: 700; }.eyebrow, .section-kicker { color: var(--gn-green); font-size: 12px; letter-spacing: .06em; }.modern-hero h1 { position: relative; z-index: 1; max-width: 290px; margin: 34px 0 8px; color: var(--gn-green-dark); font-family: var(--gn-font-display); font-size: 32px; line-height: 1.28; }.modern-hero p:last-child { position: relative; z-index: 1; margin: 0; color: var(--gn-subtext); }.modern-card, .notice-strip { border: 1px solid var(--gn-border); border-radius: var(--gn-radius-card); background: var(--gn-card); box-shadow: var(--gn-shadow-card); padding: 22px; }.modern-card h2 { margin: 6px 0 8px; color: var(--gn-text); font-size: 21px; }.modern-card p { color: var(--gn-subtext); line-height: 1.7; }.card-heading { display: flex; align-items: start; justify-content: space-between; gap: 10px; }.stage-badge { padding: 6px 10px; border-radius: var(--gn-radius-pill); background: var(--gn-green-light); color: var(--gn-green-dark); font-size: 12px; }.metric-row { display: flex; flex-wrap: wrap; gap: 10px 20px; margin: 18px 0; color: var(--gn-subtext); font-size: 13px; }.notice-strip { display: grid; gap: 8px; padding: 12px 16px; }.notice-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; padding: 10px 0; border: 0; border-bottom: 1px solid var(--gn-border); background: transparent; color: var(--gn-text); text-align: left; font: inherit; cursor: pointer; }.notice-item:last-child { border-bottom: 0; }.notice-item strong, .notice-item small { display: block; }.notice-item small { margin-top: 4px; color: var(--gn-subtext); line-height: 1.45; }.notice-item b { color: var(--gn-green); font-size: 22px; }label, fieldset { display: grid; gap: 8px; margin-top: 16px; color: var(--gn-subtext); font-size: 13px; }fieldset { border: 0; padding: 0; }legend { padding: 0; }input, select, textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--gn-border); border-radius: 16px; background: #fffdf8; padding: 12px 14px; color: var(--gn-text); font: inherit; }textarea { min-height: 124px; resize: none; line-height: 1.6; }.counter { margin-top: 6px; color: var(--gn-subtext); font-size: 12px; text-align: right; }.choice-grid { display: flex; flex-wrap: wrap; gap: 8px; }.choice-grid button { border: 1px solid var(--gn-border); border-radius: 999px; padding: 9px 12px; background: #fffdf8; color: var(--gn-green-dark); font: inherit; cursor: pointer; }.choice-grid button.selected { border-color: var(--gn-green); background: var(--gn-green); color: #fff; }.primary-button, .outline-button, .text-button { cursor: pointer; border: 0; font: inherit; }.primary-button { width: 100%; margin-top: 18px; border-radius: 18px; padding: 13px 18px; background: var(--gn-green); color: white; }.primary-button:disabled { opacity: .6; cursor: wait; }.outline-button { border: 1px solid var(--gn-border); border-radius: 18px; padding: 10px 14px; background: transparent; color: var(--gn-green-dark); }.text-button { background: transparent; color: var(--gn-green); }.action-list { display: grid; gap: 8px; }.action-list button { display: flex; justify-content: space-between; padding: 13px 0; border: 0; border-bottom: 1px solid var(--gn-border); background: transparent; color: var(--gn-text); text-align: left; font: inherit; cursor: pointer; }.empty-note { margin-bottom: 0; }.quiet-entry { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--gn-text); }.error-text { margin: 0 4px; color: var(--gn-danger); }
@media (max-width: 430px) { .modern-page { padding-inline: 10px; }.modern-hero h1 { font-size: 28px; }.modern-card { padding: 18px; }.quiet-entry { align-items: flex-start; flex-direction: column; }.quiet-entry .outline-button { width: 100%; } }
</style>
