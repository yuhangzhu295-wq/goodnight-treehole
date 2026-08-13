<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import Layout from './Layout.vue';
import { adminApi } from '../api';

type Resource =
  | 'users'
  | 'posts'
  | 'replies'
  | 'providers'
  | 'routes'
  | 'jobs'
  | 'tickets'
  | 'faqs'
  | 'presets'
  | 'categories'
  | 'settings'
  | 'audit';

type Column = {
  key: string;
  label: string;
  className?: string;
  value: (row: any) => string | number | boolean | undefined;
};

type DetailEntry = { label: string; value: string | number | boolean | undefined };
type DetailGroup = { title: string; entries: DetailEntry[] };

const props = defineProps<{ resource: Resource; title: string }>();

const endpoints: Record<Resource, string> = {
  users: '/api/admin/v1/users',
  posts: '/api/admin/v1/posts',
  replies: '/api/admin/v1/replies',
  providers: '/api/admin/v1/ai/providers',
  routes: '/api/admin/v1/ai/routes',
  jobs: '/api/admin/v1/ai/jobs',
  tickets: '/api/admin/v1/feedback',
  faqs: '/api/admin/v1/faqs',
  presets: '/api/admin/v1/reply-presets',
  categories: '/api/admin/v1/feedback-categories',
  settings: '/api/admin/v1/config',
  audit: '/api/admin/v1/audit-logs',
};

const items = ref<any[]>([]);
const selectedId = ref('');
const detailOpen = ref(false);
const search = ref('');
const filter = ref('all');
const actionText = ref('');
const status = ref('');
const busy = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const configForm = ref<Record<string, any>>({});
const providerOptions = ref<Array<{ id: string; name: string; enabled: boolean }>>([]);

const selected = computed(() => items.value.find((item) => item.__rowId === selectedId.value) ?? items.value[0]);

const actionInput = computed(() => {
  const prompts: Partial<Record<Resource, { label: string; placeholder: string }>> = {
    users: { label: '用户备注', placeholder: '输入运营备注后保存' },
    replies: { label: '回应内容', placeholder: '需要修改时输入新的回应内容' },
    providers: { label: '模型来源名称', placeholder: '新增或修改模型来源名称' },
    routes: { label: '测试内容', placeholder: '输入用于测试分配规则的内容' },
    tickets: { label: '回复用户', placeholder: '输入给用户的处理回复' },
    faqs: { label: 'FAQ 问题', placeholder: '输入新问题后新增 FAQ' },
    presets: { label: '预设内容', placeholder: '输入新的回复预设内容' },
    categories: { label: '分类名称', placeholder: '输入新的反馈分类名称' },
  };
  return prompts[props.resource] ?? { label: '操作内容', placeholder: '输入操作所需内容' };
});

function text(value: unknown, fallback = '-') {
  if (value == null || value === '') return fallback;
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

function mediaUrl(url: string) {
  if (url.startsWith('http')) return url;
  return `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'}${url}`;
}

function time(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function clip(value?: string, length = 36) {
  const raw = text(value, '');
  return raw.length > length ? `${raw.slice(0, length)}...` : raw;
}

function statusLabel(value?: string) {
  const map: Record<string, string> = {
    normal: '正常',
    limited: '禁言',
    muted: '禁言',
    banned: '封禁',
    active: '有效',
    deleted: '已删除',
    pending_review: '待审核',
    published: '已发布',
    hidden: '已隐藏',
    rejected: '已拒绝',
    blocked: '已拦截',
    success: '成功',
    queued: '排队中',
    running: '运行中',
    succeeded: '成功',
    fallback: '安全兜底',
    cancelled: '已取消',
    fallback_completed: '兜底完成',
    failed: '失败',
    open: '待处理',
    processing: '处理中',
    resolved: '已解决',
    closed: '已关闭',
  };
  return map[value ?? ''] ?? text(value);
}

function userName(userId?: string) {
  const user = resourceCache.users.find((item: any) => item.id === userId);
  return user ? `${user.nickname} / ${user.anonymousCode}` : text(userId);
}

const resourceCache: Record<string, any[]> = {
  users: [],
  posts: [],
  replies: [],
  categories: [],
  providers: [],
};

function withRowId<T extends Record<string, any>>(item: T, fallback: string): T & { __rowId: string } {
  return { ...item, __rowId: String(item.id ?? item.key ?? item.style ?? fallback) };
}

const columns = computed<Column[]>(() => {
  const map: Record<Resource, Column[]> = {
    users: [
      { key: 'id', label: '用户 ID', value: (row) => row.id },
      { key: 'name', label: '昵称/匿名代号', value: (row) => `${row.nickname} / ${row.anonymousCode}` },
      { key: 'createdAt', label: '注册时间', value: (row) => time(row.createdAt) },
      { key: 'activity', label: '内容数', value: (row) => `${row.postCount ?? 0} 树洞 / ${row.replyCount ?? 0} 回应` },
      { key: 'status', label: '状态', className: 'status-cell', value: (row) => statusLabel(row.status) },
    ],
    posts: [
      { key: 'id', label: '树洞 ID', value: (row) => row.id },
      { key: 'user', label: '用户', value: (row) => row.userLabel },
      { key: 'emotion', label: '情绪', value: (row) => row.emotion },
      { key: 'content', label: '内容摘要', className: 'wide-cell', value: (row) => clip(row.content, 42) },
      { key: 'visibility', label: '可见范围', value: (row) => row.visibility },
      { key: 'reviewStatus', label: '审核状态', className: 'status-cell', value: (row) => statusLabel(row.reviewStatus) },
      { key: 'counts', label: '互动', value: (row) => `${row.replyCount} 回应 / ${row.hugCount} 抱抱 / ${row.favoriteCount} 收藏` },
    ],
    replies: [
      { key: 'id', label: '回应 ID', value: (row) => row.id },
      { key: 'postId', label: '来源树洞', value: (row) => row.postId },
      { key: 'type', label: '类型/风格', value: (row) => `${row.type} / ${row.style}` },
      { key: 'content', label: '内容摘要', className: 'wide-cell', value: (row) => clip(row.content, 48) },
      { key: 'risk', label: '风险', value: (row) => row.riskLevel },
      { key: 'status', label: '状态', className: 'status-cell', value: (row) => statusLabel(row.status) },
    ],
    providers: [
      { key: 'name', label: '名称', value: (row) => row.name },
      { key: 'type', label: '类型', value: (row) => row.type },
      { key: 'model', label: '模型', value: (row) => row.modelName },
      { key: 'baseUrl', label: 'Base URL', className: 'wide-cell', value: (row) => row.baseUrl },
      { key: 'priority', label: '优先级/上限', value: (row) => `${row.priority} / ${row.dailyLimit}` },
      { key: 'enabled', label: '状态', className: 'status-cell', value: (row) => (row.enabled ? '启用' : '停用') },
    ],
    routes: [
      { key: 'style', label: '风格', value: (row) => `${row.label} (${row.style})` },
      { key: 'tasks', label: '任务', className: 'wide-cell', value: (row) => row.taskTypes?.join(' / ') },
      { key: 'primary', label: '主模型', value: (row) => providerName(row.primaryProviderId) },
      { key: 'backup', label: '备用模型', value: (row) => providerName(row.backupProviderId) },
      { key: 'prompt', label: 'Prompt 版本', value: (row) => row.promptVersion },
      { key: 'version', label: '路由版本', value: (row) => row.routeVersion },
      { key: 'enabled', label: '状态', value: (row) => (row.enabled ? '启用' : '停用') },
    ],
    jobs: [
      { key: 'id', label: '任务 ID', value: (row) => row.id },
      { key: 'type', label: '任务类型', value: (row) => row.jobType },
      { key: 'style', label: '风格', value: (row) => row.style },
      { key: 'provider', label: 'Provider/模型', value: (row) => `${providerName(row.providerId)} / ${row.modelName}` },
      { key: 'status', label: '状态', className: 'status-cell', value: (row) => statusLabel(row.status) },
      { key: 'duration', label: '耗时', value: (row) => `${row.durationMs}ms` },
    ],
    tickets: [
      { key: 'id', label: '工单 ID', value: (row) => row.id },
      { key: 'user', label: '用户', value: (row) => userName(row.userId) },
      { key: 'category', label: '分类', value: (row) => categoryName(row.categoryId) },
      { key: 'content', label: '问题摘要', className: 'wide-cell', value: (row) => clip(row.content, 44) },
      { key: 'priority', label: '优先级', value: (row) => row.priority },
      { key: 'status', label: '状态', className: 'status-cell', value: (row) => statusLabel(row.status) },
    ],
    faqs: [
      { key: 'question', label: '问题', className: 'wide-cell', value: (row) => row.question },
      { key: 'answer', label: '答案摘要', className: 'wide-cell', value: (row) => clip(row.answer, 48) },
      { key: 'sort', label: '排序', value: (row) => row.sortOrder },
      { key: 'enabled', label: '状态', value: (row) => (row.enabled ? '启用' : '停用') },
    ],
    presets: [
      { key: 'text', label: '回复内容', className: 'wide-cell', value: (row) => row.text },
      { key: 'scene', label: '场景', value: (row) => row.scene },
      { key: 'sort', label: '排序', value: (row) => row.sortOrder },
      { key: 'enabled', label: '状态', value: (row) => (row.enabled ? '启用' : '停用') },
    ],
    categories: [
      { key: 'name', label: '分类名称', value: (row) => row.name },
      { key: 'sort', label: '排序', value: (row) => row.sortOrder },
      { key: 'enabled', label: '状态', value: (row) => (row.enabled ? '启用' : '停用') },
    ],
    settings: [
      { key: 'key', label: '配置项', value: (row) => row.label },
      { key: 'value', label: '当前值', value: (row) => text(row.value) },
      { key: 'group', label: '分组', value: (row) => row.group },
    ],
    audit: [
      { key: 'id', label: '日志 ID', value: (row) => row.id },
      { key: 'admin', label: '管理员', value: (row) => row.adminUserId },
      { key: 'action', label: '动作', value: (row) => row.action },
      { key: 'resource', label: '资源', value: (row) => `${row.resourceType} / ${row.resourceId}` },
      { key: 'time', label: '时间', value: (row) => time(row.createdAt) },
    ],
  };
  return map[props.resource] ?? map.audit;
});

const filterOptions = computed(() => {
  if (props.resource === 'users') return [['all', '全部状态'], ['normal', '正常'], ['limited', '禁言'], ['banned', '封禁']];
  if (props.resource === 'posts') return [['all', '全部审核'], ['pending_review', '待审核'], ['published', '已发布'], ['hidden', '已隐藏'], ['rejected', '已拒绝']];
  if (props.resource === 'replies') return [['all', '全部回应'], ['pending_review', '待审核'], ['published', '已通过'], ['blocked', '已拦截']];
  if (props.resource === 'tickets') return [['all', '全部工单'], ['open', '待处理'], ['processing', '处理中'], ['resolved', '已解决'], ['closed', '已关闭']];
  return [];
});

const settingsRows = computed(() => [
  { key: 'appName', label: '小程序名称', group: '基础设置', value: configForm.value.appName },
  { key: 'appShortName', label: '小程序简称', group: '基础设置', value: configForm.value.appShortName },
  { key: 'defaultVisibility', label: '默认公开范围', group: '基础设置', value: configForm.value.defaultVisibility },
  { key: 'defaultPageSize', label: '默认分页数量', group: '基础设置', value: configForm.value.defaultPageSize },
  { key: 'highRiskBlockEnabled', label: '高危词拦截', group: '内容审核', value: configForm.value.highRiskBlockEnabled },
  { key: 'allowHumanRepliesDefault', label: '允许真人回应', group: '内容审核', value: configForm.value.allowHumanRepliesDefault },
  { key: 'manualReviewThreshold', label: '人工审核阈值', group: '内容审核', value: configForm.value.manualReviewThreshold },
  { key: 'cloudModelBackup', label: '云模型备用', group: 'AI 调用', value: configForm.value.cloudModelBackup },
  { key: 'aiTimeoutSeconds', label: '请求超时', group: 'AI 调用', value: configForm.value.aiTimeoutSeconds },
  { key: 'aiFailoverEnabled', label: '失败自动切换', group: 'AI 调用', value: configForm.value.aiFailoverEnabled },
  { key: 'aiRetryCount', label: '重试次数', group: 'AI 调用', value: configForm.value.aiRetryCount },
  { key: 'logRetentionDays', label: '日志保留天数', group: '隐私与数据', value: configForm.value.logRetentionDays },
  { key: 'sensitiveContentEncrypted', label: '敏感内容加密', group: '隐私与数据', value: configForm.value.sensitiveContentEncrypted },
  { key: 'scheduledCacheCleanup', label: '定期清理缓存', group: '隐私与数据', value: configForm.value.scheduledCacheCleanup },
  { key: 'allowMonthlyReportShare', label: '允许月报分享图', group: '隐私与数据', value: configForm.value.allowMonthlyReportShare },
  { key: 'abnormalNotifyEnabled', label: '异常通知', group: '通知告警', value: configForm.value.abnormalNotifyEnabled },
  { key: 'notifyEmail', label: '接收邮箱', group: '通知告警', value: configForm.value.notifyEmail },
  { key: 'dailyDigestEnabled', label: '每日摘要', group: '通知告警', value: configForm.value.dailyDigestEnabled },
  { key: 'dailyDigestTime', label: '发送时间', group: '通知告警', value: configForm.value.dailyDigestTime },
].map((item) => withRowId(item, item.key)));

function providerName(id?: string) {
  return providerOptions.value.find((item) => item.id === id)?.name ?? text(id);
}

function categoryName(id?: string) {
  return resourceCache.categories.find((item: any) => item.id === id)?.name ?? text(id);
}

function mapRow(item: any, index: number) {
  if (props.resource === 'users') {
    return withRowId({
      ...item,
      postCount: resourceCache.posts.filter((post: any) => post.userId === item.id).length,
      replyCount: resourceCache.replies.filter((reply: any) => reply.userId === item.id).length,
    }, `user_${index}`);
  }
  if (props.resource === 'posts') {
    return withRowId({ ...item, userLabel: userName(item.userId) }, `post_${index}`);
  }
  return withRowId(item, `${props.resource}_${index}`);
}

async function loadCache() {
  const [usersRes, postsRes, repliesRes, categoriesRes, providersRes] = await Promise.all([
    adminApi.get<any>('/api/admin/v1/users?pageSize=100'),
    adminApi.get<any>('/api/admin/v1/posts?pageSize=100'),
    adminApi.get<any>('/api/admin/v1/replies?pageSize=100'),
    adminApi.get<any>('/api/admin/v1/feedback-categories?pageSize=100'),
    adminApi.get<any>('/api/admin/v1/ai/providers?pageSize=100'),
  ]);
  resourceCache.users = usersRes.items ?? [];
  resourceCache.posts = postsRes.items ?? [];
  resourceCache.replies = repliesRes.items ?? [];
  resourceCache.categories = categoriesRes.items ?? [];
  resourceCache.providers = providersRes.items ?? [];
  providerOptions.value = resourceCache.providers;
}

function queryString() {
  const params = new URLSearchParams();
  params.set('page', String(page.value));
  params.set('pageSize', String(pageSize.value));
  if (search.value.trim()) params.set('q', search.value.trim());
  if (filter.value !== 'all') {
    if (props.resource === 'users' || props.resource === 'replies' || props.resource === 'tickets') params.set('status', filter.value);
    if (props.resource === 'posts') params.set('reviewStatus', filter.value);
  }
  return params.toString();
}

async function load() {
  busy.value = true;
  try {
    await loadCache();
    if (props.resource === 'settings') {
      const res = await adminApi.get<any>('/api/admin/v1/config');
      configForm.value = { ...(res.item ?? {}) };
      items.value = settingsRows.value;
      total.value = items.value.length;
    } else {
      const endpoint = endpoints[props.resource];
      const res = await adminApi.get<any>(`${endpoint}?${queryString()}`);
      items.value = (res.items ?? []).map(mapRow);
      total.value = res.total ?? items.value.length;
    }
    if (!items.value.some((item) => item.__rowId === selectedId.value)) selectedId.value = items.value[0]?.__rowId ?? '';
    status.value = `已加载 ${total.value} 条，当前显示 ${items.value.length} 条`;
  } catch (error: any) {
    status.value = error?.message ?? '加载失败';
  } finally {
    busy.value = false;
  }
}

function selectRow(row: any) {
  selectedId.value = row.__rowId;
  detailOpen.value = true;
  status.value = `已选择 ${row.id ?? row.key ?? row.style}`;
}

function closeDetail() {
  detailOpen.value = false;
}

async function mutate(message: string, fn: () => Promise<unknown>) {
  if (!selected.value && props.resource !== 'settings') return;
  busy.value = true;
  try {
    await fn();
    await load();
    status.value = message;
  } catch (error: any) {
    status.value = error?.message ?? '操作失败';
  } finally {
    busy.value = false;
  }
}

async function setUserStatus(value: 'normal' | 'limited' | 'banned') {
  await mutate(`用户状态已更新为 ${statusLabel(value)}`, () => adminApi.patch(`/api/admin/v1/users/${selected.value.id}/status`, { status: value }));
}

async function saveUserNote() {
  await mutate('用户备注已保存', () => adminApi.post(`/api/admin/v1/users/${selected.value.id}/note`, { note: actionText.value || '后台备注', tags: ['运营关注'] }));
}

async function exportUsers() {
  const res = await adminApi.get<any>('/api/admin/v1/users/export');
  status.value = `已生成导出文件：${res.item.downloadUrl}`;
}

async function reviewPost(action: 'approve' | 'reject' | 'hide' | 'risk') {
  await mutate(`树洞已${action === 'approve' ? '审核通过' : action === 'reject' ? '拒绝' : action === 'hide' ? '隐藏' : '标记风险'}`, () => adminApi.patch(`/api/admin/v1/posts/${selected.value.id}/review`, { action }));
}

async function restorePost() {
  await mutate('树洞已恢复公开', () => adminApi.patch(`/api/admin/v1/posts/${selected.value.id}/review`, { status: 'published' }));
}

async function regeneratePostReplies() {
  await mutate('AI 回应已重新生成', () => adminApi.post(`/api/admin/v1/posts/${selected.value.id}/regenerate-replies`));
}

async function reviewReply(action: 'approve' | 'block') {
  await mutate(`回应已${action === 'approve' ? '通过' : '拦截'}`, () => adminApi.patch(`/api/admin/v1/replies/${selected.value.id}/review`, { action, content: actionText.value || undefined }));
}

async function saveReplyContent() {
  await mutate('回应内容已修改', () => adminApi.patch(`/api/admin/v1/replies/${selected.value.id}/content`, { content: actionText.value || selected.value.content }));
}

async function addProvider() {
  await mutate('供应商已新增', () => adminApi.post('/api/admin/v1/ai/providers', { name: actionText.value || '新增模板供应商', type: 'template', baseUrl: 'local://template', modelName: 'template-live', enabled: true }));
}

async function saveProvider() {
  await mutate('供应商已保存', () => adminApi.patch(`/api/admin/v1/ai/providers/${selected.value.id}`, { name: actionText.value || selected.value.name, enabled: selected.value.enabled }));
}

async function toggleProvider() {
  await mutate('供应商启用状态已切换', () => adminApi.patch(`/api/admin/v1/ai/providers/${selected.value.id}`, { enabled: !selected.value.enabled }));
}

async function testProvider() {
  const res = await adminApi.post<any>(`/api/admin/v1/ai/providers/${selected.value.id}/test`);
  status.value = `${res.message}，耗时 ${res.item?.durationMs ?? 0}ms，模型 ${res.item?.modelName ?? selected.value.modelName}`;
}

async function saveRoute() {
  const enabledProviders = providerOptions.value.filter((item) => item.enabled && item.id !== selected.value.primaryProviderId);
  const nextProvider = enabledProviders[0]?.id ?? selected.value.primaryProviderId;
  await mutate('风格路由已保存，下一次前台 AI 调用会使用新路由版本', () => adminApi.patch(`/api/admin/v1/ai/routes/${selected.value.style}`, { primaryProviderId: nextProvider, enabled: true }));
}

async function testRoute() {
  const res = await adminApi.post<any>(`/api/admin/v1/ai/routes/${selected.value.style}/test`, { content: actionText.value || '后台路由测试' });
  status.value = `测试任务已创建：${res.job.id}`;
  await load();
}

async function retryJob() {
  await mutate('任务已重试', () => adminApi.post(`/api/admin/v1/ai/jobs/${selected.value.id}/retry`));
}

async function fallbackJob() {
  await mutate('已执行模板兜底', () => adminApi.post(`/api/admin/v1/ai/jobs/${selected.value.id}/fallback`));
}

async function replyTicket() {
  await mutate('工单已回复并标记解决', () => adminApi.post(`/api/admin/v1/feedback/${selected.value.id}/reply`, { reply: actionText.value || '管理员已处理你的反馈' }));
}

async function setTicketStatus(value: 'processing' | 'resolved' | 'closed') {
  await mutate(`工单状态已更新为 ${statusLabel(value)}`, () => adminApi.patch(`/api/admin/v1/feedback/${selected.value.id}/status`, { status: value }));
}

async function addFaq() {
  await mutate('FAQ 已新增', () => adminApi.post('/api/admin/v1/faqs', { question: actionText.value || '新的常见问题', answer: '请在后台继续编辑答案。' }));
}

async function addPreset() {
  await mutate('回复预设已新增', () => adminApi.post('/api/admin/v1/reply-presets', { text: actionText.value || '我看见你的不容易了。', scene: 'comfort' }));
}

async function addCategory() {
  await mutate('反馈分类已新增', () => adminApi.post('/api/admin/v1/feedback-categories', { name: actionText.value || '新的反馈分类' }));
}

async function saveConfig() {
  await mutate('系统设置已保存', () => adminApi.patch('/api/admin/v1/config', configForm.value));
}

async function resetConfig() {
  await mutate('系统设置已重置', () => adminApi.post('/api/admin/v1/config/reset'));
}

const detailGroups = computed<DetailGroup[]>(() => {
  const row = selected.value;
  if (!row) return [{ title: '暂无详情', entries: [{ label: '提示', value: '请选择一条记录' }] }];
  const map: Record<Resource, () => DetailGroup[]> = {
    users: () => [
      { title: '用户基本信息', entries: [
        { label: '用户 ID', value: row.id },
        { label: '昵称', value: row.nickname },
        { label: '匿名代号', value: row.anonymousCode },
        { label: 'OpenID', value: row.openid },
        { label: '状态', value: statusLabel(row.status) },
      ] },
      { title: '统计数据', entries: [
        { label: '树洞数', value: row.postCount },
        { label: '回应数', value: row.replyCount },
        { label: '注册时间', value: time(row.createdAt) },
      ] },
    ],
    posts: () => [
      { title: '树洞正文', entries: [
        { label: '内容', value: row.content },
        { label: '发布用户', value: row.userLabel },
        { label: '情绪', value: row.emotion },
        { label: '可见范围', value: row.visibility },
        { label: '审核状态', value: statusLabel(row.reviewStatus) },
      ] },
      { title: '互动统计', entries: [
        { label: '回应数', value: row.replyCount },
        { label: '抱抱数', value: row.hugCount },
        { label: '收藏数', value: row.favoriteCount },
        { label: '举报数', value: row.reportCount },
      ] },
    ],
    replies: () => [
      { title: '回应内容', entries: [
        { label: '来源树洞', value: row.postId },
        { label: '回应类型', value: row.type },
        { label: '风格', value: row.style },
        { label: '状态', value: statusLabel(row.status) },
        { label: '正文', value: row.content },
      ] },
    ],
    providers: () => [
      { title: '供应商配置', entries: [
        { label: '名称', value: row.name },
        { label: '类型', value: row.type },
        { label: 'Base URL', value: row.baseUrl },
        { label: 'API Key', value: row.apiKeyMasked ?? (row.apiKeyStatus === 'missing' ? '未配置' : '••••••••') },
        { label: '模型', value: row.modelName },
        { label: '启用状态', value: row.enabled ? '启用' : '停用' },
      ] },
      { title: '运行信息', entries: [
        { label: '运行方式', value: row.providerKind },
        { label: '模型家族', value: row.modelMeta?.family },
        { label: '参数规模', value: row.modelMeta?.parameterSize },
        { label: '量化', value: row.modelMeta?.quantization },
        { label: '模型大小', value: row.modelMeta?.size ? `${(row.modelMeta.size / 1024 / 1024 / 1024).toFixed(2)} GB` : undefined },
        { label: '能力', value: row.modelMeta?.capabilities?.join(' / ') },
        { label: '发现时间', value: time(row.modelMeta?.discoveredAt) },
      ] },
      { title: '调用限制', entries: [
        { label: '优先级', value: row.priority },
        { label: '每日上限', value: row.dailyLimit },
        { label: '超时', value: `${row.timeoutSeconds}s` },
        { label: '失败自动切换', value: row.failoverEnabled },
      ] },
    ],
    routes: () => [
      { title: '路由配置', entries: [
        { label: '风格', value: `${row.label} (${row.style})` },
        { label: '覆盖任务', value: row.taskTypes?.join(' / ') },
        { label: '主模型', value: providerName(row.primaryProviderId) },
        { label: '备用模型', value: providerName(row.backupProviderId) },
        { label: '兜底模板', value: providerName(row.fallbackTemplateId) },
        { label: 'Prompt 版本', value: row.promptVersion },
        { label: '路由版本', value: row.routeVersion },
      ] },
      { title: 'Prompt', entries: [{ label: '模板', value: row.promptTemplate }] },
    ],
    jobs: () => [
      { title: '任务结果', entries: [
        { label: '任务类型', value: row.jobType },
        { label: '风格', value: row.style },
        { label: '实际 Provider', value: providerName(row.providerId) },
        { label: '实际模型', value: row.modelName },
        { label: '状态', value: statusLabel(row.status) },
        { label: '耗时', value: `${row.durationMs}ms` },
        { label: '输出结果', value: row.result },
      ] },
      { title: '输入与轨迹', entries: [
        { label: '输入摘要', value: row.promptSummary },
        { label: 'Prompt 版本', value: row.promptVersion },
        { label: '重试次数', value: row.retryCount },
        { label: '使用兜底', value: row.fallbackUsed },
        { label: '失败原因', value: row.errorMessage },
        { label: '路由版本', value: row.routeVersion },
        { label: '创建时间', value: time(row.createdAt) },
        { label: '完成时间', value: time(row.completedAt) },
      ] },
    ],
    tickets: () => [
      { title: '反馈详情', entries: [
        { label: '用户', value: userName(row.userId) },
        { label: '来源页面', value: row.sourcePage },
        { label: '分类', value: categoryName(row.categoryId) },
        { label: '问题正文', value: row.content },
        { label: '截图数量', value: row.screenshots?.length ?? 0 },
      ] },
      { title: '处理状态', entries: [
        { label: '优先级', value: row.priority },
        { label: '状态', value: statusLabel(row.status) },
        { label: '回复内容', value: row.reply || '暂未回复' },
        { label: '提交时间', value: time(row.createdAt) },
        { label: '回复时间', value: time(row.repliedAt) },
      ] },
    ],
    faqs: () => [{ title: 'FAQ', entries: [{ label: '问题', value: row.question }, { label: '答案', value: row.answer }, { label: '状态', value: row.enabled ? '启用' : '停用' }] }],
    presets: () => [{ title: '回复预设', entries: [{ label: '内容', value: row.text }, { label: '场景', value: row.scene }, { label: '状态', value: row.enabled ? '启用' : '停用' }] }],
    categories: () => [{ title: '反馈分类', entries: [{ label: '名称', value: row.name }, { label: '排序', value: row.sortOrder }, { label: '状态', value: row.enabled ? '启用' : '停用' }] }],
    settings: () => [{ title: '配置项', entries: [{ label: '名称', value: row.label }, { label: '分组', value: row.group }, { label: '当前值', value: text(row.value) }] }],
    audit: () => [
      { title: '审计日志', entries: [
        { label: '管理员', value: row.adminUserId },
        { label: '动作', value: row.action },
        { label: '资源', value: `${row.resourceType} / ${row.resourceId}` },
        { label: 'IP', value: row.ip },
        { label: '时间', value: time(row.createdAt) },
      ] },
    ],
  };
  return map[props.resource]();
});

watch(() => props.resource, async () => {
  search.value = '';
  filter.value = 'all';
  selectedId.value = '';
  detailOpen.value = false;
  await load();
});

watch([search, filter], () => {
  page.value = 1;
  load();
});

onMounted(load);
</script>

<template>
  <Layout>
    <div class="toolbar admin-toolbar">
      <div>
        <h1>{{ title }}</h1>
        <p class="muted">{{ status }}</p>
      </div>
      <div class="actions">
        <input
          v-if="!['settings', 'audit'].includes(resource)"
          :data-testid="resource === 'users' ? 'admin-user-search' : resource === 'posts' ? 'admin-post-search' : resource === 'tickets' ? 'admin-feedback-search' : 'admin-search'"
          v-model="search"
          placeholder="搜索 ID / 内容 / 用户"
        />
        <select v-if="filterOptions.length" data-testid="admin-user-status-filter" v-model="filter">
          <option v-for="[value, label] in filterOptions" :key="value" :value="value">{{ label }}</option>
        </select>
        <label v-if="!['settings', 'audit'].includes(resource)" class="action-input">
          <span>{{ actionInput.label }}</span>
          <input data-testid="admin-action-input" v-model="actionText" :placeholder="actionInput.placeholder" />
        </label>
        <button data-testid="admin-audit-refresh" @click="load">刷新</button>
      </div>
    </div>

    <section v-if="resource === 'settings'" class="panel config-form-panel">
      <h2>系统设置</h2>
      <div class="config-grid">
        <label><span>小程序名称</span><input v-model="configForm.appName" /></label>
        <label><span>小程序简称</span><input v-model="configForm.appShortName" /></label>
        <label><span>默认公开范围</span><select v-model="configForm.defaultVisibility"><option value="PRIVATE">默认私密</option><option value="PUBLIC">匿名公开</option></select></label>
        <label><span>默认分页数量</span><input v-model.number="configForm.defaultPageSize" type="number" min="5" max="100" /></label>
        <label><span>高危词拦截</span><input v-model="configForm.highRiskBlockEnabled" type="checkbox" /></label>
        <label><span>允许真人回应</span><input v-model="configForm.allowHumanRepliesDefault" type="checkbox" /></label>
        <label><span>人工审核阈值</span><input v-model.number="configForm.manualReviewThreshold" type="number" step="0.05" min="0" max="1" /></label>
        <label><span>云模型备用</span><input v-model="configForm.cloudModelBackup" type="checkbox" /></label>
        <label><span>请求超时</span><input v-model.number="configForm.aiTimeoutSeconds" type="number" min="1" /></label>
        <label><span>失败自动切换</span><input v-model="configForm.aiFailoverEnabled" type="checkbox" /></label>
        <label><span>重试次数</span><input v-model.number="configForm.aiRetryCount" type="number" min="0" /></label>
        <label><span>日志保留天数</span><input v-model.number="configForm.logRetentionDays" type="number" min="1" /></label>
        <label><span>敏感内容加密</span><input v-model="configForm.sensitiveContentEncrypted" type="checkbox" /></label>
        <label><span>定期清理缓存</span><input v-model="configForm.scheduledCacheCleanup" type="checkbox" /></label>
        <label><span>允许月报分享图</span><input v-model="configForm.allowMonthlyReportShare" type="checkbox" /></label>
        <label><span>异常通知</span><input v-model="configForm.abnormalNotifyEnabled" type="checkbox" /></label>
        <label><span>接收邮箱</span><input v-model="configForm.notifyEmail" placeholder="ops@example.com" /></label>
        <label><span>每日摘要</span><input v-model="configForm.dailyDigestEnabled" type="checkbox" /></label>
        <label><span>发送时间</span><input v-model="configForm.dailyDigestTime" type="time" /></label>
      </div>
    </section>

    <div class="resource-actions panel">
      <template v-if="resource === 'users'">
        <button class="danger" data-testid="admin-user-ban" @click="setUserStatus('banned')">封禁</button>
        <button data-testid="admin-user-mute" @click="setUserStatus('limited')">禁言</button>
        <button data-testid="admin-user-restore" @click="setUserStatus('normal')">恢复</button>
        <button data-testid="admin-user-note" @click="saveUserNote">备注</button>
        <button data-testid="admin-user-export" @click="exportUsers">导出</button>
      </template>

      <template v-if="resource === 'posts'">
        <button class="primary" data-testid="admin-post-approve" @click="reviewPost('approve')">审核通过</button>
        <button class="danger" data-testid="admin-post-reject" @click="reviewPost('reject')">拒绝</button>
        <button data-testid="admin-post-hide" @click="reviewPost('hide')">隐藏</button>
        <button data-testid="admin-post-restore" @click="restorePost">恢复</button>
        <button data-testid="admin-post-risk" @click="reviewPost('risk')">标记风险</button>
        <button data-testid="admin-post-ai-reply" @click="regeneratePostReplies">重新生成 AI 回应</button>
      </template>

      <template v-if="resource === 'replies'">
        <button class="primary" data-testid="admin-reply-approve" @click="reviewReply('approve')">通过</button>
        <button class="danger" data-testid="admin-reply-block" @click="reviewReply('block')">拦截</button>
        <button data-testid="admin-reply-edit-approve" @click="saveReplyContent">修改后通过</button>
      </template>

      <template v-if="resource === 'providers'">
        <button data-testid="admin-provider-add" @click="addProvider">新增供应商</button>
        <button data-testid="admin-provider-edit" @click="saveProvider">保存供应商</button>
        <button data-testid="admin-provider-toggle" @click="toggleProvider">启用/停用</button>
        <button class="primary" data-testid="admin-provider-test" @click="testProvider">测试连接</button>
      </template>

      <template v-if="resource === 'routes'">
        <button class="primary" data-testid="admin-route-save" @click="saveRoute">保存路由</button>
        <button data-testid="admin-route-test" @click="testRoute">测试生成</button>
      </template>

      <template v-if="resource === 'jobs'">
        <button class="primary" data-testid="admin-job-retry" @click="retryJob">重试</button>
        <button data-testid="admin-job-fallback" @click="fallbackJob">模板兜底</button>
      </template>

      <template v-if="resource === 'tickets'">
        <button data-testid="admin-ticket-reply" @click="replyTicket">回复用户</button>
        <button data-testid="admin-ticket-processing" @click="setTicketStatus('processing')">处理中</button>
        <button class="primary" data-testid="admin-ticket-resolve" @click="setTicketStatus('resolved')">标记已解决</button>
        <button data-testid="admin-ticket-close" @click="setTicketStatus('closed')">关闭</button>
      </template>

      <template v-if="resource === 'settings'">
        <button class="primary" data-testid="admin-config-save" @click="saveConfig">保存配置</button>
        <button data-testid="admin-config-reset" @click="resetConfig">重置配置</button>
      </template>

      <template v-if="resource === 'faqs'">
        <button data-testid="admin-faq-add" @click="addFaq">添加 FAQ</button>
      </template>

      <template v-if="resource === 'presets'">
        <button data-testid="admin-preset-add" @click="addPreset">添加回复预设</button>
      </template>

      <template v-if="resource === 'categories'">
        <button data-testid="admin-category-add" @click="addCategory">添加反馈分类</button>
      </template>
    </div>

    <div class="table-layout admin-table-layout">
      <section class="panel table-panel">
        <table class="table resource-table" :aria-busy="busy">
          <thead>
            <tr>
              <th v-for="column in columns" :key="column.key" :class="column.className">{{ column.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, index) in items"
              :key="row.__rowId"
              :data-testid="index === 0 ? `${resource}-row-first` : index === items.length - 1 ? `${resource}-row-last` : `${resource}-row-${index}`"
              :class="{ active: selectedId === row.__rowId }"
              tabindex="0"
              :aria-expanded="selectedId === row.__rowId && detailOpen"
              @click="selectRow(row)"
              @keydown.enter.prevent="selectRow(row)"
              @keydown.space.prevent="selectRow(row)"
            >
              <td v-for="column in columns" :key="column.key" :class="column.className">
                <span v-if="column.className === 'status-cell'" class="status-badge">{{ column.value(row) }}</span>
                <span v-else>{{ column.value(row) }}</span>
              </td>
            </tr>
            <tr v-if="!items.length">
              <td :colspan="columns.length" class="empty-cell">暂无数据</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <div v-if="detailOpen" class="detail-drawer-mask" @click.self="closeDetail">
      <aside class="detail-drawer" role="dialog" aria-modal="true" aria-label="记录详情" data-testid="admin-detail-drawer">
        <header class="detail-drawer-header">
          <div><span>记录详情</span><h2>{{ title }}</h2></div>
          <button type="button" class="detail-close" data-testid="admin-detail-close" aria-label="关闭详情" @click="closeDetail">×</button>
        </header>
        <div class="detail-drawer-body">
          <template v-for="group in detailGroups" :key="group.title">
            <section class="detail-group">
              <h3>{{ group.title }}</h3>
              <dl>
                <template v-for="entry in group.entries" :key="`${group.title}-${entry.label}`">
                  <dt>{{ entry.label }}</dt>
                  <dd>{{ text(entry.value) }}</dd>
                </template>
              </dl>
            </section>
          </template>
          <section v-if="resource === 'posts' && selected?.attachments?.length" class="detail-group post-media-group" data-testid="admin-post-media">
            <h3>图片附件</h3>
            <div class="post-media-grid">
              <a v-for="asset in selected.attachments" :key="asset.id" :href="mediaUrl(asset.url)" target="_blank" rel="noopener" :aria-label="`查看图片 ${asset.id}`">
                <img :src="mediaUrl(asset.url)" :alt="`树洞图片 ${asset.id}`" />
              </a>
            </div>
          </section>
        </div>
      </aside>
    </div>
  </Layout>
</template>
