<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import AppIcon from '../components/icons/AppIcon.vue';
import LoadErrorBanner from '../components/LoadErrorBanner.vue';

const route = useRoute();
const router = useRouter();
const journeyId = computed(() => String(route.query.journeyId ?? ''));
const busy = ref(false);
const error = ref('');
const supportPlan = ref<Record<string, unknown> | null>(null);

// P0-A: Regional Safety Resources
const REGION_STORAGE_KEY = 'goodnight_safety_region';
const selectedRegion = ref<string>('UNKNOWN');
const showLocalNumbers = ref(false);
const copyFeedback = ref('');

interface ResourceItem {
  id: string;
  name: string;
  number: string;
  type: string;
  description: string;
  verified: boolean;
  action: string;
  url?: string;
}

const supportedRegions = [
  { code: 'CN', name: '中国大陆 (Mainland China)' },
  { code: 'HK', name: '中国香港 (Hong Kong)' },
  { code: 'MO', name: '中国澳门 (Macau)' },
  { code: 'TW', name: '中国台湾 (Taiwan)' },
  { code: 'OTHER', name: '其他国家/海外 (Other Regions)' },
];

const fallbackResources: Record<string, ResourceItem[]> = {
  CN: [
    { id: 'cn-120', name: '紧急医疗救护 120', number: '120', type: 'emergency', description: '全国统一院前医疗急救呼叫专线，适用于生命健康即时危险', verified: true, action: 'tel' },
    { id: 'cn-12356', name: '全国心理援助热线 12356', number: '12356', type: 'hotline', description: '国家卫生健康委统一心理援助热线（24小时在线）', verified: true, action: 'tel' },
    { id: 'cn-110', name: '紧急治安报警 110', number: '110', type: 'emergency', description: '全国公安统一紧急报警电话', verified: true, action: 'tel' },
  ],
  HK: [
    { id: 'hk-999', name: '香港紧急求助 999', number: '999', type: 'emergency', description: '香港紧急报警、火警及救护服务', verified: true, action: 'tel' },
    { id: 'hk-samaritans', name: '香港撒玛利亚防止自杀会热线', number: '23892222', type: 'hotline', description: '24小时情绪支援及预防自杀热线', verified: true, action: 'tel' },
    { id: 'hk-lifeline', name: '生命热线 2382 0000', number: '23820000', type: 'hotline', description: '24小时预防自杀热线，提供无条件倾听与支持', verified: true, action: 'tel' },
  ],
  MO: [
    { id: 'mo-999', name: '澳门紧急求助 999', number: '999', type: 'emergency', description: '澳门治安警察局及消防局紧急求助专线', verified: true, action: 'tel' },
    { id: 'mo-caritas', name: '澳门明爱生命热线', number: '28525222', type: 'hotline', description: '24小时情绪困扰辅导及自杀防治热线', verified: true, action: 'tel' },
  ],
  TW: [
    { id: 'tw-119', name: '紧急救护与消防 119', number: '119', type: 'emergency', description: '紧急伤病救护与火警专线', verified: true, action: 'tel' },
    { id: 'tw-1925', name: '安心专线 1925', number: '1925', type: 'hotline', description: '台湾卫生福利部24小时免付费心理咨询专线', verified: true, action: 'tel' },
    { id: 'tw-1995', name: '生命线 1995', number: '1995', type: 'hotline', description: '24小时协谈辅导专线', verified: true, action: 'tel' },
  ],
  OTHER: [
    { id: 'intl-befrienders', name: 'Befrienders Worldwide 国际情绪支持', number: 'https://www.befrienders.org', type: 'hotline', description: '全球预防自杀支持网络，覆盖全球多国自杀危机干预中心列表', verified: true, action: 'link', url: 'https://www.befrienders.org' },
    { id: 'intl-findahelpline', name: 'Find A Helpline 全球危机热线索引', number: 'https://findahelpline.com', type: 'hotline', description: '免费、机密的全球在线心理危机求助热线索引与即时求助向导', verified: true, action: 'link', url: 'https://findahelpline.com' },
  ],
};

const regionalResources = ref<ResourceItem[]>([]);
const isOffline = ref(false);

async function loadRegionalResources(region: string) {
  if (region === 'UNKNOWN') {
    regionalResources.value = [];
    return;
  }
  try {
    const res = await api.get<{ resources: ResourceItem[] }>(`/api/v1/safety/resources?region=${encodeURIComponent(region)}`);
    regionalResources.value = res.resources && res.resources.length > 0 ? res.resources : (fallbackResources[region] ?? []);
    isOffline.value = false;
  } catch {
    regionalResources.value = fallbackResources[region] ?? [];
    isOffline.value = true;
  }
}

function selectRegion(code: string) {
  selectedRegion.value = code;
  try {
    localStorage.setItem(REGION_STORAGE_KEY, code);
  } catch {
    // ignore
  }
  if (code === 'CN') {
    showLocalNumbers.value = true;
  }
  void loadRegionalResources(code);
}

async function copyNumber(text: string) {
  copyFeedback.value = '';
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      copyFeedback.value = `已复制「${text}」到剪贴板`;
    } else {
      copyFeedback.value = `已复制「${text}」`;
    }
  } catch {
    copyFeedback.value = `请手动选择「${text}」复制`;
  }
  setTimeout(() => {
    if (copyFeedback.value) copyFeedback.value = '';
  }, 2500);
}

const savedSupport = computed(() => {
  const plan = supportPlan.value ?? {};
  const first = (key: string) => (Array.isArray(plan[key]) ? String((plan[key] as unknown[])[0] ?? '') : '');
  return [
    first('safePeople') ? `联系：${first('safePeople')}` : '',
    first('places') ? `去：${first('places')}` : '',
    first('smallActions') ? `先做：${first('smallActions')}` : '',
  ].filter(Boolean);
});

onMounted(async () => {
  try {
    const savedRegion = localStorage.getItem(REGION_STORAGE_KEY);
    if (savedRegion && savedRegion in fallbackResources) {
      selectedRegion.value = savedRegion;
      if (savedRegion === 'CN') showLocalNumbers.value = true;
      await loadRegionalResources(savedRegion);
    }
  } catch {
    // ignore
  }
  try {
    supportPlan.value =
      (await api.get<{ item?: { plan?: Record<string, unknown> } }>('/api/v1/me/support-plan')).item?.plan ?? null;
  } catch {
    supportPlan.value = null;
  }
});

async function stayHere() {
  if (busy.value) return;
  if (!journeyId.value) {
    await router.push('/pages/tonight/index');
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    await api.post(`/api/v1/journeys/${encodeURIComponent(journeyId.value)}/safety/acknowledge`, {});
    await router.push(`/pages/journey/detail?id=${encodeURIComponent(journeyId.value)}&mode=stabilize`);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '当前安全状态没有保存';
  } finally {
    busy.value = false;
  }
}

const steps = [
  { n: '1', title: '去一个有人在的地方', body: '去一个能让你感到安全的地方。' },
  { n: '2', title: '把危险物品暂时拿远一点', body: '先把可能伤害自己的物品放到够不着的地方。' },
  { n: '3', title: '只撑过接下来的 10 分钟', body: '先只照顾眼前的十分钟，不要求自己解决全部。' },
];
</script>

<template>
  <section class="goodnight-page safety-v2" data-testid="safety-support">
    <header class="safety-header">
      <button class="back-btn" data-testid="safety-back" type="button" aria-label="返回" @click="router.back()">‹</button>
      <h1>安全支持</h1>
    </header>

    <section class="danger-block">
      <h2>如果你现在有立即危险</h2>
      <p>优先联系当地紧急服务，或请身边可信任的人陪同。不要等待应用中的消息。</p>
      
      <!-- Region Selector Strip -->
      <div class="region-selector-box" data-testid="safety-region-selector">
        <label class="region-label">选择你所在的国家/地区：</label>
        <div class="region-chips">
          <button
            v-for="reg in supportedRegions"
            :key="reg.code"
            type="button"
            class="region-chip"
            :class="{ active: selectedRegion === reg.code }"
            :data-testid="'safety-region-' + reg.code.toLowerCase()"
            @click="selectRegion(reg.code)"
          >
            {{ reg.name.split(' ')[0] }}
          </button>
        </div>
      </div>

      <!-- If region is UNKNOWN -->
      <div v-if="selectedRegion === 'UNKNOWN'" class="unknown-region-card" data-testid="safety-unknown-guidance">
        <p class="unknown-title">尚未选择地区 · 通用紧急避险指引</p>
        <ul class="unknown-list">
          <li><strong>锁屏紧急呼叫（Emergency SOS）：</strong>智能手机连续快速按电源键 5 次，可自动呼叫当地法定紧急号码并发送定位。</li>
          <li><strong>前往安全现实场所：</strong>若感到无法自我控制，请立即前往身边最近的医院急诊室、警务室，或移步至公共明亮场所。</li>
          <li><strong>联系身边信任的人：</strong>请使用下方的“发求助卡给信任的人”，让现实中的朋友或家人陪同。</li>
        </ul>
        <button
          class="danger-primary"
          data-testid="safety-emergency-medical"
          type="button"
          @click="showLocalNumbers = !showLocalNumbers; if (showLocalNumbers && selectedRegion === 'UNKNOWN') selectRegion('CN');"
        >
          <AppIcon name="heart" />
          <span>查看中国大陆热线方式</span>
        </button>
      </div>

      <!-- If region is selected, show regional resources -->
      <div v-else class="regional-resource-list" data-testid="safety-regional-resources">
        <div class="region-current-header">
          <span>当前地区：{{ supportedRegions.find(r => r.code === selectedRegion)?.name }}</span>
          <span v-if="isOffline" class="offline-badge">离线保底模式</span>
        </div>
        <div v-for="res in regionalResources" :key="res.id" class="resource-card">
          <div class="res-info">
            <div class="res-name-row">
              <strong class="res-name">{{ res.name }}</strong>
              <span v-if="res.verified" class="verified-badge">官方核实</span>
            </div>
            <p class="res-desc">{{ res.description }}</p>
            <div class="res-num-row">
              <span class="res-number">{{ res.number }}</span>
              <button
                v-if="res.action === 'tel'"
                type="button"
                class="copy-btn"
                :data-testid="'copy-resource-' + res.id"
                @click="copyNumber(res.number)"
              >
                复制
              </button>
            </div>
          </div>
          <div class="res-action">
            <a
              v-if="res.action === 'tel'"
              :href="'tel:' + res.number"
              class="action-btn-call"
              :data-testid="'dial-' + res.id"
            >
              拨打
            </a>
            <a
              v-else-if="res.action === 'link'"
              :href="res.url"
              target="_blank"
              rel="noreferrer"
              class="action-btn-link"
              :data-testid="'link-' + res.id"
            >
              访问
            </a>
          </div>
        </div>
      </div>

      <!-- Mainland China specific emergency contacts block -->
      <div v-if="showLocalNumbers || selectedRegion === 'CN'" class="local-numbers" data-testid="safety-local-numbers">
        <p class="local-note">中国大陆法定求助电话：</p>
        <div class="danger-secondary-row">
          <a class="danger-secondary" data-testid="safety-emergency" href="tel:120">
            <AppIcon name="people" />
            <span>紧急医疗求助 120</span>
          </a>
          <button type="button" class="inline-copy-btn" @click="copyNumber('120')">复制 120</button>
        </div>
        <div class="danger-secondary-row">
          <a class="danger-secondary" data-testid="safety-emergency-hotline" href="tel:12356">
            <AppIcon name="people" />
            <span>心理援助热线 12356</span>
          </a>
          <button type="button" class="inline-copy-btn" @click="copyNumber('12356')">复制 12356</button>
        </div>
        <p class="local-note">12356 为国家卫生健康委统一心理援助热线；110、120 为紧急求助电话。</p>
      </div>

      <div v-if="copyFeedback" class="copy-toast" role="alert">{{ copyFeedback }}</div>
    </section>

    <section class="steps-block">
      <h2>现在可以先做的事</h2>
      <ul>
        <li v-for="step in steps" :key="step.n">
          <span class="step-n" aria-hidden="true">{{ step.n }}</span>
          <div>
            <strong>{{ step.title }}</strong>
            <small>{{ step.body }}</small>
          </div>
        </li>
      </ul>
    </section>

    <section class="support-actions">
      <button
        data-testid="safety-handoff"
        type="button"
        @click="router.push(`/pages/reality-handoff/index${journeyId ? `?journeyId=${encodeURIComponent(journeyId)}` : ''}`)"
      >
        <span class="action-icon"><AppIcon name="message" /></span>
        <div><strong>发求助卡给信任的人</strong><small>让他们知道你现在需要支持</small></div>
        <span class="row-chevron" aria-hidden="true">›</span>
      </button>
      <button data-testid="safety-stay" type="button" :disabled="busy" @click="stayHere">
        <span class="action-icon"><AppIcon name="leaf" /></span>
        <div><strong>我暂时安全，继续留在这里</strong><small>先陪我待一会儿，再慢慢看接下来的事</small></div>
        <span class="row-chevron" aria-hidden="true">›</span>
      </button>
    </section>

    <section v-if="savedSupport.length" class="saved-plan" data-testid="safety-saved-support-plan">
      <div class="saved-head">
        <strong>你提前为自己留过的预案</strong>
        <button type="button" @click="router.push('/pages/support-plan/index')">查看全部</button>
      </div>
      <p class="saved-note">这里显示你提前留下的预案。</p>
      <ul>
        <li v-for="item in savedSupport" :key="item">{{ item }}</li>
      </ul>
    </section>

    <p class="source-note">
      这不是医疗或紧急救援服务。风险情况下优先使用现实中的帮助。<a
        href="https://www.nhc.gov.cn/yzygj/c100068/202412/49a1a65386cd4be582d4702fd0926ee8.shtml"
        target="_blank"
        rel="noreferrer"
      >查看官方说明</a>
    </p>

    <LoadErrorBanner :message="error" />
  </section>
</template>

<style scoped>
.safety-v2 {
  padding-bottom: 40px;
}

.safety-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0 14px;
  border-bottom: 1px solid var(--gn-divider, #e8ebef);
}

.safety-header button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-left: -10px;
  border: 0;
  background: transparent;
  color: var(--gn-ink, #242a32);
  cursor: pointer;
}

.safety-header h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--gn-ink, #242a32);
}

.danger-block {
  margin-top: 18px;
  padding: 16px 14px;
  border-radius: 12px;
  background: #fdf3f2;
  border: 1px solid #f6cfcc;
}

.danger-block h2 {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 600;
  color: #a42c2c;
}

.danger-block p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: #4a2828;
}

.region-selector-box {
  margin-top: 14px;
  padding: 10px 12px;
  background: #ffffff;
  border-radius: 8px;
  border: 1px solid #fae2e0;
}

.region-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #7a3a3a;
  margin-bottom: 8px;
}

.region-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.region-chip {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #e0c8c6;
  background: #fdf8f8;
  color: #4a2828;
  font-size: 12px;
  cursor: pointer;
}

.region-chip.active {
  background: #a42c2c;
  color: #ffffff;
  border-color: #a42c2c;
  font-weight: 600;
}

.unknown-region-card {
  margin-top: 12px;
  padding: 12px;
  background: #ffffff;
  border-radius: 8px;
  border: 1px solid #fae2e0;
}

.unknown-title {
  font-size: 13px;
  font-weight: 600;
  color: #a42c2c;
  margin-bottom: 8px !important;
}

.unknown-list {
  margin: 0 0 12px;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.6;
  color: #4a2828;
}

.unknown-list li {
  margin-bottom: 6px;
}

.regional-resource-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.region-current-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: #7a3a3a;
  padding: 2px 4px;
}

.offline-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #f0e6e6;
  color: #7a3a3a;
}

.resource-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #ffffff;
  border-radius: 8px;
  border: 1px solid #f6cfcc;
  gap: 10px;
}

.res-info {
  flex: 1;
  min-width: 0;
}

.res-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.res-name {
  font-size: 14px;
  font-weight: 600;
  color: #242a32;
}

.verified-badge {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 4px;
  background: #eaf4ee;
  color: #275f56;
}

.res-desc {
  margin: 2px 0 4px !important;
  font-size: 11px;
  color: #757d87;
  line-height: 1.3;
}

.res-num-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.res-number {
  font-size: 13px;
  font-weight: 600;
  color: #a42c2c;
  word-break: break-all;
}

.copy-btn,
.inline-copy-btn {
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid #dcdfe3;
  background: #f7f8fa;
  font-size: 11px;
  color: #4a525d;
  cursor: pointer;
}

.res-action {
  flex-shrink: 0;
}

.action-btn-call,
.action-btn-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 14px;
  border-radius: 6px;
  background: #a42c2c;
  color: #ffffff !important;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.action-btn-link {
  background: #275f56;
}

.danger-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  margin-top: 10px;
  border: 0;
  border-radius: 8px;
  background: #a42c2c;
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.danger-secondary-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.danger-secondary {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid #f2bcba;
  border-radius: 8px;
  background: #ffffff;
  color: #a42c2c;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.local-numbers {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed #f6cfcc;
}

.local-note {
  margin: 6px 0 !important;
  font-size: 11px;
  color: #7a3a3a;
}

.copy-toast {
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: #242a32;
  color: #ffffff;
  font-size: 12px;
  text-align: center;
}

.steps-block {
  margin-top: 24px;
}

.steps-block h2 {
  margin: 0 0 12px;
  font-size: 16px;
  font-weight: 600;
  color: var(--gn-ink, #242a32);
}

.steps-block ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.steps-block li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.step-n {
  flex: 0 0 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--gn-green-light, #eaf4ee);
  color: var(--gn-green, #275f56);
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.steps-block li strong {
  display: block;
  font-size: 14px;
  color: var(--gn-ink, #242a32);
}

.steps-block li small {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--gn-subtext, #757d87);
  line-height: 1.4;
}

.support-actions {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.support-actions button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 54px;
  padding: 12px;
  border: 1px solid var(--gn-divider, #e8ebef);
  border-radius: 12px;
  background: #ffffff;
  text-align: left;
  cursor: pointer;
}

.support-actions .action-icon {
  flex: 0 0 32px;
  height: 32px;
  border-radius: 8px;
  background: #f7f8fa;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--gn-ink, #242a32);
}

.support-actions button div {
  flex: 1;
}

.support-actions button strong {
  display: block;
  font-size: 14px;
  color: var(--gn-ink, #242a32);
}

.support-actions button small {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--gn-subtext, #757d87);
}

.row-chevron {
  color: #aab0b8;
  font-size: 18px;
}

.saved-plan {
  margin-top: 20px;
  padding: 14px;
  border-radius: 12px;
  background: #f7f8fa;
}

.saved-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.saved-head strong {
  font-size: 13px;
  color: var(--gn-ink, #242a32);
}

.saved-head button {
  border: 0;
  background: transparent;
  color: var(--gn-green, #275f56);
  font-size: 12px;
  cursor: pointer;
}

.saved-note {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--gn-subtext, #757d87);
}

.saved-plan ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.saved-plan li {
  font-size: 13px;
  color: var(--gn-ink, #242a32);
}

.source-note {
  margin-top: 24px;
  font-size: 11px;
  color: var(--gn-subtext, #757d87);
  line-height: 1.5;
}

.source-note a {
  color: var(--gn-green, #275f56);
  margin-left: 4px;
}
</style>
