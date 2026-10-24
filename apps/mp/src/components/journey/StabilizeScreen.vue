<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../api';
import AppIcon from '../icons/AppIcon.vue';

const props = defineProps<{ journeyId: string; heading?: string; subheading?: string }>();
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
    <header v-if="heading" class="step-head">
      <h2>{{ heading }}</h2>
      <p v-if="subheading">{{ subheading }}</p>
    </header>

    <div class="comfort-note">
      <span class="comfort-mark"><AppIcon name="leaf" :size="19" /></span>
      <div><p>我想对你说</p><strong>今晚先不用解决。<br />我们先让这一刻轻一点。</strong></div>
    </div>

    <div class="stabilize-options">
      <button class="support-option breathing-option" data-testid="stabilize-breath" @click="beginBreathing"><span class="support-icon"><AppIcon name="breath" :size="19" /></span><span><strong>跟我呼吸30秒</strong><small>{{ seconds ? `还剩 ${seconds} 秒` : '慢慢吸气，跟着节奏，把呼吸带回来。' }}</small><span class="breath-stages" aria-hidden="true"><i><b>1</b>吸气 4秒</i><i><b>2</b>停留 4秒</i><i><b>3</b>呼气 6秒</i><i><b>4</b>停留 2秒</i></span></span><AppIcon name="arrow" :size="18" /></button>
      <button class="support-option pause-option" :disabled="busy" data-testid="stabilize-pause" @click="pauseImpulse"><span class="support-icon"><AppIcon name="pause" :size="19" /></span><span><strong>先把想做的事情放一下</strong><small>给大脑降降温，稍晚再决定。</small><span class="cooldown-tags" aria-hidden="true"><i>暂停计划</i><i>延迟决定</i><i>不给回应</i></span></span><AppIcon name="arrow" :size="18" /></button>
      <label class="write-option"><span class="support-icon"><AppIcon name="pen" :size="19" /></span><span><strong>写一句也可以</strong><input v-model="note" maxlength="300" placeholder="比如，你想说点什么呢……" @keyup.enter="saveNote" /></span><button :disabled="busy || !note.trim()" @click="saveNote">留下</button></label>
    </div>

    <p v-if="status" class="status" role="status">{{ status }}</p>

    <div class="handoff-note"><AppIcon name="heart" :size="19" /><p>如果你愿意，我也可以帮你把想说的一句话，发给现实中的人。</p></div>
    <div class="stabilize-actions"><button class="handoff-button" @click="router.push(`/pages/reality-handoff/index?journeyId=${journeyId}`)">帮我告诉现实中的一个人</button><button class="change-support" @click="router.push(`/pages/journey/detail?id=${journeyId}&mode=intent`)">换一种支持</button></div>
  </section>
</template>

<style scoped>
.stabilize-screen { display: grid; gap: 14px; }

.step-head h2 { margin: 0; font-size: 22px; line-height: 1.3; color: var(--gn-text, #242a32); }
.step-head p { margin: 6px 0 0; font-size: 13px; color: var(--gn-subtext, #757d87); }

.comfort-note { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 12px; align-items: center; padding: 16px; border: 1px solid var(--gn-border, #e8ebef); border-radius: var(--gn-radius-card, 12px); background: var(--gn-card, #ffffff); }
.comfort-mark, .support-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--gn-green-light, #eaf4ee); color: var(--gn-green-dark, #1e4d45); }
.comfort-note p { margin: 0 0 4px; color: var(--gn-muted, #757d87); font-size: 12px; }
.comfort-note strong { color: var(--gn-text, #242a32); font-size: 16px; line-height: 1.45; }

.stabilize-options { display: grid; gap: 8px; }
.support-option, .write-option { display: grid; grid-template-columns: 38px minmax(0, 1fr) 20px; gap: 10px; align-items: center; width: 100%; min-height: 68px; padding: 12px; border: 1px solid var(--gn-border, #e8ebef); border-radius: var(--gn-radius-card, 12px); background: var(--gn-card, #ffffff); color: var(--gn-text, #242a32); text-align: left; font: inherit; cursor: pointer; }
.support-option > span:nth-child(2), .write-option > span:nth-child(2) { min-width: 0; }
.support-option strong, .write-option strong, .support-option small { display: block; }
.support-option strong, .write-option strong { font-size: 15px; line-height: 1.35; }
.support-option small { margin-top: 3px; color: var(--gn-subtext, #757d87); font-size: 11px; line-height: 1.4; }
.support-option > svg { justify-self: end; color: var(--gn-muted, #757d87); }
.breath-stages { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; margin-top: 8px; color: var(--gn-muted, #757d87); font-size: 9px; text-align: center; }
.breath-stages i { display: grid; justify-items: center; gap: 1px; font-style: normal; white-space: nowrap; }
.breath-stages b { display: grid; place-items: center; width: 15px; height: 15px; border-radius: 50%; background: var(--gn-green-light, #eaf4ee); color: var(--gn-green-dark, #1e4d45); font-size: 9px; }
.cooldown-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 7px; }
.cooldown-tags i { border-radius: 999px; background: var(--gn-paper-warm, #f7f8fa); padding: 3px 7px; color: var(--gn-subtext, #757d87); font-size: 9px; font-style: normal; white-space: nowrap; }
.write-option { grid-template-columns: 38px minmax(0, 1fr) auto; }
.write-option input { box-sizing: border-box; width: 100%; min-height: 32px; margin-top: 4px; padding: 6px 10px; border: 0; border-radius: 9px; background: var(--gn-paper-warm, #f7f8fa); color: var(--gn-text, #242a32); font: inherit; font-size: 12px; }
.write-option button { min-height: 34px; padding: 7px 12px; border: 0; border-radius: var(--gn-radius-small, 8px); background: var(--gn-green-light, #eaf4ee); color: var(--gn-green-dark, #1e4d45); font: inherit; cursor: pointer; }
.write-option button:disabled { opacity: .5; cursor: wait; }

.status { margin: 0; padding: 12px; border-radius: var(--gn-radius-card, 12px); background: var(--gn-green-light, #eaf4ee); color: var(--gn-green-dark, #1e4d45); font-size: 13px; line-height: 1.5; }
.handoff-note { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 8px; align-items: center; padding: 12px; border: 1px solid var(--gn-border, #e8ebef); border-radius: var(--gn-radius-card, 12px); background: var(--gn-card, #ffffff); color: var(--gn-subtext, #757d87); }
.handoff-note p { margin: 0; font-size: 13px; line-height: 1.48; }
.stabilize-actions { display: grid; gap: 8px; }
.handoff-button { min-height: 44px; border: 0; border-radius: var(--gn-radius-small, 8px); background: var(--gn-leaf, #275f56); color: #ffffff; font: inherit; cursor: pointer; }
.change-support { min-height: 40px; border: 1px solid var(--gn-border, #e8ebef); border-radius: var(--gn-radius-small, 8px); background: var(--gn-card, #ffffff); color: var(--gn-text, #242a32); font: inherit; font-size: 13px; cursor: pointer; }
</style>
