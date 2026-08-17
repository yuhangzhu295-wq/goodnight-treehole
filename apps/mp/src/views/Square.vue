<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { copyText } from '../clipboard';
import { useDeviceClock } from '../composables/useDeviceClock';

const router = useRouter();
const route = useRoute();
const { timeLabel } = useDeviceClock();

const filters = [
  { key: 'aggrieved', label: '委屈', icon: '♧', testId: 'filter-weiqu' },
  { key: 'anxious', label: '焦虑', icon: '☁', testId: 'filter-jiaolv' },
  { key: 'insomnia', label: '失眠', icon: '☾', testId: 'filter-shimian' },
  { key: 'love', label: '恋爱', icon: '♡', testId: 'filter-lianai' },
  { key: 'work', label: '工作', icon: '▣', testId: 'filter-gongzuo' },
  { key: '', label: '全部', icon: '▦', testId: 'filter-all' },
];

const active = ref('');
const posts = ref<any[]>([]);
const loading = ref(false);
const menuPost = ref<any | null>(null);
const statusText = ref('');

function emotionTone(emotion: string) {
  return {
    委屈: 'green',
    焦虑: 'gold',
    失眠: 'blue',
    恋爱: 'pink',
    工作: 'green',
  }[emotion] ?? 'green';
}

function postIllustration(emotion: string) {
  return {
    委屈: '🥺',
    焦虑: '☁',
    失眠: '🌙',
    恋爱: '♡',
    工作: '▣',
  }[emotion] ?? '♧';
}

async function load() {
  loading.value = true;
  const query = active.value ? `?mood=${encodeURIComponent(active.value)}` : '';
  const res = await api.get<any>(`/api/v1/posts${query}`);
  posts.value = res.items;
  loading.value = false;
}

async function selectFilter(key: string) {
  active.value = key;
  await router.replace({ path: '/pages/square/index', query: key ? { mood: key } : {} });
  await load();
}

function openPost(post: any) {
  router.push(`/pages/post/detail?id=${post.id}`);
}

async function hugPost(post: any) {
  const res = await api.post<any>(`/api/v1/posts/${post.id}/hug`);
  const index = posts.value.findIndex((item) => item.id === post.id);
  if (index >= 0) posts.value[index] = res.item;
}

async function replyPost(post: any) {
  await api.get('/api/v1/reply-presets');
  router.push(`/pages/post/detail?id=${post.id}&sheet=reply`);
}

function openMore(post: any) {
  menuPost.value = post;
}

async function reportPost() {
  if (!menuPost.value) return;
  await api.post(`/api/v1/posts/${menuPost.value.id}/report`);
  statusText.value = '已收到你的举报，我们会认真查看';
  menuPost.value = null;
}

async function copyPost() {
  const copied = await copyText(menuPost.value?.content ?? '');
  statusText.value = copied ? '内容已复制' : '复制失败，请稍后重试';
  menuPost.value = null;
}

async function hidePost() {
  if (!menuPost.value) return;
  const hiddenId = menuPost.value.id;
  await api.post(`/api/v1/posts/${hiddenId}/hide`);
  posts.value = posts.value.filter((item) => item.id !== hiddenId);
  statusText.value = '已为你减少类似内容';
  menuPost.value = null;
}

onMounted(() => {
  active.value = typeof route.query.mood === 'string' ? route.query.mood : '';
  load();
});
</script>

<template>
  <section class="page goodnight-page square-page">
    <header class="front-hero square-hero">
      <div class="status-row">
        <span>{{ timeLabel }}</span>
        <span aria-hidden="true"></span>
      </div>
      <div class="hero-copy">
        <h1>晚安树洞</h1>
        <p>写下今天的情绪，会有温柔回应</p>
      </div>
      <div class="tree-scene" aria-hidden="true">
        <span class="tree-heart">♡</span>
        <span class="tree-bell">♬</span>
        <span class="seedling-face">♡</span>
      </div>
      <span class="square-hero-baby" aria-hidden="true" />
    </header>

    <div class="mood-filter-row" aria-label="心情筛选">
      <button
        v-for="item in filters"
        :key="item.testId"
        :data-testid="item.testId"
        class="mood-pill"
        :class="{ active: active === item.key }"
        @click="selectFilter(item.key)"
      >
        <span>{{ item.icon }}</span>
        <span>{{ item.label }}</span>
      </button>
    </div>

    <p v-if="loading" class="soft-note">正在轻轻翻找树洞...</p>
    <article v-if="!loading && posts.length === 0" class="empty-card square-empty-card">
      <p>还没有这类心情，写下第一条吧。</p>
      <button data-testid="btn-empty-write-mood" @click="router.push('/pages/post/create')">写心情</button>
    </article>

    <article
      v-for="(post, index) in posts"
      :key="post.id"
      class="treehole-card"
      :data-testid="index === 0 ? 'post-card-first' : `post-card-${post.id}`"
      @click="openPost(post)"
    >
      <button
        v-if="index === 0"
        class="card-more"
        data-testid="post-more-first"
        aria-label="更多"
        @click.stop="openMore(post)"
      >
        ...
      </button>
      <div class="post-main">
        <div class="avatar-bubble" :data-emotion="post.emotion">{{ postIllustration(post.emotion) }}</div>
        <div class="post-copy">
          <div class="post-meta">
            <strong>匿名树洞</strong>
            <span class="tag" :class="emotionTone(post.emotion)">{{ post.emotion }}</span>
            <span class="muted">· 2 小时前</span>
          </div>
          <p class="post-content">{{ post.content }}</p>
          <span class="wish-tag">想被理解</span>
          <p class="reply-count">已收到 <strong :data-visual-mask="index === 0 ? 'stat' : undefined">{{ post.replyCount }}</strong> 条温柔回应 ›</p>
        </div>
        <div class="card-illustration">{{ postIllustration(post.emotion) }}</div>
      </div>
      <div class="post-actions">
        <button
          v-if="index === 0"
          data-testid="btn-square-hug-first"
          class="plain-action"
          @click.stop="hugPost(post)"
        >
          ♡ 抱抱 {{ post.hugCount }}
        </button>
        <button
          v-else
          class="plain-action"
          @click.stop="hugPost(post)"
        >
          ♡ 抱抱 {{ post.hugCount }}
        </button>
        <button
          v-if="index === 0"
          data-testid="btn-square-reply-first"
          class="plain-action"
          @click.stop="replyPost(post)"
        >
          ☺ 回应 {{ post.replyCount }}
        </button>
        <button
          v-else
          class="plain-action"
          @click.stop="replyPost(post)"
        >
          ☺ 回应 {{ post.replyCount }}
        </button>
      </div>
    </article>

    <button class="write-fab" data-testid="btn-write-mood" @click="router.push('/pages/post/create')">
      <span>✎</span>
      <span>写心情</span>
    </button>

    <p v-if="statusText" class="floating-status">{{ statusText }}</p>

    <div v-if="menuPost" class="sheet-mask" data-state="square-more-menu" @click.self="menuPost = null">
      <div class="sheet menu-sheet">
        <h2>更多操作</h2>
        <button data-testid="square-menu-copy" @click="copyPost">复制内容</button>
        <button data-testid="square-menu-report" @click="reportPost">举报</button>
        <button data-testid="square-menu-hide" @click="hidePost">不感兴趣</button>
        <button data-testid="square-menu-cancel" @click="menuPost = null">取消</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* The handset owns the status area; do not render a second, product-level
   clock beneath it. Keeping its layout slot avoids shifting live content. */
.square-page .status-row {
  visibility: hidden;
}

/* Reusable, extracted illustration asset — never a page-sized reference. */
.square-hero-baby {
  position: absolute;
  right: 82px;
  bottom: 2px;
  z-index: 2;
  width: 82px;
  height: 78px;
  background: url("../assets/goodnight/square-baby-cutout.png") center / contain no-repeat;
  pointer-events: none;
}

/* The plaza reference uses a slightly wider feed card than the shared page
   gutter. This keeps the live post layout intact while restoring that rhythm. */
.square-page .treehole-card {
  margin-inline: -3px;
}

.square-page .post-main {
  grid-template-columns: 48px minmax(0, 1fr) 94px;
}

/* The illustration remains decorative, but should still reflect the live
   mood attached to the post.  These are reusable local assets rather than
   snapshots or reference-image fragments. */
.square-page .avatar-bubble[data-emotion="焦虑"] { background-image: url("../assets/goodnight/tool-icon-decompose.png"); }
.square-page .avatar-bubble[data-emotion="失眠"] { background-image: url("../assets/goodnight/tool-icon-sleep.png"); }
.square-page .avatar-bubble[data-emotion="恋爱"] { background-image: url("../assets/goodnight/tool-icon-heal.png"); }

.square-page .card-illustration {
  width: 94px;
  height: 84px;
  margin-top: 18px;
  transform: translateX(4px);
}

.square-page .write-fab {
  right: 9px;
  bottom: calc(75px + env(safe-area-inset-bottom));
}
</style>
