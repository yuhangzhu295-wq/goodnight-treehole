# admin: providers (AI 配置中心)

Route: `/ai/providers`  
Component: `apps/admin/src/views/AIProvidersPage.vue`
Group: AI 管理

## PURPOSE

维护参与真实 AI 路由的模型来源（Provider）。页面区分 DAPI 主来源、已批准的远程备用来源、以及被运行策略永久禁用的历史本地模型，允许管理员调整非敏感运行参数、启停允许变更的来源、对受管远程来源执行一次真实连接测试，并查看今日调用量与失败率。本地模型由 DAPI-only 策略禁用（`apps/admin/src/views/AIProvidersPage.vue:230`、`apps/api/src/controllers.ts:52-56`）。

## USER_JOB

管理员需要知道当前有哪些模型来源、各自的模型名与调用地址、优先级与单日上限、是否启用；需要在不接触密钥的前提下修改非敏感参数、启停允许变更的来源、对受管远程来源执行一次真实连接测试，并核对失败率与今日调用量。

## ENTRY

侧边栏「AI 管理 > AI 配置中心」（`apps/admin/src/router.ts:48`、`apps/admin/src/router.ts:103`；菜单由 `apps/admin/src/views/Layout.vue:4` 引入的 `menu` 渲染）。也可直接访问 `/ai/providers`。路由守卫要求 localStorage 中存在 admin token（`apps/admin/src/router.ts:122-125`）。

## EXIT

点击侧边栏其它菜单项或直接改 URL 离开；页面内没有其它出口。未保存的编辑器改动只存在内存中，离开即丢弃（`apps/admin/src/views/AIProvidersPage.vue:103-107`、`:215-219`）。

## ROUTES

- `/ai/providers` → `AIProvidersPage.vue`，title「AI 配置中心」，group「AI 管理」，`viaTablePage: false`（`artifacts/product-audit/admin-routes.json`）。

## STATES

- 加载中：`busy=true`，初始 `status` 为「正在读取远程 AI Provider 策略…」（`AIProvidersPage.vue:20`），表格带 `aria-busy`（:263）。
- 已加载：`status` 为「已从服务端读取 N 个 Provider 配置」（:140）。
- 保存中：`saving=true`，保存按钮显示「保存中…」（:370）。
- 失败：`catch` 把 `status` 设为 `error.message` 或「读取 AI 模型来源失败」（:141-142）。
- 空数据：表格渲染空行「暂无可配置的模型来源」（:314），右侧编辑器显示空态提示（:375-378）。

## CONTROLS

| control | handler | real effect |
| --- | --- | --- |
| 刷新远程配置（页头） | `load`（`AIProvidersPage.vue:232`） | GET `/api/admin/v1/ai/providers?page=1&pageSize=100`，回填列表 |
| 刷新远程配置（表头） | `load`（:256） | 同上 |
| 上一页 / 下一页 | `changePage`（:321-323、:148-152） | 仅切换客户端分页（`pageSize` 固定 5，:24），不请求服务端 |
| 测试（每行） | `test`（:300、:154-169） | 仅当 `isManagedRemote` 为真时 POST `/api/admin/v1/ai/providers/:id/test`；否则只写状态「该历史来源已被远程运行策略锁定，不能执行连接测试」 |
| 启用/停用（每行） | `toggle`（:308、:171-186） | PATCH `/api/admin/v1/ai/providers/:id` 传 `{enabled}`；本地来源 / `disabled-by-policy` / DAPI 被前端拦截为「策略锁定」 |
| 恢复 | `resetSelected`（:368、:215-219） | 仅把编辑器回滚到最近一次服务端读取值，不发请求 |
| 保存配置 | `saveSelected`（:369、:188-213） | PUT `/api/admin/v1/ai/providers/:id`，写入 name/modelName/baseUrl/priority/dailyLimit/timeoutSeconds/failoverEnabled/usageTags |
| 编辑器输入（显示名称/模型名称/调用地址/优先级/单日调用上限/超时时间/失败自动切换/用途标签） | `v-model`（:351-358） | 仅本地编辑，需点「保存配置」才提交 |

## API_READS

- `GET /api/admin/v1/ai/providers` — handler `providers`（`apps/api/src/controllers.ts:2377-2388`）。该 handler 不接收 authorization 参数、无 token 校验，属 ISSUE-001 的无守卫读端点。

## API_WRITES

- `POST /api/admin/v1/ai/providers` — handler `createProvider`（`controllers.ts:2389-2416`），`this.admin(auth)` 校验 token（:2391）。
- `PUT /api/admin/v1/ai/providers/:id` — handler `updateProvider`（`controllers.ts:2417-2433`），校验 token（:2423）。
- `PATCH /api/admin/v1/ai/providers/:id` — handler `patchProvider`（`controllers.ts:2435-2442`），带 auth 委托 `updateProvider`（:2441），与 PATCH `/config` 同属「委托校验」路径，无 token 时应返回 401。
- `POST /api/admin/v1/ai/providers/:id/test` — handler `testProvider`（`controllers.ts:2443-2455`），校验 token（:2445）。
- `DELETE /api/admin/v1/ai/providers/:id` — handler `deleteProvider`（`controllers.ts:2468-2478`），校验 token（:2470）；页面无调用方。

## DB_ENTITIES

- `AIProvider`（`prisma/schema.prisma:966`）。
- `AIStyleRoute`（`prisma/schema.prisma:995`，经 primary/backup/fallback 关系引用 Provider）。
- `AIJob`（`prisma/schema.prisma:1013`，经 `providerId` 引用 Provider）。
- `AuditLog`（`prisma/schema.prisma:1057`，由 `store.audit` 写入，例如 `controllers.ts:2412`）。
- 持久化路径：`StoreService.persist()` → `saveRuntimeState`（`apps/api/src/store.service.ts:1879-1893`）；关系型模式下映射到上述表（`apps/api/src/relational-runtime.mapper.ts:136`）。

## ADMIN_VISIBILITY

菜单项对所有已登录管理员可见；没有按角色/权限过滤：`menuGroups` 是静态列表（`router.ts:31-91`），Layout 直接渲染（`Layout.vue:116`、`:138`），后端只校验 token 不校验角色（`controllers.ts:1761-1763`、`store.service.ts:2190-2197`）。`AdminRole.permissions` 字段存在但未被前端或后端读取（`prisma/schema.prisma` 的 `AdminRole` 模型；`apps/api/src/relational-runtime.mapper.ts:169` 写入空数组）。

## AI_USAGE

本页直接决定真实 AI 路由可用的来源：`queueAiJob` 优先使用 `provider_dapi_deepseek`，否则回退远程备用（`apps/api/src/store.service.ts:5122`、`:5227`）。「测试」按钮触发 `store.testAiProvider`（`controllers.ts:2446`），是一次真实模型调用。

## PRIVACY

- 列表响应剥离 `apiKeySecretRef`，仅给出 `apiKeyMasked`（`controllers.ts:2382-2383`）。
- 页面多处声明密钥不回显、不写入（`AIProvidersPage.vue:252`、`:333`、`:348`）。
- 服务端仅从进程环境读取密钥（`apps/api/src/remote-ai-provider.service.ts:129-135`）。
- 本页不展示任何用户 PII。

## ERROR_STATES

`load` 的 `catch` 把错误写入 `status`（`AIProvidersPage.vue:141-142`）。但承载 `status` 的元素被样式隐藏（`.provider-status`，`AIProvidersPage.vue:492-500`；模板位置 :244），因此加载失败时页面只剩空表、没有可见错误提示——这是发现项。

## EMPTY_STATES

- 表格零行：`<tr v-if="!items.length"><td colspan="9" class="empty-cell">暂无可配置的模型来源</td></tr>`（`AIProvidersPage.vue:314`）。
- 未选中：右侧 `provider-editor-empty` 提示「选择一条真实供应商记录后…」（`AIProvidersPage.vue:375-378`）。

## NATIVE_RISKS

本页是 Web 管理后台，不直接运行在小程序原生端。间接影响：错误停用 DAPI/备用来源会让前台 AI 走失败终态（`store.service.ts:5122`）；但本地模型在后端被硬性拒绝（`controllers.ts:52-56`），无法通过本页启用。除上述外 **None found.**

## ISSUES

- P0 / SECURITY：`GET /api/admin/v1/ai/providers` 无 token 守卫，未授权即可读取 Provider 配置（`controllers.ts:2377`；`artifacts/product-audit/admin-unguarded.json` line 2377）。属 ISSUE-001。
- P1 / FAKE_BUTTON：`TablePage.vue` 的 providers 分支（「新增供应商/保存供应商/启用停用/测试连接」，`apps/admin/src/views/TablePage.vue:866-871`）永不渲染——router 只把 `experience/*` 与 `safety/*` 资源交给 TablePage（`router.ts:110-118`）；对应 handler（`TablePage.vue:496-511`）为死代码。属 ISSUE-014。
- P1 / ORPHAN：`POST /api/admin/v1/ai/providers`（新增）与 `DELETE /api/admin/v1/ai/providers/:id` 在 admin UI 无有效调用方：`AIProvidersPage.vue` 无新增/删除控件，TablePage 的调用分支不可达（`TablePage.vue:867`）。属 ISSUE-014。
- P2 / UX：加载失败没有可见错误状态（`status` 渲染在视觉隐藏元素内，`AIProvidersPage.vue:244`、`:492-500`）。
- P3 / UX：「测试」按钮仅对 `provider_dapi_deepseek` / `provider_openai_remote` 生效（`AIProvidersPage.vue:35-37`、`:155-158`、`:299`），其它来源无法从 UI 触发测试，只能得到一句状态说明。

## FINAL_STATUS

PARTIAL —— 读/写主流程真实可用，但读端点无 token 守卫（ISSUE-001），且 TablePage 的 providers 操作分支不可达、创建/删除端点无调用方（ISSUE-014）。

### Static evidence

- Controls discovered in component: 15
- Endpoint mapping: `apps/admin/src/views/TablePage.vue:47`（`providers: /api/admin/v1/ai/providers`）
- Route: `/ai/providers` → `AIProvidersPage.vue`（`artifacts/product-audit/admin-routes.json`）
- Unguarded endpoint: `GET ai/providers`（line 2377）— `artifacts/product-audit/admin-unguarded.json`
- Store seed: `apps/api/src/store.service.ts:917-1095`（aiProviders 默认数据）
