<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useDeviceClock } from '../composables/useDeviceClock';
const router = useRouter();
const { timeLabel } = useDeviceClock();
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
      </div>
    </header>

    <!--
      A tool list, not a function board. The V1 page led with a marketing card for the letter tool and
      then a four-up grid of illustrated tiles; the design asks for a list a reader can scan and pick
      from, with at most two levels of grouping. The letter tool keeps its own row and testid - the
      brief allows merging similar entries but not dropping original function.
    -->
    <div class="tool-list" role="list">
      <button class="tool-row" role="listitem" data-testid="tool-letter" @click="router.push('/pages/letter/today')">
        <span class="tool-row-icon" aria-hidden="true">✉</span>
        <span class="tool-row-copy">
          <strong>一键生成温柔回信</strong>
          <small>理解你的心情，给你温柔回应</small>
        </span>
        <span class="tool-row-chevron" aria-hidden="true">›</span>
      </button>
      <button
        v-for="card in toolCards"
        :key="card.type"
        class="tool-row"
        role="listitem"
        :data-testid="card.testId"
        @click="openTool(card)"
      >
        <span class="tool-row-icon" aria-hidden="true">{{ card.icon }}</span>
        <span class="tool-row-copy">
          <strong>{{ card.title }}</strong>
          <small>{{ card.desc }}</small>
        </span>
        <span class="tool-row-chevron" aria-hidden="true">›</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.tool-page .status-row {
  visibility: hidden;
}

.tool-page.goodnight-page {
  gap: 0;
}

/* A scannable list: hairline-separated rows, a quiet mark, the title as the strongest element, and
   the description underneath. The old page spent a 142px marketing card and a grid of illustrated
   tiles on the same information. */
.tool-list {
  display: block;
  background: #ffffff;
}

.tool-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 62px;
  padding: 12px 20px;
  border: 0;
  border-bottom: 1px solid #e8eaed;
  background: #ffffff;
  text-align: left;
}

.tool-row:active {
  background: #f7f8f9;
}

.tool-row-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: #f2f4f5;
  color: #5b6a5f;
  font-size: 15px;
}

.tool-row-copy { min-width: 0; }

.tool-row-copy strong {
  display: block;
  color: #242a32;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
}

.tool-row-copy small {
  display: block;
  margin-top: 2px;
  color: #818993;
  font-size: 11.5px;
  line-height: 1.4;
}

.tool-row-chevron {
  color: #b6bcc2;
  font-size: 18px;
  line-height: 1;
}
</style>
