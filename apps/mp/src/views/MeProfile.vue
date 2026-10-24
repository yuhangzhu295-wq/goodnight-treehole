<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

type Profile = {
  id: string;
  nickname: string;
  anonymousCode: string;
  avatarUrl?: string;
  status?: string;
  createdAt?: string;
};

type SessionItem = {
  id: string;
  deviceLabel?: string | null;
  createdAt: string;
  expiresAt: string;
  lastUsedAt?: string | null;
  current: boolean;
};

const router = useRouter();
const profile = ref<Profile>();
// Starts true so the page never paints an empty frame before onMounted runs the first load.
const loading = ref(true);
const error = ref('');

const draftNickname = ref('');
const editingNickname = ref(false);
const saving = ref(false);
const saveMessage = ref('');
const saveError = ref('');

const showCodeNote = ref(false);
const showIdentityNote = ref(false);

const showSessions = ref(false);
const sessions = ref<SessionItem[]>([]);
const sessionsLoading = ref(false);
const sessionsError = ref('');
const confirmRevokeId = ref('');
const revokingId = ref('');
/** Discards a list response that started before a revocation changed the list. */
let sessionsRequest = 0;

/** The design shows a one-character avatar; it is derived from the real nickname, not a fixed glyph. */
const avatarInitial = computed(() => (profile.value?.nickname || '晚安旅人').slice(0, 1));
const nicknameChanged = computed(() => Boolean(profile.value) && draftNickname.value.trim() !== profile.value?.nickname);
/** Counted in user-visible characters of the value that will be saved: one emoji is one character. */
const nicknameLength = computed(() => Array.from(draftNickname.value.trim()).length);
const canSave = computed(
  () =>
    nicknameChanged.value &&
    !saving.value &&
    nicknameLength.value > 0 &&
    nicknameLength.value <= 20,
);

function goBack() {
  if (window.history.state?.back) router.back();
  else router.push('/pages/me/index');
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    profile.value = (await api.get<{ item: Profile }>('/api/v1/me/profile')).item;
    draftNickname.value = profile.value.nickname;
  } catch (cause: any) {
    error.value = cause?.message ?? '资料读取失败，请稍后重试。';
  } finally {
    loading.value = false;
  }
}

function toggleNickname() {
  if (saving.value) return;
  if (editingNickname.value) {
    // Closing without saving discards the draft, so the button cannot stay armed for an invisible edit.
    draftNickname.value = profile.value?.nickname ?? '';
    editingNickname.value = false;
    return;
  }
  saveMessage.value = '';
  saveError.value = '';
  editingNickname.value = true;
}

async function save() {
  if (!canSave.value) return;
  const nickname = draftNickname.value.trim();
  saving.value = true;
  saveMessage.value = '';
  saveError.value = '';
  try {
    const result = await api.patch<{ item: Profile }>('/api/v1/me/profile', { nickname });
    profile.value = result.item;
    draftNickname.value = result.item.nickname;
    editingNickname.value = false;
    saveMessage.value = '资料已保存';
  } catch (cause: any) {
    saveError.value = cause?.message ?? '资料保存失败，请稍后重试。';
  } finally {
    saving.value = false;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

async function loadSessions() {
  const ticket = ++sessionsRequest;
  sessionsLoading.value = true;
  sessionsError.value = '';
  try {
    const items = (await api.get<{ items: SessionItem[] }>('/api/v1/auth/sessions')).items;
    // A response that started before a revocation must not put the revoked row back.
    if (ticket !== sessionsRequest) return;
    sessions.value = items;
  } catch (cause: any) {
    if (ticket !== sessionsRequest) return;
    sessionsError.value = cause?.message ?? '会话读取失败，请稍后重试。';
  } finally {
    if (ticket === sessionsRequest) sessionsLoading.value = false;
  }
}

/**
 * Re-reads the list without a loading state.
 *
 * A revocation can time out on the client after the server has already applied it, and a list
 * request issued while the mutation was in flight can return the pre-revocation state. Re-reading
 * after the mutation settles is what makes the visible list the server's answer rather than a guess.
 */
async function reconcileSessions(expectGoneId?: string) {
  const ticket = ++sessionsRequest;
  try {
    const items = (await api.get<{ items: SessionItem[] }>('/api/v1/auth/sessions')).items;
    if (ticket !== sessionsRequest) return;
    sessions.value = items;
    if (expectGoneId && !items.some((row) => row.id === expectGoneId)) {
      // The server did apply it; the client-side failure was only the response.
      sessionsError.value = '';
      confirmRevokeId.value = '';
    }
  } catch {
    // Keep whatever is on screen; the user can press 重新读取.
  }
}

function toggleSessions() {
  showSessions.value = !showSessions.value;
  if (showSessions.value) void loadSessions();
}

async function revoke(item: SessionItem) {
  if (item.current || revokingId.value) return;
  if (confirmRevokeId.value !== item.id) {
    confirmRevokeId.value = item.id;
    return;
  }
  confirmRevokeId.value = '';
  revokingId.value = item.id;
  sessionsError.value = '';
  // Any list response already in flight predates this mutation, and its `finally` will be discarded
  // with it, so the loading flag is cleared here.
  sessionsRequest += 1;
  sessionsLoading.value = false;
  try {
    await withTimeout(
      api.post(`/api/v1/auth/sessions/${encodeURIComponent(item.id)}/revoke`),
      12000,
      '撤销请求超时，请重试',
    );
    // A list request issued while the POST was in flight may still be holding the old row.
    sessionsRequest += 1;
    sessions.value = sessions.value.filter((row) => row.id !== item.id);
    void reconcileSessions(item.id);
  } catch (cause: any) {
    sessionsError.value = cause?.message ?? '撤销会话失败，请稍后重试。';
    // The server may have applied it even though the response was lost.
    void reconcileSessions(item.id);
  } finally {
    revokingId.value = '';
  }
}

/** A compact date is enough here; the exact instant is not what a person is checking. */
function formatDay(value?: string | null) {
  if (!value) return '未知';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

onMounted(load);
</script>

<template>
  <section class="me-profile-page">
    <header class="rest-topbar">
      <button
        class="back-icon"
        data-testid="front-profile-back"
        type="button"
        aria-label="返回上一页"
        @click="goBack"
      >
        ‹
      </button>
      <h1>匿名资料</h1>
    </header>

    <p v-if="loading" class="state-note" data-testid="profile-loading">正在读取账号资料…</p>
    <template v-else-if="error">
      <LoadErrorBanner :message="error" retry-label="重新读取" @retry="load" />
    </template>
    <template v-else-if="profile">
      <div class="identity-block">
        <span class="identity-avatar" aria-hidden="true">{{ avatarInitial }}</span>
        <h2 class="identity-name">{{ profile.nickname }}</h2>
        <p class="identity-sub">匿名资料</p>
      </div>

      <section class="plain-section" aria-label="基本资料">
        <h3 class="section-title">基本资料</h3>
        <div class="row-list">
          <div class="info-row" :class="{ 'is-open': editingNickname }">
            <button
              class="row-button"
              data-testid="row-nickname"
              type="button"
              :aria-expanded="editingNickname"
              :disabled="saving"
              @click="toggleNickname"
            >
              <span class="row-text">
                <strong class="row-title">昵称</strong>
                <span class="row-value">{{ profile.nickname }}</span>
              </span>
              <span class="row-chevron" aria-hidden="true">›</span>
            </button>
            <div v-if="editingNickname" class="row-editor">
              <input
                v-model="draftNickname"
                data-testid="input-nickname"
                class="nickname-input"
                type="text"
                autocomplete="off"
                aria-label="昵称"
                :disabled="saving"
                :aria-busy="saving"
                @keyup.enter="save"
              />
              <p class="row-hint" :class="{ 'is-over': nicknameLength > 20 }">
                {{ nicknameLength }}/20 个字符
              </p>
            </div>
          </div>

          <div class="info-row" :class="{ 'is-open': showCodeNote }">
            <button
              class="row-button"
              data-testid="row-anonymous-code"
              type="button"
              :aria-expanded="showCodeNote"
              @click="showCodeNote = !showCodeNote"
            >
              <span class="row-text">
                <strong class="row-title">匿名编号</strong>
                <span class="row-value row-code">{{ profile.anonymousCode }}</span>
                <span class="row-note">只用于应用内部关联</span>
              </span>
              <span class="row-chevron" aria-hidden="true">›</span>
            </button>
            <p v-if="showCodeNote" class="row-explanation" data-testid="anonymous-code-note">
              匿名编号不是登录或找回凭据。当前版本不提供凭编号找回；如果已经没有任何有效会话凭据，无法通过本应用恢复原身份的私密数据。
            </p>
          </div>
        </div>
      </section>

      <section class="plain-section" aria-label="账号安全">
        <h3 class="section-title">账号安全</h3>
        <div class="row-list">
          <div class="info-row" :class="{ 'is-open': showSessions }">
            <button
              class="row-button"
              data-testid="row-sessions"
              type="button"
              :aria-expanded="showSessions"
              @click="toggleSessions"
            >
              <span class="row-text">
                <strong class="row-title">已登录设备</strong>
                <span class="row-note">查看与撤销会话</span>
              </span>
              <span class="row-chevron" aria-hidden="true">›</span>
            </button>
            <div v-if="showSessions" class="row-panel" data-testid="session-list">
              <p class="row-hint">这里只列出当前匿名身份的有效会话，不代表全部设备。</p>
              <p v-if="sessionsLoading" class="row-hint" data-testid="session-loading">正在读取会话…</p>
              <template v-else-if="sessionsError">
                <p class="row-error" data-testid="session-error">{{ sessionsError }}</p>
                <button class="session-retry" type="button" data-testid="btn-session-retry" @click="loadSessions">
                  重新读取
                </button>
              </template>
              <template v-else>
                <ul v-if="sessions.length" class="session-items">
                  <li
                    v-for="item in sessions"
                    :key="item.id"
                    class="session-item"
                    :data-testid="item.current ? 'session-item-current' : 'session-item'"
                  >
                    <div class="session-main">
                      <strong class="session-name">{{ item.deviceLabel || '未命名会话' }}</strong>
                      <span v-if="item.current" class="session-badge">本机</span>
                    </div>
                    <p class="session-meta">
                      最近使用 {{ formatDay(item.lastUsedAt || item.createdAt) }} · 到期 {{ formatDay(item.expiresAt) }}
                    </p>
                    <button
                      v-if="!item.current"
                      class="session-revoke"
                      type="button"
                      data-testid="btn-session-revoke"
                      :disabled="Boolean(revokingId)"
                      @click="revoke(item)"
                    >
                      {{ revokingId === item.id ? '正在撤销…' : confirmRevokeId === item.id ? '确认撤销' : '撤销' }}
                    </button>
                  </li>
                </ul>
                <p v-else class="row-hint" data-testid="session-empty">没有其他会话。</p>
              </template>
            </div>
          </div>

          <div class="info-row" :class="{ 'is-open': showIdentityNote }">
            <button
              class="row-button"
              data-testid="row-identity-note"
              type="button"
              :aria-expanded="showIdentityNote"
              @click="showIdentityNote = !showIdentityNote"
            >
              <span class="row-text">
                <strong class="row-title">匿名身份说明</strong>
                <span class="row-note">了解为什么不能只凭编号找回账号</span>
              </span>
              <span class="row-chevron" aria-hidden="true">›</span>
            </button>
            <p v-if="showIdentityNote" class="row-explanation" data-testid="identity-note">
              匿名身份由服务端签发的凭据确认。凭据会到期，也可能被撤销，或随设备数据丢失而失效；一旦没有任何有效凭据，原身份的私密数据无法通过本应用恢复。
            </p>
          </div>
        </div>
      </section>

      <p class="credential-note">匿名凭据由服务端签发，请妥善保护当前设备。</p>

      <div class="save-dock">
        <p v-if="saveError" class="save-error" data-testid="save-error">{{ saveError }}</p>
        <p v-else-if="saveMessage" class="save-ok" data-testid="save-ok">{{ saveMessage }}</p>
        <button
          class="save-button"
          data-testid="btn-profile-save"
          type="button"
          :disabled="!canSave"
          @click="save"
        >
          {{ saving ? '正在保存…' : '保存资料' }}
        </button>
      </div>
    </template>
  </section>
</template>

<style scoped>
/*
 * This route has no tab bar, but the shell reserves 88px for one. Left in place, that reserve made
 * the page 88px taller than the viewport, so the loaded state scrolled and the bar could leave the
 * screen - measured as scrollHeight 926 against innerHeight 838.
 */
:global(.phone-shell:has(.me-profile-page)) {
  padding-bottom: 0;
}

/* Full-bleed root: the shell already insets 15px, and the design's gutter is 22px. */
.me-profile-page {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: calc(100% + 30px);
  max-width: none;
  min-height: 100vh;
  margin: 0 -15px;
  padding: 0 22px calc(20px + env(safe-area-inset-bottom));
  overflow-x: hidden;
  background: var(--gn-paper);
  color: var(--gn-ink);
  font-family: var(--gn-font-body);
}

/* Bar: a bare chevron and the title, with the hairline reaching both screen edges. */
.me-profile-page .rest-topbar {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 0;
  flex: none;
  min-height: 52px;
  margin: 0 -22px;
  padding: 0 22px;
  background: var(--gn-paper);
  border-bottom: 1px solid var(--gn-line);
  /* Expanded content can exceed one screen; the way back must not scroll away with it. */
  position: sticky;
  top: 0;
  z-index: 10;
}

.me-profile-page .back-icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 24px;
  min-width: 24px;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--gn-ink);
  font-size: 26px;
  font-weight: 300;
  line-height: 1;
  cursor: pointer;
}

/* The glyph track is 24px to keep the title on the design's axis; this widens the touch target. */
.me-profile-page .back-icon::before {
  content: '';
  position: absolute;
  inset: 0 -10px;
}

.me-profile-page .rest-topbar h1 {
  margin: 0;
  color: var(--gn-ink);
  text-align: left;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.2px;
}

.state-note {
  margin: 24px 0 0;
  color: var(--gn-muted);
  font-size: 14px;
  line-height: 1.6;
}

/* Identity block: the avatar sits on the left; the name and its caption are centred. */
.identity-block {
  padding: 18px 0 0;
}

.identity-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf);
  font-size: 15px;
  font-weight: 600;
}

.identity-name {
  margin: 8px 0 0;
  color: var(--gn-ink);
  text-align: center;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
}

.identity-sub {
  margin: 6px 0 0;
  color: var(--gn-muted);
  text-align: center;
  font-size: 13px;
  line-height: 1.4;
}

/* Sections are bare blocks: a bold title, then rows divided by hairlines. */
.plain-section {
  margin-top: 30px;
}

.section-title {
  margin: 0;
  color: var(--gn-ink);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.35;
}

.row-list {
  margin-top: 4px;
}

.info-row {
  border-bottom: 1px solid var(--gn-line);
}

.row-button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18px;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.row-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.row-title {
  color: var(--gn-ink);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.35;
}

.row-value,
.row-note {
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.45;
  word-break: break-all;
}

.row-code {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.2px;
}

.row-chevron {
  color: #b6bcc4;
  font-size: 20px;
  line-height: 1;
  text-align: right;
  transition: transform 0.18s ease;
}

.info-row.is-open .row-chevron {
  transform: rotate(90deg);
}

.row-editor {
  padding: 0 0 14px;
}

.nickname-input {
  box-sizing: border-box;
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--gn-line);
  border-radius: 8px;
  background: var(--gn-paper);
  color: var(--gn-ink);
  font-family: var(--gn-font-body);
  font-size: 15px;
  line-height: 1.4;
}

.nickname-input:focus {
  outline: none;
  border-color: var(--gn-leaf);
}

.nickname-input:disabled {
  background: var(--gn-paper-warm);
  color: var(--gn-muted);
}

.row-hint {
  margin: 6px 0 0;
  color: var(--gn-muted);
  font-size: 12px;
  line-height: 1.5;
}

.row-hint.is-over {
  color: var(--gn-danger);
}

.row-button:disabled {
  cursor: default;
}

.row-explanation {
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--gn-paper-warm);
  color: var(--gn-ink-soft);
  font-size: 13px;
  line-height: 1.6;
}

.row-panel {
  padding: 0 0 14px;
}

.row-error {
  margin: 8px 0 0;
  color: var(--gn-danger);
  font-size: 13px;
  line-height: 1.5;
}

.session-items {
  display: grid;
  gap: 10px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.session-item {
  padding: 10px 12px;
  border: 1px solid var(--gn-line);
  border-radius: 8px;
}

.session-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.session-name {
  color: var(--gn-ink);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.session-badge {
  flex: none;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf);
  font-size: 11px;
  line-height: 1.4;
}

.session-meta {
  margin: 4px 0 0;
  color: var(--gn-muted);
  font-size: 12px;
  line-height: 1.5;
}

.session-revoke,
.session-retry {
  margin-top: 8px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid #e3c9c9;
  border-radius: 6px;
  background: var(--gn-paper);
  color: var(--gn-danger);
  font-family: var(--gn-font-body);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}

.session-revoke:disabled {
  opacity: 0.6;
  cursor: default;
}

.credential-note {
  margin: 22px 0 0;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--gn-paper-warm);
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.55;
}

/* The CTA sits at the bottom of the page, not mid-screen: the page is a flex column. */
.save-dock {
  margin-top: auto;
  padding-top: 28px;
}

.save-ok {
  margin: 0 0 8px;
  color: var(--gn-leaf);
  font-size: 13px;
  line-height: 1.5;
}

.save-error {
  margin: 0 0 8px;
  color: var(--gn-danger);
  font-size: 13px;
  line-height: 1.5;
}

.save-button {
  width: 100%;
  height: 50px;
  border: 0;
  border-radius: 10px;
  background: var(--gn-leaf);
  color: #ffffff;
  font-family: var(--gn-font-body);
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
}

.save-button:disabled {
  background: #e8eaed;
  color: #9aa1a9;
  cursor: default;
}
</style>
