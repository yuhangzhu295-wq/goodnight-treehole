<script setup lang="ts">
import { computed, ref } from 'vue';
import AppIcon from '../icons/AppIcon.vue';

type TimelineItem = { id: string; kind: string; content: string; createdAt: string; intensity?: number; payload?: Record<string, unknown> };
const props = defineProps<{
  title: string;
  createdAt: string;
  domain?: string;
  stage?: string;
  status?: string;
  initialIntensity?: number;
  currentIntensity?: number;
  updates: TimelineItem[];
  later: string;
  busy?: boolean;
}>();
const emit = defineEmits<{ 'update:later': [value: string]; 'save-later': []; action: []; 'change-support': [] }>();

const days = computed(() => Math.max(1, Math.ceil((Date.now() - Date.parse(props.createdAt)) / 86_400_000) + 1));

/** The design asks for Chinese statuses; these are the only English values the API sends. */
const STAGE_LABEL: Record<string, string> = {
  clarifying: '正在整理',
  planning: '正在计划',
  acting: '行动中',
  recovering: '恢复中',
  graduated: '已完成',
};
const STATUS_LABEL: Record<string, string> = {
  active: '正在经历',
  paused: '暂停中',
  completed: '已完成',
  archived: '已归档',
};
const stageLabel = computed(() => STAGE_LABEL[props.stage ?? ''] ?? '正在整理');
const statusLabel = computed(() => STATUS_LABEL[props.status ?? ''] ?? '正在经历');

/** Whether the intensity actually moved, so the card does not claim a change that did not happen. */
const intensityMoved = computed(
  () =>
    props.initialIntensity !== undefined &&
    props.currentIntensity !== undefined &&
    props.initialIntensity !== props.currentIntensity,
);

const writingLater = ref(false);

/** What each recorded kind is called. The art each one used to carry went with the V1 cards. */
const visual = (item: TimelineItem): { icon: string; title: string } => {
  if (item.kind === 'created') return { icon: 'journey', title: '最初写下这件事' };
  if (item.kind === 'commitment_created')
    return item.payload?.parentActionId
      ? { icon: 'step', title: '把行动又缩小了一点' }
      : { icon: 'moon', title: '今晚定下了一小步' };
  if (item.kind === 'checkin_missed' || (item.kind === 'checkin' && item.payload?.barrier))
    return { icon: 'rain', title: '这一步没有做到' };
  if (item.kind === 'adaptive_action') return { icon: 'step', title: '把行动又缩小了一点' };
  if (item.kind === 'checkin') return { icon: 'journey', title: '回来看了看这一步' };
  if (item.kind === 'intensity') return { icon: 'trend', title: '状态发生了变化' };
  if (item.kind === 'stabilize_breath') return { icon: 'breath', title: '让呼吸慢下来' };
  if (item.kind === 'stabilize_note') return { icon: 'pen', title: '给自己留了一句话' };
  if (item.kind === 'safety_acknowledged') return { icon: 'heart', title: '选择继续留在支持里' };
  if (item.kind === 'fingerprint_reanalysis_requested') return { icon: 'leaf', title: '重新看见这段经历' };
  return { icon: 'leaf', title: '后来有了一点变化' };
};

const date = (value: string) => {
  const when = new Date(value);
  const sameDay = when.toDateString() === new Date().toDateString();
  return sameDay ? '今天' : new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(when);
};
</script>

<template>
  <section class="timeline-screen" data-testid="journey-timeline">
    <header class="journey-head">
      <h1>{{ title }}</h1>
      <p>{{ domain || '匿名经历' }} · {{ stageLabel }}</p>
    </header>

    <section class="status-card">
      <span class="status-chip">{{ statusLabel }}</span>
      <strong class="status-stage">{{ stageLabel }}</strong>
      <p v-if="intensityMoved" class="status-detail">
        最近变化：主观强度 {{ initialIntensity }} → {{ currentIntensity }}
      </p>
      <p v-else class="status-detail">第 {{ days }} 天 · 先看见发生了什么，再慢慢往前走。</p>
    </section>

    <section class="timeline-block">
      <h2>经历时间线</h2>
      <ol class="timeline-list">
        <li v-for="item in updates" :key="item.id" class="timeline-row">
          <span class="timeline-mark" aria-hidden="true" />
          <div class="timeline-body">
            <p class="timeline-when">{{ date(item.createdAt) }} · {{ visual(item).title }}</p>
            <p class="timeline-text">{{ item.content }}</p>
            <small v-if="item.intensity !== undefined">此刻感受 {{ item.intensity }}/10</small>
          </div>
        </li>
      </ol>
      <p v-if="!updates.length" class="timeline-empty">第一条真实记录会在这里留下来。</p>
    </section>

    <section v-if="writingLater" class="later-block">
      <label>
        <span>写下后来呢</span>
        <textarea
          :value="later"
          maxlength="1000"
          placeholder="不需要完整，写下一点变化或这一步带来的感觉。"
          @input="emit('update:later', ($event.target as HTMLTextAreaElement).value)"
        />
      </label>
      <div class="later-foot">
        <small>{{ later.length }}/1000</small>
        <button :disabled="busy || !later.trim()" type="button" @click="emit('save-later')">保存</button>
      </div>
    </section>

    <section class="next-block">
      <h2>接下来</h2>
      <button class="next-row" type="button" :disabled="busy" @click="emit('action')">
        <span class="next-copy">
          <strong>查看当前行动</strong>
          <small>可以完成的一小步</small>
        </span>
        <span class="row-chevron" aria-hidden="true">›</span>
      </button>
      <button v-if="!writingLater" class="next-row" type="button" :disabled="busy" @click="writingLater = true">
        <span class="next-copy">
          <strong>写下后来呢</strong>
          <small>留下这一步带来的变化</small>
        </span>
        <span class="row-chevron" aria-hidden="true">›</span>
      </button>
      <button class="next-row" type="button" :disabled="busy" @click="emit('change-support')">
        <span class="next-copy">
          <strong>换一种支持</strong>
          <small>重新选择现在最需要的方式</small>
        </span>
        <span class="row-chevron" aria-hidden="true">›</span>
      </button>
    </section>
  </section>
</template>

<style scoped>
.timeline-screen {
  display: grid;
  gap: 18px;
}

.journey-head h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1.28;
  color: var(--gn-text, #242a32);
}

.journey-head p {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--gn-muted, #757d87);
}

.status-card {
  display: grid;
  gap: 6px;
  padding: 16px;
  border: 1px solid var(--gn-border, #e8ebef);
  border-radius: var(--gn-radius-card, 12px);
  background: var(--gn-card, #ffffff);
}

.status-chip {
  justify-self: start;
  padding: 3px 9px;
  border-radius: 6px;
  background: var(--gn-green-light, #eaf4ee);
  color: var(--gn-green-dark, #1e4d45);
  font-size: 11px;
}

.status-stage {
  font-size: 20px;
  color: var(--gn-text, #242a32);
}

.status-detail {
  margin: 0;
  font-size: 13px;
  color: var(--gn-subtext, #757d87);
}

.timeline-block h2,
.next-block h2 {
  margin: 0 0 10px;
  font-size: 15px;
  color: var(--gn-text, #242a32);
}

.timeline-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.timeline-row {
  position: relative;
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 10px;
  padding-bottom: 16px;
}

/* The connector runs between the marks; the last row keeps none so the line does not trail off. */
.timeline-row:not(:last-child)::before {
  content: '';
  position: absolute;
  top: 20px;
  bottom: 0;
  left: 12px;
  width: 1px;
  background: var(--gn-green-light, #eaf4ee);
}

.timeline-mark {
  z-index: 1;
  justify-self: center;
  width: 16px;
  height: 16px;
  margin-top: 3px;
  border: 2px solid var(--gn-green, #275f56);
  border-radius: 50%;
  background: var(--gn-bg, #ffffff);
}

.timeline-when {
  margin: 3px 0 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--gn-text, #242a32);
}

.timeline-text {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--gn-subtext, #757d87);
  white-space: pre-wrap;
  word-break: break-word;
}

.timeline-body small {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--gn-green-dark, #1e4d45);
}

.timeline-empty {
  margin: 0;
  font-size: 13px;
  color: var(--gn-muted, #757d87);
}

.later-block {
  display: grid;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--gn-border, #e8ebef);
  border-radius: var(--gn-radius-card, 12px);
  background: var(--gn-card, #ffffff);
}

.later-block label {
  display: grid;
  gap: 8px;
  font-size: 14px;
  color: var(--gn-text, #242a32);
}

.later-block textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 84px;
  padding: 10px 12px;
  border: 0;
  border-radius: 12px;
  background: var(--gn-paper-warm, #f7f8fa);
  color: var(--gn-text, #242a32);
  font: inherit;
  line-height: 1.55;
  resize: none;
}

.later-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--gn-muted, #757d87);
  font-size: 12px;
}

.later-foot button {
  min-height: 36px;
  padding: 0 18px;
  border: 0;
  border-radius: var(--gn-radius-small, 8px);
  background: var(--gn-leaf, #275f56);
  color: #ffffff;
  font: inherit;
  cursor: pointer;
}

.later-foot button:disabled {
  opacity: 0.5;
}

.next-block {
  display: grid;
  gap: 8px;
}

/* The design shows these as bare list rows — title, subtitle, chevron — not as bordered cards. */
.next-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 54px;
  padding: 10px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--gn-text, #242a32);
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.next-row + .next-row {
  border-top: 1px solid var(--gn-border, #e8ebef);
}

.next-row:disabled {
  opacity: 0.55;
}

.next-copy {
  display: grid;
  gap: 2px;
}

.next-copy strong {
  font-size: 15px;
  font-weight: 600;
}

.next-copy small {
  font-size: 12px;
  color: var(--gn-subtext, #757d87);
}

.row-chevron {
  color: #b6bcc4;
  font-size: 20px;
  flex-shrink: 0;
}
</style>
