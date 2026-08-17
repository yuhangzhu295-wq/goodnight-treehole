<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { copyText } from '../clipboard';

const route = useRoute();
const router = useRouter();

const post = ref<any>();
const replies = ref<any[]>([]);
// Keep the built-in presets available while the server-backed list is loading.
// `loadPresets` immediately reconciles these with the authoritative API result.
const presets = ref<Array<{ id: string; text: string }>>([
  { id: 'preset_hug', text: '抱抱你' },
  { id: 'preset_understand', text: '我懂你的感受' },
  { id: 'preset_better', text: '会好起来的' },
  { id: 'preset_sleep', text: '今晚早点休息' },
  { id: 'preset_good', text: '你已经很棒了' },
]);
const showSheet = ref(route.query.sheet === 'reply');
const showMore = ref(false);
const replyContent = ref('');
const anonymous = ref(true);
const replyVisibility = ref('PUBLIC');
const submittedNotice = ref('');
const posterStatus = ref('');
const allowHumanReplies = ref(true);

const styleButtons = [
  { style: 'warm', label: '暖心陪伴', icon: '♡', testId: 'detail-style-warm' },
  { style: 'rational', label: '理性分析', icon: '▥', testId: 'detail-style-rational' },
  { style: 'light', label: '轻松一下', icon: '☺', testId: 'detail-style-light' },
  { style: 'clear', label: '清醒提醒', icon: '♢', testId: 'detail-style-clear' },
  { style: 'poetic', label: '诗意治愈', icon: '♧', testId: 'detail-style-poetic' },
];

const defaultPresets = [
  { id: 'preset_hug', text: '抱抱你' },
  { id: 'preset_understand', text: '我懂你的感受' },
  { id: 'preset_better', text: '会好起来的' },
  { id: 'preset_sleep', text: '今晚早点休息' },
  { id: 'preset_good', text: '你已经很棒了' },
];

const quickHugs = ['抱抱你', '我懂', '加油', '陪着你', '会好起来的'];
const replyCountText = computed(() => post.value ? `已收到 ${post.value.replyCount} 条温柔回应` : '正在读取回应');

function postId() {
  return String(route.query.id || 'post_1');
}

function safeBack() {
  if (window.history.state?.back) router.back();
  else router.push('/pages/square/index');
}

async function load() {
  const id = postId();
  try {
    const config = (await api.get<any>('/api/v1/config')).item;
    allowHumanReplies.value = config.allowHumanRepliesDefault !== false;
  } catch {
    allowHumanReplies.value = true;
  }
  post.value = (await api.get<any>(`/api/v1/posts/${id}`)).item;
  allowHumanReplies.value = post.value.allowHumanReplies ?? allowHumanReplies.value;
  replies.value = (await api.get<any>(`/api/v1/posts/${id}/replies`)).items;
}

async function loadPresets() {
  const res = await api.get<any>('/api/v1/reply-presets');
  const merged = [...res.items, ...defaultPresets].reduce<Array<{ id: string; text: string }>>((acc, item) => {
    if (!acc.some((seen) => seen.text === item.text)) acc.push(item);
    return acc;
  }, []);
  presets.value = merged.slice(0, 5);
}

async function openReplySheet(seed = '') {
  if (!allowHumanReplies.value) {
    submittedNotice.value = '管理员已暂时关闭真人回应';
    return;
  }
  if (seed) replyContent.value = seed;
  showSheet.value = true;
  await loadPresets();
  router.replace({ path: '/pages/post/detail', query: { ...route.query, id: postId(), sheet: 'reply' } });
}

function closeReplySheet() {
  showSheet.value = false;
  const nextQuery = { ...route.query };
  delete nextQuery.sheet;
  router.replace({ path: '/pages/post/detail', query: nextQuery });
}

async function hug() {
  post.value = (await api.post<any>(`/api/v1/posts/${post.value.id}/hug`)).item;
}

async function favorite() {
  post.value = (await api.post<any>(`/api/v1/posts/${post.value.id}/favorite`)).item;
  posterStatus.value = '已收藏';
}

async function reportPost() {
  await api.post(`/api/v1/posts/${post.value.id}/report`);
  posterStatus.value = '已提交举报';
  showMore.value = false;
}

async function copyPost() {
  const copied = await copyText(post.value?.content ?? '');
  posterStatus.value = copied ? '内容已复制' : '复制失败，请稍后重试';
  showMore.value = false;
}

async function blockPost() {
  await api.post(`/api/v1/posts/${post.value.id}/hide`);
  showMore.value = false;
  await router.replace('/pages/square/index');
}

function usePreset(index: number) {
  const text = presets.value[index]?.text;
  if (text) replyContent.value = text;
}

async function likeReply(reply: any) {
  const result = await api.post<any>(`/api/v1/replies/${reply.id}/like`);
  const index = replies.value.findIndex((item) => item.id === reply.id);
  if (index >= 0) replies.value[index] = result.item;
}

async function submitReply() {
  if (!allowHumanReplies.value) {
    submittedNotice.value = '管理员已暂时关闭真人回应';
    closeReplySheet();
    return;
  }
  if (!replyContent.value.trim()) {
    submittedNotice.value = '请先写下回应内容';
    return;
  }
  await api.post(`/api/v1/posts/${post.value.id}/replies`, {
    content: replyContent.value.trim(),
    anonymous: anonymous.value,
    visibility: replyVisibility.value,
    style: 'human',
  });
  replyContent.value = '';
  submittedNotice.value = '已提交，等待审核';
  closeReplySheet();
  await load();
}

watch(
  () => route.query.sheet,
  async (sheet) => {
    showSheet.value = sheet === 'reply' && allowHumanReplies.value;
    if (sheet === 'reply' && !allowHumanReplies.value) submittedNotice.value = '管理员已暂时关闭真人回应';
    if (showSheet.value) await loadPresets();
  },
);

onMounted(async () => {
  await load();
  if (showSheet.value && allowHumanReplies.value) await loadPresets();
  if (showSheet.value && !allowHumanReplies.value) closeReplySheet();
});
</script>

<template>
  <section class="page goodnight-page detail-page" v-if="post">
    <header class="detail-top">
      <div class="status-row">
        <span>23:17</span>
        <span>92</span>
      </div>
      <button class="back-icon" data-testid="front-post-back" aria-label="返回" @click="safeBack">‹</button>
      <h1>树洞详情</h1>
      <div class="tree-scene detail-tree" aria-hidden="true">
        <span class="tree-heart">♡</span>
      </div>
      <span class="detail-hero-baby" aria-hidden="true" />
    </header>

    <article class="detail-card">
      <button class="card-more" data-testid="btn-open-more" aria-label="更多" @click="showMore = true">...</button>
      <div class="detail-author">
        <div class="avatar-bubble large">♧</div>
        <div>
          <strong>匿名树洞</strong>
          <p><span>2 小时前</span><span class="tag green">{{ post.emotion }}</span></p>
        </div>
      </div>
      <p class="detail-content">{{ post.content }}</p>
      <button class="reply-link" data-testid="detail-reply-count" :disabled="!allowHumanReplies" @click="openReplySheet()">{{ allowHumanReplies ? replyCountText : '真人回应已关闭' }} ›</button>
      <div class="style-row no-wrap">
        <button
          v-for="item in styleButtons"
          :key="item.testId"
          :data-testid="item.testId"
          class="style-pill"
          :disabled="!allowHumanReplies"
          @click="openReplySheet(item.label)"
        >
          <span>{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </button>
      </div>
      <div class="detail-actions">
        <button data-testid="btn-hug" class="plain-action big" @click="hug">♡ 抱抱 {{ post.hugCount }}</button>
        <button data-testid="btn-open-reply" class="plain-action big" :disabled="!allowHumanReplies" @click="openReplySheet()">☻ {{ allowHumanReplies ? `回应 ${post.replyCount}` : '回应关闭' }}</button>
      </div>
    </article>

    <section class="reply-section">
      <h2>♧ 温柔回应</h2>
      <article v-for="(reply, index) in replies.slice(0, 5)" :key="reply.id" class="reply-card">
        <div class="avatar-bubble">{{ index === 1 ? '◌' : '♡' }}</div>
        <div>
          <strong>{{ reply.style === 'rational' ? '理性分析' : index === 2 ? '轻松一下' : '暖心陪伴' }}</strong>
          <p>{{ reply.content }}</p>
        </div>
        <button
          v-if="index === 0"
          data-testid="reply-like-first"
          class="reply-like"
          @click="likeReply(reply)"
        >
          ♡ {{ reply.likeCount ?? 0 }}
        </button>
        <button v-else class="reply-like" @click="likeReply(reply)">♡ {{ reply.likeCount ?? 0 }}</button>
      </article>
    </section>

    <section class="hug-section">
      <h2>♧ 大家的抱抱</h2>
      <div class="style-row">
        <button
          v-for="(item, index) in quickHugs"
          :key="item"
          :data-testid="index === 0 ? 'quick-hug-0' : `quick-hug-${index}`"
          class="style-pill"
          :disabled="!allowHumanReplies"
          @click="openReplySheet(item)"
        >
          {{ item }}
        </button>
      </div>
    </section>

    <div class="reply-dock">
      <button data-testid="reply-entry" class="reply-input-button" :disabled="!allowHumanReplies" @click="openReplySheet()">{{ allowHumanReplies ? '写下你的回应...' : '真人回应已关闭' }}</button>
      <button data-testid="btn-hug-dock" class="dock-main" @click="hug">♡ 抱抱</button>
      <button data-testid="btn-favorite" class="dock-outline" @click="favorite">☆ {{ post?.favoritedByCurrentUser ? '已收藏' : '收藏' }}</button>
    </div>

    <p v-if="submittedNotice" class="floating-status">{{ submittedNotice }}</p>
    <p v-if="posterStatus && !showSheet" class="floating-status secondary">{{ posterStatus }}</p>

    <div v-if="showSheet" class="sheet-mask reply-sheet-mask" data-state="reply-sheet" @click.self="closeReplySheet">
      <div class="sheet reply-sheet">
        <span class="sheet-handle" />
        <div class="sheet-title-row">
          <h2>♧ 写下回应</h2>
          <span aria-hidden="true">♧</span>
        </div>
        <section class="reply-compose">
          <textarea
            v-model="replyContent"
            data-testid="input-reply-content"
            maxlength="1000"
            placeholder="把你的温柔写在这里..."
          />
          <span class="counter">{{ replyContent.length }}/1000</span>
          <span class="textarea-seed" aria-hidden="true">♧</span>
        </section>
        <h3>快捷回应</h3>
        <div class="preset-row">
          <button
            v-for="(preset, index) in presets"
            :key="preset.id"
            :data-testid="`reply-preset-${index}`"
            class="style-pill"
            @click="usePreset(index)"
          >
            {{ preset.text }}
          </button>
        </div>
        <label class="setting-row">
          <span>匿名回复</span>
          <input data-testid="toggle-reply-anonymous" type="checkbox" v-model="anonymous" />
        </label>
        <label class="setting-row">
          <span>可见范围：</span>
          <select data-testid="select-reply-visibility" v-model="replyVisibility">
            <option value="PUBLIC">所有人可见</option>
            <option value="PRIVATE">仅作者可见</option>
          </select>
        </label>
        <div class="sheet-actions">
          <button data-testid="btn-close-reply" class="outline-wide" @click="closeReplySheet">取消</button>
          <button data-testid="btn-submit-reply" class="submit-wide" @click="submitReply">发布回应</button>
        </div>
      </div>
    </div>

    <div v-if="showMore" class="sheet-mask" data-state="detail-more-menu" @click.self="showMore = false">
      <div class="sheet menu-sheet">
        <h2>更多操作</h2>
        <button data-testid="detail-menu-copy" @click="copyPost">复制内容</button>
        <button data-testid="detail-menu-report" @click="reportPost">举报</button>
        <button data-testid="detail-menu-block" @click="blockPost">屏蔽</button>
        <button data-testid="detail-menu-cancel" @click="showMore = false">取消</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.detail-page .status-row {
  visibility: hidden;
}

.detail-hero-baby {
  position: absolute;
  right: 89px;
  bottom: -1px;
  z-index: 2;
  width: 72px;
  height: 68px;
  background: url("../assets/goodnight/square-baby-cutout.png") center / contain no-repeat;
  pointer-events: none;
}

/* Bring the first live detail card back to the compact header without
   removing any post, reply, hug, or favourite controls. */
.detail-page {
  gap: 3px;
}

.detail-page .detail-card {
  /* Keep a stable reading surface when the live post happens to be shorter
     than the supplied reference.  Long server content still grows naturally;
     this only prevents the reply section from jumping into the hero area. */
  min-height: 228px;
  padding-top: 10px;
}

.detail-page .detail-author > div {
  min-width: 0;
  padding-right: 44px;
}

.detail-page .detail-content {
  margin-block: 6px;
  line-height: 1.5;
}

.detail-page .reply-link {
  min-height: 26px;
  margin-top: 4px;
}

.detail-page .style-row.no-wrap {
  margin-top: 4px;
}

.detail-page .style-row.no-wrap .style-pill {
  min-height: 28px;
  padding-block: 3px;
  font-size: 10px;
}

.detail-page .detail-actions {
  min-height: 31px;
  margin-top: 3px;
  padding-top: 2px;
}

.detail-page .detail-actions .plain-action {
  min-height: 29px;
}

/* A real short reply should not occupy the vertical space intended for five
   server-backed replies. Its full text stays in the DOM and is still readable. */
.detail-page .reply-card {
  min-height: 72px;
  padding: 8px 10px;
  grid-template-columns: 48px minmax(0, 1fr) 52px;
}

.detail-page .reply-card .avatar-bubble {
  width: 46px;
  height: 46px;
}

.detail-page .reply-card p {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

/* Keep the real reply sheet at its functional height, but use the softer
   backdrop and native toggle treatment from the supplied state. */
.reply-sheet-mask {
  background: rgba(40, 52, 42, 0.22);
}

.reply-compose::after {
  position: absolute;
  right: 12px;
  bottom: 2px;
  z-index: 2;
  width: 68px;
  height: 62px;
  background: url("../assets/goodnight/square-baby-cutout.png") center bottom / contain no-repeat;
  content: "";
  pointer-events: none;
}

.reply-compose textarea {
  padding-right: 76px;
}

.reply-compose .counter {
  right: 86px;
  z-index: 3;
}

.reply-sheet .setting-row input[type="checkbox"] {
  width: 46px;
  height: 26px;
  appearance: none;
  border: 0;
  border-radius: 999px;
  background:
    radial-gradient(circle at 13px 50%, #fff 0 9px, transparent 10px),
    #bbb7aa;
  box-shadow: none;
  transition: background-color .16s ease;
}

.reply-sheet .setting-row input[type="checkbox"]:checked {
  background:
    radial-gradient(circle at calc(100% - 13px) 50%, #fff 0 9px, transparent 10px),
    var(--gn-green);
}

.reply-sheet .setting-row select {
  min-width: 144px;
}

/* The reply state keeps the live post readable behind the sheet. Tighten only
   the composing controls to the supplied mobile rhythm; all reply inputs,
   visibility choices, and submission actions remain unchanged. */
.detail-page:has(.reply-sheet-mask) .detail-hero-baby {
  display: none;
}

.detail-page .reply-compose textarea {
  height: 108px;
  min-height: 108px;
}

.detail-page .reply-sheet .preset-row + .setting-row {
  margin-top: 1px;
}

.detail-page .reply-sheet .setting-row {
  min-height: 36px;
  height: 36px;
}

.detail-page .reply-sheet .setting-row select {
  min-height: 28px;
  height: 28px;
}

.detail-page .reply-sheet .sheet-actions {
  margin-top: 3px;
}
</style>
