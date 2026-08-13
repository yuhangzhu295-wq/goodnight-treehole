# 晚安树洞 API Endpoint Map

生成时间：2026-07-09

## 结论

前台、后台和兼容别名已统一到 `apps/api/src/controllers.ts`，OpenAPI path 也同步补齐。接口不是 mock-only：发布、回复、保存、审核、配置、反馈、AI job 等都会写入服务端 store 并被真实浏览器测试验证。

## 前台 API

| 模块 | Endpoint | 用途 |
| --- | --- | --- |
| 健康检查 | `GET /api/health` | API 启动验证 |
| 广场列表 | `GET /api/v1/posts` | 公开树洞列表 |
| 广场筛选 | `GET /api/v1/posts?mood=aggrieved/anxious/insomnia/love/work` | 稳定 key 筛选，服务端映射中文情绪 |
| 树洞详情 | `GET /api/v1/posts/:id` | 详情页 |
| 树洞抱抱 | `POST /api/v1/posts/:id/hug` | 原抱抱接口 |
| 树洞抱抱别名 | `POST /api/v1/posts/:id/hugs` | 文档兼容别名 |
| 树洞收藏 | `POST /api/v1/posts/:id/favorite` | 收藏/取消状态 |
| 树洞举报 | `POST /api/v1/posts/:id/report` | 内容举报 |
| 树洞删除 | `DELETE /api/v1/posts/:id` | 删除本人内容 |
| 树洞发布别名 | `POST /api/v1/posts` | 文档兼容发布入口 |
| 心情发布 | `POST /api/v1/moods` | 公开发布生成 post，私密发布生成 letter/diary |
| AI 回复排队 | `POST /api/v1/moods/:id/queue-ai-replies` | 后台/内容页排队 AI 回复 |
| 回复列表 | `GET /api/v1/posts/:id/replies` | 详情页回复 |
| 回复预设 | `GET /api/v1/reply-presets` | 回复抽屉预设 |
| 回复提交 | `POST /api/v1/posts/:id/replies` | 提交真实回复 |
| 今日回信 | `GET /api/v1/letters/today` | 今日回信页 |
| 回信列表 | `GET /api/v1/letters` | 我的回信 |
| 回信详情 | `GET /api/v1/letters/:id` | 回信详情 |
| 回信已读 | `PATCH /api/v1/letters/:id/read` | 标记已读 |
| 回信喜欢 | `POST /api/v1/letters/:id/like` | 喜欢回信 |
| 回信风格重写 | `POST /api/v1/letters/:id/regenerate` | 温柔/理性/轻松/文艺 |
| 回信生成别名 | `POST /api/v1/letters/generate` | 文档兼容别名 |
| 回信海报 | `POST /api/v1/letters/:id/poster` | 生成海报 |
| 分享图片别名 | `POST /api/v1/share-image` | 文档兼容分享入口 |
| 回信保存日记 | `POST /api/v1/letters/:id/save-to-diary` | 写入日记 |
| 回信收藏 | `POST /api/v1/letters/:id/favorite` | 收藏回信 |
| 取消回信收藏 | `DELETE /api/v1/letters/:id/favorite` | 取消收藏 |
| 工具列表 | `GET /api/v1/tools` | 工具首页 |
| 情绪拆解 | `POST /api/v1/tools/emotion-decompose` | 情绪拆解 |
| 拆解别名 | `POST /api/v1/tools/decompose` | 文档兼容别名 |
| 通用工具 | `POST /api/v1/tools/run` | rewrite/rant/heal/sleep/work/future 等 |
| 工具别名 | `POST /api/v1/tools/rewrite`、`rant`、`heal`、`sleep`、`work`、`future` | 文档兼容别名 |
| 拆解保存 | `POST /api/v1/tools/emotion-decompose/:taskId/save` | 保存拆解结果 |
| 个人资料 | `GET /api/v1/me/profile` | 我的页用户卡 |
| 个人统计 | `GET /api/v1/me/stats` | 我的页统计 |
| 成长卡 | `GET /api/v1/me/growth-card` | 成长卡 |
| 清空数据 | `DELETE /api/v1/me/data` | 清空记录 |
| 日记创建 | `POST /api/v1/diaries` | 日记/工具保存 |
| 日记导出 | `POST /api/v1/diaries/export` | 导出 |
| 日记列表 | `GET /api/v1/diaries` | 我的日记 |
| 日记详情 | `GET /api/v1/diaries/:id` | 日记详情 |
| 日记删除 | `DELETE /api/v1/diaries/:id` | 删除日记 |
| 收藏列表 | `GET /api/v1/favorites` | 我的收藏 |
| 取消收藏 | `DELETE /api/v1/favorites/:id` | 删除收藏 |
| 月报 | `GET /api/v1/reports/monthly` | 情绪月报 |
| 月报别名 | `GET /api/v1/report/month` | 文档兼容别名 |
| 月报建议 | `GET /api/v1/reports/monthly/:month/advice` | 获取建议 |
| 月报海报 | `POST /api/v1/reports/monthly/:month/poster` | 生成海报 |
| 月报分享别名 | `POST /api/v1/report/share-image` | 文档兼容别名 |
| 隐私设置 | `GET /api/v1/settings/privacy` | 读取隐私 |
| 隐私读取别名 | `GET /api/v1/privacy-settings` | 文档兼容别名 |
| 隐私保存 | `PUT /api/v1/settings/privacy` | 保存隐私 |
| 隐私保存别名 | `PATCH /api/v1/settings/privacy`、`PATCH /api/v1/privacy-settings` | 文档兼容别名 |
| 反馈分类 | `GET /api/v1/feedback/categories` | 分类 |
| FAQ | `GET /api/v1/feedback/faqs` | 帮助 FAQ |
| 反馈提交 | `POST /api/v1/feedback` | 提交工单 |
| 反馈列表 | `GET /api/v1/feedback` | 查询反馈 |
| 上传签名 | `POST /api/v1/uploads/sign` | 上传流程 |
| 上传别名 | `POST /api/v1/upload` | 文档兼容别名 |
| 资源完成 | `POST /api/v1/assets/complete` | 图片登记 |

## 后台 API

| 模块 | Endpoint | 用途 |
| --- | --- | --- |
| 登录 | `POST /api/admin/v1/auth/login` | 管理员登录 |
| 登录别名 | `POST /api/admin/v1/login` | 文档兼容别名 |
| 登出 | `POST /api/admin/v1/auth/logout` | 登出 |
| 当前管理员 | `GET /api/admin/v1/me` | 管理员资料 |
| 数据总览 | `GET /api/admin/v1/dashboard/overview` | 首页指标 |
| 数据总览别名 | `GET /api/admin/v1/dashboard` | 文档兼容别名 |
| 用户列表 | `GET /api/admin/v1/users` | 用户管理 |
| 用户详情 | `GET /api/admin/v1/users/:id` | 用户详情 |
| 用户状态 | `PATCH /api/admin/v1/users/:id/status` | 封禁/恢复 |
| 用户标签 | `PATCH /api/admin/v1/users/:id/tags`、`POST /api/admin/v1/users/:id/tags` | 标签 |
| 用户数据删除 | `DELETE /api/admin/v1/users/:id/data` | 删除用户数据 |
| 内容列表 | `GET /api/admin/v1/posts` | 树洞内容 |
| 内容详情 | `GET /api/admin/v1/posts/:id` | 内容详情 |
| 内容审核 | `PATCH /api/admin/v1/posts/:id/moderation` | 统一审核 |
| 内容审核别名 | `PATCH /api/admin/v1/posts/:id/approve`、`reject`、`block` | 文档兼容别名 |
| 内容可见性 | `PATCH /api/admin/v1/posts/:id/visibility` | 可见性 |
| 内容删除 | `DELETE /api/admin/v1/posts/:id` | 删除内容 |
| 回应列表 | `GET /api/admin/v1/replies` | 回应审核 |
| 回应详情 | `GET /api/admin/v1/replies/:id` | 回应详情 |
| 回应审核 | `PATCH /api/admin/v1/replies/:id/moderation` | 统一审核 |
| 回应审核别名 | `PATCH /api/admin/v1/replies/:id/approve`、`block`、`edit` | 文档兼容别名 |
| AI provider | `GET/POST /api/admin/v1/ai/providers` | Provider 列表/新增 |
| AI provider 更新 | `PUT /api/admin/v1/ai/providers/:id`、`PATCH /api/admin/v1/ai/providers/:id` | 编辑/兼容更新 |
| AI provider 测试 | `POST /api/admin/v1/ai/providers/:id/test` | 测试 |
| AI 路由 | `GET /api/admin/v1/ai/routes` | 风格路由 |
| AI 路由保存 | `PUT /api/admin/v1/ai/routes/:style`、`PATCH /api/admin/v1/ai/routes/:style` | 保存/兼容更新 |
| AI 路由测试 | `POST /api/admin/v1/ai/routes/:style/test` | 测试 |
| AI jobs | `GET /api/admin/v1/ai/jobs`、`GET /api/admin/v1/ai/jobs/:id` | 任务记录 |
| AI job 重试 | `POST /api/admin/v1/ai/jobs/:id/retry` | 重试 |
| AI job fallback | `POST /api/admin/v1/ai/jobs/:id/fallback` | 备用路线 |
| 反馈工单 | `GET /api/admin/v1/feedback/tickets`、`GET /api/admin/v1/feedback` | 工单列表/别名 |
| 工单详情 | `GET /api/admin/v1/feedback/tickets/:id` | 工单详情 |
| 工单回复 | `POST /api/admin/v1/feedback/tickets/:id/reply`、`PATCH /api/admin/v1/feedback/:id/reply` | 回复/兼容别名 |
| 工单状态 | `PATCH /api/admin/v1/feedback/tickets/:id/status`、`PATCH /api/admin/v1/feedback/:id/resolve` | 解决/兼容别名 |
| FAQ | `GET/POST /api/admin/v1/faqs`、`PUT/DELETE /api/admin/v1/faqs/:id` | FAQ 管理 |
| 回复预设 | `GET/POST /api/admin/v1/reply-presets`、`PUT/DELETE /api/admin/v1/reply-presets/:id` | 预设管理 |
| 反馈分类 | `GET/POST /api/admin/v1/feedback-categories`、`PUT/DELETE /api/admin/v1/feedback-categories/:id` | 分类管理 |
| 系统设置 | `GET /api/admin/v1/system/settings`、`GET /api/admin/v1/settings` | 读取设置/别名 |
| 保存系统设置 | `PUT /api/admin/v1/system/settings`、`PATCH /api/admin/v1/settings` | 保存设置/别名 |
| 审计日志 | `GET /api/admin/v1/audit-logs` | 审计 |

## 自动验证入口

- API 绑定诊断：`pnpm diagnose:api-bindings`
- 点击与 API 合同：`pnpm diagnose:clickability`
- 前台业务：`pnpm test:front-business`
- 前后台联动：`pnpm test:admin-sync`
- 全量真实 QA：`pnpm qa:real-all`
