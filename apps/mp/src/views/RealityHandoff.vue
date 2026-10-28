<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Clipboard } from '@capacitor/clipboard';
import { api } from '../api';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

type Contact = { id: string; nickname: string; relation: string; contactHint: string };
type Handoff = { id: string; recipient: string; summary: string; status: string };

const route = useRoute();
const router = useRouter();
const journeyId = computed(() => String(route.query.journeyId ?? ''));

const selectedContact = ref<Contact | null>(null);
const cardText = ref('');
const defaultMessage = '最近有件事让我有点难受。你方便听我说几句吗？';
const generatedText = computed(() => cardText.value || defaultMessage);
const editing = ref(false);

const quickTemplates = [
  { label: '只想找人待会儿', text: '今晚心里有点乱，不用特意安慰我，你有空的话能陪我随便聊两句或者待一会儿吗？' },
  { label: '想说说卡住的事', text: '最近遇到点卡住的事，脑子有点转不过来，你方便的时候能听我说几句吗？' },
  { label: '需要朋友陪陪', text: '我今天状态不太好，心里有点难受，有空的话方便听我说几句吗？' },
];

function selectTemplate(text: string) {
  cardText.value = text;
  editing.value = true;
  saved.value = null;
  status.value = '';
}

const saved = ref<Handoff | null>(null);
const contactSheet = ref(false);
const contacts = ref<Contact[]>([]);
const loading = ref(true);
const error = ref('');
const status = ref('');
const busy = ref(false);
const contactForm = ref({ nickname: '', relation: '', contactHint: '' });

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get<{ items: Contact[] }>('/api/v1/trusted-contacts');
    contacts.value = res.items ?? [];
    if (contacts.value.length && !selectedContact.value) {
      selectedContact.value = contacts.value[0];
    }
  } catch (cause: any) {
    error.value = cause?.message ?? '支持联系人暂时没有加载出来';
  } finally {
    loading.value = false;
  }
}

function selectContact(c: Contact) {
  selectedContact.value = c;
  contactSheet.value = false;
}

async function saveCard() {
  if (!generatedText.value.trim() || busy.value) return;
  busy.value = true;
  error.value = '';
  status.value = '';
  try {
    const recipient = selectedContact.value?.nickname || '信任的朋友';
    const response = await api.post<{ item: Handoff }>('/api/v1/handoffs', {
      journeyId: journeyId.value || undefined,
      recipient,
      channel: '由我选择联系',
      summary: generatedText.value.trim(),
    });
    saved.value = response.item;
    cardText.value = response.item.summary;
    editing.value = false;
    // Copy to clipboard for easy pasting into messaging app
    try {
      await Clipboard.write({ string: generatedText.value });
      status.value = '求助卡已保存并复制到剪贴板，请由你亲自发给信任的人。';
    } catch {
      try {
        await navigator.clipboard.writeText(generatedText.value);
        status.value = '求助卡已保存并复制到剪贴板，请由你亲自发给信任的人。';
      } catch {
        status.value = '求助卡已保存。系统不会替你发送，请手动选择文字发给信任的人。';
      }
    }
  } catch (cause: any) {
    error.value = cause?.message ?? '求助卡没有保存成功';
  } finally {
    busy.value = false;
  }
}

async function copyCard() {
  try {
    await Clipboard.write({ string: generatedText.value });
    status.value = '已复制到剪贴板，请由你亲自发给信任的人。';
  } catch {
    try {
      await navigator.clipboard.writeText(generatedText.value);
      status.value = '已复制到剪贴板，请由你亲自发给信任的人。';
    } catch {
      error.value = '浏览器未允许复制，请长按选择文字复制。';
    }
  }
}

async function markShared() {
  if (!saved.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const response = await api.post<{ item: Handoff }>(`/api/v1/handoffs/${saved.value.id}/share`, {});
    saved.value = response.item;
    status.value = '已经记下：你真的把这张卡告诉了现实中的人。';
  } catch (cause: any) {
    error.value = cause?.message ?? '这个状态暂时没有保存成功';
  } finally {
    busy.value = false;
  }
}

async function saveContact() {
  if (!contactForm.value.nickname.trim() || !contactForm.value.contactHint.trim() || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const response = await api.post<{ item: Contact }>('/api/v1/trusted-contacts', contactForm.value);
    contacts.value.unshift(response.item);
    selectedContact.value = response.item;
    contactForm.value = { nickname: '', relation: '', contactHint: '' };
    status.value = '支持联系人已保存。';
  } catch (cause: any) {
    error.value = cause?.message ?? '联系人没有保存成功';
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="goodnight-page reality-handoff-page">
    <header class="handoff-bar">
      <button
        class="back-btn"
        data-testid="front-handoff-back"
        type="button"
        aria-label="返回"
        @click="router.back()"
      >
        ‹
      </button>
      <h1>现实支持</h1>
      <span aria-hidden="true"></span>
    </header>

    <div class="handoff-body">
      <div class="page-lead">
        <h2>找一个现实中的人</h2>
        <p>可以先准备一句话，是否联系由你自己决定。</p>
      </div>

      <LoadErrorBanner :message="error" retry-label="重新加载" @retry="load" />
      <p v-if="status" class="status-note" role="status">{{ status }}</p>

      <!-- Section 1: 准备联系的人 -->
      <section class="handoff-section" aria-label="准备联系的人">
        <div class="section-header">
          <h3>准备联系的人</h3>
          <button
            class="section-link"
            data-testid="btn-manage-contacts"
            type="button"
            @click="contactSheet = true"
          >
            管理联系人 ›
          </button>
        </div>

        <button
          class="contact-card"
          data-testid="btn-select-contact"
          type="button"
          @click="contactSheet = true"
        >
          <span class="contact-avatar" aria-hidden="true">
            <span class="avatar-dot"></span>
          </span>
          <span class="contact-info">
            <strong class="contact-name">
              {{ selectedContact ? selectedContact.nickname : '一位信任的朋友' }}
            </strong>
            <span class="contact-desc">
              {{
                selectedContact
                  ? `${selectedContact.relation || '联系人'} · ${selectedContact.contactHint}`
                  : '尚未发送任何消息'
              }}
            </span>
          </span>
          <span class="contact-chevron" aria-hidden="true">›</span>
        </button>
      </section>

      <!-- Section 2: 想说的话 -->
      <section class="handoff-section" data-testid="reality-support-card" aria-label="想说的话">
        <div class="section-header">
          <h3>想说的话</h3>
          <button
            class="section-link"
            data-testid="btn-edit-message"
            type="button"
            @click="editing = !editing"
          >
            {{ editing ? '完成 ›' : '编辑 ›' }}
          </button>
        </div>

        <div class="template-chips" role="group" aria-label="快捷便条选择">
          <button
            v-for="tpl in quickTemplates"
            :key="tpl.label"
            type="button"
            class="template-chip"
            :class="{ active: cardText === tpl.text }"
            @click="selectTemplate(tpl.text)"
          >
            {{ tpl.label }}
          </button>
        </div>

        <div class="message-card">
          <textarea
            v-if="editing"
            v-model="cardText"
            class="message-textarea"
            maxlength="500"
            rows="4"
            aria-label="编辑求助文本"
          ></textarea>
          <p v-else class="message-text">{{ generatedText }}</p>
        </div>
      </section>

      <!-- Notice Bubble -->
      <p class="handoff-notice">
        点击下一步只会打开系统分享或联系界面，不会替你发送。
      </p>

      <!-- Actions -->
      <div class="handoff-actions">
        <button
          class="btn-primary"
          data-testid="handoff-save"
          type="button"
          :disabled="busy"
          @click="saveCard"
        >
          {{ busy ? '正在保存…' : saved ? '重新保存求助卡' : '准备联系' }}
        </button>

        <div v-if="saved" class="secondary-actions">
          <button
            class="btn-outline"
            data-testid="handoff-copy"
            type="button"
            @click="copyCard"
          >
            复制求助文本
          </button>
          <button
            class="btn-ghost"
            data-testid="handoff-mark-shared"
            type="button"
            :disabled="busy"
            @click="markShared"
          >
            我已向对方说明
          </button>
        </div>
      </div>
    </div>

    <!-- Contact Drawer / Sheet -->
    <Teleport to="body">
      <div v-if="contactSheet" class="contact-mask" @click.self="contactSheet = false">
        <section class="contacts-sheet" data-testid="trusted-contacts-sheet">
          <header class="sheet-header">
            <div>
              <h2>信任联系人</h2>
              <p>仅用于个人求助参考，系统不会自动联系任何人。</p>
            </div>
            <button class="sheet-close" type="button" aria-label="关闭" @click="contactSheet = false">×</button>
          </header>

          <div v-if="contacts.length" class="contact-list">
            <button
              v-for="person in contacts"
              :key="person.id"
              class="contact-item"
              type="button"
              :class="{ active: selectedContact?.id === person.id }"
              @click="selectContact(person)"
            >
              <div class="person-copy">
                <strong>{{ person.nickname }}</strong>
                <span>{{ person.relation || '联系人' }} · {{ person.contactHint }}</span>
              </div>
              <span v-if="selectedContact?.id === person.id" class="check-mark">✓</span>
            </button>
          </div>
          <p v-else class="muted-note">还没有保存联系人。</p>

          <div class="contact-form">
            <h3 class="form-title">添加新联系人</h3>
            <input v-model="contactForm.nickname" class="sheet-input" placeholder="称呼（如：阿明、姐姐）" maxlength="40" />
            <input v-model="contactForm.relation" class="sheet-input" placeholder="关系（如：好友、家人）" maxlength="40" />
            <input v-model="contactForm.contactHint" class="sheet-input" placeholder="联系方式提示（如：微信、电话）" maxlength="80" />
            <button class="btn-primary sheet-submit" :disabled="busy" type="button" @click="saveContact">
              保存联系人
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.reality-handoff-page {
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

:global(.phone-shell:has(.reality-handoff-page)) {
  padding-bottom: 0;
}

.handoff-bar {
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

.handoff-bar h1 {
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

.handoff-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 0 16px calc(16px + env(safe-area-inset-bottom));
}

.page-lead {
  padding: 24px 0 16px;
}

.page-lead h2 {
  margin: 0;
  color: var(--gn-ink);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
}

.page-lead p {
  margin: 6px 0 0;
  color: var(--gn-muted);
  font-size: 14px;
  line-height: 1.5;
}

.status-note {
  margin: 0 0 12px;
  padding: 10px 14px;
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper-warm);
  color: var(--gn-leaf-deep);
  font-size: 13px;
  line-height: 1.45;
}

.handoff-section {
  display: flex;
  flex-direction: column;
  margin-bottom: 20px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.section-header h3 {
  margin: 0;
  color: var(--gn-ink);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.35;
}

.section-link {
  border: 0;
  background: none;
  padding: 0;
  color: var(--gn-muted);
  font-size: 13px;
  cursor: pointer;
}

.contact-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--gn-line);
  border-radius: 12px;
  background: var(--gn-paper);
  text-align: left;
  cursor: pointer;
}

.contact-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: #f0f3f4;
  flex-shrink: 0;
}

.avatar-dot {
  width: 14px;
  height: 14px;
  border: 3px solid #82909a;
  border-radius: 50%;
}

.contact-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  gap: 2px;
}

.contact-name {
  color: var(--gn-ink);
  font-size: 15px;
  font-weight: 600;
}

.contact-desc {
  color: var(--gn-muted);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contact-chevron {
  color: #b6bcc4;
  font-size: 20px;
  flex-shrink: 0;
}

.template-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.template-chip {
  min-height: 32px;
  padding: 4px 12px;
  border: 1px solid var(--gn-line);
  border-radius: 8px;
  background: var(--gn-paper);
  color: var(--gn-ink);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.template-chip.active {
  border-color: #275f56;
  background: #eaf4ee;
  color: #1e4d45;
  font-weight: 600;
}

.message-card {
  border: 1px solid var(--gn-line);
  border-radius: 12px;
  background: var(--gn-paper);
  padding: 16px;
  min-height: 110px;
}

.message-text {
  margin: 0;
  color: var(--gn-ink);
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.message-textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 100px;
  border: 0;
  background: transparent;
  color: var(--gn-ink);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
}

.handoff-notice {
  margin: 0 0 20px;
  padding: 12px 14px;
  border-radius: 8px;
  background: #f2f4f6;
  color: var(--gn-muted);
  font-size: 12px;
  line-height: 1.5;
}

.handoff-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: auto;
  padding-top: 16px;
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

.secondary-actions {
  display: flex;
  gap: 10px;
}

.btn-outline {
  flex: 1;
  min-height: 40px;
  border: 1px solid var(--gn-line);
  border-radius: 8px;
  background: var(--gn-paper);
  color: var(--gn-ink);
  font-family: var(--gn-font-body);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn-ghost {
  flex: 1;
  min-height: 40px;
  border: 0;
  background: none;
  color: var(--gn-leaf-deep);
  font-family: var(--gn-font-body);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

/* Contact Mask / Sheet */
.contact-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
}

.contacts-sheet {
  box-sizing: border-box;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
  border-radius: 16px 16px 0 0;
  background: var(--gn-paper);
  padding: 20px 16px calc(24px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sheet-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.sheet-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--gn-ink);
}

.sheet-header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--gn-muted);
}

.sheet-close {
  border: 0;
  background: none;
  font-size: 24px;
  color: var(--gn-muted);
  cursor: pointer;
  padding: 0 4px;
}

.contact-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.contact-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--gn-line);
  border-radius: 8px;
  background: var(--gn-paper);
  text-align: left;
  cursor: pointer;
}

.contact-item.active {
  border-color: var(--gn-leaf);
  background: var(--gn-leaf-soft);
}

.person-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.person-copy strong {
  font-size: 14px;
  color: var(--gn-ink);
}

.person-copy span {
  font-size: 12px;
  color: var(--gn-muted);
}

.check-mark {
  color: var(--gn-leaf-deep);
  font-size: 16px;
  font-weight: 700;
}

.muted-note {
  margin: 0;
  color: var(--gn-muted);
  font-size: 13px;
  text-align: center;
  padding: 12px 0;
}

.contact-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--gn-line);
}

.form-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--gn-ink);
}

.sheet-input {
  box-sizing: border-box;
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--gn-line);
  border-radius: 8px;
  background: var(--gn-bg);
  color: var(--gn-ink);
  font-family: inherit;
  font-size: 13px;
}

.sheet-submit {
  min-height: 42px;
  font-size: 14px;
  margin-top: 4px;
}
</style>
