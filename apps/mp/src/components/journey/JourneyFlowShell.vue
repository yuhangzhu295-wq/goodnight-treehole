<script setup lang="ts">
import AppIcon from '../icons/AppIcon.vue';

type FlowMode = 'confirm' | 'temperature' | 'intent' | 'stabilize' | 'timeline';
defineProps<{ mode: FlowMode; title: string }>();
const emit = defineEmits<{ back: [] }>();
</script>

<template>
  <!-- A stable bar, per the V2 brief. The step's own heading belongs to the step's content, so the
       bar does not change wording as the flow moves. -->
  <section class="goodnight-page journey-flow-page" :class="`journey-flow--${mode}`">
    <header class="journey-flow-bar">
      <button class="back-control" type="button" aria-label="返回" @click="emit('back')">
        <AppIcon name="back" :size="20" />
      </button>
      <h1>{{ title }}</h1>
    </header>
    <main class="journey-flow-main"><slot /></main>
  </section>
</template>

<style scoped>
.journey-flow-page {
  box-sizing: border-box;
  width: 100%;
  min-height: 100vh;
  padding: 0 16px calc(var(--gn-tabbar-reserve) + env(safe-area-inset-bottom));
  background: var(--gn-bg, #ffffff);
  color: var(--gn-text, #242a32);
  font-family: var(--gn-font-body);
}

.journey-flow-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  margin: 0 -16px 14px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--gn-border, #e8ebef);
  background: var(--gn-bg, #ffffff);
}

.back-control {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--gn-border, #e8ebef);
  border-radius: 50%;
  background: var(--gn-card, #ffffff);
  color: var(--gn-text, #242a32);
  cursor: pointer;
}

.journey-flow-bar h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--gn-text, #242a32);
}

.journey-flow-main {
  display: grid;
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
}
</style>
