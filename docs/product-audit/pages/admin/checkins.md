# admin: checkins (结果回访)

Route: `/experience/checkins`  
Component: `apps/admin/src/views/TablePage.vue`  
Group: 体验网络

## PURPOSE

以只读方式查看结果回访（OutcomeCheckin）列表：回访 ID、关联行动 ID、回访结果、用户记录文本与回访时间，并可在详情抽屉中展开同样四项。本资源在 TablePage 中没有任何写操作按钮（`apps/admin/src/views/TablePage.vue:842-912` 的 action 分支不含 checkins）。

## USER_JOB

管理员需要看清用户对行动的实际反馈：哪些回访已经完成、哪些还是 `pending`、用户写下的「记录」说明了什么，从而判断行动闭环是否真的产生结果，而不是只有承诺没有回访。

## ENTRY

侧边栏「更多管理」折叠区中的「结果回访」（`apps/admin/src/router.ts:66`；渲染在 `apps/admin/src/views/Layout.vue:130-151` 的 secondaryMenu，`/experience/checkins` 不在 `Layout.vue:26-36` 的 primaryPaths 中）。也可直接访问 `/experience/checkins`。路由守卫要求 localStorage 中存在 admin token（`apps/admin/src/router.ts:122-125`）。

## EXIT

点击侧边栏其它菜单项或直接改 URL。详情是页内抽屉，通过「×」或点击遮罩关闭（`TablePage.vue:947-951`、`TablePage.vue:445-447`）。

## ROUTES

- `/experience/checkins` → `TablePage.vue`，props `{ resource: 'checkins', title: '结果回访' }`，group「体验网络」，`viaTablePage: true`（`artifacts/product-audit/admin-routes.json`；`apps/admin/src/router.ts:111-118`）。

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
| 搜索框（`data-testid="admin-search"`） | `v-model="search"`（`TablePage.vue:800-805`）→ `watch` 触发 `load`（`TablePage.vue:784-787`） | 把 `q` 拼进查询串（`TablePage.vue:407`）并重新请求。**`adminCheckins` 只声明 `status/page/pageSize`（`apps/api/src/controllers.ts:1951-1956`），不读 `q`；实测 `checkins?q=zzzznomatch` 与不带 q 都返回 2/2 条。** |
| 操作内容输入框（`data-testid="admin-action-input"`） | `v-model="actionText"`（`TablePage.vue:809-812`） | 只写本地变量；checkins 无 action 分支，无 handler 读取。无实际效果。 |
| 刷新（`data-testid="admin-audit-refresh"`） | `load`（`TablePage.vue:813`） | `loadCache()` + `GET /api/admin/v1/checkins?page=1&pageSize=20`（`TablePage.vue:415-429`） |
| 行点击 / Enter / Space | `selectRow`（`TablePage.vue:930-932`、`:439-443`） | 打开详情抽屉 |
| 详情关闭（`data-testid="admin-detail-close"`） | `closeDetail`（`TablePage.vue:951`、`:445-447`） | `detailOpen=false` |
| 遮罩点击 | `closeDetail`（`TablePage.vue:947`） | `detailOpen=false` |

未渲染：状态筛选（`filterOptions` 对 checkins 返回空数组，`TablePage.vue:335-341`）、任何 action 按钮、分页控件。

## API_READS

- `GET /api/admin/v1/checkins` — handler `adminCheckins`（`apps/api/src/controllers.ts:1950-1963`），第 1957 行 `this.admin(auth)` 校验 token；返回 `this.list(this.store.outcomeCheckins.filter(status 匹配), page, pageSize)`（`controllers.ts:1958-1962`）。
- 端点注册于 `apps/admin/src/views/TablePage.vue:58`。
- **实测（`work/group-c-probe.mjs`）：无 `authorization` 头 → 401；带 `Bearer` token → 200。不属于 ISSUE-001 的无守卫端点。**
- 后端支持 `status` 过滤（`controllers.ts:1953`、`:1959`），但前端不渲染筛选控件。

## API_WRITES

None found. 本页只发一个 GET（`TablePage.vue:43-67`），`resource-actions` 中无 checkins 分支（`TablePage.vue:842-912`）。

## DB_ENTITIES

- **OutcomeCheckin**（`prisma/schema.prisma:475-494`）：行数据来源，字段 `id/journeyId/commitmentId/userId/status/reflection/result/intensity/checkedAt/dueAt/barrier/createdAt`。
- **AdminUser**（`prisma/schema.prisma:184-197`）：token 校验。
- 未写 AuditLog（本 GET 不调用 `store.audit`）。
- 持久化路径：`StoreService.persist()`（`store.service.ts:1879-1893`）→ `relational-runtime.mapper.ts:48`（`db.outcomeCheckin.findMany`，按 `createdAt desc` 排序）。

## ADMIN_VISIBILITY

菜单对所有已登录管理员可见，无角色过滤（`router.ts:66`、`Layout.vue:43`/`:130-151`）；后端只校验 token（`controllers.ts:1761-1763`）。`AdminRole.permissions`（`prisma/schema.prisma:203`）无读取点。

## AI_USAGE

本页不发起 AI 调用。回访记录本身由前台 `checkinAction` 写入（`apps/api/src/store.service.ts:3373-3420`：写 `reflection/result/intensity/barrier`，状态改为 `completed`/`missed`），不含 AI 生成内容。相关联的 AI 环节是「行动」本身可能由 `action_plan` 生成（`store.service.ts:3300`），但回访文本是用户自述。

## PRIVACY

- 列表展示 `reflection`（用户自述记录，截断 42 字，`TablePage.vue:268-274`），详情展示完整 `reflection`（`TablePage.vue:709-714`）。这是用户私密文本，管理端不脱敏。
- `result`（结果摘要）与 `barrier`（障碍）字段在 API 响应中存在（`prisma/schema.prisma:485-489`），但列表与详情均不渲染。
- 无隐私开关判断：`adminCheckins` 不调用 `privacyAllows`。

## ERROR_STATES

有可见错误状态：`load` 的 `catch` 写 `status = error.message ?? '加载失败'`（`TablePage.vue:432-434`），渲染在 `<p class="muted">`（`TablePage.vue:797`，可见样式 `styles.scss:289-291`）。

弱点：无 `role="status"`/`aria-live`；失败时表格同时为空，与真正的空态难以区分。耦合失败：`load()` 先 `await loadCache()`（`TablePage.vue:418`），后者 `Promise.all` 拉 5 个无关端点（`:387-401`），任一失败即让本表显示为空 + 错误行。

## EMPTY_STATES

单一通用空态：`<tr v-if="!items.length">...暂无数据`（`TablePage.vue:939-941`）。没有针对结果回访的文案，也不区分「无数据」与「加载失败」。

## NATIVE_RISKS

本页是 Web 管理后台，不运行在小程序原生端。间接风险：前台 `ActionCenter` 的到期回访没有用户可见入口（ISSUE-009），管理端能看到的回访记录多于用户能完成的量，但本页只读，不产生原生端状态变化。除上述外 **None found.**

## ISSUES

- P2 / UX：`结果` 列用 `statusLabel(row.status)` 渲染（`TablePage.vue:271`），但 `statusLabel` 的映射表（`TablePage.vue:120-147`）不含 `pending`/`completed`/`missed`，因此三种真实状态在管理端显示为英文原值（实测样本 `"status":"pending"`）。同页其它资源的状态会被翻译，这里不会。
- P2 / FAKE_FUNCTION：搜索框渲染且可输入，但 `adminCheckins` 不读 `q`（`controllers.ts:1951-1956`），实测 `checkins?q=zzzznomatch` 仍返回 2/2 条。
- P2 / FUNCTIONAL：分页固定 `page=1&pageSize=20`（`TablePage.vue:78-79`、`:405-406`），模板无翻页控件（`TablePage.vue:914-945`），超过 20 条静默截断。
- P2 / FUNCTIONAL：`load()` 先拉 5 个无关端点（`TablePage.vue:418`、`:387-401`），任一失败即让本表变空 + 错误行。
- P3 / UX：`status` 行无 `role="status"`/`aria-live`（`TablePage.vue:797`）。
- P3 / UX：失败态与空态视觉上几乎一致。
- P3 / UX：空态是通用「暂无数据」（`TablePage.vue:940`）。
- P3 / UX：后端支持 `status` 过滤（`controllers.ts:1953`），但本页不渲染状态筛选（`TablePage.vue:335-341`）。
- P3 / TEST_CONTRACT：`navTestIds`（`Layout.vue:65-79`）不含 `/experience/checkins`，导航链接 `data-testid` 为 `undefined`（`Layout.vue:121`、`:143`）。
- P3 / DATA：`result` 与 `barrier` 两个字段（`prisma/schema.prisma:485-489`）在列表与详情中都没有渲染，管理端看不到用户填写的「结果摘要」和「障碍原因」。

## FINAL_STATUS

PARTIAL - 列表、详情与 token 守卫已逐行核对并实测（无 token 401 / 带 token 200），但状态值未本地化、搜索不生效、分页不可用。

### Static evidence

- Controls discovered in component: 80
- Endpoint mapping: `apps/admin/src/views/TablePage.vue:58` (`checkins: /api/admin/v1/checkins`)
- Route: `/experience/checkins` → `TablePage.vue` (`artifacts/product-audit/admin-routes.json`)
- Handler: `adminCheckins` (`apps/api/src/controllers.ts:1950-1963`), guarded at `:1957`
- Guard proof: no token → 401, `Bearer` token → 200 (`work/group-c-probe.mjs`)
- Live data shape: 2 rows, keys `id,journeyId,commitmentId,userId,status,dueAt,createdAt`
- `statusLabel` map lacks `pending/completed/missed`: `apps/admin/src/views/TablePage.vue:120-147`
- Seed: `outcomeCheckins: []` (`apps/api/src/store.service.ts:1160`)

