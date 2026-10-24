<script setup lang="ts">
import type { SupportIntent } from '@goodnight/shared-types';
import AppIcon from '../icons/AppIcon.vue';
defineProps<{ busy?: boolean; intensity?: number; heading?: string; subheading?: string }>();
const emit = defineEmits<{ choose: [intent: SupportIntent] }>();
const intents: Array<{ value: SupportIntent; icon: string; label: string; copy: string }> = [
  { value: 'JUST_LISTEN', icon: 'message', label: '只想有人听我说说', copy: '把心里的话说出来。' }, { value: 'FIND_PEOPLE', icon: 'people', label: '想找经历过的人', copy: '想和相似的人交换一点后来。' }, { value: 'SEE_OUTCOMES', icon: 'journey', label: '想看看别人后来怎样', copy: '想知道别人怎么走过来。' }, { value: 'NEXT_STEP', icon: 'path', label: '想知道下一步怎么办', copy: '先找到今晚做得完的一步。' }, { value: 'STOP_IMPULSE', icon: 'pause', label: '想阻止自己做一件冲动的事', copy: '先停一停，找到更安全的选择。' }, { value: 'PREPARE_CONVERSATION', icon: 'people', label: '想准备一次现实沟通', copy: '把想说的话慢慢整理好。' }, { value: 'NOTHING_NOW', icon: 'moon', label: '今天不想解决，只想缓一缓', copy: '给自己一点时间慢慢恢复。' }, { value: 'HIGH_DISTRESS', icon: 'rain', label: '我现在真的撑得很难', copy: '先接上一份现实里的支持。' },
];
</script>

<template>
  <section class="intent-screen" data-testid="support-intent-picker">
    <header v-if="heading" class="step-head">
      <h2>{{ heading }}</h2>
      <p v-if="subheading">{{ subheading }}</p>
    </header>
    <div class="intent-paper">
      <p class="intent-label">此刻的需要</p>
      <div class="intent-grid">
        <button v-for="item in intents" :key="item.value" :disabled="busy" type="button" :data-testid="`intent-${item.value.toLowerCase()}`" @click="emit('choose', item.value)">
          <span class="intent-icon"><AppIcon :name="item.icon" :size="20" /></span>
          <strong>{{ item.label }}</strong>
          <small>{{ item.copy }}</small>
        </button>
      </div>
      <p class="intent-hint"><AppIcon name="leaf" :size="17" />选哪个都没关系，之后还可以换。</p>
    </div>
  </section>
</template>

<style scoped>
.intent-screen { display: grid; gap: 14px; }

.step-head h2 { margin: 0; font-size: 22px; line-height: 1.3; color: var(--gn-text, #242a32); }
.step-head p { margin: 6px 0 0; font-size: 13px; color: var(--gn-subtext, #757d87); }

.intent-paper { display: grid; gap: 12px; }
.intent-label { margin: 0; color: var(--gn-text, #242a32); font-size: 15px; font-weight: 600; }
.intent-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.intent-grid button { display: grid; justify-items: start; gap: 6px; min-height: 96px; padding: 12px; border: 1px solid var(--gn-border, #e8ebef); border-radius: var(--gn-radius-card, 12px); background: var(--gn-card, #ffffff); color: var(--gn-text, #242a32); text-align: left; font: inherit; cursor: pointer; }
.intent-grid button:hover, .intent-grid button:focus-visible { border-color: var(--gn-leaf, #275f56); }
.intent-grid button:focus-visible { outline: 2px solid var(--gn-green-light, #eaf4ee); outline-offset: 2px; }
.intent-grid button:disabled { opacity: .55; cursor: wait; }
.intent-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--gn-green-light, #eaf4ee); color: var(--gn-green-dark, #1e4d45); }
.intent-grid strong { font-size: 13px; line-height: 1.34; }
.intent-grid small { color: var(--gn-subtext, #757d87); font-size: 11px; line-height: 1.36; }
.intent-hint { display: flex; align-items: center; justify-content: center; gap: 5px; margin: 0; color: var(--gn-muted, #757d87); font-size: 12px; }

@media (max-width: 350px) {
  .intent-grid { grid-template-columns: 1fr; }
  .intent-grid button { min-height: 84px; }
}
</style>
