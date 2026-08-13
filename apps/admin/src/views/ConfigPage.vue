<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Layout from './Layout.vue';
import { adminApi } from '../api';

type SettingGroup = {
  id: string;
  title: string;
  description: string;
  keys: string[];
};

const form = ref<Record<string, any>>({});
const original = ref<Record<string, any>>({});
const status = ref('正在读取系统设置…');
const busy = ref(false);

const groups: SettingGroup[] = [
  {
    id: 'basic',
    title: '基础设置',
    description: '维护应用名称、默认发布范围与列表展示数量。',
    keys: ['appName', 'appShortName', 'defaultVisibility', 'defaultPageSize'],
  },
  {
    id: 'review',
    title: '内容审核设置',
    description: '控制高风险内容与真人回应的默认审核策略。',
    keys: ['highRiskBlockEnabled', 'allowHumanRepliesDefault', 'manualReviewThreshold'],
  },
  {
    id: 'ai',
    title: 'AI 调用策略',
    description: '保存后由真实路由读取，用于 DAPI、远程备用与失败处理。',
    keys: ['cloudModelBackup', 'aiTimeoutSeconds', 'aiFailoverEnabled', 'aiRetryCount'],
  },
  {
    id: 'privacy',
    title: '隐私与数据',
    description: '管理敏感内容保护、月报分享、缓存及日志保留。',
    keys: ['sensitiveContentEncrypted', 'allowMonthlyReportShare', 'scheduledCacheCleanup', 'logRetentionDays'],
  },
  {
    id: 'notifications',
    title: '通知与告警',
    description: '设置异常通知和每日摘要的投递方式。',
    keys: ['abnormalNotifyEnabled', 'notifyEmail', 'dailyDigestEnabled', 'dailyDigestTime'],
  },
];

const labels: Record<string, string> = {
  appName: '应用名称',
  appShortName: '应用简称',
  defaultVisibility: '默认发布可见范围',
  defaultPageSize: '默认分页数量',
  highRiskBlockEnabled: '高危词拦截',
  allowHumanRepliesDefault: '允许真人回应',
  manualReviewThreshold: '人工审核阈值',
  cloudModelBackup: '远程模型备用',
  aiTimeoutSeconds: '请求超时时间（秒）',
  aiFailoverEnabled: '失败自动切换',
  aiRetryCount: '重试次数',
  sensitiveContentEncrypted: '敏感内容加密存储',
  scheduledCacheCleanup: '定期清理缓存',
  allowMonthlyReportShare: '允许生成月报分享图',
  logRetentionDays: '日志保留天数',
  abnormalNotifyEnabled: '异常邮件通知',
  notifyEmail: '接收邮箱',
  dailyDigestEnabled: '每日摘要报告',
  dailyDigestTime: '摘要发送时间',
};

const hints: Record<string, string> = {
  defaultVisibility: '新发布内容的默认范围',
  defaultPageSize: '列表页默认每页条数',
  highRiskBlockEnabled: '命中高危词后进入拦截流程',
  allowHumanRepliesDefault: '关闭后用户仅接收 AI 回应',
  manualReviewThreshold: '达到该风险阈值时进入人工审核',
  cloudModelBackup: 'DAPI 不可用时允许继续尝试已配置的远程备用 Provider',
  aiTimeoutSeconds: '单次模型调用最长等待时间',
  aiFailoverEnabled: '调用失败时切换下一个可用模型',
  aiRetryCount: '失败后的额外尝试次数',
  sensitiveContentEncrypted: '保护用户敏感内容的存储',
  scheduledCacheCleanup: '自动清理过期缓存',
  allowMonthlyReportShare: '允许生成可分享的月报图片',
  logRetentionDays: '系统日志的保留时长',
  abnormalNotifyEnabled: '服务异常时发送邮件提醒',
  notifyEmail: '用于接收系统告警和摘要',
  dailyDigestEnabled: '每天发送一封运行摘要',
  dailyDigestTime: '每日摘要的发送时间',
};

const booleanKeys = new Set([
  'highRiskBlockEnabled',
  'allowHumanRepliesDefault',
  'cloudModelBackup',
  'aiFailoverEnabled',
  'sensitiveContentEncrypted',
  'scheduledCacheCleanup',
  'allowMonthlyReportShare',
  'abnormalNotifyEnabled',
  'dailyDigestEnabled',
]);

const numberKeys = new Set([
  'defaultPageSize',
  'manualReviewThreshold',
  'aiTimeoutSeconds',
  'aiRetryCount',
  'logRetentionDays',
]);

const changedValues = computed(() => Object.fromEntries(
  Object.entries(form.value).filter(([key, value]) => original.value[key] !== value),
));
const hasChanges = computed(() => Object.keys(changedValues.value).length > 0);

function isBooleanField(key: string) {
  return booleanKeys.has(key);
}

function isNumberField(key: string) {
  return numberKeys.has(key);
}

function fieldHint(key: string) {
  return hints[key] ?? '';
}

function numberStep(key: string) {
  return key === 'manualReviewThreshold' ? '0.01' : '1';
}

function numberMax(key: string) {
  return key === 'manualReviewThreshold' ? 1 : undefined;
}

async function load() {
  busy.value = true;
  try {
    const response = await adminApi.get<any>('/api/admin/v1/system/settings');
    form.value = Object.fromEntries((response.items ?? []).map((item: any) => [item.key, item.value]));
    original.value = { ...form.value };
    status.value = '设置已从服务端读取';
  } catch (error: any) {
    status.value = error?.message ?? '设置加载失败';
  } finally {
    busy.value = false;
  }
}

async function save() {
  if (!hasChanges.value) {
    status.value = '没有需要保存的改动';
    return;
  }

  busy.value = true;
  try {
    await adminApi.put('/api/admin/v1/system/settings', changedValues.value);
    await load();
    status.value = '设置已保存并从服务端重新读取';
  } catch (error: any) {
    status.value = error?.message ?? '保存失败';
  } finally {
    busy.value = false;
  }
}

function reset() {
  form.value = { ...original.value };
  status.value = '已恢复到最近一次服务端读取的设置';
}

onMounted(load);
</script>

<template>
  <Layout>
    <section class="operation-page config-page">
      <header class="page-intro config-intro">
        <div>
          <h1>系统设置</h1>
          <p>按业务模块维护运行配置；保存时仅提交发生变化的字段，并立即从 API 回读。</p>
        </div>
      </header>

      <p class="config-status muted" role="status" aria-live="polite">{{ status }}</p>

      <div class="config-cards">
        <section
          v-for="group in groups"
          :key="group.id"
          class="panel config-card"
          :class="'config-card-' + group.id"
          :aria-labelledby="'config-group-' + group.id"
        >
          <header class="config-card-heading">
            <h2 :id="'config-group-' + group.id">{{ group.title }}</h2>
            <p>{{ group.description }}</p>
          </header>
          <div class="config-fields">
            <label
              v-for="key in group.keys"
              :key="key"
              class="config-field"
              :class="{ 'config-toggle-field': isBooleanField(key) }"
            >
              <span class="config-field-copy">
                <strong>{{ labels[key] }}</strong>
                <small v-if="fieldHint(key)">{{ fieldHint(key) }}</small>
              </span>

              <input
                v-if="isBooleanField(key)"
                v-model="form[key]"
                class="config-switch"
                :data-testid="'admin-config-field-' + key"
                :aria-label="labels[key]"
                :disabled="busy"
                type="checkbox"
              >
              <select
                v-else-if="key === 'defaultVisibility'"
                v-model="form[key]"
                :data-testid="'admin-config-field-' + key"
                :aria-label="labels[key]"
                :disabled="busy"
              >
                <option value="PRIVATE">仅自己可见</option>
                <option value="PUBLIC">匿名公开</option>
              </select>
              <input
                v-else-if="isNumberField(key)"
                v-model.number="form[key]"
                :data-testid="'admin-config-field-' + key"
                :aria-label="labels[key]"
                :disabled="busy"
                :max="numberMax(key)"
                min="0"
                :step="numberStep(key)"
                type="number"
              >
              <input
                v-else
                v-model="form[key]"
                :data-testid="'admin-config-field-' + key"
                :aria-label="labels[key]"
                :disabled="busy"
                :type="key === 'dailyDigestTime' ? 'time' : key === 'notifyEmail' ? 'email' : 'text'"
              >
            </label>
          </div>
        </section>
      </div>

      <footer class="config-savebar" aria-label="系统设置保存操作">
        <div class="config-save-copy">
          <strong>{{ hasChanges ? '存在尚未保存的设置改动' : '当前设置已与服务端一致' }}</strong>
          <span>保存后会立即重新读取 PostgreSQL 中的真实设置。</span>
        </div>
        <div class="config-save-actions">
          <button type="button" data-testid="admin-config-reset" :disabled="busy || !hasChanges" @click="reset">恢复已读取值</button>
          <button class="primary" data-testid="admin-config-save" type="button" :disabled="busy" @click="save">
            {{ busy ? '保存中…' : '保存设置' }}
          </button>
        </div>
      </footer>
    </section>
  </Layout>
</template>

<style scoped>
.config-page {
  width: min(100%, 1165px);
  margin: 0 auto;
  gap: 12px;
  padding-bottom: 26px;
}

.config-intro,
.config-status {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.config-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 16px;
  align-items: start;
}

.config-card {
  min-width: 0;
  margin: 0;
  padding: 16px 18px 10px;
  border-color: #e7e7df;
  border-radius: 12px;
  background: linear-gradient(145deg, #fff 0%, #fffefa 100%);
  box-shadow: 0 12px 30px rgba(59, 66, 48, .045);
}

.config-card-notifications {
  grid-column: 1 / -1;
}

.config-card-heading {
  display: grid;
  gap: 2px;
  padding-bottom: 6px;
}

.config-card-heading h2 {
  margin: 0;
  color: #374739;
  font-size: 18px;
  line-height: 1.25;
}

.config-card-heading p {
  margin: 0;
  color: #7b857a;
  font-size: 12px;
  line-height: 1.4;
}

.config-fields {
  display: grid;
  min-width: 0;
}

.config-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(148px, .98fr);
  gap: 12px;
  align-items: center;
  min-width: 0;
  min-height: 54px;
  padding: 7px 0;
  border-top: 1px solid #eff0ea;
}

.config-field-copy {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.config-field-copy strong {
  color: #475047;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
}

.config-field-copy small {
  overflow: hidden;
  color: #899086;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 1.35;
}

.config-field > input:not(.config-switch),
.config-field > select {
  width: 100%;
  min-width: 0;
  min-height: 36px;
  border-color: #dce6d7;
  background: #fff;
}

.config-field > input[type="number"] {
  font-variant-numeric: tabular-nums;
}

.config-toggle-field {
  grid-template-columns: minmax(0, 1fr) auto;
}

.config-switch {
  position: relative;
  width: 42px;
  min-width: 42px;
  min-height: 24px;
  height: 24px;
  margin: 0 4px 0 0;
  padding: 0;
  appearance: none;
  border: 0;
  border-radius: 999px;
  background: #d9dad5;
  cursor: pointer;
  transition: background .16s ease;
}

.config-switch::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(54, 58, 46, .2);
  content: '';
  transition: transform .16s ease;
}

.config-switch:checked {
  background: #668b4d;
}

.config-switch:checked::after {
  transform: translateX(18px);
}

.config-switch:focus-visible {
  outline: 2px solid #80a36a;
  outline-offset: 2px;
}

.config-switch:disabled {
  cursor: not-allowed;
  opacity: .58;
}

.config-savebar {
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 11px 16px;
  border: 1px solid #e2e6dc;
  border-radius: 12px;
  background: #fffefa;
  box-shadow: 0 10px 25px rgba(58, 65, 46, .045);
}

.config-save-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.config-save-copy strong {
  color: #40503f;
  font-size: 14px;
}

.config-save-copy span {
  color: #7d867c;
  font-size: 12px;
  line-height: 1.45;
}

.config-save-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 10px;
  align-items: center;
}

.config-save-actions button {
  min-width: 116px;
  min-height: 36px;
}

@media (min-width: 1081px) {
  .config-page {
    gap: 8px;
  }

  .config-cards {
    grid-template-columns: minmax(0, .97fr) minmax(0, 1fr);
    column-gap: 22px;
    row-gap: 20px;
  }

  .config-card-basic .config-field {
    min-height: 61px;
  }

  .config-card-review {
    min-height: 322px;
  }

  .config-card-review .config-field {
    min-height: 80px;
  }

  .config-card-ai .config-field {
    min-height: 50px;
  }

  .config-card-privacy .config-field {
    min-height: 64px;
  }

  .config-card-notifications .config-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 42px;
  }

  .config-card-notifications .config-field {
    min-height: 47px;
  }

  .config-card-notifications {
    padding-bottom: 4px;
  }

  .config-savebar {
    justify-content: center;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
  }

  .config-save-copy {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .config-save-actions {
    gap: 16px;
  }

  .config-save-actions button {
    min-height: 44px;
  }

  .config-save-actions button:first-child {
    min-width: 194px;
  }

  .config-save-actions .primary {
    min-width: 226px;
  }
}

@media (max-width: 1080px) {
  .config-cards {
    grid-template-columns: 1fr;
  }

  .config-card-notifications {
    grid-column: auto;
  }

}

@media (max-width: 700px) {
  .config-page {
    width: 100%;
  }

  .config-intro {
    min-height: 0;
  }

  .config-card {
    padding: 17px 15px 12px;
  }

  .config-field {
    grid-template-columns: 1fr;
    gap: 8px;
    align-items: stretch;
  }

  .config-toggle-field {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }

  .config-savebar {
    align-items: stretch;
    flex-direction: column;
  }

  .config-save-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }

  .config-save-actions button {
    min-width: 0;
  }
}
</style>
