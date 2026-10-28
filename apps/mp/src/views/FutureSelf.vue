<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import AppIcon from '../components/icons/AppIcon.vue';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

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
/**
 * Which action produced the current error, so the banner retries that one. A failed *save* used to be
 * answered by re-reading the list, which looked like a retry and did nothing about the save.
 */
type FutureFailure = 'load' | 'save';
const failure = ref<FutureFailure>('load');
const notice = ref('');
/** Set when an optional context list could not be read, so it is not mistaken for "no records". */
const contextNotice = ref('');
/** The real consent the delivery worker reads before it may notify; the row reports it honestly. */
const reminderConsent = ref<boolean | null>(null);

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

/** States the real consent, including when it could not be read, rather than promising a reminder. */
const reminderCopy = computed(() => {
  if (reminderConsent.value === null) return '暂时读不到授权状态，可以到隐私设置里查看';
  return reminderConsent.value
    ? '允许时发送；可以在隐私设置中关闭'
    : '当前未开启，打开后才会到期提醒';
});

async function load() {
  loading.value = true;
  error.value = '';
  contextNotice.value = '';
  // The letters are the page; the three context lists are optional extras. They used to load in one
  // `Promise.all` with the letters, so turning off 恢复 data made `/me/recovery` reject and blanked
  // the whole page even though the letters were independently readable. The optional context now
  // degrades on its own, and says so instead of looking like "you have no records".
  try {
    const messageResult = await api.get<any>('/api/v1/future-messages');
    items.value = messageResult.items ?? [];
  } catch (cause: any) {
    error.value = cause?.message ?? '未来信暂时没有打开';
    failure.value = 'load';
  } finally {
    loading.value = false;
  }

  const optional = await Promise.allSettled([
    api.get<any>('/api/v1/journeys'),
    api.get<any>('/api/v1/decisions'),
    api.get<any>('/api/v1/me/recovery'),
    api.get<any>('/api/v1/me/privacy'),
  ]);
  const [journeyResult, decisionResult, recoveryResult, privacyResult] = optional;
  journeys.value = journeyResult.status === 'fulfilled' ? journeyResult.value.items ?? [] : [];
  decisions.value = decisionResult.status === 'fulfilled' ? decisionResult.value.items ?? [] : [];
  recoveries.value = recoveryResult.status === 'fulfilled' ? recoveryResult.value.items ?? [] : [];
  reminderConsent.value =
    privacyResult.status === 'fulfilled' ? Boolean(privacyResult.value?.item?.allowFutureSelfNotifications) : null;
  const unavailable = optional.filter((result) => result.status === 'rejected').length;
  if (unavailable) {
    contextNotice.value = `有 ${unavailable} 类关联记录暂时读不到，这封信仍然可以单独保存。`;
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
    notice.value = '这封信已经替你收好，会在你选定的时间准时送回给你。';
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '这封未来信没有保存成功';
    failure.value = 'save';
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
    <header class="future-bar">
      <button class="back-btn" type="button" aria-label="返回" @click="router.back()">
        <AppIcon name="back" :size="20" />
      </button>
      <h1 class="future-bar-title">写给未来的我</h1>
    </header>

    <div class="future-lead">
      <h2>留给之后的自己</h2>
      <p>这是一封由你决定什么时候再看的信。</p>
    </div>

    <form class="future-form" @submit.prevent="save">
      <label class="letter-field">
        <span class="sr-only">写给未来自己的内容</span>
        <textarea v-model="content" data-testid="future-content" maxlength="1200" placeholder="有些事想提醒以后那时的我……"></textarea>
        <small>{{ content.length }}/1200</small>
      </label>

      <fieldset class="form-block">
        <legend>什么时候再看</legend>
        <div class="time-options">
          <button type="button" data-testid="future-time-tomorrow" :class="{ selected: timePreset === 'tomorrow' }" @click="changePreset('tomorrow')">明天晚上</button>
          <button type="button" data-testid="future-time-week" :class="{ selected: timePreset === 'week' }" @click="changePreset('week')">一周后</button>
          <button type="button" data-testid="future-time-month" :class="{ selected: timePreset === 'month' }" @click="changePreset('month')">一个月后</button>
          <button type="button" data-testid="future-time-custom" :class="{ selected: timePreset === 'custom' }" @click="changePreset('custom')">自己选</button>
        </div>
        <label v-if="timePreset === 'custom'" class="custom-time">
          具体送达时间
          <input v-model="deliverAt" type="datetime-local" />
        </label>
        <p v-else class="delivery-note">{{ scheduledDeliveryText }}</p>
      </fieldset>

      <!-- The consent the delivery worker actually reads (allowFutureSelfNotifications), reported
           honestly and pointing at the real toggle rather than claiming a reminder will be sent. -->
      <fieldset class="form-block">
        <legend>通知</legend>
        <button class="notify-row" type="button" data-testid="future-notify-row" @click="router.push('/pages/settings/privacy')">
          <span class="notify-icon"><AppIcon name="bell" :size="18" /></span>
          <span class="notify-copy">
            <strong>到期提醒</strong>
            <small>{{ reminderCopy }}</small>
          </span>
          <AppIcon name="arrow" :size="17" />
        </button>
      </fieldset>

      <fieldset class="form-block">
        <legend>关联记录 <small>可选</small></legend>
        <div class="context-types">
          <label v-for="option in [['none', '不关联'], ['journey', '一段旅程'], ['decision', '一个决定'], ['recovery', '一次恢复']]" :key="option[0]">
            <input v-model="contextType" type="radio" name="future-context" :data-testid="'future-context-' + option[0]" :value="option[0]" />
            <span>{{ option[1] }}</span>
          </label>
        </div>
        <label v-if="contextType !== 'none'" class="context-picker">
          <span>{{ contextOptions.length ? '由你选择，不会自动读取其他内容' : '还没有可以关联的记录' }}</span>
          <select v-model="contextRefId" :disabled="!contextOptions.length">
            <option value="">请选择</option>
            <option v-for="option in contextOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
          </select>
          <small v-if="contextNotice" class="context-notice" role="status">{{ contextNotice }}</small>
        </label>
      </fieldset>

      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      <LoadErrorBanner
        :message="error"
        :retry-label="failure === 'load' ? '重新加载' : undefined"
        @retry="load"
      />
    </form>

    <section class="letters-section">
      <div class="section-label"><h2>已保存的信</h2></div>
      <p v-if="loading" class="state-note">正在读取写下的未来信…</p>
      <p v-else-if="!items.length" class="empty-note">还没有留给未来的话。你可以从一句简单的话开始。</p>
      <div v-else class="letters-list">
        <article v-for="item in items" :key="item.id" class="saved-letter" :class="{ delivered: item.deliveredAt }">
          <span class="saved-icon"><AppIcon name="message" :size="18" /></span>
          <span class="saved-copy">
            <strong>{{ deliveryState(item) }}</strong>
            <small>
              {{ item.deliveredAt ? '已送达' : '已保存 · 尚未到期' }}<template v-if="item.contextLabel"> · {{ item.contextLabel }}</template>
            </small>
            <p v-if="item.content" class="delivered-content">{{ item.content }}</p>
          </span>
        </article>
      </div>
    </section>

    <div class="future-cta">
      <button class="future-save" data-testid="future-self-save" type="button" :disabled="saving || !canSave" @click="save">
        {{ saving ? '正在保存…' : '保存给未来的信' }}
      </button>
      <p class="private-note"><AppIcon name="heart" :size="14" /> 默认只对你自己可见，不会自动公开。</p>
    </div>
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

/* A stable bar with a bare chevron, then the letter's own heading, per the design. */
.future-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  margin: 0 -16px 14px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--gn-line, #e8ebef);
}

.future-bar-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--gn-ink);
}

.future-lead h2 {
  margin: 0;
  font-size: 24px;
  line-height: 1.3;
  color: var(--gn-ink);
}

.future-lead p {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--gn-muted);
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  min-height: 30px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--gn-ink);
  cursor: pointer;
  flex-shrink: 0;
}

.future-form {
  display: grid;
  gap: 18px;
  margin-top: 18px;
}

/* The design's form sections are bare: a legend, then the controls. */
.form-block {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  border: 0;
}

.form-block legend,
.form-block > h3 {
  padding: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--gn-ink);
}

.form-block legend small {
  font-weight: 400;
  color: var(--gn-muted);
}

.notify-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 0;
  border: 0;
  background: transparent;
  color: var(--gn-ink);
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.notify-icon,
.saved-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 10px;
  background: var(--gn-paper-warm, #f7f8fa);
  color: var(--gn-ink-soft, #4a525d);
}

.notify-copy,
.saved-copy {
  display: grid;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.notify-copy strong,
.saved-copy strong {
  font-size: 15px;
  font-weight: 600;
  color: var(--gn-ink);
}

.notify-copy small,
.saved-copy small {
  font-size: 12px;
  color: var(--gn-muted);
}

.delivered-content {
  margin: 6px 0 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--gn-paper-warm, #f7f8fa);
  font-size: 13px;
  line-height: 1.5;
  color: var(--gn-ink, #242a32);
  white-space: pre-wrap;
  word-break: break-word;
}

.saved-letter {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
}

.saved-letter + .saved-letter {
  border-top: 1px solid var(--gn-line, #e8ebef);
}

/* The primary action sits at the bottom of the viewport, above the tab bar.
   `position: fixed` rather than sticky: `.goodnight-page` sets `overflow-x: hidden`, which makes it
   the scroll container, so a sticky child has no scrollport to stick to and stays at the content end
   underneath the tab bar. */
:global(.phone-shell:has(.future-page)) {
  padding-bottom: 0;
}

.future-cta {
  position: fixed;
  right: 0;
  bottom: env(safe-area-inset-bottom);
  left: 0;
  display: grid;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--gn-line, #e8ebef);
  background: var(--gn-bg, #ffffff);
  z-index: 20;
}

/* Room for the fixed action so the last saved letter is never covered. */
.future-page {
  padding-bottom: calc(130px + env(safe-area-inset-bottom));
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
  /* The design gives the letter itself the most room on the page. */
  min-height: 210px;
  resize: none;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card, 12px);
  padding: 14px 16px 26px;
  background: var(--gn-paper, #ffffff);
  color: var(--gn-ink);
  font: inherit;
  font-size: 14px;
  line-height: 1.7;
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

.context-notice {
  color: var(--gn-gold, #b45309);
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

/* The V1 row rules used to live here. They merged with the new row layout — the old
   `flex-direction: column` combined with the new `align-items: center` centred every row's icon and
   text — so they are gone rather than left to fight the replacement. `.letter-content`,
   `.letter-meta` and `.context-tag` went with them: the template no longer renders them. */

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
