<script setup lang="ts">
import AppIcon from '../icons/AppIcon.vue';
defineProps<{ message: string }>();
defineEmits<{ open: [] }>();
</script>

<template>
  <button class="followup-strip" data-testid="action-followup-strip" @click="$emit('open')">
    <span class="followup-icon" aria-hidden="true"><AppIcon name="clock" :size="18" /></span>
    <span>{{ message }}</span>
    <span class="arrow" aria-hidden="true"><AppIcon name="arrow" :size="18" /></span>
  </button>
</template>

<style scoped>
.followup-strip { display:grid; grid-template-columns:30px 1fr 18px; align-items:center; gap:9px; width:100%; border:1px solid rgba(117,124,87,.15); border-radius:15px; background:rgba(251,247,235,.84); padding:9px 11px; color:#53644e; font:inherit; font-size:12px; line-height:1.4; text-align:left; cursor:pointer; }
.followup-icon { display:grid; width:28px; height:28px; place-items:center; border-radius:11px; background:#2f4c4e; color:#f6e3b4; font-size:16px; }
.arrow { color:#69765f; font-size:23px; line-height:1; }
</style>
