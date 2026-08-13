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
      <div class="letter-list-heading"><h1>我的回信</h1><p>收到的每一封温柔回应，都值得被收藏</p></div>
    </header>

    <div class="segmented-tabs letter-list-tabs" aria-label="回信筛选">
      <button data-testid="filter-letter-all" :class="{ active: filter === 'all' }" @click="load('all')">全部</button>
      <button data-testid="filter-letter-unread" :class="{ active: filter === 'unread' }" @click="load('unread')">未读</button>
      <button data-testid="filter-letter-fav" :class="{ active: filter === 'favorited' }" @click="load('favorited')">已收藏</button>
    </div>

    <article
      v-for="(letter, index) in letters"
      :key="letter.id"
      class="letter-list-card"
      :data-testid="index === 0 ? 'letter-card-first' : `letter-card-${letter.id}`"
    >
      <span class="letter-card-portrait" aria-hidden="true"></span>
      <div class="letter-card-copy">
        <div class="letter-card-meta">
          <span class="tag" :class="{ pink: letter.status === 'unread' }">{{ styleNames[letter.style] ?? '温柔回信' }}</span>
          <time :data-visual-mask="index === 0 ? 'time' : undefined">{{ dateLabel(letter.createdAt) }}</time>
          <i v-if="letter.status === 'unread'" class="letter-unread-dot" aria-label="未读"></i>
        </div>
        <small>{{ sourceLabel(letter) }}</small>
        <strong>{{ letter.title || '给今晚的你' }}</strong>
        <p>{{ letter.content }}</p>
        <div class="letter-card-actions">
          <button
            :data-testid="index === 0 ? 'btn-letter-like-first' : `btn-letter-like-${letter.id}`"
            @click="likeLetter(letter)"
          >
            ♡ {{ letter.likeCount ?? 0 }}
          </button>
          <button
            :data-testid="index === 0 ? 'btn-letter-list-fav' : `btn-letter-list-fav-${letter.id}`"
            @click="favoriteLetter(letter)"
          >
            ☆ {{ letter.favorite ? '已收藏' : '收藏' }}
          </button>
          <button
            :data-testid="index === 0 ? 'btn-letter-read-full-first' : `btn-letter-read-full-${letter.id}`"
            @click="readFull(letter)"
          >
            查看全文 ›
          </button>
        </div>
      </div>
      <span class="letter-card-illustration" aria-hidden="true"></span>
    </article>

    <article v-if="!letters.length" class="empty-card letter-list-empty">
      <strong>还没有符合条件的回信</strong>
      <p>写下一次心情后，新的回信会出现在这里。</p>
      <button class="primary" @click="router.push('/pages/mood/create')">写下心情</button>
    </article>
  </section>
</template>

<style scoped>
/* The data-driven cards retain their complete live copy; the small inset
   simply aligns a real one-letter state with the shared handset card grid. */
.letter-list-page .letter-list-card {
  margin-inline: 7px;
}

.letter-list-page .letter-card-copy > strong {
  font-weight: 600;
}

/* Let the live reply cards keep the breathing room of the reference rather
   than collapsing their source, actions and illustration into one short row. */
.letter-list-page .letter-list-hero {
  min-height: 150px;
  padding-top: 16px;
  padding-bottom: 11px;
}

.letter-list-page .letter-list-heading { margin-top: 15px; }
.letter-list-page .letter-list-heading h1 { font-size: 38px; }
.letter-list-page .letter-list-heading p { margin-top: 8px; }

.letter-list-page .letter-list-card {
  min-height: 140px;
  grid-template-columns: 66px minmax(0, 1fr) 76px;
  padding: 12px 10px;
}

.letter-list-page .letter-card-portrait {
  width: 66px;
  height: 66px;
}

.letter-list-page .letter-card-illustration {
  width: 76px;
  height: 76px;
}

@media (max-width: 374px) {
  .letter-list-page .letter-list-hero { min-height: 142px; }
  .letter-list-page .letter-list-heading h1 { font-size: 34px; }
  .letter-list-page .letter-list-card {
    min-height: 132px;
    grid-template-columns: 58px minmax(0, 1fr) 64px;
  }
  .letter-list-page .letter-card-portrait { width: 58px; height: 58px; }
  .letter-list-page .letter-card-illustration { width: 64px; height: 64px; }
}
</style>
