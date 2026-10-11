<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import AppIcon from '../components/icons/AppIcon.vue';

const router = useRouter();
const profile = ref<any>();
const journeys = ref<any[]>([]);
const recovery = ref<any[]>([]);
const supportPlan = ref<any>();
const futureMessages = ref<any[]>([]);
const favorites = ref<any[]>([]);
const loadError = ref('');
const clearConfirmOpen = ref(false);
const clearing = ref(false);
const clearMessage = ref('');
const moreSupportSheetOpen = ref(false);

const currentJourney = computed(() => journeys.value.find((item) => item.journey?.status === 'active'));
const archivedCount = computed(
  () => journeys.value.filter((item) => ['archived', 'completed'].includes(item.journey?.status)).length
);
const activeActions = computed(
  () => journeys.value.flatMap((item) => item.commitments ?? []).filter((item) => item.status === 'active').length
);
const completedActions = computed(
  () => journeys.value.flatMap((item) => item.checkins ?? []).filter((item) => item.status === 'completed').length
);

const intensityChange = computed(() => {
  const journey = currentJourney.value?.journey;
  if (!journey || journey.initialIntensity == null || journey.intensity == null) return null;
  return { from: journey.initialIntensity, to: journey.intensity };
});

function friendlyStage(stage?: string) {
  if (!stage) return '进行中';
  const stageMap: Record<string, string> = {
    intake: '开始记录',
    clarifying: '梳理中',
    acting: '行动中',
    reflecting: '回顾中',
    completed: '已完成',
    archived: '已归档',
  };
  return stageMap[stage] ?? stage;
}

function timeAgo(dateStr?: string) {
  if (!dateStr) return '刚刚';
  const diff = Date.now() - Date.parse(dateStr);
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return '今天';
  if (days === 1) return '昨天';
  if (days < 30) return `${days} 天前`;
  return '较早';
}

const recordEntries = computed(() => [
  { title: '日记与回信', note: '过去记录的内容', icon: 'book', testId: 'entry-diary', route: '/pages/diary/index' },
  { title: '我的回信', note: '过去收到的回信', icon: 'message', testId: 'entry-letter-list', route: '/pages/letter/list' },
  { title: '我的收藏', note: '保存过的内容', icon: 'bookmark', testId: 'entry-favorite', route: '/pages/favorite/index' },
  { title: '情绪月报', note: '月度记录与分析', icon: 'trend', testId: 'entry-report', route: '/pages/me/month-report' },
  {
    title: '旅程归档',
    note: archivedCount.value ? `已归档 ${archivedCount.value} 个旅程` : '已经结束的事',
    icon: 'archive',
    testId: 'entry-journey-archive',
    route: '/pages/archive/index',
  },
]);

const selfSupportPrimary = computed(() => [
  {
    title: '我的现实支持',
    note: supportPlan.value ? '已配置低谷应对预案' : '提前设置应对支持方式',
    icon: 'shield',
    testId: 'entry-support-plan',
    route: '/pages/support-plan/index',
  },
  {
    title: '生活恢复',
    note: recovery.value.length ? `已记录 ${recovery.value.length} 次状态` : '记录日常恢复状态',
    icon: 'breath',
    testId: 'entry-recovery',
    route: '/pages/recovery/index',
  },
  {
    title: '清醒时候的我',
    note: '稳定状态的参考记录',
    icon: 'spark',
    testId: 'entry-stable-self',
    route: '/pages/stable-self/index',
  },
]);

const secondarySupportEntries = computed(() => [
  {
    title: 'AI 记得什么',
    note: '查看与管理系统记忆',
    icon: 'spark',
    testId: 'entry-memory',
    route: '/pages/memory/index',
  },
  {
    title: '写给未来的我',
    note: futureMessages.value.length ? `已保存 ${futureMessages.value.length} 条寄语` : '保存写给以后的留言',
    icon: 'message',
    testId: 'entry-future-self',
    route: '/pages/future-self/index',
  },
  {
    title: '决定保险箱',
    note: '暂存重要决定',
    icon: 'shield',
    testId: 'entry-decision',
    route: '/pages/decision/index',
  },
  {
    title: '情绪小工具',
    note: '结构化拆解与应对工具',
    icon: 'pen',
    testId: 'entry-tool-index',
    route: '/pages/tool/index',
  },
]);

const settingEntries = [
  { title: '隐私与数据', note: '数据使用与存储设置', icon: 'shield', testId: 'entry-privacy', route: '/pages/settings/privacy' },
  { title: '帮助与反馈', note: '常见问题与反馈', icon: 'message', testId: 'entry-feedback', route: '/pages/help/feedback' },
];

async function clearMyData() {
  if (clearing.value) return;
  clearing.value = true;
  clearMessage.value = '';
  try {
    await api.delete('/api/v1/me/data');
    clearConfirmOpen.value = false;
    clearMessage.value = '日记、回信和收藏已经从服务端删除。';
    await load();
  } catch (err: any) {
    clearMessage.value = err?.message ?? '清理失败，请稍后重试。';
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
    try {
      favorites.value = (await api.get<any>('/api/v1/favorites')).items ?? [];
    } catch {
      favorites.value = [];
    }
  } catch (cause: any) {
    loadError.value = cause?.message ?? '个人旅程读取失败，请稍后重试';
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="me-v2">
    <!-- Top Header -->
    <header class="me-header">
      <div class="header-left">
        <h1 class="header-title">我的</h1>
      </div>
      <div class="header-right">
        <button
          class="more-link"
          type="button"
          data-testid="me-user-card"
          @click="router.push('/pages/me/profile')"
        >
          账号资料 ›
        </button>
      </div>
    </header>

    <div v-if="loadError" class="error-banner" role="alert">{{ loadError }}</div>
    <div v-if="clearMessage" class="message-banner" role="status">{{ clearMessage }}</div>

    <main class="me-content">
      <!-- Profile Card -->
      <section
        class="profile-card"
        data-testid="me-user-card"
        role="button"
        tabindex="0"
        @click="router.push('/pages/me/profile')"
      >
        <div class="avatar-circle">
          {{ (profile?.nickname || '晚')[0] }}
        </div>
        <div class="profile-info">
          <div class="profile-name">{{ profile?.nickname || '晚安旅人' }}</div>
          <div class="profile-sub">{{ profile?.anonymousCode || '匿名资料与设备管理' }}</div>
        </div>
        <span class="row-chev" aria-hidden="true">›</span>
      </section>

      <!-- Stat Counters Strip -->
      <section class="stat-strip" aria-label="数据概览">
        <div class="stat-box">
          <strong class="stat-value">{{ journeys.length }}</strong>
          <small class="stat-label">旅程</small>
        </div>
        <div class="stat-divider" aria-hidden="true" />
        <div class="stat-box">
          <strong class="stat-value">{{ activeActions }}</strong>
          <small class="stat-label">进行中行动</small>
        </div>
        <div class="stat-divider" aria-hidden="true" />
        <div class="stat-box">
          <strong class="stat-value">{{ completedActions }}</strong>
          <small class="stat-label">行动结果</small>
        </div>
      </section>

      <!-- Current Journey Section -->
      <section class="section-group">
        <div class="group-header">
          <h3 class="group-title">正在经历</h3>
          <button
            class="header-action"
            type="button"
            @click="router.push('/pages/archive/index')"
          >
            全部旅程 ›
          </button>
        </div>

        <div v-if="currentJourney" class="journey-card" data-testid="me-current-journey">
          <div class="journey-top">
            <span class="pill-green">进行中</span>
            <span class="journey-meta">{{ currentJourney.journey.domain }} · {{ friendlyStage(currentJourney.journey.stage) }}</span>
          </div>
          <h4 class="journey-title">{{ currentJourney.journey.title }}</h4>
          <div v-if="intensityChange" class="journey-sub">
            主观强度变化：{{ intensityChange.from }} <i>→</i> {{ intensityChange.to }}
          </div>
          <div v-else class="journey-sub">
            上次更新 · {{ timeAgo(currentJourney.journey.updatedAt) }}
          </div>

          <button
            class="journey-btn"
            data-testid="entry-current-journey"
            type="button"
            @click="router.push(`/pages/journey/detail?id=${currentJourney.journey.id}`)"
          >
            继续看看 ›
          </button>
        </div>

        <div v-else class="empty-journey-card" data-testid="me-current-journey-empty">
          <div class="empty-journey-title">暂无进行中的旅程</div>
          <div class="empty-journey-desc">需要时可从今晚记录日常与想法。</div>
          <button
            class="journey-btn"
            data-testid="entry-start-journey"
            type="button"
            @click="router.push('/pages/tonight/index')"
          >
            回到今晚 ›
          </button>
        </div>
      </section>

      <!-- Group 1: 记录 -->
      <section class="section-group">
        <div class="group-header">
          <h3 class="group-title">记录</h3>
        </div>
        <div class="list-surface">
          <button
            v-for="entry in recordEntries"
            :key="entry.testId"
            class="list-row"
            :data-testid="entry.testId"
            type="button"
            @click="router.push(entry.route)"
          >
            <div class="row-icon-box">
              <AppIcon :name="entry.icon" :size="18" />
            </div>
            <div class="row-body">
              <div class="row-title">{{ entry.title }}</div>
              <div class="row-sub">{{ entry.note }}</div>
            </div>
            <span class="row-chev" aria-hidden="true">›</span>
          </button>
        </div>
      </section>

      <!-- Group 2: 自我支持 -->
      <section class="section-group">
        <div class="group-header">
          <h3 class="group-title">自我支持</h3>
        </div>
        <div class="list-surface">
          <button
            v-for="entry in selfSupportPrimary"
            :key="entry.testId"
            class="list-row"
            :data-testid="entry.testId"
            type="button"
            @click="router.push(entry.route)"
          >
            <div class="row-icon-box">
              <AppIcon :name="entry.icon" :size="18" />
            </div>
            <div class="row-body">
              <div class="row-title">{{ entry.title }}</div>
              <div class="row-sub">{{ entry.note }}</div>
            </div>
            <span class="row-chev" aria-hidden="true">›</span>
          </button>

          <!-- Secondary Support Tools folded under sheet -->
          <button
            class="list-row"
            type="button"
            @click="moreSupportSheetOpen = true"
          >
            <div class="row-icon-box">⋯</div>
            <div class="row-body">
              <div class="row-title">更多自我支持</div>
              <div class="row-sub">预案、AI记忆、给未来的我等</div>
            </div>
            <span class="row-chev" aria-hidden="true">›</span>
          </button>
        </div>
      </section>

      <!-- Group 3: 设置 -->
      <section class="section-group">
        <div class="group-header">
          <h3 class="group-title">设置</h3>
        </div>
        <div class="list-surface">
          <button
            v-for="entry in settingEntries"
            :key="entry.testId"
            class="list-row"
            :data-testid="entry.testId"
            type="button"
            @click="router.push(entry.route)"
          >
            <div class="row-icon-box">
              <AppIcon :name="entry.icon" :size="18" />
            </div>
            <div class="row-body">
              <div class="row-title">{{ entry.title }}</div>
              <div class="row-sub">{{ entry.note }}</div>
            </div>
            <span class="row-chev" aria-hidden="true">›</span>
          </button>
        </div>
      </section>

      <!-- Data Cleanup (Destructive Action Section) -->
      <section class="cleanup-group" aria-label="数据管理">
        <button
          class="cleanup-btn"
          data-testid="btn-clear-data"
          type="button"
          @click="clearConfirmOpen = true"
        >
          清理我的记录
        </button>
      </section>
    </main>

    <!-- More Self Support Bottom Sheet -->
    <Teleport to="body">
      <div v-if="moreSupportSheetOpen" class="sheet-mask" @click.self="moreSupportSheetOpen = false">
        <div class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="more-support-title">
          <div class="grabber" />
          <div class="sheet-top">
            <h3 id="more-support-title" class="sheet-title">更多自我支持</h3>
            <button class="sheet-close" aria-label="关闭" @click="moreSupportSheetOpen = false">✕</button>
          </div>
          <div class="sheet-list">
            <button
              v-for="entry in secondarySupportEntries"
              :key="entry.testId"
              class="sheet-row"
              :data-testid="entry.testId"
              type="button"
              @click="moreSupportSheetOpen = false; router.push(entry.route)"
            >
              <div class="row-body">
                <div class="row-title">{{ entry.title }}</div>
                <div class="row-sub">{{ entry.note }}</div>
              </div>
              <span class="row-chev" aria-hidden="true">›</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Clear Confirmation Alert Dialog -->
    <Teleport to="body">
      <div v-if="clearConfirmOpen" class="dialog-mask" @click.self="clearConfirmOpen = false">
        <div
          class="dialog-card"
          data-testid="clear-confirm-panel"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="clear-title"
        >
          <h3 id="clear-title" class="dialog-title">确定清理个人记录？</h3>
          <p class="dialog-desc">这会从服务端删除你的日记、回信和收藏，无法恢复。</p>
          <div class="dialog-actions">
            <button
              class="btn-dialog-cancel"
              data-testid="btn-clear-cancel"
              type="button"
              :disabled="clearing"
              @click="clearConfirmOpen = false"
            >
              暂不清理
            </button>
            <button
              class="btn-dialog-confirm"
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
    </Teleport>
  </div>
</template>

<style scoped>
.me-v2 {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  min-height: 100vh;
  padding: 0 0 calc(96px + env(safe-area-inset-bottom));
  background: #FFFFFF;
  color: #242A32;
  font-family: var(--gn-font-body);
}

.me-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 20px;
  background: #FFFFFF;
  border-bottom: 1px solid #E8EBEF;
}

.header-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #242A32;
  letter-spacing: -0.3px;
}

.more-link {
  min-height: 48px;
  display: flex;
  align-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: #757D87;
  font-size: 13px;
  cursor: pointer;
}

.error-banner {
  margin: 12px 20px 0;
  padding: 10px 14px;
  border-radius: 8px;
  background: #FEF2F0;
  border: 1px solid #F6DCDA;
  color: #BD4545;
  font-size: 13px;
}

.message-banner {
  margin: 12px 20px 0;
  padding: 10px 14px;
  border-radius: 8px;
  background: #EAF4EE;
  border: 1px solid #C3DAD0;
  color: #275F56;
  font-size: 13px;
}

.me-content {
  padding: 16px 20px 0;
}

.profile-card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 60px;
  padding: 12px 0;
  cursor: pointer;
}

.avatar-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 20px;
  background: #EAF4EE;
  color: #275F56;
  font-size: 16px;
  font-weight: 600;
  flex-shrink: 0;
}

.profile-info {
  flex: 1;
  min-width: 0;
}

.profile-name {
  font-size: 16px;
  font-weight: 700;
  color: #242A32;
}

.profile-sub {
  margin-top: 3px;
  font-size: 12px;
  color: #757D87;
}

.stat-strip {
  display: flex;
  align-items: center;
  justify-content: space-around;
  margin: 12px 0 20px;
  padding: 12px 0;
  border-top: 1px solid #E8EBEF;
  border-bottom: 1px solid #E8EBEF;
}

.stat-box {
  flex: 1;
  text-align: center;
}

.stat-value {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: #242A32;
  line-height: 1.2;
}

.stat-label {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #757D87;
}

.stat-divider {
  width: 1px;
  height: 24px;
  background: #E8EBEF;
}

.section-group {
  margin-top: 20px;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.group-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #757D87;
}

.header-action {
  min-height: 48px;
  display: flex;
  align-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: #757D87;
  font-size: 12px;
  cursor: pointer;
}

.journey-card {
  padding: 14px 16px;
  border: 1px solid #E8EBEF;
  border-radius: 12px;
  background: #FAFBFA;
}

.journey-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pill-green {
  padding: 2px 7px;
  border-radius: 4px;
  background: #EAF4EE;
  color: #275F56;
  font-size: 11px;
  font-weight: 600;
}

.journey-meta {
  font-size: 12px;
  color: #757D87;
}

.journey-title {
  margin: 10px 0 4px;
  font-size: 15px;
  font-weight: 600;
  color: #242A32;
}

.journey-sub {
  font-size: 12px;
  color: #757D87;
}

.journey-btn {
  margin-top: 12px;
  min-height: 48px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  background: #275F56;
  color: #FFFFFF;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.empty-journey-card {
  padding: 16px;
  border: 1px solid #E8EBEF;
  border-radius: 12px;
  background: #F7F8FA;
}

.empty-journey-title {
  font-size: 14px;
  font-weight: 600;
  color: #242A32;
}

.empty-journey-desc {
  margin-top: 4px;
  font-size: 12px;
  color: #757D87;
}

.list-surface {
  border-top: 1px solid #E8EBEF;
}

.list-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  padding: 8px 0;
  border: 0;
  border-bottom: 1px solid #E8EBEF;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.row-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #F7F8FA;
  color: #757D87;
  font-size: 15px;
  flex-shrink: 0;
}

.row-body {
  flex: 1;
  min-width: 0;
}

.row-title {
  font-size: 14px;
  font-weight: 600;
  color: #242A32;
  line-height: 1.35;
}

.row-sub {
  margin-top: 2px;
  font-size: 11px;
  color: #757D87;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-chev {
  color: #AAB0B8;
  font-size: 18px;
  line-height: 1;
}

.cleanup-group {
  margin: 32px 0 16px;
  text-align: center;
}

.cleanup-btn {
  width: 100%;
  min-height: 48px;
  border: 0;
  background: transparent;
  color: #BD4545;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(12, 21, 25, 0.45);
}

.dialog-card {
  box-sizing: border-box;
  width: min(340px, 100%);
  border-radius: 14px;
  background: #FFFFFF;
  padding: 20px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
}

.dialog-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #242A32;
}

.dialog-desc {
  margin: 8px 0 0;
  font-size: 13px;
  color: #757D87;
  line-height: 1.5;
}

.dialog-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 20px;
}

.btn-dialog-cancel {
  min-height: 48px;
  border: 1px solid #E8EBEF;
  border-radius: 8px;
  background: #FFFFFF;
  color: #242A32;
  font-size: 13px;
  cursor: pointer;
}

.btn-dialog-confirm {
  min-height: 48px;
  border: 0;
  border-radius: 8px;
  background: #BD4545;
  color: #FFFFFF;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  background: rgba(12, 21, 25, 0.35);
}

.bottom-sheet {
  box-sizing: border-box;
  width: min(430px, 100vw);
  max-height: 80vh;
  margin: 0 auto;
  overflow-y: auto;
  border-radius: 20px 20px 0 0;
  background: #FFFFFF;
  padding: 12px 20px calc(28px + env(safe-area-inset-bottom));
  box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.12);
}

.grabber {
  width: 38px;
  height: 4px;
  margin: 0 auto 16px;
  border-radius: 4px;
  background: #D9DDDF;
}

.sheet-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.sheet-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #242A32;
}

.sheet-close {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  min-height: 48px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #757D87;
  font-size: 16px;
  cursor: pointer;
}

.sheet-list {
  display: flex;
  flex-direction: column;
}

.sheet-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 52px;
  padding: 10px 0;
  border: 0;
  border-bottom: 1px solid #E8EBEF;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.sheet-row:last-child {
  border-bottom: 0;
}
</style>
