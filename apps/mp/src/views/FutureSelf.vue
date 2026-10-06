<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import AppIcon from '../components/icons/AppIcon.vue';

type ContextType = 'none' | 'journey' | 'decision' | 'recovery';
type FutureMessage = {
  id: string;
  content: string;
  deliverAt: string;
  deliveredAt?: string;
  contextType?: Exclude<ContextType, 'none'>;
  contextRefId?: string;
  contextLabel?: string;
};

const router = useRouter();
const items = ref<FutureMessage[]>([]);
const journeys = ref<any[]>([]);
const decisions = ref<any[]>([]);
const recoveries = ref<any[]>([]);
const content = ref('');
const contextType = ref<ContextType>('none');
const contextRefId = ref('');
const timePreset = ref<'tomorrow' | 'week' | 'month' | 'custom'>('tomorrow');
const deliverAt = ref('');
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const notice = ref('');

const contextOptions = computed(() => {
  if (contextType.value === 'journey') {
    return journeys.value.map((item) => ({
      id: item.journey?.id ?? item.id,
      label: item.journey?.title ?? item.title ?? '未命名旅程',
    }));
  }
  if (contextType.value === 'decision') return decisions.value.map((item) => ({ id: item.id, label: item.question }));
  if (contextType.value === 'recovery') return recoveries.value.map((item) => ({ id: item.id, label: item.summary }));
  return [];
});

const canSave = computed(() => {
  return Boolean(content.value.trim() && deliverAt.value && (contextType.value === 'none' || contextRefId.value));
});

function asLocalInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function presetDate(preset = timePreset.value) {
  const date = new Date();
  date.setSeconds(0, 0);
  if (preset === 'tomorrow') {
    date.setDate(date.getDate() + 1);
    date.setHours(20, 30, 0, 0);
  }
  if (preset === 'week') date.setDate(date.getDate() + 7);
  if (preset === 'month') date.setMonth(date.getMonth() + 1);
  return asLocalInput(date);
}

function formatMoment(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function changePreset(value: 'tomorrow' | 'week' | 'month' | 'custom') {
  timePreset.value = value;
  if (value !== 'custom') deliverAt.value = presetDate(value);
}

function deliveryState(item: FutureMessage) {
  return item.deliveredAt
    ? '已在 ' + formatMoment(item.deliveredAt) + ' 送达'
    : '将在 ' + formatMoment(item.deliverAt) + ' 送达';
}

const scheduledDeliveryText = computed(() => {
  return deliverAt.value ? '预计 ' + formatMoment(new Date(deliverAt.value).toISOString()) + ' 通过提醒送达' : '正在准备送达时间';
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [messageResult, journeyResult, decisionResult, recoveryResult] = await Promise.all([
      api.get<any>('/api/v1/future-messages'),
      api.get<any>('/api/v1/journeys'),
      api.get<any>('/api/v1/decisions'),
      api.get<any>('/api/v1/me/recovery'),
    ]);
    items.value = messageResult.items ?? [];
    journeys.value = journeyResult.items ?? [];
    decisions.value = decisionResult.items ?? [];
    recoveries.value = recoveryResult.items ?? [];
  } catch (cause: any) {
    error.value = cause?.message ?? '未来信暂时没有打开';
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!canSave.value) {
    error.value = contextType.value !== 'none' && !contextRefId.value ? '请先选择要关联的记录' : '请写下内容并选择送达时间';
    return;
  }
  saving.value = true;
  error.value = '';
  notice.value = '';
  try {
    const payload: Record<string, string> = {
      content: content.value.trim(),
      deliverAt: new Date(deliverAt.value).toISOString(),
    };
    if (contextType.value !== 'none') {
      payload.contextType = contextType.value;
      payload.contextRefId = contextRefId.value;
    }
    await api.post('/api/v1/future-messages', payload);
    content.value = '';
    contextType.value = 'none';
    contextRefId.value = '';
    changePreset('tomorrow');
    notice.value = '这封话已交给未来。到时间后，真实随访队列会把它送回给你。';
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '这封未来信没有保存成功';
  } finally {
    saving.value = false;
  }
}

watch(contextType, () => {
  contextRefId.value = '';
});

onMounted(() => {
  deliverAt.value = presetDate('tomorrow');
  void load();
});
</script>

<template>
  <section class="goodnight-page future-page">
    <header class="future-header">
      <button class="back-btn" type="button" aria-label="返回" @click="router.back()">
        <AppIcon name="back" :size="20" />
      </button>
      <div class="header-titles">
        <h1 class="future-title">写给未来的我</h1>
        <p class="future-subtitle">记录希望在未来送达的个人留言与提醒事项</p>
      </div>
    </header>

    <form class="future-paper" @submit.prevent="save">
      <div class="paper-heading">
        <h2>撰写留言</h2>
        <p>记录希望未来提醒自己的一段话与送达时间。</p>
      </div>
      <label class="letter-field">
        <span class="sr-only">写给未来自己的内容</span>
        <textarea v-model="content" maxlength="1200" placeholder="写下希望在未来指定时间提醒自己的话…"></textarea>
        <small>{{ content.length }}/1200</small>
      </label>

      <fieldset class="delivery-field">
        <legend>送达时间设置</legend>
        <div class="time-options">
          <button type="button" :class="{ selected: timePreset === 'tomorrow' }" @click="changePreset('tomorrow')">明天晚上</button>
          <button type="button" :class="{ selected: timePreset === 'week' }" @click="changePreset('week')">一周后</button>
          <button type="button" :class="{ selected: timePreset === 'month' }" @click="changePreset('month')">一个月后</button>
          <button type="button" :class="{ selected: timePreset === 'custom' }" @click="changePreset('custom')">自定义</button>
        </div>
        <label v-if="timePreset === 'custom'" class="custom-time">
          具体送达时间
          <input v-model="deliverAt" type="datetime-local" />
        </label>
        <p v-else class="delivery-note">{{ scheduledDeliveryText }}</p>
      </fieldset>

      <fieldset class="context-field">
        <legend>关联记录 <small>可选</small></legend>
        <div class="context-types">
          <label v-for="option in [['none', '不关联'], ['journey', '一段旅程'], ['decision', '一个决定'], ['recovery', '一次恢复']]" :key="option[0]">
            <input v-model="contextType" type="radio" name="future-context" :value="option[0]" />
            <span>{{ option[1] }}</span>
          </label>
        </div>
        <label v-if="contextType !== 'none'" class="context-picker">
          <span>{{ contextOptions.length ? '由你选择，不会自动读取其他内容' : '还没有可以关联的记录' }}</span>
          <select v-model="contextRefId" :disabled="!contextOptions.length">
            <option value="">请选择</option>
            <option v-for="option in contextOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
          </select>
        </label>
      </fieldset>

      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      <p v-if="error" class="error-note" role="alert">{{ error }}</p>
      <button class="future-save" data-testid="future-self-save" type="submit" :disabled="saving || !canSave">
        {{ saving ? '正在保存…' : '保存未来留言' }}
      </button>
      <p class="private-note"><AppIcon name="heart" :size="14" /> 默认只对你自己可见，不会自动公开。</p>
    </form>

    <p v-if="loading" class="state-note">正在读取写下的未来信…</p>
    <section v-else class="letters-section">
      <div class="section-label"><h2>已保存的留言</h2></div>
      <p v-if="!items.length" class="empty-note">还没有留给未来的话。你可以从一句简单的话开始。</p>
      <div v-else class="letters-list">
        <article v-for="item in items" :key="item.id" class="saved-letter" :class="{ delivered: item.deliveredAt }">
          <p class="letter-content">{{ item.content }}</p>
          <div class="letter-meta">
            <span v-if="item.contextLabel" class="context-tag">{{ item.contextLabel }}</span>
            <span>{{ deliveryState(item) }}</span>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>

<style scoped>
.future-page {
  box-sizing: border-box;
  width: 100%;
  max-width: 430px;
  margin: 0 auto;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-x: hidden;
  padding: 12px 16px calc(112px + env(safe-area-inset-bottom));
  background: var(--gn-bg);
  color: var(--gn-text);
  font-family: var(--gn-font-body);
}

.future-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 4px 4px;
}

.back-btn {
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

.future-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--gn-ink);
}

.future-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--gn-muted);
}

.future-paper {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  padding: 16px;
  background: var(--gn-paper);
}

.paper-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.paper-heading h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--gn-ink);
}

.paper-heading p {
  margin: 0;
  color: var(--gn-muted);
  font-size: 12px;
  line-height: 1.4;
}

.letter-field {
  position: relative;
  display: block;
}

.letter-field textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 110px;
  resize: none;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  padding: 10px 12px 26px;
  background: var(--gn-paper-warm);
  color: var(--gn-ink);
  font: inherit;
  font-size: 13px;
  line-height: 1.6;
}

.letter-field small {
  position: absolute;
  right: 10px;
  bottom: 8px;
  color: var(--gn-muted);
  font-size: 11px;
}

.delivery-field,
.context-field {
  margin: 0;
  border: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.delivery-field legend,
.context-field legend {
  margin-bottom: 4px;
  color: var(--gn-ink);
  font-size: 13px;
  font-weight: 600;
}

.context-field legend small {
  color: var(--gn-muted);
  font-weight: 400;
  font-size: 11px;
}

.time-options {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.time-options button {
  min-width: 0;
  min-height: 34px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  color: var(--gn-ink);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.time-options button.selected {
  border-color: var(--gn-leaf);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-weight: 600;
}

.delivery-note {
  margin: 0;
  color: var(--gn-muted);
  font-size: 12px;
}

.custom-time {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--gn-ink);
  font-size: 12px;
}

.custom-time input,
.context-picker select {
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  min-height: 34px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  padding: 6px 10px;
  background: var(--gn-paper-warm);
  color: var(--gn-ink);
  font: inherit;
  font-size: 12px;
}

.context-types {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.context-types label {
  min-width: 0;
  cursor: pointer;
}

.context-types input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.context-types span {
  display: block;
  min-height: 30px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  padding: 0 12px;
  background: var(--gn-paper-warm);
  color: var(--gn-ink);
  font-size: 12px;
  line-height: 30px;
}

.context-types input:checked + span {
  border-color: var(--gn-leaf);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-weight: 500;
}

.context-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--gn-muted);
  font-size: 12px;
}

.future-save {
  display: block;
  width: 100%;
  min-height: 40px;
  border: 1px solid var(--gn-leaf);
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf);
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.future-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.private-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0;
  color: var(--gn-muted);
  font-size: 11px;
}

.notice,
.error-note,
.state-note,
.empty-note {
  margin: 0;
  border-radius: var(--gn-radius-card);
  border: 1px solid var(--gn-line);
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.4;
}

.notice {
  background: var(--gn-paper);
  color: var(--gn-leaf-deep);
}

.error-note {
  background: var(--gn-paper);
  color: var(--gn-danger);
}

.state-note,
.empty-note {
  background: var(--gn-paper);
  color: var(--gn-muted);
}

.letters-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  padding: 16px;
  background: var(--gn-paper);
}

.section-label h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--gn-ink);
}

.letters-list {
  display: flex;
  flex-direction: column;
}

.saved-letter {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 0;
  border-bottom: 1px solid var(--gn-line);
}

.saved-letter:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.saved-letter:first-child {
  padding-top: 0;
}

.saved-letter.delivered {
  opacity: 0.75;
}

.letter-content {
  margin: 0;
  color: var(--gn-ink);
  font-size: 13px;
  line-height: 1.5;
}

.letter-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--gn-muted);
  font-size: 11px;
}

.context-tag {
  color: var(--gn-leaf-deep);
  background: var(--gn-leaf-soft);
  padding: 1px 6px;
  border-radius: var(--gn-radius-small);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

@media (max-width: 374px) {
  .future-page {
    padding-left: 12px;
    padding-right: 12px;
  }
}
</style>
