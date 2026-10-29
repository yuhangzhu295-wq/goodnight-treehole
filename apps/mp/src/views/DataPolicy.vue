<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

/**
 * Every section starts open.
 *
 * The page is a policy: a section that hides what it says until it is tapped is a way of not telling
 * the reader. `保存什么` and `如何管理与删除` are the two that decide whether someone can act at all,
 * so they can never be collapsed away.
 */
const openSections = ref<Record<string, boolean>>({
  keep: true,
  ai: true,
  share: true,
  manage: true,
});

function toggle(key: string) {
  openSections.value[key] = !openSections.value[key];
}

function openPrivacy() {
  router.push('/pages/settings/privacy');
}
</script>

<template>
  <section class="page goodnight-page rest-page detail-rest-page data-policy-page">
    <header class="rest-topbar">
      <button class="back-icon" data-testid="front-data-policy-back" type="button" aria-label="返回" @click="router.back()">
        ‹
      </button>
      <h1>数据使用说明</h1>
      <span></span>
    </header>

    <div class="policy-lead">
      <h2>你的数据怎么使用</h2>
      <p>以实际生效的授权和服务端行为为准。</p>
    </div>

    <section class="policy-block" aria-label="保存什么">
      <button
        class="policy-head"
        type="button"
        data-testid="policy-toggle-keep"
        :aria-expanded="openSections.keep"
        @click="toggle('keep')"
      >
        <strong>保存什么</strong>
        <span class="policy-chevron" aria-hidden="true">›</span>
      </button>
      <div v-if="openSections.keep" class="policy-body" data-testid="policy-body-keep">
        <p>晚安树洞会保存你主动写下的心情、回信、日记、收藏和反馈工单，用于展示个人记录、生成月报和后台处理反馈。</p>
        <p>账号身份由服务端签发的匿名凭据确认。凭据可能到期、被撤销，或因设备数据丢失而失效；失效后无法通过本应用恢复原身份的私密数据。</p>
      </div>
    </section>

    <section class="policy-block" aria-label="什么时候用 AI">
      <button
        class="policy-head"
        type="button"
        data-testid="policy-toggle-ai"
        :aria-expanded="openSections.ai"
        @click="toggle('ai')"
      >
        <strong>什么时候用 AI</strong>
        <span class="policy-chevron" aria-hidden="true">›</span>
      </button>
      <div v-if="openSections.ai" class="policy-body" data-testid="policy-body-ai">
        <p>在你使用需要 AI 整理的功能、且符合相关授权与隐私条件时，系统才会提交必要的信息。</p>
        <p>当在线整理较慢或不可用时，页面会诚实说明内容来自基础参考，不会把它伪装成针对性整理。</p>
      </div>
    </section>

    <section class="policy-block" aria-label="分享给谁">
      <button
        class="policy-head"
        type="button"
        data-testid="policy-toggle-share"
        :aria-expanded="openSections.share"
        @click="toggle('share')"
      >
        <strong>分享给谁</strong>
        <span class="policy-chevron" aria-hidden="true">›</span>
      </button>
      <div v-if="openSections.share" class="policy-body" data-testid="policy-body-share">
        <p>隐私设置会影响新内容的默认可见范围、是否允许真人回应，以及月报分享图的生成偏好。只有你允许公开的匿名经历才会进入对应的社交展示。</p>
      </div>
    </section>

    <section class="policy-block" aria-label="如何管理与删除">
      <button
        class="policy-head"
        type="button"
        data-testid="policy-toggle-manage"
        :aria-expanded="openSections.manage"
        @click="toggle('manage')"
      >
        <strong>如何管理与删除</strong>
        <span class="policy-chevron" aria-hidden="true">›</span>
      </button>
      <div v-if="openSections.manage" class="policy-body" data-testid="policy-body-manage">
        <p>可在隐私与数据中查看授权和数据管理操作。删除范围和保留规则以实际界面说明为准。</p>
        <p>“删除我的数据”会从服务端删除日记、私密心情、回信与收藏记录，并同步清理存放在服务端的导出文件副本，此操作不可撤销。</p>
        <p>已经下载保存到本机设备或分享给别人的本地副本不在此范围内，需要你自行管理与删除。</p>
        <button class="policy-link" type="button" data-testid="btn-data-policy-open-privacy" @click="openPrivacy">
          前往隐私与数据
        </button>
      </div>
    </section>
  </section>
</template>

<style scoped>
/*
 * The bar is stated here rather than inherited: the shared `.rest-topbar` carries a 16px top margin,
 * a 64px height, a centred 24px title and no bottom hairline, none of which this design has. The
 * geometry matches the other V2 detail pages so the title sits on the content axis.
 */
.data-policy-page.goodnight-page {
  display: block;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 0;
  /* `detail-rest-page` sets `gap: 16px`, which stacks on every explicit margin below. */
  gap: 0;
  /* The bar below is exactly viewport-wide; `.goodnight-page` clips it at the inset. */
  overflow-x: visible;
  padding: 0 0 calc(24px + env(safe-area-inset-bottom));
}

/*
 * This route has no tab bar, but the shell reserves 88px for one; left in place the fourth section
 * and its action link fall below the fold.
 */
:global(.phone-shell:has(.data-policy-page)) {
  padding-bottom: 0;
}

.data-policy-page .rest-topbar {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 0;
  box-sizing: border-box;
  width: calc(100% + 30px);
  max-width: none;
  min-height: 52px;
  margin: 0 -15px;
  padding: 0 18px;
  border-bottom: 1px solid var(--gn-line);
  border-radius: 0;
  background: var(--gn-paper);
}

.data-policy-page .rest-topbar h1 {
  color: var(--gn-ink);
  text-align: left;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.2px;
  line-height: 1.3;
}

.data-policy-page .back-icon {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 24px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--gn-ink);
  font-size: 26px;
  font-weight: 300;
  line-height: 1;
}

.policy-lead h2 {
  margin: 16px 0 0;
  color: var(--gn-ink);
  font-size: 24px;
  line-height: 1.3;
}

.policy-lead p {
  margin: 8px 0 0;
  color: var(--gn-muted);
  font-size: 13px;
}

/* A titled block, then its text. The head is a real button so a keyboard can reach it, and its
   hairline makes the four sections read as one list rather than four cards. */
.policy-block {
  margin-top: 14px;
  border-top: 1px solid var(--gn-line);
}

.policy-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 40px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--gn-ink);
  font-family: var(--gn-font-body);
  font-size: 15px;
  font-weight: 600;
  text-align: left;
}

.policy-chevron {
  color: #b6bcc4;
  font-size: 20px;
  line-height: 1;
  transition: transform 0.18s ease;
}

.policy-head[aria-expanded='true'] .policy-chevron {
  transform: rotate(90deg);
}

.policy-body {
  display: grid;
  gap: 8px;
  padding: 0 0 12px;
}

.policy-body p {
  margin: 0;
  color: var(--gn-ink-soft, #4a525d);
  font-size: 14px;
  line-height: 1.65;
}

.policy-link {
  justify-self: start;
  min-height: 36px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--gn-leaf);
  font-family: var(--gn-font-body);
  font-size: 14px;
  font-weight: 600;
  text-decoration: underline;
}
</style>
