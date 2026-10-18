<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const router = useRouter();
const letter = ref<any>();
const message = ref('');

async function load() {
  const id = String(route.query.id ?? 'letter_today');
  letter.value = (await api.get<any>(`/api/v1/letters/${encodeURIComponent(id)}`)).item;
}

async function favorite() {
  if (!letter.value) return;
  if (letter.value.favorite) await api.delete(`/api/v1/letters/${letter.value.id}/favorite`);
  else await api.post(`/api/v1/letters/${letter.value.id}/favorite`);
  await load();
  message.value = letter.value.favorite ? '已收藏' : '已取消收藏';
}

onMounted(load);</script>

<template>
  <section class="page goodnight-page rest-page detail-rest-page" v-if="letter">
    <header class="rest-topbar">
      <button class="back-icon" data-testid="front-letter-detail-back" @click="router.back()">‹</button>
      <h1>回信详情</h1>
      <span></span>
    </header>
    <article class="letter-card">
      <h2>{{ letter.title || '给今晚的你' }}</h2>
      <div class="letter-line"></div>
      <p v-if="letter.content" class="letter-content">{{ letter.content }}</p>
      <p v-else class="letter-content is-empty">这封回信还没有生成出来。可以回到今日回信，换一种风格再试一次。</p>
      <p class="signature">晚安树洞</p>
    </article>
    <div class="report-actions">
      <button data-testid="btn-letter-detail-fav" @click="favorite">{{ letter.favorite ? '取消收藏' : '收藏回信' }}</button>
      <button class="primary" data-testid="btn-letter-detail-save" @click="router.push('/pages/letter/today')">查看今日回信</button>
    </div>
    <p v-if="message" class="floating-status">{{ message }}</p>
  </section>

  <!-- Opened without an id (or with one that no longer resolves) the page used to render nothing at
       all: no header, no back button, no way out. Say what happened and offer the way back. -->
  <section v-else class="page goodnight-page rest-page detail-rest-page">
    <header class="rest-topbar">
      <button class="back-icon" data-testid="front-letter-detail-back" @click="router.back()">‹</button>
      <h1>回信详情</h1>
      <span></span>
    </header>
    <article class="letter-card">
      <h2>没有找到这封回信</h2>
      <div class="letter-line"></div>
      <p class="letter-content is-empty">它可能已经被删除。可以从回信列表重新打开一封。</p>
      <p class="signature">晚安树洞</p>
    </article>
    <div class="report-actions">
      <button class="primary" data-testid="btn-letter-detail-goto-list" @click="router.push('/pages/letter/list')">回到回信列表</button>
    </div>
  </section>
</template>
