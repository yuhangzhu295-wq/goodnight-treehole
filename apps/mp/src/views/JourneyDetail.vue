<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { SupportIntent } from '@goodnight/shared-types';
import { api } from '../api';
import JourneyFlowShell from '../components/journey/JourneyFlowShell.vue';
import SituationConfirmationScreen from '../components/journey/SituationConfirmationScreen.vue';
import EmotionTemperatureScreen from '../components/journey/EmotionTemperatureScreen.vue';
import SupportIntentScreen from '../components/journey/SupportIntentScreen.vue';
import StabilizeScreen from '../components/journey/StabilizeScreen.vue';
import JourneyTimelineScreen from '../components/journey/JourneyTimelineScreen.vue';

type Snapshot = { confidence: string; facts: string[]; feelings: string[]; needs: string[]; constraints: string[]; risks: string[]; behaviorSignals: string[]; intensity?: number; urgency?: number };
type Update = { id: string; kind: string; content: string; createdAt: string; intensity?: number; payload?: Record<string, unknown> };
type Detail = { journey: { id: string; title: string; domain: string; stage: string; status: string; currentIntent?: SupportIntent; initialIntensity?: number; intensity?: number; createdAt: string; summary?: string }; snapshot: Snapshot | null; updates: Update[]; commitments: Array<{ id: string; title: string; status: string }> };
type FlowStep = 'confirm' | 'temperature' | 'intent' | 'stabilize' | 'timeline';

const route = useRoute();
const router = useRouter();
const detail = ref<Detail | null>(null);
const loading = ref(true);
const busy = ref(false);
const analysisBusy = ref(false);
const error = ref('');
const flowStep = ref<FlowStep>('confirm');
const later = ref('');

const journeyId = computed(() => String(route.query.id ?? ''));
const intensity = computed(() => detail.value?.snapshot?.intensity ?? detail.value?.journey.intensity);
const chronologicalUpdates = computed(() => [...(detail.value?.updates ?? [])].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)));
const sceneCopy = computed(() => {
  const journeyTitle = detail.value?.journey.title || '这段经历';
  const copy: Record<FlowStep, { title: string; subtitle: string }> = {
    confirm: { title: '我理解的是这些，对吗？', subtitle: '先确认一下，我们再继续。' },
    temperature: { title: '今晚现在有多难受？', subtitle: '先不分析，只感受一下此刻。' },
    intent: { title: '你现在最需要什么？', subtitle: '不一定马上解决，先选最贴近你此刻的一种。' },
    stabilize: { title: '我先接住你', subtitle: '今晚先不用解决，我们先让这一刻轻一点。' },
    timeline: { title: journeyTitle, subtitle: '先看见发生了什么，再慢慢往前走。' },
  };
  return copy[flowStep.value];
});

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

watch(() => [route.query.id, route.query.mode], () => { void load(); });
onMounted(async () => { await load(); const job = typeof route.query.analysisJob === 'string' ? route.query.analysisJob : ''; if (job) await waitForAnalysis(job); });
</script>

<template>
  <JourneyFlowShell :mode="flowStep" :title="sceneCopy.title" :subtitle="sceneCopy.subtitle" @back="router.back()">
    <p v-if="error" class="journey-error" role="alert">{{ error }}</p>
    <p v-if="loading && !detail" class="loading-note">正在打开这段经历…</p>
    <template v-if="detail">
      <SituationConfirmationScreen v-if="flowStep === 'confirm' && detail.snapshot" :snapshot="detail.snapshot" :busy="busy" :analyzing="analysisBusy" @confirm="confirmSituation" @reanalyze="reanalyze" />
      <EmotionTemperatureScreen v-else-if="flowStep === 'temperature'" @save="saveTemperature" @skip="flowStep = 'intent'" />
      <SupportIntentScreen v-else-if="flowStep === 'intent'" :busy="busy" :intensity="intensity" @choose="chooseIntent" />
      <StabilizeScreen v-else-if="flowStep === 'stabilize'" :journey-id="detail.journey.id" />
      <JourneyTimelineScreen v-else :title="detail.journey.title" :created-at="detail.journey.createdAt" :initial-intensity="detail.journey.initialIntensity" :current-intensity="intensity" :updates="chronologicalUpdates" :later="later" :busy="busy" @update:later="later = $event" @save-later="saveLater" @action="router.push(`/pages/action/index?journeyId=${detail.journey.id}`)" @change-support="flowStep = 'intent'" />
    </template>
  </JourneyFlowShell>
</template>

<style scoped>
.journey-error{margin:0;border-radius:14px;background:#fff0ed;padding:11px 13px;color:#ad4b41;font-size:14px}.loading-note{margin:0;border-radius:18px;background:rgba(255,253,247,.92);padding:28px 16px;color:#69745f;text-align:center}
</style>
