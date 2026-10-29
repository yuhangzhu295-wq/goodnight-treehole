# admin: safety-events (安全事件)

Route: `/safety/events`  
Component: `apps/admin/src/views/TablePage.vue`  
Group: 安全与陪伴

## PURPOSE

以只读方式查看安全事件（SafetyEvent）：事件 ID、所属用户、风险等级、来源与时间，并可在详情抽屉中展开用户、风险等级、来源、触发原因与创建时间。本资源在 TablePage 中没有任何写操作按钮（`apps/admin/src/views/TablePage.vue:842-912` 的 action 分支不含 safety-events）。

## USER_JOB

管理员需要第一时间看到哪些用户被系统判定为高风险、这些判定来自哪个入口（旅程创建还是意图选择）、系统当时做了什么动作，以便决定是否需要人工跟进。这是本组 11 个资源中唯一的危机信号面。

## ENTRY

侧边栏「更多管理」折叠区中的「安全事件」（`apps/admin/src/router.ts:77`；渲染在 `apps/admin/src/views/Layout.vue:130-151` 的 secondaryMenu，`/safety/events` 不在 `Layout.vue:26-36` 的 primaryPaths 中）。也可直接访问 `/safety/events`。路由守卫要求 localStorage 中存在 admin token（`apps/admin/src/router.ts:122-125`）。

## EXIT

点击侧边栏其它菜单项或直接改 URL。详情是页内抽屉，通过「×」或点击遮罩关闭（`TablePage.vue:947-951`、`:445-447`）。

## ROUTES

- `/safety/events` → `TablePage.vue`，props `{ resource: 'safety-events', title: '安全事件' }`，group「安全与陪伴」，`viaTablePage: true`（`artifacts/product-audit/admin-routes.json`；`apps/admin/src/router.ts:111-118`）。

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| 加载中 | `busy=true` | `TablePage.vue:416`、`:916` |
| 已加载 | `status` = 「已加载 N 条，当前显示 N 条」 | `TablePage.vue:431` |
| 加载失败 | `status` = `error.message` 或「加载失败」 | `TablePage.vue:432-434` |
| 已选中某行 | `selectedId` | `TablePage.vue:439-443` |
| 详情抽屉打开 | `detailOpen=true` | `TablePage.vue:947-948` |
| 空表 | `items.length === 0` | `TablePage.vue:939-941` |

## CONTROLS

| control | handler | real effect |
| --- | --- | --- |
| 搜索框（`data-testid="admin-search"`） | `v-model="search"`（`TablePage.vue:800-805`）→ `watch` 触发 `load`（`:784-787`） | 把 `q` 拼进查询串（`:407`）并重新请求。**`safetyEvents` handler 只声明 `page/pageSize`（`apps/api/src/controllers.ts:2047-2051`），连 `status` 都不接受，更不读 `q`；搜索不生效。** |
| 操作内容输入框（`data-testid="admin-action-input"`） | `v-model="actionText"`（`TablePage.vue:809-812`） | 只写本地变量；safety-events 无 action 分支，无 handler 读取。无实际效果。 |
| 刷新（`data-testid="admin-audit-refresh"`） | `load`（`TablePage.vue:813`） | `loadCache()` + `GET /api/admin/v1/safety/events?page=1&pageSize=20` |
| 行点击 / Enter / Space | `selectRow`（`TablePage.vue:930-932`、`:439-443`） | 打开详情抽屉 |
| 详情关闭（`data-testid="admin-detail-close"`） | `closeDetail`（`TablePage.vue:951`、`:445-447`） | `detailOpen=false` |
| 遮罩点击 | `closeDetail`（`TablePage.vue:947`） | `detailOpen=false` |

未渲染：状态筛选（`filterOptions` 对 safety-events 返回空数组，`TablePage.vue:335-341`，而且后端也不支持）、任何 action 按钮、分页控件。

## API_READS

- `GET /api/admin/v1/safety/events` — handler `safetyEvents`（`apps/api/src/controllers.ts:2046-2054`），第 2052 行 `this.admin(auth)` 校验 token；返回 `this.list(this.store.safetyEvents, page, pageSize)`（`controllers.ts:2053`）——**无任何过滤参数**，整个数组直接分页。
- 端点注册于 `apps/admin/src/views/TablePage.vue:64`。
- **实测（`work/group-c-probe.mjs`）：无 `authorization` 头 → 401；带 `Bearer` token → 200。不属于 ISSUE-001 的无守卫端点。**
- 实测当前 `total=0`。

## API_WRITES

None found. 本页只发一个 GET（`TablePage.vue:43-67`），`resource-actions` 中无 safety-events 分支（`TablePage.vue:842-912`）。管理端不能确认、关闭或升级安全事件；也没有任何 `/api/admin/v1/safety/...` 写端点（`artifacts/product-audit/api-endpoints.json` 中 safety 下只有这一个 GET）。

## DB_ENTITIES

- **SafetyEvent**（`prisma/schema.prisma:707-720`）：行数据来源，字段 `id/userId/journeyId/level/source/action/payload/createdAt`。索引 `@@index([level, createdAt])`（`:719`）。
- **User**（`prisma/schema.prisma:136`）：详情抽屉通过 `userName(row.userId)` 显示为「昵称 / 匿名代号」（`TablePage.vue:754`）。
- **AdminUser**（`prisma/schema.prisma:184-197`）：token 校验。
- 未写 AuditLog（本 GET 不调用 `store.audit`）。
- 写入方（非本页）：`createJourney` 在 `detectRisk(content).level === 'high'` 时写入一条 `level:'high', source:'journey_create', action:'real_world_support_prompt', payload:{escalation:true}`（`apps/api/src/store.service.ts:2530-2540`）；`setJourneyIntent` 也会写一条 `level:'high'`（`:2787`）。`detectRisk` 只返回 `'high'` 或 `'low'`（`:5008-5010`），**`'critical'` 从不产生**，尽管 `:2782` 会检查它。
- 持久化路径：`StoreService.persist()`（`store.service.ts:1879-1893`）→ `relational-runtime.mapper.ts:222`（`tx.safetyEvent.upsert`）。

## ADMIN_VISIBILITY

菜单对所有已登录管理员可见，无角色过滤（`router.ts:77`、`Layout.vue:43`/`:130-151`）；后端只校验 token（`controllers.ts:1761-1763`）。`AdminRole.permissions`（`prisma/schema.prisma:203`）无读取点。危机事件对所有管理员同等可见，也没有已读/已处理状态可区分。

## AI_USAGE

本页不发起 AI 调用，但事件的产生依赖 AI 链路的两处：风险判定 `detectRisk`（`store.service.ts:5008-5010`）是纯关键词规则，不是模型；而一旦判定为 high，`queueAI` 会走安全升级分支，**跳过模型调用**直接返回固定安全文案（`store.service.ts:5300-5325`：`job.providerId='risk-escalation'`、`job.modelName='safety-policy'`、`durationMs=1`、trace 里 `safetyEscalation:true`）。因此安全事件不受 DAPI 余额影响。`payload` 字段（`prisma/schema.prisma:716`）在响应中，但管理端不渲染。

## PRIVACY

- 详情抽屉展示用户（`userName()` 输出「昵称 / 匿名代号」，`TablePage.vue:754`）、风险等级、来源与 `action`（`:757`）。不展示触发这次判定的原文——`SafetyEvent` 本身不存原文，只存 `action` 与 `payload`（`prisma/schema.prisma:715-716`），所以管理端看不到让用户被判定为高风险的句子。
- 列表展示 `level`（原始值，`:313`）与 `source`（`:314`）。
- 无隐私开关判断：`safetyEvents` 不调用 `privacyAllows`，也不检查 `allowRecoveryData`。危机场景下不设开关是合理设计，但代码里没有记录这是有意为之。

## ERROR_STATES

有可见错误状态：`load` 的 `catch` 写 `status = error.message ?? '加载失败'`（`TablePage.vue:432-434`），渲染在 `<p class="muted">`（`:797`，可见样式 `styles.scss:289-291`）。

弱点：无 `role="status"`/`aria-live`；失败时表格同时为空，与真正的空态难以区分。对危机信号面来说这是最需要区分的一页——管理员无法从界面判断「今天没有安全事件」还是「接口挂了」。耦合失败：`load()` 先 `await loadCache()`（`TablePage.vue:418`），后者 `Promise.all` 拉 5 个无关端点（`:387-401`），任一失败即让本表显示为空 + 错误行。

## EMPTY_STATES

单一通用空态：`<tr v-if="!items.length">...暂无数据`（`TablePage.vue:939-941`）。实测当前 `total=0`，所以这是本资源的默认外观。没有针对安全事件的文案，也不区分「无数据」与「加载失败」。

## NATIVE_RISKS

本页是 Web 管理后台，不运行在小程序原生端。间接风险：安全事件驱动前台 `SafetySupport` 的进入条件——`setJourneyIntent` 在旅程已为 `safety_first` 且存在 high/critical 事件时把用户路由到 `/pages/safety/index`（`store.service.ts:2779-2782`、`:2815-2820`、`:2845`）。本页只读，无法干预该路由；也没有任何「已人工跟进」的标记，所以管理端的跟进动作不会回写到前台。除上述外 **None found.**

## ISSUES

- P2 / PRIVACY：管理端看不到触发判定的原文，因此无法复核误判。`SafetyEvent` 只存 `action`/`payload`（`prisma/schema.prisma:715-716`），而列表与详情也不渲染 `payload`；结合 `detectRisk` 是纯关键词匹配（`store.service.ts:5008-5010`），管理员无法判断这条 high 是真实危机还是关键词误报。
- P2 / DATA：`风险等级` 列直接渲染原始字符串 `row.level`（`TablePage.vue:313`），不走 `statusLabel`；`statusLabel` 映射表（`:120-147`）不含 `high`/`low`，所以显示为英文原值。同组件的 `journeys`/`support-plans` 分支都会翻译。
- P2 / FUNCTIONAL：管理端无法确认/关闭事件。本页没有任何写按钮（`TablePage.vue:842-912`），后端也没有 safety 写端点（`api-endpoints.json`），所以同一条 high 事件会一直留在队列里，没有「已处理」状态可区分。
- P2 / FUNCTIONAL：`source` 只有两个可能值（`journey_create`、`journey_intent`），但列与详情都显示原始英文（`:314`、`:756`），没有本地化。
- P2 / FAKE_FUNCTION：搜索框渲染且可输入，但 `safetyEvents` handler 连 `status` 都不接受、更不读 `q`（`controllers.ts:2047-2051`），搜索不生效。
- P2 / FUNCTIONAL：分页固定 `page=1&pageSize=20`（`TablePage.vue:78-79`、`:405-406`），模板无翻页控件（`TablePage.vue:914-945`）。对危机队列来说，超过 20 条时更新的记录会被挤到第二页且无法翻到。
- P2 / FUNCTIONAL：`load()` 先拉 5 个无关端点（`TablePage.vue:418`、`:387-401`），任一失败即让本表变空 + 错误行。
- P2 / UX：排序不受控。后端直接返回 `store.safetyEvents` 数组顺序（`controllers.ts:2053`），写入用 `unshift`（`store.service.ts:2531`、`:2787`），但持久化读取按 `createdAt desc`（`relational-runtime.mapper.ts:61`）；界面既不显示也不允许选择排序。
- P3 / UX：`status` 行无 `role="status"`/`aria-live`（`TablePage.vue:797`）。
- P3 / UX：失败态与空态视觉上几乎一致——对危机信号面来说风险更高。
- P3 / UX：空态是通用「暂无数据」（`TablePage.vue:940`）。
- P3 / TEST_CONTRACT：`navTestIds`（`Layout.vue:65-79`）不含 `/safety/events`，导航链接 `data-testid` 为 `undefined`（`Layout.vue:121`、`:143`）。
- P3 / DATA：`critical` 等级在代码中被检查（`store.service.ts:2782`）但从不产生——`detectRisk` 只返回 `high`/`low`（`:5010`），两个写入点都硬编码 `level:'high'`（`:2535`、`:2791`）。等级体系实际只有一个值。

## FINAL_STATUS

PARTIAL - 列表、详情与 token 守卫已逐行核对并实测（无 token 401 / 带 token 200），但危机队列没有处理状态、误判无法复核、等级与来源未本地化、搜索不生效。

### Static evidence

- Controls discovered in component: 80
- Endpoint mapping: `apps/admin/src/views/TablePage.vue:64` (`safety-events: /api/admin/v1/safety/events`)
- Route: `/safety/events` → `TablePage.vue` (`artifacts/product-audit/admin-routes.json`)
- Handler: `safetyEvents` (`apps/api/src/controllers.ts:2046-2054`), guarded at `:2052`
- Guard proof: no token → 401, `Bearer` token → 200 (`work/group-c-probe.mjs`)
- Live data shape: 0 rows (`total=0`)
- Writers: `store.service.ts:2530-2540` (`journey_create`), `:2787` (`journey_intent`)
- `detectRisk` returns only `high`/`low`: `store.service.ts:5008-5010`
- Seed: `safetyEvents: []` (`apps/api/src/store.service.ts:1173`)

