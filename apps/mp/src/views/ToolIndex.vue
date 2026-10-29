<script setup lang="ts">
import { useRouter } from 'vue-router';
const router = useRouter();

/** Back to wherever 工具 was opened from; the tab root is not always the entry point. */
function safeBack() {
  if (window.history.state?.back) router.back();
  else router.push('/pages/tonight/index');
}
/**
 * Every tool the product has, with the group the design's three headings imply.
 *
 * The grouping is presentational - the same nine rows, the same routes, the same testids - because the
 * design's hierarchy is "what do I need right now" rather than one flat list of nine. Nothing is
 * merged or dropped: the brief allows merging similar entries but not removing function.
 */
const toolCards = [
  { type: 'decompose', group: 'sort', title: '情绪拆解', desc: '拆解情绪根源，看清真实感受', icon: '≡', testId: 'tool-decompose', route: '/pages/tool/decompose' },
  { type: 'rewrite', group: 'sort', title: '负面改写', desc: '把消极想法换个温柔说法', icon: '✎', testId: 'tool-rewrite', route: '/pages/tool/run?type=rewrite' },
  { type: 'rant', group: 'sort', title: '发消息前先整理', desc: '写下来，再决定发不发', icon: '◌', testId: 'tool-rant', route: '/pages/tool/run?type=rant' },
  { type: 'healing-quote', group: 'pause', title: '治愈短句', desc: '一句温柔的话，托平你的心情', icon: '♡', testId: 'tool-healing-quote', route: '/pages/tool/run?type=healing-quote' },
  { type: 'sleep-comfort', group: 'pause', title: '失眠安慰', desc: '陪你度过夜晚，温柔入眠', icon: '☾', testId: 'tool-sleep-comfort', route: '/pages/tool/run?type=sleep-comfort' },
  { type: 'work-support', group: 'pause', title: '工作破防', desc: '职场情绪急救，给你力量支撑', icon: '▣', testId: 'tool-work-support', route: '/pages/tool/run?type=work-support' },
  { type: 'letter', group: 'keep', title: '一键生成温柔回信', desc: '理解你的心情，给你温柔回应', icon: '✉', testId: 'tool-letter', route: '/pages/letter/today' },
  { type: 'future-letter', group: 'keep', title: '写给未来的自己', desc: '写一封信，给未来的你', icon: '⏱', testId: 'tool-future-letter', route: '/pages/tool/run?type=future-letter' },
  { type: 'report', group: 'keep', title: '情绪月报', desc: '回顾情绪变化，看见成长轨迹', icon: '▥', testId: 'tool-report', route: '/pages/report/month' },
];

const GROUPS = [
  { key: 'sort', title: '整理事情' },
  { key: 'pause', title: '短暂停顿' },
  { key: 'keep', title: '留一份记录' },
];
const groups = GROUPS.map((group) => ({ ...group, items: toolCards.filter((card) => card.group === group.key) }))
  .filter((group) => group.items.length);

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
    <header class="rest-topbar bleed-bar">
      <button class="back-icon" data-testid="tool-back" aria-label="返回" @click="safeBack">‹</button>
      <h1>情绪工具</h1>
      <span aria-hidden="true"></span>
    </header>

    <p class="tool-lead">选择一种现在用得上的方式。</p>

    <!--
      A grouped tool list, not a function board. The V1 page led with a marketing card for the letter
      tool and then a four-up grid of illustrated tiles; the design asks for a list a reader can scan,
      with at most two levels of grouping. Every row keeps its original route and testid.
    -->
    <section v-for="group in groups" :key="group.key" class="tool-group">
      <h2>{{ group.title }}</h2>
      <button
        v-for="card in group.items"
        :key="card.type"
        class="tool-row"
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
    </section>
  </section>
</template>

<style scoped>
/* The design's hierarchy: a bar, one lead line, then three groups of rows. The old page opened with a
   142px hero whose status row was hidden by CSS, which left a band of empty space above the list. */
.tool-page.goodnight-page {
  display: block;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 0;
  /* The tab bar is fixed; 32px left the last row underneath it. */
  padding: 0 0 calc(96px + env(safe-area-inset-bottom));
}

.tool-page .rest-topbar {
  /* The shared `.rest-topbar` carries `margin-top: 16px`; on this page it left a blank band above the
     bar that the other detail pages do not have. */
  margin-top: 0;
  /* back | title | spacer, the same shape as the other detail pages. */
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 32px;
  align-items: center;
  min-height: 52px;
  border-bottom: 1px solid #e8eaed;
  background: #ffffff;
}

.tool-page .rest-topbar .back-icon {
  place-items: center start;
  /* Flush with the content axis; centred in its track the glyph sat 35 device px inside it. */
  justify-self: start;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  background: none;
  color: #39454c;
  font-size: 24px;
  line-height: 1;
}

.tool-page .rest-topbar h1 {
  color: #242a32;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.3px;
  text-align: left;
}

.tool-lead {
  margin: 16px 0 0;
  color: #7a838e;
  font-size: 13px;
  line-height: 1.6;
}

.tool-group { margin-top: 24px; }

.tool-group h2 {
  margin: 0 0 4px;
  color: #242a32;
  font-size: 15px;
  font-weight: 700;
}

.tool-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 0;
  padding: 14px 0;
  border: 0;
  border-bottom: 1px solid #ebedf0;
  border-radius: 0;
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
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: #f2f4f5;
  color: #5b6a5f;
  font-size: 17px;
}

.tool-row-copy { min-width: 0; }

.tool-row-copy strong {
  display: block;
  color: #242a32;
  font-size: 15.5px;
  font-weight: 650;
  line-height: 1.35;
}

.tool-row-copy small {
  display: block;
  margin-top: 3px;
  color: #818993;
  font-size: 12.5px;
  line-height: 1.45;
}

.tool-row-chevron {
  justify-self: end;
  color: #b6bcc2;
  font-size: 18px;
  line-height: 1;
}
</style>
