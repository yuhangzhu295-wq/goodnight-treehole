<script setup lang="ts">
/**
 * The shared "this failed, try again" banner.
 *
 * Every screen reads from the API and every one of them used to render its own error line with no way
 * to retry, so a request that failed once - a cold start before the API was listening, a dropped
 * connection - left the user on a dead screen until they killed the app. That is the same defect
 * nineteen times over, so it lives here once instead of being copied into each view.
 *
 * The banner is deliberately not a full-page replacement: the screen's own content and composer stay
 * usable, and the retry re-runs whatever the caller passes in.
 */
defineProps<{
  /** The message to show. Falsy renders nothing, so callers can bind their error ref directly. */
  message?: string;
  /** Accessible label for the retry control, e.g. "重新加载今晚记录". */
  retryLabel?: string;
}>();

const emit = defineEmits<{ retry: [] }>();
</script>

<template>
  <div v-if="message" class="load-error" role="alert" :data-testid="'load-error'">
    <span class="load-error-text">{{ message }}</span>
    <button type="button" class="load-error-retry" @click="emit('retry')">{{ retryLabel ?? '重新加载' }}</button>
  </div>
</template>

<style scoped>
.load-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 12px 20px 0;
  padding: 10px 14px;
  border: 1px solid #f0d5d2;
  border-radius: 10px;
  background: #fdf5f4;
  color: #a5403a;
  font-size: 13px;
  line-height: 1.5;
}

/* A real touch target, not a text link: this is often the only way back from a failed load. */
.load-error-retry {
  flex: 0 0 auto;
  min-height: 32px;
  padding: 6px 12px;
  border: 1px solid #e8c6c2;
  border-radius: 8px;
  background: #ffffff;
  color: #9c3b35;
  font-size: 12.5px;
  font-weight: 600;
}

.load-error-retry:active {
  background: #f7ecea;
}
</style>
