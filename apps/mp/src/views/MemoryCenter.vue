<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import AppIcon from '../components/icons/AppIcon.vue';

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
const composerOpen = ref(false);
const editingId = ref('');
const pendingDeleteId = ref('');
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
    <header class="memory-hero">
      <button aria-label="返回" @click="router.back()"><AppIcon name="back" :size="20" /></button>
      <h1>AI记得什么</h1>
      <p>只记住你同意保留、并且对你有帮助的内容。</p>
    </header>
    <main class="memory-paper">
      <div class="memory-trust">
        <span aria-hidden="true">⌁</span><strong>你可以完全掌控这里</strong><small>目前有 {{ activeCount }} 条可被允许范围内的 AI 使用</small>
      </div>
      <section v-if="!memoryAllowed" class="memory-off" data-testid="memory-privacy-off">
        <strong>AI 记忆当前已关闭</strong>
        <p>现有内容仍对你可见，但任何 AI 任务都不能读取。</p>
        <button @click="router.push('/pages/settings/privacy')">去隐私设置</button>
      </section>
      <p v-if="loading" class="state-note">正在读取你允许保存的内容…</p>
      <section v-else class="memory-list">
        <article v-for="(item, index) in items" :key="item.id" class="memory-card" :class="`memory-card-${index % 4}`">
          <div class="memory-icon" aria-hidden="true">{{ ['♥', '♧', '●', '☾'][index % 4] }}</div>
          <div class="memory-main">
            <h2>{{ item.title }}</h2>
            <p>{{ item.content }}</p>
            <small>来自：{{ sourceLabel[item.source] ?? item.source }} · {{ scopeLabel[item.scope] ?? item.scope }} ·
              {{ daysLeft(item) }}</small><small>状态：{{
              item.status === 'active' ? '允许使用' : item.status === 'disabled' ? '禁止未来使用' : '已到期'
            }}</small><button
              v-if="item.usages?.length"
              class="usage-note"
              type="button"
              @click="notice = `最近由 ${item.usages?.[0]?.taskType} 使用，任务 ${item.usages?.[0]?.jobId}`"
            >
              为什么 AI 知道这个？
            </button>
          </div>
          <button class="edit-memory" type="button" :aria-label="`编辑${item.title}`" @click="beginEdit(item)">
            ✎
          </button>
          <div class="memory-actions">
            <button type="button" @click="remove(item)">{{ pendingDeleteId === item.id ? '确认删除' : '删除' }}</button><button
              v-if="item.status === 'active'"
              type="button"
              @click="update(item, { status: 'disabled' }, '这条记忆已禁止未来使用。')"
            >
              以后不要用
            </button><button
              v-else-if="item.status === 'disabled'"
              type="button"
              @click="update(item, { status: 'active' }, '这条记忆已恢复使用。')"
            >
              恢复使用
            </button><button
              v-if="item.status !== 'expired'"
              type="button"
              @click="update(item, { status: 'expired' }, '这条记忆已立即到期。')"
            >
              立即过期
            </button>
          </div>
          <form
            v-if="editingId === item.id"
            class="memory-edit"
            @submit.prevent="update(item, { ...editDraft }, '这条记忆已经更新。')"
          >
            <input v-model="editDraft.title" aria-label="编辑记忆标题" maxlength="100" /><textarea
              v-model="editDraft.content"
              aria-label="编辑记忆内容"
              maxlength="500"
            ></textarea>
            <div>
              <select v-model="editDraft.scope" aria-label="编辑记忆范围">
                <option value="all_ai">所有允许的 AI 任务</option>
                <option value="journey">仅 Journey</option>
                <option value="recovery">仅 Recovery</option>
                <option value="support">仅现实支持</option>
              </select><input v-model.number="editDraft.days" aria-label="编辑记忆保留天数" type="number" min="1" max="3650" />
            </div>
            <button type="submit" :disabled="busyId === item.id">保存修改</button><button type="button" @click="editingId = ''">取消</button>
          </form>
        </article>
        <p v-if="!items.length" class="empty-note">这里还没有记忆。系统不会从普通对话里偷偷建立你的画像。</p>
      </section>
      <p v-if="error" class="error-note" role="alert">{{ error }}</p>
      <p v-if="notice" class="saved-note" role="status">{{ notice }}</p>
      <form v-if="composerOpen" class="memory-create" @submit.prevent="createMemory">
        <label>标题<input v-model="createDraft.title" maxlength="100" placeholder="这条记忆叫什么" /></label><label>内容<textarea
          v-model="createDraft.content"
          maxlength="500"
          placeholder="只写你明确希望系统记住的内容"
        ></textarea>
        </label>
        <div>
          <label>使用范围<select v-model="createDraft.scope">
            <option value="all_ai">所有允许的 AI 任务</option>
            <option value="journey">仅 Journey</option>
            <option value="recovery">仅 Recovery</option>
            <option value="support">仅现实支持</option>
          </select></label><label>保留天数<input v-model.number="createDraft.days" type="number" min="1" max="3650" /></label>
        </div>
        <button type="submit" data-testid="memory-create-save" :disabled="busyId === 'create'">确认并保存</button><button type="button" @click="composerOpen = false">取消</button>
      </form>
      <button
        v-if="memoryAllowed && !composerOpen"
        class="memory-primary"
        data-testid="memory-create-open"
        @click="composerOpen = true"
      >
        保存一条我确认的记忆<span aria-hidden="true">✦</span>
      </button>
    </main>
  </section>
</template>

<style scoped>
.memory-page {
  display: grid;
  align-content: start;
  overflow-x: hidden;
  padding: 0 22px 40px;
  background: #eee7dc;
  color: #28382e;
}
.memory-hero {
  position: relative;
  min-height: 162px;
  margin: 0 -22px;
  width: calc(100% + 44px);
  max-width: none;
  padding: 22px 24px 16px;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgba(255, 244, 218, 0.08), rgba(30, 42, 53, 0.18)),
    url('../assets/goodnight/illustrations/night-scene.png') center/cover;
  color: #fdf8ee;
  text-align: center;
}
.memory-hero::after {
  position: absolute;
  inset: auto 0 0;
  height: 35px;
  background: linear-gradient(transparent, #eee7dc);
  content: '';
  pointer-events: none;
}
.memory-hero > * {
  position: relative;
  z-index: 1;
}
.memory-hero > button {
  position: absolute;
  left: 24px;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  min-height: 34px;
  border: 0;
  border-radius: 50%;
  padding: 0;
  background: #f5eedf;
  color: #4f6251;
}
.memory-hero h1 {
  margin: 54px 0 4px;
  color: #fffaf0;
  font:
    600 29px/1.2 Georgia,
    'Noto Serif SC',
    serif;
  letter-spacing: 0;
}
.memory-hero p {
  margin: 0;
  color: rgba(255, 250, 240, 0.82);
  font-size: 11px;
}
.memory-paper {
  position: relative;
  z-index: 2;
  display: grid;
  gap: 8px;
  margin-top: -7px;
  border: 1px solid rgba(81, 98, 71, 0.16);
  border-radius: 20px;
  padding: 11px 15px 13px;
  background: rgba(255, 251, 244, 0.97);
  box-shadow: 0 13px 30px rgba(48, 57, 41, 0.1);
}
.memory-trust {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 4px 7px;
  justify-self: center;
  border-radius: 999px;
  padding: 7px 13px;
  background: #eef0df;
  color: #607154;
  font-size: 10px;
}
.memory-trust span {
  grid-row: 1/3;
}
.memory-trust small {
  font-size: 8px;
  color: #81877c;
}
.memory-list {
  display: grid;
  gap: 7px;
}
.memory-card {
  position: relative;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 25px;
  gap: 9px;
  border: 1px solid rgba(86, 105, 74, 0.12);
  border-radius: 14px;
  padding: 10px 10px 8px;
  background: #fffdf8;
}
.memory-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #e6ead9;
  color: #587052;
  font-size: 17px;
}
.memory-main h2 {
  margin: 0;
  color: #344739;
  font:
    600 13px/1.4 Georgia,
    'Noto Serif SC',
    serif;
}
.memory-main p {
  margin: 3px 0;
  color: #535f55;
  font-size: 10px;
  line-height: 1.45;
}
.memory-main small {
  display: block;
  color: #8a8d84;
  font-size: 8px;
  line-height: 1.45;
}
.usage-note {
  min-height: 20px;
  border: 0;
  padding: 0;
  background: transparent;
  color: #587253;
  font: 8px inherit;
  text-decoration: underline;
}
.edit-memory {
  display: grid;
  place-items: center;
  width: 25px;
  height: 25px;
  min-height: 25px;
  border: 0;
  border-radius: 50%;
  padding: 0;
  background: #edf0e4;
  color: #5c7055;
}
.memory-actions {
  grid-column: 2/4;
  display: flex;
  border-top: 1px solid rgba(86, 105, 74, 0.1);
  padding-top: 6px;
}
.memory-actions button {
  flex: 1;
  min-height: 24px;
  border: 0;
  border-right: 1px solid rgba(86, 105, 74, 0.1);
  background: transparent;
  color: #687466;
  font-family: inherit;
  font-size: 9px;
}
.memory-actions button:last-child {
  border-right: 0;
}
.memory-edit {
  grid-column: 1/4;
  display: grid;
  gap: 5px;
  border-top: 1px solid rgba(86, 105, 74, 0.1);
  padding-top: 7px;
}
.memory-edit input,
.memory-edit textarea,
.memory-edit select,
.memory-create input,
.memory-create textarea,
.memory-create select {
  box-sizing: border-box;
  width: 100%;
  min-height: 31px;
  border: 1px solid rgba(86, 105, 74, 0.15);
  border-radius: 8px;
  padding: 6px 8px;
  background: #fff;
  color: #304135;
  font-family: inherit;
  font-size: 10px;
}
.memory-edit textarea,
.memory-create textarea {
  min-height: 55px;
  resize: none;
}
.memory-edit > div,
.memory-create > div {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 5px;
}
.memory-edit > button,
.memory-create > button {
  min-height: 32px;
  border: 0;
  border-radius: 8px;
  background: #dfe7d6;
  color: #405c41;
}
.memory-off,
.memory-create {
  display: grid;
  gap: 7px;
  border-radius: 13px;
  padding: 11px;
  background: #f3eee1;
}
.memory-off p {
  margin: 0;
  color: #747b72;
  font-size: 10px;
}
.memory-off button {
  justify-self: start;
  border: 0;
  border-radius: 999px;
  padding: 6px 12px;
  background: #637c57;
  color: #fff;
  font-family: inherit;
  font-size: 10px;
}
.memory-create label {
  display: grid;
  gap: 3px;
  color: #606c5d;
  font-size: 9px;
}
.memory-primary {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  border: 0;
  border-radius: 999px;
  background: #3e6149;
  color: #fff;
  font-family: inherit;
  font-size: 12px;
}
.state-note,
.error-note,
.saved-note,
.empty-note {
  margin: 0;
  border-radius: 10px;
  padding: 9px;
  font-size: 10px;
  line-height: 1.5;
}
.state-note,
.empty-note {
  background: #f5f1e7;
  color: #747c72;
}
.error-note {
  background: #fff0ec;
  color: var(--gn-danger);
}
.saved-note {
  background: #e8efe0;
  color: #476447;
}
@media (max-width: 374px) {
  .memory-page {
    padding-right: 14px;
    padding-left: 14px;
  }
  .memory-hero {
    margin-right: -14px;
    margin-left: -14px;
  }
  .memory-card {
    grid-template-columns: 34px minmax(0, 1fr) 24px;
    padding-right: 8px;
    padding-left: 8px;
  }
}
</style>
