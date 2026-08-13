<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { menu } from '../router';
import sidebarTreeUrl from '../assets/sidebar-tree-reference.png';

const route = useRoute();
const router = useRouter();
const sidebarCollapsed = ref(false);
const workspaceQuery = ref('');
const dayFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit',
});
const currentDay = new Date();
const currentDayLabel = dayFormatter.format(currentDay).replace(/\//g, '-');
const rangeStart = new Date(currentDay);
rangeStart.setDate(rangeStart.getDate() - 6);
const currentDateRangeLabel = `${dayFormatter.format(rangeStart).replace(/\//g, '-')} ~ ${currentDayLabel}`;

/**
 * Keep the main operating loop visible on desktop.  The ten entries below are
 * real routed work surfaces used in the admin acceptance flow; lightweight
 * dictionaries remain in the auxiliary disclosure instead of displacing an
 * operational page from the first screen.
 */
const primaryPaths = [
  '/dashboard',
  '/users',
  '/posts',
  '/replies/moderation',
  '/ai/providers',
  '/ai/routes',
  '/ai/jobs',
  '/ops/feedback',
  '/ops/config',
];

const currentItem = computed(() => menu.find((item) => item.path === route.path));
const currentPage = computed(() => currentItem.value?.label ?? '管理后台');
const primaryMenu = computed(() => primaryPaths
  .map((path) => menu.find((item) => item.path === path))
  .filter((item): item is NonNullable<typeof item> => Boolean(item)));
const secondaryMenu = computed(() => menu.filter((item) => !primaryPaths.includes(item.path)));
const secondaryMenuActive = computed(() => secondaryMenu.value.some((item) => item.path === route.path));

type StrokePaths = readonly string[];

const fallbackIcon: StrokePaths = ['M5 12H19'];
const icons: Record<string, StrokePaths> = {
  '/dashboard': ['M4 13H8V5H4V13Z', 'M10 20H14V4H10V20Z', 'M16 20H20V9H16V20Z'],
  '/users': ['M16 21V19C16 16.8 14.2 15 12 15H6C3.8 15 2 16.8 2 19V21', 'M9 11C11.2 11 13 9.2 13 7C13 4.8 11.2 3 9 3C6.8 3 5 4.8 5 7C5 9.2 6.8 11 9 11Z', 'M22 21V19C22 17.1 20.7 15.5 19 15.1', 'M16 3.2C17.8 3.7 19 5.2 19 7C19 8.8 17.8 10.3 16 10.8'],
  '/posts': ['M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z', 'M14 2V8H20', 'M8 13H16', 'M8 17H16'],
  '/replies/moderation': ['M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z', 'M8.5 12L10.8 14.2L15.8 9.4'],
  '/ai/providers': ['M9 3H15V5H18C19.1 5 20 5.9 20 7V10H18V14H20V17C20 18.1 19.1 19 18 19H15V21H9V19H6C4.9 19 4 18.1 4 17V14H6V10H4V7C4 5.9 4.9 5 6 5H9V3Z', 'M9 10H15V16H9V10Z'],
  '/ai/routes': ['M5 4H15L12 8L15 12H5V4Z', 'M10 12V21', 'M10 15H20L17 18L20 21H10'],
  '/ai/jobs': ['M9 3H6C4.9 3 4 3.9 4 5V21H16C17.1 21 18 20.1 18 19V8L13 3H9Z', 'M13 3V8H18', 'M8 12H14', 'M8 16H12', 'M16.5 15.5L18 17L21 13.5'],
  '/ops/feedback': ['M3 5H21V19H3V5Z', 'M3 7L12 13L21 7'],
  '/ops/config': ['M12 15.5C13.9 15.5 15.5 13.9 15.5 12C15.5 10.1 13.9 8.5 12 8.5C10.1 8.5 8.5 10.1 8.5 12C8.5 13.9 10.1 15.5 12 15.5Z', 'M19.4 15A1.7 1.7 0 0 0 19.7 16.9L19.8 17C19.3 17.9 18.6 18.6 17.7 19.1L17.6 19C17.1 18.7 16.5 18.7 16 19L15.5 19.3C15.1 19.6 14.8 20.1 14.8 20.7V21C13.8 21.3 12.8 21.3 11.8 21V20.7C11.8 20.1 11.5 19.6 11 19.3L10.5 19C10 18.7 9.4 18.7 8.9 19L8.8 19.1C7.9 18.6 7.2 17.9 6.7 17L6.8 16.9C7.1 16.4 7.1 15.8 6.8 15.3L6.5 14.8C6.2 14.3 5.7 14 5.1 14H4.8C4.5 13 4.5 12 4.8 11H5.1C5.7 11 6.2 10.7 6.5 10.2L6.8 9.7C7.1 9.2 7.1 8.6 6.8 8.1L6.7 8C7.2 7.1 7.9 6.4 8.8 5.9L8.9 6C9.4 6.3 10 6.3 10.5 6L11 5.7C11.5 5.4 11.8 4.9 11.8 4.3V4C12.8 3.7 13.8 3.7 14.8 4V4.3C14.8 4.9 15.1 5.4 15.5 5.7L16 6C16.5 6.3 17.1 6.3 17.6 6L17.7 5.9C18.6 6.4 19.3 7.1 19.8 8L19.7 8.1C19.4 8.6 19.4 9.2 19.7 9.7L20 10.2C20.3 10.7 20.8 11 21.4 11H21.7C22 12 22 13 21.7 14H21.4C20.8 14 20.3 14.3 20 14.8L19.4 15Z'],
  '/audit-logs': ['M3 12A9 9 0 1 0 6 5.3', 'M3 4V9H8', 'M12 7V12L15.5 14.2'],
  '/ops/faqs': ['M12 22A10 10 0 1 0 12 2A10 10 0 0 0 12 22Z', 'M9.1 9C9.4 7.4 10.6 6.5 12.1 6.5C13.8 6.5 15 7.6 15 9.1C15 10.3 14.3 11 13.2 11.8C12.2 12.5 12 13.1 12 14.2', 'M12 17.5H12.01'],
  '/ops/reply-presets': ['M20 15C20 16.1 19.1 17 18 17H9L5 21V17H4C2.9 17 2 16.1 2 15V6C2 4.9 2.9 4 4 4H18C19.1 4 20 4.9 20 6V15Z', 'M7 9H15', 'M7 12H12'],
  '/ops/feedback-categories': ['M20 13L13 20C12.6 20.4 12 20.6 11.4 20.4L4.2 18.1C3.5 17.9 3 17.3 3 16.5V5C3 3.9 3.9 3 5 3H16.5C17.3 3 17.9 3.5 18.1 4.2L20.4 11.4C20.6 12 20.4 12.6 20 13Z', 'M7.5 7.5H7.51'],
};

const navTestIds: Record<string, string> = {
  '/dashboard': 'admin-nav-dashboard',
  '/users': 'admin-nav-users',
  '/posts': 'admin-nav-posts',
  '/replies/moderation': 'admin-nav-replies',
  '/ai/providers': 'admin-nav-providers',
  '/ai/routes': 'admin-nav-routes',
  '/ai/jobs': 'admin-nav-jobs',
  '/ops/feedback': 'admin-nav-feedback',
  '/ops/faqs': 'admin-nav-faqs',
  '/ops/reply-presets': 'admin-nav-presets',
  '/ops/feedback-categories': 'admin-nav-categories',
  '/ops/config': 'admin-nav-config',
  '/audit-logs': 'admin-nav-audit',
};

function searchWorkspace() {
  const query = workspaceQuery.value.trim();
  if (!query) return;
  void router.push({ path: '/posts', query: { q: query } });
}
</script>

<template>
  <section class="admin-shell" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <aside class="side" aria-label="晚安树洞后台主导航">
      <div class="brand">
        <RouterLink class="brand-home" to="/dashboard" aria-label="返回数据总览">
          <svg class="brand-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
            <circle cx="32" cy="32" r="31" fill="#EEF3E8" />
            <path d="M14 30C12 19 21 10 32 12C42 10 52 18 51 29C58 38 52 50 42 50H23C13 50 8 38 14 30Z" fill="#718C58" />
            <path d="M32 22V49M32 29L25 22M32 33L40 25M32 38L24 32M32 39L41 34" stroke="#FFFDF8" stroke-width="1.8" stroke-linecap="round" />
            <path d="M24 50V42C24 36.5 27.6 33 32 33C36.4 33 40 36.5 40 42V50H24Z" fill="#FFFDF8" />
            <path d="M28 50V42C28 39.4 29.8 37.5 32 37.5C34.2 37.5 36 39.4 36 42V50" stroke="#DCE7D2" stroke-width="1.5" />
          </svg>
          <span class="brand-copy"><strong>晚安树洞</strong><small>管理后台</small></span>
        </RouterLink>
        <button
          class="sidebar-toggle"
          type="button"
          data-testid="admin-sidebar-toggle"
          :aria-expanded="!sidebarCollapsed"
          :aria-label="sidebarCollapsed ? '展开侧边导航' : '收起侧边导航'"
          @click="sidebarCollapsed = !sidebarCollapsed"
        >
          <svg class="sidebar-toggle-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path :d="sidebarCollapsed ? 'M9 18L15 12L9 6' : 'M15 18L9 12L15 6'" /></svg>
        </button>
      </div>

      <nav class="primary-nav" aria-label="后台导航">
        <RouterLink
          v-for="item in primaryMenu"
          :key="item.path"
          :to="item.path"
          :title="sidebarCollapsed ? item.label : undefined"
          :aria-label="sidebarCollapsed ? item.label : undefined"
          :data-testid="navTestIds[item.path]"
        >
          <svg class="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path v-for="path in (icons[item.path] ?? fallbackIcon)" :key="path" :d="path" />
          </svg>
          <span class="nav-label">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <details v-if="secondaryMenu.length" class="more-nav" :open="secondaryMenuActive">
        <summary>
          <svg class="more-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
          <span class="more-label">更多管理</span>
          <svg class="more-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" /></svg>
        </summary>
        <div class="more-nav-links">
          <RouterLink
            v-for="item in secondaryMenu"
            :key="item.path"
            :to="item.path"
            :title="sidebarCollapsed ? item.label : undefined"
            :aria-label="sidebarCollapsed ? item.label : undefined"
            :data-testid="navTestIds[item.path]"
          >
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path v-for="path in (icons[item.path] ?? fallbackIcon)" :key="path" :d="path" />
            </svg>
            <span class="nav-label">{{ item.label }}</span>
          </RouterLink>
        </div>
      </details>

      <div class="side-footer" aria-label="晚安树洞品牌插画">
        <img class="footer-tree footer-tree-reference" :src="sidebarTreeUrl" alt="" aria-hidden="true" />
        <svg class="footer-tree legacy-footer-tree" viewBox="0 0 180 164" fill="none" aria-hidden="true" focusable="false">
          <ellipse cx="90" cy="148" rx="76" ry="11" fill="#E6ECD8" />
          <path d="M31 144C36 120 55 112 69 124C72 104 94 100 104 119C117 99 143 106 147 130C164 126 174 136 176 145H31V144Z" fill="#D5E0C1" />
          <path d="M37 92C25 75 32 49 54 42C46 24 63 9 82 16C93 1 119 5 125 25C148 19 164 39 156 59C173 73 164 99 143 101C135 123 105 127 91 108C72 123 48 113 47 95C43 96 40 95 37 92Z" fill="#B6C78E" />
          <path d="M50 91C43 75 53 56 70 53C69 37 87 29 101 40C115 28 136 39 135 57C153 65 153 88 136 94C134 111 112 117 99 102C84 115 61 106 63 91C58 94 53 94 50 91Z" fill="#8EA76E" />
          <path d="M81 145C85 117 91 92 88 68C85 56 79 47 70 38C68 34 71 30 76 31C86 40 92 49 98 60C101 46 109 35 119 25C123 22 128 26 126 31C113 46 108 61 108 78C114 68 122 61 133 55C138 55 140 59 137 63C122 73 116 86 115 100C115 118 122 133 129 145H81Z" fill="#E5C887" />
          <path d="M99 68C98 94 102 121 106 145M85 103C94 96 104 93 114 94" stroke="#C79D5D" stroke-width="2" stroke-linecap="round" />
          <path d="M107 145V96C107 79 119 67 134 67C149 67 161 79 161 96V145H107Z" fill="#F0D99C" />
          <path d="M113 145V98C113 84 122 75 134 75C146 75 155 84 155 98V145H113Z" fill="#668158" />
          <path d="M134 76V145M113 111H155" stroke="#A7B889" stroke-width="1.6" />
          <circle cx="148" cy="112" r="2.8" fill="#F4D488" />
          <path d="M155 101L165 95V122" stroke="#748C5C" stroke-width="1.8" stroke-linecap="round" />
          <path d="M161 105H171L169 119H163L161 105Z" fill="#F4D488" />
          <path d="M25 55L28 62L35 65L28 68L25 75L22 68L15 65L22 62L25 55Z" fill="#F0D99C" />
          <path d="M148 25L150 30L155 32L150 34L148 39L146 34L141 32L146 30L148 25Z" fill="#F0D99C" />
          <path d="M160 44C153 50 152 59 157 66C162 73 171 75 178 70C174 78 166 83 157 83C145 83 136 74 136 62C136 51 144 43 154 41C157 40 159 42 160 44Z" fill="#F2DCA4" />
        </svg>
        <p>晚安，有树洞在 <svg class="footer-heart" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.8 5.8C19 3.9 16 4 14.3 5.7L12 8L9.7 5.7C8 4 5 3.9 3.2 5.8C1.5 9.2 3.6 12.8 12 20C20.4 12.8 22.5 9.2 20.8 5.8Z" /></svg></p>
      </div>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div class="top-title">
          <span class="workspace-name">晚安树洞管理后台</span>
          <span class="topbar-divider" aria-hidden="true"></span>
          <span class="topbar-page">{{ currentPage }}</span>
        </div>
        <form class="topbar-search" role="search" @submit.prevent="searchWorkspace">
          <svg class="topbar-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.8" cy="10.8" r="5.8" /><path d="M15.2 15.2L20 20" /></svg>
          <input v-model="workspaceQuery" aria-label="搜索树洞内容" placeholder="搜索内容、用户、工单等" />
        </form>
        <div class="topbar-date" aria-label="当前运营日期">
          <svg class="topbar-date-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4.5" y="5.5" width="15" height="14" rx="2" /><path d="M8 3.5V7.5M16 3.5V7.5M4.5 10H19.5" /></svg>
          <time data-visual-mask="time" :datetime="currentDayLabel">{{ currentDateRangeLabel }}</time>
          <svg class="topbar-date-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 10L12 15L17 10" /></svg>
        </div>
        <div class="operator" aria-label="当前管理员：admin">
          <svg class="operator-avatar" viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <circle cx="20" cy="20" r="20" fill="#EDF2E6" />
            <path d="M9 35C10.1 28.2 14.2 24.8 20 24.8C25.8 24.8 29.9 28.2 31 35" fill="#758E62" />
            <circle cx="20" cy="16.5" r="7.2" fill="#F2D8B6" />
            <path d="M12.5 17C11.8 10.1 15.2 6.4 20.3 6.4C26.3 6.4 29.1 10.9 27.3 17.4C25.2 14.7 22.5 13.2 18.2 13.2C16.2 15.7 14.4 17 12.5 17Z" fill="#5F5549" />
            <path d="M17.2 18.5H17.3M22.7 18.5H22.8M18.3 21.5C19.4 22.3 20.6 22.3 21.7 21.5" stroke="#7C6557" stroke-width="1.1" stroke-linecap="round" />
          </svg>
          <div class="operator-copy"><b>admin</b><small>管理员</small></div>
        </div>
      </header>
      <main class="main"><slot /></main>
    </section>
  </section>
</template>

<style scoped>
/* The shell deliberately owns only its navigation and heading geometry. Page
 * content keeps the individual, data-backed layout supplied by each view. */
.admin-shell {
  grid-template-columns: 226px minmax(0, 1fr);
  overflow-x: clip;
}

.admin-shell.sidebar-collapsed {
  grid-template-columns: 76px minmax(0, 1fr);
}

.side {
  gap: 0;
  padding: 28px 13px 14px;
  overflow-x: hidden;
  border-right-color: #ebe8df;
}

.brand {
  align-items: center;
  min-height: 54px;
  margin: 0 4px 36px;
}

.brand-home {
  display: flex;
  flex: 1 1 auto;
  gap: 15px;
  align-items: center;
  min-width: 0;
  min-height: 0;
  margin: 0;
  padding: 0;
  border-radius: 0;
  color: inherit;
  text-decoration: none;
}

.brand-home.router-link-active {
  color: inherit;
  background: transparent;
}

.brand-mark {
  display: block;
  width: 58px;
  height: 58px;
  flex: 0 0 58px;
}

.brand-copy {
  min-width: 0;
}

.brand-copy strong {
  overflow: hidden;
  font-size: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brand-copy small {
  margin-top: 3px;
  font-size: 14px;
}

.sidebar-toggle {
  display: none;
  width: 28px;
  min-width: 28px;
  min-height: 28px;
  place-items: center;
  padding: 0;
  border-color: #e3e8dd;
  border-radius: 50%;
  color: #6b8460;
  background: #f9fbf6;
  transition: border-color .16s ease, background .16s ease, color .16s ease, transform .16s ease;
}

.sidebar-toggle:hover { border-color: #b7caab; color: #52743f; background: #f0f6e9; }
.sidebar-toggle:focus-visible { outline: 3px solid rgba(106, 143, 82, .24); outline-offset: 2px; }
.sidebar-toggle-icon { width: 16px; height: 16px; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

.primary-nav {
  gap: 10px;
}

.side a:not(.brand-home),
.more-nav summary {
  display: flex;
  gap: 16px;
  align-items: center;
  min-height: 48px;
  margin: 0;
  padding: 10px 25px;
  border-radius: 10px;
  color: #54514b;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.25;
  text-decoration: none;
}

.side a:not(.brand-home):hover,
.more-nav summary:hover {
  color: #557843;
  background: #f2f6ed;
}

.side a:not(.brand-home).router-link-active {
  color: #557843;
  background: #e8f0e1;
}

.nav-icon {
  display: block;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  color: #6a6c66;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.side a:not(.brand-home).router-link-active .nav-icon {
  color: #62864d;
}

.more-nav {
  position: relative;
  display: block;
  margin-top: 4px;
}

.more-nav summary {
  list-style: none;
  cursor: pointer;
  user-select: none;
}

.more-nav summary::-webkit-details-marker {
  display: none;
}

.more-nav summary::after {
  content: none;
}

.more-icon {
  display: block;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  color: #78766f;
  fill: currentColor;
}

.more-label {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more-chevron {
  display: block;
  width: 16px;
  height: 16px;
  margin-left: auto;
  color: #8a887f;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform .16s ease;
}

.more-nav[open] .more-chevron {
  transform: rotate(180deg);
}

.more-nav-links {
  display: grid;
  gap: 4px;
  margin-top: 4px;
  padding-left: 10px;
}

.more-nav:not([open]) .more-nav-links {
  display: none;
}

.more-nav-links .nav-icon {
  width: 16px;
  height: 16px;
  flex-basis: 16px;
}

.side-footer {
  padding: 14px 4px 0;
  transform: translateY(-48px);
}

.footer-tree {
  display: block;
  width: 132px;
  height: 124px;
  margin-bottom: 2px;
}

.footer-tree.footer-tree-reference {
  width: 220px;
  height: 180px;
  margin-left: -18px;
  object-fit: cover;
}

.legacy-footer-tree { display: none; }

.side-footer p {
  font-size: 14px;
}

.topbar {
  gap: 20px;
  min-height: 98px;
  padding: 0 24px 0 25px;
}

.top-title {
  gap: 20px;
}

.workspace-name {
  flex: 0 0 auto;
  font-size: 20px;
  letter-spacing: .01em;
  white-space: nowrap;
}

.topbar-page {
  flex: 0 0 auto;
  font-size: 16px;
}

.topbar-search {
  flex-basis: 252px;
  max-width: 252px;
  margin-left: 240px;
}

.topbar-date {
  display: flex;
  width: 245px;
  height: 46px;
  flex: 0 0 245px;
  gap: 7px;
  align-items: center;
  padding: 0 12px;
  border: 1px solid #e6e1d7;
  border-radius: 13px;
  color: #625e57;
  background: #fffefa;
  font-size: 14px;
  white-space: nowrap;
}

.topbar-date-icon {
  width: 19px;
  height: 19px;
  flex: 0 0 19px;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.topbar-date time {
  flex: 1 1 auto;
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  font-size: 13px;
}

.topbar-date-chevron {
  width: 16px;
  height: 16px;
  margin-left: auto;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.operator {
  display: flex;
  gap: 9px;
  align-items: center;
  min-width: max-content;
}

.operator-avatar {
  display: block;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  overflow: visible;
}

.operator-copy {
  display: grid;
  gap: 1px;
}

.operator-copy b,
.operator-copy small {
  display: block;
}

.operator-copy small {
  color: #8a857c;
  font-size: 12px;
}

.sidebar-collapsed .side {
  padding-inline: 10px;
}

.sidebar-collapsed .brand {
  justify-content: center;
  margin-inline: 0;
}

.sidebar-collapsed .brand-home {
  flex: 0 0 58px;
}

.sidebar-collapsed .brand-copy,
.sidebar-collapsed .nav-label,
.sidebar-collapsed .more-label,
.sidebar-collapsed .more-chevron,
.sidebar-collapsed .side-footer p {
  display: none;
}

.sidebar-collapsed .sidebar-toggle {
  position: absolute;
  right: -15px;
  z-index: 3;
}

.sidebar-collapsed .side a:not(.brand-home),
.sidebar-collapsed .more-nav summary {
  justify-content: center;
  padding-inline: 8px;
}

.sidebar-collapsed .more-nav {
  display: block;
}

.sidebar-collapsed .more-nav-links {
  position: absolute;
  z-index: 8;
  top: 0;
  left: calc(100% + 10px);
  width: 180px;
  margin: 0;
  padding: 7px;
  border: 1px solid #e6e7df;
  border-radius: 10px;
  background: #fffefa;
  box-shadow: 0 12px 28px rgba(53, 59, 45, .12);
}

.sidebar-collapsed .more-nav-links .nav-label {
  display: inline;
}

.sidebar-collapsed .footer-tree {
  width: 48px;
  height: 48px;
}

@media (max-height: 840px) and (min-width: 821px) {
  .side-footer {
    display: none;
  }
}

@media (min-height: 980px) {
  .footer-tree {
    width: 170px;
    height: 158px;
  }
}

@media (max-width: 1180px) {
  .admin-shell {
    grid-template-columns: 210px minmax(0, 1fr);
  }

  .admin-shell.sidebar-collapsed {
    grid-template-columns: 72px minmax(0, 1fr);
  }

  .workspace-name {
    font-size: 18px;
  }

  .topbar-search {
    margin-left: auto;
    min-width: 170px;
  }

  .topbar-date {
    display: none;
  }
}

@media (min-width: 1181px) and (max-width: 1400px) {
  .topbar-search {
    margin-left: 190px;
  }

  .topbar-date {
    width: 235px;
    flex-basis: 235px;
  }
}

@media (min-width: 1600px) {
  .topbar-search {
    margin-left: auto;
  }
}

@media (max-width: 820px) {
  .admin-shell,
  .admin-shell.sidebar-collapsed {
    display: block;
  }

  .side,
  .sidebar-collapsed .side {
    position: static;
    display: flex;
    flex-direction: row;
    align-items: center;
    min-height: 74px;
    height: auto;
    padding: 8px 12px;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .brand,
  .sidebar-collapsed .brand {
    flex: 0 0 auto;
    margin: 0 8px 0 0;
  }

  .brand-home,
  .sidebar-collapsed .brand-home {
    flex: 0 0 auto;
  }

  .brand-copy,
  .sidebar-collapsed .brand-copy {
    display: none;
  }

  .sidebar-toggle {
    display: none;
  }

  .primary-nav {
    display: flex;
    gap: 5px;
  }

  .side a:not(.brand-home),
  .sidebar-collapsed .side a:not(.brand-home) {
    min-height: 42px;
    padding: 9px 12px;
  }

  .nav-label,
  .sidebar-collapsed .nav-label,
  .more-label,
  .sidebar-collapsed .more-label {
    display: inline;
  }

  .more-nav,
  .sidebar-collapsed .more-nav {
    flex: 0 0 auto;
    margin: 0 0 0 5px;
  }

  .sidebar-collapsed .more-nav-links {
    position: static;
    width: auto;
    margin-top: 4px;
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
  }

  .side-footer {
    display: none;
  }

  .topbar {
    min-height: 72px;
    padding: 12px 16px;
  }

  .top-title {
    gap: 10px;
  }

  .workspace-name {
    display: none;
  }

  .topbar-divider {
    display: none;
  }

  .topbar-search {
    flex: 1 1 180px;
    max-width: none;
    min-width: 0;
  }

  .topbar-date {
    display: none;
  }

  .operator-copy {
    display: none;
  }
}
</style>
