<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

type RequestItem = { id: string; status: string; requestReason?: string; requestQuestion?: string; experience?: { title?: string; domain?: string } };
const router = useRouter();
const items = ref<RequestItem[]>([]);
const loading = ref(true);
const busyId = ref('');
const error = ref('');
const pending = computed(() => items.value.filter((item) => item.status === 'requested'));
const accepted = computed(() => items.value.filter((item) => item.status === 'connected'));

async function load() {
  loading.value = true;
  try {
    items.value = (await api.get<{ items: RequestItem[] }>('/api/v1/peer-requests')).items;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '请求加载失败';
  } finally {
    loading.value = false;
  }
}

async function respond(item: RequestItem, status: 'connected' | 'declined' | 'blocked') {
  busyId.value = item.id;
  error.value = '';
  try {
    await api.post(`/api/v1/peer-matches/${encodeURIComponent(item.id)}/respond`, { status });
    if (status === 'connected') {
      await router.push(`/pages/peer/consent?matchId=${encodeURIComponent(item.id)}`);
    } else {
      await load();
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '请求处理失败';
  } finally {
    busyId.value = '';
  }
}

function openConsent(item: RequestItem) {
  router.push(`/pages/peer/consent?matchId=${encodeURIComponent(item.id)}`);
}

onMounted(load);
</script>

<template>
  <section class="goodnight-page peer-requests-page">
    <header class="peer-header">
      <div class="header-titles">
        <h1 class="peer-title">同行请求</h1>
        <p class="peer-subtitle">查看收到的匿名同行交流请求与处理状态</p>
      </div>
    </header>

    <div class="segmented-control" role="tablist">
      <button type="button" class="active">收到的请求 <b>{{ pending.length }}</b></button>
      <button type="button" @click="router.push('/pages/peers/index')">推荐经历</button>
    </div>

    <p v-if="error" class="error-note">{{ error }}</p>
    <p v-if="loading" class="state-note">正在读取请求…</p>

    <template v-else>
      <section v-if="pending.length" class="request-section">
        <p class="request-intro">有人阅读了你留下的后来记录，希望与你开启限时匿名交流。</p>
        <article v-for="item in pending" :key="item.id" class="request-item">
          <div class="request-identity">
            <div class="avatar-box">
              <span class="avatar-text">求</span>
            </div>
            <div class="identity-info">
              <strong class="identity-name">匿名同行者</strong>
              <span class="identity-meta">{{ item.experience?.domain || '匿名经历' }} · 等待你的回应</span>
            </div>
            <span class="status-pill">待回应</span>
          </div>

          <div class="request-content">
            <h2 class="experience-ref-title">{{ item.experience?.title || '一段匿名经历' }}</h2>
            <blockquote v-if="item.requestQuestion" class="request-question">“{{ item.requestQuestion }}”</blockquote>
            <p v-if="item.requestReason" class="request-reason">{{ item.requestReason }}</p>
          </div>

          <div class="request-actions">
            <button
              :disabled="busyId === item.id"
              class="btn-accept"
              type="button"
              @click="respond(item, 'connected')"
            >
              我愿意聊聊
            </button>
            <button
              :disabled="busyId === item.id"
              class="btn-decline"
              type="button"
              @click="respond(item, 'declined')"
            >
              这次先不了
            </button>
            <button
              :disabled="busyId === item.id"
              class="btn-text"
              type="button"
              @click="respond(item, 'blocked')"
            >
              暂时不想
            </button>
          </div>
        </article>
      </section>

      <section v-else class="empty-panel">
        <span class="empty-glyph" aria-hidden="true">▤</span>
        <h2>暂无新的同行请求</h2>
        <p>当有人阅读你留下的后来记录并希望交流时，请求会显示在这里。</p>
      </section>

      <section v-if="accepted.length" class="accepted-panel">
        <div class="panel-heading">
          <h2>待确认边界的同行</h2>
          <p>你已同意交流，请确认匿名边界规则以开启会话。</p>
        </div>
        <div class="accepted-list">
          <button
            v-for="item in accepted"
            :key="item.id"
            class="accepted-row"
            type="button"
            @click="openConsent(item)"
          >
            <div class="avatar-box avatar-box--small">
              <span class="avatar-text">同</span>
            </div>
            <div class="accepted-info">
              <strong class="accepted-title">{{ item.experience?.title || '匿名经历同行' }}</strong>
              <small class="accepted-desc">{{ item.experience?.domain || '同行交流' }} · 点击确认规则</small>
            </div>
            <span class="row-arrow" aria-hidden="true">›</span>
          </button>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.peer-requests-page {
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
  padding: 8px 4px 4px;
}

.peer-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--gn-ink);
}

.peer-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--gn-muted);
}

.segmented-control {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.segmented-control button {
  min-height: 36px;
  border: 0;
  border-radius: var(--gn-radius-small);
  background: transparent;
  color: var(--gn-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.segmented-control button.active {
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-weight: 600;
}

.segmented-control b {
  font-size: 12px;
  margin-left: 2px;
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

.request-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.request-intro {
  margin: 0;
  padding: 0 4px;
  font-size: 12px;
  color: var(--gn-muted);
  line-height: 1.5;
}

.request-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.request-identity {
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

.avatar-box--small {
  width: 32px;
  height: 32px;
  border-radius: 16px;
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

.status-pill {
  padding: 2px 7px;
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-size: 11px;
  font-weight: 500;
  flex-shrink: 0;
}

.request-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.experience-ref-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--gn-ink);
  line-height: 1.35;
}

.request-question {
  margin: 2px 0 0;
  padding: 8px 10px;
  border-left: 2px solid var(--gn-leaf);
  border-radius: 0 var(--gn-radius-small) var(--gn-radius-small) 0;
  background: var(--gn-paper-warm);
  color: var(--gn-ink-soft);
  font-size: 13px;
  line-height: 1.5;
}

.request-reason {
  margin: 0;
  font-size: 12px;
  color: var(--gn-muted);
  line-height: 1.5;
}

.request-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--gn-line);
}

.btn-accept {
  min-height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf);
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.btn-decline {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper);
  color: var(--gn-ink-soft);
  font-size: 12px;
  cursor: pointer;
}

.btn-text {
  min-height: 32px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--gn-muted);
  font-size: 12px;
  cursor: pointer;
}

.empty-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  text-align: center;
}

.empty-glyph {
  font-size: 24px;
  color: var(--gn-muted);
}

.empty-panel h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--gn-ink);
}

.empty-panel p {
  margin: 0;
  max-width: 280px;
  font-size: 13px;
  color: var(--gn-muted);
  line-height: 1.5;
}

.accepted-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.panel-heading {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.panel-heading h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--gn-ink);
}

.panel-heading p {
  margin: 0;
  font-size: 12px;
  color: var(--gn-muted);
  line-height: 1.4;
}

.accepted-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.accepted-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  text-align: left;
  cursor: pointer;
}

.accepted-row:active {
  background: var(--gn-paper);
}

.accepted-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.accepted-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--gn-ink);
  line-height: 1.3;
}

.accepted-desc {
  font-size: 11px;
  color: var(--gn-muted);
  margin-top: 1px;
}

.row-arrow {
  color: var(--gn-muted);
  font-size: 18px;
  line-height: 1;
}
</style>
