<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import AppIcon from '../components/icons/AppIcon.vue';

type ListKey = 'stabilityAnchors' | 'contactPeople' | 'usualLikes' | 'recoverySigns';
type Profile = {
  stableDescription: string;
  sleepPattern: string;
  eatingPattern: string;
  focusPattern: string;
  bodyState: string;
  contactPeople: string[];
  usualLikes: string[];
  recoverySigns: string[];
  stabilityAnchors: string[];
  realityReminder: string;
};

const router = useRouter();
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const saved = ref('');
const currentId = ref('');
const updatedAt = ref('');
const contacts = ref<any[]>([]);
const editingKey = ref<ListKey | null>(null);
const custom = reactive<Record<ListKey, string>>({
  stabilityAnchors: '',
  contactPeople: '',
  usualLikes: '',
  recoverySigns: '',
});
const profile = reactive<Profile>({
  stableDescription: '',
  sleepPattern: '',
  eatingPattern: '',
  focusPattern: '',
  bodyState: '',
  contactPeople: [],
  usualLikes: [],
  recoverySigns: [],
  stabilityAnchors: [],
  realityReminder: '',
});

const anchors = ['先睡一觉', '先联系朋友', '先延迟10分钟'];
const hasContent = computed(() =>
  Object.values(profile).some((value) => (Array.isArray(value) ? value.length : value.trim())),
);

function list(value: unknown) {
  return Array.isArray(value)
    ? value
        .map(String)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 12)
    : [];
}

function hydrate(value: Record<string, unknown> = {}) {
  profile.stableDescription = typeof value.stableDescription === 'string' ? value.stableDescription : '';
  profile.sleepPattern = typeof value.sleepPattern === 'string' ? value.sleepPattern : '';
  profile.eatingPattern = typeof value.eatingPattern === 'string' ? value.eatingPattern : '';
  profile.focusPattern = typeof value.focusPattern === 'string' ? value.focusPattern : '';
  profile.bodyState = typeof value.bodyState === 'string' ? value.bodyState : '';
  profile.realityReminder = typeof value.realityReminder === 'string' ? value.realityReminder : '';
  profile.contactPeople = list(value.contactPeople);
  profile.usualLikes = list(value.usualLikes);
  profile.recoverySigns = list(value.recoverySigns);
  profile.stabilityAnchors = list(value.stabilityAnchors);
}

function toggle(key: ListKey, value: string) {
  const index = profile[key].indexOf(value);
  if (index >= 0) profile[key].splice(index, 1);
  else if (profile[key].length < 12) profile[key].push(value);
  saved.value = '';
}

function add(key: ListKey) {
  const value = custom[key].trim();
  if (!value) return;
  if (!profile[key].includes(value) && profile[key].length < 12) profile[key].push(value.slice(0, 80));
  custom[key] = '';
  editingKey.value = null;
  saved.value = '';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [result, contactResult] = await Promise.all([
      api.get<any>('/api/v1/me/stable-self'),
      api.get<any>('/api/v1/trusted-contacts'),
    ]);
    contacts.value = contactResult.items ?? [];
    if (result.item) {
      currentId.value = result.item.id;
      updatedAt.value = result.item.updatedAt;
      hydrate(result.item.profile);
    }
  } catch (cause: any) {
    error.value = cause?.message ?? '稳定状态资料读取失败';
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!hasContent.value) {
    error.value = '请至少写下一条属于你的稳定状态信息';
    return;
  }
  saving.value = true;
  error.value = '';
  saved.value = '';
  try {
    const response = await api.put<any>('/api/v1/me/stable-self', { profile: { ...profile } });
    currentId.value = response.item.id;
    updatedAt.value = response.item.updatedAt;
    saved.value = '这张提醒卡已经保存。以后只和你自己的稳定状态比较。';
  } catch (cause: any) {
    error.value = cause?.message ?? '提醒卡没有保存成功';
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="goodnight-page stable-self-page">
    <header class="stable-hero">
      <button aria-label="返回" @click="router.back()"><AppIcon name="back" :size="18" /></button>
      <div class="stable-brand"><span aria-hidden="true">♧</span> 晚安树洞</div>
      <h1>清醒时候的我</h1>
      <p>在你清醒的时候，先替难受的自己留下一点方向。</p>
    </header>
    <p v-if="loading" class="state-note">正在读取你的提醒卡…</p>
    <form v-else class="stable-paper" @submit.prevent="save">
      <section class="stable-section stable-description">
        <div class="section-title">
          <span aria-hidden="true">⌁</span><b>1</b>
          <h2>我想变成什么样的人</h2>
        </div>
        <textarea
          v-model="profile.stableDescription"
          maxlength="500"
          placeholder="不是理想模板，只写你状态比较稳定时的样子。"
        ></textarea>
      </section>
      <section class="stable-section">
        <div class="section-title">
          <span aria-hidden="true">⌁</span><b>2</b>
          <h2>当我快失控时，请先提醒我</h2>
        </div>
        <div class="stable-choices">
          <button
            v-for="item in anchors"
            :key="item"
            type="button"
            :class="{ selected: profile.stabilityAnchors.includes(item) }"
            @click="toggle('stabilityAnchors', item)"
          >
            {{ item }}
          </button>
          <span v-for="item in profile.stabilityAnchors.filter((value) => !anchors.includes(value))" :key="item">{{ item
          }}<button type="button" :aria-label="`移除${item}`" @click="toggle('stabilityAnchors', item)">
            ×
          </button></span>
          <button v-if="editingKey !== 'stabilityAnchors'" type="button" @click="editingKey = 'stabilityAnchors'">
            ＋ 补充
          </button>
        </div>
        <div v-if="editingKey === 'stabilityAnchors'" class="stable-add">
          <input
            v-model="custom.stabilityAnchors"
            aria-label="补充稳定提醒"
            maxlength="80"
            @keydown.enter.prevent="add('stabilityAnchors')"
          /><button type="button" @click="add('stabilityAnchors')">添加</button>
        </div>
      </section>
      <section class="stable-section">
        <div class="section-title">
          <span aria-hidden="true">⌁</span><b>3</b>
          <h2>对我重要的人和事</h2>
        </div>
        <div class="stable-choices">
          <button
            v-for="contact in contacts"
            :key="contact.id"
            type="button"
            :class="{ selected: profile.contactPeople.includes(contact.nickname) }"
            @click="toggle('contactPeople', contact.nickname)"
          >
            {{ contact.nickname }}
          </button>
          <span
            v-for="item in profile.contactPeople.filter(
              (value) => !contacts.some((contact) => contact.nickname === value),
            )"
            :key="item"
          >{{ item
          }}<button type="button" :aria-label="`移除${item}`" @click="toggle('contactPeople', item)">×</button></span>
          <button v-if="editingKey !== 'contactPeople'" type="button" @click="editingKey = 'contactPeople'">
            ＋ 补充
          </button>
        </div>
        <div v-if="editingKey === 'contactPeople'" class="stable-add">
          <input
            v-model="custom.contactPeople"
            aria-label="补充重要的人和事"
            maxlength="80"
            @keydown.enter.prevent="add('contactPeople')"
          /><button type="button" @click="add('contactPeople')">添加</button>
        </div>
      </section>
      <details class="daily-outline">
        <summary>补充我稳定时的日常轮廓</summary>
        <label>睡眠通常是什么样<input v-model="profile.sleepPattern" maxlength="300" /></label>
        <label>饮食通常是什么样<input v-model="profile.eatingPattern" maxlength="300" /></label>
        <label>通常能专注多久<input v-model="profile.focusPattern" maxlength="300" /></label>
        <label>身体通常是什么感觉<input v-model="profile.bodyState" maxlength="300" /></label>
        <label>平时喜欢什么<input v-model="custom.usualLikes" maxlength="80" @keydown.enter.prevent="add('usualLikes')" /></label>
        <div class="saved-tags">
          <button v-for="item in profile.usualLikes" :key="item" type="button" @click="toggle('usualLikes', item)">
            {{ item }} ×
          </button>
        </div>
        <label>哪些事情说明我正在恢复<input
          v-model="custom.recoverySigns"
          maxlength="80"
          @keydown.enter.prevent="add('recoverySigns')"
        /></label>
        <div class="saved-tags">
          <button
            v-for="item in profile.recoverySigns"
            :key="item"
            type="button"
            @click="toggle('recoverySigns', item)"
          >
            {{ item }} ×
          </button>
        </div>
      </details>
      <section class="stable-section reminder-section">
        <div class="section-title">
          <span aria-hidden="true">⌁</span><b>4</b>
          <h2>一句把我拉回现实的话</h2>
        </div>
        <textarea
          v-model="profile.realityReminder"
          maxlength="500"
          placeholder="写一句你清醒时愿意对难受的自己说的话。"
        ></textarea>
      </section>
      <p v-if="error" class="error-note" role="alert">{{ error }}</p>
      <p v-if="saved" class="saved-note" role="status">{{ saved }}</p>
      <button class="stable-save" data-testid="stable-self-save" :disabled="saving" type="submit">
        {{ saving ? '正在保存…' : '保存这张提醒卡' }}<span aria-hidden="true">✦</span>
      </button>
      <small v-if="currentId" class="version-note">最近保存：{{ new Date(updatedAt).toLocaleString('zh-CN') }}</small>
    </form>
  </section>
</template>

<style scoped>
.stable-self-page {
  display: grid;
  overflow-x: hidden;
  padding: 0 22px 42px;
  background: #eee7dc;
  color: #26382c;
}
.stable-hero {
  position: relative;
  min-height: 151px;
  margin: 0 -22px;
  padding: 20px 24px 15px;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(12, 29, 45, 0.12), rgba(17, 35, 50, 0.5)),
    url('../assets/goodnight/peer/peer-night-hero.png') center 47% / cover;
  color: #fff;
}
.stable-hero::after {
  position: absolute;
  inset: auto 0 0;
  height: 35px;
  background: linear-gradient(transparent, #eee7dc);
  content: '';
  pointer-events: none;
}
.stable-hero > * {
  position: relative;
  z-index: 1;
}
.stable-hero > button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  min-height: 28px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 50%;
  padding: 0;
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}
.stable-brand {
  position: absolute;
  top: 26px;
  left: 60px;
  font-size: 12px;
}
.stable-hero h1 {
  margin: 19px 0 5px;
  font:
    600 28px/1.2 Georgia,
    'Noto Serif SC',
    serif;
  letter-spacing: 0;
}
.stable-hero p {
  margin: 0;
  color: rgba(255, 255, 255, 0.78);
  font-size: 11px;
}
.stable-paper {
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
.stable-paper::before {
  position: absolute;
  z-index: 0;
  top: 42px;
  right: 4px;
  width: 133px;
  height: 145px;
  background: url('../assets/goodnight/illustrations/situation-book-lantern.png') center/cover no-repeat;
  content: '';
  opacity: 0.65;
  mix-blend-mode: multiply;
  -webkit-mask-image: radial-gradient(ellipse, #000 50%, transparent 96%);
  mask-image: radial-gradient(ellipse, #000 50%, transparent 96%);
  pointer-events: none;
}
.stable-paper > * {
  position: relative;
  z-index: 1;
}
.stable-section {
  display: grid;
  gap: 8px;
  padding: 11px 0;
  border-bottom: 1px dotted rgba(80, 95, 71, 0.23);
}
.stable-description {
  min-height: 156px;
  padding-right: 104px;
}
.section-title {
  display: grid;
  grid-template-columns: 17px 24px minmax(0, 1fr);
  gap: 7px;
  align-items: center;
}
.section-title > span {
  color: #66815e;
}
.section-title b {
  display: grid;
  place-items: center;
  width: 23px;
  height: 23px;
  border-radius: 50%;
  background: #e7eadc;
  color: #556d50;
  font-size: 12px;
}
.section-title h2 {
  margin: 0;
  font:
    600 13px/1.4 Georgia,
    'Noto Serif SC',
    serif;
}
.stable-section textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 72px;
  resize: none;
  border: 1px solid rgba(86, 105, 74, 0.15);
  border-radius: 8px;
  padding: 9px;
  background: rgba(255, 253, 248, 0.78);
  color: #304135;
  font: 11px/1.6 inherit;
}
.stable-description textarea {
  min-height: 100px;
}
.stable-choices,
.saved-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.stable-choices > button,
.stable-choices > span,
.saved-tags button {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  border: 1px solid rgba(86, 105, 74, 0.15);
  border-radius: 999px;
  padding: 0 11px;
  background: #f2f0e5;
  color: #53634f;
  font: 10px inherit;
}
.stable-choices > button.selected {
  border-color: #6e845f;
  background: #e2ead8;
  color: #315136;
}
.stable-choices > span {
  gap: 4px;
}
.stable-choices > span button {
  border: 0;
  padding: 0;
  background: transparent;
  color: #86756e;
}
.stable-add {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 48px;
  gap: 5px;
}
.stable-add input,
.daily-outline input {
  box-sizing: border-box;
  width: 100%;
  min-height: 30px;
  border: 1px solid rgba(86, 105, 74, 0.15);
  border-radius: 8px;
  padding: 5px 8px;
  background: #fffdf8;
  font: 11px inherit;
}
.stable-add button {
  border: 0;
  border-radius: 8px;
  background: #e2e8d8;
  color: #4c6547;
  font: 10px inherit;
}
.daily-outline {
  margin: 9px 0 0;
  border-radius: 11px;
  padding: 9px 11px;
  background: #f4f0e5;
}
.daily-outline summary {
  cursor: pointer;
  color: #536a50;
  font-size: 10px;
}
.daily-outline label {
  display: grid;
  gap: 3px;
  margin-top: 7px;
  color: #72796e;
  font-size: 9px;
}
.saved-tags {
  margin-top: 4px;
}
.saved-tags button {
  min-height: 23px;
  font-size: 9px;
}
.reminder-section textarea {
  min-height: 54px;
}
.stable-save {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  margin-top: 9px;
  border: 0;
  border-radius: 999px;
  background: #3d6048;
  color: #fff;
  font: 13px inherit;
}
.stable-save:disabled {
  opacity: 0.62;
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
  margin-top: 5px;
  color: #97978f;
  text-align: center;
  font-size: 8px;
}
@media (max-width: 374px) {
  .stable-self-page {
    padding-right: 14px;
    padding-left: 14px;
  }
  .stable-hero {
    margin-right: -14px;
    margin-left: -14px;
  }
  .stable-description {
    padding-right: 88px;
  }
}
</style>
