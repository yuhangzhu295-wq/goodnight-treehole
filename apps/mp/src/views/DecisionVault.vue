<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import AppIcon from '../components/icons/AppIcon.vue';

type DecisionStatus = 'draft' | 'cooling' | 'ready' | 'decided' | 'archived';
type DecisionItem = {
  id: string;
  question: string;
  options: string[];
  criteria: string[];
  decision?: string;
  outcome?: string;
  status: DecisionStatus;
  cooldownUntil?: string;
  reviewedAt?: string;
  createdAt: string;
};

const router = useRouter();
const items = ref<DecisionItem[]>([]);
const loading = ref(true);
const busyId = ref('');
const error = ref('');
const notice = ref('');
const nowTick = ref(Date.now());
const draft = reactive({ question: '', reason: '', intensity: 8, hours: 24 });
const answers = reactive<Record<string, { decision: string; outcome: string }>>({});
let timer = 0;

const activeItems = computed(() => items.value.filter((item) => item.status !== 'archived'));
const archivedItems = computed(() => items.value.filter((item) => item.status === 'archived'));

function reasonOf(item: DecisionItem) {
  return item.criteria.find((part) => !part.startsWith('情绪强度:')) ?? '给自己一点时间，再回来看看。';
}

function intensityOf(item: DecisionItem) {
  return item.criteria.find((part) => part.startsWith('情绪强度:'))?.replace('情绪强度:', '') ?? '';
}

function cooldownText(item: DecisionItem) {
  if (!item.cooldownUntil) return '尚未设置冷静时间';
  const remaining = Date.parse(item.cooldownUntil) - nowTick.value;
  if (remaining <= 0) return '冷静时间已结束，可以重新看一眼';
  const minutes = Math.ceil(remaining / 60_000);
  if (minutes < 60) return `还有约 ${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `还有约 ${hours} 小时${rest ? ` ${rest} 分钟` : ''}`;
}

function formatMoment(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function prepareAnswers() {
  for (const item of items.value) {
    answers[item.id] ??= { decision: item.decision ?? '', outcome: item.outcome ?? '' };
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await api.get<any>('/api/v1/decisions');
    items.value = result.items ?? [];
    prepareAnswers();
  } catch (cause: any) {
    error.value = cause?.message ?? '决定保险箱暂时没有打开';
  } finally {
    loading.value = false;
  }
}

async function saveForLater() {
  if (!draft.question.trim() || !draft.reason.trim()) {
    error.value = '请先写下决定和当前想做它的原因';
    return;
  }
  busyId.value = 'create';
  error.value = '';
  notice.value = '';
  try {
    const created = await api.post<any>('/api/v1/decisions', {
      question: draft.question.trim(),
      options: [],
      criteria: [draft.reason.trim(), `情绪强度:${draft.intensity}/10`],
    });
    await api.post('/api/v1/cooldowns', {
      decisionId: created.item.id,
      title: draft.question.trim(),
      reason: draft.reason.trim(),
      hours: draft.hours,
    });
    Object.assign(draft, { question: '', reason: '', intensity: 8, hours: 24 });
    notice.value = '已经放进冷静箱。到时间后，我们只回来问你是否还这样想。';
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '这件事暂时没有保存成功';
    await load();
  } finally {
    busyId.value = '';
  }
}

async function resumeDraft(item: DecisionItem, hours = 24) {
  busyId.value = item.id;
  error.value = '';
  try {
    await api.post('/api/v1/cooldowns', { decisionId: item.id, title: item.question, reason: reasonOf(item), hours });
    notice.value = '冷静时间已经开始。';
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '冷静时间没有设置成功';
  } finally {
    busyId.value = '';
  }
}

async function decide(item: DecisionItem) {
  const answer = answers[item.id];
  if (!answer?.decision.trim()) {
    error.value = '最终决定必须由你自己写下';
    return;
  }
  busyId.value = item.id;
  error.value = '';
  try {
    await api.patch(`/api/v1/decisions/${item.id}`, {
      decision: answer.decision.trim(),
      outcome: answer.outcome.trim(),
      status: 'decided',
    });
    notice.value = '已记录你自己作出的决定。';
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '决定暂时没有保存成功';
  } finally {
    busyId.value = '';
  }
}

async function archive(item: DecisionItem) {
  busyId.value = item.id;
  error.value = '';
  try {
    const answer = answers[item.id];
    if (answer?.outcome.trim() !== (item.outcome ?? ''))
      await api.patch(`/api/v1/decisions/${item.id}`, { outcome: answer.outcome.trim() });
    await api.patch(`/api/v1/decisions/${item.id}`, { status: 'archived' });
    notice.value = '这项决定已经归档。';
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '归档没有完成';
  } finally {
    busyId.value = '';
  }
}

onMounted(() => {
  void load();
  timer = window.setInterval(() => {
    nowTick.value = Date.now();
  }, 30_000);
});
onBeforeUnmount(() => window.clearInterval(timer));
</script>

<template>
  <main class="decision-page">
    <header class="decision-header">
      <button class="back-button" type="button" aria-label="返回" @click="router.back()">
        <AppIcon name="back" :size="20" />
      </button>
      <div class="header-titles">
        <h1 class="decision-title">决定保险箱</h1>
        <p class="decision-subtitle">暂存重要决定，设置冷静期后再行确认</p>
      </div>
    </header>

    <section class="vault-content">
      <form class="decision-composer" @submit.prevent="saveForLater">
        <h2 class="composer-heading">暂存决定</h2>
        <label class="quote-field">
          <span class="sr-only">想做的决定</span>
          <textarea v-model="draft.question" maxlength="400" placeholder="记录你正在考虑的决定或冲动想法…" />
        </label>

        <label class="line-field">
          <span class="field-icon" aria-hidden="true">◈</span>
          <span><strong>为什么现在想做</strong><input v-model="draft.reason" maxlength="400" placeholder="当前最担心什么，或最想确认什么？" /></span>
        </label>

        <div class="line-field intensity-row">
          <span class="field-icon" aria-hidden="true">⌁</span>
          <span><strong>当前情绪强度</strong><small>{{ draft.intensity }}/10</small></span>
          <input v-model.number="draft.intensity" type="range" min="1" max="10" aria-label="当前情绪强度" />
        </div>

        <fieldset class="cooldown-field">
          <legend>冷静时长</legend>
          <div class="duration-options">
            <label v-for="option in [1, 12, 24, 72]" :key="option">
              <input v-model.number="draft.hours" type="radio" name="duration" :value="option" />
              <span>{{ option }}小时</span>
            </label>
          </div>
        </fieldset>

        <p class="return-note"><AppIcon name="clock" :size="16" /> {{ draft.hours }} 小时后，可重新确认该决定。</p>
        <div class="composer-actions">
          <button class="primary-action" type="submit" :disabled="busyId === 'create'">
            {{ busyId === 'create' ? '正在保存…' : '存入冷静箱' }}
          </button>
          <button class="secondary-action" type="button" @click="draft.question = draft.question ? `${draft.question}\n我能先做的更小一步是：` : '我能先做的更小一步是：'">
            细化更小一步
          </button>
        </div>
      </form>

      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="loading" class="loading">正在打开冷静箱…</p>

      <section v-if="activeItems.length" class="saved-section">
        <h2 class="section-title">冷静箱记录</h2>
        <p class="section-desc">冷静期结束后可重新评估并记录决定。</p>
        <div class="saved-list">
          <article v-for="item in activeItems" :key="item.id" class="saved-item" :data-status="item.status">
            <div class="saved-copy">
              <strong class="item-question">{{ item.question }}</strong>
              <span class="item-reason">{{ reasonOf(item) }}</span>
              <span v-if="intensityOf(item)" class="item-meta">记录时强度 {{ intensityOf(item) }}</span>
              <span v-if="item.status === 'cooling'" class="status-pill">冷静中 · {{ cooldownText(item) }}</span>
              <span v-else-if="item.status === 'draft'" class="status-pill">等待设置冷静时间</span>
              <template v-else-if="item.status === 'ready'">
                <span class="status-pill ready">冷静期已过 · 待确认</span>
                <textarea v-model="answers[item.id].decision" maxlength="400" placeholder="记录你当前的决定…" />
                <textarea v-model="answers[item.id].outcome" maxlength="800" placeholder="后续结果或补充说明（可选）" />
                <button class="item-action" type="button" :disabled="busyId === item.id" @click="decide(item)">确认这个决定</button>
              </template>
              <template v-else-if="item.status === 'decided'">
                <span class="status-pill decided">已完成决定 · {{ formatMoment(item.reviewedAt) }}</span>
                <p class="own-decision">{{ item.decision }}</p>
                <textarea v-model="answers[item.id].outcome" maxlength="800" placeholder="后来发生了什么？可在归档前补充。" />
                <button class="item-action ghost" type="button" :disabled="busyId === item.id" @click="archive(item)">保存结果并归档</button>
              </template>
              <button v-if="item.status === 'draft'" class="item-action" type="button" :disabled="busyId === item.id" @click="resumeDraft(item)">开始 24 小时冷静期</button>
            </div>
          </article>
        </div>
      </section>

      <details v-if="archivedItems.length" class="archive-section">
        <summary>已归档的决定（{{ archivedItems.length }}）</summary>
        <article v-for="item in archivedItems" :key="item.id" class="archive-item">
          <strong>{{ item.question }}</strong>
          <p>{{ item.decision }}</p>
          <small v-if="item.outcome">后续记录：{{ item.outcome }}</small>
        </article>
      </details>

      <p class="boundary-note">提供冷静期缓冲与记录辅助，不替代法律、医疗或财务专业建议，不代作决定。</p>
    </section>
  </main>
</template>

<style scoped>
.decision-page {
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

.decision-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 4px 12px;
}

.back-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  min-height: 32px;
  margin-top: 2px;
  padding: 0;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper);
  color: var(--gn-ink);
  cursor: pointer;
  flex-shrink: 0;
}

.header-titles {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.decision-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--gn-ink);
}

.decision-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--gn-muted);
}

.vault-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.decision-composer,
.saved-section,
.archive-section {
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  padding: 16px;
}

.composer-heading,
.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--gn-ink);
}

.section-desc {
  margin: 4px 0 12px;
  font-size: 12px;
  color: var(--gn-muted);
  line-height: 1.4;
}

.quote-field {
  display: block;
  margin: 12px 0 8px;
}

.quote-field textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 72px;
  resize: none;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  padding: 10px 12px;
  color: var(--gn-ink);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
}

.line-field {
  display: grid;
  grid-template-columns: 28px 1fr;
  align-items: center;
  min-height: 44px;
  border-bottom: 1px solid var(--gn-line);
  padding: 4px 0;
}

.field-icon {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  color: var(--gn-leaf);
  font-size: 14px;
}

.line-field > span:nth-child(2) {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.line-field strong,
.cooldown-field legend {
  font-size: 13px;
  font-weight: 500;
  color: var(--gn-ink);
}

.line-field input:not([type="range"]) {
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--gn-ink-soft);
  font: inherit;
  font-size: 13px;
  padding: 2px 0;
}

.intensity-row {
  grid-template-columns: 28px 100px 1fr;
}

.intensity-row small {
  color: var(--gn-leaf);
  font-weight: 600;
}

.intensity-row input {
  width: 100%;
  accent-color: var(--gn-leaf);
}

.cooldown-field {
  margin: 12px 0 0;
  padding: 0;
  border: 0;
}

.cooldown-field legend {
  margin-bottom: 8px;
}

.duration-options {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.duration-options label {
  min-width: 0;
  cursor: pointer;
}

.duration-options input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.duration-options span {
  display: grid;
  height: 34px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  color: var(--gn-muted);
  font-size: 13px;
  place-items: center;
}

.duration-options input:checked + span {
  border-color: var(--gn-leaf);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-weight: 600;
}

.return-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 12px 0;
  padding: 8px 12px;
  border-radius: var(--gn-radius-small);
  border: 1px solid var(--gn-line);
  background: var(--gn-paper-warm);
  color: var(--gn-muted);
  font-size: 12px;
}

.composer-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.composer-actions button,
.item-action {
  min-height: 38px;
  border-radius: var(--gn-radius-small);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.primary-action {
  border: 1px solid var(--gn-leaf);
  background: var(--gn-leaf);
  color: #fff;
}

.secondary-action {
  border: 1px solid var(--gn-line);
  background: var(--gn-paper-warm);
  color: var(--gn-ink);
}

.notice,
.error,
.loading {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--gn-radius-card);
  border: 1px solid var(--gn-line);
  font-size: 13px;
}

.notice {
  background: var(--gn-paper);
  color: var(--gn-leaf-deep);
}

.error {
  background: var(--gn-paper);
  color: var(--gn-danger);
}

.loading {
  color: var(--gn-muted);
  text-align: center;
}

.saved-list {
  display: flex;
  flex-direction: column;
}

.saved-item {
  display: flex;
  flex-direction: column;
  padding: 12px 0;
  border-bottom: 1px solid var(--gn-line);
}

.saved-item:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.saved-item:first-child {
  padding-top: 0;
}

.saved-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.item-question {
  font-size: 14px;
  font-weight: 600;
  color: var(--gn-ink);
  line-height: 1.35;
}

.item-reason {
  font-size: 12px;
  color: var(--gn-muted);
  line-height: 1.4;
}

.item-meta {
  font-size: 11px;
  color: var(--gn-muted);
}

.status-pill {
  align-self: flex-start;
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  border: 1px solid var(--gn-line);
  padding: 2px 8px;
  color: var(--gn-muted);
  font-size: 11px;
}

.status-pill.ready {
  border-color: var(--gn-leaf);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-weight: 500;
}

.status-pill.decided {
  border-color: var(--gn-line);
  background: var(--gn-paper-warm);
  color: var(--gn-ink);
}

.saved-copy textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 54px;
  resize: none;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  padding: 8px 10px;
  color: var(--gn-ink);
  font: inherit;
  font-size: 12px;
  line-height: 1.4;
}

.item-action {
  align-self: flex-start;
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid var(--gn-leaf);
  background: var(--gn-leaf);
  color: #fff;
}

.item-action.ghost {
  border: 1px solid var(--gn-line);
  background: var(--gn-paper-warm);
  color: var(--gn-ink);
}

.own-decision {
  margin: 2px 0;
  padding: 8px 10px;
  border-left: 3px solid var(--gn-leaf);
  border-radius: 0 var(--gn-radius-small) var(--gn-radius-small) 0;
  background: var(--gn-paper-warm);
  font-size: 13px;
  line-height: 1.5;
  color: var(--gn-ink);
}

.archive-section summary {
  cursor: pointer;
  color: var(--gn-ink);
  font-size: 14px;
  font-weight: 500;
}

.archive-item {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--gn-line);
  font-size: 13px;
}

.archive-item strong {
  display: block;
  font-size: 13px;
  color: var(--gn-ink);
}

.archive-item p {
  margin: 4px 0;
  color: var(--gn-ink-soft);
  font-size: 12px;
}

.archive-item small {
  color: var(--gn-muted);
  font-size: 11px;
}

.boundary-note {
  margin: 4px 0 0;
  color: var(--gn-muted);
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

button:disabled {
  cursor: wait;
  opacity: 0.6;
}

@media (max-width: 374px) {
  .decision-page {
    padding-left: 12px;
    padding-right: 12px;
  }
}
</style>
