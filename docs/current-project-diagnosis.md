# GoodnightTreeHole 当前项目诊断

生成时间：2026-07-09

## 1. 诊断结论

当前项目不是空壳，前台、后台和 API 都已经存在真实实现；但仍然存在“设计稿 DOM、真实 API、自动验证脚本”三层没有完全锁死的问题。

最主要的问题是：

- 前台真实 DOM 已从旧的 `select` 控件改成设计稿式按钮卡片，但 `tests/interaction-manifest.front.json`、`scripts/test-business-flow.ts`、`scripts/real-browser-front-clicks.ts` 仍在找旧控件，例如 `select-mood-visibility`、`select-mood-emotion`、`btn-square-refresh`。
- 广场筛选当前调用 `GET /api/v1/posts?emotion=中文心情`，但新业务契约要求能验证 `mood=anxious` 一类稳定 key；API 也还没有兼容 `mood` 参数。
- 种子数据只覆盖了焦虑、失眠，委屈、恋爱、工作筛选会真实变空，容易被误判为按钮无效。
- 当前 API 存在真实数据源，但对文档指定接口缺少兼容别名，例如 `POST /api/v1/posts`、`POST /api/v1/posts/:id/hugs`、`POST /api/v1/letters/generate`、`GET /api/admin/v1/dashboard`、`POST /api/admin/v1/login` 等。
- 后台管理与前台共用 `StoreService` 文件型持久化数据源，但部分后台操作接口命名和文档要求不一致，例如审核接口现在是 `PATCH /api/admin/v1/posts/:id/moderation`，文档要求 `approve/reject/block`。
- 视觉层已做过一轮前台 01/02/03/04/05/06/08 精修，但 07/09/10/11/12/13/14 还没有统一加上 `.goodnight-page`，后台 10 页还未纳入同一套视觉验证报告。

## 2. 前台页面路由与组件

| 设计页 | 真实路由 | 组件文件 | 当前状态 |
| --- | --- | --- | --- |
| 01 广场 | `/pages/square/index` | `apps/mp/src/views/Square.vue` | 真实 API，筛选参数需改为稳定 mood key |
| 02 写下心情 | `/pages/mood/create` | `apps/mp/src/views/MoodCreate.vue` | 真实发布，文档别名 `/pages/post/create` 未配置 |
| 03 树洞详情 | `/pages/post/detail?id=` | `apps/mp/src/views/PostDetail.vue` | 真实详情、抱抱、收藏、回复抽屉 |
| 04 回复抽屉 | `/pages/post/detail?id=&sheet=reply` | `apps/mp/src/views/PostDetail.vue` | 页面内 bottom sheet 状态，符合要求 |
| 05 今日回信 | `/pages/letter/index`、`/pages/letter/today` | `apps/mp/src/views/LetterToday.vue` | 真实回信、保存、分享；接口别名需补齐 |
| 06 情绪工具 | `/pages/tool/index` | `apps/mp/src/views/ToolIndex.vue` | 真实跳转，自动验证清单 testId 已过期 |
| 07 情绪拆解 | `/pages/tool/decompose` | `apps/mp/src/views/ToolDecompose.vue` | 真实生成、保存、复制；需统一页面基础类 |
| 08 我的 | `/pages/me/index` | `apps/mp/src/views/Me.vue` | 真实统计、跳转、清空确认 |
| 09 我的日记 | `/pages/diary/index`、`/pages/diary/list` | `apps/mp/src/views/DiaryList.vue` | 真实列表、月份/心情筛选、详情入口 |
| 10 情绪月报 | `/pages/report/month` | `apps/mp/src/views/ReportMonth.vue` | 真实月报、建议、分享图预览 |
| 11 我的回信 | `/pages/letter/list` | `apps/mp/src/views/LetterList.vue` | 真实筛选、查看、收藏、喜欢、已读 |
| 12 我的收藏 | `/pages/favorite/index`、`/pages/favorite/list` | `apps/mp/src/views/FavoriteList.vue` | 真实分类、跳转、取消收藏 |
| 13 隐私设置 | `/pages/settings/privacy` | `apps/mp/src/views/PrivacySettings.vue` | 真实保存、导出、说明弹层 |
| 14 帮助与反馈 | `/pages/help/feedback`、`/pages/feedback/index` | `apps/mp/src/views/FeedbackHelp.vue` | 真实 FAQ、上传、提交反馈 |

## 3. 后台页面路由与组件

| 设计页 | 真实路由 | 组件文件 | 当前状态 |
| --- | --- | --- | --- |
| 01 登录 | `/login` | `apps/admin/src/views/Login.vue` | 真实登录，当前 API 是 `/api/admin/v1/auth/login` |
| 02 数据总览 | `/dashboard` | `apps/admin/src/views/Dashboard.vue` | 真实统计，当前 API 是 `/dashboard/overview` |
| 03 用户管理 | `/users` | `apps/admin/src/views/TablePage.vue` | 真实列表、禁言/恢复 |
| 04 树洞内容 | `/posts` | `apps/admin/src/views/TablePage.vue` | 真实审核、隐藏、风险标记、AI 回复 |
| 05 回应审核 | `/replies/moderation` | `apps/admin/src/views/TablePage.vue` | 真实通过、拦截、修改后通过 |
| 06 AI 配置中心 | `/ai/providers` | `apps/admin/src/views/TablePage.vue` | 真实新增、编辑、启停、测试 |
| 07 风格路由 | `/ai/routes` | `apps/admin/src/views/TablePage.vue` | 真实保存、测试生成 |
| 08 AI 任务记录 | `/ai/jobs` | `apps/admin/src/views/TablePage.vue` | 真实重试、模板兜底 |
| 09 反馈工单 | `/ops/feedback` | `apps/admin/src/views/TablePage.vue` | 真实回复、解决 |
| 10 系统设置 | `/ops/config` | `apps/admin/src/views/TablePage.vue` | 真实保存、重置 |

## 4. 按钮与 API 绑定诊断

已确认这些按钮是真实 DOM 控件，并绑定真实方法：

- 广场：分类、卡片进入详情、抱抱、回应、更多菜单、举报、复制、隐藏、写心情。
- 写心情：输入、心情选择、可见范围、回应风格、添加图片、发布。
- 详情：抱抱、收藏、更多、快捷回应、匿名开关、可见范围、发布回应。
- 今日回信：风格切换、换一种风格、保存到日记、分享图片、建议切换。
- 工具：工具卡跳转、拆解生成、保存到日记、复制结果、通用工具生成/保存。
- 我的：所有入口跳转、清空记录确认。
- 后台：登录、导航、审核、用户状态、AI 配置、AI 路由、任务重试、工单处理、设置保存。

发现的问题：

- 自动验证清单中仍存在旧选择器：`select-mood-emotion`、`select-mood-visibility`、`select-mood-style`。
- 自动验证清单中存在已删除按钮：`btn-square-refresh`。
- 自动验证清单中工具 testId 与真实 DOM 不一致：`tool-heal/tool-sleep/tool-work/tool-future` 应改为 `tool-healing-quote/tool-sleep-comfort/tool-work-support/tool-future-letter`。
- 自动验证清单中部分期望 URL 用旧兼容路由：`/pages/diary/list`、`/pages/favorite/list`、`/pages/feedback/index`；这些路由存在，但设计语义主路由应同步为 `/pages/diary/index`、`/pages/favorite/index`、`/pages/help/feedback`。

## 5. 透明热区和旧壳子

- `apps/mp/src/InteractionLayer.vue` 和 `apps/admin/src/InteractionLayer.vue` 当前仅渲染 hidden span，没有透明热区。
- 代码扫描未发现实际页面中存在 `hotspot`、`ref-shell`、`ref-content`、`proxy-button` 等可点击代理壳子。
- 存在用于检查英文测试浮层的审计脚本，但页面本身没有要求中禁止的英文测试按钮。

## 6. 滚动、遮挡和视觉基础

- 前台 01/02/03/04/05/06/08 已经统一接入 `.goodnight-page`。
- 前台 07/09/10/11/12/13/14 仍需补齐 `.goodnight-page`，保证安全区、横向溢出和 textarea resize 规则一致。
- 当前 `.tabbar` 是固定底部导航，长列表内容可能经过其背后；必须通过底部 padding 和真实浏览器滚动验证来判断是否遮挡文字/按钮。
- 后台仍是通用表格页，视觉接近管理台壳子，但和 admin 10 张设计图还不是逐页专属还原。

## 7. 前后台数据源

- 前台、后台和 API 共用 `StoreService`，默认持久化到 `data/goodnight-store.json` 或测试指定的 `GOODNIGHT_STORE_FILE`。
- 这意味着前台发布、回复、反馈、AI 任务理论上能被后台看到。
- 但因为文档要求的接口别名未完全覆盖，外部业务流脚本如果按文档路径验证会失败。

## 8. 必须修复项

1. 补齐 API 兼容别名，既保留已有 API，又支持文档要求路径。
2. 广场筛选改为稳定 `mood` key，并让 API 同时支持中文、拼音、英文 key。
3. 种子数据补齐委屈、焦虑、失眠、恋爱、工作，避免分类真实无数据。
4. 更新 `tests/interaction-manifest.front.json` 和相关脚本，绑定当前真实 DOM。
5. 新增文档要求的 `tests/business`、`tests/visual`、`tests/diagnose` 测试入口。
6. 新增 `qa:real-all` 以及文档要求的测试命令。
7. 前台 07/09/10/11/12/13/14 补齐统一 `.goodnight-page` 基础样式。
8. 完成后用真实浏览器跑前台业务流、后台同步流、AI 路由流、视觉/溢出/点击诊断，并输出最终报告。
