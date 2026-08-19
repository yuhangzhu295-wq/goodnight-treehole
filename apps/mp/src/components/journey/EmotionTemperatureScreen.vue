<script setup lang="ts">
import { ref } from 'vue';
import AppIcon from '../icons/AppIcon.vue';
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
    <div class="temperature-sheet">
      <div class="section-heading"><AppIcon name="leaf" :size="20" /><span>情绪温度计</span></div>
      <div class="temperature-scale">
        <output><strong>{{ intensity }}</strong><span>/10</span></output>
        <div class="scale-numbers" aria-hidden="true"><span v-for="number in scale" :key="number">{{ number }}</span></div>
        <div class="scale-control">
          <div class="scale-dots" aria-hidden="true"><i v-for="number in scale" :key="number" :class="{ active: number <= intensity, current: number === intensity }" /></div>
          <input v-model.number="intensity" type="range" min="1" max="10" step="1" aria-label="情绪难受程度" />
        </div>
        <div class="scale-labels"><span>还能撑住</span><span>有点乱</span><span>很难受</span><span>快撑不住</span></div>
      </div>
      <div class="field-block"><div class="field-title"><AppIcon name="heart" :size="19" /><h2>身体感觉</h2></div><div class="symptom-list"><button v-for="option in options" :key="option" :class="{ selected: symptoms.includes(option) }" type="button" @click="toggle(option)">{{ option }}</button></div></div>
      <label class="thought-field"><span class="field-title"><AppIcon name="message" :size="19" /><strong>脑子里最吵的一句</strong></span><textarea v-model="thought" maxlength="160" placeholder="写一句就好，也可以留空。" /></label><p class="gentle-note"><AppIcon name="leaf" :size="18" />只要记录一下，就已经是在照顾自己。</p>
    </div>
    <div class="temperature-actions"><button class="continue-button" data-testid="temperature-continue" @click="emit('save', { intensity, symptoms, thought })">继续</button><button class="skip-button" type="button" @click="emit('skip')">今天先只记录</button></div>
  </section>
</template>

<style scoped>
:global(.journey-flow--temperature .journey-flow-hero) { min-height: 160px; }

.temperature-screen { display: grid; gap: 12px; }
.temperature-sheet { display: grid; gap: 10px; border: 1px solid rgba(102, 121, 85, .17); border-radius: 24px; background: rgba(255, 253, 247, .96); padding: 14px; box-shadow: 0 15px 32px rgba(20, 32, 27, .1); }
.section-heading, .field-title { display: flex; align-items: center; justify-content: flex-start; gap: 8px; color: #496944; }
.section-heading { font-size: 16px; font-weight: 700; }
.field-title h2 { margin: 0; font-size: 16px; }

.temperature-scale { display: grid; gap: 5px; padding: 0 2px; }
.temperature-scale output { justify-self: center; display: flex; align-items: baseline; gap: 2px; border-radius: 999px; background: #4e714e; padding: 5px 9px; color: #fff; line-height: 1; transform: translateY(-6px); }
.temperature-scale output strong { font-size: 21px; }
.temperature-scale output span { font-size: 12px; }
.scale-numbers, .scale-dots { display: grid; grid-template-columns: repeat(10, 1fr); gap: 2px; }
.scale-numbers { color: #999c93; font-size: 11px; text-align: center; }
.scale-control { position: relative; height: 16px; }
.scale-dots { position: absolute; inset: 5px 0 auto; z-index: 0; }
.scale-dots::before { position: absolute; top: 3px; right: 0; left: 0; height: 2px; background: #d8dccf; content: ''; }
.scale-dots i { position: relative; z-index: 1; width: 8px; height: 8px; justify-self: center; border: 1px solid #bdc2b7; border-radius: 50%; background: #fff; }
.scale-dots i.active { border-color: #638159; background: #638159; }
.scale-dots i.current { width: 14px; height: 14px; margin-top: -3px; box-shadow: 0 0 0 3px rgba(95, 127, 62, .14); }
.temperature-scale input { position: absolute; inset: 0; z-index: 2; width: 100%; height: 16px; margin: 0; opacity: 0; cursor: pointer; }
.scale-labels { display: grid; grid-template-columns: repeat(4, 1fr); color: #848980; font-size: 11px; }
.scale-labels span:nth-child(2), .scale-labels span:nth-child(3) { text-align: center; }
.scale-labels span:last-child { text-align: right; }

.field-block { display: grid; gap: 7px; margin-top: 14px; border: 1px solid rgba(95, 127, 62, .12); border-radius: 16px; background: rgba(255, 253, 248, .54); padding: 11px; }
.symptom-list { display: flex; flex-wrap: nowrap; gap: 5px; overflow: hidden; }
.symptom-list button { flex: 0 0 auto; min-height: 32px; border: 1px solid rgba(95, 127, 62, .2); border-radius: 999px; background: #fffdf8; padding: 5px 4px; color: #52684a; font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; }
.symptom-list button.selected { border-color: #587a52; background: #eaf0df; color: #345336; }
.thought-field { display: grid; gap: 6px; }
.thought-field strong { font-size: 15px; }
.thought-field textarea { min-height: 56px; border: 1px solid rgba(95, 127, 62, .18); border-radius: 15px; background: #fffdf8; padding: 10px; color: #28362c; font: inherit; line-height: 1.5; resize: none; }
.gentle-note { position: relative; display: flex; align-items: center; gap: 7px; min-height: 60px; margin: 0; overflow: hidden; border-radius: 15px; background: linear-gradient(90deg, #f5efe2, #e7ebdc); padding: 9px 108px 9px 12px; color: #64715e; font-size: 12px; line-height: 1.45; }
.gentle-note::after { position: absolute; right: 2px; bottom: -7px; width: 112px; height: 66px; background: url('../../assets/goodnight/illustrations/temperature-bench-scene.png') right bottom / contain no-repeat; content: ''; opacity: .62; pointer-events: none; mix-blend-mode: multiply; }
.gentle-note > * { position: relative; z-index: 1; }

.temperature-actions { display: grid; gap: 6px; padding: 0 10px; }
.continue-button, .skip-button { border-radius: 999px; padding: 7px 10px; font: inherit; cursor: pointer; }
.continue-button { min-height: 40px; border: 0; background: #416a50; color: #fff; box-shadow: 0 11px 20px rgba(44, 83, 58, .18); }
.skip-button { min-height: 34px; border: 1px solid rgba(95, 127, 62, .28); background: rgba(255, 253, 247, .7); color: #4e673f; }
</style>
