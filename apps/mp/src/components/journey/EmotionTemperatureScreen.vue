<script setup lang="ts">
import { ref } from 'vue';
import AppIcon from '../icons/AppIcon.vue';
defineProps<{ heading?: string; subheading?: string }>();
const emit = defineEmits<{ save: [payload: { intensity: number; symptoms: string[]; thought: string }]; skip: [] }>();
const intensity = ref(5);
const thought = ref('');
const symptoms = ref<string[]>([]);
const options = ['胸口闷', '睡不着', '胃很紧', '想哭', '发抖', '脑子停不下来'];
const scale = Array.from({ length: 10 }, (_, index) => index + 1);
function toggle(option: string) { symptoms.value = symptoms.value.includes(option) ? symptoms.value.filter((item) => item !== option) : [...symptoms.value, option]; }
</script>

<template>
  <section class="temperature-screen" data-testid="emotion-temperature">
    <header v-if="heading" class="step-head">
      <h2>{{ heading }}</h2>
      <p v-if="subheading">{{ subheading }}</p>
    </header>

    <div class="temperature-sheet">
      <div class="section-heading"><AppIcon name="leaf" :size="18" /><span>情绪温度计</span></div>
      <div class="temperature-scale">
        <output><strong>{{ intensity }}</strong><span>/10</span></output>
        <div class="scale-numbers" aria-hidden="true"><span v-for="number in scale" :key="number">{{ number }}</span></div>
        <div class="scale-control">
          <div class="scale-dots" aria-hidden="true"><i v-for="number in scale" :key="number" :class="{ active: number <= intensity, current: number === intensity }" /></div>
          <input v-model.number="intensity" type="range" min="1" max="10" step="1" aria-label="情绪难受程度" />
        </div>
        <div class="scale-labels"><span>还能撑住</span><span>有点乱</span><span>很难受</span><span>快撑不住</span></div>
      </div>
      <div class="field-block"><div class="field-title"><AppIcon name="heart" :size="18" /><h3>身体感觉</h3></div><div class="symptom-list"><button v-for="option in options" :key="option" :class="{ selected: symptoms.includes(option) }" type="button" @click="toggle(option)">{{ option }}</button></div></div>
      <label class="thought-field"><span class="field-title"><AppIcon name="message" :size="18" /><strong>脑子里最吵的一句</strong></span><textarea v-model="thought" maxlength="160" placeholder="写一句就好，也可以留空。" /></label>
      <p class="gentle-note"><AppIcon name="leaf" :size="17" />只要记录一下，就已经是在照顾自己。</p>
    </div>
    <div class="temperature-actions"><button class="continue-button" data-testid="temperature-continue" @click="emit('save', { intensity, symptoms, thought })">继续</button><button class="skip-button" type="button" @click="emit('skip')">今天先只记录</button></div>
  </section>
</template>

<style scoped>
.temperature-screen { display: grid; gap: 14px; }

.step-head h2 { margin: 0; font-size: 22px; line-height: 1.3; color: var(--gn-text, #242a32); }
.step-head p { margin: 6px 0 0; font-size: 13px; color: var(--gn-subtext, #757d87); }

.temperature-sheet { display: grid; gap: 12px; border: 1px solid var(--gn-border, #e8ebef); border-radius: var(--gn-radius-card, 12px); background: var(--gn-card, #ffffff); padding: 16px; }
/* `justify-content` is set explicitly: the global .section-heading rule pushes its two children
   apart, which split the icon from the label until this rule claimed the property. */
.section-heading, .field-title { display: flex; align-items: center; justify-content: flex-start; gap: 8px; color: var(--gn-green-dark, #1e4d45); }
.section-heading { font-size: 15px; font-weight: 600; }
.field-title h3 { margin: 0; font-size: 15px; }

.temperature-scale { display: grid; gap: 6px; }
.temperature-scale output { justify-self: center; display: flex; align-items: baseline; gap: 2px; border-radius: 999px; background: var(--gn-leaf, #275f56); padding: 5px 10px; color: #ffffff; line-height: 1; }
.temperature-scale output strong { font-size: 20px; }
.temperature-scale output span { font-size: 12px; }
.scale-numbers, .scale-dots { display: grid; grid-template-columns: repeat(10, 1fr); gap: 2px; }
.scale-numbers { color: var(--gn-muted, #757d87); font-size: 11px; text-align: center; }
.scale-control { position: relative; height: 16px; }
.scale-dots { position: absolute; inset: 5px 0 auto; z-index: 0; }
.scale-dots::before { position: absolute; top: 3px; right: 0; left: 0; height: 2px; background: var(--gn-line, #e8ebef); content: ''; }
.scale-dots i { position: relative; z-index: 1; width: 8px; height: 8px; justify-self: center; border: 1px solid var(--gn-border, #e8ebef); border-radius: 50%; background: #ffffff; }
.scale-dots i.active { border-color: var(--gn-leaf, #275f56); background: var(--gn-leaf, #275f56); }
.scale-dots i.current { width: 14px; height: 14px; margin-top: -3px; box-shadow: 0 0 0 3px var(--gn-green-light, #eaf4ee); }
.temperature-scale input { position: absolute; inset: 0; z-index: 2; width: 100%; height: 16px; margin: 0; opacity: 0; cursor: pointer; }
.scale-labels { display: grid; grid-template-columns: repeat(4, 1fr); color: var(--gn-muted, #757d87); font-size: 11px; }
.scale-labels span:nth-child(2), .scale-labels span:nth-child(3) { text-align: center; }
.scale-labels span:last-child { text-align: right; }

.field-block { display: grid; gap: 8px; padding-top: 12px; border-top: 1px solid var(--gn-border, #e8ebef); }
/* Wraps instead of hiding the overflow, so no symptom option becomes unreachable. */
.symptom-list { display: flex; flex-wrap: wrap; gap: 6px; }
.symptom-list button { flex: 0 0 auto; min-height: 32px; padding: 5px 11px; border: 1px solid var(--gn-border, #e8ebef); border-radius: 999px; background: var(--gn-card, #ffffff); color: var(--gn-text, #242a32); font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; }
.symptom-list button.selected { border-color: var(--gn-leaf, #275f56); background: var(--gn-green-light, #eaf4ee); color: var(--gn-green-dark, #1e4d45); }
.thought-field { display: grid; gap: 6px; }
.thought-field strong { font-size: 15px; color: var(--gn-text, #242a32); }
.thought-field textarea { box-sizing: border-box; min-height: 56px; padding: 10px 12px; border: 0; border-radius: 12px; background: var(--gn-paper-warm, #f7f8fa); color: var(--gn-text, #242a32); font: inherit; line-height: 1.5; resize: none; }
.gentle-note { display: flex; align-items: center; gap: 7px; margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--gn-paper-warm, #f7f8fa); color: var(--gn-subtext, #757d87); font-size: 12px; line-height: 1.45; }

.temperature-actions { display: grid; gap: 8px; }
.continue-button, .skip-button { border-radius: var(--gn-radius-small, 8px); font: inherit; cursor: pointer; }
.continue-button { min-height: 44px; border: 0; background: var(--gn-leaf, #275f56); color: #ffffff; }
.skip-button { min-height: 40px; border: 1px solid var(--gn-border, #e8ebef); background: var(--gn-card, #ffffff); color: var(--gn-text, #242a32); }
</style>
