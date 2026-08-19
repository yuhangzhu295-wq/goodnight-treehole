<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AppIcon from '../icons/AppIcon.vue';

type Snapshot = { facts: string[]; feelings: string[]; needs: string[]; constraints: string[]; confidence: string };
type SectionKey = 'facts' | 'feelings' | 'constraints';
const props = defineProps<{ snapshot: Snapshot; busy?: boolean; analyzing?: boolean }>();
const emit = defineEmits<{ confirm: [payload: Pick<Snapshot, 'facts' | 'feelings' | 'needs' | 'constraints'>]; reanalyze: [] }>();
const editing = ref(false);
const draft = ref({ facts: '', feelings: '', needs: '', constraints: '' });
const split = (value: string) => value.split(/[\n；;]/).map((item) => item.trim()).filter(Boolean).slice(0, 8);

watch(() => props.snapshot, (snapshot) => {
  draft.value = { facts: snapshot.facts.join('\n'), feelings: snapshot.feelings.join('\n'), needs: snapshot.needs.join('\n'), constraints: snapshot.constraints.join('\n') };
}, { immediate: true, deep: true });

const confirmPayload = computed(() => ({ facts: split(draft.value.facts), feelings: split(draft.value.feelings), needs: split(draft.value.needs), constraints: split(draft.value.constraints) }));
const sections = computed(() => [
  { key: 'facts' as SectionKey, icon: 'message', title: '发生了什么', items: props.snapshot.facts, empty: '还没有足够的信息' },
  { key: 'feelings' as SectionKey, icon: 'clock', title: '现在', items: [...props.snapshot.feelings, ...props.snapshot.needs], empty: '还在慢慢看清此刻的感受' },
  { key: 'constraints' as SectionKey, icon: 'heart', title: '影响', items: props.snapshot.constraints, empty: '这部分也可以之后再补充' },
]);
function confirm() { emit('confirm', confirmPayload.value); editing.value = false; }
</script>

<template>
  <section class="situation-screen" data-testid="situation-confirmation">
    <div v-if="analyzing" class="analysis-state" data-testid="fingerprint-loading"><span class="loading-orbit" aria-hidden="true" /><h2>正在整理你刚刚说的话</h2><p>只会依据你留下的内容，不会替你补写经历。</p></div>
    <template v-else>
      <div class="situation-paper">
        <article v-for="section in sections" :key="section.key" class="situation-section">
          <span class="section-icon"><AppIcon :name="section.icon" /></span>
          <div class="section-content">
            <h2>{{ section.title }}</h2>
            <template v-if="editing"><textarea v-if="section.key === 'facts'" v-model="draft.facts" aria-label="发生了什么" /><template v-else-if="section.key === 'feelings'"><textarea v-model="draft.feelings" aria-label="现在的感受" /><textarea v-model="draft.needs" aria-label="现在需要什么" placeholder="也可以补充现在最需要什么" /></template><textarea v-else v-model="draft.constraints" aria-label="眼前的影响" /></template>
            <ul v-else><li v-for="item in section.items" :key="item">{{ item }}</li><li v-if="!section.items.length" class="muted">{{ section.empty }}</li></ul>
          </div>
        </article>
      </div>
      <div class="situation-actions"><button v-if="editing" class="primary-action" :disabled="busy" @click="confirm">保存这一处</button><button v-else class="primary-action" :disabled="busy" data-testid="fingerprint-accurate" @click="confirm">准确</button><button class="outline-action" :disabled="busy" data-testid="fingerprint-edit" @click="editing = !editing">{{ editing ? '先不改了' : '改一处' }}</button><button class="outline-action" :disabled="busy" data-testid="fingerprint-reanalyze" @click="emit('reanalyze')">重新整理</button></div>
    </template>
  </section>
</template>

<style scoped>
:global(.journey-flow--confirm .journey-flow-hero) {
  min-height: 162px;
  padding: 24px 22px 10px;
}

:global(.journey-flow--confirm .journey-flow-main) {
  justify-self: center;
  width: calc(100% - 20px);
  margin-top: -4px;
}

:global(.journey-flow--confirm .journey-flow-hero h1) {
  font-size: 27px;
}

.situation-screen { display: grid; gap: 14px; }

.situation-paper {
  overflow: hidden;
  border: 1px solid rgba(102, 121, 85, .18);
  border-radius: 24px;
  background: linear-gradient(145deg, rgba(255, 254, 249, .98), rgba(246, 240, 228, .98));
  box-shadow: 0 15px 32px rgba(20, 32, 27, .12);
}

.situation-section {
  position: relative;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 12px;
  min-height: 126px;
  padding: 19px 118px 18px 18px;
}

.situation-section:first-child { min-height: 142px; }
.situation-section:nth-child(2) { min-height: 136px; }

.situation-section:not(:last-child)::after {
  position: absolute;
  right: 18px;
  bottom: 0;
  left: 72px;
  height: 1px;
  background: rgba(95, 127, 62, .13);
  content: '';
}

.situation-section::before {
  position: absolute;
  right: 8px;
  bottom: 4px;
  width: 106px;
  height: 90px;
  background-position: right bottom;
  background-repeat: no-repeat;
  background-size: contain;
  content: '';
  opacity: .62;
  pointer-events: none;
  mix-blend-mode: multiply;
}

.situation-section:first-child::before { background-image: url('../../assets/goodnight/illustrations/situation-book-lantern.png'); opacity: .76; }
.situation-section:nth-child(2)::before { background-image: url('../../assets/goodnight/illustrations/situation-vase-scene.png'); }
.situation-section:nth-child(3)::before { background-image: url('../../assets/goodnight/illustrations/situation-leaf-scene.png'); }
.section-content, .section-icon { position: relative; z-index: 1; }

.section-icon { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: #94a37d; color: #fff; }
.section-content h2 { margin: 4px 0 10px; color: #37563b; font-size: 17px; line-height: 1.25; }
.section-content ul { display: grid; gap: 5px; margin: 0; padding: 0; list-style: none; }
.section-content li { max-width: 100%; padding: 1px 0; color: #62685f; font-size: 14px; line-height: 1.52; overflow-wrap: anywhere; }
.section-content li::before { display: inline-block; width: 5px; height: 5px; margin: 0 8px 2px 1px; border-radius: 50%; background: #788765; content: ''; }
.section-content li.muted { padding-left: 0; color: #7d827b; }
.section-content li.muted::before { display: none; }
.section-content textarea { display: block; width: 100%; min-height: 64px; margin: 0 0 8px; border: 1px solid rgba(95, 127, 62, .24); border-radius: 12px; background: #fffdf8; padding: 9px; color: #27352b; font: inherit; line-height: 1.5; resize: none; }

.situation-actions { display: grid; gap: 7px; padding: 1px 12px 0; }
.primary-action, .outline-action { border-radius: 999px; padding: 7px 16px; font: inherit; cursor: pointer; }
.primary-action { min-height: 40px; }
.outline-action { min-height: 34px; }
.primary-action { border: 0; background: #416a50; color: #fff; box-shadow: 0 11px 20px rgba(44, 83, 58, .18); }
.outline-action { border: 1px solid rgba(81, 112, 75, .28); background: rgba(255, 253, 247, .68); color: #486642; }
.primary-action:disabled, .outline-action:disabled { opacity: .6; cursor: wait; }

.analysis-state { display: grid; min-height: 350px; place-content: center; justify-items: center; gap: 12px; border-radius: 24px; background: rgba(255, 253, 247, .92); padding: 24px; text-align: center; box-shadow: 0 15px 32px rgba(20, 32, 27, .1); }
.analysis-state h2 { margin: 0; color: #294633; font-size: 22px; }
.analysis-state p { max-width: 260px; margin: 0; color: #6b766d; line-height: 1.7; }
.loading-orbit { width: 44px; height: 44px; border: 3px solid rgba(95, 127, 62, .15); border-top-color: #5f7f3e; border-radius: 50%; animation: turn 1s linear infinite; }

@keyframes turn { to { transform: rotate(360deg); } }
</style>
