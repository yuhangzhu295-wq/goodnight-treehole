<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import AppIcon from './components/icons/AppIcon.vue';

const route = useRoute();
const tabbarPaths = new Set([
  '/pages/tonight/index',
  '/pages/peers/index',
  '/pages/peer/requests',
  '/pages/peer/wait',
  '/pages/peer/consent',
  '/pages/peer/detail',
  '/pages/peer/conversation',
  '/pages/peer/graduate',
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
  '/pages/notifications/index',
  '/pages/journey/detail',
]);
const showTabbar = computed(() => tabbarPaths.has(route.path));
const activeTab = computed(() => {
  if (route.path.startsWith('/pages/tonight')) return 'tonight';
  if (route.path.startsWith('/pages/peers')) return 'peers';
  if (route.path.startsWith('/pages/peer/')) return 'peers';
  if (route.path.startsWith('/pages/action')) return 'action';
  if (route.path.startsWith('/pages/journey') || route.path.startsWith('/pages/safety') || route.path.startsWith('/pages/reality-handoff')) return 'tonight';
  if (route.path.startsWith('/pages/reply') || route.path.startsWith('/pages/letter')) return 'tonight';
  if (route.path.startsWith('/pages/notifications')) return 'me';
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
          <AppIcon name="tree" :size="22" />
        </span>
        <span>今晚</span>
      </RouterLink>
      <RouterLink data-testid="tab-letter" to="/pages/peers/index" :class="{ 'router-link-active': activeTab === 'peers' }">
        <span class="tab-icon" aria-hidden="true">
          <AppIcon name="people" :size="22" />
        </span>
        <span>同路</span>
      </RouterLink>
      <RouterLink data-testid="tab-tool" to="/pages/action/index" :class="{ 'router-link-active': activeTab === 'action' }">
        <span class="tab-icon" aria-hidden="true">
          <AppIcon name="step" :size="22" />
        </span>
        <span>行动</span>
      </RouterLink>
      <RouterLink data-testid="tab-me" to="/pages/me/index" :class="{ 'router-link-active': activeTab === 'me' }">
        <span class="tab-icon" aria-hidden="true">
          <AppIcon name="heart" :size="22" />
        </span>
        <span>我的</span>
      </RouterLink>
    </nav>
  </main>
</template>
