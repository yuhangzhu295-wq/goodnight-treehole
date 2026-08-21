<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import AppIcon from '../components/icons/AppIcon.vue';

type ContextType = 'none' | 'journey' | 'decision' | 'recovery';
type FutureMessage = {
  id: string;
  content: string;
  deliverAt: string;
  deliveredAt?: string;
  contextType?: Exclude<ContextType, 'none'>;
  contextRefId?: string;
  contextLabel?: string;
};

const router = useRouter();
const items = ref<FutureMessage[]>([]);
const journeys = ref<any[]>([]);
const decisions = ref<any[]>([]);
const recoveries = ref<any[]>([]);
const content = ref('');
const contextType = ref<ContextType>('none');
const contextRefId = ref('');
const timePreset = ref<'tomorrow' | 'week' | 'month' | 'custom'>('tomorrow');
const deliverAt = ref('');
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const notice = ref('');

const contextOptions = computed(() => {
  if (contextType.value === 'journey') {
    return journeys.value.map((item) => ({
      id: item.journey?.id ?? item.id,
      label: item.journey?.title ?? item.title ?? '未命名旅程',
    }));
  }
  if (contextType.value === 'decision') return decisions.value.map((item) => ({ id: item.id, label: item.question }));
  if (contextType.value === 'recovery') return recoveries.value.map((item) => ({ id: item.id, label: item.summary }));
  return [];
});

const canSave = computed(() => {
  return Boolean(content.value.trim() && deliverAt.value && (contextType.value === 'none' || contextRefId.value));
});

function asLocalInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function presetDate(preset = timePreset.value) {
  const date = new Date();
  date.setSeconds(0, 0);
  if (preset === 'tomorrow') {
    date.setDate(date.getDate() + 1);
    date.setHours(20, 30, 0, 0);
  }
  if (preset === 'week') date.setDate(date.getDate() + 7);
  if (preset === 'month') date.setMonth(date.getMonth() + 1);
  return asLocalInput(date);
}

function formatMoment(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function changePreset(value: 'tomorrow' | 'week' | 'month' | 'custom') {
  timePreset.value = value;
  if (value !== 'custom') deliverAt.value = presetDate(value);
}

function deliveryState(item: FutureMessage) {
  return item.deliveredAt
    ? '已在 ' + formatMoment(item.deliveredAt) + ' 送达'
    : '将在 ' + formatMoment(item.deliverAt) + ' 送达';
}

const scheduledDeliveryText = computed(() => {
  return deliverAt.value ? '预计 ' + formatMoment(new Date(deliverAt.value).toISOString()) + ' 通过提醒送达' : '正在准备送达时间';
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [messageResult, journeyResult, decisionResult, recoveryResult] = await Promise.all([
      api.get<any>('/api/v1/future-messages'),
      api.get<any>('/api/v1/journeys'),
      api.get<any>('/api/v1/decisions'),
      api.get<any>('/api/v1/me/recovery'),
    ]);
    items.value = messageResult.items ?? [];
    journeys.value = journeyResult.items ?? [];
    decisions.value = decisionResult.items ?? [];
    recoveries.value = recoveryResult.items ?? [];
  } catch (cause: any) {
    error.value = cause?.message ?? '未来信暂时没有打开';
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!canSave.value) {
    error.value = contextType.value !== 'none' && !contextRefId.value ? '请先选择要关联的记录' : '请写下内容并选择送达时间';
    return;
  }
  saving.value = true;
  error.value = '';
  notice.value = '';
  try {
    const payload: Record<string, string> = {
      content: content.value.trim(),
      deliverAt: new Date(deliverAt.value).toISOString(),
    };
    if (contextType.value !== 'none') {
      payload.contextType = contextType.value;
      payload.contextRefId = contextRefId.value;
    }
    await api.post('/api/v1/future-messages', payload);
    content.value = '';
    contextType.value = 'none';
    contextRefId.value = '';
    changePreset('tomorrow');
    notice.value = '这封话已交给未来。到时间后，真实随访队列会把它送回给你。';
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '这封未来信没有保存成功';
  } finally {
    saving.value = false;
  }
}

watch(contextType, () => {
  contextRefId.value = '';
});

onMounted(() => {
  deliverAt.value = presetDate('tomorrow');
  void load();
});
</script>

<template>
  <section class="goodnight-page future-page">
    <header class="future-hero">
      <button class="back-button" type="button" aria-label="返回" @click="router.back()">
        <AppIcon name="back" :size="18" />
      </button>
      <span class="brand"><span aria-hidden="true">♧</span> 晚安树洞</span>
      <span class="moon" aria-hidden="true">☾</span>
      <h1>写给未来的我</h1>
      <p>给下一次难受的自己，先留一点方向。</p>
    </header>

    <form class="future-paper" @submit.prevent="save">
      <div class="paper-heading">
        <span class="heading-mark" aria-hidden="true">✦</span>
        <div>
          <h2>给未来的我写一封信</h2>
          <p>现在不需要把一切想清楚，只留下此刻最想记住的话。</p>
        </div>
      </div>
      <label class="letter-field">
        <span class="sr-only">写给未来自己的内容</span>
        <textarea v-model="content" maxlength="1200" placeholder="此刻想对未来的自己说些什么？"></textarea>
        <small>{{ content.length }}/1200</small>
      </label>

      <fieldset class="delivery-field">
        <legend><span aria-hidden="true">◷</span> 想在什么时候收到</legend>
        <div class="time-options">
          <button type="button" :class="{ selected: timePreset === 'tomorrow' }" @click="changePreset('tomorrow')">明天晚上</button>
          <button type="button" :class="{ selected: timePreset === 'week' }" @click="changePreset('week')">一周后</button>
          <button type="button" :class="{ selected: timePreset === 'month' }" @click="changePreset('month')">一个月后</button>
          <button type="button" :class="{ selected: timePreset === 'custom' }" @click="changePreset('custom')">自定义</button>
        </div>
        <label v-if="timePreset === 'custom'" class="custom-time">
          具体送达时间
          <input v-model="deliverAt" type="datetime-local" />
        </label>
        <p v-else class="delivery-note">{{ scheduledDeliveryText }}</p>
      </fieldset>

      <fieldset class="context-field">
        <legend><span aria-hidden="true">◇</span> 要不要带上一段经历 <small>可选</small></legend>
        <div class="context-types">
          <label v-for="option in [['none', '不关联'], ['journey', '一段旅程'], ['decision', '一个决定'], ['recovery', '一次恢复']]" :key="option[0]">
            <input v-model="contextType" type="radio" name="future-context" :value="option[0]" />
            <span>{{ option[1] }}</span>
          </label>
        </div>
        <label v-if="contextType !== 'none'" class="context-picker">
          <span>{{ contextOptions.length ? '由你选择，不会自动读取其他内容' : '还没有可以关联的记录' }}</span>
          <select v-model="contextRefId" :disabled="!contextOptions.length">
            <option value="">请选择</option>
            <option v-for="option in contextOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
          </select>
        </label>
      </fieldset>

      <p v-if="notice" class="notice" role="status">{{ notice }}</p>
      <p v-if="error" class="error-note" role="alert">{{ error }}</p>
      <button class="future-save" data-testid="future-self-save" type="submit" :disabled="saving || !canSave">
        <span aria-hidden="true">✦</span>{{ saving ? '正在保存…' : '把这封话留给未来' }}
      </button>
      <p class="private-note"><AppIcon name="heart" :size="14" /> 默认只对你自己可见，不会自动公开。</p>
    </form>

    <p v-if="loading" class="state-note">正在读取写下的未来信…</p>
    <section v-else class="letters-section">
      <div class="section-label"><span aria-hidden="true">⌁</span><h2>已经写下的信</h2></div>
      <p v-if="!items.length" class="empty-note">还没有留给未来的话。你可以从一句简单的话开始。</p>
      <article v-for="item in items" :key="item.id" class="saved-letter" :class="{ delivered: item.deliveredAt }">
        <span class="letter-icon" aria-hidden="true">✉</span>
        <div>
          <p>{{ item.content }}</p>
          <small v-if="item.contextLabel" class="context-label">{{ item.contextLabel }}</small>
          <small>{{ deliveryState(item) }}</small>
        </div>
      </article>
    </section>
  </section>
</template>

<style scoped>
.future-page{box-sizing:border-box;display:grid;gap:13px;min-height:100vh;overflow-x:hidden;padding:0 20px calc(130px + env(safe-area-inset-bottom));background:#efe9df;color:#2b4032}.future-hero{position:relative;min-height:153px;margin:0 -20px -7px;padding:21px 24px 18px;overflow:hidden;background:linear-gradient(180deg,rgba(11,28,43,.12),rgba(17,35,50,.56)),url('../assets/goodnight/peer/peer-night-hero.png') center 44%/cover no-repeat;color:#fff}.future-hero::after{position:absolute;right:0;bottom:0;left:0;height:42px;background:linear-gradient(transparent,#efe9df);content:'';pointer-events:none}.future-hero>*{position:relative;z-index:1}.back-button{display:grid;width:30px;height:30px;min-height:30px;border:1px solid rgba(255,255,255,.28);border-radius:50%;padding:0;background:rgba(255,255,255,.08);color:#fff;place-items:center}.brand{position:absolute;top:29px;left:62px;font-size:12px}.brand span{margin-right:4px;color:#dce7ce}.moon{position:absolute;top:21px;right:25px;color:#f7d99a;font-size:28px}.future-hero h1{margin:20px 0 5px;font:600 28px/1.2 Georgia,'Noto Serif SC',serif;letter-spacing:0}.future-hero p{margin:0;color:rgba(255,255,255,.78);font-size:11px}.future-paper{position:relative;z-index:2;display:grid;gap:13px;border:1px solid rgba(79,101,73,.17);border-radius:20px;padding:17px;background:rgba(255,252,245,.97);box-shadow:0 13px 30px rgba(48,57,41,.1)}.future-paper::after{position:absolute;right:4px;bottom:93px;width:120px;height:124px;background:url('../assets/goodnight/illustrations/situation-book-lantern.png') right bottom/contain no-repeat;content:'';opacity:.42;mix-blend-mode:multiply;pointer-events:none}.future-paper>*{position:relative;z-index:1}.paper-heading{display:grid;grid-template-columns:29px minmax(0,1fr);gap:8px;align-items:start}.heading-mark{display:grid;width:26px;height:26px;border-radius:50%;background:#e8eddc;color:#597344;font-size:12px;place-items:center}.paper-heading h2,.section-label h2{margin:0;font:600 16px/1.35 Georgia,'Noto Serif SC',serif;letter-spacing:0}.paper-heading p{margin:3px 0 0;color:#858c80;font-size:10px;line-height:1.55}.letter-field{position:relative;display:block}.letter-field textarea{box-sizing:border-box;width:100%;min-height:118px;resize:none;border:1px solid rgba(86,105,74,.17);border-radius:11px;padding:12px 12px 27px;background:rgba(255,253,248,.8);color:#314135;font:13px/1.7 inherit}.letter-field textarea:focus,.context-picker select:focus,.custom-time input:focus{border-color:#66834f;outline:2px solid rgba(102,131,79,.14)}.letter-field small{position:absolute;right:10px;bottom:8px;color:#9b9b90;font-size:9px}.delivery-field,.context-field{margin:0;border:0;padding:0}.delivery-field legend,.context-field legend{margin-bottom:8px;color:#42613e;font-size:12px;font-weight:650}.delivery-field legend span,.context-field legend span{margin-right:5px}.context-field legend small{color:#969b91;font-weight:400}.time-options{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.time-options button{min-width:0;min-height:33px;border:1px solid rgba(86,105,74,.18);border-radius:999px;background:#f7f5ed;color:#657062;font:10px inherit}.time-options button.selected{border-color:#567645;background:#698949;color:#fff;box-shadow:0 5px 11px rgba(75,105,61,.16)}.delivery-note{margin:8px 0 0;color:#8b836f;font-size:10px}.custom-time{display:grid;grid-template-columns:74px minmax(0,1fr);gap:8px;align-items:center;margin-top:8px;color:#727a6e;font-size:10px}.custom-time input,.context-picker select{box-sizing:border-box;min-width:0;min-height:33px;border:1px solid rgba(86,105,74,.18);border-radius:8px;padding:5px 8px;background:#fffdf8;color:#455a45;font:10px inherit}.context-types{display:flex;flex-wrap:wrap;gap:6px}.context-types label{min-width:0}.context-types input{position:absolute;opacity:0;pointer-events:none}.context-types span{display:block;min-height:29px;border:1px solid rgba(86,105,74,.16);border-radius:999px;padding:0 10px;background:#f4f2e9;color:#667061;font-size:10px;line-height:29px}.context-types input:checked+span{border-color:#6d8957;background:#e5eddc;color:#405e39}.context-picker{display:grid;gap:5px;margin-top:8px;color:#7e8578;font-size:10px}.notice,.error-note,.state-note,.empty-note{margin:0;border-radius:9px;padding:9px 10px;font-size:11px;line-height:1.5}.notice{background:#e9f0df;color:#466641}.error-note{background:#fff0ed;color:var(--gn-danger)}.future-save{display:flex;align-items:center;justify-content:center;gap:7px;min-height:43px;border:0;border-radius:999px;background:#3f6548;color:#fff;font:13px inherit;box-shadow:0 8px 16px rgba(55,87,61,.18)}.future-save:disabled{opacity:.58}.private-note{display:flex;align-items:center;justify-content:center;gap:5px;margin:0;color:#90958c;font-size:10px}.state-note,.empty-note{background:#fffaf1;color:#747c70}.letters-section{display:grid;gap:8px}.section-label{display:flex;gap:7px;align-items:center;padding:2px 2px}.section-label span{color:#6b8654}.saved-letter{display:grid;grid-template-columns:34px minmax(0,1fr);gap:9px;border:1px solid rgba(79,101,73,.15);border-radius:13px;padding:11px;background:rgba(255,253,248,.88);box-shadow:0 8px 17px rgba(50,59,43,.06)}.saved-letter.delivered{background:#f4f7ee}.letter-icon{display:grid;width:31px;height:31px;border-radius:50%;background:#edf1e3;color:#61804d;font-size:14px;place-items:center}.saved-letter p{display:-webkit-box;margin:0;color:#39493c;font-size:12px;line-height:1.6;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}.saved-letter small{display:block;margin-top:5px;color:#8e9388;font-size:10px}.saved-letter .context-label{overflow:hidden;color:#597348;text-overflow:ellipsis;white-space:nowrap}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}@media (max-width:374px){.future-page{padding-right:14px;padding-left:14px}.future-hero{margin-right:-14px;margin-left:-14px}.time-options{gap:4px}.time-options button{font-size:9px}.context-types span{padding:0 8px}}
</style>
