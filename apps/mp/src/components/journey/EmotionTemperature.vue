<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{ save: [payload: { intensity: number; symptoms: string[]; thought: string }]; skip: [] }>();
const intensity = ref(5);
const thought = ref('');
const symptoms = ref<string[]>([]);
const options = ['胸口闷', '睡不着', '胃很紧', '想哭', '发抖', '脑子停不下来'];

function toggle(option: string) {
  symptoms.value = symptoms.value.includes(option) ? symptoms.value.filter((item) => item !== option) : [...symptoms.value, option];
}
</script>

<template>
  <section class="temperature-card" data-testid="emotion-temperature">
    <p class="kicker">情绪温度计</p>
    <h2>今晚现在有多难受？</h2>
    <p class="subcopy">先不分析，只感受一下此刻。</p>
    <div class="scale-wrap"><output>{{ intensity }}/10</output><input v-model.number="intensity" type="range" min="0" max="10" step="1" aria-label="情绪难受程度" /><div class="scale-labels"><span>还能够撑住</span><span>有点乱</span><span>很难受</span><span>快撑不住</span></div></div>
    <div class="field-group"><h3>身体感觉</h3><div class="symptom-list"><button v-for="option in options" :key="option" :class="{ selected: symptoms.includes(option) }" type="button" @click="toggle(option)">{{ option }}</button></div></div>
    <label class="thought-field"><span>脑子里最吵的一句</span><textarea v-model="thought" maxlength="160" placeholder="写一句就好，也可以留空。" /></label>
    <p class="gentle-note">只要记录一下，就已经是在照顾自己。</p>
    <button class="continue-button" data-testid="temperature-continue" @click="emit('save', { intensity, symptoms, thought })">继续</button>
    <button class="skip-button" type="button" @click="emit('skip')">今天先只记录</button>
  </section>
</template>

<style scoped>
.temperature-card{display:grid;gap:15px;padding:23px;border-radius:26px;background:rgba(255,252,245,.96);box-shadow:0 20px 42px rgba(11,22,34,.15)}.kicker{margin:0;color:#71825e;font-size:13px}.temperature-card h2{margin:0;color:#243b2c;font-size:27px}.subcopy{margin:-7px 0 0;color:#7a8178;font-size:14px}.scale-wrap{position:relative;display:grid;gap:10px;padding:17px 0 0}.scale-wrap output{justify-self:center;padding:7px 10px;border-radius:999px;background:#4e6f4d;color:#fff;font-weight:700}.scale-wrap input{width:100%;accent-color:#587b54}.scale-labels{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;color:#81887f;font-size:11px;text-align:center}.field-group{display:grid;gap:9px;padding:15px;border-radius:18px;border:1px solid rgba(95,127,62,.14);background:#fffdf8}.field-group h3,.thought-field span{margin:0;color:#455e3d;font-size:15px}.symptom-list{display:flex;flex-wrap:wrap;gap:8px}.symptom-list button{min-height:36px;border:1px solid rgba(95,127,62,.2);border-radius:999px;background:#fffdf8;padding:7px 12px;color:#52684a;font:inherit;cursor:pointer}.symptom-list button.selected{border-color:#587a52;background:#eaf0df;color:#345336}.thought-field{display:grid;gap:8px;color:#455e3d;font-size:15px}.thought-field textarea{min-height:82px;border:1px solid rgba(95,127,62,.18);border-radius:15px;background:#fffdf8;padding:12px;color:#28362c;font:inherit;line-height:1.6;resize:none}.gentle-note{margin:0;border-radius:14px;background:#f2eee0;padding:12px;color:#64715e;font-size:13px;line-height:1.5}.continue-button,.skip-button{min-height:49px;border-radius:15px;padding:10px;font:inherit;cursor:pointer}.continue-button{border:0;background:#486c48;color:#fff}.skip-button{border:1px solid rgba(95,127,62,.24);background:transparent;color:#4e673f}
</style>
