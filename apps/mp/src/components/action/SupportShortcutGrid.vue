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
.shortcut-area > p { margin:0 0 8px 2px; color:var(--gn-subtext); font-size:12px; }
/* Four columns squeezed every label onto two lines at 390px. Two columns keep each
   label on one line and read as a normal shortcut grid. */
.shortcut-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px; }
.shortcut-card { display:grid; min-height:56px; grid-template-columns:28px minmax(0, 1fr); align-items:center; gap:9px; border:1px solid var(--gn-line); border-radius:var(--gn-radius-card); background:var(--gn-paper); padding:9px 10px; color:var(--gn-text); font:inherit; text-align:left; cursor:pointer; }
.shortcut-icon { display:grid; width:28px; height:28px; place-items:center; border-radius:var(--gn-radius-small); background:var(--gn-paper-warm); color:var(--gn-leaf-deep); font-size:15px; }
.shortcut-card strong, .shortcut-card small { grid-column:2; min-width:0; }
.shortcut-icon { grid-row:1 / span 2; }
strong { font-size:13px; font-weight:600; line-height:1.25; }
small { color:var(--gn-subtext); font-size:11px; line-height:1.3; }
</style>
