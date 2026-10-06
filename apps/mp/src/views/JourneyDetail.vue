<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { SupportIntent } from '@goodnight/shared-types';
import { api } from '../api';
import { aiDegradationNotice } from '../aiStatus';
import AiDegradationNotice from '../components/AiDegradationNotice.vue';
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
const aiNotice = ref('');
const flowStep = ref<FlowStep>('confirm');
const later = ref('');
const archiveConfirmationOpen = ref(false);

const journeyId = computed(() => String(route.query.id ?? ''));
const intensity = computed(() => detail.value?.snapshot?.intensity ?? detail.value?.journey.intensity);
const chronologicalUpdates = computed(() => [...(detail.value?.updates ?? [])].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)));
const sceneCopy = computed(() => {
  const journeyTitle = detail.value?.journey.title || '这段经历';
  const copy: Record<FlowStep, { title: string; subtitle: string }> = {
    confirm: { title: '确认以下记录是否准确', subtitle: '核对确认后继续后续流程。' },
    temperature: { title: '当前感受强度如何？', subtitle: '记录当前状态，暂不做分析。' },
    intent: { title: '当前最需要的支持方式？', subtitle: '选择最符合当前需要的一项。' },
    stabilize: { title: '情绪平复支持', subtitle: '暂时放下问题，先平复当前情绪。' },
    timeline: { title: journeyTitle, subtitle: '回顾事件经过与后续进展记录。' },
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
  aiNotice.value = '';
  try {
    for (let attempt = 0; attempt < 36; attempt += 1) {
      const task = await api.get<{ status: string }>(`/api/v1/ai/tasks/${jobId}`);
      if (['succeeded', 'fallback', 'failed'].includes(task.status)) {
        if (task.status === 'failed') error.value = '这次整理暂时没有完成，你可以根据原话自己改一处。';
        aiNotice.value = aiDegradationNotice(task);
        break;
      }
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

function requestArchive() {
  if (!detail.value || busy.value || detail.value.journey.status === 'archived') return;
  archiveConfirmationOpen.value = true;
}

// Journey graduation. `POST /journeys/:id/graduate` and `/graduation-consent` were fully
// implemented on the server and never called from the app, so a journey could never formally
// end and the anonymous-experience story had no UI (product audit ISSUE-011).
const graduateOpen = ref(false);
const graduateStep = ref<'confirm' | 'consent'>('confirm');
const graduateNotice = ref('');
const completedActions = computed(
  () => (detail.value?.commitments ?? []).filter((item: { status: string }) => item.status === 'completed').length,
);

function requestGraduate() {
  if (!detail.value || busy.value) return;
  graduateNotice.value = '';
  graduateStep.value = 'confirm';
  graduateOpen.value = true;
}

async function confirmGraduate() {
  if (!detail.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api.post(`/api/v1/journeys/${detail.value.journey.id}/graduate`, {});
    await load({ infer: false });
    graduateStep.value = 'consent';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '这段旅程暂时没有结束';
  } finally {
    busy.value = false;
  }
}

async function chooseConsent(decision: 'willing' | 'later' | 'no') {
  if (!detail.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api.post(`/api/v1/journeys/${detail.value.journey.id}/graduation-consent`, { decision });
    graduateOpen.value = false;
    graduateNotice.value =
      decision === 'willing'
        ? '谢谢你愿意把这段路留给后来的人。它会先经过审核，再以匿名形式出现。'
        : '这段旅程已经好好结束了。想分享的时候，随时可以回来。';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '这个选择暂时没有保存';
  } finally {
    busy.value = false;
  }
}

async function archiveJourney() {
  if (!detail.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api.patch(`/api/v1/journeys/${detail.value.journey.id}/status`, { status: 'archived' });
    archiveConfirmationOpen.value = false;
    await router.push('/pages/archive/index');
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '这段旅程暂时没有归档';
  } finally {
    busy.value = false;
  }
}

watch(() => [route.query.id, route.query.mode], () => { void load(); });
onMounted(async () => { await load(); const job = typeof route.query.analysisJob === 'string' ? route.query.analysisJob : ''; if (job) await waitForAnalysis(job); });
</script>

<template>
  <JourneyFlowShell :mode="flowStep" :title="sceneCopy.title" :subtitle="sceneCopy.subtitle" @back="router.back()">
    <p v-if="error" class="journey-error" role="alert">{{ error }}</p>
    <AiDegradationNotice :notice="aiNotice" />
    <p v-if="loading && !detail" class="loading-note">正在打开这段经历…</p>
    <template v-if="detail">
      <SituationConfirmationScreen v-if="flowStep === 'confirm' && detail.snapshot" :snapshot="detail.snapshot" :busy="busy" :analyzing="analysisBusy" @confirm="confirmSituation" @reanalyze="reanalyze" />
      <EmotionTemperatureScreen v-else-if="flowStep === 'temperature'" @save="saveTemperature" @skip="flowStep = 'intent'" />
      <SupportIntentScreen v-else-if="flowStep === 'intent'" :busy="busy" :intensity="intensity" @choose="chooseIntent" />
      <StabilizeScreen v-else-if="flowStep === 'stabilize'" :journey-id="detail.journey.id" />
      <template v-else>
        <JourneyTimelineScreen :title="detail.journey.title" :created-at="detail.journey.createdAt" :initial-intensity="detail.journey.initialIntensity" :current-intensity="intensity" :updates="chronologicalUpdates" :later="later" :busy="busy" @update:later="later = $event" @save-later="saveLater" @action="router.push(`/pages/action/index?journeyId=${detail.journey.id}`)" @change-support="flowStep = 'intent'" />
        <button v-if="detail.journey.status === 'active' || detail.journey.status === 'paused'" class="archive-trigger" data-testid="journey-archive-start" :disabled="busy" @click="requestArchive">归档这段旅程</button>
        <button
          v-if="completedActions > 0 && detail.journey.status !== 'completed' && detail.journey.status !== 'archived'"
          class="graduate-trigger"
          data-testid="journey-graduate-start"
          :disabled="busy"
          @click="requestGraduate"
        >
          走完了，结束这段旅程
        </button>
      </template>
    </template>
    <p v-if="graduateNotice" class="journey-notice" role="status" data-testid="journey-graduate-notice">{{ graduateNotice }}</p>
    <div v-if="graduateOpen" class="archive-confirm-mask" data-testid="journey-graduate-sheet">
      <section class="archive-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="journey-graduate-title">
        <template v-if="graduateStep === 'confirm'">
          <h2 id="journey-graduate-title">结束这段旅程？</h2>
          <p>你已经完成了 {{ completedActions }} 个小行动。结束不会删除任何记录，之后仍然可以在归档里回看。</p>
          <div>
            <button :disabled="busy" @click="graduateOpen = false">暂不结束</button>
            <button class="archive-confirm-primary" data-testid="journey-graduate-confirm" :disabled="busy" @click="confirmGraduate">确认结束</button>
          </div>
        </template>
        <template v-else>
          <h2 id="journey-graduate-title">愿意把这段路留给后来的人吗？</h2>
          <p>如果愿意，我们会先整理成一段完全匿名的经历，经过审核后才会出现。你随时可以说不。</p>
          <div class="graduate-choices">
            <button data-testid="journey-graduate-willing" :disabled="busy" @click="chooseConsent('willing')">愿意匿名分享</button>
            <button data-testid="journey-graduate-later" :disabled="busy" @click="chooseConsent('later')">以后再说</button>
            <button data-testid="journey-graduate-no" :disabled="busy" @click="chooseConsent('no')">不分享</button>
          </div>
        </template>
      </section>
    </div>
    <div v-if="archiveConfirmationOpen" class="archive-confirm-mask" data-testid="journey-archive-confirm">
      <section class="archive-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="journey-archive-title">
        <h2 id="journey-archive-title">归档这段旅程？</h2>
        <p>归档会完整保留发生过的事、行动与后来记录。它不会公开，也不会删除任何内容。</p>
        <div>
          <button :disabled="busy" @click="archiveConfirmationOpen = false">暂不归档</button>
          <button class="archive-confirm-primary" data-testid="journey-archive-confirm-action" :disabled="busy" @click="archiveJourney">确认归档</button>
        </div>
      </section>
    </div>
  </JourneyFlowShell>
</template>

<style scoped>
.journey-error {
  margin: 0;
  border-radius: var(--gn-radius-card);
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
  padding: 10px 14px;
  color: var(--gn-danger);
  font-size: 13px;
}

.loading-note {
  margin: 0;
  border-radius: var(--gn-radius-card);
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
  padding: 24px 16px;
  color: var(--gn-muted);
  text-align: center;
  font-size: 14px;
}

.graduate-trigger {
  width: 100%;
  min-height: 40px;
  margin-top: 8px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper);
  color: var(--gn-leaf-deep);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.graduate-choices {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.graduate-choices button {
  min-height: 38px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  color: var(--gn-ink);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.graduate-choices button:first-child {
  border-color: var(--gn-leaf);
  background: var(--gn-leaf);
  color: #fff;
  font-weight: 500;
}

.journey-notice {
  margin: 10px 0 0;
  border-radius: var(--gn-radius-card);
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
  padding: 10px 14px;
  color: var(--gn-leaf-deep);
  font-size: 13px;
  line-height: 1.5;
}

.archive-trigger {
  display: block;
  width: 100%;
  min-height: 38px;
  margin: 8px auto 0;
  border: 0;
  background: transparent;
  color: var(--gn-muted);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.archive-trigger:disabled {
  opacity: 0.5;
  cursor: wait;
}

.archive-confirm-mask {
  position: fixed;
  z-index: 50;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.45);
}

.archive-confirm-dialog {
  box-sizing: border-box;
  width: min(360px, 100%);
  padding: 20px;
  border-radius: var(--gn-radius-card);
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
}

.archive-confirm-dialog h2 {
  margin: 0;
  color: var(--gn-ink);
  font-size: 17px;
  font-weight: 600;
}

.archive-confirm-dialog p {
  margin: 8px 0 16px;
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.5;
}

.archive-confirm-dialog > div {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.archive-confirm-dialog button {
  min-height: 38px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  color: var(--gn-ink);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.archive-confirm-dialog .archive-confirm-primary {
  border-color: var(--gn-leaf);
  background: var(--gn-leaf);
  color: #fff;
  font-weight: 500;
}

.archive-confirm-dialog button:disabled {
  opacity: 0.5;
  cursor: wait;
}
</style>
