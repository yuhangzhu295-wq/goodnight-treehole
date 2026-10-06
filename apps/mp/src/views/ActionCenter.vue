<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ActionBarrier, ActionRecommendation, AdaptiveActionResult } from '@goodnight/shared-types';
import { api } from '../api';
import { aiDegradationNotice } from '../aiStatus';
import AiDegradationNotice from '../components/AiDegradationNotice.vue';
import PrimaryActionCard from '../components/action/PrimaryActionCard.vue';
import AdaptiveActionSheet from '../components/action/AdaptiveActionSheet.vue';
import ActionFollowupStrip from '../components/action/ActionFollowupStrip.vue';
import SupportShortcutGrid from '../components/action/SupportShortcutGrid.vue';

type ActionRecord = { id: string; title: string; description?: string; status: string; dueAt?: string; reminderAt?: string };
type ShortcutSheet = 'cooldown' | 'decision' | null;
type AdaptiveResult = AdaptiveActionResult & { description: string };

const router = useRouter();
const route = useRoute();
const home = ref<any>(null);
const journeyDetail = ref<any>(null);
const loading = ref(true);
const error = ref('');
const aiNotice = ref('');
const planning = ref(false);
const recommendation = ref<ActionRecommendation | null>(null);
const completionSheetOpen = ref(false);
const completionReflection = ref('');
const completing = ref(false);
const missedAction = ref<ActionRecord | null>(null);
const selectedBarrier = ref<ActionBarrier | undefined>(undefined);
const adaptiveResult = ref<AdaptiveResult | null>(null);
const adapting = ref(false);
const missedRecorded = ref(false);
const shortcutSheet = ref<ShortcutSheet>(null);
const shortcutBusy = ref(false);
const cooldownTitle = ref('');
const decisionQuestion = ref('');
const shortcutNotice = ref('');

const currentJourney = computed(() => journeyDetail.value?.journey ?? home.value?.journey ?? null);
const activeActions = computed<ActionRecord[]>(() => journeyDetail.value?.commitments?.filter((item: ActionRecord) => item.status === 'active') ?? home.value?.activeActions ?? []);
const activeAction = computed<ActionRecord | null>(() => activeActions.value[0] ?? null);
const dueCheckins = computed<any[]>(() => journeyDetail.value?.checkins?.filter((item: { status: string }) => item.status === 'pending') ?? home.value?.dueCheckins ?? []);
const primaryFollowUp = computed(() => dueCheckins.value[0] ?? null);
const mainMode = computed<'no-journey' | 'empty' | 'recommendation' | 'accepted'>(() => {
  if (!currentJourney.value) return 'no-journey';
  if (activeAction.value) return 'accepted';
  return recommendation.value ? 'recommendation' : 'empty';
});
const actionDescription = computed(() => activeAction.value?.description || '按计划完成当前行动即可。');

function shortDifficulty(value?: string) {
  return value === 'tiny' ? '低' : value === 'easy' ? '轻' : value === 'moderate' ? '适中' : '';
}

function followUpMessage(action: ActionRecord | null) {
  const dueAt = action?.reminderAt ?? action?.dueAt ?? primaryFollowUp.value?.dueAt;
  if (!dueAt || Number.isNaN(Date.parse(dueAt))) return '明晚系统将跟进执行情况。';
  const date = new Date(dueAt);
  const time = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date).replace('/', '月').replace(' ', '日 ');
  return `${time}，系统将跟进执行情况。`;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    home.value = (await api.get<any>('/api/v1/tonight')).item;
    const journeyId = String(route.query.journeyId ?? home.value?.journey?.id ?? '');
    journeyDetail.value = journeyId ? (await api.get<any>(`/api/v1/journeys/${journeyId}`)).item : null;
  } catch (cause: any) {
    error.value = cause?.message ?? '行动加载失败';
  } finally {
    loading.value = false;
  }
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function waitForJob<T extends Record<string, unknown>>(jobId: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await wait(400);
    const task = await api.get<{ status: string; result?: string; structured?: T }>(`/api/v1/ai/tasks/${jobId}`);
    if (['succeeded', 'fallback', 'failed'].includes(task.status)) {
      if (task.status === 'failed') throw new Error('这次没有形成可确认的行动');
      aiNotice.value = aiDegradationNotice(task);
      return task;
    }
  }
  throw new Error('行动建议生成超时，请稍后重试');
}

async function requestTonightAction(mode: 'initial' | 'smaller' = 'initial') {
  const journeyId = String(route.query.journeyId ?? currentJourney.value?.id ?? '');
  if (!journeyId) {
    router.push('/pages/tonight/index');
    return;
  }
  planning.value = true;
  recommendation.value = null;
  error.value = '';
  aiNotice.value = '';
  try {
    const queued = await api.post<{ job: { id: string } }>(`/api/v1/journeys/${journeyId}/action-plan`, { content: currentJourney.value?.summary, mode });
    const task = await waitForJob<Record<string, unknown>>(queued.job.id);
    const structured = task.structured ?? {};
    const title = typeof structured.title === 'string' ? structured.title : '';
    if (!title.trim()) throw new Error('没有生成可确认的行动');
    recommendation.value = {
      title,
      why: typeof structured.why === 'string' ? structured.why : undefined,
      description: typeof structured.description === 'string' ? structured.description : task.result,
      completionDefinition: typeof structured.completionDefinition === 'string' ? structured.completionDefinition : undefined,
      expectedDuration: typeof structured.expectedDuration === 'string' ? structured.expectedDuration : undefined,
      difficulty: typeof structured.difficulty === 'string' && ['tiny', 'easy', 'moderate'].includes(structured.difficulty) ? structured.difficulty as ActionRecommendation['difficulty'] : undefined,
      dueInDays: typeof structured.dueInDays === 'number' ? structured.dueInDays : 1,
    };
    if (mode === 'smaller') smallerNotice.value = '已切换为更小颗粒度的行动。';
  } catch (cause: any) {
    error.value = cause?.message ?? '行动建议暂时不可用';
  } finally {
    planning.value = false;
  }
}

async function acceptTonightAction() {
  const journeyId = String(route.query.journeyId ?? currentJourney.value?.id ?? '');
  if (!journeyId || !recommendation.value?.title) return;
  planning.value = true;
  error.value = '';
  try {
    const days = Math.max(1, recommendation.value.dueInDays ?? 1);
    await api.post(`/api/v1/journeys/${journeyId}/actions`, {
      title: recommendation.value.title,
      description: recommendation.value.completionDefinition || recommendation.value.description,
      dueAt: new Date(Date.now() + days * 86_400_000).toISOString(),
    });
    recommendation.value = null;
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '行动未能保存，请重试';
  } finally {
    planning.value = false;
  }
}

function openCompletionSheet() {
  if (!activeAction.value) return;
  completionReflection.value = '';
  completionSheetOpen.value = true;
}

async function completeAction() {
  if (!activeAction.value) return;
  completing.value = true;
  error.value = '';
  try {
    await api.post(`/api/v1/actions/${activeAction.value.id}/checkin`, {
      status: 'completed',
      reflection: completionReflection.value.trim() || '已完成约定行动。',
    });
    completionSheetOpen.value = false;
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '记录未能保存，请重试';
  } finally {
    completing.value = false;
  }
}

function openAdaptive(action = activeAction.value) {
  if (!action) return;
  missedAction.value = action;
  selectedBarrier.value = undefined;
  adaptiveResult.value = null;
  missedRecorded.value = false;
}

function closeAdaptive(force = false) {
  if (adapting.value && !force) return;
  missedAction.value = null;
  selectedBarrier.value = undefined;
  adaptiveResult.value = null;
}

async function chooseBarrier(barrier: ActionBarrier) {
  if (!missedAction.value || adapting.value) return;
  selectedBarrier.value = barrier;
  adaptiveResult.value = null;
  adapting.value = true;
  error.value = '';
  aiNotice.value = '';
  try {
    if (!missedRecorded.value) {
      await api.post(`/api/v1/actions/${missedAction.value.id}/checkin`, {
        status: 'missed',
        reflection: '行动未完成，调整为更可执行的方案。',
        barrier,
      });
      missedRecorded.value = true;
    }
    const response = await api.post<{ job: { id: string } }>(`/api/v1/actions/${missedAction.value.id}/adaptive-plan`, { barrier });
    const task = await waitForJob<Record<string, unknown>>(response.job.id);
    const structured = task.structured ?? {};
    const title = typeof structured.title === 'string' ? structured.title : '';
    if (!title.trim()) throw new Error('未能生成替代行动');
    adaptiveResult.value = {
      title,
      description: typeof structured.completionDefinition === 'string' ? structured.completionDefinition : task.result || '',
      why: typeof structured.why === 'string' ? structured.why : '',
      difficulty: typeof structured.difficulty === 'string' && ['tiny', 'easy', 'moderate'].includes(structured.difficulty) ? structured.difficulty as AdaptiveActionResult['difficulty'] : 'tiny',
      expectedDuration: typeof structured.expectedDuration === 'string' ? structured.expectedDuration : '',
      completionDefinition: typeof structured.completionDefinition === 'string' ? structured.completionDefinition : task.result || '',
      adaptationReason: barrier,
    };
  } catch (cause: any) {
    error.value = cause?.message ?? '未能生成调整行动';
  } finally {
    adapting.value = false;
  }
}

function resetAdaptive() {
  adaptiveResult.value = null;
}

async function confirmAdaptiveAction() {
  if (!missedAction.value || !adaptiveResult.value?.title.trim() || !selectedBarrier.value) return;
  adapting.value = true;
  error.value = '';
  try {
    await api.post(`/api/v1/actions/${missedAction.value.id}/adapt`, {
      title: adaptiveResult.value.title,
      description: adaptiveResult.value.description,
      barrier: selectedBarrier.value,
    });
    closeAdaptive(true);
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '新行动保存失败';
  } finally {
    adapting.value = false;
  }
}

function openShortcut(key: 'cooldown' | 'decision' | 'handoff' | 'future') {
  shortcutNotice.value = '';
  if (key === 'handoff') {
    router.push(`/pages/reality-handoff/index${currentJourney.value?.id ? `?journeyId=${currentJourney.value.id}` : ''}`);
    return;
  }
  if (key === 'future') {
    router.push(`/pages/future-self/index${currentJourney.value?.id ? `?journeyId=${currentJourney.value.id}` : ''}`);
    return;
  }
  shortcutSheet.value = key;
}

const smallerNotice = ref('');

// The due check-in. `dueCheckins` and `primaryFollowUp` were already computed here but never
// rendered, and the `?section=follow-up` target the follow-up worker emits was never read,
// so a due check-in had no way to be completed in the UI (product audit ISSUE-009).
const followUpOpen = ref(false);
const followUpBusy = ref(false);
const followUpNotice = ref('');
const followUpReflection = ref('');
const followUpResult = ref<'completed' | 'partial' | 'missed'>('completed');
const followUpAction = computed<ActionRecord | null>(() => {
  const checkin = primaryFollowUp.value;
  if (!checkin) return null;
  const commitmentId = checkin.commitmentId ?? checkin.commitment?.id;
  return activeActions.value.find((item) => item.id === commitmentId)
    ?? (commitmentId ? { id: commitmentId, title: checkin.commitment?.title ?? '之前定下的小行动', description: '', status: 'active' } as ActionRecord : null);
});

// The follow-up notification deep-links with `?followUp=1&commitmentId=...`. The action may
// already be `completed`, so the check-in target is resolved from the journey detail rather
// than only from the active list (ISSUE-010).
const deepLinkFollowUpAction = computed<ActionRecord | null>(() => {
  if (!route.query.followUp) return null;
  const wanted = String(route.query.commitmentId ?? '');
  const commitments = (journeyDetail.value?.commitments ?? []) as ActionRecord[];
  if (wanted) return commitments.find((item) => item.id === wanted) ?? null;
  return commitments.find((item) => item.status === 'active') ?? null;
});

const followUpTarget = computed<ActionRecord | null>(() => deepLinkFollowUpAction.value ?? followUpAction.value);

function openFollowUp() {
  followUpNotice.value = '';
  followUpReflection.value = '';
  followUpResult.value = 'completed';
  followUpOpen.value = true;
}

async function submitFollowUp() {
  const action = followUpTarget.value;
  if (!action) return;
  followUpBusy.value = true;
  error.value = '';
  try {
    // 'partial' is stored as a completed check-in with an explicit result note, because
    // OutcomeCheckinStatus has no partial member; the distinction the user made is kept in
    // `result` rather than being silently flattened to completed or missed.
    const status = followUpResult.value === 'missed' ? 'missed' : 'completed';
    const result = followUpResult.value === 'partial' ? `部分完成：${followUpReflection.value.trim() || '只做了一部分'}` : followUpResult.value === 'completed' ? '完成' : '未完成';
    await api.post(`/api/v1/actions/${action.id}/checkin`, { status, reflection: followUpReflection.value.trim(), result });
    followUpOpen.value = false;
    followUpNotice.value = '已记录本次跟进结果。';
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '跟进结果保存失败';
  } finally {
    followUpBusy.value = false;
  }
}

// The support intent the person chose is carried on the URL. STOP_IMPULSE and
// PREPARE_CONVERSATION used to be encoded as `?section=` values that nothing read, so both
// collapsed onto the generic action card (product audit ISSUE-006). The intent now decides
// which real surface opens, and `intentOpened` makes it happen once per entry.
const intentOpened = ref(false);
const intentNotice = ref('');

function applyIntentFromRoute() {
  const intent = String(route.query.intent ?? '');
  if (!intent || intentOpened.value) return;
  intentOpened.value = true;
  if (intent === 'STOP_IMPULSE') {
    openShortcut('cooldown');
    return;
  }
  if (intent === 'PREPARE_CONVERSATION') {
    openShortcut('handoff');
    return;
  }
  if (intent === 'NOTHING_NOW') {
    intentNotice.value = '暂不处理，可随时返回继续。';
  }
  if (route.query.followUp) openFollowUp();
}

function closeShortcutSheet() {
  if (!shortcutBusy.value) shortcutSheet.value = null;
}

async function saveCooldown() {
  if (!cooldownTitle.value.trim()) return;
  shortcutBusy.value = true;
  error.value = '';
  try {
    await api.post('/api/v1/cooldowns', { title: cooldownTitle.value.trim(), hours: 24 });
    shortcutNotice.value = '已暂存，冷静期后可重新查看。';
    cooldownTitle.value = '';
  } catch (cause: any) {
    error.value = cause?.message ?? '暂存失败，请重试';
  } finally {
    shortcutBusy.value = false;
  }
}

async function saveDecision() {
  if (!decisionQuestion.value.trim()) return;
  shortcutBusy.value = true;
  error.value = '';
  try {
    await api.post('/api/v1/decisions', { journeyId: currentJourney.value?.id, question: decisionQuestion.value.trim(), options: [] });
    shortcutNotice.value = '决定已暂存到保险箱。';
    decisionQuestion.value = '';
  } catch (cause: any) {
    error.value = cause?.message ?? '决定保存失败，请重试';
  } finally {
    shortcutBusy.value = false;
  }
}

watch(() => [route.query.journeyId, route.query.intent], () => {
  recommendation.value = null;
  closeAdaptive();
  intentOpened.value = false;
  void load().then(applyIntentFromRoute);
});
onMounted(async () => { await load(); applyIntentFromRoute(); });
</script>

<template>
  <AdaptiveActionSheet
    v-if="missedAction"
    :action="missedAction"
    :selected-barrier="selectedBarrier"
    :loading="adapting"
    :result="adaptiveResult ? { title: adaptiveResult.title, description: adaptiveResult.description, expectedDuration: adaptiveResult.expectedDuration, difficulty: shortDifficulty(adaptiveResult.difficulty) } : null"
    @close="closeAdaptive"
    @barrier="chooseBarrier"
    @retry="resetAdaptive"
    @accept="confirmAdaptiveAction"
  />

  <section v-else class="page goodnight-page action-page">
    <header class="action-header">
      <div class="header-titles">
        <h1 class="action-title">行动清单</h1>
        <p class="action-subtitle">查看当前行动、到期状态与跟进记录</p>
      </div>
    </header>

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <p v-if="intentNotice" class="intent-note" role="status" data-testid="action-intent-note">{{ intentNotice }}</p>
    <p v-if="smallerNotice" class="intent-note" role="status" data-testid="action-smaller-note">{{ smallerNotice }}</p>
    <p v-if="followUpNotice" class="intent-note" role="status" data-testid="action-followup-note">{{ followUpNotice }}</p>
    <p v-if="loading" class="loading-note">正在读取行动数据...</p>

    <main v-else class="action-content">
      <button
        v-if="followUpTarget && (primaryFollowUp || route.query.followUp)"
        class="followup-entry"
        type="button"
        data-testid="action-followup-entry"
        @click="openFollowUp"
      >
        <span class="followup-dot" aria-hidden="true"></span>
        <span>
          <strong>跟进待办：{{ followUpTarget.title }}</strong>
          <small>{{ followUpMessage(followUpTarget) }} 请确认完成状态。</small>
        </span>
      </button>
      <AiDegradationNotice :notice="aiNotice" />
      <PrimaryActionCard
        :mode="mainMode"
        :title="mainMode === 'accepted' ? activeAction?.title : recommendation?.title"
        :description="mainMode === 'accepted' ? actionDescription : recommendation?.completionDefinition || recommendation?.description"
        :expected-duration="recommendation?.expectedDuration"
        :difficulty="recommendation?.difficulty"
        :follow-up-message="mainMode === 'accepted' ? followUpMessage(activeAction) : undefined"
        :loading="planning"
        @request="requestTonightAction('initial')"
        @accept="acceptTonightAction"
        @smaller="requestTonightAction('smaller')"
        @complete="openCompletionSheet"
        @missed="openAdaptive()"
        @timeline="router.push(`/pages/journey/detail?id=${currentJourney?.id}`)"
        @tonight="router.push('/pages/tonight/index')"
      />

      <ActionFollowupStrip
        v-if="mainMode === 'recommendation' || mainMode === 'accepted'"
        :message="mainMode === 'accepted' ? followUpMessage(activeAction) : '接受后，系统将于明晚跟进执行情况。'"
        @open="router.push('/pages/notifications/index')"
      />

      <SupportShortcutGrid @select="openShortcut" />
    </main>

    <div v-if="followUpOpen" class="sheet-backdrop" @click.self="!followUpBusy && (followUpOpen = false)">
      <section class="completion-sheet" role="dialog" aria-modal="true" aria-labelledby="followup-title" data-testid="action-followup-sheet">
        <span class="sheet-handle" aria-hidden="true" />
        <button class="close-sheet" aria-label="关闭回访" :disabled="followUpBusy" @click="followUpOpen = false">×</button>
        <h2 id="followup-title">行动结果跟进</h2>
        <p>{{ followUpTarget?.title }}</p>
        <div class="followup-choices" role="radiogroup" aria-label="结果">
          <button type="button" :aria-pressed="followUpResult === 'completed'" data-testid="followup-completed" @click="followUpResult = 'completed'">完成了</button>
          <button type="button" :aria-pressed="followUpResult === 'partial'" data-testid="followup-partial" @click="followUpResult = 'partial'">做了一部分</button>
          <button type="button" :aria-pressed="followUpResult === 'missed'" data-testid="followup-missed" @click="followUpResult = 'missed'">没有完成</button>
        </div>
        <textarea v-model="followUpReflection" maxlength="800" placeholder="记录执行情况或备注（可选）" />
        <button class="sheet-primary" :disabled="followUpBusy" data-testid="followup-submit" @click="submitFollowUp">{{ followUpBusy ? '正在保存...' : '保存跟进结果' }}</button>
      </section>
    </div>

    <div v-if="completionSheetOpen" class="sheet-backdrop" @click.self="completionSheetOpen = false">
      <section class="completion-sheet" role="dialog" aria-modal="true" aria-labelledby="completion-title">
        <span class="sheet-handle" aria-hidden="true" />
        <button class="close-sheet" aria-label="关闭回顾" @click="completionSheetOpen = false">×</button>
        <h2 id="completion-title">完成记录</h2>
        <p>记录执行备注（可选）。</p>
        <textarea v-model="completionReflection" maxlength="800" placeholder="记录执行备注或体会（可选）" />
        <button class="sheet-primary" :disabled="completing" data-testid="action-complete-submit" @click="completeAction">{{ completing ? '正在保存...' : '保存这次回顾' }}</button>
      </section>
    </div>

    <div v-if="shortcutSheet" class="sheet-backdrop" @click.self="closeShortcutSheet">
      <section class="shortcut-sheet" role="dialog" aria-modal="true" :aria-label="shortcutSheet === 'cooldown' ? '先别发出去' : '一个重要决定'">
        <span class="sheet-handle" aria-hidden="true" />
        <button class="close-sheet" aria-label="关闭" @click="closeShortcutSheet">×</button>
        <template v-if="shortcutSheet === 'cooldown'">
          <h2>先别发出去</h2>
          <p>暂存待发内容，设置冷静期后再处理。</p>
          <input v-model="cooldownTitle" maxlength="120" placeholder="输入暂存内容" />
          <button class="sheet-primary" :disabled="shortcutBusy || !cooldownTitle.trim()" @click="saveCooldown">{{ shortcutBusy ? '正在保存...' : '确认暂存' }}</button>
        </template>
        <template v-else>
          <h2>一个重要决定</h2>
          <p>先记录待决事项，冷静期后再作评估。</p>
          <input v-model="decisionQuestion" maxlength="300" placeholder="待决事项或核心疑问" />
          <button class="sheet-primary" :disabled="shortcutBusy || !decisionQuestion.trim()" @click="saveDecision">{{ shortcutBusy ? '正在保存...' : '暂存决定' }}</button>
        </template>
        <p v-if="shortcutNotice" class="shortcut-notice">{{ shortcutNotice }}</p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.action-page {
  box-sizing: border-box;
  width: 100%;
  max-width: 430px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--gn-bg);
  color: var(--gn-text);
  font-family: var(--gn-font-body);
  padding: 12px 16px calc(112px + env(safe-area-inset-bottom));
}

.action-header {
  display: flex;
  align-items: flex-start;
  padding: 8px 4px 12px;
}

.header-titles {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.action-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--gn-ink);
}

.action-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--gn-muted);
}

.followup-entry {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-bottom: 8px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  padding: 12px 14px;
  color: var(--gn-ink);
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.followup-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--gn-leaf);
}

.followup-entry strong {
  display: block;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--gn-ink);
}

.followup-entry small {
  display: block;
  margin-top: 2px;
  color: var(--gn-muted);
  font-size: 12px;
  line-height: 1.4;
}

.followup-choices {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin: 12px 0;
}

.followup-choices button {
  min-height: 38px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  color: var(--gn-ink);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.followup-choices button[aria-pressed='true'] {
  border-color: var(--gn-leaf);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-weight: 600;
}

.intent-note {
  margin: 8px 0;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  padding: 10px 14px;
  color: var(--gn-ink);
  font-size: 13px;
  line-height: 1.5;
}

.action-content {
  display: grid;
  gap: 10px;
}

.loading-note,
.error-text {
  margin: 16px 4px;
  font-size: 13px;
  color: var(--gn-muted);
}

.error-text {
  color: var(--gn-danger);
}

.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  padding: 16px;
}

.completion-sheet,
.shortcut-sheet {
  position: relative;
  box-sizing: border-box;
  width: min(360px, 100%);
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  padding: 20px;
}

.sheet-handle {
  display: none;
}

.close-sheet {
  position: absolute;
  top: 14px;
  right: 14px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  background: var(--gn-paper-warm);
  color: var(--gn-muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.completion-sheet h2,
.shortcut-sheet h2 {
  margin: 0;
  font-family: var(--gn-font-body);
  font-size: 17px;
  font-weight: 600;
  color: var(--gn-ink);
}

.completion-sheet p,
.shortcut-sheet p {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--gn-muted);
  line-height: 1.45;
}

.completion-sheet textarea,
.shortcut-sheet input {
  box-sizing: border-box;
  width: 100%;
  margin-top: 14px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  padding: 10px 12px;
  color: var(--gn-ink);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  resize: none;
}

.completion-sheet textarea {
  min-height: 96px;
}

.shortcut-sheet input {
  min-height: 42px;
}

.sheet-primary {
  display: block;
  width: 100%;
  min-height: 40px;
  margin-top: 14px;
  border: 1px solid var(--gn-leaf);
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf);
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.sheet-primary:disabled {
  opacity: 0.6;
  cursor: wait;
}

.shortcut-notice {
  margin-top: 10px !important;
  color: var(--gn-leaf-deep) !important;
  font-size: 12px !important;
  text-align: center;
}

:deep(.action-paper) {
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  padding: 16px;
}

:deep(.action-paper::after) {
  display: none;
}

:deep(.paper-label) {
  color: var(--gn-muted);
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
}

:deep(.action-paper h2) {
  font-family: var(--gn-font-body);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--gn-ink);
}

:deep(.action-paper .paper-copy) {
  color: var(--gn-ink-soft);
  font-size: 14px;
  line-height: 1.5;
  margin-top: 8px;
}

:deep(.action-paper .completion-note) {
  color: var(--gn-muted);
  font-size: 12px;
  margin-top: 8px;
}

:deep(.action-paper .primary-cta) {
  border: 1px solid var(--gn-leaf);
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf);
  color: #fff;
  font-weight: 500;
}

:deep(.action-paper .secondary-cta) {
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  color: var(--gn-ink);
}

:deep(.action-paper .timeline-link) {
  color: var(--gn-leaf);
}

:deep(.followup-strip) {
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  color: var(--gn-ink);
}

:deep(.followup-icon) {
  background: var(--gn-paper-warm);
  color: var(--gn-leaf);
}

:deep(.shortcut-card) {
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  color: var(--gn-ink);
}

:deep(.shortcut-icon) {
  background: var(--gn-paper-warm);
  color: var(--gn-leaf);
}

@media (max-width: 374px) {
  .action-page {
    padding-left: 12px;
    padding-right: 12px;
  }
}
</style>
