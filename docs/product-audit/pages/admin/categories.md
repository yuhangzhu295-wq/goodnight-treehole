# admin: categories (反馈分类)

Route: `/ops/feedback-categories`  
Component: `apps/admin/src/views/FeedbackCategoriesPage.vue`
Group: 知识与分类

## PURPOSE

维护前台提交反馈时可选的真实分类：新增、编辑、排序、启停与删除，并在列表里显示每个分类的关联工单数。工单数由服务端实时汇总（`apps/api/src/controllers.ts:2842-2845`），页面头部声明「工单数量会从服务端实时汇总」（`apps/admin/src/views/FeedbackCategoriesPage.vue:120`）。

## USER_JOB

运营需要让反馈分类与真实客服分工一致：新增分类、改名、调整顺序、停用不再使用的分类；并避免删除仍被工单引用的分类（前后端都做了拦截）。

## ENTRY

侧边栏「知识与分类 > 反馈分类」（`apps/admin/src/router.ts:58`、`apps/admin/src/router.ts:108`）。也可直接访问 `/ops/feedback-categories`。路由守卫要求 localStorage 中存在 admin token（`apps/admin/src/router.ts:122-125`）。

## EXIT

点击侧边栏其它菜单项或直接改 URL 离开。编辑抽屉可点「×」/遮罩/「取消」关闭（`FeedbackCategoriesPage.vue:131`），删除确认框同理（:132）。

## ROUTES

- `/ops/feedback-categories` → `FeedbackCategoriesPage.vue`，title「反馈分类」，group「知识与分类」，`viaTablePage: false`（`artifacts/product-audit/admin-routes.json`）。

## STATES

- 加载中：`busy=true`；初始 `status` 为「正在读取反馈分类…」（`FeedbackCategoriesPage.vue:19`）。
- 已加载：`status` 为「已从服务端读取 N 个反馈分类」（:23）。
- 各操作成功后写入文案，例如「反馈分类已新增并完成回读」（:41）、「反馈分类排序已保存并完成回读」（:92）。
- 失败：`catch` 把 `status` 设为 `error.message` 或「反馈分类加载失败」/「新增反馈分类失败」/「保存反馈分类失败」/「更新反馈分类失败」/「调整反馈分类排序失败」/「删除反馈分类失败」（:25、:43、:64、:77、:94、:109）。
- 校验失败：名称为空时 `status` 为「请先填写分类名称」，不发请求（:33）。
- 空数据：表格渲染「暂无反馈分类」（:127）。

## CONTROLS

| control | handler | real effect |
| --- | --- | --- |
| 分类名称 input | `v-model="name"`（`FeedbackCategoriesPage.vue:122`） | 仅本地输入 |
| 新增分类 | `add`（:122、:31-45） | POST `/api/admin/v1/feedback-categories`，body `{name}`，随后 `load()` 回读 |
| 编辑（每行） | `openEdit`（:128、:47-53） | 仅把该行填入编辑抽屉 |
| 上移 / 下移（每行） | `move`（:128、:83-98） | 与相邻项交换 `sortOrder`：对两条记录各发一次 PATCH |
| 启用/停用（每行） | `toggle`（:128、:70-81） | PATCH `/api/admin/v1/feedback-categories/:id` 传 `{enabled}` |
| 删除（每行） | `deleting = item`（:128） | 仅打开确认框；当 `ticketCount > 0` 时按钮 `disabled`，`title` 提示「仍有关联工单的分类只能停用」 |
| 保存修改（抽屉） | `saveEdit`（:131、:55-68） | PUT `/api/admin/v1/feedback-categories/:id`，写入 name/sortOrder |
| 取消（抽屉/确认框） | `editing = null` / `deleting = null`（:131、:132） | 仅关闭弹层 |
| 确认删除 | `remove`（:132、:100-111） | DELETE `/api/admin/v1/feedback-categories/:id` |

## API_READS

- `GET /api/admin/v1/feedback-categories` — handler `adminCategories`（`apps/api/src/controllers.ts:2840-2847`）。无 token 校验，属 ISSUE-001 的无守卫读端点；服务端在此处为每条分类计算 `ticketCount`（:2842-2845）。

## API_WRITES

- `POST /api/admin/v1/feedback-categories` — handler `createCategory`（`controllers.ts:2848-2859`），校验 token（:2850）。
- `PUT /api/admin/v1/feedback-categories/:id` — handler `updateCategory`（`controllers.ts:2860-2878`），校验 token（:2866）。
- `PATCH /api/admin/v1/feedback-categories/:id` — handler `patchCategory`（`controllers.ts:2880-2887`），带 auth 委托 `updateCategory`（:2886）。
- `DELETE /api/admin/v1/feedback-categories/:id` — handler `deleteCategory`（`controllers.ts:2888-2899`），校验 token（:2890），并在存在关联工单时抛 400「该分类仍有关联工单，请先停用或迁移工单」（:2893-2894）。

## DB_ENTITIES

- `FeedbackCategory`（`prisma/schema.prisma:914`）。
- `FeedbackTicket`（`prisma/schema.prisma:894`，经 `categoryId` 外键关联，是 `ticketCount` 与删除拦截的依据）。
- `AuditLog`（`prisma/schema.prisma:1057`；`FEEDBACK_CATEGORY_CREATE`/`_UPDATE`/`_DELETE`，如 `controllers.ts:2855`）。
- 持久化路径：`StoreService.persist()`（`apps/api/src/store.service.ts:1879-1893`）→ 关系型映射 `relational-runtime.mapper.ts:136`（`feedbackCategories` 写入 `feedbackCategory` 表，`relational-runtime.mapper.ts:229`、`:276`）。

## ADMIN_VISIBILITY

菜单项对所有已登录管理员可见，无角色过滤（`router.ts:31-91`、`Layout.vue:116`/`:138`）；后端只校验 token（`controllers.ts:1761-1763`、`store.service.ts:2190-2197`），`AdminRole.permissions` 未被读取。

## AI_USAGE

反馈分类不参与 AI 生成、路由或审核。除上述外 **None found.**

## PRIVACY

本页只展示分类名称与聚合工单数，不含用户 PII。注意 `ticketCount` 是跨用户的运营统计量，对任何管理员可见；这不是个人数据。除上述外 **None found.**

## ERROR_STATES

`load`/`add`/`saveEdit`/`toggle`/`move`/`remove` 的 `catch` 都写 `status`（`FeedbackCategoriesPage.vue:25`、`:43`、`:64`、`:77`、`:94`、`:109`），`status` 渲染在可见的 `.muted` 段落中（:122；`.muted` 仅设颜色，`apps/admin/src/styles.scss:289-291`）。因此错误会以一行文字显示——包括服务端对删除的 400 拒绝（`controllers.ts:2894`）。局限：失败后列表保持原样，没有重试入口或行级错误标记。

## EMPTY_STATES

- 表格零行：`<tr v-if="!sortedItems.length"><td colspan="5" class="empty-cell">暂无反馈分类</td></tr>`（`FeedbackCategoriesPage.vue:127`）。

## NATIVE_RISKS

本页是 Web 管理后台，不直接运行在小程序原生端。间接影响：前台反馈页读取启用分类（`apps/api/src/controllers.ts:1669-1673`，消费方 `apps/mp/src/views/FeedbackHelp.vue:40`）；停用全部分类后，提交反馈时服务端会退化为「无可用分类」（`apps/api/src/store.service.ts:1540-1541` 取第一个启用分类，若无则回退）。除上述外 **None found.**

## ISSUES

- P0 / SECURITY：`GET /api/admin/v1/feedback-categories` 无 token 守卫（`controllers.ts:2840`；`artifacts/product-audit/admin-unguarded.json` line 2840）。属 ISSUE-001。
- P1 / FAKE_BUTTON：`TablePage.vue` 的 categories 分支（「添加反馈分类」，`apps/admin/src/views/TablePage.vue:903-906`）永不渲染（`router.ts:110-118`）；对应 handler `addCategory`（`TablePage.vue:549-551`）为死代码。属 ISSUE-014。
- P2 / DATA：`createCategory` 用 `this.store.feedbackCategories.length + 1` 作为 `sortOrder`（`controllers.ts:2853`），删除过分类后再新增会与既有 `sortOrder` 冲突，而列表按 `sortOrder` 排序（`FeedbackCategoriesPage.vue:16`），同值行的先后顺序将不确定。
- P2 / DATA：`move` 通过两次独立 PATCH 交换 `sortOrder`（`FeedbackCategoriesPage.vue:89-90`），无事务；第二次失败会留下两条相同 `sortOrder`。
- P2 / UX：无分页控件，`load` 固定拉取 `pageSize=100`（`FeedbackCategoriesPage.vue:21`）；超过 100 条时页面静默丢弃其余记录。
- P3 / UX：删除按钮的禁用原因只写在 `title` 属性里（`FeedbackCategoriesPage.vue:128`），键盘与触屏用户无法看到「仍有关联工单的分类只能停用」这一说明。

## FINAL_STATUS

PARTIAL —— 增删改查、排序、启停都是真实可用的服务端写入，且删除有前后端双重关联工单保护，但读端点无 token 守卫（ISSUE-001），排序无事务、`sortOrder` 可能冲突、无分页，TablePage 分支不可达（ISSUE-014）。

### Static evidence

- Controls discovered in component: 17
- Endpoint mapping: `apps/admin/src/views/TablePage.vue:53`（`categories: /api/admin/v1/feedback-categories`）
- Route: `/ops/feedback-categories` → `FeedbackCategoriesPage.vue`（`artifacts/product-audit/admin-routes.json`）
- Unguarded endpoint: `GET feedback-categories`（line 2840）— `artifacts/product-audit/admin-unguarded.json`
- Store seed: `apps/api/src/store.service.ts:853-857`（cat_1、cat_2、cat_3）
- Front-end consumer: `controllers.ts:1669-1673`
