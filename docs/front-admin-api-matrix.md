# 前后台 API 矩阵

## 前台

| 功能 | 当前路径 | 状态 |
| --- | --- | --- |
| 广场列表 | `GET /api/v1/posts` | 已接 API |
| 发布心情/树洞 | `POST /api/v1/moods`, `POST /api/v1/posts` | 已接 API |
| 树洞详情 | `GET /api/v1/posts/:id` | 已接 API |
| 抱抱 | `POST /api/v1/posts/:id/hug` | 已接 API |
| 收藏 | `POST /api/v1/posts/:id/favorite` | 已接 API |
| 回复列表 | `GET /api/v1/posts/:id/replies` | 已接 API |
| 发表回应 | `POST /api/v1/posts/:id/replies` | 已接 API |
| 今日回信/AI | `POST /api/v1/ai/generate` | 已接 API |
| 日记/收藏/隐私 | `GET /api/v1/diaries`, `GET /api/v1/favorites`, `GET/PATCH /api/v1/settings/privacy` | 已接 API，需补 `/me/*` alias |
| 反馈 | `POST /api/v1/feedback` | 已接 API |

## 后台

| 页面 | 当前路径 | 问题 | 修复策略 |
| --- | --- | --- | --- |
| 登录 | `POST /api/admin/v1/auth/login` | 默认账号显示在输入框 | 清空默认值，保留测试可输入 |
| Dashboard | `GET /api/admin/v1/dashboard/overview` | 部分固定聚合 | 改为真实聚合，并补 summary/activity 等 alias |
| 用户 | `GET /api/admin/v1/users` | 通用列映射弱 | 独立 mapper、详情、状态操作 |
| 树洞 | `GET /api/admin/v1/posts` | 通用列映射弱 | 独立 mapper、审核/隐藏/恢复 |
| 回应 | `GET /api/admin/v1/replies` | 状态命名兼容不足 | 独立 mapper、通过/拦截/编辑 |
| AI Provider | `GET /api/admin/v1/ai/providers` | 测试结果过浅 | 显示耗时、模型、结果 |
| AI 路由 | `GET /api/admin/v1/ai/routes` | 可编辑性弱 | 保存后影响下一次 AI 调用 |
| AI Job | `GET /api/admin/v1/ai/jobs` | 详情 JSON | 可读详情 sections |
| 反馈 | `GET /api/admin/v1/feedback/tickets` | 通用列映射弱 | 独立工单详情和回复 |
| 系统设置 | `GET /api/admin/v1/system/settings` | key/value 表格 | 改为真实配置表单 |
