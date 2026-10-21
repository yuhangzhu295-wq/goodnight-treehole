<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

const router = useRouter();
const fields = [
  { key: 'food', label: '吃过东西', icon: '☕' },
  { key: 'outside', label: '出门或见到阳光', icon: '☀' },
  { key: 'humanContact', label: '和可信任的人有联系', icon: '♧' },
  { key: 'sleep', label: '睡眠有被照顾', icon: '☾' },
  { key: 'mustDo', label: '完成一件必须做的事', icon: '▤' },
  { key: 'comfort', label: '做了一件让自己舒服的事', icon: '⌂' },
];
const options = [
  { value: 'no', label: '还没有' },
  { value: 'partial', label: '一部分' },
  { value: 'yes', label: '做到了' },
];
const signals = ref<Record<string, string>>(Object.fromEntries(fields.map((field) => [field.key, 'partial'])));
/** Which change the page is asking about. The design shows one topic at a time; the six indicators
 *  and their three states are all still here, so `signals` keeps its exact shape. */
const activeField = ref(fields[0].key);
const activeFieldLabel = computed(() => fields.find((field) => field.key === activeField.value)?.label ?? '');
const activePlaceholder = computed(() => {
  const prompts: Record<string, string> = {
    food: '今天吃了什么？可以只写一句。',
    outside: '今天出门了吗？见了什么样的光？',
    humanContact: '今天和谁说过话？可以只写一句。',
    sleep: '今天睡得怎么样？可以只写一句。',
    mustDo: '今天做完的那件事是什么？',
    comfort: '今天做了什么让自己舒服一点的事？',
  };
  return prompts[activeField.value] ?? '记录今天的真实状态，可以只写一句。';
});
const items = ref<any[]>([]);
const summary = ref('');
const journeyId = ref<string>();
const saving = ref(false);
const error = ref('');
const privacyBlocked = ref(false);
const stableProfile = ref<Record<string, any> | null>(null);

const recent = computed(() =>
  items.value
    .slice()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 7),
);
/** The last seven days, from the real records. A day with a record is marked; a day without is not
 *  scored or coloured — the brief forbids turning this into a metric. */
const week = computed(() => {
  const recordedDays = new Set(items.value.map((item) => new Date(item.createdAt).toDateString()));
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - offset));
    return {
      key: date.toISOString().slice(0, 10),
      weekday: weekdays[date.getDay()],
      recorded: recordedDays.has(date.toDateString()),
    };
  });
});
const latestChange = computed(() => {
  if (recent.value.length < 2) return '再记录一次后，这里会按每一项告诉你发生了什么变化。';
  const [latest, previous] = recent.value;
  const labels: Record<string, string> = { no: '还没有', partial: '一部分', yes: '做到了' };
  const changes = fields
    .filter((field) => latest.signals?.[field.key] !== previous.signals?.[field.key])
    .map(
      (field) =>
        `${field.label}：${labels[previous.signals?.[field.key]] ?? '未记录'} → ${labels[latest.signals?.[field.key]] ?? '未记录'}`,
    );
  return changes.length ? changes.slice(0, 2).join('；') : '最近两次各项状态相同，也是一种真实记录。';
});
const stableComparison = computed(() => {
  if (!stableProfile.value) return '';
  const labels: Record<string, string> = { no: '还没有', partial: '一部分', yes: '做到了' };
  const comparisons = [
    stableProfile.value.eatingPattern
      ? `今天“吃过东西”是${labels[signals.value.food]}；稳定时你写下：${stableProfile.value.eatingPattern}`
      : '',
    stableProfile.value.sleepPattern
      ? `今天“睡眠有被照顾”是${labels[signals.value.sleep]}；稳定时你写下：${stableProfile.value.sleepPattern}`
      : '',
    Array.isArray(stableProfile.value.contactPeople) && stableProfile.value.contactPeople.length
      ? `稳定时愿意联系：${stableProfile.value.contactPeople.slice(0, 2).join('、')}`
      : '',
  ].filter(Boolean);
  return comparisons.slice(0, 2).join('；');
});

function dayLabel(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(
    new Date(value),
  );
}

function visibleSignals(item: any) {
  return (
    fields
      .filter((field) => item.signals?.[field.key] === 'yes')
      .map((field) => field.label)
      .slice(0, 2)
      .join(' · ') || '今天先如实记录了还没有做到的部分'
  );
}

/** The row's own words if the person wrote any, otherwise what they marked as done. */
function historyTitle(item: any) {
  const written = typeof item.summary === 'string' ? item.summary.trim() : '';
  return written || visibleSignals(item);
}

/** The design's second line is date · category; the category is the first thing marked done. */
function historyKind(item: any) {
  const done = fields.find((field) => item.signals?.[field.key] === 'yes');
  return done?.label ?? '生活记录';
}

async function load() {
  error.value = '';
  privacyBlocked.value = false;
  try {
    const [recoveryResult, tonightResult, stableResult] = await Promise.all([
      api.get<any>('/api/v1/me/recovery'),
      api.get<any>('/api/v1/tonight'),
      api.get<any>('/api/v1/me/stable-self'),
    ]);
    items.value = recoveryResult.items ?? [];
    journeyId.value = tonightResult.item?.journey?.id;
    stableProfile.value = stableResult.item?.profile ?? null;
  } catch (cause: any) {
    error.value = cause?.message ?? '恢复记录加载失败';
    privacyBlocked.value = /隐私|允许|恢复数据/.test(error.value);
  }
}

async function save() {
  saving.value = true;
  error.value = '';
  try {
    await api.post('/api/v1/me/recovery', {
      journeyId: journeyId.value,
      signals: signals.value,
      summary: summary.value,
    });
    summary.value = '';
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '恢复记录保存失败';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="goodnight-page recovery-page">
    <header class="recovery-bar">
      <button class="back-btn" type="button" aria-label="返回上一页" @click="router.back()">‹</button>
      <h1 class="recovery-bar-title">生活恢复</h1>
    </header>
    <section v-if="privacyBlocked" class="privacy-gate" data-testid="recovery-privacy-gate">
      <h2>先由你决定要不要保存</h2>
      <p>{{ error }}</p>
      <button @click="router.push('/pages/settings/privacy')">去隐私设置</button>
    </section>
    <template v-else>
      <div class="recovery-lead">
        <h2>今天的状态</h2>
        <p>记录现实里的变化，不给自己打分。</p>
      </div>

      <LoadErrorBanner :message="error" retry-label="重新加载" @retry="load" />

      <!-- The design asks one topic at a time. All six indicators and their three states remain, so
           the signals payload the API receives is unchanged. -->
      <section class="recovery-block">
        <h3>今天有哪些变化？</h3>
        <div class="topic-chips">
          <button
            v-for="field in fields"
            :key="field.key"
            type="button"
            :class="{ selected: activeField === field.key }"
            @click="activeField = field.key"
          >
            {{ field.label }}
          </button>
        </div>
      </section>

      <section class="recovery-block">
        <h3>{{ activeFieldLabel }}</h3>
        <fieldset class="state-options">
          <legend class="sr-only">{{ activeFieldLabel }}</legend>
          <label v-for="option in options" :key="option.value">
            <input v-model="signals[activeField]" type="radio" :name="activeField" :value="option.value" />
            <span>{{ option.label }}</span>
          </label>
        </fieldset>
        <label class="note-field">
          <span class="sr-only">今天的记录</span>
          <textarea id="recovery-summary" v-model="summary" maxlength="500" :placeholder="activePlaceholder" />
        </label>
      </section>

      <section class="recovery-block">
        <h3>最近一周</h3>
        <div class="week-grid">
          <div v-for="day in week" :key="day.key" class="week-day">
            <span class="week-label">{{ day.weekday }}</span>
            <span class="week-mark" :class="{ recorded: day.recorded }">{{ day.recorded ? '✓' : '·' }}</span>
          </div>
        </div>
        <p class="block-note">{{ latestChange }}</p>
      </section>

      <section class="recovery-block">
        <h3>以前的记录</h3>
        <p v-if="!recent.length" class="empty">还没有恢复记录。今天可以先留下第一条。</p>
        <div v-else class="history-list">
          <article v-for="item in recent" :key="item.id" class="history-row">
            <span class="history-copy">
              <strong>{{ historyTitle(item) }}</strong>
              <small>{{ dayLabel(item.createdAt) }} · {{ historyKind(item) }}</small>
            </span>
            <em aria-hidden="true">›</em>
          </article>
        </div>
        <p v-if="stableComparison" class="block-note">{{ stableComparison }}</p>
      </section>

      <div class="recovery-cta">
        <button class="recovery-save" data-testid="recovery-save" :disabled="saving" @click="save">
          {{ saving ? '正在保存…' : '记录今天' }}
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.recovery-page {
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

.recovery-header {
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
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
}

.header-titles {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.recovery-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--gn-ink);
}

.recovery-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--gn-muted);
}

.recovery-paper,
.change-note,
.privacy-gate,
.recent-change,
.stable-comparison,
.recent-days {
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.recovery-paper {
  padding: 14px 16px;
}

.recovery-paper h2,
.recent-days h2,
.recent-change h2,
.stable-comparison h2 {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 600;
  color: var(--gn-ink);
}

.signal-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 176px;
  gap: 8px;
  align-items: center;
  min-height: 44px;
  border-bottom: 1px solid var(--gn-line);
  padding: 6px 0;
}

.signal-row:last-child {
  border-bottom: 0;
}

.signal-row > div {
  display: flex;
  align-items: center;
  gap: 8px;
}

.signal-icon {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  color: var(--gn-leaf);
  font-size: 14px;
}

.signal-row strong {
  font-size: 13px;
  font-weight: 500;
  color: var(--gn-ink);
}

.signal-row fieldset {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  border: 0;
  margin: 0;
  padding: 0;
}

.signal-row label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  min-height: 30px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
}

.signal-row label:has(input:checked) {
  border-color: var(--gn-leaf);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-weight: 500;
}

.signal-row input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.signal-row label span {
  font-size: 11px;
}

.change-note {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
}

.change-note label {
  font-size: 13px;
  font-weight: 500;
  color: var(--gn-ink);
}

.change-note textarea {
  box-sizing: border-box;
  min-height: 64px;
  width: 100%;
  resize: none;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  padding: 10px 12px;
  background: var(--gn-paper-warm);
  color: var(--gn-ink);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
}

.recovery-save {
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

.recovery-save:disabled {
  opacity: 0.6;
  cursor: wait;
}

.recent-change,
.stable-comparison {
  padding: 14px 16px;
}

.recent-change p,
.stable-comparison p {
  margin: 0;
  color: var(--gn-muted);
  font-size: 12px;
  line-height: 1.5;
}

.recent-days {
  padding: 14px 16px;
}

.recent-days article {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 46px;
  padding: 8px 0;
  border-top: 1px solid var(--gn-line);
}

.recent-days article:first-of-type {
  border-top: 1px solid var(--gn-line);
}

.recent-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.recent-body strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--gn-ink);
}

.recent-body p {
  margin: 0;
  color: var(--gn-muted);
  font-size: 12px;
  line-height: 1.4;
}

.recent-body small {
  color: var(--gn-ink-soft);
  font-size: 11px;
}

.recent-days article em {
  font-style: normal;
  color: var(--gn-muted);
  font-size: 18px;
}

.empty,
.privacy-gate {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.privacy-gate h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--gn-ink);
}

.privacy-gate p {
  margin: 0;
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.5;
}

.privacy-gate button {
  align-self: flex-start;
  min-height: 36px;
  border: 1px solid var(--gn-leaf);
  border-radius: var(--gn-radius-small);
  padding: 0 16px;
  background: var(--gn-leaf);
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

@media (max-width: 374px) {
  .recovery-page {
    padding-left: 12px;
    padding-right: 12px;
  }

  .signal-row {
    grid-template-columns: minmax(0, 1fr) 156px;
  }
}

/* --- V2 layout, matching 设计图/16_Recovery.png ---------------------------------------------
   These come last on purpose: appending inside the block means nothing here silently loses to an
   older rule for the same selector. */

.recovery-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  margin: 0 -16px 14px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--gn-line);
}

.recovery-bar-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--gn-ink);
}

/* The design's bar carries a bare chevron, not a bordered button. */
.recovery-page .back-btn {
  width: 30px;
  height: 30px;
  min-height: 30px;
  margin-top: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  font-size: 22px;
}

.recovery-lead h2 {
  margin: 0;
  font-size: 24px;
  line-height: 1.3;
  color: var(--gn-ink);
}

.recovery-lead p {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--gn-muted);
}

.recovery-block {
  display: grid;
  gap: 10px;
  margin-top: 20px;
}

.recovery-block h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--gn-ink);
}

.topic-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.topic-chips button {
  min-height: 36px;
  padding: 6px 14px;
  border: 1px solid var(--gn-line);
  border-radius: 10px;
  background: var(--gn-paper);
  color: var(--gn-ink);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.topic-chips button.selected {
  border-color: var(--gn-leaf);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-weight: 600;
}

.state-options {
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 0;
  border: 0;
}

.state-options label {
  flex: 1;
}

.state-options input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.state-options span {
  display: grid;
  place-items: center;
  min-height: 38px;
  border: 1px solid var(--gn-line);
  border-radius: 10px;
  background: var(--gn-paper);
  color: var(--gn-ink);
  font-size: 13px;
  cursor: pointer;
}

.state-options input:checked + span {
  border-color: var(--gn-leaf);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-weight: 600;
}

.state-options input:focus-visible + span {
  outline: 2px solid var(--gn-leaf-soft);
  outline-offset: 2px;
}

.note-field textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 140px;
  padding: 14px 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card, 12px);
  background: var(--gn-paper);
  color: var(--gn-ink);
  font: inherit;
  font-size: 14px;
  line-height: 1.7;
  resize: none;
}

.week-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  padding: 14px 12px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card, 12px);
  background: var(--gn-paper);
}

.week-day {
  display: grid;
  justify-items: center;
  gap: 8px;
}

.week-label {
  font-size: 12px;
  color: var(--gn-muted);
}

.week-mark {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--gn-paper-warm);
  color: var(--gn-muted);
  font-size: 14px;
}

.week-mark.recorded {
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
}

.block-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--gn-muted);
}

.history-list {
  display: grid;
}

.history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 0;
}

.history-row + .history-row {
  border-top: 1px solid var(--gn-line);
}

.history-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.history-copy strong {
  font-size: 15px;
  font-weight: 600;
  color: var(--gn-ink);
  overflow-wrap: anywhere;
}

.history-copy small {
  font-size: 12px;
  color: var(--gn-muted);
}

.history-row em {
  color: var(--gn-muted);
  font-style: normal;
}

/* Fixed rather than sticky: .goodnight-page sets overflow-x: hidden, so the page is its own scroll
   container and a sticky child has no scrollport to stick to. */
.recovery-cta {
  position: fixed;
  right: 0;
  bottom: calc(var(--gn-tabbar-reserve) + env(safe-area-inset-bottom));
  left: 0;
  padding: 12px 16px;
  border-top: 1px solid var(--gn-line);
  background: var(--gn-bg);
}

/* The design's primary action spans the bar. */
.recovery-cta .recovery-save {
  width: 100%;
  min-height: 46px;
  border: 0;
  border-radius: var(--gn-radius-small, 8px);
  background: var(--gn-leaf);
  color: #ffffff;
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.recovery-cta .recovery-save:disabled {
  opacity: 0.6;
  cursor: wait;
}

.recovery-page {
  padding-bottom: calc(var(--gn-tabbar-reserve) + 110px + env(safe-area-inset-bottom));
}
</style>
