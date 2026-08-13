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
  <section class="page goodnight-page rest-page list-page help-faq-page">
    <header class="help-faq-hero">
      <img class="help-faq-tree" src="../assets/goodnight/tree-top-cutout.png" alt="" aria-hidden="true" />
      <button class="help-faq-back" data-testid="front-faqs-back" type="button" aria-label="返回帮助与反馈" @click="router.back()">‹</button>
      <div><p>帮助与反馈</p><h1>全部常见问题</h1></div>
    </header>

    <div v-if="loading" class="help-faq-state" role="status">正在读取常见问题…</div>
    <template v-else>
      <p v-if="loadError" class="help-faq-error" role="status">{{ loadError }}</p>
      <section v-if="faqs.length" class="help-faq-list" aria-label="全部常见问题">
        <article v-for="(faq, index) in faqs" :key="faq.id" class="help-faq-item" :data-testid="`faq-full-${index + 1}`">
          <button type="button" :aria-expanded="opened === faq.id" @click="opened = opened === faq.id ? '' : faq.id">
            <span class="help-faq-icon" aria-hidden="true">?</span>
            <strong>{{ faq.question }}</strong>
            <span class="help-faq-chevron" :class="{ open: opened === faq.id }" aria-hidden="true">›</span>
          </button>
          <p v-if="opened === faq.id">{{ faq.answer }}</p>
        </article>
      </section>
      <p v-else class="help-faq-state">暂时没有可展示的常见问题。</p>
    </template>
  </section>
</template>

<style scoped>
.help-faq-page {
  display: block;
  min-height: 100vh;
  padding: 0 14px calc(132px + env(safe-area-inset-bottom));
  overflow: hidden;
  background:
    radial-gradient(circle at 94% 4%, rgba(228, 239, 206, .68), transparent 22rem),
    linear-gradient(180deg, #fffdf8 0%, #fcf8ed 78%, #f8f1e3 100%);
  color: #2c382a;
}

.help-faq-page *,
.help-faq-page *::before,
.help-faq-page *::after { box-sizing: border-box; }

.help-faq-hero {
  position: relative;
  display: flex;
  gap: 15px;
  align-items: center;
  min-height: 154px;
  margin: 0 -14px 5px;
  padding: 31px 22px 24px;
  overflow: hidden;
  isolation: isolate;
}

.help-faq-tree { position: absolute; top: -39px; right: -32px; z-index: -1; width: min(62vw, 285px); max-width: none; opacity: .66; pointer-events: none; }
.help-faq-back { display: grid; place-items: center; flex: 0 0 auto; width: 42px; height: 42px; min-height: 42px; padding: 0; border: 0; border-radius: 50%; color: #4c6e32; background: rgba(255, 253, 246, .72); box-shadow: none; font-size: 38px; line-height: 1; }
.help-faq-hero > div { min-width: 0; }
.help-faq-hero p { margin: 0 0 5px; color: #768b50; font-size: 13px; font-weight: 700; letter-spacing: .08em; }
.help-faq-hero h1 { margin: 0; color: #304829; font-family: var(--gn-font-body, "Noto Serif SC", serif); font-size: clamp(28px, 8.5vw, 38px); letter-spacing: .04em; line-height: 1.15; }

.help-faq-list { overflow: hidden; border: 1px solid rgba(126, 145, 83, .18); border-radius: 25px; background: rgba(255, 255, 252, .95); box-shadow: 0 14px 30px rgba(74, 84, 55, .08); }
.help-faq-item { padding: 0 18px; border-bottom: 1px solid rgba(133, 145, 108, .16); }
.help-faq-item:last-child { border-bottom: 0; }
.help-faq-item button { display: grid; grid-template-columns: 42px minmax(0, 1fr) 20px; gap: 9px; align-items: center; width: 100%; min-height: 68px; padding: 10px 0; border: 0; border-radius: 0; color: #303a2f; background: transparent; box-shadow: none; text-align: left; }
.help-faq-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; color: #6d8548; background: #f6f3e5; font-family: Georgia, serif; font-size: 22px; }
.help-faq-item strong { overflow: hidden; font-size: 16px; line-height: 1.45; text-overflow: ellipsis; white-space: nowrap; }
.help-faq-chevron { color: #958d7d; font-size: 30px; font-weight: 300; line-height: 1; transition: transform .16s ease; }
.help-faq-chevron.open { transform: rotate(90deg); }
.help-faq-item > p { margin: -2px 0 16px 43px; color: #687364; font-size: 14px; line-height: 1.7; }
.help-faq-state, .help-faq-error { margin: 34px 12px; color: #71806a; font-size: 14px; line-height: 1.6; text-align: center; }
.help-faq-error { color: #a05d45; }

@media (max-width: 374px) {
  .help-faq-page { padding-right: 11px; padding-left: 11px; }
  .help-faq-hero { margin-right: -11px; margin-left: -11px; padding-right: 17px; padding-left: 17px; }
  .help-faq-item { padding-right: 14px; padding-left: 14px; }
  .help-faq-item button { grid-template-columns: 38px minmax(0, 18px); gap: 8px; }
  .help-faq-item strong { font-size: 15px; }
}
</style>
