<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const letters = ref<any[]>([]);
const filter = ref<'all' | 'unread' | 'favorited'>('all');

const styleNames: Record<string, string> = {
  warm: '温柔陪伴',
  rational: '理性分析',
  light: '轻松一点',
  poetic: '诗意疗愈',
  clear: '清醒提醒',
};

function dateLabel(value?: string) {
  const date = new Date(value ?? '');
  if (Number.isNaN(date.getTime())) return '刚刚';
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

function sourceLabel(letter: any) {
  return letter.sourceMoodId ? '来自一则真实心情记录' : '来自晚安树洞';
}

async function load(next = filter.value) {
  filter.value = next;
  const query = next === 'all' ? '' : `?status=${next}`;
  letters.value = (await api.get<any>(`/api/v1/letters${query}`)).items;
}

async function readFull(letter: any) {
  await api.patch(`/api/v1/letters/${letter.id}/read`, {});
  router.push(`/pages/letter/detail?id=${encodeURIComponent(letter.id)}`);
}

async function favoriteLetter(letter: any) {
  if (letter.favorite) await api.delete(`/api/v1/letters/${letter.id}/favorite`);
  else await api.post(`/api/v1/letters/${letter.id}/favorite`);
  await load();
}

async function likeLetter(letter: any) {
  const res = await api.post<any>(`/api/v1/letters/${letter.id}/like`);
  Object.assign(letter, res.item);
}

onMounted(load);
</script>

<template>
  <section class="page goodnight-page rest-page list-page letter-list-page">
    <header class="letter-list-hero">
      <button class="back-icon" data-testid="front-letter-list-back" aria-label="返回" @click="router.back()">‹</button>
      <div class="letter-list-heading"><h1>我的回信</h1></div>
    </header>

    <div class="segmented-tabs letter-list-tabs" aria-label="回信筛选">
      <button data-testid="filter-letter-all" :class="{ active: filter === 'all' }" @click="load('all')">全部</button>
      <button data-testid="filter-letter-unread" :class="{ active: filter === 'unread' }" @click="load('unread')">未读</button>
      <button data-testid="filter-letter-fav" :class="{ active: filter === 'favorited' }" @click="load('favorited')">已收藏</button>
    </div>

    <!--
      An inbox, not a stack of envelopes: unread dot, style, date, a one-line excerpt, and where the
      letter came from. The full text lives in the detail page, which is what "操作在详情，列表清爽"
      asks for. The portrait and the right-hand illustration are gone - they were the ink excess the
      audit measured (21% against the design's 4.8%).
    -->
    <article
      v-for="(letter, index) in letters"
      :key="letter.id"
      class="letter-row"
      :class="{ unread: letter.status === 'unread' }"
      :data-testid="index === 0 ? 'letter-card-first' : `letter-card-${letter.id}`"
      @click="readFull(letter)"
    >
      <i v-if="letter.status === 'unread'" class="letter-unread-dot" aria-label="未读"></i>
      <div class="letter-row-copy">
        <div class="letter-row-meta">
          <strong class="letter-row-title">{{ letter.title || '给今晚的你' }}</strong>
          <span class="letter-row-style">{{ styleNames[letter.style] ?? '温柔回信' }}</span>
        </div>
        <p class="letter-row-excerpt">{{ letter.content }}</p>
        <div class="letter-row-foot">
          <span class="letter-row-source">{{ sourceLabel(letter) }}</span>
          <time :data-visual-mask="index === 0 ? 'time' : undefined">{{ dateLabel(letter.createdAt) }}</time>
        </div>
      </div>
      <div class="letter-row-actions" @click.stop>
        <button
          :data-testid="index === 0 ? 'btn-letter-like-first' : `btn-letter-like-${letter.id}`"
          :aria-label="letter.likedByCurrentUser ? '取消喜欢' : '喜欢'"
          @click="likeLetter(letter)"
        >
          ♡ {{ letter.likeCount ?? 0 }}
        </button>
        <button
          :data-testid="index === 0 ? 'btn-letter-list-fav' : `btn-letter-list-fav-${letter.id}`"
          @click="favoriteLetter(letter)"
        >
          {{ letter.favorite ? '已收藏' : '收藏' }}
        </button>
      </div>
    </article>

    <article v-if="!letters.length" class="empty-card letter-list-empty">
      <strong>还没有符合条件的回信</strong>
      <p>写下一次心情后，新的回信会出现在这里。</p>
      <button class="primary" @click="router.push('/pages/mood/create')">写下心情</button>
    </article>
  </section>
</template>

<style scoped>
/* An inbox: white rows separated by hairlines, the unread dot carrying the only accent colour, and
   the title as the strongest element. The old card reserved a 66px portrait column and a 76px
   illustration column, which is what made three rows of body text fill the screen. */
.letter-list-page .letter-list-hero {
  min-height: 64px;
  padding-top: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e8eaed;
}

.letter-list-page .letter-list-heading { margin-top: 0; }
.letter-list-page .letter-list-heading h1 { font-size: 21px; font-weight: 700; letter-spacing: -0.4px; }
.letter-list-page .letter-list-heading p { display: none; }

.letter-list-page .segmented-tabs {
  margin: 12px 0 0;
  border-bottom: 1px solid #e8eaed;
}

.letter-row {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  padding: 14px 20px 12px;
  border-bottom: 1px solid #e8eaed;
  background: #ffffff;
}

.letter-unread-dot {
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background: #275f56;
}

.letter-row-copy { min-width: 0; }

.letter-row-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.letter-row-title {
  color: #242a32;
  font-size: 14.5px;
  font-weight: 650;
  line-height: 1.4;
}

.letter-row-style {
  flex: 0 0 auto;
  color: #818993;
  font-size: 11px;
}

/* The excerpt is the letter's own text, clamped to two lines - the full reply is the detail page. */
.letter-row-excerpt {
  display: -webkit-box;
  overflow: hidden;
  margin: 5px 0 0;
  color: #58616b;
  font-size: 12.5px;
  line-height: 1.6;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.letter-row-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 8px;
  color: #88909a;
  font-size: 11px;
}

.letter-row-source { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Secondary actions: quiet until touched, and never wider than the row. */
.letter-row-actions {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
}

.letter-row-actions button {
  min-height: 28px;
  padding: 4px 9px;
  border: 1px solid #e4e7ea;
  border-radius: 8px;
  background: #ffffff;
  color: #606a74;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
}

.letter-row-actions button:active { background: #f4f6f7; }

.letter-list-empty {
  margin: 22px 20px;
  padding: 18px;
  border: 1px solid #e8eaed;
  border-radius: 10px;
  background: #ffffff;
}

.letter-list-empty strong { color: #242a32; font-size: 14px; }
.letter-list-empty p { margin: 6px 0 12px; color: #7a838e; font-size: 12.5px; line-height: 1.6; }
</style>
