<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

const route = useRoute();
const router = useRouter();
const letter = ref<any>();
const loading = ref(true);
const loadError = ref('');
const message = ref('');
const busy = ref(false);

async function load() {
  loading.value = true;
  loadError.value = '';
  const id = String(route.query.id ?? '');
  try {
    // With no id the page used to ask for `letter_today`, which is a demo seed id that exists only for
    // the seeded demo user - every real viewer opening /pages/letter/detail without a query got "没有
    // 找到这封回信". `/letters/today` is the endpoint the today screen itself uses.
    const payload = id
      ? await api.get<any>(`/api/v1/letters/${encodeURIComponent(id)}`)
      : await api.get<any>('/api/v1/letters/today');
    letter.value = payload.item;
  } catch (cause: any) {
    loadError.value = cause?.message ?? '这封回信暂时打不开';
  } finally {
    loading.value = false;
  }
}

async function favorite() {
  if (!letter.value || busy.value) return;
  busy.value = true;
  message.value = '';
  try {
    if (letter.value.favorite) await api.delete(`/api/v1/letters/${letter.value.id}/favorite`);
    else await api.post(`/api/v1/letters/${letter.value.id}/favorite`);
    await load();
    message.value = letter.value?.favorite ? '已收藏这封回信' : '已取消收藏';
  } catch (cause: any) {
    message.value = cause?.message ?? '收藏没有成功';
  } finally {
    busy.value = false;
  }
}

onMounted(load);

const meta = computed(() => {
  const value = letter.value?.createdAt;
  if (!value) return '晚安树洞';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '晚安树洞';
  const day = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `晚安树洞 · ${day} ${time}`;
});

/** The letter body as paragraphs, so a long reply is readable instead of one wall of text. */
const paragraphs = computed(() =>
  String(letter.value?.content ?? '')
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean),
);

const sourceDiaryId = computed(() => (letter.value?.sourceDiaryId ? String(letter.value.sourceDiaryId) : ''));
</script>

<template>
  <section class="page goodnight-page rest-page letter-detail-page">
    <header class="detail-bar">
      <button class="detail-back" data-testid="front-letter-detail-back" aria-label="返回" @click="router.back()">‹</button>
      <h1 class="detail-bar-title">回信详情</h1>
      <span class="detail-more-placeholder" />
    </header>

    <p v-if="loading" class="detail-muted">正在打开这封回信…</p>
    <LoadErrorBanner :message="loadError" retry-label="重新打开" @retry="load" />

    <template v-if="letter">
      <p class="detail-meta" data-testid="letter-detail-meta">{{ meta }}</p>
      <h2 class="detail-title" data-testid="letter-detail-title">{{ letter.title || '给你的一封回信' }}</h2>

      <article v-if="paragraphs.length" class="detail-body" data-testid="letter-detail-body">
        <p v-for="(paragraph, index) in paragraphs" :key="index">{{ paragraph }}</p>
      </article>
      <p v-else class="detail-muted" data-testid="letter-detail-empty">
        这封回信还没有生成出来。可以回到今日回信，换一种风格再试一次。
      </p>

      <h3 class="detail-section-title">相关操作</h3>

      <button
        v-if="sourceDiaryId"
        class="detail-row"
        type="button"
        data-testid="letter-detail-source"
        @click="router.push(`/pages/diary/detail?id=${encodeURIComponent(sourceDiaryId)}`)"
      >
        <span class="detail-row-copy">
          <strong>查看原始记录</strong>
          <small>跳转到对应记录</small>
        </span>
        <span class="detail-chev" aria-hidden="true">›</span>
      </button>

      <button class="detail-row" type="button" data-testid="btn-letter-detail-fav" :disabled="busy" @click="favorite">
        <span class="detail-row-icon" aria-hidden="true">{{ letter.favorite ? '♥' : '♡' }}</span>
        <span class="detail-row-copy">
          <strong>{{ letter.favorite ? '已收藏这封信' : '收藏这封信' }}</strong>
        </span>
        <span class="detail-chev" aria-hidden="true">›</span>
      </button>

      <button class="detail-row" type="button" data-testid="btn-letter-detail-save" @click="router.push('/pages/letter/today')">
        <span class="detail-row-copy">
          <strong>查看今日回信</strong>
          <small>回到今天这封</small>
        </span>
        <span class="detail-chev" aria-hidden="true">›</span>
      </button>

      <p v-if="message" class="detail-status" role="status" data-testid="letter-detail-status">{{ message }}</p>
    </template>

    <!-- Opened without an id (or with one that no longer resolves) the page used to render nothing at
         all: no header, no back button, no way out. Say what happened and offer the way back. -->
    <template v-else-if="!loading && !loadError">
      <h2 class="detail-title" data-testid="letter-detail-missing">没有找到这封回信</h2>
      <p class="detail-muted">它可能已经被删除。可以从回信列表重新打开一封。</p>
      <button class="detail-row" type="button" data-testid="btn-letter-detail-goto-list" @click="router.push('/pages/letter/list')">
        <span class="detail-row-copy"><strong>回到回信列表</strong></span>
        <span class="detail-chev" aria-hidden="true">›</span>
      </button>
    </template>
  </section>
</template>

<style scoped>
/* 设计图 34_LetterDetail.png: a letter reads like a letter - the body is the page, and the actions are
   two plain rows at the bottom. The illustration header and the card around the text are gone. */
.letter-detail-page {
  display: block;
  min-height: 100vh;
  padding: 0 20px calc(40px + env(safe-area-inset-bottom));
  background: #ffffff;
  color: #242a32;
}

.letter-detail-page * { box-sizing: border-box; }

.detail-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 58px;
  margin: 0 -20px;
  padding: 6px 20px;
  border-bottom: 1px solid #f0f1f3;
}

.detail-back {
  width: 26px;
  height: 30px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #242a32;
  font-size: 24px;
  line-height: 1;
}

.detail-bar-title {
  flex: 1;
  margin: 0;
  color: #242a32;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.4px;
}

.detail-more-placeholder { width: 30px; }

.detail-meta {
  margin: 18px 0 0;
  color: #8b939c;
  font-size: 12px;
}

.detail-title {
  margin: 12px 0 0;
  color: #242a32;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.3px;
}

.detail-body { margin-top: 16px; }

.detail-body p {
  margin: 0 0 18px;
  color: #333c44;
  font-size: 15px;
  line-height: 1.95;
}

.detail-body p:last-child { margin-bottom: 0; }

.detail-section-title {
  margin: 30px 0 0;
  color: #242a32;
  font-size: 14.5px;
  font-weight: 700;
}

.detail-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 0;
  border: 0;
  border-bottom: 1px solid #ebedf0;
  background: transparent;
  text-align: left;
}

/* The design puts a hairline between the two action rows and nowhere else: no rule above the first
   row, none under the last one. */
.detail-row:first-of-type { margin-top: 8px; }

.detail-row:last-of-type { border-bottom: 0; }

.detail-row-icon {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 9px;
  background: #f2f4f5;
  color: #5d666f;
  font-size: 17px;
}

.detail-row-copy { flex: 1; min-width: 0; }

.detail-row-copy strong {
  display: block;
  color: #242a32;
  font-size: 14.5px;
  font-weight: 650;
}

.detail-row-copy small {
  display: block;
  margin-top: 4px;
  color: #8b939c;
  font-size: 11.5px;
}

.detail-chev { flex: 0 0 auto; color: #aab0b8; font-size: 20px; }

.detail-muted {
  margin: 16px 0 0;
  color: #8b939c;
  font-size: 12.5px;
  line-height: 1.7;
}

.detail-status {
  margin: 14px 0 0;
  color: #275f56;
  font-size: 12.5px;
}
</style>
