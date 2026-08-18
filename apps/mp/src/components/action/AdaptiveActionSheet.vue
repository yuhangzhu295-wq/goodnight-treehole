<script setup lang="ts">
import type { ActionBarrier } from '@goodnight/shared-types';
import AppIcon from '../icons/AppIcon.vue';

type AdaptiveResult = { title: string; description: string; expectedDuration?: string; difficulty?: string };

const props = defineProps<{
  action: { title: string; description?: string };
  selectedBarrier?: ActionBarrier;
  loading?: boolean;
  result?: AdaptiveResult | null;
}>();

const barriers: Array<{ value: ActionBarrier; label: string }> = [
  { value: 'forgot', label: '忘了' },
  { value: 'too_hard', label: '太难了' },
  { value: 'emotion_too_strong', label: '情绪太强' },
  { value: 'environment', label: '环境不允许' },
  { value: 'did_not_want_to', label: '其实我不想做' },
  { value: 'other', label: '其他' },
];

defineEmits<{
  close: [];
  barrier: [value: ActionBarrier];
  retry: [];
  accept: [];
}>();
</script>

<template>
  <section class="adaptive-screen" data-testid="adaptive-action-sheet">
    <header class="adaptive-hero">
      <button class="back-button" aria-label="返回行动" @click="$emit('close')">‹</button>
      <p class="brand">晚安树洞</p>
      <h1>没做到也没关系</h1>
      <p>我们把这一步，再缩小一点。</p>
    </header>

    <main class="adaptive-content">
      <section class="previous-action">
        <span class="previous-icon" aria-hidden="true"><AppIcon name="step" /></span>
        <div><p>上一次的小行动</p><strong>{{ props.action.title }}</strong></div>
      </section>

      <section class="adaptive-paper">
        <h2>什么让它变难了？</h2>
        <div class="barrier-grid" aria-label="行动阻碍">
          <button v-for="barrier in barriers" :key="barrier.value" :class="{ selected: props.selectedBarrier === barrier.value }" :disabled="loading" @click="$emit('barrier', barrier.value)">
            {{ barrier.label }}<span v-if="props.selectedBarrier === barrier.value" aria-hidden="true">✓</span>
          </button>
        </div>

        <div v-if="loading" class="generating" data-testid="adaptive-generating">正在把这一步缩小...</div>

        <template v-else-if="result">
          <section class="smaller-action" data-testid="adaptive-result">
            <p>那我们先试这个更小一步</p>
            <h3>{{ result.title }}</h3>
            <span>{{ result.description }}</span>
            <div><small v-if="result.expectedDuration">时长 {{ result.expectedDuration }}</small><small v-if="result.difficulty">难度 {{ result.difficulty }}</small></div>
          </section>
          <button class="primary-cta" data-testid="adaptive-accept" @click="$emit('accept')">试试这个更小一步</button>
          <button class="secondary-cta" @click="$emit('retry')">我想换一个</button>
        </template>
        <p v-else class="select-hint">选一个最接近的原因，我们就从那里开始缩小。</p>
      </section>
    </main>
  </section>
</template>

<style scoped>
.adaptive-screen { box-sizing:border-box; min-height:100vh; background:linear-gradient(180deg,#152837 0,#263d4a 22%,#ece1ca 44%,#f8f4ea 100%); padding:calc(12px + env(safe-area-inset-top)) 16px calc(102px + env(safe-area-inset-bottom)); color:#fffaf0; }
.adaptive-hero { position:relative; min-height:158px; padding:2px 12px 10px; overflow:hidden; }
.adaptive-hero::before { position:absolute; z-index:0; top:-24px; right:-18px; width:184px; height:184px; background:radial-gradient(circle at 55% 58%,rgba(234,181,130,.42),transparent 42%),url('../../assets/goodnight/illustrations/adaptive-night-corner.png') right top/cover no-repeat; content:''; opacity:.9; pointer-events:none; }
.adaptive-hero::after { position:absolute; z-index:0; top:-22px; right:104px; width:116px; height:116px; border-radius:50%; background:radial-gradient(circle,rgba(251,220,174,.2),transparent 66%); content:''; filter:blur(4px); pointer-events:none; }
.brand,.adaptive-hero h1,.adaptive-hero > p:last-child { position:relative; z-index:1; }
.brand { margin:3px 0 20px; color:rgba(255,249,237,.76); font-size:13px; }
h1 { max-width:300px; margin:0; font-family:"Songti SC", "Noto Serif SC", "Microsoft YaHei", serif; font-size:29px; font-weight:650; line-height:1.25; }
.adaptive-hero > p:last-child { margin:8px 0 0; color:rgba(255,249,237,.82); font-size:14px; }
.back-button { position:absolute; z-index:2; top:0; left:-2px; display:grid; width:34px; height:34px; place-items:center; border:0; border-radius:50%; background:rgba(255,255,255,.1); color:#fffdf5; font:inherit; font-size:27px; line-height:1; cursor:pointer; }
.brand { margin-left:44px; }
.adaptive-content { display:grid; gap:8px; color:#314437; }
.previous-action { display:grid; grid-template-columns:38px 1fr; align-items:center; gap:10px; min-height:62px; border-radius:17px; background:rgba(255,252,242,.94); padding:9px 12px; box-shadow:0 11px 24px rgba(19,34,40,.12); }
.previous-icon { display:grid; width:38px; height:38px; place-items:center; border-radius:12px; background:#dfe5cc; color:#6d7d5c; }
.previous-action p { margin:0 0 3px; color:#7a8374; font-size:11px; }.previous-action strong { font-size:14px; line-height:1.35; }
.adaptive-paper { border-radius:21px; background:rgba(255,253,247,.97); padding:14px 12px 11px; box-shadow:0 13px 28px rgba(31,41,36,.12); }
h2 { margin:0 4px 10px; color:#314737; font-family:"Songti SC", "Noto Serif SC", "Microsoft YaHei", serif; font-size:19px; font-weight:650; }
.barrier-grid { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:7px; }
.barrier-grid button { display:flex; min-height:36px; align-items:center; justify-content:center; gap:3px; border:1px solid rgba(96,119,86,.14); border-radius:999px; background:#f8f5ec; color:#5d6b59; font:inherit; font-size:12px; cursor:pointer; }.barrier-grid button.selected { border-color:#557654; background:#557654; color:#fffdf7; box-shadow:0 6px 12px rgba(54,84,58,.18); }.barrier-grid button:disabled { cursor:wait; }
.select-hint { margin:12px 4px 1px; color:#7c8778; font-size:12px; line-height:1.5; }
.generating { margin-top:12px; border-radius:16px; background:#eef0df; padding:14px; color:#617059; text-align:center; font-size:13px; }
.smaller-action { position:relative; overflow:hidden; margin-top:12px; border:1px solid rgba(109,126,86,.15); border-radius:17px; background:linear-gradient(135deg,#f4efd9,#e8e0c7); padding:13px 12px; }.smaller-action::after { position:absolute; right:-17px; bottom:-19px; width:96px; height:96px; background:url('../../assets/goodnight/leaf-corner.png') right bottom/contain no-repeat; opacity:.62; content:''; pointer-events:none; }.smaller-action p { margin:0; color:#6a765f; font-size:12px; }.smaller-action h3 { position:relative; z-index:1; max-width:238px; margin:7px 0 5px; color:#314837; font-family:"Songti SC", "Noto Serif SC", "Microsoft YaHei", serif; font-size:20px; line-height:1.3; }.smaller-action > span { position:relative; z-index:1; display:block; max-width:244px; color:#5f6c60; font-size:12px; line-height:1.45; }.smaller-action div { position:relative; z-index:1; display:flex; gap:6px; margin-top:9px; }.smaller-action small { border-radius:999px; background:rgba(255,255,255,.58); padding:4px 8px; color:#607057; font-size:10px; }
.primary-cta,.secondary-cta { width:100%; min-height:46px; margin-top:10px; border-radius:999px; font:inherit; font-size:14px; cursor:pointer; }.primary-cta { border:1px solid #3e664d; background:#426b52; color:#fffdf7; }.secondary-cta { min-height:40px; border:1px solid rgba(96,119,86,.19); background:transparent; color:#52644d; }
@media (max-width:374px) { .adaptive-screen { padding-inline:12px; }.adaptive-hero { min-height:150px; }.adaptive-hero h1 { font-size:27px; }.adaptive-paper { padding-inline:12px; }.barrier-grid { gap:7px; }.barrier-grid button { font-size:12px; } }
@media (max-width:390px) {
  .adaptive-screen { padding-bottom:calc(96px + env(safe-area-inset-bottom)); }
  .adaptive-hero { min-height:152px; }
  .adaptive-hero h1 { font-size:27px; }
  .previous-action { min-height:60px; padding:8px 11px; }
  .adaptive-paper { padding:13px 11px 10px; }
  h2 { margin-bottom:10px; font-size:19px; }
  .barrier-grid { gap:6px; }
  .barrier-grid button { min-height:36px; font-size:12px; }
  .select-hint { margin-top:12px; }
  .smaller-action { margin-top:12px; padding:13px 12px; }
  .smaller-action h3 { margin:7px 0 5px; font-size:20px; }
  .smaller-action > span { font-size:12px; line-height:1.5; }
  .smaller-action div { margin-top:9px; }
  .primary-cta { min-height:44px; margin-top:10px; }
  .secondary-cta { min-height:40px; margin-top:7px; }
}
</style>
