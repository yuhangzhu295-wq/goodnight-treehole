<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, resolveApiUrl } from '../api';
import AppIcon from '../components/icons/AppIcon.vue';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

type ArchiveTab = 'diary' | 'post' | 'letter' | 'journey';
type TimeScope = 'all' | 'week' | 'month';

const router = useRouter();
const activeTab = ref<ArchiveTab>('diary');
const scope = ref<TimeScope>('all');
const diaries = ref<any[]>([]);
const posts = ref<any[]>([]);
const letters = ref<any[]>([]);
const journeys = ref<any[]>([]);
const selectedJourney = ref<any>();
const actionJourney = ref<any>();
const confirmDelete = ref(false);
const loading = ref(false);
const busy = ref(false);
const error = ref('');

const tabs: Array<{ key: ArchiveTab; label: string }> = [
  { key: 'diary', label: '私密日记' },
  { key: 'post', label: '公开树洞' },
  { key: 'letter', label: '树洞回信' },
];

function itemDate(item: any) {
  return String(item?.updatedAt ?? item?.createdAt ?? '');
}

function isInScope(item: any) {
  if (scope.value === 'all') return true;
  const timestamp = Date.parse(itemDate(item));
  if (!Number.isFinite(timestamp)) return false;
  const days = scope.value === 'week' ? 7 : 31;
  return timestamp >= Date.now() - days * 86_400_000;
}

const filteredDiaries = computed(() => diaries.value.filter(isInScope));
const filteredPosts = computed(() => posts.value.filter(isInScope));
const filteredLetters = computed(() => letters.value.filter(isInScope));
const filteredJourneys = computed(() => journeys.value.filter((item) => isInScope(item.journey)));

type MonthEntry = { item: any; index: number };
type MonthGroup = { key: string; label: string; entries: MonthEntry[] };

// Time grouping for the list view. The month label is derived from the same timestamp the row
// prints, so a row never sits under a month it does not belong to. `index` is the position in the
// filtered list (not inside the group) so the "…-first" testids keep pointing at the first row.
function groupByMonth(items: any[], dateOf: (item: any) => string): MonthGroup[] {
  const groups: MonthGroup[] = [];
  const byKey = new Map<string, MonthGroup>();
  items.forEach((item, index) => {
    const date = new Date(dateOf(item) ?? '');
    const valid = !Number.isNaN(date.getTime());
    const key = valid ? `${date.getFullYear()}-${date.getMonth() + 1}` : 'unknown';
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        label: valid ? `${date.getFullYear()}年${date.getMonth() + 1}月` : '时间未记录',
        entries: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.entries.push({ item, index });
  });
  return groups;
}

const diaryGroups = computed(() => groupByMonth(filteredDiaries.value, (item) => item?.createdAt ?? ''));
const postGroups = computed(() => groupByMonth(filteredPosts.value, (item) => item?.createdAt ?? ''));
const letterGroups = computed(() => groupByMonth(filteredLetters.value, (item) => item?.createdAt ?? ''));
const journeyGroups = computed(() => groupByMonth(filteredJourneys.value, (item) => item?.endedAt ?? ''));

function dateLabel(value?: string) {
  const date = new Date(value ?? '');
  if (Number.isNaN(date.getTime())) return '时间未记录';
  const now = new Date();
  const day = date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return date.toDateString() === now.toDateString() ? `今天 ${time}` : `${day} ${time}`;
}

function diaryPreview(item: any) {
  return String(item?.content ?? '这篇日记还没有内容。').replace(/\s+/g, ' ').slice(0, 76);
}

function postPreview(item: any) {
  return String(item?.content ?? item?.text ?? '这则树洞还没有内容。').replace(/\s+/g, ' ').slice(0, 76);
}

function letterPreview(item: any) {
  return String(item?.content ?? '这封回信还没有内容。').replace(/\s+/g, ' ').slice(0, 76);
}

function journeyPreview(item: any) {
  const facts = Array.isArray(item?.happened) ? item.happened.filter(Boolean) : [];
  return facts.join('；') || item?.journey?.summary || '这段经历的过程被完整保留在这里。';
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [diaryResult, postResult, letterResult, journeyResult] = await Promise.all([
      api.get<any>('/api/v1/diaries'),
      api.get<any>('/api/v1/posts'),
      api.get<any>('/api/v1/letters'),
      api.get<any>('/api/v1/archive/journeys'),
    ]);
    diaries.value = diaryResult.items ?? [];
    posts.value = postResult.items ?? [];
    letters.value = letterResult.items ?? [];
    journeys.value = journeyResult.items ?? [];
  } catch (cause: any) {
    error.value = cause?.message ?? '内容档案暂时没有打开';
  } finally {
    loading.value = false;
  }
}

async function selectTab(tab: ArchiveTab) {
  activeTab.value = tab;
  if (tab === 'journey' && !journeys.value.length) await load();
}

function openDiary(item: any) {
  router.push(`/pages/diary/detail?id=${encodeURIComponent(item.id)}`);
}

function openPost(item: any) {
  router.push(`/pages/post/detail?id=${encodeURIComponent(item.id)}`);
}

function openLetter(item: any) {
  router.push(`/pages/letter/detail?id=${encodeURIComponent(item.id)}`);
}

async function openJourney(item: any) {
  error.value = '';
  try {
    selectedJourney.value = (await api.get<any>(`/api/v1/archive/journeys/${encodeURIComponent(item.journey.id)}`)).item;
  } catch (cause: any) {
    error.value = cause?.message ?? '归档详情暂时没有打开';
  }
}

function openActions(item: any) {
  actionJourney.value = item;
  confirmDelete.value = false;
  error.value = '';
}

async function restoreJourney() {
  if (!actionJourney.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const journeyId = String(actionJourney.value.journey.id);
    await api.post(`/api/v1/archive/journeys/${encodeURIComponent(journeyId)}/restore`, {});
    actionJourney.value = undefined;
    selectedJourney.value = undefined;
    await load();
    await router.push(`/pages/journey/detail?id=${encodeURIComponent(journeyId)}`);
  } catch (cause: any) {
    error.value = cause?.message ?? '恢复这段旅程没有成功';
  } finally {
    busy.value = false;
  }
}

async function exportJourney() {
  if (!actionJourney.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const response = await api.post<any>(
      `/api/v1/archive/journeys/${encodeURIComponent(actionJourney.value.journey.id)}/export`,
      {},
    );
    const link = document.createElement('a');
    link.href = resolveApiUrl(response.item.downloadUrl);
    link.download = response.item.asset?.filename ?? 'goodnight-treehole-journey-archive.json';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (cause: any) {
    error.value = cause?.message ?? '归档导出没有成功';
  } finally {
    busy.value = false;
  }
}

async function deleteJourney() {
  if (!actionJourney.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api.delete(`/api/v1/archive/journeys/${encodeURIComponent(actionJourney.value.journey.id)}`, {
      confirmation: 'DELETE_ARCHIVE',
    });
    actionJourney.value = undefined;
    selectedJourney.value = undefined;
    confirmDelete.value = false;
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '归档删除没有成功';
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="goodnight-page archive-page">
    <header class="archive-bar">
      <button class="back-btn" type="button" aria-label="返回" @click="router.back()">
        <AppIcon name="back" :size="20" />
      </button>
      <h1 class="archive-bar-title">日记与回信</h1>
    </header>

    <p class="archive-lead">把你写下的话，和树洞回答你的话，都留在这里。</p>

    <div class="archive-tabs" role="tablist" aria-label="内容分类">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :data-testid="`archive-tab-${tab.key}`"
        :class="{ active: activeTab === tab.key }"
        role="tab"
        :aria-selected="activeTab === tab.key"
        @click="selectTab(tab.key)"
      >
        {{ tab.label }}
      </button>
      <button
        class="archive-journey-entry"
        data-testid="archive-tab-journey"
        role="tab"
        :aria-selected="activeTab === 'journey'"
        :class="{ active: activeTab === 'journey' }"
        @click="selectTab('journey')"
      >
        旅程归档 <small>{{ journeys.length }} 段</small>
      </button>
    </div>

    <div class="archive-scopes" aria-label="时间范围">
      <button v-for="item in ([['all', '全部'], ['week', '本周'], ['month', '本月']] as const)" :key="item[0]" :data-testid="`archive-scope-${item[0]}`" :class="{ active: scope === item[0] }" @click="scope = item[0]">{{ item[1] }}</button>
      <button class="archive-filter" data-testid="archive-filter-reset" aria-label="重置时间筛选" @click="scope = 'all'">▽</button>
    </div>

    <LoadErrorBanner :message="error" retry-label="重新加载" @retry="load" />
    <p v-if="loading" class="archive-loading">正在读取你已经保存的内容…</p>

    <div v-if="activeTab === 'diary' && !loading" class="archive-list">
      <section v-for="group in diaryGroups" :key="group.key" class="archive-group">
        <h2 class="archive-group-title">{{ group.label }}</h2>
        <article v-for="entry in group.entries" :key="entry.item.id" class="archive-row">
          <button class="archive-row-main" :data-testid="entry.index === 0 ? 'archive-diary-first' : `archive-diary-${entry.item.id}`" @click="openDiary(entry.item)">
            <span class="archive-row-icon" aria-hidden="true">▤</span>
            <span class="archive-row-copy"><strong>{{ diaryPreview(entry.item) }}</strong><small>{{ entry.item.emotionLabel ?? entry.item.emotion ?? '心情记录' }} · {{ dateLabel(entry.item.createdAt) }}</small></span>
            <AppIcon name="chevron-right" :size="18" class="archive-row-chevron" />
          </button>
          <button v-if="entry.item.hasLetter" class="archive-row-chip" :data-testid="entry.index === 0 ? 'archive-diary-letter-first' : undefined" @click="openLetter(entry.item)">树洞回信 {{ entry.item.letterId ? '1 条' : '' }} ›</button>
        </article>
      </section>
      <article v-if="!filteredDiaries.length" class="archive-empty"><strong>这个时间范围里还没有私密日记</strong><p>写下的内容会在这里按真实时间出现。</p></article>
    </div>

    <div v-else-if="activeTab === 'post' && !loading" class="archive-list">
      <section v-for="group in postGroups" :key="group.key" class="archive-group">
        <h2 class="archive-group-title">{{ group.label }}</h2>
        <article v-for="entry in group.entries" :key="entry.item.id" class="archive-row">
          <button class="archive-row-main" :data-testid="entry.index === 0 ? 'archive-post-first' : `archive-post-${entry.item.id}`" @click="openPost(entry.item)">
            <span class="archive-row-icon" aria-hidden="true">☼</span>
            <span class="archive-row-copy"><strong>{{ postPreview(entry.item) }}</strong><small>{{ entry.item.emotion ?? '公开树洞' }} · {{ dateLabel(entry.item.createdAt) }}</small></span>
            <AppIcon name="chevron-right" :size="18" class="archive-row-chevron" />
          </button>
        </article>
      </section>
      <article v-if="!filteredPosts.length" class="archive-empty"><strong>这个时间范围里还没有公开树洞</strong><p>这里只显示真实发布并可查看的内容。</p></article>
    </div>

    <div v-else-if="activeTab === 'letter' && !loading" class="archive-list">
      <section v-for="group in letterGroups" :key="group.key" class="archive-group">
        <h2 class="archive-group-title">{{ group.label }}</h2>
        <article v-for="entry in group.entries" :key="entry.item.id" class="archive-row">
          <button class="archive-row-main" :data-testid="entry.index === 0 ? 'archive-letter-first' : `archive-letter-${entry.item.id}`" @click="openLetter(entry.item)">
            <span class="archive-row-icon" aria-hidden="true">☾</span>
            <span class="archive-row-copy"><strong>{{ entry.item.title || '给现在的你' }}</strong><p>{{ letterPreview(entry.item) }}</p><small>{{ dateLabel(entry.item.createdAt) }}</small></span>
            <AppIcon name="chevron-right" :size="18" class="archive-row-chevron" />
          </button>
        </article>
      </section>
      <article v-if="!filteredLetters.length" class="archive-empty"><strong>这个时间范围里还没有回信</strong><p>当你收到真实回信，它会在这里保存。</p></article>
    </div>

    <div v-else-if="activeTab === 'journey' && !loading" class="archive-list">
      <section v-for="group in journeyGroups" :key="group.key" class="archive-group">
        <h2 class="archive-group-title">{{ group.label }}</h2>
        <article v-for="entry in group.entries" :key="entry.item.journey.id" class="archive-row">
          <button class="archive-row-main" :data-testid="entry.index === 0 ? 'archive-journey-first' : `archive-journey-${entry.item.journey.id}`" @click="openJourney(entry.item)">
            <span class="archive-row-icon" aria-hidden="true">⌁</span>
            <span class="archive-row-copy"><strong>{{ entry.item.journey.title }}</strong><p>{{ journeyPreview(entry.item) }}</p><small>{{ entry.item.journey.status === 'completed' ? '已完成' : '已归档' }} · {{ entry.item.actionStats.completed }} 次完成 · {{ entry.item.actionStats.adjusted }} 次调整 · {{ dateLabel(entry.item.endedAt) }}</small></span>
            <AppIcon name="chevron-right" :size="18" class="archive-row-chevron" />
          </button>
          <button class="archive-row-actions" :data-testid="entry.index === 0 ? 'archive-journey-actions-first' : undefined" aria-label="归档操作" @click="openActions(entry.item)">···</button>
        </article>
      </section>
      <article v-if="!filteredJourneys.length" class="archive-empty"><strong>这个时间范围里还没有旅程归档</strong><p>完成或手动归档后的 Journey 会在这里完整回看。</p></article>
    </div>

    <div v-if="selectedJourney" class="sheet-mask archive-overlay" data-testid="archive-detail-sheet">
      <section class="sheet archive-detail-sheet">
        <div class="sheet-handle" aria-hidden="true"></div>
        <div class="archive-detail-head"><div><p>{{ selectedJourney.journey.status === 'completed' ? '已完成旅程' : '已归档旅程' }}</p><h2>{{ selectedJourney.journey.title }}</h2></div><button data-testid="archive-detail-close" aria-label="关闭归档详情" @click="selectedJourney = undefined">×</button></div>
        <section class="archive-detail-block"><h3>当时发生了什么</h3><p>{{ selectedJourney.happened?.join('；') || selectedJourney.journey.summary || '没有补充文字记录。' }}</p><dl><div><dt>主观强度</dt><dd>{{ selectedJourney.snapshot?.intensity ?? selectedJourney.journey.intensity ?? '未记录' }}</dd></div><div><dt>需要的支持</dt><dd>{{ selectedJourney.supportIntent || '未选择' }}</dd></div><div><dt>结束时间</dt><dd>{{ dateLabel(selectedJourney.endedAt) }}</dd></div></dl></section>
        <section class="archive-detail-block"><h3>行动与调整</h3><p>完成 {{ selectedJourney.actionStats.completed }}/{{ selectedJourney.actionStats.total }} 次行动；{{ selectedJourney.actionStats.missed }} 次未完成；{{ selectedJourney.actionStats.adjusted }} 次调整。</p><ul><li v-for="action in selectedJourney.actions" :key="action.id"><span>{{ action.title }}</span><small>{{ action.status }}</small></li></ul></section>
        <section class="archive-detail-block"><h3>支持与后来</h3><p>同路匹配 {{ selectedJourney.peerSupport.matchCount }} 次，匿名会话 {{ selectedJourney.peerSupport.conversationCount }} 次，恢复记录 {{ selectedJourney.recovery.length }} 次，决定记录 {{ selectedJourney.decisions.length }} 条。</p><ol><li v-for="entry in selectedJourney.timeline" :key="entry.id"><time>{{ dateLabel(entry.createdAt) }}</time><span>{{ entry.content }}</span></li></ol></section>
        <button class="primary archive-detail-actions" data-testid="archive-detail-actions" @click="openActions(selectedJourney)">管理这段归档</button>
      </section>
    </div>

    <div v-if="actionJourney" class="sheet-mask archive-overlay" data-testid="archive-actions-sheet">
      <section class="sheet archive-action-sheet">
        <div class="sheet-handle" aria-hidden="true"></div>
        <h2>{{ actionJourney.journey.title }}</h2>
        <p>{{ actionJourney.journey.status === 'archived' ? '恢复会把它带回当前 Journey。' : '已完成的 Journey 保留为完整历史，不能恢复为进行中。' }}</p>
        <button v-if="actionJourney.journey.status === 'archived'" class="archive-action-main" data-testid="archive-restore" :disabled="busy" @click="restoreJourney">恢复到当前旅程</button>
        <button class="archive-action-main" data-testid="archive-export" :disabled="busy" @click="exportJourney">导出这段归档</button>
        <button class="archive-action-danger" data-testid="archive-delete-start" :disabled="busy" @click="confirmDelete = true">删除这段归档</button>
        <button class="archive-action-cancel" @click="actionJourney = undefined">取消</button>
      </section>
    </div>

    <div v-if="confirmDelete" class="modal archive-confirm" data-testid="archive-delete-confirm">
      <section class="archive-confirm-card">
        <h2>确认删除这段归档？</h2>
        <p>旅程时间线、行动与回访会被删除。独立保存的日记、回信和未来信件仍会保留。</p>
        <div><button data-testid="archive-delete-cancel" @click="confirmDelete = false">再想想</button><button class="danger" data-testid="archive-delete-confirm" :disabled="busy" @click="deleteJourney">确认删除</button></div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.archive-page { display: block; box-sizing: border-box; width: 100%; max-width: 100%; overflow-x: hidden; min-height: 100vh; padding: 0 16px calc(var(--gn-tabbar-reserve) + 24px + env(safe-area-inset-bottom)); background: var(--gn-bg); color: var(--gn-ink); font-family: var(--gn-font-body); }
.archive-page * { box-sizing: border-box; }

/* The V2 bar: a bare chevron and the page title, closed by a full-bleed hairline. */
.archive-bar { display: flex; align-items: center; gap: 8px; min-height: 56px; margin: 0 -16px; padding: 8px 16px; border-bottom: 1px solid var(--gn-line); }
.back-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; min-height: 30px; padding: 0; border: 0; background: transparent; color: var(--gn-ink); cursor: pointer; flex-shrink: 0; }
.archive-bar-title { margin: 0; font-size: 24px; font-weight: 700; line-height: 1.25; color: var(--gn-ink); }

/* The page's own subtitle, as content under the bar instead of inside it. */
.archive-lead { margin: 14px 0 0; font-size: 13px; line-height: 1.5; color: var(--gn-muted); }

/* Content-type chips: bare pills, the active one tinted leaf — not a bordered card. */
.archive-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 0; }
.archive-tabs button { min-height: 34px; padding: 6px 12px; border: 1px solid var(--gn-line); border-radius: var(--gn-radius-pill); background: transparent; box-shadow: none; color: var(--gn-ink-soft); font-size: 12px; white-space: nowrap; }
.archive-tabs button.active { border-color: var(--gn-leaf); background: var(--gn-leaf-soft); color: var(--gn-leaf); font-weight: 700; }
.archive-tabs .archive-journey-entry { display: inline-flex; align-items: center; gap: 4px; }
.archive-journey-entry small { color: inherit; font-size: 11px; opacity: .75; }

/* The page's real time filter, kept as a second chip row closed by a hairline. */
.archive-scopes { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 10px 0 0; padding-bottom: 14px; border-bottom: 1px solid var(--gn-line); }
.archive-scopes button { min-height: 30px; padding: 4px 12px; border: 1px solid var(--gn-line); border-radius: var(--gn-radius-pill); background: transparent; box-shadow: none; color: var(--gn-muted); font-size: 12px; }
.archive-scopes button.active { border-color: var(--gn-leaf); background: var(--gn-leaf-soft); color: var(--gn-leaf); font-weight: 700; }
.archive-scopes .archive-filter { display: grid; width: 30px; min-width: 30px; height: 30px; place-items: center; padding: 0; border-radius: 50%; color: var(--gn-muted); font-size: 14px; }

.archive-loading { padding: 28px 12px; color: var(--gn-muted); text-align: center; font-size: 13px; }

/* Rows: a bold title, a muted meta line and a bare chevron, separated by hairlines. */
.archive-list { display: block; }
.archive-group { display: block; }
.archive-group-title { margin: 24px 0 0; font-size: 17px; font-weight: 700; line-height: 1.3; color: var(--gn-ink); }
.archive-row { display: flex; align-items: center; gap: 6px; border-bottom: 1px solid var(--gn-line); }
.archive-row-main { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; padding: 14px 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; color: inherit; text-align: left; }
.archive-row-icon { flex: 0 0 auto; color: var(--gn-muted); font-size: 15px; }
.archive-row-copy { display: grid; flex: 1; min-width: 0; gap: 4px; }
.archive-row-copy strong { display: -webkit-box; overflow: hidden; color: var(--gn-ink); font-size: 16px; font-weight: 700; line-height: 1.4; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.archive-row-copy p { display: -webkit-box; overflow: hidden; margin: 0; color: var(--gn-muted); font-size: 13px; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.archive-row-copy small { color: var(--gn-muted); font-size: 13px; line-height: 1.5; }
.archive-row-chevron { flex: 0 0 auto; color: var(--gn-muted); }
.archive-row-chip { align-self: center; flex: 0 0 auto; min-height: 28px; margin-left: 4px; padding: 4px 10px; border: 1px solid var(--gn-line); border-radius: var(--gn-radius-pill); background: transparent; box-shadow: none; color: var(--gn-leaf); font-size: 11px; white-space: nowrap; }
.archive-row-actions { align-self: center; flex: 0 0 auto; min-width: 34px; min-height: 34px; padding: 4px; border: 0; background: transparent; box-shadow: none; color: var(--gn-muted); font-size: 16px; line-height: 1; cursor: pointer; }

/* Empty state: centred muted text, no dashed card. */
.archive-empty { padding: 30px 16px; text-align: center; }
.archive-empty strong { display: block; color: var(--gn-ink); font-size: 15px; font-weight: 700; }
.archive-empty p { margin: 8px 0 0; color: var(--gn-muted); font-size: 13px; line-height: 1.6; }

.archive-overlay { align-items: end; }
.archive-detail-sheet, .archive-action-sheet { width: min(430px, 100vw); max-height: min(82vh, 690px); overflow-y: auto; padding: 13px 18px calc(24px + env(safe-area-inset-bottom)); border-radius: 24px 24px 0 0; background: var(--gn-paper); }
.sheet-handle { width: 42px; height: 4px; margin: 0 auto 15px; border-radius: 999px; background: var(--gn-line); }
.archive-detail-head { display: flex; justify-content: space-between; gap: 10px; align-items: start; }
.archive-detail-head p { margin: 0; color: var(--gn-leaf); font-size: 11px; }
.archive-detail-head h2 { margin: 4px 0 0; color: var(--gn-ink); font-size: 19px; }
.archive-detail-head button { display: grid; width: 30px; height: 30px; min-height: 30px; place-items: center; padding: 0; border: 0; border-radius: 50%; background: var(--gn-paper-warm); box-shadow: none; color: var(--gn-muted); font-size: 22px; cursor: pointer; }
.archive-detail-block { margin-top: 16px; padding-top: 13px; border-top: 1px solid var(--gn-line); }
.archive-detail-block h3 { margin: 0; color: var(--gn-ink); font-size: 14px; font-weight: 700; }
.archive-detail-block > p { margin: 7px 0 0; color: var(--gn-ink-soft); font-size: 13px; line-height: 1.7; }
.archive-detail-block dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin: 11px 0 0; }
.archive-detail-block dl div { min-width: 0; padding: 8px 6px; border-radius: 10px; background: var(--gn-paper-warm); }
.archive-detail-block dt { color: var(--gn-muted); font-size: 10px; }
.archive-detail-block dd { overflow: hidden; margin: 5px 0 0; color: var(--gn-ink); text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.archive-detail-block ul, .archive-detail-block ol { display: grid; gap: 7px; margin: 10px 0 0; padding: 0; list-style: none; }
.archive-detail-block li { display: flex; justify-content: space-between; gap: 10px; color: var(--gn-ink-soft); font-size: 12px; line-height: 1.55; }
.archive-detail-block li span { min-width: 0; }
.archive-detail-block li small, .archive-detail-block li time { flex: 0 0 auto; color: var(--gn-muted); font-size: 10px; }
.archive-detail-block ol li { display: grid; grid-template-columns: 72px minmax(0, 1fr); }
.archive-detail-actions { width: 100%; min-height: 44px; margin-top: 18px; border-radius: var(--gn-radius-pill); }
.archive-action-sheet h2 { margin: 0; color: var(--gn-ink); font-size: 18px; }
.archive-action-sheet > p { margin: 8px 0 16px; color: var(--gn-muted); font-size: 13px; line-height: 1.6; }
.archive-action-main, .archive-action-danger, .archive-action-cancel { display: block; width: 100%; min-height: 44px; margin-top: 8px; border-radius: 12px; font-size: 14px; }
.archive-action-main { border: 1px solid var(--gn-line); background: var(--gn-leaf-soft); color: var(--gn-leaf); }
.archive-action-danger { border: 1px solid #fca5a5; background: #fef2f2; color: var(--gn-danger); }
.archive-action-cancel { border: 0; background: transparent; box-shadow: none; color: var(--gn-muted); }
.archive-confirm { z-index: 30; display: grid; place-items: center; padding: 24px; }
.archive-confirm-card { width: min(340px, 100%); padding: 22px; border-radius: var(--gn-radius-card); background: var(--gn-paper); box-shadow: 0 18px 44px rgba(29, 43, 35, .22); }
.archive-confirm-card h2 { margin: 0; color: var(--gn-ink); font-size: 17px; }
.archive-confirm-card p { margin: 10px 0 18px; color: var(--gn-muted); font-size: 13px; line-height: 1.7; }
.archive-confirm-card > div { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.archive-confirm-card button { min-height: 40px; border-radius: var(--gn-radius-small); }
.archive-confirm-card .danger { border: 0; background: var(--gn-danger); color: #fff; }
</style>
