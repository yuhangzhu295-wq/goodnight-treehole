# admin: follow-ups (随访队列)

Route: `/experience/follow-ups`  
Component: `apps/admin/src/views/TablePage.vue`  
Group: 体验网络

## PURPOSE

以只读方式查看随访队列（FollowUpJob）：随访 ID、类型、所属用户、状态与计划时间，并可在详情抽屉中展开随访 ID、类型、用户、状态、计划时间与完成时间。本资源在 TablePage 中没有任何写操作按钮（`apps/admin/src/views/TablePage.vue:842-912` 的 action 分支不含 follow-ups）。

## USER_JOB

管理员需要确认「回访」这条业务线是否真的在跑：有多少随访还停在 `pending`、`dueAt` 是否已经过期却没送达、哪些已经 `delivered`，以便判断自动随访队列是否堵塞。

## ENTRY

侧边栏「更多管理」折叠区中的「随访队列」（`apps/admin/src/router.ts:69`；渲染在 `apps/admin/src/views/Layout.vue:130-151` 的 secondaryMenu，`/experience/follow-ups` 不在 `Layout.vue:26-36` 的 primaryPaths 中）。也可直接访问 `/experience/follow-ups`。路由守卫要求 localStorage 中存在 admin token（`apps/admin/src/router.ts:122-125`）。

## EXIT

点击侧边栏其它菜单项或直接改 URL。详情是页内抽屉，通过「×」或点击遮罩关闭（`TablePage.vue:947-951`、`:445-447`）。

## ROUTES

- `/experience/follow-ups` → `TablePage.vue`，props `{ resource: 'follow-ups', title: '随访队列' }`，group「体验网络」，`viaTablePage: true`（`artifacts/product-audit/admin-routes.json`；`apps/admin/src/router.ts:111-118`）。

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
| 搜索框（`data-testid="admin-search"`） | `v-model="search"`（`TablePage.vue:800-805`）→ `watch` 触发 `load`（`:784-787`） | 把 `q` 拼进查询串（`:407`）并重新请求。**`adminFollowUps` 只声明 `status/page/pageSize`（`apps/api/src/controllers.ts:2006-2011`），不读 `q`；实测 `follow-ups?q=zzzznomatch` 与不带 q 都返回 5/5 条。** |
| 操作内容输入框（`data-testid="admin-action-input"`） | `v-model="actionText"`（`TablePage.vue:809-812`） | 只写本地变量；follow-ups 无 action 分支，无 handler 读取。无实际效果。 |
| 刷新（`data-testid="admin-audit-refresh"`） | `load`（`TablePage.vue:813`） | `loadCache()` + `GET /api/admin/v1/follow-ups?page=1&pageSize=20` |
| 行点击 / Enter / Space | `selectRow`（`TablePage.vue:930-932`、`:439-443`） | 打开详情抽屉 |
| 详情关闭（`data-testid="admin-detail-close"`） | `closeDetail`（`TablePage.vue:951`、`:445-447`） | `detailOpen=false` |
| 遮罩点击 | `closeDetail`（`TablePage.vue:947`） | `detailOpen=false` |

未渲染：状态筛选（`filterOptions` 对 follow-ups 返回空数组，`TablePage.vue:335-341`）、任何 action 按钮、分页控件。

## API_READS

- `GET /api/admin/v1/follow-ups` — handler `adminFollowUps`（`apps/api/src/controllers.ts:2005-2015`），第 2012 行 `this.admin(auth)` 校验 token；返回 `this.list(this.store.followUpJobs.filter(status 匹配), page, pageSize)`（`controllers.ts:2013-2014`）。
- 端点注册于 `apps/admin/src/views/TablePage.vue:61`。
- **实测（`work/group-c-probe.mjs`）：无 `authorization` 头 → 401；带 `Bearer` token → 200。不属于 ISSUE-001 的无守卫端点。**
- 后端支持 `status` 过滤（`controllers.ts:2008`、`:2013`），但前端不渲染筛选控件。

## API_WRITES

None found. 本页只发一个 GET（`TablePage.vue:43-67`），`resource-actions` 中无 follow-ups 分支（`TablePage.vue:842-912`）。管理端没有重排/取消随访的入口。

## DB_ENTITIES

- **FollowUpJob**（`prisma/schema.prisma:736-750`）：行数据来源，字段 `id/userId/journeyId/kind/dueAt/status/payload/completedAt/createdAt`。
- **User**（`prisma/schema.prisma:136`）：详情抽屉通过 `userName(row.userId)` 把它显示为「昵称 / 匿名代号」（`TablePage.vue:733`）。
- **AdminUser**（`prisma/schema.prisma:184-197`）：token 校验。
- 未写 AuditLog（本 GET 不调用 `store.audit`）。
- 持久化路径：`StoreService.persist()`（`store.service.ts:1879-1893`）→ `relational-runtime.mapper.ts:224`（`tx.followUpJob.upsert`）。另有一条**独立的直连写路径**：`FollowUpWorkerService` 用 `prisma.followUpJob.update` 直接把状态改成 `delivered` 并写 `completedAt`（`apps/api/src/follow-up-worker.service.ts:51`），然后 `store.reloadRuntimeState()`（`:63`）。

## ADMIN_VISIBILITY

菜单对所有已登录管理员可见，无角色过滤（`router.ts:69`、`Layout.vue:43`/`:130-151`）；后端只校验 token（`controllers.ts:1761-1763`）。`AdminRole.permissions`（`prisma/schema.prisma:203`）无读取点。

## AI_USAGE

本页不发起 AI 调用。随访任务由业务路径创建：`createActionCommitment` 会为每个新行动建一条 `kind='action_checkin'` 的随访（`apps/api/src/store.service.ts:3344-3353`），`kind` 还可能是 `FUTURE_SELF`（`:4582`）或 `DECISION_COOLDOWN`（`:4452`）。投递文案由 `notificationCopy` 静态生成（`follow-up-worker.service.ts:67-74`），不调用模型。

## PRIVACY

- 列表展示 `kind`（`TablePage.vue:289-295`），详情展示 `userId` 经 `userName()` 转成的「昵称 / 匿名代号」（`:733`），不暴露内部 id。
- `payload` 字段（`prisma/schema.prisma:745`）在响应中存在，实测包含 `{"actionId":"action_826fbc0efe","title":"先完成一个五分钟的小动作"}` —— 即用户的行动标题会随随访记录一并返回给管理端，但列表与详情都不渲染它。
- 无隐私开关判断：`adminFollowUps` 不调用 `privacyAllows`。相关开关只在前台写路径生效：`FUTURE_SELF` 类型的投递检查 `allowFutureSelfNotifications`（`follow-up-worker.service.ts:32`）。

## ERROR_STATES

有可见错误状态：`load` 的 `catch` 写 `status = error.message ?? '加载失败'`（`TablePage.vue:432-434`），渲染在 `<p class="muted">`（`:797`，可见样式 `styles.scss:289-291`）。

弱点：无 `role="status"`/`aria-live`；失败时表格同时为空，与真正的空态难以区分。耦合失败：`load()` 先 `await loadCache()`（`TablePage.vue:418`），后者 `Promise.all` 拉 5 个无关端点（`:387-401`），任一失败即让本表显示为空 + 错误行。

## EMPTY_STATES

单一通用空态：`<tr v-if="!items.length">...暂无数据`（`TablePage.vue:939-941`）。没有针对随访队列的文案，也不区分「无数据」与「加载失败」。

## NATIVE_RISKS

本页是 Web 管理后台，不运行在小程序原生端。间接风险：随访投递产生的 `UserNotification` 会在小程序「提醒」页出现（`apps/mp/src/views/NotificationCenter.vue:24`），其 `targetRoute` 多为 `/pages/action/index?section=follow-up`（`follow-up-worker.service.ts:73`），而该 query 不被任何 mp 视图读取（ISSUE-009 / ISSUE-010）——本页能看到随访已送达，用户却落不到正确的状态。本页只读。除上述外 **None found.**

## ISSUES

- P2 / STATE_MACHINE：列表「状态」列直接渲染原始字符串 `row.status`（`TablePage.vue:293`），不走 `statusLabel`；`statusLabel` 的映射表（`:120-147`）也不含 `pending`/`delivered`/`scheduled`，所以三种真实状态在管理端显示为英文原值（实测样本 `"status":"pending"`）。同一组件的 `support-plans`/`journeys` 等分支都会翻译。
- P2 / FAKE_FUNCTION：搜索框渲染且可输入，但 `adminFollowUps` 不读 `q`（`controllers.ts:2006-2011`），实测 `follow-ups?q=zzzznomatch` 仍返回 5/5 条。
- P2 / FUNCTIONAL：分页固定 `page=1&pageSize=20`（`TablePage.vue:78-79`、`:405-406`），模板无翻页控件（`TablePage.vue:914-945`），超过 20 条静默截断。
- P2 / FUNCTIONAL：`load()` 先拉 5 个无关端点（`TablePage.vue:418`、`:387-401`），任一失败即让本表变空 + 错误行。
- P2 / DATA：管理端看不到「是否逾期」。`dueAt` 有列，但没有与当前时间的比较、排序或筛选；判断队列是否堵塞要靠人工逐行读时间（`TablePage.vue:289-295`）。
- P3 / UX：`status` 行无 `role="status"`/`aria-live`（`TablePage.vue:797`）。
- P3 / UX：失败态与空态视觉上几乎一致。
- P3 / UX：空态是通用「暂无数据」（`TablePage.vue:940`）。
- P3 / UX：后端支持 `status` 过滤（`controllers.ts:2008`），但本页不渲染状态筛选（`TablePage.vue:335-341`）。
- P3 / TEST_CONTRACT：`navTestIds`（`Layout.vue:65-79`）不含 `/experience/follow-ups`，导航链接 `data-testid` 为 `undefined`（`Layout.vue:121`、`:143`）。
- P3 / DATA：`payload` 里的行动标题（实测 `{"actionId":"action_826fbc0efe","title":"先完成一个五分钟的小动作"}`）在管理端不可见，无法从随访行判断它到底在跟进哪件事。

## FINAL_STATUS

PARTIAL - 列表、详情与 token 守卫已逐行核对并实测（无 token 401 / 带 token 200），但状态值未本地化、逾期不可见、搜索不生效、分页不可用。

### Static evidence

- Controls discovered in component: 80
- Endpoint mapping: `apps/admin/src/views/TablePage.vue:61` (`follow-ups: /api/admin/v1/follow-ups`)
- Route: `/experience/follow-ups` → `TablePage.vue` (`artifacts/product-audit/admin-routes.json`)
- Handler: `adminFollowUps` (`apps/api/src/controllers.ts:2005-2015`), guarded at `:2012`
- Guard proof: no token → 401, `Bearer` token → 200 (`work/group-c-probe.mjs`)
- Live data shape: 5 rows, keys `id,userId,journeyId,kind,dueAt,status,payload,createdAt`
- `statusLabel` map lacks `pending/delivered/scheduled`: `apps/admin/src/views/TablePage.vue:120-147`
- Seed: `followUpJobs: []` (`apps/api/src/store.service.ts:1175`)

