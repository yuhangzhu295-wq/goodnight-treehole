<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <section class="page goodnight-page rest-page detail-rest-page">
    <header class="rest-topbar">
      <button class="back-icon" data-testid="front-data-policy-back" @click="router.back()">‹</button>
      <h1>账号与数据说明</h1>
      <span></span>
    </header>
    <article class="decompose-result-card">
      <p>晚安树洞会保存你主动写下的心情、回信、日记、收藏和反馈工单，用于展示个人记录、生成月报和后台处理反馈。</p>
      <p>隐私设置会影响新内容的默认可见范围、是否允许真人回应，以及月报分享图的生成偏好。</p>
    </article>
  </section>
</template>
