<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { copyText } from '../clipboard';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

const router = useRouter();
const route = useRoute();

const active = ref('');
const posts = ref<any[]>([]);
const loading = ref(false);
const loadError = ref('');
const menuPost = ref<any | null>(null);
const statusText = ref('');

/**
 * The filter chips. Their `key` is what goes into the route query and the API's `mood` parameter;
 * the API maps these keys to the stored emotion (`anxious` → `焦虑`), so the English keys are the
 * contract and are kept as they were.
 */
const filters = [
  { key: 'aggrieved', label: '委屈', testId: 'filter-weiqu' },
  { key: 'anxious', label: '焦虑', testId: 'filter-jiaolv' },
  { key: 'insomnia', label: '失眠', testId: 'filter-shimian' },
  { key: 'love', label: '恋爱', testId: 'filter-lianai' },
  { key: 'work', label: '工作', testId: 'filter-gongzuo' },
  { key: '', label: '全部', testId: 'filter-all' },
];

/** The post's real creation time. This read a hardcoded "2 小时前", which is a mock value. */
function relativeTime(value: string) {
  if (!value) return '时间未记录';
  const parsed = Date.parse(value);
  // An unparseable timestamp used to flow through every comparison as NaN and end in
  // `Intl.DateTimeFormat.format(Invalid Date)`, which throws and takes the whole feed down with it.
  if (!Number.isFinite(parsed)) return '时间未记录';
  const minutes = Math.floor((Date.now() - parsed) / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value));
}

/**
 * The row's leading mark.
 *
 * The design shows a letter from an anonymous nickname ("北", "原"), but the public Post carries no
 * author identifier at all - `anonymousCode`/`authorCode` are not in its response - so deriving one
 * would either read a field that does not exist (always the same fallback character) or invent an
 * identity. The emotion the post actually carries is used instead: it is real data, it distinguishes
 * rows visually, and it claims nothing about who wrote them.
 */
function emotionMark(emotion: string) {
  return { 委屈: '委屈', 焦虑: '焦虑', 失眠: '失眠', 恋爱: '恋爱', 工作: '工作' }[emotion] ?? '树洞';
}

/**
 * Guards against a slow earlier response overwriting a newer filter's result.
 *
 * Switching filters twice in quick succession issues two requests; without a sequence number the
 * first one to *finish* wins, which can leave the feed showing the filter the user already left. Each
 * call takes a ticket and only the newest ticket is allowed to write state.
 */
let loadSeq = 0;

/**
 * The design's two feed orders. Both are real server-side orders: `latest` is publication order and
 * `hot` ranks by the hugs and replies the community actually left, which is why the tabs exist at all.
 */
const sort = ref<'latest' | 'hot'>('latest');

function selectSort(next: 'latest' | 'hot') {
  if (sort.value === next) return;
  sort.value = next;
  void load();
}

async function load() {
  const ticket = ++loadSeq;
  loading.value = true;
  loadError.value = '';
  try {
    const params = new URLSearchParams();
    if (active.value) params.set('mood', active.value);
    params.set('sort', sort.value);
    const res = await api.get<any>(`/api/v1/posts?${params.toString()}`);
    if (ticket !== loadSeq) return;
    posts.value = res.items ?? [];
  } catch (cause) {
    // Without this the spinner never stops: `loading` was set true above and only cleared on the
    // success path, so a failed request left the page spinning forever with no way to retry.
    if (ticket !== loadSeq) return;
    posts.value = [];
    loadError.value = cause instanceof Error ? cause.message : '内容加载失败，请稍后重试';
  } finally {
    if (ticket === loadSeq) loading.value = false;
  }
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
    <!-- The design's header is a bare chevron and the page title. The V1 hero drew its own status
         bar with a live clock inside the app, which is decoration, not chrome. -->
    <header class="square-bar">
      <button class="square-back" type="button" aria-label="返回" @click="router.back()">‹</button>
      <h1 class="square-bar-title">广场</h1>
    </header>

    <!-- Two real orders: publication time, and what the community actually responded to. -->
    <div class="square-sorts" role="tablist" aria-label="内容排序">
      <button
        type="button"
        role="tab"
        class="square-sort"
        :class="{ active: sort === 'latest' }"
        :aria-selected="sort === 'latest'"
        data-testid="square-sort-latest"
        @click="selectSort('latest')"
      >最新</button>
      <button
        type="button"
        role="tab"
        class="square-sort"
        :class="{ active: sort === 'hot' }"
        :aria-selected="sort === 'hot'"
        data-testid="square-sort-hot"
        @click="selectSort('hot')"
      >热门</button>
    </div>

    <p class="square-notice">公开内容经过审核后才能被其他人看到</p>

    <div class="mood-filter-row" aria-label="心情筛选">
      <button
        v-for="item in filters"
        :key="item.testId"
        :data-testid="item.testId"
        class="mood-pill"
        :class="{ active: active === item.key }"
        @click="selectFilter(item.key)"
      >
        <span>{{ item.label }}</span>
      </button>
    </div>

    <p v-if="loading" class="soft-note">正在轻轻翻找树洞...</p>
    <LoadErrorBanner v-else-if="loadError" :message="loadError" retry-label="重新加载" @retry="load" />
    <p v-else-if="posts.length === 0" class="square-empty">
      还没有这类心情，<button data-testid="btn-empty-write-mood" class="link-btn" @click="router.push('/pages/post/create')">写下第一条</button>吧。
    </p>

    <article
      v-for="(post, index) in posts"
      :key="post.id"
      class="post-row"
      :data-testid="index === 0 ? 'post-card-first' : `post-card-${post.id}`"
      @click="openPost(post)"
    >
      <div class="post-head">
        <span class="post-avatar" :data-emotion="post.emotion" aria-hidden="true">{{ emotionMark(post.emotion) }}</span>
        <div class="post-who">
          <strong class="post-author">匿名树洞</strong>
          <span class="post-meta">{{ post.emotion }} · {{ relativeTime(post.createdAt) }}</span>
        </div>
        <button
          class="post-more"
          :data-testid="index === 0 ? 'post-more-first' : `post-more-${post.id}`"
          aria-label="更多"
          @click.stop="openMore(post)"
        >
          ···
        </button>
      </div>
      <p class="post-content">{{ post.content }}</p>
      <div class="post-foot">
        <span class="post-stat">{{ post.replyCount ? `${post.replyCount} 条回应` : '暂无回应' }}</span>
        <span class="post-acts">
          <button
            class="plain-action"
            :data-testid="index === 0 ? 'btn-square-hug-first' : `btn-square-hug-${post.id}`"
            @click.stop="hugPost(post)"
          >
            ♡ {{ post.hugCount }}
          </button>
          <button
            class="plain-action"
            :data-testid="index === 0 ? 'btn-square-reply-first' : `btn-square-reply-${post.id}`"
            @click.stop="replyPost(post)"
          >
            回应
          </button>
        </span>
      </div>
    </article>

    <button class="write-fab" data-testid="btn-write-mood" @click="router.push('/pages/post/create')">
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
/* V2 广场 is a plain feed: white paper, near-black ink, one hairline between rows, and the accent
   colour reserved for the primary action. The previous version put a full mascot cutout in the
   header and a second illustration inside every row, which measured at 21% ink against the
   design's 5.7% - the content was competing with decoration for the reader's attention. */
.square-page {
  background: #ffffff;
  color: #242a32;
}

/* The bar is a chevron and the title, closed by a full-bleed hairline. */
.square-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 56px;
  padding: 0;
  border-bottom: 1px solid #e8eaed;
}

.square-back {
  width: 26px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #242a32;
  font-size: 24px;
  line-height: 1;
}

.square-bar-title {
  margin: 0;
  color: #242a32;
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.4px;
}

/* The design's tabs: text with an underline, not pills. */
.square-sorts {
  display: flex;
  gap: 18px;
  border-bottom: 1px solid #e8eaed;
}

.square-sort {
  min-height: 40px;
  padding: 6px 0;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: #7e8690;
  font-size: 14px;
}

.square-sort.active {
  border-bottom-color: #275f56;
  color: #275f56;
  font-weight: 650;
}

.square-notice {
  margin: 14px 0 0;
  color: #7a838e;
  font-size: 12px;
  line-height: 1.5;
}

.mood-filter-row {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding: 12px 20px 4px;
  scrollbar-width: none;
}

.mood-filter-row::-webkit-scrollbar {
  display: none;
}

.mood-pill {
  flex: 0 0 auto;
  min-height: 34px;
  padding: 7px 11px;
  border: 1px solid #e4e7ea;
  border-radius: 8px;
  background: #ffffff;
  color: #606a74;
  font-size: 12px;
  line-height: 1.2;
}

.mood-pill.active {
  border-color: #c3dad0;
  background: #eaf2ee;
  color: #2b6358;
  font-weight: 600;
}

.soft-note {
  margin: 18px 20px;
  color: #7a838e;
  font-size: 12.5px;
}

.square-empty {
  margin: 22px 20px;
  color: #7a838e;
  font-size: 13px;
  line-height: 1.7;
}



.link-btn {
  padding: 0;
  border: 0;
  background: none;
  color: #2f6b60;
  font-size: 13px;
  font-weight: 600;
}

.post-row {
  padding: 16px 20px 14px;
  border-bottom: 1px solid #e8eaed;
}

.post-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.post-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #e7f0ee;
  color: #2b695c;
  font-size: 13px;
  font-weight: 680;
}

.post-avatar[data-emotion="焦虑"] { background: #f4f0e7; color: #8a6d33; }
.post-avatar[data-emotion="失眠"] { background: #ececf4; color: #5b5b86; }
.post-avatar[data-emotion="恋爱"] { background: #f7edee; color: #96535c; }
.post-avatar[data-emotion="工作"] { background: #e9f0e7; color: #4f6b40; }

.post-who {
  flex: 1;
  min-width: 0;
}

.post-author {
  display: block;
  color: #242a32;
  font-size: 13.5px;
  font-weight: 600;
}

.post-meta {
  display: block;
  margin-top: 2px;
  color: #818993;
  font-size: 11.5px;
}

.post-more {
  padding: 2px 6px;
  border: 0;
  background: none;
  color: #88909a;
  font-size: 13px;
  letter-spacing: 1px;
}

.post-title {
  margin: 12px 0 6px;
  color: #242a32;
  font-size: 15px;
  font-weight: 650;
  line-height: 1.55;
}

.post-content {
  color: #58616b;
  font-size: 12.5px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}

.post-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 11px;
}

.post-stat {
  color: #818993;
  font-size: 11.5px;
}

.post-acts {
  display: flex;
  gap: 6px;
}

.plain-action {
  min-height: 30px;
  padding: 5px 9px;
  border: 1px solid #e4e7ea;
  border-radius: 8px;
  background: #ffffff;
  color: #606a74;
  font-size: 11.5px;
  line-height: 1.2;
}

.plain-action:active {
  background: #f4f6f7;
}

/* The publish entry stays where it was; only its treatment follows the design's filled accent.
   Width, height and radius are stated explicitly because the shared `.write-fab` rule in styles.scss
   fixes a 92px circle - without overriding all three, the global values win on the ones left out and
   the button renders as a round blob with the label wrapped onto two lines. */
.write-fab {
  position: fixed;
  right: 18px;
  bottom: calc(80px + env(safe-area-inset-bottom));
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  width: auto;
  min-width: 96px;
  height: 46px;
  padding: 0 18px;
  border: 0;
  border-radius: 10px;
  background: #275f56;
  color: #ffffff;
  font-size: 14px;
  font-weight: 650;
  line-height: 1.2;
  white-space: nowrap;
  box-shadow: 0 8px 22px rgba(39, 95, 86, 0.22);
}

.floating-status {
  right: 20px;
  bottom: calc(140px + env(safe-area-inset-bottom));
  background: #275f56;
  color: #ffffff;
}

/* The action sheet keeps its behaviour and gains the design's white surface. */
.sheet-mask .sheet {
  background: #ffffff;
  color: #242a32;
}

.sheet-mask .sheet h2 {
  color: #242a32;
}

.sheet-mask .sheet button {
  min-height: 46px;
  border-bottom: 1px solid #eceef1;
  background: #ffffff;
  color: #333c44;
  font-size: 13.5px;
  text-align: left;
}

.sheet-mask .sheet button:last-of-type {
  border-bottom: 0;
}
</style>
