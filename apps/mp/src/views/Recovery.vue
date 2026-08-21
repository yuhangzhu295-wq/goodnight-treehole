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
  <section class="goodnight-page recovery-final">
    <header class="recovery-hero">
      <div class="recovery-brand">♧ 晚安树洞</div>
      <h1>今天，生活回来一点了吗？</h1>
      <p>我们只看生活有没有慢慢回来，不评价你。</p>
    </header>
    <section v-if="privacyBlocked" class="privacy-gate" data-testid="recovery-privacy-gate">
      <h2>先由你决定要不要保存</h2>
      <p>{{ error }}</p>
      <button @click="router.push('/pages/settings/privacy')">去隐私设置</button>
    </section>
    <template v-else>
      <p v-if="error" class="error-note">{{ error }}</p>
      <section class="recovery-paper">
        <h2>⌁ 今天的我</h2>
        <article v-for="field in fields" :key="field.key" class="signal-row">
          <div>
            <span aria-hidden="true">{{ field.icon }}</span><strong>{{ field.label }}</strong>
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
        <label for="recovery-summary">今天有什么值得被看见的小变化？</label><textarea
          id="recovery-summary"
          v-model="summary"
          maxlength="500"
          placeholder="哪怕只是一点点，也很重要……"
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
        <h2>只和清醒时的我比较</h2>
        <p>{{ stableComparison }}</p>
      </section>
      <section class="recent-days">
        <h2>⌁ 最近几天</h2>
        <p v-if="!recent.length" class="empty">还没有恢复记录。今天可以先留下第一条。</p>
        <article v-for="item in recent" :key="item.id">
          <span class="day-scene" aria-hidden="true">☾</span>
          <div>
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
.recovery-final {
  display: grid;
  gap: 10px;
  overflow-x: hidden;
  padding: 0 18px calc(112px + env(safe-area-inset-bottom));
  background: #f7f1e7;
  color: #293a2e;
}
.recovery-hero {
  min-height: 148px;
  margin: 0 -18px;
  padding: 20px 24px 22px;
  background:
    linear-gradient(180deg, rgba(18, 40, 57, 0.25), rgba(19, 41, 55, 0.78)),
    url('../assets/goodnight/peer/peer-night-hero.png') center 52% / cover;
  color: #fff;
}
.recovery-brand {
  font-size: 12px;
}
.recovery-hero h1 {
  max-width: 330px;
  margin: 24px 0 5px;
  font:
    600 26px/1.25 Georgia,
    'Noto Serif SC',
    serif;
  letter-spacing: 0;
}
.recovery-hero p {
  margin: 0;
  color: rgba(255, 255, 255, 0.78);
  font-size: 12px;
}
.recovery-paper,
.change-note,
.privacy-gate,
.recent-change,
.stable-comparison,
.recent-days {
  border: 1px solid rgba(86, 105, 74, 0.15);
  border-radius: 20px;
  background: rgba(255, 252, 247, 0.95);
  box-shadow: 0 10px 25px rgba(54, 62, 44, 0.06);
}
.recovery-paper {
  padding: 12px 14px;
}
.recovery-paper h2,
.recent-days h2,
.recent-change h2,
.stable-comparison h2 {
  margin: 0 0 6px;
  font:
    600 15px Georgia,
    'Noto Serif SC',
    serif;
}
.signal-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 174px;
  gap: 8px;
  align-items: center;
  min-height: 48px;
  border-bottom: 1px solid rgba(86, 105, 74, 0.1);
}
.signal-row:last-child {
  border-bottom: 0;
}
.signal-row > div {
  display: flex;
  gap: 7px;
  align-items: center;
}
.signal-row > div > span {
  display: grid;
  place-items: center;
  width: 27px;
  height: 27px;
  border-radius: 50%;
  background: #eef0df;
  color: #667657;
}
.signal-row strong {
  font-size: 12px;
  font-weight: 500;
}
.signal-row fieldset {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border: 0;
  margin: 0;
  padding: 0;
}
.signal-row label {
  display: grid;
  gap: 2px;
  justify-items: center;
  cursor: pointer;
}
.signal-row input {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: #607955;
}
.signal-row label span {
  font-size: 9px;
  color: #868b82;
}
.change-note {
  display: grid;
  gap: 7px;
  padding: 12px 14px;
  background: rgba(246, 230, 192, 0.7);
}
.change-note label {
  font-size: 12px;
}
.change-note textarea {
  box-sizing: border-box;
  min-height: 64px;
  width: 100%;
  resize: none;
  border: 1px solid rgba(86, 105, 74, 0.16);
  border-radius: 10px;
  padding: 10px;
  background: #fffdf8;
  font: 12px/1.6 inherit;
}
.recovery-save {
  min-height: 44px;
  border: 0;
  border-radius: 999px;
  background: #3e644a;
  color: #fff;
  font: inherit;
}
.recovery-save:disabled {
  opacity: 0.65;
}
.recent-change,
.stable-comparison {
  padding: 11px 14px;
}
.recent-change p,
.stable-comparison p {
  margin: 0;
  color: #707a6d;
  font-size: 11px;
  line-height: 1.55;
}
.recent-days {
  padding: 12px 14px;
}
.recent-days article {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 12px;
  gap: 9px;
  align-items: center;
  min-height: 55px;
  border-top: 1px solid rgba(86, 105, 74, 0.1);
}
.day-scene {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #ecebdc;
  color: #6a795b;
}
.recent-days article strong {
  font-size: 11px;
}
.recent-days article p,
.recent-days article small {
  display: block;
  margin: 2px 0;
  color: #777f74;
  font-size: 9px;
  line-height: 1.4;
}
.recent-days article em {
  font-style: normal;
  color: #899083;
}
.empty,
.error-note {
  margin: 0;
  color: #7a8277;
  font-size: 12px;
  line-height: 1.6;
}
.error-note {
  color: var(--gn-danger);
}
.privacy-gate {
  margin-top: 10px;
  padding: 24px;
}
.privacy-gate h2 {
  margin: 0;
  font:
    600 20px Georgia,
    'Noto Serif SC',
    serif;
}
.privacy-gate p {
  color: #748071;
  line-height: 1.65;
}
.privacy-gate button {
  min-height: 42px;
  border: 0;
  border-radius: 999px;
  padding: 0 22px;
  background: #3e644a;
  color: #fff;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
@media (max-width: 374px) {
  .recovery-final {
    padding-right: 12px;
    padding-left: 12px;
  }
  .recovery-hero {
    margin-right: -12px;
    margin-left: -12px;
  }
  .signal-row {
    grid-template-columns: minmax(0, 1fr) 156px;
  }
  .signal-row strong {
    font-size: 11px;
  }
}
</style>
