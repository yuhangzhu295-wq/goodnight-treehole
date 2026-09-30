# admin: notifications (用户提醒)

Route: `/experience/notifications`  
Component: `apps/admin/src/views/TablePage.vue`  
Group: 体验网络

## PURPOSE

以只读方式查看发给用户的提醒（UserNotification）：提醒 ID、类型、标题、状态与创建时间，并可在详情抽屉中展开提醒 ID、用户、类型、标题、正文与状态。本资源在 TablePage 中没有任何写操作按钮（`apps/admin/src/views/TablePage.vue:842-912` 的 action 分支不含 notifications）。

## USER_JOB

管理员需要确认自动提醒真的送到了用户：有多少 `unread`、多少 `read`、类型分布（`FOLLOW_UP` / `FUTURE_SELF` / `COOLDOWN_RELEASED`）、以及正文是否符合预期，以便判断随访与未来信件的投递链路是否正常。

## ENTRY

侧边栏「更多管理」折叠区中的「用户提醒」（`apps/admin/src/router.ts:71`；渲染在 `apps/admin/src/views/Layout.vue:130-151` 的 secondaryMenu，`/experience/notifications` 不在 `Layout.vue:26-36` 的 primaryPaths 中）。也可直接访问 `/experience/notifications`。路由守卫要求 localStorage 中存在 admin token（`apps/admin/src/router.ts:122-125`）。

## EXIT

点击侧边栏其它菜单项或直接改 URL。详情是页内抽屉，通过「×」或点击遮罩关闭（`TablePage.vue:947-951`、`:445-447`）。

## ROUTES

- `/experience/notifications` → `TablePage.vue`，props `{ resource: 'notifications', title: '用户提醒' }`，group「体验网络」，`viaTablePage: true`（`artifacts/product-audit/admin-routes.json`；`apps/admin/src/router.ts:111-118`）。

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
| 搜索框（`data-testid="admin-search"`） | `v-model="search"`（`TablePage.vue:800-805`）→ `watch` 触发 `load`（`:784-787`） | 把 `q` 拼进查询串（`:407`）并重新请求。**`adminNotifications` 只声明 `status/page/pageSize`（`apps/api/src/controllers.ts:2018-2023`），不读 `q`；实测 `notifications?q=zzzznomatch` 与不带 q 都返回 4/4 条。** |
| 操作内容输入框（`data-testid="admin-action-input"`） | `v-model="actionText"`（`TablePage.vue:809-812`） | 只写本地变量；notifications 无 action 分支，无 handler 读取。无实际效果。 |
| 刷新（`data-testid="admin-audit-refresh"`） | `load`（`TablePage.vue:813`） | `loadCache()` + `GET /api/admin/v1/notifications?page=1&pageSize=20` |
| 行点击 / Enter / Space | `selectRow`（`TablePage.vue:930-932`、`:439-443`） | 打开详情抽屉 |
| 详情关闭（`data-testid="admin-detail-close"`） | `closeDetail`（`TablePage.vue:951`、`:445-447`） | `detailOpen=false` |
| 遮罩点击 | `closeDetail`（`TablePage.vue:947`） | `detailOpen=false` |

未渲染：状态筛选（`filterOptions` 对 notifications 返回空数组，`TablePage.vue:335-341`）、任何 action 按钮、分页控件。

## API_READS

- `GET /api/admin/v1/notifications` — handler `adminNotifications`（`apps/api/src/controllers.ts:2017-2027`），第 2024 行 `this.admin(auth)` 校验 token；返回 `this.list(this.store.notifications.filter(status 匹配), page, pageSize)`（`controllers.ts:2025-2026`）。
- 端点注册于 `apps/admin/src/views/TablePage.vue:63`。
- **实测（`work/group-c-probe.mjs`）：无 `authorization` 头 → 401；带 `Bearer` token → 200。不属于 ISSUE-001 的无守卫端点。**
- 后端支持 `status` 过滤（`controllers.ts:2020`、`:2025`），但前端不渲染筛选控件；实测 `notifications?status=unread` 返回 0/0（当前 4 条都已读）。

## API_WRITES

None found. 本页只发一个 GET（`TablePage.vue:43-67`），`resource-actions` 中无 notifications 分支（`TablePage.vue:842-912`）。管理端不能标记已读、不能重发、不能删除提醒；`PATCH /api/v1/notifications/:id/read`（`controllers.ts:682`）只由小程序端调用。

## DB_ENTITIES

- **UserNotification**（`prisma/schema.prisma:752-765`）：行数据来源，字段 `id/userId/type/title/body/targetRoute/status/createdAt/readAt`。
- **User**（`prisma/schema.prisma:136`）：详情抽屉通过 `userName(row.userId)` 显示为「昵称 / 匿名代号」（`TablePage.vue:747`）。
- **AdminUser**（`prisma/schema.prisma:184-197`）：token 校验。
- 未写 AuditLog（本 GET 不调用 `store.audit`）。
- 持久化路径：`StoreService.persist()`（`store.service.ts:1879-1893`）→ `relational-runtime.mapper.ts:225`（`tx.userNotification.upsert`，按 `userIds.has(item.userId)` 过滤）。另有**独立直连写路径**：`FollowUpWorkerService` 用 `prisma.userNotification.create` 直接插入提醒（`apps/api/src/follow-up-worker.service.ts:38-48`），id 形如 `notification_<followUpJobId>`，然后 `store.reloadRuntimeState()`（`:63`）。

## ADMIN_VISIBILITY

菜单对所有已登录管理员可见，无角色过滤（`router.ts:71`、`Layout.vue:43`/`:130-151`）；后端只校验 token（`controllers.ts:1761-1763`）。`AdminRole.permissions`（`prisma/schema.prisma:203`）无读取点。

## AI_USAGE

本页不发起 AI 调用。提醒文案由 `notificationCopy` 静态生成（`apps/api/src/follow-up-worker.service.ts:67-74`）：`FUTURE_SELF` → 「清醒时候的你，留了一句话」；`DECISION_COOLDOWN` → 「现在还想这样做吗？」；其它 → 「昨天那件事，后来怎么样了？」。没有任何模型调用参与生成，因此不受 DAPI 余额影响。

## PRIVACY

- 详情抽屉展示 `body`（提醒正文，`TablePage.vue:745-752`）与用户（`:747`）。正文本身是产品文案，不含用户原文；但 `targetRoute` 含用户对象 id（例如实测样本 `/pages/action/index?section=follow-up`，冷却类会带 `?id=<decisionId>`，`follow-up-worker.service.ts:71`），该字段在响应中但管理端不渲染。
- 列表展示 `type`/`title`/`status`/`createdAt`（`TablePage.vue:303-309`）。
- 无隐私开关判断：`adminNotifications` 不调用 `privacyAllows`。写入侧唯一相关开关是 `allowFutureSelfNotifications`（`follow-up-worker.service.ts:32`），只影响是否创建 `FUTURE_SELF` 提醒。

## ERROR_STATES

有可见错误状态：`load` 的 `catch` 写 `status = error.message ?? '加载失败'`（`TablePage.vue:432-434`），渲染在 `<p class="muted">`（`:797`，可见样式 `styles.scss:289-291`）。

弱点：无 `role="status"`/`aria-live`；失败时表格同时为空，与真正的空态难以区分。耦合失败：`load()` 先 `await loadCache()`（`TablePage.vue:418`），后者 `Promise.all` 拉 5 个无关端点（`:387-401`），任一失败即让本表显示为空 + 错误行。

## EMPTY_STATES

单一通用空态：`<tr v-if="!items.length">...暂无数据`（`TablePage.vue:939-941`）。没有针对提醒的文案，也不区分「无数据」与「加载失败」。

## NATIVE_RISKS

本页是 Web 管理后台，不运行在小程序原生端。间接风险：这些提醒就是小程序「提醒」页的数据源（`apps/mp/src/views/NotificationCenter.vue:24` 读 `GET /api/v1/notifications`）。已知前台缺陷 ISSUE-010：`targetRoute` 的 query（`?section=`、`?view=`、`?journeyId=`）不被目标视图读取，且标记已读与跳转共用同一个 `try`（`NotificationCenter.vue:27`），读回执失败会阻断跳转。本页只能看到提醒存在，看不到用户是否真的落到了正确页面。除上述外 **None found.**

## ISSUES

- P2 / FUNCTIONAL：列表「状态」列直接渲染原始字符串 `row.status`（`TablePage.vue:307`），详情同样（`:751`），不走 `statusLabel`；`statusLabel` 映射表（`:120-147`）也不含 `unread`/`read`，所以状态显示为英文原值（实测样本 `"status":"read"`）。同组件的 `journeys`/`support-plans` 分支都会翻译。
- P2 / FAKE_FUNCTION：搜索框渲染且可输入，但 `adminNotifications` 不读 `q`（`controllers.ts:2018-2023`），实测 `notifications?q=zzzznomatch` 仍返回 4/4 条。
- P2 / FUNCTIONAL：分页固定 `page=1&pageSize=20`（`TablePage.vue:78-79`、`:405-406`），模板无翻页控件（`TablePage.vue:914-945`），超过 20 条静默截断。
- P2 / FUNCTIONAL：`load()` 先拉 5 个无关端点（`TablePage.vue:418`、`:387-401`），任一失败即让本表变空 + 错误行。
- P3 / DATA：管理端看不到 `targetRoute`，因此无法从本页验证 ISSUE-010 描述的「提醒点开后落不到正确状态」——该字段在响应中但不在任何列或详情项里（`TablePage.vue:303-309`、`:745-752`）。
- P3 / UX：`status` 行无 `role="status"`/`aria-live`（`TablePage.vue:797`）。
- P3 / UX：失败态与空态视觉上几乎一致。
- P3 / UX：空态是通用「暂无数据」（`TablePage.vue:940`）。
- P3 / UX：后端支持 `status` 过滤（`controllers.ts:2020`），但本页不渲染状态筛选（`TablePage.vue:335-341`），无法只看未读。
- P3 / TEST_CONTRACT：`navTestIds`（`Layout.vue:65-79`）不含 `/experience/notifications`，导航链接 `data-testid` 为 `undefined`（`Layout.vue:121`、`:143`）。

## FINAL_STATUS

PARTIAL - 列表、详情与 token 守卫已逐行核对并实测（无 token 401 / 带 token 200），但状态值未本地化、targetRoute 不可见、搜索不生效、分页不可用。

### Static evidence

- Controls discovered in component: 80
- Endpoint mapping: `apps/admin/src/views/TablePage.vue:63` (`notifications: /api/admin/v1/notifications`)
- Route: `/experience/notifications` → `TablePage.vue` (`artifacts/product-audit/admin-routes.json`)
- Handler: `adminNotifications` (`apps/api/src/controllers.ts:2017-2027`), guarded at `:2024`
- Guard proof: no token → 401, `Bearer` token → 200 (`work/group-c-probe.mjs`)
- Live data shape: 4 rows, keys `id,userId,type,title,body,targetRoute,status,createdAt,readAt`
- `statusLabel` map lacks `unread/read`: `apps/admin/src/views/TablePage.vue:120-147`
- Seed: `notifications: []` (`apps/api/src/store.service.ts:1176`)

