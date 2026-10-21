<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

const router = useRouter();
const profile = ref<any>();
// Starts true so the page never paints an empty frame before onMounted runs the first load.
const loading = ref(true);
const error = ref('');

/** The design shows a one-character avatar; it is derived from the real nickname, not a fixed glyph. */
const avatarInitial = computed(() => (profile.value?.nickname || '晚安旅人').slice(0, 1));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    profile.value = (await api.get<any>('/api/v1/me/profile')).item;
  } catch (cause: any) {
    error.value = cause?.message ?? '资料读取失败，请稍后重试。';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="me-profile-page">
    <header class="rest-topbar">
      <button
        class="back-icon"
        data-testid="front-profile-back"
        type="button"
        aria-label="返回上一页"
        @click="router.back()"
      >
        ‹
      </button>
      <h1>匿名资料</h1>
    </header>

    <p v-if="loading" class="state-note">正在读取账号资料…</p>
    <template v-else-if="error">
      <LoadErrorBanner :message="error" retry-label="重新读取" @retry="load" />
    </template>
    <template v-else-if="profile">
      <div class="identity-block">
        <span class="identity-avatar" aria-hidden="true">{{ avatarInitial }}</span>
        <h2 class="identity-name">{{ profile.nickname || '晚安旅人' }}</h2>
        <p class="identity-sub">匿名资料</p>
      </div>

      <section class="plain-section" aria-label="基本资料">
        <h3 class="section-title">基本资料</h3>
        <div class="row-list">
          <div class="info-row">
            <strong class="row-title">昵称</strong>
            <span class="row-value">{{ profile.nickname || '晚安旅人' }}</span>
          </div>
          <div class="info-row">
            <strong class="row-title">匿名编号</strong>
            <span class="row-value">{{ profile.anonymousCode }}</span>
            <span class="row-note">只用于应用内部关联</span>
          </div>
          <div class="info-row">
            <strong class="row-title">账号状态</strong>
            <span class="row-value">{{ profile.status === 'normal' ? '正常' : profile.status }}</span>
          </div>
        </div>
      </section>

      <section class="plain-section" aria-label="账号安全">
        <h3 class="section-title">账号安全</h3>
        <div class="row-list">
          <div class="info-row">
            <strong class="row-title">匿名身份说明</strong>
            <span class="row-note">了解为什么不能只凭编号找回账号</span>
          </div>
        </div>
      </section>

      <p class="credential-note">匿名凭据由服务端签发，请妥善保护当前设备。</p>
    </template>
  </section>
</template>

<style scoped>
.me-profile-page {
  box-sizing: border-box;
  width: 100%;
  min-height: 100vh;
  overflow-x: hidden;
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
  background: var(--gn-paper);
  color: var(--gn-ink);
  font-family: var(--gn-font-body);
}

/* Bar: a bare chevron with the page title; the hairline reaches both screen edges. */
.me-profile-page .rest-topbar {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 52px;
  margin: 0 -15px;
  padding: 4px 20px 6px;
  background: var(--gn-paper);
  border-bottom: 1px solid var(--gn-line);
}

.me-profile-page .back-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  min-width: 24px;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--gn-ink);
  font-size: 24px;
  font-weight: 400;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
}

.me-profile-page .rest-topbar h1 {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: var(--gn-ink);
  text-align: left;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
}

.state-note,



/* Identity block: avatar at the top-left, the name and its caption centred under it. */
.identity-block {
  padding: 18px 20px 4px;
}

.identity-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf);
  font-size: 15px;
  font-weight: 600;
}

.identity-name {
  margin: 6px 0 0;
  color: var(--gn-ink);
  text-align: center;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
}

.identity-sub {
  margin: 6px 0 0;
  color: var(--gn-muted);
  text-align: center;
  font-size: 13px;
  line-height: 1.4;
}

/* Sections are bare blocks: a bold title, then rows divided by hairlines. */
.plain-section {
  margin-top: 22px;
  padding: 0 20px;
}

.section-title {
  margin: 0;
  color: var(--gn-ink);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.35;
}

.row-list {
  margin-top: 6px;
}

.info-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 14px 0;
  border-bottom: 1px solid var(--gn-line);
}

.info-row .row-title {
  color: var(--gn-ink);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.35;
}

.info-row .row-value,
.info-row .row-note {
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.45;
  word-break: break-all;
}

.credential-note {
  margin: 18px 20px 0;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--gn-paper-warm);
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.5;
}
</style>
