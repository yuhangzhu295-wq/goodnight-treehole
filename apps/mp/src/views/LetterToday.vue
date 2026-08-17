<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { useDeviceClock } from '../composables/useDeviceClock';

const router = useRouter();
const { timeLabel } = useDeviceClock();

type Letter = {
  id: string;
  style: string;
  title?: string;
  content: string;
  sourceMoodId?: string;
  savedToDiary?: boolean;
};

const letter = ref<Letter>();
const style = ref('warm');
const shareOpen = ref(false);
const shareUrl = ref('');
const statusText = ref('');
const activeAdvice = ref('water');
const busyAction = ref('');
const aiStructured = ref<Record<string, any>>({});

const styles = [
  { key: 'warm', label: '温柔', icon: '♡', testId: 'btn-letter-warm' },
  { key: 'rational', label: '理性', icon: '▥', testId: 'btn-letter-rational' },
  { key: 'light', label: '轻松', icon: '☺', testId: 'btn-letter-light' },
  { key: 'poetic', label: '文艺', icon: '♧', testId: 'btn-letter-poetic' },
];

const letterTitle = computed(() => letter.value?.title || '给现在的你');
const savedText = computed(() => (letter.value?.savedToDiary ? '已保存' : '保存到日记'));
const letterIntro = computed(() => {
  const first = letter.value?.content.split(/[。！？\n]/).find(Boolean)?.trim();
  return first ? `${first.slice(0, 36)}。` : '树洞正在根据你最近写下的心情生成回信。';
});
const signatureText = computed(() => {
  if (style.value === 'rational') return '今晚先处理可控的一小步。';
  if (style.value === 'light') return '先让心里的音量低一点。';
  if (style.value === 'poetic') return '愿这一页替你安放一点夜色。';
  return '今晚先把自己轻轻接住。';
});
const adviceItems = computed(() => {
  const advice = Array.isArray(aiStructured.value.advice) ? aiStructured.value.advice : [];
  const source = advice.length ? advice : ['把此刻写成一句话', '只做一个小动作', '给身体一点缓冲'];
  const icons = ['♨', '◷', '☾'];
  return source.slice(0, 3).map((text: string, index: number) => ({
    key: `ai-${index}`,
    label: String(text).slice(0, 8),
    icon: icons[index] ?? '♧',
    text,
    testId: ['letter-advice-water', 'letter-advice-rest', 'letter-advice-sleep'][index] ?? `letter-advice-${index}`,
  }));
});
const activeAdviceText = computed(() => adviceItems.value.find((item) => item.key === activeAdvice.value)?.text ?? adviceItems.value[0]?.text ?? '');

function safeBack() {
  if (window.history.state?.back) router.back();
  else router.push('/pages/square/index');
}

async function waitForAiJob(jobId: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const state = await api.get<any>(`/api/v1/ai/tasks/${jobId}`);
    if (!['queued', 'running'].includes(state.status)) {
      if (!['succeeded', 'fallback'].includes(state.status)) throw new Error(state.job?.errorMessage ?? 'AI 回信生成失败');
      return state;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 350));
  }
  throw new Error(`AI 回信任务超时：${jobId}`);
}

async function load() {
  const res = await api.get<{ item: Letter; jobId?: string }>('/api/v1/letters/today');
  letter.value = res.item;
  style.value = res.item.style || 'warm';
  activeAdvice.value = adviceItems.value[0]?.key ?? 'ai-0';
  if (res.jobId && !res.item.content) {
    busyAction.value = 'initial';
    statusText.value = '正在生成今日回信';
    await waitForAiJob(res.jobId);
    const refreshed = await api.get<{ item: Letter }>('/api/v1/letters/today');
    letter.value = refreshed.item;
    style.value = refreshed.item.style || style.value;
    activeAdvice.value = adviceItems.value[0]?.key ?? 'ai-0';
    busyAction.value = '';
    statusText.value = '今日回信已生成';
  }
}

async function regenerate(nextStyle = style.value) {
  if (!letter.value) return;
  busyAction.value = nextStyle;
  style.value = nextStyle;
  const res = await api.post<{ jobId: string }>('/api/v1/letters/' + letter.value.id + '/regenerate', {
    style: nextStyle,
  });
  const completed = await waitForAiJob(res.jobId);
  letter.value = { ...letter.value, content: completed.result, style: nextStyle, savedToDiary: false };
  aiStructured.value = completed.structured ?? {};
  activeAdvice.value = adviceItems.value[0]?.key ?? 'ai-0';
  busyAction.value = '';
  statusText.value = '回信已换成新的语气';
}

async function saveToDiary() {
  if (!letter.value) return;
  busyAction.value = 'diary';
  const res = await api.post<{ item: Letter }>(`/api/v1/letters/${letter.value.id}/save-to-diary`);
  letter.value = res.item;
  statusText.value = '已保存到日记';
  busyAction.value = '';
}

async function makeShareImage() {
  if (!letter.value) return;
  busyAction.value = 'share';
  const res = await api.post<{ posterUrl: string }>(`/api/v1/letters/${letter.value.id}/poster`);
  shareUrl.value = res.posterUrl;
  shareOpen.value = true;
  statusText.value = '分享图已生成';
  busyAction.value = '';
}

function chooseAdvice(key: string) {
  activeAdvice.value = key;
  statusText.value = activeAdviceText.value;
}

onMounted(load);
</script>

<template>
  <section class="page goodnight-page letter-page" v-if="letter">
    <header class="front-hero letter-hero">
      <div class="status-row">
        <span>{{ timeLabel }}</span>
        <span aria-hidden="true"></span>
      </div>
      <button class="back-icon" data-testid="letter-back" aria-label="返回" @click="safeBack">‹</button>
      <div class="letter-heading">
        <h1>今日回信</h1>
        <p>▣ 仅自己可见</p>
      </div>
      <div class="tree-scene letter-tree" aria-hidden="true">
        <span class="tree-heart">♡</span>
        <span class="seedling-face">♡</span>
      </div>
    </header>

    <section class="letter-intro">
      <div class="envelope-illustration" aria-hidden="true">
        <span>♡</span>
      </div>
      <div>
        <h2>给现在的你</h2>
        <p>{{ letterIntro }}</p>
      </div>
    </section>

    <div class="letter-style-tabs" aria-label="回信风格">
      <button
        v-for="item in styles"
        :key="item.key"
        :data-testid="item.testId"
        :class="{ active: style === item.key }"
        @click="regenerate(item.key)"
      >
        <span>{{ item.icon }}</span>
        <span>{{ item.label }}</span>
      </button>
    </div>

    <article class="letter-card">
      <span class="botanical left" aria-hidden="true">♧</span>
      <span class="botanical right" aria-hidden="true">♧</span>
      <h2>{{ letterTitle }} <span>♧</span></h2>
      <p class="letter-line" />
      <p class="letter-content">{{ letter.content }}</p>
      <p class="signature">{{ signatureText }} ♧</p>
    </article>

    <div class="letter-actions">
      <button data-testid="btn-letter-regenerate" @click="regenerate()">
        <span>↻</span>
        <span>{{ busyAction === style ? '正在换风格' : '换一种风格' }}</span>
      </button>
      <button data-testid="btn-letter-save" @click="saveToDiary">
        <span>▣</span>
        <span>{{ busyAction === 'diary' ? '正在保存' : savedText }}</span>
      </button>
      <button data-testid="btn-letter-poster" @click="makeShareImage">
        <span>⇧</span>
        <span>{{ busyAction === 'share' ? '正在生成' : '分享图片' }}</span>
      </button>
    </div>

    <section class="advice-section">
      <h2>♧ 今日小建议</h2>
      <div class="advice-row">
        <button
          v-for="item in adviceItems"
          :key="item.key"
          :data-testid="item.testId"
          :class="{ active: activeAdvice === item.key }"
          @click="chooseAdvice(item.key)"
        >
          <span>{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </button>
      </div>
      <p class="advice-copy">{{ activeAdviceText }}</p>
    </section>

    <p v-if="statusText" class="floating-status">{{ statusText }}</p>

    <div v-if="shareOpen" class="modal share-modal" data-state="letter-share-preview" @click.self="shareOpen = false">
      <article class="share-card">
        <button class="card-more" data-testid="letter-share-close" aria-label="关闭" @click="shareOpen = false">×</button>
        <h2>今日回信分享图</h2>
        <div class="share-preview">
          <div class="envelope-illustration small" aria-hidden="true"><span>♡</span></div>
          <strong>{{ letterTitle }}</strong>
          <p>{{ letter.content }}</p>
          <small>{{ shareUrl }}</small>
        </div>
        <button class="submit-wide" @click="shareOpen = false">完成</button>
      </article>
    </div>
  </section>

  <section v-else class="page goodnight-page letter-page">
    <article class="empty-card">正在读取今天的回信...</article>
  </section>
</template>

<style scoped>
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
  margin-top: 4px;
}
</style>
