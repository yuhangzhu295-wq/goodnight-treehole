<script setup lang="ts">
type TimelineItem = { id: string; kind: string; content: string; createdAt: string; intensity?: number; payload?: Record<string, unknown> };
defineProps<{ title: string; createdAt: string; initialIntensity?: number; currentIntensity?: number; updates: TimelineItem[]; busy?: boolean }>();
const emit = defineEmits<{ later: []; action: [] }>();
const label = (item: TimelineItem) => ({ created: '这段经历开始被放在这里', commitment_created: '今晚定下了一小步', checkin: '回来看了看这一步', intensity: '记录了此刻的感受', safety_acknowledged: '选择继续留在支持里', stabilize_note: '给自己留了一句话', stabilize_breath: '完成了一轮呼吸', fingerprint_reanalysis_requested: '请系统重新整理经历' }[item.kind] ?? '后来呢');
const date = (value: string) => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
</script>

<template>
  <section class="timeline-card" data-testid="journey-timeline">
    <header><div><p>第 {{ Math.max(1, Math.ceil((Date.now() - Date.parse(createdAt)) / 86_400_000) + 1) }} 天</p><h2>{{ title }}</h2></div><span v-if="initialIntensity !== undefined">{{ initialIntensity }} <small>→ {{ currentIntensity ?? initialIntensity }}</small></span></header>
    <div class="timeline-list"><article v-for="item in updates" :key="item.id"><span class="timeline-dot" /><div><time>{{ date(item.createdAt) }}</time><h3>{{ label(item) }}</h3><p>{{ item.content }}</p><small v-if="item.intensity !== undefined">情绪 {{ item.intensity }}/10</small></div></article><p v-if="!updates.length" class="empty">第一条真实记录会在这里留下来。</p></div>
    <div class="timeline-actions"><button :disabled="busy" @click="emit('later')">写下后来呢</button><button :disabled="busy" @click="emit('action')">看看今晚的小行动</button></div>
  </section>
</template>

<style scoped>
.timeline-card{display:grid;gap:16px;padding:22px;border-radius:26px;background:rgba(255,252,245,.96);box-shadow:0 20px 42px rgba(11,22,34,.15)}.timeline-card header{display:flex;justify-content:space-between;gap:14px}.timeline-card header p{margin:0;color:#78816f;font-size:13px}.timeline-card h2{margin:4px 0 0;color:#2b432f;font-size:24px}.timeline-card header>span{align-self:center;border-radius:999px;background:#e8efdd;padding:8px 10px;color:#4c6c46;font-weight:700}.timeline-card header small{font-weight:400}.timeline-list{display:grid;gap:0}.timeline-list article{position:relative;display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;padding:0 0 18px}.timeline-list article:not(:last-child)::before{position:absolute;left:9px;top:20px;bottom:0;width:2px;background:#d6e0c9;content:''}.timeline-dot{z-index:1;width:12px;height:12px;margin:4px;border-radius:50%;background:#5e8058;box-shadow:0 0 0 4px #edf3e6}.timeline-list time{color:#7b827a;font-size:12px}.timeline-list h3{margin:4px 0;color:#466240;font-size:15px}.timeline-list p{margin:3px 0;color:#5f685f;line-height:1.55}.timeline-list small{color:#6b835c}.empty{margin:0;color:#7e847b}.timeline-actions{display:grid;gap:9px}.timeline-actions button{min-height:46px;border-radius:15px;border:0;background:#496d49;color:#fff;font:inherit;cursor:pointer}.timeline-actions button+button{border:1px solid rgba(95,127,62,.24);background:transparent;color:#496d49}
</style>
