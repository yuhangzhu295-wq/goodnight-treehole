<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, resolveApiUrl } from '../api';

const route = useRoute();
const router = useRouter();
const diary = ref<any>();

async function load() {
  const id = String(route.query.id ?? '');
  if (id) diary.value = (await api.get<any>(`/api/v1/diaries/${encodeURIComponent(id)}`)).item;
}

onMounted(load);
</script>

<template>
  <section class="page goodnight-page rest-page detail-rest-page">
    <header class="rest-topbar">
      <button class="back-icon" data-testid="front-diary-detail-back" @click="router.back()">‹</button>
      <h1>日记详情</h1>
      <span></span>
    </header>
    <article class="decompose-result-card" v-if="diary">
      <span class="tag">{{ diary.emotionLabel || diary.emotion || '心情' }}</span>
      <p>{{ diary.content }}</p>
      <div v-if="diary.attachments?.length" class="diary-detail-attachments" aria-label="日记附件">
        <a
          v-for="asset in diary.attachments"
          :key="asset.id"
          class="diary-detail-attachment"
          :href="resolveApiUrl(asset.url)"
          target="_blank"
          rel="noopener"
        >
          <img :src="resolveApiUrl(asset.url)" :alt="`日记附件 ${asset.id}`">
        </a>
      </div>
      <small>{{ new Date(diary.createdAt).toLocaleString('zh-CN') }}</small>
    </article>
    <article v-else class="empty-card">
      <strong>没有找到这篇日记</strong>
      <p>它可能已经被清空或删除。</p>
    </article>
  </section>
</template>
