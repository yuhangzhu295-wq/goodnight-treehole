<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const profile = ref<any>();
const journeys = ref<any[]>([]);
const recovery = ref<any[]>([]);
const supportPlan = ref<any>();
const futureMessages = ref<any[]>([]);
const loadError = ref('');
const clearConfirmOpen = ref(false);
const clearing = ref(false);
const clearMessage = ref('');

const currentJourney = computed(() => journeys.value.find((item) => item.journey?.status === 'active'));
const archivedCount = computed(
  () => journeys.value.filter((item) => ['archived', 'completed'].includes(item.journey?.status)).length,
);
const activeActions = computed(
  () => journeys.value.flatMap((item) => item.commitments ?? []).filter((item) => item.status === 'active').length,
);
const completedActions = computed(
  () => journeys.value.flatMap((item) => item.checkins ?? []).filter((item) => item.status === 'completed').length,
);
const intensityChange = computed(() => {
  const journey = currentJourney.value?.journey;
  if (!journey || journey.initialIntensity == null || journey.intensity == null) return null;
  return { from: journey.initialIntensity, to: journey.intensity };
});

const primaryEntries = computed(() => [
  {
    title: '生活恢复',
    note: recovery.value.length ? `已记录 ${recovery.value.length} 次状态` : '记录日常恢复状态',
    icon: '◒',
    testId: 'entry-recovery',
    route: '/pages/recovery/index',
  },
  {
    title: '我的低谷预案',
    note: supportPlan.value ? '已保存应对支持说明' : '提前设置应对支持方式',
    icon: '✦',
    testId: 'entry-support-plan',
    route: '/pages/support-plan/index',
  },
  {
    title: '清醒时候的我',
    note: '稳定状态的参考记录',
    icon: '⌁',
    testId: 'entry-stable-self',
    route: '/pages/stable-self/index',
  },
  {
    title: 'AI 记得什么',
    note: '查看与管理系统记忆',
    icon: '◉',
    testId: 'entry-memory',
    route: '/pages/memory/index',
  },
  {
    title: '写给未来的我',
    note: futureMessages.value.length ? `已保存 ${futureMessages.value.length} 条寄语` : '保存写给以后的留言',
    icon: '◇',
    testId: 'entry-future-self',
    route: '/pages/future-self/index',
  },
  {
    title: '决定保险箱',
    note: '暂存重要决定',
    icon: '▣',
    testId: 'entry-decision',
    route: '/pages/decision/index',
  },
  {
    title: '情绪小工具',
    note: '结构化拆解与应对工具',
    icon: '✂',
    testId: 'entry-tool-index',
    route: '/pages/tool/index',
  },
]);

const archiveEntries = [
  { title: '日记与回信', note: '过去记录的内容', icon: '▤', testId: 'entry-diary', route: '/pages/diary/index' },
  { title: '我的回信', note: '过去收到的回信', icon: '✉', testId: 'entry-letter-list', route: '/pages/letter/list' },
  { title: '我的收藏', note: '收藏的日记与回信', icon: '♡', testId: 'entry-favorite', route: '/pages/favorite/index' },
  { title: '情绪月报', note: '月度记录与分析', icon: '▥', testId: 'entry-report', route: '/pages/me/month-report' },
  {
    title: '旅程归档',
    note: '已结束的旅程记录',
    icon: '⌁',
    testId: 'entry-journey-archive',
    route: '/pages/archive/index',
  },
  {
    title: '隐私与数据',
    note: '数据使用与存储设置',
    icon: '▧',
    testId: 'entry-privacy',
    route: '/pages/settings/privacy',
  },
  {
    title: '帮助与反馈',
    note: '常见问题与问题反馈',
    icon: '?',
    testId: 'entry-feedback',
    route: '/pages/help/feedback',
  },
];

const recordEntries = computed(() => archiveEntries.slice(0, 5));
const settingEntries = computed(() => archiveEntries.slice(5));

async function clearMyData() {
  if (clearing.value) return;
  clearing.value = true;
  clearMessage.value = '';
  try {
    await api.delete('/api/v1/me/data');
    clearConfirmOpen.value = false;
    clearMessage.value = '日记、回信和收藏已经从服务端删除。';
    await load();
  } catch (error: any) {
    clearMessage.value = error?.message ?? '清理失败，请稍后重试。';
  } finally {
    clearing.value = false;
  }
}

async function load() {
  loadError.value = '';
  try {
    const [profileResult, journeyResult, supportResult, futureResult] = await Promise.all([
      api.get<any>('/api/v1/me/profile'),
      api.get<any>('/api/v1/journeys'),
      api.get<any>('/api/v1/me/support-plan'),
      api.get<any>('/api/v1/future-messages'),
    ]);
    profile.value = profileResult.item;
    journeys.value = journeyResult.items ?? [];
    supportPlan.value = supportResult.item;
    futureMessages.value = futureResult.items ?? [];
    try {
      recovery.value = (await api.get<any>('/api/v1/me/recovery')).items ?? [];
    } catch {
      recovery.value = [];
    }
  } catch (cause: any) {
    loadError.value = cause?.message ?? '个人旅程读取失败，请稍后重试';
  }
}

onMounted(load);
</script>

<template>
  <section class="goodnight-page me-page">
    <header class="me-header">
      <h1 class="me-title">我的旅程</h1>
      <p class="me-subtitle">记录与恢复进展</p>
    </header>

    <p v-if="loadError" class="me-error">{{ loadError }}</p>

    <!-- Profile Row -->
    <div
      class="profile-row"
      data-testid="me-user-card"
      role="button"
      tabindex="0"
      @click="router.push('/pages/me/profile')"
    >
      <div class="avatar-box">
        <span class="avatar-text">{{ (profile?.nickname || '旅')[0] }}</span>
      </div>
      <div class="profile-info">
        <strong class="profile-name">{{ profile?.nickname || '晚安旅人' }}</strong>
        <span class="profile-desc">{{ profile?.anonymousCode || '个人主页' }}</span>
      </div>
      <span class="row-arrow" aria-hidden="true">›</span>
    </div>

    <!-- Stats Row -->
    <section class="stats-strip" aria-label="真实变化">
      <div class="stat-unit">
        <span class="stat-num">{{ activeActions }}</span>
        <span class="stat-label">现实行动</span>
      </div>
      <div class="stat-sep" aria-hidden="true"></div>
      <div class="stat-unit">
        <span class="stat-num">{{ completedActions }}</span>
        <span class="stat-label">行动结果</span>
      </div>
      <div class="stat-sep" aria-hidden="true"></div>
      <div class="stat-unit">
        <span class="stat-num">{{ archivedCount }}</span>
        <span class="stat-label">走过的路</span>
      </div>
    </section>

    <!-- Current Journey -->
    <section v-if="currentJourney" class="journey-item" data-testid="me-current-journey">
      <div class="journey-header">
        <span class="journey-tag">正在经历</span>
        <span class="journey-meta">{{ currentJourney.journey.domain }} · {{ currentJourney.journey.stage }}</span>
      </div>
      <div class="journey-main">
        <h2 class="journey-title">{{ currentJourney.journey.title }}</h2>
        <div v-if="intensityChange" class="journey-intensity">
          <span>主观强度变化</span>
          <strong class="intensity-values">{{ intensityChange.from }} <i>→</i> {{ intensityChange.to }}</strong>
        </div>
        <div v-else class="journey-note">状态记录已保存</div>
      </div>
      <button
        class="journey-btn"
        data-testid="entry-current-journey"
        type="button"
        @click="router.push(`/pages/journey/detail?id=${currentJourney.journey.id}`)"
      >
        继续看看
      </button>
    </section>
    <section v-else class="journey-item journey-empty" data-testid="me-current-journey-empty">
      <div class="journey-header">
        <span class="journey-tag">当前旅程</span>
      </div>
      <div class="journey-main">
        <h2 class="journey-title">暂无进行中的旅程</h2>
        <p class="journey-desc">需要时可从今晚记录日常与想法。</p>
      </div>
      <button
        class="journey-btn"
        data-testid="entry-start-journey"
        type="button"
        @click="router.push('/pages/tonight/index')"
      >
        回到今晚
      </button>
    </section>

    <!-- Support Status -->
    <button
      class="support-row"
      data-testid="me-support-status"
      type="button"
      @click="router.push('/pages/support-plan/index')"
    >
      <span class="support-icon" aria-hidden="true">✦</span>
      <span class="support-text">
        <strong class="support-title">我的现实支持</strong>
        <span class="support-note">{{ supportPlan ? '已配置低谷应对预案，随时可查看。' : '尚未配置低谷预案，建议提前设置。' }}</span>
      </span>
      <span class="row-arrow" aria-hidden="true">›</span>
    </button>

    <!-- Group 1: 功能与工具 -->
    <section class="group-section">
      <div class="section-label">功能与工具</div>
      <div class="group-surface">
        <button
          v-for="entry in primaryEntries"
          :key="entry.testId"
          class="group-row"
          :data-testid="entry.testId"
          type="button"
          @click="router.push(entry.route)"
        >
          <span class="row-icon" aria-hidden="true">{{ entry.icon }}</span>
          <span class="row-body">
            <strong class="row-title">{{ entry.title }}</strong>
            <small class="row-note">{{ entry.note }}</small>
          </span>
          <span class="row-arrow" aria-hidden="true">›</span>
        </button>
      </div>
    </section>

    <!-- Group 2: 历史记录 -->
    <section class="group-section">
      <div class="section-label">历史记录</div>
      <div class="group-surface">
        <button
          v-for="entry in recordEntries"
          :key="entry.testId"
          class="group-row"
          :data-testid="entry.testId"
          type="button"
          @click="router.push(entry.route)"
        >
          <span class="row-icon" aria-hidden="true">{{ entry.icon }}</span>
          <span class="row-body">
            <strong class="row-title">{{ entry.title }}</strong>
            <small class="row-note">{{ entry.note }}</small>
          </span>
          <span class="row-arrow" aria-hidden="true">›</span>
        </button>
      </div>
    </section>

    <!-- Group 3: 设置与支持 -->
    <section class="group-section">
      <div class="section-label">设置与支持</div>
      <div class="group-surface">
        <button
          v-for="entry in settingEntries"
          :key="entry.testId"
          class="group-row"
          :data-testid="entry.testId"
          type="button"
          @click="router.push(entry.route)"
        >
          <span class="row-icon" aria-hidden="true">{{ entry.icon }}</span>
          <span class="row-body">
            <strong class="row-title">{{ entry.title }}</strong>
            <small class="row-note">{{ entry.note }}</small>
          </span>
          <span class="row-arrow" aria-hidden="true">›</span>
        </button>
      </div>
    </section>

    <!-- Data Cleanup -->
    <section class="cleanup-section" aria-label="清理个人记录">
      <p v-if="clearMessage" class="cleanup-message" role="status">{{ clearMessage }}</p>
      <div class="group-surface">
        <button
          class="cleanup-trigger"
          data-testid="btn-clear-data"
          type="button"
          @click="clearConfirmOpen = true"
        >
          清理我的记录
        </button>
      </div>

      <div
        v-if="clearConfirmOpen"
        class="dialog-backdrop"
        @click.self="clearConfirmOpen = false"
      >
        <div
          class="dialog-box"
          data-testid="clear-confirm-panel"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="clear-confirm-title"
        >
          <h2 id="clear-confirm-title" class="dialog-title">确定清理个人记录？</h2>
          <p class="dialog-desc">这会从服务端删除你的日记、回信和收藏，无法恢复。</p>
          <div class="dialog-actions">
            <button
              class="dialog-btn dialog-cancel"
              data-testid="btn-clear-cancel"
              type="button"
              :disabled="clearing"
              @click="clearConfirmOpen = false"
            >
              暂不清理
            </button>
            <button
              class="dialog-btn dialog-confirm"
              data-testid="btn-clear-confirm"
              type="button"
              :disabled="clearing"
              @click="clearMyData"
            >
              {{ clearing ? '正在清理…' : '确认清理' }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.me-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
  padding: 12px 16px calc(112px + env(safe-area-inset-bottom));
  background: var(--gn-bg);
  color: var(--gn-text);
  font-family: var(--gn-font-body);
}

.me-header {
  padding: 8px 4px 4px;
}

.me-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--gn-ink);
}

.me-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--gn-muted);
}

.me-error {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--gn-radius-card);
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
  color: var(--gn-danger);
  font-size: 13px;
}

.profile-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  cursor: pointer;
}

.profile-row:active {
  background: var(--gn-paper-warm);
}

.avatar-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 22px;
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  flex-shrink: 0;
}

.avatar-text {
  font-size: 18px;
  font-weight: 600;
  line-height: 1;
}

.profile-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.profile-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--gn-ink);
  line-height: 1.3;
}

.profile-desc {
  font-size: 12px;
  color: var(--gn-muted);
  margin-top: 2px;
  line-height: 1.3;
}

.stats-strip {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 12px 8px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.stat-unit {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  text-align: center;
}

.stat-num {
  font-size: 20px;
  font-weight: 600;
  color: var(--gn-ink);
  line-height: 1.2;
}

.stat-label {
  font-size: 11px;
  color: var(--gn-muted);
  margin-top: 3px;
}

.stat-sep {
  width: 1px;
  height: 24px;
  background: var(--gn-line);
}

.journey-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.journey-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.journey-tag {
  font-size: 11px;
  font-weight: 600;
  color: var(--gn-leaf-deep);
  background: var(--gn-leaf-soft);
  padding: 2px 8px;
  border-radius: 4px;
}

.journey-meta {
  font-size: 12px;
  color: var(--gn-muted);
}

.journey-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.journey-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--gn-ink);
  line-height: 1.35;
}

.journey-desc {
  margin: 0;
  font-size: 12px;
  color: var(--gn-muted);
  line-height: 1.4;
}

.journey-intensity {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--gn-muted);
}

.intensity-values {
  font-size: 14px;
  font-weight: 600;
  color: var(--gn-leaf);
}

.intensity-values i {
  font-style: normal;
  color: var(--gn-muted);
  font-weight: 400;
}

.journey-note {
  font-size: 12px;
  color: var(--gn-muted);
}

.journey-btn {
  align-self: flex-start;
  min-height: 32px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.support-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 10px 14px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  text-align: left;
  cursor: pointer;
}

.support-row:active {
  background: var(--gn-paper-warm);
}

.support-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  font-size: 15px;
  color: var(--gn-gold);
  flex-shrink: 0;
}

.support-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.support-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--gn-ink);
  line-height: 1.3;
}

.support-note {
  font-size: 12px;
  color: var(--gn-muted);
  margin-top: 2px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-section {
  display: flex;
  flex-direction: column;
}

.section-label {
  padding: 8px 4px 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--gn-muted);
}

.group-surface {
  background: var(--gn-paper);
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  overflow: hidden;
}

.group-row {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 48px;
  padding: 10px 14px;
  border: 0;
  background: transparent;
  text-align: left;
  color: var(--gn-ink);
  cursor: pointer;
}

.group-row + .group-row {
  border-top: 1px solid var(--gn-line);
}

.group-row:active {
  background: var(--gn-paper-warm);
}

.row-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-right: 12px;
  font-size: 15px;
  color: var(--gn-muted);
  flex-shrink: 0;
}

.row-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.row-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--gn-ink);
  line-height: 1.3;
}

.row-note {
  font-size: 12px;
  color: var(--gn-muted);
  margin-top: 2px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-arrow {
  margin-left: 8px;
  font-size: 18px;
  color: var(--gn-muted);
  line-height: 1;
  flex-shrink: 0;
}

.cleanup-section {
  margin-top: 4px;
}

.cleanup-trigger {
  display: block;
  width: 100%;
  min-height: 48px;
  border: 0;
  background: transparent;
  color: var(--gn-danger);
  font-size: 14px;
  font-weight: 500;
  text-align: center;
  cursor: pointer;
}

.cleanup-trigger:active {
  background: var(--gn-paper-warm);
}

.cleanup-message {
  margin: 0 0 8px;
  padding: 10px 14px;
  border-radius: var(--gn-radius-card);
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
  color: var(--gn-leaf-deep);
  font-size: 13px;
  line-height: 1.4;
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.dialog-box {
  box-sizing: border-box;
  width: min(340px, 100%);
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  padding: 20px;
}

.dialog-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--gn-ink);
  line-height: 1.35;
}

.dialog-desc {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--gn-muted);
  line-height: 1.5;
}

.dialog-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 18px;
}

.dialog-btn {
  min-height: 38px;
  border-radius: var(--gn-radius-small);
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
  color: var(--gn-ink);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.dialog-btn:disabled {
  opacity: 0.5;
}

.dialog-confirm {
  border-color: var(--gn-danger);
  background: var(--gn-danger);
  color: #fff;
}

@media (max-width: 374px) {
  .me-page {
    padding-right: 12px;
    padding-left: 12px;
  }
}
</style>
