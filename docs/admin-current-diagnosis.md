# 管理后台当前诊断

## 真实根因

1. 后台表格“已加载 X 条但内容像是空”的主因在 `apps/admin/src/views/TablePage.vue`：所有资源共用一套列，只读取 `id/content/name/question/text/label/description/status/reviewStatus/enabled/modelName/primaryProviderId/value`。用户、树洞、反馈、AI job 等资源的大量字段没有独立映射，导致可读信息缺失。
2. 详情栏直接使用 `JSON.stringify(detail, null, 2)` 输出原始对象，不是正式详情结构。
3. 页面默认输入值是“后台操作文本”，并同时作为搜索和操作文本使用，造成无意义占位内容污染 UI。
4. 操作按钮使用“查看首个用户 / 查看首条树洞 / 查看首个任务”等固定动作，不是针对当前选中行的明确操作。
5. Dashboard 的 `activeTrend` 和 `emotionDistribution` 在 `apps/api/src/controllers.ts` 中是固定数组/常量，不是全部由运行数据聚合。
6. 系统设置页面仍读取 `/api/admin/v1/system/settings` 的 key/value 表格结构，`apps/admin/src/views/ConfigPage.vue` 为空壳，未实现真实表单。

## 当前后台路由

- `/dashboard`：独立 `Dashboard.vue`，但聚合数据仍有固定值。
- `/users`、`/posts`、`/replies/moderation`、`/ai/providers`、`/ai/routes`、`/ai/jobs`、`/ops/feedback`、`/ops/faqs`、`/ops/reply-presets`、`/ops/feedback-categories`、`/ops/config`、`/audit-logs`：全部进入 `TablePage.vue`。

## 修复方向

1. 保留现有前台视觉和 API 调用方式。
2. 后台不再使用未知字段通用显示，改为按资源配置独立 columns、mapper、详情 sections 和操作。
3. API 保持现有兼容路径，同时补齐文档要求的 alias 路径。
4. 当前运行数据源统一为 `StoreService` 写入的 JSON store；Prisma schema 仅作为未来迁移资料，本轮不虚假声明已切换 PostgreSQL。
