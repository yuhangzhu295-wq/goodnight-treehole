<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ActionBarrier, ActionRecommendation, AdaptiveActionResult } from '@goodnight/shared-types';
import { api } from '../api';
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
const actionDescription = computed(() => activeAction.value?.description || '先完成一个最小的版本，做到就够了。');

function shortDifficulty(value?: string) {
  return value === 'tiny' ? '低' : value === 'easy' ? '轻' : value === 'moderate' ? '适中' : '';
}

function followUpMessage(action: ActionRecord | null) {
  const dueAt = action?.reminderAt ?? action?.dueAt ?? primaryFollowUp.value?.dueAt;
  if (!dueAt || Number.isNaN(Date.parse(dueAt))) return '明晚，我会回来问你，后来怎么样了。';
  const date = new Date(dueAt);
  const time = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date).replace('/', '月').replace(' ', '日 ');
  return `${time}，我会回来问你，后来怎么样了。`;
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
      return task;
    }
  }
  throw new Error('整理这一步花的时间有点久，请稍后再试');
}

async function requestTonightAction() {
  const journeyId = String(route.query.journeyId ?? currentJourney.value?.id ?? '');
  if (!journeyId) {
    router.push('/pages/tonight/index');
    return;
  }
  planning.value = true;
  recommendation.value = null;
  error.value = '';
  try {
    const queued = await api.post<{ job: { id: string } }>(`/api/v1/journeys/${journeyId}/action-plan`, { content: currentJourney.value?.summary });
    const task = await waitForJob<Record<string, unknown>>(queued.job.id);
    const structured = task.structured ?? {};
    const title = typeof structured.title === 'string' ? structured.title : '';
    if (!title.trim()) throw new Error('没有形成可以确认的小行动');
    recommendation.value = {
      title,
      why: typeof structured.why === 'string' ? structured.why : undefined,
      description: typeof structured.description === 'string' ? structured.description : task.result,
      completionDefinition: typeof structured.completionDefinition === 'string' ? structured.completionDefinition : undefined,
      expectedDuration: typeof structured.expectedDuration === 'string' ? structured.expectedDuration : undefined,
      difficulty: typeof structured.difficulty === 'string' && ['tiny', 'easy', 'moderate'].includes(structured.difficulty) ? structured.difficulty as ActionRecommendation['difficulty'] : undefined,
      dueInDays: typeof structured.dueInDays === 'number' ? structured.dueInDays : 1,
    };
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
    error.value = cause?.message ?? '这一步没有保存成功';
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
      reflection: completionReflection.value.trim() || '我完成了今天约定的小一步。',
    });
    completionSheetOpen.value = false;
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '这次回顾没有保存成功';
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
  try {
    if (!missedRecorded.value) {
      await api.post(`/api/v1/actions/${missedAction.value.id}/checkin`, {
        status: 'missed',
        reflection: '这一步今天没有做到，我想先找一个更现实的版本。',
        barrier,
      });
      missedRecorded.value = true;
    }
    const response = await api.post<{ job: { id: string } }>(`/api/v1/actions/${missedAction.value.id}/adaptive-plan`, { barrier });
    const task = await waitForJob<Record<string, unknown>>(response.job.id);
    const structured = task.structured ?? {};
    const title = typeof structured.title === 'string' ? structured.title : '';
    if (!title.trim()) throw new Error('没有形成更小的一步');
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
    error.value = cause?.message ?? '没能生成更小的一步';
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
    error.value = cause?.message ?? '新的行动保存失败';
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

function closeShortcutSheet() {
  if (!shortcutBusy.value) shortcutSheet.value = null;
}

async function saveCooldown() {
  if (!cooldownTitle.value.trim()) return;
  shortcutBusy.value = true;
  error.value = '';
  try {
    await api.post('/api/v1/cooldowns', { title: cooldownTitle.value.trim(), hours: 24 });
    shortcutNotice.value = '已经替你先放一晚。';
    cooldownTitle.value = '';
  } catch (cause: any) {
    error.value = cause?.message ?? '这句话暂时没能放进去';
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
    shortcutNotice.value = '这个决定已经先替你留住。';
    decisionQuestion.value = '';
  } catch (cause: any) {
    error.value = cause?.message ?? '这个决定暂时没能保存';
  } finally {
    shortcutBusy.value = false;
  }
}

watch(() => route.query.journeyId, () => { recommendation.value = null; closeAdaptive(); void load(); });
onMounted(load);
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
    <header class="action-hero">
      <div class="hero-topline"><span class="brand-mark">晚安树洞</span></div>
      <h1>今晚，只做这一件事</h1>
      <p>不需要证明自己，只要向现实迈出一小步。</p>
    </header>

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <p v-if="loading" class="loading-note">正在读取今晚的行动...</p>

    <main v-else class="action-content">
      <PrimaryActionCard
        :mode="mainMode"
        :title="mainMode === 'accepted' ? activeAction?.title : recommendation?.title"
        :description="mainMode === 'accepted' ? actionDescription : recommendation?.completionDefinition || recommendation?.description"
        :expected-duration="recommendation?.expectedDuration"
        :difficulty="recommendation?.difficulty"
        :follow-up-message="mainMode === 'accepted' ? followUpMessage(activeAction) : undefined"
        :loading="planning"
        @request="requestTonightAction"
        @accept="acceptTonightAction"
        @smaller="requestTonightAction"
        @complete="openCompletionSheet"
        @missed="openAdaptive()"
        @timeline="router.push(`/pages/journey/detail?id=${currentJourney?.id}`)"
        @tonight="router.push('/pages/tonight/index')"
      />

      <ActionFollowupStrip
        v-if="mainMode === 'recommendation' || mainMode === 'accepted'"
        :message="mainMode === 'accepted' ? followUpMessage(activeAction) : '接受后，明晚我会回来问你，后来怎么样了。'"
        @open="router.push('/pages/notifications/index')"
      />

      <SupportShortcutGrid @select="openShortcut" />
    </main>

    <div v-if="completionSheetOpen" class="sheet-backdrop" @click.self="completionSheetOpen = false">
      <section class="completion-sheet" role="dialog" aria-modal="true" aria-labelledby="completion-title">
        <span class="sheet-handle" aria-hidden="true" />
        <button class="close-sheet" aria-label="关闭回顾" @click="completionSheetOpen = false">×</button>
        <h2 id="completion-title">后来怎么样？</h2>
        <p>写一句就好，也可以留空。完成已经是一件很具体的事。</p>
        <textarea v-model="completionReflection" maxlength="800" placeholder="这一小步带来了什么变化？" />
        <button class="sheet-primary" :disabled="completing" data-testid="action-complete-submit" @click="completeAction">{{ completing ? '正在保存...' : '保存这次回顾' }}</button>
      </section>
    </div>

    <div v-if="shortcutSheet" class="sheet-backdrop" @click.self="closeShortcutSheet">
      <section class="shortcut-sheet" role="dialog" aria-modal="true" :aria-label="shortcutSheet === 'cooldown' ? '先别发出去' : '一个重要决定'">
        <span class="sheet-handle" aria-hidden="true" />
        <button class="close-sheet" aria-label="关闭" @click="closeShortcutSheet">×</button>
        <template v-if="shortcutSheet === 'cooldown'">
          <h2>先别发出去</h2>
          <p>把想说的话先留在这里，明天再决定要不要发送。</p>
          <input v-model="cooldownTitle" maxlength="120" placeholder="想先留住的一句话" />
          <button class="sheet-primary" :disabled="shortcutBusy || !cooldownTitle.trim()" @click="saveCooldown">{{ shortcutBusy ? '正在保存...' : '先放一晚' }}</button>
        </template>
        <template v-else>
          <h2>一个重要决定</h2>
          <p>先把问题留住，不急着在此刻作答。</p>
          <input v-model="decisionQuestion" maxlength="300" placeholder="这个决定现在最让你为难的是什么？" />
          <button class="sheet-primary" :disabled="shortcutBusy || !decisionQuestion.trim()" @click="saveDecision">{{ shortcutBusy ? '正在保存...' : '先留在这里' }}</button>
        </template>
        <p v-if="shortcutNotice" class="shortcut-notice">{{ shortcutNotice }}</p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.action-page { box-sizing:border-box; width:100%; min-height:820px; max-width:430px; margin:0 auto; background:#f8f4ea; color:#263c31; padding:0 16px calc(138px + env(safe-area-inset-bottom)); }
.action-hero { position:relative; min-height:178px; margin:0 -16px; overflow:hidden; background:radial-gradient(circle at 78% 66%, rgba(235,177,124,.5), transparent 29%), linear-gradient(154deg,#17293a,#263b49 54%,#7a655b); padding:calc(15px + env(safe-area-inset-top)) 28px 18px; color:#fffaf0; }
.action-hero::before { position:absolute; top:-2px; right:0; width:188px; height:178px; background:url('../assets/goodnight/illustrations/action-night-corner.png') right top/cover no-repeat; content:''; opacity:.9; pointer-events:none; mask-image:linear-gradient(90deg,transparent 0,#000 36%); -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 36%); }
.action-hero::after { position:absolute; right:88px; top:45px; width:106px; height:106px; border-radius:50%; background:radial-gradient(circle,rgba(245,202,142,.18),transparent 68%); content:''; filter:blur(4px); pointer-events:none; }
.hero-topline,.action-hero h1,.action-hero > p { position:relative; z-index:1; }.hero-topline { display:flex; justify-content:space-between; color:rgba(255,249,236,.72); font-size:13px; }.brand-mark { font-weight:650; letter-spacing:.03em; }.action-hero h1 { max-width:320px; margin:27px 0 6px; font-family:"Songti SC", "Noto Serif SC", "Microsoft YaHei", serif; font-size:28px; font-weight:650; letter-spacing:0; line-height:1.28; }.action-hero > p { max-width:290px; margin:0; color:rgba(255,249,237,.84); font-size:14px; line-height:1.55; }
.action-content { display:grid; gap:8px; margin-top:-8px; position:relative; z-index:2; }.loading-note,.error-text { margin:20px 4px; color:#687566; }.error-text { color:var(--gn-danger); }
.sheet-backdrop { position:fixed; z-index:20; inset:0; display:flex; align-items:flex-end; justify-content:center; background:rgba(16,28,34,.48); padding:16px; padding-bottom:calc(16px + env(safe-area-inset-bottom)); }.completion-sheet,.shortcut-sheet { position:relative; box-sizing:border-box; width:min(100%, 430px); border-radius:28px 28px 20px 20px; background:#fffdf7; padding:28px 20px 20px; box-shadow:0 -14px 36px rgba(14,26,33,.2); }.sheet-handle { position:absolute; top:10px; left:50%; width:44px; height:4px; border-radius:999px; background:#d9dbd0; transform:translateX(-50%); }.close-sheet { position:absolute; top:18px; right:16px; display:grid; width:30px; height:30px; place-items:center; border:0; border-radius:50%; background:#f3f1e8; color:#5d6b5b; font:inherit; font-size:22px; line-height:1; cursor:pointer; }.completion-sheet h2,.shortcut-sheet h2 { margin:8px 0 8px; font-family:"Songti SC", "Noto Serif SC", "Microsoft YaHei", serif; color:#2d4434; font-size:24px; font-weight:650; }.completion-sheet p,.shortcut-sheet p { margin:0; color:#737d70; font-size:14px; line-height:1.65; }.completion-sheet textarea,.shortcut-sheet input { box-sizing:border-box; width:100%; margin-top:18px; border:1px solid rgba(101,122,91,.2); border-radius:17px; background:#fbf9f1; padding:13px; color:#2e4034; font:inherit; line-height:1.55; resize:none; }.completion-sheet textarea { min-height:108px; }.shortcut-sheet input { min-height:50px; }.sheet-primary { width:100%; min-height:50px; margin-top:13px; border:1px solid #436b52; border-radius:999px; background:#436b52; color:#fffdf6; font:inherit; font-size:15px; cursor:pointer; }.sheet-primary:disabled { cursor:wait; opacity:.64; }.shortcut-notice { margin-top:12px !important; color:#527151 !important; text-align:center; }
@media (max-width:374px) { .action-page { padding-inline:12px; }.action-hero { margin-inline:-12px; padding-inline:24px; min-height:170px; }.action-hero h1 { margin-top:24px; font-size:26px; }.sheet-backdrop { padding-inline:10px; } }
@media (max-width:390px) {
  .action-page { padding-bottom:calc(126px + env(safe-area-inset-bottom)); }
  .action-hero { min-height:170px; padding-top:calc(14px + env(safe-area-inset-top)); padding-bottom:16px; }
  .action-hero h1 { margin-top:24px; font-size:26px; }
  .action-content { gap:8px; }
  :deep(.action-paper) { padding:17px 17px 14px; }
  :deep(.action-paper .paper-label) { margin-bottom:8px; }
  :deep(.action-paper .action-title) { font-size:24px; line-height:1.3; }
  :deep(.action-paper .paper-copy) { margin-top:9px; font-size:14px; line-height:1.52; }
  :deep(.action-paper .action-meta) { margin-top:9px; }
  :deep(.action-paper .completion-note) { margin-top:9px; }
  :deep(.action-paper .card-actions) { margin-top:12px; }
  :deep(.action-paper .primary-cta), :deep(.action-paper .secondary-cta) { min-height:43px; }
  :deep(.shortcut-card) { min-height:78px; padding-top:7px; }
  :deep(.shortcut-icon) { width:27px; height:27px; }
}
.sheet-backdrop{z-index:40}</style>
