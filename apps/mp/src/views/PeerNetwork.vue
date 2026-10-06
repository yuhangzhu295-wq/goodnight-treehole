<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

type PeerExperience = { id: string; title: string; domain: string; subDomain?: string; stage: string; tags: string[]; createdAt: string; graduated: boolean; laterRecordCount: number };
type PeerMatch = { id: string; journeyId: string; status: string; reasons: string[]; experience?: PeerExperience };
type PeerNetwork = { privacyEnabled: boolean; matches: PeerMatch[]; experiences: PeerExperience[]; limited: boolean };

const router = useRouter();
const item = ref<PeerNetwork | null>(null);
const loading = ref(true);
const error = ref('');
const enabling = ref(false);
const primaryMatch = computed(() => item.value?.matches[0]);
const secondaryMatches = computed(() => (item.value?.matches ?? []).slice(1, 3));
const publishedExperiences = computed(() => {
  const matchedExperienceIds = new Set((item.value?.matches ?? []).map((match) => match.experience?.id).filter(Boolean));
  return (item.value?.experiences ?? []).filter((experience) => !matchedExperienceIds.has(experience.id)).slice(0, 2);
});

async function load() {
  loading.value = true;
  try {
    item.value = (await api.get<{ item: PeerNetwork }>('/api/v1/peers')).item;
    error.value = '';
  } catch (cause: any) {
    error.value = cause?.message ?? '同路经历加载失败';
  } finally {
    loading.value = false;
  }
}

async function enable() {
  enabling.value = true;
  try {
    await api.patch('/api/v1/me/privacy', { allowPeerMatching: true, allowAnonymousExperienceStats: true });
    await load();
  } catch (cause: any) {
    error.value = cause?.message ?? '隐私设置更新失败';
  } finally {
    enabling.value = false;
  }
}

function openExperience(match: PeerMatch) {
  if (match.status === 'requested' || match.status === 'connected') {
    router.push(`/pages/peer/wait?matchId=${encodeURIComponent(match.id)}`);
    return;
  }
  const experienceId = match.experience?.id;
  if (experienceId) {
    router.push(`/pages/peer/detail?id=${encodeURIComponent(experienceId)}&matchId=${encodeURIComponent(match.id)}`);
  }
}

function openPublished(experience: PeerExperience) {
  router.push(`/pages/peer/detail?id=${encodeURIComponent(experience.id)}`);
}

function ago(createdAt: string) {
  if (!createdAt) return '近期留下';
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 86_400_000));
  return days < 1 ? '今天留下' : days < 30 ? `${days} 天前留下` : '较早留下';
}

onMounted(load);
</script>

<template>
  <section class="goodnight-page peer-network-page">
    <header class="peer-header">
      <div class="header-titles">
        <h1 class="peer-title">同路人</h1>
        <p class="peer-subtitle">浏览相似处境的匿名经历与后来进展</p>
      </div>
    </header>

    <div class="segmented-control" role="tablist" aria-label="同路内容">
      <button class="active" type="button">推荐给你</button>
      <button type="button" @click="router.push('/pages/peer/requests')">我的请求</button>
    </div>

    <p v-if="error" class="error-note" role="alert">{{ error }}</p>
    <p v-if="loading" class="state-note">正在寻找走过相似道路的记录…</p>

    <section v-else-if="!item || !item.privacyEnabled" class="privacy-panel">
      <div class="privacy-header">
        <span class="privacy-tag">隐私保护</span>
        <h2>同路人经历匹配未开启</h2>
      </div>
      <p class="privacy-desc">开启后，系统仅基于匿名经历匹配相似历程，不会公开任何个人身份。</p>
      <div class="privacy-items">
        <div class="privacy-row">
          <strong>公开范围</strong>
          <span>经你确认的匿名经历文本与阶段总结</span>
        </div>
        <div class="privacy-row">
          <strong>保护范围</strong>
          <span>隐藏昵称、联系方式、设备与具体位置</span>
        </div>
      </div>
      <div class="privacy-actions">
        <button class="btn-primary" :disabled="enabling" type="button" @click="enable">
          {{ enabling ? '正在确认…' : '允许匿名寻找同路经历' }}
        </button>
        <button
          class="btn-link"
          type="button"
          data-testid="peer-privacy-boundary"
          @click="router.push('/pages/settings/privacy')"
        >
          查看隐私边界设置
        </button>
      </div>
    </section>

    <template v-else>
      <section class="peer-section">
        <div class="section-heading">
          <h2 class="section-title">推荐经历</h2>
          <button class="refresh-btn" type="button" @click="load">换一批</button>
        </div>

        <article v-if="primaryMatch" class="peer-story-item peer-story-item--primary">
          <div class="story-identity">
            <div class="avatar-box">
              <span class="avatar-text">{{ (primaryMatch.experience?.domain || '同')[0] }}</span>
            </div>
            <div class="identity-info">
              <strong class="identity-name">匿名同行者</strong>
              <span class="identity-meta">{{ primaryMatch.experience?.domain || '匿名经历' }} · {{ ago(primaryMatch.experience?.createdAt || '') }}</span>
            </div>
            <span class="stage-pill">真实后来</span>
          </div>

          <h3 class="story-title">{{ primaryMatch.experience?.title || '一段匿名经历' }}</h3>

          <div v-if="primaryMatch.experience?.tags?.length" class="story-tags">
            <span v-for="tag in primaryMatch.experience.tags.slice(0, 3)" :key="tag">{{ tag }}</span>
          </div>

          <div v-if="primaryMatch.reasons.length" class="recommend-reason">
            <span class="reason-label">推荐参考</span>
            <span class="reason-text">{{ primaryMatch.reasons.join(' · ') }}</span>
          </div>

          <div class="story-footer">
            <span class="later-count">
              {{ primaryMatch.experience?.laterRecordCount ? `已记录 ${primaryMatch.experience.laterRecordCount} 段后来` : '已留下后来记录' }}
            </span>
            <button class="action-btn" type="button" @click="openExperience(primaryMatch)">
              {{ primaryMatch.status === 'requested' ? '等待回应' : primaryMatch.status === 'connected' ? '查看进展' : '查看后来记录' }}
            </button>
          </div>
        </article>

        <p v-else class="empty-note">暂时还没有足够接近的同路经历。后续有新记录时将自动呈现。</p>

        <article
          v-for="match in secondaryMatches"
          :key="match.id"
          class="peer-story-item peer-story-item--secondary"
          role="button"
          tabindex="0"
          @click="openExperience(match)"
        >
          <div class="story-identity">
            <div class="avatar-box avatar-box--small">
              <span class="avatar-text">{{ (match.experience?.domain || '同')[0] }}</span>
            </div>
            <div class="identity-info">
              <div class="identity-top">
                <strong class="identity-name">匿名同行者</strong>
                <span class="identity-meta">{{ match.experience?.domain || '匿名经历' }} · {{ ago(match.experience?.createdAt || '') }}</span>
              </div>
              <h3 class="secondary-title">{{ match.experience?.title || '另一段匿名经历' }}</h3>
              <p v-if="match.reasons[0]" class="secondary-reason">{{ match.reasons[0] }}</p>
            </div>
            <span class="row-arrow" aria-hidden="true">›</span>
          </div>
        </article>
      </section>

      <section v-if="publishedExperiences.length" class="peer-section">
        <div class="section-heading">
          <h2 class="section-title">其他后来记录</h2>
        </div>
        <div class="public-list">
          <button
            v-for="experience in publishedExperiences"
            :key="experience.id"
            type="button"
            class="public-row"
            @click="openPublished(experience)"
          >
            <div class="avatar-box avatar-box--small">
              <span class="avatar-text">{{ (experience.domain || '同')[0] }}</span>
            </div>
            <div class="public-body">
              <strong class="public-title">{{ experience.title }}</strong>
              <small class="public-desc">{{ experience.domain }} · {{ experience.graduated ? '阶段已完成' : '持续记录中' }}</small>
            </div>
            <span class="row-arrow" aria-hidden="true">›</span>
          </button>
        </div>
        <p v-if="item.limited" class="limit-note">已展示当前可推荐记录，后续会有新的更新。</p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.peer-network-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
  padding: 12px 16px calc(112px + env(safe-area-inset-bottom));
  background: var(--gn-bg);
  color: var(--gn-text);
  font-family: var(--gn-font-body);
}

.peer-header {
  padding: 8px 4px 4px;
}

.peer-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--gn-ink);
}

.peer-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--gn-muted);
}

.segmented-control {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.segmented-control button {
  min-height: 36px;
  border: 0;
  border-radius: var(--gn-radius-small);
  background: transparent;
  color: var(--gn-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.segmented-control button.active {
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-weight: 600;
}

.state-note,
.empty-note {
  margin: 24px 0;
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.6;
  text-align: center;
}

.error-note {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--gn-radius-card);
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
  color: var(--gn-danger);
  font-size: 13px;
}

.privacy-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.privacy-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.privacy-tag {
  align-self: flex-start;
  padding: 2px 8px;
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  font-size: 11px;
  font-weight: 600;
}

.privacy-header h2 {
  margin: 2px 0 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--gn-ink);
}

.privacy-desc {
  margin: 0;
  color: var(--gn-muted);
  font-size: 13px;
  line-height: 1.5;
}

.privacy-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
}

.privacy-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.privacy-row strong {
  font-size: 12px;
  font-weight: 600;
  color: var(--gn-ink);
}

.privacy-row span {
  font-size: 12px;
  color: var(--gn-muted);
  line-height: 1.4;
}

.privacy-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.btn-primary {
  min-height: 40px;
  border: 0;
  border-radius: var(--gn-radius-card);
  background: var(--gn-leaf);
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.6;
}

.btn-link {
  min-height: 32px;
  border: 0;
  background: transparent;
  color: var(--gn-leaf-deep);
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
}

.peer-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 2px;
}

.section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--gn-ink);
}

.refresh-btn {
  border: 0;
  background: transparent;
  color: var(--gn-leaf);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 6px;
}

.peer-story-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
}

.story-identity {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 18px;
  background: var(--gn-leaf-soft);
  color: var(--gn-leaf-deep);
  flex-shrink: 0;
}

.avatar-box--small {
  width: 32px;
  height: 32px;
  border-radius: 16px;
}

.avatar-text {
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
}

.identity-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.identity-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--gn-ink);
  line-height: 1.3;
}

.identity-meta {
  font-size: 11px;
  color: var(--gn-muted);
  line-height: 1.3;
}

.stage-pill {
  padding: 2px 7px;
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  border: 1px solid var(--gn-line);
  color: var(--gn-muted);
  font-size: 11px;
  flex-shrink: 0;
}

.story-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--gn-ink);
  line-height: 1.35;
}

.story-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.story-tags span {
  padding: 2px 8px;
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  border: 1px solid var(--gn-line);
  color: var(--gn-ink-soft);
  font-size: 11px;
}

.recommend-reason {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper-warm);
  font-size: 12px;
  line-height: 1.4;
}

.reason-label {
  color: var(--gn-muted);
  font-weight: 500;
  flex-shrink: 0;
}

.reason-text {
  color: var(--gn-ink-soft);
}

.story-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--gn-line);
}

.later-count {
  font-size: 12px;
  color: var(--gn-muted);
}

.action-btn {
  min-height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: var(--gn-radius-small);
  background: var(--gn-leaf);
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.peer-story-item--secondary {
  cursor: pointer;
  padding: 12px 14px;
}

.peer-story-item--secondary:active {
  background: var(--gn-paper-warm);
}

.identity-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.secondary-title {
  margin: 3px 0 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--gn-ink);
  line-height: 1.35;
}

.secondary-reason {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--gn-muted);
  line-height: 1.4;
}

.row-arrow {
  color: var(--gn-muted);
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
}

.public-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  overflow: hidden;
}

.public-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 0;
  border-bottom: 1px solid var(--gn-line);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.public-row:last-child {
  border-bottom: 0;
}

.public-row:active {
  background: var(--gn-paper-warm);
}

.public-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.public-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--gn-ink);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.public-desc {
  font-size: 11px;
  color: var(--gn-muted);
  margin-top: 2px;
  line-height: 1.3;
}

.limit-note {
  margin: 8px 0 0;
  color: var(--gn-muted);
  font-size: 11px;
  text-align: center;
}
</style>
