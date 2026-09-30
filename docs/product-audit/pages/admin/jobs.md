# admin: jobs (AI 任务记录)

Route: `/ai/jobs`  
Component: `apps/admin/src/views/AIJobsPage.vue`
Group: AI 管理

## PURPOSE

以只读方式审查真实 AI 任务的运行记录：任务类型、风格、实际 Provider/模型、状态、耗时与创建时间，并在详情区展开原始 Prompt 摘要、生成结果、错误信息与 `traceJson` 调用轨迹（`apps/admin/src/views/AIJobsPage.vue:339-345`）。唯一写操作是对失败任务发起重试。

## USER_JOB

管理员需要定位失败任务并看清失败原因，确认某条任务实际走的是哪个模型、耗时多少，必要时对失败任务发起重试，并核对主备切换是否按预期发生。

## ENTRY

侧边栏「AI 管理 > AI 任务记录」（`apps/admin/src/router.ts:50`、`apps/admin/src/router.ts:105`）。也可直接访问 `/ai/jobs`。路由守卫要求 localStorage 中存在 admin token（`apps/admin/src/router.ts:122-125`）。

## EXIT

点击侧边栏其它菜单项或直接改 URL 离开。详情是页内区块而非抽屉，通过详情头部「×」关闭（`AIJobsPage.vue:340`、`:230-232`）。

## ROUTES

- `/ai/jobs` → `AIJobsPage.vue`，title「AI 任务记录」，group「AI 管理」，`viaTablePage: false`（`artifacts/product-audit/admin-routes.json`）。

## STATES

- 加载中：`busy=true`；初始 `status` 为「正在读取 AI 任务记录…」（`AIJobsPage.vue:10`）。
- 已加载：`status` 为 `dataNotice`，即「已从服务端读取 N 条任务记录。」或条数被截断时的提示（`AIJobsPage.vue:208`，`dataNotice` 定义 :184-186）。
- 详情加载中：`detailLoading=true`，显示「正在同步详情…」（:340）。
- 重试中：`act` 设 `busy=true` 并禁用按钮（:251-267）。
- 失败：`catch` 把 `status` 设为 `error.message` 或「任务记录加载失败」/「无法读取这条任务详情」/「操作失败」（:210、:225、:265）。
- 空数据：表格渲染「暂无匹配的 AI 任务」（:332）。

## CONTROLS

| control | handler | real effect |
| --- | --- | --- |
| 查询 | `load`（`AIJobsPage.vue:305`） | GET `/api/admin/v1/ai/jobs?page=1&pageSize=100`（:202） |
| 重置 | `resetFilters`（:305） | 只清空本地筛选与 `page`，不发请求（:189-197） |
| 任务类型 select | `v-model="taskFilter"`（:299） | 本地过滤（`filteredItems`，:137-160） |
| 风格 select | `v-model="styleFilter"`（:300） | 本地过滤 |
| 实际模型 select | `v-model="providerFilter"`（:301） | 本地按 `modelName` 过滤 |
| 状态 select | `v-model="stateFilter"`（:302） | 本地过滤 |
| 创建时间 date 起止 | `v-model="createdFrom"` / `createdTo`（:303） | 本地按 `createdAt` 的日期串比较（:155-157） |
| 搜索 | `v-model="search"`（:304） | 本地匹配 id/userId/contentId/任务类型/风格/模型（:138-147） |
| 查看详情（每行） | `open`（:330、:215-228） | GET `/api/admin/v1/ai/jobs/:id`，用返回值替换该行 |
| 重试（每行，仅 `failed`） | `runAction`（:330、:270-273） | POST `/api/admin/v1/ai/jobs/:id/retry`，成功后选中新任务 |
| 重试任务（详情，仅 `failed`） | `act`（:344、:251-267） | 同上 |
| 上一页 / 下一页 | `changePage`（:336、:242-248） | 仅切换客户端分页 |
| 每页数量（5/10/20） | `v-model.number="pageSize"`（:336） | 仅改变客户端分页，默认 5（:24） |

## API_READS

- `GET /api/admin/v1/ai/jobs` — handler `jobs`（`apps/api/src/controllers.ts:2547-2550`）。无 token 校验，属 ISSUE-001 的无守卫读端点。
- `GET /api/admin/v1/ai/jobs/:id` — handler `job`（`controllers.ts:2551-2554`）。无 token 校验，同上。

## API_WRITES

- `POST /api/admin/v1/ai/jobs/:id/retry` — handler `retryJob`（`controllers.ts:2555-2573`），校验 token（:2557），经 `queueAiJob` 建新任务并把 `retryCount` 置为原值 +1（:2559-2568）。
- `POST /api/admin/v1/ai/jobs/:id/fallback` — handler `fallbackJob`（`controllers.ts:2574-2577`），**无 token 校验**，且固定抛 `BadRequestException`（:2576），本页无调用方。

## DB_ENTITIES

- `AIJob`（`prisma/schema.prisma:1013`）。
- `AIProvider`（`prisma/schema.prisma:966`，经 `providerId`）。
- `Reply`（`prisma/schema.prisma` 的 `Reply` 模型，经 `aiJobId` 反向关联）。
- `AuditLog`（`prisma/schema.prisma:1057`，`AI_JOB_RETRY`）。
- 持久化路径：`StoreService.persist()`（`apps/api/src/store.service.ts:1879-1893`）→ 关系型映射 `relational-runtime.mapper.ts:136`。

## ADMIN_VISIBILITY

菜单项对所有已登录管理员可见，无角色过滤（`router.ts:31-91`、`Layout.vue:116`/`:138`）；后端只校验 token（`controllers.ts:1761-1763`、`store.service.ts:2190-2197`），`AdminRole.permissions` 未被读取。

## AI_USAGE

本页是 AI 调用的观测面：`traceJson` 记录 `queued`/`running`/`provider-attempt`/`terminal` 事件与主备角色（`AIJobsPage.vue:118-131`），`promptSummary`/`result`/`errorMessage` 来自 `AIJob`（`prisma/schema.prisma:1013-1036`）。重试会重新入队真实模型调用。

## PRIVACY

本页对任一已登录管理员展示 `userId`、`contentId`、`promptSummary`、`result` 与完整原始记录（`AIJobsPage.vue:344`，`rawJob` 定义 :101-103）。模板上的 `data-visual-mask="userText"/"aiText"`（:322-331、:344）只是视觉遮罩属性，DOM 中仍是真实值，不构成访问控制。

## ERROR_STATES

`load`/`open`/`act` 的 `catch` 都写 `status`（`AIJobsPage.vue:210`、`:225`、`:265`），但承载 `status` 的 `.filter-status` 是视觉隐藏元素（`AIJobsPage.vue:366`；模板位置 :306）。因此**加载或详情失败时页面只剩空表，没有可见错误提示**——这是发现项。详情区本身有字段级兜底文案（「未记录调用错误。」等，:344）。

## EMPTY_STATES

- 表格零行：`<tr v-if="!visibleItems.length"><td colspan="10" class="empty-cell">暂无匹配的 AI 任务</td></tr>`（`AIJobsPage.vue:332`）。
- 详情无输入摘要：「该任务未记录可展示的输入摘要。」（:344）。
- 详情无错误：「未记录调用错误。」（:344）。
- 详情无轨迹：「该任务暂未记录调用轨迹。」（:344）。
- 未选中任务时不渲染详情区（`v-if="selected"`，:339）。

## NATIVE_RISKS

本页是 Web 管理后台，不直接运行在小程序原生端。间接影响：重试会把同一条用户内容再次送入真实模型，属于对用户数据的再次处理；本页本身不做隐私开关判断。除上述外 **None found.**

## ISSUES

- P0 / SECURITY：`GET /api/admin/v1/ai/jobs` 与 `GET /api/admin/v1/ai/jobs/:id` 无 token 守卫（`controllers.ts:2547`、`controllers.ts:2551`；`artifacts/product-audit/admin-unguarded.json` line 2547、2551），未授权即可读取任务记录与 Prompt 摘要。属 ISSUE-001。
- P0 / SECURITY：`POST /api/admin/v1/ai/jobs/:id/fallback` 无 token 守卫（`controllers.ts:2574`；`admin-unguarded.json` line 2574）。属 ISSUE-001。
- P1 / FAKE_BUTTON：`TablePage.vue` 的 jobs 分支（「重试」「模板兜底」，`apps/admin/src/views/TablePage.vue:878-881`）永不渲染（`router.ts:110-118`）；对应 handler（`TablePage.vue:525-531`）为死代码。属 ISSUE-014。
- P1 / FAKE_FUNCTION：`POST /ai/jobs/:id/fallback` 的 handler 固定抛 400（`controllers.ts:2576`），但端点名与 TablePage 按钮（`TablePage.vue:530`）仍宣称「模板兜底」；实际行为是拒绝。属 ISSUE-014。
- P2 / UX：加载与详情失败没有可见错误状态（`status` 渲染在视觉隐藏元素内，`AIJobsPage.vue:306`、`:366`）。
- P2 / PRIVACY：任务详情向所有管理员明文展示 `userId`/`contentId`/`promptSummary`/`result`，`data-visual-mask` 仅为视觉遮罩（`AIJobsPage.vue:344`）。
- P3 / UX：分页在客户端完成，`load` 固定拉取 `pageSize=100`（`AIJobsPage.vue:202`），超过 100 条时页面只显示前 100 条，靠 `dataNotice` 提示截断（:184-186）。

## FINAL_STATUS

PARTIAL —— 读、详情与重试流程真实可用，但两个读端点与 fallback 端点无 token 守卫（ISSUE-001），TablePage 分支不可达、fallback 端点名实不符（ISSUE-014）。

### Static evidence

- Controls discovered in component: 12
- Endpoint mapping: `apps/admin/src/views/TablePage.vue:49`（`jobs: /api/admin/v1/ai/jobs`）
- Route: `/ai/jobs` → `AIJobsPage.vue`（`artifacts/product-audit/admin-routes.json`）
- Unguarded endpoints: `GET ai/jobs`（2547）、`GET ai/jobs/:id`（2551）、`POST ai/jobs/:id/fallback`（2574）— `artifacts/product-audit/admin-unguarded.json`
- Seed: `aiJobs: []`（`apps/api/src/store.service.ts:1153`）
