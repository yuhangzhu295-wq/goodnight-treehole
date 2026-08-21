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
    savedNotice.value = '低谷预案已经保存。下一次难受时，不必从头想。';
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
    <header class="support-hero">
      <div class="support-brand"><span aria-hidden="true">♧</span> 晚安树洞</div>
      <h1>我的低谷预案</h1>
      <p>下次我很难受的时候，希望你这样陪我。</p>
    </header>
    <p v-if="loading" class="state-note">正在读取你保存的预案…</p>
    <form v-else class="plan-paper" @submit.prevent="save">
      <section v-for="section in sections" :key="section.key" class="plan-section">
        <div class="section-head">
          <b>{{ section.number }}</b>
          <div>
            <h2>{{ section.title }} <span aria-hidden="true">⌁</span></h2>
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
        {{ saving ? '正在保存…' : '保存我的低谷预案' }}<span aria-hidden="true">✦</span>
      </button>
      <small v-if="currentId" class="version-note">已保存于 {{ new Date(updatedAt).toLocaleString('zh-CN') }}</small>
    </form>
  </section>
</template>

<style scoped>
.support-plan-page {
  display: grid;
  gap: 0;
  overflow-x: hidden;
  padding: 0 22px calc(112px + env(safe-area-inset-bottom));
  background: #efe8dc;
  color: #24362b;
}
.support-hero {
  position: relative;
  min-height: 150px;
  margin: 0 -22px;
  width: calc(100% + 44px);
  max-width: none;
  padding: 20px 24px 16px;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(11, 29, 46, 0.08), rgba(17, 35, 49, 0.55)),
    url('../assets/goodnight/peer/peer-night-hero.png') center 45% / cover;
  color: #fff;
}
.support-hero::after {
  position: absolute;
  inset: auto 0 0;
  height: 46px;
  background: linear-gradient(transparent, #efe8dc);
  content: '';
  pointer-events: none;
}
.support-brand,
.support-hero h1,
.support-hero p {
  position: relative;
  z-index: 1;
}
.support-brand {
  font-size: 12px;
}
.support-hero h1 {
  margin: 24px 0 4px;
  font:
    600 28px/1.2 Georgia,
    'Noto Serif SC',
    serif;
  letter-spacing: 0;
}
.support-hero p {
  margin: 0;
  color: rgba(255, 255, 255, 0.78);
  font-size: 12px;
}
.plan-paper {
  position: relative;
  z-index: 2;
  display: grid;
  margin-top: -7px;
  border: 1px solid rgba(81, 98, 71, 0.16);
  border-radius: 20px;
  padding: 8px 17px 12px;
  background: rgba(255, 251, 244, 0.97);
  box-shadow: 0 13px 30px rgba(48, 57, 41, 0.1);
}
.plan-paper::before {
  position: absolute;
  z-index: 0;
  top: 44px;
  right: 5px;
  width: 132px;
  height: 112px;
  background: url('../assets/goodnight/illustrations/situation-book-lantern.png') center/cover no-repeat;
  content: '';
  opacity: 0.68;
  mix-blend-mode: multiply;
  -webkit-mask-image: radial-gradient(ellipse at center, #000 52%, transparent 96%);
  mask-image: radial-gradient(ellipse at center, #000 52%, transparent 96%);
  pointer-events: none;
}
.plan-paper > * {
  position: relative;
  z-index: 1;
}
.plan-section {
  display: grid;
  gap: 7px;
  padding: 8px 0;
  border-bottom: 1px dotted rgba(80, 95, 71, 0.22);
}
.plan-section:first-of-type {
  min-height: 112px;
}
.plan-section:first-of-type .choice-wrap {
  max-width: 220px;
}
.section-head {
  display: grid;
  grid-template-columns: 25px minmax(0, 1fr);
  gap: 10px;
}
.section-head b {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #617553;
  color: #fff;
  font-size: 12px;
}
.section-head h2 {
  margin: 0;
  font:
    600 14px/1.35 Georgia,
    'Noto Serif SC',
    serif;
}
.section-head h2 span {
  color: #869777;
}
.section-head p {
  margin: 2px 0 0;
  color: #81877f;
  font-size: 9px;
}
.choice-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.choice-wrap > button,
.custom-choice,
.saved-list button {
  min-height: 28px;
  border: 1px solid rgba(86, 105, 74, 0.17);
  border-radius: 999px;
  padding: 0 11px;
  background: #f4f1e7;
  color: #566451;
  font: 11px/1 inherit;
}
.choice-wrap > button.selected {
  border-color: #6b835c;
  background: #e2ead8;
  color: #315136;
}
.custom-choice {
  display: inline-flex;
  gap: 5px;
  align-items: center;
}
.custom-choice button {
  border: 0;
  padding: 0;
  background: transparent;
  color: #8a7466;
}
.custom-entry {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 52px;
  gap: 5px;
  min-height: 30px;
}
.custom-entry input,
.more-support input,
.more-support textarea {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid rgba(86, 105, 74, 0.15);
  border-radius: 8px;
  padding: 6px 8px;
  background: #fffdf8;
  color: #2f4033;
  font-family: inherit;
  font-size: 11px;
  line-height: 1.4;
}
.extra-entry {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 48px;
  gap: 5px;
}
.extra-entry button {
  min-height: 30px;
  border: 0;
  border-radius: 8px;
  background: #e2e8d8;
  color: #4c6547;
  font-family: inherit;
  font-size: 10px;
}
.custom-entry button {
  min-height: 30px;
  border: 0;
  border-radius: 8px;
  background: #e2e8d8;
  color: #4c6547;
  font-family: inherit;
  font-size: 10px;
  white-space: nowrap;
}
.more-support {
  margin: 9px 0 2px;
  border-radius: 11px;
  background: #f5f1e7;
  padding: 9px 11px;
}
.more-support summary {
  cursor: pointer;
  color: #536a50;
  font-size: 11px;
}
.more-support label {
  display: grid;
  gap: 4px;
  margin-top: 9px;
  color: #6f786c;
  font-size: 10px;
}
.more-support textarea {
  min-height: 52px;
  resize: none;
}
.saved-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}
.saved-list button {
  min-height: 24px;
  font-size: 9px;
}
.save-plan {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  margin-top: 9px;
  border: 0;
  border-radius: 999px;
  background: #3e6048;
  color: #fff;
  font: 13px inherit;
}
.save-plan:disabled {
  opacity: 0.62;
}
.safety-link {
  justify-self: center;
  margin-top: 7px;
  border: 0;
  background: transparent;
  color: #61715e;
  font: 10px inherit;
  text-decoration: underline;
}
.state-note,
.error-note,
.saved-note {
  margin: 12px 0;
  border-radius: 10px;
  padding: 10px;
  font-size: 11px;
}
.state-note {
  background: #fffaf1;
}
.error-note {
  background: #fff0ec;
  color: var(--gn-danger);
}
.saved-note {
  background: #e8efe0;
  color: #476447;
}
.version-note {
  display: block;
  margin: 5px 0 0;
  color: #96978e;
  text-align: center;
  font-size: 8px;
}
@media (max-width: 374px) {
  .support-plan-page {
    padding-right: 14px;
    padding-left: 14px;
  }
  .support-hero {
    margin-right: -14px;
    margin-left: -14px;
  }
  .plan-paper {
    padding-right: 13px;
    padding-left: 13px;
  }
}
</style>
