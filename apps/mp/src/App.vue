<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

const route = useRoute();
const tabbarPaths = new Set([
  '/pages/tonight/index',
  '/pages/peers/index',
  '/pages/action/index',
  '/pages/square/index',
  '/pages/letter/index',
  '/pages/letter/today',
  '/pages/reply/today',
  '/pages/tool/index',
  '/pages/me/index',
  '/pages/diary/index',
  '/pages/diary/list',
  '/pages/me/diaries',
  '/pages/report/month',
  '/pages/me/month-report',
  '/pages/letter/list',
  '/pages/favorite/index',
  '/pages/favorite/list',
  '/pages/settings/privacy',
  '/pages/help/feedback',
  '/pages/feedback/index',
]);
const showTabbar = computed(() => tabbarPaths.has(route.path));
const activeTab = computed(() => {
  if (route.path.startsWith('/pages/tonight')) return 'tonight';
  if (route.path.startsWith('/pages/peers')) return 'peers';
  if (route.path.startsWith('/pages/action')) return 'action';
  if (route.path.startsWith('/pages/reply') || route.path.startsWith('/pages/letter')) return 'tonight';
  if (route.path.startsWith('/pages/tool')) return 'action';
  if (route.path.startsWith('/pages/me') || route.path.startsWith('/pages/diary') || route.path.startsWith('/pages/report') || route.path.startsWith('/pages/favorite') || route.path.startsWith('/pages/settings') || route.path.startsWith('/pages/help') || route.path.startsWith('/pages/feedback')) return 'me';
  return 'tonight';
});
</script>

<template>
  <main class="phone-shell">
    <RouterView />
    <nav v-if="showTabbar" class="tabbar" aria-label="底部导航">
      <RouterLink data-testid="tab-square" to="/pages/tonight/index" :class="{ 'router-link-active': activeTab === 'tonight' }">
        <span class="tab-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 21v-7" /><path d="M12 4c-2.7 0-4.8 1.9-5.2 4.4A4.4 4.4 0 0 0 5 16h14a4.4 4.4 0 0 0-1.8-7.6C16.8 5.9 14.7 4 12 4Z" /><path d="M8 16h8" /></svg>
        </span>
        <span>今晚</span>
      </RouterLink>
      <RouterLink data-testid="tab-letter" to="/pages/peers/index" :class="{ 'router-link-active': activeTab === 'peers' }">
        <span class="tab-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>
        </span>
        <span>同路</span>
      </RouterLink>
      <RouterLink data-testid="tab-tool" to="/pages/action/index" :class="{ 'router-link-active': activeTab === 'action' }">
        <span class="tab-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M9 7V5a3 3 0 0 1 6 0v2" /><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M3 12h18M10 12v2h4v-2" /></svg>
        </span>
        <span>行动</span>
      </RouterLink>
      <RouterLink data-testid="tab-me" to="/pages/me/index" :class="{ 'router-link-active': activeTab === 'me' }">
        <span class="tab-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></svg>
        </span>
        <span>我的</span>
      </RouterLink>
    </nav>
  </main>
</template>
