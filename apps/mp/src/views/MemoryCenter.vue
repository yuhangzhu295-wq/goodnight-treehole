<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

type MemoryItem = {
  id: string;
  title: string;
  content: string;
  source: string;
  scope: string;
  status: 'active' | 'disabled' | 'expired';
  createdAt: string;
  expiresAt: string;
  usages?: Array<{ jobId: string; taskType: string; at: string }>;
};

const router = useRouter();
const items = ref<MemoryItem[]>([]);
const loading = ref(true);
const busyId = ref('');
const error = ref('');
const notice = ref('');
const memoryAllowed = ref(false);
/** Whether an AI task may read these memories. Distinct from `memoryAllowed`. */
const aiMemoryAllowed = ref(false);
const composerOpen = ref(false);
const editingId = ref('');
const pendingDeleteId = ref('');
const openedUsageId = ref('');
const createDraft = reactive({ title: '', content: '', days: 90, scope: 'all_ai' });
const editDraft = reactive({ title: '', content: '', days: 90, scope: 'all_ai' });

const activeCount = computed(
  () => items.value.filter((item) => item.status === 'active' && Date.parse(item.expiresAt) > Date.now()).length,
);
const sourceLabel: Record<string, string> = {
  user_saved: '用户主动保存',
  journey_summary: 'Journey 总结',
  recovery_confirmed: 'Recovery 确认',
  support_plan: '低谷预案',
};
const scopeLabel: Record<string, string> = {
  all_ai: '所有允许的 AI 任务',
  journey: '仅 Journey',
  recovery: '仅 Recovery',
  support: '仅现实支持',
};

function daysLeft(item: MemoryItem) {
  if (item.status === 'expired' || Date.parse(item.expiresAt) <= Date.now()) return '已到期';
  const days = Math.max(1, Math.ceil((Date.parse(item.expiresAt) - Date.now()) / 86_400_000));
  return `${days} 天后自动删除`;
}

function showUsage(item: MemoryItem) {
  const text = `最近由 ${item.usages?.[0]?.taskType} 使用，任务 ${item.usages?.[0]?.jobId}`;
  notice.value = text;
  openedUsageId.value = openedUsageId.value === item.id ? '' : item.id;
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
    Object.assign(createDraft, { title: '', content: '', days: 90, scope: 'all_ai' });
    composerOpen.value = false;
    notice.value = '这条记忆已经按你的范围与期限保存。';
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '记忆没有保存成功';
  } finally {
    busyId.value = '';
  }
}

function beginEdit(item: MemoryItem) {
  editingId.value = item.id;
  const remaining = Math.max(1, Math.ceil((Date.parse(item.expiresAt) - Date.now()) / 86_400_000));
  Object.assign(editDraft, { title: item.title, content: item.content, days: remaining, scope: item.scope });
}

async function update(item: MemoryItem, patch: Record<string, unknown>, message: string) {
  busyId.value = item.id;
  error.value = '';
  notice.value = '';
  try {
    await api.patch(`/api/v1/me/memories/${item.id}`, patch);
    editingId.value = '';
    pendingDeleteId.value = '';
    notice.value = message;
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '记忆状态没有更新成功';
  } finally {
    busyId.value = '';
  }
}

async function remove(item: MemoryItem) {
  if (pendingDeleteId.value !== item.id) {
    pendingDeleteId.value = item.id;
    return;
  }
  busyId.value = item.id;
  try {
    await api.delete(`/api/v1/me/memories/${item.id}`);
    pendingDeleteId.value = '';
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
    <header class="memory-header">
      <button class="back-btn" type="button" aria-label="返回上一页" @click="router.back()">‹</button>
      <div class="header-titles">
        <h1 class="memory-title">AI 记忆中心</h1>
        <p class="memory-subtitle">管理系统记录的信息与使用范围</p>
      </div>
    </header>

    <div class="memory-status-strip">
      <div class="status-strip-info">
        <strong class="status-strip-title">记忆使用权限</strong>
        <span class="status-strip-note">当前 {{ activeCount }} 条记忆在允许范围内供 AI 参考</span>
      </div>
    </div>

    <!-- Disabled State Notices -->
    <section v-if="!aiMemoryAllowed" class="permission-notice" data-testid="memory-ai-off">
      <div class="notice-body">
        <strong class="notice-title">AI 暂时不能读取这些记忆</strong>
        <p class="notice-desc">内容仅对你可见。如需允许 AI 参考，可在隐私设置中开启。</p>
      </div>
      <button class="notice-btn" type="button" @click="router.push('/pages/settings/privacy')">去隐私设置</button>
    </section>

    <section v-if="!memoryAllowed" class="permission-notice" data-testid="memory-privacy-off">
      <div class="notice-body">
        <strong class="notice-title">AI 记忆当前已关闭</strong>
        <p class="notice-desc">现有内容仅对你可见，任何 AI 任务都不能读取。</p>
      </div>
      <button class="notice-btn" type="button" @click="router.push('/pages/settings/privacy')">去隐私设置</button>
    </section>

    <p v-if="loading" class="status-msg info">正在读取记忆记录…</p>
    <p v-if="error" class="status-msg error" role="alert">{{ error }}</p>
    <p v-if="notice" class="status-msg success" role="status">{{ notice }}</p>

    <!-- Create Memory Form -->
    <form v-if="composerOpen" class="form-surface" @submit.prevent="createMemory">
      <div class="form-header">
        <strong class="form-title">添加新记忆</strong>
        <button class="form-close-btn" type="button" aria-label="关闭" @click="composerOpen = false">×</button>
      </div>
      <div class="form-field">
        <label class="form-label" for="create-memory-title">标题</label>
        <input
          id="create-memory-title"
          v-model="createDraft.title"
          class="form-input"
          maxlength="100"
          placeholder="记忆名称"
        />
      </div>
      <div class="form-field">
        <label class="form-label" for="create-memory-content">内容</label>
        <textarea
          id="create-memory-content"
          v-model="createDraft.content"
          class="form-textarea"
          maxlength="500"
          placeholder="输入希望系统记住的具体内容"
        ></textarea>
      </div>
      <div class="form-row-2">
        <div class="form-field">
          <label class="form-label" for="create-memory-scope">使用范围</label>
          <select id="create-memory-scope" v-model="createDraft.scope" class="form-select">
            <option value="all_ai">所有允许的 AI 任务</option>
            <option value="journey">仅 Journey</option>
            <option value="recovery">仅 Recovery</option>
            <option value="support">仅现实支持</option>
          </select>
        </div>
        <div class="form-field">
          <label class="form-label" for="create-memory-days">保留天数</label>
          <input
            id="create-memory-days"
            v-model.number="createDraft.days"
            class="form-input"
            type="number"
            min="1"
            max="3650"
          />
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-cancel" type="button" @click="composerOpen = false">取消</button>
        <button
          class="btn-submit"
          data-testid="memory-create-save"
          type="submit"
          :disabled="busyId === 'create'"
        >
          确认并保存
        </button>
      </div>
    </form>

    <!-- Create Button -->
    <div v-if="memoryAllowed && !composerOpen" class="create-bar">
      <button
        class="create-btn"
        data-testid="memory-create-open"
        type="button"
        @click="composerOpen = true"
      >
        添加一条新记忆
      </button>
    </div>

    <!-- Memory Records List -->
    <section v-if="!loading" class="group-section" aria-label="记忆记录列表">
      <div class="section-label">记录列表 ({{ items.length }})</div>
      <div v-if="items.length" class="records-container">
        <article
          v-for="item in items"
          :key="item.id"
          class="record-surface"
        >
          <div class="record-header">
            <div class="record-title-wrap">
              <h2 class="record-title">{{ item.title }}</h2>
              <span class="status-badge" :class="item.status">
                {{ item.status === 'active' ? '允许使用' : item.status === 'disabled' ? '已暂停' : '已到期' }}
              </span>
            </div>
            <button
              class="edit-memory"
              type="button"
              :aria-label="`编辑${item.title}`"
              @click="beginEdit(item)"
            >
              编辑
            </button>
          </div>

          <p class="record-content">{{ item.content }}</p>

          <div class="record-meta-strip">
            <span class="meta-tag">来源: {{ sourceLabel[item.source] ?? item.source }}</span>
            <span class="meta-sep">·</span>
            <span class="meta-tag">范围: {{ scopeLabel[item.scope] ?? item.scope }}</span>
            <span class="meta-sep">·</span>
            <span class="meta-tag">{{ daysLeft(item) }}</span>
          </div>

          <!-- Explanation affordance -->
          <div v-if="item.usages?.length" class="disclosure-strip">
            <button
              class="usage-note"
              type="button"
              @click="showUsage(item)"
            >
              为什么 AI 知道这个？
            </button>
            <p v-if="openedUsageId === item.id" class="disclosure-text">
              最近由 {{ item.usages[0]?.taskType }} 使用，任务 {{ item.usages[0]?.jobId }}
            </p>
          </div>

          <!-- Actions -->
          <div class="record-actions">
            <button
              v-if="item.status === 'active'"
              class="action-link"
              type="button"
              @click="update(item, { status: 'disabled' }, '这条记忆已禁止未来使用。')"
            >
              以后不要用
            </button>
            <button
              v-else-if="item.status === 'disabled'"
              class="action-link"
              type="button"
              @click="update(item, { status: 'active' }, '这条记忆已恢复使用。')"
            >
              恢复使用
            </button>
            <button
              v-if="item.status !== 'expired'"
              class="action-link"
              type="button"
              @click="update(item, { status: 'expired' }, '这条记忆已立即到期。')"
            >
              立即过期
            </button>
            <button
              class="action-link action-danger"
              type="button"
              @click="remove(item)"
            >
              {{ pendingDeleteId === item.id ? '确认删除' : '删除' }}
            </button>
          </div>

          <!-- In-place Edit Form -->
          <form
            v-if="editingId === item.id"
            class="edit-inline-form"
            @submit.prevent="update(item, { ...editDraft }, '这条记忆已经更新。')"
          >
            <div class="form-field">
              <label class="form-label" :for="`edit-title-${item.id}`">标题</label>
              <input
                :id="`edit-title-${item.id}`"
                v-model="editDraft.title"
                class="form-input"
                aria-label="编辑记忆标题"
                maxlength="100"
              />
            </div>
            <div class="form-field">
              <label class="form-label" :for="`edit-content-${item.id}`">内容</label>
              <textarea
                :id="`edit-content-${item.id}`"
                v-model="editDraft.content"
                class="form-textarea"
                aria-label="编辑记忆内容"
                maxlength="500"
              ></textarea>
            </div>
            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label" :for="`edit-scope-${item.id}`">使用范围</label>
                <select
                  :id="`edit-scope-${item.id}`"
                  v-model="editDraft.scope"
                  class="form-select"
                  aria-label="编辑记忆范围"
                >
                  <option value="all_ai">所有允许的 AI 任务</option>
                  <option value="journey">仅 Journey</option>
                  <option value="recovery">仅 Recovery</option>
                  <option value="support">仅现实支持</option>
                </select>
              </div>
              <div class="form-field">
                <label class="form-label" :for="`edit-days-${item.id}`">保留天数</label>
                <input
                  :id="`edit-days-${item.id}`"
                  v-model.number="editDraft.days"
                  class="form-input"
                  aria-label="编辑记忆保留天数"
                  type="number"
                  min="1"
                  max="3650"
                />
              </div>
            </div>
            <div class="form-actions">
              <button class="btn-cancel" type="button" @click="editingId = ''">取消</button>
              <button class="btn-submit" type="submit" :disabled="busyId === item.id">保存修改</button>
            </div>
          </form>
        </article>
      </div>

      <div v-else class="empty-surface">
        <p class="empty-note">这里还没有记忆记录。系统不会从日常对话中收集你的个人画像。</p>
      </div>
    </section>
  </section>
</template>

<style scoped>
.memory-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
  padding: 12px 16px calc(112px + env(safe-area-inset-bottom));
  background: var(--gn-bg);
  color: var(--gn-text);
  font-family: var(--gn-font-body);
}

.memory-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 4px 4px;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  min-height: 32px;
  margin-top: 2px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--gn-muted);
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
}

.header-titles {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.memory-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--gn-ink);
}

.memory-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--gn-muted);
}

.memory-status-strip {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.status-strip-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.status-strip-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--gn-ink);
}

.status-strip-note {
  font-size: 12px;
  color: var(--gn-muted);
}

.permission-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper-warm);
}

.notice-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.notice-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--gn-ink);
}

.notice-desc {
  margin: 0;
  font-size: 12px;
  color: var(--gn-muted);
  line-height: 1.4;
}

.notice-btn {
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper);
  color: var(--gn-ink);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  flex-shrink: 0;
}

.status-msg {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--gn-radius-card);
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
  font-size: 13px;
  line-height: 1.4;
}

.status-msg.error {
  color: var(--gn-danger);
}

.status-msg.success {
  color: var(--gn-leaf-deep);
}

.status-msg.info {
  color: var(--gn-muted);
}

/* Forms */
.form-surface {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.form-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--gn-ink);
}

.form-close-btn {
  border: 0;
  background: transparent;
  font-size: 20px;
  color: var(--gn-muted);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--gn-muted);
}

.form-input,
.form-textarea,
.form-select {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  padding: 8px 10px;
  background: var(--gn-bg);
  color: var(--gn-ink);
  font-family: inherit;
  font-size: 13px;
}

.form-textarea {
  min-height: 72px;
  resize: vertical;
}

.form-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.btn-cancel {
  min-height: 32px;
  padding: 0 14px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper);
  color: var(--gn-ink);
  font-size: 13px;
  cursor: pointer;
}

.btn-submit {
  min-height: 32px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn-submit:disabled {
  opacity: 0.6;
}

/* Create button bar */
.create-bar {
  display: flex;
}

.create-btn {
  width: 100%;
  min-height: 42px;
  border: 1px dashed var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  color: var(--gn-leaf-deep);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.create-btn:active {
  background: var(--gn-paper-warm);
}

/* Group section & Records */
.group-section {
  display: flex;
  flex-direction: column;
}

.section-label {
  padding: 8px 4px 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--gn-muted);
}

.records-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.record-surface {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.record-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.record-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.record-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--gn-ink);
  line-height: 1.3;
}

.status-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--gn-line);
  color: var(--gn-muted);
}

.status-badge.active {
  color: var(--gn-leaf-deep);
  background: var(--gn-leaf-soft);
  border-color: transparent;
}

.edit-memory {
  border: 0;
  background: transparent;
  color: var(--gn-muted);
  font-size: 13px;
  cursor: pointer;
  padding: 2px 6px;
}

.record-content {
  margin: 0;
  font-size: 13px;
  color: var(--gn-text);
  line-height: 1.5;
}

.record-meta-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  font-size: 11px;
  color: var(--gn-muted);
}

.meta-sep {
  color: var(--gn-line);
}

.disclosure-strip {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 4px;
}

.usage-note {
  align-self: flex-start;
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--gn-leaf-deep);
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.disclosure-text {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--gn-muted);
  line-height: 1.4;
  background: var(--gn-paper-warm);
  padding: 6px 10px;
  border-radius: var(--gn-radius-small);
}

.record-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  border-top: 1px solid var(--gn-line);
  padding-top: 8px;
  margin-top: 2px;
}

.action-link {
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--gn-muted);
  font-size: 12px;
  cursor: pointer;
}

.action-link:hover,
.action-link:active {
  color: var(--gn-ink);
}

.action-link.action-danger {
  color: var(--gn-danger);
  margin-left: auto;
}

.edit-inline-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--gn-line);
  padding-top: 10px;
  margin-top: 4px;
}

.empty-surface {
  padding: 24px 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  text-align: center;
}

.empty-note {
  margin: 0;
  font-size: 13px;
  color: var(--gn-muted);
  line-height: 1.5;
}

@media (max-width: 374px) {
  .memory-page {
    padding-right: 12px;
    padding-left: 12px;
  }
}
</style>
