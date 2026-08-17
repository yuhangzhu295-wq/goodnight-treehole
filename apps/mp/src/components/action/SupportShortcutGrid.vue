<script setup lang="ts">
type ShortcutKey = 'cooldown' | 'decision' | 'handoff' | 'future';

const items: Array<{ key: ShortcutKey; icon: string; title: string; description: string }> = [
  { key: 'cooldown', icon: '◌', title: '先别发出去', description: '允许自己缓一缓' },
  { key: 'decision', icon: '⌘', title: '一个重要决定', description: '理清思路再说' },
  { key: 'handoff', icon: '◎', title: '找现实中的人', description: '连接，获得支持' },
  { key: 'future', icon: '✦', title: '留给未来的我', description: '写一封给未来的信' },
];

defineEmits<{ select: [key: ShortcutKey] }>();
</script>

<template>
  <section class="shortcut-area" aria-label="更多支持">
    <p>如果你现在更需要别的支持</p>
    <div class="shortcut-grid">
      <button v-for="item in items" :key="item.key" class="shortcut-card" :data-testid="`action-shortcut-${item.key}`" @click="$emit('select', item.key)">
        <span class="shortcut-icon" aria-hidden="true">{{ item.icon }}</span>
        <strong>{{ item.title }}</strong>
        <small>{{ item.description }}</small>
      </button>
    </div>
  </section>
</template>

<style scoped>
.shortcut-area { margin-top:2px; }
.shortcut-area > p { margin:0 0 10px 2px; color:#65735d; font-size:13px; }
.shortcut-grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:8px; }
.shortcut-card { display:grid; min-height:92px; align-content:start; justify-items:center; gap:5px; border:1px solid rgba(117,124,87,.14); border-radius:17px; background:rgba(255,253,246,.84); padding:9px 6px 7px; color:#435640; font:inherit; text-align:center; cursor:pointer; box-shadow:0 8px 18px rgba(55,66,47,.05); }
.shortcut-icon { display:grid; width:31px; height:31px; place-items:center; border-radius:12px; background:#edf0df; color:#63775a; font-size:16px; }
strong { font-size:12px; font-weight:650; line-height:1.28; }
small { color:#849082; font-size:10px; line-height:1.36; }
@media (max-width:374px) { .shortcut-grid { gap:6px; } .shortcut-card { min-height:88px; padding-inline:4px; } strong { font-size:11px; } small { font-size:9px; } }
</style>
