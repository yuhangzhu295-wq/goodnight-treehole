<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, resolveApiUrl } from '../api';

type PrivacySetting = {
  defaultVisibility: 'PRIVATE' | 'PUBLIC';
  allowAnonymousPublic: boolean;
  allowHumanReplies: boolean;
  allowMonthlyReportShare: boolean;
  allowPeerMatching: boolean;
  allowAnonymousExperienceStats: boolean;
  allowRecoveryData: boolean;
  allowJourneyLongTermAnalysis: boolean;
  allowLongTermMemory: boolean;
  allowAiMemoryUse: boolean;
  allowAnonymousExperienceShare: boolean;
  allowJourneyArchiveRetention: boolean;
  allowFutureSelfNotifications: boolean;
  allowDataExport: boolean;
};

type ExportAsset = {
  id?: string;
  url?: string;
  status?: string;
  mimeType?: string;
  filename?: string;
};

type DiaryExport = {
  count?: number;
  generatedAt?: string;
  asset?: ExportAsset;
  permission?: string;
};

const router = useRouter();
const setting = ref<PrivacySetting | null>(null);
const message = ref('');
const loadError = ref('');
const explain = ref(false);
const deleteConfirm = ref(false);
const saving = ref(false);
const clearingCache = ref(false);
const exporting = ref(false);
const deleting = ref(false);
const exportResult = ref<DiaryExport | null>(null);
const exportUrl = ref('');

async function load() {
  loadError.value = '';
  try {
    setting.value = (await api.get<{ item: PrivacySetting }>('/api/v1/settings/privacy')).item;
  } catch (error: any) {
    loadError.value = error?.message ?? '隐私设置加载失败，请稍后重试。';
  }
}

async function save(patch: Partial<PrivacySetting>) {
  if (!setting.value || saving.value) return;
  const previous = setting.value;
  const next = { ...previous, ...patch };
  setting.value = next;
  saving.value = true;
  message.value = '';
  try {
    setting.value = (await api.put<{ item: PrivacySetting }>('/api/v1/settings/privacy', next)).item;
    message.value = '隐私设置已安全保存';
  } catch (error: any) {
    setting.value = previous;
    message.value = error?.message ?? '保存失败，已恢复原来的设置。';
  } finally {
    saving.value = false;
  }
}

function deleteIndexedDatabase(name: string) {
  return new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function clearCache() {
  if (clearingCache.value) return;
  clearingCache.value = true;
  message.value = '';
  try {
    const storageEntries = localStorage.length + sessionStorage.length;
    localStorage.clear();
    sessionStorage.clear();

    const cacheNames = 'caches' in window ? await window.caches.keys() : [];
    await Promise.all(cacheNames.map((name) => window.caches.delete(name)));

    const databaseFactory = indexedDB as IDBFactory & {
      databases?: () => Promise<Array<{ name?: string }>>;
    };
    const databases = databaseFactory.databases ? await databaseFactory.databases() : [];
    const names = databases.flatMap((database) => database.name ? [database.name] : []);
    await Promise.all(names.map(deleteIndexedDatabase));

    message.value = `已清理本地存储 ${storageEntries} 项、缓存 ${cacheNames.length} 项${names.length ? ` 和 ${names.length} 个本地数据库` : ''}`;
  } catch (error: any) {
    message.value = error?.message ?? '部分本地缓存未能清理，请稍后重试。';
  } finally {
    clearingCache.value = false;
  }
}

function readyExportAsset(item: DiaryExport | undefined) {
  const asset = item?.asset;
  return asset?.url && asset.status === 'ready' ? asset : undefined;
}

async function exportDiaries() {
  if (exporting.value) return;
  exporting.value = true;
  exportResult.value = null;
  exportUrl.value = '';
  message.value = '';
  try {
    const result = (await api.post<{ item: DiaryExport }>('/api/v1/diaries/export')).item;
    const asset = readyExportAsset(result);
    if (!asset?.url) {
      message.value = `已请求导出 ${result?.count ?? 0} 条日记；当前服务尚未返回可下载文件。`;
      return;
    }
    exportResult.value = result;
    exportUrl.value = resolveApiUrl(asset.url);
    message.value = `导出文件已准备好，共 ${result.count ?? 0} 条日记。`;
  } catch (error: any) {
    message.value = error?.message ?? '导出请求失败，请稍后重试。';
  } finally {
    exporting.value = false;
  }
}

async function deleteMyData() {
  if (deleting.value) return;
  deleting.value = true;
  message.value = '';
  try {
    await api.delete('/api/v1/me/data');
    deleteConfirm.value = false;
    message.value = '你的日记、回信和收藏记录已经从服务端删除。';
    await load();
  } catch (error: any) {
    message.value = error?.message ?? '删除数据失败，请稍后重试。';
  } finally {
    deleting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section v-if="setting" class="goodnight-page privacy-page">
    <header class="privacy-header">
      <button
        class="back-btn"
        data-testid="front-privacy-back"
        type="button"
        aria-label="返回上一页"
        @click="router.back()"
      >
        ‹
      </button>
      <div class="header-titles">
        <h1 class="privacy-title">隐私设置</h1>
        <p class="privacy-subtitle">管理内容可见范围、AI 使用偏好与个人数据</p>
      </div>
    </header>

    <p v-if="loadError" class="privacy-error" role="alert">{{ loadError }}</p>
    <p v-if="message" class="privacy-feedback" role="status" aria-live="polite">{{ message }}</p>

    <!-- Group 1: 可见范围 -->
    <section class="group-section" aria-label="可见范围">
      <div class="section-label">可见范围</div>
      <div class="group-surface">
        <button
          class="group-row toggle-row"
          data-testid="toggle-privacy-private"
          type="button"
          :aria-pressed="setting.defaultVisibility === 'PRIVATE'"
          :disabled="saving"
          @click="save({ defaultVisibility: setting.defaultVisibility === 'PRIVATE' ? 'PUBLIC' : 'PRIVATE' })"
        >
          <span class="row-body">
            <strong class="row-title">默认仅自己可见</strong>
            <small class="row-note">写下的日记与记录默认不公开</small>
          </span>
          <span class="toggle-track" :class="{ on: setting.defaultVisibility === 'PRIVATE' }" aria-hidden="true">
            <i></i>
          </span>
        </button>

        <button
          class="group-row toggle-row"
          data-testid="toggle-privacy-anonymous"
          type="button"
          :aria-pressed="setting.allowAnonymousPublic"
          :disabled="saving"
          @click="save({ allowAnonymousPublic: !setting.allowAnonymousPublic })"
        >
          <span class="row-body">
            <strong class="row-title">匿名发布到广场</strong>
            <small class="row-note">发布到广场时隐藏昵称和头像</small>
          </span>
          <span class="toggle-track" :class="{ on: setting.allowAnonymousPublic }" aria-hidden="true">
            <i></i>
          </span>
        </button>
      </div>
    </section>

    <!-- Group 2: 分享与互动 -->
    <section class="group-section" aria-label="分享与互动">
      <div class="section-label">分享与互动</div>
      <div class="group-surface">
        <button
          class="group-row toggle-row"
          data-testid="toggle-privacy-human"
          type="button"
          :aria-pressed="setting.allowHumanReplies"
          :disabled="saving"
          @click="save({ allowHumanReplies: !setting.allowHumanReplies })"
        >
          <span class="row-body">
            <strong class="row-title">允许接收真人回应</strong>
            <small class="row-note">开启后，其他用户可以给你的记录留下回应</small>
          </span>
          <span class="toggle-track" :class="{ on: setting.allowHumanReplies }" aria-hidden="true">
            <i></i>
          </span>
        </button>

        <button
          class="group-row toggle-row"
          data-testid="toggle-privacy-peer"
          type="button"
          :aria-pressed="setting.allowPeerMatching"
          :disabled="saving"
          @click="save({ allowPeerMatching: !setting.allowPeerMatching })"
        >
          <span class="row-body">
            <strong class="row-title">允许同路匹配</strong>
            <small class="row-note">根据相似经历匹配同路旅人</small>
          </span>
          <span class="toggle-track" :class="{ on: setting.allowPeerMatching }" aria-hidden="true">
            <i></i>
          </span>
        </button>

        <button
          class="group-row toggle-row"
          data-testid="toggle-privacy-anonymous-stats"
          type="button"
          :aria-pressed="setting.allowAnonymousExperienceStats"
          :disabled="saving"
          @click="save({ allowAnonymousExperienceStats: !setting.allowAnonymousExperienceStats })"
        >
          <span class="row-body">
            <strong class="row-title">允许匿名经历统计</strong>
            <small class="row-note">参与去标识化的经历统计分析</small>
          </span>
          <span class="toggle-track" :class="{ on: setting.allowAnonymousExperienceStats }" aria-hidden="true">
            <i></i>
          </span>
        </button>

        <button
          class="group-row toggle-row"
          data-testid="toggle-privacy-report-share"
          type="button"
          :aria-pressed="setting.allowMonthlyReportShare"
          :disabled="saving"
          @click="save({ allowMonthlyReportShare: !setting.allowMonthlyReportShare })"
        >
          <span class="row-body">
            <strong class="row-title">允许生成月报分享图</strong>
            <small class="row-note">开启后可把月度记录生成分享图片</small>
          </span>
          <span class="toggle-track" :class="{ on: setting.allowMonthlyReportShare }" aria-hidden="true">
            <i></i>
          </span>
        </button>

        <button
          class="group-row toggle-row"
          data-testid="toggle-privacy-experience-share"
          type="button"
          :aria-pressed="setting.allowAnonymousExperienceShare"
          :disabled="saving"
          @click="save({ allowAnonymousExperienceShare: !setting.allowAnonymousExperienceShare })"
        >
          <span class="row-body">
            <strong class="row-title">允许匿名分享同路经历</strong>
            <small class="row-note">旅程结束后可选择留下去标识化的经验</small>
          </span>
          <span class="toggle-track" :class="{ on: setting.allowAnonymousExperienceShare }" aria-hidden="true">
            <i></i>
          </span>
        </button>

        <button
          class="group-row toggle-row"
          data-testid="toggle-privacy-future-notifications"
          type="button"
          :aria-pressed="setting.allowFutureSelfNotifications"
          :disabled="saving"
          @click="save({ allowFutureSelfNotifications: !setting.allowFutureSelfNotifications })"
        >
          <span class="row-body">
            <strong class="row-title">允许未来信提醒</strong>
            <small class="row-note">到期时通过站内提醒通知</small>
          </span>
          <span class="toggle-track" :class="{ on: setting.allowFutureSelfNotifications }" aria-hidden="true">
            <i></i>
          </span>
        </button>
      </div>
    </section>

    <!-- Group 3: AI 与记忆 -->
    <section class="group-section" aria-label="AI 与记忆">
      <div class="section-label">AI 与记忆</div>
      <div class="group-surface">
        <button
          class="group-row toggle-row"
          data-testid="toggle-privacy-long-memory"
          type="button"
          :aria-pressed="setting.allowLongTermMemory"
          :disabled="saving"
          @click="save({ allowLongTermMemory: !setting.allowLongTermMemory })"
        >
          <span class="row-body">
            <strong class="row-title">允许 AI 记住长期信息</strong>
            <small class="row-note">只记住你明确同意保留的内容</small>
          </span>
          <span class="toggle-track" :class="{ on: setting.allowLongTermMemory }" aria-hidden="true">
            <i></i>
          </span>
        </button>

        <button
          class="group-row toggle-row"
          data-testid="toggle-privacy-ai-memory-use"
          type="button"
          :aria-pressed="setting.allowAiMemoryUse"
          :disabled="saving"
          @click="save({ allowAiMemoryUse: !setting.allowAiMemoryUse })"
        >
          <span class="row-body">
            <strong class="row-title">允许 AI 使用历史记忆</strong>
            <small class="row-note">在生成回应时参考已保存的记忆</small>
          </span>
          <span class="toggle-track" :class="{ on: setting.allowAiMemoryUse }" aria-hidden="true">
            <i></i>
          </span>
        </button>

        <button
          class="group-row toggle-row"
          data-testid="toggle-privacy-journey-analysis"
          type="button"
          :aria-pressed="setting.allowJourneyLongTermAnalysis"
          :disabled="saving"
          @click="save({ allowJourneyLongTermAnalysis: !setting.allowJourneyLongTermAnalysis })"
        >
          <span class="row-body">
            <strong class="row-title">允许生成长期旅程分析</strong>
            <small class="row-note">用于生成更完整的成长与阶段回顾</small>
          </span>
          <span class="toggle-track" :class="{ on: setting.allowJourneyLongTermAnalysis }" aria-hidden="true">
            <i></i>
          </span>
        </button>

        <button
          class="group-row toggle-row"
          data-testid="toggle-privacy-recovery-data"
          type="button"
          :aria-pressed="setting.allowRecoveryData"
          :disabled="saving"
          @click="save({ allowRecoveryData: !setting.allowRecoveryData })"
        >
          <span class="row-body">
            <strong class="row-title">保存生活恢复记录</strong>
            <small class="row-note">记录生活状态与恢复进展</small>
          </span>
          <span class="toggle-track" :class="{ on: setting.allowRecoveryData }" aria-hidden="true">
            <i></i>
          </span>
        </button>

        <button
          class="group-row toggle-row"
          data-testid="toggle-privacy-journey-archive"
          type="button"
          :aria-pressed="setting.allowJourneyArchiveRetention"
          :disabled="saving"
          @click="save({ allowJourneyArchiveRetention: !setting.allowJourneyArchiveRetention })"
        >
          <span class="row-body">
            <strong class="row-title">允许保留旅程归档</strong>
            <small class="row-note">归档记录仅保存在你的个人账户中</small>
          </span>
          <span class="toggle-track" :class="{ on: setting.allowJourneyArchiveRetention }" aria-hidden="true">
            <i></i>
          </span>
        </button>
      </div>
    </section>

    <!-- Group 4: 数据管理 -->
    <section class="group-section" aria-label="数据管理">
      <div class="section-label">数据管理</div>
      <div class="group-surface">
        <button
          class="group-row toggle-row"
          data-testid="toggle-privacy-export"
          type="button"
          :aria-pressed="setting.allowDataExport"
          :disabled="saving"
          @click="save({ allowDataExport: !setting.allowDataExport })"
        >
          <span class="row-body">
            <strong class="row-title">允许导出我的数据</strong>
            <small class="row-note">可随时生成日记与个人数据备份</small>
          </span>
          <span class="toggle-track" :class="{ on: setting.allowDataExport }" aria-hidden="true">
            <i></i>
          </span>
        </button>

        <button
          class="group-row nav-row"
          data-testid="btn-data-explain"
          type="button"
          @click="explain = true"
        >
          <span class="row-body">
            <strong class="row-title">账号与数据说明</strong>
            <small class="row-note">查看隐私政策与数据使用规则</small>
          </span>
          <span class="row-arrow" aria-hidden="true">›</span>
        </button>

        <button
          class="group-row nav-row"
          data-testid="btn-clear-cache"
          type="button"
          :disabled="clearingCache"
          @click="clearCache"
        >
          <span class="row-body">
            <strong class="row-title">{{ clearingCache ? '正在清空本地缓存…' : '清空本地缓存' }}</strong>
            <small class="row-note">清理本地图片与临时文件缓存</small>
          </span>
          <span class="row-arrow" aria-hidden="true">›</span>
        </button>

        <div class="export-unit">
          <button
            class="group-row nav-row"
            data-testid="btn-export-diaries"
            type="button"
            :disabled="exporting"
            @click="exportDiaries"
          >
            <span class="row-body">
              <strong class="row-title">{{ exporting ? '正在请求导出…' : '导出我的日记' }}</strong>
              <small class="row-note">将日记导出为可下载文档文件</small>
            </span>
            <span class="row-arrow" aria-hidden="true">›</span>
          </button>
          <div v-if="exportResult && exportUrl" class="export-download-strip" role="status">
            <span class="export-download-text">导出文件已就绪（共 {{ exportResult.count ?? 0 }} 条）</span>
            <a class="export-download-link" :href="exportUrl" :download="exportResult.asset?.filename || '我的日记导出'">下载文件</a>
          </div>
        </div>

        <button
          class="group-row nav-row row-danger"
          data-testid="btn-delete-my-data"
          type="button"
          @click="deleteConfirm = true"
        >
          <span class="row-body">
            <strong class="row-title">删除我的数据</strong>
            <small class="row-note">从服务端删除日记、回信与收藏记录，此操作不可撤销</small>
          </span>
          <span class="row-arrow" aria-hidden="true">›</span>
        </button>
      </div>
    </section>

    <!-- Explanation Dialog -->
    <div
      v-if="explain"
      class="dialog-backdrop"
      data-testid="privacy-explain-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-explain-title"
      @click.self="explain = false"
    >
      <div class="dialog-box">
        <h2 id="privacy-explain-title" class="dialog-title">账号与数据说明</h2>
        <p class="dialog-desc">隐私设置会保存到服务端，影响新记录的默认可见范围、真人回应和数据分析偏好。</p>
        <div class="dialog-actions">
          <button
            class="dialog-btn dialog-cancel"
            data-testid="btn-data-explain-close"
            type="button"
            @click="explain = false"
          >
            知道了
          </button>
          <button
            class="dialog-btn dialog-primary"
            data-testid="btn-data-policy-route"
            type="button"
            @click="router.push('/pages/settings/data-policy')"
          >
            查看完整说明
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Dialog -->
    <div
      v-if="deleteConfirm"
      class="dialog-backdrop"
      data-testid="privacy-delete-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-delete-title"
      @click.self="deleteConfirm = false"
    >
      <div class="dialog-box">
        <h2 id="privacy-delete-title" class="dialog-title">确认删除我的数据？</h2>
        <p class="dialog-desc">这会从服务端删除你的日记、回信和收藏记录，无法恢复。</p>
        <div class="dialog-actions">
          <button
            class="dialog-btn dialog-cancel"
            type="button"
            :disabled="deleting"
            @click="deleteConfirm = false"
          >
            暂不删除
          </button>
          <button
            class="dialog-btn dialog-confirm"
            data-testid="btn-delete-my-data-confirm"
            type="button"
            :disabled="deleting"
            @click="deleteMyData"
          >
            {{ deleting ? '正在删除…' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>
  </section>

  <section v-else class="goodnight-page privacy-page privacy-loading" aria-live="polite">
    <p class="loading-text">{{ loadError || '正在读取隐私设置…' }}</p>
    <button v-if="loadError" class="retry-btn" type="button" @click="load">重新加载</button>
  </section>
</template>

<style scoped>
.privacy-page {
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

.privacy-header {
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
  border: 0;
  background: transparent;
  color: var(--gn-muted);
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
}

.header-titles {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.privacy-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--gn-ink);
}

.privacy-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--gn-muted);
}

.privacy-error {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--gn-radius-card);
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
  color: var(--gn-danger);
  font-size: 13px;
}

.privacy-feedback {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--gn-radius-card);
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
  color: var(--gn-leaf-deep);
  font-size: 13px;
  line-height: 1.4;
}

.group-section {
  display: flex;
  flex-direction: column;
}

.section-label {
  padding: 8px 4px 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--gn-muted);
}

.group-surface {
  background: var(--gn-paper);
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  overflow: hidden;
}

.group-row {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 48px;
  padding: 10px 14px;
  border: 0;
  background: transparent;
  text-align: left;
  color: var(--gn-ink);
  cursor: pointer;
}

.group-row + .group-row,
.export-unit + .group-row,
.group-row + .export-unit {
  border-top: 1px solid var(--gn-line);
}

.group-row:active {
  background: var(--gn-paper-warm);
}

.group-row:disabled {
  opacity: 0.6;
  cursor: wait;
}

.row-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  gap: 2px;
}

.row-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--gn-ink);
  line-height: 1.3;
}

.row-note {
  font-size: 12px;
  color: var(--gn-muted);
  line-height: 1.35;
}

.row-arrow {
  margin-left: 8px;
  font-size: 18px;
  color: var(--gn-muted);
  line-height: 1;
  flex-shrink: 0;
}

/* Switch */
.toggle-track {
  position: relative;
  width: 44px;
  height: 26px;
  border-radius: 13px;
  background: var(--gn-line);
  transition: background 0.2s ease;
  flex-shrink: 0;
  margin-left: 10px;
}

.toggle-track i {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 10px;
  background: #fff;
  transition: transform 0.2s ease;
}

.toggle-track.on {
  background: var(--gn-leaf);
}

.toggle-track.on i {
  transform: translateX(18px);
}

/* Export */
.export-unit {
  display: flex;
  flex-direction: column;
}

.export-download-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 14px 10px;
  border-top: 1px solid var(--gn-line);
  background: var(--gn-paper-warm);
  font-size: 12px;
}

.export-download-text {
  color: var(--gn-leaf-deep);
  font-weight: 500;
}

.export-download-link {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: var(--gn-radius-small);
  border: 1px solid var(--gn-leaf);
  background: var(--gn-leaf);
  color: #fff;
  text-decoration: none;
  font-weight: 500;
  font-size: 12px;
}

/* Destructive */
.row-danger .row-title {
  color: var(--gn-danger);
}

.row-danger .row-arrow {
  color: var(--gn-danger);
}

/* Dialog */
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.dialog-box {
  box-sizing: border-box;
  width: min(340px, 100%);
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-card);
  background: var(--gn-paper);
  padding: 20px;
}

.dialog-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--gn-ink);
  line-height: 1.35;
}

.dialog-desc {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--gn-muted);
  line-height: 1.5;
}

.dialog-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 18px;
}

.dialog-btn {
  min-height: 38px;
  border-radius: var(--gn-radius-small);
  border: 1px solid var(--gn-line);
  background: var(--gn-paper);
  color: var(--gn-ink);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.dialog-btn:disabled {
  opacity: 0.5;
}

.dialog-primary {
  border-color: var(--gn-leaf);
  background: var(--gn-leaf);
  color: #fff;
}

.dialog-confirm {
  border-color: var(--gn-danger);
  background: var(--gn-danger);
  color: #fff;
}

/* Loading */
.privacy-loading {
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: 60vh;
}

.loading-text {
  margin: 0;
  font-size: 14px;
  color: var(--gn-muted);
}

.retry-btn {
  margin-top: 12px;
  min-height: 34px;
  padding: 0 16px;
  border: 1px solid var(--gn-line);
  border-radius: var(--gn-radius-small);
  background: var(--gn-paper);
  color: var(--gn-ink);
  font-size: 13px;
  cursor: pointer;
}

@media (max-width: 374px) {
  .privacy-page {
    padding-right: 12px;
    padding-left: 12px;
  }
}
</style>
