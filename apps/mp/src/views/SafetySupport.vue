<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import AppIcon from '../components/icons/AppIcon.vue';

const route = useRoute();
const router = useRouter();
const journeyId = computed(() => String(route.query.journeyId ?? ''));
const busy = ref(false);
const error = ref('');
const supportPlan = ref<Record<string, unknown> | null>(null);
const savedSupport = computed(() => {
  const plan = supportPlan.value ?? {};
  const first = (key: string) => (Array.isArray(plan[key]) ? String((plan[key] as unknown[])[0] ?? '') : '');
  return [
    first('safePeople') ? `联系：${first('safePeople')}` : '',
    first('places') ? `去：${first('places')}` : '',
    first('smallActions') ? `先做：${first('smallActions')}` : '',
  ].filter(Boolean);
});

onMounted(async () => {
  try {
    supportPlan.value =
      (await api.get<{ item?: { plan?: Record<string, unknown> } }>('/api/v1/me/support-plan')).item?.plan ?? null;
  } catch {
    supportPlan.value = null;
  }
});

async function stayHere() {
  if (!journeyId.value) {
    await router.push('/pages/tonight/index');
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    await api.post(`/api/v1/journeys/${journeyId.value}/safety/acknowledge`, {});
    await router.push(`/pages/journey/detail?id=${journeyId.value}&mode=stabilize`);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '当前安全状态没有保存';
  } finally {
    busy.value = false;
  }
}

/**
 * The three steps, kept verbatim from the previous version.
 *
 * This page is safety-critical, so the copy is content, not decoration: the V2 redesign changes where
 * things sit, not what a person in crisis is told to do.
 */
const steps = [
  { n: '1', title: '去一个有人在的地方', body: '去一个能让你感到安全的地方。' },
  { n: '2', title: '把危险物品暂时拿远一点', body: '先把可能伤害自己的物品放到够不着的地方。' },
  { n: '3', title: '只撑过接下来的 10 分钟', body: '先只照顾眼前的十分钟，不要求自己解决全部。' },
];
</script>

<template>
  <section class="goodnight-page safety-v2" data-testid="safety-support">
    <header class="safety-header">
      <button aria-label="返回" @click="router.back()"><AppIcon name="back" /></button>
      <h1>安全支持</h1>
    </header>

    <!-- Immediate danger first. The previous version opened with a full-bleed hero and placed both
         phone numbers third and fourth in a list, so the one thing a person in crisis needs sat below
         the fold. The spec is explicit that a safety entry must not become hard to find. -->
    <section class="danger-block">
      <h2>如果你现在有立即危险</h2>
      <p>优先联系当地紧急服务，或请身边可信任的人陪同。不要等待应用中的消息。</p>
      <div class="danger-actions">
        <a class="danger-primary" data-testid="safety-emergency-medical" href="tel:120">
          <AppIcon name="heart" />
          <span>紧急医疗求助 120</span>
        </a>
        <a class="danger-secondary" data-testid="safety-emergency" href="tel:12356">
          <AppIcon name="people" />
          <span>心理援助热线 12356</span>
        </a>
      </div>
    </section>

    <section class="steps-block">
      <h2>现在可以先做的事</h2>
      <ul>
        <li v-for="step in steps" :key="step.n">
          <span class="step-n" aria-hidden="true">{{ step.n }}</span>
          <div>
            <strong>{{ step.title }}</strong>
            <small>{{ step.body }}</small>
          </div>
        </li>
      </ul>
    </section>

    <section class="support-actions">
      <button
        data-testid="safety-handoff"
        type="button"
        @click="router.push(`/pages/reality-handoff/index${journeyId ? `?journeyId=${journeyId}` : ''}`)"
      >
        <span class="action-icon"><AppIcon name="message" /></span>
        <div><strong>发求助卡给信任的人</strong><small>让他们知道你现在需要支持</small></div>
        <AppIcon name="arrow" :size="19" />
      </button>
      <button data-testid="safety-stay" type="button" :disabled="busy" @click="stayHere">
        <span class="action-icon"><AppIcon name="leaf" /></span>
        <div><strong>我暂时安全，继续留在这里</strong><small>先做一轮稳定支持，再慢慢看接下来的事</small></div>
        <AppIcon name="arrow" :size="19" />
      </button>
    </section>

    <section v-if="savedSupport.length" class="saved-plan" data-testid="safety-saved-support-plan">
      <div class="saved-head">
        <strong>你提前为自己留过的预案</strong>
        <button type="button" @click="router.push('/pages/support-plan/index')">查看全部</button>
      </div>
      <p class="saved-note">这里只显示你主动保存的内容。</p>
      <ul>
        <li v-for="item in savedSupport" :key="item">{{ item }}</li>
      </ul>
    </section>

    <p class="source-note">
      这不是医疗或紧急救援服务。风险情况下优先使用现实中的帮助。12356 为国家卫生健康委统一心理援助热线；110、120
      为紧急求助电话。<a
        href="https://www.nhc.gov.cn/yzygj/c100068/202412/49a1a65386cd4be582d4702fd0926ee8.shtml"
        target="_blank"
        rel="noreferrer"
      >查看官方说明</a>
    </p>

    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.safety-v2 {
  padding-bottom: 40px;
}

.safety-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0 14px;
  border-bottom: 1px solid var(--gn-divider, #e8ebef);
}

.safety-header button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-left: -10px;
  border: 0;
  background: transparent;
  color: var(--gn-ink, #242a32);
  cursor: pointer;
}

.safety-header h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--gn-ink, #242a32);
}

/* Danger block: the one place on this page where the danger colour is correct. The spec forbids
   masking a risk with the brand colour. */
.danger-block {
  margin: 16px 0 0;
  padding: 16px;
  border: 1px solid rgba(189, 69, 69, 0.28);
  border-radius: 12px;
  background: #fdf3f3;
}

.danger-block h2 {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 600;
  color: var(--gn-danger, #bd4545);
}

.danger-block p {
  margin: 0 0 14px;
  font-size: 14px;
  line-height: 1.6;
  color: #7a4444;
}

.danger-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.danger-actions a {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
}

.danger-primary {
  background: var(--gn-danger, #bd4545);
  color: #fff;
}

.danger-secondary {
  border: 1px solid rgba(189, 69, 69, 0.4);
  background: #fff;
  color: var(--gn-danger, #bd4545);
}

.steps-block {
  margin-top: 26px;
}

.steps-block h2 {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 600;
  color: var(--gn-ink, #242a32);
}

.steps-block ul {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--gn-divider, #e8ebef);
}

.steps-block li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid var(--gn-divider, #e8ebef);
}

.step-n {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--gn-surface-soft, #f7f8fa);
  color: var(--gn-muted, #757d87);
  font-size: 13px;
}

.steps-block strong {
  display: block;
  font-size: 15px;
  font-weight: 500;
  color: var(--gn-ink, #242a32);
}

.steps-block small {
  display: block;
  margin-top: 3px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--gn-muted, #757d87);
}

.support-actions {
  margin-top: 22px;
  border-top: 1px solid var(--gn-divider, #e8ebef);
}

.support-actions button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 64px;
  padding: 12px 0;
  border: 0;
  border-bottom: 1px solid var(--gn-divider, #e8ebef);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.support-actions button:disabled {
  opacity: 0.5;
}

.action-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--gn-surface-soft, #f7f8fa);
  color: var(--gn-primary, #275f56);
}

.support-actions strong {
  display: block;
  font-size: 15px;
  font-weight: 500;
  color: var(--gn-ink, #242a32);
}

.support-actions small {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  color: var(--gn-muted, #757d87);
}

.support-actions button > :last-child {
  margin-left: auto;
  color: var(--gn-muted, #757d87);
}

.saved-plan {
  margin-top: 22px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--gn-surface-soft, #f7f8fa);
}

.saved-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.saved-head strong {
  font-size: 15px;
  font-weight: 500;
  color: var(--gn-ink, #242a32);
}

.saved-head button {
  border: 0;
  background: transparent;
  color: var(--gn-primary, #275f56);
  font-size: 14px;
  cursor: pointer;
}

.saved-note {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--gn-muted, #757d87);
}

.saved-plan ul {
  margin: 10px 0 0;
  padding-left: 18px;
}

.saved-plan li {
  font-size: 14px;
  line-height: 1.7;
  color: var(--gn-ink, #242a32);
}

.source-note {
  margin: 22px 0 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--gn-surface-soft, #f7f8fa);
  font-size: 13px;
  line-height: 1.6;
  color: var(--gn-muted, #757d87);
}

.source-note a {
  color: var(--gn-primary, #275f56);
}

.error-text {
  margin: 14px 0 0;
  font-size: 14px;
  color: var(--gn-danger, #bd4545);
}
</style>
