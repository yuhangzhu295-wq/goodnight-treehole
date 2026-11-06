# admin: actions (行动承诺)

Route: `/experience/actions`  
Component: `apps/admin/src/views/TablePage.vue`  
Group: 体验网络

## PURPOSE

以只读方式查看全部用户的行动承诺（ActionCommitment）列表：行动 ID、行动内容、所属旅程 ID、状态与截止时间，并可在详情抽屉中展开同样的四个字段。本资源在 TablePage 中没有任何写操作按钮（`apps/admin/src/views/TablePage.vue:842-912` 的 action 分支不含 actions）。

## USER_JOB

管理员需要核对用户从现实旅程里承诺的小行动有哪些、有多少还停在 `active`、截止时间是否已经过去，以便判断行动闭环是否真的在推进，而不是只在数据库里积压。

## ENTRY

侧边栏「更多管理」折叠区中的「行动承诺」（`apps/admin/src/router.ts:65`；渲染在 `apps/admin/src/views/Layout.vue:130-151` 的 secondaryMenu，因为 `/experience/actions` 不在 `Layout.vue:26-36` 的 primaryPaths 中）。也可直接访问 `/experience/actions`。路由守卫要求 localStorage 中存在 admin token（`apps/admin/src/router.ts:122-125`）。

## EXIT

点击侧边栏其它菜单项或直接改 URL。详情是页内抽屉，通过抽屉头部「×」或点击遮罩关闭（`TablePage.vue:947-951`、`TablePage.vue:445-447`）。

## ROUTES

- `/experience/actions` → `TablePage.vue`，props `{ resource: 'actions', title: '行动承诺' }`，group「体验网络」，`viaTablePage: true`（`artifacts/product-audit/admin-routes.json`；路由由 `apps/admin/src/router.ts:111-118` 从 menu 生成）。

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
| 搜索框（`data-testid="admin-search"`） | `v-model="search"`（`TablePage.vue:800-805`）→ `watch` 触发 `load`（`TablePage.vue:784-787`） | 把 `q` 拼进查询串（`TablePage.vue:407`）并重新请求。**`adminActions` 只声明 `status/page/pageSize`（`apps/api/src/controllers.ts:1936-1941`），不读 `q`；实测 `actions?q=zzzznomatch` 与不带 q 都返回 2/2 条，搜索不生效。** |
| 操作内容输入框（`data-testid="admin-action-input"`） | `v-model="actionText"`（`TablePage.vue:809-812`） | 只写本地变量；actions 无 action 分支，没有 handler 读取（`TablePage.vue:85-97` 回退到默认文案）。无实际效果。 |
| 刷新（`data-testid="admin-audit-refresh"`） | `load`（`TablePage.vue:813`） | `loadCache()` + `GET /api/admin/v1/actions?page=1&pageSize=20`（`TablePage.vue:415-429`） |
| 行点击 / Enter / Space | `selectRow`（`TablePage.vue:930-932`、`:439-443`） | 打开详情抽屉，`status` 设为「已选择 <id>」 |
| 详情关闭（`data-testid="admin-detail-close"`） | `closeDetail`（`TablePage.vue:951`、`:445-447`） | `detailOpen=false` |
| 遮罩点击 | `closeDetail`（`TablePage.vue:947`） | `detailOpen=false` |

未渲染：状态筛选（`filterOptions` 对 actions 返回空数组，`TablePage.vue:335-341`）、任何 action 按钮、分页控件（模板中不存在，`TablePage.vue:914-945`）。

## API_READS

- `GET /api/admin/v1/actions` — handler `adminActions`（`apps/api/src/controllers.ts:1935-1948`），第 1942 行 `this.admin(auth)` 校验 token；返回 `this.list(this.store.actionCommitments.filter(status 匹配), page, pageSize)`（`controllers.ts:1943-1947`）。
- 端点注册于 `apps/admin/src/views/TablePage.vue:57`（`actions: '/api/admin/v1/actions'`）。
- **实测（`work/group-c-probe.mjs`）：无 `authorization` 头 → 401；带 `Bearer` token → 200。不属于 ISSUE-001 的无守卫端点。**
- 后端支持 `status` 过滤（`controllers.ts:1938`、`:1944`），但前端不渲染筛选控件。

## API_WRITES

None found. 本页只发一个 GET（`TablePage.vue:43-67` 只给 actions 一个端点），`resource-actions` 中无 actions 分支（`TablePage.vue:842-912`）。

## DB_ENTITIES

- **ActionCommitment**（`prisma/schema.prisma:452-473`）：行数据来源，字段 `id/journeyId/userId/title/status/dueAt/attemptNumber/createdAt/updatedAt`。
- **AdminUser**（`prisma/schema.prisma:184-197`）：`verifyToken` 用它确认 token 对应管理员（`apps/api/src/store.service.ts:2190-2197`）。
- 未写 AuditLog（本 GET 不调用 `store.audit`）。
- 持久化路径：`StoreService.persist()`（`store.service.ts:1879-1893`）→ `relational-runtime.mapper.ts:47`（`db.actionCommitment.findMany`，按 `updatedAt desc` 排序）。

## ADMIN_VISIBILITY

菜单对所有已登录管理员可见，无角色过滤（`router.ts:65`、`Layout.vue:43`/`:130-151`）；后端只校验 token（`controllers.ts:1761-1763`、`store.service.ts:2190-2197`）。`AdminRole.permissions`（`prisma/schema.prisma:203`）无任何读取点，因此不产生角色差异。

## AI_USAGE

本页不发起 AI 调用，但展示的数据多半是 AI 产物：`ActionCommitment` 由 `createActionCommitment`（`apps/api/src/store.service.ts:3300-3370`）创建，其标题来自 `action_plan` 任务的结构化结果；`POST /api/v1/actions/:id/adaptive-plan` 也会用 AI 生成更小的替代动作（`controllers.ts:545`）。DAPI 余额不足时这些 job 以 `status='fallback'` 结束（ISSUE-007），本页不标注哪条行动来自兜底模板。

## PRIVACY

- 列表展示 `title`（用户自己的行动承诺原文，`TablePage.vue:261-267`），详情再展示一次（`TablePage.vue:703-708`）。这是用户私密内容，但管理端不做脱敏。
- API 响应含 `userId`（实测样本含 `"userId":"user_demo"`），列表不展示，详情抽屉也不展示 userId。
- 无隐私开关判断：`adminActions` 不调用 `privacyAllows`；`allowRecoveryData` 只在前台写路径生效（`store.service.ts:4606`）。

## ERROR_STATES

有可见错误状态：`load` 的 `catch` 把 `status` 设为 `error.message ?? '加载失败'`（`TablePage.vue:432-434`），渲染在 `<p class="muted">{{ status }}</p>`（`TablePage.vue:797`，`.muted` 为可见样式 `apps/admin/src/styles.scss:289-291`）。

弱点与 journeys 相同：没有 `role="status"`/`aria-live`（对比 `UsersPage.vue:133`），失败时表格同时为空，与真正的空态在视觉上难以区分。另有耦合失败：`load()` 先 `await loadCache()`（`TablePage.vue:418`），后者用 `Promise.all` 拉 users/posts/replies/feedback-categories/ai/providers 五个无关端点（`TablePage.vue:387-401`），任一失败即让本表显示为空 + 错误行。

## EMPTY_STATES

单一通用空态：`<tr v-if="!items.length"><td :colspan="columns.length" class="empty-cell">暂无数据</td></tr>`（`TablePage.vue:939-941`）。没有针对行动承诺的文案，也不区分「无数据」与「加载失败」。

## NATIVE_RISKS

本页是 Web 管理后台，不运行在小程序原生端。间接风险：行动承诺是前台 ActionCenter 的核心对象，本页只读，不会造成原生端状态变化。除上述外 **None found.**

## ISSUES

- P2 / FAKE_FUNCTION：搜索框渲染且可输入，但 `adminActions` 不读 `q`（`controllers.ts:1936-1941`），实测 `actions?q=zzzznomatch` 仍返回 2/2 条。控件宣称能搜索，实际不改变结果（`TablePage.vue:800-805`、`:407`）。
- P2 / FUNCTIONAL：分页固定 `page=1&pageSize=20`（`TablePage.vue:78-79`、`:405-406`），但模板没有翻页控件（`TablePage.vue:914-945`），超过 20 条时静默截断。
- P2 / FUNCTIONAL：`load()` 先拉 5 个无关端点（`TablePage.vue:418`、`:387-401`），任一失败即让本表变空 + 错误行，属跨资源故障耦合。
- P3 / UX：`status` 行无 `role="status"`/`aria-live`（`TablePage.vue:797`）。
- P3 / UX：失败态与空态视觉上几乎一致（空表 + 一行小字）。
- P3 / UX：空态是通用「暂无数据」（`TablePage.vue:940`），无针对行动承诺的说明。
- P3 / UX：后端支持 `status` 过滤（`controllers.ts:1938`、`:1944`），但本页不渲染状态筛选（`TablePage.vue:335-341`），该能力在管理端不可达。
- P3 / TEST_CONTRACT：`navTestIds`（`apps/admin/src/views/Layout.vue:65-79`）不含 `/experience/actions`，该导航链接的 `data-testid` 为 `undefined`（`Layout.vue:121`、`:143`）。
- P3 / ORPHAN：`actionInput` 的「操作内容」输入框对本资源渲染但无 handler 读取（`TablePage.vue:809-812`），属无害死控件，同类于 ISSUE-014。

## FINAL_STATUS

PARTIAL - 列表、详情与 token 守卫已逐行核对并实测（无 token 401 / 带 token 200），但搜索不生效、分页不可用、错误态偏弱且与空态难区分。

### Static evidence

- Controls discovered in component: 80
- Endpoint mapping: `apps/admin/src/views/TablePage.vue:57` (`actions: /api/admin/v1/actions`)
- Route: `/experience/actions` → `TablePage.vue` (`artifacts/product-audit/admin-routes.json`)
- Handler: `adminActions` (`apps/api/src/controllers.ts:1935-1948`), guarded at `:1942`
- Guard proof: no token → 401, `Bearer` token → 200 (`work/group-c-probe.mjs`)
- Live data shape: 2 rows, keys `id,journeyId,userId,title,description,status,dueAt,attemptNumber,createdAt,updatedAt`
- Seed: `actionCommitments: []` (`apps/api/src/store.service.ts:1159`)

