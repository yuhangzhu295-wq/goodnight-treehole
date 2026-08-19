<script setup lang="ts">
import type { SupportIntent } from '@goodnight/shared-types';
import AppIcon from '../icons/AppIcon.vue';
import intentDistress from '../../assets/goodnight/illustrations/intent-distress.png';
import intentListen from '../../assets/goodnight/illustrations/intent-listen.png';
import intentNextStep from '../../assets/goodnight/illustrations/intent-next-step.png';
import intentOutcomes from '../../assets/goodnight/illustrations/intent-outcomes.png';
import intentPause from '../../assets/goodnight/illustrations/intent-pause.png';
import intentPeople from '../../assets/goodnight/illustrations/intent-people.png';
import intentPrepare from '../../assets/goodnight/illustrations/intent-prepare.png';
import intentRest from '../../assets/goodnight/illustrations/intent-rest.png';
defineProps<{ busy?: boolean; intensity?: number }>();
const emit = defineEmits<{ choose: [intent: SupportIntent] }>();
const intents: Array<{ value: SupportIntent; icon: string; art: string; label: string; copy: string }> = [
  { value: 'JUST_LISTEN', icon: 'message', art: intentListen, label: '只想有人听我说说', copy: '把心里的话说出来。' }, { value: 'FIND_PEOPLE', icon: 'people', art: intentPeople, label: '想找经历过的人', copy: '想和相似的人交换一点后来。' }, { value: 'SEE_OUTCOMES', icon: 'journey', art: intentOutcomes, label: '想看看别人后来怎样', copy: '想知道别人怎么走过来。' }, { value: 'NEXT_STEP', icon: 'path', art: intentNextStep, label: '想知道下一步怎么办', copy: '先找到今晚做得完的一步。' }, { value: 'STOP_IMPULSE', icon: 'pause', art: intentPause, label: '想阻止自己做一件冲动的事', copy: '先停一停，找到更安全的选择。' }, { value: 'PREPARE_CONVERSATION', icon: 'people', art: intentPrepare, label: '想准备一次现实沟通', copy: '把想说的话慢慢整理好。' }, { value: 'NOTHING_NOW', icon: 'moon', art: intentRest, label: '今天不想解决，只想缓一缓', copy: '给自己一点时间慢慢恢复。' }, { value: 'HIGH_DISTRESS', icon: 'rain', art: intentDistress, label: '我现在真的撑得很难', copy: '先接上一份现实里的支持。' },
];
</script>

<template>
  <section class="intent-screen" data-testid="support-intent-picker"><div class="intent-paper"><p class="intent-label">此刻的需要</p><div class="intent-grid"><button v-for="item in intents" :key="item.value" :disabled="busy" type="button" :data-testid="`intent-${item.value.toLowerCase()}`" @click="emit('choose', item.value)"><span class="intent-icon"><img :src="item.art" alt="" /></span><strong>{{ item.label }}</strong><small>{{ item.copy }}</small></button></div><p class="intent-hint"><AppIcon name="leaf" :size="17" />选哪个都没关系，之后还可以换。</p></div></section>
</template>

<style scoped>
:global(.journey-flow--intent .journey-flow-hero) {
  min-height: 163px;
  padding: 24px 22px 12px;
  background: linear-gradient(145deg, #eee5cf 0%, #f4e9d3 58%, #ded0b7 100%);
  color: #385b3d;
}

:global(.journey-flow--intent .journey-flow-hero::before) { opacity: .16; }
:global(.journey-flow--intent .journey-flow-hero::after) {
  top: 0;
  right: 0;
  width: 210px;
  height: 108px;
  background: url('../../assets/goodnight/illustrations/intent-hero-foliage.png') right top / cover no-repeat;
  opacity: .82;
  filter: none;
  mask-image: linear-gradient(90deg, transparent 0%, #000 48%);
  -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 48%);
}

:global(.journey-flow--intent .hero-brand), :global(.journey-flow--intent .hero-subtitle) { color: rgba(56, 91, 61, .76); }
:global(.journey-flow--intent .journey-flow-hero h1) { color: #385b3d; font-size: 28px; }
:global(.journey-flow--intent .back-control) { border-color: rgba(56, 91, 61, .2); background: rgba(255, 253, 247, .48); color: #385b3d; }
:global(.journey-flow--intent .journey-flow-main) { justify-self: center; width: calc(100% - 12px); margin-top: -8px; }

.intent-screen { display: grid; }
.intent-paper { display: grid; gap: 13px; border: 1px solid rgba(102, 121, 85, .17); border-radius: 24px; background: rgba(255, 253, 247, .96); padding: 16px 13px; box-shadow: 0 15px 32px rgba(20, 32, 27, .1); }
.intent-label { margin: 0 5px; color: #4b6946; font-size: 16px; font-weight: 700; }
.intent-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.intent-grid button { position: relative; display: grid; grid-template-columns: 52px minmax(0, 1fr); column-gap: 8px; align-content: center; min-height: 91px; border: 1px solid rgba(95, 127, 62, .16); border-radius: 16px; background: linear-gradient(145deg, #fffef9, #f7f3e7); padding: 9px; color: #334834; text-align: left; font: inherit; cursor: pointer; }
.intent-grid button:hover, .intent-grid button:focus-visible { border-color: #769064; background: #fbf8ed; box-shadow: 0 0 0 2px rgba(95, 127, 62, .12); }
.intent-grid button:focus-visible { outline: 0; }
.intent-grid button:disabled { opacity: .6; cursor: wait; }
.intent-icon { grid-row: span 2; display: grid; place-items: center; width: 50px; height: 50px; overflow: hidden; border-radius: 50%; background: #e8eedc; color: #59754f; }
.intent-icon img { width: 50px; height: 50px; object-fit: contain; mix-blend-mode: multiply; pointer-events: none; }
.intent-grid strong { align-self: end; font-size: 13px; line-height: 1.34; }
.intent-grid small { align-self: start; margin-top: 3px; color: #758076; font-size: 11px; line-height: 1.36; }
.intent-hint { display: flex; align-items: center; justify-content: center; gap: 5px; margin: 0; color: #788078; font-size: 12px; }

@media (max-width: 350px) {
  .intent-grid { grid-template-columns: 1fr; }
  .intent-grid button { min-height: 79px; }
}
</style>
