<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();
</script>

<template>
  <section class="page goodnight-page rest-page detail-rest-page data-policy-page">
    <header class="rest-topbar">
      <button class="back-icon" data-testid="front-data-policy-back" @click="router.back()">‹</button>
      <h1>数据使用说明</h1>
      <span></span>
    </header>

    <div class="policy-lead">
      <h2>你的数据怎么使用</h2>
      <p>以实际生效的授权和服务端行为为准。</p>
    </div>

    <section class="policy-block">
      <h3>保存什么</h3>
      <p>晚安树洞会保存你主动写下的心情、回信、日记、收藏和反馈工单，用于展示个人记录、生成月报和后台处理反馈。</p>
    </section>

    <section class="policy-block">
      <h3>什么时候用 AI</h3>
      <p>在你使用需要 AI 的功能、且符合相关授权与隐私条件时，系统才会提交必要的信息。</p>
    </section>

    <section class="policy-block">
      <h3>分享给谁</h3>
      <p>隐私设置会影响新内容的默认可见范围、是否允许真人回应，以及月报分享图的生成偏好。只有你允许公开的匿名经历才会进入对应的社交展示。</p>
    </section>

    <section class="policy-block">
      <h3>如何管理与删除</h3>
      <p>可在隐私与数据中查看授权和数据管理操作。删除范围和保留规则以实际界面说明为准。</p>
    </section>
  </section>
</template>

<style scoped>
/* UI V2 (37_DataPolicy) restyle. The page is explanatory copy only: no API, no state. The structure
   follows 设计图/37_DataPolicy.png — an intro and four titled sections — and the copy keeps this
   page's own more specific sentences where they covered the same ground, so nothing the page used to
   tell the reader is lost. */

.data-policy-page {
  padding-bottom: calc(32px + env(safe-area-inset-bottom));
}

.policy-lead h2 {
  margin: 18px 0 0;
  font-size: 24px;
  line-height: 1.3;
  color: var(--gn-ink);
}

.policy-lead p {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--gn-muted);
}

.policy-block {
  display: grid;
  gap: 8px;
  margin-top: 22px;
}

.policy-block h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--gn-ink);
}

.policy-block p {
  margin: 0;
  font-size: 14px;
  line-height: 1.75;
  color: var(--gn-ink-soft, #4a525d);
}
</style>
