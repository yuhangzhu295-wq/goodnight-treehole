<script setup lang="ts">
defineProps<{ message: string }>();
defineEmits<{ open: [] }>();
</script>

<template>
  <button class="followup-strip" data-testid="action-followup-strip" @click="$emit('open')">
    <span class="followup-icon" aria-hidden="true">◐</span>
    <span>{{ message }}</span>
    <span class="arrow" aria-hidden="true">›</span>
  </button>
</template>

<style scoped>
.followup-strip { display:grid; grid-template-columns:32px 1fr 18px; align-items:center; gap:10px; width:100%; border:1px solid rgba(117,124,87,.15); border-radius:16px; background:rgba(251,247,235,.84); padding:11px 12px; color:#53644e; font:inherit; font-size:13px; line-height:1.45; text-align:left; cursor:pointer; }
.followup-icon { display:grid; width:30px; height:30px; place-items:center; border-radius:12px; background:#2f4c4e; color:#f6e3b4; font-size:17px; }
.arrow { color:#69765f; font-size:23px; line-height:1; }
</style>
