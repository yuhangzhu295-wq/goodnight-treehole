# admin: peer-matches (匹配记录)

Route: `/experience/matches`  
Component: `apps/admin/src/views/TablePage.vue`  
Group: 体验网络

## PURPOSE

以只读方式查看同路人匹配记录（PeerMatch）：匹配 ID、关联经历 ID、匹配分、状态与创建时间，并可在详情抽屉中展开经历 ID、用户 ID、匹配分与状态。本资源在 TablePage 中没有任何写操作按钮（`apps/admin/src/views/TablePage.vue:842-912` 的 action 分支不含 peer-matches）。

## USER_JOB

管理员需要确认匹配算法真的在为用户配对、匹配分的分布是否合理、有多少匹配停在 `suggested` 而没有推进到 `connected`，以便判断同路网络是否只是「建议了但没人接」。

## ENTRY

侧边栏「更多管理」折叠区中的「匹配记录」（`apps/admin/src/router.ts:68`；渲染在 `apps/admin/src/views/Layout.vue:130-151` 的 secondaryMenu，`/experience/matches` 不在 `Layout.vue:26-36` 的 primaryPaths 中）。也可直接访问 `/experience/matches`。路由守卫要求 localStorage 中存在 admin token（`apps/admin/src/router.ts:122-125`）。

## EXIT

点击侧边栏其它菜单项或直接改 URL。详情是页内抽屉，通过「×」或点击遮罩关闭（`TablePage.vue:947-951`、`:445-447`）。

## ROUTES

- `/experience/matches` → `TablePage.vue`，props `{ resource: 'peer-matches', title: '匹配记录' }`，group「体验网络」，`viaTablePage: true`（`artifacts/product-audit/admin-routes.json`；`apps/admin/src/router.ts:111-118`）。

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
| 搜索框（`data-testid="admin-search"`） | `v-model="search"`（`TablePage.vue:800-805`）→ `watch` 触发 `load`（`:784-787`） | 把 `q` 拼进查询串（`:407`）并重新请求。**`adminPeerMatches` 只声明 `status/page/pageSize`（`apps/api/src/controllers.ts:1994-1999`），不读 `q`；搜索不生效。** |
| 操作内容输入框（`data-testid="admin-action-input"`） | `v-model="actionText"`（`TablePage.vue:809-812`） | 只写本地变量；peer-matches 无 action 分支，无 handler 读取。无实际效果。 |
| 刷新（`data-testid="admin-audit-refresh"`） | `load`（`TablePage.vue:813`） | `loadCache()` + `GET /api/admin/v1/peer-matches?page=1&pageSize=20` |
| 行点击 / Enter / Space | `selectRow`（`TablePage.vue:930-932`、`:439-443`） | 打开详情抽屉 |
| 详情关闭（`data-testid="admin-detail-close"`） | `closeDetail`（`TablePage.vue:951`、`:445-447`） | `detailOpen=false` |
| 遮罩点击 | `closeDetail`（`TablePage.vue:947`） | `detailOpen=false` |

未渲染：状态筛选（`filterOptions` 对 peer-matches 返回空数组，`TablePage.vue:335-341`）、任何 action 按钮、分页控件。

## API_READS

- `GET /api/admin/v1/peer-matches` — handler `adminPeerMatches`（`apps/api/src/controllers.ts:1993-2003`），第 2000 行 `this.admin(auth)` 校验 token；返回 `this.list(this.store.peerMatches.filter(status 匹配), page, pageSize)`（`controllers.ts:2001-2002`）。
- 端点注册于 `apps/admin/src/views/TablePage.vue:60`。
- **实测（`work/group-c-probe.mjs`）：无 `authorization` 头 → 401；带 `Bearer` token → 200。不属于 ISSUE-001 的无守卫端点。**
- 后端支持 `status` 过滤（`controllers.ts:1996`、`:2001`），但前端不渲染筛选控件。

## API_WRITES

None found. 本页只发一个 GET（`TablePage.vue:43-67`），`resource-actions` 中无 peer-matches 分支（`TablePage.vue:842-912`）。管理端没有接受/拒绝匹配的入口；`PATCH /api/v1/peer-matches/:id`（`controllers.ts:490`）与 `/respond`（`:504`）只由小程序端调用。

## DB_ENTITIES

- **PeerMatch**（`prisma/schema.prisma:524-550`）：行数据来源，字段 `id/userId/journeyId/peerExperienceId/score/reasons/stageDistance/recoveryLead/trustScore/fingerprintSimilarity/scoreBreakdown/explanation/requestReason/requestQuestion/acceptedAt/status/createdAt/updatedAt`。
- **PeerExperience**（`prisma/schema.prisma:496-522`）：经 `peerExperienceId` 关联，管理端只显示 id 不展开。
- **AdminUser**（`prisma/schema.prisma:184-197`）：token 校验。
- 未写 AuditLog（本 GET 不调用 `store.audit`）。
- 持久化路径：`StoreService.persist()`（`store.service.ts:1879-1893`）→ `relational-runtime.mapper.ts:190`（`tx.peerMatch.upsert`，唯一键 `userId_peerExperienceId`）。

## ADMIN_VISIBILITY

菜单对所有已登录管理员可见，无角色过滤（`router.ts:68`、`Layout.vue:43`/`:130-151`）；后端只校验 token（`controllers.ts:1761-1763`）。`AdminRole.permissions`（`prisma/schema.prisma:203`）无读取点。

## AI_USAGE

匹配结果本身不是 AI 产物：`suggestPeerMatches` 在服务端用确定性打分计算（`apps/api/src/store.service.ts:3797-3810` 区域，`score`/`stageDistance`/`recoveryLead`/`fingerprintSimilarity` 等字段），`scoreBreakdown` 记录了各分项。本页不发起 AI 调用。相关联的 AI 环节是 `PeerConversation` 的 `assist`（`POST /api/v1/peer-conversations/:matchId/assist`，`controllers.ts:701`）会为消息生成整理建议，但那是会话资源，不是本页。

## PRIVACY

- 列表展示 `peerExperienceId`（`TablePage.vue:282-288`），详情额外展示 `userId`（`TablePage.vue:724-729`，原始 id 而非昵称——`userName()` 未用于此分支）。匹配记录直接暴露「哪个用户匹配到哪条经历」的关系。
- `reasons`/`explanation`/`scoreBreakdown`（`prisma/schema.prisma:533-539`）在响应中可用，但列表与详情都不渲染，因此管理员看不到匹配理由。
- 无隐私开关判断：`adminPeerMatches` 不调用 `privacyAllows`；`allowPeerMatching` 只在前台匹配生成时生效（`store.service.ts:3007`、`:3799`）。

## ERROR_STATES

有可见错误状态：`load` 的 `catch` 写 `status = error.message ?? '加载失败'`（`TablePage.vue:432-434`），渲染在 `<p class="muted">`（`:797`，可见样式 `styles.scss:289-291`）。

弱点：无 `role="status"`/`aria-live`；失败时表格同时为空，与真正的空态难以区分。耦合失败：`load()` 先 `await loadCache()`（`TablePage.vue:418`），后者 `Promise.all` 拉 5 个无关端点（`:387-401`），任一失败即让本表显示为空 + 错误行。

## EMPTY_STATES

单一通用空态：`<tr v-if="!items.length">...暂无数据`（`TablePage.vue:939-941`）。实测当前库中 `peer-matches` 为 0 条，所以这个空态是本资源在真实环境下的默认外观。没有针对匹配记录的文案，也不区分「无数据」与「加载失败」。

## NATIVE_RISKS

本页是 Web 管理后台，不运行在小程序原生端。间接风险：匹配记录驱动前台 `PeerMatchWaiting`/`PeerRequests` 的等待与请求界面（`apps/mp/src/views/PeerMatchWaiting.vue:9`、`PeerRequests.vue:16`），本页只读，不产生原生端状态变化。除上述外 **None found.**

## ISSUES

- P2 / FAKE_FUNCTION：搜索框渲染且可输入，但 `adminPeerMatches` 不读 `q`（`controllers.ts:1994-1999`），搜索不生效。
- P2 / FUNCTIONAL：分页固定 `page=1&pageSize=20`（`TablePage.vue:78-79`、`:405-406`），模板无翻页控件（`TablePage.vue:914-945`），超过 20 条静默截断。
- P2 / FUNCTIONAL：`load()` 先拉 5 个无关端点（`TablePage.vue:418`、`:387-401`），任一失败即让本表变空 + 错误行。
- P2 / PRIVACY：详情直接展示原始 `userId`（`TablePage.vue:726`），而同一组件的 `userName()`（`:149-152`）本可显示「昵称 / 匿名代号」；本分支未使用它，暴露的是内部 id。
- P3 / DATA：匹配的 `reasons`/`explanation`/`scoreBreakdown`（`prisma/schema.prisma:533-539`）在管理端完全不可见，管理员看到分数但看不到理由，无法复核算法。
- P3 / UX：`status` 行无 `role="status"`/`aria-live`（`TablePage.vue:797`）。
- P3 / UX：失败态与空态视觉上几乎一致。
- P3 / UX：空态是通用「暂无数据」（`TablePage.vue:940`）。
- P3 / UX：后端支持 `status` 过滤（`controllers.ts:1996`），但本页不渲染状态筛选（`TablePage.vue:335-341`）。
- P3 / TEST_CONTRACT：`navTestIds`（`Layout.vue:65-79`）不含 `/experience/matches`，导航链接 `data-testid` 为 `undefined`（`Layout.vue:121`、`:143`）。

## FINAL_STATUS

PARTIAL - 列表、详情与 token 守卫已逐行核对并实测（无 token 401 / 带 token 200），但搜索不生效、分页不可用、匹配理由不可见。

### Static evidence

- Controls discovered in component: 80
- Endpoint mapping: `apps/admin/src/views/TablePage.vue:60` (`peer-matches: /api/admin/v1/peer-matches`)
- Route: `/experience/matches` → `TablePage.vue` (`artifacts/product-audit/admin-routes.json`)
- Handler: `adminPeerMatches` (`apps/api/src/controllers.ts:1993-2003`), guarded at `:2000`
- Guard proof: no token → 401, `Bearer` token → 200 (`work/group-c-probe.mjs`)
- Live data shape: 0 rows (`total=0`)
- Seed: `peerMatches: []` (`apps/api/src/store.service.ts:1162`)

