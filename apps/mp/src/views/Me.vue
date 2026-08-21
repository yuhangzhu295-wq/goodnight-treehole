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
    note: recovery.value.length ? `已经留下 ${recovery.value.length} 次生活记录` : '看看生活有没有回来一点',
    icon: '◒',
    testId: 'entry-recovery',
    route: '/pages/recovery/index',
  },
  {
    title: '我的低谷预案',
    note: supportPlan.value ? '已经准备好一张现实支持说明书' : '提前留下真正有用的支持方式',
    icon: '✦',
    testId: 'entry-support-plan',
    route: '/pages/support-plan/index',
  },
  {
    title: '清醒时候的我',
    note: '只和自己状态稳定时的样子比较',
    icon: '⌁',
    testId: 'entry-stable-self',
    route: '/pages/stable-self/index',
  },
  {
    title: 'AI 记得什么',
    note: '查看、编辑或停止系统使用有限记忆',
    icon: '◉',
    testId: 'entry-memory',
    route: '/pages/memory/index',
  },
  {
    title: '写给未来的我',
    note: futureMessages.value.length ? `有 ${futureMessages.value.length} 封话留给以后` : '给下一次难受的自己留一句话',
    icon: '◇',
    testId: 'entry-future-self',
    route: '/pages/future-self/index',
  },
  {
    title: '决定保险箱',
    note: '让重要决定先安静一会儿',
    icon: '▣',
    testId: 'entry-decision',
    route: '/pages/decision/index',
  },
]);

const archiveEntries = [
  { title: '日记与回信', note: '过去写下的内容', icon: '▤', testId: 'entry-diary', route: '/pages/diary/index' },
  { title: '我的回信', note: '看看曾经收到的温柔回应', icon: '✉', testId: 'entry-letter-list', route: '/pages/letter/list' },
  { title: '我的收藏', note: '保存下来、想再读一次的话', icon: '♡', testId: 'entry-favorite', route: '/pages/favorite/index' },
  { title: '情绪月报', note: '从真实记录里回看这个月', icon: '▥', testId: 'entry-report', route: '/pages/me/month-report' },
  {
    title: '旅程归档',
    note: '回看已经走过的过程',
    icon: '⌁',
    testId: 'entry-journey-archive',
    route: '/pages/archive/index',
  },
  {
    title: '隐私与数据',
    note: '决定什么可以被记住和使用',
    icon: '▧',
    testId: 'entry-privacy',
    route: '/pages/settings/privacy',
  },
  {
    title: '帮助与反馈',
    note: '遇到问题时告诉我们',
    icon: '?',
    testId: 'entry-feedback',
    route: '/pages/help/feedback',
  },
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
  <section class="goodnight-page self-page">
    <header class="self-hero">
      <div class="self-brand"><span aria-hidden="true">♧</span>晚安树洞</div>
      <h1>我的旅程</h1>
      <p>看看你这段时间，是怎么慢慢走过来的。</p>
    </header>
    <p v-if="loadError" class="self-error">{{ loadError }}</p>
    <article v-if="currentJourney" class="journey-focus" data-testid="me-current-journey">
      <div class="journey-label"><span aria-hidden="true">⌁</span>正在经历</div>
      <div class="journey-main">
        <span class="journey-scene" aria-hidden="true"></span>
        <div>
          <h2>{{ currentJourney.journey.title }}</h2>
          <p>{{ currentJourney.journey.domain }} · {{ currentJourney.journey.stage }}</p>
          <small v-if="intensityChange">主观强度变化</small><strong v-if="intensityChange" class="intensity-change">{{ intensityChange.from }} <i>→</i> {{ intensityChange.to }}</strong>
          <small v-else>这段经历正在被好好保存</small>
        </div>
      </div>
      <button
        data-testid="entry-current-journey"
        @click="router.push(`/pages/journey/detail?id=${currentJourney.journey.id}`)"
      >
        继续看看
      </button>
    </article>
    <article v-else class="journey-focus journey-empty" data-testid="me-current-journey-empty">
      <div class="journey-label"><span aria-hidden="true">⌁</span>现在的旅程</div>
      <h2>这里还没有正在走的 Journey</h2>
      <p>需要的时候，从“今晚”写下正在发生的事。</p>
      <button data-testid="entry-start-journey" @click="router.push('/pages/tonight/index')">回到今晚</button>
    </article>
    <section class="reality-metrics" aria-label="真实变化">
      <article>
        <span>现实行动</span><strong>{{ activeActions }}</strong><small>正在进行</small>
      </article>
      <article>
        <span>行动结果</span><strong>{{ completedActions }}</strong><small>已经回看</small>
      </article>
      <article>
        <span>走过的路</span><strong>{{ archivedCount }}</strong><small>已归档</small>
      </article>
    </section>
    <button class="support-status" data-testid="me-support-status" @click="router.push('/pages/support-plan/index')">
      <div><span aria-hidden="true">✦</span><strong>我的现实支持</strong></div>
      <p>{{ supportPlan ? '低谷预案已经准备好，下一次不必从头想。' : '低谷预案还没有准备，之后可以慢慢补上。' }}</p>
    </button>
    <section class="self-menu" aria-label="长期恢复入口">
      <button
        v-for="entry in primaryEntries"
        :key="entry.testId"
        :data-testid="entry.testId"
        @click="router.push(entry.route)"
      >
        <span class="self-menu-icon" aria-hidden="true">{{ entry.icon }}</span><span><strong>{{ entry.title }}</strong><small>{{ entry.note }}</small></span><em aria-hidden="true">›</em>
      </button>
    </section>
    <section class="past-records">
      <h2>过去的记录</h2>
      <div class="self-menu compact">
        <button
          v-for="entry in archiveEntries"
          :key="entry.testId"
          :data-testid="entry.testId"
          @click="router.push(entry.route)"
        >
          <span class="self-menu-icon" aria-hidden="true">{{ entry.icon }}</span><span><strong>{{ entry.title }}</strong><small>{{ entry.note }}</small></span><em aria-hidden="true">›</em>
        </button>
      </div>
    </section>
    <section class="data-cleanup" aria-label="清理个人记录">
      <p v-if="clearMessage" class="cleanup-message" role="status">{{ clearMessage }}</p>
      <button class="cleanup-trigger" data-testid="btn-clear-data" type="button" @click="clearConfirmOpen = true">清理我的记录</button>
      <div v-if="clearConfirmOpen" class="cleanup-confirm" data-testid="clear-confirm-panel" role="alertdialog" aria-modal="true" aria-labelledby="clear-confirm-title">
        <div>
          <h2 id="clear-confirm-title">确定清理个人记录？</h2>
          <p>这会从服务端删除你的日记、回信和收藏，无法恢复。</p>
        </div>
        <div class="cleanup-actions">
          <button data-testid="btn-clear-cancel" type="button" :disabled="clearing" @click="clearConfirmOpen = false">暂不清理</button>
          <button data-testid="btn-clear-confirm" class="cleanup-confirm-action" type="button" :disabled="clearing" @click="clearMyData">{{ clearing ? '正在清理…' : '确认清理' }}</button>
        </div>
      </div>
    </section>
  </section>
</template>

<style scoped>
.self-page {
  display: grid;
  gap: 12px;
  overflow-x: hidden;
  padding: 0 16px calc(108px + env(safe-area-inset-bottom));
  background: #f7f1e7;
  color: #26382b;
}
.self-hero {
  position: relative;
  min-height: 178px;
  margin: 0 -16px;
  padding: 22px 24px 28px;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(10, 31, 49, 0.26), rgba(15, 39, 54, 0.72)),
    url('../assets/goodnight/peer/peer-night-hero.png') center 44% / cover no-repeat;
  color: #fff;
}
.self-hero::after {
  position: absolute;
  right: -12px;
  bottom: -15px;
  width: 165px;
  height: 100px;
  content: '';
  background: url('../assets/goodnight/illustrations/timeline-tree-scene.png') center/contain no-repeat;
  opacity: 0.64;
  pointer-events: none;
}
.self-brand {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}
.self-hero h1 {
  position: relative;
  z-index: 1;
  margin: 25px 0 5px;
  font:
    600 32px/1.2 Georgia,
    'Noto Serif SC',
    serif;
  letter-spacing: 0;
}
.self-hero p {
  position: relative;
  z-index: 1;
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.84);
}
.self-error {
  margin: 0;
  padding: 10px;
  border-radius: 10px;
  background: #fff1ee;
  color: var(--gn-danger);
}
.journey-focus {
  display: grid;
  gap: 10px;
  margin-top: -27px;
  z-index: 2;
  padding: 17px;
  border: 1px solid rgba(88, 104, 72, 0.17);
  border-radius: 22px;
  background: rgba(255, 252, 246, 0.96);
  box-shadow: 0 14px 32px rgba(39, 55, 40, 0.12);
}
.journey-label {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  color: #53694f;
}
.journey-main {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
}
.journey-scene {
  width: 84px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: url('../assets/goodnight/illustrations/timeline-home-scene.png') center/cover no-repeat;
}
.journey-main h2,
.journey-empty h2 {
  margin: 0;
  font:
    600 19px/1.35 Georgia,
    'Noto Serif SC',
    serif;
}
.journey-main p,
.journey-empty p {
  margin: 4px 0 10px;
  color: #7d8478;
  font-size: 12px;
}
.journey-main small {
  display: block;
  color: #8c8c7f;
  font-size: 11px;
}
.intensity-change {
  display: block;
  margin-top: 3px;
  color: #a27e47;
  font-size: 18px;
}
.intensity-change i {
  font-style: normal;
  color: #7c8b78;
}
.journey-focus button {
  justify-self: end;
  min-height: 36px;
  border: 0;
  border-radius: 999px;
  padding: 0 20px;
  background: #3f624a;
  color: #fff;
  font: inherit;
}
.journey-empty {
  padding: 20px;
}
.journey-empty button {
  justify-self: start;
}
.reality-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.reality-metrics article {
  display: grid;
  place-items: center;
  min-height: 86px;
  padding: 9px 4px;
  border: 1px solid rgba(88, 104, 72, 0.14);
  border-radius: 15px;
  background: rgba(255, 252, 247, 0.9);
  text-align: center;
}
.reality-metrics span,
.reality-metrics small {
  font-size: 10px;
  color: #7d8478;
}
.reality-metrics strong {
  font-size: 24px;
  font-weight: 500;
  color: #536e50;
}
.support-status {
  display: block;
  width: 100%;
  border: 0;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(223, 230, 211, 0.78);
  color: inherit;
  text-align: left;
  font: inherit;
}
.support-status div {
  display: flex;
  gap: 8px;
  align-items: center;
}
.support-status p {
  margin: 6px 0 0;
  color: #667263;
  font-size: 12px;
  line-height: 1.55;
}
.self-menu {
  display: grid;
  gap: 7px;
}
.self-menu button {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 16px;
  gap: 10px;
  align-items: center;
  min-height: 60px;
  border: 1px solid rgba(88, 104, 72, 0.13);
  border-radius: 14px;
  padding: 8px 12px;
  background: rgba(255, 252, 247, 0.92);
  color: #293b2e;
  text-align: left;
  font: inherit;
}
.self-menu-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #e5eadb;
  color: #587054;
}
.self-menu button > span:nth-child(2) {
  display: grid;
  gap: 2px;
}
.self-menu strong {
  font-size: 15px;
  font-weight: 600;
}
.self-menu small {
  font-size: 10px;
  color: #858b82;
}
.self-menu em {
  font-size: 22px;
  font-style: normal;
  color: #788476;
}
.past-records h2 {
  margin: 3px 0 9px;
  font:
    600 16px Georgia,
    'Noto Serif SC',
    serif;
}
.self-menu.compact button {
  min-height: 53px;
  grid-template-columns: 34px minmax(0, 1fr) 16px;
}
.self-menu.compact .self-menu-icon {
  width: 30px;
  height: 30px;
}
.data-cleanup {
  display: grid;
  gap: 9px;
  padding: 4px 0 14px;
}
.cleanup-trigger {
  min-height: 48px;
  border: 1px solid rgba(202, 93, 79, 0.42);
  border-radius: 14px;
  background: rgba(255, 247, 244, 0.92);
  color: #bc5548;
  font: inherit;
}
.cleanup-message {
  margin: 0;
  padding: 9px 11px;
  border-radius: 12px;
  background: #edf4e5;
  color: #4e6d44;
  font-size: 12px;
  line-height: 1.5;
}
.cleanup-confirm {
  position: fixed;
  bottom: calc(84px + env(safe-area-inset-bottom));
  left: 50%;
  z-index: 30;
  display: grid;
  gap: 12px;
  width: min(398px, calc(100vw - 32px));
  padding: 15px;
  border: 1px solid rgba(202, 93, 79, 0.24);
  border-radius: 16px;
  background: rgba(255, 251, 248, 0.98);
  box-shadow: 0 12px 26px rgba(75, 54, 45, 0.1);
  transform: translateX(-50%);
}
.cleanup-confirm h2,
.cleanup-confirm p {
  margin: 0;
}
.cleanup-confirm h2 {
  font-size: 16px;
}
.cleanup-confirm p {
  margin-top: 5px;
  color: #72766e;
  font-size: 12px;
  line-height: 1.55;
}
.cleanup-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.cleanup-actions button {
  min-height: 39px;
  border: 1px solid rgba(88, 104, 72, 0.19);
  border-radius: 11px;
  background: #fffdf7;
  color: #53694f;
  font: inherit;
  font-size: 13px;
}
.cleanup-actions .cleanup-confirm-action {
  border-color: #bc5548;
  background: #bc5548;
  color: #fff;
}
.cleanup-actions button:disabled {
  opacity: 0.62;
}
@media (max-width: 374px) {
  .self-page {
    padding-right: 12px;
    padding-left: 12px;
  }
  .self-hero {
    margin-right: -12px;
    margin-left: -12px;
  }
  .journey-main {
    grid-template-columns: 72px minmax(0, 1fr);
  }
  .journey-scene {
    width: 70px;
  }
  .reality-metrics article {
    min-height: 80px;
  }
  .self-menu button {
    padding-right: 9px;
    padding-left: 9px;
  }
}
.self-hero::after {
  display: none;
}
</style>
