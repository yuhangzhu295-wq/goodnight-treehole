# admin: routes (风格路由)

Route: `/ai/routes`  
Component: `apps/admin/src/views/AIRoutesPage.vue`
Group: AI 管理

## PURPOSE

查看并维护每种回应风格（warm/rational/light/clear/poetic）的主模型、备用模型、Prompt 版本与路由版本，并可对某条风格规则发起一次真实的测试生成任务。页面顶部的「路由流程」示意当前主/备用来源的实际取值（`apps/admin/src/views/AIRoutesPage.vue:216-256`）。

## USER_JOB

管理员需要确认每种风格的当前路由目标是否仍是已启用的远程来源、Prompt 版本与路由版本是否已更新、规则是否启用，并在调整后发起一次真实测试以确认路由可用。

## ENTRY

侧边栏「AI 管理 > 风格路由」（`apps/admin/src/router.ts:49`、`apps/admin/src/router.ts:104`）。也可直接访问 `/ai/routes`。路由守卫要求 localStorage 中存在 admin token（`apps/admin/src/router.ts:122-125`）。

## EXIT

点击侧边栏其它菜单项或直接改 URL 离开。详情抽屉可点右上角「×」或点遮罩关闭（`AIRoutesPage.vue:384`、`:377`）。

## ROUTES

- `/ai/routes` → `AIRoutesPage.vue`，title「风格路由」，group「AI 管理」，`viaTablePage: false`（`artifacts/product-audit/admin-routes.json`）。

## STATES

- 加载中：`busy=true`；初始 `status` 为「正在读取分配规则…」（`AIRoutesPage.vue:10`），刷新按钮 disabled（:222）。
- 已加载：`status` 为「已从服务端读取 N 条分配规则」（:160）。
- 保存成功：`status` 为「分配规则已保存，并已从服务端重新读取」（:180）。
- 测试成功：`status` 为「真实测试任务已创建：{jobId}」（:195）。
- 失败：`catch` 把 `status` 设为 `error.message` 或「规则加载失败」/「规则保存失败」/「创建测试任务失败」（:162、:182、:197）。
- 空数据：表格渲染「暂无可展示的风格路由，请刷新配置后重试。」（:366）。

## CONTROLS

| control | handler | real effect |
| --- | --- | --- |
| 刷新配置 | `load`（`AIRoutesPage.vue:222`） | 并发 GET `/api/admin/v1/ai/routes?page=1&pageSize=100` 与 `/api/admin/v1/ai/providers?page=1&pageSize=100`（:155-156） |
| 编辑（每行） | `open`（:348、:146-149） | 仅把该行复制进详情抽屉，不发请求 |
| 测试（每行） | `test(route)`（:357、:188-199） | POST `/api/admin/v1/ai/routes/:style/test`，body `{content: testContent}`，创建真实异步任务 |
| 保存规则（抽屉） | `save`（:424、:168-186） | PATCH `/api/admin/v1/ai/routes/:style`，body `{primaryProviderId, backupProviderId, enabled}` |
| 创建测试任务（抽屉） | `test()`（:427） | 同「测试」，使用抽屉内的测试内容 |
| 主模型 / 备用模型 select | `v-model`（:400、:408） | 渲染为 `disabled`，只展示不可编辑 |
| 启用这条规则 | `v-model="selected.enabled"`（:416） | 仅本地状态，需点「保存规则」才提交 |
| 测试内容 textarea | `v-model="testContent"`（:421） | 作为测试任务的 content 提交 |

## API_READS

- `GET /api/admin/v1/ai/routes` — handler `routes`（`apps/api/src/controllers.ts:2480-2483`）。无 token 校验，属 ISSUE-001 的无守卫读端点。
- `GET /api/admin/v1/ai/providers` — handler `providers`（`controllers.ts:2377-2388`），本页用于把 providerId 解析为名称。同样无 token 校验。

## API_WRITES

- `PATCH /api/admin/v1/ai/routes/:style` — handler `patchRoute`（`controllers.ts:2514-2521`），带 auth 委托 `updateRoute`（:2520）。
- `PUT /api/admin/v1/ai/routes/:style` — handler `updateRoute`（`controllers.ts:2484-2512`），校验 token（:2490），并校验主/备来源必须存在、已启用且为 `openai-compatible`（:2495-2505），成功后 `routeVersion + 1`（:2507）。页面无调用方（只发 PATCH）。
- `POST /api/admin/v1/ai/routes/:style/test` — handler `testRoute`（`controllers.ts:2523-2545`），校验 token（:2529），经 `store.queueAI` 创建真实任务（:2530-2536）。

## DB_ENTITIES

- `AIStyleRoute`（`prisma/schema.prisma:995`）。
- `AIProvider`（`prisma/schema.prisma:966`，主/备/兜底关系）。
- `AIJob`（`prisma/schema.prisma:1013`，测试任务经 `queueAI` 写入）。
- `AuditLog`（`prisma/schema.prisma:1057`，`AI_ROUTE_UPDATE`/`AI_ROUTE_TEST`）。
- 持久化路径：`StoreService.persist()`（`apps/api/src/store.service.ts:1879-1893`）→ 关系型映射 `relational-runtime.mapper.ts:136`。

## ADMIN_VISIBILITY

菜单项对所有已登录管理员可见，无角色过滤（`router.ts:31-91`、`Layout.vue:116`/`:138`）；后端只校验 token（`controllers.ts:1761-1763`、`store.service.ts:2190-2197`），`AdminRole.permissions` 未被读取。

## AI_USAGE

本页配置的正是 `queueAiJob` 的选路依据：按 `style` 命中已启用路由，再取 `primaryProviderId`，DAPI 缺失时回退远程备用（`apps/api/src/store.service.ts:5117-5123`、`:5219-5233`）。「测试」会真实调用模型并写入 `AIJob`。

## PRIVACY

本页不展示任何用户 PII；测试任务使用演示用户（`controllers.ts:2532` 调用 `getDemoUserId()`）。测试内容的输入摘要会进入 `AIJob.promptSummary`，因此不要把真实用户隐私文本粘进「测试内容」。

## ERROR_STATES

`load`/`save`/`test` 的 `catch` 均把错误写入 `status`（`AIRoutesPage.vue:162`、`:182`、`:197`），且 `status` 渲染在可见的 `p.route-status` 中（:261，样式 :539）。**这是本组六个资源里唯一有可见错误状态的页面**；但错误只以一行文字呈现，且加载失败时旧列表仍留在表格中，没有清空或占位提示。

## EMPTY_STATES

- 表格零行：`<tr v-if="!routes.length"><td colspan="6" class="empty-cell">暂无可展示的风格路由，请刷新配置后重试。</td></tr>`（`AIRoutesPage.vue:366`）。
- 路由流程示意在无数据时显示「等待路由配置」（`AIRoutesPage.vue:106-107`，经 `flowProviderSummary`）。

## NATIVE_RISKS

本页是 Web 管理后台，不直接运行在小程序原生端。间接影响：路由指向未启用/本地来源会被后端拒绝（`controllers.ts:2495-2505`），因此不会把前台 AI 打到本地模型；但把两个远程来源都指向失败地址会让前台任务进入 failed 终态（`store.service.ts:5117-5123`）。

## ISSUES

- P0 / SECURITY：`GET /api/admin/v1/ai/routes` 无 token 守卫（`controllers.ts:2480`；`artifacts/product-audit/admin-unguarded.json` line 2480）。属 ISSUE-001。
- P0 / SECURITY：`PATCH /api/admin/v1/ai/routes/:style` 无 token 守卫（`controllers.ts:2514`；`admin-unguarded.json` line 2514）。该端点会改写真实路由配置并 `routeVersion + 1`（`controllers.ts:2507`），未授权即可变更 AI 选路。属 ISSUE-001。
- P1 / FAKE_BUTTON：`TablePage.vue` 的 routes 分支（「保存路由/测试生成」，`apps/admin/src/views/TablePage.vue:873-877`）永不渲染（`router.ts:110-118`）；对应 handler（`TablePage.vue:513-523`）为死代码。属 ISSUE-014。
- P1 / ORPHAN：`PUT /api/admin/v1/ai/routes/:style`（`controllers.ts:2484`）无前端调用方——`AIRoutesPage.vue` 只发 PATCH（:172），TablePage 也只发 PATCH（`TablePage.vue:516`）。属 ISSUE-014。
- P2 / FUNCTIONAL：抽屉内「主模型」「备用模型」两个 select 渲染为 `disabled`（`AIRoutesPage.vue:400`、`:408`），管理员无法从 UI 更换路由目标；`save()` 会把未改动的 provider id 原样回写（:172-176）。与后端策略一致，但控件外观暗示可编辑。
- P3 / UX：流程示意图把两步硬编码为「CLI Proxy」「DeepSeek」（`AIRoutesPage.vue:228`、`:236`），而实际来源是 DAPI（DeepSeek）与 OpenAI 备用（`apps/api/src/remote-ai-provider.service.ts:5-8`），标签与实际配置不符。

## FINAL_STATUS

PARTIAL —— 读写与测试流程真实可用且有可见错误状态，但读端点与路由写入端点都无 token 守卫（ISSUE-001），TablePage 分支不可达、PUT 端点无调用方（ISSUE-014）。

### Static evidence

- Controls discovered in component: 13
- Endpoint mapping: `apps/admin/src/views/TablePage.vue:48`（`routes: /api/admin/v1/ai/routes`）
- Route: `/ai/routes` → `AIRoutesPage.vue`（`artifacts/product-audit/admin-routes.json`）
- Unguarded endpoints: `GET ai/routes`（2480）、`PATCH ai/routes/:style`（2514）— `artifacts/product-audit/admin-unguarded.json`
- Store seed: `apps/api/src/store.service.ts:1096-1152`（五条风格路由）
