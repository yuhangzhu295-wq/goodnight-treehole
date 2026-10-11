<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ActionBarrier, ActionRecommendation, AdaptiveActionResult } from '@goodnight/shared-types';
import { api } from '../api';
import { aiDegradationNotice } from '../aiStatus';
import AiDegradationNotice from '../components/AiDegradationNotice.vue';
import AdaptiveActionSheet from '../components/action/AdaptiveActionSheet.vue';

type ActionRecord = {
  id: string;
  title: string;
  description?: string;
  status: string;
  dueAt?: string;
  reminderAt?: string;
};
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
const smallerNotice = ref('');

const currentJourney = computed(() => journeyDetail.value?.journey ?? home.value?.journey ?? null);
const activeActions = computed<ActionRecord[]>(() =>
  journeyDetail.value?.commitments?.filter((item: ActionRecord) => item.status === 'active') ??
  home.value?.activeActions ?? []
);
const activeAction = computed<ActionRecord | null>(() => activeActions.value[0] ?? null);
const dueCheckins = computed<any[]>(() =>
  journeyDetail.value?.checkins?.filter((item: { status: string }) => item.status === 'pending') ??
  home.value?.dueCheckins ?? []
);
const primaryFollowUp = computed(() => dueCheckins.value[0] ?? null);
const completedCommitments = computed<ActionRecord[]>(() =>
  journeyDetail.value?.commitments?.filter((item: ActionRecord) => item.status === 'completed') ?? []
);

const actionDescription = computed(() => activeAction.value?.description || '按计划完成当前行动即可。');

function shortDifficulty(value?: string) {
  return value === 'tiny' ? '低' : value === 'easy' ? '轻' : value === 'moderate' ? '适中' : '';
}

function followUpMessage(action: ActionRecord | null) {
  const dueAt = action?.reminderAt ?? action?.dueAt ?? primaryFollowUp.value?.dueAt;
  if (!dueAt || Number.isNaN(Date.parse(dueAt))) return '明晚系统将跟进执行情况。';
  const date = new Date(dueAt);
  const time = new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace('/', '月')
    .replace(' ', '日 ');
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
    void router.push('/pages/tonight/index');
    return;
  }
  planning.value = true;
  recommendation.value = null;
  error.value = '';
  aiNotice.value = '';
  try {
    const queued = await api.post<{ job: { id: string } }>(`/api/v1/journeys/${journeyId}/action-plan`, {
      content: currentJourney.value?.summary,
      mode,
    });
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
      difficulty:
        typeof structured.difficulty === 'string' && ['tiny', 'easy', 'moderate'].includes(structured.difficulty)
          ? (structured.difficulty as ActionRecommendation['difficulty'])
          : undefined,
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
    const response = await api.post<{ job: { id: string } }>(`/api/v1/actions/${missedAction.value.id}/adaptive-plan`, {
      barrier,
    });
    const task = await waitForJob<Record<string, unknown>>(response.job.id);
    const structured = task.structured ?? {};
    const title = typeof structured.title === 'string' ? structured.title : '';
    if (!title.trim()) throw new Error('未能生成替代行动');
    adaptiveResult.value = {
      title,
      description: typeof structured.completionDefinition === 'string' ? structured.completionDefinition : task.result || '',
      why: typeof structured.why === 'string' ? structured.why : '',
      difficulty:
        typeof structured.difficulty === 'string' && ['tiny', 'easy', 'moderate'].includes(structured.difficulty)
          ? (structured.difficulty as AdaptiveActionResult['difficulty'])
          : 'tiny',
      expectedDuration: typeof structured.expectedDuration === 'string' ? structured.expectedDuration : '',
      completionDefinition:
        typeof structured.completionDefinition === 'string' ? structured.completionDefinition : task.result || '',
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
    void router.push(
      `/pages/reality-handoff/index${currentJourney.value?.id ? `?journeyId=${currentJourney.value.id}` : ''}`
    );
    return;
  }
  if (key === 'future') {
    void router.push(`/pages/future-self/index${currentJourney.value?.id ? `?journeyId=${currentJourney.value.id}` : ''}`);
    return;
  }
  shortcutSheet.value = key;
}

const followUpOpen = ref(false);
const followUpBusy = ref(false);
const followUpNotice = ref('');
const followUpReflection = ref('');
const followUpResult = ref<'completed' | 'partial' | 'missed'>('completed');

const followUpAction = computed<ActionRecord | null>(() => {
  const checkin = primaryFollowUp.value;
  if (!checkin) return null;
  const commitmentId = checkin.commitmentId ?? checkin.commitment?.id;
  return (
    activeActions.value.find((item) => item.id === commitmentId) ??
    (commitmentId
      ? ({ id: commitmentId, title: checkin.commitment?.title ?? '之前定下的小行动', description: '', status: 'active' } as ActionRecord)
      : null)
  );
});

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
    const status = followUpResult.value === 'missed' ? 'missed' : 'completed';
    const result =
      followUpResult.value === 'partial'
        ? `部分完成：${followUpReflection.value.trim() || '只做了一部分'}`
        : followUpResult.value === 'completed'
        ? '完成'
        : '未完成';
    await api.post(`/api/v1/actions/${action.id}/checkin`, {
      status,
      reflection: followUpReflection.value.trim(),
      result,
    });
    followUpOpen.value = false;
    followUpNotice.value = '已记录本次跟进结果。';
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '跟进结果保存失败';
  } finally {
    followUpBusy.value = false;
  }
}

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
    await api.post('/api/v1/decisions', {
      journeyId: currentJourney.value?.id,
      question: decisionQuestion.value.trim(),
      options: [],
    });
    shortcutNotice.value = '决定已暂存到保险箱。';
    decisionQuestion.value = '';
  } catch (cause: any) {
    error.value = cause?.message ?? '决定保存失败，请重试';
  } finally {
    shortcutBusy.value = false;
  }
}

watch(
  () => [route.query.journeyId, route.query.intent],
  () => {
    recommendation.value = null;
    closeAdaptive();
    intentOpened.value = false;
    void load().then(applyIntentFromRoute);
  }
);

onMounted(async () => {
  await load();
  applyIntentFromRoute();
});
</script>

<template>
  <AdaptiveActionSheet
    v-if="missedAction"
    :action="missedAction"
    :selected-barrier="selectedBarrier"
    :loading="adapting"
    :result="
      adaptiveResult
        ? {
          title: adaptiveResult.title,
          description: adaptiveResult.description,
          expectedDuration: adaptiveResult.expectedDuration,
          difficulty: shortDifficulty(adaptiveResult.difficulty),
        }
        : null
    "
    @close="closeAdaptive"
    @barrier="chooseBarrier"
    @retry="resetAdaptive"
    @accept="confirmAdaptiveAction"
  />

  <div v-else class="action-v2">
    <!-- Top Header -->
    <header class="action-header">
      <div class="header-left">
        <h1 class="header-title">行动</h1>
      </div>
      <div class="header-right">
        <button
          class="more-link"
          type="button"
          @click="router.push('/pages/archive/index')"
        >
          查看记录 ›
        </button>
      </div>
    </header>

    <div v-if="error" class="error-banner" role="alert">{{ error }}</div>
    <div v-if="intentNotice" class="notice-box" role="status" data-testid="action-intent-note">{{ intentNotice }}</div>
    <div v-if="smallerNotice" class="notice-box" role="status" data-testid="action-smaller-note">{{ smallerNotice }}</div>
    <div v-if="followUpNotice" class="notice-box" role="status" data-testid="action-followup-note">{{ followUpNotice }}</div>

    <div v-if="loading" class="state-message">正在读取行动数据…</div>

    <main v-else class="action-content">
      <div class="intro-block">
        <h2 class="section-heading">今天</h2>
        <p class="intro-text">先做眼前能完成的这一件</p>
      </div>

      <AiDegradationNotice :notice="aiNotice" />

      <!-- State 1: Active Action in progress -->
      <section v-if="activeAction" class="primary-card">
        <div class="card-meta-row">
          <span class="pill-green">进行中</span>
          <span v-if="activeAction.dueAt" class="meta-time">进行中行动</span>
        </div>

        <h3 class="action-task-title">{{ activeAction.title }}</h3>
        <p class="action-source">来自「{{ currentJourney?.title || '最近的旅程' }}」</p>
        <p class="action-desc">{{ actionDescription }}</p>

        <div class="card-action-row">
          <button
            class="btn-primary"
            type="button"
            @click="openCompletionSheet"
          >
            完成
          </button>
          <button
            class="btn-alt"
            type="button"
            @click="openAdaptive()"
          >
            调整一下
          </button>
        </div>

        <button
          class="sub-action-link"
          type="button"
          @click="requestTonightAction('smaller')"
        >
          做不到？换成更小一步 ›
        </button>
      </section>

      <!-- State 2: Recommendation offered -->
      <section v-else-if="recommendation" class="primary-card">
        <div class="card-meta-row">
          <span class="pill-amber">建议行动</span>
          <span v-if="recommendation.expectedDuration" class="meta-time">{{ recommendation.expectedDuration }}</span>
        </div>

        <h3 class="action-task-title">{{ recommendation.title }}</h3>
        <p class="action-desc">{{ recommendation.completionDefinition || recommendation.description }}</p>

        <div class="card-action-row">
          <button
            class="btn-primary"
            :disabled="planning"
            type="button"
            @click="acceptTonightAction"
          >
            {{ planning ? '正在确认…' : '接受这个行动' }}
          </button>
          <button
            class="btn-alt"
            :disabled="planning"
            type="button"
            @click="requestTonightAction('smaller')"
          >
            换更小一步
          </button>
        </div>
      </section>

      <!-- State 3: Empty State (No current action) -->
      <section v-else class="empty-card">
        <h3 class="empty-card-title">还没有安排的行动</h3>
        <p class="empty-card-desc">你可以从最近的记录里选一件小事开始。</p>
        <button
          class="btn-primary empty-create-btn"
          :disabled="planning"
          type="button"
          @click="requestTonightAction('initial')"
        >
          {{ planning ? '正在生成…' : '整理一个小行动' }}
        </button>
      </section>

      <!-- Due Checkin / Followup Section -->
      <section v-if="followUpTarget && (primaryFollowUp || route.query.followUp)" class="section-group">
        <div class="group-header">
          <h3 class="group-title">到期回访</h3>
        </div>
        <button
          class="list-row followup-row"
          data-testid="action-followup-entry"
          type="button"
          @click="openFollowUp"
        >
          <div class="row-icon-box">↺</div>
          <div class="row-body">
            <div class="row-title">{{ followUpTarget.title }}</div>
            <div class="row-sub">{{ followUpMessage(followUpTarget) }}</div>
          </div>
          <span class="row-chev" aria-hidden="true">›</span>
        </button>
      </section>

      <!-- Other Support Features (Secondary Module) -->
      <section class="section-group">
        <div class="group-header">
          <h3 class="group-title">其他支持</h3>
        </div>

        <div class="list-surface">
          <button
            class="list-row"
            type="button"
            @click="openShortcut('handoff')"
          >
            <div class="row-icon-box">♧</div>
            <div class="row-body">
              <div class="row-title">找现实中的人</div>
              <div class="row-sub">准备向信任的人求助</div>
            </div>
            <span class="row-chev" aria-hidden="true">›</span>
          </button>

          <button
            class="list-row"
            type="button"
            @click="router.push('/pages/safety/index')"
          >
            <div class="row-icon-box">◷</div>
            <div class="row-body">
              <div class="row-title">先缓一缓</div>
              <div class="row-sub">短暂停顿与安全支持</div>
            </div>
            <span class="row-chev" aria-hidden="true">›</span>
          </button>

          <button
            class="list-row"
            type="button"
            @click="openShortcut('future')"
          >
            <div class="row-icon-box">◇</div>
            <div class="row-body">
              <div class="row-title">写给未来的我</div>
              <div class="row-sub">保存写给以后的留言</div>
            </div>
            <span class="row-chev" aria-hidden="true">›</span>
          </button>

          <button
            class="list-row"
            type="button"
            @click="openShortcut('decision')"
          >
            <div class="row-icon-box">▣</div>
            <div class="row-body">
              <div class="row-title">一个重要决定</div>
              <div class="row-sub">暂存待决事项</div>
            </div>
            <span class="row-chev" aria-hidden="true">›</span>
          </button>
        </div>
      </section>

      <!-- Recent Completed Section -->
      <section v-if="completedCommitments.length > 0" class="section-group">
        <div class="group-header">
          <h3 class="group-title">最近完成</h3>
        </div>
        <div class="list-surface">
          <div
            v-for="item in completedCommitments.slice(0, 3)"
            :key="item.id"
            class="list-row"
          >
            <div class="row-icon-box completed-check">✓</div>
            <div class="row-body">
              <div class="row-title">{{ item.title }}</div>
              <div class="row-sub">已完成</div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- Followup Dialog Sheet -->
    <Teleport to="body">
      <div v-if="followUpOpen" class="sheet-mask" @click.self="!followUpBusy && (followUpOpen = false)">
        <section
          class="bottom-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="followup-title"
          data-testid="action-followup-sheet"
        >
          <div class="grabber" />
          <div class="sheet-top">
            <h3 id="followup-title" class="sheet-title">行动结果跟进</h3>
            <button class="sheet-close" aria-label="关闭" :disabled="followUpBusy" @click="followUpOpen = false">✕</button>
          </div>
          <p class="sheet-sub">{{ followUpTarget?.title }}</p>

          <div class="followup-choices" role="radiogroup" aria-label="执行结果">
            <button
              type="button"
              class="choice-btn"
              :class="{ selected: followUpResult === 'completed' }"
              data-testid="followup-completed"
              @click="followUpResult = 'completed'"
            >
              完成了
            </button>
            <button
              type="button"
              class="choice-btn"
              :class="{ selected: followUpResult === 'partial' }"
              data-testid="followup-partial"
              @click="followUpResult = 'partial'"
            >
              做了一部分
            </button>
            <button
              type="button"
              class="choice-btn"
              :class="{ selected: followUpResult === 'missed' }"
              data-testid="followup-missed"
              @click="followUpResult = 'missed'"
            >
              没有完成
            </button>
          </div>

          <textarea
            v-model="followUpReflection"
            class="sheet-textarea"
            maxlength="800"
            placeholder="记录执行情况或体会（可选）"
          />

          <button
            class="btn-primary sheet-submit-btn"
            :disabled="followUpBusy"
            data-testid="followup-submit"
            type="button"
            @click="submitFollowUp"
          >
            {{ followUpBusy ? '正在保存…' : '保存跟进结果' }}
          </button>
        </section>
      </div>
    </Teleport>

    <!-- Completion Dialog Sheet -->
    <Teleport to="body">
      <div v-if="completionSheetOpen" class="sheet-mask" @click.self="completionSheetOpen = false">
        <section
          class="bottom-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="completion-title"
        >
          <div class="grabber" />
          <div class="sheet-top">
            <h3 id="completion-title" class="sheet-title">完成记录</h3>
            <button class="sheet-close" aria-label="关闭" @click="completionSheetOpen = false">✕</button>
          </div>
          <p class="sheet-sub">记录执行体会（可选）</p>

          <textarea
            v-model="completionReflection"
            class="sheet-textarea"
            maxlength="800"
            placeholder="完成这件事后，感觉怎么样？"
          />

          <button
            class="btn-primary sheet-submit-btn"
            :disabled="completing"
            data-testid="action-complete-submit"
            type="button"
            @click="completeAction"
          >
            {{ completing ? '正在保存…' : '保存这次记录' }}
          </button>
        </section>
      </div>
    </Teleport>

    <!-- Shortcut Sheet (Cooldown / Decision) -->
    <Teleport to="body">
      <div v-if="shortcutSheet" class="sheet-mask" @click.self="closeShortcutSheet">
        <section
          class="bottom-sheet"
          role="dialog"
          aria-modal="true"
          :aria-label="shortcutSheet === 'cooldown' ? '先别发出去' : '一个重要决定'"
        >
          <div class="grabber" />
          <div class="sheet-top">
            <h3 class="sheet-title">{{ shortcutSheet === 'cooldown' ? '先别发出去' : '一个重要决定' }}</h3>
            <button class="sheet-close" aria-label="关闭" @click="closeShortcutSheet">✕</button>
          </div>

          <template v-if="shortcutSheet === 'cooldown'">
            <p class="sheet-sub">暂存待发内容，设置冷静期后再处理。</p>
            <input
              v-model="cooldownTitle"
              class="sheet-input"
              maxlength="120"
              placeholder="输入暂存内容"
            />
            <button
              class="btn-primary sheet-submit-btn"
              :disabled="shortcutBusy || !cooldownTitle.trim()"
              type="button"
              @click="saveCooldown"
            >
              {{ shortcutBusy ? '正在保存…' : '确认暂存' }}
            </button>
          </template>
          <template v-else>
            <p class="sheet-sub">先记录待决事项，冷静期后再作评估。</p>
            <input
              v-model="decisionQuestion"
              class="sheet-input"
              maxlength="300"
              placeholder="待决事项或核心疑问"
            />
            <button
              class="btn-primary sheet-submit-btn"
              :disabled="shortcutBusy || !decisionQuestion.trim()"
              type="button"
              @click="saveDecision"
            >
              {{ shortcutBusy ? '正在保存…' : '暂存决定' }}
            </button>
          </template>
          <p v-if="shortcutNotice" class="shortcut-notice">{{ shortcutNotice }}</p>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.action-v2 {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  min-height: 100vh;
  padding: 0 0 calc(96px + env(safe-area-inset-bottom));
  background: #FFFFFF;
  color: #242A32;
  font-family: var(--gn-font-body);
}

.action-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 20px;
  background: #FFFFFF;
  border-bottom: 1px solid #E8EBEF;
}

.header-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #242A32;
  letter-spacing: -0.3px;
}

.more-link {
  min-height: 48px;
  display: flex;
  align-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: #757D87;
  font-size: 13px;
  cursor: pointer;
}

.error-banner {
  margin: 12px 20px 0;
  padding: 10px 14px;
  border-radius: 8px;
  background: #FEF2F0;
  border: 1px solid #F6DCDA;
  color: #BD4545;
  font-size: 13px;
}

.notice-box {
  margin: 12px 20px 0;
  padding: 10px 14px;
  border-radius: 8px;
  background: #F7F8FA;
  border: 1px solid #E8EBEF;
  color: #242A32;
  font-size: 13px;
}

.state-message {
  padding: 40px 20px;
  color: #757D87;
  font-size: 13px;
  text-align: center;
}

.action-content {
  padding: 16px 20px 0;
}

.intro-block {
  margin-bottom: 14px;
}

.section-heading {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: #242A32;
}

.intro-text {
  margin: 4px 0 0;
  font-size: 13px;
  color: #757D87;
}

.primary-card {
  padding: 18px 16px;
  border: 1px solid #E0E8E5;
  border-radius: 12px;
  background: #FAFBFA;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.card-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pill-green {
  padding: 3px 8px;
  border-radius: 5px;
  background: #EAF4EE;
  color: #275F56;
  font-size: 11px;
  font-weight: 600;
}

.pill-amber {
  padding: 3px 8px;
  border-radius: 5px;
  background: #FCF3E7;
  color: #A77233;
  font-size: 11px;
  font-weight: 600;
}

.meta-time {
  font-size: 11px;
  color: #757D87;
}

.action-task-title {
  margin: 12px 0 6px;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.45;
  color: #242A32;
}

.action-source {
  margin: 0;
  font-size: 12px;
  color: #757D87;
  line-height: 1.4;
}

.action-desc {
  margin: 8px 0 0;
  font-size: 13px;
  color: #4A525D;
  line-height: 1.5;
}

.card-action-row {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}

.btn-primary {
  flex: 1;
  min-height: 48px;
  border: 0;
  border-radius: 10px;
  background: #275F56;
  color: #FFFFFF;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: wait;
}

.btn-alt {
  flex: 1;
  min-height: 48px;
  border: 1px solid #DCE1E5;
  border-radius: 10px;
  background: #FFFFFF;
  color: #242A32;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.sub-action-link {
  display: block;
  width: 100%;
  margin-top: 14px;
  padding: 6px 0;
  border: 0;
  background: transparent;
  color: #275F56;
  font-size: 13px;
  font-weight: 500;
  text-align: center;
  cursor: pointer;
}

.empty-card {
  padding: 20px 16px;
  border: 1px solid #E8EBEF;
  border-radius: 12px;
  background: #F7F8FA;
}

.empty-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #242A32;
}

.empty-card-desc {
  margin: 6px 0 0;
  font-size: 13px;
  color: #757D87;
  line-height: 1.5;
}

.empty-create-btn {
  margin-top: 16px;
  width: 100%;
}

.section-group {
  margin-top: 24px;
}

.group-header {
  margin-bottom: 8px;
}

.group-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #242A32;
}

.list-surface {
  border-top: 1px solid #E8EBEF;
}

.list-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 10px 0;
  border: 0;
  border-bottom: 1px solid #E8EBEF;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.row-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: #F7F8FA;
  color: #757D87;
  font-size: 16px;
  flex-shrink: 0;
}

.completed-check {
  background: #EAF4EE;
  color: #275F56;
}

.row-body {
  flex: 1;
  min-width: 0;
}

.row-title {
  font-size: 14px;
  font-weight: 600;
  color: #242A32;
  line-height: 1.35;
}

.row-sub {
  margin-top: 2px;
  font-size: 12px;
  color: #757D87;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-chev {
  color: #AAB0B8;
  font-size: 20px;
  line-height: 1;
}

.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  background: rgba(12, 21, 25, 0.35);
}

.bottom-sheet {
  box-sizing: border-box;
  width: min(430px, 100vw);
  max-height: 80vh;
  margin: 0 auto;
  overflow-y: auto;
  border-radius: 20px 20px 0 0;
  background: #FFFFFF;
  padding: 12px 20px calc(28px + env(safe-area-inset-bottom));
  box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.12);
}

.grabber {
  width: 38px;
  height: 4px;
  margin: 0 auto 16px;
  border-radius: 4px;
  background: #D9DDDF;
}

.sheet-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.sheet-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #242A32;
}

.sheet-close {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  min-height: 48px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #757D87;
  font-size: 16px;
  cursor: pointer;
}

.sheet-sub {
  margin: 0 0 16px;
  font-size: 13px;
  color: #757D87;
}

.followup-choices {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}

.choice-btn {
  min-height: 48px;
  border: 1px solid #E8EBEF;
  border-radius: 8px;
  background: #FFFFFF;
  color: #242A32;
  font-size: 13px;
  cursor: pointer;
}

.choice-btn.selected {
  border-color: #275F56;
  background: #EAF4EE;
  color: #275F56;
  font-weight: 600;
}

.sheet-textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 96px;
  border: 1px solid #E8EBEF;
  border-radius: 8px;
  padding: 10px 12px;
  background: #F7F8FA;
  color: #242A32;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  resize: none;
  outline: none;
}

.sheet-input {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  border: 1px solid #E8EBEF;
  border-radius: 8px;
  padding: 10px 12px;
  background: #F7F8FA;
  color: #242A32;
  font-family: inherit;
  font-size: 13px;
  outline: none;
}

.sheet-submit-btn {
  width: 100%;
  margin-top: 16px;
}

.shortcut-notice {
  margin-top: 10px;
  color: #275F56;
  font-size: 12px;
  text-align: center;
}
</style>
