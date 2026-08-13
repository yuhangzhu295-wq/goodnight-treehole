# 晚安树洞按钮交互地图

生成时间：2026-07-09

## 结论

按钮交互地图已变成可执行合同，源文件为：

- 前台：`tests/interaction-manifest.front.json`
- 后台：`tests/interaction-manifest.admin.json`

自动诊断结果：

- 控件总数：110
- 通过：110
- 失败：0
- API/变更型控件：79
- 疑似缺失 API 绑定：0

## 前台交互地图

| 页面 | Selector | 行为 | API/结果 |
| --- | --- | --- | --- |
| 广场 | `tab-square` | 回到广场 | `/pages/square/index` |
| 广场 | `tab-letter` | 进入今日回信 | `GET /api/v1/letters/today` |
| 广场 | `tab-tool` | 进入情绪工具 | `GET /api/v1/tools` |
| 广场 | `tab-me` | 进入我的 | `GET /api/v1/me/profile` |
| 广场 | `post-card-first` | 打开树洞详情 | `GET /api/v1/posts/:id` |
| 广场 | `btn-write-mood` | 打开写心情 | `/pages/mood/create` |
| 广场 | `filter-all` | 全部筛选 | `GET /api/v1/posts` |
| 广场 | `filter-weiqu` | 委屈筛选 | `GET /api/v1/posts?mood=aggrieved` |
| 广场 | `filter-jiaolv` | 焦虑筛选 | `GET /api/v1/posts?mood=anxious` |
| 广场 | `filter-shimian` | 失眠筛选 | `GET /api/v1/posts?mood=insomnia` |
| 广场 | `filter-lianai` | 恋爱筛选 | `GET /api/v1/posts?mood=love` |
| 广场 | `filter-gongzuo` | 工作筛选 | `GET /api/v1/posts?mood=work` |
| 广场 | `btn-square-hug-first` | 抱抱首条树洞 | `POST /api/v1/posts/:id/hug` |
| 广场 | `btn-square-reply-first` | 打开回复抽屉 | `GET /api/v1/reply-presets`，URL 带 `sheet=reply` |
| 写心情 | `input-mood-content` | 输入心情 | DOM 输入 |
| 写心情 | `mood-emotion-jiaolv` | 选择焦虑 | DOM 状态 |
| 写心情 | `mood-visibility-public` | 选择公开 | DOM 状态 |
| 写心情 | `mood-style-warm` | 选择温柔回应 | DOM 状态 |
| 写心情 | `btn-add-image` | 添加/登记图片 | `POST /api/v1/assets/complete` |
| 写心情 | `btn-submit-mood` | 发布心情 | `POST /api/v1/moods`，跳详情 |
| 详情 | `btn-hug` | 抱抱 | `POST /api/v1/posts/:id/hug` |
| 详情 | `btn-favorite` | 收藏 | `POST /api/v1/posts/:id/favorite` |
| 详情 | `btn-open-reply` | 打开回复抽屉 | `GET /api/v1/reply-presets` |
| 回复抽屉 | `input-reply-content` | 输入回复 | DOM 输入 |
| 回复抽屉 | `reply-preset-0` | 选预设 | DOM 输入变化 |
| 回复抽屉 | `toggle-reply-anonymous` | 匿名开关 | DOM 状态 |
| 回复抽屉 | `btn-submit-reply` | 提交回复 | `POST /api/v1/posts/:id/replies` |
| 今日回信 | `btn-letter-warm` | 温柔重写 | `POST /api/v1/letters/:id/regenerate` |
| 今日回信 | `btn-letter-rational` | 理性重写 | `POST /api/v1/letters/:id/regenerate` |
| 今日回信 | `btn-letter-light` | 轻松重写 | `POST /api/v1/letters/:id/regenerate` |
| 今日回信 | `btn-letter-poetic` | 文艺重写 | `POST /api/v1/letters/:id/regenerate` |
| 今日回信 | `btn-letter-save` | 保存到日记 | `POST /api/v1/letters/:id/save-to-diary` |
| 今日回信 | `btn-letter-poster` | 生成海报 | `POST /api/v1/letters/:id/poster` |
| 情绪工具 | `tool-letter` | 打开今日回信 | `GET /api/v1/letters/today` |
| 情绪工具 | `tool-decompose` | 打开情绪拆解 | `/pages/tool/decompose` |
| 情绪工具 | `tool-rewrite` | 打开负面改写 | `/pages/tool/run?type=rewrite` |
| 情绪工具 | `tool-rant` | 打开发疯文案 | `/pages/tool/run?type=rant` |
| 情绪工具 | `tool-healing-quote` | 打开治愈短句 | `/pages/tool/run?type=healing-quote` |
| 情绪工具 | `tool-sleep-comfort` | 打开失眠安慰 | `/pages/tool/run?type=sleep-comfort` |
| 情绪工具 | `tool-work-support` | 打开工作破防 | `/pages/tool/run?type=work-support` |
| 情绪工具 | `tool-future-letter` | 打开给未来的自己 | `/pages/tool/run?type=future-letter` |
| 情绪工具 | `tool-report` | 打开情绪月报 | `GET /api/v1/reports/monthly` |
| 情绪拆解 | `input-decompose` | 输入拆解内容 | DOM 输入 |
| 情绪拆解 | `btn-decompose-run` | 生成拆解 | `POST /api/v1/tools/emotion-decompose` |
| 情绪拆解 | `btn-decompose-save` | 保存拆解 | `POST /api/v1/diaries` |
| 通用工具 | `btn-tool-run-submit` | 运行工具 | `POST /api/v1/tools/run` |
| 通用工具 | `btn-tool-run-save` | 保存结果 | `POST /api/v1/diaries` |
| 我的 | `entry-diary` | 我的日记 | `GET /api/v1/diaries` |
| 我的 | `entry-letter-list` | 我的回信 | `GET /api/v1/letters` |
| 我的 | `entry-favorite` | 我的收藏 | `GET /api/v1/favorites` |
| 我的 | `entry-report` | 情绪月报 | `GET /api/v1/reports/monthly` |
| 我的 | `entry-privacy` | 隐私设置 | `GET /api/v1/settings/privacy` |
| 我的 | `entry-feedback` | 帮助反馈 | `GET /api/v1/feedback/faqs` |
| 月报 | `btn-report-poster` | 生成月报海报 | `POST /api/v1/reports/monthly/:month/poster` |
| 月报 | `btn-report-advice` | 获取月报建议 | `GET /api/v1/reports/monthly/:month/advice` |
| 隐私设置 | `toggle-privacy-private` | 更新隐私 | `PUT /api/v1/settings/privacy` |
| 隐私设置 | `toggle-privacy-human` | 更新人类回复 | `PUT /api/v1/settings/privacy` |
| 帮助反馈 | `input-feedback-content` | 输入反馈 | DOM 输入 |
| 帮助反馈 | `btn-feedback-submit` | 提交反馈 | `POST /api/v1/feedback` |

## 后台交互地图

| 页面 | Selector | 行为 | API/结果 |
| --- | --- | --- | --- |
| 登录 | `admin-login-username` | 输入账号 | DOM 输入 |
| 登录 | `admin-login-password` | 输入密码 | DOM 输入 |
| 登录 | `admin-login-submit` | 登录后台 | `POST /api/admin/v1/auth/login` |
| 总览 | `admin-nav-users` | 用户管理 | `GET /api/admin/v1/users` |
| 总览 | `admin-nav-posts` | 树洞内容 | `GET /api/admin/v1/posts` |
| 总览 | `admin-nav-replies` | 回应审核 | `GET /api/admin/v1/replies` |
| 总览 | `admin-nav-providers` | AI provider | `GET /api/admin/v1/ai/providers` |
| 总览 | `admin-nav-routes` | 风格路由 | `GET /api/admin/v1/ai/routes` |
| 总览 | `admin-nav-jobs` | AI jobs | `GET /api/admin/v1/ai/jobs` |
| 总览 | `admin-nav-feedback` | 反馈工单 | `GET /api/admin/v1/feedback/tickets` |
| 总览 | `admin-nav-config` | 系统设置 | `GET /api/admin/v1/system/settings` |
| 总览 | `admin-nav-audit` | 审计日志 | `GET /api/admin/v1/audit-logs` |
| 总览 | `admin-shortcut-posts` | 快捷内容 | `GET /api/admin/v1/posts` |
| 总览 | `admin-shortcut-ai` | 快捷 AI | `GET /api/admin/v1/ai/providers` |
| 总览 | `admin-shortcut-feedback` | 快捷反馈 | `GET /api/admin/v1/feedback/tickets` |
| 用户 | `admin-user-search` | 搜索用户 | DOM 输入 |
| 用户 | `admin-user-status-filter` | 筛选状态 | DOM 选择 |
| 用户 | `admin-user-row-first` | 选中用户 | DOM 状态 |
| 用户 | `admin-user-ban` | 封禁用户 | `PATCH /api/admin/v1/users/:id/status` |
| 用户 | `admin-user-restore` | 恢复用户 | `PATCH /api/admin/v1/users/:id/status` |
| 用户 | `admin-user-export` | 导出用户 | 本地导出动作 |
| 内容 | `admin-post-search` | 搜索内容 | DOM 输入 |
| 内容 | `admin-post-row-first` | 选中内容 | DOM 状态 |
| 内容 | `admin-post-approve` | 审核通过 | `PATCH /api/admin/v1/posts/:id/moderation` |
| 内容 | `admin-post-hide` | 隐藏内容 | `PATCH /api/admin/v1/posts/:id/moderation` |
| 内容 | `admin-post-risk` | 标记风险 | `PATCH /api/admin/v1/posts/:id/moderation` |
| 内容 | `admin-post-ai-reply` | 排队 AI 回复 | `POST /api/v1/moods/:id/queue-ai-replies` |
| 回应 | `admin-reply-row-first` | 选中回应 | DOM 状态 |
| 回应 | `admin-reply-approve` | 回应通过 | `PATCH /api/admin/v1/replies/:id/moderation` |
| 回应 | `admin-reply-block` | 拦截回应 | `PATCH /api/admin/v1/replies/:id/moderation` |
| 回应 | `admin-reply-edit-approve` | 编辑后通过 | `PATCH /api/admin/v1/replies/:id/moderation` |
| AI provider | `admin-provider-row-first` | 选中 provider | DOM 状态 |
| AI provider | `admin-provider-add` | 新增 provider | `POST /api/admin/v1/ai/providers` |
| AI provider | `admin-provider-edit` | 编辑 provider | `PUT /api/admin/v1/ai/providers/:id` |
| AI provider | `admin-provider-toggle` | 启停 provider | `PUT /api/admin/v1/ai/providers/:id` |
| AI provider | `admin-provider-test` | 测试 provider | `POST /api/admin/v1/ai/providers/:id/test` |
| AI 路由 | `admin-route-row-first` | 选中路由 | DOM 状态 |
| AI 路由 | `admin-route-save` | 保存路由 | `PUT /api/admin/v1/ai/routes/:style` |
| AI 路由 | `admin-route-test` | 测试路由 | `POST /api/admin/v1/ai/routes/:style/test` |
| AI jobs | `admin-job-row-first` | 选中任务 | DOM 状态 |
| AI jobs | `admin-job-retry` | 重试任务 | `POST /api/admin/v1/ai/jobs/:id/retry` |
| AI jobs | `admin-job-fallback` | fallback 任务 | `POST /api/admin/v1/ai/jobs/:id/fallback` |
| 反馈 | `admin-ticket-row-first` | 选中工单 | DOM 状态 |
| 反馈 | `admin-ticket-reply` | 回复工单 | `POST /api/admin/v1/feedback/tickets/:id/reply` |
| 反馈 | `admin-ticket-resolve` | 解决工单 | `PATCH /api/admin/v1/feedback/tickets/:id/status` |
| 系统 | `admin-config-save` | 保存配置 | `PUT /api/admin/v1/system/settings` |
| 系统 | `admin-config-reset` | 重置配置 | `PUT /api/admin/v1/system/settings` |
| FAQ | `admin-faq-add` | 新增 FAQ | `POST /api/admin/v1/faqs` |
| 回复预设 | `admin-preset-add` | 新增预设 | `POST /api/admin/v1/reply-presets` |
| 反馈分类 | `admin-category-add` | 新增分类 | `POST /api/admin/v1/feedback-categories` |
| 审计 | `admin-audit-refresh` | 刷新审计 | `GET /api/admin/v1/audit-logs` |

## 防回退规则

- 新增按钮必须进入对应 manifest，否则 `diagnose:clickability` 不会覆盖。
- mutation 按钮必须配置 expected API 或 store/DOM 变化。
- 不允许新增透明覆盖层、英文 debug button、空点击 handler。
- 路由别名要同时更新 manifest、业务测试和 API map。
