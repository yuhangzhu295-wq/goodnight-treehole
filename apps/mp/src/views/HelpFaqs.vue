<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

type Faq = { id: string; question: string; answer: string };

const router = useRouter();
const faqs = ref<Faq[]>([]);
const opened = ref('');
const loading = ref(true);
const loadError = ref('');
const searchOpen = ref(false);
const searchTerm = ref('');

/** Matches the design's three groups. */
const groupRules: Array<{ key: string; label: string; test: RegExp }> = [
  { key: 'account', label: '账号与隐私', test: /身份|账号|匿名|隐私|删除|设备|凭据|编号|找回|数据/ },
  { key: 'ai', label: 'AI 与同路', test: /AI|同路|会话|聊天|匹配|回信|记忆/ },
  { key: 'help', label: '仍需帮助', test: /反馈|提交|运营|联系/ },
];

function groupOf(faq: Faq) {
  const text = `${faq.question}\n${faq.answer}`;
  for (const rule of groupRules) {
    if (rule.test.test(text)) return rule;
  }
  // An unmatched entry still belongs somewhere; it is not dropped and it is not invented into a group
  // its text does not support.
  return { key: 'other', label: '其他问题', test: /$/ };
}

const filtered = computed(() => {
  const term = searchTerm.value.trim().toLowerCase();
  if (!term) return faqs.value;
  return faqs.value.filter((faq) => `${faq.question}\n${faq.answer}`.toLowerCase().includes(term));
});

const groups = computed(() => {
  const buckets = new Map<string, { label: string; items: Faq[] }>();
  for (const faq of filtered.value) {
    const rule = groupOf(faq);
    const bucket = buckets.get(rule.key) ?? { label: rule.label, items: [] };
    bucket.items.push(faq);
    buckets.set(rule.key, bucket);
  }
  return [...buckets.entries()].map(([key, value]) => ({ key, ...value }));
});

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    faqs.value = (await api.get<{ items: Faq[] }>('/api/v1/feedback/faqs')).items ?? [];
  } catch (error: any) {
    loadError.value = error?.message ?? '常见问题加载失败，请稍后重试。';
  } finally {
    loading.value = false;
  }
}

function toggleSearch() {
  searchOpen.value = !searchOpen.value;
  if (!searchOpen.value) searchTerm.value = '';
}

/** The design's last group is a real entry point, not a decoration. */
function openFeedback() {
  router.push('/pages/help/feedback');
}

onMounted(load);
</script>

<template>
  <section class="goodnight-page help-faq-page">
    <header class="faq-bar">
      <button
        class="back-btn"
        data-testid="front-faqs-back"
        type="button"
        aria-label="返回帮助与反馈"
        @click="router.back()"
      >
        ‹
      </button>
      <h1>常见问题</h1>
      <button
        class="search-toggle"
        data-testid="btn-faq-search"
        type="button"
        aria-label="搜索常见问题"
        :aria-expanded="searchOpen"
        @click="toggleSearch"
      >⌕</button>
    </header>

    <div v-if="searchOpen" class="faq-search">
      <input
        v-model="searchTerm"
        data-testid="input-faq-search"
        type="search"
        placeholder="搜索常见问题"
        aria-label="搜索常见问题"
      />
      <button v-if="searchTerm" type="button" data-testid="btn-faq-search-clear" @click="searchTerm = ''">清除</button>
    </div>

    <p v-if="loading" class="faq-state" data-testid="faq-loading">正在读取常见问题…</p>
    <LoadErrorBanner v-else-if="loadError" :message="loadError" retry-label="重新加载" @retry="load()" />

    <template v-else>
      <template v-if="groups.length">
        <section v-for="group in groups" :key="group.key" class="faq-group" :aria-label="group.label">
          <h2 class="group-label">{{ group.label }}</h2>
          <article
            v-for="(faq, index) in group.items"
            :key="faq.id"
            class="faq-item"
            :data-testid="index === 0 && group.key === groups[0].key ? 'faq-full-1' : `faq-${faq.id}`"
          >
            <button
              class="faq-trigger"
              type="button"
              :aria-expanded="opened === faq.id"
              @click="opened = opened === faq.id ? '' : faq.id"
            >
              <strong class="faq-question">{{ faq.question }}</strong>
              <span class="faq-chevron" :class="{ open: opened === faq.id }" aria-hidden="true">›</span>
            </button>
            <div v-if="opened === faq.id" class="faq-content">
              <p class="faq-answer">{{ faq.answer }}</p>
            </div>
          </article>
        </section>
      </template>

      <div v-else class="faq-empty" data-testid="faq-list-empty">
        <strong>{{ searchTerm ? '没有匹配的问题' : '暂时没有可展示的常见问题。' }}</strong>
        <p v-if="searchTerm">换一个词试试，搜索只覆盖已经加载的问题。</p>
      </div>

      <!-- A real route: the last group of the design is where a reader goes when the answer is not
           here, and it leads to the form that actually creates a ticket. -->
      <section class="faq-group" aria-label="仍需帮助">
        <h2 class="group-label">仍需帮助</h2>
        <button class="faq-entry" type="button" data-testid="btn-faq-open-feedback" @click="openFeedback">
          <span class="faq-copy">
            <strong>提交问题反馈</strong>
            <small>将问题发送给运营处理</small>
          </span>
          <span class="faq-chevron" aria-hidden="true">›</span>
        </button>
      </section>
    </template>
  </section>
</template>

<style scoped>
.help-faq-page {
  display: block;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 0;
  gap: 0;
  /* The bar and search below are exactly viewport-wide; `.goodnight-page` clips them at the inset. */
  overflow-x: visible;
  padding: 0 0 calc(24px + env(safe-area-inset-bottom));
  background: var(--gn-bg);
  color: var(--gn-text);
  font-family: var(--gn-font-body);
}

.faq-bar {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 0;
  box-sizing: border-box;
  width: calc(100% + 32px);
  max-width: none;
  min-height: 52px;
  margin: 0 -16px;
  padding: 0 16px;
  border-bottom: 1px solid var(--gn-line);
  border-radius: 0;
  background: var(--gn-paper);
}

.faq-bar h1 {
  margin: 0;
  color: var(--gn-ink);
  text-align: left;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.2px;
  line-height: 1.3;
}

.faq-bar .back-btn,
.faq-bar .search-toggle {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 24px;
  height: 44px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--gn-ink);
  font-size: 22px;
  line-height: 1;
}

.faq-bar .search-toggle { justify-content: flex-end; }

.faq-search {
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  width: calc(100% + 32px);
  margin: 0 -16px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--gn-line);
  background: var(--gn-paper);
}

.faq-search input {
  flex: 1;
  min-width: 0;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--gn-line);
  border-radius: 8px;
  background: var(--gn-paper);
  color: var(--gn-ink);
  font-family: var(--gn-font-body);
  font-size: 14px;
}

.faq-search input:focus {
  outline: none;
  border-color: var(--gn-leaf);
}

.faq-search button {
  flex: none;
  height: 38px;
  padding: 0 10px;
  border: 0;
  background: none;
  color: var(--gn-muted);
  font-size: 13px;
}

.faq-state {
  margin: 24px 0 0;
  color: var(--gn-muted);
  font-size: 14px;
}

.faq-group {
  margin-top: 18px;
}

.group-label {
  margin: 0 0 2px;
  color: var(--gn-ink);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.35;
}

.faq-item {
  border-bottom: 1px solid var(--gn-line);
}

.faq-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  text-align: left;
  color: var(--gn-ink);
}

.faq-question {
  flex: 1;
  min-width: 0;
  color: var(--gn-ink);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.45;
}

.faq-chevron {
  flex: none;
  color: #b6bcc4;
  font-size: 20px;
  line-height: 1;
  transition: transform 0.16s ease;
}

.faq-chevron.open {
  transform: rotate(90deg);
}

.faq-content {
  padding: 0 0 14px;
}

.faq-answer {
  margin: 0;
  color: var(--gn-ink-soft, #4a525d);
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-line;
}

.faq-empty {
  margin: 26px 0 0;
  padding: 20px 0;
}

.faq-empty strong {
  display: block;
  color: var(--gn-ink);
  font-size: 15px;
  font-weight: 600;
}

.faq-empty p {
  margin: 6px 0 0;
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.6;
}

.faq-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--gn-line);
  border-radius: 0;
  background: none;
  text-align: left;
}

.faq-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.faq-copy strong {
  color: var(--gn-ink);
  font-size: 15px;
  font-weight: 600;
}

.faq-copy small {
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.45;
}
</style>
