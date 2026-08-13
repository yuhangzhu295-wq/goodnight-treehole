<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const items = ref<any[]>([]);
const filter = ref<'letter' | 'post' | 'diary'>('letter');
const loading = ref(true);

function sourceLabel(item: any) {
  if (item.targetType === 'post') return '来自匿名树洞';
  if (item.targetType === 'diary') return '来自我的日记';
  return '来自晚安树洞';
}

function dateLabel(value?: string) {
  const date = new Date(value ?? '');
  if (Number.isNaN(date.getTime())) return '刚刚收藏';
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

async function load(next = filter.value) {
  loading.value = true;
  filter.value = next;
  try {
    items.value = (await api.get<any>(`/api/v1/favorites?type=${next}`)).items;
  } finally {
    loading.value = false;
  }
}

function openItem(item: any) {
  if (item.targetType === 'post') router.push(`/pages/post/detail?id=${encodeURIComponent(item.targetId)}`);
  if (item.targetType === 'letter') router.push(`/pages/letter/detail?id=${encodeURIComponent(item.targetId)}`);
  if (item.targetType === 'diary') router.push(`/pages/diary/detail?id=${encodeURIComponent(item.targetId)}`);
}

async function removeFavorite(item: any) {
  await api.delete(`/api/v1/favorites/${item.id}`);
  await load();
}

onMounted(load);
</script>

<template>
  <section class="page goodnight-page rest-page list-page favorite-list-page">
    <header class="favorite-list-hero">
      <button class="back-icon" data-testid="front-favorite-back" aria-label="返回" @click="router.back()">‹</button>
      <div class="favorite-list-heading"><h1>我的收藏</h1><p>把让你感到温暖的内容轻轻收好</p></div>
    </header>

    <div class="segmented-tabs favorite-list-tabs" aria-label="收藏筛选">
      <button data-testid="filter-fav-letter" :class="{ active: filter === 'letter' }" @click="load('letter')"><span class="favorite-tab-icon" aria-hidden="true">✉</span><span>回信</span></button>
      <button data-testid="filter-fav-post" :class="{ active: filter === 'post' }" @click="load('post')"><span class="favorite-tab-icon" aria-hidden="true">♧</span><span>树洞</span></button>
      <button data-testid="filter-fav-diary" :class="{ active: filter === 'diary' }" @click="load('diary')"><span class="favorite-tab-icon" aria-hidden="true">▤</span><span>日记</span></button>
    </div>

    <article
      v-for="(item, index) in items"
      :key="item.id"
      class="favorite-card"
      :data-testid="index === 0 ? 'favorite-card-first' : `favorite-card-${item.id}`"
    >
      <button class="favorite-main" @click="openItem(item)">
        <span class="favorite-illustration" :class="`is-${item.targetType}`" aria-hidden="true"></span>
        <span class="favorite-copy">
          <span class="favorite-source">来自 <b>{{ sourceLabel(item).replace('来自', '') }}</b></span>
          <strong>{{ item.title }}</strong>
          <span class="favorite-preview">{{ item.preview }}</span>
          <small>{{ dateLabel(item.createdAt) }}</small>
        </span>
      </button>
      <button
        class="favorite-remove"
        :data-testid="index === 0 ? 'btn-favorite-remove' : `btn-favorite-remove-${item.id}`"
        :disabled="loading"
        @click="removeFavorite(item)"
      >
        <span aria-hidden="true">☆</span>已收藏
      </button>
    </article>

    <article v-if="!items.length" class="empty-card favorite-list-empty">
      <strong>这里暂时空空的</strong>
      <p>你收藏的回信、树洞和日记会按类型出现在这里。</p>
    </article>

    <p class="favorite-list-slogan">每一份被收藏的温柔，都会在需要时陪你</p>
  </section>
</template>

<style scoped>
/* Keep both populated cards and the genuine empty state on the same card
   gutter. This changes only composition, never the favorite query result. */
.favorite-list-page .favorite-card,
.favorite-list-page .favorite-list-empty,
.favorite-list-page .favorite-list-slogan {
  margin-inline: 3px;
}

/* Preserve the actual favorite query result while returning the header and
   per-record card scale to the reference handset composition. */
.favorite-list-page .favorite-list-hero {
  min-height: 148px;
  padding-top: 16px;
  padding-bottom: 10px;
}

.favorite-list-page .favorite-list-heading { margin-top: 17px; }
.favorite-list-page .favorite-list-heading h1 { font-size: 38px; }
.favorite-list-page .favorite-list-heading p { margin-top: 8px; }

.favorite-list-page .favorite-card,
.favorite-list-page .favorite-main { min-height: 112px; }

.favorite-list-page .favorite-main {
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 11px;
  padding: 13px;
}

.favorite-list-page .favorite-illustration {
  width: 76px;
  height: 76px;
}

.favorite-list-page .favorite-list-empty { min-height: 150px; }

@media (max-width: 374px) {
  .favorite-list-page .favorite-list-hero { min-height: 140px; }
  .favorite-list-page .favorite-list-heading h1 { font-size: 34px; }
  .favorite-list-page .favorite-main { grid-template-columns: 64px minmax(0, 1fr); }
  .favorite-list-page .favorite-illustration { width: 64px; height: 64px; }
}
</style>
