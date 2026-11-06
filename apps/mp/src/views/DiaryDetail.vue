<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, resolveApiUrl } from '../api';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

const route = useRoute();
const router = useRouter();
const diary = ref<any>();
const loading = ref(true);
const loadError = ref('');
const menuOpen = ref(false);
const confirmDelete = ref(false);
const deleting = ref(false);
const actionError = ref('');

async function load() {
  loading.value = true;
  loadError.value = '';
  const id = String(route.query.id ?? '');
  if (!id) {
    loading.value = false;
    return;
  }
  try {
    diary.value = (await api.get<any>(`/api/v1/diaries/${encodeURIComponent(id)}`)).item;
  } catch (cause: any) {
    loadError.value = cause?.message ?? '这篇日记暂时打不开';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const createdAt = computed(() => {
  const value = diary.value?.createdAt;
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} · ${time}`;
});

/**
 * The diary model has no title column, and inventing one would be worse than omitting it. When the
 * user's own first line is short and they wrote more underneath, that line *is* a title and the design
 * has a place for it; otherwise the page starts with the body.
 */
const contentParts = computed(() => {
  const lines = String(diary.value?.content ?? '').split(/\r?\n/);
  const nonEmpty = lines.map((line) => line.trim()).filter(Boolean);
  if (nonEmpty.length >= 2 && nonEmpty[0].length <= 24) {
    return { title: nonEmpty[0], paragraphs: nonEmpty.slice(1) };
  }
  return { title: '', paragraphs: nonEmpty };
});

/** Only a diary that points at its own letter may offer the jump; `hasLetter` alone has no target. */
const letterId = computed(() => (diary.value?.letterId ? String(diary.value.letterId) : ''));

/**
 * Whether this entry is backed by a private mood.
 *
 * The diary list is "your private moods, plus the letters and tool results you saved". An entry that
 * has a mood behind it comes back as a projection the moment its diary row is deleted - so a delete
 * button on it removed a row, the entry reappeared, and the page had claimed a deletion that did not
 * happen. Entries without a mood (a saved letter, a saved tool result) delete for real.
 *
 * What deleting a mood-backed entry *should* do is a product decision: remove the private mood record
 * (and decide what happens to its reply), or hide only its diary presence (which would leave it
 * counted in the month report). Neither is safe to guess, so the page says so instead of offering a
 * button that cannot keep its promise.
 */
const backedByMood = computed(() => Boolean(diary.value?.moodId));

async function removeDiary() {
  if (!diary.value || deleting.value) return;
  deleting.value = true;
  actionError.value = '';
  try {
    await api.delete(`/api/v1/diaries/${encodeURIComponent(diary.value.id)}`);
    confirmDelete.value = false;
    menuOpen.value = false;
    router.back();
  } catch (cause: any) {
    actionError.value = cause?.message ?? '这篇日记暂时删不掉';
    confirmDelete.value = false;
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <section class="page goodnight-page rest-page diary-detail-page">
    <header class="detail-bar">
      <button class="detail-back" data-testid="front-diary-detail-back" aria-label="返回" @click="router.back()">‹</button>
      <h1 class="detail-bar-title">日记详情</h1>
      <button
        v-if="diary"
        class="detail-more"
        type="button"
        data-testid="diary-detail-menu"
        aria-label="更多操作"
        @click="menuOpen = true"
      >···</button>
      <span v-else class="detail-more-placeholder" />
    </header>

    <p v-if="loading" class="detail-muted">正在打开这篇日记…</p>

    <LoadErrorBanner :message="loadError" retry-label="重新打开" @retry="load" />
    <LoadErrorBanner :message="actionError" />

    <template v-if="diary">
      <p class="detail-meta" data-testid="diary-detail-meta">{{ createdAt }}</p>

      <h2 v-if="contentParts.title" class="detail-title" data-testid="diary-detail-title">{{ contentParts.title }}</h2>

      <article class="detail-body" data-testid="diary-detail-body">
        <p v-for="(paragraph, index) in contentParts.paragraphs" :key="index">{{ paragraph }}</p>
      </article>

      <div v-if="diary.attachments?.length" class="detail-attachments" aria-label="日记附件">
        <a
          v-for="asset in diary.attachments"
          :key="asset.id"
          class="detail-attachment"
          :href="resolveApiUrl(asset.url)"
          target="_blank"
          rel="noopener"
        >
          <img :src="resolveApiUrl(asset.url)" :alt="`日记附件 ${asset.id}`">
        </a>
      </div>

      <button
        v-if="letterId"
        class="detail-row"
        type="button"
        data-testid="diary-detail-letter"
        @click="router.push(`/pages/letter/detail?id=${encodeURIComponent(letterId)}`)"
      >
        <span class="detail-row-icon" aria-hidden="true">✉</span>
        <span class="detail-row-copy">
          <strong>有一封回信</strong>
          <small>来自自己审核的匿名回应</small>
        </span>
        <span class="detail-chev" aria-hidden="true">›</span>
      </button>

      <p class="detail-visibility" data-testid="diary-detail-visibility">可见范围：仅自己</p>
    </template>

    <article v-else-if="!loading && !loadError" class="detail-empty" data-testid="diary-detail-empty">
      <strong>没有找到这篇日记</strong>
      <p>它可能已经被清空或删除。</p>
    </article>

    <div v-if="menuOpen" class="sheet-mask" @click.self="menuOpen = false">
      <div class="sheet menu-sheet" data-testid="diary-detail-menu-sheet">
        <h2>这篇日记</h2>
        <p v-if="backedByMood" class="detail-muted" data-testid="diary-detail-delete-unavailable">
          这条记录对应你写下的一条私密心情，目前还不能在这里删除。
        </p>
        <button v-else class="sheet-danger" type="button" data-testid="diary-detail-delete" @click="confirmDelete = true; menuOpen = false">删除这篇日记</button>
        <button type="button" data-testid="diary-detail-menu-close" @click="menuOpen = false">取消</button>
      </div>
    </div>

    <div v-if="confirmDelete" class="sheet-mask" data-testid="diary-detail-delete-confirm">
      <div class="sheet menu-sheet">
        <h2>确定删除？</h2>
        <p class="detail-muted">删除后无法恢复，这封回信也不会再关联到这篇记录。</p>
        <button class="sheet-danger" type="button" :disabled="deleting" data-testid="diary-detail-delete-confirm-button" @click="removeDiary">
          {{ deleting ? '正在删除…' : '确认删除' }}
        </button>
        <button type="button" data-testid="diary-detail-delete-cancel" @click="confirmDelete = false">保留这篇日记</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 设计图 31_DiaryDetail.png: one long-form reading column on white. No card around the text, because a
   card is a container and the point of this page is the writing itself. */
.diary-detail-page {
  display: block;
  min-height: 100vh;
  padding: 0 20px calc(40px + env(safe-area-inset-bottom));
  background: #ffffff;
  color: #242a32;
}

.diary-detail-page * { box-sizing: border-box; }

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

.detail-more,
.detail-more-placeholder {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #4d555d;
  font-size: 17px;
  line-height: 1;
  letter-spacing: 1px;
}

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
  line-height: 1.9;
  white-space: pre-wrap;
}

.detail-body p:last-child { margin-bottom: 0; }

.detail-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
}

.detail-attachment {
  display: block;
  width: 96px;
  height: 96px;
  overflow: hidden;
  border-radius: 8px;
  background: #f4f5f7;
}

.detail-attachment img { width: 100%; height: 100%; object-fit: cover; }

/* The letter entry is a row between two hairlines, as in the design - not a card. */
.detail-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin-top: 22px;
  padding: 14px 0;
  border: 0;
  border-top: 1px solid #e8eaed;
  border-bottom: 1px solid #e8eaed;
  background: transparent;
  text-align: left;
}

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

.detail-visibility {
  margin: 16px 0 0;
  color: #8b939c;
  font-size: 12px;
}

.detail-muted {
  margin: 16px 0 0;
  color: #8b939c;
  font-size: 12.5px;
  line-height: 1.7;
}

.detail-empty {
  margin-top: 40px;
  color: #6c747d;
  text-align: center;
}

.detail-empty strong { display: block; color: #242a32; font-size: 15px; }
.detail-empty p { margin: 8px 0 0; font-size: 12.5px; }

.sheet-danger { color: #b63e3e; }
</style>
