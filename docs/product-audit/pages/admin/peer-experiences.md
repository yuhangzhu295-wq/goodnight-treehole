# admin: peer-experiences (同路经历)

Route: `/experience/peers`  
Component: `apps/admin/src/views/TablePage.vue`  
Group: 体验网络

## PURPOSE

审核并管理用户匿名分享的同路经历（PeerExperience）：列表展示经历 ID、标题、领域、审核状态与「匿名同意」标记，并可对选中记录执行发布 / 隐藏 / 拒绝三个审核动作。这是 11 个 TablePage 资源中**唯一带写操作**的资源（`apps/admin/src/views/TablePage.vue:907-911` 的 `peer-experiences` 分支）。

## USER_JOB

管理员需要把用户同意匿名分享的经历从 `draft`/`pending_review` 推进到 `published`，或对不适合公开的内容执行 `hidden` / `rejected`，并在审核前阅读经历正文与确认用户确实点了匿名同意。

## ENTRY

侧边栏「更多管理」折叠区中的「同路经历」（`apps/admin/src/router.ts:67`；渲染在 `apps/admin/src/views/Layout.vue:130-151` 的 secondaryMenu，`/experience/peers` 不在 `Layout.vue:26-36` 的 primaryPaths 中）。也可直接访问 `/experience/peers`。路由守卫要求 localStorage 中存在 admin token（`apps/admin/src/router.ts:122-125`）。

## EXIT

点击侧边栏其它菜单项或直接改 URL。详情是页内抽屉，通过「×」或点击遮罩关闭（`TablePage.vue:947-951`、`:445-447`）。审核动作完成后 `mutate` 会重新 `load()` 刷新列表（`TablePage.vue:449-461`）。

## ROUTES

- `/experience/peers` → `TablePage.vue`，props `{ resource: 'peer-experiences', title: '同路经历' }`，group「体验网络」，`viaTablePage: true`（`artifacts/product-audit/admin-routes.json`；`apps/admin/src/router.ts:111-118`）。

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| 加载中 | `busy=true` | `TablePage.vue:416`、`:916` |
| 已加载 | `status` = 「已加载 N 条，当前显示 N 条」 | `TablePage.vue:431` |
| 加载失败 | `status` = `error.message` 或「加载失败」 | `TablePage.vue:432-434` |
| 审核中 | `busy=true`（`mutate` 设） | `TablePage.vue:451` |
| 审核成功 | `status` = 「同路经历已发布 / 已隐藏 / 已拒绝」 | `TablePage.vue:561-563` |
| 审核失败 | `status` = `error.message` 或「操作失败」 | `TablePage.vue:456-458` |
| 未选中行时点审核 | 静默无操作 | `TablePage.vue:450`（`if (!selected.value ...) return;`） |
| 详情抽屉打开 | `detailOpen=true` | `TablePage.vue:947-948` |
| 空表 | `items.length === 0` | `TablePage.vue:939-941` |

## CONTROLS

| control | handler | real effect |
| --- | --- | --- |
| 发布经历（`data-testid="admin-peer-publish"`，class primary） | `reviewPeerExperience('published')`（`TablePage.vue:908`、`:561-563`） | `PATCH /api/admin/v1/peer-experiences/<selected.id>/review` body `{ status: 'published' }`；成功后 `load()` 刷新并写 `status` |
| 隐藏经历（`data-testid="admin-peer-hide"`） | `reviewPeerExperience('hidden')`（`TablePage.vue:909`） | 同上，body `{ status: 'hidden' }` |
| 拒绝经历（`data-testid="admin-peer-reject"`，class danger） | `reviewPeerExperience('rejected')`（`TablePage.vue:910`） | 同上，body `{ status: 'rejected' }` |
| 搜索框（`data-testid="admin-search"`） | `v-model="search"`（`TablePage.vue:800-805`）→ `watch` 触发 `load`（`:784-787`） | 把 `q` 拼进查询串（`:407`）并重新请求。**`adminPeerExperiences` 只声明 `status/page/pageSize`（`apps/api/src/controllers.ts:1966-1971`），不读 `q`；搜索不生效。** |
| 操作内容输入框（`data-testid="admin-action-input"`） | `v-model="actionText"`（`TablePage.vue:809-812`） | 只写本地变量；peer-experiences 的三个 handler 都不读 `actionText`（`TablePage.vue:561-563` 只传 status 字面量）。无实际效果。 |
| 刷新（`data-testid="admin-audit-refresh"`） | `load`（`TablePage.vue:813`） | `loadCache()` + `GET /api/admin/v1/peer-experiences?page=1&pageSize=20` |
| 行点击 / Enter / Space | `selectRow`（`TablePage.vue:930-932`、`:439-443`） | 打开详情抽屉，`status` 设为「已选择 <id>」 |
| 详情关闭（`data-testid="admin-detail-close"`） | `closeDetail`（`TablePage.vue:951`、`:445-447`） | `detailOpen=false` |
| 遮罩点击 | `closeDetail`（`TablePage.vue:947`） | `detailOpen=false` |

未渲染：状态筛选（`filterOptions` 对 peer-experiences 返回空数组，`TablePage.vue:335-341`）、分页控件（模板中不存在）。

## API_READS

- `GET /api/admin/v1/peer-experiences` — handler `adminPeerExperiences`（`apps/api/src/controllers.ts:1965-1975`），第 1972 行 `this.admin(auth)` 校验 token；返回 `this.list(this.store.peerExperiences.filter(status 匹配), page, pageSize)`（`controllers.ts:1973-1974`）。
- 端点注册于 `apps/admin/src/views/TablePage.vue:59`。
- **实测（`work/group-c-probe.mjs`）：无 `authorization` 头 → 401；带 `Bearer` token → 200。不属于 ISSUE-001 的无守卫端点。**

## API_WRITES

- `PATCH /api/admin/v1/peer-experiences/:id/review` — handler `reviewPeerExperience`（`apps/api/src/controllers.ts:1977-1991`）。第 1983 行 `const admin = this.admin(auth)` 校验 token；第 1984-1985 行按 id 查 `store.peerExperiences`，找不到抛 `NotFoundException('同路经历不存在')`；第 1986-1987 行写 `item.status = body.status`；第 1988 行 `store.audit(admin.id, 'PEER_EXPERIENCE_REVIEW', 'PeerExperience', id, before, item)`；第 1989 行 `persistAndFlush()`。
- **实测（`work/group-c-probe.mjs`）：无 token → 401 `{"message":"缺少登录凭证"}`；带 token 但 id 不存在 → 404 `{"message":"同路经历不存在"}`。守卫与 not-found 分支都真实生效。**
- 调用点：`apps/admin/src/views/TablePage.vue:562`。

## DB_ENTITIES

- **PeerExperience**（`prisma/schema.prisma:496-522`）：读 + 写 `status`（`PeerExperienceStatus` 枚举：`draft/pending_review/published/hidden/rejected`，`prisma/schema.prisma:89-95`）。
- **AuditLog**（`prisma/schema.prisma:1057-1070`）：每次审核写一条 `PEER_EXPERIENCE_REVIEW`（`controllers.ts:1988` → `store.service.ts:2199-2220`）。
- **AdminUser**（`prisma/schema.prisma:184-197`）：token 校验，并作为 AuditLog 的 `adminUserId`。
- 持久化路径：`persistAndFlush()`（`store.service.ts:1900-1903`）→ `relational-runtime.mapper.ts:189`（`tx.peerExperience.upsert`，`status` 经 `valid(item.status, ['draft','pending_review','published','hidden','rejected'])` 白名单）。

## ADMIN_VISIBILITY

菜单对所有已登录管理员可见，无角色过滤（`router.ts:67`、`Layout.vue:43`/`:130-151`）；后端只校验 token（`controllers.ts:1761-1763`）。`AdminRole.permissions`（`prisma/schema.prisma:203`）无读取点，因此任何管理员都能发布/隐藏/拒绝经历——审核动作没有角色约束。

## AI_USAGE

本页不发起 AI 调用，但审核对象是 AI 辅助产物：`PeerExperience` 的 `title/domain/stage/content` 由 `createPeerExperience`（`apps/api/src/store.service.ts:3630`）写入，其来源是旅程毕业时的结构化生成结果；`POST /api/v1/peer-experiences`（`controllers.ts:463`）也接受用户提交。经历本身在管理端不经过任何模型再审核——三个按钮是纯人工判断。

## PRIVACY

- 详情抽屉展示 `content`（经历正文，`TablePage.vue:715-723`），列表展示 `title`（截断 42 字，`TablePage.vue:275-281`）。都是用户匿名分享的私密文本。
- 「匿名同意」列与详情项读取 `consentedAt`（`TablePage.vue:280`、`:721`）。`consentedAt` 在 schema 中是**必填** `DateTime`（`prisma/schema.prisma:513`，无 `?`），因此「未同意」分支实际不可达——该列永远显示「已同意」。
- 列表与详情都不展示 `userId`，但 API 响应包含（`relational-runtime.mapper.ts:111` 映射了 `userId`）。
- 审核动作不检查 `allowAnonymousExperienceShare` 或 `allowPeerMatching`；后两者只在前台写/读路径生效（`store.service.ts:3648`、`:3707`、`:3799`）。因此用户事后关闭分享开关，不会撤回管理端已发布的内容。

## ERROR_STATES

有可见错误状态：`mutate` 的 `catch` 写 `status = error.message ?? '操作失败'`（`TablePage.vue:456-458`），`load` 的 `catch` 写「加载失败」（`:432-434`），都渲染在 `<p class="muted">`（`:797`，可见样式 `styles.scss:289-291`）。

弱点：无 `role="status"`/`aria-live`；审核失败时列表会保持原状但没有任何行内标记；失败态与空态视觉上难以区分。耦合失败：`load()` 先 `await loadCache()`（`TablePage.vue:418`），后者 `Promise.all` 拉 5 个无关端点（`:387-401`），任一失败即让本表显示为空 + 错误行。

## EMPTY_STATES

单一通用空态：`<tr v-if="!items.length">...暂无数据`（`TablePage.vue:939-941`）。实测当前库中 `peer-experiences` 为 0 条，所以这个空态就是本资源在真实环境下的默认外观。没有针对同路经历的文案，也不区分「无数据」与「加载失败」。

## NATIVE_RISKS

本页是 Web 管理后台，不运行在小程序原生端。间接风险：审核结果直接影响前台 `PeerNetwork`/`PeerExperienceDetail` 能看到的经历集合（`apps/mp/src/views/PeerNetwork.vue:24` 读 `GET /api/v1/peers`），本页发布后原生端立即可见；本页不做版本或延迟发布。除上述外 **None found.**

## ISSUES

- P2 / PRIVACY：`consentedAt` 在 schema 中必填（`prisma/schema.prisma:513`），所以列表「匿名同意」列（`TablePage.vue:280`）与详情项（`:721`）永远显示「已同意」，「未同意」是不可达分支；该列给人的「已在审核前确认同意」保证并没有区分力。
- P2 / FUNCTIONAL：审核动作没有角色约束，任何持有 admin token 的账号都能发布/隐藏/拒绝（`controllers.ts:1983`；`AdminRole.permissions` 无读取点）。
- P2 / FAKE_FUNCTION：搜索框渲染且可输入，但 `adminPeerExperiences` 不读 `q`（`controllers.ts:1966-1971`），搜索不生效。
- P2 / UX：审核动作没有二次确认。三个按钮（尤其 danger 的「拒绝经历」）点击即调用 API（`TablePage.vue:908-910`、`:561-563`），对比同仓 `UsersPage.vue:166`/`PostsPage.vue:236` 都走 `confirmation` 面板。
- P2 / FUNCTIONAL：分页固定 `page=1&pageSize=20`（`TablePage.vue:78-79`、`:405-406`），模板无翻页控件（`TablePage.vue:914-945`），超过 20 条静默截断。
- P2 / FUNCTIONAL：`load()` 先拉 5 个无关端点（`TablePage.vue:418`、`:387-401`），任一失败即让本表变空 + 错误行。
- P3 / UX：`status` 行无 `role="status"`/`aria-live`（`TablePage.vue:797`）。
- P3 / UX：空态是通用「暂无数据」（`TablePage.vue:940`）。
- P3 / UX：后端支持 `status` 过滤（`controllers.ts:1968`），但本页不渲染状态筛选（`TablePage.vue:335-341`），审核队列无法按 `pending_review` 过滤——而这是审核页最需要的筛选。
- P3 / TEST_CONTRACT：`navTestIds`（`Layout.vue:65-79`）不含 `/experience/peers`，导航链接 `data-testid` 为 `undefined`（`Layout.vue:121`、`:143`）。

## FINAL_STATUS

PARTIAL - 列表、详情、唯一的写动作与 token 守卫都已逐行核对并实测（无 token 401；带 token 且 id 不存在 404），但审核缺少二次确认、无 pending_review 筛选、搜索不生效。

### Static evidence

- Controls discovered in component: 80
- Endpoint mapping: `apps/admin/src/views/TablePage.vue:59` (`peer-experiences: /api/admin/v1/peer-experiences`)
- Route: `/experience/peers` → `TablePage.vue` (`artifacts/product-audit/admin-routes.json`)
- Handlers: `adminPeerExperiences` (`apps/api/src/controllers.ts:1965-1975`, guarded `:1972`), `reviewPeerExperience` (`:1977-1991`, guarded `:1983`)
- Guard proof: GET no token → 401, token → 200; PATCH no token → 401, token + unknown id → 404 (`work/group-c-probe.mjs`)
- Live data shape: 0 rows (`total=0`)
- `consentedAt` is non-nullable: `prisma/schema.prisma:513`
- Seed: `peerExperiences: []` (`apps/api/src/store.service.ts:1161`)

