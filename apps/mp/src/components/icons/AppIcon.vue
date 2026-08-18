<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number; strokeWidth?: number }>(), {
  size: 24,
  strokeWidth: 1.8,
});
</script>

<template>
  <svg class="app-icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="strokeWidth" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <template v-if="name === 'back'"><path d="m15 18-6-6 6-6" /></template>
    <template v-else-if="name === 'tree'"><path d="M12 21v-7" /><path d="M12 14c-3.9 0-6.5-2.1-6.5-5.2C5.5 6.2 7.6 4 10.2 4c.7-1.2 1.8-2 3.3-2 2.7 0 4.9 2.1 4.9 4.7 0 .3 0 .5-.1.8 1.4.6 2.2 1.8 2.2 3.4 0 2.1-1.8 3.6-4.6 3.6H12Z" /><path d="M8.5 21h7" /></template>
    <template v-else-if="name === 'leaf'"><path d="M20 4C10.5 4.1 5 8.1 5 14.3c0 3.1 2 5.2 4.9 5.2C16.2 19.5 20 12.4 20 4Z" /><path d="M4 20c3-3.7 6.8-6.4 11.5-8.1" /></template>
    <template v-else-if="name === 'message'"><path d="M20 11.2c0 4.5-3.6 8.1-8 8.1-1.2 0-2.4-.3-3.4-.8L4 20l1.4-4.2A8.1 8.1 0 0 1 4 11.2C4 6.7 7.6 3.1 12 3.1s8 3.6 8 8.1Z" /><path d="M8.5 11.2h.01M12 11.2h.01M15.5 11.2h.01" /></template>
    <template v-else-if="name === 'clock'"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.2 2" /></template>
    <template v-else-if="name === 'heart'"><path d="M20.8 8.8c0 5-8.8 10.2-8.8 10.2S3.2 13.8 3.2 8.8A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8.8 1.8Z" /></template>
    <template v-else-if="name === 'mood'"><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14.3c.9 1 2.1 1.5 3.5 1.5s2.6-.5 3.5-1.5M9 9.4h.01M15 9.4h.01" /></template>
    <template v-else-if="name === 'people'"><circle cx="9" cy="8" r="2.7" /><path d="M3.7 19a5.4 5.4 0 0 1 10.6 0" /><path d="M15.7 5.8a2.7 2.7 0 0 1 0 5.1M16.5 14a5.2 5.2 0 0 1 3.8 5" /></template>
    <template v-else-if="name === 'path'"><path d="M4 18c2.8 0 3.2-9.5 6.2-9.5 2.8 0 2.4 7 5.1 7 1.6 0 2.4-1.5 4.7-1.5" /><path d="m17.8 11.2 2.2 2.8-3.3 1" /></template>
    <template v-else-if="name === 'shield'"><path d="M12 3.1 19 6v5.1c0 4.6-3.1 7.9-7 9.8-3.9-1.9-7-5.2-7-9.8V6l7-2.9Z" /><path d="m8.8 12.1 2.1 2.1 4.3-4.4" /></template>
    <template v-else-if="name === 'moon'"><path d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6 8.5 8.5 0 1 0 20.4 15.2Z" /></template>
    <template v-else-if="name === 'breath'"><path d="M4 8c2.6-2.1 5.2-2.1 7.8 0s5.2 2.1 8.2 0M4 12c2.6-2.1 5.2-2.1 7.8 0s5.2 2.1 8.2 0M4 16c2.6-2.1 5.2-2.1 7.8 0s5.2 2.1 8.2 0" /></template>
    <template v-else-if="name === 'pause'"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M10 9v6M14 9v6" /></template>
    <template v-else-if="name === 'pen'"><path d="m4 20 4.4-1 9.3-9.3a2.1 2.1 0 0 0-3-3L5.4 16 4 20Z" /><path d="m13.4 8 2.6 2.6" /></template>
    <template v-else-if="name === 'arrow'"><path d="M5 12h14M13 6l6 6-6 6" /></template>
    <template v-else-if="name === 'journey'"><path d="M5 19c3.5 0 3-10 7-10 3.1 0 2.7 6 7 6" /><circle cx="5" cy="19" r="1.5" /><circle cx="12" cy="9" r="1.5" /><circle cx="19" cy="15" r="1.5" /></template>
    <template v-else-if="name === 'trend'"><path d="M4 17 9 12l3 3 7-8" /><path d="M14 7h5v5" /></template>
    <template v-else-if="name === 'rain'"><path d="M7.5 16.5h8.3a3.7 3.7 0 0 0 .4-7.4A5.1 5.1 0 0 0 6.6 10a3.3 3.3 0 0 0 .9 6.5Z" /><path d="m8 19-.5 1.5M12 19l-.5 1.5M16 19l-.5 1.5" /></template>
    <template v-else-if="name === 'step'"><path d="M5 18h4l2-3h4l4-5" /><path d="M15 10h4v4" /></template>
    <template v-else-if="name === 'bell'"><path d="M18 10a6 6 0 0 0-12 0c0 7-2.5 7-2.5 8.5h17C20.5 17 18 17 18 10ZM10 21h4" /></template>
    <template v-else-if="name === 'spark'"><path d="m12 3 1.3 5.7L19 10l-5.7 1.3L12 17l-1.3-5.7L5 10l5.7-1.3L12 3Z" /></template>
  </svg>
</template>

<style scoped>
.app-icon{display:block;flex:0 0 auto}
</style>
