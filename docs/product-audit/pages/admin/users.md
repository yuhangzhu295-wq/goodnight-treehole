# admin: users (用户管理)

Route: `/users`
Component: `apps/admin/src/views/UsersPage.vue`
Group: 内容运营

## PURPOSE

The operator's account surface: list users with their activity counts, filter by status, open a per-user drawer, and ban / mute / restore an account or leave an internal operations note. It also carries the 导出用户 button. Dedicated view, not `TablePage.vue` (`apps/admin/src/router.ts:104`).

## USER_JOB

"Find an account by nickname or anonymous code, see how much it has posted, and restrict it if it is abusive."

## ENTRY

- Sidebar `data-testid=admin-nav-users` (`apps/admin/src/views/Layout.vue:67`), in `primaryPaths` (`Layout.vue:26-36`).
- No other route pushes to `/users`.

## EXIT

No explicit exit. Row actions call `mutate()` which reloads in place (`UsersPage.vue:72-84`). The drawer is closed by its × or by clicking the mask, and at ≥1400px the mask is a sticky in-flow column rather than an overlay, so "closing" it removes the detail column and returns the table to full width (`UsersPage.vue:160-169`, `:304-371`).

## ROUTES

`/users` — `artifacts/product-audit/admin-routes.json` entry `{ path: "/users", component: "UsersPage.vue", title: "用户管理", resource: "users", viaTablePage: false, group: "内容运营" }`; declared `apps/admin/src/router.ts:104`. No aliases, no query parameters.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| busy / `aria-busy` on table | `busy` | `UsersPage.vue:14`, `:145` |
| status line (**CSS-hidden**) | `status` (ref 正在读取用户数据…) | `UsersPage.vue:13`, `:133`, `:243-245` |
| search | `search` | `UsersPage.vue:8`, `:129` |
| status filter | `filter` | `UsersPage.vue:9`, `:130` |
| metric row (4 cards) | `total`, `normalCount`, `restrictedCount`, `bannedCount` | `UsersPage.vue:26-28`, `:136-141` |
| detail drawer | `detailOpen` + `selected` | `UsersPage.vue:11`, `:160` |
| note textarea | `note` | `UsersPage.vue:12`, `:165` |
| confirmation panel | `confirmation` | `UsersPage.vue:15`, `:166` |
| wide-workspace layout (≥1400px) | `isWideWorkspace` | `UsersPage.vue:18-23`, `:160-161` |

The three "current page" metrics (`normalCount` / `restrictedCount` / `bannedCount`) are computed from the loaded `items` array (`UsersPage.vue:26-28`), which is always requested with `pageSize=100` (`UsersPage.vue:45`), so they are accurate only while the user table has ≤100 rows.

## CONTROLS

| control | handler | real effect |
| --- | --- | --- |
| 搜索用户 `data-testid=admin-user-search` | `v-model=search` (`UsersPage.vue:129`) | `watch` (`:113`) re-issues `GET /users` with `q=` (`:46`) |
| 用户状态 select `data-testid=admin-user-status-filter` | `v-model=filter` (`:130`) | adds `status=` when not `all` (`:47`) |
| 刷新列表 `data-testid=admin-user-refresh` | `load` (`:131`) | re-issues the three-request `Promise.all` |
| 导出用户 `data-testid=admin-user-export` | `exportUsers` (`:132`) | `GET /api/admin/v1/users/export`; **see ISSUE-002 below** |
| row click / 查看详情 | `openDetail(user)` (`:148`, `:153`) | opens the drawer, seeds `note` from `user.note ?? ''` (`:66-70`) |
| drawer × | `detailOpen = false` (`:162`) | closes |
| 保存备注 `data-testid=admin-user-note` | `saveNote` (`:165`) | `POST /users/:id/note {note, tags:['运营关注']}` (`:98`) |
| 封禁用户 `data-testid=admin-user-ban` | `requestStatus('banned')` (`:165`) | opens the confirmation panel (`:90-93`) |
| 确认封禁 `data-testid=admin-confirm-action` | `confirmation.run()` (`:166`) | `PATCH /users/:id/status {status:'banned'}` (`:89`) |
| 取消 | `confirmation = null` (`:166`) | dismisses |
| 更多操作 `data-testid=admin-user-more` (`<details>`) | native disclosure (`:165`) | reveals the next two |
| 禁言 `data-testid=admin-user-mute` | `requestStatus('limited')` (`:165`) | direct `PATCH /users/:id/status {status:'limited'}`, no confirmation |
| 恢复正常 `data-testid=admin-user-restore` | `requestStatus('normal')` (`:165`) | direct `PATCH /users/:id/status {status:'normal'}` |

`artifacts/product-audit/control-manifest.json` lists 27 entries for `UsersPage.vue` (three of them are `data-testid` markers repeated across media queries).

## API_READS

| endpoint | call site | handler |
| --- | --- | --- |
| `GET /api/admin/v1/users?page=1&pageSize=100&q&status` | `UsersPage.vue:49` | `AdminController.users` — `apps/api/src/controllers.ts:2085-2101` (query/status filter `:2092-2099`) |
| `GET /api/admin/v1/posts?page=1&pageSize=100` | `UsersPage.vue:50` | `AdminController.adminPosts` — `controllers.ts:2167` (only to build `postCountByUser`, `:53`) |
| `GET /api/admin/v1/replies?page=1&pageSize=100` | `UsersPage.vue:51` | `AdminController.adminReplies` — `controllers.ts:2304` (only for `replyCountByUser`, `:54`) |

All three fire in one `Promise.all` (`UsersPage.vue:48-52`). The per-user activity counts are therefore computed client-side from the first 100 posts and first 100 replies only — they are not the real totals.

## API_WRITES

| endpoint | call site | handler |
| --- | --- | --- |
| `PATCH /api/admin/v1/users/:id/status` `{status}` | `UsersPage.vue:89` | `userStatus` — `apps/api/src/controllers.ts:2106-2120`; maps `muted`→`limited` and `deleted`→`banned` (`:2115`), writes `AuditLog` `USER_STATUS` (`:2116`), persists and flushes |
| `POST /api/admin/v1/users/:id/note` `{note, tags}` | `UsersPage.vue:98` | `userNote` — `controllers.ts:2122-2136`; writes `AuditLog` `USER_NOTE` and returns `{item:{id,note,tags,updatedAt}}` |
| `GET /api/admin/v1/users/export` | `UsersPage.vue:104` | `exportUsers` — `controllers.ts:2138-2147`; **broken, see ISSUE-002** |

`userNote` is an **audit-log-only write**: it never assigns `note` onto the `User` record (there is no `note` field on `model User`, `prisma/schema.prisma:136-182`, and `grep` finds no `user.note` assignment anywhere in `apps/api/src`). The UI then reads the note back from the list payload (`UsersPage.vue:68`), which never carries it, so **a saved note is never displayed again after a reload**. The only durable trace is the `AuditLog` row.

## DB_ENTITIES

- Read: **User**, **Post**, **Reply**.
- Written: **User** (`status`), **AuditLog** (`USER_STATUS`, `USER_NOTE`), **AdminUser** (guard resolution).

Schema: `User.status UserStatus @default(normal)` `prisma/schema.prisma:142`, `enum UserStatus {normal, limited, banned, deleted}` `:10-15`, `AuditLog` `:1057-1072`. Matches the agent-4 table (AdminUser, AuditLog, User).

## ADMIN_VISIBILITY

This page is the admin surface for users. `GET /users` (`controllers.ts:2085`) is **unguarded** and the live proof for `ISSUE-001` returns the full user list with no token. `PATCH /users/:id/status` ``(:2106) is one of the two endpoints that correctly answer `401`; `POST /users/:id/note` is guarded too. The erasure endpoint `DELETE /users/:id/data` (`:2158`) is unguarded and was proven live to return `200` — and no control on this page calls it.

## AI_USAGE

None. No `AIJob` is created or read, and no AI-generated field is displayed. The page is purely account administration.

## PRIVACY

- The list shows `nickname`, `anonymousCode` and the raw `id` (`UsersPage.vue:149`); the drawer adds `openid` only in the `TablePage` variant, not here.
- The 运营备注 textarea is explicitly labelled 仅供管理员内部协作使用 (`UsersPage.vue:165`), and the note content is copied verbatim into `AuditLog.afterJson` (`controllers.ts:2132-2133`), so internal notes about a user are stored in the audit trail.
- `GET /users` being unguarded means nicknames, anonymous codes and statuses are readable by anyone who can reach the API.

## ERROR_STATES

Code exists but is **invisible**. `load()` catches and writes `error?.message ?? '用户数据加载失败'` into `status` (`UsersPage.vue:59-60`); `mutate()` does the same (`:79-80`); `exportUsers()` likewise (`:106-107`). The only render site is `<p class="muted users-status" role="status">` (`:133`), and `.users-status { display: none; }` (`UsersPage.vue:243-245`) removes it from the layout at every width. The metric cards and the table simply keep their previous values. This is a finding.

## EMPTY_STATES

Yes: `<tr v-if="!items.length"><td colspan="5" class="empty-cell">暂无符合条件的用户</td></tr>` (`UsersPage.vue:155`). The four metric cards above it keep the values from the last successful load, and 用户总数 is `total` (`:137`) which the catch block never resets, so a failed reload leaves a stale non-zero count above an empty table.

## NATIVE_RISKS

None. Desktop console: no safe-area insets, no Android back-button handling, no keyboard/dial/clipboard. The `matchMedia` listener is registered in `onMounted` and removed in `onBeforeUnmount` (`UsersPage.vue:114-121`).

## ISSUES

- **P1 FAKE_FUNCTION (ISSUE-002)** — 导出用户 always claims success and produces nothing. `GET /api/admin/v1/users/export` returns `200` with body `{}` because `@Get('users/export')` (`controllers.ts:2138`) is declared *after* `@Get('users/:id')` (`controllers.ts:2102`), so Nest matches `id='export'` and returns `{item: undefined}`. `UsersPage.vue:105` then falls back to the bare string 导出文件已生成. Even if the route were reached, the handler fabricates `downloadUrl: /exports/users-<ts>.json` (`controllers.ts:2143`) and no code writes or serves that path (the only export route is `GET /api/v1/exports/:assetId/download`, `controllers.ts:1398`).
- **P1 SECURITY (ISSUE-001)** — `GET /api/admin/v1/users` has no token guard; the live proof returns the full user list unauthenticated. `DELETE /api/admin/v1/users/:id/data` is unguarded too and returned `200` while really removing the user's favorites, diaries and letters (`controllers.ts:2158-2165`).
- **P2 DATA** — 保存备注 appears to succeed but is never read back. `userNote` only writes an `AuditLog` row (`controllers.ts:2132-2135`) and the UI reads `user.note` from a payload that has no such field (`UsersPage.vue:68`), so the note vanishes on reload.
- **P2 DATA** — the per-user 树洞/回应 counts are computed client-side from the first 100 posts and replies (`UsersPage.vue:53-54`), so any user beyond that window shows `0 条树洞 · 0 条回应`.
- **P2 UX** — no visible error state: all three error paths write to a `display: none` element (`UsersPage.vue:243-245`).
- **P3 UX** — 用户总数 is not reset on failure and the metric cards are not recomputed from the filter, so the page can show "100 users" above "no matching users".
- **P3 DUPLICATE** — `GET /users/:id` (`controllers.ts:2102`), `PATCH/POST /users/:id/tags` (`:2148`, `:2153`) and `DELETE /users/:id/data` (`:2158`) have no caller in the admin UI (`ISSUE-014`); the tags pair is additionally an inert stub that returns the posted tags without persisting (`controllers.ts:2149-2156`).

## FINAL_STATUS

PARTIAL — ban / mute / restore and the note write all reach real, guarded handlers and really mutate `User.status`, but the export button is a confirmed fake, the note is write-only, the activity counts are windowed and the error channel is invisible.

### Static evidence

- Controls discovered in component: 27
- API reads (static): `GET /api/admin/v1/users`, `GET /api/admin/v1/posts`, `GET /api/admin/v1/replies`
- API writes (static): `PATCH /api/admin/v1/users/:param/status`, `POST /api/admin/v1/users/:param/note`, `GET /api/admin/v1/users/export`
- Candidate fake markers in `artifacts/product-audit/fake-markers.json` for `UsersPage.vue`: 2 (placeholders at 129 and 165), both NOT_FAKE; the *same file* carries the P1 export fake, adjudicated in `docs/product-audit/discovery-agent5-fake-candidates.md` row A03.
- Appended: the export fake is runtime-confirmed — `GET /api/admin/v1/users/export` returns `{} ` (2 bytes) with HTTP 200 both with and without a valid admin token, while `/users/user_demo` returns the real record.
