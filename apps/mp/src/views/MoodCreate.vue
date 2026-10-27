<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { AIStyle } from '@goodnight/shared-types';
import { api, deleteMedia, resolveApiUrl, uploadMedia } from '../api';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

const router = useRouter();
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
/** Once the reader picks a row, a late settings response must not overwrite that choice. */
const visibilityTouched = ref(false);
let settingsPromise: Promise<void> | null = null;
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
  // Re-entrancy guard at the entry: lock immediately before any async wait so rapid double-taps
  // cannot both pass the check while settingsPromise is resolving.
  if (submitting.value) return;
  submitting.value = true;
  try {
    if (settingsPromise && !visibilityTouched.value) {
      try {
        await settingsPromise;
      } catch {
        // Safe fallback: keep PRIVATE if settings query fails
      }
    }
    error.value = validate();
    if (error.value) return;
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

/**
 * The privacy setting is the default visibility for new content. This page used to hardcode PRIVATE
 * while the policy page said the setting decides it, so the statement was false for anyone who had
 * switched the default to PUBLIC. A failed read keeps the safe PRIVATE default.
 */
onMounted(() => {
  settingsPromise = (async () => {
    try {
      const response = await api.get<{ item: { defaultVisibility?: string } }>('/api/v1/settings/privacy');
      const next = response.item?.defaultVisibility;
      if (!visibilityTouched.value && (next === 'PUBLIC' || next === 'PRIVATE')) {
        form.visibility = next;
      }
    } catch {
      // Keep PRIVATE: an unavailable preference must not silently make a mood public.
    }
  })();
});
</script>

<template>
  <section class="page goodnight-page mood-create-page">
    <header class="compact-topbar bleed-bar">
      <button class="back-icon" data-testid="front-mood-back" aria-label="返回" @click="safeBack">‹</button>
      <h1>写一段话</h1>
      <span class="topbar-spacer" aria-hidden="true"></span>
    </header>

    <p class="mood-lead">写下现在的想法，你可以选择是否公开。</p>

    <!-- The editor is the page. The old version boxed it in a rounded card with a mascot in the corner,
         which pushed the primary action off the first screen. -->
    <section class="write-card">
      <textarea v-model="form.content" data-testid="input-mood-content" maxlength="1000" placeholder="比如：今天开会的时候，我还是有点紧张……" />
      <span class="counter">{{ countText }}</span>
    </section>

    <section class="mood-section">
      <h2>可见范围</h2>
      <div class="visibility-rows">
        <button data-testid="mood-visibility-private" class="visibility-row" :class="{ active: form.visibility === 'PRIVATE' }" @click="visibilityTouched = true; form.visibility = 'PRIVATE'">
          <span class="radio-dot" aria-hidden="true" />
          <span class="visibility-copy"><strong>仅自己可见</strong><small>不会公开</small></span>
          <span class="visibility-check" aria-hidden="true">{{ form.visibility === 'PRIVATE' ? '✓' : '' }}</span>
        </button>
        <button data-testid="mood-visibility-public" class="visibility-row" :class="{ active: form.visibility === 'PUBLIC' }" @click="visibilityTouched = true; form.visibility = 'PUBLIC'">
          <span class="radio-dot" aria-hidden="true" />
          <span class="visibility-copy"><strong>申请公开</strong><small>提交后进入真实审核流程</small></span>
          <span class="visibility-check" aria-hidden="true">{{ form.visibility === 'PUBLIC' ? '✓' : '' }}</span>
        </button>
      </div>
    </section>

    <!-- The design calls this 话题; this product stores an emotion, and the monthly report and the
         letter are built from that value, so the heading keeps saying what the choice really is. -->
    <section class="mood-section">
      <h2>话题 <small>会用来生成月报和回信</small></h2>
      <div class="emotion-row">
        <button
          v-for="item in emotions.slice(0, 6)"
          :key="item.testId"
          :data-testid="item.testId"
          class="emotion-pill"
          :class="{ active: form.emotion === item.value }"
          :aria-pressed="form.emotion === item.value"
          @click="form.emotion = item.value"
        >{{ item.label }}</button>
      </div>
    </section>

    <!-- Real options the design does not show; collapsed so the primary action stays on the first screen. -->
    <details class="more-options">
      <summary>更多选项 <small>回应风格 · 添加图片</small></summary>
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
          {{ item.label }}
        </button>
      </div>
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
    </details>

    <!-- 本页没有可重试的加载函数（错误来自校验/上传/发布），仅展示错误提示。 -->
    <LoadErrorBanner :message="error" />

    <div class="submit-dock">
      <button class="submit-bar" data-testid="btn-submit-mood" :disabled="submitting" @click="submit">{{ submitting ? '正在保存…' : '保存这段话' }}</button>
    </div>
  </section>
</template>

<style scoped>
/* The composer is the page: a plain top bar, then the textarea, then the choices. The old header
   spent ~150px on a display title, mood copy and a mascot cutout above the writing area. */
.compact-topbar {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 32px;
  align-items: center;
  min-height: 52px;
  margin: 0 -20px;
  padding: 0 20px;
  border-bottom: 1px solid #e8eaed;
  background: #ffffff;
}

.compact-topbar h1 {
  color: #242a32;
  font-size: 17px;
  font-weight: 650;
  text-align: center;
}

/* The design's one-line subtitle under the bar. */
.mood-lead {
  margin: 14px 0 0;
  color: #6c747d;
  font-size: 13px;
  line-height: 1.55;
}

/*
 * The shared `.mood-create-page .back-icon` is absolutely positioned for the old hero. Inside this
 * three-column bar it has to stay in the flow, or the title is pushed into the first (32px) column
 * and renders one character per line - measured as 32px wide by 99px tall.
 */
.mood-create-page .compact-topbar .back-icon {
  justify-self: start;
  position: static;
  width: 32px;
  height: 32px;
  border: 0;
  background: none;
  color: #39454c;
  font-size: 24px;
  line-height: 1;
}

.topbar-spacer { display: block; }

.write-card {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid #e4e7ea;
  border-radius: 10px;
  background: #ffffff;
}

.write-card textarea {
  width: 100%;
  min-height: 180px;
  padding: 0;
  border: 0;
  background: none;
  color: #242a32;
  font-size: 15px;
  line-height: 1.7;
  resize: none;
}

.write-card .counter {
  display: block;
  margin-top: 8px;
  color: #9aa1a8;
  font-size: 11px;
  text-align: right;
}

/* Visibility is the one choice the design keeps on the first level: private is the default and has
   to be obvious, because it is what a first-time writer gets. */
.panel-card {
  margin-top: 14px;
  padding: 14px;
  border: 1px solid #e8eaed;
  border-radius: 10px;
  background: #ffffff;
}

.panel-card h2 {
  margin: 0 0 10px;
  color: #242a32;
  font-size: 13.5px;
  font-weight: 650;
}

/* Reply style and attachments are second-level: still fully functional, but folded away so the
   writing area and the privacy choice lead. */
.secondary-panel {
  padding: 0;
  overflow: hidden;
}

.secondary-panel > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  padding: 0 14px;
  color: #39454c;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  list-style: none;
}

.secondary-panel > summary::-webkit-details-marker { display: none; }

.secondary-panel > summary::after {
  content: '⌄';
  color: #9aa1a8;
  font-size: 14px;
}

.secondary-panel[open] > summary::after { content: '⌃'; }

.secondary-panel > *:not(summary) {
  margin: 0 14px 14px;
}

/* The reference gives this otherwise short display title a little more
   breathing room than the body font.  This is isolated to the static hero;
   it does not alter the editable form or its responsive card geometry. */
.mood-create-page .compact-hero h1 {
  font-size: 46px;
  letter-spacing: .02em;
}

/* No mascot in the corner: the design has no illustrations, and the crop forced an 84px right
   padding on the textarea and pushed the counter away from the edge it belongs on. */
.mood-create-page .counter {
  right: 12px;
  z-index: 2;
}


/* Text pills, not illustrated tiles: the design's 话题 row is plain text, and the six assets that used
   to sit behind these labels were V1 mascots. */

/* The design's visibility choice is two full-width rows - radio, name, consequence, check - not two
   side-by-side cards. The consequence line stays a full sentence on its own line: it is the whole
   privacy difference between the two options, so it is never truncated. */
.mood-create-page .visibility-rows {
  display: flex;
  flex-direction: column;
}

.mood-create-page .visibility-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 0;
  padding: 12px 0;
  border: 0;
  border-radius: 0;
  border-bottom: 1px solid #e8eaed;
  background: transparent;
  box-shadow: none;
  text-align: left;
}

.mood-create-page .visibility-row:last-child {
  border-bottom: 0;
}

.mood-create-page .radio-dot {
  display: grid;
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  place-items: center;
  border: 1.5px solid #c9ced6;
  border-radius: 50%;
  background: #fff;
}

.mood-create-page .visibility-row.active .radio-dot {
  border-color: #275f56;
}

.mood-create-page .visibility-row.active .radio-dot::after {
  content: '';
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #275f56;
}

.mood-create-page .visibility-copy {
  display: block;
  flex: 1;
  min-width: 0;
}

.mood-create-page .visibility-copy strong {
  display: block;
  color: #242a32;
  font-size: 15px;
  font-weight: 650;
}

.mood-create-page .visibility-copy small {
  display: block;
  margin-top: 3px;
  color: #8b939c;
  font-size: 11.5px;
  line-height: 1.4;
  white-space: normal;
  word-break: break-word;
}

.mood-create-page .visibility-check {
  flex: 0 0 auto;
  color: #275f56;
  font-size: 16px;
}

/* ---- V2 layout ---------------------------------------------------------------------------------
   One reading column: editor, 可见范围, 话题, then a sticky primary action. The old page stacked four
   rounded panels, which pushed 保存这段话 past the fold - the one control the page exists for. */
.mood-create-page.goodnight-page {
  display: block;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  /* Full viewport height so the sticky dock reaches the bottom on a short page. */
  min-height: 100vh;
  padding: 0 0 calc(96px + env(safe-area-inset-bottom));
}

.mood-create-page .compact-topbar h1 {
  text-align: left;
}

.mood-create-page .write-card {
  position: relative;
  margin: 14px 0 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.mood-create-page .write-card textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 148px;
  padding: 12px 12px 26px;
  border: 1px solid #e4e7ea;
  border-radius: 8px;
  background: #ffffff;
  color: #242a32;
  font-size: 15px;
  line-height: 1.7;
  resize: vertical;
}

.mood-section {
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid #ebedf0;
}

.mood-section h2 {
  margin: 0 0 10px;
  color: #242a32;
  font-size: 14.5px;
  font-weight: 650;
}

.mood-section h2 small {
  margin-left: 6px;
  color: #8b939c;
  font-size: 11.5px;
  font-weight: 400;
}

.emotion-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.emotion-pill {
  min-height: 0;
  padding: 7px 14px;
  border: 1px solid #e4e7ea;
  border-radius: 999px;
  background: #ffffff;
  color: #5c656f;
  font-size: 13px;
  line-height: 1.2;
}

.emotion-pill.active {
  border-color: #c3dad0;
  background: #eaf2ee;
  color: #275f56;
  font-weight: 600;
}

.more-options {
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px solid #ebedf0;
}

.more-options > summary {
  color: #5c656f;
  font-size: 13px;
  cursor: pointer;
}

.more-options > summary small {
  color: #8b939c;
  font-size: 11.5px;
}

.more-options .style-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

/* Sticky, so 保存这段话 is on screen no matter how long the text or how many options are open. */
.submit-dock {
  position: sticky;
  bottom: 0;
  z-index: 5;
  box-sizing: border-box;
  width: calc(100% + 36px);
  max-width: none;
  margin: 20px 0 0 -18px;
  padding: 12px 18px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid #ebedf0;
  background: #ffffff;
}

.submit-dock .submit-bar {
  width: 100%;
  min-height: 46px;
  border: 0;
  border-radius: 10px;
  background: #275f56;
  color: #ffffff;
  font-size: 15px;
  font-weight: 650;
}
</style>
