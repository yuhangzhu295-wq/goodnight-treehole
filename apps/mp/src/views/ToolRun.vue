<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { aiDegradationNotice } from '../aiStatus';
import { copyText } from '../clipboard';
import AiDegradationNotice from '../components/AiDegradationNotice.vue';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

const route = useRoute();
const router = useRouter();

const input = ref('');
const result = ref('');
const jobId = ref('');
const saved = ref(false);
const copied = ref(false);
const saving = ref(false);
const loading = ref(false);
const error = ref('');
const aiNotice = ref('');

/** Snapshot of the input text used to produce the current result */
const resultInputSnapshot = ref('');
const resultStale = computed(
  () => Boolean(result.value) && input.value.trim() !== resultInputSnapshot.value,
);

const activeMode = ref('default');
const runSeq = ref(0);

const type = computed(() => {
  const alias = String(route.path.split('/').pop() ?? '');
  const byPath: Record<string, string> = {
    rewrite: 'negative_rewrite',
    rant: 'rant',
    heal: 'healing_phrase',
    sleep: 'sleep_comfort',
    work: 'work_support',
    future: 'future_letter',
  };
  return String(route.query.type ?? byPath[alias] ?? 'negative_rewrite');
});

type ToolMeta = {
  title: string;
  leadTitle: string;
  subtitle: string;
  placeholder: string;
  emotion: string;
  action: string;
  modes: Array<{ key: string; label: string }>;
};

const meta = computed<ToolMeta>(() => {
  const map: Record<string, ToolMeta> = {
    negative_rewrite: {
      title: '整理工具',
      leadTitle: '整理一下这段话',
      subtitle: '把刺痛自己的话，换成更温和而不虚假的表达。',
      placeholder: '先把你想说的文字放在这里……',
      emotion: '焦虑',
      action: '开始整理',
      modes: [
        { key: 'clear', label: '说得更清楚' },
        { key: 'shorter', label: '缩短一点' },
        { key: 'action', label: '拆成行动' },
      ],
    },
    rant: {
      title: '发泄表达',
      leadTitle: '把堵住的情绪写下来',
      subtitle: '允许自己把堵住的话痛快写出来，不做评判。',
      placeholder: '写下心里堵着的那句话，不需要讲道理……',
      emotion: '委屈',
      action: '帮我释放一下',
      modes: [
        { key: 'raw', label: '痛快说' },
        { key: 'deep', label: '找根源' },
      ],
    },
    healing_phrase: {
      title: '安放卡片',
      leadTitle: '给此刻留一句安放',
      subtitle: '为此刻的你生成一句简短、平实、可落地的陪伴。',
      placeholder: '此刻脑子里最沉的一句话是什么？',
      emotion: '委屈',
      action: '生成一句话',
      modes: [
        { key: 'gentle', label: '温和一点' },
        { key: 'solid', label: '踏实一点' },
      ],
    },
    sleep_comfort: {
      title: '睡前放轻',
      leadTitle: '把夜里的念头放下来',
      subtitle: '夜里想不通的事，不需要在睡前全解决。',
      placeholder: '今晚躺下时，脑子里反复出现什么？',
      emotion: '失眠',
      action: '陪我缓一缓',
      modes: [
        { key: 'breath', label: '慢慢放平' },
        { key: 'tomorrow', label: '留到明天' },
      ],
    },
    work_support: {
      title: '工作梳理',
      leadTitle: '理一理工作里的压力',
      subtitle: '把工作里的卡点分成能看见、能处理的小部分。',
      placeholder: '手头卡住的事情是什么？遇到什么阻力？',
      emotion: '工作',
      action: '帮我梳理',
      modes: [
        { key: 'boundary', label: '区分责任' },
        { key: 'step', label: '先迈一小步' },
      ],
    },
    future_letter: {
      title: '未来信件',
      leadTitle: '给未来的自己留句话',
      subtitle: '把今天的你，整理成一封可以编辑的信。',
      placeholder: '给以后的自己留下一句真实的心情……',
      emotion: '焦虑',
      action: '帮我整理成信',
      modes: [
        { key: 'future_week', label: '给下周的我' },
        { key: 'future_year', label: '给明年的我' },
      ],
    },
  };

  return (
    map[type.value] ?? {
      title: '情绪工具',
      leadTitle: '整理一下这段话',
      subtitle: '给此刻的自己一点空间。',
      placeholder: '先把你想说的文字放在这里……',
      emotion: '焦虑',
      action: '开始整理',
      modes: [
        { key: 'clear', label: '说得更清楚' },
        { key: 'shorter', label: '缩短一点' },
      ],
    }
  );
});

type ToolFailure = 'restore' | 'generate' | 'copy';
const failure = ref<ToolFailure>('restore');

const canRun = computed(() => !loading.value && input.value.trim().length > 0);

async function restoreLatestResult() {
  const currentSeq = ++runSeq.value;
  result.value = '';
  jobId.value = '';
  resultInputSnapshot.value = '';
  saved.value = false;
  copied.value = false;
  error.value = '';
  failure.value = 'restore';
  aiNotice.value = '';

  try {
    const latest = await api.get<any>(
      `/api/v1/ai/tasks/latest?taskType=${encodeURIComponent(type.value)}`,
    );
    if (currentSeq !== runSeq.value) return;
    if (!latest.item?.result) return;
    jobId.value = latest.item.id;
    result.value = latest.item.result;
    aiNotice.value = aiDegradationNotice({ status: latest.item.status, job: latest.item });
    if (latest.item.promptSummary && !input.value) {
      input.value = latest.item.promptSummary;
      resultInputSnapshot.value = latest.item.promptSummary.trim();
    } else {
      resultInputSnapshot.value = input.value.trim();
    }
  } catch (cause: any) {
    if (currentSeq !== runSeq.value) return;
    error.value = cause?.message ?? '无法恢复最近的生成结果';
    failure.value = 'restore';
  }
}

watch(
  type,
  () => {
    activeMode.value = meta.value.modes[0]?.key ?? 'default';
    restoreLatestResult();
  },
  { immediate: true },
);

async function poll(id: string, seq: number) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (seq !== runSeq.value) throw new Error('任务已被取消');
    const state = await api.get<any>(`/api/v1/ai/tasks/${id}`);
    if (seq !== runSeq.value) throw new Error('任务已被取消');
    if (!['queued', 'running'].includes(state.status)) {
      if (!['succeeded', 'fallback'].includes(state.status)) {
        throw new Error(state.job?.errorMessage ?? 'AI 任务未完成');
      }
      return state;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 400));
  }
  throw new Error(`AI 任务超时：${id}`);
}

async function runTool() {
  if (!canRun.value) return;
  const currentSeq = ++runSeq.value;
  loading.value = true;
  saved.value = false;
  copied.value = false;
  error.value = '';
  failure.value = 'generate';
  aiNotice.value = '';
  result.value = '';
  jobId.value = '';

  const snapshot = input.value.trim();

  try {
    const queued = await api.post<any>('/api/v1/ai/tasks', {
      taskType: type.value,
      content: snapshot,
      sourceId: `tool_${Date.now()}`,
    });
    if (currentSeq !== runSeq.value) return;
    jobId.value = queued.jobId;
    const completed = await poll(queued.jobId, currentSeq);
    if (currentSeq !== runSeq.value) return;
    result.value = completed.result;
    resultInputSnapshot.value = snapshot;
    aiNotice.value = aiDegradationNotice(completed);
  } catch (cause: any) {
    if (currentSeq !== runSeq.value) return;
    error.value = cause?.message ?? '生成失败，请稍后再试';
  } finally {
    if (currentSeq === runSeq.value) {
      loading.value = false;
    }
  }
}

async function retryFailedAction() {
  error.value = '';
  if (failure.value === 'generate') await runTool();
  else if (failure.value === 'copy') await copyResult();
  else await restoreLatestResult();
}

async function saveResult() {
  if (saving.value || saved.value || resultStale.value) return;
  if (!result.value || !jobId.value) {
    error.value = '还没有可保存的结果，请先运行一次';
    failure.value = 'generate';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    await api.post('/api/v1/diaries', {
      emotion: meta.value.emotion,
      content: result.value,
      hasLetter: false,
      source: `tool-${type.value}`,
      toolResult: {
        taskType: type.value,
        input: resultInputSnapshot.value,
        result: result.value,
        jobId: jobId.value,
      },
    });
    saved.value = true;
  } catch (cause: any) {
    error.value = cause?.message ?? '保存到日记失败，请稍后重试';
  } finally {
    saving.value = false;
  }
}

async function copyResult() {
  if (!result.value) return;
  copied.value = await copyText(result.value);
  if (!copied.value) {
    error.value = '复制失败，请稍后重试';
    failure.value = 'copy';
  }
}

function closeResult() {
  result.value = '';
  jobId.value = '';
  resultInputSnapshot.value = '';
  saved.value = false;
  copied.value = false;
}

onBeforeUnmount(() => {
  runSeq.value += 1;
});
</script>

<template>
  <section class="goodnight-page tool-run-page">
    <header class="tool-topbar">
      <button class="back-btn" data-testid="front-tool-run-back" type="button" aria-label="返回" @click="router.back()">‹</button>
      <h1 class="topbar-title">{{ meta.title }}</h1>
      <span aria-hidden="true"></span>
    </header>

    <div class="tool-body">
      <h2 class="tool-lead-title">{{ meta.leadTitle }}</h2>
      <p class="tool-lead-sub">{{ meta.subtitle }}</p>

      <section class="tool-input-section">
        <textarea
          v-model="input"
          class="tool-textarea"
          data-testid="input-tool-run"
          maxlength="1000"
          :placeholder="meta.placeholder"
        ></textarea>
        <span class="tool-count">{{ input.length }}/1000</span>
      </section>

      <section class="tool-modes-section">
        <h3 class="section-title">处理方式</h3>
        <div class="mode-chips" role="group" aria-label="处理方式">
          <button
            v-for="mode in meta.modes"
            :key="mode.key"
            type="button"
            class="mode-chip"
            :class="{ active: activeMode === mode.key }"
            @click="activeMode = mode.key"
          >
            {{ mode.label }}
          </button>
        </div>
      </section>

      <AiDegradationNotice :notice="aiNotice" />

      <!-- Result Card -->
      <section v-if="result" class="tool-result-section" data-testid="tool-run-result-card">
        <h3 class="section-title">最近一次结果</h3>
        <article class="tool-result-card">
          <p class="tool-result-text">{{ result }}</p>
          <div class="tool-card-actions">
            <button
              class="action-btn primary"
              data-testid="btn-tool-run-save"
              type="button"
              :disabled="saving || saved || resultStale"
              @click="saveResult"
            >
              {{ saving ? '保存中…' : saved ? '已保存到日记' : '保存到日记' }}
            </button>
            <button class="action-btn" data-testid="btn-tool-run-copy" type="button" @click="copyResult">
              {{ copied ? '已复制' : '复制结果' }}
            </button>
            <button class="action-btn" data-testid="btn-tool-run-close" type="button" @click="closeResult">
              收起结果
            </button>
          </div>
          <p v-if="resultStale" class="result-stale" data-testid="tool-run-stale">内容已修改，请重新生成后再保存。</p>
        </article>
      </section>

      <!-- Empty state when no result yet -->
      <section v-else class="tool-result-section">
        <h3 class="section-title">最近一次结果</h3>
        <div class="empty-result-box">
          这里显示真实保存或成功生成的结果。还没有结果时，不会展示示例成功文案。
        </div>
      </section>

      <LoadErrorBanner
        :message="error"
        :retry-label="failure === 'copy' ? '重新复制' : failure === 'generate' ? '重新生成' : '重新加载'"
        @retry="retryFailedAction"
      />
    </div>

    <!-- Pinned Bottom Dock -->
    <div class="submit-dock">
      <button
        class="submit-wide"
        data-testid="btn-tool-run-submit"
        type="button"
        :disabled="loading || !canRun"
        @click="runTool"
      >
        {{ loading ? '生成中…' : meta.action }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.tool-run-page {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 100vh;
  padding-bottom: calc(88px + env(safe-area-inset-bottom));
  overflow-x: hidden;
  background: var(--gn-paper, #ffffff);
  color: var(--gn-text, #242a32);
  font-family: var(--gn-font-body);
}

:global(.phone-shell:has(.tool-run-page)) {
  padding-bottom: 0;
}

.tool-topbar {
  display: grid;
  grid-template-columns: 28px 1fr 28px;
  align-items: center;
  gap: 0;
  box-sizing: border-box;
  width: 100%;
  min-height: 52px;
  padding: 0 16px;
  border-bottom: 1px solid var(--gn-line, #eef0f2);
  background: var(--gn-paper, #ffffff);
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 28px;
  height: 44px;
  min-height: 44px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--gn-ink, #242a32);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.topbar-title {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  color: var(--gn-ink, #242a32);
  letter-spacing: -0.2px;
}

.tool-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 20px 16px 0;
}

.tool-lead-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--gn-ink, #242a32);
  line-height: 1.3;
}

.tool-lead-sub {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--gn-muted, #757d87);
  line-height: 1.5;
}

.tool-input-section {
  position: relative;
  margin-top: 18px;
}

.tool-textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 170px;
  padding: 14px 14px 28px;
  border: 1px solid var(--gn-line, #e5e7eb);
  border-radius: 12px;
  background: #ffffff;
  color: var(--gn-ink, #242a32);
  font: inherit;
  font-size: 15px;
  line-height: 1.6;
  resize: none;
}

.tool-textarea::placeholder {
  color: #9ca3af;
}

.tool-count {
  position: absolute;
  right: 12px;
  bottom: 8px;
  font-size: 11px;
  color: var(--gn-muted, #9ca3af);
}

.tool-modes-section {
  margin-top: 24px;
}

.section-title {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 700;
  color: var(--gn-ink, #242a32);
}

.mode-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mode-chip {
  min-height: 36px;
  padding: 6px 14px;
  border: 1px solid var(--gn-line, #e5e7eb);
  border-radius: 10px;
  background: #ffffff;
  color: var(--gn-ink, #242a32);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mode-chip.active {
  border-color: #275f56;
  background: #eaf4ee;
  color: #1e4d45;
  font-weight: 600;
}

.tool-result-section {
  margin-top: 24px;
}

.empty-result-box {
  padding: 16px 18px;
  border-radius: 10px;
  background: #f7f8fa;
  color: #757d87;
  font-size: 13px;
  line-height: 1.6;
}

.tool-result-card {
  padding: 16px;
  border: 1px solid var(--gn-line, #e5e7eb);
  border-radius: 12px;
  background: #ffffff;
}

.tool-result-text {
  margin: 0;
  font-size: 15px;
  line-height: 1.65;
  color: var(--gn-ink, #242a32);
  white-space: pre-wrap;
  word-break: break-word;
}

.tool-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--gn-line, #eef0f2);
}

.action-btn {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--gn-line, #e5e7eb);
  border-radius: 6px;
  background: #ffffff;
  color: var(--gn-ink, #242a32);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.action-btn.primary {
  border-color: #275f56;
  background: #275f56;
  color: #ffffff;
  font-weight: 600;
}

.action-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.result-stale {
  margin: 8px 0 0;
  color: #b45309;
  font-size: 12px;
}

.submit-dock {
  position: fixed;
  right: 0;
  bottom: env(safe-area-inset-bottom);
  left: 0;
  z-index: 20;
  padding: 12px 16px;
  border-top: 1px solid var(--gn-line, #eef0f2);
  background: #ffffff;
}

.submit-wide {
  width: 100%;
  min-height: 48px;
  border: 0;
  border-radius: 12px;
  background: #275f56;
  color: #ffffff;
  font: inherit;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.submit-wide:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
