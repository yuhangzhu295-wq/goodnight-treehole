<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { SupportIntent } from '@goodnight/shared-types';
import { api } from '../api';
import SituationConfirmation from '../components/journey/SituationConfirmation.vue';
import EmotionTemperature from '../components/journey/EmotionTemperature.vue';
import SupportIntentPicker from '../components/journey/SupportIntentPicker.vue';
import JourneyTimeline from '../components/journey/JourneyTimeline.vue';
import StabilizePanel from '../components/support/StabilizePanel.vue';

type Snapshot = { confidence: string; facts: string[]; feelings: string[]; needs: string[]; constraints: string[]; risks: string[]; behaviorSignals: string[]; intensity?: number; urgency?: number };
type Update = { id: string; kind: string; content: string; createdAt: string; intensity?: number; payload?: Record<string, unknown> };
type Detail = { journey: { id: string; title: string; domain: string; stage: string; status: string; currentIntent?: SupportIntent; initialIntensity?: number; intensity?: number; createdAt: string; summary?: string }; snapshot: Snapshot | null; updates: Update[]; commitments: Array<{ id: string; title: string; status: string }> };

const route = useRoute();
const router = useRouter();
const detail = ref<Detail | null>(null);
const loading = ref(true);
const busy = ref(false);
const analysisBusy = ref(false);
const error = ref('');
const flowStep = ref<'confirm' | 'temperature' | 'intent' | 'stabilize' | 'timeline'>('confirm');
const later = ref('');

const journeyId = computed(() => String(route.query.id ?? ''));
const intensity = computed(() => detail.value?.snapshot?.intensity ?? detail.value?.journey.intensity);
const chronologicalUpdates = computed(() => [...(detail.value?.updates ?? [])].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)));

function inferStep() {
  if (route.query.mode === 'stabilize') { flowStep.value = 'stabilize'; return; }
  if (route.query.mode === 'intent') { flowStep.value = 'intent'; return; }
  if (!detail.value?.snapshot || detail.value.snapshot.confidence !== 'user_confirmed') { flowStep.value = 'confirm'; return; }
  if (!detail.value.journey.currentIntent) { flowStep.value = 'temperature'; return; }
  if (detail.value.journey.currentIntent === 'JUST_LISTEN') { flowStep.value = 'stabilize'; return; }
  flowStep.value = 'timeline';
}

async function load({ infer = true } = {}) {
  if (!journeyId.value) { error.value = '缺少这段经历的编号'; loading.value = false; return; }
  loading.value = true; error.value = '';
  try { detail.value = (await api.get<{ item: Detail }>(`/api/v1/journeys/${journeyId.value}`)).item; if (infer) inferStep(); } catch (cause) { error.value = cause instanceof Error ? cause.message : '这段经历暂时没有打开'; } finally { loading.value = false; }
}

const sleep = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
async function waitForAnalysis(jobId: string) {
  analysisBusy.value = true;
  try {
    for (let attempt = 0; attempt < 36; attempt += 1) {
      const task = await api.get<{ status: string }>(`/api/v1/ai/tasks/${jobId}`);
      if (['succeeded', 'fallback', 'failed'].includes(task.status)) { if (task.status === 'failed') error.value = '这次整理暂时没有完成，你可以根据原话自己改一处。'; break; }
      await sleep(500);
    }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '经历整理状态没有更新'; } finally { analysisBusy.value = false; await load(); }
}

async function confirmSituation(payload: { facts: string[]; feelings: string[]; needs: string[]; constraints: string[] }) {
  if (!detail.value) return;
  busy.value = true; error.value = '';
  try { await api.patch(`/api/v1/journeys/${detail.value.journey.id}/situation`, payload); await load({ infer: false }); flowStep.value = 'temperature'; } catch (cause) { error.value = cause instanceof Error ? cause.message : '这次确认没有保存'; } finally { busy.value = false; }
}

async function reanalyze() {
  if (!detail.value) return;
  busy.value = true; error.value = '';
  try { const response = await api.post<{ job: { id: string } }>(`/api/v1/journeys/${detail.value.journey.id}/situation/reanalyze`, {}); await waitForAnalysis(response.job.id); } catch (cause) { error.value = cause instanceof Error ? cause.message : '重新整理没有启动'; } finally { busy.value = false; }
}

async function saveTemperature(payload: { intensity: number; symptoms: string[]; thought: string }) {
  if (!detail.value?.snapshot) return;
  busy.value = true; error.value = '';
  try {
    const signals = [...payload.symptoms.map((item) => `身体感觉：${item}`), ...(payload.thought.trim() ? [`脑子里最吵的一句：${payload.thought.trim()}`] : [])];
    await api.patch(`/api/v1/journeys/${detail.value.journey.id}/situation`, { intensity: payload.intensity, behaviorSignals: signals });
    await load({ infer: false }); flowStep.value = 'intent';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '情绪记录没有保存'; } finally { busy.value = false; }
}

async function chooseIntent(intent: SupportIntent) {
  if (!detail.value) return;
  busy.value = true; error.value = '';
  try {
    const response = await api.patch<{ route: { targetRoute: string } }>(`/api/v1/journeys/${detail.value.journey.id}/intent`, { intent });
    if (response.route.targetRoute === '/pages/safety/index') { await router.push(`/pages/safety/index?journeyId=${detail.value.journey.id}`); return; }
    if (intent === 'JUST_LISTEN') { await router.push(`/pages/journey/detail?id=${detail.value.journey.id}&mode=stabilize`); return; }
    const target = response.route.targetRoute;
    await router.push(target.includes('?') ? `${target}&journeyId=${detail.value.journey.id}` : `${target}?journeyId=${detail.value.journey.id}`);
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '这项需要没有保存'; } finally { busy.value = false; }
}

async function saveLater() {
  if (!detail.value || !later.value.trim()) return;
  busy.value = true;
  try { await api.post(`/api/v1/journeys/${detail.value.journey.id}/updates`, { kind: 'later', content: later.value.trim() }); later.value = ''; await load({ infer: false }); } catch (cause) { error.value = cause instanceof Error ? cause.message : '后来记录没有保存'; } finally { busy.value = false; }
}

watch(() => [route.query.id, route.query.mode], () => {
  void load();
});

onMounted(async () => {
  await load();
  const job = typeof route.query.analysisJob === 'string' ? route.query.analysisJob : '';
  if (job) await waitForAnalysis(job);
});
</script>

<template>
  <section class="goodnight-page journey-page">
    <header class="journey-hero"><button class="back-button" aria-label="返回" @click="router.back()">‹</button><div><p>晚安树洞 · 一段经历</p><h1>{{ detail?.journey.title || '我理解的是这些，对吗？' }}</h1><small v-if="detail">{{ detail.journey.domain }} · {{ detail.journey.stage }}</small></div></header>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <p v-if="loading && !detail" class="loading-note">正在打开这段经历…</p>
    <template v-if="detail">
      <SituationConfirmation v-if="flowStep === 'confirm' && detail.snapshot" :snapshot="detail.snapshot" :busy="busy" :analyzing="analysisBusy" @confirm="confirmSituation" @reanalyze="reanalyze" />
      <EmotionTemperature v-else-if="flowStep === 'temperature'" @save="saveTemperature" @skip="flowStep = 'intent'" />
      <SupportIntentPicker v-else-if="flowStep === 'intent'" :busy="busy" :intensity="intensity" @choose="chooseIntent" />
      <StabilizePanel v-else-if="flowStep === 'stabilize'" :journey-id="detail.journey.id" />
      <template v-else>
        <JourneyTimeline :title="detail.journey.title" :created-at="detail.journey.createdAt" :initial-intensity="detail.journey.initialIntensity" :current-intensity="intensity" :updates="chronologicalUpdates" :busy="busy" @later="flowStep = 'timeline'" @action="router.push(`/pages/action/index?journeyId=${detail.journey.id}`)" />
        <section class="later-card"><label><span>写下后来呢</span><textarea v-model="later" maxlength="1000" placeholder="不需要完整，写下一点变化或这一步带来的感觉。" /></label><div><small>{{ later.length }}/1000</small><button :disabled="busy || !later.trim()" @click="saveLater">保存</button></div></section>
        <button class="change-support" @click="flowStep = 'intent'">换一种支持</button>
      </template>
    </template>
  </section>
</template>

<style scoped>
.journey-page{display:grid;gap:16px;padding:0 14px 142px;background:#f4efe3}.journey-hero{position:relative;display:flex;gap:12px;align-items:start;min-height:210px;margin:0 -14px;overflow:hidden;padding:22px 18px;background:radial-gradient(circle at 74% 68%,rgba(231,172,120,.5),transparent 24%),linear-gradient(165deg,#101d2a,#293a47 52%,#74685d)}.journey-hero::after{position:absolute;right:-5px;bottom:-20px;width:184px;height:184px;background:url('../assets/goodnight/tree-top-cutout.png') right bottom/contain no-repeat;opacity:.45;content:'';filter:brightness(.7);pointer-events:none}.journey-hero>div,.back-button{position:relative;z-index:1}.back-button{display:grid;place-items:center;width:38px;height:38px;border:1px solid rgba(255,255,255,.28);border-radius:50%;background:rgba(255,255,255,.1);color:#fff;font-size:32px;line-height:1;cursor:pointer}.journey-hero p,.journey-hero small{margin:0;color:rgba(255,250,240,.76);font-size:13px}.journey-hero h1{max-width:255px;margin:48px 0 8px;color:#fffaf1;font-family:var(--gn-font-display);font-size:31px;line-height:1.22}.error-text{margin:0;color:var(--gn-danger)}.loading-note{margin:0;padding:20px;color:#69745f;text-align:center}.later-card{display:grid;gap:10px;border-radius:24px;background:#fffdf8;padding:20px;box-shadow:0 18px 36px rgba(25,37,30,.12)}.later-card label{display:grid;gap:9px;color:#405b3d;font-size:16px}.later-card textarea{min-height:112px;width:100%;border:1px solid rgba(95,127,62,.17);border-radius:14px;background:#fffefa;padding:11px;color:#2e3e32;font:inherit;line-height:1.6;resize:none}.later-card>div{display:flex;align-items:center;justify-content:space-between;color:#7c8579;font-size:12px}.later-card button{min-width:84px;min-height:38px;border:0;border-radius:12px;background:#4e714d;color:#fff;font:inherit;cursor:pointer}.later-card button:disabled{opacity:.55;cursor:wait}.change-support{min-height:44px;border:1px solid rgba(95,127,62,.22);border-radius:15px;background:transparent;color:#4e6d48;font:inherit;cursor:pointer}
</style>
