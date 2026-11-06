# admin: peer-conversations (匿名会话)

Route: `/experience/peer-conversations`  
Component: `apps/admin/src/views/TablePage.vue`  
Group: 体验网络

## PURPOSE

以只读方式查看匿名同路会话（PeerConversation）：会话 ID、匹配 ID、状态、消息数与结束时间，并可在详情抽屉中展开同样五项。本资源在 TablePage 中没有任何写操作按钮（`apps/admin/src/views/TablePage.vue:842-912` 的 action 分支不含 peer-conversations）。

## USER_JOB

管理员需要确认 72 小时匿名会话是否在正常开合：有多少 `active`、多少已 `closed`/`expired`、消息数分布如何、结束时间是否已过，以便判断同路网络是否真的产生了交流，以及会话是否被卡住没有正常关闭。

## ENTRY

侧边栏「更多管理」折叠区中的「匿名会话」（`apps/admin/src/router.ts:70`；渲染在 `apps/admin/src/views/Layout.vue:130-151` 的 secondaryMenu，`/experience/peer-conversations` 不在 `Layout.vue:26-36` 的 primaryPaths 中）。也可直接访问 `/experience/peer-conversations`。路由守卫要求 localStorage 中存在 admin token（`apps/admin/src/router.ts:122-125`）。

## EXIT

点击侧边栏其它菜单项或直接改 URL。详情是页内抽屉，通过「×」或点击遮罩关闭（`TablePage.vue:947-951`、`:445-447`）。

## ROUTES

- `/experience/peer-conversations` → `TablePage.vue`，props `{ resource: 'peer-conversations', title: '匿名会话' }`，group「体验网络」，`viaTablePage: true`（`artifacts/product-audit/admin-routes.json`；`apps/admin/src/router.ts:111-118`）。

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
| 搜索框（`data-testid="admin-search"`） | `v-model="search"`（`TablePage.vue:800-805`）→ `watch` 触发 `load`（`:784-787`） | 把 `q` 拼进查询串（`:407`）并重新请求。**`adminPeerConversations` 只声明 `status/page/pageSize`（`apps/api/src/controllers.ts:2030-2035`），不读 `q`；搜索不生效。** |
| 操作内容输入框（`data-testid="admin-action-input"`） | `v-model="actionText"`（`TablePage.vue:809-812`） | 只写本地变量；peer-conversations 无 action 分支，无 handler 读取。无实际效果。 |
| 刷新（`data-testid="admin-audit-refresh"`） | `load`（`TablePage.vue:813`） | `loadCache()` + `GET /api/admin/v1/peer-conversations?page=1&pageSize=20` |
| 行点击 / Enter / Space | `selectRow`（`TablePage.vue:930-932`、`:439-443`） | 打开详情抽屉 |
| 详情关闭（`data-testid="admin-detail-close"`） | `closeDetail`（`TablePage.vue:951`、`:445-447`） | `detailOpen=false` |
| 遮罩点击 | `closeDetail`（`TablePage.vue:947`） | `detailOpen=false` |

未渲染：状态筛选（`filterOptions` 对 peer-conversations 返回空数组，`TablePage.vue:335-341`）、任何 action 按钮、分页控件。

## API_READS

- `GET /api/admin/v1/peer-conversations` — handler `adminPeerConversations`（`apps/api/src/controllers.ts:2029-2044`），第 2036 行 `this.admin(auth)` 校验 token；返回 `this.list(this.store.peerConversations.filter(status 匹配).map(附加 messageCount), page, pageSize)`（`controllers.ts:2037-2043`）。
- 该 handler 额外统计消息数：`messageCount = this.store.peerMessages.filter(m => m.conversationId === item.id).length`（`controllers.ts:2041`）。
- 端点注册于 `apps/admin/src/views/TablePage.vue:62`。
- **实测（`work/group-c-probe.mjs`）：无 `authorization` 头 → 401；带 `Bearer` token → 200。不属于 ISSUE-001 的无守卫端点。**
- 后端支持 `status` 过滤（`controllers.ts:2032`、`:2038`），但前端不渲染筛选控件。

## API_WRITES

None found. 本页只发一个 GET（`TablePage.vue:43-67`），`resource-actions` 中无 peer-conversations 分支（`TablePage.vue:842-912`）。管理端无法关闭、举报或屏蔽会话；`POST /api/v1/peer-conversations/:matchId/close|report|block`（`controllers.ts:710`、`:715`、`:724`）只由小程序端调用。

## DB_ENTITIES

- **PeerConversation**（`prisma/schema.prisma:767-791`）：行数据来源，字段 `id/matchId/starterUserId/receiverUserId/status/startsAt/consentAcceptedAt/expiresAt/createdAt/closedAt/closedReason/feedback/feedbackNote/reportedAt/reporterUserId/reportReason`。
- **PeerMessage**（`prisma/schema.prisma:793-807`）：仅用于统计 `messageCount`（`controllers.ts:2041`），消息正文不返回。
- **AdminUser**（`prisma/schema.prisma:184-197`）：token 校验。
- 未写 AuditLog（本 GET 不调用 `store.audit`）。
- 持久化路径：`StoreService.persist()`（`store.service.ts:1879-1893`）→ `relational-runtime.mapper.ts:226`（`tx.peerConversation.upsert`）。另有直连写：`expirePeerConversations` 会把过期会话置为 `expired`（`store.service.ts:3959-3994` 区域）。

## ADMIN_VISIBILITY

菜单对所有已登录管理员可见，无角色过滤（`router.ts:70`、`Layout.vue:43`/`:130-151`）；后端只校验 token（`controllers.ts:1761-1763`）。`AdminRole.permissions`（`prisma/schema.prisma:203`）无读取点。

## AI_USAGE

本页不发起 AI 调用，也不展示任何 AI 文本。会话中的 AI 环节是 `POST /api/v1/peer-conversations/:matchId/assist`（`controllers.ts:701` → `store.service.ts:4178-4194`，`taskType: 'peer_response_assist'`），它只把 AI 结果回填到用户的输入框草稿里，最终消息仍由用户确认发送，且 `PeerMessage.authorType` 会区分 `HUMAN`/`AI_ASSIST`（`prisma/schema.prisma:800`）。本页既不展示消息也不展示 `authorType`。

## PRIVACY

- 列表与详情都不展示消息正文，只展示 `messageCount`（`TablePage.vue:296-302`、`:738-744`），因此会话内容不经过管理端。这是本组 11 个资源里对隐私最克制的一页。
- 但也不展示 `userId`：列表显示 `matchId`，详情显示 `matchId`（`:741`），两个参与者 id 都不出现。
- `feedback`/`feedbackNote`/`reportedAt`/`reportReason`（`prisma/schema.prisma:782-786`）在响应中存在，但管理端完全不渲染——**被举报的会话在管理端与普通会话外观完全一致**。
- 无隐私开关判断：`adminPeerConversations` 不调用 `privacyAllows`。

## ERROR_STATES

有可见错误状态：`load` 的 `catch` 写 `status = error.message ?? '加载失败'`（`TablePage.vue:432-434`），渲染在 `<p class="muted">`（`:797`，可见样式 `styles.scss:289-291`）。

弱点：无 `role="status"`/`aria-live`；失败时表格同时为空，与真正的空态难以区分。耦合失败：`load()` 先 `await loadCache()`（`TablePage.vue:418`），后者 `Promise.all` 拉 5 个无关端点（`:387-401`），任一失败即让本表显示为空 + 错误行。

## EMPTY_STATES

单一通用空态：`<tr v-if="!items.length">...暂无数据`（`TablePage.vue:939-941`）。实测当前库中 `peer-conversations` 为 0 条，所以这个空态是本资源在真实环境下的默认外观。没有针对匿名会话的文案，也不区分「无数据」与「加载失败」。

## NATIVE_RISKS

本页是 Web 管理后台，不运行在小程序原生端。间接风险：会话是原生端 `PeerConversation.vue` 的核心对象，且带 72 小时 `expiresAt` 硬约束（`store.service.ts:4160-4161` 在过期后拒绝发消息）。管理端只读，无法延长或干预即将过期的会话；若用户遇到会话异常结束，管理端也没有可操作入口。除上述外 **None found.**

## ISSUES

- P2 / PRIVACY：被举报的会话在管理端不可见。`reportedAt`/`reporterUserId`/`reportReason`（`prisma/schema.prisma:784-786`）由用户举报写入（`store.service.ts:4203-4209`），但列表与详情都不渲染，也没有筛选或排序；举报后管理员无法从本页发现需要处置的会话。
- P2 / FUNCTIONAL：列表「状态」列直接渲染原始字符串 `row.status`（`TablePage.vue:299`），详情同样（`:741`），不走 `statusLabel`；`statusLabel` 映射表（`:120-147`）也不含 `active`/`closed`/`extended`，所以状态显示为英文原值。同组件的 `journeys`/`support-plans` 分支都会翻译。
- P2 / FAKE_FUNCTION：搜索框渲染且可输入，但 `adminPeerConversations` 不读 `q`（`controllers.ts:2030-2035`），搜索不生效。
- P2 / FUNCTIONAL：分页固定 `page=1&pageSize=20`（`TablePage.vue:78-79`、`:405-406`），模板无翻页控件（`TablePage.vue:914-945`），超过 20 条静默截断。
- P2 / FUNCTIONAL：`load()` 先拉 5 个无关端点（`TablePage.vue:418`、`:387-401`），任一失败即让本表变空 + 错误行。
- P3 / DATA：`messageCount` 是逐会话在内存里 filter 出来的（`controllers.ts:2041`），不是持久化字段；管理端展示的计数来自这一处计算，与 `PeerConversation` 表本身无关。
- P3 / UX：`status` 行无 `role="status"`/`aria-live`（`TablePage.vue:797`）。
- P3 / UX：失败态与空态视觉上几乎一致。
- P3 / UX：空态是通用「暂无数据」（`TablePage.vue:940`）。
- P3 / UX：后端支持 `status` 过滤（`controllers.ts:2032`），但本页不渲染状态筛选（`TablePage.vue:335-341`）。
- P3 / TEST_CONTRACT：`navTestIds`（`Layout.vue:65-79`）不含 `/experience/peer-conversations`，导航链接 `data-testid` 为 `undefined`（`Layout.vue:121`、`:143`）。

## FINAL_STATUS

PARTIAL - 列表、详情与 token 守卫已逐行核对并实测（无 token 401 / 带 token 200），但举报会话不可见、状态值未本地化、搜索不生效、分页不可用。

### Static evidence

- Controls discovered in component: 80
- Endpoint mapping: `apps/admin/src/views/TablePage.vue:62` (`peer-conversations: /api/admin/v1/peer-conversations`)
- Route: `/experience/peer-conversations` → `TablePage.vue` (`artifacts/product-audit/admin-routes.json`)
- Handler: `adminPeerConversations` (`apps/api/src/controllers.ts:2029-2044`), guarded at `:2036`
- Guard proof: no token → 401, `Bearer` token → 200 (`work/group-c-probe.mjs`)
- Live data shape: 0 rows (`total=0`)
- `messageCount` is computed in the handler: `apps/api/src/controllers.ts:2041`
- Seed: `peerConversations: []` (`apps/api/src/store.service.ts:1177`)

