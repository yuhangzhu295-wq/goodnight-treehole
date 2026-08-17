<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';

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
const contacts = ref<Contact[]>([]);
const error = ref('');
const status = ref('');
const busy = ref(false);
const contactForm = ref({ nickname: '', relation: '', contactHint: '' });
const defaultText = computed(() => `我最近有点撑不住，如果你今晚有空，能不能陪我说十分钟话？我现在不太需要建议，只希望有人在。`);
const generatedText = computed(() => cardText.value || `${defaultText.value}\n\n我想请你：${need.value}`);

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
async function saveContact() {
  if (!contactForm.value.nickname.trim() || !contactForm.value.contactHint.trim()) return;
  busy.value = true;
  try { const response = await api.post<{ item: Contact }>('/api/v1/trusted-contacts', contactForm.value); contacts.value.unshift(response.item); contactForm.value = { nickname: '', relation: '', contactHint: '' }; status.value = '支持联系人已保存。'; } catch (cause) { error.value = cause instanceof Error ? cause.message : '联系人没有保存成功'; } finally { busy.value = false; }
}
onMounted(load);
</script>

<template>
  <section class="goodnight-page handoff-page">
    <header class="handoff-hero"><button aria-label="返回" @click="router.back()">‹</button><p>晚安树洞</p><h1>帮我告诉现实中的一个人</h1><span>如果你愿意，我们可以把求助的话整理得更容易说出口。</span></header>
    <section class="handoff-card" data-testid="reality-support-card"><h2>现实求助卡</h2><p class="step-title">1 <strong>你想告诉谁？</strong></p><div class="choice-grid"><button v-for="item in recipients" :key="item" :class="{ selected: recipient === item }" @click="selectRecipient(item)">{{ item }}</button></div><p class="step-title">2 <strong>你希望 TA 怎么帮你？</strong></p><div class="choice-grid need-grid"><button v-for="item in needs" :key="item" :class="{ selected: need === item }" @click="selectNeed(item)">{{ item }}</button></div><div class="card-preview"><p>为你生成的求助话术预览</p><textarea v-if="editing" v-model="cardText" maxlength="1000" aria-label="编辑求助卡" /><blockquote v-else>{{ generatedText }}</blockquote></div><div class="card-actions"><button class="primary-button" :disabled="busy" data-testid="handoff-save" @click="saveCard">{{ saved ? '保存这一版求助卡' : '生成并保存求助卡' }}</button><button class="outline-button" :disabled="!saved" data-testid="handoff-copy" @click="copyCard">复制这张求助卡</button><button class="text-button" @click="editing = !editing">{{ editing ? '完成编辑' : '我自己改一下' }}</button></div><small class="privacy-note">只保存你确认过的内容，系统不会自动联系任何人。</small></section>
    <p v-if="status" class="status" role="status">{{ status }}</p><p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <section v-if="saved" class="saved-card"><strong>已保存给：{{ saved.recipient }}</strong><span>状态：仅自己可见 · 需要时由你亲自分享</span></section>
    <details class="contacts-card"><summary>支持联系人</summary><div v-if="contacts.length" class="contact-list"><article v-for="person in contacts" :key="person.id"><strong>{{ person.nickname }}</strong><span>{{ person.relation || '联系人' }} · {{ person.contactHint }}</span></article></div><p v-else class="muted">还没有保存联系人。</p><div class="contact-form"><input v-model="contactForm.nickname" placeholder="称呼" /><input v-model="contactForm.relation" placeholder="关系" /><input v-model="contactForm.contactHint" placeholder="联系方式提示" /><button class="outline-button" :disabled="busy" @click="saveContact">保存联系人</button></div></details>
  </section>
</template>

<style scoped>
.handoff-page{display:grid;gap:14px;padding:0 14px 48px;background:#f4efe4}.handoff-hero{position:relative;min-height:236px;margin:0 -14px;padding:20px 22px;overflow:hidden;background:radial-gradient(circle at 72% 70%,rgba(232,170,122,.5),transparent 25%),linear-gradient(165deg,#102030,#263b49 53%,#74645b)}.handoff-hero::after{position:absolute;right:-10px;bottom:-22px;width:186px;height:186px;background:url('../assets/goodnight/tree-top-cutout.png') right bottom/contain no-repeat;opacity:.4;content:'';filter:brightness(.7);pointer-events:none}.handoff-hero>*{position:relative;z-index:1}.handoff-hero button{width:38px;height:38px;border:1px solid rgba(255,255,255,.28);border-radius:50%;background:rgba(255,255,255,.08);color:#fff;font-size:31px;line-height:1;cursor:pointer}.handoff-hero p{margin:39px 0 0;color:rgba(255,250,240,.75);font-size:13px}.handoff-hero h1{max-width:300px;margin:7px 0;color:#fffaf2;font-family:var(--gn-font-display);font-size:31px;line-height:1.25}.handoff-hero span{display:block;max-width:290px;color:rgba(255,250,240,.8);font-size:13px;line-height:1.55}.handoff-card,.saved-card,.contacts-card{border-radius:24px;background:#fffdf8;padding:20px;box-shadow:0 16px 32px rgba(34,43,34,.1)}.handoff-card{display:grid;gap:12px;margin-top:-35px}.handoff-card h2{margin:0;color:#4d6541;text-align:center;font-family:var(--gn-font-display);font-size:24px}.step-title{margin:4px 0 0;color:#71806a;font-size:13px}.step-title:first-letter{display:inline-grid;background:#69825c;color:#fff}.step-title strong{margin-left:7px;color:#40563b;font-size:16px}.choice-grid{display:flex;flex-wrap:wrap;gap:8px}.choice-grid button{min-height:38px;border:1px solid rgba(95,127,62,.18);border-radius:12px;background:#fffdf8;padding:7px 13px;color:#4d6545;font:inherit;cursor:pointer}.choice-grid button.selected{border-color:#496c49;background:#496c49;color:#fff}.need-grid button{flex:1 1 calc(50% - 8px);min-height:45px;text-align:left}.card-preview{border-radius:16px;background:linear-gradient(135deg,#faf4df,#f1ead8);padding:13px}.card-preview p{margin:0 0 8px;color:#70805f;font-size:12px}.card-preview blockquote{margin:0;color:#45533f;line-height:1.75;white-space:pre-wrap}.card-preview textarea{width:100%;min-height:150px;border:1px solid rgba(95,127,62,.18);border-radius:12px;background:#fffdf8;padding:10px;color:#3e4e3c;font:inherit;line-height:1.65;resize:none}.card-actions{display:grid;gap:8px}.primary-button,.outline-button,.text-button{min-height:47px;border-radius:14px;padding:9px 13px;font:inherit;cursor:pointer}.primary-button{border:0;background:#496d49;color:#fff}.outline-button{border:1px solid rgba(95,127,62,.25);background:transparent;color:#4b6846}.text-button{border:0;background:transparent;color:#5c7452}.privacy-note{color:#8a9086;text-align:center}.status{margin:0;border-radius:13px;background:#eaf0e2;padding:11px;color:#506a48;line-height:1.5}.error-text{margin:0;color:var(--gn-danger)}.saved-card{display:grid;gap:5px;color:#486346}.saved-card span,.muted{color:#7b8379;font-size:13px}.contacts-card summary{cursor:pointer;color:#405b3d;font-weight:700}.contact-list{display:grid;gap:8px;margin-top:13px}.contact-list article{display:grid;gap:4px;border-bottom:1px solid rgba(95,127,62,.12);padding:9px 0}.contact-list span{color:#7b8379;font-size:12px}.contact-form{display:grid;gap:8px;margin-top:15px}.contact-form input{width:100%;min-height:42px;border:1px solid rgba(95,127,62,.18);border-radius:11px;background:#fffdf8;padding:9px;color:#334233;font:inherit}.contact-form button{width:100%}
</style>
