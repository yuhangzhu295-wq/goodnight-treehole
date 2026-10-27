<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

const route = useRoute();
const router = useRouter();
const matchId = computed(() => String(route.query.matchId ?? ''));
const feedback = ref('helpful');
const note = ref('');
const panelOpen = ref(false);
const busy = ref(false);
const loading = ref(true);
const loadError = ref('');
const saveError = ref('');
const complete = ref(false);
const savedNote = ref('');
const conversation = ref<any>(null);
const journeyId = ref('');

async function load() {
  if (!matchId.value) {
    loading.value = false;
    loadError.value = '缺少匹配编号，无法查看交流结束记录。';
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    const convRes = await api.get<{ items: any[] }>('/api/v1/peer-conversations');
    const foundConv = (convRes.items ?? []).find((item: any) => item.matchId === matchId.value);
    if (!foundConv) {
      loadError.value = '未找到对应的会话记录，该同行可能尚未开启或不存在。';
      return;
    }
    if (foundConv.status === 'active') {
      await router.replace(`/pages/peer/conversation?matchId=${encodeURIComponent(matchId.value)}`);
      return;
    }
    conversation.value = foundConv;
    journeyId.value = foundConv.journeyId ? String(foundConv.journeyId) : '';
  } catch (cause: any) {
    loadError.value = cause?.message ?? '会话信息加载失败，请检查网络后重试。';
  } finally {
    loading.value = false;
  }
}

function goJourney() {
  if (journeyId.value) router.push(`/pages/journey/detail?id=${encodeURIComponent(journeyId.value)}`);
  else router.push('/pages/peers/index');
}

async function save(shareLater: boolean) {
  if (!matchId.value) return;
  busy.value = true;
  saveError.value = '';
  try {
    await api.post(`/api/v1/peer-conversations/${encodeURIComponent(matchId.value)}/feedback`, {
      feedback: feedback.value,
      note: note.value.trim(),
      shareLater,
    });
    complete.value = true;
    savedNote.value = note.value.trim();
    goJourney();
  } catch (cause: any) {
    saveError.value = cause?.message ?? '这份感受暂时没有保存成功，请重试';
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="peer-graduation-page">
    <header class="end-bar">
      <button
        class="back-btn"
        data-testid="peer-graduate-back"
        type="button"
        aria-label="返回同路"
        @click="router.push('/pages/peers/index')"
      >
        ‹
      </button>
      <h1>交流结束</h1>
      <span aria-hidden="true"></span>
    </header>

    <div class="end-body">
      <p v-if="loading" class="end-state" data-testid="peer-graduate-loading">正在读取交流记录…</p>
      <LoadErrorBanner v-else-if="loadError" :message="loadError" retry-label="重新加载" @retry="load" />

      <template v-else-if="conversation">
        <section class="end-hero" aria-label="交流已结束">
          <span class="end-check" aria-hidden="true">✓</span>
          <h2>这次交流已结束</h2>
          <p>你们分享过的经历仍会按约定保留。</p>
        </section>

        <section class="records" aria-label="留给自己的记录">
          <h3 class="records-title">留给自己的记录</h3>

          <button
            class="record-row"
            data-testid="peer-graduate-note"
            type="button"
            :aria-expanded="panelOpen"
            @click="panelOpen = !panelOpen"
          >
            <span class="record-copy">
              <strong>这段交流中有用的一句话</strong>
              <small>{{ savedNote || '点击展开，写下一句留给自己的话（可选）' }}</small>
            </span>
            <span class="record-chevron" aria-hidden="true">›</span>
          </button>

          <div v-if="panelOpen" class="record-panel">
            <span class="panel-label">这次交流的体验</span>
            <div class="feelings-row" role="group" aria-label="这次交流的体验">
              <button
                v-for="option in [
                  { value: 'helpful', label: '有帮助' },
                  { value: 'unchanged', label: '没有变化' },
                  { value: 'uncomfortable', label: '有点不适' },
                ]"
                :key="option.value"
                type="button"
                :class="['btn-feeling', { selected: feedback === option.value }]"
                :data-testid="`peer-graduate-feeling-${option.value}`"
                @click="feedback = option.value"
              >
                {{ option.label }}
              </button>
            </div>
            <label class="note-field">
              <span>想留下的一句话（可选）</span>
              <textarea
                v-model="note"
                maxlength="500"
                data-testid="peer-graduate-note-input"
                placeholder="只会在你明确选择匿名分享后，作为后来的一部分。"
              ></textarea>
            </label>
            <p v-if="complete" class="saved-note" role="status">已保存本次反馈。</p>
          </div>

          <button
            class="record-row"
            data-testid="peer-graduate-timeline"
            type="button"
            @click="goJourney"
          >
            <span class="record-copy">
              <strong>查看旅程时间线</strong>
              <small>{{ journeyId ? '回到关联的旅程进展' : '回到同路页面' }}</small>
            </span>
            <span class="record-chevron" aria-hidden="true">›</span>
          </button>
        </section>

        <p class="end-note">没有必要为了继续联系而保持这段会话。</p>
        <p v-if="saveError" class="save-error" role="status" data-testid="peer-graduate-save-error">
          {{ saveError }}
        </p>

        <div class="end-actions">
          <button
            class="btn-primary"
            data-testid="peer-graduate-save"
            type="button"
            :disabled="busy || complete"
            @click="save(false)"
          >
            {{ busy ? '正在保存…' : '保存并回到我的旅程' }}
          </button>
          <button
            class="btn-text"
            data-testid="peer-graduate-share"
            type="button"
            :disabled="busy || complete"
            @click="save(true)"
          >
            愿意匿名分享
          </button>
          <button
            class="btn-text muted"
            data-testid="peer-graduate-skip"
            type="button"
            @click="goJourney"
          >
            先不分享
          </button>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.peer-graduation-page {
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

:global(.phone-shell:has(.peer-graduation-page)) {
  padding-bottom: 0;
}

.end-bar {
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

.end-bar h1 {
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
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--gn-ink);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.end-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 0 16px calc(16px + env(safe-area-inset-bottom));
}

.end-state {
  margin: 32px 0;
  color: var(--gn-muted);
  font-size: 13px;
  text-align: center;
}

.end-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 52px 8px 36px;
  text-align: center;
}

/* A single check, not confetti: the prompt forbids turning the end into a medal. */
.end-check {
  color: var(--gn-leaf);
  font-size: 40px;
  font-weight: 600;
  line-height: 1;
}

.end-hero h2 {
  margin: 6px 0 0;
  color: var(--gn-ink);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
}

.end-hero p {
  margin: 0;
  max-width: 300px;
  color: var(--gn-muted);
  font-size: 14px;
  line-height: 1.6;
}

.records {
  display: flex;
  flex-direction: column;
}

.records-title {
  margin: 0 0 4px;
  color: var(--gn-ink);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
}

.record-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: 68px;
  padding: 12px 0;
  border: 0;
  border-bottom: 1px solid var(--gn-line);
  border-radius: 0;
  background: none;
  text-align: left;
  cursor: pointer;
}

.record-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.record-copy strong {
  color: var(--gn-ink);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
}

.record-copy small {
  overflow: hidden;
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record-chevron {
  flex: none;
  color: #b6bcc4;
  font-size: 20px;
  line-height: 1;
}

.record-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 0 16px;
  border-bottom: 1px solid var(--gn-line);
}

.panel-label {
  color: var(--gn-muted);
  font-size: 12px;
  font-weight: 500;
}

.feelings-row {
  display: flex;
  gap: 8px;
}

.btn-feeling {
  flex: 1;
  min-height: 36px;
  padding: 0 8px;
  border: 1px solid var(--gn-line);
  border-radius: 8px;
  background: var(--gn-paper);
  color: var(--gn-ink-soft);
  font-family: var(--gn-font-body);
  font-size: 13px;
  cursor: pointer;
}

.btn-feeling.selected {
  border-color: var(--gn-leaf);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-weight: 600;
}

.note-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--gn-muted);
  font-size: 12px;
}

.note-field textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 76px;
  padding: 10px 12px;
  border: 1px solid var(--gn-line);
  border-radius: 8px;
  background: var(--gn-bg);
  color: var(--gn-ink);
  font-family: var(--gn-font-body);
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
}

.saved-note {
  margin: 0;
  color: var(--gn-leaf-deep);
  font-size: 13px;
}

.save-error {
  margin: 12px 0 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--gn-paper);
  border: 1px solid var(--gn-line);
  color: var(--gn-danger, #d32f2f);
  font-size: 13px;
}

.end-note {
  margin: 16px 0 0;
  padding: 14px 16px;
  border-radius: 8px;
  background: #f2f4f6;
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.6;
}

.end-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
  padding-top: 28px;
}

.btn-primary {
  width: 100%;
  min-height: 48px;
  border: 0;
  border-radius: 8px;
  background: var(--gn-leaf);
  color: #ffffff;
  font-family: var(--gn-font-body);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.6;
}

.btn-text {
  width: 100%;
  min-height: 40px;
  border: 0;
  background: none;
  color: var(--gn-leaf-deep);
  font-family: var(--gn-font-body);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-text.muted {
  color: var(--gn-muted);
  font-weight: 400;
}
</style>
