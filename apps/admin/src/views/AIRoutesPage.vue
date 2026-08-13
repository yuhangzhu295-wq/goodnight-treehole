<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Layout from './Layout.vue';
import { adminApi } from '../api';

const routes = ref<any[]>([]);
const providers = ref<any[]>([]);
const selected = ref<any>();
const busy = ref(false);
const status = ref('正在读取分配规则…');
const testContent = ref('这是一条用于验证风格路由的后台测试内容。');

const fallbackLabels: Record<string, string> = {
  light: '轻松一点',
  clear: '清醒提醒',
  poetic: '诗意疗愈',
  warm: '暖心陪伴',
  rational: '理性分析',
  human: '真人支持',
};

const styleGlyphs: Record<string, string> = {
  warm: '暖',
  rational: '理',
  light: '轻',
  clear: '醒',
  poetic: '诗',
  human: '人',
};

const activeCount = computed(() => routes.value.filter((route) => route.enabled).length);
const enabledProviders = computed(() => providers.value.filter((provider) => provider.enabled));

function provider(id?: string) {
  return providers.value.find((item) => item.id === id);
}

function routeName(route: any) {
  return route.label || fallbackLabels[route.style] || route.style;
}

function providerName(id?: string) {
  return provider(id)?.name || '未配置';
}

function providerModel(id?: string) {
  return provider(id)?.modelName || '—';
}

function compactText(value: unknown, maxLength: number) {
  const text = String(value || '').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function providerDisplayName(id?: string) {
  const item = provider(id);
  if (!item) return '未配置';
  const model = providerDisplayModel(id);
  if (item.type === 'template' || item.providerKind === 'template') {
    if (/safe-response-template/i.test(item.modelName)) return '安全模板';
    if (/fallback-template/i.test(item.modelName)) return '模板兜底';
    return compactText(item.name, 12);
  }
  if (item.modelMeta?.fixtureOnly) return 'Fixture Stub';
  if (item.type === 'local' || item.providerKind === 'local' || item.providerKind === 'ollama') {
    return `本地 ${model.split(' ')[0] || '模型'}`;
  }
  return compactText(item.name, 14);
}

function providerDisplayModel(id?: string) {
  const raw = providerModel(id);
  if (raw === '—') return raw;
  if (/safe-response-template/i.test(raw)) return '安全回复模板';
  if (/fallback-template/i.test(raw)) return '默认兜底模板';
  if (/legacy-template/i.test(raw)) return '兼容兜底模板';
  if (/deepseek-chat/i.test(raw)) return 'DeepSeek Chat';
  if (/moonshot-v1/i.test(raw)) return 'Moonshot V1';
  if (/gpt-4o-mini/i.test(raw)) return 'GPT-4o mini';
  if (/doubao-pro/i.test(raw)) return '豆包 Pro';
  if (/claude-3-haiku/i.test(raw)) return 'Claude 3 Haiku';
  if (/minicpm-v/i.test(raw)) return 'MiniCPM-V';
  if (/llava/i.test(raw))
    return raw.match(/\d+(?:\.\d+)?b/i) ? `LLaVA ${raw.match(/\d+(?:\.\d+)?b/i)?.[0].toUpperCase()}` : 'LLaVA';
  if (/qwen/i.test(raw)) {
    const version = raw.match(/qwen[-_ ]?(\d+(?:\.\d+)?)/i)?.[1];
    const size = raw.match(/(\d+(?:\.\d+)?)b/i)?.[1];
    return `Qwen${version ? ` ${version}` : ''}${size ? ` ${size}B` : ''}`.trim();
  }
  return compactText(raw.replace(/:latest$/i, '').replaceAll('-', ' '), 16);
}

function providerTitle(id?: string) {
  const name = providerName(id);
  const model = providerModel(id);
  return model === '—' ? name : `${name} / ${model}`;
}

function flowProviderSummary(field: string) {
  const names = [
    ...new Set(
      routes.value
        .map((route) => route[field])
        .filter(Boolean)
        .map((id) => providerDisplayName(id)),
    ),
  ];
  if (!names.length) return '等待路由配置';
  return names.length <= 2 ? names.join(' / ') : `${names.slice(0, 2).join(' / ')} 等`;
}

function flowProviderTitle(field: string) {
  return [
    ...new Set(
      routes.value
        .map((route) => route[field])
        .filter(Boolean)
        .map((id) => providerTitle(id)),
    ),
  ].join(' / ');
}

function providerKind(id?: string) {
  const item = provider(id);
  if (!item) return '未配置';
  if (item.modelMeta?.fixtureOnly) return 'Fixture Stub';
  if (item.type === 'template' || item.providerKind === 'template') return '模板';
  if (item.type === 'local' || item.providerKind === 'local' || item.providerKind === 'ollama') return '本地';
  return '云端';
}

function promptSummary(route: any) {
  const text = String(route.promptTemplate || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!text) return '暂无路由提示说明';
  return compactText(text, 16);
}

function promptVersionLabel(value?: string) {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const version = raw.match(/v?(\d+(?:\.\d+){0,2})/i)?.[1];
  return version ? `v${version}` : compactText(raw, 10);
}

function open(route: any) {
  selected.value = { ...route };
}

async function load() {
  busy.value = true;
  try {
    const [routeResponse, providerResponse] = await Promise.all([
      adminApi.get<any>('/api/admin/v1/ai/routes?page=1&pageSize=100'),
      adminApi.get<any>('/api/admin/v1/ai/providers?page=1&pageSize=100'),
    ]);
    routes.value = routeResponse.items ?? [];
    providers.value = providerResponse.items ?? [];
    status.value = `已从服务端读取 ${routes.value.length} 条分配规则`;
  } catch (error: any) {
    status.value = error?.message ?? '规则加载失败';
  } finally {
    busy.value = false;
  }
}

async function save() {
  if (!selected.value) return;
  busy.value = true;
  try {
    await adminApi.patch(`/api/admin/v1/ai/routes/${selected.value.style}`, {
      primaryProviderId: selected.value.primaryProviderId,
      backupProviderId: selected.value.backupProviderId,
      enabled: selected.value.enabled,
    });
    await load();
    const refreshed = routes.value.find((route) => route.style === selected.value.style);
    if (refreshed) selected.value = { ...refreshed };
    status.value = '分配规则已保存，并已从服务端重新读取';
  } catch (error: any) {
    status.value = error?.message ?? '规则保存失败';
  } finally {
    busy.value = false;
  }
}

async function test(route = selected.value) {
  if (!route) return;
  busy.value = true;
  try {
    const response = await adminApi.post<any>(`/api/admin/v1/ai/routes/${route.style}/test`, {
      content: testContent.value,
    });
    status.value = `真实测试任务已创建：${response.jobId ?? response.job?.id ?? '等待任务记录刷新'}`;
  } catch (error: any) {
    status.value = error?.message ?? '创建测试任务失败';
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <Layout>
    <section class="operation-page route-page">
      <header class="page-intro">
        <div>
          <h1>AI 风格路由配置</h1>
          <p>每种回应风格固定先走 CLI Proxy API，再在指定故障条件下切换 DeepSeek；两者失败会保留真实失败状态。</p>
        </div>
      </header>

      <section class="panel route-flow" aria-label="AI 路由执行顺序">
        <div class="route-flow-heading">
          <div>
            <h2>路由流程</h2>
            <p>当前 {{ activeCount }} / {{ routes.length }} 条规则启用</p>
          </div>
          <button type="button" :disabled="busy" @click="load">刷新配置</button>
        </div>
        <div class="route-flow-steps">
          <div class="route-flow-step primary-step">
            <span class="flow-index">1</span>
            <div>
              <strong>CLI Proxy</strong>
              <small :title="flowProviderTitle('primaryProviderId')">{{
                flowProviderSummary('primaryProviderId')
              }}</small>
            </div>
          </div>
          <span class="route-flow-arrow" aria-hidden="true">→</span>
          <div class="route-flow-step backup-step">
            <span class="flow-index">2</span>
            <div>
              <strong>DeepSeek</strong>
              <small :title="flowProviderTitle('backupProviderId')">{{
                flowProviderSummary('backupProviderId')
              }}</small>
            </div>
          </div>
          <span class="route-flow-arrow" aria-hidden="true">→</span>
          <div class="route-flow-step fallback-step">
            <span class="flow-index">3</span>
            <div>
              <strong>失败记录</strong>
              <small>两个远程 Provider 均失败时标记 failed</small>
            </div>
          </div>
        </div>
      </section>

      <section class="panel route-list-panel">
        <div class="route-list-heading">
          <div>
            <h2>风格路由列表</h2>
            <p>点击整行或“编辑”可调整真实服务端规则；“测试”会创建一条真实异步任务。</p>
          </div>
          <p class="muted route-status" role="status">{{ status }}</p>
        </div>

        <section class="table-panel ops-table-panel route-table-panel">
          <table class="table resource-table ops-table route-table">
            <colgroup>
              <col class="style-column" />
              <col class="model-column" />
              <col class="model-column" />
              <col class="fallback-column" />
              <col class="version-column" />
              <col class="action-column" />
            </colgroup>
            <thead>
              <tr>
                <th>风格名称</th>
                <th>主模型（优先）</th>
                <th>备用模型（次选）</th>
                <th>失败处理</th>
                <th>Prompt 版本</th>
                <th class="action-heading">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="route in routes"
                :key="route.style"
                :class="{ selected: selected?.style === route.style }"
                :data-testid="`admin-route-card-${route.style}`"
                @click="open(route)"
              >
                <td>
                  <div class="route-name-cell">
                    <span class="route-glyph" :class="`style-${route.style}`">{{
                      styleGlyphs[route.style] ?? '路'
                    }}</span>
                    <div>
                      <strong>{{ routeName(route) }}</strong>
                      <div class="route-caption">
                        <small :title="route.promptTemplate">{{ promptSummary(route) }}</small>
                        <span class="route-enabled" :class="{ disabled: !route.enabled }">{{
                          route.enabled ? '启用中' : '已停用'
                        }}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="provider-cell">
                    <strong :title="providerTitle(route.primaryProviderId)">{{
                      providerDisplayName(route.primaryProviderId)
                    }}</strong>
                    <div class="provider-meta">
                      <small :title="providerModel(route.primaryProviderId)">{{
                        providerDisplayModel(route.primaryProviderId)
                      }}</small>
                      <span class="provider-kind">{{ providerKind(route.primaryProviderId) }}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="provider-cell">
                    <strong :title="providerTitle(route.backupProviderId)">{{
                      providerDisplayName(route.backupProviderId)
                    }}</strong>
                    <div class="provider-meta">
                      <small :title="providerModel(route.backupProviderId)">{{
                        providerDisplayModel(route.backupProviderId)
                      }}</small>
                      <span class="provider-kind backup-kind">{{ providerKind(route.backupProviderId) }}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="provider-cell fallback-cell"><strong>如实失败</strong><div class="provider-meta"><small>不启动本地模型</small><span class="provider-kind fallback-kind">失败终态</span></div></div>
                </td>
                <td>
                  <div class="version-cell">
                    <strong :title="route.promptVersion">{{ promptVersionLabel(route.promptVersion) }}</strong>
                    <small>规则 r{{ route.routeVersion ?? 1 }}</small>
                  </div>
                </td>
                <td>
                  <div class="row-actions route-actions">
                    <button
                      type="button"
                      :disabled="busy"
                      :data-testid="`admin-route-edit-${route.style}`"
                      @click.stop="open(route)"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      class="route-test-button"
                      :disabled="busy"
                      :data-testid="`admin-route-test-${route.style}`"
                      @click.stop="test(route)"
                    >
                      测试
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="!routes.length">
                <td colspan="6" class="empty-cell">暂无可展示的风格路由，请刷新配置后重试。</td>
              </tr>
            </tbody>
          </table>
        </section>
        <footer class="route-list-note" role="note">
          <span aria-hidden="true">i</span>
          <p>提示：CLI Proxy 不可达、401、429、超时或 5xx 时才会切换 DeepSeek；两个远程 Provider 均失败时会保留失败任务记录。</p>
        </footer>
      </section>

      <div v-if="selected" class="detail-drawer-mask" @click.self="selected = undefined">
        <aside class="detail-drawer" role="dialog" aria-modal="true" aria-label="分配规则详情">
          <header class="detail-drawer-header">
            <div>
              <span>分配规则</span>
              <h2>{{ routeName(selected) }}</h2>
            </div>
            <button type="button" class="detail-close" aria-label="关闭详情" @click="selected = undefined">×</button>
          </header>
          <div class="detail-drawer-body">
            <section class="detail-group route-drawer-summary">
              <h3>当前路由</h3>
              <dl>
                <dt>失败处理</dt>
                <dd>两个远程 Provider 均失败时保留 failed 状态</dd>
                <dt>Prompt 版本</dt>
                <dd>{{ selected.promptVersion || '—' }}</dd>
                <dt>路由版本</dt>
                <dd>v{{ selected.routeVersion ?? 1 }}</dd>
              </dl>
            </section>
            <label>
              主模型
              <select v-model="selected.primaryProviderId" disabled>
                <option v-for="item in enabledProviders" :key="item.id" :value="item.id">
                  {{ item.name }} / {{ item.modelName }}
                </option>
              </select>
            </label>
            <label>
              备用模型
              <select v-model="selected.backupProviderId" disabled>
                <option value="">不配置备用模型</option>
                <option v-for="item in enabledProviders" :key="item.id" :value="item.id">
                  {{ item.name }} / {{ item.modelName }}
                </option>
              </select>
            </label>
            <label class="route-enabled-control">
              <input v-model="selected.enabled" type="checkbox" :disabled="busy" />
              <span>启用这条规则</span>
            </label>
            <label>
              测试内容
              <textarea v-model="testContent" rows="4" :disabled="busy" />
            </label>
            <div class="drawer-actions">
              <button class="primary" type="button" data-testid="admin-route-save" :disabled="busy" @click="save">
                保存规则
              </button>
              <button type="button" data-testid="admin-route-test" :disabled="busy" @click="test()">
                创建测试任务
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  </Layout>
</template>

<style scoped>
.route-page {
  gap: 18px;
}

.route-flow {
  padding: 21px 22px 23px;
}
.route-flow-heading,
.route-list-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}
.route-flow-heading h2,
.route-list-heading h2 {
  margin: 0;
  color: #363b35;
  font-size: 18px;
}
.route-flow-heading p,
.route-list-heading p {
  margin: 7px 0 0;
  color: #77746d;
  font-size: 13px;
  line-height: 1.55;
}
.route-flow-heading button {
  min-width: 94px;
}

.route-flow-steps {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px minmax(0, 1fr) 34px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  margin-top: 20px;
}
.route-flow-step {
  display: flex;
  min-width: 0;
  gap: 12px;
  align-items: center;
  min-height: 86px;
  padding: 15px 16px;
  border: 1px solid #eee9df;
  border-radius: 10px;
  background: linear-gradient(115deg, #fffefa, #fbfbf7);
}
.route-flow-step > div {
  min-width: 0;
}
.flow-index {
  display: grid;
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  background: #73975f;
  font-size: 16px;
  font-weight: 700;
}
.backup-step .flow-index {
  background: #7496cc;
}
.fallback-step .flow-index {
  background: #c8a15d;
}
.route-flow-step strong,
.route-flow-step small {
  display: block;
}
.route-flow-step strong {
  color: #3e3d38;
  font-size: 16px;
}
.route-flow-step small {
  overflow: hidden;
  margin-top: 6px;
  color: #858077;
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.route-flow-arrow {
  color: #778b65;
  font-size: 30px;
  text-align: center;
}

.route-list-panel {
  padding: 0;
  overflow: hidden;
}
.route-list-heading {
  padding: 22px 22px 16px;
}
.route-status {
  max-width: 440px;
  text-align: right;
}
.route-table-panel {
  padding: 0;
  overflow-x: auto;
}
.route-table {
  min-width: 1010px;
  table-layout: fixed;
}
.route-table .style-column {
  width: 23%;
}
.route-table .model-column {
  width: 16%;
}
.route-table .fallback-column {
  width: 16%;
}
.route-table .version-column {
  width: 12%;
}
.route-table .action-column {
  width: 17%;
}
.route-table th {
  padding: 12px 14px;
  color: #5e5c55;
  background: #fbfaf6;
  font-size: 13px;
  font-weight: 600;
}
.route-table td {
  padding: 11px 14px;
  border-color: #eeeae2;
  vertical-align: middle;
}
.route-table tbody tr {
  transition: background 0.16s ease;
}
.route-table tbody tr:hover,
.route-table tbody tr.selected {
  background: #f7faf3;
}
.route-table .action-heading {
  text-align: center;
}

.route-name-cell {
  display: flex;
  min-width: 0;
  gap: 11px;
  align-items: center;
}
.route-name-cell > div {
  min-width: 0;
}
.route-glyph {
  display: grid;
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 50%;
  color: #89615a;
  background: #fae7e3;
  font-size: 15px;
  font-weight: 700;
}
.route-glyph.style-rational {
  color: #6a8351;
  background: #edf3e4;
}
.route-glyph.style-light {
  color: #bb8b35;
  background: #fbefcf;
}
.route-glyph.style-clear {
  color: #6581b2;
  background: #e6edf8;
}
.route-glyph.style-poetic {
  color: #8965a6;
  background: #eee6f5;
}
.route-name-cell strong,
.provider-cell strong,
.version-cell strong {
  display: block;
  color: #40403a;
  font-size: 14px;
  line-height: 1.35;
}
.route-caption,
.provider-meta {
  display: flex;
  min-width: 0;
  gap: 6px;
  align-items: center;
  margin-top: 4px;
}
.route-caption small,
.provider-meta small,
.version-cell small {
  display: block;
  overflow: hidden;
  min-width: 0;
  margin: 0;
  color: #85817a;
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.route-enabled,
.provider-kind {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  min-height: 18px;
  margin: 0;
  padding: 0 6px;
  border-radius: 5px;
  color: #69905b;
  background: #edf5e8;
  font-size: 10px;
}
.route-enabled.disabled {
  color: #9a786a;
  background: #fbebe6;
}
.provider-kind {
  color: #668b5d;
  background: #eff5ea;
}
.backup-kind {
  color: #6d8fc5;
  background: #edf2fb;
}
.fallback-kind {
  color: #b78740;
  background: #fcf2df;
}
.provider-cell {
  min-width: 0;
}
.fallback-cell strong {
  color: #5d5140;
}
.version-cell strong {
  font-variant-numeric: tabular-nums;
}
.version-cell small {
  margin-top: 4px;
}

.route-actions {
  min-width: 0;
  justify-content: center;
  flex-wrap: nowrap;
}
.route-actions button {
  min-width: 54px;
  border-color: #c6d8be;
  color: #557843;
  background: #fffefa;
}
.route-actions .route-test-button {
  border-color: #9fbd90;
  color: #4d7745;
}

.route-drawer-summary {
  margin: 0 0 16px;
}
.route-enabled-control {
  display: flex !important;
  gap: 8px !important;
  align-items: center;
  min-height: 36px;
}
.route-enabled-control input {
  width: 18px;
  height: 18px;
}

.route-list-note {
  display: flex;
  gap: 10px;
  align-items: center;
  min-height: 42px;
  margin: 25px 22px 20px;
  padding: 9px 13px;
  border: 1px solid #e1e8da;
  border-radius: 9px;
  color: #72806d;
  background: linear-gradient(100deg, #f7faf4, #fbfcf9);
  font-size: 12px;
  line-height: 1.45;
}

.route-list-note > span {
  display: grid;
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  background: #72935f;
  font: 700 11px/1 Georgia, serif;
}

.route-list-note p {
  margin: 0;
}

@media (min-width: 1000px) {
  .route-page {
    padding-top: 7px;
  }

  .route-flow {
    min-height: 182px;
    margin-top: 10px;
    padding-bottom: 20px;
  }

  .route-flow-heading p {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .route-flow-steps {
    margin-top: 5px;
  }

  .route-list-panel {
    margin-top: 8px;
  }

  .route-list-heading {
    padding: 22px 22px 5px;
  }

  .route-table th {
    padding-top: 15px;
    padding-bottom: 15px;
  }

  .route-table tbody tr {
    height: 83px;
  }
}

@media (max-width: 900px) {
  .route-flow-steps {
    grid-template-columns: 1fr;
    gap: 9px;
  }
  .route-flow-arrow {
    height: 22px;
    font-size: 24px;
    line-height: 1;
    transform: rotate(90deg);
  }
  .route-flow-step {
    min-height: 68px;
  }
}

@media (max-width: 620px) {
  .route-flow-heading,
  .route-list-heading {
    display: grid;
  }
  .route-flow-heading button {
    width: 100%;
  }
  .route-status {
    max-width: none;
    text-align: left;
  }
}
</style>
