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
.stabilize-screen{display:grid;gap:12px}.comfort-note{display:grid;grid-template-columns:43px minmax(0,1fr);gap:12px;border-radius:23px;background:linear-gradient(145deg,#fffdf7,#f3ecdd);padding:19px 17px;box-shadow:0 15px 32px rgba(20,32,27,.11)}.comfort-mark,.support-icon{display:grid;place-items:center;border-radius:50%;background:#e9eedf;color:#52714d}.comfort-mark{width:41px;height:41px}.comfort-note p{margin:1px 0 5px;color:#69805f;font-size:13px}.comfort-note strong{color:#384f3a;font-size:17px;font-weight:600;line-height:1.55}.stabilize-options{display:grid;gap:10px}.support-option,.write-option{display:grid;grid-template-columns:42px minmax(0,1fr) 20px;gap:11px;align-items:center;width:100%;border:1px solid rgba(95,127,62,.16);border-radius:18px;background:rgba(255,253,247,.96);padding:14px;color:#2f4532;text-align:left;font:inherit;box-shadow:0 8px 18px rgba(48,59,40,.05);cursor:pointer}.support-option>span:nth-child(2),.write-option>span:nth-child(2){min-width:0}.support-icon{width:40px;height:40px}.support-option strong,.support-option small,.write-option strong{display:block}.support-option strong,.write-option strong{font-size:16px}.support-option small{margin-top:4px;color:#788078;font-size:12px;line-height:1.45}.support-option>svg{color:#75846d}.support-option:disabled{opacity:.6;cursor:wait}.write-option{grid-template-columns:42px minmax(0,1fr) auto;cursor:default}.write-option input{width:100%;margin-top:7px;border:1px solid rgba(95,127,62,.18);border-radius:9px;background:#fffefa;padding:7px 8px;color:#324633;font:inherit}.write-option button{border:0;border-radius:10px;background:#5b7c54;padding:8px 10px;color:#fff;font:inherit;cursor:pointer}.write-option button:disabled{opacity:.5;cursor:wait}.status{margin:0;border-radius:12px;background:#eef3e7;padding:10px;color:#506a46;font-size:13px}.handoff-note{display:flex;align-items:center;gap:9px;border-radius:16px;background:linear-gradient(90deg,#eff0de,#e6eadd);padding:12px;color:#54704d}.handoff-note p{margin:0;font-size:13px;line-height:1.55}.stabilize-actions{display:grid;gap:8px;padding:0 12px}.handoff-button,.change-support{min-height:47px;border-radius:999px;padding:10px;font:inherit;cursor:pointer}.handoff-button{border:0;background:#416a50;color:#fff;box-shadow:0 11px 20px rgba(44,83,58,.18)}.change-support{border:1px solid rgba(95,127,62,.28);background:rgba(255,253,247,.7);color:#4e673f}
</style>
