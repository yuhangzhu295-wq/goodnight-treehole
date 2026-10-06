<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

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
    <header class="recovery-header">
      <button class="back-btn" type="button" aria-label="返回上一页" @click="router.back()">‹</button>
      <div class="header-titles">
        <h1 class="recovery-title">生活恢复记录</h1>
        <p class="recovery-subtitle">记录日常生活基本指标，持续观察恢复进展</p>
      </div>
    </header>
    <section v-if="privacyBlocked" class="privacy-gate" data-testid="recovery-privacy-gate">
      <h2>先由你决定要不要保存</h2>
      <p>{{ error }}</p>
      <button @click="router.push('/pages/settings/privacy')">去隐私设置</button>
    </section>
    <template v-else>
      <p v-if="error" class="error-note">{{ error }}</p>
      <section class="recovery-paper">
        <h2>今日指标记录</h2>
        <article v-for="field in fields" :key="field.key" class="signal-row">
          <div>
            <span class="signal-icon" aria-hidden="true">{{ field.icon }}</span><strong>{{ field.label }}</strong>
          </div>
          <fieldset>
            <legend class="sr-only">{{ field.label }}</legend>
            <label v-for="option in options" :key="option.value"><input v-model="signals[field.key]" type="radio" :name="field.key" :value="option.value" /><span>{{
              option.label
            }}</span></label>
          </fieldset>
        </article>
      </section>
      <section class="change-note">
        <label for="recovery-summary">今日变化与备注（可选）</label><textarea
          id="recovery-summary"
          v-model="summary"
          maxlength="500"
          placeholder="记录今天状态或日常细节…"
        ></textarea>
      </section>
      <button class="recovery-save" data-testid="recovery-save" :disabled="saving" @click="save">
        {{ saving ? '正在保存…' : '保存今天的记录' }}
      </button>
      <section class="recent-change">
        <h2>最近一次变化</h2>
        <p>{{ latestChange }}</p>
      </section>
      <section v-if="stableComparison" class="stable-comparison">
        <h2>与稳定期参考比对</h2>
        <p>{{ stableComparison }}</p>
      </section>
      <section class="recent-days">
        <h2>最近记录</h2>
        <p v-if="!recent.length" class="empty">还没有恢复记录。今天可以先留下第一条。</p>
        <article v-for="item in recent" :key="item.id">
          <div class="recent-body">
            <strong>{{ dayLabel(item.createdAt) }}</strong>
            <p>{{ visibleSignals(item) }}</p>
            <small v-if="item.summary">{{ item.summary }}</small>
          </div>
          <em aria-hidden="true">›</em>
        </article>
      </section>
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
.error-note {
  margin: 0;
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.5;
}

.error-note {
  color: var(--gn-danger);
  padding: 10px 14px;
  border-radius: var(--gn-radius-card);
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
}

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
</style>
