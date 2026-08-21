<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, resolveApiUrl } from '../api';

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
    <header class="archive-hero">
      <p class="archive-brand"><span aria-hidden="true">✺</span> 晚安树洞</p>
      <h1>日记与回信</h1>
      <p>把你写下的话，和树洞回答你的话，都留在这里。</p>
    </header>

    <section class="archive-surface" aria-label="内容档案">
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
      </div>

      <button class="archive-journey-entry" data-testid="archive-tab-journey" :class="{ active: activeTab === 'journey' }" @click="selectTab('journey')">
        <span aria-hidden="true">⌁</span> 旅程归档 <small>{{ journeys.length }} 段</small>
      </button>

      <p v-if="error" class="archive-error">{{ error }}</p>
      <p v-if="loading" class="archive-loading">正在读取你已经保存的内容…</p>

      <div v-if="activeTab === 'diary' && !loading" class="archive-list">
        <article v-for="(item, index) in filteredDiaries" :key="item.id" class="archive-card diary-card">
          <button class="archive-card-main" :data-testid="index === 0 ? 'archive-diary-first' : `archive-diary-${item.id}`" @click="openDiary(item)">
            <span class="archive-card-icon" aria-hidden="true">▤</span>
            <span class="archive-card-copy"><strong>{{ diaryPreview(item) }}</strong><small>{{ item.emotionLabel ?? item.emotion ?? '心情记录' }}</small><time>{{ dateLabel(item.createdAt) }}</time></span>
          </button>
          <button v-if="item.hasLetter" class="archive-more reply-chip" :data-testid="index === 0 ? 'archive-diary-letter-first' : undefined" @click="openLetter(item)">树洞回信 {{ item.letterId ? '1 条' : '' }} ›</button>
          <span v-else class="archive-more" aria-hidden="true">···</span>
        </article>
        <article v-if="!filteredDiaries.length" class="archive-empty"><strong>这个时间范围里还没有私密日记</strong><p>写下的内容会在这里按真实时间出现。</p></article>
      </div>

      <div v-else-if="activeTab === 'post' && !loading" class="archive-list">
        <article v-for="(item, index) in filteredPosts" :key="item.id" class="archive-card post-card">
          <button class="archive-card-main" :data-testid="index === 0 ? 'archive-post-first' : `archive-post-${item.id}`" @click="openPost(item)">
            <span class="archive-card-icon sun" aria-hidden="true">☼</span>
            <span class="archive-card-copy"><strong>{{ postPreview(item) }}</strong><small>{{ item.emotion ?? '公开树洞' }}</small><time>{{ dateLabel(item.createdAt) }}</time></span>
          </button>
          <span class="archive-more" aria-hidden="true">···</span>
        </article>
        <article v-if="!filteredPosts.length" class="archive-empty"><strong>这个时间范围里没有公开树洞</strong><p>这里只显示真实发布并可查看的内容。</p></article>
      </div>

      <div v-else-if="activeTab === 'letter' && !loading" class="archive-list">
        <article v-for="(item, index) in filteredLetters" :key="item.id" class="archive-card letter-card">
          <button class="archive-card-main" :data-testid="index === 0 ? 'archive-letter-first' : `archive-letter-${item.id}`" @click="openLetter(item)">
            <span class="archive-card-icon moon" aria-hidden="true">☾</span>
            <span class="archive-card-copy"><strong>{{ item.title || '给现在的你' }}</strong><p>{{ letterPreview(item) }}</p><time>{{ dateLabel(item.createdAt) }}</time></span>
          </button>
          <span class="archive-more" aria-hidden="true">···</span>
        </article>
        <article v-if="!filteredLetters.length" class="archive-empty"><strong>这个时间范围里还没有回信</strong><p>当你收到真实回信，它会在这里保存。</p></article>
      </div>

      <div v-else-if="activeTab === 'journey' && !loading" class="archive-list journey-list">
        <article v-for="(item, index) in filteredJourneys" :key="item.journey.id" class="archive-card journey-card">
          <button class="archive-card-main" :data-testid="index === 0 ? 'archive-journey-first' : `archive-journey-${item.journey.id}`" @click="openJourney(item)">
            <span class="archive-card-icon sprout" aria-hidden="true">⌁</span>
            <span class="archive-card-copy"><strong>{{ item.journey.title }}</strong><p>{{ journeyPreview(item) }}</p><small>{{ item.journey.status === 'completed' ? '已完成' : '已归档' }} · {{ item.actionStats.completed }} 次完成 · {{ item.actionStats.adjusted }} 次调整</small><time>{{ dateLabel(item.endedAt) }}</time></span>
          </button>
          <button class="archive-more archive-actions-trigger" :data-testid="index === 0 ? 'archive-journey-actions-first' : undefined" aria-label="归档操作" @click="openActions(item)">···</button>
        </article>
        <article v-if="!filteredJourneys.length" class="archive-empty"><strong>这个时间范围里没有旅程归档</strong><p>完成或手动归档后的 Journey 会在这里完整回看。</p></article>
      </div>

      <div class="archive-scopes" aria-label="时间范围">
        <button v-for="item in ([['all', '全部'], ['week', '本周'], ['month', '本月']] as const)" :key="item[0]" :data-testid="`archive-scope-${item[0]}`" :class="{ active: scope === item[0] }" @click="scope = item[0]">{{ item[1] }}</button>
        <button class="archive-filter" data-testid="archive-filter-reset" aria-label="重置时间筛选" @click="scope = 'all'">▽</button>
      </div>
    </section>

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
.archive-page { display: block; min-height: 100vh; overflow-x: clip; padding: 0 12px calc(112px + env(safe-area-inset-bottom)); background: #f3efe7; color: #334036; }
.archive-page * { box-sizing: border-box; }
.archive-hero { position: relative; min-height: 154px; margin: 0 -12px; overflow: hidden; padding: 25px 24px 19px; color: #fffaf0; background: linear-gradient(145deg, #263445 0%, #445261 58%, #747066 100%); }
.archive-hero::after { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 50%, rgba(31, 41, 47, .34)), url('../assets/goodnight/tree-top-cutout.png') right top / 235px auto no-repeat; content: ''; opacity: .72; pointer-events: none; }
.archive-brand, .archive-hero h1, .archive-hero > p:last-child { position: relative; z-index: 1; }
.archive-brand { display: flex; align-items: center; gap: 6px; margin: 0 0 17px; font-size: 11px; letter-spacing: .05em; }
.archive-brand span { display: grid; width: 20px; height: 20px; place-items: center; border: 1px solid rgba(255,255,255,.44); border-radius: 50%; font-size: 11px; }
.archive-hero h1 { margin: 0; font-family: var(--gn-font-display); font-size: 30px; font-weight: 600; letter-spacing: .08em; line-height: 1.15; }
.archive-hero > p:last-child { max-width: 255px; margin: 9px 0 0; color: rgba(255,250,240,.86); font-size: 11px; line-height: 1.55; }
.archive-surface { position: relative; min-height: 470px; margin-top: -9px; padding: 0 10px 12px; border-radius: 23px 23px 17px 17px; background: rgba(253, 249, 239, .98); box-shadow: 0 -4px 20px rgba(26, 40, 49, .08); }
.archive-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); min-height: 43px; padding: 4px 5px; border-bottom: 1px solid rgba(104, 115, 91, .12); }
.archive-tabs button { min-width: 0; min-height: 35px; border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: transparent; box-shadow: none; color: #667064; font-size: 12px; white-space: nowrap; }
.archive-tabs button.active { border-color: #768d56; color: #47613d; font-weight: 700; }
.archive-journey-entry { display: flex; align-items: center; justify-content: center; gap: 5px; min-height: 28px; margin: 9px auto 6px; padding: 3px 12px; border: 1px solid rgba(103, 129, 73, .17); border-radius: 999px; background: #f4f5e9; box-shadow: none; color: #617852; font-size: 10px; }
.archive-journey-entry.active { border-color: transparent; background: #718952; color: #fff; }
.archive-journey-entry small { color: inherit; font-size: 9px; opacity: .8; }
.archive-list { display: grid; gap: 9px; }
.archive-card { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; min-height: 105px; overflow: hidden; border: 1px solid rgba(134, 140, 112, .15); border-radius: 14px; background: rgba(255,255,252,.9); box-shadow: 0 7px 16px rgba(90, 90, 66, .06); }
.archive-card-main { display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 11px; min-width: 0; padding: 13px 8px 11px 13px; border: 0; border-radius: 0; background: transparent; box-shadow: none; color: inherit; text-align: left; }
.archive-card-icon { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 50%; background: #e9ece0; color: #657e50; font-size: 16px; }
.archive-card-icon.sun { background: #f8edda; color: #ba8950; }.archive-card-icon.moon { background: #ece9ef; color: #77708c; }.archive-card-icon.sprout { background: #e5efdf; color: #587644; }
.archive-card-copy { display: grid; min-width: 0; align-content: start; gap: 4px; }.archive-card-copy strong { display: -webkit-box; overflow: hidden; color: #3f4d3f; font-size: 14px; font-weight: 600; line-height: 1.36; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }.archive-card-copy p { display: -webkit-box; overflow: hidden; margin: 0; color: #6b7167; font-size: 11px; line-height: 1.48; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }.archive-card-copy small { color: #798466; font-size: 10px; }.archive-card-copy time { color: #899087; font-size: 9px; }
.archive-more { align-self: start; min-width: 32px; padding: 13px 8px; border: 0; border-radius: 0; background: transparent; box-shadow: none; color: #8b9186; font-size: 15px; line-height: 1; }.reply-chip { align-self: end; min-height: 26px; margin: 0 7px 10px 0; padding: 4px 8px; border: 0; border-radius: 999px; background: #eef0e5; color: #6d7e5c; font-size: 9px; white-space: nowrap; }.archive-actions-trigger { cursor: pointer; }
.journey-card { min-height: 123px; }.journey-card .archive-card-main { grid-template-columns: 42px minmax(0, 1fr); }
.archive-empty { min-height: 138px; padding: 35px 22px; border: 1px dashed rgba(112, 132, 89, .28); border-radius: 14px; background: rgba(255,255,252,.66); text-align: center; }.archive-empty strong { color: #60764d; font-size: 13px; }.archive-empty p { margin: 7px 0 0; color: #81877b; font-size: 11px; line-height: 1.6; }.archive-loading { padding: 35px 12px; color: #7b8478; text-align: center; font-size: 12px; }.archive-error { margin: 7px 3px; color: #bc625a; font-size: 11px; }
.archive-scopes { display: flex; justify-content: center; gap: 5px; align-items: center; margin: 11px 0 0; }.archive-scopes button { min-width: 55px; min-height: 27px; padding: 4px 9px; border: 0; border-radius: 999px; background: transparent; box-shadow: none; color: #7c8377; font-size: 10px; }.archive-scopes button.active { background: #6f8650; color: #fff; }.archive-scopes .archive-filter { display: grid; min-width: 32px; width: 32px; height: 32px; place-items: center; padding: 0; border-radius: 50%; background: #5d7651; color: #fff; font-size: 15px; }
.archive-overlay { align-items: end; }.archive-detail-sheet, .archive-action-sheet { width: min(430px, 100vw); max-height: min(82vh, 690px); overflow-y: auto; padding: 13px 18px calc(24px + env(safe-area-inset-bottom)); border-radius: 24px 24px 0 0; background: #fffdf7; }.sheet-handle { width: 42px; height: 4px; margin: 0 auto 15px; border-radius: 999px; background: #deddd4; }.archive-detail-head { display: flex; justify-content: space-between; gap: 10px; align-items: start; }.archive-detail-head p { margin: 0; color: #788b5d; font-size: 10px; }.archive-detail-head h2 { margin: 4px 0 0; color: #40513f; font-size: 19px; }.archive-detail-head button { display: grid; width: 30px; height: 30px; place-items: center; padding: 0; border: 0; border-radius: 50%; background: #eef0e7; box-shadow: none; color: #64725f; font-size: 22px; }.archive-detail-block { margin-top: 16px; padding-top: 13px; border-top: 1px solid rgba(104, 118, 87, .14); }.archive-detail-block h3 { margin: 0; color: #587246; font-size: 13px; }.archive-detail-block > p { margin: 7px 0 0; color: #5f675e; font-size: 12px; line-height: 1.72; }.archive-detail-block dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin: 11px 0 0; }.archive-detail-block dl div { min-width: 0; padding: 8px 6px; border-radius: 10px; background: #f5f5ed; }.archive-detail-block dt { color: #87907e; font-size: 9px; }.archive-detail-block dd { overflow: hidden; margin: 5px 0 0; color: #53694a; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }.archive-detail-block ul, .archive-detail-block ol { display: grid; gap: 7px; margin: 10px 0 0; padding: 0; list-style: none; }.archive-detail-block li { display: flex; justify-content: space-between; gap: 10px; color: #657063; font-size: 11px; line-height: 1.55; }.archive-detail-block li span { min-width: 0; }.archive-detail-block li small, .archive-detail-block li time { flex: 0 0 auto; color: #8a9384; font-size: 9px; }.archive-detail-block ol li { display: grid; grid-template-columns: 65px minmax(0, 1fr); }.archive-detail-actions { width: 100%; min-height: 44px; margin-top: 18px; border-radius: 999px; }
.archive-action-sheet h2 { margin: 0; color: #445443; font-size: 18px; }.archive-action-sheet > p { margin: 8px 0 16px; color: #737b70; font-size: 12px; line-height: 1.6; }.archive-action-main, .archive-action-danger, .archive-action-cancel { display: block; width: 100%; min-height: 44px; margin-top: 8px; border-radius: 12px; font-size: 13px; }.archive-action-main { border: 1px solid rgba(99, 126, 75, .2); background: #f0f4e9; color: #4f6b3d; }.archive-action-danger { border: 1px solid rgba(204, 94, 81, .2); background: #fff4f1; color: #c45e53; }.archive-action-cancel { border: 0; background: transparent; box-shadow: none; color: #748072; }
.archive-confirm { z-index: 30; display: grid; place-items: center; padding: 24px; }.archive-confirm-card { width: min(340px, 100%); padding: 22px; border-radius: 18px; background: #fffdf8; box-shadow: 0 18px 44px rgba(29, 43, 35, .22); }.archive-confirm-card h2 { margin: 0; color: #4b5047; font-size: 17px; }.archive-confirm-card p { margin: 10px 0 18px; color: #73786d; font-size: 12px; line-height: 1.7; }.archive-confirm-card > div { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }.archive-confirm-card button { min-height: 40px; border-radius: 10px; }.archive-confirm-card .danger { border: 0; background: #d86c5f; color: #fff; }
@media (max-width: 374px) { .archive-hero { min-height: 148px; padding-inline: 20px; }.archive-hero h1 { font-size: 28px; }.archive-tabs button { font-size: 11px; }.archive-card-main { grid-template-columns: 38px minmax(0, 1fr); padding-left: 10px; }.archive-card-icon { width: 31px; height: 31px; }.archive-detail-block dl { grid-template-columns: 1fr 1fr; } }
</style>
