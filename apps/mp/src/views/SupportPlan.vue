<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

type ListKey = 'earlySignals' | 'thingsThatHelp' | 'thingsThatMakeWorse' | 'safePeople' | 'places' | 'smallActions';
type PlanDraft = Record<ListKey, string[]> & { professionalSupport: string; emergencyPreference: string };

const router = useRouter();
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const savedNotice = ref('');
const editingKey = ref<ListKey | null>(null);
const currentId = ref('');
const updatedAt = ref('');
const contacts = ref<any[]>([]);
const custom = reactive<Record<ListKey, string>>({
  earlySignals: '',
  thingsThatHelp: '',
  thingsThatMakeWorse: '',
  safePeople: '',
  places: '',
  smallActions: '',
});
const draft = reactive<PlanDraft>({
  earlySignals: [],
  thingsThatHelp: [],
  thingsThatMakeWorse: [],
  safePeople: [],
  places: [],
  smallActions: [],
  professionalSupport: '',
  emergencyPreference: '',
});

const sections: Array<{ number: number; key: ListKey; title: string; note: string; suggestions: string[] }> = [
  {
    number: 1,
    key: 'earlySignals',
    title: '第一步希望',
    note: '当我很难受时，希望你：',
    suggestions: ['先听我说', '先让我稳定下来', '提醒我休息'],
  },
  {
    number: 2,
    key: 'thingsThatHelp',
    title: '对我通常有帮助',
    note: '这些方式通常能让我好一点：',
    suggestions: ['散步', '写下来', '联系朋友', '早点睡'],
  },
  {
    number: 3,
    key: 'thingsThatMakeWorse',
    title: '对我通常没用',
    note: '这些做法反而会让我更难受：',
    suggestions: ['讲大道理', '催促', '连续提问'],
  },
  { number: 4, key: 'safePeople', title: '我愿意联系的人', note: '如果情况很糟，我希望联系：', suggestions: [] },
];

const selectedCount = computed(() =>
  Object.values(draft).reduce(
    (total, value) => total + (Array.isArray(value) ? value.length : value.trim() ? 1 : 0),
    0,
  ),
);

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .map(String)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];
}

function applyPlan(plan: Record<string, unknown> = {}) {
  (
    ['earlySignals', 'thingsThatHelp', 'thingsThatMakeWorse', 'safePeople', 'places', 'smallActions'] as ListKey[]
  ).forEach((key) => {
    draft[key] = stringList(plan[key]);
  });
  draft.professionalSupport = typeof plan.professionalSupport === 'string' ? plan.professionalSupport : '';
  draft.emergencyPreference = typeof plan.emergencyPreference === 'string' ? plan.emergencyPreference : '';
}

function toggle(key: ListKey, value: string) {
  const index = draft[key].indexOf(value);
  if (index >= 0) draft[key].splice(index, 1);
  else if (draft[key].length < 12) draft[key].push(value);
  savedNotice.value = '';
}

function addCustom(key: ListKey) {
  const value = custom[key].trim();
  if (!value) return;
  if (!draft[key].includes(value) && draft[key].length < 12) draft[key].push(value.slice(0, 80));
  custom[key] = '';
  editingKey.value = null;
  savedNotice.value = '';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [planResult, contactResult] = await Promise.all([
      api.get<any>('/api/v1/me/support-plan'),
      api.get<any>('/api/v1/trusted-contacts'),
    ]);
    const item = planResult.item;
    contacts.value = contactResult.items ?? [];
    if (item) {
      currentId.value = item.id;
      updatedAt.value = item.updatedAt;
      applyPlan(item.plan);
    }
  } catch (cause: any) {
    error.value = cause?.message ?? '低谷预案读取失败';
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!selectedCount.value) {
    error.value = '请至少留下一条真实可用的支持方式';
    return;
  }
  saving.value = true;
  error.value = '';
  savedNotice.value = '';
  try {
    const response = await api.put<any>('/api/v1/me/support-plan', { title: '我的低谷预案', plan: { ...draft } });
    currentId.value = response.item.id;
    updatedAt.value = response.item.updatedAt;
    savedNotice.value = '低谷预案已保存。';
  } catch (cause: any) {
    error.value = cause?.message ?? '低谷预案没有保存成功';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="goodnight-page support-plan-page">
    <header class="support-header">
      <button class="back-btn" type="button" aria-label="返回" @click="router.back()">‹</button>
      <div class="header-titles">
        <h1 class="support-title">我的低谷预案</h1>
        <p class="support-subtitle">提前设置低谷期的应对策略与现实支持方式</p>
      </div>
    </header>
    <p v-if="loading" class="state-note">正在读取你保存的预案…</p>
    <form v-else class="plan-paper" @submit.prevent="save">
      <section v-for="section in sections" :key="section.key" class="plan-section">
        <div class="section-head">
          <b>{{ section.number }}</b>
          <div>
            <h2>{{ section.title }}</h2>
            <p>{{ section.note }}</p>
          </div>
        </div>
        <div class="choice-wrap">
          <button
            v-for="choice in section.suggestions"
            :key="choice"
            type="button"
            :class="{ selected: draft[section.key].includes(choice) }"
            @click="toggle(section.key, choice)"
          >
            {{ choice }}
          </button>
          <button
            v-for="contact in section.key === 'safePeople' ? contacts : []"
            :key="contact.id"
            type="button"
            :class="{ selected: draft.safePeople.includes(contact.nickname) }"
            @click="toggle('safePeople', contact.nickname)"
          >
            {{ contact.nickname }}
          </button>
          <span
            v-for="choice in draft[section.key].filter(
              (value) =>
                !section.suggestions.includes(value) && !contacts.some((contact) => contact.nickname === value),
            )"
            :key="choice"
            class="custom-choice"
          >{{ choice
          }}<button type="button" :aria-label="`移除${choice}`" @click="toggle(section.key, choice)">×</button></span>
          <button v-if="editingKey !== section.key" type="button" class="add-choice" @click="editingKey = section.key">
            ＋ 补充
          </button>
        </div>
        <div v-if="editingKey === section.key" class="custom-entry">
          <input
            v-model="custom[section.key]"
            :aria-label="`补充${section.title}`"
            maxlength="80"
            placeholder="补充一项真实情况"
            @keydown.enter.prevent="addCustom(section.key)"
          /><button type="button" @click="addCustom(section.key)">添加</button>
        </div>
      </section>
      <details class="more-support">
        <summary>补充地点、最低行动与现实支持</summary>
        <label>我可以去的安全地点</label>
        <div class="extra-entry">
          <input
            v-model="custom.places"
            maxlength="80"
            placeholder="例如：有人的客厅"
            @keydown.enter.prevent="addCustom('places')"
          /><button type="button" @click="addCustom('places')">添加</button>
        </div>
        <div v-if="draft.places.length" class="saved-list">
          <button v-for="item in draft.places" :key="item" type="button" @click="toggle('places', item)">
            {{ item }} ×
          </button>
        </div>
        <label>最低成本行动</label>
        <div class="extra-entry">
          <input
            v-model="custom.smallActions"
            maxlength="80"
            placeholder="例如：先喝一口水"
            @keydown.enter.prevent="addCustom('smallActions')"
          /><button type="button" @click="addCustom('smallActions')">添加</button>
        </div>
        <div v-if="draft.smallActions.length" class="saved-list">
          <button v-for="item in draft.smallActions" :key="item" type="button" @click="toggle('smallActions', item)">
            {{ item }} ×
          </button>
        </div>
        <label>现实专业支持备注<textarea
          v-model="draft.professionalSupport"
          maxlength="500"
          placeholder="只写你确认过的现实资源"
        ></textarea>
        </label>
        <label>紧急状态下的处理偏好<textarea
          v-model="draft.emergencyPreference"
          maxlength="500"
          placeholder="例如：先联系谁、去哪里"
        ></textarea>
        </label>
        <button
          class="safety-link"
          data-testid="support-plan-safety"
          type="button"
          @click="router.push('/pages/safety/index')"
        >
          需要即时安全支持
        </button>
      </details>
      <p v-if="error" class="error-note" role="alert">{{ error }}</p>
      <p v-if="savedNotice" class="saved-note" role="status">{{ savedNotice }}</p>
      <button class="save-plan" data-testid="support-plan-save" :disabled="saving" type="submit">
        {{ saving ? '正在保存…' : '保存我的低谷预案' }}
      </button>
      <small v-if="currentId" class="version-note">已保存于 {{ new Date(updatedAt).toLocaleString('zh-CN') }}</small>
    </form>
  </section>
</template>

<style scoped>
.support-plan-page {
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

.support-header {
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

.support-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--gn-ink);
}

.support-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--gn-muted);
}

.plan-paper {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  padding: 16px;
  background: var(--gn-paper);
}

.plan-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--gn-line);
}

.section-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.section-head b {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--gn-paper-warm);
  border: 1px solid var(--gn-line);
  color: var(--gn-leaf);
  font-size: 11px;
  font-weight: 600;
  margin-top: 1px;
}

.section-head > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.section-head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--gn-ink);
}

.section-head p {
  margin: 0;
  color: var(--gn-muted);
  font-size: 12px;
  line-height: 1.35;
}

.choice-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.choice-wrap > button,
.custom-choice,
.saved-list button {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  padding: 0 10px;
  background: var(--gn-paper-warm);
  color: var(--gn-ink);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.choice-wrap > button.selected {
  border-color: var(--gn-leaf);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-weight: 500;
}

.custom-choice {
  gap: 4px;
}

.custom-choice button {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--gn-muted);
  font-size: 14px;
  cursor: pointer;
}

.custom-entry {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 56px;
  gap: 6px;
}

.custom-entry input,
.more-support input,
.more-support textarea {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  padding: 6px 10px;
  background: var(--gn-paper-warm);
  color: var(--gn-ink);
  font: inherit;
  font-size: 12px;
  line-height: 1.4;
}

.extra-entry {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 56px;
  gap: 6px;
}

.extra-entry button,
.custom-entry button {
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  color: var(--gn-ink);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.more-support {
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  padding: 10px 12px;
  background: var(--gn-paper-warm);
}

.more-support summary {
  cursor: pointer;
  color: var(--gn-ink);
  font-size: 13px;
  font-weight: 500;
}

.more-support label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  color: var(--gn-muted);
  font-size: 11px;
}

.more-support textarea {
  min-height: 52px;
  resize: none;
}

.saved-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.saved-list button {
  min-height: 24px;
  font-size: 11px;
}

.save-plan {
  display: block;
  width: 100%;
  min-height: 40px;
  margin-top: 6px;
  border: 1px solid var(--gn-leaf);
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf);
  color: #fff;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.save-plan:disabled {
  opacity: 0.6;
  cursor: wait;
}

.safety-link {
  display: block;
  margin-top: 10px;
  border: 0;
  background: transparent;
  color: var(--gn-leaf-deep);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  text-align: center;
  text-decoration: underline;
}

.state-note,
.error-note,
.saved-note {
  margin: 0;
  border-radius: var(--gn-radius-card);
  border: 1px solid var(--gn-line);
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.4;
}

.state-note {
  background: var(--gn-paper);
  color: var(--gn-muted);
}

.error-note {
  background: var(--gn-paper);
  color: var(--gn-danger);
}

.saved-note {
  background: var(--gn-paper);
  color: var(--gn-leaf-deep);
}

.version-note {
  display: block;
  color: var(--gn-muted);
  text-align: center;
  font-size: 11px;
}

@media (max-width: 374px) {
  .support-plan-page {
    padding-left: 12px;
    padding-right: 12px;
  }
}
</style>
