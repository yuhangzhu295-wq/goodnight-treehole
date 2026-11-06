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
/**
 * "You have to allow this in privacy settings first" is a consent prompt, not a failure. Routing it
 * through `error` rendered it as a red alert, which reads as the page being broken when in fact
 * nothing is wrong and the user only needs to flip one switch. It is its own state, set by the
 * failure handlers below, rather than derived from `error` - deriving it would make the two vie for
 * the same tick.
 */
const needsConsent = ref('');
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
  needsConsent.value = '';
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
    const message = cause?.message ?? '稳定状态资料读取失败';
    // A consent prompt is information, not a failure: it goes in its own state and leaves `error`
    // empty, so the page renders the green note instead of a red alert.
    if (/请先在隐私设置/.test(message)) needsConsent.value = message;
    else error.value = message;
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
  needsConsent.value = '';
  saved.value = '';
  try {
    const response = await api.put<any>('/api/v1/me/stable-self', { profile: { ...profile } });
    currentId.value = response.item.id;
    updatedAt.value = response.item.updatedAt;
    saved.value = '稳定状态参考已保存。';
  } catch (cause: any) {
    const message = cause?.message ?? '提醒卡没有保存成功';
    if (/请先在隐私设置/.test(message)) needsConsent.value = message;
    else error.value = message;
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="goodnight-page stable-self-page">
    <header class="stable-bar">
      <button class="back-btn" type="button" aria-label="返回" @click="router.back()">
        <AppIcon name="back" :size="20" />
      </button>
      <h1 class="stable-bar-title">清醒时候的我</h1>
    </header>

    <div class="stable-lead">
      <h2 class="stable-heading">清醒时候的提醒</h2>
      <p>留给情绪波动时的自己，内容由你决定。</p>
    </div>

    <p v-if="loading" class="state-note">正在读取你的提醒卡…</p>
    <form v-else class="stable-form" @submit.prevent="save">
      <section class="stable-section">
        <h2 class="section-title">我想提醒自己</h2>
        <label class="field-label">状态稳定时的我，是什么样子</label>
        <textarea
          v-model="profile.stableDescription"
          data-testid="stable-description"
          maxlength="500"
          placeholder="不是理想模板，只写你状态比较稳定时的样子。"
        ></textarea>
        <label class="field-label">一句把我拉回现实的话</label>
        <textarea
          v-model="profile.realityReminder"
          data-testid="reality-reminder"
          maxlength="500"
          placeholder="写一句你清醒时愿意对难受的自己说的话。"
        ></textarea>
      </section>

      <section class="stable-section">
        <h2 class="section-title">对我有用的做法</h2>
        <label class="field-label">快失控时，可以先做的事</label>
        <div class="option-rows">
          <button
            v-for="item in anchors"
            :key="item"
            type="button"
            class="option-row"
            :class="{ selected: profile.stabilityAnchors.includes(item) }"
            :data-testid="'anchor-' + item"
            @click="toggle('stabilityAnchors', item)"
          >
            <span class="option-check" aria-hidden="true">{{
              profile.stabilityAnchors.includes(item) ? '✓' : ''
            }}</span>
            <span class="option-label">{{ item }}</span>
          </button>
          <div
            v-for="item in profile.stabilityAnchors.filter((value) => !anchors.includes(value))"
            :key="item"
            class="option-row selected"
          >
            <span class="option-check" aria-hidden="true">✓</span>
            <span class="option-label">{{ item }}</span>
            <button
              class="option-remove"
              type="button"
              :aria-label="`移除${item}`"
              @click="toggle('stabilityAnchors', item)"
            >
              ×
            </button>
          </div>
        </div>
        <button
          v-if="editingKey !== 'stabilityAnchors'"
          class="add-trigger"
          type="button"
          @click="editingKey = 'stabilityAnchors'"
        >
          ＋ 补充
        </button>
        <div v-if="editingKey === 'stabilityAnchors'" class="stable-add">
          <input
            v-model="custom.stabilityAnchors"
            aria-label="补充稳定提醒"
            maxlength="80"
            @keydown.enter.prevent="add('stabilityAnchors')"
          /><button type="button" @click="add('stabilityAnchors')">添加</button>
        </div>
      </section>

      <div class="field-group">
        <label class="field-label">对我重要的人和事</label>
        <div class="option-rows">
          <button
            v-for="contact in contacts"
            :key="contact.id"
            type="button"
            class="option-row"
            :class="{ selected: profile.contactPeople.includes(contact.nickname) }"
            @click="toggle('contactPeople', contact.nickname)"
          >
            <span class="option-check" aria-hidden="true">{{
              profile.contactPeople.includes(contact.nickname) ? '✓' : ''
            }}</span>
            <span class="option-label">{{ contact.nickname }}</span>
          </button>
          <div
            v-for="item in profile.contactPeople.filter(
              (value) => !contacts.some((contact) => contact.nickname === value),
            )"
            :key="item"
            class="option-row selected"
          >
            <span class="option-check" aria-hidden="true">✓</span>
            <span class="option-label">{{ item }}</span>
            <button
              class="option-remove"
              type="button"
              :aria-label="`移除${item}`"
              @click="toggle('contactPeople', item)"
            >
              ×
            </button>
          </div>
        </div>
        <button
          v-if="editingKey !== 'contactPeople'"
          class="add-trigger"
          type="button"
          @click="editingKey = 'contactPeople'"
        >
          ＋ 补充
        </button>
        <div v-if="editingKey === 'contactPeople'" class="stable-add">
          <input
            v-model="custom.contactPeople"
            aria-label="补充重要的人和事"
            maxlength="80"
            @keydown.enter.prevent="add('contactPeople')"
          /><button type="button" @click="add('contactPeople')">添加</button>
        </div>
      </div>
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
      <p class="trust-note">这只是你自己记录过的判断，不是 AI 对你的结论。</p>
      <small v-if="currentId" class="version-note">最近保存：{{ new Date(updatedAt).toLocaleString('zh-CN') }}</small>
      <div class="stable-cta">
        <p v-if="needsConsent" class="consent-prompt" role="status">{{ needsConsent }}</p>
        <p v-else-if="error" class="error-note" role="alert">{{ error }}</p>
        <p v-if="saved" class="saved-note" role="status">{{ saved }}</p>
        <button class="stable-save" data-testid="stable-self-save" :disabled="saving" type="submit">
          {{ saving ? '正在保存…' : '保存记录' }}
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.stable-self-page {
  box-sizing: border-box;
  width: 100%;
  max-width: 430px;
  margin: 0 auto;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-x: hidden;
  /* Room for the fixed action bar and the floating tab bar, so the last section and the
     version note are never covered. */
  padding: 12px 16px calc(var(--gn-tabbar-reserve) + 120px + env(safe-area-inset-bottom));
  background: var(--gn-bg);
  color: var(--gn-text);
  font-family: var(--gn-font-body);
}

/* A stable bar with a bare chevron and the page title, then the page's own heading, per the design. */
.stable-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  margin: 0 -16px 4px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--gn-line);
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

.stable-bar-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--gn-ink);
}

/* The design's page heading and its one-line subtitle, under the bar. */
.stable-lead {
  margin: 16px 0 0;
}

.stable-lead h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--gn-ink);
}

.stable-lead p {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--gn-muted);
}

.stable-form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Sections are separated by whitespace, as the design does - a rule under every section added a line
   between the last field and the next heading that the mock does not have. */
.stable-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 0;
}

.section-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--gn-ink);
}

.stable-section textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 120px;
  resize: none;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  padding: 12px 14px;
  background: var(--gn-paper);
  color: var(--gn-ink);
  font: inherit;
  font-size: 14px;
  line-height: 1.6;
}

.stable-section textarea::placeholder {
  color: var(--gn-muted);
}

.option-rows {
  display: flex;
  flex-direction: column;
}

.option-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 0;
  padding: 12px 0;
  border: 0;
  /* The shared button rule rounds every button; on a full-width row it bows the hairline into an arc
     that reads as a card outline the design does not have. */
  border-radius: 0;
  border-bottom: 1px solid var(--gn-line);
  background: transparent;
  box-shadow: none;
  color: var(--gn-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

/* Every row keeps its closing hairline, including the last one: the design ends the list with a rule
   under the final row rather than leaving it open. */

.option-check {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  /* A visible border and a darker glyph. Without the border this was a near-white square on a white
     page, so an unchecked option read as decoration rather than as a control that can be tapped -
     measured on the emulator screenshot as a faint grey-blue block with no outline. */
  border: 1.5px solid var(--gn-line-strong, #c9ced6);
  border-radius: 10px;
  background: var(--gn-paper-warm);
  color: var(--gn-ink-soft);
  font-size: 16px;
  line-height: 1;
}

.option-label {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--gn-ink);
  overflow-wrap: anywhere;
}

.option-remove {
  flex-shrink: 0;
  border: 0;
  padding: 0 2px;
  background: transparent;
  color: var(--gn-muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.add-trigger {
  align-self: flex-start;
  border: 0;
  padding: 4px 0;
  background: transparent;
  color: var(--gn-leaf-deep);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.stable-add {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 56px;
  gap: 6px;
}

.stable-add input,
.daily-outline input {
  box-sizing: border-box;
  width: 100%;
  min-height: 40px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  padding: 8px 12px;
  background: var(--gn-paper);
  color: var(--gn-ink);
  font: inherit;
  font-size: 13px;
}

.stable-add button {
  border: 1px solid var(--gn-leaf);
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

/* The design's trust note: a bare muted block, no card border. */
.trust-note {
  margin: 0;
  border-radius: var(--gn-radius-card);
  padding: 12px 14px;
  background: var(--gn-paper-warm);
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.5;
}

.daily-outline {
  padding: 14px 0;
  border-bottom: 1px solid var(--gn-line);
}

.daily-outline summary {
  cursor: pointer;
  color: var(--gn-ink);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.35;
}

.daily-outline label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
  color: var(--gn-muted);
  font-size: 12px;
}

.saved-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.saved-tags button {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  padding: 0 10px;
  background: var(--gn-paper-warm);
  color: var(--gn-ink);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

/* In the flow, at the end of the form, as the design draws it. It used to be `position: fixed`,
   which floated the save bar over the middle of the list while scrolling - the reviewer saw the
   first practice row cut in half behind it. No rule above it: the design separates the button from
   the content with whitespace. */
.stable-cta {
  display: grid;
  gap: 8px;
  justify-items: center;
  margin-top: 20px;
  padding: 0;
  background: var(--gn-bg);
}

.stable-cta > * {
  width: 100%;
  max-width: 398px;
}

/* The design's primary action spans the bar. */
.stable-save {
  min-height: 52px;
  border: 0;
  border-radius: var(--gn-radius-card);
  background: var(--gn-leaf);
  color: #fff;
  font: inherit;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

.stable-save:disabled {
  opacity: 0.6;
  cursor: wait;
}

.state-note,
.error-note,
.saved-note {
  margin: 0;
  border-radius: var(--gn-radius-card);
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
}

.state-note {
  background: var(--gn-paper-warm);
  color: var(--gn-muted);
}

.error-note {
  background: var(--gn-paper-warm);
  color: var(--gn-danger);
}

.saved-note {
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
}

/* A consent prompt is information, not a failure. Green-family rather than red, so the page does not
   look broken when the user simply has not allowed saving yet. */
.consent-prompt {
  background: var(--gn-paper-warm);
  color: var(--gn-leaf-deep);
}

.version-note {
  display: block;
  color: var(--gn-muted);
  text-align: center;
  font-size: 11px;
}

@media (max-width: 374px) {
  .stable-self-page {
    padding-left: 12px;
    padding-right: 12px;
  }

  .stable-bar {
    margin-left: -12px;
    margin-right: -12px;
    padding-left: 12px;
    padding-right: 12px;
  }

  .stable-cta {
    padding-left: 12px;
    padding-right: 12px;
  }
}
</style>
