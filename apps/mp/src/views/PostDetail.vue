<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { copyText } from '../clipboard';

const route = useRoute();
const router = useRouter();

/** The post's real creation time. This used to print a hardcoded "2 小时前". */
function relativeTime(value?: string) {
  if (!value) return '时间未记录';
  const minutes = Math.floor((Date.now() - Date.parse(value)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(value));
}

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
  { style: 'warm', label: '暖心陪伴', testId: 'detail-style-warm' },
  { style: 'rational', label: '理性分析', testId: 'detail-style-rational' },
  { style: 'light', label: '轻松一下', testId: 'detail-style-light' },
  { style: 'clear', label: '清醒提醒', testId: 'detail-style-clear' },
  { style: 'poetic', label: '诗意治愈', testId: 'detail-style-poetic' },
];

const defaultPresets = [
  { id: 'preset_hug', text: '抱抱你' },
  { id: 'preset_understand', text: '我懂你的感受' },
  { id: 'preset_better', text: '会好起来的' },
  { id: 'preset_sleep', text: '今晚早点休息' },
  { id: 'preset_good', text: '你已经很棒了' },
];

const quickHugs = ['抱抱你', '我懂', '加油', '陪着你', '会好起来的'];
const replyCountText = computed(() => post.value ? `回应（${post.value.replyCount}）` : '正在读取回应');

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
    <header class="detail-topbar">
      <button class="back-icon" data-testid="front-post-back" aria-label="返回" @click="safeBack">‹</button>
      <h1>一条动态</h1>
      <button class="more-icon" data-testid="btn-open-more" aria-label="更多" @click="showMore = true">⋯</button>
    </header>

    <article class="detail-post">
      <div class="detail-author">
        <span class="author-avatar" aria-hidden="true">匿</span>
        <div class="author-copy">
          <strong>匿名树洞</strong>
          <p>{{ relativeTime(post.createdAt) }} · {{ post.emotion }}</p>
        </div>
      </div>
      <p class="detail-content">{{ post.content }}</p>
      <div class="detail-actions">
        <button data-testid="btn-hug" class="text-action" @click="hug">抱抱 {{ post.hugCount }}</button>
        <button data-testid="btn-open-reply" class="text-action" :disabled="!allowHumanReplies" @click="openReplySheet()">
          {{ allowHumanReplies ? `回应 ${post.replyCount}` : '回应关闭' }}
        </button>
        <button data-testid="btn-favorite" class="text-action" @click="favorite">
          {{ post?.favoritedByCurrentUser ? '已收藏' : '收藏' }}
        </button>
      </div>
      <div class="style-row no-wrap">
        <button
          v-for="item in styleButtons"
          :key="item.testId"
          :data-testid="item.testId"
          class="style-pill"
          :disabled="!allowHumanReplies"
          @click="openReplySheet(item.label)"
        >
          {{ item.label }}
        </button>
      </div>
    </article>

    <section class="reply-section">
      <!--
        The heading is also the way into the composer, which is why it is a button: the design puts
        the count here, and a heading that looks clickable but is not would be the worse trade.
      -->
      <button class="reply-heading" data-testid="detail-reply-count" :disabled="!allowHumanReplies" @click="openReplySheet()">
        {{ allowHumanReplies ? replyCountText : '真人回应已关闭' }}
      </button>
      <article v-for="(reply, index) in replies.slice(0, 5)" :key="reply.id" class="reply-row">
        <span class="reply-avatar" aria-hidden="true" />
        <div class="reply-body">
          <strong>匿名旅人</strong>
          <!--
            No style label here. It used to read `index === 2 ? '轻松一下' : '暖心陪伴'`, so every
            third reply was labelled 轻松一下 no matter what it said - a label invented from the row's
            position. The reply's own `style` is the composer's hint, not something a reader needs, and
            the design shows name + text only.
          -->
          <p>{{ reply.content }}</p>
        </div>
        <button
          :data-testid="index === 0 ? 'reply-like-first' : undefined"
          class="reply-like"
          @click="likeReply(reply)"
        >
          ♡ {{ reply.likeCount ?? 0 }}
        </button>
      </article>
      <p v-if="!replies.length" class="reply-empty">还没有公开的回应。写下第一条，审核通过后会出现在这里。</p>
    </section>

    <section class="hug-section">
      <h2>想说的话</h2>
      <div class="quick-row">
        <button
          v-for="(item, index) in quickHugs"
          :key="item"
          :data-testid="index === 0 ? 'quick-hug-0' : `quick-hug-${index}`"
          class="quick-chip"
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
        <!--
          "仅作者可见" is offered by the composer but the Reply table has no visibility column, so the
          server cannot honour it and now refuses it outright. Rather than hide the choice (which would
          remove a control the reader expects) or keep it as a silent lie, it stays and says what it
          does; submitting is blocked while it is selected.
        -->
        <label class="setting-row">
          <span>可见范围：</span>
          <select data-testid="select-reply-visibility" v-model="replyVisibility">
            <option value="PUBLIC">所有人可见</option>
            <option value="PRIVATE">仅作者可见（暂不支持）</option>
          </select>
        </label>
        <p v-if="replyVisibility === 'PRIVATE'" class="reply-visibility-note" role="status">
          回应审核后会公开显示，"仅作者可见"尚未支持，服务端会拒绝这条回应。
        </p>
        <div class="sheet-actions">
          <button data-testid="btn-close-reply" class="outline-wide" @click="closeReplySheet">取消</button>
          <button
            data-testid="btn-submit-reply"
            class="submit-wide"
            :disabled="replyVisibility === 'PRIVATE'"
            @click="submitReply"
          >
            发布回应
          </button>
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

  <!-- Opened without a resolvable id the page rendered nothing: no header, no back button, no way
       out. Offer the route back the way LetterDetail does. -->
  <section v-else class="page goodnight-page detail-page">
    <!-- The compact bar, not the hero. `detail-top` is a 190px hero with a 44px title, meant for a
         post that exists; in this branch there is no post, and the hero stacked the back chevron
         under the title instead of beside it. Every other detail page's empty state uses
         `rest-topbar`, which is a 3-column grid: back | centred title | spacer. -->
    <header class="rest-topbar">
      <button class="back-icon" data-testid="front-post-back" aria-label="返回" @click="safeBack">‹</button>
      <h1>树洞详情</h1>
      <span aria-hidden="true"></span>
    </header>
    <article class="detail-card">
      <h2>没有找到这条树洞</h2>
      <p class="detail-content is-empty">它可能已经被删除或屏蔽。可以从广场重新打开一条。</p>
      <div class="detail-actions">
        <button class="primary" data-testid="detail-goto-square" @click="router.push('/pages/square/index')">回到树洞广场</button>
      </div>
    </article>
  </section>
</template>

<style scoped>
/*
 * This page is one reading column, not the shared detail grid.
 *
 * `styles.scss` gives `.detail-page` a grid with `gap: 14px`, `margin: 0 18px`, a 154px bottom
 * padding and a `.reply-section` with 110px of its own bottom padding. Measured on the device, that
 * put a blank screen between the replies and 想说的话, made every child 15px wider than its parent
 * (text ran to the screen edge) and left the fixed dock sitting on top of the chip row.
 */
.detail-page.goodnight-page {
  display: block;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 0;
  margin: 0;
  /* `main.phone-shell` already insets every page by 18px; a second 20px here narrowed this column by
     38px a side while every other page used 18. The top bar takes the same 18px back out. */
  padding: 0 0 calc(112px + env(safe-area-inset-bottom));
  overflow-x: hidden;
}

.reply-visibility-note {
  margin: 8px 0 0;
  padding: 9px 11px;
  border: 1px solid #f2e4ce;
  border-radius: 8px;
  background: #fff8ee;
  color: #8a6a34;
  font-size: 11.5px;
  line-height: 1.6;
}

/* The post is the page: a plain top bar, then the content. The old header was a 190px hero with a
   44px title, a tree scene and a mascot cutout above the post body. */
.detail-topbar {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 32px;
  align-items: center;
  min-height: 52px;
  margin: 0 -18px;
  padding: 0 18px;
  border-bottom: 1px solid #e8eaed;
  background: #ffffff;
}

.detail-topbar h1 {
  color: #242a32;
  font-size: 17px;
  font-weight: 650;
  text-align: left;
}

.detail-topbar .more-icon {
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

.detail-topbar .back-icon {
  width: 32px;
  height: 32px;
  border: 0;
  background: none;
  color: #39454c;
  font-size: 24px;
  line-height: 1;
}

.detail-post {
  padding: 18px 0 4px;
}

/* The author row is metadata above the post, not a card header: the design's hierarchy is
   name + time, then the body. */
.detail-author {
  display: flex;
  align-items: center;
  gap: 10px;
}

.author-avatar {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #e7efe9;
  color: #275f56;
  font-size: 14px;
  font-weight: 600;
}

.author-copy { min-width: 0; }

.author-copy strong {
  display: block;
  color: #242a32;
  font-size: 14.5px;
  font-weight: 650;
}

.author-copy p {
  margin: 3px 0 0;
  color: #8b939c;
  font-size: 12px;
}

/* The post is the page. 16px/1.75 is the reading size the design uses; the old 15px inside a card
   with a 228px floor made a short post look like a poster. */
.detail-content {
  margin: 18px 0 0;
  color: #242a32;
  font-size: 16px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Plain text actions between two hairlines: the design has no bordered buttons above the replies. */
.detail-actions {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 20px;
  padding: 12px 0;
  border-top: 1px solid #ebedf0;
  border-bottom: 1px solid #ebedf0;
}

.text-action {
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: #5c656f;
  font-size: 13px;
  white-space: nowrap;
}

.text-action:disabled { color: #b3b9c0; }

/* Five tone shortcuts at 12px do not fit one 375px row, and a horizontally scrolling row cut the
   last chip at the screen edge. Wrapping keeps all five visible without removing any. */
.detail-page .style-row.no-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.detail-page .style-row.no-wrap .style-pill {
  flex: 0 0 auto;
  width: auto;
  min-height: 0;
  padding: 6px 11px;
  border: 1px solid #e8eaed;
  border-radius: 999px;
  background: #ffffff;
  color: #6c747d;
  font-size: 12px;
  white-space: nowrap;
}

/* 回应（N） sits where the design puts it: a section heading, not a link inside the post card. The
   shared rule pads this section by 110px, which is the blank screen that used to sit above 想说的话. */
.detail-page .reply-section {
  margin-top: 26px;
  padding-bottom: 0;
}

.reply-heading {
  display: block;
  width: 100%;
  min-height: 0;
  padding: 0 0 10px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #242a32;
  font-size: 15px;
  font-weight: 650;
  text-align: left;
}

.reply-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 0;
  border-top: 1px solid #ebedf0;
}

.reply-avatar {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border: 1px dashed #cfd6da;
  border-radius: 10px;
  background: #f6f7f8;
}

.reply-body { flex: 1; min-width: 0; }

.reply-body strong {
  display: block;
  color: #242a32;
  font-size: 13.5px;
  font-weight: 600;
}

.reply-body p {
  margin: 4px 0 0;
  color: #6c747d;
  font-size: 13.5px;
  line-height: 1.7;
}

.detail-page .reply-like {
  flex: 0 0 auto;
  width: auto;
  min-height: 0;
  margin: 0;
  padding: 2px 0 0 6px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #9aa1a9;
  font-size: 12px;
}

.reply-empty {
  margin: 0;
  padding: 16px 0 0;
  border-top: 1px solid #ebedf0;
  color: #8b939c;
  font-size: 13px;
  line-height: 1.7;
}

.hug-section { margin-top: 24px; }

/* The shared rule pads this section by 96px at the bottom; on this page the dock is the last thing,
   so that padding only produced a blank strip under the chips. */
.detail-page .hug-section {
  padding-bottom: 0;
}

.detail-page .hug-section h2 {
  margin: 0 0 10px;
  color: #242a32;
  font-size: 13.5px;
  font-weight: 650;
}

.quick-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-chip {
  min-height: 0;
  padding: 6px 12px;
  border: 1px solid #e8eaed;
  border-radius: 999px;
  background: #ffffff;
  color: #6c747d;
  font-size: 12.5px;
}

/* Keep the real reply sheet at its functional height, but use the softer
   backdrop and native toggle treatment from the supplied state. */
.reply-sheet-mask {
  background: rgba(40, 52, 42, 0.22);
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
