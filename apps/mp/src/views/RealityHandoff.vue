<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import AppIcon from '../components/icons/AppIcon.vue';

type Contact = { id: string; nickname: string; relation: string; contactHint: string };
type Handoff = { id: string; recipient: string; summary: string; status: string };
const route = useRoute();
const router = useRouter();
const journeyId = computed(() => String(route.query.journeyId ?? ''));
const recipients = ['朋友', '家人', '伴侣', '室友', '同事', '其他'];
const needs = ['听我说 10 分钟', '陪我出去走走', '今晚问问我怎么样', '提醒我吃饭/睡觉', '帮我处理一件具体事情', '不需要建议，只陪一下'];
const recipient = ref('朋友');
const need = ref('听我说 10 分钟');
const cardText = ref('');
const editing = ref(false);
const saved = ref<Handoff | null>(null);
const contactSheet = ref(false);
const contacts = ref<Contact[]>([]);
const error = ref('');
const status = ref('');
const busy = ref(false);
const contactForm = ref({ nickname: '', relation: '', contactHint: '' });
const needMessages: Record<string, string> = {
  '听我说 10 分钟': '我最近有点撑不住，如果你今晚有空，能不能听我说十分钟？我不一定需要建议，只想先把心里的话说出来。',
  '陪我出去走走': '我今天状态不太好，如果你方便的话，可以陪我出去走一小会吗？我现在不太想一个人待着。',
  '今晚问问我怎么样': '我今天状态有点低落，如果你今晚方便的话，可以问问我现在怎么样吗？有你记得这件事，对我很重要。',
  '提醒我吃饭/睡觉': '我最近有点乱，容易忘记照顾自己。今晚可以提醒我吃点东西、早点休息吗？',
  '帮我处理一件具体事情': '我现在有一件具体的事有点处理不过来。如果你方便，我想请你陪我一起想想或帮我分担一点。',
  '不需要建议，只陪一下': '我现在不需要建议，只想有人陪我一下。你不用解决什么，陪我待一会儿就好。',
};
const defaultText = computed(() => needMessages[need.value] ?? needMessages['听我说 10 分钟']);
const generatedText = computed(() => cardText.value || defaultText.value);

async function load() {
  try { contacts.value = (await api.get<{ items: Contact[] }>('/api/v1/trusted-contacts')).items; } catch { error.value = '支持联系人暂时没有加载出来'; }
}
function selectRecipient(value: string) { recipient.value = value; }
function selectNeed(value: string) { need.value = value; }
async function saveCard() {
  if (!generatedText.value.trim()) return;
  busy.value = true; error.value = ''; status.value = '';
  try { const response = await api.post<{ item: Handoff }>('/api/v1/handoffs', { journeyId: journeyId.value || undefined, recipient: recipient.value, channel: '由我选择联系', summary: generatedText.value.trim() }); saved.value = response.item; cardText.value = response.item.summary; editing.value = false; status.value = '求助卡已经保存到现实支持里，系统不会替你发送。'; } catch (cause) { error.value = cause instanceof Error ? cause.message : '求助卡没有保存成功'; } finally { busy.value = false; }
}
async function copyCard() {
  try { await navigator.clipboard.writeText(generatedText.value); status.value = '已复制到剪贴板，请由你亲自发给信任的人。'; } catch { error.value = '浏览器没有允许复制，请手动选择文字复制。'; }
}
// Marks the card as actually told to someone. The endpoint already existed and nothing in the
// app called it, so the "I told them" half of the handoff story had no UI at all
// (product audit ISSUE-011). The system still never sends anything: this only records that
// the person did it themselves.
async function markShared() {
  if (!saved.value || busy.value) return;
  busy.value = true; error.value = '';
  try {
    const response = await api.post<{ item: Handoff }>(`/api/v1/handoffs/${saved.value.id}/share`, {});
    saved.value = response.item;
    status.value = '已经记下：你真的把这张卡告诉了现实中的人。';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '这个状态暂时没有保存成功';
  } finally { busy.value = false; }
}
async function saveContact() {
  if (!contactForm.value.nickname.trim() || !contactForm.value.contactHint.trim()) return;
  busy.value = true;
  try { const response = await api.post<{ item: Contact }>('/api/v1/trusted-contacts', contactForm.value); contacts.value.unshift(response.item); contactForm.value = { nickname: '', relation: '', contactHint: '' }; status.value = '支持联系人已保存。'; } catch (cause) { error.value = cause instanceof Error ? cause.message : '联系人没有保存成功'; } finally { busy.value = false; }
}
onMounted(load);
</script>

<template>
  <section class="goodnight-page handoff-page">
    <header class="handoff-header">
      <button class="back-btn" type="button" aria-label="返回" @click="router.back()">
        <AppIcon name="back" :size="20" />
      </button>
      <div class="header-titles">
        <h1 class="handoff-title">现实求助支持</h1>
        <p class="handoff-subtitle">整理向信任的人求助的话术，不自动发送，由你决定是否沟通</p>
      </div>
    </header>

    <section class="handoff-panel" data-testid="reality-support-card">
      <h2 class="panel-title">求助文本生成</h2>
      <div class="step-group">
        <label class="step-label">1. 求助对象</label>
        <div class="choice-grid">
          <button
            v-for="item in recipients"
            :key="item"
            type="button"
            :class="{ selected: recipient === item }"
            @click="selectRecipient(item)"
          >
            {{ item }}
          </button>
        </div>
      </div>

      <div class="step-group">
        <label class="step-label">2. 希望获得的支持方式</label>
        <div class="choice-grid need-grid">
          <button
            v-for="item in needs"
            :key="item"
            type="button"
            :class="{ selected: need === item }"
            @click="selectNeed(item)"
          >
            {{ item }}
          </button>
        </div>
      </div>

      <div class="preview-group">
        <label class="preview-label">求助文本预览</label>
        <textarea v-if="editing" v-model="cardText" maxlength="1000" aria-label="编辑求助卡" />
        <blockquote v-else class="preview-text">{{ generatedText }}</blockquote>
      </div>

      <div class="action-buttons">
        <button class="primary-button" :disabled="busy" data-testid="handoff-save" type="button" @click="saveCard">
          {{ saved ? '保存这一版求助卡' : '生成并保存求助卡' }}
        </button>
        <button class="outline-button" :disabled="!saved" data-testid="handoff-copy" type="button" @click="copyCard">
          复制求助文本
        </button>
        <button class="ghost-button" :disabled="!saved || busy" data-testid="handoff-mark-shared" type="button" @click="markShared">
          我已向对方说明
        </button>
        <button class="ghost-button" type="button" @click="editing = !editing">
          {{ editing ? '完成编辑' : '手动修改文本' }}
        </button>
      </div>
      <small class="privacy-note">只保存你确认的内容，系统不会自动联系任何人。</small>
    </section>

    <p v-if="status" class="status-note" role="status">{{ status }}</p>
    <p v-if="error" class="error-note" role="alert">{{ error }}</p>

    <button class="contacts-trigger" type="button" @click="contactSheet = true">
      <AppIcon name="people" :size="18" />
      <span>管理信任联系人</span>
      <AppIcon name="arrow" :size="18" />
    </button>

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
            <article v-for="person in contacts" :key="person.id">
              <strong>{{ person.nickname }}</strong>
              <span>{{ person.relation || '联系人' }} · {{ person.contactHint }}</span>
            </article>
          </div>
          <p v-else class="muted-note">还没有保存联系人。</p>
          <div class="contact-form">
            <input v-model="contactForm.nickname" placeholder="称呼" />
            <input v-model="contactForm.relation" placeholder="关系" />
            <input v-model="contactForm.contactHint" placeholder="联系方式提示" />
            <button class="primary-button" :disabled="busy" type="button" @click="saveContact">保存联系人</button>
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.handoff-page {
  box-sizing: border-box;
  width: 100%;
  max-width: 430px;
  margin: 0 auto;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-x: hidden;
  padding: 12px 16px calc(112px + env(safe-area-inset-bottom));
  background: var(--gn-bg);
  color: var(--gn-text);
  font-family: var(--gn-font-body);
}

.handoff-header {
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
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper);
  color: var(--gn-ink);
  cursor: pointer;
  flex-shrink: 0;
}

.header-titles {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.handoff-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--gn-ink);
}

.handoff-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--gn-muted);
}

.handoff-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  padding: 16px;
  background: var(--gn-paper);
}

.panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--gn-ink);
}

.step-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.step-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--gn-ink);
}

.choice-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.choice-grid button {
  min-height: 34px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  padding: 6px 12px;
  color: var(--gn-ink);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.choice-grid:not(.need-grid) button {
  flex: 1 1 calc(33.333% - 6px);
}

.need-grid button {
  flex: 1 1 calc(50% - 6px);
  text-align: left;
  line-height: 1.35;
}

.choice-grid button.selected {
  border-color: var(--gn-leaf);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-weight: 600;
}

.preview-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preview-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--gn-muted);
}

.preview-text {
  margin: 0;
  padding: 12px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  color: var(--gn-ink);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.preview-group textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 108px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  padding: 10px 12px;
  color: var(--gn-ink);
  font: inherit;
  font-size: 13px;
  line-height: 1.6;
  resize: none;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.primary-button,
.outline-button,
.ghost-button {
  min-height: 40px;
  border-radius: var(--gn-radius-small);
  padding: 0 16px;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: center;
}

.primary-button {
  border: 1px solid var(--gn-leaf);
  background: var(--gn-leaf);
  color: #fff;
}

.outline-button {
  border: 1px solid var(--gn-line);
  background: var(--gn-paper-warm);
  color: var(--gn-ink);
}

.ghost-button {
  border: 0;
  background: transparent;
  color: var(--gn-muted);
}

.primary-button:disabled,
.outline-button:disabled,
.ghost-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.privacy-note {
  color: var(--gn-muted);
  font-size: 11px;
  text-align: center;
}

.status-note,
.error-note {
  margin: 0;
  border-radius: var(--gn-radius-card);
  border: 1px solid var(--gn-line);
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.4;
}

.status-note {
  background: var(--gn-paper);
  color: var(--gn-leaf-deep);
}

.error-note {
  background: var(--gn-paper);
  color: var(--gn-danger);
}

.contacts-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  padding: 10px 14px;
  color: var(--gn-ink);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.contacts-trigger span {
  flex: 1;
  text-align: left;
}

.contact-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  padding: 16px;
}

.contacts-sheet {
  box-sizing: border-box;
  width: min(380px, 100%);
  max-height: 85vh;
  overflow-y: auto;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  padding: 20px;
}

.sheet-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.sheet-header h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--gn-ink);
}

.sheet-header p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--gn-muted);
  line-height: 1.4;
}

.sheet-close {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  background: var(--gn-paper-warm);
  color: var(--gn-muted);
  font-size: 18px;
  cursor: pointer;
  flex-shrink: 0;
}

.contact-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
}

.contact-list article {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-bottom: 1px solid var(--gn-line);
  padding-bottom: 8px;
}

.contact-list strong {
  font-size: 13px;
  color: var(--gn-ink);
}

.contact-list span {
  color: var(--gn-muted);
  font-size: 12px;
}

.muted-note {
  margin: 12px 0 0;
  color: var(--gn-muted);
  font-size: 13px;
}

.contact-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.contact-form input {
  box-sizing: border-box;
  width: 100%;
  min-height: 38px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  padding: 8px 10px;
  color: var(--gn-ink);
  font: inherit;
  font-size: 13px;
}

@media (max-width: 374px) {
  .handoff-page {
    padding-left: 12px;
    padding-right: 12px;
  }
}
</style>
