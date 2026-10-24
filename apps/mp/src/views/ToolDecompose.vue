<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { aiDegradationNotice } from '../aiStatus';
import AiDegradationNotice from '../components/AiDegradationNotice.vue';
import { copyText } from '../clipboard';

type DecomposeResult = { triggerEvent: string; coreEmotions: string[]; realNeeds: string[]; nextSmallStep: string; summary?: string };
const router = useRouter();
const route = useRoute();
const content = ref('');
const result = ref<DecomposeResult>();
const copied = ref(false);
const saved = ref(false);
const loading = ref(false);
const message = ref('');
const aiNotice = ref('');
const count = computed(() => content.value.length);
/**
 * How the same decomposition is laid out.
 *
 * The design's two chips are a reading preference, not two different model calls: 先做最小一步 shows the
 * next step on its own, 列出几步 shows the whole breakdown as a numbered list. Both render the real
 * result the job returned; neither invents anything.
 */
const mode = ref<'minimal' | 'list'>('minimal');

function displayPrompt(value: unknown) {
  return String(value ?? '').replace(/^(?:ROUTE|FLOW|DECOMPOSE)_[A-Z0-9_]+\s+/i, '').trim();
}

function toResult(structured: any): DecomposeResult {
  return {
    triggerEvent: displayPrompt(structured?.triggerEvent ?? structured?.trigger ?? '未记录触发事件'),
    coreEmotions: structured?.coreEmotions ?? [structured?.coreEmotion].filter(Boolean),
    realNeeds: structured?.realNeeds ?? [structured?.realNeed].filter(Boolean),
    nextSmallStep: structured?.nextSmallStep ?? structured?.smallAction ?? structured?.nextStep ?? '先给自己一点安静的时间。',
    summary: structured?.summary,
  };
}

async function poll(id: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const state = await api.get<any>(`/api/v1/ai/tasks/${id}`);
    if (!['queued', 'running'].includes(state.status)) {
      if (!['succeeded', 'fallback'].includes(state.status)) throw new Error(state.job?.errorMessage ?? '情绪拆解失败');
      aiNotice.value = aiDegradationNotice(state);
      return state.structured;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 350));
  }
  throw new Error('情绪拆解任务超时');
}

async function run() {
  loading.value = true; message.value = ''; aiNotice.value = '';
  try {
    const queued = await api.post<any>('/api/v1/ai/tasks', { taskType: 'emotion_analysis', content: content.value || '我说不清楚自己为什么难受。', style: 'rational', sourceId: `emotion_${Date.now()}` });
    const structured = await poll(queued.jobId);
    result.value = toResult(structured);
    copied.value = false; saved.value = false;
  } catch (cause: any) { message.value = cause?.message ?? '拆解失败，请稍后重试'; } finally { loading.value = false; }
}

async function save() {
  if (!result.value) return;
  await api.post('/api/v1/diaries', { emotion: '焦虑', content: `${content.value}\n\n${result.value.summary ?? result.value.nextSmallStep}`, hasLetter: false, source: 'emotion-analysis', toolResult: result.value });
  saved.value = true; message.value = '已保存到日记';
}

async function copyResult() {
  if (!result.value) return;
  copied.value = await copyText([result.value.triggerEvent, ...result.value.coreEmotions, ...result.value.realNeeds, result.value.nextSmallStep].join('\n'));
  message.value = copied.value ? '已复制结果' : '复制失败，请稍后重试';
}

async function restoreExistingResult() {
  const jobId = typeof route.query.job === 'string' ? route.query.job.trim() : '';
  if (!jobId) return;
  loading.value = true;
  message.value = '';
  aiNotice.value = '';
  try {
    const state = await api.get<any>(`/api/v1/ai/tasks/${encodeURIComponent(jobId)}`);
    const structured = ['queued', 'running'].includes(state.status) ? await poll(jobId) : state.structured;
    if (!['succeeded', 'fallback'].includes(state.status) && !structured) throw new Error(state.job?.errorMessage ?? '情绪拆解任务尚未完成');
    aiNotice.value = aiDegradationNotice(state);
    const prompt = displayPrompt(state.job?.promptSummary ?? content.value);
    const restored = toResult(structured);
    if (/^(?:ROUTE|FLOW|DECOMPOSE)_/i.test(restored.triggerEvent)) restored.triggerEvent = prompt;
    content.value = prompt;
    result.value = restored;
    copied.value = false;
    saved.value = false;
  } catch (cause: any) {
    message.value = cause?.message ?? '无法读取这次情绪拆解结果';
  } finally {
    loading.value = false;
  }
}

onMounted(() => { void restoreExistingResult(); });
</script>

<template>
  <section class="page goodnight-page decompose-page">
    <header class="rest-topbar">
      <button class="back-icon" data-testid="front-tool-back" aria-label="返回" @click="router.back()">‹</button>
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

    <section v-if="result" class="decompose-result-section" data-testid="decompose-result-card">
      <h2>拆解结果</h2>
      <article v-if="mode === 'minimal'" class="decompose-result-card">
        <div class="result-block" data-tone="event"><strong>触发事件</strong><p>{{ result.triggerEvent }}</p></div>
        <div class="result-block" data-tone="emotion"><strong>核心情绪</strong><p>{{ result.coreEmotions.join('、') }}</p></div>
        <div class="result-block" data-tone="need"><strong>真实需要</strong><p>{{ result.realNeeds.join('、') }}</p></div>
        <div class="result-block" data-tone="action"><strong>可以先做的一件小事</strong><p>{{ result.nextSmallStep }}</p></div>
        <details v-if="result.summary" class="decompose-summary"><summary>查看温柔小结</summary><p>{{ result.summary }}</p></details>
      </article>
      <ol v-else class="decompose-steps">
        <li><strong>触发事件</strong><p>{{ result.triggerEvent }}</p></li>
        <li><strong>核心情绪</strong><p>{{ result.coreEmotions.join('、') }}</p></li>
        <li><strong>真实需要</strong><p>{{ result.realNeeds.join('、') }}</p></li>
        <li><strong>可以先做的一件小事</strong><p>{{ result.nextSmallStep }}</p></li>
      </ol>
      <div class="sheet-actions">
        <button data-testid="btn-decompose-again" @click="run">重新拆解</button>
        <button data-testid="btn-decompose-save" class="primary" @click="save">{{ saved ? '已保存到日记' : '保存到日记' }}</button>
        <button data-testid="btn-decompose-copy" @click="copyResult">{{ copied ? '已复制' : '复制结果' }}</button>
      </div>
    </section>

    <p v-if="message" class="floating-status">{{ message }}</p>

    <div class="submit-dock">
      <button class="submit-wide" data-testid="btn-decompose-run" :disabled="loading" @click="run">{{ loading ? '拆解中…' : '开始拆解' }}</button>
    </div>
  </section>
</template>

<style scoped>
/* ---- V2 layout ---------------------------------------------------------------------------------
   One column: bar, title, editor, the two ways to read the result, the AI note, then the action. The
   old page boxed the editor in a card with the button inside it, drew the result blocks with decorative
   glyphs, and ended with an encouragement aside the design does not have. */
.decompose-page.goodnight-page {
  display: block;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 100vh;
  padding: 0 0 calc(96px + env(safe-area-inset-bottom));
}

.decompose-page .rest-topbar {
  /* Geometry stated here rather than via `.bleed-bar`: the shared `.rest-topbar` carries its own
     margin and padding, and the combination put the back button 3px off the left edge where
     `overflow: hidden` clipped the chevron away entirely. */
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 32px;
  align-items: center;
  box-sizing: border-box;
  width: calc(100% + 36px);
  max-width: none;
  min-height: 52px;
  margin: 0 0 0 -18px;
  padding: 0 18px;
  border-bottom: 1px solid #e8eaed;
  background: #ffffff;
}

.decompose-page .rest-topbar .back-icon {
  justify-self: start;
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
  resize: vertical;
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

.decompose-result-section { margin-top: 24px; }

.decompose-result-section h2 {
  margin: 0 0 10px;
  color: #242a32;
  font-size: 14.5px;
  font-weight: 650;
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
  padding-left: 20px;
  color: #4d565f;
}

.decompose-steps li { margin-bottom: 12px; font-size: 14px; line-height: 1.7; }
.decompose-steps li strong { color: #242a32; font-size: 12.5px; }
.decompose-steps li p { margin: 3px 0 0; }

.decompose-summary summary { color: #5c656f; font-size: 13px; cursor: pointer; }
.decompose-summary p { margin: 8px 0 0; color: #4d565f; font-size: 13.5px; line-height: 1.7; }

.submit-dock {
  position: sticky;
  bottom: 0;
  z-index: 5;
  box-sizing: border-box;
  width: calc(100% + 36px);
  max-width: none;
  margin: 24px 0 0 -18px;
  padding: 12px 18px calc(12px + env(safe-area-inset-bottom));
  background: #ffffff;
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
