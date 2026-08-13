<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Layout from './Layout.vue';
import { adminApi } from '../api';

type ProviderEditor = {
  name: string;
  modelName: string;
  baseUrl: string;
  priority: number;
  dailyLimit: number;
  timeoutSeconds: number;
  failoverEnabled: boolean;
  usageTags: string;
};

const items = ref<any[]>([]);
const selectedId = ref('');
const editor = ref<ProviderEditor | null>(null);
const status = ref('正在读取远程 AI Provider 策略…');
const busy = ref(false);
const saving = ref(false);
const page = ref(1);
const pageSize = 5;

function providerKind(item: any) {
  return item.providerKind ?? item.type ?? 'unknown';
}

function isLocalProvider(item: any) {
  const kind = providerKind(item);
  return item.type === 'local' || kind === 'ollama' || kind === 'local';
}

function isManagedRemote(item: any) {
  return item.id === 'provider_dapi_deepseek' || item.id === 'provider_openai_remote';
}

function typeLabel(item: any) {
  if (item.modelMeta?.fixtureOnly) return '视觉 Fixture Stub';
  const kind = providerKind(item);
  if (isLocalProvider(item)) return '本地模型（已禁用）';
  if (kind === 'openai-compatible') return '远程 API';
  if (kind === 'cloud') return '云模型';
  if (kind === 'template') return '模板备用';
  return '其他来源';
}

function typeTone(item: any) {
  if (item.modelMeta?.fixtureOnly) return 'is-neutral';
  if (isLocalProvider(item)) return 'is-local';
  const kind = providerKind(item);
  if (kind === 'cloud') return 'is-cloud';
  if (kind === 'template') return 'is-template';
  return 'is-neutral';
}

function safeUrl(value?: string) {
  if (!value) return '未配置';
  return value.replace(/\/+$/, '');
}

function usageLabel(item: any) {
  const tags = Array.isArray(item.usageTags) ? item.usageTags : [];
  return tags.length ? tags.join(' · ') : '未标注用途';
}

function formatPercent(value?: number) {
  const number = Number(value);
  return Number.isFinite(number) ? (number * 100).toFixed(number > 0 && number < 0.1 ? 2 : 1) + '%' : '-';
}

function formatCalls(value?: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('zh-CN') : '0';
}

function toEditor(item: any): ProviderEditor {
  return {
    name: String(item.name ?? ''),
    modelName: String(item.modelName ?? ''),
    baseUrl: String(item.baseUrl ?? ''),
    priority: Number(item.priority ?? 0),
    dailyLimit: Number(item.dailyLimit ?? 0),
    timeoutSeconds: Number(item.timeoutSeconds ?? 0),
    failoverEnabled: Boolean(item.failoverEnabled),
    usageTags: Array.isArray(item.usageTags) ? item.usageTags.join(', ') : '',
  };
}

const selected = computed(() => items.value.find((item) => item.id === selectedId.value));
const totalPages = computed(() => Math.max(1, Math.ceil(items.value.length / pageSize)));
const visibleItems = computed(() => {
  const current = Math.min(page.value, totalPages.value);
  const start = (current - 1) * pageSize;
  return items.value.slice(start, start + pageSize);
});
const currentRange = computed(() => {
  if (!items.value.length) return '0';
  const start = (Math.min(page.value, totalPages.value) - 1) * pageSize + 1;
  return `${start}–${Math.min(start + pageSize - 1, items.value.length)}`;
});
const editorChanged = computed(() => {
  if (!selected.value || !editor.value) return false;
  const baseline = toEditor(selected.value);
  return Object.entries(editor.value).some(([key, value]) => baseline[key as keyof ProviderEditor] !== value);
});

const metrics = computed(() => {
  const remote = items.value.filter((item) => providerKind(item) === 'openai-compatible').length;
  const cloud = items.value.filter((item) => ['cloud', 'openai-compatible'].includes(providerKind(item))).length;
  return {
    active: items.value.filter((item) => item.enabled).length,
    remote,
    cloud,
    calls: items.value.reduce((sum, item) => sum + (Number(item.todayCalls) || 0), 0),
  };
});

function select(item: any) {
  selectedId.value = item.id;
  editor.value = toEditor(item);
}

async function load() {
  busy.value = true;
  try {
    const response = await adminApi.get<any>('/api/admin/v1/ai/providers?page=1&pageSize=100');
    items.value = response.items ?? [];
    if (page.value > totalPages.value) page.value = totalPages.value;
    const retained = items.value.find((item) => item.id === selectedId.value);
    if (retained) {
      if (!editorChanged.value) editor.value = toEditor(retained);
    } else if (items.value.length) {
      select(items.value[0]);
    } else {
      selectedId.value = '';
      editor.value = null;
    }
    status.value = '已从服务端读取 ' + items.value.length + ' 个 Provider 配置';
  } catch (error: any) {
    status.value = error?.message ?? '读取 AI 模型来源失败';
  } finally {
    busy.value = false;
  }
}

function changePage(nextPage: number) {
  page.value = Math.min(Math.max(1, nextPage), totalPages.value);
  const selectedOnPage = visibleItems.value.find((item) => item.id === selectedId.value);
  if (!selectedOnPage && visibleItems.value[0]) select(visibleItems.value[0]);
}

async function test(item: any) {
  if (!isManagedRemote(item)) {
    status.value = '该历史来源已被远程运行策略锁定，不能执行连接测试';
    return;
  }
  busy.value = true;
  try {
    const response = await adminApi.post<any>('/api/admin/v1/ai/providers/' + item.id + '/test');
    status.value = response.message ?? '模型连接测试完成';
    await load();
  } catch (error: any) {
    status.value = error?.message ?? '模型连接测试失败';
  } finally {
    busy.value = false;
  }
}

async function toggle(item: any) {
  if (isLocalProvider(item) || item.usageTags?.includes('disabled-by-policy') || item.id === 'provider_dapi_deepseek') {
    status.value = '该来源状态由 DAPI-only 运行策略锁定';
    return;
  }
  busy.value = true;
  try {
    await adminApi.patch('/api/admin/v1/ai/providers/' + item.id, { enabled: !item.enabled });
    await load();
    status.value = item.enabled ? '模型来源已停用并从服务端回读' : '模型来源已启用并从服务端回读';
  } catch (error: any) {
    status.value = error?.message ?? '更新模型来源失败';
  } finally {
    busy.value = false;
  }
}

async function saveSelected() {
  if (!selected.value || !editor.value || !editorChanged.value) {
    status.value = '没有需要保存的供应商改动';
    return;
  }

  saving.value = true;
  try {
    await adminApi.put('/api/admin/v1/ai/providers/' + selected.value.id, {
      name: editor.value.name.trim(),
      modelName: editor.value.modelName.trim(),
      baseUrl: editor.value.baseUrl.trim(),
      priority: Number(editor.value.priority),
      dailyLimit: Number(editor.value.dailyLimit),
      timeoutSeconds: Number(editor.value.timeoutSeconds),
      failoverEnabled: Boolean(editor.value.failoverEnabled),
      usageTags: editor.value.usageTags.split(',').map((tag) => tag.trim()).filter(Boolean),
    });
    await load();
    status.value = '供应商配置已保存并从服务端重新读取';
  } catch (error: any) {
    status.value = error?.message ?? '保存供应商配置失败';
  } finally {
    saving.value = false;
  }
}

function resetSelected() {
  if (!selected.value) return;
  editor.value = toEditor(selected.value);
  status.value = '已恢复到最近一次服务端读取的供应商配置';
}

onMounted(load);
</script>

<template>
  <Layout>
    <section class="operation-page providers-page">
      <header class="page-intro providers-intro">
        <div>
          <h1>AI 配置中心</h1>
          <p>统一管理 DAPI 与远程备用模型；本地模型按运行策略永久禁用。</p>
        </div>
        <button class="primary provider-policy-chip" type="button" :disabled="busy" @click="load">
          {{ busy ? '正在读取...' : '刷新远程配置' }}
        </button>
      </header>

      <section class="provider-metrics" aria-label="AI 模型来源统计">
        <article><span>已启用供应商</span><strong>{{ metrics.active }} <small>/ {{ items.length }}</small></strong><p>当前可参与路由的来源</p></article>
        <article><span>远程来源</span><strong>{{ metrics.remote }}</strong><p>已接入的兼容 API 模型</p></article>
        <article><span>本地模型策略</span><strong>禁用</strong><p>不会扫描或调用本机模型</p></article>
        <article><span>今日调用量</span><strong data-visual-mask="stat">{{ formatCalls(metrics.calls) }}</strong><p>按真实 provider 调用记录汇总</p></article>
      </section>

      <p class="provider-status muted" role="status" aria-live="polite">{{ status }}</p>

      <section class="provider-workspace" aria-label="供应商配置工作区">
        <div class="provider-left-stack">
          <section class="panel provider-table-panel" aria-labelledby="provider-table-title">
            <header class="provider-table-heading">
              <div>
                <h2 id="provider-table-title">多模型供应商配置</h2>
                <p>选择供应商查看配置；密钥仅展示配置状态，不在后台页面暴露原始值。</p>
              </div>
              <div class="provider-heading-actions">
                <span v-if="busy" class="provider-loading">正在同步…</span>
                <button class="primary" type="button" data-testid="admin-provider-refresh" :disabled="busy" @click="load">
                  {{ busy ? '正在读取...' : '刷新远程配置' }}
                </button>
              </div>
            </header>

            <div class="provider-table-shell">
              <table class="table provider-table" :aria-busy="busy">
                <thead>
                  <tr>
                    <th>供应商</th>
                    <th>模型名称</th>
                    <th>类型</th>
                    <th>调用地址</th>
                    <th>用途</th>
                    <th>优先级</th>
                    <th>状态</th>
                    <th>失败率</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(item, index) in visibleItems"
                    :key="item.id"
                    :class="{ selected: item.id === selectedId }"
                    :data-testid="item.id === 'provider_dapi_deepseek' ? 'admin-provider-row-dapi' : (index === 0 ? 'admin-provider-row-first' : 'admin-provider-row-' + index)"
                    tabindex="0"
                    @click="select(item)"
                    @keyup.enter="select(item)"
                  >
                    <td class="provider-name-cell"><strong>{{ item.name }}</strong><small>{{ item.id }}</small></td>
                    <td class="provider-model-cell"><strong>{{ item.modelName || '未配置模型' }}</strong><small>{{ item.apiKeyStatus === 'missing' ? '未配置凭据' : '凭据已配置' }}</small></td>
                    <td><span class="provider-type" :class="typeTone(item)">{{ typeLabel(item) }}</span></td>
                    <td class="provider-url-cell" :title="safeUrl(item.baseUrl)">{{ safeUrl(item.baseUrl) }}</td>
                    <td class="provider-usage-cell" :title="usageLabel(item)">{{ usageLabel(item) }}</td>
                    <td>{{ item.priority }}</td>
                    <td><span class="status-badge" :class="{ disabled: !item.enabled }">{{ item.enabled ? '启用' : '停用' }}</span></td>
                    <td>{{ formatPercent(item.failureRate) }}</td>
                    <td class="provider-actions" @click.stop>
                      <button
                        type="button"
                        :data-testid="'admin-provider-test-' + item.id"
                        :disabled="busy || saving || item.modelMeta?.fixtureOnly || !isManagedRemote(item)"
                        @click="test(item)"
                      >
                        测试
                      </button>
                      <button
                        type="button"
                        :data-testid="'admin-provider-toggle-' + item.id"
                        :disabled="busy || saving || isLocalProvider(item) || item.usageTags?.includes('disabled-by-policy') || item.id === 'provider_dapi_deepseek'"
                        @click="toggle(item)"
                      >
                        {{ isLocalProvider(item) || item.usageTags?.includes('disabled-by-policy') || item.id === 'provider_dapi_deepseek' ? '策略锁定' : (item.enabled ? '停用' : '启用') }}
                      </button>
                    </td>
                  </tr>
                  <tr v-if="!items.length"><td colspan="9" class="empty-cell">暂无可配置的模型来源</td></tr>
                </tbody>
              </table>
            </div>
            <footer class="provider-table-footer">
              <span>共 {{ items.length }} 个来源，当前显示 {{ currentRange }}</span>
              <div>
                <button type="button" :disabled="page <= 1" @click="changePage(page - 1)">上一页</button>
                <span>第 {{ Math.min(page, totalPages) }} / {{ totalPages }} 页</span>
                <button type="button" :disabled="page >= totalPages" @click="changePage(page + 1)">下一页</button>
              </div>
            </footer>
          </section>

          <section class="panel provider-routing-note" aria-label="调用策略说明">
            <h2>调用策略说明</h2>
            <ul>
              <li><strong>优先级</strong><span>所有真实 AI 请求固定先调用已配置的 DAPI。</span></li>
              <li><strong>故障切换</strong><span>仅在 DAPI 不可达、401、429、超时或 5xx 时切换到已批准的远程备用。</span></li>
              <li><strong>凭据保护</strong><span>密钥仅从服务端进程环境读取，后台不会回显、写入或保存密钥。</span></li>
              <li><strong>失败状态</strong><span>远程 Provider 均失败时进入安全模板或失败状态，绝不会启动本地模型。</span></li>
            </ul>
          </section>
        </div>

        <aside v-if="selected && editor" class="panel provider-editor" aria-label="供应商配置">
          <header class="provider-editor-heading">
            <div>
              <span>供应商配置</span>
              <h2>{{ selected.name }}</h2>
            </div>
            <span class="provider-type" :class="typeTone(selected)">{{ typeLabel(selected) }}</span>
          </header>

          <p class="provider-editor-note">模型类型和凭据状态由服务端维护；此处不会显示或写入 API 密钥。</p>

          <div class="provider-editor-fields">
            <label><span>显示名称</span><input v-model="editor.name" data-testid="admin-provider-name-input" :disabled="busy || saving || isLocalProvider(selected)" /></label>
            <label><span>模型名称</span><input v-model="editor.modelName" :disabled="busy || saving || isLocalProvider(selected)" /></label>
            <label><span>调用地址</span><input v-model="editor.baseUrl" :disabled="busy || saving || isLocalProvider(selected)" type="url" /></label>
            <label><span>优先级</span><input v-model.number="editor.priority" :disabled="busy || saving || isLocalProvider(selected)" min="0" type="number" /></label>
            <label><span>单日调用上限</span><input v-model.number="editor.dailyLimit" :disabled="busy || saving || isLocalProvider(selected)" min="0" type="number" /></label>
            <label><span>超时时间（秒）</span><input v-model.number="editor.timeoutSeconds" :disabled="busy || saving || isLocalProvider(selected)" min="1" type="number" /></label>
            <label class="provider-editor-toggle"><span><strong>失败自动切换</strong><small>该来源调用失败时允许路由继续尝试</small></span><input v-model="editor.failoverEnabled" :disabled="busy || saving || isLocalProvider(selected)" type="checkbox" /></label>
            <label><span>用途标签</span><input v-model="editor.usageTags" :disabled="busy || saving || isLocalProvider(selected)" placeholder="用逗号分隔，例如 text, backup" /></label>
          </div>

          <dl class="provider-readonly">
            <dt>凭据状态</dt><dd>{{ selected.apiKeyStatus === 'missing' ? '未配置' : '已配置' }}</dd>
            <dt>今日调用</dt><dd data-visual-mask="stat">{{ formatCalls(selected.todayCalls) }}</dd>
            <dt>平均耗时</dt><dd :data-visual-mask="selected.avgLatencyMs ? 'stat' : undefined">{{ selected.avgLatencyMs ? selected.avgLatencyMs + 'ms' : '暂无调用记录' }}</dd>
          </dl>

          <div class="provider-editor-actions">
            <button type="button" :disabled="busy || saving || !editorChanged" @click="resetSelected">恢复</button>
            <button class="primary" data-testid="admin-provider-edit" type="button" :disabled="busy || saving || !editorChanged || isLocalProvider(selected)" @click="saveSelected">
              {{ saving ? '保存中…' : '保存配置' }}
            </button>
          </div>
        </aside>

        <aside v-else class="panel provider-editor provider-editor-empty" aria-live="polite">
          <h2>供应商配置</h2>
          <p>选择一条真实供应商记录后，可在这里查看并编辑其非敏感运行参数。</p>
        </aside>
      </section>
    </section>
  </Layout>
</template>

<style scoped>
.providers-page {
  width: min(100%, 1170px);
  margin: 0 auto;
  gap: 16px;
  padding-bottom: 24px;
}

.providers-intro { display: none; }

.providers-intro h1 {
  font-size: 25px;
}

.providers-intro p {
  max-width: 700px;
  margin-top: 5px;
  font-size: 14px;
}

.providers-intro .primary {
  min-width: 142px;
  min-height: 40px;
}

.provider-heading-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.provider-heading-actions .primary {
  min-width: 126px;
  min-height: 38px;
  flex: 0 0 auto;
}

.provider-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.provider-metrics article {
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 164px;
  align-content: start;
  gap: 7px;
  padding: 17px 18px;
  border: 1px solid #e4e8df;
  border-radius: 12px;
  background: linear-gradient(145deg, #fff 0%, #fbfcf8 100%);
  box-shadow: 0 10px 24px rgba(48, 62, 47, .045);
}

.provider-metrics article::after {
  position: absolute;
  top: 22px;
  right: 20px;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: #eff4e8;
  content: '';
}

.provider-metrics article:nth-child(3)::after {
  background: #eef2f8;
}

.provider-metrics strong,
.provider-metrics span,
.provider-metrics p {
  position: relative;
  z-index: 1;
}

.provider-metrics span {
  color: #6f796d;
  font-size: 13px;
}

.provider-metrics strong {
  overflow: hidden;
  color: #3c5140;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 29px;
  line-height: 1.08;
}

.provider-metrics strong small {
  color: #7e887d;
  font-size: 16px;
  font-weight: 500;
}

.provider-metrics p {
  overflow: hidden;
  margin: 0;
  color: #8a9388;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.provider-status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.provider-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 336px;
  gap: 18px;
  align-items: start;
  margin-top: 11px;
}

.provider-left-stack {
  display: grid;
  min-width: 0;
  gap: 33px;
}

.provider-table-panel {
  min-width: 0;
  padding: 0;
  overflow: hidden;
}

.provider-table-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 13px;
  border-bottom: 1px solid #eceee8;
}

.provider-table-heading h2 {
  margin: 0;
  color: #374638;
  font-size: 18px;
}

.provider-table-heading p {
  margin: 5px 0 0;
  color: #7f887e;
  font-size: 12px;
  line-height: 1.5;
}

.provider-loading {
  flex: 0 0 auto;
  color: #648257;
  font-size: 12px;
  white-space: nowrap;
}

.provider-table-shell {
  width: 100%;
  overflow-x: auto;
}

.provider-table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
  padding: 9px 16px;
  border-top: 1px solid #edf0e9;
  color: #7b8579;
  font-size: 12px;
}

.provider-table-footer > div {
  display: flex;
  align-items: center;
  gap: 7px;
}

.provider-table-footer button {
  min-height: 28px;
  padding: 4px 8px;
  font-size: 12px;
}

.provider-table {
  min-width: 930px;
  table-layout: fixed;
}

.provider-table th,
.provider-table td {
  padding: 14px 9px;
  vertical-align: middle;
}

.provider-table th {
  color: #657064;
  background: #fbfcfa;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.provider-table th:nth-child(1) { width: 15%; }
.provider-table th:nth-child(2) { width: 15%; }
.provider-table th:nth-child(3) { width: 9%; }
.provider-table th:nth-child(4) { width: 17%; }
.provider-table th:nth-child(5) { width: 12%; }
.provider-table th:nth-child(6) { width: 7%; }
.provider-table th:nth-child(7) { width: 8%; }
.provider-table th:nth-child(8) { width: 7%; }
.provider-table th:nth-child(9) { width: 10%; }

.provider-table tbody tr {
  cursor: pointer;
  transition: background .15s ease;
}

.provider-table tbody tr:hover,
.provider-table tbody tr.selected {
  background: #f2f7ed;
}

.provider-table tbody tr:focus {
  outline: 2px solid #b8cfa9;
  outline-offset: -2px;
}

.provider-table td {
  overflow: hidden;
  color: #4e594e;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.provider-table td strong,
.provider-table td small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-table td strong {
  color: #3f4d40;
  font-size: 12px;
  font-weight: 650;
}

.provider-table td small {
  margin-top: 3px;
  color: #899287;
  font-size: 11px;
}

.provider-url-cell,
.provider-usage-cell {
  color: #707a70 !important;
}

.provider-type {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  min-height: 23px;
  padding: 2px 7px;
  border: 1px solid #dde6d8;
  border-radius: 999px;
  color: #607956;
  background: #f2f7ee;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
}

.provider-type.is-cloud {
  border-color: #d9e3f0;
  color: #597ba1;
  background: #f0f5fb;
}

.provider-type.is-template {
  border-color: #e9dfc8;
  color: #95763b;
  background: #fcf8ed;
}

.provider-type.is-neutral {
  border-color: #e3e3df;
  color: #73766f;
  background: #f7f7f5;
}

.status-badge.disabled {
  border-color: #ece1de;
  color: #a96a61;
  background: #fff5f3;
}

.provider-actions {
  overflow: visible !important;
  white-space: normal !important;
}

.provider-actions button {
  min-height: 29px;
  padding: 4px 6px;
  border: 0;
  color: #587a4d;
  background: transparent;
  font-size: 12px;
}

.provider-actions button + button {
  color: #8b7354;
}

.provider-editor {
  position: sticky;
  top: 14px;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  border-color: #e4e6df;
  border-radius: 12px;
}

.provider-editor > * {
  min-width: 0;
}

.provider-editor-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 17px 17px 13px;
  border-bottom: 1px solid #eceee8;
}

.provider-editor-heading > div {
  min-width: 0;
}

.provider-editor-heading > div > span {
  color: #7c867a;
  font-size: 12px;
}

.provider-editor-heading h2 {
  overflow: hidden;
  margin: 4px 0 0;
  color: #394739;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 17px;
}

.provider-editor-note {
  margin: 0 17px;
  color: #7e877c;
  font-size: 12px;
  line-height: 1.55;
}

.provider-editor-fields {
  display: grid;
  gap: 10px;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding: 0 17px;
}

.provider-editor-fields label {
  display: grid;
  gap: 5px;
  min-width: 0;
  color: #677266;
  font-size: 12px;
}

.provider-editor-fields input {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 37px;
}

.provider-editor-toggle {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  min-height: 52px;
  padding: 9px 10px;
  border: 1px solid #e2ebdd;
  border-radius: 8px;
  background: #fbfdf9;
}

.provider-editor-toggle span {
  display: grid;
  gap: 3px;
}

.provider-editor-toggle strong {
  color: #505a50;
  font-size: 12px;
}

.provider-editor-toggle small {
  color: #899188;
  font-size: 11px;
  line-height: 1.35;
}

.provider-editor-toggle input {
  width: 18px;
  height: 18px;
  min-height: 18px;
}

.provider-readonly {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px 10px;
  margin: 0 17px;
  padding: 13px 0;
  border-top: 1px solid #eef0ec;
  border-bottom: 1px solid #eef0ec;
  font-size: 12px;
}

.provider-readonly dt {
  color: #889087;
}

.provider-readonly dd {
  margin: 0;
  color: #4b584b;
  text-align: right;
}

.provider-editor-actions {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 9px;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding: 0 17px 17px;
}

.provider-editor-actions button {
  min-width: 0;
  min-height: 38px;
}

.provider-editor-empty {
  min-height: 204px;
  align-content: start;
  padding: 18px;
}

.provider-editor-empty h2 {
  margin: 0;
  color: #415041;
  font-size: 17px;
}

.provider-editor-empty p {
  margin: 8px 0 0;
  color: #7c867c;
  font-size: 13px;
  line-height: 1.6;
}

.provider-routing-note {
  display: grid;
  gap: 14px;
  min-height: 224px;
  padding: 19px 20px;
}

.provider-routing-note h2 {
  margin: 0;
  color: #41483e;
  font-size: 17px;
}

.provider-routing-note ul {
  display: grid;
  gap: 11px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.provider-routing-note li {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  gap: 10px;
  align-items: baseline;
  color: #767f74;
  font-size: 12px;
  line-height: 1.5;
}

.provider-routing-note strong {
  color: #6b8354;
  font-size: 13px;
}

@media (max-width: 1180px) {
  .provider-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .provider-workspace {
    grid-template-columns: minmax(0, 1fr) 310px;
  }
}

@media (min-width: 1181px) {
  .provider-workspace {
    grid-template-columns: minmax(0, 1fr) 343px;
    column-gap: 18px;
    row-gap: 37px;
  }

  .provider-table-heading {
    padding: 21px 18px 22px;
  }

  .provider-table-heading p {
    display: none;
  }

  .provider-table th {
    padding-top: 18px;
    padding-bottom: 18px;
  }

  /* Keep every editable, non-sensitive value on the first desktop screen.
     The three compact numeric controls remain independent real inputs, while
     the identity, endpoint and tag fields retain their full readable width. */
  .provider-editor-fields {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .provider-editor-fields label {
    gap: 4px;
    font-size: 11px;
  }

  .provider-editor-fields label:nth-child(1),
  .provider-editor-fields label:nth-child(2),
  .provider-editor-fields label:nth-child(3),
  .provider-editor-fields label:nth-child(7),
  .provider-editor-fields label:nth-child(8) {
    grid-column: 1 / -1;
  }

  .provider-editor-fields input {
    min-height: 34px;
    font-size: 12px;
  }

  .provider-editor-toggle {
    min-height: 48px;
    padding: 8px 9px;
  }

  .provider-readonly {
    padding: 10px 0;
  }

  .provider-editor-actions {
    padding-bottom: 15px;
  }

  .provider-editor {
    align-content: start;
    min-height: 744px;
  }
}

@media (max-width: 980px) {
  .provider-workspace {
    grid-template-columns: 1fr;
  }

  .provider-editor {
    position: static;
  }
}

@media (max-width: 640px) {
  .providers-page {
    width: 100%;
  }

  .providers-intro {
    align-items: flex-start;
    flex-direction: column;
  }

  .provider-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
