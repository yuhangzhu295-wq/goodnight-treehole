<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, deleteMedia, resolveApiUrl, uploadMedia, type UploadedMedia } from '../api';

type FeedbackAsset = Pick<UploadedMedia, 'id' | 'url'> & { name: string };
type FeedbackTicket = { id: string; content: string; status?: string; createdAt?: string; reply?: string };

const router = useRouter();
const faqs = ref<any[]>([]);
const cats = ref<any[]>([]);
const categoryId = ref('');
const content = ref('');
const assets = ref<Array<FeedbackAsset | null>>([null, null]);
const tickets = ref<FeedbackTicket[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
const openedFaq = ref('');
const support = ref(false);
const loading = ref(true);
const loadError = ref('');
const formMessage = ref('');
const submitting = ref(false);
const uploadingSlot = ref<number | null>(null);
const removingSlot = ref<number | null>(null);
const pendingSlot = ref(0);

const visibleFaqs = computed(() => faqs.value.slice(0, 5));
const characterCount = computed(() => content.value.length);
const attachmentCount = computed(() => assets.value.filter(Boolean).length);
const assetIds = computed(() => assets.value.flatMap((asset) => asset ? [asset.id] : []));

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const [faqResponse, categoryResponse, ticketResponse] = await Promise.all([
      api.get<any>('/api/v1/feedback/faqs'),
      api.get<any>('/api/v1/feedback/categories'),
      api.get<any>('/api/v1/feedback'),
    ]);
    faqs.value = faqResponse.items ?? [];
    cats.value = categoryResponse.items ?? [];
    tickets.value = ticketResponse.items ?? [];
    if (!cats.value.some((category) => category.id === categoryId.value)) categoryId.value = cats.value[0]?.id ?? '';
  } catch (error: any) {
    loadError.value = error?.message ?? '帮助内容加载失败，请稍后重试。';
  } finally {
    loading.value = false;
  }
}

function statusLabel(status?: string) {
  return ({ open: '待处理', processing: '处理中', resolved: '已解决', closed: '已关闭' } as Record<string, string>)[status ?? ''] ?? '待处理';
}

function formatTime(value?: string) {
  return value ? value.slice(0, 16).replace('T', ' ') : '';
}

function chooseUploadSlot(slot: number) {
  if (uploadingSlot.value !== null || removingSlot.value !== null) return;
  pendingSlot.value = slot;
  fileInput.value?.click();
}

async function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || uploadingSlot.value !== null) return;

  const slot = pendingSlot.value;
  uploadingSlot.value = slot;
  formMessage.value = '';
  try {
    const uploaded = await uploadMedia(file, 'feedback');
    const previous = assets.value[slot];
    const next = [...assets.value];
    next[slot] = { id: uploaded.id, url: resolveApiUrl(uploaded.url), name: file.name };
    assets.value = next;
    if (previous) await deleteMedia(previous.id).catch(() => undefined);
  } catch (error: any) {
    formMessage.value = error?.message ?? '截图上传失败，请选择 JPEG、PNG 或 WebP 图片后重试。';
  } finally {
    uploadingSlot.value = null;
  }
}

async function removeAsset(slot: number) {
  const asset = assets.value[slot];
  if (!asset || removingSlot.value !== null) return;
  removingSlot.value = slot;
  formMessage.value = '';
  try {
    await deleteMedia(asset.id);
    const next = [...assets.value];
    next[slot] = null;
    assets.value = next;
  } catch (error: any) {
    formMessage.value = error?.message ?? '截图删除失败，请稍后重试。';
  } finally {
    removingSlot.value = null;
  }
}

async function submit() {
  const text = content.value.trim();
  if (submitting.value) return;
  if (!text) {
    formMessage.value = '请先写下你遇到的问题或建议。';
    return;
  }

  submitting.value = true;
  formMessage.value = '';
  try {
    await api.post('/api/v1/feedback', {
      categoryId: categoryId.value || undefined,
      content: text,
      sourcePage: '/pages/help/feedback',
      assetIds: assetIds.value,
    });
    content.value = '';
    assets.value = [null, null];
    formMessage.value = '反馈已提交，工单已创建。';
    const ticketResponse = await api.get<any>('/api/v1/feedback');
    tickets.value = ticketResponse.items ?? [];
  } catch (error: any) {
    formMessage.value = error?.message ?? '提交失败，请确认网络后重试。';
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="goodnight-page feedback-help-page">
    <template v-if="!loading">
      <header class="feedback-header">
        <button
          class="back-btn"
          data-testid="front-feedback-back"
          type="button"
          aria-label="返回上一页"
          @click="router.back()"
        >
          ‹
        </button>
        <div class="header-titles">
          <h1 class="feedback-title">帮助与反馈</h1>
          <p class="feedback-subtitle">问题反馈与常见解答</p>
        </div>
      </header>

      <p v-if="loadError" class="status-msg error" role="status">{{ loadError }}</p>

      <!-- Section 1: Feedback Form (Primary Task) -->
      <section class="group-section" aria-label="提交反馈">
        <div class="section-label">提交反馈</div>
        <form class="form-surface" @submit.prevent="submit">
          <!-- Category Row -->
          <div class="form-field">
            <label class="form-label" for="category-select">问题分类</label>
            <select
              id="category-select"
              v-model="categoryId"
              data-testid="select-feedback-category"
              class="form-select"
              aria-label="反馈类型"
            >
              <option v-for="category in cats" :key="category.id" :value="category.id">{{ category.name }}</option>
              <option v-if="!cats.length" value="">一般问题</option>
            </select>
          </div>

          <!-- Content Textarea -->
          <div class="form-field">
            <div class="field-label-row">
              <label class="form-label" for="feedback-content">问题描述</label>
              <span class="char-count" :class="{ limit: characterCount === 500 }">{{ characterCount }}/500</span>
            </div>
            <textarea
              id="feedback-content"
              v-model="content"
              data-testid="input-feedback-content"
              class="form-textarea"
              maxlength="500"
              rows="4"
              placeholder="请描述遇到的问题或改进建议…"
            ></textarea>
          </div>

          <!-- Attachments -->
          <input
            ref="fileInput"
            class="file-input-hidden"
            data-testid="input-feedback-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="选择反馈截图"
            @change="chooseFile"
          />
          <div class="upload-field">
            <div class="field-label-row">
              <span class="form-label">问题截图</span>
              <span class="upload-hint">可选，最多 2 张</span>
            </div>
            <div class="upload-slots" :aria-label="`已上传 ${attachmentCount} 张截图`">
              <div
                v-for="slot in 2"
                :key="slot"
                class="upload-slot"
                :class="{ occupied: assets[slot - 1], loading: uploadingSlot === slot - 1 }"
              >
                <template v-if="assets[slot - 1]">
                  <img class="upload-img" :src="assets[slot - 1]?.url" :alt="`反馈截图 ${assets[slot - 1]?.name}`" />
                  <button
                    class="upload-remove-btn"
                    type="button"
                    :aria-label="`删除截图 ${slot}`"
                    :disabled="removingSlot === slot - 1"
                    @click="removeAsset(slot - 1)"
                  >
                    {{ removingSlot === slot - 1 ? '…' : '×' }}
                  </button>
                </template>
                <button
                  v-else
                  class="upload-add-btn"
                  :data-testid="slot === 1 ? 'btn-feedback-upload' : 'btn-feedback-upload-2'"
                  type="button"
                  :disabled="uploadingSlot !== null"
                  @click="chooseUploadSlot(slot - 1)"
                >
                  <span class="upload-plus" aria-hidden="true">+</span>
                  <span class="upload-text">{{ uploadingSlot === slot - 1 ? '上传中…' : '上传截图' }}</span>
                </button>
              </div>
            </div>
            <div v-if="attachmentCount" class="upload-status" data-testid="feedback-upload-preview" aria-live="polite">
              已添加 {{ attachmentCount }} 张截图
            </div>
          </div>

          <!-- Submit -->
          <button
            class="submit-btn"
            data-testid="btn-feedback-submit"
            type="submit"
            :disabled="submitting || uploadingSlot !== null"
          >
            {{ submitting ? '正在提交…' : '提交反馈' }}
          </button>
          <p v-if="formMessage" class="status-msg success" role="status" aria-live="polite">{{ formMessage }}</p>
        </form>
      </section>

      <!-- Section 2: FAQ List -->
      <section class="group-section" aria-label="常见问题">
        <div class="section-header-row">
          <span class="section-label">常见问题</span>
          <button
            class="section-link-btn"
            data-testid="btn-faq-all"
            type="button"
            @click="router.push('/pages/help/faqs')"
          >
            查看全部 ›
          </button>
        </div>
        <div v-if="visibleFaqs.length" class="group-surface">
          <article
            v-for="(faq, index) in visibleFaqs"
            :key="faq.id"
            class="faq-item"
            :data-testid="index === 0 ? 'faq-item-first' : `faq-item-${index + 1}`"
          >
            <button
              class="faq-trigger"
              type="button"
              :aria-expanded="openedFaq === faq.id"
              @click="openedFaq = openedFaq === faq.id ? '' : faq.id"
            >
              <span class="faq-icon" aria-hidden="true">?</span>
              <strong class="faq-question">{{ faq.question }}</strong>
              <span class="faq-chevron" :class="{ open: openedFaq === faq.id }" aria-hidden="true">›</span>
            </button>
            <div v-if="openedFaq === faq.id" class="faq-content">
              <p class="faq-answer">{{ faq.answer }}</p>
            </div>
          </article>
        </div>
        <div v-else class="empty-surface">
          <p class="empty-note">暂时没有可展示的常见问题。</p>
        </div>
      </section>

      <!-- Section 3: Emergency Support Row -->
      <section class="group-section" aria-label="紧急支持">
        <div class="section-label">紧急支持</div>
        <div class="emergency-strip">
          <div class="emergency-info">
            <strong class="emergency-title">如遇心理危机，请寻求专业帮助</strong>
            <span class="emergency-desc">全国心理援助热线：12356（24小时在线）</span>
          </div>
          <button
            class="emergency-btn"
            data-testid="btn-support-more"
            type="button"
            @click="support = true"
          >
            了解说明
          </button>
        </div>
      </section>

      <!-- Section 4: Ticket History -->
      <section class="group-section" data-testid="feedback-ticket-history" aria-label="我的反馈记录">
        <div class="section-label">我的反馈 ({{ tickets.length }})</div>
        <div v-if="tickets.length" class="group-surface">
          <article
            v-for="ticket in tickets"
            :key="ticket.id"
            class="ticket-item"
            :data-testid="`feedback-ticket-${ticket.id}`"
          >
            <div class="ticket-header">
              <span class="ticket-status-badge" :class="ticket.status">{{ statusLabel(ticket.status) }}</span>
              <span class="ticket-time">{{ formatTime(ticket.createdAt) }}</span>
            </div>
            <p class="ticket-text">{{ ticket.content }}</p>
            <div v-if="ticket.reply" class="ticket-reply-strip" data-testid="feedback-ticket-reply">
              <strong class="reply-label">管理员回复</strong>
              <p class="reply-text">{{ ticket.reply }}</p>
            </div>
            <span v-else class="ticket-pending-note">工单已收到，正在核查与处理。</span>
          </article>
        </div>
        <div v-else class="empty-surface">
          <p class="empty-note">暂无已提交的反馈记录。</p>
        </div>
      </section>

      <!-- Support Dialog -->
      <div
        v-if="support"
        class="dialog-backdrop"
        data-testid="support-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-dialog-title"
        @click.self="support = false"
      >
        <div class="dialog-box">
          <h2 id="support-dialog-title" class="dialog-title">紧急求助说明</h2>
          <p class="dialog-desc">如果涉及人身安全或严重紧急危机，请优先联系当地急救热线或专业医疗救助机构。树洞主要提供日常记录与工具支持，无法替代专业紧急救助。</p>
          <div class="dialog-actions">
            <button
              class="dialog-btn dialog-primary"
              data-testid="btn-support-close"
              type="button"
              @click="support = false"
            >
              我知道了
            </button>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="feedback-loading" role="status">正在读取帮助与反馈内容…</div>
  </section>
</template>

<style scoped>
.feedback-help-page {
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

.feedback-header {
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

.feedback-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--gn-ink);
}

.feedback-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--gn-muted);
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

.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px 6px;
}

.section-header-row .section-label {
  padding: 0;
}

.section-link-btn {
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--gn-leaf-deep);
  font-size: 12px;
  cursor: pointer;
}

.group-surface {
  background: var(--gn-paper);
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  overflow: hidden;
}

/* Form */
.form-surface {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.form-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--gn-muted);
}

.char-count {
  font-size: 11px;
  color: var(--gn-muted);
}

.char-count.limit {
  color: var(--gn-danger);
  font-weight: 600;
}

.form-select,
.form-textarea {
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
  min-height: 80px;
  resize: vertical;
  line-height: 1.5;
}

.file-input-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.upload-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.upload-hint {
  font-size: 11px;
  color: var(--gn-muted);
}

.upload-slots {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.upload-slot {
  position: relative;
  aspect-ratio: 2.2;
  border: 1px dashed var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-bg);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.upload-slot.occupied {
  border-style: solid;
}

.upload-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.upload-remove-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  min-height: 22px;
  padding: 0;
  border: 0;
  border-radius: 11px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.upload-add-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 100%;
  height: 100%;
  border: 0;
  background: transparent;
  color: var(--gn-muted);
  cursor: pointer;
  padding: 4px;
}

.upload-plus {
  font-size: 18px;
  line-height: 1;
}

.upload-text {
  font-size: 11px;
}

.upload-status {
  font-size: 11px;
  color: var(--gn-leaf-deep);
}

.submit-btn {
  width: 100%;
  min-height: 40px;
  border: 0;
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  margin-top: 4px;
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}

/* FAQ Rows */
.faq-item {
  display: flex;
  flex-direction: column;
}

.faq-item + .faq-item {
  border-top: 1px solid var(--gn-line);
}

.faq-trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 48px;
  padding: 10px 14px;
  border: 0;
  background: transparent;
  text-align: left;
  color: var(--gn-ink);
  cursor: pointer;
}

.faq-trigger:active {
  background: var(--gn-paper-warm);
}

.faq-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 11px;
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.faq-question {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--gn-ink);
  line-height: 1.35;
}

.faq-chevron {
  font-size: 18px;
  color: var(--gn-muted);
  line-height: 1;
  flex-shrink: 0;
  transition: transform 0.16s ease;
}

.faq-chevron.open {
  transform: rotate(90deg);
}

.faq-content {
  padding: 0 14px 12px 46px;
  background: var(--gn-paper);
}

.faq-answer {
  margin: 0;
  font-size: 13px;
  color: var(--gn-text);
  line-height: 1.55;
  white-space: pre-line;
}

/* Emergency Support */
.emergency-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper-warm);
}

.emergency-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.emergency-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--gn-ink);
}

.emergency-desc {
  font-size: 12px;
  color: var(--gn-muted);
}

.emergency-btn {
  min-height: 30px;
  padding: 0 12px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper);
  color: var(--gn-ink);
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
}

/* History Tickets */
.ticket-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
}

.ticket-item + .ticket-item {
  border-top: 1px solid var(--gn-line);
}

.ticket-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ticket-status-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--gn-line);
  color: var(--gn-muted);
}

.ticket-status-badge.open {
  color: var(--gn-leaf-deep);
  background: var(--gn-leaf-soft);
  border-color: transparent;
}

.ticket-status-badge.resolved {
  color: var(--gn-leaf-deep);
  background: var(--gn-leaf-soft);
  border-color: transparent;
}

.ticket-time {
  font-size: 11px;
  color: var(--gn-muted);
}

.ticket-text {
  margin: 0;
  font-size: 13px;
  color: var(--gn-text);
  line-height: 1.5;
}

.ticket-reply-strip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
}

.reply-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--gn-leaf-deep);
}

.reply-text {
  margin: 0;
  font-size: 12px;
  color: var(--gn-text);
  line-height: 1.45;
}

.ticket-pending-note {
  font-size: 11px;
  color: var(--gn-muted);
}

/* Empty State */
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

/* Dialog */
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.dialog-box {
  box-sizing: border-box;
  width: min(340px, 100%);
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  padding: 20px;
}

.dialog-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--gn-ink);
  line-height: 1.35;
}

.dialog-desc {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--gn-muted);
  line-height: 1.5;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 18px;
}

.dialog-btn {
  min-height: 36px;
  padding: 0 20px;
  border-radius: var(--gn-radius-small);
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
  color: var(--gn-ink);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.dialog-primary {
  border-color: var(--gn-leaf);
  background: var(--gn-leaf);
  color: #fff;
}

.feedback-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  font-size: 14px;
  color: var(--gn-muted);
}

@media (max-width: 374px) {
  .feedback-help-page {
    padding-right: 12px;
    padding-left: 12px;
  }
}
</style>
