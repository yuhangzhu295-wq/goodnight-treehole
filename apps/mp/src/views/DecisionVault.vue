<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import AppIcon from '../components/icons/AppIcon.vue';

type DecisionStatus = 'draft' | 'cooling' | 'ready' | 'decided' | 'archived';
type DecisionItem = {
  id: string;
  question: string;
  options: string[];
  criteria: string[];
  decision?: string;
  outcome?: string;
  status: DecisionStatus;
  cooldownUntil?: string;
  reviewedAt?: string;
  createdAt: string;
};

const router = useRouter();
const items = ref<DecisionItem[]>([]);
const loading = ref(true);
const busyId = ref('');
const error = ref('');
const notice = ref('');
const nowTick = ref(Date.now());
const draft = reactive({ question: '', reason: '', intensity: 8, hours: 24 });
const answers = reactive<Record<string, { decision: string; outcome: string }>>({});
let timer = 0;

const activeItems = computed(() => items.value.filter((item) => item.status !== 'archived'));
const archivedItems = computed(() => items.value.filter((item) => item.status === 'archived'));

function reasonOf(item: DecisionItem) {
  return item.criteria.find((part) => !part.startsWith('情绪强度:')) ?? '给自己一点时间，再回来看看。';
}

function intensityOf(item: DecisionItem) {
  return item.criteria.find((part) => part.startsWith('情绪强度:'))?.replace('情绪强度:', '') ?? '';
}

function cooldownText(item: DecisionItem) {
  if (!item.cooldownUntil) return '尚未设置冷静时间';
  const remaining = Date.parse(item.cooldownUntil) - nowTick.value;
  if (remaining <= 0) return '冷静时间已结束，可以重新看一眼';
  const minutes = Math.ceil(remaining / 60_000);
  if (minutes < 60) return `还有约 ${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `还有约 ${hours} 小时${rest ? ` ${rest} 分钟` : ''}`;
}

function formatMoment(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function prepareAnswers() {
  for (const item of items.value) {
    answers[item.id] ??= { decision: item.decision ?? '', outcome: item.outcome ?? '' };
  }
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await api.get<any>('/api/v1/decisions');
    items.value = result.items ?? [];
    prepareAnswers();
  } catch (cause: any) {
    error.value = cause?.message ?? '决定保险箱暂时没有打开';
  } finally {
    loading.value = false;
  }
}

async function saveForLater() {
  if (!draft.question.trim() || !draft.reason.trim()) {
    error.value = '请先写下决定和此刻想做它的原因';
    return;
  }
  busyId.value = 'create';
  error.value = '';
  notice.value = '';
  try {
    const created = await api.post<any>('/api/v1/decisions', {
      question: draft.question.trim(),
      options: [],
      criteria: [draft.reason.trim(), `情绪强度:${draft.intensity}/10`],
    });
    await api.post('/api/v1/cooldowns', {
      decisionId: created.item.id,
      title: draft.question.trim(),
      reason: draft.reason.trim(),
      hours: draft.hours,
    });
    Object.assign(draft, { question: '', reason: '', intensity: 8, hours: 24 });
    notice.value = '已经放进冷静箱。到时间后，我们只回来问你是否还这样想。';
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '这件事暂时没有保存成功';
    await load();
  } finally {
    busyId.value = '';
  }
}

async function resumeDraft(item: DecisionItem, hours = 24) {
  busyId.value = item.id;
  error.value = '';
  try {
    await api.post('/api/v1/cooldowns', { decisionId: item.id, title: item.question, reason: reasonOf(item), hours });
    notice.value = '冷静时间已经开始。';
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '冷静时间没有设置成功';
  } finally {
    busyId.value = '';
  }
}

async function decide(item: DecisionItem) {
  const answer = answers[item.id];
  if (!answer?.decision.trim()) {
    error.value = '最终决定必须由你自己写下';
    return;
  }
  busyId.value = item.id;
  error.value = '';
  try {
    await api.patch(`/api/v1/decisions/${item.id}`, {
      decision: answer.decision.trim(),
      outcome: answer.outcome.trim(),
      status: 'decided',
    });
    notice.value = '已记录你自己作出的决定。';
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '决定暂时没有保存成功';
  } finally {
    busyId.value = '';
  }
}

async function archive(item: DecisionItem) {
  busyId.value = item.id;
  error.value = '';
  try {
    const answer = answers[item.id];
    if (answer?.outcome.trim() !== (item.outcome ?? ''))
      await api.patch(`/api/v1/decisions/${item.id}`, { outcome: answer.outcome.trim() });
    await api.patch(`/api/v1/decisions/${item.id}`, { status: 'archived' });
    notice.value = '这项决定已经归档。';
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '归档没有完成';
  } finally {
    busyId.value = '';
  }
}

onMounted(() => {
  void load();
  timer = window.setInterval(() => {
    nowTick.value = Date.now();
  }, 30_000);
});
onBeforeUnmount(() => window.clearInterval(timer));
</script>

<template>
  <main class="decision-page">
    <header class="decision-hero">
      <button class="back-button" type="button" aria-label="返回" @click="router.back()">
        <AppIcon name="back" :size="21" />
      </button>
      <div>
        <h1>先把这个决定放这里</h1>
        <p>不是不做决定，而是给自己一点冷静时间。</p>
      </div>
      <span class="hero-moon" aria-hidden="true">☾</span>
    </header>

    <section class="vault-content">
      <form class="decision-composer" @submit.prevent="saveForLater">
        <h2><span aria-hidden="true">◈</span> 我现在很想做一个决定</h2>
        <label class="quote-field">
          <span class="sr-only">想做的决定</span>
          <textarea v-model="draft.question" maxlength="400" placeholder="例如：我想立刻联系 TA，把所有话都说清楚。" />
        </label>

        <label class="line-field">
          <span class="field-icon" aria-hidden="true">♠</span>
          <span><strong>为什么现在想做</strong><input v-model="draft.reason" maxlength="400" placeholder="此刻最担心什么，或最想确认什么？" /></span>
        </label>

        <div class="line-field intensity-row">
          <span class="field-icon" aria-hidden="true">♥</span>
          <span><strong>此刻情绪强度</strong><small>{{ draft.intensity }}/10</small></span>
          <input v-model.number="draft.intensity" type="range" min="1" max="10" aria-label="此刻情绪强度" />
        </div>

        <fieldset class="cooldown-field">
          <legend><span aria-hidden="true">▣</span> 先锁多久</legend>
          <div class="duration-options">
            <label v-for="option in [1, 12, 24, 72]" :key="option">
              <input v-model.number="draft.hours" type="radio" name="duration" :value="option" />
              <span>{{ option }}小时</span>
            </label>
          </div>
        </fieldset>

        <p class="return-note"><AppIcon name="clock" :size="18" /> {{ draft.hours }} 小时后，我们回来只问：你现在还这样想吗？</p>
        <div class="composer-actions">
          <button class="primary-action" type="submit" :disabled="busyId === 'create'">
            <span aria-hidden="true">▣</span>{{ busyId === 'create' ? '正在保存…' : '先放这里' }}
          </button>
          <button class="secondary-action" type="button" @click="draft.question = draft.question ? `${draft.question}\n我能先做的更小一步是：` : '我能先做的更小一步是：'">
            <span aria-hidden="true">⌁</span>改成更小一步
          </button>
        </div>
      </form>

      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-if="loading" class="loading">正在打开冷静箱…</p>

      <section v-if="activeItems.length" class="saved-section">
        <h2><span aria-hidden="true">▣</span> 冷静箱</h2>
        <p>暂时存的决定，会在合适的时间回来。</p>
        <article v-for="item in activeItems" :key="item.id" class="saved-item" :data-status="item.status">
          <div class="saved-icon" aria-hidden="true">▤</div>
          <div class="saved-copy">
            <strong>{{ item.question }}</strong>
            <small>{{ reasonOf(item) }}</small>
            <small v-if="intensityOf(item)">保存时强度 {{ intensityOf(item) }}</small>
            <span v-if="item.status === 'cooling'" class="status-pill">冷静中 · {{ cooldownText(item) }}</span>
            <span v-else-if="item.status === 'draft'" class="status-pill">等待设置冷静时间</span>
            <template v-else-if="item.status === 'ready'">
              <span class="status-pill ready">可以重新看一眼</span>
              <textarea v-model="answers[item.id].decision" maxlength="400" placeholder="现在，由你写下自己的决定…" />
              <textarea v-model="answers[item.id].outcome" maxlength="800" placeholder="可选：你希望之后回来记录什么结果？" />
              <button class="item-action" type="button" :disabled="busyId === item.id" @click="decide(item)">由我确认这个决定</button>
            </template>
            <template v-else-if="item.status === 'decided'">
              <span class="status-pill decided">已由你决定 · {{ formatMoment(item.reviewedAt) }}</span>
              <p class="own-decision">{{ item.decision }}</p>
              <textarea v-model="answers[item.id].outcome" maxlength="800" placeholder="后来发生了什么？可在归档前补充。" />
              <button class="item-action ghost" type="button" :disabled="busyId === item.id" @click="archive(item)">保存结果并归档</button>
            </template>
            <button v-if="item.status === 'draft'" class="item-action" type="button" :disabled="busyId === item.id" @click="resumeDraft(item)">开始 24 小时冷静期</button>
          </div>
        </article>
      </section>

      <details v-if="archivedItems.length" class="archive-section">
        <summary>已归档的决定（{{ archivedItems.length }}）</summary>
        <article v-for="item in archivedItems" :key="item.id">
          <strong>{{ item.question }}</strong>
          <p>{{ item.decision }}</p>
          <small v-if="item.outcome">后来：{{ item.outcome }}</small>
        </article>
      </details>

      <p class="boundary-note">这里帮助你留出时间、整理信息，不替代法律、医疗或财务专业建议，也不会替你作决定。</p>
    </section>
  </main>
</template>

<style scoped>
.decision-page{box-sizing:border-box;width:100%;min-height:100vh;overflow-x:hidden;background:#f5efe2;color:#26362d;padding-bottom:34px}.decision-hero{position:relative;display:flex;align-items:flex-start;justify-content:center;height:132px;overflow:hidden;padding:22px 46px 12px;background:linear-gradient(180deg,rgba(11,28,43,.18),rgba(11,28,43,.72)),url('../assets/goodnight/illustrations/action-night-corner.png') center 41%/cover no-repeat;color:#fff8e9;text-align:center}.decision-hero::after{position:absolute;inset:auto 0 0;height:36px;background:linear-gradient(transparent,#f5efe2);content:''}.decision-hero>div{position:relative;z-index:1}.decision-hero h1{margin:27px 0 3px;font-family:"Songti SC","Noto Serif SC",serif;font-size:24px;font-weight:650;letter-spacing:0;line-height:1.25}.decision-hero p{margin:0;color:rgba(255,249,236,.8);font-size:12px}.back-button{position:absolute;z-index:2;top:20px;left:20px;display:grid;width:35px;height:35px;padding:0;border:1px solid rgba(80,92,69,.18);border-radius:50%;background:#f8f1df;color:#49613e;place-items:center}.hero-moon{position:absolute;z-index:1;top:18px;right:24px;color:#f8dda1;font-size:27px}.vault-content{position:relative;z-index:2;display:grid;gap:10px;margin:-2px auto 0;padding:0 20px}.decision-composer,.saved-section,.archive-section{border:1px solid rgba(93,112,70,.18);border-radius:16px;background:rgba(255,253,247,.92);box-shadow:0 11px 24px rgba(65,72,47,.08)}.decision-composer{padding:16px}.decision-composer h2,.saved-section h2{margin:0;color:#385733;font-family:"Songti SC","Noto Serif SC",serif;font-size:17px;letter-spacing:0}.decision-composer h2 span,.saved-section h2 span{color:#789354}.quote-field{display:block;margin:11px 0 6px}.quote-field textarea{box-sizing:border-box;width:100%;height:62px;resize:none;border:1px solid #e3dfd0;border-radius:9px;background:#fbfaf5;padding:12px 15px;color:#304035;font:14px/1.65 inherit}.line-field{display:grid;grid-template-columns:30px 1fr;align-items:center;min-height:48px;border-bottom:1px solid #ebe6d8}.field-icon{display:grid;width:27px;height:27px;border-radius:50%;background:#eef1df;color:#69864b;place-items:center}.line-field>span:nth-child(2){display:grid;gap:1px}.line-field strong,.cooldown-field legend{font-size:13px}.line-field input:not([type=range]){min-width:0;border:0;outline:0;background:transparent;color:#687066;font:12px inherit}.intensity-row{grid-template-columns:30px 88px 1fr}.intensity-row small{color:#bd8c55}.intensity-row input{width:100%;accent-color:#7d9855}.cooldown-field{margin:10px 0 0;padding:0;border:0}.cooldown-field legend{margin-bottom:8px;font-weight:650}.duration-options{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.duration-options label{min-width:0}.duration-options input{position:absolute;opacity:0;pointer-events:none}.duration-options span{display:grid;height:30px;border:1px solid #dedbcd;border-radius:999px;background:#fbfaf5;color:#5f675d;font-size:12px;place-items:center}.duration-options input:checked+span{border-color:#6e8a4c;background:#e9efdc;color:#456238;box-shadow:inset 0 0 0 1px #6e8a4c}.return-note{display:flex;align-items:center;gap:7px;margin:10px 0;padding:8px 11px;border-radius:8px;background:#f8ead0;color:#856c4c;font-size:11px}.composer-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}.composer-actions button,.item-action{height:39px;border-radius:999px;font:13px inherit}.primary-action{border:0;background:#536f3f;color:white}.secondary-action{border:1px solid #6d814f;background:#fffdf7;color:#526a42}.composer-actions span{margin-right:5px}.notice,.error,.loading{margin:0;padding:8px 12px;border-radius:9px;font-size:12px}.notice{background:#e9f0dd;color:#45613c}.error{background:#fff0ed;color:#a0443d}.loading{color:#6d756a}.saved-section{padding:13px 15px}.saved-section>p{margin:2px 0 10px;color:#8a8e82;font-size:11px}.saved-item{display:grid;grid-template-columns:38px 1fr;gap:8px;padding:10px 7px;border:1px solid #e7e2d4;border-radius:10px;background:#fbfaf5}.saved-item+.saved-item{margin-top:7px}.saved-icon{display:grid;width:35px;height:35px;border-radius:50%;background:#eef0df;color:#748b53;font-size:18px;place-items:center}.saved-copy{display:grid;gap:4px;min-width:0}.saved-copy strong{overflow-wrap:anywhere;font-size:13px}.saved-copy small{color:#7c8177;font-size:10px}.status-pill{justify-self:start;border-radius:999px;background:#ecf0df;padding:3px 8px;color:#677c4d;font-size:10px}.status-pill.ready{background:#f7e7c7;color:#80683c}.status-pill.decided{background:#e7eee3;color:#486243}.saved-copy textarea{box-sizing:border-box;width:100%;height:46px;resize:none;border:1px solid #dedbce;border-radius:8px;background:#fffdfa;padding:8px;color:#38463c;font:12px/1.45 inherit}.item-action{margin-top:2px;border:0;background:#5d7748;color:#fff}.item-action.ghost{border:1px solid #6f8257;background:#fffdf7;color:#536a44}.own-decision{margin:1px 0;padding:7px 9px;border-left:3px solid #7b955b;background:#f2f3e9;font-size:12px;line-height:1.55}.archive-section{padding:11px 14px}.archive-section summary{cursor:pointer;color:#576c48;font-size:12px}.archive-section article{margin-top:8px;padding-top:8px;border-top:1px solid #e6e1d2;font-size:12px}.archive-section p{margin:4px 0}.archive-section small{color:#777f74}.boundary-note{margin:2px 4px;color:#8a887f;font-size:10px;line-height:1.55;text-align:center}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}button:disabled{cursor:not-allowed;opacity:.55}@media(max-width:390px){.vault-content{padding:0 14px}.decision-composer{padding:14px}.decision-hero h1{font-size:22px}.duration-options{gap:4px}.duration-options span{font-size:11px}}@media(min-width:431px){.decision-page{max-width:430px;margin:0 auto}}
</style>
