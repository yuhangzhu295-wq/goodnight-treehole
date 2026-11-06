# admin: memory (有限记忆)

Route: `/safety/memory`  
Component: `apps/admin/src/views/TablePage.vue`  
Group: 安全与陪伴

## PURPOSE

以只读方式查看有限记忆（MemoryItem）：记忆 ID、所属用户、类型、到期时间与创建时间，并可在详情抽屉中展开用户、类型、内容与到期时间。本资源在 TablePage 中没有任何写操作按钮（`apps/admin/src/views/TablePage.vue:842-912` 的 action 分支不含 memory）。

## USER_JOB

管理员需要确认「有限记忆」这条隐私敏感能力真的受控：哪些用户保存了记忆、类型与范围是什么、到期时间是否临近、是否有已删除但未清空的行，以便审计这一功能是否按 90 天过期与用户授权运转。

## ENTRY

侧边栏「更多管理」折叠区中的「有限记忆」（`apps/admin/src/router.ts:79`；渲染在 `apps/admin/src/views/Layout.vue:130-151` 的 secondaryMenu，`/safety/memory` 不在 `Layout.vue:26-36` 的 primaryPaths 中）。也可直接访问 `/safety/memory`。路由守卫要求 localStorage 中存在 admin token（`apps/admin/src/router.ts:122-125`）。

## EXIT

点击侧边栏其它菜单项或直接改 URL。详情是页内抽屉，通过「×」或点击遮罩关闭（`TablePage.vue:947-951`、`:445-447`）。

## ROUTES

- `/safety/memory` → `TablePage.vue`，props `{ resource: 'memory', title: '有限记忆' }`，group「安全与陪伴」，`viaTablePage: true`（`artifacts/product-audit/admin-routes.json`；`apps/admin/src/router.ts:111-118`）。

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
| 搜索框（`data-testid="admin-search"`） | `v-model="search"`（`TablePage.vue:800-805`）→ `watch` 触发 `load`（`:784-787`） | 把 `q` 拼进查询串（`:407`）并重新请求。**`adminMemory` handler 只声明 `page/pageSize`（`apps/api/src/controllers.ts:2067-2071`），不读 `q`；搜索不生效。** |
| 操作内容输入框（`data-testid="admin-action-input"`） | `v-model="actionText"`（`TablePage.vue:809-812`） | 只写本地变量；memory 无 action 分支，无 handler 读取。无实际效果。 |
| 刷新（`data-testid="admin-audit-refresh"`） | `load`（`TablePage.vue:813`） | `loadCache()` + `GET /api/admin/v1/memory?page=1&pageSize=20` |
| 行点击 / Enter / Space | `selectRow`（`TablePage.vue:930-932`、`:439-443`） | 打开详情抽屉 |
| 详情关闭（`data-testid="admin-detail-close"`） | `closeDetail`（`TablePage.vue:951`、`:445-447`） | `detailOpen=false` |
| 遮罩点击 | `closeDetail`（`TablePage.vue:947`） | `detailOpen=false` |

未渲染：状态筛选（`filterOptions` 对 memory 返回空数组，`TablePage.vue:335-341`）、任何 action 按钮、分页控件。

## API_READS

- `GET /api/admin/v1/memory` — handler `adminMemory`（`apps/api/src/controllers.ts:2066-2078`），第 2072 行 `this.admin(auth)` 校验 token；返回 `this.list(this.store.memoryItems.filter(item => !item.deletedAt), page, pageSize)`（`controllers.ts:2073-2077`）。
- 端点注册于 `apps/admin/src/views/TablePage.vue:66`。
- **实测（`work/group-c-probe.mjs`）：无 `authorization` 头 → 401；带 `Bearer` token → 200。不属于 ISSUE-001 的无守卫端点。**
- 实测当前 `total=0`。

## API_WRITES

None found. 本页只发一个 GET（`TablePage.vue:43-67`），`resource-actions` 中无 memory 分支（`TablePage.vue:842-912`）。管理端不能删除或禁用用户的记忆；`DELETE /api/v1/memory/:id`（`controllers.ts:784`）与 `updateMemory`（`store.service.ts:4751`）都只由用户自己的会话调用。

## DB_ENTITIES

- **MemoryItem**（`prisma/schema.prisma:672-692`）：行数据来源，字段 `id/userId/journeyId/category/title/content/source/scope/status/consentedAt/expiresAt/deletedAt/createdAt/updatedAt`。索引 `@@index([userId, expiresAt])`、`@@index([userId, status, expiresAt])`（`:690-691`）。
- **User**（`prisma/schema.prisma:136`）：详情抽屉通过 `userName(row.userId)` 显示为「昵称 / 匿名代号」（`TablePage.vue:767`）。
- **AdminUser**（`prisma/schema.prisma:184-197`）：token 校验。
- 未写 AuditLog（本 GET 不调用 `store.audit`）。
- 写入方（非本页）：`saveMemory` 要求 `allowLongTermMemory`（`store.service.ts:4714`），`days` 被夹在 1..3650（`:4715`）；`deleteMemory` 走软删除写 `deletedAt`（`:4784-4792`）。
- 持久化路径：`StoreService.persist()`（`store.service.ts:1879-1893`）→ `relational-runtime.mapper.ts:220`（`tx.memoryItem.upsert`，`status` 与 `deletedAt` 都持久化）。

## ADMIN_VISIBILITY

菜单对所有已登录管理员可见，无角色过滤（`router.ts:79`、`Layout.vue:43`/`:130-151`）；后端只校验 token（`controllers.ts:1761-1763`）。`AdminRole.permissions`（`prisma/schema.prisma:203`）无读取点。记忆是最敏感的隐私对象之一，但管理端对它的可见性没有任何角色区分。

## AI_USAGE

本页不发起 AI 调用，但它展示的对象**正是喂给模型的上下文**：`queueAI` 在每次 AI 任务前调用 `activeMemoriesForTask`（`store.service.ts:5328`、`:4795-4808`），把最多 8 条活跃记忆拼进 prompt（`:5338`），并在 trace 里记录 `memory-context` 事件与 `memoryIds`（`:5330-5335`）。该函数的第一道门是 `privacySettings[userId]?.allowAiMemoryUse !== true` 直接返回空数组（`:4796`）。管理端看不到这条「哪些记忆被送进了模型」的 trace，只能看到记忆本身。

## PRIVACY

- 详情抽屉展示 `content`（记忆正文，`TablePage.vue:766-771`）。这是用户最私密的自述文本，管理端不脱敏。
- 列表展示 `category`（在「类型」列，`:327`）、`expiresAt`、`createdAt`（`:324-330`）。
- 过滤 `!item.deletedAt`（`controllers.ts:2074`）意味着软删除的记忆从管理端消失，但**行仍在库中**（`prisma/schema.prisma:686`），本页看不到这部分数据。
- 无隐私开关判断：`adminMemory` 不调用 `privacyAllows`；`allowLongTermMemory` 只在写入时检查（`store.service.ts:4714`），`allowAiMemoryUse` 只在喂给模型时检查（`:4796`）。

## ERROR_STATES

有可见错误状态：`load` 的 `catch` 写 `status = error.message ?? '加载失败'`（`TablePage.vue:432-434`），渲染在 `<p class="muted">`（`:797`，可见样式 `styles.scss:289-291`）。

弱点：无 `role="status"`/`aria-live`；失败时表格同时为空，与真正的空态难以区分。耦合失败：`load()` 先 `await loadCache()`（`TablePage.vue:418`），后者 `Promise.all` 拉 5 个无关端点（`:387-401`），任一失败即让本表显示为空 + 错误行。

## EMPTY_STATES

单一通用空态：`<tr v-if="!items.length">...暂无数据`（`TablePage.vue:939-941`）。实测当前 `total=0`，所以这是本资源的默认外观。没有针对有限记忆的文案，也不区分「无数据」与「加载失败」。

## NATIVE_RISKS

本页是 Web 管理后台，不运行在小程序原生端。间接风险：记忆驱动前台 `MemoryCenter`（`apps/mp/src/views/MemoryCenter.vue:63` 先读 `allowLongTermMemory`，`:80` 再 POST `/api/v1/memory`），而 `GET /api/v1/memory` 会为每条记忆附带「是否被 AI 使用」的标记（`controllers.ts:745-757` 比对 trace 的 `memoryIds`）。本页只读，看不到该标记。除上述外 **None found.**

## ISSUES

- P2 / DATA：列表「类型」列读 `row.category`（`TablePage.vue:327`），但列定义写的是 `{ key: 'kind', label: '类型', value: (row) => row.category }` —— `key` 与取值字段不一致；详情项标题也叫「类型」（`:768`）。功能上仍能显示 `category`，但列标识 `kind` 与数据字段 `category` 命名脱节，任何按 `key` 做的表格/导出逻辑都会错位。
- P2 / PRIVACY：管理端可明文读取记忆正文（`TablePage.vue:769`），而记忆是全产品最敏感的用户自述数据（`prisma/schema.prisma:680` 的 `content`）；本页没有任何角色限制（`controllers.ts:2072` 只校验 token），也没有访问审计——读记忆不写 AuditLog。
- P2 / DATA：`status`（`active/disabled/expired`）与 `scope`（`all_ai/journey/recovery/support`）两个关键控制字段（`prisma/schema.prisma:682-683`）在列表与详情中都不可见，管理员无法判断某条记忆是否已失效、是否真的允许被 AI 使用。
- P2 / FAKE_FUNCTION：搜索框渲染且可输入，但 `adminMemory` handler 不读 `q`（`controllers.ts:2067-2071`），搜索不生效。
- P2 / FUNCTIONAL：分页固定 `page=1&pageSize=20`（`TablePage.vue:78-79`、`:405-406`），模板无翻页控件（`TablePage.vue:914-945`），超过 20 条静默截断。
- P2 / FUNCTIONAL：`load()` 先拉 5 个无关端点（`TablePage.vue:418`、`:387-401`），任一失败即让本表变空 + 错误行。
- P2 / DATA：管理端看不到「这条记忆是否被送进过模型」。`queueAI` 会写 `memory-context` trace 与 `memoryIds`（`store.service.ts:5330-5335`），前台 `GET /api/v1/memory` 会把该标记返回给用户（`controllers.ts:745-757`），但本页完全不展示，审计无从进行。
- P3 / UX：`status` 行无 `role="status"`/`aria-live`（`TablePage.vue:797`）。
- P3 / UX：失败态与空态视觉上几乎一致。
- P3 / UX：空态是通用「暂无数据」（`TablePage.vue:940`）。
- P3 / TEST_CONTRACT：`navTestIds`（`Layout.vue:65-79`）不含 `/safety/memory`，导航链接 `data-testid` 为 `undefined`（`Layout.vue:121`、`:143`）。

## FINAL_STATUS

PARTIAL - 列表、详情与 token 守卫已逐行核对并实测（无 token 401 / 带 token 200），但记忆的 status/scope/是否被 AI 使用都不可见，且读取敏感正文不写审计。

### Static evidence

- Controls discovered in component: 80
- Endpoint mapping: `apps/admin/src/views/TablePage.vue:66` (`memory: /api/admin/v1/memory`)
- Route: `/safety/memory` → `TablePage.vue` (`artifacts/product-audit/admin-routes.json`)
- Handler: `adminMemory` (`apps/api/src/controllers.ts:2066-2078`), guarded at `:2072`
- Guard proof: no token → 401, `Bearer` token → 200 (`work/group-c-probe.mjs`)
- Live data shape: 0 rows (`total=0`)
- `activeMemoriesForTask` gate: `apps/api/src/store.service.ts:4795-4808`
- Seed: `memoryItems: []` (`apps/api/src/store.service.ts:1171`)

