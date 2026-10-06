<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const router = useRouter();
const detail = ref<any>(null);
const loading = ref(true);
const requesting = ref(false);
const requestReason = ref('我想听听你后来是怎么把这段日子走过去的。');
const requestQuestion = ref('如果只留一句给当时的自己，你会说什么？');
const requestOpen = ref(false);
const error = ref('');
const experienceId = computed(() => String(route.query.id ?? ''));
const matchId = computed(() => String(route.query.matchId ?? ''));

async function load() {
  if (!experienceId.value) {
    error.value = '没有找到要查看的经历';
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    detail.value = (await api.get<any>(`/api/v1/peer-experiences/${encodeURIComponent(experienceId.value)}`)).item;
  } catch (cause: any) {
    error.value = cause?.message ?? '经历加载失败';
  } finally {
    loading.value = false;
  }
}

async function requestConversation() {
  if (!matchId.value) return;
  requesting.value = true;
  error.value = '';
  try {
    await api.patch(`/api/v1/peer-matches/${encodeURIComponent(matchId.value)}`, {
      status: 'requested',
      requestReason: requestReason.value,
      requestQuestion: requestQuestion.value,
    });
    await router.push(`/pages/peer/wait?matchId=${encodeURIComponent(matchId.value)}`);
  } catch (cause: any) {
    error.value = cause?.message ?? '请求发送失败';
  } finally {
    requesting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="goodnight-page peer-detail-page">
    <header class="peer-header">
      <button class="back-btn" aria-label="返回同路经历" type="button" @click="router.back()">‹</button>
      <div class="header-titles">
        <h1 class="peer-title">匿名经历</h1>
        <p class="peer-subtitle">{{ detail?.experience?.domain || '同路记录' }} · 阶段回顾</p>
      </div>
    </header>

    <p v-if="loading" class="state-note">正在展开这段后来…</p>
    <p v-else-if="error" class="error-note" role="alert">{{ error }}</p>

    <template v-else-if="detail">
      <article class="story-article">
        <div class="story-identity">
          <div class="avatar-box">
            <span class="avatar-text">{{ (detail.experience?.domain || '同')[0] }}</span>
          </div>
          <div class="identity-info">
            <strong class="identity-name">匿名同行者</strong>
            <span class="identity-meta">{{ detail.experience.domain }} · 经确认公开</span>
          </div>
        </div>

        <h1 class="story-heading">{{ detail.experience.title }}</h1>
        <p class="story-content">{{ detail.experience.content }}</p>

        <div v-if="detail.experience.tags?.length" class="story-tags">
          <span v-for="tag in detail.experience.tags" :key="tag">{{ tag }}</span>
        </div>
      </article>

      <section class="detail-section">
        <div class="section-heading">
          <h2 class="section-title">后来是这样走过来的</h2>
        </div>
        <div class="section-content">
          <p class="later-summary">{{ detail.later.summary || detail.later.message || '这段后来记录还在持续更新中。' }}</p>
          <p v-if="detail.retrospective" class="retrospective-text">{{ detail.retrospective }}</p>
        </div>
      </section>

      <section v-if="detail.timeline?.length" class="detail-section">
        <div class="section-heading">
          <h2 class="section-title">走过的片段</h2>
        </div>
        <div class="timeline-list">
          <div v-for="entry in detail.timeline" :key="entry.id" class="timeline-item">
            <p>{{ entry.content }}</p>
          </div>
        </div>
      </section>

      <section class="actions-comparison">
        <div class="comparison-column">
          <div class="column-header">
            <span class="comparison-badge good">有效</span>
            <h3>有一点帮助的尝试</h3>
          </div>
          <ul class="comparison-list">
            <li v-for="action in detail.helpfulActions" :key="action">{{ action }}</li>
            <li v-if="!detail.helpfulActions?.length" class="empty-item">未记录具体方式</li>
          </ul>
        </div>

        <div class="comparison-column">
          <div class="column-header">
            <span class="comparison-badge neutral">参考</span>
            <h3>不太适合的尝试</h3>
          </div>
          <ul class="comparison-list">
            <li v-for="action in detail.notHelpfulActions" :key="action">{{ action }}</li>
            <li v-if="!detail.notHelpfulActions?.length" class="empty-item">每个人的节奏都不一样</li>
          </ul>
        </div>
      </section>

      <section v-if="matchId" class="callout-panel">
        <div class="callout-info">
          <strong>想向 TA 递出匿名提问？</strong>
          <p>写下你想知道的问题，对方确认后可开启最长 72 小时的匿名交流。</p>
        </div>
        <button class="btn-primary" type="button" @click="requestOpen = true">请求匿名交流</button>
      </section>

      <div
        v-if="matchId && requestOpen"
        class="dialog-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="peer-request-title"
        @click.self="requestOpen = false"
      >
        <div class="dialog-box">
          <div class="dialog-header">
            <div class="dialog-title-group">
              <span class="dialog-tag">匿名同行</span>
              <h2 id="peer-request-title">递出匿名请求</h2>
            </div>
            <button class="close-btn" type="button" aria-label="关闭请求面板" @click="requestOpen = false">×</button>
          </div>
          <p class="dialog-desc">全程不会展示昵称、联系方式或任何可识别身份信息。</p>

          <label class="form-field">
            <span>我为什么想聊</span>
            <textarea v-model="requestReason" maxlength="280" />
          </label>

          <label class="form-field">
            <span>我最想问的一句话</span>
            <input v-model="requestQuestion" maxlength="160">
          </label>

          <button
            class="btn-primary"
            :disabled="requesting || !requestReason.trim()"
            type="button"
            @click="requestConversation"
          >
            {{ requesting ? '正在递出请求…' : '递出匿名请求' }}
          </button>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.peer-detail-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
  padding: 12px 16px calc(112px + env(safe-area-inset-bottom));
  background: var(--gn-bg);
  color: var(--gn-text);
  font-family: var(--gn-font-body);
}

.peer-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px 4px;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  color: var(--gn-ink);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
}

.header-titles {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.peer-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--gn-ink);
}

.peer-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--gn-muted);
}

.state-note {
  margin: 24px 0;
  color: var(--gn-muted);
  font-size: 13px;
  text-align: center;
}

.error-note {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--gn-radius-card);
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
  color: var(--gn-danger);
  font-size: 13px;
}

.story-article {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.story-identity {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 18px;
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  flex-shrink: 0;
}

.avatar-text {
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
}

.identity-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.identity-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--gn-ink);
  line-height: 1.3;
}

.identity-meta {
  font-size: 11px;
  color: var(--gn-muted);
  line-height: 1.3;
}

.story-heading {
  margin: 2px 0 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--gn-ink);
  line-height: 1.35;
}

.story-content {
  margin: 0;
  font-size: 14px;
  color: var(--gn-ink-soft);
  line-height: 1.65;
  white-space: pre-wrap;
}

.story-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.story-tags span {
  padding: 2px 8px;
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  border: 1px solid var(--gn-line);
  color: var(--gn-ink-soft);
  font-size: 11px;
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.section-heading {
  display: flex;
  align-items: center;
}

.section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--gn-ink);
}

.section-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.later-summary {
  margin: 0;
  font-size: 13px;
  color: var(--gn-ink-soft);
  line-height: 1.6;
}

.retrospective-text {
  margin: 0;
  padding-top: 6px;
  border-top: 1px solid var(--gn-line);
  font-size: 13px;
  color: var(--gn-muted);
  line-height: 1.55;
}

.timeline-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.timeline-item {
  padding: 8px 10px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
}

.timeline-item p {
  margin: 0;
  font-size: 13px;
  color: var(--gn-ink-soft);
  line-height: 1.5;
}

.actions-comparison {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.comparison-column {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.column-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.comparison-badge {
  padding: 2px 6px;
  border-radius: var(--gn-radius-small);
  font-size: 11px;
  font-weight: 600;
}

.comparison-badge.good {
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
}

.comparison-badge.neutral {
  background: var(--gn-paper-warm);
  border: 1px solid var(--gn-line);
  color: var(--gn-muted);
}

.column-header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--gn-ink);
}

.comparison-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding-left: 16px;
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.5;
}

.empty-item {
  list-style: none;
  margin-left: -16px;
  color: var(--gn-muted);
  font-size: 12px;
}

.callout-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.callout-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.callout-info strong {
  font-size: 14px;
  font-weight: 600;
  color: var(--gn-ink);
}

.callout-info p {
  margin: 0;
  font-size: 12px;
  color: var(--gn-muted);
  line-height: 1.45;
}

.btn-primary {
  min-height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--gn-radius-card);
  background: var(--gn-leaf);
  color: #ffffff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.6;
}

.dialog-backdrop {
  position: fixed;
  z-index: 120;
  inset: 0;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.4);
  padding: 16px;
  box-sizing: border-box;
}

.dialog-box {
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.dialog-title-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dialog-tag {
  font-size: 11px;
  color: var(--gn-leaf-deep);
  font-weight: 600;
}

.dialog-header h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--gn-ink);
}

.close-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper);
  color: var(--gn-muted);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.dialog-desc {
  margin: 0;
  font-size: 12px;
  color: var(--gn-muted);
  line-height: 1.45;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--gn-ink);
}

.form-field textarea,
.form-field input {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  padding: 8px 10px;
  font-family: inherit;
  font-size: 13px;
  color: var(--gn-ink);
  line-height: 1.5;
}

.form-field textarea {
  min-height: 64px;
  resize: none;
}
</style>
