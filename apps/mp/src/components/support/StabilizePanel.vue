<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../api';

const props = defineProps<{ journeyId: string }>();
const router = useRouter();
const seconds = ref(0);
const note = ref('');
const status = ref('');
const busy = ref(false);
let timer: number | undefined;

function stopTimer() { if (timer) window.clearInterval(timer); timer = undefined; }
async function beginBreathing() {
  if (seconds.value) return;
  seconds.value = 30; status.value = '跟着节奏慢慢呼吸就好。';
  timer = window.setInterval(async () => {
    seconds.value -= 1;
    if (seconds.value <= 0) { stopTimer(); await api.post(`/api/v1/journeys/${props.journeyId}/updates`, { kind: 'stabilize_breath', content: '我完成了一轮 30 秒呼吸。' }); status.value = '这一轮已经完成了。'; }
  }, 1000);
}
async function pauseImpulse() {
  busy.value = true;
  try { await api.post('/api/v1/cooldowns', { title: '先把想做的事情放一下', reason: '来自稳定支持，给自己留出一点缓冲。', hours: 24 }); status.value = '这件事已经被放进冷静箱，明天再看也来得及。'; } finally { busy.value = false; }
}
async function saveNote() {
  if (!note.value.trim()) return;
  busy.value = true;
  try { await api.post(`/api/v1/journeys/${props.journeyId}/updates`, { kind: 'stabilize_note', content: note.value.trim() }); note.value = ''; status.value = '这句话已经留在你的时间线里。'; } finally { busy.value = false; }
}
onBeforeUnmount(stopTimer);
</script>

<template>
  <section class="stabilize-card" data-testid="stabilize-panel">
    <header><p>先不用解决</p><h2>我先接住你</h2><span aria-hidden="true">☾</span></header>
    <div class="warm-copy"><strong>我想对你说</strong><p>你现在真的很难受，这种难受值得被认真对待。我们先不着急做决定，先一起让身体慢一点。</p></div>
    <button class="support-row" data-testid="stabilize-breath" @click="beginBreathing"><span>≈</span><div><strong>跟我呼吸30秒</strong><small>{{ seconds ? `还剩 ${seconds} 秒` : '慢慢吸气，跟着节奏，把呼吸带回来。' }}</small></div><b>›</b></button>
    <button class="support-row" :disabled="busy" data-testid="stabilize-pause" @click="pauseImpulse"><span>⌂</span><div><strong>先把想做的事情放一下</strong><small>给大脑降降温，稍晚再决定。</small></div><b>›</b></button>
    <label class="write-row"><span>✎</span><div><strong>写一句也可以</strong><input v-model="note" maxlength="300" placeholder="比如，你想说点什么呢……" @keyup.enter="saveNote" /></div><button :disabled="busy || !note.trim()" @click="saveNote">留下</button></label>
    <p v-if="status" class="status" role="status">{{ status }}</p>
    <button class="handoff-button" @click="router.push(`/pages/reality-handoff/index?journeyId=${journeyId}`)">帮我告诉现实中的一个人</button>
    <button class="change-support" @click="router.push(`/pages/journey/detail?id=${journeyId}&mode=intent`)">换一种支持</button>
  </section>
</template>

<style scoped>
.stabilize-card{display:grid;gap:12px;padding:22px;border-radius:26px;background:rgba(255,252,245,.96);box-shadow:0 20px 42px rgba(11,22,34,.15)}.stabilize-card header{position:relative}.stabilize-card header p{margin:0;color:#70805f;font-size:13px}.stabilize-card header h2{margin:4px 0 0;color:#233a2d;font-size:29px}.stabilize-card header span{position:absolute;right:0;top:2px;color:#6d8255;font-size:30px}.warm-copy{padding:16px;border-radius:17px;background:linear-gradient(135deg,#fbf7e8,#f0ead9)}.warm-copy strong{color:#547049}.warm-copy p{margin:7px 0 0;color:#626b61;line-height:1.65}.support-row,.write-row{display:grid;grid-template-columns:42px minmax(0,1fr) 20px;gap:10px;align-items:center;width:100%;border:1px solid rgba(95,127,62,.16);border-radius:17px;background:#fffdf8;padding:13px;color:#2f4532;text-align:left;font:inherit;cursor:pointer}.support-row>span,.write-row>span{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:#e8efdf;color:#547049;font-size:22px}.support-row strong,.support-row small,.write-row strong{display:block}.support-row small{margin-top:4px;color:#788078;font-size:12px;line-height:1.45}.support-row b{color:#6b7d62;font-size:21px}.write-row{grid-template-columns:42px minmax(0,1fr) auto}.write-row input{width:100%;margin-top:7px;border:1px solid rgba(95,127,62,.18);border-radius:9px;background:#fffefa;padding:7px 8px;color:#324633;font:inherit}.write-row button{border:0;border-radius:10px;background:#5b7c54;padding:8px 10px;color:#fff;font:inherit;cursor:pointer}.status{margin:0;border-radius:12px;background:#eef3e7;padding:10px;color:#506a46;font-size:13px}.handoff-button{min-height:48px;border:0;border-radius:15px;background:#496d49;color:#fff;font:inherit;cursor:pointer}.change-support{min-height:40px;border:0;background:transparent;color:#58734d;font:inherit;cursor:pointer}
</style>
