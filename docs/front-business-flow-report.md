# 晚安树洞前台真实业务流报告

生成时间：2026-07-09

## 结论

前台 01-14 页面已从“可看 UI”推进到“按钮、路由、接口、状态变化可验证”的业务闭环。当前执行结果：

- `pnpm test:front-business`：通过。
- `artifacts/test-report/real-browser-front-clicks.md`：8 项真实浏览器点击全部通过，失败 0。
- `artifacts/diagnosis/clickability-report.md`：前后台合计 110 个交互点全部通过，失败 0。
- `artifacts/diagnosis/api-binding-report.md`：110 个控件中 79 个 API/变更型控件均有绑定，疑似缺失 API 绑定 0。

## 覆盖页面

| 设计图 | 页面 | 路由 | 状态 |
| --- | --- | --- | --- |
| 01-广场 | 广场列表 | `/pages/square/index` | 已接真实列表、筛选、抱抱、回复入口 |
| 02-写下心情 | 心情发布 | `/pages/mood/create` | 已接公开/私密发布、心情、可见性、回应风格、图片登记 |
| 03-树洞详情 | 详情页 | `/pages/post/detail?id=...` | 已接详情、抱抱、收藏、回复入口 |
| 04-回复抽屉 | 详情页 bottom sheet | `/pages/post/detail?id=...&sheet=reply` | 已接预设、匿名切换、提交回复 |
| 05-今日回信 | 今日回信 | `/pages/letter/index` | 已接回信生成、风格切换、保存、海报/分享 |
| 06-情绪工具 | 工具首页 | `/pages/tool/index` | 已接工具路由与月报入口 |
| 07-情绪拆解 | 拆解工具 | `/pages/tool/decompose` | 已接拆解生成与保存日记 |
| 08-我的 | 我的 | `/pages/me/index` | 已接个人资料、成长卡、菜单入口、清空确认 |
| 09-我的日记 | 日记列表 | `/pages/diary/index` | 已接日记列表/删除/详情 |
| 10-情绪月报 | 月报 | `/pages/report/month` | 已接月报、建议、海报 |
| 11-我的回信 | 回信列表 | `/pages/letter/list` | 已接历史回信 |
| 12-我的收藏 | 收藏列表 | `/pages/favorite/index` | 已接收藏读取与取消 |
| 13-隐私设置 | 隐私设置 | `/pages/settings/privacy` | 已接隐私、人类回复设置 |
| 14-帮助与反馈 | 帮助反馈 | `/pages/help/feedback` | 已接 FAQ、分类、反馈提交 |

## 核心业务流

| 流程 | 前端动作 | 后端/API | 验证结果 |
| --- | --- | --- | --- |
| 广场筛选 | 点击“焦虑”等中文分类 | `GET /api/v1/posts?mood=anxious` | 真实浏览器验证通过 |
| 公开发布 | 输入心情，选择心情/公开/温柔，发布 | `POST /api/v1/moods` | 返回新 post 并跳转详情 |
| 私密发布 | 选择仅自己可见，发布 | `POST /api/v1/moods` | 生成 letter/diary，不进入公开广场 |
| 详情抱抱 | 点击详情抱抱 | `POST /api/v1/posts/:id/hug` | DOM/计数状态变化 |
| 详情收藏 | 点击收藏 | `POST /api/v1/posts/:id/favorite` | DOM/收藏状态变化 |
| 回复抽屉 | 点击回复，打开 bottom sheet | `GET /api/v1/reply-presets` | 抽屉状态真实打开 |
| 提交回复 | 输入或选预设后提交 | `POST /api/v1/posts/:id/replies` | 返回 201 并刷新详情 |
| 今日回信风格 | 温柔/理性/轻松/文艺切换 | `POST /api/v1/letters/:id/regenerate` | 回信内容刷新 |
| 保存回信 | 点击保存 | `POST /api/v1/letters/:id/save-to-diary` | 返回 201 |
| 分享回信 | 点击分享/海报 | `POST /api/v1/letters/:id/poster` / `POST /api/v1/share-image` | 返回海报/分享结果 |
| 情绪拆解 | 输入内容后生成 | `POST /api/v1/tools/emotion-decompose` | 返回拆解结果 |
| 工具保存 | 拆解/通用工具保存 | `POST /api/v1/diaries` | 写入日记 |
| 我的菜单 | 点击日记/回信/收藏/月报/隐私/反馈 | 对应 `GET` 接口 | 路由与接口均通过 |
| 隐私设置 | 切换隐私与人类回复 | `PUT /api/v1/settings/privacy` | 设置持久化 |
| 反馈提交 | 输入反馈并提交 | `POST /api/v1/feedback` | 生成 ticket |

## 已保留和强化的真实交互

- 保留现有 API 客户端、store、router 和业务组件，没有把页面改成静态图。
- 04-树洞详情-回复抽屉保持为 03 详情页内 bottom sheet 状态，不做独立路由页面。
- 所有点击验证使用真实 DOM 元素和 `data-testid`，没有透明热区或假按钮。
- 发布、回复、保存、分享、隐私设置、反馈提交等动作都要求接口返回或 DOM/store 状态变化。
- `scripts/test-click-all.ts` 和 `scripts/diagnose/diagnose-clickability.ts` 已支持前置输入/点击 setup，避免“空点按钮”的假通过。

## 验证证据

- 真实点击报告：`artifacts/test-report/real-browser-front-clicks.md`
- 点击覆盖报告：`artifacts/diagnosis/clickability-report.md`
- API 绑定报告：`artifacts/diagnosis/api-binding-report.md`
- 横向溢出报告：`artifacts/layout/front-horizontal-overflow.md`
- 前台截图：`artifacts/screenshots/front/01-square.png` 至 `artifacts/screenshots/front/14-feedback-help.png`

## 剩余注意点

- 截图中的内容、时间、计数会随真实数据变化，不应作为静态像素锁死。
- 视觉精度已进入自动截图验收，但当前最终 QA 主要验证结构、无溢出、无遮挡和真实交互；如后续要做严格像素阈值，应把设计图裁切、动态数据冻结和差异阈值一起纳入 CI。
