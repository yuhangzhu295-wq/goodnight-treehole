<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../api';
import AppIcon from '../icons/AppIcon.vue';

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
    if (seconds.value <= 0) { stopTimer(); try { await api.post(`/api/v1/journeys/${props.journeyId}/updates`, { kind: 'stabilize_breath', content: '我完成了一轮 30 秒呼吸。' }); status.value = '这一轮已经完成了。'; } catch { status.value = '这轮呼吸完成了，记录会在网络恢复后再试。'; } }
  }, 1000);
}
async function pauseImpulse() { busy.value = true; try { await api.post('/api/v1/cooldowns', { title: '先把想做的事情放一下', reason: '来自稳定支持，给自己留出一点缓冲。', hours: 24 }); status.value = '这件事已经放进冷静箱，明天再看也来得及。'; } catch { status.value = '暂时没能放进冷静箱，请稍后再试。'; } finally { busy.value = false; } }
async function saveNote() { if (!note.value.trim()) return; busy.value = true; try { await api.post(`/api/v1/journeys/${props.journeyId}/updates`, { kind: 'stabilize_note', content: note.value.trim() }); note.value = ''; status.value = '这句话已经留在你的时间线里。'; } catch { status.value = '暂时没能保存这句话，请稍后再试。'; } finally { busy.value = false; } }
onBeforeUnmount(stopTimer);
</script>

<template>
  <section class="stabilize-screen" data-testid="stabilize-panel">
    <div class="comfort-note"><span class="comfort-mark"><AppIcon name="leaf" /></span><div><p>我想对你说</p><strong>今晚先不用解决。<br>我们先让这一刻轻一点。</strong></div></div>
    <div class="stabilize-options">
      <button class="support-option" data-testid="stabilize-breath" @click="beginBreathing"><span class="support-icon"><AppIcon name="breath" /></span><span><strong>跟我呼吸30秒</strong><small>{{ seconds ? `还剩 ${seconds} 秒` : '慢慢吸气，跟着节奏，把呼吸带回来。' }}</small></span><AppIcon name="arrow" :size="18" /></button>
      <button class="support-option" :disabled="busy" data-testid="stabilize-pause" @click="pauseImpulse"><span class="support-icon"><AppIcon name="pause" /></span><span><strong>先把想做的事情放一下</strong><small>给大脑降降温，稍晚再决定。</small></span><AppIcon name="arrow" :size="18" /></button>
      <label class="write-option"><span class="support-icon"><AppIcon name="pen" /></span><span><strong>写一句也可以</strong><input v-model="note" maxlength="300" placeholder="比如，你想说点什么呢……" @keyup.enter="saveNote" /></span><button :disabled="busy || !note.trim()" @click="saveNote">留下</button></label>
    </div>
    <p v-if="status" class="status" role="status">{{ status }}</p>
    <div class="handoff-note"><AppIcon name="heart" :size="21" /><p>如果你愿意，我也可以帮你把想说的一句话，发给现实中的人。</p></div>
    <div class="stabilize-actions"><button class="handoff-button" @click="router.push(`/pages/reality-handoff/index?journeyId=${journeyId}`)">帮我告诉现实中的一个人</button><button class="change-support" @click="router.push(`/pages/journey/detail?id=${journeyId}&mode=intent`)">换一种支持</button></div>
  </section>
</template>

<style scoped>
.stabilize-screen{display:grid;gap:10px}.comfort-note{display:grid;grid-template-columns:42px minmax(0,1fr);gap:12px;align-items:center;border:1px solid rgba(102,121,85,.15);border-radius:22px;background:linear-gradient(145deg,#fffdf7,#f2ecdf);padding:15px 16px;box-shadow:0 12px 25px rgba(20,32,27,.08)}.comfort-mark,.support-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:#e8eedf;color:#54734e}.comfort-note p{margin:0 0 4px;color:#798275;font-size:12px}.comfort-note strong{color:#3d573d;font-size:16px;line-height:1.45}.stabilize-options{display:grid;gap:8px}.support-option,.write-option{display:grid;grid-template-columns:42px minmax(0,1fr) 20px;gap:10px;align-items:center;width:100%;min-height:68px;border:1px solid rgba(95,127,62,.15);border-radius:18px;background:rgba(255,253,247,.96);padding:10px 12px;color:#40573e;text-align:left;font:inherit;box-shadow:0 7px 16px rgba(44,58,42,.05);cursor:pointer}.support-option>span:nth-child(2),.write-option>span:nth-child(2){min-width:0}.support-option strong,.write-option strong,.support-option small{display:block}.support-option strong,.write-option strong{font-size:15px;line-height:1.35}.support-option small{margin-top:3px;color:#758076;font-size:11px;line-height:1.4}.support-option>svg{justify-self:end;color:#667d60}.write-option{grid-template-columns:42px minmax(0,1fr) auto}.write-option input{width:100%;min-height:31px;margin-top:4px;border:1px solid rgba(95,127,62,.16);border-radius:9px;background:#fffefa;padding:5px 8px;color:#40543f;font:inherit;font-size:12px}.write-option button{min-height:34px;border:0;border-radius:999px;background:#e7eddd;padding:7px 10px;color:#476a41;font:inherit;cursor:pointer}.write-option button:disabled{opacity:.5;cursor:wait}.status{margin:0;border-radius:13px;background:#edf2e6;padding:10px;color:#526b4b;font-size:13px;line-height:1.5}.handoff-note{position:relative;display:grid;grid-template-columns:26px minmax(0,1fr);gap:8px;align-items:center;min-height:58px;overflow:hidden;border-radius:16px;background:linear-gradient(100deg,#e9eddd,#f4eee2);padding:11px 102px 11px 12px;color:#536a4d}.handoff-note::after{position:absolute;right:-4px;bottom:-7px;width:104px;height:76px;background:url('../../assets/goodnight/illustrations/situation-book-lantern.png') right bottom/contain no-repeat;content:'';opacity:.55;pointer-events:none}.handoff-note>*{position:relative;z-index:1}.handoff-note p{margin:0;font-size:13px;line-height:1.48}.stabilize-actions{display:grid;gap:5px;padding:0 10px}.handoff-button{min-height:48px;border:0;border-radius:999px;background:#416a50;color:#fff;font:inherit;box-shadow:0 10px 18px rgba(44,83,58,.18);cursor:pointer}.change-support{min-height:34px;border:0;background:transparent;color:#597251;font:inherit;font-size:13px;cursor:pointer}
</style>
