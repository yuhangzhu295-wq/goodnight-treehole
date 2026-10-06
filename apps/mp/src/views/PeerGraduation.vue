<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

const route = useRoute();
const router = useRouter();
const matchId = computed(() => String(route.query.matchId ?? ''));
const feedback = ref('helpful');
const note = ref('');
const noteOpen = ref(false);
const busy = ref(false);
const error = ref('');
const complete = ref(false);
const conversation = ref<any>(null);

const messageCount = computed(() => conversation.value?.messages?.length ?? 0);
const startedLabel = computed(() => {
  const source = conversation.value?.startsAt;
  return source ? new Date(source).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '刚刚';
});

async function loadConversation() {
  try {
    const response = await api.get<{ items: any[] }>('/api/v1/peer-conversations');
    conversation.value = response.items.find((item) => item.matchId === matchId.value) ?? null;
  } catch {
    conversation.value = null;
  }
}

async function save(shareLater: boolean) {
  if (!matchId.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api.post(`/api/v1/peer-conversations/${encodeURIComponent(matchId.value)}/feedback`, {
      feedback: feedback.value,
      note: note.value,
      shareLater,
    });
    complete.value = true;
  } catch (cause: any) {
    error.value = cause?.message ?? '这份感受暂时没有保存成功';
  } finally {
    busy.value = false;
  }
}

onMounted(loadConversation);
</script>

<template>
  <section class="goodnight-page peer-graduation-page">
    <header class="peer-header">
      <div class="header-titles">
        <h1 class="peer-title">同行结束</h1>
        <p class="peer-subtitle">感谢遵守匿名边界，这段同行已告一段落</p>
      </div>
    </header>

    <section v-if="conversation" class="stats-strip" aria-label="同行数据总结">
      <div class="stat-unit">
        <span class="stat-num">{{ messageCount }}</span>
        <span class="stat-label">交流消息</span>
      </div>
      <div class="stat-sep" aria-hidden="true"></div>
      <div class="stat-unit">
        <span class="stat-num">72h</span>
        <span class="stat-label">时间边界</span>
      </div>
      <div class="stat-sep" aria-hidden="true"></div>
      <div class="stat-unit">
        <span class="stat-num">{{ startedLabel }}</span>
        <span class="stat-label">开启时间</span>
      </div>
    </section>

    <section class="feedback-panel">
      <div class="preview-box">
        <span class="preview-badge">同行总结</span>
        <h2 class="preview-title">刚走过的一段路</h2>
        <p class="preview-desc">按自己的节奏走，也是一种前进。留下反馈可帮助我们持续改进匿名同行机制。</p>
      </div>

      <div class="feelings-group" aria-label="这段同行的感受">
        <span class="field-label">本次交流的体验</span>
        <div class="feelings-row">
          <button
            v-for="option in [
              { value: 'helpful', label: '有帮助' },
              { value: 'unchanged', label: '没有变化' },
              { value: 'uncomfortable', label: '有点不适' },
            ]"
            :key="option.value"
            type="button"
            :class="['btn-feeling', { selected: feedback === option.value }]"
            @click="feedback = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <button
        class="note-toggle"
        type="button"
        :aria-expanded="noteOpen"
        @click="noteOpen = !noteOpen"
      >
        {{ noteOpen ? '收起留言' : '留下一句话（可选）' }}
      </button>

      <label v-if="noteOpen" class="note-field">
        <span>想留下的一句话</span>
        <textarea
          v-model="note"
          maxlength="500"
          placeholder="只会在你明确选择匿名分享后，作为后来的一部分。"
        />
      </label>

      <p v-if="complete" class="success-note">已保存本次反馈。感谢你认真走过这一程。</p>

      <div class="action-stack">
        <button
          class="btn-primary"
          :disabled="busy || complete"
          type="button"
          @click="save(true)"
        >
          {{ busy ? '正在保存…' : '愿意匿名分享' }}
        </button>
        <button
          class="btn-secondary"
          :disabled="busy || complete"
          type="button"
          @click="save(false)"
        >
          {{ complete ? '已完成' : '以后再说' }}
        </button>
        <button
          class="btn-text"
          type="button"
          @click="router.push('/pages/peers/index')"
        >
          先不分享
        </button>
      </div>
    </section>

    <p v-if="error" class="error-note" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.peer-graduation-page {
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

.peer-header {
  padding: 8px 4px 4px;
}

.peer-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--gn-ink);
}

.peer-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--gn-muted);
}

.stats-strip {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 12px 8px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.stat-unit {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex: 1;
}

.stat-num {
  font-size: 18px;
  font-weight: 700;
  color: var(--gn-ink);
  line-height: 1.2;
}

.stat-label {
  font-size: 11px;
  color: var(--gn-muted);
}

.stat-sep {
  width: 1px;
  height: 24px;
  background: var(--gn-line);
}

.feedback-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.preview-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
}

.preview-badge {
  align-self: flex-start;
  padding: 2px 7px;
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-size: 11px;
  font-weight: 600;
}

.preview-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--gn-ink);
}

.preview-desc {
  margin: 0;
  font-size: 13px;
  color: var(--gn-muted);
  line-height: 1.5;
}

.feelings-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--gn-ink);
}

.feelings-row {
  display: flex;
  gap: 8px;
}

.btn-feeling {
  flex: 1;
  min-height: 36px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  color: var(--gn-ink-soft);
  font-size: 13px;
  cursor: pointer;
}

.btn-feeling.selected {
  border-color: var(--gn-leaf);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-weight: 600;
}

.note-toggle {
  align-self: flex-start;
  border: 0;
  background: transparent;
  color: var(--gn-leaf-deep);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 0;
  text-decoration: underline;
}

.note-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--gn-ink);
}

.note-field textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 64px;
  resize: none;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  padding: 8px 10px;
  font-family: inherit;
  font-size: 13px;
  color: var(--gn-ink);
  line-height: 1.5;
}

.success-note {
  margin: 0;
  padding: 8px 12px;
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-size: 12px;
  line-height: 1.45;
}

.action-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.btn-primary {
  min-height: 42px;
  border: 0;
  border-radius: var(--gn-radius-card);
  background: var(--gn-leaf);
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.6;
}

.btn-secondary {
  min-height: 38px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  color: var(--gn-ink-soft);
  font-size: 13px;
  cursor: pointer;
}

.btn-secondary:disabled {
  opacity: 0.6;
}

.btn-text {
  min-height: 32px;
  border: 0;
  background: transparent;
  color: var(--gn-muted);
  font-size: 12px;
  cursor: pointer;
}

.error-note {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--gn-radius-card);
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
  color: var(--gn-danger);
  font-size: 13px;
}
</style>
