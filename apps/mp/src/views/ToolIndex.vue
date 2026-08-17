<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { useDeviceClock } from '../composables/useDeviceClock';

const router = useRouter();
const { timeLabel } = useDeviceClock();
const toolsLoaded = ref(false);

const toolCards = [
  { type: 'decompose', title: '情绪拆解', desc: '拆解情绪根源，看清真实感受', icon: '⌕', testId: 'tool-decompose', route: '/pages/tool/decompose' },
  { type: 'rewrite', title: '负面改写', desc: '把消极想法换个温柔说法', icon: '✎', testId: 'tool-rewrite', route: '/pages/tool/run?type=rewrite' },
  { type: 'rant', title: '发疯文案', desc: '把想说的话痛快表达', icon: '◌', testId: 'tool-rant', route: '/pages/tool/run?type=rant' },
  { type: 'healing-quote', title: '治愈短句', desc: '一句温柔的话，托平你的心情', icon: '♡', testId: 'tool-healing-quote', route: '/pages/tool/run?type=healing-quote' },
  { type: 'sleep-comfort', title: '失眠安慰', desc: '陪你度过夜晚，温柔入眠', icon: '☾', testId: 'tool-sleep-comfort', route: '/pages/tool/run?type=sleep-comfort' },
  { type: 'work-support', title: '工作破防', desc: '职场情绪急救，给你力量支撑', icon: '▣', testId: 'tool-work-support', route: '/pages/tool/run?type=work-support' },
  { type: 'future-letter', title: '写给未来的自己', desc: '写一封信，给未来的你', icon: '✉', testId: 'tool-future-letter', route: '/pages/tool/run?type=future-letter' },
  { type: 'report', title: '情绪月报', desc: '回顾情绪变化，看见成长轨迹', icon: '▥', testId: 'tool-report', route: '/pages/report/month' },
];

async function loadTools() {
  await api.get('/api/v1/tools');
  toolsLoaded.value = true;
}

function openTool(card: (typeof toolCards)[number]) {
  const canonicalTypes: Record<string, string> = {
    rewrite: 'negative_rewrite',
    rant: 'rant',
    'healing-quote': 'healing_phrase',
    'sleep-comfort': 'sleep_comfort',
    'work-support': 'work_support',
    'future-letter': 'future_letter',
  };
  const canonicalType = canonicalTypes[card.type];
  if (canonicalType) {
    router.push(`/pages/tool/run?type=${canonicalType}`);
    return;
  }
  if (card.route) {
    router.push(card.route);
    return;
  }
  router.push(`/pages/tool/run?type=${card.type}`);
}

onMounted(loadTools);
</script>

<template>
  <section class="page goodnight-page rest-page tool-page">
    <header class="rest-hero tool-hero">
      <div class="status-row">
        <span>{{ timeLabel }}</span>
        <span aria-hidden="true"></span>
      </div>
      <div class="hero-copy">
        <h1>情绪工具</h1>
        <p>帮你整理和安放情绪</p>
      </div>
      <div class="tree-scene small" aria-hidden="true">
        <span class="tree-heart">♡</span>
        <span class="tree-bell">♧</span>
        <span class="seedling-face">•‿•</span>
      </div>
    </header>

    <article class="feature-card letter-tool-card">
      <div>
        <h2>一键生成温柔回信</h2>
        <p>理解你的心情，给你温柔回应</p>
        <button class="primary" data-testid="tool-letter" @click="router.push('/pages/letter/today')">去试试</button>
      </div>
      <div class="mail-seed" aria-hidden="true">
        <span>✉</span>
      </div>
    </article>

    <div class="tool-grid">
      <button
        v-for="card in toolCards"
        :key="card.type"
        class="tool-tile"
        :data-testid="card.testId"
        @click="openTool(card)"
      >
        <span class="tool-icon">{{ card.icon }}</span>
        <span class="tool-copy">
          <strong>{{ card.title }}</strong>
          <small>{{ card.desc }}</small>
        </span>
      </button>
    </div>

    <p class="bottom-slogan" :data-state="toolsLoaded ? 'synced' : 'loading'">每一种情绪都值得被看见</p>
  </section>
</template>

<style scoped>
.tool-page .status-row {
  visibility: hidden;
}

/* The feature card is a fixed editorial composition. Its real navigation
   button and tool links are unchanged; this only restores the card/grid
   rhythm above the fixed navigation. */
.tool-page.goodnight-page {
  gap: 10px;
}

.tool-page .feature-card {
  height: 142px;
  min-height: 142px;
}

.tool-page .feature-card h2 {
  transform: translateY(-6px);
}

.tool-page .feature-card p {
  transform: translateY(-3px);
}
</style>
