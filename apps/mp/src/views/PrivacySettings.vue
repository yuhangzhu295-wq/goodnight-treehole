<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, resolveApiUrl } from '../api';

type PrivacySetting = {
  defaultVisibility: 'PRIVATE' | 'PUBLIC';
  allowAnonymousPublic: boolean;
  allowHumanReplies: boolean;
  allowMonthlyReportShare: boolean;
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
const saving = ref(false);
const clearingCache = ref(false);
const exporting = ref(false);
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

onMounted(load);
</script>

<template>
  <section v-if="setting" class="page goodnight-page rest-page settings-page privacy-page">
    <header class="privacy-hero">
      <img class="privacy-hero-tree" src="../assets/goodnight/tree-top-cutout.png" alt="" aria-hidden="true" />
      <img class="privacy-hero-sprout" src="../assets/goodnight/profile-baby.png" alt="" aria-hidden="true" />
      <button class="privacy-back" data-testid="front-privacy-back" type="button" aria-label="返回上一页" @click="router.back()">‹</button>
      <div class="privacy-hero-copy">
        <p class="privacy-eyebrow">晚安树洞 · 你的安心角落</p>
        <h1>隐私设置</h1>
        <p>你分享的每一种情绪，都值得被安心保护 <span aria-hidden="true">❧</span></p>
      </div>
    </header>

    <article class="privacy-promise" aria-label="隐私承诺">
      <span class="promise-shield" aria-hidden="true">
        <svg viewBox="0 0 48 56" fill="none"><path d="M24 2 43 10v16c0 13-8 23-19 28C13 49 5 39 5 26V10L24 2Z" fill="currentColor" opacity=".18" /><path d="M24 3 42 10v16c0 12-7.4 22.2-18 27C13.4 48.2 6 38 6 26V10l18-7Z" stroke="currentColor" stroke-width="2" /><rect x="15" y="25" width="18" height="15" rx="3" fill="#fffdf6" stroke="currentColor" stroke-width="2" /><path d="M19 25v-5a5 5 0 0 1 10 0v5M24 31v4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" /></svg>
      </span>
      <div>
        <h2>你的私密记录仅你自己可见 <span aria-hidden="true">❧</span></h2>
        <p>我们不会将你的情绪内容用于商业用途，也不会在未经你同意的情况下分享给他人。</p>
      </div>
      <span class="promise-leaves" aria-hidden="true">❧</span>
    </article>

    <section class="privacy-controls" aria-label="隐私偏好">
      <button
        class="privacy-toggle"
        data-testid="toggle-privacy-private"
        type="button"
        :aria-pressed="setting.defaultVisibility === 'PRIVATE'"
        :disabled="saving"
        @click="save({ defaultVisibility: setting.defaultVisibility === 'PRIVATE' ? 'PUBLIC' : 'PRIVATE' })"
      >
        <span class="setting-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M3 12s3.2-5 9-5 9 5 9 5-3.2 5-9 5-9-5-9-5Z" stroke="currentColor" stroke-width="1.8" /><path d="m4 4 16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /><path d="M9.8 9.9a3 3 0 0 0 4.3 4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg></span>
        <span class="setting-copy"><strong>默认仅自己可见</strong><small>写下的情绪默认只对自己可见</small></span>
        <span class="toggle-track" :class="{ on: setting.defaultVisibility === 'PRIVATE' }" aria-hidden="true"><i></i></span>
      </button>

      <button
        class="privacy-toggle"
        data-testid="toggle-privacy-anonymous"
        type="button"
        :aria-pressed="setting.allowAnonymousPublic"
        :disabled="saving"
        @click="save({ allowAnonymousPublic: !setting.allowAnonymousPublic })"
      >
        <span class="setting-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.8" /><path d="M5.5 20c.7-3.5 3-5.2 6.5-5.2s5.8 1.7 6.5 5.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /><path d="M18.5 17.5v3m-1.5-1.5h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg></span>
        <span class="setting-copy"><strong>匿名发布到广场</strong><small>发布到广场时隐藏昵称和头像</small></span>
        <span class="toggle-track" :class="{ on: setting.allowAnonymousPublic }" aria-hidden="true"><i></i></span>
      </button>

      <button
        class="privacy-toggle"
        data-testid="toggle-privacy-human"
        type="button"
        :aria-pressed="setting.allowHumanReplies"
        :disabled="saving"
        @click="save({ allowHumanReplies: !setting.allowHumanReplies })"
      >
        <span class="setting-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.6 3.2.8-3.2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /><path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" /></svg></span>
        <span class="setting-copy"><strong>允许接收真人回应</strong><small>开启后，其他用户可对你的情绪进行回应</small></span>
        <span class="toggle-track" :class="{ on: setting.allowHumanReplies }" aria-hidden="true"><i></i></span>
      </button>

      <button
        class="privacy-toggle"
        data-testid="toggle-privacy-report-share"
        type="button"
        :aria-pressed="setting.allowMonthlyReportShare"
        :disabled="saving"
        @click="save({ allowMonthlyReportShare: !setting.allowMonthlyReportShare })"
      >
        <span class="setting-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="4" width="17" height="16" rx="2" stroke="currentColor" stroke-width="1.8" /><path d="m5.5 17 4.3-4.4 3.1 2.9 2.4-2.3 3.2 3.3M8.2 8.6h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
        <span class="setting-copy"><strong>情绪月报可生成分享图</strong><small>开启后可将月报生成精美图片分享</small></span>
        <span class="toggle-track" :class="{ on: setting.allowMonthlyReportShare }" aria-hidden="true"><i></i></span>
      </button>
    </section>

    <section class="privacy-action-list" aria-label="数据操作">
      <button class="privacy-action" data-testid="btn-clear-cache" type="button" :disabled="clearingCache" @click="clearCache">
        <span class="setting-icon action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m8.2 3.5 7.6 7.6M8.4 6.2l-3 3a2.4 2.4 0 0 0 0 3.4l5.9 5.9a2.4 2.4 0 0 0 3.4 0l3-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /><path d="m13.8 3.5 6.7 6.7-3.1 3.1-6.7-6.7 3.1-3.1ZM5.1 16.4l2.5 2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
        <span class="action-copy"><strong>{{ clearingCache ? '正在清空本地缓存…' : '清空本地缓存' }}</strong><small>清理图片及临时文件，释放手机空间</small></span>
        <span class="action-arrow" aria-hidden="true">›</span>
      </button>

      <div class="privacy-action-export">
        <button class="privacy-action" data-testid="btn-export-diaries" type="button" :disabled="exporting" @click="exportDiaries">
          <span class="setting-icon action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="1.8" /><path d="M12 7v8m0 0-3-3m3 3 3-3M8 19h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
          <span class="action-copy"><strong>{{ exporting ? '正在请求导出…' : '导出我的日记' }}</strong><small>将你的日记导出为文档，便于备份与保存</small></span>
          <span class="action-arrow" aria-hidden="true">›</span>
        </button>
        <div v-if="exportResult && exportUrl" class="export-ready" role="status">
          <span>导出文件已由服务端准备完成</span>
          <a :href="exportUrl" :download="exportResult.asset?.filename || '我的日记导出'">下载文件</a>
        </div>
      </div>

      <button class="privacy-action" data-testid="btn-data-explain" type="button" @click="explain = true">
        <span class="setting-icon action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" /><path d="M12 10.7v5M12 7.7h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg></span>
        <span class="action-copy"><strong>账号与数据说明</strong><small>查看我们的隐私政策与数据使用说明</small></span>
        <span class="action-arrow" aria-hidden="true">›</span>
      </button>
    </section>

    <p v-if="message" class="privacy-status" role="status" aria-live="polite">{{ message }}</p>
    <p class="privacy-reassurance">你可以随时调整隐私设置，我们会一直守护你的安心。<span aria-hidden="true">❧</span></p>

    <div v-if="explain" class="privacy-modal" data-testid="privacy-explain-panel" role="dialog" aria-modal="true" aria-labelledby="privacy-explain-title">
      <section class="privacy-modal-card">
        <p class="modal-kicker">数据与账号</p>
        <h2 id="privacy-explain-title">账号与数据说明</h2>
        <p>隐私设置会保存到后端，影响新心情的默认可见范围、真人回应和月报分享偏好。</p>
        <div class="privacy-modal-actions">
          <button class="privacy-modal-primary" data-testid="btn-data-policy-route" type="button" @click="router.push('/pages/settings/data-policy')">查看完整说明</button>
          <button data-testid="btn-data-explain-close" type="button" @click="explain = false">知道了</button>
        </div>
      </section>
    </div>
  </section>

  <section v-else class="page goodnight-page rest-page privacy-page privacy-loading" aria-live="polite">
    <p>{{ loadError || '正在读取你的隐私设置…' }}</p>
    <button v-if="loadError" type="button" @click="load">重新加载</button>
  </section>
</template>

<style scoped>
.privacy-page {
  display: block;
  min-height: 100vh;
  padding: 0 14px calc(132px + env(safe-area-inset-bottom));
  overflow: hidden;
  background:
    radial-gradient(circle at 92% 4%, rgba(229, 240, 213, .72), transparent 21rem),
    linear-gradient(180deg, #fffdf8 0%, #fbf6e8 78%, #f8f2e3 100%);
  color: #273526;
}

.privacy-page *,
.privacy-page *::before,
.privacy-page *::after { box-sizing: border-box; }

.privacy-hero {
  position: relative;
  min-height: 224px;
  margin: 0 -14px;
  padding: 34px 22px 30px;
  overflow: hidden;
  isolation: isolate;
}

.privacy-hero::after {
  position: absolute;
  right: 5%;
  bottom: 12px;
  z-index: -1;
  width: 30px;
  height: 30px;
  border-radius: 50% 0 50% 50%;
  transform: rotate(-28deg);
  background: rgba(130, 158, 88, .38);
  box-shadow: -28px 18px 0 -8px rgba(167, 188, 119, .28), -50px 35px 0 -10px rgba(167, 188, 119, .24);
  content: '';
}

.privacy-hero-tree {
  position: absolute;
  top: -16px;
  right: -38px;
  z-index: -1;
  width: min(72vw, 330px);
  max-width: none;
  opacity: .76;
  pointer-events: none;
}

.privacy-hero-sprout {
  position: absolute;
  right: 13%;
  bottom: 4px;
  z-index: -1;
  width: 92px;
  max-width: none;
  filter: drop-shadow(0 8px 12px rgba(68, 86, 48, .13));
  pointer-events: none;
}

.privacy-back {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  min-height: 42px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: #4b6d32;
  background: rgba(255, 253, 246, .7);
  box-shadow: none;
  font-size: 38px;
  line-height: 1;
}

.privacy-hero-copy {
  width: min(72%, 360px);
  margin-top: 27px;
}

.privacy-eyebrow,
.privacy-hero-copy > p,
.privacy-promise p,
.setting-copy small,
.action-copy small,
.privacy-reassurance { margin: 0; color: #72796d; }

.privacy-eyebrow {
  margin-bottom: 6px;
  color: #72874e;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .08em;
}

.privacy-hero h1 {
  margin: 0;
  color: #2f4726;
  font-family: var(--gn-font-display);
  font-size: clamp(34px, 10vw, 48px);
  font-weight: 700;
  letter-spacing: .06em;
  line-height: 1.08;
}

.privacy-hero-copy > p:last-child {
  max-width: 275px;
  margin-top: 14px;
  color: #5c753c;
  font-size: 15px;
  line-height: 1.55;
}

.privacy-promise {
  position: relative;
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  gap: 15px;
  align-items: center;
  min-height: 150px;
  margin: 4px 0 18px;
  padding: 20px 20px 20px 16px;
  overflow: hidden;
  border: 1px solid rgba(126, 145, 83, .2);
  border-radius: 25px;
  background: linear-gradient(135deg, rgba(255, 253, 243, .96), rgba(249, 242, 219, .9));
  box-shadow: 0 15px 30px rgba(77, 86, 55, .08);
}

.promise-shield {
  display: grid;
  place-items: center;
  width: 68px;
  height: 76px;
  color: #78934c;
}

.promise-shield svg { width: 58px; height: 66px; }

.privacy-promise h2 {
  position: relative;
  z-index: 1;
  margin: 0 0 7px;
  color: #4d6a30;
  font-family: var(--gn-font-display);
  font-size: clamp(19px, 5vw, 25px);
  line-height: 1.34;
}

.privacy-promise p {
  position: relative;
  z-index: 1;
  font-size: 14px;
  line-height: 1.75;
}

.promise-leaves {
  position: absolute;
  right: -7px;
  bottom: -9px;
  color: #a1b174;
  font-size: 78px;
  opacity: .48;
  transform: rotate(-34deg);
}

.privacy-controls,
.privacy-action-list {
  overflow: hidden;
  border: 1px solid rgba(132, 143, 108, .16);
  border-radius: 25px;
  background: rgba(255, 255, 253, .95);
  box-shadow: 0 14px 28px rgba(80, 83, 62, .07);
}

.privacy-controls { padding: 8px 18px; }

.privacy-toggle,
.privacy-action {
  width: 100%;
  min-width: 0;
  border: 0;
  border-bottom: 1px solid rgba(134, 143, 111, .16);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  color: inherit;
  text-align: left;
}

.privacy-toggle {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) 56px;
  gap: 13px;
  align-items: center;
  min-height: 102px;
  padding: 15px 0;
}

.privacy-toggle:last-child,
.privacy-action-list > :last-child .privacy-action,
.privacy-action-list > .privacy-action:last-child { border-bottom: 0; }

.privacy-toggle:disabled,
.privacy-action:disabled { cursor: wait; opacity: .65; }

.setting-icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  color: #617b3b;
  background: linear-gradient(145deg, #fbf8e9, #f2eedc);
}

.setting-icon svg { width: 28px; height: 28px; }

.setting-copy,
.action-copy { display: grid; min-width: 0; gap: 5px; }

.setting-copy strong,
.action-copy strong {
  color: #283328;
  font-family: var(--gn-font-body, "Noto Serif SC", serif);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
}

.setting-copy small,
.action-copy small {
  font-size: 13px;
  line-height: 1.48;
}

.toggle-track {
  position: relative;
  justify-self: end;
  width: 54px;
  height: 32px;
  border-radius: 999px;
  background: #e4e4dd;
  box-shadow: inset 0 1px 2px rgba(61, 70, 45, .12);
  transition: background .18s ease;
}

.toggle-track i {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 6px rgba(46, 55, 39, .18);
  transition: transform .18s ease;
}

.toggle-track.on { background: linear-gradient(135deg, #89a35c, #607d39); }
.toggle-track.on i { transform: translateX(22px); }

.privacy-action-list { margin-top: 20px; padding: 0 18px; }

.privacy-action { display: grid; grid-template-columns: 58px minmax(0, 1fr) 20px; gap: 13px; align-items: center; min-height: 98px; padding: 15px 0; }
.action-icon { width: 50px; height: 50px; }
.action-copy strong { font-size: 19px; }
.action-arrow { color: #8b8b7c; font-size: 38px; font-weight: 300; line-height: 1; }
.privacy-action-export { border-bottom: 1px solid rgba(134, 143, 111, .16); }
.privacy-action-export .privacy-action { border-bottom: 0; }

.export-ready {
  display: flex;
  flex-wrap: wrap;
  gap: 9px 14px;
  align-items: center;
  margin: -4px 0 15px 71px;
  color: #667f42;
  font-size: 13px;
}

.export-ready a {
  min-height: 32px;
  padding: 7px 12px;
  border: 1px solid #789451;
  border-radius: 999px;
  color: #48682b;
  font-weight: 700;
  text-decoration: none;
}

.privacy-status {
  margin: 15px 7px 0;
  color: #607b3c;
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
}

.privacy-reassurance { margin: 23px 20px 0; font-size: 13px; line-height: 1.65; text-align: center; }
.privacy-reassurance span { color: #849f57; }

.privacy-modal {
  position: fixed;
  z-index: 20;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(39, 49, 31, .32);
  backdrop-filter: blur(4px);
}

.privacy-modal-card {
  width: min(100%, 390px);
  padding: 26px;
  border: 1px solid rgba(255, 255, 255, .66);
  border-radius: 25px;
  background: #fffdf7;
  box-shadow: 0 24px 56px rgba(29, 37, 23, .22);
}

.modal-kicker { margin: 0 0 7px; color: #7b9551; font-size: 13px; font-weight: 700; letter-spacing: .08em; }
.privacy-modal-card h2 { margin: 0; color: #3f5c2e; font-family: var(--gn-font-body, "Noto Serif SC", serif); font-size: 24px; }
.privacy-modal-card > p:not(.modal-kicker) { margin: 14px 0 0; color: #5f695b; font-size: 15px; line-height: 1.7; }
.privacy-modal-actions { display: grid; grid-template-columns: 1.2fr .8fr; gap: 10px; margin-top: 22px; }
.privacy-modal-actions button { min-height: 44px; border-radius: 999px; }
.privacy-modal-primary { border-color: #668541; color: #fff; background: linear-gradient(135deg, #8ba45e, #617e3b); }

.privacy-loading { display: grid; place-content: center; gap: 15px; min-height: 100vh; color: #607342; text-align: center; }
.privacy-loading p { margin: 0; }
.privacy-loading button { min-height: 42px; border-radius: 999px; }

@media (max-width: 374px) {
  .privacy-page { padding-right: 11px; padding-left: 11px; }
  .privacy-hero { margin-right: -11px; margin-left: -11px; padding-right: 17px; padding-left: 17px; }
  .privacy-hero-copy { width: 73%; }
  .privacy-hero h1 { font-size: 34px; }
  .privacy-promise { grid-template-columns: 58px minmax(0, 1fr); gap: 9px; padding: 17px 14px; }
  .promise-shield { width: 54px; height: 66px; }
  .promise-shield svg { width: 48px; height: 58px; }
  .privacy-controls, .privacy-action-list { padding-right: 14px; padding-left: 14px; }
  .privacy-toggle { grid-template-columns: 48px minmax(0, 1fr) 50px; gap: 9px; min-height: 96px; }
  .setting-icon { width: 45px; height: 45px; }
  .setting-copy strong, .action-copy strong { font-size: 17px; }
  .setting-copy small, .action-copy small { font-size: 12px; }
  .toggle-track { width: 48px; height: 30px; }
  .toggle-track i { width: 22px; height: 22px; }
  .toggle-track.on i { transform: translateX(18px); }
  .privacy-action { grid-template-columns: 48px minmax(0, 1fr) 16px; gap: 9px; }
  .action-icon { width: 45px; height: 45px; }
  .export-ready { margin-left: 57px; }
}

/* Keep the real settings controls in normal flow while matching the compact
   mobile composition used by the product references. */
.privacy-page {
  padding-right: 5px;
  padding-left: 5px;
  padding-bottom: calc(108px + env(safe-area-inset-bottom));
}

.privacy-hero {
  width: calc(100% + 10px);
  min-height: 154px;
  max-width: none;
  margin-right: -5px;
  margin-left: -5px;
  padding: 29px 22px 14px;
}

.privacy-hero::after { display: none; }

.privacy-hero-tree {
  top: -24px;
  right: -24px;
  width: min(61vw, 264px);
  opacity: .8;
}

.privacy-hero-sprout {
  right: 17%;
  bottom: -3px;
  width: 70px;
  clip-path: circle(48% at 50% 50%);
  opacity: .88;
}

.privacy-back {
  position: absolute;
  top: 29px;
  left: 4px;
  z-index: 2;
  width: 38px;
  height: 38px;
  min-height: 38px;
  border-radius: 0;
  background: transparent;
  font-size: 34px;
}

.privacy-hero-copy {
  width: min(73%, 292px);
  margin-top: 16px;
  margin-left: 15px;
}

.privacy-eyebrow { display: none; }

.privacy-hero h1 {
  font-size: clamp(27px, 7.6vw, 33px);
  letter-spacing: .04em;
  line-height: 1.16;
}

.privacy-hero-copy > p:last-child {
  max-width: 285px;
  margin-left: -15px;
  margin-top: 14px;
  color: #5d753e;
  font-size: 14px;
  line-height: 1.5;
}

.privacy-promise {
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 10px;
  min-height: 96px;
  margin: 0 0 12px;
  padding: 12px 14px;
  border-radius: 22px;
}

.promise-shield {
  width: 52px;
  height: 56px;
}

.promise-shield svg { width: 45px; height: 53px; }

.privacy-promise h2 {
  margin-bottom: 3px;
  font-size: 17px;
  line-height: 1.32;
}

.privacy-promise p {
  font-size: 12px;
  line-height: 1.48;
}

.promise-leaves {
  right: -5px;
  bottom: -21px;
  font-size: 62px;
}

.privacy-controls,
.privacy-action-list {
  border-radius: 22px;
}

.privacy-controls { padding: 4px 14px; }

.privacy-toggle {
  grid-template-columns: 46px minmax(0, 1fr) 48px;
  gap: 10px;
  min-height: 68px;
  padding: 8px 0;
}

.setting-icon {
  width: 44px;
  height: 44px;
}

.setting-icon svg { width: 24px; height: 24px; }

.setting-copy,
.action-copy { gap: 2px; }

.setting-copy strong,
.action-copy strong {
  font-size: 16px;
  line-height: 1.28;
}

.setting-copy small,
.action-copy small {
  font-size: 11px;
  line-height: 1.38;
}

.toggle-track {
  width: 48px;
  height: 29px;
}

.toggle-track i {
  top: 3px;
  left: 3px;
  width: 23px;
  height: 23px;
}

.toggle-track.on i { transform: translateX(19px); }

.privacy-action-list {
  margin-top: 12px;
  padding: 0 14px;
}

.privacy-action {
  grid-template-columns: 46px minmax(0, 1fr) 17px;
  gap: 10px;
  min-height: 68px;
  padding: 9px 0;
}

.action-icon { width: 44px; height: 44px; }
.action-arrow { font-size: 29px; }

.export-ready {
  margin: -2px 0 10px 56px;
  font-size: 11px;
}

.privacy-status { margin-top: 10px; }
.privacy-reassurance { margin: 15px 0 0; font-size: 12px; }

@media (max-width: 374px) {
  .privacy-page { padding-right: 4px; padding-left: 4px; }
  .privacy-hero { width: calc(100% + 8px); margin-right: -4px; margin-left: -4px; padding-right: 17px; padding-left: 17px; }
  .privacy-hero h1 { font-size: 27px; }
  .privacy-hero-copy { width: 76%; margin-left: 12px; }
  .privacy-promise { grid-template-columns: 51px minmax(0, 1fr); gap: 7px; padding-right: 10px; padding-left: 10px; }
  .privacy-toggle { grid-template-columns: 42px minmax(0, 1fr) 46px; gap: 7px; }
  .privacy-action { grid-template-columns: 42px minmax(0, 1fr) 15px; gap: 7px; }
  .setting-icon, .action-icon { width: 40px; height: 40px; }
  .setting-copy strong, .action-copy strong { font-size: 15px; }
}

/* Place the reusable tree crop at the reference handset position. The hero
   contents and persisted privacy controls remain ordinary foreground DOM. */
.privacy-hero-tree {
  top: 34.73px;
  right: auto;
  left: 210.28px;
  width: 204.03px;
  height: 107.63px;
  opacity: 1;
}

/* These controls are all persisted server-side.  Compact their ordinary
   in-flow rows so the data actions remain visible on a handset without
   hiding labels, values, or controls. */
.privacy-controls { padding-block: 3px; }

.privacy-toggle {
  grid-template-columns: 42px minmax(0, 1fr) 44px;
  gap: 9px;
  min-height: 60px;
  padding-block: 6px;
}

.setting-icon { width: 40px; height: 40px; }
.setting-icon svg { width: 22px; height: 22px; }

.setting-copy strong,
.action-copy strong {
  font-size: 15px;
  font-weight: 600;
}

.setting-copy small,
.action-copy small { font-size: 10.5px; }

.toggle-track { width: 43px; height: 27px; }
.toggle-track i { width: 21px; height: 21px; }
.toggle-track.on i { transform: translateX(18px); }

.privacy-action-list { margin-top: 10px; }

.privacy-action {
  /* Keep the copy in its own flexible track.  The former two-track grid
     constrained this span to 17px and made Chinese labels wrap one glyph per
     line on handset widths. */
  grid-template-columns: 42px minmax(0, 1fr) 17px;
  gap: 9px;
  min-height: 58px;
  padding-block: 6px;
}

.action-icon { width: 40px; height: 40px; }
.action-arrow { font-size: 26px; }

.privacy-action .action-copy,
.privacy-action .action-copy strong,
.privacy-action .action-copy small {
  min-width: 0;
  overflow-wrap: anywhere;
}

/* Keep the persisted settings in the same handset rhythm as the privacy
   reference: the promise remains visible above the switches and every
   server-backed action stays readable above the fixed navigation. */
.privacy-page {
  overflow-x: clip;
  overflow-y: visible;
  padding-bottom: calc(124px + env(safe-area-inset-bottom));
}

.privacy-hero {
  min-height: 166px;
  padding-top: 31px;
  padding-bottom: 17px;
}

.privacy-hero-copy { margin-top: 19px; }
.privacy-promise {
  min-height: 102px;
  margin-bottom: 14px;
}

.privacy-controls { padding-block: 5px; }
.privacy-toggle { min-height: 62px; }
.privacy-action-list {
  padding-bottom: calc(92px + env(safe-area-inset-bottom));
}
.privacy-action {
  min-height: 60px;
  scroll-margin-bottom: calc(104px + env(safe-area-inset-bottom));
}

@media (max-width: 374px) {
  .privacy-toggle { grid-template-columns: 39px minmax(0, 1fr) 42px; gap: 7px; }
  .privacy-action { grid-template-columns: 39px minmax(0, 1fr) 15px; gap: 7px; }
  .setting-icon,
  .action-icon { width: 37px; height: 37px; }
}
</style>
