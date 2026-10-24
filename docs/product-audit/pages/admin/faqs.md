# admin: faqs (FAQ 管理)

Route: `/ops/faqs`  
Component: `apps/admin/src/views/FaqPage.vue`
Group: 知识与分类

## PURPOSE

维护前台「帮助与反馈」可见的常见问题：新增、搜索、编辑、排序、启停与删除。注释明确前台读取的就是后台 CRUD 写入的同一批记录，停用/删除的 FAQ 会在前台下次加载时消失（`apps/api/src/controllers.ts:1678-1680`）。

## USER_JOB

运营需要按真实客服口径补充/修正常见问题，控制前台展示顺序与可见性，并在改完后确认前台看到的是最新集合。

## ENTRY

侧边栏「知识与分类 > FAQ 管理」（`apps/admin/src/router.ts:57`、`apps/admin/src/router.ts:107`）。也可直接访问 `/ops/faqs`。路由守卫要求 localStorage 中存在 admin token（`apps/admin/src/router.ts:122-125`）。

## EXIT

点击侧边栏其它菜单项或直接改 URL 离开。编辑抽屉可点「×」/遮罩/「取消」关闭（`FaqPage.vue:147`），删除确认框同理（:148）。

## ROUTES

- `/ops/faqs` → `FaqPage.vue`，title「FAQ 管理」，group「知识与分类」，`viaTablePage: false`（`artifacts/product-audit/admin-routes.json`）。

## STATES

- 加载中：`busy=true`；初始 `status` 为「正在读取 FAQ…」（`FaqPage.vue:19`）。
- 已加载：`status` 为「已从服务端读取 N 条 FAQ」（:31）。
- 各操作成功后写入文案，例如「FAQ 已新增并完成回读」（:50）、「FAQ 排序已保存并完成回读」（:102）。
- 失败：`catch` 把 `status` 设为 `error.message` 或「FAQ 加载失败」/「新增 FAQ 失败」/「保存 FAQ 失败」/「更新 FAQ 失败」/「调整 FAQ 排序失败」/「删除 FAQ 失败」（:33、:52、:74、:87、:104、:119）。
- 校验失败：问题或答案为空时 `status` 为「请完整填写问题和答案」，不发请求（:41）。
- 空数据 / 无搜索结果：表格渲染「没有匹配的 FAQ」（:143）。

## CONTROLS

| control | handler | real effect |
| --- | --- | --- |
| 搜索 FAQ input | `v-model="query"`（`FaqPage.vue:133`） | 纯本地过滤 `visibleItems`，匹配 question+answer（:23-26） |
| 问题 input | `v-model="question"`（:134） | 仅本地输入 |
| 答案 input | `v-model="answer"`（:135） | 仅本地输入 |
| 新增 FAQ | `add`（:136、:39-54） | POST `/api/admin/v1/faqs`，body `{question, answer}`，随后 `load()` 回读 |
| 编辑（每行） | `openEdit`（:144、:56-63） | 仅把该行填入编辑抽屉 |
| 上移 / 下移（每行） | `move`（:144、:93-108） | 与相邻项交换 `sortOrder`：对两条记录各发一次 PATCH |
| 启用/停用（每行） | `toggle`（:144、:80-91） | PATCH `/api/admin/v1/faqs/:id` 传 `{enabled}` |
| 删除（每行） | `deleting = item`（:144） | 仅打开确认框 |
| 保存修改（抽屉） | `saveEdit`（:147、:65-78） | PUT `/api/admin/v1/faqs/:id`，写入 question/answer/sortOrder |
| 取消（抽屉/确认框） | `editing = null` / `deleting = null`（:147、:148） | 仅关闭弹层 |
| 确认删除 | `remove`（:148、:110-121） | DELETE `/api/admin/v1/faqs/:id` |

## API_READS

- `GET /api/admin/v1/faqs` — handler `adminFaqs`（`apps/api/src/controllers.ts:2713-2716`）。无 token 校验，属 ISSUE-001 的无守卫读端点。

## API_WRITES

- `POST /api/admin/v1/faqs` — handler `createFaq`（`controllers.ts:2717-2736`），校验 token（:2719）。
- `PUT /api/admin/v1/faqs/:id` — handler `updateFaq`（`controllers.ts:2737-2757`），校验 token（:2743）。
- `PATCH /api/admin/v1/faqs/:id` — handler `patchFaq`（`controllers.ts:2759-2766`），自身不接收 authorization 头，经 `updateFaq` 校验（:2743）；无 token 时应返回 401（`store.service.ts:2190-2192`）。
- `DELETE /api/admin/v1/faqs/:id` — handler `deleteFaq`（`controllers.ts:2767-2776`），校验 token（:2769）。

## DB_ENTITIES

- `FaqItem`（`prisma/schema.prisma:922`）。
- `AuditLog`（`prisma/schema.prisma:1057`；`FAQ_CREATE`/`FAQ_UPDATE`/`FAQ_DELETE`，如 `controllers.ts:2732`）。
- 持久化路径：`StoreService.persist()`（`apps/api/src/store.service.ts:1879-1893`）→ 关系型映射 `relational-runtime.mapper.ts:136`（`faqs` 写入 `faqItem` 表，`relational-runtime.mapper.ts:230`、`:277`）。

## ADMIN_VISIBILITY

菜单项对所有已登录管理员可见，无角色过滤（`router.ts:31-91`、`Layout.vue:116`/`:138`）；后端只校验 token（`controllers.ts:1761-1763`、`store.service.ts:2190-2197`），`AdminRole.permissions` 未被读取。

## AI_USAGE

FAQ 不参与 AI 生成或路由；它只服务前台帮助页展示。除上述外 **None found.**

## PRIVACY

本页维护的是面向公众的帮助文案，不含用户 PII，列表也不展示用户字段。除上述外 **None found.**

## ERROR_STATES

`load`/`add`/`saveEdit`/`toggle`/`move`/`remove` 的 `catch` 都写 `status`（`FaqPage.vue:33`、`:52`、`:74`、`:87`、`:104`、`:119`），`status` 渲染在可见的 `.muted` 段落中（:137；`.muted` 仅设颜色，`apps/admin/src/styles.scss:289-291`）。因此错误会以一行文字显示。局限：失败后列表保持原样，没有重试入口或行级错误标记。

## EMPTY_STATES

- 零行与「搜索无结果」共用同一条空态：`<tr v-if="!visibleItems.length"><td colspan="5" class="empty-cell">没有匹配的 FAQ</td></tr>`（`FaqPage.vue:143`）。完全无数据时也显示「没有匹配的 FAQ」，文案与「搜索无结果」不区分——这是发现项。

## NATIVE_RISKS

本页是 Web 管理后台，不直接运行在小程序原生端。间接影响：停用或删除 FAQ 会立即改变小程序帮助页与反馈页的展示（`apps/mp/src/views/HelpFaqs.vue:16`、`apps/mp/src/views/FeedbackHelp.vue:39`）。除上述外 **None found.**

## ISSUES

- P0 / SECURITY：`GET /api/admin/v1/faqs` 无 token 守卫（`controllers.ts:2713`；`artifacts/product-audit/admin-unguarded.json` line 2713）。属 ISSUE-001。
- P1 / FAKE_BUTTON：`TablePage.vue` 的 faqs 分支（「添加 FAQ」，`apps/admin/src/views/TablePage.vue:895-898`）永不渲染（`router.ts:110-118`）；对应 handler `addFaq`（`TablePage.vue:541-543`）为死代码。属 ISSUE-014。
- P2 / DATA：`createFaq` 用 `this.store.faqs.length + 1` 作为 `sortOrder`（`controllers.ts:2727`），删除过记录后再新增会与既有 `sortOrder` 冲突，而列表按 `sortOrder` 排序（`FaqPage.vue:22`），同值行的先后顺序将不确定。
- P2 / DATA：`move` 通过两次独立 PATCH 交换 `sortOrder`（`FaqPage.vue:99-100`），无事务；第二次失败会留下两条相同 `sortOrder`。
- P2 / UX：无分页控件，`load` 固定拉取 `pageSize=100`（`FaqPage.vue:29`）；超过 100 条时页面静默丢弃其余记录。
- P3 / UX：空态文案不区分「没有任何 FAQ」与「搜索无匹配」（`FaqPage.vue:143`）。

## FINAL_STATUS

PARTIAL —— 增删改查、排序与启停都是真实可用的服务端写入，且前台确认消费同一批记录，但读端点无 token 守卫（ISSUE-001），排序无事务、`sortOrder` 可能冲突、无分页，TablePage 分支不可达（ISSUE-014）。

### Static evidence

- Controls discovered in component: 18
- Endpoint mapping: `apps/admin/src/views/TablePage.vue:51`（`faqs: /api/admin/v1/faqs`）
- Route: `/ops/faqs` → `FaqPage.vue`（`artifacts/product-audit/admin-routes.json`）
- Unguarded endpoint: `GET faqs`（line 2713）— `artifacts/product-audit/admin-unguarded.json`
- Store seed: `apps/api/src/store.service.ts:858-875`（faq_1、faq_2）
- Front-end consumer: `controllers.ts:1676-1687`
- Contract test: `tests/api/api.spec.ts:45-60`（前台读取后台新建的 FAQ）
