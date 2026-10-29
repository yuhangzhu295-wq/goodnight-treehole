# admin: journeys (现实旅程)

Route: `/experience/journeys`  
Component: `apps/admin/src/views/TablePage.vue`  
Group: 体验网络

## PURPOSE

以只读方式查看全部用户的现实旅程（LifeJourney）列表：旅程 ID、现实困境标题、领域、状态与「N 更新 / N 行动」计数，并可在详情抽屉中展开标题、领域、状态、当前摘要与创建时间。本资源在 TablePage 中没有任何写操作按钮（`apps/admin/src/views/TablePage.vue:842-912` 的 action 分支不含 journeys）。

## USER_JOB

管理员需要按旅程状态盘点在办的真实案例，判断哪些旅程长期停在某个阶段、哪些已经有更新和行动，并进入单条旅程查看 AI 生成的当前摘要，以便决定是否人工介入。

## ENTRY

侧边栏「更多管理」折叠区中的「现实旅程」（`apps/admin/src/router.ts:64`；渲染在 `apps/admin/src/views/Layout.vue:130-151` 的 secondaryMenu，因为 `/experience/journeys` 不在 `Layout.vue:26-36` 的 primaryPaths 中）。也可直接访问 `/experience/journeys`。路由守卫要求 localStorage 中存在 admin token（`apps/admin/src/router.ts:122-125`），否则重定向到 `/login`。

## EXIT

点击侧边栏其它菜单项，或直接改 URL 离开。详情是页内抽屉，通过抽屉头部「×」或点击遮罩关闭（`TablePage.vue:947-951`、`TablePage.vue:445-447`）。

## ROUTES

- `/experience/journeys` → `TablePage.vue`，props `{ resource: 'journeys', title: '现实旅程' }`，title「现实旅程」，group「体验网络」，`viaTablePage: true`（`artifacts/product-audit/admin-routes.json`；路由由 `apps/admin/src/router.ts:111-118` 从 menu 生成）。

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| 加载中 | `busy=true`，表格 `:aria-busy="busy"` | `TablePage.vue:416`、`TablePage.vue:916` |
| 已加载 | `status` = 「已加载 N 条，当前显示 N 条」 | `TablePage.vue:431` |
| 加载失败 | `status` = `error.message` 或「加载失败」 | `TablePage.vue:432-434` |
| 已选中某行 | `selectedId` + `detailOpen` | `TablePage.vue:439-443` |
| 详情抽屉打开 | `detailOpen=true`，`role="dialog" aria-modal="true"` | `TablePage.vue:947-948` |
| 空表 | `items.length === 0` | `TablePage.vue:939-941` |

## CONTROLS

| control | handler | real effect |
| --- | --- | --- |
| 搜索框（placeholder「搜索 ID / 内容 / 用户」，`data-testid="admin-search"`） | `v-model="search"`（`TablePage.vue:800-805`）→ `watch([search, filter])` 触发 `load`（`TablePage.vue:784-787`） | 把 `q` 拼进查询串（`TablePage.vue:407`）并重新请求 `GET /api/admin/v1/journeys`。**但 `adminJourneys` 只声明了 `status/page/pageSize` 三个 query 参数，不读 `q`（`apps/api/src/controllers.ts:1918-1923`），实测 `journeys?q=zzzznomatch` 与不带 q 返回完全相同（5/5 条）。输入内容对结果没有任何影响。** |
| 操作内容输入框（label「操作内容」，`data-testid="admin-action-input"`） | `v-model="actionText"`（`TablePage.vue:809-812`） | 只写本地 `actionText`；journeys 没有 action 分支，没有任何 handler 读取它（`actionInput` 回退到默认文案，`TablePage.vue:85-97`）。对结果无影响。 |
| 刷新（`data-testid="admin-audit-refresh"`） | `load`（`TablePage.vue:813`） | 重新执行 `loadCache()` + `GET /api/admin/v1/journeys?page=1&pageSize=20`（`TablePage.vue:415-429`） |
| 行点击 / Enter / Space | `selectRow(row)`（`TablePage.vue:930-932`、`TablePage.vue:439-443`） | 设置 `selectedId`、打开详情抽屉，并把 `status` 设为「已选择 <id>」 |
| 详情关闭（`data-testid="admin-detail-close"`） | `closeDetail`（`TablePage.vue:951`、`TablePage.vue:445-447`） | `detailOpen=false` |
| 遮罩点击 | `closeDetail`（`TablePage.vue:947` 的 `@click.self`） | `detailOpen=false` |

未渲染的控件（本资源无对应分支）：状态筛选 select（`filterOptions` 对 journeys 返回空数组，`TablePage.vue:335-341`，所以 `v-if="filterOptions.length"` 不渲染）、任何 action 按钮、上一页/下一页（模板中不存在分页控件，`TablePage.vue:914-945`）。

## API_READS

- `GET /api/admin/v1/journeys` — handler `adminJourneys`（`apps/api/src/controllers.ts:1917-1933`），第 1924 行调用 `this.admin(auth)` 校验 token。列表由 `this.list(...)`（`controllers.ts:1765-1772`）分页，返回 `{ items, page, pageSize, total, totalPages }`。
- 该 handler 同时读取 `store.journeyUpdates` 与 `store.actionCommitments` 做计数（`controllers.ts:1929-1930`）。
- 端点在 `apps/admin/src/views/TablePage.vue:56` 注册（`journeys: '/api/admin/v1/journeys'`）。
- **实测（`work/group-c-probe.mjs`，对本机 127.0.0.1:3000）：无 `authorization` 头 → 401；带 `Bearer <admin_1 token>` → 200。本资源不属于 ISSUE-001 的 58 个无守卫端点。**

## API_WRITES

None found. journeys 在本页没有任何写操作：`TablePage.vue` 的 `resource-actions` 中没有 journeys 分支（`TablePage.vue:842-912`），`endpoints` 记录（`TablePage.vue:43-67`）也只给出一个 GET 端点。

## DB_ENTITIES

- **LifeJourney**（`prisma/schema.prisma:359-398`）：行数据来源，字段 `id/title/domain/status/stage/summary/createdAt/updatedAt`。
- **JourneyUpdate**（`prisma/schema.prisma:428-450`）：只用于「N 更新」计数（`controllers.ts:1929`）。
- **ActionCommitment**（`prisma/schema.prisma:452-473`）：只用于「N 行动」计数（`controllers.ts:1930`）。
- **AdminUser**（`prisma/schema.prisma:184-197`）：`verifyToken` 用它确认 token 对应的管理员（`apps/api/src/store.service.ts:2190-2197`）。
- 未写 AuditLog：本 GET 不调用 `store.audit`（对比 `controllers.ts:1988` 的 PATCH 会写）。
- 持久化路径：`StoreService.persist()`（`store.service.ts:1879-1893`）→ 关系型映射 `relational-runtime.mapper.ts:44`（`db.lifeJourney.findMany`）；`RuntimeState.payload`（`prisma/schema.prisma:888-892`）只在非关系型 payload 时作为回退（`apps/api/src/prisma-runtime.service.ts:17-27`）。

## ADMIN_VISIBILITY

菜单项对所有已登录管理员可见，无角色过滤：`router.ts:64` 与 `Layout.vue:43`/`:130-151` 不判断角色；后端只校验 token 存在且 admin id 已知（`controllers.ts:1761-1763`、`store.service.ts:2190-2197`）。`AdminRole.permissions`（`prisma/schema.prisma:203`）从未被读取——`relational-runtime.mapper.ts:169` 只写入 `permissions: []`，全仓无读取点。因此 super_admin 与任何其它角色看到同一份数据。

## AI_USAGE

本页展示的 `summary` 字段是 AI 产出文本：`journey.summary` 由结构化生成结果写入（`apps/api/src/store.service.ts:2604`、`store.service.ts:3208`，`String(structured.summary ?? completed.result)`）。本页自身不发起任何 AI 调用。注意在 DAPI 余额不足时这些 job 以 `status='fallback'` 结束（ISSUE-007，`work/q-aijobs.sql` 实测 8/8），所以摘要可能是安全兜底文案而不是模型输出，而本页不区分二者。

## PRIVACY

- 详情抽屉直接展示用户私密文本：`title`、`summary`（`TablePage.vue:694-702`）。`LifeJourney.visibility` 默认 `PRIVATE`（`prisma/schema.prisma:370`），实测样本 `journey_044afe1bc1` 的 `visibility` 就是 `PRIVATE`，但该字段没有在管理端用于限制任何内容。
- 列表本身不展示 `userId`（列定义 `TablePage.vue:254-260` 只显示 id/title/domain/status/counts），但 API 响应包含 `userId`（实测样本含 `"userId":"user_demo"`）。
- 无隐私开关判断：`adminJourneys` 不调用 `privacyAllows`，不检查 `allowJourneyLongTermAnalysis` 或 `allowRecoveryData`。管理端读取不受用户隐私设置约束（管理端的预期行为，但代码里没有任何记录说明这是有意设计）。

## ERROR_STATES

有可见错误状态：`load` 的 `catch` 把 `status` 设为 `error.message ?? '加载失败'`（`TablePage.vue:432-434`），`status` 渲染在工具栏的 `<p class="muted">{{ status }}</p>`（`TablePage.vue:797`），`.muted` 是可见样式（`apps/admin/src/styles.scss:289-291`）。

但该提示很弱：它是普通段落，没有 `role="status"` / `aria-live`（对比 `AIJobsPage.vue:306`、`UsersPage.vue:133` 都带 `role="status"`），失败时表格同时被清空为「暂无数据」（`items.value` 未被赋值，`TablePage.vue:427` 只在成功分支执行），所以失败与「真的没有数据」在视觉上高度相似，只差工具栏一行小字。这是发现项。

另有耦合型失败：`load()` 先 `await loadCache()`（`TablePage.vue:418`），`loadCache` 用 `Promise.all` 拉取 users/posts/replies/feedback-categories/ai/providers 五个**无关**端点（`TablePage.vue:387-401`），任一失败都会让 `load` 抛出，于是本资源的表格显示为空 + 错误行，尽管 `/journeys` 本身可用。

## EMPTY_STATES

单一通用空态：`<tr v-if="!items.length"><td :colspan="columns.length" class="empty-cell">暂无数据</td></tr>`（`TablePage.vue:939-941`；样式 `apps/admin/src/styles.scss:507-511`）。没有针对 journeys 的文案（例如「当前没有进行中的旅程」），也不区分「无数据」与「筛选后无结果」，更没有引导按钮。

## NATIVE_RISKS

本页是 Web 管理后台，不运行在小程序原生端，无键盘/剪贴板/返回键/安全区问题。间接风险：管理端对 `LifeJourney` 的读取代入的是同一份关系型数据（`relational-runtime.mapper.ts:44`），与前台共享；本页只读，不产生原生端可见的状态变化。除上述外 **None found.**

## ISSUES

- P2 / FAKE_FUNCTION：搜索框在本页渲染且可输入，但 `adminJourneys` 不读 `q`（`controllers.ts:1918-1923`），实测 `journeys?q=zzzznomatch` 与无 q 返回相同 5/5 条。控件宣称能搜索，实际不改变结果（`TablePage.vue:800-805`、`:407`）。
- P2 / FUNCTIONAL：分页参数 `page=1&pageSize=20` 固定发送（`TablePage.vue:78-79`、`:405-406`），但模板没有任何翻页控件（`TablePage.vue:914-945`），所以行数超过 20 时页面静默只显示前 20 条，`total` 更大的事实只体现在工具栏文案里。
- P2 / FUNCTIONAL：`load()` 在读取本资源前先 `await loadCache()` 拉取 5 个无关端点（`TablePage.vue:418`、`:387-401`），任一失败即让本表显示为空 + 错误行，属于跨资源故障耦合。
- P3 / UX：`status` 错误/提示行没有 `role="status"`/`aria-live`（`TablePage.vue:797`），读屏用户不会被告知加载失败。
- P3 / UX：失败态与空态视觉上几乎一致（都是空表 + 一行小字），无法区分「没有旅程」与「加载失败」。
- P3 / UX：空态是通用「暂无数据」（`TablePage.vue:940`），没有针对现实旅程的说明或下一步引导。
- P3 / UX：后端支持 `status` 过滤（`controllers.ts:1920`、`:1926`），但本页不渲染状态筛选（`filterOptions` 对 journeys 返回 `[]`，`TablePage.vue:335-341`），该能力在管理端不可达。
- P3 / TEST_CONTRACT：`navTestIds`（`apps/admin/src/views/Layout.vue:65-79`）不含 `/experience/journeys`，所以该导航链接的 `data-testid` 为 `undefined`（`Layout.vue:121`、`:143`），自动化无法按 testid 定位这条入口。
- P3 / ORPHAN：`TablePage.vue` 中 journeys 相关的 action 分支不存在（`TablePage.vue:842-912`），但 `actionInput` 的「操作内容」输入框仍然为本资源渲染（`TablePage.vue:809-812`），无 handler 读取，属无害死控件。属 ISSUE-014 的同类问题。

## FINAL_STATUS

PARTIAL - 列表、详情与 token 守卫都已按行核对并实测（无 token 401 / 带 token 200），但搜索框不生效、分页不可用、错误态偏弱，且错误态与空态难以区分。

### Static evidence

- Controls discovered in component: 80
- Endpoint mapping: `apps/admin/src/views/TablePage.vue:56` (`journeys: /api/admin/v1/journeys`)
- Route: `/experience/journeys` → `TablePage.vue` (`artifacts/product-audit/admin-routes.json`)
- Handler: `adminJourneys` (`apps/api/src/controllers.ts:1917-1933`), guarded at `:1924`
- Guard proof: no token → 401, `Bearer` token → 200 (`work/group-c-probe.mjs`)
- Live data shape: 5 rows, keys `id,userId,title,domain,status,stage,visibility,intensity,initialIntensity,summary,createdAt,updatedAt,updates,actions`
- Seed: `lifeJourneys: []` (`apps/api/src/store.service.ts:1156`)

