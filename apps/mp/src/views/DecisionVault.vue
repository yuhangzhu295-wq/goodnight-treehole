<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import AppIcon from '../components/icons/AppIcon.vue';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

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

/**
 * Whether the composer is open. Closed by default: the list is the page, and a returning user should
 * see their decisions before a blank form.
 */
const composerOpen = ref(false);
function toggleComposer() {
  composerOpen.value = !composerOpen.value;
}
/**
 * Tapping the summary opens the panel without going through the button, so `composerOpen` has to
 * follow the element itself. Without this the label drifted: open by summary, tap the button, and
 * the panel stayed open while the button offered to close it.
 */
function onComposerToggle(event: Event) {
  composerOpen.value = (event.target as HTMLDetailsElement).open;
}

/**
 * The lifecycle stages, in the order a decision moves through them. `all` is not a real status - it
 * is the unfiltered view, listed first because it is what a returning user wants.
 */
type DecisionTab = 'all' | DecisionStatus;
const activeTab = ref<DecisionTab>('all');
const TAB_LABELS: Record<DecisionTab, string> = {
  all: '全部',
  draft: '考虑中',
  cooling: '冷静中',
  ready: '冷静结束',
  decided: '已决定',
  // Archived records live in their own section rather than a tab, so this label is never shown.
  archived: '已归档',
};
const statusTabs = computed(() => {
  const count = (key: DecisionTab) =>
    key === 'all' ? activeItems.value.length : activeItems.value.filter((item) => item.status === key).length;
  return (['all', 'draft', 'cooling', 'ready', 'decided'] as DecisionTab[])
    .filter((key) => key === 'all' || count(key) > 0)
    .map((key) => ({ key, label: TAB_LABELS[key], count: count(key) }));
});
const visibleItems = computed(() =>
  activeTab.value === 'all' ? activeItems.value : activeItems.value.filter((item) => item.status === activeTab.value),
);

/**
 * The design's three named groups. A status tab narrows `visibleItems` first, so filtering to one
 * status leaves exactly one group; the unfiltered view shows all three at once, which is the layout
 * the design draws.
 */
const groupedSections = computed(() =>
  [
    { key: 'considering', title: '考虑中的事', items: visibleItems.value.filter((item) => item.status === 'draft' || item.status === 'ready') },
    { key: 'cooling', title: '冷静中的事', items: visibleItems.value.filter((item) => item.status === 'cooling') },
    { key: 'decided', title: '以前做过的决定', items: visibleItems.value.filter((item) => item.status === 'decided') },
  ].filter((group) => group.items.length),
);

/** Purely presentational: which leading icon a record draws for its real status. */
const statusIcon: Record<DecisionStatus, string> = {
  draft: 'bookmark',
  cooling: 'clock',
  ready: 'spark',
  decided: 'check-circle',
  archived: 'bookmark',
};

function reasonOf(item: DecisionItem) {
  return item.criteria.find((part) => !part.startsWith('情绪强度:')) ?? '给自己一点时间，再回来看看。';
}

/** `今天` / `昨天` / `10月7日`, the day form the design's meta line uses. */
function shortDay(value?: string) {
  const date = new Date(value ?? '');
  if (Number.isNaN(date.getTime())) return '某天';
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(date)) / 86_400_000);
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * The row's one meta line, in the design's voice: when it was written and what state it is in. The
 * separate intensity chip and countdown pill said the same thing in two more places.
 */
function rowMeta(item: DecisionItem) {
  if (item.status === 'draft') return `记录于${shortDay(item.createdAt)} · 还没有作决定`;
  if (item.status === 'cooling') return `记录于${shortDay(item.createdAt)} · ${cooldownText(item)}`;
  if (item.status === 'ready') return '冷静时间已结束 · 等你确认';
  if (item.status === 'decided') return `上次更新 · ${shortDay(item.reviewedAt ?? item.createdAt)}`;
  return '';
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
    error.value = cause?.message ?? '决定记录暂时没有打开';
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
    // Close on success so the record the user just created is what they see next, not an empty form.
    composerOpen.value = false;
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
  <main class="goodnight-page decision-page">
    <header class="decision-bar">
      <button class="back-btn" type="button" aria-label="返回" @click="router.back()">
        <AppIcon name="back" :size="20" />
      </button>
      <h1 class="decision-bar-title">重要决定</h1>
    </header>

    <section class="decision-content">
      <!--
        The composer is an action you open, not the page. It used to fill the first screen, so a
        returning user with records had to scroll past a form to reach them. `open` keeps it collapsed
        until asked for, and `open` is also what the "新增决定" button toggles.
      -->
      <details class="decision-composer-wrap" :open="composerOpen" data-testid="decision-composer" @toggle="onComposerToggle">
        <summary class="composer-summary">
          <span class="composer-summary-title">新增决定</span>
          <span class="composer-summary-hint">写下正在考虑的事，设一段冷静时间</span>
        </summary>
        <form class="decision-composer" @submit.prevent="saveForLater">
        <h2 class="composer-heading">暂存决定</h2>
        <label class="quote-field">
          <span class="sr-only">想做的决定</span>
          <textarea v-model="draft.question" data-testid="decision-question" maxlength="400" placeholder="记录你正在考虑的决定或冲动想法…" />
        </label>

        <label class="line-field">
          <span class="field-icon" aria-hidden="true">◈</span>
          <span class="field-body"><strong>为什么现在想做</strong><input v-model="draft.reason" data-testid="decision-reason" maxlength="400" placeholder="当前最担心什么，或最想确认什么？" /></span>
        </label>

        <div class="line-field intensity-row">
          <span class="field-icon" aria-hidden="true">⌁</span>
          <span class="field-body"><strong>当前情绪强度</strong><small>{{ draft.intensity }}/10</small></span>
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
          <button class="primary-action" type="submit" data-testid="decision-submit" :disabled="busyId === 'create'">
            {{ busyId === 'create' ? '正在保存…' : '存入冷静箱' }}
          </button>
          <button class="secondary-action" type="button" @click="draft.question = draft.question ? `${draft.question}\n我能先做的更小一步是：` : '我能先做的更小一步是：'">
            细化更小一步
          </button>
        </div>
      </form>
      </details>

      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      <LoadErrorBanner :message="error" retry-label="重新加载" @retry="load" />
      <p v-if="loading" class="loading">正在打开冷静箱…</p>

      <section v-if="activeItems.length" class="saved-section">
        <div class="list-head">
          <button class="add-trigger" type="button" data-testid="decision-add" @click="toggleComposer">
            {{ composerOpen ? '收起' : '＋ 新增决定' }}
          </button>
        </div>
        <!--
          The design's tabs are text with an underline, and its list is organised into three named
          groups (考虑中 / 冷静中 / 以前做过的决定) rather than one flat stream. Both are kept: the tabs
          narrow to one status, and the list is always grouped, so the composite view the design shows
          is what 全部 renders.
        -->
        <div class="status-tabs" role="tablist" aria-label="决定状态">
          <button
            v-for="tab in statusTabs"
            :key="tab.key"
            type="button"
            role="tab"
            class="status-tab"
            :class="{ active: activeTab === tab.key }"
            :aria-selected="activeTab === tab.key"
            :data-testid="'decision-tab-' + tab.key"
            @click="activeTab = tab.key"
          >
            {{ tab.label }} <b>{{ tab.count }}</b>
          </button>
        </div>
        <div class="saved-list">
          <section v-for="group in groupedSections" :key="group.key" class="decision-group">
            <h3 class="decision-group-title">{{ group.title }}</h3>
            <article
              v-for="item in group.items"
              :key="item.id"
              class="saved-item"
              :data-status="item.status"
              :data-testid="'decision-item-' + item.id"
            >
              <span class="item-icon" aria-hidden="true"><AppIcon :name="statusIcon[item.status]" :size="18" /></span>
              <div class="saved-copy">
                <strong class="item-question">{{ item.question }}</strong>
                <span class="item-reason">{{ reasonOf(item) }}</span>
                <span class="item-meta">{{ rowMeta(item) }}</span>
                <template v-if="item.status === 'ready'">
                  <textarea v-model="answers[item.id].decision" maxlength="400" placeholder="记录你当前的决定…" />
                  <textarea v-model="answers[item.id].outcome" maxlength="800" placeholder="后续结果或补充说明（可选）" />
                  <button class="item-action" type="button" :disabled="busyId === item.id" @click="decide(item)">确认这个决定</button>
                </template>
                <template v-else-if="item.status === 'decided'">
                  <p class="own-decision">{{ item.decision }}</p>
                  <textarea v-model="answers[item.id].outcome" maxlength="800" placeholder="后来发生了什么？可在归档前补充。" />
                  <button class="item-action ghost" type="button" :disabled="busyId === item.id" @click="archive(item)">保存结果并归档</button>
                </template>
                <button v-if="item.status === 'draft'" class="item-action" type="button" :disabled="busyId === item.id" @click="resumeDraft(item)">开始 24 小时冷静期</button>
              </div>
            </article>
          </section>
        </div>
      </section>

      <!--
        With no records the page used to show nothing at all below the folded composer, so a new user saw a
        page with no way in. The empty state opens the composer instead.
        `!error` matters: a failed load leaves `items` empty too, and saying "还没有决定记录" then asserts
        something the page does not know. On failure the banner above is the whole message.
      -->
      <section v-if="!activeItems.length && !loading && !error" class="saved-section empty-state" data-testid="decision-empty">
        <h2 class="section-title">还没有决定记录</h2>
        <p>把正在考虑的事写下来，设一段冷静时间，再回来确认。</p>
        <button class="add-trigger" type="button" data-testid="decision-empty-add" @click="composerOpen = true">
          ＋ 写下第一个决定
        </button>
      </section>

      <details v-if="archivedItems.length" class="archive-section">
        <summary>已归档的决定（{{ archivedItems.length }}）</summary>
        <article v-for="item in archivedItems" :key="item.id" class="archive-item">
          <strong>{{ item.question }}</strong>
          <p>{{ item.decision }}</p>
          <small v-if="item.outcome">后续记录：{{ item.outcome }}</small>
        </article>
      </details>

      <div class="boundary-note" data-testid="decision-boundary">
        <p>应用只保存思考过程，决定始终由你自己作出。</p>
        <small>提供冷静期缓冲与记录辅助，不替代法律、医疗或财务专业建议。</small>
      </div>
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
  overflow-x: hidden;
  /* /pages/decision/index carries no floating tab bar, so the page only reserves the safe area. */
  padding: 12px 16px calc(32px + env(safe-area-inset-bottom));
  background: var(--gn-bg);
  color: var(--gn-text);
  font-family: var(--gn-font-body);
}

/* The V2 bar: a bare chevron and the page title, closed by a hairline. */
.decision-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 56px;
  margin: 0 -16px;
  padding: 8px 16px;
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
  background: transparent;
  color: var(--gn-ink);
  cursor: pointer;
  flex-shrink: 0;
}

.decision-bar-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--gn-ink);
}

/* The design puts no subtitle under the bar: the list is the page. */
.decision-content {
  display: flex;
  flex-direction: column;
}

/* Sections are bare blocks closed by a hairline, not bordered cards. */
/*
 * The composer is folded by default: a summary line, opened on demand. It used to be a full form
 * occupying the first screen ahead of the records.
 */
.decision-composer-wrap {
  padding: 14px 0 4px;
  border-bottom: 1px solid var(--gn-line);
}

.composer-summary {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-height: 40px;
  cursor: pointer;
  list-style: none;
}

.composer-summary::-webkit-details-marker {
  display: none;
}

.composer-summary-title {
  color: var(--gn-ink);
  font-size: 15px;
  font-weight: 650;
}

.composer-summary-hint {
  color: var(--gn-muted);
  font-size: 12px;
}

.decision-composer-wrap[open] .composer-summary {
  margin-bottom: 6px;
}

.decision-composer,
.saved-section,
.archive-section {
  display: flex;
  flex-direction: column;
  padding: 18px 0 16px;
  border-bottom: 1px solid var(--gn-line);
}

/* The list header carries only the add action: the page title already says what the list is. */
.list-head {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.add-trigger {
  min-height: 34px;
  padding: 7px 12px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper);
  color: var(--gn-leaf-deep);
  font-size: 12.5px;
  font-weight: 600;
}

/* Lifecycle tabs over the real statuses, as text with an underline - the design's form, not chips. */
.status-tabs {
  display: flex;
  gap: 18px;
  margin: 10px 0 0;
  padding-bottom: 2px;
  overflow-x: auto;
  border-bottom: 1px solid var(--gn-line);
  scrollbar-width: none;
}

.status-tabs::-webkit-scrollbar {
  display: none;
}

.status-tab {
  flex: 0 0 auto;
  min-height: 38px;
  padding: 6px 0;
  border: 0;
  /* The shared button rule rounds buttons, which bows the underline into an arc. */
  border-radius: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  box-shadow: none;
  color: var(--gn-muted);
  font-size: 13px;
}

.status-tab.active {
  border-bottom-color: var(--gn-leaf);
  color: var(--gn-leaf-deep);
  font-weight: 650;
}

.status-tab b {
  font-size: 11px;
  font-weight: 700;
}

.empty-state {
  align-items: flex-start;
  gap: 8px;
}

.empty-state p {
  margin: 0;
  color: var(--gn-muted);
  font-size: 12.5px;
  line-height: 1.6;
}

.composer-heading,
.section-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.35;
  color: var(--gn-ink);
}

.section-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--gn-muted);
  line-height: 1.5;
}

.quote-field {
  display: block;
  margin: 12px 0 0;
}

.quote-field textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 76px;
  resize: none;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper);
  padding: 10px 12px;
  color: var(--gn-ink);
  font: inherit;
  font-size: 14px;
  line-height: 1.6;
}

/* One control per row, separated by hairlines. */
.line-field {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-height: 48px;
  border-bottom: 1px solid var(--gn-line);
  padding: 6px 0;
}

.field-icon {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--gn-paper-warm);
  color: var(--gn-leaf);
  font-size: 12px;
  line-height: 1;
}

.field-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.line-field strong,
.cooldown-field legend {
  font-size: 13px;
  font-weight: 600;
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
  grid-template-columns: 24px 92px minmax(0, 1fr);
  gap: 8px;
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
  margin: 14px 0 0;
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
  height: 38px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper);
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
  margin: 14px 0 0;
  padding: 10px 12px;
  border: 0;
  border-radius: 10px;
  background: var(--gn-paper-warm);
  color: var(--gn-muted);
  font-size: 12px;
  line-height: 1.5;
}

.composer-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 14px;
}

.composer-actions button,
.item-action {
  min-height: 44px;
  border-radius: var(--gn-radius-small);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.primary-action {
  border: 0;
  background: var(--gn-leaf);
  color: #fff;
}

.secondary-action {
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
  color: var(--gn-ink);
}

.notice,
.loading {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--gn-paper-warm);
  font-size: 13px;
  line-height: 1.5;
}

.notice {
  color: var(--gn-leaf-deep);
}

.loading {
  color: var(--gn-muted);
  text-align: center;
}

.saved-list {
  display: flex;
  flex-direction: column;
}

.decision-group {
  display: block;
}

/* The group names the state once; the rows below do not repeat it as a pill. */
.decision-group-title {
  margin: 20px 0 0;
  color: var(--gn-ink);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
}

/* A record is an icon tile plus its copy, closed by a hairline. */
.saved-item {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  padding: 14px 0;
  border-bottom: 1px solid var(--gn-line);
}

.saved-item:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.item-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--gn-paper-warm);
  color: var(--gn-ink-soft);
}

/* The two states that are still waiting on the user carry the leaf colour. */
.saved-item[data-status='cooling'] .item-icon,
.saved-item[data-status='ready'] .item-icon {
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
}

.saved-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.item-question {
  font-size: 16px;
  font-weight: 700;
  color: var(--gn-ink);
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.item-reason {
  font-size: 13px;
  color: var(--gn-muted);
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.item-meta {
  font-size: 12px;
  color: var(--gn-muted);
}

.saved-copy textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 56px;
  resize: none;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper);
  padding: 8px 10px;
  color: var(--gn-ink);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
}

.item-action {
  align-self: flex-start;
  min-height: 40px;
  padding: 0 16px;
  border: 0;
  background: var(--gn-leaf);
  color: #fff;
}

.item-action.ghost {
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
  color: var(--gn-ink);
}

.own-decision {
  margin: 2px 0;
  padding: 8px 12px;
  border-left: 3px solid var(--gn-leaf);
  border-radius: 0 var(--gn-radius-small) var(--gn-radius-small) 0;
  background: var(--gn-paper-warm);
  font-size: 13px;
  line-height: 1.6;
  color: var(--gn-ink);
  overflow-wrap: anywhere;
}

.archive-section summary {
  cursor: pointer;
  color: var(--gn-ink);
  font-size: 15px;
  font-weight: 700;
}

.archive-item {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--gn-line);
  font-size: 13px;
}

.archive-item strong {
  display: block;
  font-size: 14px;
  color: var(--gn-ink);
}

.archive-item p {
  margin: 4px 0;
  color: var(--gn-ink-soft);
  font-size: 13px;
  line-height: 1.5;
}

.archive-item small {
  color: var(--gn-muted);
  font-size: 12px;
}

/* The closing note, as the soft filled block the design shows. */
.boundary-note {
  margin: 16px 0 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--gn-paper-warm);
  color: var(--gn-muted);
  font-size: 12px;
  line-height: 1.6;
  text-align: left;
}

.boundary-note p {
  margin: 0;
  color: var(--gn-ink-soft);
  font-size: 12.5px;
}

.boundary-note small {
  display: block;
  margin-top: 5px;
  color: var(--gn-muted);
  font-size: 11px;
  line-height: 1.5;
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
    padding-right: 12px;
    padding-left: 12px;
  }

  .decision-bar {
    margin-right: -12px;
    margin-left: -12px;
    padding-right: 12px;
    padding-left: 12px;
  }
}
</style>
