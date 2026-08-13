<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
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
const count = computed(() => content.value.length);

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
      return state.structured;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 350));
  }
  throw new Error('情绪拆解任务超时');
}

async function run() {
  loading.value = true; message.value = '';
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
  try {
    const state = await api.get<any>(`/api/v1/ai/tasks/${encodeURIComponent(jobId)}`);
    const structured = ['queued', 'running'].includes(state.status) ? await poll(jobId) : state.structured;
    if (!['succeeded', 'fallback'].includes(state.status) && !structured) throw new Error(state.job?.errorMessage ?? '情绪拆解任务尚未完成');
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
  <section class="page goodnight-page rest-page detail-rest-page decompose-page">
    <header class="rest-topbar"><button class="back-icon" data-testid="front-tool-back" @click="router.back()">‹</button><h1>情绪拆解</h1><span /></header>
    <p class="decompose-guide" aria-label="情绪拆解说明">把情绪理清楚，才能温柔地照顾自己</p>
    <article class="decompose-input-card"><div class="section-heading"><h2>此刻的你，想拆解什么情绪呢？</h2><span>{{ count }}/1000</span></div><textarea v-model="content" class="textarea" data-testid="input-decompose" maxlength="1000" placeholder="比如：今天被一句话影响了很久，我不知道自己为什么这么难过……" /><button class="submit-wide" data-testid="btn-decompose-run" :disabled="loading" @click="run">{{ loading ? '拆解中…' : '开始拆解' }}</button></article>
    <section v-if="result" class="decompose-result-section" data-testid="decompose-result-card">
      <h2><span class="decompose-result-title-mark" aria-hidden="true">⌁</span>拆解结果</h2>
      <article class="decompose-result-card">
        <div class="result-block" data-tone="event"><span class="result-icon" aria-hidden="true">♡</span><div class="result-copy"><strong>触发事件</strong><p>{{ result.triggerEvent }}</p></div></div>
        <div class="result-block" data-tone="emotion"><span class="result-icon" aria-hidden="true">✦</span><div class="result-copy"><strong>核心情绪</strong><p>{{ result.coreEmotions.join('、') }}</p></div></div>
        <div class="result-block" data-tone="need"><span class="result-icon" aria-hidden="true">❋</span><div class="result-copy"><strong>真实需要</strong><p>{{ result.realNeeds.join('、') }}</p></div></div>
        <div class="result-block" data-tone="action"><span class="result-icon" aria-hidden="true">⌁</span><div class="result-copy"><strong>可以先做的一件小事</strong><p>{{ result.nextSmallStep }}</p></div></div>
        <details v-if="result.summary" class="decompose-summary"><summary>查看温柔小结</summary><p>{{ result.summary }}</p></details>
      </article>
      <div class="sheet-actions">
        <button data-testid="btn-decompose-again" @click="run">重新拆解</button>
        <button data-testid="btn-decompose-save" class="primary" @click="save">{{ saved ? '已保存到日记' : '保存到日记' }}</button>
        <button data-testid="btn-decompose-copy" @click="copyResult">{{ copied ? '已复制' : '复制结果' }}</button>
      </div>
      <aside class="decompose-encouragement" aria-label="温柔提醒"><span aria-hidden="true"></span><p>每一种情绪都值得被看见，<br>你已经做得很好了，慢慢来呀～</p></aside>
    </section>
    <p v-if="message" class="floating-status">{{ message }}</p>
  </section>
</template>
