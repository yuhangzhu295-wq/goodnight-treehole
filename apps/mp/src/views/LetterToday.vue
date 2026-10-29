<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { aiDegradationNotice } from '../aiStatus';
import AiDegradationNotice from '../components/AiDegradationNotice.vue';

const router = useRouter();

type Letter = {
  id: string;
  style: string;
  title?: string;
  content: string;
  sourceMoodId?: string;
  /** The diary row this letter answers. The API resolves it per caller; it is what 原始记录 opens. */
  sourceDiaryId?: string;
  savedToDiary?: boolean;
  /** The API returns this; the local type omitted it, so the source line could not use it. */
  createdAt?: string;
};

const letter = ref<Letter>();
const style = ref('warm');
const shareOpen = ref(false);
const shareUrl = ref('');
const statusText = ref('');
const activeAdvice = ref('water');
const busyAction = ref('');
const aiStructured = ref<Record<string, any>>({});
const aiNotice = ref('');
const loading = ref(true);
const loadError = ref('');
/** The header's ⋯ menu: every tone and the poster live here so the page itself stays a letter. */
const menuOpen = ref(false);

const styles = [
  { key: 'warm', label: '温柔', icon: '♡', testId: 'btn-letter-warm' },
  { key: 'rational', label: '理性', icon: '▥', testId: 'btn-letter-rational' },
  { key: 'light', label: '轻松', icon: '☺', testId: 'btn-letter-light' },
  { key: 'poetic', label: '文艺', icon: '♧', testId: 'btn-letter-poetic' },
];

const letterTitle = computed(() => letter.value?.title || '给现在的你');
/**
 * Where this letter came from.
 *
 * This used to print the body's first sentence as an "intro", so the page showed the same words
 * twice - once small above the style tabs and once as the letter itself. The source line now says
 * which record the letter answers, or that it is still being written, neither of which repeats the
 * body.
 */
const letterIntro = computed(() => {
  if (!letter.value) return '';
  if (!letter.value.content) return '正在根据你最近写下的心情，慢慢整理这封回信……';
  const when = letter.value.createdAt
    ? new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(letter.value.createdAt))
    : '';
  return when ? `来自 ${when} 写下的一条心情记录 · 仅自己可见` : '来自你最近写下的一条心情记录 · 仅自己可见';
});

/** The record this letter answers, when the API could resolve one. */
function openSource() {
  const id = letter.value?.sourceDiaryId;
  if (!id) return;
  router.push(`/pages/diary/detail?id=${encodeURIComponent(id)}`);
}
/** Letters written before the fallback templates stopped prefixing the body with the style label. */
const LEGACY_STYLE_PREFIX = /^(?:暖心陪伴|理性分析|轻松一点|清醒提醒|诗意疗愈)：/;
const letterBody = computed(() => String(letter.value?.content ?? '').replace(LEGACY_STYLE_PREFIX, ''));

const signatureText = computed(() => {
  return activePersona.value ? `—— ${activePersona.value.name} · 晚安。` : '晚安。';
});
/**
 * The suggestions the API returned, and only those.
 *
 * This used to substitute three written-here strings when the job carried no advice, so the page showed
 * invented suggestions as if the model had produced them. No advice now means no section.
 */
const adviceItems = computed(() => {
  const advice = Array.isArray(aiStructured.value.advice) ? aiStructured.value.advice : [];
  const icons = ['♨', '◷', '☾'];
  return advice.slice(0, 3).map((text: unknown, index: number) => ({
    key: `ai-${index}`,
    label: String(text).slice(0, 8),
    icon: icons[index] ?? '♧',
    text: String(text),
    testId: ['letter-advice-water', 'letter-advice-rest', 'letter-advice-sleep'][index] ?? `letter-advice-${index}`,
  }));
});
const activeAdviceItem = computed(() => adviceItems.value.find((item) => item.key === activeAdvice.value) ?? adviceItems.value[0]);
const activeAdviceText = computed(() => activeAdviceItem.value?.text ?? '');
/**
 * The paragraph under the chips only earns its space when it says something the chip does not: the
 * chip label is the first eight characters of the same sentence, so for the short fallback suggestions
 * the page printed the identical string twice in a row.
 */
const activeAdviceDetail = computed(() => {
  const item = activeAdviceItem.value;
  if (!item) return '';
  return item.text.trim() === item.label.trim() ? '' : item.text;
});

function safeBack() {
  if (window.history.state?.back) router.back();
  else router.push('/pages/square/index');
}

let isUnmounted = false;
onBeforeUnmount(() => {
  isUnmounted = true;
});

async function waitForAiJob(jobId: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (isUnmounted) return { status: 'cancelled' };
    const state = await api.get<any>(`/api/v1/ai/tasks/${jobId}`);
    if (isUnmounted) return { status: 'cancelled' };
    if (!['queued', 'running'].includes(state.status)) {
      if (!['succeeded', 'fallback'].includes(state.status)) throw new Error(state.job?.errorMessage ?? 'AI 回信生成失败');
      return state;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 350));
  }
  throw new Error(`AI 回信任务超时：${jobId}`);
}

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const res = await api.get<{ item: Letter; jobId?: string }>('/api/v1/letters/today');
    letter.value = res.item;
    style.value = res.item.style || 'warm';
    activeAdvice.value = adviceItems.value[0]?.key ?? 'ai-0';
    if (res.jobId && !res.item.content) {
      busyAction.value = 'initial';
      statusText.value = '正在生成今日回信';
      const completed = await waitForAiJob(res.jobId);
      aiNotice.value = aiDegradationNotice(completed);
      // The first generation's structured payload is where the suggestions live; dropping it hid a
      // real result behind an empty section.
      aiStructured.value = completed.structured ?? {};
      const refreshed = await api.get<{ item: Letter }>('/api/v1/letters/today');
      letter.value = refreshed.item;
      style.value = refreshed.item.style || style.value;
      activeAdvice.value = adviceItems.value[0]?.key ?? 'ai-0';
      statusText.value = '今日回信已生成';
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '暂时无法读取今日回信';
  } finally {
    busyAction.value = '';
    loading.value = false;
  }
}

async function regenerate(nextStyle = style.value): Promise<boolean> {
  if (!letter.value || busyAction.value) return false;
  busyAction.value = nextStyle;
  style.value = nextStyle;
  try {
    const res = await api.post<{ jobId: string }>('/api/v1/letters/' + letter.value.id + '/regenerate', {
      style: nextStyle,
    });
    const completed = await waitForAiJob(res.jobId);
    if (completed.status === 'cancelled') {
      return false;
    }
    if (completed.status === 'failed') {
      throw new Error('回信生成失败，请稍后再试');
    }
    letter.value = { ...letter.value, content: completed.result, style: nextStyle, savedToDiary: false };
    aiStructured.value = completed.structured ?? {};
    aiNotice.value = aiDegradationNotice(completed);
    activeAdvice.value = adviceItems.value[0]?.key ?? 'ai-0';
    statusText.value = '回信已换成新的语气';
    return true;
  } catch (error) {
    statusText.value = error instanceof Error ? error.message : '回信暂时没有生成成功';
    return false;
  } finally {
    busyAction.value = '';
  }
}

async function saveToDiary() {
  if (!letter.value) return;
  busyAction.value = 'diary';
  try {
    const res = await api.post<{ item: Letter }>(`/api/v1/letters/${letter.value.id}/save-to-diary`);
    letter.value = res.item;
    statusText.value = '已存入私密日记';
  } catch (error: any) {
    statusText.value = error instanceof Error ? error.message : '存入日记失败';
  } finally {
    busyAction.value = '';
  }
}

async function makeShareImage() {
  if (!letter.value || busyAction.value) return;
  busyAction.value = 'share';
  try {
    const res = await api.post<{ posterUrl: string }>(`/api/v1/letters/${letter.value.id}/poster`);
    shareUrl.value = res.posterUrl;
    shareOpen.value = true;
    statusText.value = '分享图已生成';
  } catch (err: any) {
    statusText.value = err?.message ?? '生成分享图失败';
  } finally {
    busyAction.value = '';
  }
}

const activePersona = ref<any>(null);
const personas = ref<any[]>([]);

async function loadPersona() {
  try {
    const res = await api.get<{ persona: any; available: any[] }>('/api/v1/me/ai-persona');
    activePersona.value = res.persona;
    personas.value = res.available ?? [];
  } catch {
    // optional persona
  }
}

async function selectPersona(personaId: string) {
  if (busyAction.value) return;
  try {
    statusText.value = '正在切换陪伴角色…';
    const success = await regenerate();
    if (success) {
      const res = await api.post<{ persona: any }>('/api/v1/me/ai-persona', { personaId });
      activePersona.value = res.persona;
      statusText.value = `「${res.persona.name}」已为你写好今日回信`;
    }
  } catch (err: any) {
    statusText.value = err?.message ?? '切换角色失败';
  }
}

function chooseAdvice(key: string) {
  activeAdvice.value = key;
  statusText.value = activeAdviceText.value;
}

onMounted(() => {
  load();
  loadPersona();
});
</script>

<template>
  <section class="page goodnight-page letter-page" v-if="letter">
    <header class="letter-topbar bleed-bar">
      <button class="back-icon" data-testid="letter-back" aria-label="返回" @click="safeBack">‹</button>
      <h1>今天的回信</h1>
      <button class="more-icon" data-testid="letter-menu" aria-label="更多" @click="menuOpen = true">⋯</button>
    </header>

    <p class="letter-source">{{ letterIntro }}</p>

    <article class="letter-body">
      <h2 class="letter-title">{{ letterTitle }}</h2>
      <p v-if="letter.content" class="letter-content">{{ letterBody }}</p>
      <template v-else>
        <!-- A failed generation used to leave this branch with only "还没有生成出来": the error and
             the retry button lived in the other branch, which never renders once an item exists. -->
        <p class="letter-content is-empty">{{ loadError || '这封回信还没有生成出来。' }}</p>
        <button class="letter-retry" data-testid="letter-retry" type="button" @click="load">重新读取</button>
      </template>
      <p class="signature">{{ signatureText }}</p>
    </article>

    <AiDegradationNotice :notice="aiNotice" />

    <!--
      The two rows the design puts under the letter. 原始记录 opens the diary entry the letter answers
      (the API resolves that id per caller); 收藏 is the same save-to-diary the old action bar called.
    -->
    <section class="letter-rows">
      <button v-if="letter.sourceDiaryId" class="letter-row" data-testid="letter-source-record" type="button" @click="openSource">
        <span class="row-icon" aria-hidden="true">▤</span>
        <span class="row-copy"><strong>原始记录</strong><small>查看这封回信回应的那件事</small></span>
        <span class="row-chevron" aria-hidden="true">›</span>
      </button>
      <button class="letter-row action-row" data-testid="btn-letter-save" type="button" :disabled="busyAction === 'diary'" @click="saveToDiary">
        <span class="row-icon" aria-hidden="true">♡</span>
        <span class="row-copy">
          <strong>{{ busyAction === 'diary' ? '正在保存' : letter.savedToDiary ? '已存入日记' : '存入日记' }}</strong>
          <small>保存至私密日记，以后想看时可以随时找回</small>
        </span>
      </button>
    </section>

    <section v-if="adviceItems.length" class="advice-section">
      <h2>今日小建议</h2>
      <div class="advice-row">
        <button
          v-for="item in adviceItems"
          :key="item.key"
          :data-testid="item.testId"
          :class="{ active: activeAdvice === item.key }"
          @click="chooseAdvice(item.key)"
        >
          {{ item.label }}
        </button>
      </div>
      <p v-if="activeAdviceDetail" class="advice-copy">{{ activeAdviceDetail }}</p>
    </section>

    <p v-if="statusText" class="floating-status">{{ statusText }}</p>

    <!-- Tone and poster live behind ⋯ so the page reads as one letter; every control still exists. -->
    <div v-if="menuOpen" class="sheet-mask" data-state="letter-menu" @click.self="menuOpen = false">
      <div class="sheet menu-sheet">
        <h2>回信设置</h2>
        <div v-if="personas.length" class="menu-section">
          <small class="menu-subhead">陪伴角色设定</small>
          <button
            v-for="p in personas"
            :key="p.id"
            :class="['menu-persona-btn', { active: activePersona?.id === p.id }]"
            type="button"
            :disabled="Boolean(busyAction)"
            @click="menuOpen = false; selectPersona(p.id)"
          >
            <strong class="persona-name">{{ p.name }}</strong>
            <span class="persona-title">{{ p.title }}</span>
            <p class="persona-desc">{{ p.description }}</p>
          </button>
        </div>
        <div class="menu-section">
          <small class="menu-subhead">语气风格</small>
          <button
            v-for="item in styles"
            :key="item.key"
            :data-testid="item.testId"
            type="button"
            :disabled="Boolean(busyAction)"
            @click="menuOpen = false; regenerate(item.key)"
          >换成{{ item.label }}的语气</button>
        </div>
        <button data-testid="btn-letter-regenerate" type="button" :disabled="Boolean(busyAction)" @click="menuOpen = false; regenerate()">重新生成</button>
        <button data-testid="btn-letter-poster" type="button" :disabled="Boolean(busyAction)" @click="menuOpen = false; makeShareImage()">分享图片</button>
        <button data-testid="letter-menu-cancel" type="button" @click="menuOpen = false">取消</button>
      </div>
    </div>

    <div v-if="shareOpen" class="modal share-modal" data-state="letter-share-preview" @click.self="shareOpen = false">
      <article class="share-card">
        <button class="card-more" data-testid="letter-share-close" aria-label="关闭" @click="shareOpen = false">×</button>
        <h2>今日回信分享图</h2>
        <div class="share-preview">
          <strong>{{ letterTitle }}</strong>
          <p>{{ letter.content }}</p>
          <small>{{ shareUrl }}</small>
        </div>
        <button class="submit-wide" @click="shareOpen = false">完成</button>
      </article>
    </div>
  </section>

  <section v-else class="page goodnight-page letter-page">
    <header class="letter-topbar bleed-bar">
      <button class="back-icon" data-testid="letter-back" aria-label="返回" @click="safeBack">‹</button>
      <h1>今天的回信</h1>
      <span aria-hidden="true"></span>
    </header>
    <article class="empty-card" v-if="loading">正在读取今天的回信...</article>
    <article class="empty-card" v-else>
      <p>{{ loadError || '今日回信暂时不可用。' }}</p>
      <button data-testid="letter-retry" @click="load">重新读取</button>
    </article>
  </section>
</template>

<style scoped>
/* The letter is the page: a plain top bar, the source line, then the body. The old version spent a
   hero, an envelope illustration and a second title above the text. */
.letter-page.goodnight-page {
  display: block;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 0;
  padding: 0 0 calc(32px + env(safe-area-inset-bottom));
}

.letter-topbar {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 32px;
  align-items: center;
  min-height: 52px;
  border-bottom: 1px solid #e8eaed;
  background: #ffffff;
}

.letter-topbar h1 {
  color: #242a32;
  font-size: 17px;
  font-weight: 650;
  text-align: left;
}

.letter-topbar .back-icon {
  place-items: center start;
  justify-self: start;
  width: 32px;
  height: 32px;
  padding-left: 0;
  /* The chevron's own side bearing was the last 20-30 device px of the inset. */
  text-align: left;
  border: 0;
  background: none;
  color: #39454c;
  font-size: 24px;
  line-height: 1;
}

.letter-topbar .more-icon {
  justify-self: end;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #39454c;
  font-size: 18px;
  line-height: 1;
}

/* Where the letter came from - one quiet line, not an illustrated block. */
.letter-source {
  margin: 14px 0 0;
  color: #7a838e;
  font-size: 12.5px;
  line-height: 1.6;
}

.letter-body { margin-top: 14px; }

.letter-title {
  margin: 0 0 14px;
  color: #242a32;
  font-size: 23px;
  font-weight: 700;
  letter-spacing: -0.3px;
  line-height: 1.35;
}

.letter-content {
  margin: 0;
  color: #333c44;
  font-size: 16px;
  line-height: 1.85;
  white-space: pre-wrap;
  word-break: break-word;
}

.letter-content.is-empty {
  color: #88909a;
  font-size: 13px;
  line-height: 1.7;
}

.letter-retry {
  margin-top: 12px;
  padding: 8px 14px;
  border: 1px solid #e4e7ea;
  border-radius: 8px;
  background: #ffffff;
  color: #275f56;
  font-size: 13px;
}

.letter-body .signature {
  margin: 18px 0 0;
  color: #88909a;
  font-size: 12px;
  text-align: right;
}

/* The design's two rows - 原始记录 and 收藏 - one per line, separated by hairlines. */
.letter-rows {
  margin-top: 26px;
  border-top: 1px solid #ebedf0;
}

.letter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 0;
  padding: 14px 0;
  border: 0;
  border-bottom: 1px solid #ebedf0;
  border-radius: 0;
  background: transparent;
  text-align: left;
}

.row-icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: #f2f4f5;
  color: #7e8690;
  font-size: 15px;
}

.row-copy { flex: 1; min-width: 0; }

.row-copy strong {
  display: block;
  color: #242a32;
  font-size: 14px;
  font-weight: 650;
}

.row-copy small {
  display: block;
  margin-top: 3px;
  color: #8b939c;
  font-size: 12px;
}

.row-chevron { flex: 0 0 auto; color: #c4cad0; font-size: 16px; }

.advice-section h2 {
  margin: 20px 0 8px;
  color: #242a32;
  font-size: 13.5px;
  font-weight: 650;
}

.advice-row {
  display: flex;
  /* Three suggestion chips at 12px do not fit one 375px row, and a scrolling row cut the last one at
     the screen edge. Wrapping keeps all of them visible without removing any. */
  flex-wrap: wrap;
  gap: 6px;
  overflow: visible;
}

.advice-row button {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 34px;
  padding: 7px 11px;
  border: 1px solid #e4e7ea;
  border-radius: 8px;
  background: #ffffff;
  color: #606a74;
  font-size: 12px;
}

.advice-row button.active {
  border-color: #c3dad0;
  background: #eaf2ee;
  color: #2b6358;
  font-weight: 600;
}

.letter-page .status-row {
  position: absolute;
  top: 10px;
  right: 20px;
  left: 16px;
  z-index: 5;
  visibility: visible;
  color: #151815;
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
}

.letter-page .status-row span:last-child {
  padding: 2px 5px;
  border-radius: 5px;
  color: #fff;
  background: #121512;
  font-size: 11px;
}

/* This view originally inherited several experimental hero layers.  Keep the
   live letter intact, but use one clean tree and one clean illustration so
   that no extracted screenshot text leaks into the interface. */
.letter-page .letter-hero {
  z-index: 2;
  min-height: 92px;
  padding-top: 14px;
  padding-bottom: 8px;
  overflow: visible;
}

.letter-page .letter-hero::before {
  top: -7px;
  left: 264px;
  width: 166px;
  height: 126px;
  background-image: url("../assets/goodnight/tree-top.png");
  background-size: 100% 100%;
}

.letter-page .letter-tree {
  display: none;
}

.letter-page .letter-heading {
  margin-top: 23px;
}

.letter-page .letter-heading h1 {
  font-size: 25px;
  line-height: 1.12;
}

.letter-page .letter-heading p {
  margin-top: 4px;
  font-size: 14px;
}

/* The intro is an intentionally short preview; the complete server-backed
   letter remains visible in the paper card immediately below it. */
.letter-page .letter-intro p {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
}

.letter-page .letter-intro {
  min-height: 122px;
  padding: 19px 22px 17px 148px;
  border-radius: 22px;
}

.letter-page .letter-intro::before {
  left: 15px;
  width: 116px;
  height: 82px;
}

.letter-page .letter-intro h2 {
  font-size: 25px;
  line-height: 1.16;
}

/* A segmented control keeps all real regeneration actions available while
   matching the compact four-style rhythm of the reference. */
.letter-page .letter-style-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  height: 36px;
  overflow: hidden;
  border: 1px solid rgba(104, 126, 78, 0.22);
  border-radius: 22px;
  background: rgba(255, 254, 249, 0.94);
}

.letter-page .letter-style-tabs button {
  min-width: 0;
  min-height: 34px;
  padding-inline: 4px;
  border: 0;
  border-right: 1px solid rgba(104, 126, 78, 0.18);
  border-radius: 0;
  box-shadow: none;
  font-size: 14px;
}

.letter-page .letter-style-tabs button:last-child {
  border-right: 0;
}

.letter-page .letter-actions,
.letter-page .letter-actions button {
  min-height: 34px;
}

.letter-page .letter-actions button {
  padding-block: 4px;
}

.letter-page .advice-section {
  margin-top: -2px;
  padding-top: 8px;
}

.letter-page .advice-row {
  gap: 8px;
}

.letter-page .advice-row button {
  min-height: 31px;
  padding-block: 4px;
  font-size: 13px;
}

.letter-page .advice-copy {
  margin-top: 8px;
  /* The shared rule paints this in V1 olive (#607452); the page's secondary copy is grey. */
  color: #6c747d;
  font-size: 13px;
  line-height: 1.7;
}

/* The fixed navigation is part of the product chrome. Leave enough real
   document space after the advice block so saved-letter actions can be
   scrolled above it during keyboard and pointer navigation. */
.letter-page .advice-section {
  padding-bottom: calc(96px + env(safe-area-inset-bottom));
}

.letter-page .letter-actions {
  scroll-margin-bottom: calc(104px + env(safe-area-inset-bottom));
}

.menu-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.menu-subhead {
  font-size: 11px;
  font-weight: 600;
  color: var(--gn-muted, #757d87);
}

.menu-persona-btn {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--gn-line, #e5e7eb);
  background: #ffffff;
  color: var(--gn-text, #242a32);
  font-size: 13px;
  cursor: pointer;
}

.menu-persona-btn .persona-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--gn-ink, #242a32);
}

.menu-persona-btn .persona-title {
  font-size: 11px;
  color: var(--gn-primary, #275f56);
}

.menu-persona-btn .persona-desc {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--gn-muted, #757d87);
  line-height: 1.35;
}

.menu-persona-btn.active {
  background: #eaf4ee;
  border-color: #275f56;
}
</style>
