<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const profile = ref<any>();

async function load() {
  profile.value = (await api.get<any>('/api/v1/me/profile')).item;
}

onMounted(load);
</script>

<template>
  <section class="page goodnight-page rest-page detail-rest-page" v-if="profile">
    <header class="rest-topbar">
      <button class="back-icon" data-testid="front-profile-back" @click="router.back()">‹</button>
      <h1>个人资料</h1>
      <span></span>
    </header>
    <article class="growth-card">
      <span class="avatar-bubble large">芽</span>
      <h2>{{ profile.nickname || '晚安旅人' }}</h2>
      <p>{{ profile.anonymousCode }}</p>
      <p class="muted">账号状态：{{ profile.status === 'normal' ? '正常' : profile.status }}</p>
    </article>
  </section>
</template>
