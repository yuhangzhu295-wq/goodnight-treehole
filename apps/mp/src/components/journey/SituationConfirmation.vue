<script setup lang="ts">
import { computed, ref, watch } from 'vue';

type Snapshot = {
  facts: string[];
  feelings: string[];
  needs: string[];
  constraints: string[];
  confidence: string;
};

const props = defineProps<{ snapshot: Snapshot; busy?: boolean; analyzing?: boolean }>();
const emit = defineEmits<{ confirm: [payload: Pick<Snapshot, 'facts' | 'feelings' | 'needs' | 'constraints'>]; reanalyze: [] }>();

const editing = ref(false);
const draft = ref({ facts: '', feelings: '', needs: '', constraints: '' });
const split = (value: string) => value.split(/[\n；;]/).map((item) => item.trim()).filter(Boolean).slice(0, 8);

watch(() => props.snapshot, (snapshot) => {
  draft.value = {
    facts: snapshot.facts.join('\n'),
    feelings: snapshot.feelings.join('\n'),
    needs: snapshot.needs.join('\n'),
    constraints: snapshot.constraints.join('\n'),
  };
}, { immediate: true, deep: true });

const confirmPayload = computed(() => ({
  facts: split(draft.value.facts),
  feelings: split(draft.value.feelings),
  needs: split(draft.value.needs),
  constraints: split(draft.value.constraints),
}));

function confirm() {
  emit('confirm', confirmPayload.value);
  editing.value = false;
}
</script>

<template>
  <section class="fingerprint-card" data-testid="situation-confirmation">
    <div v-if="analyzing" class="analysis-state" data-testid="fingerprint-loading">
      <span class="loading-orbit" aria-hidden="true" />
      <h2>我在认真整理这件事</h2>
      <p>只会依据你刚刚写下的话，不替你补造任何经历。</p>
    </div>
    <template v-else>
      <header class="fingerprint-heading">
        <span class="leaf-mark" aria-hidden="true">◌</span>
        <div><p>经历指纹</p><h2>我理解的是这些，对吗？</h2></div>
      </header>
      <p class="fingerprint-intro">先确认一下，再往前走。你改动的内容会真实保存为这段经历的依据。</p>
      <div class="fingerprint-sections">
        <article><span class="section-icon" aria-hidden="true">◎</span><div><h3>发生了什么</h3><template v-if="editing"><textarea v-model="draft.facts" aria-label="发生了什么" /></template><ul v-else><li v-for="item in snapshot.facts" :key="item">{{ item }}</li><li v-if="!snapshot.facts.length">还没有足够的信息</li></ul></div></article>
        <article><span class="section-icon" aria-hidden="true">◔</span><div><h3>现在</h3><template v-if="editing"><textarea v-model="draft.feelings" aria-label="现在的感受" /><textarea v-model="draft.needs" aria-label="现在需要什么" placeholder="也可以补充现在最需要什么" /></template><ul v-else><li v-for="item in [...snapshot.feelings, ...snapshot.needs]" :key="item">{{ item }}</li><li v-if="!snapshot.feelings.length && !snapshot.needs.length">还没有写下</li></ul></div></article>
        <article><span class="section-icon" aria-hidden="true">♡</span><div><h3>影响</h3><template v-if="editing"><textarea v-model="draft.constraints" aria-label="眼前的影响" /></template><ul v-else><li v-for="item in snapshot.constraints" :key="item">{{ item }}</li><li v-if="!snapshot.constraints.length">还在慢慢看清</li></ul></div></article>
      </div>
      <div class="fingerprint-actions">
        <button v-if="editing" class="confirm-button" :disabled="busy" @click="confirm">保存这一处</button>
        <button v-else class="confirm-button" :disabled="busy" data-testid="fingerprint-accurate" @click="confirm">准确</button>
        <button class="outline-button" :disabled="busy" data-testid="fingerprint-edit" @click="editing = !editing">{{ editing ? '先不改了' : '改一处' }}</button>
        <button class="text-button" :disabled="busy" data-testid="fingerprint-reanalyze" @click="emit('reanalyze')">重新整理</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.fingerprint-card{display:grid;gap:16px;padding:22px;border:1px solid rgba(255,255,255,.28);border-radius:26px;background:rgba(255,252,244,.95);box-shadow:0 20px 42px rgba(11,22,34,.16)}.fingerprint-heading{display:flex;align-items:center;gap:11px}.fingerprint-heading p{margin:0;color:#6c8057;font-size:12px}.fingerprint-heading h2{margin:3px 0 0;color:#23372b;font-size:25px;line-height:1.25}.leaf-mark,.section-icon{display:grid;place-items:center;flex:0 0 auto;width:38px;height:38px;border-radius:50%;color:#fff;background:#809568;font-size:22px}.fingerprint-intro{margin:0;color:#68726a;font-size:14px;line-height:1.7}.fingerprint-sections{display:grid;border-radius:18px;overflow:hidden;border:1px solid rgba(104,128,87,.15)}.fingerprint-sections article{display:grid;grid-template-columns:38px minmax(0,1fr);gap:11px;padding:15px;border-bottom:1px solid rgba(104,128,87,.14);background:linear-gradient(90deg,#fffdf7,rgba(244,239,222,.76))}.fingerprint-sections article:last-child{border-bottom:0}.fingerprint-sections h3{margin:2px 0 8px;color:#3f5f3a;font-size:16px}.fingerprint-sections ul{display:grid;gap:6px;margin:0;padding-left:18px;color:#626b62;font-size:14px;line-height:1.55}.fingerprint-sections textarea{width:100%;min-height:64px;margin:0 0 8px;border:1px solid rgba(95,127,62,.24);border-radius:12px;background:#fffdf8;padding:9px;color:#27352b;font:inherit;line-height:1.5;resize:none}.fingerprint-actions{display:grid;gap:9px}.confirm-button,.outline-button,.text-button{min-height:48px;border-radius:15px;padding:10px 14px;font:inherit;cursor:pointer}.confirm-button{border:0;background:#486c48;color:#fff;box-shadow:0 10px 20px rgba(44,83,58,.2)}.outline-button{border:1px solid rgba(76,107,67,.3);background:transparent;color:#45633e}.text-button{min-height:34px;border:0;background:transparent;color:#6a795e}.analysis-state{min-height:300px;display:grid;place-content:center;justify-items:center;gap:12px;text-align:center}.analysis-state h2{margin:0;color:#274132;font-size:23px}.analysis-state p{max-width:240px;margin:0;color:#6b766d;line-height:1.7}.loading-orbit{width:48px;height:48px;border:4px solid rgba(95,127,62,.14);border-top-color:#5f7f3e;border-radius:50%;animation:turn 1s linear infinite}@keyframes turn{to{transform:rotate(360deg)}}
</style>
