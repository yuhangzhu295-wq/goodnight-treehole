<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import AppIcon from '../components/icons/AppIcon.vue';

type PeerExperience = {
  id: string;
  title: string;
  domain: string;
  subDomain?: string;
  stage: string;
  tags: string[];
  createdAt: string;
  graduated: boolean;
  laterRecordCount: number;
  content?: string;
  laterSummary?: Record<string, unknown>;
};

type PeerMatch = {
  id: string;
  journeyId: string;
  status: string;
  reasons: string[];
  experience?: PeerExperience;
};

type PeerNetwork = {
  privacyEnabled: boolean;
  matches: PeerMatch[];
  experiences: PeerExperience[];
  limited: boolean;
};

type PeerRequest = {
  id: string;
  journeyId: string;
  status: string;
  requestReason?: string;
  requestQuestion?: string;
  createdAt: string;
  experience?: PeerExperience;
};

const router = useRouter();
const item = ref<PeerNetwork | null>(null);
const requests = ref<PeerRequest[]>([]);
const loading = ref(true);
const loadingRequests = ref(false);
const error = ref('');
const enabling = ref(false);
const currentTab = ref<'recommended' | 'latest' | 'requests'>('recommended');

// Deduplicate matches to ensure no duplicate cards appear
const uniqueMatches = computed(() => {
  const seen = new Set<string>();
  const list: PeerMatch[] = [];
  for (const match of item.value?.matches ?? []) {
    const expId = match.experience?.id ?? match.id;
    if (!seen.has(expId)) {
      seen.add(expId);
      list.push(match);
    }
  }
  return list;
});

// Latest experiences sorted by createdAt descending
const latestExperiences = computed(() => {
  const matchedIds = new Set(uniqueMatches.value.map((m) => m.experience?.id).filter(Boolean));
  return [...(item.value?.experiences ?? [])]
    .filter((exp) => !matchedIds.has(exp.id))
    .sort((a, b) => Date.parse(b.createdAt || '0') - Date.parse(a.createdAt || '0'));
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    item.value = (await api.get<{ item: PeerNetwork }>('/api/v1/peers')).item;
  } catch (cause: any) {
    error.value = cause?.message ?? '同路经历加载失败';
  } finally {
    loading.value = false;
  }
}

async function loadRequests() {
  loadingRequests.value = true;
  try {
    const res = await api.get<{ items: PeerRequest[] }>('/api/v1/peer-requests');
    requests.value = res.items ?? [];
  } catch {
    requests.value = [];
  } finally {
    loadingRequests.value = false;
  }
}

function switchTab(tab: 'recommended' | 'latest' | 'requests') {
  currentTab.value = tab;
  if (tab === 'requests' && requests.value.length === 0) {
    void loadRequests();
  }
}

async function enable() {
  enabling.value = true;
  try {
    await api.patch('/api/v1/me/privacy', {
      allowPeerMatching: true,
      allowAnonymousExperienceStats: true,
    });
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '隐私设置更新失败';
  } finally {
    enabling.value = false;
  }
}

function openMatch(match: PeerMatch) {
  if (match.status === 'requested' || match.status === 'connected') {
    void router.push(`/pages/peer/wait?matchId=${encodeURIComponent(match.id)}`);
    return;
  }
  const experienceId = match.experience?.id;
  if (experienceId) {
    void router.push(`/pages/peer/detail?id=${encodeURIComponent(experienceId)}&matchId=${encodeURIComponent(match.id)}`);
  }
}

function openExperience(experience: PeerExperience) {
  void router.push(`/pages/peer/detail?id=${encodeURIComponent(experience.id)}`);
}

function openRequest(req: PeerRequest) {
  void router.push(`/pages/peer/wait?matchId=${encodeURIComponent(req.id)}`);
}

function ago(createdAt: string) {
  if (!createdAt) return '近期留下';
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 86_400_000));
  if (days < 1) return '今天留下';
  if (days === 1) return '昨天留下';
  if (days < 30) return `${days} 天前留下`;
  return '较早留下';
}

function formatStatus(status: string) {
  switch (status) {
    case 'requested':
      return '等待回应';
    case 'connected':
      return '已连接';
    case 'declined':
      return '已婉拒';
    case 'blocked':
      return '已关闭';
    default:
      return '查看后来记录';
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="peer-v2">
    <!-- Top Header -->
    <header class="peer-header">
      <div class="header-left">
        <h1 class="header-title">同路人</h1>
      </div>
      <div class="header-right">
        <button
          class="icon-button"
          aria-label="刷新"
          type="button"
          @click="load"
        >
          <AppIcon name="refresh" :size="20" />
        </button>
      </div>
    </header>

    <!-- Segmented Tab Bar -->
    <nav class="segment-bar" role="tablist" aria-label="同路栏目">
      <button
        type="button"
        class="segment-item"
        :class="{ active: currentTab === 'recommended' }"
        role="tab"
        :aria-selected="currentTab === 'recommended'"
        @click="switchTab('recommended')"
      >
        推荐
      </button>
      <button
        type="button"
        class="segment-item"
        :class="{ active: currentTab === 'latest' }"
        role="tab"
        :aria-selected="currentTab === 'latest'"
        @click="switchTab('latest')"
      >
        最新
      </button>
      <button
        type="button"
        class="segment-item"
        :class="{ active: currentTab === 'requests' }"
        role="tab"
        :aria-selected="currentTab === 'requests'"
        @click="switchTab('requests')"
      >
        我的请求
      </button>
    </nav>

    <div v-if="error" class="error-banner" role="alert">{{ error }}</div>

    <div v-if="loading" class="state-message">
      正在寻找走过相似道路的记录…
    </div>

    <!-- Privacy Gate Notice -->
    <section v-else-if="!item || !item.privacyEnabled" class="privacy-card">
      <div class="privacy-badge">隐私保护</div>
      <h2 class="privacy-title">同路人经历匹配未开启</h2>
      <p class="privacy-desc">开启后，系统仅基于匿名经历匹配相似历程，不会公开任何个人身份。</p>

      <div class="privacy-scope">
        <div class="scope-row">
          <strong>公开范围</strong>
          <span>经你确认的匿名经历文本与阶段总结</span>
        </div>
        <div class="scope-row">
          <strong>保护范围</strong>
          <span>隐藏昵称、联系方式、设备与具体位置</span>
        </div>
      </div>

      <div class="privacy-buttons">
        <button
          class="btn-primary"
          :disabled="enabling"
          type="button"
          @click="enable"
        >
          {{ enabling ? '正在确认…' : '允许匿名寻找同路经历' }}
        </button>
        <button
          class="btn-secondary"
          data-testid="peer-privacy-boundary"
          type="button"
          @click="router.push('/pages/settings/privacy')"
        >
          查看隐私边界设置
        </button>
      </div>
    </section>

    <!-- Tab 1: Recommended Stories -->
    <main v-else-if="currentTab === 'recommended'" class="peer-feed">
      <div class="feed-intro">只展示对方愿意公开的匿名经历</div>

      <div v-if="uniqueMatches.length === 0" class="empty-feed">
        <div class="empty-icon">◎</div>
        <h3 class="empty-title">暂时没有匹配的经历</h3>
        <p class="empty-desc">可以稍后再来看看，或者调整愿意分享的范围。</p>
        <button
          class="empty-btn"
          data-testid="peer-privacy-boundary"
          type="button"
          @click="router.push('/pages/settings/privacy')"
        >
          查看我的分享设置
        </button>
      </div>

      <div v-else class="story-list">
        <article
          v-for="match in uniqueMatches"
          :key="match.id"
          class="story-card"
        >
          <div class="author-row">
            <div class="avatar-circle">
              {{ (match.experience?.domain || '同')[0] }}
            </div>
            <div class="author-info">
              <span class="author-name">匿名同行者</span>
              <span class="author-meta">{{ match.experience?.domain || '匿名经历' }} · {{ ago(match.experience?.createdAt || '') }}</span>
            </div>
            <span v-if="match.status === 'connected'" class="status-pill connected">已连接</span>
            <span v-else-if="match.status === 'requested'" class="status-pill pending">等待回应</span>
          </div>

          <h3 class="story-title">{{ match.experience?.title || '一段匿名经历' }}</h3>

          <p v-if="match.experience?.content" class="story-excerpt">
            {{ match.experience.content }}
          </p>

          <div v-if="match.reasons && match.reasons.length > 0" class="reason-strip">
            <span class="reason-tag">推荐参考</span>
            <span class="reason-text">{{ match.reasons.join(' · ') }}</span>
          </div>

          <div class="story-bottom">
            <span class="progress-meta">
              {{ match.experience?.laterRecordCount ? `已记录 ${match.experience.laterRecordCount} 条后续` : match.experience?.graduated ? '阶段已完成' : '持续记录中' }}
            </span>
            <button
              class="action-link"
              type="button"
              @click="openMatch(match)"
            >
              {{ formatStatus(match.status) }} ›
            </button>
          </div>
        </article>
      </div>
    </main>

    <!-- Tab 2: Latest Experiences -->
    <main v-else-if="currentTab === 'latest'" class="peer-feed">
      <div class="feed-intro">按时间顺序浏览最新的匿名经历</div>

      <div v-if="latestExperiences.length === 0" class="empty-feed">
        <div class="empty-icon">◎</div>
        <h3 class="empty-title">暂时没有更多最新经历</h3>
        <p class="empty-desc">后续有其他同行者分享后将显示在这里。</p>
      </div>

      <div v-else class="story-list">
        <article
          v-for="exp in latestExperiences"
          :key="exp.id"
          class="story-card"
        >
          <div class="author-row">
            <div class="avatar-circle">
              {{ (exp.domain || '同')[0] }}
            </div>
            <div class="author-info">
              <span class="author-name">匿名同行者</span>
              <span class="author-meta">{{ exp.domain }} · {{ ago(exp.createdAt) }}</span>
            </div>
          </div>

          <h3 class="story-title">{{ exp.title }}</h3>

          <p v-if="exp.content" class="story-excerpt">
            {{ exp.content }}
          </p>

          <div class="story-bottom">
            <span class="progress-meta">
              {{ exp.laterRecordCount ? `已记录 ${exp.laterRecordCount} 条后续` : exp.graduated ? '阶段已完成' : '持续记录中' }}
            </span>
            <button
              class="action-link"
              type="button"
              @click="openExperience(exp)"
            >
              查看后来记录 ›
            </button>
          </div>
        </article>
      </div>
    </main>

    <!-- Tab 3: My Requests -->
    <main v-else class="peer-feed">
      <div class="feed-intro">你发起的同路询问与回应状态</div>

      <div v-if="loadingRequests" class="state-message">
        正在读取请求记录…
      </div>

      <div v-else-if="requests.length === 0" class="empty-feed">
        <div class="empty-icon">✉</div>
        <h3 class="empty-title">暂无发出的同路请求</h3>
        <p class="empty-desc">你可以向走过相似阶段的同行者询问应对体会。</p>
        <button
          class="empty-btn"
          type="button"
          @click="switchTab('recommended')"
        >
          去看看推荐经历
        </button>
      </div>

      <div v-else class="story-list">
        <article
          v-for="req in requests"
          :key="req.id"
          class="story-card"
          @click="openRequest(req)"
        >
          <div class="author-row">
            <div class="avatar-circle">
              {{ (req.experience?.domain || '问')[0] }}
            </div>
            <div class="author-info">
              <span class="author-name">向同行者询问</span>
              <span class="author-meta">{{ req.experience?.domain || '匿名' }} · {{ ago(req.createdAt) }}</span>
            </div>
            <span
              class="status-pill"
              :class="{ connected: req.status === 'connected', pending: req.status === 'requested' }"
            >
              {{ req.status === 'connected' ? '已同意' : req.status === 'declined' ? '已婉拒' : '等待回应' }}
            </span>
          </div>

          <h3 class="story-title">{{ req.experience?.title || '同路申请' }}</h3>
          <p v-if="req.requestReason" class="story-excerpt">
            理由：{{ req.requestReason }}
          </p>
          <p v-if="req.requestQuestion" class="story-excerpt">
            问题：{{ req.requestQuestion }}
          </p>

          <div class="story-bottom">
            <span class="progress-meta">点击查看等待与沟通详情</span>
            <span class="action-link">查看详情 ›</span>
          </div>
        </article>
      </div>
    </main>
  </div>
</template>

<style scoped>
.peer-v2 {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  min-height: 100vh;
  padding: 0 0 calc(96px + env(safe-area-inset-bottom));
  background: #FFFFFF;
  color: #242A32;
  font-family: var(--gn-font-body);
}

.peer-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 20px;
  background: #FFFFFF;
  border-bottom: 1px solid #E8EBEF;
}

.header-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #242A32;
  letter-spacing: -0.3px;
}

.icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  min-height: 48px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #39454C;
  cursor: pointer;
}

.segment-bar {
  display: flex;
  align-items: center;
  height: 44px;
  padding: 0 20px;
  border-bottom: 1px solid #E8EBEF;
  gap: 28px;
  background: #FFFFFF;
}

.segment-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  min-height: 44px;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: #757D87;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s ease;
}

.segment-item.active {
  color: #275F56;
  font-weight: 600;
}

.segment-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: #275F56;
  border-radius: 2px;
}

.error-banner {
  margin: 12px 20px 0;
  padding: 10px 14px;
  border-radius: 8px;
  background: #FEF2F0;
  border: 1px solid #F6DCDA;
  color: #BD4545;
  font-size: 13px;
}

.state-message {
  padding: 40px 20px;
  color: #757D87;
  font-size: 13px;
  text-align: center;
}

.privacy-card {
  margin: 20px;
  padding: 20px;
  border: 1px solid #E8EBEF;
  border-radius: 12px;
  background: #FFFFFF;
}

.privacy-badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 6px;
  background: #EAF4EE;
  color: #275F56;
  font-size: 11px;
  font-weight: 600;
}

.privacy-title {
  margin: 10px 0 6px;
  font-size: 17px;
  font-weight: 700;
  color: #242A32;
}

.privacy-desc {
  margin: 0;
  color: #757D87;
  font-size: 13px;
  line-height: 1.5;
}

.privacy-scope {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 16px 0;
  padding: 12px 14px;
  border-radius: 8px;
  background: #F7F8FA;
}

.scope-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.scope-row strong {
  font-size: 12px;
  color: #242A32;
}

.scope-row span {
  font-size: 12px;
  color: #757D87;
  line-height: 1.4;
}

.privacy-buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
}

.btn-primary {
  min-height: 48px;
  border: 0;
  border-radius: 10px;
  background: #275F56;
  color: #FFFFFF;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.6;
}

.btn-secondary {
  min-height: 48px;
  border: 1px solid #DCE1E5;
  border-radius: 10px;
  background: #FFFFFF;
  color: #242A32;
  font-size: 13px;
  cursor: pointer;
}

.peer-feed {
  padding: 12px 20px 0;
}

.feed-intro {
  margin-bottom: 12px;
  color: #757D87;
  font-size: 12px;
}

.empty-feed {
  margin-top: 60px;
  text-align: center;
  padding: 0 20px;
}

.empty-icon {
  font-size: 36px;
  color: #92A9A0;
}

.empty-title {
  margin: 16px 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: #242A32;
}

.empty-desc {
  margin: 0;
  color: #757D87;
  font-size: 13px;
  line-height: 1.5;
}

.empty-btn {
  margin-top: 18px;
  min-height: 48px;
  padding: 10px 20px;
  border: 1px solid #DCE1E5;
  border-radius: 10px;
  background: #FFFFFF;
  color: #242A32;
  font-size: 13px;
  cursor: pointer;
}

.story-list {
  display: flex;
  flex-direction: column;
}

.story-card {
  padding: 16px 0;
  border-bottom: 1px solid #E8EBEF;
}

.story-card:last-child {
  border-bottom: 0;
}

.author-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 17px;
  background: #EAF4EE;
  color: #275F56;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.author-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.author-name {
  font-size: 14px;
  font-weight: 600;
  color: #242A32;
}

.author-meta {
  margin-top: 2px;
  font-size: 11px;
  color: #757D87;
}

.status-pill {
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  background: #F7F8FA;
  color: #757D87;
}

.status-pill.connected {
  background: #EAF4EE;
  color: #275F56;
}

.status-pill.pending {
  background: #FFF8EE;
  color: #947444;
}

.story-title {
  margin: 10px 0 6px;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.45;
  color: #242A32;
}

.story-excerpt {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: #58616B;
}

.reason-strip {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: #F7F8FA;
  font-size: 11px;
}

.reason-tag {
  color: #757D87;
  font-weight: 500;
  flex-shrink: 0;
}

.reason-text {
  color: #58616B;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.story-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}

.progress-meta {
  font-size: 11px;
  color: #757D87;
}

.action-link {
  min-height: 48px;
  display: inline-flex;
  align-items: center;
  padding: 8px 0;
  border: 0;
  background: transparent;
  color: #275F56;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
</style>
