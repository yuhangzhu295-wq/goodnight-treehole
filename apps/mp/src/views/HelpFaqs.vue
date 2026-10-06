<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const faqs = ref<any[]>([]);
const opened = ref('');
const loading = ref(true);
const loadError = ref('');

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    faqs.value = (await api.get<any>('/api/v1/feedback/faqs')).items ?? [];
  } catch (error: any) {
    loadError.value = error?.message ?? '常见问题加载失败，请稍后重试。';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="goodnight-page help-faq-page">
    <header class="faq-header">
      <button
        class="back-btn"
        data-testid="front-faqs-back"
        type="button"
        aria-label="返回帮助与反馈"
        @click="router.back()"
      >
        ‹
      </button>
      <div class="header-titles">
        <h1 class="faq-title">常见问题</h1>
        <p class="faq-subtitle">使用指南与常见疑问解答</p>
      </div>
    </header>

    <div v-if="loading" class="status-msg info" role="status">正在读取常见问题…</div>
    <template v-else>
      <p v-if="loadError" class="status-msg error" role="status">{{ loadError }}</p>
      <section v-if="faqs.length" class="group-section" aria-label="全部常见问题">
        <div class="section-label">全部问题 ({{ faqs.length }})</div>
        <div class="group-surface">
          <article
            v-for="(faq, index) in faqs"
            :key="faq.id"
            class="faq-item"
            :data-testid="`faq-full-${index + 1}`"
          >
            <button
              class="faq-trigger"
              type="button"
              :aria-expanded="opened === faq.id"
              @click="opened = opened === faq.id ? '' : faq.id"
            >
              <span class="faq-icon" aria-hidden="true">?</span>
              <strong class="faq-question">{{ faq.question }}</strong>
              <span class="faq-chevron" :class="{ open: opened === faq.id }" aria-hidden="true">›</span>
            </button>
            <div v-if="opened === faq.id" class="faq-content">
              <p class="faq-answer">{{ faq.answer }}</p>
            </div>
          </article>
        </div>
      </section>
      <div v-else class="empty-surface">
        <p class="empty-note">暂时没有可展示的常见问题。</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.help-faq-page {
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

.faq-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 4px 4px;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  min-height: 32px;
  margin-top: 2px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--gn-muted);
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
}

.header-titles {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.faq-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--gn-ink);
}

.faq-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--gn-muted);
}

.status-msg {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--gn-radius-card);
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
  font-size: 13px;
  line-height: 1.4;
}

.status-msg.error {
  color: var(--gn-danger);
}

.status-msg.info {
  color: var(--gn-muted);
  text-align: center;
}

.group-section {
  display: flex;
  flex-direction: column;
}

.section-label {
  padding: 8px 4px 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--gn-muted);
}

.group-surface {
  background: var(--gn-paper);
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  overflow: hidden;
}

.faq-item {
  display: flex;
  flex-direction: column;
}

.faq-item + .faq-item {
  border-top: 1px solid var(--gn-line);
}

.faq-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 12px 14px;
  border: 0;
  background: transparent;
  text-align: left;
  color: var(--gn-ink);
  cursor: pointer;
}

.faq-trigger:active {
  background: var(--gn-paper-warm);
}

.faq-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 11px;
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.faq-question {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--gn-ink);
  line-height: 1.35;
}

.faq-chevron {
  font-size: 18px;
  color: var(--gn-muted);
  line-height: 1;
  flex-shrink: 0;
  transition: transform 0.16s ease;
}

.faq-chevron.open {
  transform: rotate(90deg);
}

.faq-content {
  padding: 0 14px 12px 46px;
  background: var(--gn-paper);
}

.faq-answer {
  margin: 0;
  font-size: 13px;
  color: var(--gn-text);
  line-height: 1.55;
  white-space: pre-line;
}

.empty-surface {
  padding: 24px 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  text-align: center;
}

.empty-note {
  margin: 0;
  font-size: 13px;
  color: var(--gn-muted);
  line-height: 1.5;
}

@media (max-width: 374px) {
  .help-faq-page {
    padding-right: 12px;
    padding-left: 12px;
  }
}
</style>
