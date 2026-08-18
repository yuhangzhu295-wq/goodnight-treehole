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
      <div class="temperature-scale"><output><strong>{{ intensity }}</strong><span>/10</span></output><div class="scale-numbers" aria-hidden="true"><span v-for="number in scale" :key="number" :class="{ active: number <= intensity, current: number === intensity }">{{ number }}</span></div><input v-model.number="intensity" type="range" min="1" max="10" step="1" aria-label="情绪难受程度" /><div class="scale-labels"><span>还能撑住</span><span>有点乱</span><span>很难受</span><span>快撑不住</span></div></div>
      <div class="field-block"><div class="field-title"><AppIcon name="heart" :size="19" /><h2>身体感觉</h2></div><div class="symptom-list"><button v-for="option in options" :key="option" :class="{ selected: symptoms.includes(option) }" type="button" @click="toggle(option)">{{ option }}</button></div></div>
      <label class="thought-field"><span class="field-title"><AppIcon name="message" :size="19" /><strong>脑子里最吵的一句</strong></span><textarea v-model="thought" maxlength="160" placeholder="写一句就好，也可以留空。" /></label><p class="gentle-note"><AppIcon name="leaf" :size="18" />只要记录一下，就已经是在照顾自己。</p>
    </div>
    <div class="temperature-actions"><button class="continue-button" data-testid="temperature-continue" @click="emit('save', { intensity, symptoms, thought })">继续</button><button class="skip-button" type="button" @click="emit('skip')">今天先只记录</button></div>
  </section>
</template>

<style scoped>
.temperature-screen{display:grid;gap:14px}.temperature-sheet{display:grid;gap:20px;border:1px solid rgba(102,121,85,.17);border-radius:24px;background:rgba(255,253,247,.96);padding:22px 18px;box-shadow:0 15px 32px rgba(20,32,27,.1)}.section-heading,.field-title{display:flex;align-items:center;gap:8px;color:#496944}.section-heading{font-size:16px;font-weight:700}.field-title h2{margin:0;font-size:16px}.temperature-scale{display:grid;gap:10px;padding:0 2px}.temperature-scale output{justify-self:center;display:flex;align-items:baseline;gap:2px;border-radius:999px;background:#4e714e;padding:7px 12px;color:#fff;line-height:1}.temperature-scale output strong{font-size:25px}.temperature-scale output span{font-size:13px}.scale-numbers{display:grid;grid-template-columns:repeat(10,1fr);gap:2px;color:#999c93;font-size:12px;text-align:center}.scale-numbers span{position:relative;padding-bottom:12px}.scale-numbers span::after{position:absolute;bottom:0;left:50%;width:8px;height:8px;border:1px solid #bdc2b7;border-radius:50%;background:#fff;content:'';transform:translateX(-50%)}.scale-numbers span.active{color:#5e7b59}.scale-numbers span.active::after{border-color:#638159;background:#638159}.scale-numbers span.current::after{width:13px;height:13px;bottom:-2px;box-shadow:0 0 0 3px rgba(95,127,62,.14)}.temperature-scale input{width:100%;height:4px;margin:0;accent-color:#5f7f3e;cursor:pointer}.scale-labels{display:grid;grid-template-columns:repeat(4,1fr);color:#848980;font-size:11px}.scale-labels span:nth-child(2),.scale-labels span:nth-child(3){text-align:center}.scale-labels span:last-child{text-align:right}.field-block{display:grid;gap:11px;padding-top:17px;border-top:1px solid rgba(95,127,62,.13)}.symptom-list{display:flex;flex-wrap:wrap;gap:8px}.symptom-list button{min-height:35px;border:1px solid rgba(95,127,62,.2);border-radius:999px;background:#fffdf8;padding:6px 11px;color:#52684a;font:inherit;cursor:pointer}.symptom-list button.selected{border-color:#587a52;background:#eaf0df;color:#345336}.thought-field{display:grid;gap:10px}.thought-field strong{font-size:16px}.thought-field textarea{min-height:91px;border:1px solid rgba(95,127,62,.18);border-radius:15px;background:#fffdf8;padding:12px;color:#28362c;font:inherit;line-height:1.6;resize:none}.gentle-note{display:flex;align-items:center;gap:7px;margin:0;border-radius:15px;background:linear-gradient(90deg,#f5efe2,#e7ebdc);padding:12px;color:#64715e;font-size:13px;line-height:1.5}.temperature-actions{display:grid;gap:8px;padding:0 12px}.continue-button,.skip-button{min-height:48px;border-radius:999px;padding:10px;font:inherit;cursor:pointer}.continue-button{border:0;background:#416a50;color:#fff;box-shadow:0 11px 20px rgba(44,83,58,.18)}.skip-button{border:1px solid rgba(95,127,62,.28);background:rgba(255,253,247,.7);color:#4e673f}
</style>
