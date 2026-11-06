<script setup lang="ts">
// Real, persisted degradation signal: rendered only when the AI job that produced the
// content on this screen terminated as a template fallback (ISSUE-007).
defineProps<{ notice?: string }>();
</script>

<template>
  <p v-if="notice" class="ai-degradation-notice" role="status" data-testid="ai-degradation-notice">
    <span aria-hidden="true">☂</span>
    <span>{{ notice }}</span>
  </p>
</template>

<style scoped>
.ai-degradation-notice {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 8px 0;
  padding: 9px 12px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  color: var(--gn-ink-soft);
  background: var(--gn-panel);
  font-size: 13px;
  line-height: 1.5;
}
</style>
