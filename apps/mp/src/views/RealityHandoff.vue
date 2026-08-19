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
async function saveContact() {
  if (!contactForm.value.nickname.trim() || !contactForm.value.contactHint.trim()) return;
  busy.value = true;
  try { const response = await api.post<{ item: Contact }>('/api/v1/trusted-contacts', contactForm.value); contacts.value.unshift(response.item); contactForm.value = { nickname: '', relation: '', contactHint: '' }; status.value = '支持联系人已保存。'; } catch (cause) { error.value = cause instanceof Error ? cause.message : '联系人没有保存成功'; } finally { busy.value = false; }
}
onMounted(load);
</script>

<template>
  <section class="goodnight-page handoff-page">
    <header class="handoff-hero"><button aria-label="返回" @click="router.back()"><AppIcon name="back" /></button><AppIcon class="handoff-moon" name="moon" :size="23" /><h1>帮我告诉现实中的一个人</h1><span>如果你愿意，我们可以把求助的话整理得更容易说出口。</span></header>
    <section class="handoff-card" data-testid="reality-support-card"><h2>现实求助卡</h2><p class="step-title">1 <strong>你想告诉谁？</strong></p><div class="choice-grid"><button v-for="item in recipients" :key="item" :class="{ selected: recipient === item }" @click="selectRecipient(item)">{{ item }}</button></div><p class="step-title">2 <strong>你希望 TA 怎么帮你？</strong></p><div class="choice-grid need-grid"><button v-for="item in needs" :key="item" :class="{ selected: need === item }" @click="selectNeed(item)">{{ item }}</button></div><div class="card-preview"><p>为你生成的求助话术预览</p><textarea v-if="editing" v-model="cardText" maxlength="1000" aria-label="编辑求助卡" /><blockquote v-else>{{ generatedText }}</blockquote></div><div class="card-actions"><button class="primary-button" :disabled="busy" data-testid="handoff-save" @click="saveCard">{{ saved ? '保存这一版求助卡' : '生成并保存求助卡' }}</button><button class="outline-button" :disabled="!saved" data-testid="handoff-copy" @click="copyCard">复制这张求助卡</button><button class="text-button" @click="editing = !editing">{{ editing ? '完成编辑' : '我自己改一下' }}</button></div><small class="privacy-note">只保存你确认过的内容，系统不会自动联系任何人。</small></section>
    <p v-if="status" class="status" role="status">{{ status }}</p><p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <button class="contacts-trigger" type="button" @click="contactSheet = true"><AppIcon name="people" :size="18" /><span>管理信任联系人</span><AppIcon name="arrow" :size="18" /></button>
    <Teleport to="body"><div v-if="contactSheet" class="contact-mask" @click.self="contactSheet = false"><section class="contacts-sheet" data-testid="trusted-contacts-sheet"><span class="sheet-handle" /><header><div><h2>信任联系人</h2><p>只保存在你的支持卡里，不会自动联系任何人。</p></div><button class="sheet-close" type="button" aria-label="关闭" @click="contactSheet = false">×</button></header><div v-if="contacts.length" class="contact-list"><article v-for="person in contacts" :key="person.id"><strong>{{ person.nickname }}</strong><span>{{ person.relation || '联系人' }} · {{ person.contactHint }}</span></article></div><p v-else class="muted">还没有保存联系人。</p><div class="contact-form"><input v-model="contactForm.nickname" placeholder="称呼" /><input v-model="contactForm.relation" placeholder="关系" /><input v-model="contactForm.contactHint" placeholder="联系方式提示" /><button class="outline-button" :disabled="busy" @click="saveContact">保存联系人</button></div></section></div></Teleport>
  </section>
</template>

<style scoped>
.handoff-page{display:grid;gap:12px;padding:0 14px 46px;background:#f4efe4}.handoff-hero{position:relative;min-height:146px;margin:0 -14px;padding:18px 22px;overflow:hidden;background:radial-gradient(circle at 72% 70%,rgba(232,170,122,.42),transparent 25%),linear-gradient(165deg,#102030,#263b49 53%,#74645b)}.handoff-hero::after{position:absolute;right:-10px;bottom:-22px;width:186px;height:186px;background:url('../assets/goodnight/tree-top-cutout.png') right bottom/contain no-repeat;opacity:.34;content:'';filter:brightness(.7);pointer-events:none}.handoff-hero>*{position:relative;z-index:1}.handoff-hero button{display:grid;place-items:center;width:34px;min-width:34px;height:34px;min-height:34px;padding:0;border:1px solid rgba(255,255,255,.28);border-radius:50%;background:rgba(255,255,255,.08);color:#fff;cursor:pointer}.handoff-hero h1{max-width:340px;margin:20px 0 5px;color:#fffaf2;font-family:"Songti SC","Noto Serif SC","Source Han Serif SC",serif;font-size:25px;line-height:1.25}.handoff-hero span{display:block;max-width:320px;color:rgba(255,250,240,.8);font-size:13px;line-height:1.55}.handoff-card{display:grid;gap:10px;margin-top:-20px;border-radius:24px;background:#fffdf8;padding:17px;box-shadow:0 16px 32px rgba(34,43,34,.1)}.handoff-card h2{margin:0;color:#4d6541;text-align:center;font-family:"Songti SC","Noto Serif SC","Source Han Serif SC",serif;font-size:22px}.step-title{margin:4px 0 0;color:#71806a;font-size:13px}.step-title strong{margin-left:7px;color:#40563b;font-size:16px}.choice-grid{display:flex;flex-wrap:wrap;gap:7px}.choice-grid button{min-height:36px;border:1px solid rgba(95,127,62,.18);border-radius:12px;background:#fffdf8;padding:6px 11px;color:#4d6545;font:inherit;cursor:pointer}.choice-grid button.selected{border-color:#496c49;background:#496c49;color:#fff}.need-grid button{flex:1 1 calc(50% - 7px);min-height:41px;text-align:left}.card-preview{position:relative;overflow:hidden;border-radius:16px;background:linear-gradient(135deg,#faf4df,#f1ead8);padding:13px 88px 13px 13px}.card-preview::after{position:absolute;right:-13px;bottom:-7px;width:105px;height:95px;background:url('../assets/goodnight/illustrations/situation-book-lantern.png') right bottom/contain no-repeat;content:'';opacity:.38;pointer-events:none}.card-preview>*{position:relative;z-index:1}.card-preview p{margin:0 0 7px;color:#70805f;font-size:12px}.card-preview blockquote{margin:0;color:#45533f;font-size:14px;line-height:1.65;white-space:pre-wrap}.card-preview textarea{width:100%;min-height:124px;border:1px solid rgba(95,127,62,.18);border-radius:12px;background:#fffdf8;padding:9px;color:#3e4e3c;font:inherit;line-height:1.6;resize:none}.card-actions{display:grid;gap:7px}.primary-button,.outline-button,.text-button{min-height:47px;border-radius:999px;padding:9px 13px;font:inherit;cursor:pointer}.primary-button{border:0;background:#496d49;color:#fff}.outline-button{border:1px solid rgba(95,127,62,.25);background:transparent;color:#4b6846}.text-button{border:0;background:transparent;color:#5c7452}.privacy-note{color:#8a9086;text-align:center}.status{margin:0;border-radius:13px;background:#eaf0e2;padding:10px;color:#506a48;line-height:1.5}.error-text{margin:0;color:var(--gn-danger)}.contacts-trigger{display:grid;grid-template-columns:22px minmax(0,1fr) 20px;align-items:center;gap:8px;width:100%;min-height:47px;border:1px solid rgba(95,127,62,.18);border-radius:16px;background:rgba(255,253,247,.8);padding:10px 13px;color:#4a6543;text-align:left;font:inherit;cursor:pointer}.contacts-trigger>svg:last-child{justify-self:end}.contact-mask{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;background:rgba(16,28,34,.45);padding:0 12px}.contacts-sheet{position:relative;width:min(430px,100%);max-height:78vh;overflow:auto;border-radius:26px 26px 0 0;background:#fffaf1;padding:26px 18px calc(22px + env(safe-area-inset-bottom));box-shadow:0 -18px 46px rgba(0,0,0,.24)}.sheet-handle{position:absolute;top:10px;left:50%;width:44px;height:4px;border-radius:999px;background:#d8dad1;transform:translateX(-50%)}.contacts-sheet header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.contacts-sheet h2{margin:0;color:#405b3d;font-family:"Songti SC","Noto Serif SC",serif;font-size:22px}.contacts-sheet header p{margin:5px 0 0;color:#7a8379;font-size:12px;line-height:1.5}.sheet-close{display:grid;place-items:center;width:30px;height:30px;min-height:30px;border:0;border-radius:50%;background:#edf1e4;color:#405c3d;font-size:20px;cursor:pointer}.contact-list{display:grid;gap:8px;margin-top:13px}.contact-list article{display:grid;gap:4px;border-bottom:1px solid rgba(95,127,62,.12);padding:9px 0}.contact-list span{color:#7b8379;font-size:12px}.contact-form{display:grid;gap:8px;margin-top:15px}.contact-form input{width:100%;min-height:42px;border:1px solid rgba(95,127,62,.18);border-radius:11px;background:#fffdf8;padding:9px;color:#334233;font:inherit}.contact-form button{width:100%}.muted{color:#7b8379;font-size:13px}
.handoff-page{padding-bottom:calc(130px + env(safe-area-inset-bottom))}
.handoff-page{padding-bottom:calc(130px + env(safe-area-inset-bottom))}.handoff-hero{min-height:132px}.handoff-hero h1{margin-top:13px;font-size:24px}.choice-grid{gap:6px}.choice-grid button{min-height:36px;padding-inline:10px}.need-grid button{flex:1 1 calc(33.333% - 6px);min-height:44px;padding-inline:7px;font-size:13px}.handoff-card{gap:8px;padding:15px}.step-title{margin-top:2px}.card-preview{padding-top:11px;padding-bottom:11px}
</style>
