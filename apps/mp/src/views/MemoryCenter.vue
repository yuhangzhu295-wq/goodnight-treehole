<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

type MemoryItem = {
  id: string;
  title: string;
  content: string;
  source: string;
  scope: string;
  status: 'active' | 'disabled' | 'expired' | 'deleted';
  createdAt: string;
  expiresAt: string;
  deletedAt?: string | null;
  usages?: Array<{ jobId: string; taskType: string; at: string }>;
};

type EffectiveState = 'active' | 'disabled' | 'expired' | 'deleted';

function effectiveState(item: MemoryItem): EffectiveState {
  if (item.status === 'deleted' || Boolean(item.deletedAt)) return 'deleted';
  if (item.status === 'expired' || Date.parse(item.expiresAt) <= Date.now()) return 'expired';
  if (item.status === 'disabled') return 'disabled';
  return 'active';
}

const router = useRouter();
const items = ref<MemoryItem[]>([]);
const loading = ref(true);
const busyId = ref('');
const error = ref('');
const notice = ref('');
const memoryAllowed = ref(false);
/** Whether an AI task may read these memories. */
const aiMemoryAllowed = ref(false);
const togglingAi = ref(false);

const composerOpen = ref(false);
const selectedItem = ref<MemoryItem | null>(null);
const editingId = ref('');
const pendingDeleteId = ref('');
const showInfoModal = ref(false);
const showInactiveSheet = ref(false);
const showRetentionSheet = ref(false);
const defaultRetentionDays = ref(30);

const createDraft = reactive({ title: '', content: '', days: 30, scope: 'all_ai' });
const editDraft = reactive({ title: '', content: '', days: 30, scope: 'all_ai' });

const displayItems = computed(() => {
  return items.value
    .filter((item) => effectiveState(item) !== 'deleted')
    .sort((a, b) => {
      const aRank = effectiveState(a) === 'active' ? 0 : 1;
      const bRank = effectiveState(b) === 'active' ? 0 : 1;
      return aRank - bRank;
    });
});
const activeItems = computed(() => items.value.filter((item) => effectiveState(item) === 'active'));
const inactiveItems = computed(() =>
  items.value.filter((item) => ['disabled', 'expired'].includes(effectiveState(item))),
);

const sourceLabel: Record<string, string> = {
  user_saved: '自己主动记下',
  journey_summary: '过往经历回顾',
  recovery_confirmed: '生活恢复记录',
  support_plan: '低谷预案备忘',
};

const scopeLabel: Record<string, string> = {
  all_ai: '所有整理与回信',
  journey: '仅梳理事情时',
  recovery: '仅生活恢复时',
  support: '仅现实支持时',
};

function daysLeft(item: MemoryItem) {
  const state = effectiveState(item);
  if (state === 'deleted') return '已删除';
  if (state === 'expired') return '已到期 · 可重新同意';
  if (state === 'disabled') return '已停用 · 可单独重新授权';
  const days = Math.max(1, Math.ceil((Date.parse(item.expiresAt) - Date.now()) / 86_400_000));
  return `有效期：还剩${days}天`;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [memoryResult, privacyResult] = await Promise.all([
      api.get<any>('/api/v1/me/memories'),
      api.get<any>('/api/v1/settings/privacy'),
    ]);
    items.value = memoryResult.items ?? [];
    memoryAllowed.value = privacyResult.item?.allowLongTermMemory === true;
    aiMemoryAllowed.value = privacyResult.item?.allowAiMemoryUse === true;
  } catch (cause: any) {
    error.value = cause?.message ?? '记忆资料读取失败';
  } finally {
    loading.value = false;
  }
}

async function toggleAiMemory() {
  if (togglingAi.value) return;
  togglingAi.value = true;
  error.value = '';
  const next = !aiMemoryAllowed.value;
  try {
    await api.put('/api/v1/settings/privacy', { allowAiMemoryUse: next });
    aiMemoryAllowed.value = next;
    notice.value = next ? '已允许在整理与回信中参考已保存的备忘。' : '已关闭备忘参考。';
  } catch (cause: any) {
    error.value = cause?.message ?? '设置保存失败，请稍后重试';
  } finally {
    togglingAi.value = false;
  }
}

async function createMemory() {
  if (!createDraft.title.trim() || !createDraft.content.trim()) {
    error.value = '标题和内容都需要由你确认';
    return;
  }
  busyId.value = 'create';
  error.value = '';
  notice.value = '';
  try {
    await api.post('/api/v1/memory', { ...createDraft, category: '用户主动保存' });
    Object.assign(createDraft, { title: '', content: '', days: defaultRetentionDays.value, scope: 'all_ai' });
    composerOpen.value = false;
    notice.value = '这条记忆已经按你的范围与期限保存。';
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '记忆没有保存成功';
  } finally {
    busyId.value = '';
  }
}

function openDetail(item: MemoryItem) {
  selectedItem.value = item;
}

function beginEdit(item: MemoryItem) {
  if (effectiveState(item) !== 'active') return;
  editingId.value = item.id;
  const remaining = Math.max(1, Math.ceil((Date.parse(item.expiresAt) - Date.now()) / 86_400_000));
  Object.assign(editDraft, { title: item.title, content: item.content, days: remaining, scope: item.scope });
}

async function saveEdit() {
  if (!editingId.value || !editDraft.title.trim() || !editDraft.content.trim()) return;
  const item = items.value.find((i) => i.id === editingId.value);
  if (!item) return;
  await update(item, { ...editDraft }, '记忆修改已保存。');
}

async function reactivate(item: MemoryItem, days = 30) {
  busyId.value = item.id;
  error.value = '';
  notice.value = '';
  try {
    await api.post(`/api/v1/me/memories/${item.id}/reactivate`, { days });
    notice.value = '这条记忆已重新确认并恢复使用。';
    if (selectedItem.value?.id === item.id) selectedItem.value = null;
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '记忆重新确认失败';
  } finally {
    busyId.value = '';
  }
}

async function update(item: MemoryItem, patch: Record<string, unknown>, message: string) {
  busyId.value = item.id;
  error.value = '';
  notice.value = '';
  try {
    await api.patch(`/api/v1/me/memories/${item.id}`, patch);
    editingId.value = '';
    pendingDeleteId.value = '';
    if (selectedItem.value?.id === item.id) selectedItem.value = null;
    notice.value = message;
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '记忆状态没有更新成功';
  } finally {
    busyId.value = '';
  }
}

async function remove(item: MemoryItem) {
  busyId.value = item.id;
  error.value = '';
  try {
    await api.delete(`/api/v1/me/memories/${item.id}`);
    pendingDeleteId.value = '';
    if (selectedItem.value?.id === item.id) selectedItem.value = null;
    notice.value = '这条记忆已经删除。';
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '记忆没有删除成功';
  } finally {
    busyId.value = '';
  }
}

onMounted(load);
</script>

<template>
  <section class="goodnight-page memory-page">
    <header class="memory-bar">
      <button
        class="back-btn"
        data-testid="front-memory-back"
        type="button"
        aria-label="返回上一页"
        @click="router.back()"
      >
        ‹
      </button>
      <h1 class="memory-bar-title">AI 记忆</h1>
      <span aria-hidden="true"></span>
    </header>

    <div class="memory-body">
      <!-- Master Switch -->
      <section class="master-switch-section">
        <div class="switch-copy">
          <strong class="switch-title">允许使用 AI 记忆</strong>
          <span class="switch-desc">关闭后新请求不能读取已保留内容</span>
        </div>
        <button
          class="switch-track"
          data-testid="toggle-ai-memory"
          type="button"
          role="switch"
          :aria-checked="aiMemoryAllowed"
          :class="{ on: aiMemoryAllowed }"
          :disabled="togglingAi"
          @click="toggleAiMemory"
        >
          <span class="switch-thumb"></span>
        </button>
      </section>

      <LoadErrorBanner :message="error" retry-label="重新加载" @retry="load" />
      <p v-if="notice" class="status-msg success" role="status">{{ notice }}</p>

      <!-- Section 1: 记住的内容 -->
      <section class="memory-section" data-testid="section-active-memories" aria-label="记住的内容">
        <div class="section-header">
          <h3>记住的内容</h3>
          <button
            class="section-link"
            data-testid="btn-memory-usage-info"
            type="button"
            @click="showInfoModal = true"
          >
            了解使用方式 ›
          </button>
        </div>

        <div v-if="loading" class="state-note">正在读取记忆记录…</div>
        <div v-else-if="displayItems.length" class="memory-list">
          <button
            v-for="(item, index) in displayItems"
            :key="item.id"
            class="memory-item"
            :data-testid="index === 0 ? 'memory-card-first' : `memory-card-${item.id}`"
            type="button"
            @click="openDetail(item)"
          >
            <span class="doc-icon" aria-hidden="true">
              <svg
                class="doc-svg"
                viewBox="0 0 20 24"
                width="18"
                height="22"
                fill="none"
                stroke="#9ca3af"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="2" y="2" width="16" height="20" rx="2" />
                <line x1="6" y1="7" x2="14" y2="7" />
                <line x1="6" y1="12" x2="14" y2="12" />
                <line x1="6" y1="17" x2="14" y2="17" />
              </svg>
            </span>
            <span class="memory-copy">
              <strong class="memory-title">{{ item.title }}</strong>
              <span class="memory-expiry">{{ daysLeft(item) }}</span>
            </span>
            <span class="memory-chevron" aria-hidden="true">›</span>
          </button>
        </div>
        <div v-else class="empty-surface">
          <p class="empty-note">暂无生效中的记忆内容。</p>
        </div>
      </section>

      <!-- Section 2: 管理 -->
      <section class="memory-section" data-testid="section-memory-management" aria-label="管理">
        <div class="section-header">
          <h3>管理</h3>
        </div>

        <div class="management-group">
          <button
            class="management-row"
            data-testid="btn-manage-retention"
            type="button"
            @click="showRetentionSheet = true"
          >
            <span class="mgmt-copy">
              <strong class="mgmt-title">默认保留期限</strong>
              <span class="mgmt-desc">{{ defaultRetentionDays }}天 · 可按项目修改</span>
            </span>
            <span class="memory-chevron" aria-hidden="true">›</span>
          </button>

          <button
            class="management-row"
            data-testid="btn-manage-inactive"
            type="button"
            @click="showInactiveSheet = true"
          >
            <span class="mgmt-copy">
              <strong class="mgmt-title">已停用或过期</strong>
              <span class="mgmt-desc">{{ inactiveItems.length ? '查看与重新同意' : '暂无已停用或过期记录' }}</span>
            </span>
            <span class="memory-chevron" aria-hidden="true">›</span>
          </button>
        </div>
      </section>

      <!-- Notice Bubble -->
      <p class="memory-notice">
        删除后的内容不能通过普通编辑恢复。授权以服务器当前状态为准。
      </p>
    </div>

    <!-- Create Memory Dialog / Sheet -->
    <Teleport to="body">
      <div v-if="composerOpen" class="modal-mask" @click.self="composerOpen = false">
        <form class="modal-card" @submit.prevent="createMemory">
          <div class="modal-header">
            <h3>添加新记忆</h3>
            <button class="modal-close" type="button" @click="composerOpen = false">×</button>
          </div>
          <div class="field-wrap">
            <label for="create-title">标题</label>
            <input
              id="create-title"
              v-model="createDraft.title"
              class="field-input"
              maxlength="100"
              placeholder="例如：最近在准备换工作"
            />
          </div>
          <div class="field-wrap">
            <label for="create-content">具体内容</label>
            <textarea
              id="create-content"
              v-model="createDraft.content"
              class="field-textarea"
              maxlength="500"
              placeholder="输入希望系统记住的具体内容"
            ></textarea>
          </div>
          <div class="field-row">
            <div class="field-wrap flex-1">
              <label for="create-scope">使用范围</label>
              <select id="create-scope" v-model="createDraft.scope" class="field-select">
                <option value="all_ai">所有整理与回信</option>
                <option value="journey">仅梳理事情时</option>
                <option value="recovery">仅生活恢复时</option>
                <option value="support">仅现实支持时</option>
              </select>
            </div>
            <div class="field-wrap flex-1">
              <label for="create-days">保留天数</label>
              <input
                id="create-days"
                v-model.number="createDraft.days"
                class="field-input"
                type="number"
                min="1"
                max="3650"
              />
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn-secondary" type="button" @click="composerOpen = false">取消</button>
            <button class="btn-primary" data-testid="memory-create-save" type="submit" :disabled="busyId === 'create'">
              确认并保存
            </button>
          </div>
        </form>
      </div>
    </Teleport>

    <!-- Detail & Edit Modal -->
    <Teleport to="body">
      <div v-if="selectedItem" class="modal-mask" @click.self="selectedItem = null; editingId = ''">
        <div class="modal-card">
          <div class="modal-header">
            <h3>{{ editingId ? '编辑记忆' : '记忆详情' }}</h3>
            <button class="modal-close" type="button" @click="selectedItem = null; editingId = ''">×</button>
          </div>

          <template v-if="!editingId">
            <div class="detail-body">
              <strong class="detail-title">{{ selectedItem.title }}</strong>
              <p class="detail-content">{{ selectedItem.content }}</p>
              <div class="detail-meta">
                <span>来源: {{ sourceLabel[selectedItem.source] ?? selectedItem.source }}</span>
                <span>范围: {{ scopeLabel[selectedItem.scope] ?? selectedItem.scope }}</span>
                <span>{{ daysLeft(selectedItem) }}</span>
              </div>
            </div>

            <div class="modal-actions-col">
              <button
                v-if="effectiveState(selectedItem) === 'active'"
                class="btn-outline"
                data-testid="memory-edit-btn"
                type="button"
                @click="beginEdit(selectedItem)"
              >
                编辑内容
              </button>
              <button
                v-if="effectiveState(selectedItem) === 'active'"
                class="btn-outline"
                type="button"
                @click="update(selectedItem, { status: 'disabled' }, '这条记忆已暂停使用。')"
              >
                暂停使用
              </button>
              <button
                v-if="['disabled', 'expired'].includes(effectiveState(selectedItem))"
                class="btn-primary"
                type="button"
                @click="reactivate(selectedItem, 30)"
              >
                重新授权 (30天)
              </button>
              <button
                class="btn-danger-outline"
                type="button"
                @click="remove(selectedItem)"
              >
                彻底删除
              </button>
            </div>
          </template>

          <template v-else>
            <div class="field-wrap">
              <label>标题</label>
              <input v-model="editDraft.title" class="field-input" maxlength="100" />
            </div>
            <div class="field-wrap">
              <label>内容</label>
              <textarea v-model="editDraft.content" class="field-textarea" maxlength="500"></textarea>
            </div>
            <div class="modal-actions">
              <button class="btn-secondary" type="button" @click="editingId = ''">取消</button>
              <button class="btn-primary" type="button" :disabled="busyId === selectedItem.id" @click="saveEdit">
                保存修改
              </button>
            </div>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- Inactive Memories Sheet -->
    <Teleport to="body">
      <div v-if="showInactiveSheet" class="modal-mask" @click.self="showInactiveSheet = false">
        <div class="modal-card">
          <div class="modal-header">
            <h3>已停用或过期的记忆</h3>
            <button class="modal-close" type="button" @click="showInactiveSheet = false">×</button>
          </div>
          <div v-if="inactiveItems.length" class="memory-list">
            <div v-for="item in inactiveItems" :key="item.id" class="inactive-item-card">
              <div class="inactive-info">
                <strong>{{ item.title }}</strong>
                <span class="inactive-state-tag" :class="effectiveState(item)">
                  {{ effectiveState(item) === 'disabled' ? '已停用' : '已过期' }}
                </span>
                <p class="inactive-desc">{{ item.content }}</p>
              </div>
              <div class="inactive-actions">
                <button class="btn-primary btn-sm" type="button" @click="reactivate(item, 30)">重新授权</button>
                <button class="btn-secondary btn-sm" type="button" @click="remove(item)">删除</button>
              </div>
            </div>
          </div>
          <p v-else class="empty-note pad-v">没有已停用或过期的记忆。</p>
        </div>
      </div>
    </Teleport>

    <!-- Retention Settings Sheet -->
    <Teleport to="body">
      <div v-if="showRetentionSheet" class="modal-mask" @click.self="showRetentionSheet = false">
        <div class="modal-card">
          <div class="modal-header">
            <h3>默认保留期限</h3>
            <button class="modal-close" type="button" @click="showRetentionSheet = false">×</button>
          </div>
          <p class="sheet-desc">新保存的记忆默认保留此天数，到期后将自动停用并需要你重新授权。</p>
          <div class="retention-options">
            <button
              v-for="days in [7, 30, 90, 180]"
              :key="days"
              type="button"
              class="retention-chip"
              :class="{ active: defaultRetentionDays === days }"
              @click="defaultRetentionDays = days; showRetentionSheet = false"
            >
              {{ days }} 天
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Info Modal -->
    <Teleport to="body">
      <div v-if="showInfoModal" class="modal-mask" @click.self="showInfoModal = false">
        <div class="modal-card">
          <div class="modal-header">
            <h3>AI 记忆使用说明</h3>
            <button class="modal-close" type="button" @click="showInfoModal = false">×</button>
          </div>
          <div class="info-content">
            <p><strong>完全由你决定：</strong>只有在你打开开关时，树洞才会参考这里的内容，用来写出更贴合你近况的回信或便签。</p>
            <p><strong>有明确期限：</strong>每条备忘都有到期时间，到期后自己失效，不会永久留存。</p>
            <p><strong>随时可以关掉：</strong>关闭顶部的开关，树洞就只看你当下写的话，不再参考任何过往记录。</p>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.memory-page {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-height: 100%;
  overflow-x: hidden;
  background: var(--gn-paper);
  color: var(--gn-text);
  font-family: var(--gn-font-body);
}

:global(.phone-shell:has(.memory-page)) {
  padding-bottom: 0;
}

.memory-bar {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 0;
  box-sizing: border-box;
  width: 100%;
  min-height: 52px;
  padding: 0 16px;
  border-bottom: 1px solid var(--gn-line);
  background: var(--gn-paper);
}

.memory-bar-title {
  margin: 0;
  color: var(--gn-ink);
  text-align: left;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.2px;
  line-height: 1.3;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 24px;
  height: 44px;
  min-height: 44px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--gn-ink);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.memory-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 0 16px calc(16px + env(safe-area-inset-bottom));
}

.master-switch-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 0 20px;
  border-bottom: 1px solid var(--gn-line);
}

.switch-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.switch-title {
  color: var(--gn-ink);
  font-size: 17px;
  font-weight: 700;
  line-height: 1.35;
}

.switch-desc {
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.45;
}

.switch-track {
  position: relative;
  width: 44px;
  height: 26px;
  min-height: 26px;
  max-height: 26px;
  border: 0;
  border-radius: 999px;
  background: #cbd3da;
  padding: 2px;
  cursor: pointer;
  flex-shrink: 0;
  box-sizing: border-box;
  transition: background-color 0.2s ease;
}

.switch-track.on {
  background: #275f56;
}

.switch-thumb {
  display: block;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease;
}

.switch-track.on .switch-thumb {
  transform: translateX(18px);
}

.status-msg {
  margin: 12px 0 0;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
}

.status-msg.success {
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
}

.memory-section {
  display: flex;
  flex-direction: column;
  margin-top: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-header h3 {
  margin: 0;
  color: var(--gn-ink);
  font-size: 17px;
  font-weight: 700;
}

.section-link {
  border: 0;
  background: none;
  padding: 0;
  color: var(--gn-muted);
  font-size: 13px;
  cursor: pointer;
}

.state-note,
.empty-note {
  margin: 16px 0;
  color: var(--gn-muted);
  font-size: 13px;
  text-align: center;
}

.empty-surface {
  padding: 20px 0;
  text-align: center;
}

.memory-list {
  display: flex;
  flex-direction: column;
}

.memory-item {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 68px;
  padding: 14px 0;
  border: 0;
  border-radius: 0;
  border-bottom: 1px solid var(--gn-line);
  background: none;
  text-align: left;
  cursor: pointer;
}

.doc-icon {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  border: 0;
  background: #f4f5f7;
  flex-shrink: 0;
  box-sizing: border-box;
}

.doc-line {
  display: block;
  width: 20px;
  height: 2px;
  border-radius: 1px;
  background: #9ca3af;
}

.memory-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.memory-title {
  color: var(--gn-ink);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.4;
}

.memory-expiry {
  color: var(--gn-muted);
  font-size: 13px;
}

.memory-chevron {
  color: #b6bcc4;
  font-size: 20px;
  flex-shrink: 0;
}

.management-group {
  display: flex;
  flex-direction: column;
}

.management-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 64px;
  padding: 12px 0;
  border: 0;
  border-radius: 0;
  border-bottom: 1px solid var(--gn-line);
  background: none;
  text-align: left;
  cursor: pointer;
}

.mgmt-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.mgmt-title {
  color: var(--gn-ink);
  font-size: 15px;
  font-weight: 700;
}

.mgmt-desc {
  color: var(--gn-muted);
  font-size: 13px;
}

.memory-notice {
  margin: 28px 0 0;
  padding: 16px 18px;
  border-radius: 12px;
  background: #f4f6f8;
  color: #88929c;
  font-size: 13px;
  line-height: 1.6;
}

/* Modals */
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
}

.modal-card {
  box-sizing: border-box;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
  border-radius: 16px 16px 0 0;
  background: var(--gn-paper);
  padding: 20px 16px calc(24px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--gn-ink);
}

.modal-close {
  border: 0;
  background: none;
  font-size: 24px;
  color: var(--gn-muted);
  cursor: pointer;
}

.field-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-wrap label {
  font-size: 13px;
  font-weight: 600;
  color: var(--gn-ink);
}

.field-input,
.field-select {
  box-sizing: border-box;
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--gn-line);
  border-radius: 8px;
  background: var(--gn-bg);
  color: var(--gn-ink);
  font: inherit;
  font-size: 14px;
}

.field-textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 90px;
  padding: 10px 12px;
  border: 1px solid var(--gn-line);
  border-radius: 8px;
  background: var(--gn-bg);
  color: var(--gn-ink);
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
}

.field-row {
  display: flex;
  gap: 12px;
}

.flex-1 {
  flex: 1;
}

.modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.modal-actions-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.btn-primary {
  flex: 1;
  min-height: 44px;
  border: 0;
  border-radius: 8px;
  background: var(--gn-leaf);
  color: #ffffff;
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.btn-secondary {
  flex: 1;
  min-height: 44px;
  border: 1px solid var(--gn-line);
  border-radius: 8px;
  background: var(--gn-paper);
  color: var(--gn-ink);
  font: inherit;
  font-size: 15px;
  cursor: pointer;
}

.btn-outline {
  width: 100%;
  min-height: 42px;
  border: 1px solid var(--gn-line);
  border-radius: 8px;
  background: var(--gn-paper);
  color: var(--gn-ink);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-danger-outline {
  width: 100%;
  min-height: 42px;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fef2f2;
  color: var(--gn-danger, #dc2626);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-sm {
  min-height: 32px;
  padding: 0 12px;
  font-size: 12px;
}

.detail-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 0;
}

.detail-title {
  font-size: 17px;
  color: var(--gn-ink);
}

.detail-content {
  margin: 0;
  color: var(--gn-text);
  font-size: 14px;
  line-height: 1.6;
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--gn-muted);
}

.inactive-item-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--gn-line);
  border-radius: 8px;
  margin-bottom: 8px;
}

.inactive-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.inactive-state-tag {
  align-self: flex-start;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.inactive-state-tag.disabled {
  background: #f3f4f6;
  color: #6b7280;
}

.inactive-state-tag.expired {
  background: #fef3c7;
  color: #b45309;
}

.inactive-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--gn-muted);
  line-height: 1.5;
}

.inactive-actions {
  display: flex;
  gap: 8px;
}

.retention-options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-top: 8px;
}

.retention-chip {
  padding: 12px;
  border: 1px solid var(--gn-line);
  border-radius: 8px;
  background: var(--gn-paper);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  color: var(--gn-ink);
  cursor: pointer;
  text-align: center;
}

.retention-chip.active {
  border-color: var(--gn-leaf);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
}

.info-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--gn-text);
}

.sheet-desc {
  margin: 0;
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.5;
}

.pad-v {
  padding: 24px 0;
}
</style>
