<script setup lang="ts">
import AppIcon from '../icons/AppIcon.vue';

type FlowMode = 'confirm' | 'temperature' | 'intent' | 'stabilize' | 'timeline';
defineProps<{ mode: FlowMode; title: string; subtitle: string }>();
const emit = defineEmits<{ back: [] }>();
</script>

<template>
  <section class="goodnight-page journey-flow-page" :class="`journey-flow--${mode}`">
    <header class="journey-flow-hero">
      <div class="hero-topline"><button class="back-control" type="button" aria-label="返回" @click="emit('back')"><AppIcon name="back" /></button><span class="hero-brand"><AppIcon name="tree" :size="18" />晚安树洞</span></div>
      <h1>{{ title }}</h1><p class="hero-subtitle">{{ subtitle }}</p>
    </header>
    <main class="journey-flow-main"><slot /></main>
  </section>
</template>

<style scoped>
.journey-flow-page{position:relative;width:100%;min-height:100vh;padding:0 14px calc(118px + env(safe-area-inset-bottom));background:linear-gradient(180deg,#152531 0,#233544 172px,#f6f1e4 266px,#f6f1e4 100%);color:var(--gn-text)}.journey-flow-hero{position:relative;width:calc(100% + 28px);max-width:none;min-height:176px;margin:0 -14px;padding:17px 22px 23px;overflow:hidden;background:radial-gradient(circle at 72% 80%,rgba(224,174,124,.36),transparent 31%),linear-gradient(145deg,rgba(12,27,40,.98),rgba(34,53,66,.98) 61%,rgba(80,75,76,.9));color:#fffaf0}.journey-flow-hero::before{position:absolute;inset:0;background-image:radial-gradient(circle at 13% 14%,rgba(255,255,255,.62) 0 1px,transparent 1.5px),radial-gradient(circle at 29% 30%,rgba(255,255,255,.45) 0 1px,transparent 1.5px),radial-gradient(circle at 52% 11%,rgba(255,255,255,.38) 0 1px,transparent 1.5px);background-size:86px 86px,117px 117px,137px 137px;content:'';opacity:.8;pointer-events:none}.journey-flow-hero::after{position:absolute;right:-30px;bottom:-28px;width:224px;height:224px;background:url('../../assets/goodnight/tree-top-cutout.png') right bottom/contain no-repeat;content:'';opacity:.3;filter:brightness(.64) saturate(.72);pointer-events:none}.hero-topline,.journey-flow-hero h1,.hero-subtitle{position:relative;z-index:1}.hero-topline{display:flex;align-items:center;gap:11px;min-height:30px}.back-control{display:grid;place-items:center;width:30px;min-width:30px;height:30px;min-height:30px;padding:0;border:1px solid rgba(255,255,255,.27);border-radius:50%;background:rgba(14,30,42,.18);color:#fffaf0;cursor:pointer}.hero-brand{display:inline-flex;align-items:center;gap:6px;color:rgba(255,250,240,.9);font-size:13px;font-weight:600}.journey-flow-hero h1{max-width:310px;margin:25px 0 0;color:#fffaf0;font-family:"Songti SC","Noto Serif SC","Source Han Serif SC",serif;font-size:28px;font-weight:600;line-height:1.23;letter-spacing:0}.hero-subtitle{max-width:272px;margin:7px 0 0;color:rgba(255,249,238,.78);font-size:14px;line-height:1.55}.journey-flow-main{position:relative;z-index:2;display:grid;width:100%;max-width:440px;margin:-24px auto 0}.journey-flow--timeline .journey-flow-hero h1{font-size:27px}.journey-flow--intent .journey-flow-hero::after{opacity:.23}.journey-flow--stabilize .journey-flow-hero{min-height:176px}@media (max-width:350px){.journey-flow-hero{min-height:165px;padding-inline:18px}.journey-flow-hero h1{font-size:26px}.journey-flow-main{margin-top:-19px}}
  .journey-flow-page{padding-bottom:calc(136px + env(safe-area-inset-bottom))}.journey-flow--timeline{padding-bottom:calc(36px + env(safe-area-inset-bottom))}.journey-flow-hero h1{max-width:340px}.journey-flow--intent .journey-flow-hero h1{max-width:372px;font-size:26px}
</style>
