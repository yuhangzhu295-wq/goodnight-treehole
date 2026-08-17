<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { useDeviceClock } from '../composables/useDeviceClock';

const router = useRouter();
const { timeLabel } = useDeviceClock();
const profile = ref<any>();
const stats = ref<any>();
const confirm = ref(false);
const clearing = ref(false);

const entries = [
  { title: '我的日记', icon: '▣', testId: 'entry-diary', route: '/pages/diary/index' },
  { title: '我的回信', icon: '☵', testId: 'entry-letter-list', route: '/pages/letter/list' },
  { title: '我的收藏', icon: '♡', testId: 'entry-favorite', route: '/pages/favorite/index' },
  { title: '情绪月报', icon: '▥', testId: 'entry-report', route: '/pages/me/month-report' },
  { title: '隐私设置', icon: '◇', testId: 'entry-privacy', route: '/pages/settings/privacy' },
  { title: '帮助与反馈', icon: '?', testId: 'entry-feedback', route: '/pages/help/feedback' },
];

async function load() {
  profile.value = (await api.get<any>('/api/v1/me/profile')).item;
  stats.value = (await api.get<any>('/api/v1/me/stats')).item;
}

async function clearData() {
  clearing.value = true;
  try {
    await api.delete('/api/v1/me/data');
    confirm.value = false;
    await load();
  } finally {
    clearing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="page goodnight-page rest-page me-page" v-if="profile">
    <header class="me-hero">
      <div class="status-row">
        <span>{{ timeLabel }}</span>
        <span aria-hidden="true"></span>
      </div>
      <div class="hero-copy me-copy">
        <h1>晚安树洞</h1>
        <p>写下今天的情绪，会有温柔回应</p>
      </div>
      <button class="me-user-card" data-testid="me-user-card" @click="router.push('/pages/me/profile')">
        <span class="avatar-bubble large">芽</span>
        <span>
          <strong>{{ profile.nickname || '晚安旅人' }}</strong>
          <small>{{ profile.anonymousCode || '树洞 0427' }}</small>
        </span>
      </button>
    </header>

    <article class="growth-card" data-testid="front-me-growth">
      <h2>情绪成长卡</h2>
      <div class="growth-metrics">
        <div>
          <span>连续记录</span>
          <strong data-visual-mask="stat">{{ stats?.streakDays ?? stats?.growthDays ?? 0 }}</strong>
          <small>天</small>
        </div>
        <div>
          <span>收到</span>
          <strong data-visual-mask="stat">{{ stats?.replyCount ?? stats?.letterCount ?? 0 }}</strong>
          <small>条温柔回应</small>
        </div>
        <div>
          <span>本月记录</span>
          <strong data-visual-mask="stat">{{ stats?.monthlyDiaryCount ?? stats?.diaryCount ?? 0 }}</strong>
          <small>次</small>
        </div>
      </div>
      <button @click="router.push('/pages/me/month-report')">查看我的成长</button>
    </article>

    <div class="me-list">
      <button
        v-for="entry in entries"
        :key="entry.testId"
        class="me-entry"
        :data-testid="entry.testId"
        @click="router.push(entry.route)"
      >
        <span>{{ entry.icon }}</span>
        <strong>{{ entry.title }}</strong>
        <em>›</em>
      </button>
    </div>

    <button class="danger clear-wide" data-testid="btn-clear-data" @click="confirm = true">清空记录</button>

    <div class="modal" v-if="confirm" data-testid="clear-confirm-panel">
      <div class="card">
        <h2 class="section-title">确认清空记录？</h2>
        <p class="muted">这会清空当前演示账号的日记、收藏和回信记录。</p>
        <div class="row">
          <button data-testid="btn-clear-cancel" @click="confirm = false">取消</button>
          <button class="danger" data-testid="btn-clear-confirm" :disabled="clearing" @click="clearData">
            {{ clearing ? '清空中' : '确认清空' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Keep the live profile metrics and navigation compact enough to preserve the
   reference reading rhythm without changing any account-derived values. */
.me-page .me-user-card strong {
  font-size: 18px;
  font-weight: 600;
}

.me-page .me-user-card small {
  margin-top: 5px;
  font-size: 13px;
}

.me-page .growth-card h2 {
  font-size: 18px;
  font-weight: 600;
}

.me-page .growth-metrics strong {
  font-size: 23px;
}

.me-page .growth-metrics span,
.me-page .growth-metrics small {
  font-size: 12px;
}

.me-page .me-entry strong {
  font-weight: 600;
}

/* The profile metrics remain API-derived; these values only restore the
   reference reading order from hero → identity → growth → six real routes. */
.me-page.goodnight-page {
  gap: 12px;
  padding-bottom: calc(124px + env(safe-area-inset-bottom));
}

.me-page .me-hero {
  min-height: 212px;
  height: 212px;
  margin-bottom: 38px;
}

.me-page .me-copy { margin-top: -18px; }
.me-page .me-copy h1 { font-size: 44px; }
.me-page .me-copy p { margin-top: 6px; }

.me-page .me-user-card {
  min-height: 88px;
  padding: 10px 16px;
}

.me-page .growth-card {
  min-height: 156px;
  height: 156px;
  padding: 14px 20px 11px;
}

.me-page .growth-metrics div {
  grid-template-rows: 19px 26px 18px;
  min-height: 64px;
}

.me-page .growth-card button { min-height: 31px; }

.me-page .me-entry {
  min-height: 37px;
  height: 37px;
}

.me-page .clear-wide {
  min-height: 42px;
  height: 42px;
}


@media (max-width: 374px) {
  .me-page.goodnight-page { gap: 13px; }
  .me-page .me-hero { margin-bottom: 52px; }
  .me-page .me-copy h1 { font-size: 37px; }
  .me-page .growth-card { min-height: 140px; height: 140px; }
  .me-page .me-entry { min-height: 35px; height: 35px; }
}
</style>
