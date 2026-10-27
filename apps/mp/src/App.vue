<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { Keyboard } from '@capacitor/keyboard';
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
  '/pages/future-self/index',
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
/**
 * The tab bar hides while the soft keyboard is open.
 *
 * With the keyboard up the web view is resized, so a fixed bottom action lands at the bottom of the
 * remaining viewport - directly under the tab bar, which then draws its labels over it. Measured on
 * the emulator: 继续整理 rendered behind 同路/行动/我的 (UI2-005). Hiding the bar while typing is also
 * the normal behaviour on a phone: the user is entering text, not navigating.
 */
const keyboardOpen = ref(false);
let removeKeyboardListeners: (() => void) | null = null;

onMounted(() => {
  // The plugin events, NOT the visual-viewport difference.
  //
  // Android resizes the web view for the keyboard, so innerHeight shrinks with it and
  // `innerHeight - visualViewport.height` stays near zero - the difference only measures anything
  // when the keyboard overlays instead of resizing. A first attempt used the difference and the bar
  // never hid. keyboardWillShow/Hide fire in both modes.
  try {
    const showHandle = Keyboard.addListener('keyboardWillShow', () => {
      keyboardOpen.value = true;
    });
    const hideHandle = Keyboard.addListener('keyboardWillHide', () => {
      keyboardOpen.value = false;
    });
    removeKeyboardListeners = () => {
      void showHandle.then((h) => h.remove());
      void hideHandle.then((h) => h.remove());
    };
  } catch {
    // No plugin (plain web build): the bar simply stays visible.
  }
});

onUnmounted(() => {
  removeKeyboardListeners?.();
});

const showTabbar = computed(() => tabbarPaths.has(route.path) && !keyboardOpen.value);
const activeTab = computed(() => {
  if (route.path.startsWith('/pages/tonight')) return 'tonight';
  if (route.path.startsWith('/pages/peers')) return 'peers';
  if (route.path.startsWith('/pages/peer/')) return 'peers';
  if (route.path.startsWith('/pages/action') || route.path.startsWith('/pages/support-plan')) return 'action';
  if (
    route.path.startsWith('/pages/journey') ||
    route.path.startsWith('/pages/safety') ||
    route.path.startsWith('/pages/reality-handoff')
  )
    return 'tonight';
  if (route.path.startsWith('/pages/reply') || route.path.startsWith('/pages/letter')) return 'tonight';
  if (route.path.startsWith('/pages/notifications')) return 'me';
  if (route.path.startsWith('/pages/tool')) return 'action';
  if (
    route.path.startsWith('/pages/me') ||
    route.path.startsWith('/pages/recovery') ||
    route.path.startsWith('/pages/diary') ||
    route.path.startsWith('/pages/archive') ||
    route.path.startsWith('/pages/report') ||
    route.path.startsWith('/pages/favorite') ||
    route.path.startsWith('/pages/settings') ||
    route.path.startsWith('/pages/help') ||
    route.path.startsWith('/pages/feedback') ||
    route.path.startsWith('/pages/future-self')
  )
    return 'me';
  return 'tonight';
});
</script>

<template>
  <main class="phone-shell">
    <RouterView />
    <nav v-if="showTabbar" class="tabbar" aria-label="底部导航">
      <RouterLink
        data-testid="tab-square"
        to="/pages/tonight/index"
        :class="{ 'router-link-active': activeTab === 'tonight' }"
      >
        <span class="tab-icon" aria-hidden="true">
          <AppIcon name="moon" :size="22" />
        </span>
        <span>今晚</span>
      </RouterLink>
      <RouterLink
        data-testid="tab-letter"
        to="/pages/peers/index"
        :class="{ 'router-link-active': activeTab === 'peers' }"
      >
        <span class="tab-icon" aria-hidden="true">
          <AppIcon name="people" :size="22" />
        </span>
        <span>同路</span>
      </RouterLink>
      <RouterLink
        data-testid="tab-tool"
        to="/pages/action/index"
        :class="{ 'router-link-active': activeTab === 'action' }"
      >
        <span class="tab-icon" aria-hidden="true">
          <AppIcon name="check-circle" :size="22" />
        </span>
        <span>行动</span>
      </RouterLink>
      <RouterLink data-testid="tab-me" to="/pages/me/index" :class="{ 'router-link-active': activeTab === 'me' }">
        <span class="tab-icon" aria-hidden="true">
          <AppIcon name="user" :size="22" />
        </span>
        <span>我的</span>
      </RouterLink>
    </nav>
  </main>
</template>
