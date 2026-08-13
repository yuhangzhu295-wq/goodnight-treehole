<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { copyText } from '../clipboard';
import ToolTaskContracts from '../components/ToolTaskContracts.vue';

const route = useRoute();
const router = useRouter();
const input = ref('今天的心情有点乱，我想换一种方式说出来。');
const result = ref('');
const jobId = ref('');
const saved = ref(false);
const copied = ref(false);
const loading = ref(false);
const error = ref('');

const type = computed(() => {
  const alias = String(route.path.split('/').pop() ?? '');
  const byPath: Record<string, string> = {
    rewrite: 'negative_rewrite', rant: 'rant', heal: 'healing_phrase', sleep: 'sleep_comfort', work: 'work_support', future: 'future_letter',
  };
  return String(route.query.type ?? byPath[alias] ?? 'negative_rewrite');
});

const meta = computed(() => ({
  negative_rewrite: { title: '负面改写', subtitle: '把刺痛自己的话，换成更温和而不虚假的表达。', emotion: '焦虑', action: '帮我换一种说法' },
  rant: { title: '发疯文案', subtitle: '允许自己把堵住的话痛快写出来。', emotion: '委屈', action: '帮我释放一下' },
  healing_phrase: { title: '治愈短句', subtitle: '为此刻的你生成一句简短的安放。', emotion: '委屈', action: '生成一句话' },
  sleep_comfort: { title: '失眠安慰', subtitle: '把夜里的念头慢慢放轻。', emotion: '失眠', action: '陪我缓一缓' },
  work_support: { title: '工作破防', subtitle: '把工作里的压力分成能看见、能处理的小部分。', emotion: '工作', action: '帮我梳理' },
  future_letter: { title: '写给未来的自己', subtitle: '把今天的你，整理成一封可以编辑的信。', emotion: '焦虑', action: '帮我整理成一封信' },
}[type.value] ?? { title: '情绪工具', subtitle: '给此刻的自己一点空间。', emotion: '焦虑', action: '开始生成' }));

async function restoreLatestResult() {
  result.value = '';
  jobId.value = '';
  saved.value = false;
  copied.value = false;
  error.value = '';
  try {
    const latest = await api.get<any>(`/api/v1/ai/tasks/latest?taskType=${encodeURIComponent(type.value)}`);
    if (!latest.item?.result) return;
    jobId.value = latest.item.id;
    result.value = latest.item.result;
    if (latest.item.promptSummary) input.value = latest.item.promptSummary;
  } catch (cause: any) {
    error.value = cause?.message ?? '无法恢复最近的生成结果';
  }
}

watch(type, restoreLatestResult, { immediate: true });

async function poll(id: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const state = await api.get<any>(`/api/v1/ai/tasks/${id}`);
    if (!['queued', 'running'].includes(state.status)) {
      if (!['succeeded', 'fallback'].includes(state.status)) throw new Error(state.job?.errorMessage ?? 'AI 任务未完成');
      return state;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 350));
  }
  throw new Error(`AI 任务超时：${id}`);
}

async function runTool() {
  loading.value = true;
  saved.value = false;
  copied.value = false;
  error.value = '';
  try {
    const queued = await api.post<any>('/api/v1/ai/tasks', { taskType: type.value, content: input.value, sourceId: `tool_${Date.now()}` });
    jobId.value = queued.jobId;
    const completed = await poll(queued.jobId);
    result.value = completed.result;
  } catch (cause: any) {
    error.value = cause?.message ?? '生成失败，请稍后再试';
  } finally {
    loading.value = false;
  }
}

async function saveResult() {
  if (!result.value) await runTool();
  if (!result.value) return;
  await api.post('/api/v1/diaries', { emotion: meta.value.emotion, content: result.value, hasLetter: false, source: `tool-${type.value}`, toolResult: { taskType: type.value, input: input.value, result: result.value, jobId: jobId.value } });
  saved.value = true;
}

async function copyResult() {
  if (!result.value) return;
  copied.value = await copyText(result.value);
  if (!copied.value) error.value = '复制失败，请稍后重试';
}
</script>

<template>
  <section class="page goodnight-page rest-page detail-rest-page tool-run-page">
    <header class="rest-topbar"><button class="back-icon" data-testid="front-tool-run-back" @click="router.back()">‹</button><h1>{{ meta.title }}</h1><span /></header>
    <article class="decompose-input-card">
      <h2>{{ meta.subtitle }}</h2>
      <textarea v-model="input" class="textarea" data-testid="input-tool-run" />
      <button class="submit-wide" data-testid="btn-tool-run-submit" :disabled="loading" @click="runTool">{{ loading ? '生成中…' : meta.action }}</button>
      <p v-if="loading" class="tool-job-status">正在排队并生成（任务 {{ jobId || '创建中' }}）</p>
    </article>
    <article v-if="result" class="decompose-result-card" data-testid="tool-run-result-card">
      <h2>{{ type === 'negative_rewrite' ? '更温和但不虚假的表达' : '生成结果' }}</h2>
      <p class="tool-original" v-if="type === 'negative_rewrite'"><strong>原始表达：</strong>{{ input }}</p>
      <textarea v-if="type === 'future_letter'" v-model="result" class="textarea future-letter-editor" data-testid="future-letter-editor" />
      <p v-else>{{ result }}</p>
      <div class="sheet-actions"><button data-testid="btn-tool-run-save" class="primary" @click="saveResult">{{ saved ? '已保存到日记' : '保存到日记' }}</button><button data-testid="btn-tool-run-copy" @click="copyResult">{{ copied ? '已复制' : '复制结果' }}</button><button data-testid="btn-tool-run-close" @click="result = ''">收起结果</button></div>
    </article>
    <ToolTaskContracts v-if="result" :type="type" :input="input" :result="result" />
    <p v-if="error" class="error-text">{{ error }}</p>
  </section>
</template>
