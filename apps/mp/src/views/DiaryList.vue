<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, resolveApiUrl } from '../api';

const router = useRouter();
const route = useRoute();
const diaries = ref<any[]>([]);
const initialMonth = typeof route.query.month === 'string' && /^\d{4}-\d{2}$/.test(route.query.month) ? route.query.month : '';
const month = ref(initialMonth);
const availableMonths = ref<string[]>([]);
const emotion = ref('');
const hasLetter = ref('');
const filterOpen = ref(false);
const monthOpen = ref(false);

async function load() {
  const params = new URLSearchParams();
  if (month.value) params.set('month', month.value);
  if (emotion.value) params.set('emotion', emotion.value);
  if (hasLetter.value) params.set('hasLetter', hasLetter.value);
  diaries.value = (await api.get<any>(`/api/v1/diaries?${params.toString()}`)).items;
}

async function loadMonths() {
  const result = await api.get<any>('/api/v1/diaries/months');
  availableMonths.value = Array.isArray(result.items) ? result.items : [];
  if (!month.value || !availableMonths.value.includes(month.value)) month.value = availableMonths.value[0] ?? new Date().toISOString().slice(0, 7);
}

async function confirmFilter() {
  await load();
  filterOpen.value = false;
}

async function resetFilter() {
  emotion.value = '';
  hasLetter.value = '';
  await load();
}

async function selectMonth(value: string) {
  month.value = value;
  monthOpen.value = false;
  await load();
}

function openDiary(diary: any) {
  router.push(`/pages/diary/detail?id=${encodeURIComponent(diary.id)}`);
}

function openLetter(diary: any) {
  if (diary.letterId) router.push(`/pages/letter/detail?id=${encodeURIComponent(diary.letterId)}`);
  else router.push('/pages/letter/today');
}

function diaryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { day: '—', time: '时间未知' };
  }

  return {
    day: `${String(date.getMonth() + 1).padStart(2, '0')} / ${String(date.getDate()).padStart(2, '0')}`,
    time: date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
  };
}

onMounted(async () => {
  await loadMonths();
  await load();
});
</script>

<template>
  <section class="page goodnight-page rest-page list-page diary-list-page" :class="{ 'is-empty': !diaries.length }">
    <header class="rest-topbar">
      <button class="back-icon" data-testid="front-diary-back" @click="router.back()">‹</button>
      <h1>我的日记</h1>
      <span class="diary-header-spacer" aria-hidden="true"></span>
    </header>

    <div class="diary-intro" aria-label="日记说明">
      <p>每一篇日记，都是你情绪的印记<br>记录下来，让树洞一直陪着你</p>
      <span aria-hidden="true">✦</span>
    </div>

    <div class="diary-controls">
      <button class="diary-month-control" data-testid="filter-diary-month" @click="monthOpen = true">
        <span class="diary-calendar-mark" aria-hidden="true"></span>
        <span>{{ month }}</span>
        <span class="diary-control-chevron" aria-hidden="true">⌄</span>
      </button>
      <button class="diary-filter-control" data-testid="btn-diary-filter" @click="filterOpen = true">
        <span class="diary-filter-mark" aria-hidden="true"></span>
        筛选
      </button>
    </div>

    <div class="diary-timeline">
      <article
        v-for="(diary, index) in diaries"
        :key="diary.id"
        class="diary-card"
        :data-testid="index === 0 ? 'diary-card-first' : `diary-card-${diary.id}`"
      >
        <button class="diary-main" @click="openDiary(diary)">
          <span class="diary-entry-visual" aria-hidden="true">
            <img
              v-if="diary.attachments?.length"
              class="diary-entry-image"
              :src="resolveApiUrl(diary.attachments[0].url)"
              alt=""
            >
            <span v-else class="diary-entry-placeholder">✦</span>
          </span>
          <span class="diary-entry-copy">
            <span class="diary-entry-heading">
              <span class="diary-entry-date">{{ diaryDate(diary.createdAt).day }}</span>
              <span class="tag">{{ diary.emotionLabel || diary.emotion || '心情' }}</span>
            </span>
            <strong>{{ diary.content }}</strong>
            <small>{{ diaryDate(diary.createdAt).time }} · 晚安树洞</small>
          </span>
        </button>
        <button
          v-if="diary.hasLetter"
          class="diary-letter-action"
          :data-testid="index === 0 ? 'diary-letter-first' : `diary-letter-${diary.id}`"
          @click="openLetter(diary)"
        >
          <span class="diary-letter-icon" aria-hidden="true">✉</span>
          <span>已有回信</span>
        </button>
        <span v-else class="diary-letter-state">
          <span class="diary-letter-icon" aria-hidden="true">✉</span>
          <span>暂无回信</span>
        </span>
      </article>
      <article v-if="!diaries.length" class="empty-card" data-testid="diary-empty-state">
        <span class="empty-diary-mark" aria-hidden="true"><span>✦</span></span>
        <div class="empty-diary-copy">
          <strong>{{ emotion || hasLetter ? '没有符合筛选的日记' : `${month} 还没有日记` }}</strong>
          <p>{{ emotion || hasLetter ? '可以调整筛选条件，或写下一篇新的日记。' : '写下一点今天的心情，它会在这里长成记录。' }}</p>
        </div>
      </article>
    </div>

    <button class="primary diary-write-cta" data-testid="btn-new-diary" @click="router.push('/pages/mood/create')">
      <span aria-hidden="true">✎</span>
      写新日记
    </button>

    <div class="sheet-mask" v-if="monthOpen">
      <div class="sheet menu-sheet">
        <h2>选择月份</h2>
        <button v-for="value in availableMonths" :key="value" :data-testid="`diary-month-${value}`" @click="selectMonth(value)">{{ value.replace('-', ' 年 ') }} 月</button>
        <p v-if="!availableMonths.length" class="muted">暂时没有可选择的日记月份</p>
      </div>
    </div>

    <div class="sheet-mask" v-if="filterOpen">
      <div class="sheet menu-sheet">
        <h2>筛选日记</h2>
        <div class="style-row">
          <button data-testid="filter-diary-emotion-all" :class="{ primary: !emotion }" @click="emotion = ''">全部</button>
          <button data-testid="filter-diary-emotion-jiaolv" :class="{ primary: emotion === '焦虑' }" @click="emotion = '焦虑'">焦虑</button>
          <button data-testid="filter-diary-emotion-weiqu" :class="{ primary: emotion === '委屈' }" @click="emotion = '委屈'">委屈</button>
          <button data-testid="filter-diary-emotion-shimian" :class="{ primary: emotion === '失眠' }" @click="emotion = '失眠'">失眠</button>
        </div>
        <div class="style-row">
          <button data-testid="filter-diary-letter-all" :class="{ primary: !hasLetter }" @click="hasLetter = ''">不限回信</button>
          <button data-testid="filter-diary-letter-true" :class="{ primary: hasLetter === 'true' }" @click="hasLetter = 'true'">已有回信</button>
          <button data-testid="filter-diary-letter-false" :class="{ primary: hasLetter === 'false' }" @click="hasLetter = 'false'">暂无回信</button>
        </div>
        <div class="sheet-actions">
          <button data-testid="btn-diary-filter-reset" @click="resetFilter">重置</button>
          <button class="primary" data-testid="btn-diary-filter-confirm" @click="confirmFilter">确认筛选</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* The empty result is an honest state of the persisted diary query.  This
   local treatment gives it the same calm reading rhythm as the supplied
   diary reference without rendering sample diary entries or illustrations. */
.diary-list-page.is-empty {
  gap: 9px;
  padding-bottom: calc(148px + env(safe-area-inset-bottom));
}

.diary-list-page.is-empty .rest-topbar {
  height: 74px;
  min-height: 74px;
  margin-top: 0;
}

.diary-list-page.is-empty .rest-topbar h1 {
  font-size: 23px;
  letter-spacing: 0.06em;
}

.diary-list-page.is-empty .diary-intro {
  min-height: 48px;
  max-width: 270px;
  margin-top: -17px;
}

.diary-list-page.is-empty .diary-intro p {
  font-size: 14px;
  line-height: 1.62;
  letter-spacing: 0.04em;
}

.diary-list-page.is-empty .diary-intro > span {
  margin-right: 8px;
  color: #849a5c;
  font-size: 19px;
}

.diary-list-page.is-empty .diary-controls {
  min-height: 48px;
  gap: 10px;
  padding-top: 0;
}

.diary-list-page.is-empty .diary-month-control,
.diary-list-page.is-empty .diary-filter-control {
  min-height: 48px;
  height: 48px;
  border-color: rgba(183, 171, 128, 0.28);
  border-radius: 24px;
  background: rgba(255, 253, 246, 0.94);
  box-shadow: 0 8px 20px rgba(92, 90, 64, 0.06);
}

.diary-list-page.is-empty .diary-month-control {
  flex: 0 0 148px;
  width: 148px;
}

.diary-list-page.is-empty .diary-filter-control {
  flex: 0 0 98px;
  width: 98px;
}

.diary-list-page.is-empty .diary-timeline {
  gap: 12px;
}

.diary-list-page.is-empty .empty-card {
  position: relative;
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr);
  align-items: center;
  gap: 15px;
  min-height: 164px;
  padding: 19px 18px;
  border-color: rgba(224, 220, 197, 0.82);
  border-radius: 24px;
  background:
    radial-gradient(circle at 90% 14%, rgba(240, 229, 185, 0.3), transparent 31%),
    rgba(255, 254, 249, 0.96);
  box-shadow: 0 12px 26px rgba(76, 90, 62, 0.07);
}

.diary-list-page.is-empty .empty-card::after {
  position: absolute;
  right: 12px;
  bottom: 8px;
  width: 62px;
  height: 62px;
  background: url('../assets/goodnight/growth-leaves.png') right bottom / contain no-repeat;
  content: '';
  opacity: .42;
  pointer-events: none;
}

.diary-list-page.is-empty .empty-diary-copy {
  position: relative;
  z-index: 1;
}

.empty-diary-mark {
  display: grid;
  width: 58px;
  height: 58px;
  place-items: center;
  border: 1px solid rgba(137, 155, 96, 0.24);
  border-radius: 50% 50% 50% 13px;
  background:
    radial-gradient(circle at 70% 28%, rgba(255, 245, 205, 0.9), transparent 26%),
    linear-gradient(145deg, #fbf7e9, #edf4e8);
  color: #779259;
  font-size: 25px;
  transform: rotate(-10deg);
}

.empty-diary-mark > span {
  display: block;
  transform: rotate(10deg);
}

.empty-diary-copy {
  display: grid;
  min-width: 0;
  gap: 7px;
}

.diary-list-page.is-empty .empty-card strong {
  color: #46623c;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
}

.diary-list-page.is-empty .empty-card p {
  color: #6e7c68;
  font-size: 13px;
  line-height: 1.62;
}

.diary-list-page.is-empty .diary-write-cta {
  bottom: calc(64px + env(safe-area-inset-bottom));
  width: min(400px, calc(100vw - 32px));
  min-height: 48px;
  border-radius: 25px;
}

@media (max-width: 374px) {
  .diary-list-page.is-empty .diary-month-control {
    flex-basis: 148px;
  }

  .diary-list-page.is-empty .diary-filter-control {
    flex-basis: 82px;
  }

  .diary-list-page.is-empty .empty-card {
    grid-template-columns: 54px minmax(0, 1fr);
    gap: 12px;
    min-height: 142px;
    padding-inline: 15px;
  }

  .empty-diary-mark {
    width: 52px;
    height: 52px;
    font-size: 22px;
  }
}
</style>
