<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { aiDegradationNotice } from '../aiStatus';
import AiDegradationNotice from '../components/AiDegradationNotice.vue';
import { copyText } from '../clipboard';

type DecomposeResult = {
  triggerEvent: string;
  coreEmotions: string[];
  realNeeds: string[];
  nextSmallStep: string;
  summary?: string;
  /** The model's action suggestions; the list mode renders these, never the analysis fields. */
  advice: string[];
};
type SafetyResult = { message: string; nextSmallStep: string };
const router = useRouter();
const route = useRoute();
const content = ref('');
const result = ref<DecomposeResult>();
/** The backend's high-risk escalation is a safety message, not a breakdown; it gets its own card. */
const safety = ref<SafetyResult>();
/** The text the current result was produced from, so an edit cannot be saved with an old result. */
const resultSource = ref('');
const saving = ref(false);
const copied = ref(false);
const saved = ref(false);
const loading = ref(false);
const message = ref('');
const aiNotice = ref('');
const count = computed(() => content.value.length);
const resultStale = computed(() => Boolean(result.value) && content.value.trim() !== resultSource.value);
const canRun = computed(() => !loading.value && content.value.trim().length > 0);
/**
 * How the same decomposition is laid out.
 *
 * The design's two chips are a reading preference, not two different model calls: 先做最小一步 shows the
 * next step on its own, 列出几步 shows the whole breakdown as a numbered list. Both render the real
 * result the job returned; neither invents anything.
 */
const mode = ref<'minimal' | 'list'>('minimal');
/** Identifies the current run, so a superseded poll cannot write over a newer one. */
const runSeq = ref(0);
/** Identifies the current save, so an older save's `finally` cannot unlock a newer one. */
let saveSeq = 0;
/** The job the displayed result came from; a rerun must produce a different one. */
const lastJobId = ref('');

/** Back to wherever the tool was opened from; a deep link has no history to return to. */
function safeBack() {
  if (window.history.state?.back) router.back();
  else router.push('/pages/tool/index');
}

function displayPrompt(value: unknown) {
  return String(value ?? '').replace(/^(?:ROUTE|FLOW|DECOMPOSE)_[A-Z0-9_]+\s+/i, '').trim();
}

/** A job result with nothing usable in it is reported, not filled in with invented text. */
function toResult(structured: any): DecomposeResult | null {
  const triggerEvent = displayPrompt(structured?.triggerEvent ?? structured?.trigger ?? '');
  const coreEmotions = (structured?.coreEmotions ?? [structured?.coreEmotion].filter(Boolean)) as string[];
  const realNeeds = (structured?.realNeeds ?? [structured?.realNeed].filter(Boolean)) as string[];
  const nextSmallStep = String(structured?.nextSmallStep ?? structured?.smallAction ?? structured?.nextStep ?? '').trim();
  if (!triggerEvent || !nextSmallStep) return null;
  const advice = Array.isArray(structured?.advice) ? structured.advice.map(String).filter(Boolean).slice(0, 3) : [];
  return { triggerEvent, coreEmotions, realNeeds, nextSmallStep, summary: structured?.summary, advice };
}

/**
 * The backend answers a high-risk input with a safety escalation: status `succeeded`, a safety text
 * in `result`, and a structured payload with `escalation: true` but no trigger/emotions. Treating it
 * as an incomplete breakdown hid the real support message, so it is recognised first.
 */
function toSafety(state: any): SafetyResult | null {
  const structured = state?.structured;
  const escalated = structured?.escalation === true || structured?.riskLevel === 'high';
  if (!escalated) return null;
  const message = String(state?.result ?? '').trim();
  const nextSmallStep = String(structured?.nextSmallStep ?? '').trim();
  if (!message && !nextSmallStep) return null;
  return { message, nextSmallStep };
}

/**
 * Each request is bounded on its own: the API client has no timeout, and a status read that never
 * settles would leave `loading` true forever with no way back to the button.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

/**
 * Waits for one job and returns its terminal state.
 *
 * The caller gets the terminal state rather than only the payload: the degradation notice has to
 * describe the state the job actually ended in, and returning `structured` alone made a fallback result
 * look like a live one. `ticket` identifies the attempt, so a superseded poll stops touching the page.
 */
async function poll(id: string, ticket: number) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const state = await withTimeout(api.get<any>(`/api/v1/ai/tasks/${id}`), 15_000, '读取拆解进度超时');
    if (ticket !== runSeq.value) return null;
    if (!['queued', 'running'].includes(state.status)) {
      if (!['succeeded', 'fallback'].includes(state.status)) throw new Error(state.job?.errorMessage ?? '情绪拆解失败');
      return state;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 350));
  }
  throw new Error('情绪拆解任务超时');
}

async function run() {
  const submitted = content.value.trim();
  if (!submitted) {
    // The old code substituted a sentence the person never wrote and sent it to the model. An empty
    // editor is an empty editor.
    message.value = '先写下你卡在哪儿，再开始拆解。';
    return;
  }
  const ticket = ++runSeq.value;
  // Invalidate any save in flight: its `finally` must not clear the new run's save lock.
  saveSeq += 1;
  loading.value = true; saving.value = false; message.value = ''; aiNotice.value = '';
  // A new run retires the old result: leaving it on screen while the new job runs (or fails) lets the
  // reader save a breakdown that belongs to different input.
  result.value = undefined;
  safety.value = undefined;
  resultSource.value = '';
  lastJobId.value = '';
  copied.value = false; saved.value = false;
  try {
    const queued = await withTimeout(
      api.post<any>('/api/v1/ai/tasks', { taskType: 'emotion_analysis', content: submitted, style: 'rational', sourceId: `emotion_${Date.now()}` }),
      20_000,
      '提交拆解任务超时',
    );
    lastJobId.value = queued.jobId;
    const state = await poll(queued.jobId, ticket);
    if (!state || ticket !== runSeq.value) return;
    aiNotice.value = aiDegradationNotice(state);
    const escalated = toSafety(state);
    if (escalated) {
      safety.value = escalated;
      resultSource.value = submitted;
      return;
    }
    const parsed = toResult(state.structured);
    if (!parsed) {
      message.value = '这次拆解没有返回完整内容，可以再试一次。';
      return;
    }
    result.value = parsed;
    resultSource.value = submitted;
  } catch (cause: any) {
    if (ticket === runSeq.value) message.value = cause?.message ?? '拆解失败，请稍后重试';
  } finally {
    if (ticket === runSeq.value) loading.value = false;
  }
}

async function save() {
  // A stale result belongs to different text; saving it would file a breakdown the person no longer
  // has on screen. `saved` makes a second tap a no-op, and `saving` stops a double tap from creating
  // two diaries in the first place.
  if (!result.value || saving.value || saved.value || resultStale.value) return;
  const ticket = runSeq.value;
  const saveTicket = ++saveSeq;
  const current = result.value;
  const source = resultSource.value;
  saving.value = true;
  message.value = '';
  try {
    await api.post('/api/v1/diaries', {
      emotion: '焦虑',
      content: `${source}\n\n${current.summary ?? current.nextSmallStep}`,
      hasLetter: false,
      source: 'emotion-analysis',
      toolResult: current,
    });
    // A run or another save started while this was in flight owns the screen now.
    if (ticket !== runSeq.value || saveTicket !== saveSeq) return;
    saved.value = true;
    message.value = '已保存到日记';
  } catch (cause: any) {
    if (ticket === runSeq.value && saveTicket === saveSeq) {
      message.value = cause?.message ?? '保存失败，请稍后重试';
    }
  } finally {
    // An older save must not unlock a newer one's button.
    if (saveTicket === saveSeq) saving.value = false;
  }
}

async function copyResult() {
  if (!result.value) return;
  const steps = result.value.advice.length ? result.value.advice : [result.value.nextSmallStep];
  copied.value = await copyText([result.value.summary, ...steps].filter(Boolean).join('\n'));
  message.value = copied.value ? '已复制结果' : '复制失败，请稍后重试';
}

async function restoreExistingResult() {
  const jobId = typeof route.query.job === 'string' ? route.query.job.trim() : '';
  if (!jobId) return;
  const ticket = ++runSeq.value;
  loading.value = true;
  message.value = '';
  aiNotice.value = '';
  try {
    const initial = await withTimeout(api.get<any>(`/api/v1/ai/tasks/${encodeURIComponent(jobId)}`), 15_000, '读取拆解结果超时');
    const state = ['queued', 'running'].includes(initial.status) ? await poll(jobId, ticket) : initial;
    if (!state || ticket !== runSeq.value) return;
    // The status decides first. `structured` is `{}` for many failed jobs, which is truthy, so the
    // old `!structured` condition let a failure through as an incomplete success.
    if (!['succeeded', 'fallback'].includes(state.status)) {
      throw new Error(state.job?.errorMessage ?? '情绪拆解任务尚未完成');
    }
    aiNotice.value = aiDegradationNotice(state);
    lastJobId.value = jobId;
    const prompt = displayPrompt(state.job?.promptSummary ?? content.value);
    const escalated = toSafety(state);
    content.value = prompt;
    resultSource.value = prompt;
    if (escalated) {
      safety.value = escalated;
      result.value = undefined;
      return;
    }
    const restored = toResult(state.structured);
    if (!restored) throw new Error('这次拆解没有返回完整内容');
    if (/^(?:ROUTE|FLOW|DECOMPOSE)_/i.test(restored.triggerEvent)) restored.triggerEvent = prompt;
    result.value = restored;
    copied.value = false;
    saved.value = false;
  } catch (cause: any) {
    if (ticket === runSeq.value) message.value = cause?.message ?? '无法读取这次情绪拆解结果';
  } finally {
    if (ticket === runSeq.value) loading.value = false;
  }
}

onMounted(() => { void restoreExistingResult(); });
// A poll in flight must not keep writing into a page the reader has left.
onBeforeUnmount(() => { runSeq.value += 1; });
</script>

<template>
  <section class="page goodnight-page decompose-page">
    <header class="rest-topbar">
      <button class="back-icon" data-testid="front-tool-back" aria-label="返回" @click="safeBack">‹</button>
      <h1>拆解任务</h1>
      <span aria-hidden="true"></span>
    </header>

    <h2 class="decompose-title">把难题拆成下一步</h2>
    <p class="decompose-lead">先写下你卡在哪儿，不需要写得完整。</p>

    <section class="decompose-input">
      <textarea
        v-model="content"
        data-testid="input-decompose"
        maxlength="1000"
        placeholder="比如：不知道怎么开始准备明天那件事。"
      />
      <span class="decompose-count">{{ count }}/1000</span>
    </section>

    <section class="decompose-modes">
      <h2>拆解方式</h2>
      <div class="mode-row" role="group" aria-label="拆解方式">
        <button
          type="button"
          class="mode-chip"
          :class="{ active: mode === 'minimal' }"
          :aria-pressed="mode === 'minimal'"
          data-testid="decompose-mode-minimal"
          @click="mode = 'minimal'"
        >先做最小一步</button>
        <button
          type="button"
          class="mode-chip"
          :class="{ active: mode === 'list' }"
          :aria-pressed="mode === 'list'"
          data-testid="decompose-mode-list"
          @click="mode = 'list'"
        >列出几步</button>
      </div>
      <p class="decompose-note">如需使用 AI，结果会在任务真实完成后出现；失败会显示原因。</p>
    </section>

    <AiDegradationNotice :notice="aiNotice" />

    <section v-if="safety" class="decompose-safety-card" data-testid="decompose-safety-card">
      <h2>先照顾现在的安全</h2>
      <p v-if="safety.message" class="safety-message">{{ safety.message }}</p>
      <p v-if="safety.nextSmallStep" class="safety-step"><strong>现在可以做</strong>{{ safety.nextSmallStep }}</p>
      <button class="primary" type="button" @click="router.push('/pages/safety/index')">查看现实支持</button>
    </section>

    <section
      v-if="result && !safety"
      class="decompose-result-section"
      data-testid="decompose-result-card"
      :data-job-id="lastJobId"
    >
      <h2>拆解结果</h2>
      <article v-if="mode === 'minimal'" class="decompose-result-card">
        <p v-if="result.summary" class="result-summary">{{ result.summary }}</p>
        <div class="result-block" data-tone="action"><strong>先做这一小步</strong><p>{{ result.nextSmallStep }}</p></div>
      </article>
      <ol v-else class="decompose-steps">
        <li v-for="(step, index) in (result.advice.length ? result.advice : [result.nextSmallStep])" :key="index">
          <strong>第 {{ index + 1 }} 步</strong><p>{{ step }}</p>
        </li>
      </ol>
      <p v-if="resultStale" class="result-stale" data-testid="decompose-stale">内容已修改，请重新拆解后再保存。</p>
      <div class="sheet-actions">
        <button data-testid="btn-decompose-again" @click="run">重新拆解</button>
        <button
          data-testid="btn-decompose-save"
          class="primary"
          :disabled="saving || resultStale || saved"
          @click="save"
        >{{ saving ? '保存中…' : saved ? '已保存到日记' : '保存到日记' }}</button>
        <button data-testid="btn-decompose-copy" @click="copyResult">{{ copied ? '已复制' : '复制结果' }}</button>
      </div>
    </section>

    <p v-if="message" class="floating-status">{{ message }}</p>

    <div class="submit-dock">
      <button class="submit-wide" data-testid="btn-decompose-run" :disabled="!canRun" @click="run">{{ loading ? '拆解中…' : '开始拆解' }}</button>
    </div>
  </section>
</template>

<style scoped>
/* ---- V2 layout ---------------------------------------------------------------------------------
   One column: bar, title, editor, the two ways to read the result, the AI note, then the action. The
   old page boxed the editor in a card with the button inside it, drew the result blocks with decorative
   glyphs, and ended with an encouragement aside the design does not have. */
.decompose-page.goodnight-page {
  /* A column, so the action can be pushed to the bottom of the viewport with `margin-top: auto`:
     `position: sticky; bottom: 0` does nothing to a short page, and the button sat mid-screen with a
     third of the screen blank underneath it. */
  display: flex;
  flex-direction: column;
  /* The shared `.decompose-page` sets `gap: 8px`; with a flex column that stacks on top of every
     explicit margin and widened the space between blocks (measured 39px where the design has 23px). */
  gap: 0;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 100vh;
  padding: 0 0 calc(24px + env(safe-area-inset-bottom));
  /* The bar below is exactly viewport-wide; the shared `.goodnight-page` clips it at the inset. */
  overflow-x: visible;
}

.decompose-page .rest-topbar {
  /* Geometry stated here rather than via `.bleed-bar`: the shared `.rest-topbar` carries its own
     margin, padding, a fixed 84px height and a translateY(-8px), which together left an 84px dead band
     under the title and put the back button off the bar's content box. */
  position: sticky;
  top: 0;
  z-index: 10;
  display: grid;
  /* 24px for the chevron and no gap: the shared bar's 32px column plus `gap: 8px` put the title 91
     device px after the chevron where the design has 25. */
  grid-template-columns: 24px minmax(0, 1fr) 24px;
  gap: 0;
  align-items: center;
  box-sizing: border-box;
  width: calc(100% + 36px);
  max-width: none;
  height: auto;
  min-height: 52px;
  margin: 0 0 0 -18px;
  padding: 0 18px;
  transform: none;
  border-bottom: 1px solid #e8eaed;
  background: #ffffff;
}

.decompose-page .rest-topbar .back-icon {
  justify-self: start;
  /* The shared rule centres the glyph in its track; the design puts it on the content axis. */
  place-items: center start;
  width: 32px;
  height: 32px;
  /* The shared `.back-icon` carries a -18px left margin; left in place it pushed the button off the
     bar's content box and `overflow: hidden` clipped the chevron away. */
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: #39454c;
  font-size: 24px;
  line-height: 1;
  text-align: left;
}

.decompose-page .rest-topbar h1 {
  color: #242a32;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.3px;
  text-align: left;
}

.decompose-title {
  margin: 18px 0 0;
  color: #242a32;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.4px;
  line-height: 1.3;
}

.decompose-lead {
  margin: 8px 0 0;
  color: #7a838e;
  font-size: 13px;
  line-height: 1.6;
}

.decompose-input {
  position: relative;
  margin-top: 16px;
}

.decompose-input textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 148px;
  padding: 12px 12px 26px;
  border: 1px solid #e4e7ea;
  border-radius: 8px;
  background: #ffffff;
  color: #242a32;
  font-size: 15px;
  line-height: 1.7;
  resize: none;
}

/* The WebView draws an orange default focus ring; the page's accent is the green hairline. */
.decompose-input textarea:focus {
  outline: none;
  border-color: #275f56;
}

.decompose-count {
  position: absolute;
  right: 12px;
  bottom: 8px;
  color: #9aa1a9;
  font-size: 11px;
}

.decompose-modes { margin-top: 22px; }

.decompose-modes h2 {
  margin: 0 0 10px;
  color: #242a32;
  font-size: 14.5px;
  font-weight: 650;
}

.mode-row { display: flex; gap: 8px; }

.mode-chip {
  min-height: 0;
  padding: 8px 14px;
  border: 1px solid #e4e7ea;
  border-radius: 8px;
  background: #ffffff;
  color: #5c656f;
  font-size: 13px;
  line-height: 1.2;
}

.mode-chip.active {
  border-color: #c3dad0;
  background: #eaf2ee;
  color: #275f56;
  font-weight: 600;
}

.decompose-note {
  margin: 12px 0 0;
  padding: 12px 14px;
  border-radius: 8px;
  background: #f5f7f8;
  color: #6c747d;
  font-size: 12.5px;
  line-height: 1.7;
}

.decompose-result-section {
  margin-top: 24px;
  /* The shared `.decompose-page .decompose-result-section` fixes a 272px height and hides overflow,
     which would clip a longer real result. */
  height: auto;
  overflow: visible;
}

.decompose-result-section h2 {
  margin: 0 0 10px;
  color: #242a32;
  font-size: 14.5px;
  font-weight: 650;
}

/*
 * The legacy page has a 272px fixed result card and a 64px icon column for the old four-row layout.
 * Both are global selectors; scoped styles need the same shape plus the scope attribute to win, or the
 * new single-step card is squeezed into the icon column and its actions are pushed off screen.
 */
.decompose-page .decompose-result-section .decompose-result-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: auto;
  min-height: 0;
  padding: 0;
  overflow: visible;
  grid-template-rows: none;
}

.decompose-page .decompose-result-section .result-block {
  display: block;
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
}

.decompose-result-card { display: grid; gap: 14px; }

.result-block strong {
  display: block;
  color: #242a32;
  font-size: 12.5px;
  font-weight: 600;
}

.result-block p {
  margin: 4px 0 0;
  color: #4d565f;
  font-size: 14px;
  line-height: 1.7;
}

.decompose-steps {
  margin: 0;
  padding-left: 0;
  list-style: none;
  color: #4d565f;
}

.decompose-steps li { margin-bottom: 8px; font-size: 14px; line-height: 1.7; }
.decompose-steps li strong { color: #242a32; font-size: 12.5px; }
.decompose-steps li p { margin: 3px 0 0; }

.decompose-summary summary { color: #5c656f; font-size: 13px; cursor: pointer; }
.decompose-summary p { margin: 8px 0 0; color: #4d565f; font-size: 13.5px; line-height: 1.7; }

.result-summary { margin: 0; color: #4d565f; font-size: 14px; line-height: 1.7; }
.result-stale { margin: 10px 0 0; color: #bd4545; font-size: 12.5px; line-height: 1.5; }

/* The safety escalation is visually distinct on purpose: it is not a breakdown to save. */
.decompose-safety-card {
  margin-top: 18px;
  padding: 16px;
  border: 1px solid #e8c9c9;
  border-radius: 10px;
  background: #fdf7f7;
}

.decompose-safety-card h2 {
  margin: 0 0 10px;
  color: #8f2f2f;
  font-size: 15px;
  font-weight: 650;
}

.safety-message { margin: 0; color: #4d565f; font-size: 14px; line-height: 1.7; }
.safety-step { margin: 10px 0 0; color: #4d565f; font-size: 13.5px; line-height: 1.6; }
.safety-step strong { display: block; margin-bottom: 3px; color: #242a32; font-size: 12.5px; }

.decompose-safety-card button.primary {
  width: 100%;
  min-height: 40px;
  margin-top: 14px;
  border: 0;
  border-radius: 8px;
  background: #275f56;
  color: #ffffff;
  font-size: 14px;
}

#btn-decompose-save:disabled { opacity: 0.55; }

.submit-dock {
  /* Pushed to the bottom of the column: on a short page the button sits where the design puts it
     instead of floating under the note. */
  margin-top: auto;
  padding-top: 14px;
}

.submit-dock .submit-wide {
  width: 100%;
  min-height: 46px;
  border: 0;
  border-radius: 10px;
  background: #275f56;
  color: #ffffff;
  font-size: 15px;
  font-weight: 650;
}
</style>
