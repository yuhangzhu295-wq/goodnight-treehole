<script setup lang="ts">
import type { SupportIntent } from '@goodnight/shared-types';
defineProps<{ busy?: boolean; intensity?: number }>();
const emit = defineEmits<{ choose: [intent: SupportIntent] }>();
const intents: Array<{ value: SupportIntent; icon: string; label: string; copy: string }> = [
  { value: 'JUST_LISTEN', icon: '◌', label: '只想有人听我说说', copy: '把心里的话说出来，慢慢被听见。' },
  { value: 'FIND_PEOPLE', icon: '◎', label: '想找经历过的人', copy: '想和相似的人交换一点后来。' },
  { value: 'SEE_OUTCOMES', icon: '◔', label: '想看看别人后来怎样', copy: '想知道别人是怎么走过来的。' },
  { value: 'NEXT_STEP', icon: '↗', label: '想知道下一步怎么办', copy: '想获得一份今晚可以做的事。' },
  { value: 'STOP_IMPULSE', icon: '✋', label: '想阻止自己做一件冲动的事', copy: '想先停一停，找到更安全的选择。' },
  { value: 'PREPARE_CONVERSATION', icon: '◍', label: '想准备一次现实沟通', copy: '想更好地表达自己，让沟通更顺利。' },
  { value: 'NOTHING_NOW', icon: '☾', label: '今天不想解决，只想缓一缓', copy: '想给自己一点时间，慢慢恢复能量。' },
  { value: 'HIGH_DISTRESS', icon: '☁', label: '我现在真的撑得很难', copy: '感觉很难熬，想要一份支持和陪伴。' },
];
</script>

<template>
  <section class="intent-card" data-testid="support-intent-picker">
    <p class="kicker">此刻的需要 <span v-if="intensity !== undefined">{{ intensity }}/10</span></p>
    <h2>你现在最需要什么？</h2>
    <p>不一定马上解决，先选最贴近你此刻的一种。</p>
    <div class="intent-grid"><button v-for="item in intents" :key="item.value" :disabled="busy" type="button" :data-testid="`intent-${item.value.toLowerCase()}`" @click="emit('choose', item.value)"><span aria-hidden="true">{{ item.icon }}</span><strong>{{ item.label }}</strong><small>{{ item.copy }}</small></button></div>
    <small class="hint">选哪个都没关系，之后还可以换。</small>
  </section>
</template>

<style scoped>
.intent-card{display:grid;gap:12px;padding:22px;border-radius:26px;background:rgba(255,252,245,.96);box-shadow:0 20px 42px rgba(11,22,34,.15)}.kicker{margin:0;color:#70815d;font-size:13px}.kicker span{float:right}.intent-card h2{margin:0;color:#233b2d;font-size:27px}.intent-card>p:not(.kicker){margin:-4px 0 4px;color:#71796f;font-size:14px;line-height:1.6}.intent-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.intent-grid button{display:grid;grid-template-columns:32px minmax(0,1fr);column-gap:8px;align-items:center;min-height:112px;border:1px solid rgba(95,127,62,.17);border-radius:16px;background:linear-gradient(145deg,#fffef9,#f6f2e5);padding:12px;color:#334834;text-align:left;font:inherit;cursor:pointer}.intent-grid button:hover{border-color:#769064}.intent-grid span{grid-row:span 2;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#eaf0df;color:#526f4a}.intent-grid strong{font-size:14px;line-height:1.35}.intent-grid small{color:#788078;font-size:12px;line-height:1.45}.hint{color:#7a8179;text-align:center}.intent-grid button:disabled{opacity:.6;cursor:wait}@media(max-width:350px){.intent-grid{grid-template-columns:1fr}.intent-grid button{min-height:86px}}
</style>
