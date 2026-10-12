<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Keyboard } from '@capacitor/keyboard';
import { api } from '../api';
import AppIcon from '../components/icons/AppIcon.vue';

type Journey = { id: string; title: string; domain: string; stage: string; summary?: string };
type TonightItem = {
  journey: Journey | null;
  activeActions: Array<{ id: string; title: string }>;
  counts: { activeActions: number; dueCheckins: number; followUps: number; matches: number };
};
type Notice = { id: string; title: string; body: string; targetRoute?: string; status: string };

const DRAFT_KEY = 'goodnight_tonight_draft';

const router = useRouter();
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const home = ref<TonightItem | null>(null);
const notices = ref<Notice[]>([]);
const relationSheet = ref(false);
const categorySheet = ref(false);
const selectedRelation = ref('');
const form = ref({ domain: '其他', content: '' });

const keyboardHeight = ref(0);
const isKeyboardOpen = ref(false);

const visibleCategories = [
  { label: '感情', domain: '关系' },
  { label: '工作', domain: '工作' },
  { label: '家里', domain: '家庭' },
  { label: '睡眠', domain: '睡眠' },
];

const allCategories = [
  { label: '感情与关系', domain: '关系', hasScenes: true },
  { label: '工作与学习', domain: '工作' },
  { label: '家庭', domain: '家庭' },
  { label: '睡眠与健康', domain: '睡眠' },
  { label: '孤独', domain: '孤独' },
  { label: '暂时说不清', domain: '其他' },
];

const relationScenes = ['刚分手', '放不下', '想联系 TA', '吵架了', '暧昧很累', '被背叛', '不知道要不要继续'];
const unreadCount = computed(() => notices.value.filter((item) => item.status === 'unread').length);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [tonight, notification] = await Promise.all([
      api.get<{ item: TonightItem }>('/api/v1/tonight'),
      api.get<{ items: Notice[] }>('/api/v1/notifications'),
    ]);
    home.value = tonight.item;
    notices.value = notification.items;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '今晚的内容暂时没有加载出来';
  } finally {
    loading.value = false;
  }
}

function restoreDraft() {
  try {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      form.value.content = draft;
    }
  } catch {
    // ignore storage error
  }
}

watch(
  () => form.value.content,
  (val) => {
    try {
      localStorage.setItem(DRAFT_KEY, val);
    } catch {
      // ignore
    }
  },
);

function chooseVisibleCategory(cat: { label: string; domain: string }) {
  if (cat.domain === '关系') {
    form.value.domain = '关系';
    relationSheet.value = true;
    return;
  }
  form.value.domain = cat.domain;
}

function chooseCategoryFromSheet(cat: { label: string; domain: string; hasScenes?: boolean }) {
  categorySheet.value = false;
  form.value.domain = cat.domain;
  if (cat.hasScenes) {
    relationSheet.value = true;
  }
}

function chooseRelation(value: string) {
  selectedRelation.value = value;
  form.value.domain = '关系';
  relationSheet.value = false;
}

function isCategorySelected(domain: string) {
  return form.value.domain === domain;
}

async function createJourney() {
  if (!form.value.content.trim()) {
    error.value = '先写下一句也可以。';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    const response = await api.post<{
      journey: Journey;
      job: { id: string };
      safety?: { needsRealWorldSupport?: boolean };
    }>('/api/v1/journeys', {
      domain: form.value.domain,
      relationScene: selectedRelation.value,
      content: form.value.content.trim(),
    });
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
    if (response.safety?.needsRealWorldSupport) {
      await router.push(`/pages/safety/index?journeyId=${response.journey.id}`);
      return;
    }
    await router.push(`/pages/journey/detail?id=${response.journey.id}&analysisJob=${response.job.id}`);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '这段经历暂时没有保存成功';
  } finally {
    saving.value = false;
  }
}

let removeKeyboardListeners: (() => void) | null = null;

/**
 * How far the keyboard actually intrudes on the web view, in CSS px.
 *
 * NOT `info.keyboardHeight`. The window uses the default soft-input mode, so Android *resizes* the
 * web view when the keyboard opens: `innerHeight` shrinks by the keyboard height, and the keyboard
 * occupies no additional space inside the resulting viewport. Offsetting a fixed element by the raw
 * keyboard height therefore moved it up twice - measured on the emulator as 继续整理 floating in the
 * middle of the page, above the input it submits (ISSUE-005).
 *
 * The difference between the layout and visual viewports is correct in both modes: zero when the
 * window is resized, the keyboard height when the keyboard overlays instead.
 */
function viewportKeyboardInset(): number {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, window.innerHeight - viewport.height - (viewport.offsetTop || 0));
}

onMounted(() => {
  restoreDraft();
  void load();

  try {
    const showHandle = Keyboard.addListener('keyboardWillShow', () => {
      keyboardHeight.value = viewportKeyboardInset();
      isKeyboardOpen.value = true;
    });
    const hideHandle = Keyboard.addListener('keyboardWillHide', () => {
      keyboardHeight.value = 0;
      isKeyboardOpen.value = false;
    });
    removeKeyboardListeners = () => {
      void showHandle.then((h) => h.remove());
      void hideHandle.then((h) => h.remove());
    };
  } catch {
    // Keyboard plugin not supported in web fallback
  }

  if (window.visualViewport) {
    const onViewportResize = () => {
      const inset = viewportKeyboardInset();
      if (inset > 120) {
        keyboardHeight.value = inset;
        isKeyboardOpen.value = true;
      } else if (!removeKeyboardListeners) {
        // Only the fallback owns this state; with the plugin present it drives show/hide itself.
        keyboardHeight.value = 0;
        isKeyboardOpen.value = false;
      }
    };
    window.visualViewport.addEventListener('resize', onViewportResize);
  }
});

onUnmounted(() => {
  if (removeKeyboardListeners) {
    removeKeyboardListeners();
  }
});
</script>

<template>
  <div class="tonight-v2">
    <!-- Top Header -->
    <header class="tonight-header">
      <div class="header-left">
        <h1 class="header-title">今晚</h1>
      </div>
      <div class="header-right">
        <button
          class="icon-button"
          data-testid="notification-bell"
          aria-label="提醒与通知"
          @click="router.push('/pages/notifications/index')"
        >
          <AppIcon name="bell" :size="22" />
          <span v-if="unreadCount > 0" class="badge">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
        </button>
      </div>
    </header>

    <div v-if="error" class="error-banner" role="alert">{{ error }}</div>

    <div v-if="loading" class="loading-state">
      <p>正在读取今晚记录…</p>
    </div>

    <!-- Main Scroll Content -->
    <main v-else class="tonight-content">
      <div class="intro-block">
        <div class="brand-line">晚安树洞 <span class="sep">/</span> 今天</div>
        <h2 class="prompt-title">今天有什么想说的？</h2>
      </div>

      <!-- Textarea Input Area -->
      <section class="composer-card" data-testid="tonight-entry">
        <textarea
          v-model="form.content"
          class="composer-textarea"
          data-testid="tonight-input"
          maxlength="1000"
          placeholder="从一句话开始，也可以写很多。"
          rows="4"
        />
        <div class="composer-footer">
          <small class="counter">{{ form.content.length }}/1000</small>
        </div>
      </section>

      <!-- Category Filter Chips -->
      <div class="category-chips" aria-label="主题分类">
        <button
          v-for="cat in visibleCategories"
          :key="cat.domain"
          type="button"
          class="category-chip"
          :class="{ active: isCategorySelected(cat.domain) }"
          @click="chooseVisibleCategory(cat)"
        >
          {{ cat.label }}
        </button>
        <button
          type="button"
          class="category-chip more-chip"
          @click="categorySheet = true"
        >
          更多
          <AppIcon name="chevron-down" :size="14" />
        </button>
      </div>

      <div class="privacy-hint">仅自己可见 · 后续分享由你决定</div>

      <!-- Recent Records Section -->
      <section class="section-block">
        <div class="section-header">
          <h3 class="section-title">最近的记录</h3>
          <button class="more-link" type="button" @click="router.push('/pages/archive/index')">
            查看全部 ›
          </button>
        </div>

        <div v-if="home?.journey" class="list-rows">
          <button
            class="list-row"
            type="button"
            @click="router.push(`/pages/journey/detail?id=${home?.journey?.id}`)"
          >
            <div class="row-text">
              <div class="row-title">继续上次的旅程</div>
              <div class="row-sub">{{ home.journey.domain }} · {{ home.journey.title }}</div>
            </div>
            <span class="row-chev" aria-hidden="true">›</span>
          </button>
        </div>
        <div v-else class="empty-hint">暂无进行中的旅程记录</div>
      </section>

      <!-- Next Actions Section -->
      <section v-if="home?.activeActions && home.activeActions.length > 0" class="section-block">
        <div class="section-header">
          <h3 class="section-title">接下来可以做什么</h3>
        </div>
        <div class="list-rows">
          <button
            class="list-row"
            type="button"
            @click="router.push('/pages/action/index')"
          >
            <div class="row-text">
              <div class="row-title">{{ home.activeActions[0].title }}</div>
              <div class="row-sub">来自最近的旅程</div>
            </div>
            <span class="row-chev" aria-hidden="true">›</span>
          </button>
        </div>
      </section>
    </main>

    <!-- Sticky Bottom CTA -->
    <div
      class="sticky-cta"
      :style="{ bottom: isKeyboardOpen ? `${keyboardHeight}px` : 'calc(60px + env(safe-area-inset-bottom))' }"
    >
      <button
        class="primary-btn"
        data-testid="tonight-continue"
        type="button"
        :disabled="saving"
        @click="createJourney"
      >
        {{ saving ? '正在开始整理…' : '继续整理' }}
      </button>
    </div>

    <!-- Category Bottom Sheet -->
    <Teleport to="body">
      <div v-if="categorySheet" class="sheet-mask" @click.self="categorySheet = false">
        <div class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="cat-title">
          <div class="grabber" />
          <div class="sheet-top">
            <h3 id="cat-title" class="sheet-title">这件事更接近哪一类？</h3>
            <button class="sheet-close" aria-label="关闭" @click="categorySheet = false">✕</button>
          </div>
          <div class="sheet-list">
            <button
              v-for="cat in allCategories"
              :key="cat.domain"
              class="sheet-row"
              type="button"
              @click="chooseCategoryFromSheet(cat)"
            >
              <span>{{ cat.label }}</span>
              <span v-if="isCategorySelected(cat.domain)" class="sheet-tick">✓</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Relation Scene Sheet -->
    <Teleport to="body">
      <div v-if="relationSheet" class="sheet-mask" @click.self="relationSheet = false">
        <div class="bottom-sheet" data-testid="relation-sheet" role="dialog" aria-modal="true" aria-labelledby="rel-title">
          <div class="grabber" />
          <div class="sheet-top">
            <h3 id="rel-title" class="sheet-title">这段感情里，什么最让你难受？</h3>
            <button class="sheet-close" aria-label="关闭" @click="relationSheet = false">✕</button>
          </div>
          <div class="relation-grid">
            <button
              v-for="scene in relationScenes"
              :key="scene"
              class="relation-pill"
              :class="{ selected: selectedRelation === scene }"
              type="button"
              @click="chooseRelation(scene)"
            >
              {{ scene }}
            </button>
          </div>
          <button class="relation-skip" type="button" @click="chooseRelation('其他')">
            说不清，也可以直接写
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.tonight-v2 {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  min-height: 100vh;
  padding: 0 0 calc(128px + env(safe-area-inset-bottom));
  background: #FFFFFF;
  color: #242A32;
  font-family: var(--gn-font-body);
}

.tonight-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 20px;
  background: #FFFFFF;
  border-bottom: 1px solid #E8EBEF;
}

.header-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #242A32;
  letter-spacing: -0.3px;
}

.icon-button {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  min-height: 48px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #39454C;
  cursor: pointer;
}

.badge {
  position: absolute;
  top: 6px;
  right: 6px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: #BD4545;
  color: #FFFFFF;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  text-align: center;
}

.error-banner {
  margin: 12px 20px 0;
  padding: 10px 14px;
  border-radius: 8px;
  background: #FEF2F0;
  border: 1px solid #F6DCDA;
  color: #BD4545;
  font-size: 13px;
}

.loading-state {
  padding: 40px 20px;
  color: #757D87;
  font-size: 14px;
  text-align: center;
}

.tonight-content {
  padding: 16px 20px 0;
}

.intro-block {
  margin-bottom: 14px;
}

.brand-line {
  font-size: 12px;
  font-weight: 600;
  color: #275F56;
}

.sep {
  color: #BDC9C6;
  margin: 0 2px;
}

.prompt-title {
  margin: 12px 0 0;
  font-size: 22px;
  font-weight: 700;
  color: #242A32;
  line-height: 1.3;
}

.composer-card {
  position: relative;
  margin-top: 14px;
  border: 1px solid #DEE4E8;
  border-radius: 12px;
  background: #FFFFFF;
  padding: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.composer-textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 110px;
  border: 0;
  padding: 0;
  background: transparent;
  color: #242A32;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  outline: none;
}

.composer-textarea::placeholder {
  color: #9BA3AB;
}

.composer-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.counter {
  font-size: 11px;
  color: #9DA4AC;
}

.category-chips {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  overflow-x: auto;
  white-space: nowrap;
}

.category-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 48px;
  padding: 8px 14px;
  border: 1px solid #E8EBEF;
  border-radius: 8px;
  background: #FFFFFF;
  color: #606A74;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.category-chip.active {
  background: #EAF4EE;
  border-color: #C3DAD0;
  color: #275F56;
  font-weight: 600;
}

.more-chip {
  color: #757D87;
}

.privacy-hint {
  margin: 14px 0 20px;
  font-size: 12px;
  color: #757D87;
}

.section-block {
  margin-top: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #242A32;
}

.more-link {
  min-height: 48px;
  padding: 8px 0;
  border: 0;
  background: transparent;
  color: #757D87;
  font-size: 12px;
  cursor: pointer;
}

.list-rows {
  border-top: 1px solid #E8EBEF;
}

.list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 12px 0;
  border: 0;
  border-bottom: 1px solid #E8EBEF;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.row-text {
  flex: 1;
  min-width: 0;
}

.row-title {
  font-size: 14px;
  font-weight: 600;
  color: #242A32;
  line-height: 1.4;
}

.row-sub {
  margin-top: 4px;
  font-size: 12px;
  color: #757D87;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-chev {
  color: #AAB0B8;
  font-size: 20px;
  line-height: 1;
}

.empty-hint {
  padding: 14px 0;
  color: #9DA4AC;
  font-size: 13px;
  border-top: 1px solid #E8EBEF;
}

.sticky-cta {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  z-index: 15;
  box-sizing: border-box;
  width: min(430px, 100vw);
  padding: 10px 20px 12px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.85) 0%, #FFFFFF 30%);
}

.primary-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 48px;
  min-height: 48px;
  border: 0;
  border-radius: 10px;
  background: #275F56;
  color: #FFFFFF;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.primary-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  background: rgba(12, 21, 25, 0.35);
}

.bottom-sheet {
  box-sizing: border-box;
  width: min(430px, 100vw);
  max-height: 80vh;
  margin: 0 auto;
  overflow-y: auto;
  border-radius: 20px 20px 0 0;
  background: #FFFFFF;
  padding: 12px 20px calc(28px + env(safe-area-inset-bottom));
  box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.12);
}

.grabber {
  width: 38px;
  height: 4px;
  margin: 0 auto 16px;
  border-radius: 4px;
  background: #D9DDDF;
}

.sheet-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.sheet-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #242A32;
}

.sheet-close {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  min-height: 48px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #757D87;
  font-size: 16px;
  cursor: pointer;
}

.sheet-list {
  display: flex;
  flex-direction: column;
}

.sheet-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 50px;
  padding: 12px 0;
  border: 0;
  border-bottom: 1px solid #E8EBEF;
  background: transparent;
  color: #242A32;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.sheet-row:last-child {
  border-bottom: 0;
}

.sheet-tick {
  color: #275F56;
  font-size: 16px;
  font-weight: 700;
}

.relation-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.relation-pill {
  min-height: 48px;
  padding: 10px;
  border: 1px solid #E8EBEF;
  border-radius: 10px;
  background: #FFFFFF;
  color: #242A32;
  font-size: 13px;
  cursor: pointer;
}

.relation-pill.selected {
  border-color: #275F56;
  background: #EAF4EE;
  color: #275F56;
  font-weight: 600;
}

.relation-skip {
  width: 100%;
  min-height: 48px;
  border: 0;
  background: transparent;
  color: #757D87;
  font-size: 13px;
  cursor: pointer;
}
</style>
