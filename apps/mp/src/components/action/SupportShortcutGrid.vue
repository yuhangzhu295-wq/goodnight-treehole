<script setup lang="ts">
import AppIcon from '../icons/AppIcon.vue';
type ShortcutKey = 'cooldown' | 'decision' | 'handoff' | 'future';

const items: Array<{ key: ShortcutKey; icon: string; title: string; description: string }> = [
  { key: 'cooldown', icon: 'pause', title: '先别发出去', description: '允许自己缓一缓' },
  { key: 'decision', icon: 'path', title: '一个重要决定', description: '理清思路再说' },
  { key: 'handoff', icon: 'people', title: '找现实中的人', description: '连接，获得支持' },
  { key: 'future', icon: 'message', title: '留给未来的我', description: '写一封给未来的信' },
];

defineEmits<{ select: [key: ShortcutKey] }>();
</script>

<template>
  <section class="shortcut-area" aria-label="更多支持">
    <p>如果你现在更需要别的支持</p>
    <div class="shortcut-grid">
      <button v-for="item in items" :key="item.key" class="shortcut-card" :data-testid="`action-shortcut-${item.key}`" @click="$emit('select', item.key)">
        <span class="shortcut-icon" aria-hidden="true"><AppIcon :name="item.icon" :size="18" /></span>
        <strong>{{ item.title }}</strong>
        <small>{{ item.description }}</small>
      </button>
    </div>
  </section>
</template>

<style scoped>
.shortcut-area { margin-top:2px; }
.shortcut-area > p { margin:0 0 8px 2px; color:#65735d; font-size:12px; }
.shortcut-grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:7px; }
.shortcut-card { display:grid; min-height:80px; align-content:start; justify-items:center; gap:4px; border:1px solid rgba(117,124,87,.14); border-radius:16px; background:rgba(255,253,246,.84); padding:7px 5px 6px; color:#435640; font:inherit; text-align:center; cursor:pointer; box-shadow:0 7px 16px rgba(55,66,47,.05); }
.shortcut-icon { display:grid; width:28px; height:28px; place-items:center; border-radius:11px; background:#edf0df; color:#63775a; font-size:15px; }
strong { font-size:11px; font-weight:650; line-height:1.22; }
small { color:#849082; font-size:9px; line-height:1.25; }
@media (max-width:374px) { .shortcut-grid { gap:6px; } .shortcut-card { min-height:88px; padding-inline:4px; } strong { font-size:11px; } small { font-size:9px; } }
</style>
