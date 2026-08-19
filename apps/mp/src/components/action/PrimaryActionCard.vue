<script setup lang="ts">
type ActionMode = 'no-journey' | 'empty' | 'recommendation' | 'accepted';

defineProps<{
  mode: ActionMode;
  title?: string;
  description?: string;
  expectedDuration?: string;
  difficulty?: string;
  followUpMessage?: string;
  loading?: boolean;
}>();

defineEmits<{
  request: [];
  accept: [];
  smaller: [];
  complete: [];
  missed: [];
  timeline: [];
  tonight: [];
}>();
</script>

<template>
  <section class="action-paper" data-testid="primary-action-card">
    <p class="paper-label">{{ mode === 'accepted' ? '今晚的约定' : '今晚的行动' }}</p>

    <template v-if="mode === 'no-journey'">
      <h2>先从今晚说起</h2>
      <p class="paper-copy">说一件正在占住你心里的事。确认之后，我们再一起把下一步缩小。</p>
      <button class="primary-cta" @click="$emit('tonight')">去说说今晚发生了什么</button>
    </template>

    <template v-else-if="mode === 'empty'">
      <h2>先把这一步整理小一点</h2>
      <p class="paper-copy">系统会根据你已经确认的经历，帮你找到一件今晚够得着的小行动。</p>
      <button class="primary-cta" :disabled="loading" data-testid="action-request-plan" @click="$emit('request')">
        {{ loading ? '正在整理一个小行动...' : '帮我整理一个小行动' }}
      </button>
    </template>

    <template v-else-if="mode === 'recommendation'">
      <h2 class="action-title">{{ title }}</h2>
      <div class="action-meta">
        <span v-if="expectedDuration">预计 {{ expectedDuration }}</span>
        <span>今晚的约定</span>
      </div>
      <p class="paper-copy">{{ description }}</p>
      <p class="completion-note">先完成一个最小的版本，做到就够了。</p>
      <div class="card-actions">
        <button class="primary-cta" :disabled="loading" data-testid="action-accept-plan" @click="$emit('accept')">我愿意试试</button>
        <button class="secondary-cta" :disabled="loading" @click="$emit('smaller')">换一个更小的版本</button>
      </div>
    </template>

    <template v-else>
      <button class="timeline-link" @click="$emit('timeline')">查看这段旅程</button>
      <h2 class="action-title">{{ title }}</h2>
      <p class="paper-copy">{{ description }}</p>
      <p v-if="followUpMessage" class="promise-text">{{ followUpMessage }}</p>
      <div class="two-actions">
        <button class="primary-cta" @click="$emit('complete')">做到了</button>
        <button class="secondary-cta" @click="$emit('missed')">没做到</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.action-paper { position:relative; overflow:hidden; border:1px solid rgba(116, 124, 86, .2); border-radius:24px; background:linear-gradient(145deg, rgba(255,254,250,.98), rgba(247,242,226,.98)); box-shadow:0 15px 30px rgba(22,36,42,.13); padding:17px 18px 15px; }
.action-paper::after { position:absolute; right:-4px; bottom:-8px; width:126px; height:126px; background:url('../../assets/goodnight/illustrations/action-paper-scene.png') right bottom/contain no-repeat; opacity:.4; content:''; pointer-events:none; }
.paper-label { position:relative; z-index:1; margin:0 0 7px; color:#66765b; font-size:12px; font-weight:650; }
h2 { position:relative; z-index:1; max-width:286px; margin:0; color:#253a31; font-family:"Songti SC", "Noto Serif SC", "Microsoft YaHei", serif; font-size:23px; font-weight:650; line-height:1.33; }
.action-title { font-size:24px; }
.paper-copy { position:relative; z-index:1; max-width:295px; margin:8px 0 0; color:#657066; font-size:14px; line-height:1.56; }
.action-meta { position:relative; z-index:1; display:flex; flex-wrap:wrap; gap:6px; margin-top:9px; color:#65735d; font-size:12px; }
.action-meta span { display:inline-flex; align-items:center; min-height:24px; border-radius:999px; background:rgba(232,239,218,.86); padding:0 9px; }
.completion-note { position:relative; z-index:1; margin:9px 0 0; color:#738076; font-size:12px; line-height:1.45; }
.card-actions,.two-actions { position:relative; z-index:1; display:grid; gap:7px; margin-top:13px; }
.two-actions { grid-template-columns:1fr 1fr; }
.primary-cta,.secondary-cta { min-height:44px; border-radius:999px; padding:0 16px; font:inherit; font-size:14px; cursor:pointer; }
.primary-cta { border:1px solid #3f624d; background:#426b52; color:#fffdf6; box-shadow:0 8px 16px rgba(48,80,61,.18); }
.primary-cta:disabled,.secondary-cta:disabled { cursor:wait; opacity:.68; }
.secondary-cta { border:1px solid rgba(88,108,83,.2); background:rgba(255,255,255,.56); color:#516348; }
.promise-text { position:relative; z-index:1; margin:14px 0 0; border-top:1px solid rgba(105,121,93,.16); padding-top:12px; color:#65735e; font-size:14px; line-height:1.55; }
.timeline-link { position:absolute; z-index:2; top:18px; right:14px; border:0; background:transparent; color:#607555; font:inherit; font-size:13px; cursor:pointer; }
@media (max-width:374px) { .action-paper { padding:17px 15px 14px; } .action-paper::after { width:112px; height:112px; } h2,.action-title { font-size:22px; } .two-actions { grid-template-columns:1fr; } }
</style>
