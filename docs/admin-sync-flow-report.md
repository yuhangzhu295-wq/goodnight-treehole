# 晚安树洞后台联动与同步流报告

生成时间：2026-07-09

## 结论

后台不再只是独立管理壳子，已与前台真实业务数据连通。当前执行结果：

- `pnpm test:admin-sync`：通过。
- `artifacts/test-report/real-browser-cross-flow.md`：3 条前后台跨端链路全部通过，失败 0。
- `pnpm test:ai-routing`：通过，AI provider、style route、job retry/fallback 的业务合同可用。
- `artifacts/diagnosis/clickability-report.md`：后台导航、审核、AI、反馈、系统设置等控件均被点击验证。

## 后台页面覆盖

| 设计图 | 页面 | 路由 | 已验证能力 |
| --- | --- | --- | --- |
| 01-admin-login | 登录 | `/login` | 管理员登录 |
| 02-admin-dashboard | 数据总览 | `/dashboard` | 指标、快捷入口、侧边导航 |
| 03-admin-user-list | 用户管理 | `/users` | 搜索、状态筛选、封禁/恢复 |
| 04-admin-post-content | 树洞内容 | `/posts` | 内容审核、隐藏、风险标记、AI 回复排队 |
| 05-admin-reply-moderation | 回应审核 | `/replies/moderation` | 审核通过、拦截、编辑通过 |
| 06-admin-ai-provider-center | AI 配置中心 | `/ai/providers` | 新增、编辑、启停、测试 provider |
| 07-admin-ai-style-routing | 风格路由 | `/ai/routes` | 保存/测试风格路由 |
| 08-admin-ai-job-log | AI 任务记录 | `/ai/jobs` | 重试、fallback |
| 09-admin-feedback-ticket | 反馈工单 | `/ops/feedback` | 回复、解决工单 |
| 10-admin-system-settings | 系统设置 | `/ops/config` | 保存、重置系统配置 |

补充后台运维页也保留：`/audit-logs`、`/ops/faqs`、`/ops/reply-presets`、`/ops/feedback-categories`。

## 前后台同步链路

| 链路 | 前台动作 | 后台动作 | 回到前台结果 | 验证 |
| --- | --- | --- | --- | --- |
| 公开树洞发布与审核 | 发布公开心情 | 后台内容审核通过 | 广场可见该树洞 | `real-browser-cross-flow.md` 通过 |
| 回复发布与审核 | 详情页提交回复 | 后台回应审核通过 | 详情页可见该回复 | `real-browser-cross-flow.md` 通过 |
| 反馈工单闭环 | 前台提交反馈 | 后台回复并解决 | 前台查询状态为 resolved | `real-browser-cross-flow.md` 通过 |
| 用户封禁约束 | 后台封禁 demo 用户 | 前台写操作被服务端拦截 | 不允许继续发布/回复 | business spec 通过 |
| AI 配置影响 | 后台 provider/route 变更 | 工具/回信生成读取路由 | AI job 记录可追踪 | `test:ai-routing` 通过 |

## 已补齐的兼容接口

为匹配文档中的前后台调用习惯，后台保留原接口并增加兼容别名：

- 登录：`POST /api/admin/v1/auth/login` 与 `POST /api/admin/v1/login`
- 数据总览：`GET /api/admin/v1/dashboard/overview` 与 `GET /api/admin/v1/dashboard`
- 用户：`PATCH /api/admin/v1/users/:id/status`、`POST /api/admin/v1/users/:id/tags`、`DELETE /api/admin/v1/users/:id/data`
- 内容：`PATCH /api/admin/v1/posts/:id/moderation`，兼容 `approve`、`reject`、`block`
- 回应：`PATCH /api/admin/v1/replies/:id/moderation`，兼容 `approve`、`block`、`edit`
- AI：`PATCH /api/admin/v1/ai/providers/:id`、`PATCH /api/admin/v1/ai/routes/:style`
- 反馈：`GET /api/admin/v1/feedback`、`PATCH /api/admin/v1/feedback/:id/reply`、`PATCH /api/admin/v1/feedback/:id/resolve`
- 系统：`GET /api/admin/v1/settings`、`PATCH /api/admin/v1/settings`

## 验证证据

- 跨端联动报告：`artifacts/test-report/real-browser-cross-flow.md`
- 后台截图：`artifacts/screenshots/admin/login.png`、`dashboard.png`、`users.png`、`posts.png`、`replies-moderation.png`、`ai-providers.png`、`ai-routes.png`、`ai-jobs.png`、`ops-feedback.png`、`ops-config.png`
- 后台按钮地图：`tests/interaction-manifest.admin.json`
- 点击诊断：`artifacts/diagnosis/clickability-report.md`

## 剩余注意点

- 后台视觉截图已覆盖 10 张设计参考对应页，但后台仍适合在后续迭代中增加更细的表格密度、筛选组合和空状态截图。
- 当前联动验证以核心业务闭环为准；如果后续接真实数据库和真实 AI provider，应增加外部服务失败、重试和限流场景。
