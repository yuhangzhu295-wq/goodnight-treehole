<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { AIStyle } from '@goodnight/shared-types';
import { api, deleteMedia, resolveApiUrl, uploadMedia } from '../api';
import { useDeviceClock } from '../composables/useDeviceClock';

const router = useRouter();
const { timeLabel } = useDeviceClock();
const MAX_IMAGES = 2;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const emotions = [
  { value: '难过', label: '难过', face: '😢', testId: 'mood-emotion-nanguo' },
  { value: '焦虑', label: '焦虑', face: '🌧️', testId: 'mood-emotion-jiaolv' },
  { value: '委屈', label: '委屈', face: '🥺', testId: 'mood-emotion-weiqu' },
  { value: '生气', label: '生气', face: '😤', testId: 'mood-emotion-shengqi' },
  { value: '孤独', label: '孤独', face: '🌙', testId: 'mood-emotion-gudu' },
  { value: '失眠', label: '失眠', face: '🛏️', testId: 'mood-emotion-shimian' },
  { value: '工作', label: '工作', face: '💼', testId: 'mood-emotion-gongzuo' },
];

const replyStyles: Array<{ value: AIStyle; label: string; icon: string; testId: string }> = [
  { value: 'warm', label: '暖心陪伴', icon: '♡', testId: 'mood-style-warm' },
  { value: 'rational', label: '理性分析', icon: '▥', testId: 'mood-style-rational' },
  { value: 'light', label: '轻松一下', icon: '☺', testId: 'mood-style-light' },
  { value: 'poetic', label: '诗意治愈', icon: '⌁', testId: 'mood-style-poetic' },
  { value: 'clear', label: '清醒提醒', icon: '♢', testId: 'mood-style-clear' },
];

const form = reactive({
  content: '',
  emotion: '委屈',
  visibility: 'PRIVATE' as 'PRIVATE' | 'PUBLIC',
  replyStyle: 'warm' as AIStyle,
});
const assets = ref<Array<{ id: string; url: string; preview: string; name: string; uploading: boolean }>>([]);
const fileInput = ref<HTMLInputElement>();
const error = ref('');
const submitting = ref(false);
const countText = computed(() => `${form.content.length}/1000`);
const addSlots = computed(() => Math.max(0, MAX_IMAGES - assets.value.length));

function safeBack() {
  if (window.history.state?.back) router.back();
  else router.push('/pages/square/index');
}

function openFilePicker() {
  error.value = '';
  if (assets.value.length >= MAX_IMAGES) {
    error.value = '最多添加 2 张图片';
    return;
  }
  fileInput.value?.click();
}

async function chooseImages(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  if (!files.length) return;
  if (assets.value.length + files.length > MAX_IMAGES) {
    error.value = '最多添加 2 张图片';
    return;
  }
  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) {
      error.value = '仅支持 JPEG、PNG 或 WebP 图片';
      continue;
    }
    if (file.size > MAX_FILE_SIZE) {
      error.value = '单张图片不能超过 5MB';
      continue;
    }
    const preview = URL.createObjectURL(file);
    const placeholderId = `uploading-${Date.now()}-${file.name}`;
    const placeholder = { id: placeholderId, url: '', preview, name: file.name, uploading: true };
    assets.value.push(placeholder);
    try {
      const uploaded = await uploadMedia(file, 'mood');
      assets.value = assets.value.map((asset) => asset.id === placeholderId
        ? { ...asset, id: uploaded.id, url: resolveApiUrl(uploaded.url), uploading: false }
        : asset);
    } catch (cause: any) {
      assets.value = assets.value.filter((asset) => asset.id !== placeholderId);
      URL.revokeObjectURL(preview);
      error.value = cause?.message ?? '图片上传失败，请重试';
    }
  }
}

async function removeImage(asset: { id: string; preview: string; uploading: boolean }) {
  if (!asset.uploading && !asset.id.startsWith('uploading-')) {
    try { await deleteMedia(asset.id); } catch (cause: any) { error.value = cause?.message ?? '图片删除失败'; return; }
  }
  URL.revokeObjectURL(asset.preview);
  assets.value = assets.value.filter((item) => item !== asset);
}

function validate() {
  if (!form.content.trim()) return '内容不能为空';
  if (form.content.length > 1000) return '内容不能超过 1000 字';
  if (!form.emotion) return '请选择心情';
  if (assets.value.some((asset) => asset.uploading)) return '图片仍在上传，请稍候';
  return '';
}

async function submit() {
  error.value = validate();
  if (error.value) return;
  submitting.value = true;
  try {
    const res = await api.post<any>('/api/v1/moods', {
      content: form.content.trim(),
      emotion: form.emotion,
      visibility: form.visibility,
      // Keep the single selected style explicit for the current endpoint while
      // retaining the plural field consumed by the shared creation contract.
      replyStyle: form.replyStyle,
      style: form.replyStyle,
      replyStyles: [form.replyStyle],
      assetIds: assets.value.map((asset) => asset.id),
    });
    if (res.post) router.push(`/pages/post/detail?id=${res.post.id}`);
    else router.push('/pages/diary/index');
  } catch (cause: any) {
    error.value = cause?.message ?? '发布失败，请稍后再试';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <section class="page goodnight-page mood-create-page">
    <header class="front-hero compact-hero">
      <div class="status-row"><span>{{ timeLabel }}</span><span aria-hidden="true"></span></div>
      <button class="back-icon" data-testid="front-mood-back" aria-label="返回" @click="safeBack">‹</button>
      <div class="hero-copy"><h1>写下心情</h1><p>把心里的话写下来，晚安树洞陪你听</p></div>
      <div class="tree-scene small" aria-hidden="true"><span class="tree-heart">♥</span><span class="seedling-face">●</span></div>
      <span class="mood-hero-baby" aria-hidden="true" />
    </header>

    <section class="write-card">
      <textarea v-model="form.content" data-testid="input-mood-content" maxlength="1000" placeholder="此刻的你，想说些什么呢？&#10;开心的、难过的、烦恼的，都可以告诉树洞哦～" />
      <span class="counter">{{ countText }}</span>
    </section>

    <section class="panel-card">
      <h2>♧ 选择心情</h2>
      <div class="emotion-grid">
        <button v-for="item in emotions.slice(0, 6)" :key="item.testId" :data-testid="item.testId" class="emotion-choice" :class="{ active: form.emotion === item.value }" @click="form.emotion = item.value">
          <span class="face">{{ item.face }}</span><span>{{ item.label }}</span>
        </button>
      </div>
    </section>

    <section class="panel-card">
      <h2>♧ 谁可以看见？</h2>
      <div class="visibility-grid">
        <button data-testid="mood-visibility-private" class="visibility-card" :class="{ active: form.visibility === 'PRIVATE' }" @click="form.visibility = 'PRIVATE'">
          <span class="round-icon">◐</span><strong>仅自己可见</strong><small>只进入我的日记与情绪月报</small>
        </button>
        <button data-testid="mood-visibility-public" class="visibility-card" :class="{ active: form.visibility === 'PUBLIC' }" @click="form.visibility = 'PUBLIC'">
          <span class="round-icon">♡</span><strong>匿名发布到广场</strong><small>审核后可获得 AI 与真人回应</small>
        </button>
      </div>
    </section>

    <section class="panel-card reply-style-panel" aria-labelledby="reply-style-title">
      <h2 id="reply-style-title">♧ 想收到怎样的回应？</h2>
      <div class="style-row" role="group" aria-label="公开树洞的 AI 回应风格">
        <button
          v-for="item in replyStyles"
          :key="item.testId"
          type="button"
          :data-testid="item.testId"
          class="style-pill"
          :class="{ active: form.replyStyle === item.value }"
          :aria-pressed="form.replyStyle === item.value"
          :aria-label="`选择${item.label}回应风格`"
          @click="form.replyStyle = item.value"
        >
          <span aria-hidden="true">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </button>
      </div>
    </section>

    <section class="panel-card media-panel">
      <h2>♧ 添加图片 <small>（最多 2 张）</small></h2>
      <input ref="fileInput" class="file-picker" data-testid="input-mood-images" type="file" accept="image/jpeg,image/png,image/webp" multiple @change="chooseImages" />
      <div class="image-row" data-testid="mood-image-grid">
        <article v-for="asset in assets" :key="asset.id" class="image-box filled" data-testid="mood-image-preview">
          <img :src="asset.url || asset.preview" :alt="asset.name" />
          <span v-if="asset.uploading" class="upload-state">上传中</span>
          <button type="button" :aria-label="`删除 ${asset.name}`" @click="removeImage(asset)">×</button>
        </article>
        <button v-for="slot in addSlots" :key="slot" type="button" class="image-box add-image" :data-testid="slot === 1 ? 'btn-add-image' : 'btn-add-image-secondary'" @click="openFilePicker">
          <span>＋</span><span>添加图片</span>
        </button>
      </div>
    </section>

    <p v-if="error" class="error-text">{{ error }}</p>
    <button class="submit-bar" data-testid="btn-submit-mood" :disabled="submitting" @click="submit">{{ submitting ? '正在发布…' : '发布心情' }}</button>
  </section>
</template>

<style scoped>
.mood-create-page .status-row {
  visibility: hidden;
}

.mood-hero-baby {
  position: absolute;
  right: 82px;
  bottom: 0;
  z-index: 2;
  width: 76px;
  height: 72px;
  background: url("../assets/goodnight/square-baby-cutout.png") center / contain no-repeat;
  pointer-events: none;
}

.mood-create-page .back-icon {
  position: absolute;
  top: 44px;
  left: 14px;
  z-index: 5;
}

/* The reference gives this otherwise short display title a little more
   breathing room than the body font.  This is isolated to the static hero;
   it does not alter the editable form or its responsive card geometry. */
.mood-create-page .compact-hero h1 {
  font-size: 46px;
  letter-spacing: .02em;
}

/* The textarea remains a real editable control. The clean mascot crop is a
   text-free decorative sibling layered over only its unused lower-right
   corner; it contains no captured form controls or copy. */
.mood-create-page .write-card::after {
  position: absolute;
  right: 4px;
  bottom: 6px;
  z-index: 2;
  width: 80px;
  height: 75px;
  background: url("../assets/goodnight/mood-card-baby-clean.png") center bottom / contain no-repeat;
  content: "";
  pointer-events: none;
}

.mood-create-page .write-card textarea {
  position: relative;
  z-index: 1;
  padding-right: 84px;
}

.mood-create-page .counter {
  right: 88px;
  z-index: 3;
}

/* Six semantic choices remain ordinary buttons; replace platform-dependent
   emoji glyphs with the existing reusable illustration family. */
.mood-create-page .emotion-choice .face {
  color: transparent;
  background-color: transparent;
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
}

.mood-create-page .emotion-choice:nth-child(1) .face { background-image: url("../assets/goodnight/avatar-baby.png"); }
.mood-create-page .emotion-choice:nth-child(2) .face { background-image: url("../assets/goodnight/tool-icon-decompose.png"); }
.mood-create-page .emotion-choice:nth-child(3) .face { background-image: url("../assets/goodnight/square-baby-cutout.png"); }
.mood-create-page .emotion-choice:nth-child(4) .face { background-image: url("../assets/goodnight/tool-icon-rant.png"); }
.mood-create-page .emotion-choice:nth-child(5) .face { background-image: url("../assets/goodnight/tool-baby-letter-cutout.png"); }
.mood-create-page .emotion-choice:nth-child(6) .face { background-image: url("../assets/goodnight/tool-icon-sleep.png"); }

/* Keep both privacy descriptions real, but let them fit the compact two-card
   layout rather than making the first viewport depend on wrapping length. */
.mood-create-page .visibility-card {
  grid-template-columns: 32px minmax(0, 1fr);
  min-height: 50px;
  padding: 6px 8px;
  gap: 4px 7px;
}

.mood-create-page .round-icon {
  width: 28px;
  height: 28px;
}

.mood-create-page .visibility-card small {
  overflow: hidden;
  font-size: 10px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
