<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AppIcon from '../icons/AppIcon.vue';

type Snapshot = { facts: string[]; feelings: string[]; needs: string[]; constraints: string[]; confidence: string };
type SectionKey = 'facts' | 'feelings' | 'constraints';
const props = defineProps<{ snapshot: Snapshot; busy?: boolean; analyzing?: boolean; heading?: string; subheading?: string }>();
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
      <!-- The step's heading lives here rather than in the shell: the V2 brief asks for a stable bar. -->
      <header v-if="heading" class="situation-head">
        <h2>{{ heading }}</h2>
        <p v-if="subheading">{{ subheading }}</p>
      </header>

      <section class="situation-paper">
        <article v-for="section in sections" :key="section.key" class="situation-section">
          <span class="section-icon"><AppIcon :name="section.icon" :size="18" /></span>
          <div class="section-content">
            <h3>{{ section.title }}</h3>
            <template v-if="editing"><textarea v-if="section.key === 'facts'" v-model="draft.facts" aria-label="发生了什么" /><template v-else-if="section.key === 'feelings'"><textarea v-model="draft.feelings" aria-label="现在的感受" /><textarea v-model="draft.needs" aria-label="现在需要什么" placeholder="也可以补充现在最需要什么" /></template><textarea v-else v-model="draft.constraints" aria-label="眼前的影响" /></template>
            <ul v-else><li v-for="item in section.items" :key="item">{{ item }}</li><li v-if="!section.items.length" class="muted">{{ section.empty }}</li></ul>
          </div>
        </article>
      </section>
      <div class="situation-actions"><button v-if="editing" class="primary-action" :disabled="busy" @click="confirm">保存这一处</button><button v-else class="primary-action" :disabled="busy" data-testid="fingerprint-accurate" @click="confirm">准确</button><button class="outline-action" :disabled="busy" data-testid="fingerprint-edit" @click="editing = !editing">{{ editing ? '先不改了' : '改一处' }}</button><button class="outline-action" :disabled="busy" data-testid="fingerprint-reanalyze" @click="emit('reanalyze')">重新整理</button></div>
    </template>
  </section>
</template>

<style scoped>
.situation-screen { display: grid; gap: 14px; }

.situation-head h2 { margin: 0; font-size: 22px; line-height: 1.3; color: var(--gn-text, #242a32); }
.situation-head p { margin: 6px 0 0; font-size: 13px; color: var(--gn-subtext, #757d87); }

.situation-paper {
  overflow: hidden;
  border: 1px solid var(--gn-border, #e8ebef);
  border-radius: var(--gn-radius-card, 12px);
  background: var(--gn-card, #ffffff);
}

.situation-section {
  position: relative;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 12px;
  padding: 16px;
}

.situation-section:not(:last-child) { border-bottom: 1px solid var(--gn-border, #e8ebef); }

.section-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--gn-green-light, #eaf4ee); color: var(--gn-green-dark, #1e4d45); }

.section-content h3 { margin: 2px 0 8px; font-size: 15px; color: var(--gn-text, #242a32); }
.section-content ul { display: grid; gap: 5px; margin: 0; padding: 0; list-style: none; }
.section-content li { max-width: 100%; color: var(--gn-subtext, #757d87); font-size: 14px; line-height: 1.55; overflow-wrap: anywhere; }
.section-content li::before { display: inline-block; width: 4px; height: 4px; margin: 0 8px 2px 1px; border-radius: 50%; background: var(--gn-green-dark, #1e4d45); content: ''; }
.section-content li.muted { color: var(--gn-muted, #757d87); }
.section-content li.muted::before { display: none; }
.section-content textarea { display: block; box-sizing: border-box; width: 100%; min-height: 64px; margin: 0 0 8px; padding: 9px 11px; border: 0; border-radius: 10px; background: var(--gn-paper-warm, #f7f8fa); color: var(--gn-text, #242a32); font: inherit; line-height: 1.5; resize: none; }

.situation-actions { display: grid; gap: 8px; }
.primary-action, .outline-action { border-radius: var(--gn-radius-small, 8px); font: inherit; cursor: pointer; }
.primary-action { min-height: 44px; border: 0; background: var(--gn-leaf, #275f56); color: #ffffff; }
.outline-action { min-height: 40px; border: 1px solid var(--gn-border, #e8ebef); background: var(--gn-card, #ffffff); color: var(--gn-text, #242a32); }
.primary-action:disabled, .outline-action:disabled { opacity: .55; cursor: wait; }

.analysis-state { display: grid; min-height: 300px; place-content: center; justify-items: center; gap: 12px; border: 1px solid var(--gn-border, #e8ebef); border-radius: var(--gn-radius-card, 12px); background: var(--gn-card, #ffffff); padding: 24px; text-align: center; }
.analysis-state h2 { margin: 0; color: var(--gn-text, #242a32); font-size: 18px; }
.analysis-state p { max-width: 260px; margin: 0; color: var(--gn-subtext, #757d87); line-height: 1.7; }
.loading-orbit { width: 36px; height: 36px; border: 3px solid var(--gn-border, #e8ebef); border-top-color: var(--gn-leaf, #275f56); border-radius: 50%; animation: turn 1s linear infinite; }

@keyframes turn { to { transform: rotate(360deg); } }
</style>
