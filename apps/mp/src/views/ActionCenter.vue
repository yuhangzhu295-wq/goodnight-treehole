<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { ActionBarrier } from '@goodnight/shared-types';
import { api } from '../api';
import { useDeviceClock } from '../composables/useDeviceClock';

const router = useRouter();
const { timeLabel } = useDeviceClock();
const home = ref<any>(null);
const loading = ref(true);
const error = ref('');
const reflection = ref('');
const advanced = ref({ decisionQuestion: '', decisionOptions: '', cooldownTitle: '', cooldownReason: '', cooldownHours: 24, handoffRecipient: '', handoffChannel: '当面聊', handoffSummary: '', supportTitle: '', supportPlan: '', memoryCategory: 'journey', memoryContent: '', memoryDays: 30 });
const cooldowns = ref<any[]>([]);
const decisions = ref<any[]>([]);
const handoffs = ref<any[]>([]);
const memories = ref<any[]>([]);
const advancedBusy = ref(false);
const missedAction = ref<{ id: string; title: string } | null>(null);
const selectedBarrier = ref<ActionBarrier>('too_hard');
const adapting = ref(false);
const adaptiveResult = ref<{ result: string; title: string; description: string } | null>(null);
const barrierOptions: Array<{ value: ActionBarrier; label: string }> = [
  { value: 'forgot', label: '忘记了' }, { value: 'too_hard', label: '太难了' }, { value: 'emotion_too_strong', label: '情绪太强' }, { value: 'environment', label: '环境不允许' }, { value: 'something_else', label: '临时有事' }, { value: 'did_not_want_to', label: '其实不想做' }, { value: 'other', label: '其他原因' },
];

async function loadAdvanced() {
  const results = await Promise.allSettled([api.get<any>('/api/v1/cooldown'), api.get<any>('/api/v1/decisions'), api.get<any>('/api/v1/handoffs'), api.get<any>('/api/v1/me/memories')]);
  cooldowns.value = results[0].status === 'fulfilled' ? results[0].value.items ?? [] : [];
  decisions.value = results[1].status === 'fulfilled' ? results[1].value.items ?? [] : [];
  handoffs.value = results[2].status === 'fulfilled' ? results[2].value.items ?? [] : [];
  memories.value = results[3].status === 'fulfilled' ? results[3].value.items ?? [] : [];
}
async function load() { loading.value = true; try { home.value = (await api.get<any>('/api/v1/tonight')).item; await loadAdvanced(); } catch (cause: any) { error.value = cause?.message ?? '行动加载失败'; } finally { loading.value = false; } }
async function checkin(id: string, status: 'completed' | 'missed' = 'completed') {
  if (status === 'missed') {
    const action = home.value?.activeActions?.find((item: { id: string; title: string }) => item.id === id);
    if (action) { missedAction.value = action; adaptiveResult.value = null; }
    return;
  }
  try { await api.post(`/api/v1/actions/${id}/checkin`, { status, reflection: reflection.value.trim() || '我完成了今天约定的小一步。' }); reflection.value = ''; await load(); } catch (cause: any) { error.value = cause?.message ?? '打卡失败'; }
}
const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
async function createAdaptiveDraft() {
  if (!missedAction.value) return;
  adapting.value = true; error.value = '';
  try {
    await api.post(`/api/v1/actions/${missedAction.value.id}/checkin`, { status: 'missed', reflection: reflection.value.trim() || '这一步今天没有做到，我想先找一个更现实的版本。', barrier: selectedBarrier.value });
    const response = await api.post<{ job: { id: string } }>(`/api/v1/actions/${missedAction.value.id}/adaptive-plan`, { barrier: selectedBarrier.value });
    let result = '';
    let title = '';
    let description = '';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await wait(450);
      const task = await api.get<{ status: string; result: string; structured: Record<string, unknown> }>(`/api/v1/ai/tasks/${response.job.id}`);
      if (['succeeded', 'fallback', 'failed'].includes(task.status)) {
        result = task.result;
        title = typeof task.structured.title === 'string' ? task.structured.title : '';
        description = typeof task.structured.completionDefinition === 'string' ? task.structured.completionDefinition : result;
        break;
      }
    }
    adaptiveResult.value = { result, title, description };
    reflection.value = '';
  } catch (cause: any) { error.value = cause?.message ?? '没能生成调整建议'; } finally { adapting.value = false; }
}
async function confirmAdaptiveAction() {
  if (!missedAction.value || !adaptiveResult.value?.title.trim()) { error.value = '请先确认一个你愿意尝试的新行动'; return; }
  adapting.value = true;
  try {
    await api.post(`/api/v1/actions/${missedAction.value.id}/adapt`, { title: adaptiveResult.value.title, description: adaptiveResult.value.description, barrier: selectedBarrier.value });
    missedAction.value = null; adaptiveResult.value = null; await load();
  } catch (cause: any) { error.value = cause?.message ?? '新的行动保存失败'; } finally { adapting.value = false; }
}
async function runAdvanced(task: () => Promise<void>) { advancedBusy.value = true; error.value = ''; try { await task(); } catch (cause: any) { error.value = cause?.message ?? '保存失败，请检查隐私设置'; } finally { advancedBusy.value = false; } }
async function createDecision() { if (!advanced.value.decisionQuestion.trim()) return; await runAdvanced(async () => { const response = await api.post<any>('/api/v1/decisions', { journeyId: home.value?.journey?.id, question: advanced.value.decisionQuestion, options: advanced.value.decisionOptions.split(/[,，]/).map((item) => item.trim()).filter(Boolean) }); decisions.value.unshift(response.item); advanced.value.decisionQuestion = ''; advanced.value.decisionOptions = ''; }); }
async function createCooldown() { if (!advanced.value.cooldownTitle.trim()) return; await runAdvanced(async () => { await api.post('/api/v1/cooldowns', { title: advanced.value.cooldownTitle, reason: advanced.value.cooldownReason, hours: advanced.value.cooldownHours }); advanced.value.cooldownTitle = ''; advanced.value.cooldownReason = ''; await loadAdvanced(); }); }
async function createHandoff() { if (!advanced.value.handoffRecipient.trim() || !advanced.value.handoffChannel.trim() || !advanced.value.handoffSummary.trim()) { error.value = '请补全交接对象、联系渠道和说明'; return; } await runAdvanced(async () => { const response = await api.post<any>('/api/v1/handoffs', { journeyId: home.value?.journey?.id, recipient: advanced.value.handoffRecipient, channel: advanced.value.handoffChannel, summary: advanced.value.handoffSummary }); handoffs.value.unshift(response.item); advanced.value.handoffRecipient = ''; advanced.value.handoffChannel = ''; advanced.value.handoffSummary = ''; }); }
async function shareHandoff(id: string) { await runAdvanced(async () => { const response = await api.post<any>(`/api/v1/handoffs/${id}/share`); const index = handoffs.value.findIndex((item) => item.id === id); if (index >= 0) handoffs.value[index] = response.item; }); }
async function saveSupportPlan() { if (!advanced.value.supportPlan.trim()) return; await runAdvanced(async () => { await api.put('/api/v1/me/support-plan', { journeyId: home.value?.journey?.id, title: advanced.value.supportTitle || '我的现实支持计划', plan: { steps: advanced.value.supportPlan } }); advanced.value.supportPlan = ''; }); }
async function saveMemory() { if (!advanced.value.memoryContent.trim()) return; await runAdvanced(async () => { const response = await api.post<any>('/api/v1/memory', { journeyId: home.value?.journey?.id, category: advanced.value.memoryCategory, content: advanced.value.memoryContent, days: advanced.value.memoryDays }); memories.value.unshift(response.item); advanced.value.memoryContent = ''; }); }
async function removeMemory(id: string) { await runAdvanced(async () => { await api.delete(`/api/v1/me/memories/${id}`); memories.value = memories.value.filter((item) => item.id !== id); }); }
onMounted(load);
</script>
<template>
  <section class="page goodnight-page modern-page action-page">
    <header class="modern-hero compact"><div class="status-row"><span>{{ timeLabel }}</span><span aria-hidden="true"></span></div><p class="eyebrow">行动</p><h1>把想法变成一小步</h1><p>行动不是证明自己，是给现实一个可以观察的回应。</p></header>
    <p v-if="error" class="error-text">{{ error }}</p><p v-if="loading" class="soft-note">正在读取行动...</p>
    <template v-else>
      <section class="modern-card" v-if="home?.journey"><span class="section-kicker">当前旅程</span><div class="card-heading"><h2>{{ home.journey.title }}</h2><button class="text-button" @click="router.push(`/pages/journey/detail?id=${home.journey.id}`)">查看时间线</button></div><p>{{ home.journey.summary || '先完成一个可观察的小行动。' }}</p></section>
      <section class="modern-card"><div class="card-heading"><h2>待完成的行动</h2><span class="count-badge">{{ home?.activeActions?.length ?? 0 }}</span></div><label class="reflection-field">这一步后来怎么样？<textarea v-model="reflection" maxlength="800" placeholder="可以写做到、没做到，或遇到的阻碍" /></label><div v-if="home?.activeActions?.length" class="commitment-list"><article v-for="action in home.activeActions" :key="action.id"><div><strong>{{ action.title }}</strong><small>{{ action.description || '完成后回来写下真实结果' }}</small></div><div class="checkin-actions"><button class="primary-small" @click="checkin(action.id, 'completed')">完成并回顾</button><button class="secondary-small" @click="checkin(action.id, 'missed')">没做到</button></div></article></div><p v-else class="empty-note">当前没有待完成行动。打开今晚页面，先建立一段旅程。</p><button v-if="!home?.journey" class="outline-button full" @click="router.push('/pages/tonight/index')">去今晚建立旅程</button></section>
      <section v-if="missedAction" class="modern-card barrier-card"><span class="section-kicker">先把阻碍说清楚</span><h2>“{{ missedAction.title }}”今天卡在哪里？</h2><p>这不是失败记录。选一个最接近的原因，再由你确认下一次要尝试的更小版本。</p><div class="barrier-list"><button v-for="option in barrierOptions" :key="option.value" :class="{ selected: selectedBarrier === option.value }" @click="selectedBarrier = option.value">{{ option.label }}</button></div><button class="primary-button" :disabled="adapting" @click="createAdaptiveDraft">{{ adapting ? '正在整理更小的一步...' : '根据这个阻碍调整' }}</button><template v-if="adaptiveResult"><p class="adaptive-source">{{ adaptiveResult.result || '任务已完成，请由你写下愿意尝试的新行动。' }}</p><label class="reflection-field">我愿意尝试的新行动<input v-model="adaptiveResult.title" placeholder="例如：只打开文档写下第一行" /></label><label class="reflection-field">怎样算完成？<textarea v-model="adaptiveResult.description" maxlength="500" placeholder="由你定义一个足够小的完成标准" /></label><div class="checkin-actions"><button class="secondary-small" :disabled="adapting" @click="missedAction = null; adaptiveResult = null">先不调整</button><button class="primary-small" :disabled="adapting" @click="confirmAdaptiveAction">确认这个新行动</button></div></template></section>
      <section v-if="home?.dueCheckins?.length" class="modern-card"><div class="card-heading"><h2>待回顾</h2><span class="count-badge">{{ home.dueCheckins.length }}</span></div><button v-for="item in home.dueCheckins" :key="item.id" class="checkin-row" @click="checkin(item.commitmentId)"><span>回顾这次行动</span><b>›</b></button></section>
      <details class="modern-card advanced-tools"><summary>把支持带回现实</summary><p class="soft-note">下面每件事都只会在你明确保存后留下记录，系统不会替你联系任何人。</p><div class="tool-grid"><form @submit.prevent="createDecision"><h3>我现在很想做一个决定</h3><input v-model="advanced.decisionQuestion" placeholder="你现在想做什么？" required /><input v-model="advanced.decisionOptions" placeholder="可能的做法（可选，用逗号分开）" /><button class="outline-button full" :disabled="advancedBusy">先放这里</button></form><form @submit.prevent="createCooldown"><h3>先别发出去</h3><input v-model="advanced.cooldownTitle" placeholder="想先留住的那句话或决定" required /><input v-model="advanced.cooldownReason" placeholder="为什么想先缓一缓？" /><select v-model.number="advanced.cooldownHours" aria-label="先缓一缓多久"><option :value="1">1 小时后再看</option><option :value="12">12 小时后再看</option><option :value="24">24 小时后再看</option><option :value="72">72 小时后再看</option></select><button class="outline-button full" :disabled="advancedBusy">放进冷静箱</button></form><form @submit.prevent="createHandoff"><h3>帮我告诉现实中的一个人</h3><input v-model="advanced.handoffRecipient" placeholder="朋友、家人或同事" required /><select v-model="advanced.handoffChannel" aria-label="希望怎样联系"><option value="当面聊">当面聊</option><option value="电话">打电话</option><option value="消息">发消息</option></select><textarea v-model="advanced.handoffSummary" placeholder="希望对方怎么陪你？" required /><button class="outline-button full" :disabled="advancedBusy">保存这张求助卡</button></form><form @submit.prevent="saveSupportPlan"><h3>我的低谷预案</h3><input v-model="advanced.supportTitle" placeholder="给这份预案起个名字（可选）" /><textarea v-model="advanced.supportPlan" placeholder="下次很难受时，希望别人先怎样陪你？" required /><button class="outline-button full" :disabled="advancedBusy">保存预案</button></form><form @submit.prevent="saveMemory"><h3>AI 记得什么</h3><textarea v-model="advanced.memoryContent" placeholder="只留下你明确同意记住的一句话" required /><input v-model="advanced.memoryCategory" type="hidden" /><input v-model.number="advanced.memoryDays" type="hidden" /><button class="outline-button full" :disabled="advancedBusy">保存这段记忆</button></form></div><div v-if="cooldowns.length || decisions.length || handoffs.length || memories.length" class="saved-tools"><h3>已经保存的现实记录</h3><p v-for="item in decisions" :key="item.id">决定：{{ item.question }} · {{ item.status }}</p><p v-for="item in cooldowns" :key="item.id">冷静箱：{{ item.title }} · {{ item.status }}</p><p v-for="item in handoffs" :key="item.id">求助卡：{{ item.recipient }} · {{ item.status }} <button data-testid="action-share-handoff" class="text-button" v-if="item.status === 'ready'" @click="shareHandoff(item.id)">标记已分享</button></p><p v-for="item in memories" :key="item.id">记忆：{{ item.content }} <button class="text-button" @click="removeMemory(item.id)">立即忘记</button></p></div><div class="friendly-links"><button class="text-button" @click="router.push('/pages/future-self/index')">给清醒时候的自己留句话 ›</button><button class="text-button" @click="router.push('/pages/reality-handoff/index')">管理现实支持 ›</button><button class="text-button" @click="router.push('/pages/recovery/index')">记录生活恢复 ›</button></div><button class="text-button settings-link" @click="router.push('/pages/settings/privacy')">查看隐私边界</button></details>
    </template>
  </section>
</template>
<style scoped>
.modern-page { display:grid; gap:16px; padding:0 14px 150px; }.modern-hero {position:relative; min-height:214px; padding:28px 12px 24px; overflow:hidden; border-radius:0 0 34px 34px; background:linear-gradient(135deg,#f8f4e9,#e9f0df)}.modern-hero.compact{min-height:184px}.modern-hero::after{position:absolute;right:-14px;bottom:-18px;width:190px;height:190px;background:url('../assets/goodnight/tree-top-cutout.png') center/cover no-repeat;opacity:.35;content:'';pointer-events:none}.modern-hero .status-row{position:relative;z-index:1;display:flex;justify-content:space-between;font-weight:700}.eyebrow,.section-kicker{color:var(--gn-green);font-size:12px;letter-spacing:.06em}.modern-hero h1{position:relative;z-index:1;max-width:300px;margin:34px 0 8px;color:var(--gn-green-dark);font-family:var(--gn-font-display);font-size:32px;line-height:1.28}.modern-hero p:last-child{position:relative;z-index:1;margin:0;color:var(--gn-subtext)}.modern-card{border:1px solid var(--gn-border);border-radius:var(--gn-radius-card);background:var(--gn-card);box-shadow:var(--gn-shadow-card);padding:22px}.modern-card h2{margin:6px 0 8px;color:var(--gn-text);font-size:21px}.modern-card p{color:var(--gn-subtext);line-height:1.7}.card-heading{display:flex;justify-content:space-between;align-items:start;gap:10px}.text-button,.outline-button{border:0;background:transparent;color:var(--gn-green);font:inherit;cursor:pointer}.count-badge{min-width:24px;padding:4px 8px;border-radius:99px;background:var(--gn-green-light);color:var(--gn-green-dark);text-align:center}.reflection-field{display:grid;gap:7px;margin:14px 0;color:var(--gn-subtext);font-size:13px}.reflection-field input,.reflection-field textarea{min-height:44px;resize:none;box-sizing:border-box;width:100%;border:1px solid var(--gn-border);border-radius:14px;padding:10px 12px;background:#fffdf8;font:inherit;line-height:1.5}.reflection-field textarea{min-height:74px}.commitment-list{display:grid;gap:10px}.commitment-list article{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 0;border-bottom:1px solid var(--gn-border)}.commitment-list strong,.commitment-list small{display:block}.commitment-list small{margin-top:5px;color:var(--gn-subtext);line-height:1.5}.checkin-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}.primary-small,.secondary-small{flex:0 0 auto;border:0;border-radius:14px;padding:10px 12px;background:var(--gn-green);color:#fff;cursor:pointer;font:inherit}.secondary-small{background:transparent;border:1px solid var(--gn-border);color:var(--gn-green-dark)}.barrier-card{border-color:rgba(95,127,62,.35)}.barrier-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.barrier-list button{border:1px solid var(--gn-border);border-radius:999px;padding:9px 12px;background:#fffdf8;color:var(--gn-green-dark);font:inherit;cursor:pointer}.barrier-list button.selected{background:var(--gn-green);border-color:var(--gn-green);color:#fff}.adaptive-source{padding:12px;border-radius:14px;background:var(--gn-green-light);font-size:13px}.checkin-row{display:flex;width:100%;justify-content:space-between;border:0;border-bottom:1px solid var(--gn-border);background:transparent;padding:14px 0;color:var(--gn-text);font:inherit;text-align:left}.empty-note{margin-bottom:0}.full{width:100%;margin-top:14px;padding:12px;border:1px solid var(--gn-border);border-radius:15px}.error-text{margin:0 4px;color:var(--gn-danger)}.advanced-tools summary{cursor:pointer;color:var(--gn-green-dark);font-size:18px;font-weight:700}.advanced-tools .soft-note{font-size:13px}.tool-grid{display:grid;gap:12px}.tool-grid form{display:grid;gap:8px;padding-top:12px;border-top:1px solid var(--gn-border)}.tool-grid h3,.saved-tools h3{margin:0;color:var(--gn-green-dark);font-size:16px}.tool-grid input,.tool-grid textarea,.tool-grid select{width:100%;box-sizing:border-box;border:1px solid var(--gn-border);border-radius:12px;padding:10px;background:#fffdf8;font:inherit}.tool-grid textarea{min-height:72px;resize:vertical;line-height:1.5}.saved-tools{margin-top:16px;padding-top:12px;border-top:1px solid var(--gn-border)}.saved-tools p{margin:8px 0;font-size:13px}.friendly-links{display:grid;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--gn-border)}.settings-link{margin-top:14px}
</style>
