<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ActionBarrier } from '@goodnight/shared-types';
import { api } from '../api';
import { useDeviceClock } from '../composables/useDeviceClock';

const router = useRouter();
const route = useRoute();
const { timeLabel } = useDeviceClock();
const home = ref<any>(null);
const journeyDetail = ref<any>(null);
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
const recommendation = ref<{ title: string; why?: string; description?: string; expectedDuration?: string; completionDefinition?: string; dueInDays?: number } | null>(null);
const planning = ref(false);
const barrierOptions: Array<{ value: ActionBarrier; label: string }> = [
  { value: 'forgot', label: '忘了' }, { value: 'too_hard', label: '太难了' }, { value: 'emotion_too_strong', label: '情绪太强' }, { value: 'environment', label: '环境不允许' }, { value: 'something_else', label: '临时发生别的事' }, { value: 'did_not_want_to', label: '其实我不想做' }, { value: 'other', label: '其他' },
];
const currentJourney = computed(() => journeyDetail.value?.journey ?? home.value?.journey ?? null);
const activeActions = computed(() => journeyDetail.value?.commitments?.filter((item: { status: string }) => item.status === 'active') ?? home.value?.activeActions ?? []);
const dueCheckins = computed(() => journeyDetail.value?.checkins?.filter((item: { status: string }) => item.status === 'pending') ?? home.value?.dueCheckins ?? []);

async function loadAdvanced() {
  const results = await Promise.allSettled([api.get<any>('/api/v1/cooldown'), api.get<any>('/api/v1/decisions'), api.get<any>('/api/v1/handoffs'), api.get<any>('/api/v1/me/memories')]);
  cooldowns.value = results[0].status === 'fulfilled' ? results[0].value.items ?? [] : [];
  decisions.value = results[1].status === 'fulfilled' ? results[1].value.items ?? [] : [];
  handoffs.value = results[2].status === 'fulfilled' ? results[2].value.items ?? [] : [];
  memories.value = results[3].status === 'fulfilled' ? results[3].value.items ?? [] : [];
}
async function load() { loading.value = true; try { home.value = (await api.get<any>('/api/v1/tonight')).item; const requestedJourneyId = String(route.query.journeyId ?? home.value?.journey?.id ?? ''); journeyDetail.value = requestedJourneyId ? (await api.get<any>(`/api/v1/journeys/${requestedJourneyId}`)).item : null; await loadAdvanced(); } catch (cause: any) { error.value = cause?.message ?? '行动加载失败'; } finally { loading.value = false; } }
const waitForPlan = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
async function requestTonightAction() {
  const journeyId = String(route.query.journeyId ?? currentJourney.value?.id ?? '');
  if (!journeyId) { error.value = '先在今晚入口说说发生了什么'; return; }
  planning.value = true; error.value = ''; recommendation.value = null;
  try {
    const queued = await api.post<{ job: { id: string } }>(`/api/v1/journeys/${journeyId}/action-plan`, { content: home.value?.journey?.summary });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await waitForPlan(400);
      const task = await api.get<{ status: string; result?: string; structured?: Record<string, unknown> }>(`/api/v1/ai/tasks/${queued.job.id}`);
      if (['succeeded', 'fallback', 'failed'].includes(task.status)) {
        if (task.status === 'failed') throw new Error('这次没有形成可确认的行动');
        const structured = task.structured ?? {};
        recommendation.value = { title: typeof structured.title === 'string' ? structured.title : '', why: typeof structured.why === 'string' ? structured.why : undefined, description: typeof structured.description === 'string' ? structured.description : task.result, completionDefinition: typeof structured.completionDefinition === 'string' ? structured.completionDefinition : undefined, expectedDuration: typeof structured.expectedDuration === 'string' ? structured.expectedDuration : undefined, dueInDays: typeof structured.dueInDays === 'number' ? structured.dueInDays : 1 };
        break;
      }
    }
    if (!recommendation.value?.title) throw new Error('没有形成可以确认的小行动');
  } catch (cause: any) { error.value = cause?.message ?? '行动建议暂时不可用'; } finally { planning.value = false; }
}
async function acceptTonightAction() {
  const journeyId = String(route.query.journeyId ?? currentJourney.value?.id ?? '');
  if (!journeyId || !recommendation.value?.title) return;
  planning.value = true;
  try { await api.post(`/api/v1/journeys/${journeyId}/actions`, { title: recommendation.value.title, description: recommendation.value.completionDefinition || recommendation.value.description, dueAt: new Date(Date.now() + Math.max(1, recommendation.value.dueInDays ?? 1) * 86_400_000).toISOString() }); recommendation.value = null; await load(); } catch (cause: any) { error.value = cause?.message ?? '这一步没有保存成功'; } finally { planning.value = false; }
}
async function checkin(id: string, status: 'completed' | 'missed' = 'completed') {
  if (status === 'missed') {
    const action = activeActions.value.find((item: { id: string; title: string }) => item.id === id);
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
async function createDecision() { if (!advanced.value.decisionQuestion.trim()) return; await runAdvanced(async () => { const response = await api.post<any>('/api/v1/decisions', { journeyId: currentJourney.value?.id, question: advanced.value.decisionQuestion, options: advanced.value.decisionOptions.split(/[,，]/).map((item) => item.trim()).filter(Boolean) }); decisions.value.unshift(response.item); advanced.value.decisionQuestion = ''; advanced.value.decisionOptions = ''; }); }
async function createCooldown() { if (!advanced.value.cooldownTitle.trim()) return; await runAdvanced(async () => { await api.post('/api/v1/cooldowns', { title: advanced.value.cooldownTitle, reason: advanced.value.cooldownReason, hours: advanced.value.cooldownHours }); advanced.value.cooldownTitle = ''; advanced.value.cooldownReason = ''; await loadAdvanced(); }); }
async function createHandoff() { if (!advanced.value.handoffRecipient.trim() || !advanced.value.handoffChannel.trim() || !advanced.value.handoffSummary.trim()) { error.value = '请补全交接对象、联系渠道和说明'; return; } await runAdvanced(async () => { const response = await api.post<any>('/api/v1/handoffs', { journeyId: currentJourney.value?.id, recipient: advanced.value.handoffRecipient, channel: advanced.value.handoffChannel, summary: advanced.value.handoffSummary }); handoffs.value.unshift(response.item); advanced.value.handoffRecipient = ''; advanced.value.handoffChannel = ''; advanced.value.handoffSummary = ''; }); }
async function shareHandoff(id: string) { await runAdvanced(async () => { const response = await api.post<any>(`/api/v1/handoffs/${id}/share`); const index = handoffs.value.findIndex((item) => item.id === id); if (index >= 0) handoffs.value[index] = response.item; }); }
async function saveSupportPlan() { if (!advanced.value.supportPlan.trim()) return; await runAdvanced(async () => { await api.put('/api/v1/me/support-plan', { journeyId: currentJourney.value?.id, title: advanced.value.supportTitle || '我的现实支持计划', plan: { steps: advanced.value.supportPlan } }); advanced.value.supportPlan = ''; }); }
async function saveMemory() { if (!advanced.value.memoryContent.trim()) return; await runAdvanced(async () => { const response = await api.post<any>('/api/v1/memory', { journeyId: currentJourney.value?.id, category: advanced.value.memoryCategory, content: advanced.value.memoryContent, days: advanced.value.memoryDays }); memories.value.unshift(response.item); advanced.value.memoryContent = ''; }); }
async function removeMemory(id: string) { await runAdvanced(async () => { await api.delete(`/api/v1/me/memories/${id}`); memories.value = memories.value.filter((item) => item.id !== id); }); }
onMounted(load);
</script>
<template>
  <section class="page goodnight-page modern-page action-page">
    <header class="modern-hero compact"><div class="status-row"><span>{{ timeLabel }}</span><span aria-hidden="true"></span></div><p class="eyebrow">行动</p><h1>把想法变成一小步</h1><p>行动不是证明自己，是给现实一个可以观察的回应。</p></header>
    <p v-if="error" class="error-text">{{ error }}</p><p v-if="loading" class="soft-note">正在读取行动...</p>
    <template v-else>
      <section v-if="currentJourney && !activeActions.length" class="main-action-card" data-testid="primary-action-card"><span class="section-kicker">今晚的行动</span><h2>今晚，只做这一件事</h2><p>不需要证明自己，只要给现实一个可以观察的小回应。</p><div v-if="!recommendation" class="action-empty"><span aria-hidden="true">✎</span><strong>先让系统根据已确认的经历，整理一个足够小的动作。</strong><button class="primary-button" :disabled="planning" data-testid="action-request-plan" @click="requestTonightAction">{{ planning ? '正在整理一个现实动作…' : '给我一个可确认的建议' }}</button></div><div v-else class="recommendation"><h3>{{ recommendation.title }}</h3><p v-if="recommendation.why">为什么：{{ recommendation.why }}</p><p>{{ recommendation.completionDefinition || recommendation.description }}</p><small v-if="recommendation.expectedDuration">预计 {{ recommendation.expectedDuration }}</small><div class="checkin-actions"><button class="secondary-small" :disabled="planning" @click="requestTonightAction">换一个</button><button class="primary-small" :disabled="planning" data-testid="action-accept-plan" @click="acceptTonightAction">我愿意试试</button></div></div></section>
      <section class="modern-card" v-if="activeActions.length"><div class="card-heading"><div><span class="section-kicker">今晚的行动</span><h2>{{ activeActions[0].title }}</h2></div><button class="text-button" @click="router.push(`/pages/journey/detail?id=${currentJourney?.id}`)">看时间线</button></div><p>只完成这一个小动作，做完回来告诉我真实发生了什么。</p><label class="reflection-field">后来怎么样？<textarea v-model="reflection" maxlength="800" placeholder="可以写做到、没做到，或遇到的阻碍" /></label><div class="checkin-actions"><button class="primary-small" @click="checkin(activeActions[0].id, 'completed')">完成并回顾</button><button class="secondary-small" @click="checkin(activeActions[0].id, 'missed')">没做到</button></div></section>
      <section v-if="!currentJourney" class="modern-card"><h2>今晚，只做这一件事</h2><p>先在今晚入口说说发生了什么，系统才会根据你的真实经历整理下一步。</p><button class="outline-button full" @click="router.push('/pages/tonight/index')">去今晚建立旅程</button></section>
      <section v-if="missedAction" class="modern-card barrier-card"><span class="section-kicker">没做到也没关系。</span><h2>“{{ missedAction.title }}”为什么变难了？</h2><p>我们把这一步，再缩小一点。选一个最接近的原因就好。</p><div class="barrier-list"><button v-for="option in barrierOptions" :key="option.value" :class="{ selected: selectedBarrier === option.value }" @click="selectedBarrier = option.value">{{ option.label }}</button></div><button class="primary-button" :disabled="adapting" @click="createAdaptiveDraft">{{ adapting ? '正在整理更小的一步...' : '那我们再缩小一点' }}</button><template v-if="adaptiveResult"><p class="adaptive-source">{{ adaptiveResult.result || '任务已完成，请由你写下愿意尝试的新行动。' }}</p><label class="reflection-field">接下来 10 分钟，愿意先做什么？<input v-model="adaptiveResult.title" placeholder="例如：只打开文档写下第一行" /></label><label class="reflection-field">怎样算完成？<textarea v-model="adaptiveResult.description" maxlength="500" placeholder="由你定义一个足够小的完成标准" /></label><div class="checkin-actions"><button class="secondary-small" :disabled="adapting" @click="createAdaptiveDraft">我想换一个</button><button class="primary-small" :disabled="adapting" @click="confirmAdaptiveAction">试试这个更小一步</button></div></template></section>
      <section v-if="dueCheckins.length" class="modern-card"><div class="card-heading"><h2>待回顾</h2><span class="count-badge">{{ dueCheckins.length }}</span></div><button v-for="item in dueCheckins" :key="item.id" class="checkin-row" @click="item.commitmentId && checkin(item.commitmentId)"><span>回顾这次行动</span><b>›</b></button></section>
      <details class="modern-card advanced-tools"><summary>把支持带回现实</summary><p class="soft-note">下面每件事都只会在你明确保存后留下记录，系统不会替你联系任何人。</p><div class="tool-grid"><form @submit.prevent="createDecision"><h3>我现在很想做一个决定</h3><input v-model="advanced.decisionQuestion" placeholder="你现在想做什么？" required /><input v-model="advanced.decisionOptions" placeholder="可能的做法（可选，用逗号分开）" /><button class="outline-button full" :disabled="advancedBusy">先放这里</button></form><form @submit.prevent="createCooldown"><h3>先别发出去</h3><input v-model="advanced.cooldownTitle" placeholder="想先留住的那句话或决定" required /><input v-model="advanced.cooldownReason" placeholder="为什么想先缓一缓？" /><select v-model.number="advanced.cooldownHours" aria-label="先缓一缓多久"><option :value="1">1 小时后再看</option><option :value="12">12 小时后再看</option><option :value="24">24 小时后再看</option><option :value="72">72 小时后再看</option></select><button class="outline-button full" :disabled="advancedBusy">放进冷静箱</button></form><form @submit.prevent="createHandoff"><h3>帮我告诉现实中的一个人</h3><input v-model="advanced.handoffRecipient" placeholder="朋友、家人或同事" required /><select v-model="advanced.handoffChannel" aria-label="希望怎样联系"><option value="当面聊">当面聊</option><option value="电话">打电话</option><option value="消息">发消息</option></select><textarea v-model="advanced.handoffSummary" placeholder="希望对方怎么陪你？" required /><button class="outline-button full" :disabled="advancedBusy">保存这张求助卡</button></form><form @submit.prevent="saveSupportPlan"><h3>我的低谷预案</h3><input v-model="advanced.supportTitle" placeholder="给这份预案起个名字（可选）" /><textarea v-model="advanced.supportPlan" placeholder="下次很难受时，希望别人先怎样陪你？" required /><button class="outline-button full" :disabled="advancedBusy">保存预案</button></form><form @submit.prevent="saveMemory"><h3>AI 记得什么</h3><textarea v-model="advanced.memoryContent" placeholder="只留下你明确同意记住的一句话" required /><input v-model="advanced.memoryCategory" type="hidden" /><input v-model.number="advanced.memoryDays" type="hidden" /><button class="outline-button full" :disabled="advancedBusy">保存这段记忆</button></form></div><div v-if="cooldowns.length || decisions.length || handoffs.length || memories.length" class="saved-tools"><h3>已经保存的现实记录</h3><p v-for="item in decisions" :key="item.id">决定：{{ item.question }} · {{ item.status }}</p><p v-for="item in cooldowns" :key="item.id">冷静箱：{{ item.title }} · {{ item.status }}</p><p v-for="item in handoffs" :key="item.id">求助卡：{{ item.recipient }} · {{ item.status }} <button data-testid="action-share-handoff" class="text-button" v-if="item.status === 'ready'" @click="shareHandoff(item.id)">标记已分享</button></p><p v-for="item in memories" :key="item.id">记忆：{{ item.content }} <button class="text-button" @click="removeMemory(item.id)">立即忘记</button></p></div><div class="friendly-links"><button class="text-button" @click="router.push('/pages/future-self/index')">给清醒时候的自己留句话 ›</button><button class="text-button" @click="router.push('/pages/reality-handoff/index')">管理现实支持 ›</button><button class="text-button" @click="router.push('/pages/recovery/index')">记录生活恢复 ›</button></div><button class="text-button settings-link" @click="router.push('/pages/settings/privacy')">查看隐私边界</button></details>
    </template>
  </section>
</template>
<style scoped>
.modern-page { display:grid; gap:16px; padding:0 14px 150px; }.modern-hero {position:relative; min-height:214px; padding:28px 12px 24px; overflow:hidden; border-radius:0 0 34px 34px; background:radial-gradient(circle at 72% 68%,rgba(231,168,115,.46),transparent 24%),linear-gradient(165deg,#11202f,#293d4b 54%,#74655c)}.modern-hero.compact{min-height:184px}.modern-hero::after{position:absolute;right:-14px;bottom:-18px;width:190px;height:190px;background:url('../assets/goodnight/tree-top-cutout.png') center/cover no-repeat;opacity:.4;content:'';filter:brightness(.7);pointer-events:none}.modern-hero .status-row{position:relative;z-index:1;display:flex;justify-content:space-between;color:#fffaf0;font-weight:700}.eyebrow,.section-kicker{color:var(--gn-green);font-size:12px;letter-spacing:.06em}.modern-hero .eyebrow{position:relative;z-index:1;color:rgba(255,250,240,.75)}.modern-hero h1{position:relative;z-index:1;max-width:300px;margin:34px 0 8px;color:#fffaf1;font-family:var(--gn-font-display);font-size:32px;line-height:1.28}.modern-hero p:last-child{position:relative;z-index:1;margin:0;color:rgba(255,250,240,.78)}.modern-card,.main-action-card{border:1px solid var(--gn-border);border-radius:var(--gn-radius-card);background:var(--gn-card);box-shadow:var(--gn-shadow-card);padding:22px}.modern-card h2,.main-action-card h2{margin:6px 0 8px;color:var(--gn-text);font-size:21px}.modern-card p,.main-action-card p{color:var(--gn-subtext);line-height:1.7}.main-action-card{display:grid;gap:10px;background:linear-gradient(145deg,#fffdf7,#eef2e5)}.main-action-card>h2{font-size:28px;color:#344e38}.action-empty{display:grid;gap:12px;border-radius:17px;background:rgba(255,253,247,.72);padding:17px}.action-empty>span{font-size:29px;color:#69825a}.action-empty strong{color:#596d52;font-weight:400;line-height:1.55}.recommendation{display:grid;gap:8px;border-radius:16px;background:#fffdf7;padding:15px}.recommendation h3{margin:0;color:#365635;font-size:20px;line-height:1.45}.recommendation p{margin:0}.recommendation small{color:#788175}.card-heading{display:flex;justify-content:space-between;align-items:start;gap:10px}.text-button,.outline-button{border:0;background:transparent;color:var(--gn-green);font:inherit;cursor:pointer}.count-badge{min-width:24px;padding:4px 8px;border-radius:99px;background:var(--gn-green-light);color:var(--gn-green-dark);text-align:center}.reflection-field{display:grid;gap:7px;margin:14px 0;color:var(--gn-subtext);font-size:13px}.reflection-field input,.reflection-field textarea{min-height:44px;resize:none;box-sizing:border-box;width:100%;border:1px solid var(--gn-border);border-radius:14px;padding:10px 12px;background:#fffdf8;font:inherit;line-height:1.5}.reflection-field textarea{min-height:74px}.commitment-list{display:grid;gap:10px}.commitment-list article{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 0;border-bottom:1px solid var(--gn-border)}.commitment-list strong,.commitment-list small{display:block}.commitment-list small{margin-top:5px;color:var(--gn-subtext);line-height:1.5}.checkin-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}.primary-small,.secondary-small{flex:0 0 auto;border:0;border-radius:14px;padding:10px 12px;background:var(--gn-green);color:#fff;cursor:pointer;font:inherit}.secondary-small{background:transparent;border:1px solid var(--gn-border);color:var(--gn-green-dark)}.primary-button{width:100%;min-height:48px;border:0;border-radius:15px;background:var(--gn-green);color:#fff;font:inherit;cursor:pointer}.barrier-card{border-color:rgba(95,127,62,.35)}.barrier-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.barrier-list button{border:1px solid var(--gn-border);border-radius:999px;padding:9px 12px;background:#fffdf8;color:var(--gn-green-dark);font:inherit;cursor:pointer}.barrier-list button.selected{background:var(--gn-green);border-color:var(--gn-green);color:#fff}.adaptive-source{padding:12px;border-radius:14px;background:var(--gn-green-light);font-size:13px}.checkin-row{display:flex;width:100%;justify-content:space-between;border:0;border-bottom:1px solid var(--gn-border);background:transparent;padding:14px 0;color:var(--gn-text);font:inherit;text-align:left}.empty-note{margin-bottom:0}.full{width:100%;margin-top:14px;padding:12px;border:1px solid var(--gn-border);border-radius:15px}.error-text{margin:0 4px;color:var(--gn-danger)}.advanced-tools summary{cursor:pointer;color:var(--gn-green-dark);font-size:18px;font-weight:700}.advanced-tools .soft-note{font-size:13px}.tool-grid{display:grid;gap:12px}.tool-grid form{display:grid;gap:8px;padding-top:12px;border-top:1px solid var(--gn-border)}.tool-grid h3,.saved-tools h3{margin:0;color:var(--gn-green-dark);font-size:16px}.tool-grid input,.tool-grid textarea,.tool-grid select{width:100%;box-sizing:border-box;border:1px solid var(--gn-border);border-radius:12px;padding:10px;background:#fffdf8;font:inherit}.tool-grid textarea{min-height:72px;resize:vertical;line-height:1.5}.saved-tools{margin-top:16px;padding-top:12px;border-top:1px solid var(--gn-border)}.saved-tools p{margin:8px 0;font-size:13px}.friendly-links{display:grid;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--gn-border)}.settings-link{margin-top:14px}
</style>
