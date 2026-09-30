# admin: support-plans (支持计划)

Route: `/safety/support-plans`  
Component: `apps/admin/src/views/TablePage.vue`  
Group: 安全与陪伴

## PURPOSE

以只读方式查看个人支持计划（PersonalSupportPlan）：计划 ID、所属用户、计划名称、状态与更新时间，并可在详情抽屉中展开用户、计划名称、计划内容与状态。本资源在 TablePage 中没有任何写操作按钮（`apps/admin/src/views/TablePage.vue:842-912` 的 action 分支不含 support-plans）。

## USER_JOB

管理员需要确认用户在安全时刻提前写下的「低谷预案」是否存在、最近是否更新过，以便在危机场景下判断这位用户是否已经有可读回的自助信息。

## ENTRY

侧边栏「更多管理」折叠区中的「支持计划」（`apps/admin/src/router.ts:78`；渲染在 `apps/admin/src/views/Layout.vue:130-151` 的 secondaryMenu，`/safety/support-plans` 不在 `Layout.vue:26-36` 的 primaryPaths 中）。也可直接访问 `/safety/support-plans`。路由守卫要求 localStorage 中存在 admin token（`apps/admin/src/router.ts:122-125`）。

## EXIT

点击侧边栏其它菜单项或直接改 URL。详情是页内抽屉，通过「×」或点击遮罩关闭（`TablePage.vue:947-951`、`:445-447`）。

## ROUTES

- `/safety/support-plans` → `TablePage.vue`，props `{ resource: 'support-plans', title: '支持计划' }`，group「安全与陪伴」，`viaTablePage: true`（`artifacts/product-audit/admin-routes.json`；`apps/admin/src/router.ts:111-118`）。

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
| 搜索框（`data-testid="admin-search"`） | `v-model="search"`（`TablePage.vue:800-805`）→ `watch` 触发 `load`（`:784-787`） | 把 `q` 拼进查询串（`:407`）并重新请求。**`supportPlans` handler 只声明 `page/pageSize`（`apps/api/src/controllers.ts:2057-2061`），不读 `q`；搜索不生效。** |
| 操作内容输入框（`data-testid="admin-action-input"`） | `v-model="actionText"`（`TablePage.vue:809-812`） | 只写本地变量；support-plans 无 action 分支，无 handler 读取。无实际效果。 |
| 刷新（`data-testid="admin-audit-refresh"`） | `load`（`TablePage.vue:813`） | `loadCache()` + `GET /api/admin/v1/support/plans?page=1&pageSize=20` |
| 行点击 / Enter / Space | `selectRow`（`TablePage.vue:930-932`、`:439-443`） | 打开详情抽屉 |
| 详情关闭（`data-testid="admin-detail-close"`） | `closeDetail`（`TablePage.vue:951`、`:445-447`） | `detailOpen=false` |
| 遮罩点击 | `closeDetail`（`TablePage.vue:947`） | `detailOpen=false` |

未渲染：状态筛选（`filterOptions` 对 support-plans 返回空数组，`TablePage.vue:335-341`）、任何 action 按钮、分页控件。

## API_READS

- `GET /api/admin/v1/support/plans` — handler `supportPlans`（`apps/api/src/controllers.ts:2056-2064`），第 2062 行 `this.admin(auth)` 校验 token；返回 `this.list(this.store.personalSupportPlans, page, pageSize)`（`controllers.ts:2063`）——**无任何过滤参数**。
- 端点注册于 `apps/admin/src/views/TablePage.vue:65`。
- **实测（`work/group-c-probe.mjs`）：无 `authorization` 头 → 401；带 `Bearer` token → 200。不属于 ISSUE-001 的无守卫端点。**
- 实测当前 `total=0`。

## API_WRITES

None found. 本页只发一个 GET（`TablePage.vue:43-67`），`resource-actions` 中无 support-plans 分支（`TablePage.vue:842-912`）。管理端不能查看/编辑用户的预案内容；写入只在前台发生（`PUT /api/v1/me/support-plan`，`controllers.ts:642` → `store.service.ts:4601-4633`）。

## DB_ENTITIES

- **PersonalSupportPlan**（`prisma/schema.prisma:646-659`）：行数据来源，字段 `id/userId/journeyId/title/plan/active/createdAt/updatedAt`。索引 `@@index([userId, active, updatedAt])`（`:658`）。
- **User**（`prisma/schema.prisma:136`）：详情抽屉通过 `userName(row.userId)` 显示为「昵称 / 匿名代号」（`TablePage.vue:761`）。
- **AdminUser**（`prisma/schema.prisma:184-197`）：token 校验。
- 未写 AuditLog（本 GET 不调用 `store.audit`）。
- 写入方（非本页）：`saveSupportPlan` 先 `privacyAllows(userId, 'allowRecoveryData', ...)`（`store.service.ts:4606`），再 upsert 唯一活跃计划（`:4610-4632`）。读取方 `supportPlan()`（`:4635-4638`）**不做隐私判断**。
- 持久化路径：`StoreService.persist()`（`store.service.ts:1879-1893`）→ `relational-runtime.mapper.ts:218`（`tx.personalSupportPlan.upsert`）。

## ADMIN_VISIBILITY

菜单对所有已登录管理员可见，无角色过滤（`router.ts:78`、`Layout.vue:43`/`:130-151`）；后端只校验 token（`controllers.ts:1761-1763`）。`AdminRole.permissions`（`prisma/schema.prisma:203`）无读取点。

## AI_USAGE

本页不发起 AI 调用。支持计划本身是用户手写内容（`SupportPlan.vue:136` 提交 `{ title: '我的低谷预案', plan: {...} }`），不含 AI 生成文本。相关联的 AI 环节是前台 `SafetySupport` 会把计划里的 `safePeople`/`places`/`smallActions` 读回给用户看，但那是纯读取（`SafetySupport.vue:26`），不经过模型。

## PRIVACY

- 详情抽屉展示 `plan` 字段（`TablePage.vue:760-765`，`{ label: '计划内容', value: text(row.plan) }`）。`plan` 是 `Json`（`prisma/schema.prisma:653`），`text()` 对它执行 `String(value)`（`TablePage.vue:99-103`），因此渲染结果是 `[object Object]` —— 管理端实际看不到计划内容，只看得到这个占位字符串。
- 列表展示 `title`（`:317-323`）。
- 无隐私开关判断：`supportPlans` 不调用 `privacyAllows`。写入侧要求 `allowRecoveryData`（`store.service.ts:4606`），但读取侧不要求——这与前台 `supportPlan()` 的不对称一致（`store.service.ts:4635-4638` 无隐私判断，与 `:4606` 的写侧要求形成落差）。

## ERROR_STATES

有可见错误状态：`load` 的 `catch` 写 `status = error.message ?? '加载失败'`（`TablePage.vue:432-434`），渲染在 `<p class="muted">`（`:797`，可见样式 `styles.scss:289-291`）。

弱点：无 `role="status"`/`aria-live`；失败时表格同时为空，与真正的空态难以区分。耦合失败：`load()` 先 `await loadCache()`（`TablePage.vue:418`），后者 `Promise.all` 拉 5 个无关端点（`:387-401`），任一失败即让本表显示为空 + 错误行。

## EMPTY_STATES

单一通用空态：`<tr v-if="!items.length">...暂无数据`（`TablePage.vue:939-941`）。实测当前 `total=0`，所以这是本资源的默认外观。没有针对支持计划的文案，也不区分「无数据」与「加载失败」。

## NATIVE_RISKS

本页是 Web 管理后台，不运行在小程序原生端。间接风险：支持计划是前台 `SafetySupport` 危机屏的内容来源（`apps/mp/src/views/SafetySupport.vue:26` 读 `GET /api/v1/me/support-plan`）。已知前台缺陷：该读取没有 `allowRecoveryData` 门禁，且无计划时「查看全部」入口随区块一起隐藏（见 `docs/product-audit/pages/mp/SafetySupport.md`）。本页只读，无法干预。除上述外 **None found.**

## ISSUES

- P2 / DATA：详情抽屉「计划内容」渲染 `text(row.plan)`（`TablePage.vue:763`），而 `plan` 是 JSON 对象（`prisma/schema.prisma:653`），`text()` 用 `String(value)`（`TablePage.vue:99-103`），所以真实显示为 `[object Object]`。管理端看不到计划内容——而这是本页唯一有价值的信息。
- P2 / DATA：列表「状态」列与详情「状态」项都读 `row.status`（`TablePage.vue:321`、`:764`），但 `PersonalSupportPlan` 没有 `status` 字段，只有 `active`（`prisma/schema.prisma:654`）。因此 `statusLabel(undefined)` 落到 `text(undefined)` 返回 `-`（`TablePage.vue:120-147`、`:99-103`），该列对每一行都显示 `-`。真实的 `active` 布尔值在管理端不可见。
- P2 / FAKE_FUNCTION：搜索框渲染且可输入，但 `supportPlans` handler 不读 `q`（`controllers.ts:2057-2061`），搜索不生效。
- P2 / FUNCTIONAL：分页固定 `page=1&pageSize=20`（`TablePage.vue:78-79`、`:405-406`），模板无翻页控件（`TablePage.vue:914-945`），超过 20 条静默截断。
- P2 / FUNCTIONAL：`load()` 先拉 5 个无关端点（`TablePage.vue:418`、`:387-401`），任一失败即让本表变空 + 错误行。
- P2 / PRIVACY：管理端读取不检查 `allowRecoveryData`，而写入侧要求它（`store.service.ts:4606` vs `controllers.ts:2063`）；用户关闭该开关后，已保存的预案仍留在管理端列表中。
- P3 / UX：`status` 行无 `role="status"`/`aria-live`（`TablePage.vue:797`）。
- P3 / UX：失败态与空态视觉上几乎一致。
- P3 / UX：空态是通用「暂无数据」（`TablePage.vue:940`）。
- P3 / TEST_CONTRACT：`navTestIds`（`Layout.vue:65-79`）不含 `/safety/support-plans`，导航链接 `data-testid` 为 `undefined`（`Layout.vue:121`、`:143`）。

## FINAL_STATUS

PARTIAL - 列表、详情与 token 守卫已逐行核对并实测（无 token 401 / 带 token 200），但计划内容显示为 `[object Object]`、状态列恒为 `-`，本页的核心信息实际不可读。

### Static evidence

- Controls discovered in component: 80
- Endpoint mapping: `apps/admin/src/views/TablePage.vue:65` (`support-plans: /api/admin/v1/support/plans`)
- Route: `/safety/support-plans` → `TablePage.vue` (`artifacts/product-audit/admin-routes.json`)
- Handler: `supportPlans` (`apps/api/src/controllers.ts:2056-2064`), guarded at `:2062`
- Guard proof: no token → 401, `Bearer` token → 200 (`work/group-c-probe.mjs`)
- Live data shape: 0 rows (`total=0`)
- `PersonalSupportPlan` has no `status` field: `prisma/schema.prisma:646-659`
- Seed: `personalSupportPlans: []` (`apps/api/src/store.service.ts:1169`)

