# admin: presets (回复预设)

Route: `/ops/reply-presets`  
Component: `apps/admin/src/views/ReplyPresetsPage.vue`
Group: AI 管理

## PURPOSE

维护前台可复用的真人回应文案：新增、编辑、排序、启停与删除回复预设，区分「陪伴安慰 / 行动支持」两种场景。所有操作都会写入服务端并回读（`apps/admin/src/views/ReplyPresetsPage.vue:128`）。

## USER_JOB

运营需要沉淀一组可一键引用的回应文案，并能调整顺序、临时停用某条、或删除过时文案；同时确认前台展示的是最新启用集合。

## ENTRY

侧边栏「AI 管理 > 回复预设」（`apps/admin/src/router.ts:51`、`apps/admin/src/router.ts:106`）。也可直接访问 `/ops/reply-presets`。路由守卫要求 localStorage 中存在 admin token（`apps/admin/src/router.ts:122-125`）。

## EXIT

点击侧边栏其它菜单项或直接改 URL 离开。编辑抽屉可点「×」/遮罩/「取消」关闭（`ReplyPresetsPage.vue:147`），删除确认框同理（:148）。

## ROUTES

- `/ops/reply-presets` → `ReplyPresetsPage.vue`，title「回复预设」，group「AI 管理」，`viaTablePage: false`（`artifacts/product-audit/admin-routes.json`）。

## STATES

- 加载中：`busy=true`；初始 `status` 为「正在读取回复预设…」（`ReplyPresetsPage.vue:19`）。
- 已加载：`status` 为「已从服务端读取 N 条回复预设」（:27）。
- 各操作成功后写入对应文案，例如「回复预设已新增并完成回读」（:45）、「回复预设排序已保存并完成回读」（:97）。
- 失败：`catch` 把 `status` 设为 `error.message` 或「回复预设加载失败」/「新增回复预设失败」/「保存回复预设失败」/「更新回复预设失败」/「调整排序失败」/「删除回复预设失败」（:29、:47、:69、:82、:99、:114）。
- 校验失败：内容为空时 `status` 为「请先填写预设内容」，不发请求（:37）。
- 空数据：表格渲染「暂无回复预设」（:143）。

## CONTROLS

| control | handler | real effect |
| --- | --- | --- |
| 预设内容 input | `v-model="text"`（`ReplyPresetsPage.vue:130`） | 仅本地输入 |
| 使用场景 select | `v-model="scene"`（:131） | 仅本地输入，选项 `comfort`/`support` |
| 新增预设 | `add`（:132、:35-49） | POST `/api/admin/v1/reply-presets`，body `{text, scene}`，随后 `load()` 回读 |
| 编辑（每行） | `openEdit`（:144、:50-55） | 仅把该行填入编辑抽屉 |
| 上移 / 下移（每行） | `move`（:144、:88-103） | 与相邻项交换 `sortOrder`：对两条记录各发一次 PATCH |
| 启用/停用（每行） | `toggle`（:144、:75-86） | PATCH `/api/admin/v1/reply-presets/:id` 传 `{enabled}` |
| 删除（每行） | `deleting = item`（:144） | 仅打开确认框 |
| 保存修改（抽屉） | `saveEdit`（:147、:60-73） | PUT `/api/admin/v1/reply-presets/:id`，写入 text/scene/sortOrder |
| 取消（抽屉/确认框） | `editing = null` / `deleting = null`（:147、:148） | 仅关闭弹层 |
| 确认删除 | `remove`（:148、:105-116） | DELETE `/api/admin/v1/reply-presets/:id` |

## API_READS

- `GET /api/admin/v1/reply-presets` — handler `adminPresets`（`apps/api/src/controllers.ts:2778-2781`）。无 token 校验，属 ISSUE-001 的无守卫读端点。

## API_WRITES

- `POST /api/admin/v1/reply-presets` — handler `createPreset`（`controllers.ts:2782-2800`），校验 token（:2784）。
- `PUT /api/admin/v1/reply-presets/:id` — handler `updatePreset`（`controllers.ts:2801-2819`），校验 token（:2807）。
- `PATCH /api/admin/v1/reply-presets/:id` — handler `patchPreset`（`controllers.ts:2821-2828`），带 auth 委托 `updatePreset`（:2827）。
- `DELETE /api/admin/v1/reply-presets/:id` — handler `deletePreset`（`controllers.ts:2829-2838`），校验 token（:2831）。

## DB_ENTITIES

- `ReplyPreset`（`prisma/schema.prisma:932`）。
- `AuditLog`（`prisma/schema.prisma:1057`；`REPLY_PRESET_CREATE`/`_UPDATE`/`_DELETE`，如 `controllers.ts:2796`）。
- 持久化路径：`StoreService.persist()`（`apps/api/src/store.service.ts:1879-1893`）→ 关系型映射 `relational-runtime.mapper.ts:136`（`replyPresets` 写入 `replyPreset` 表，`relational-runtime.mapper.ts:231`、`:278`）。

## ADMIN_VISIBILITY

菜单项对所有已登录管理员可见，无角色过滤（`router.ts:31-91`、`Layout.vue:116`/`:138`）；后端只校验 token（`controllers.ts:1761-1763`、`store.service.ts:2190-2197`），`AdminRole.permissions` 未被读取。

## AI_USAGE

预设本身不触发 AI 调用；它们是真人回应场景下的快捷文案，供前台引用（`apps/mp/src/views/PostDetail.vue:74`、`apps/mp/src/views/Square.vue:72` 调 `GET /api/v1/reply-presets`）。注意服务端会把 5 条硬编码文案与启用的预设合并去重（`apps/api/src/controllers.ts:956-970`）。

## PRIVACY

本页维护的是运营文案，不含用户 PII；列表不展示任何用户字段。除上述外 **None found.**

## ERROR_STATES

`load`/`add`/`saveEdit`/`toggle`/`move`/`remove` 的 `catch` 都写 `status`（`ReplyPresetsPage.vue:29`、`:47`、`:69`、`:82`、`:99`、`:114`），`status` 渲染在可见的 `.muted` 段落中（:133；`.muted` 仅设颜色，`apps/admin/src/styles.scss:289-291`）。因此错误会以一行文字显示。局限：失败后列表保持原样，没有重试入口或行级错误标记。

## EMPTY_STATES

- 表格零行：`<tr v-if="!sortedItems.length"><td colspan="5" class="empty-cell">暂无回复预设</td></tr>`（`ReplyPresetsPage.vue:143`）。

## NATIVE_RISKS

本页是 Web 管理后台，不直接运行在小程序原生端。间接影响：删除或停用预设会改变前台「常用回应」的候选项（`apps/api/src/controllers.ts:965`）。除上述外 **None found.**

## ISSUES

- P0 / SECURITY：`GET /api/admin/v1/reply-presets` 无 token 守卫（`controllers.ts:2778`；`artifacts/product-audit/admin-unguarded.json` line 2778）。属 ISSUE-001。
- P1 / FAKE_BUTTON：`TablePage.vue` 的 presets 分支（「添加回复预设」，`apps/admin/src/views/TablePage.vue:899-902`）永不渲染（`router.ts:110-118`）；对应 handler `addPreset`（`TablePage.vue:545-547`）为死代码。属 ISSUE-014。
- P2 / DATA：`move` 通过两次独立 PATCH 交换 `sortOrder`（`ReplyPresetsPage.vue:94-95`），无事务；第二次失败会留下两条相同 `sortOrder`，而列表按 `sortOrder` 排序（:20），顺序将不确定。
- P2 / UX：无分页控件，`load` 固定拉取 `pageSize=100`（`ReplyPresetsPage.vue:25`）；超过 100 条时页面静默丢弃其余记录。
- P3 / DUPLICATE：服务端把 5 条硬编码文案与启用的预设合并去重后返回（`controllers.ts:956-970`），后台无法编辑或删除这 5 条固定文案，也无法在后台看到它们，管理员会误以为「前台只有我配的几条」。

## FINAL_STATUS

PARTIAL —— 增删改查、排序与启停都是真实可用的服务端写入，但读端点无 token 守卫（ISSUE-001），排序无事务、无分页，且 TablePage 分支不可达（ISSUE-014）。

### Static evidence

- Controls discovered in component: 17
- Endpoint mapping: `apps/admin/src/views/TablePage.vue:52`（`presets: /api/admin/v1/reply-presets`）
- Route: `/ops/reply-presets` → `ReplyPresetsPage.vue`（`artifacts/product-audit/admin-routes.json`）
- Unguarded endpoint: `GET reply-presets`（line 2778）— `artifacts/product-audit/admin-unguarded.json`
- Store seed: `apps/api/src/store.service.ts:876-879`（preset_1、preset_2）
- Front-end consumer: `apps/api/src/controllers.ts:954-971`
