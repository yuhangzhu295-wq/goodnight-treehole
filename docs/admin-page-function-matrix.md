# 晚安树洞管理后台页面功能矩阵

更新时间：2026-07-10

## 数据总览 `/dashboard`

- 数据来源：`GET /api/admin/v1/dashboard/overview`
- 已实现：今日新增用户、今日树洞发布、待审核内容、AI 成功率、7 天趋势、情绪分布、最新树洞、AI 调用概况。
- 修复点：去掉固定假数组和 `join(' / ')` 文本展示，改为后端聚合对象驱动的柱状图、分布条和动态列表。
- 验证截图：`artifacts/screenshots/admin/02-dashboard.png`

## 用户管理 `/users`

- 数据来源：`GET /api/admin/v1/users`
- 已实现：分页、搜索、状态筛选、结构化详情、禁言、封禁、恢复、备注、导出。
- 写接口：`PATCH /api/admin/v1/users/:id/status`、`POST /api/admin/v1/users/:id/note`、`GET /api/admin/v1/users/export`
- 验证截图：`artifacts/screenshots/admin/03-users.png`

## 树洞内容 `/posts`

- 数据来源：`GET /api/admin/v1/posts`
- 已实现：搜索、审核状态筛选、结构化详情、通过、拒绝、隐藏、恢复、标记风险、重新生成 AI 回应。
- 写接口：`PATCH /api/admin/v1/posts/:id/review`、`PATCH /api/admin/v1/posts/:id/risk`、`POST /api/admin/v1/posts/:id/regenerate-replies`
- 验证截图：`artifacts/screenshots/admin/04-posts.png`

## 回应审核 `/replies/moderation`

- 数据来源：`GET /api/admin/v1/replies`
- 已实现：搜索、状态筛选、结构化详情、通过、拦截、修改后通过。
- 写接口：`PATCH /api/admin/v1/replies/:id/review`、`PATCH /api/admin/v1/replies/:id/content`
- 验证截图：`artifacts/screenshots/admin/05-replies.png`

## AI 配置中心 `/ai/providers`

- 数据来源：`GET /api/admin/v1/ai/providers`
- 已实现：供应商列表、API Key 脱敏、启用/停用、新增、保存、连接测试。
- 写接口：`POST /api/admin/v1/ai/providers`、`PATCH /api/admin/v1/ai/providers/:id`、`POST /api/admin/v1/ai/providers/:id/test`
- 验证截图：`artifacts/screenshots/admin/06-providers.png`

## 风格路由 `/ai/routes`

- 数据来源：`GET /api/admin/v1/ai/routes`
- 已实现：风格、主模型、备用模型、Prompt 版本、路由版本、保存、测试生成。
- 写接口：`PATCH /api/admin/v1/ai/routes/:style`、`POST /api/admin/v1/ai/routes/:style/test`
- 验证截图：`artifacts/screenshots/admin/07-routes.png`

## AI 任务记录 `/ai/jobs`

- 数据来源：`GET /api/admin/v1/ai/jobs`
- 已实现：任务状态、实际 Provider、实际模型、耗时、结果、重试、模板兜底。
- 写接口：`POST /api/admin/v1/ai/jobs/:id/retry`、`POST /api/admin/v1/ai/jobs/:id/fallback`
- 验证截图：`artifacts/screenshots/admin/08-jobs.png`

## 反馈工单 `/ops/feedback`

- 数据来源：`GET /api/admin/v1/feedback`
- 已实现：搜索、状态筛选、结构化详情、回复用户、处理中、标记已解决、关闭。
- 写接口：`POST /api/admin/v1/feedback/:id/reply`、`PATCH /api/admin/v1/feedback/:id/status`
- 验证截图：`artifacts/screenshots/admin/09-feedback.png`

## FAQ、回复预设、反馈分类

- 页面：`/ops/faqs`、`/ops/reply-presets`、`/ops/feedback-categories`
- 已实现：列表、结构化详情、新增。
- 写接口：`POST /api/admin/v1/faqs`、`POST /api/admin/v1/reply-presets`、`POST /api/admin/v1/feedback-categories`
- 验证截图：`artifacts/screenshots/admin/10-faqs.png`、`artifacts/screenshots/admin/11-presets.png`、`artifacts/screenshots/admin/12-categories.png`

## 系统设置 `/ops/config`

- 数据来源：`GET /api/admin/v1/config`
- 已实现：系统名称、默认可见范围、分页数量、内容审核、AI 调用、隐私数据、通知告警配置。
- 写接口：`PATCH /api/admin/v1/config`、`POST /api/admin/v1/config/reset`
- 前台联动：`GET /api/v1/config`，详情页读取 `allowHumanRepliesDefault` 控制真人回应入口。
- 验证截图：`artifacts/screenshots/admin/13-config.png`

## 审计日志 `/audit-logs`

- 数据来源：`GET /api/admin/v1/audit-logs`
- 已实现：审计日志分页列表和结构化详情。
- 验证截图：`artifacts/screenshots/admin/14-audit.png`
