# admin: tickets (反馈工单)

Route: `/ops/feedback`
Component: `apps/admin/src/views/FeedbackTicketsPage.vue`
Group: 内容运营

## PURPOSE

The feedback worklist. It lists user feedback tickets with their category, source page, priority and status, opens a two-panel detail that shows the problem description plus any screenshots, and lets the operator reply to the user and move the ticket through the open → processing → resolved → closed state machine. Dedicated view, not `TablePage.vue` (`apps/admin/src/router.ts:105`).

## USER_JOB

"Read what a user reported, see their screenshot, answer them, and close it out."

## ENTRY

- Sidebar `data-testid=admin-nav-feedback` (`apps/admin/src/views/Layout.vue:73`), in `primaryPaths` (`Layout.vue:26-36`).
- Dashboard 快捷操作 → 处理反馈 `router.push('/ops/feedback')` (`apps/admin/src/views/Dashboard.vue:212`).
- The topbar global search always redirects to `/posts`, so it is not an entry here (`Layout.vue:81-85`).

## EXIT

No exit control; the operator leaves via the sidebar. Every action reloads the list in place (`mutate` → `load()`, `FeedbackTicketsPage.vue:127-133`).

## ROUTES

`/ops/feedback` — `artifacts/product-audit/admin-routes.json` entry `{ path: "/ops/feedback", component: "FeedbackTicketsPage.vue", title: "反馈工单", resource: "tickets", viaTablePage: false, group: "内容运营" }`; declared `apps/admin/src/router.ts:105`. No aliases, no dynamic segments, no query parameters.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| busy / `aria-busy` on table | `busy` | `FeedbackTicketsPage.vue:22`, `:165` |
| status line (**CSS-hidden at ≥1200px**) | `status` (ref 正在读取反馈工单…) | `FeedbackTicketsPage.vue:21`, `:163`, `:244` |
| status filter | `filter` | `FeedbackTicketsPage.vue:13`, `:160` |
| source-page filter (client-side) | `sourceFilter` | `FeedbackTicketsPage.vue:14`, `:161` |
| search | `search` | `FeedbackTicketsPage.vue:12`, `:162` |
| page (client-side slice of 5) | `currentPage` / `totalPages` | `FeedbackTicketsPage.vue:15-16`, `:53-54`, `:165` |
| four metric cards | `openCount` / `todayCount` / `highPriorityCount` / `resolvedCount` | `FeedbackTicketsPage.vue:45-48`, `:158` |
| detail drawer (two columns ≥1448px) | `detailOpen` + `selected` | `FeedbackTicketsPage.vue:20`, `:166` |
| reply textarea | `reply` | `FeedbackTicketsPage.vue:18`, `:166` |
| preset picker | `selectedPreset` | `FeedbackTicketsPage.vue:19`, `:166` |
| confirmation panel | `confirmation` | `FeedbackTicketsPage.vue:23`, `:166` |

## CONTROLS

| control | handler | real effect |
| --- | --- | --- |
| 处理待办工单 (page intro) | `filter = 'open'` (`FeedbackTicketsPage.vue:157`) | sets the status filter; the `watch` at `:142` resets to page 1 and reloads |
| 状态 select | `v-model=filter` (`:160`) | adds `status=` to both list and summary requests (`:98`, `:104`) |
| 来源 select | `v-model=sourceFilter` (`:161`) | **client-side only** — filters `filteredItems` via `sourceValue()` (`:50-52`, `:72-79`); no request |
| 搜索 `data-testid=admin-feedback-search` | `v-model=search` (`:162`) | adds `q=` (`:97`) |
| ↻ refresh (`aria-label=刷新列表`) | `load` (`:163`) | re-issues all five requests |
| row click / 查看 | `openDetail(ticket)` (`:165`) | opens the drawer, seeds `reply` from `ticket.reply` (`:118`) |
| row 回复 | `openReply(ticket)` (`:165`) | identical to `openDetail` (`:124`) — it does **not** focus the textarea |
| row 标记已解决 | `resolveTicket(ticket)` (`:165`) | opens the drawer then immediately `setStatus('resolved')` (`:125`) — fires a write with no reply typed |
| pagination ‹ / n / › | `goToPage` (`:165`) | changes the client-side page slice; no request |
| drawer × / mask click | `detailOpen = false` (`:166`) | closes |
| 插入常用回复 select | `applyPreset` (`:166`) | copies `preset.text` into `reply` and clears the picker (`:119-123`); presets come from `GET /reply-presets` (`:103`) |
| 标记已解决 `data-testid=admin-ticket-resolve` | `setStatus('resolved')` (`:166`) | `PATCH /feedback/:id/status {status:'resolved'}`; disabled when already resolved |
| 提交回复 `data-testid=admin-ticket-reply` | `replyTicket` (`:166`) | `POST /feedback/:id/reply {reply}`; defaults to 管理员已处理你的反馈。 when empty (`:134`) |
| 更多操作 (`<details>`) | native disclosure (`:166`) | reveals the next two |
| 标记处理中 `data-testid=admin-ticket-processing` | `setStatus('processing')` (`:166`) | `PATCH /feedback/:id/status {status:'processing'}` |
| 关闭工单 `data-testid=admin-ticket-close` | `setStatus('closed')` (`:166`) | confirmation (`:138`) → `PATCH /feedback/:id/status {status:'closed'}` |
| 确认关闭 / 取消 | `confirmation.run()` / `null` (`:166`) | runs or cancels |
| screenshot thumbnails | `<a target=_blank>` (`:166`) | opens the media URL |

`artifacts/product-audit/control-manifest.json` lists 26 entries for `FeedbackTicketsPage.vue`.

## API_READS

| endpoint | call site | handler |
| --- | --- | --- |
| `GET /api/admin/v1/feedback?page=1&pageSize=100&q&status` | `FeedbackTicketsPage.vue:100` | `AdminController.feedbackAlias` — `apps/api/src/controllers.ts:2644-2652` → `tickets` (`:2579-2601`), which decorates each ticket (`:2597`) |
| `GET /api/admin/v1/users?page=1&pageSize=100` | `FeedbackTicketsPage.vue:101` | `AdminController.users` — `controllers.ts:2085` (for the 用户 column, `:32-36`) |
| `GET /api/admin/v1/feedback-categories?page=1&pageSize=100` | `FeedbackTicketsPage.vue:102` | `AdminController.adminCategories` — `controllers.ts:2840` (for 问题类型, `:37`) |
| `GET /api/admin/v1/reply-presets?page=1&pageSize=100` | `FeedbackTicketsPage.vue:103` | `AdminController.adminPresets` — `controllers.ts:2778` (for the preset picker, `:109`) |
| `GET /api/admin/v1/feedback/summary?page=1&pageSize=100&q&status` | `FeedbackTicketsPage.vue:104` | `AdminController.feedbackSummary` — `controllers.ts:2603-2642` |

All five fire in one `Promise.all` (`FeedbackTicketsPage.vue:99-105`). The summary handler prefers a persisted snapshot: when no `q`/filter is set it reads `systemSettings.feedbackTicketMetrics.value` and returns `source: 'persisted-snapshot'`, otherwise live counts (`controllers.ts:2625-2640`). The UI ignores the `source` field, so an operator cannot tell whether the four cards are live numbers or a stored fixture.

## API_WRITES

| endpoint | call site | handler |
| --- | --- | --- |
| `POST /api/admin/v1/feedback/:id/reply` `{reply}` | `FeedbackTicketsPage.vue:134` | `feedbackReplyPostAlias` — `controllers.ts:2679-2686` → `ticketReply` (`:2663-2668`) → `store.replyToFeedbackTicket` (`store.service.ts:1576-1592`) |
| `PATCH /api/admin/v1/feedback/:id/status` `{status}` | `FeedbackTicketsPage.vue:137` | `feedbackStatusAlias` — `controllers.ts:2699-2706` → `ticketStatus` (`:2688-2697`) → `store.updateFeedbackTicketStatus` (`store.service.ts:1594-1620`) |

The state machine is real and enforced server-side (`store.service.ts:1602-1613`): `open→{processing,closed}`, `processing→{resolved,closed}`, `resolved→{processing,closed}`, `closed→{}`; a reply longer than 1000 chars or an empty reply throws `BadRequestException` (`:1579-1580`); a closed ticket cannot be replied to (`:1581`); and resolving without a reply throws 请先回复用户，再将工单标记为已解决 (`:1611-1612`). `replyToFeedbackTicket` also auto-advances `open→processing` on reply (`:1588`) and writes `AuditLog` `FEEDBACK_REPLY`/`FEEDBACK_STATUS`.

## DB_ENTITIES

- Read: **FeedbackTicket**, **User**, **FeedbackCategory**, **ReplyPreset**, **MediaAsset** (screenshots, resolved in `decorateFeedbackTicket`, `store.service.ts:1510-1525`), **SystemSetting** (`feedbackTicketMetrics`).
- Written: **FeedbackTicket** (`reply`, `repliedBy`, `repliedAt`, `status`), **AuditLog**, **AdminUser** (guard).

Schema: `FeedbackTicket` `prisma/schema.prisma:894-912` (`status FeedbackStatus`, `priority`, `screenshots Json`, `reply`, `repliedBy`, `repliedAt`), `enum FeedbackStatus` `:75-81`, `FeedbackCategory` `:914-920`, `ReplyPreset` `:932-940`. Matches the agent-4 table (AdminUser, AuditLog, FeedbackTicket, SystemSetting).

## ADMIN_VISIBILITY

This page is the admin surface for feedback. Every endpoint it uses is **unguarded**: `GET /feedback` (`controllers.ts:2644`), `GET /feedback/summary` (`:2603`), `POST /feedback/:id/reply` (`:2679`), `PATCH /feedback/:id/status` (`:2699`) all appear in `artifacts/product-audit/admin-unguarded.json`. (The `/feedback/tickets/*` variants of the two writes do reach `this.admin(auth)`, but the UI calls the `/feedback/:id/*` aliases, which do not.) Any caller can therefore read every ticket and write replies and status changes on them.

## AI_USAGE

None on this page. No `AIJob` is created or read and no AI-generated text is shown; the reply text is operator-typed or a `ReplyPreset` string.

## PRIVACY

- The drawer renders the user's problem description verbatim (`FeedbackTicketsPage.vue:166`) and their uploaded screenshots at full URL (`:91`, `:166`); `decorateFeedbackTicket` returns only assets whose `userId` matches the ticket owner and whose status is `ready` (`store.service.ts:1511-1515`), which is a real privacy control on the media path.
- The 用户 column shows the nickname only; the drawer adds the anonymous code in parentheses (`FeedbackTicketsPage.vue:81-85`).
- Because the list and the reply/status writes are unguarded, ticket content and the ability to answer users are both open.
- `ticketNumber` is synthesised for display from the creation date and the current page index (`FeedbackTicketsPage.vue:86-90`); it is not a stored identifier, so the "工单 ID" an operator reads out is not the ticket's real id.

## ERROR_STATES

Code exists but is **hidden at desktop width**. `load()` catches and writes `error?.message ?? '反馈工单加载失败'` into `status` (`FeedbackTicketsPage.vue:114`), `mutate()` likewise (`:131`). The render site is `<p class="muted" role="status">` inside the filter bar (`:163`), and at ≥1200px `.tickets-page > .ticket-filters p` is clipped to a 1×1 box (`FeedbackTicketsPage.vue:244`). So a failed load or a rejected write (e.g. the 请先回复用户 rule) produces no visible message at all on the reference desktop layout — the operator sees the ticket simply not change.

## EMPTY_STATES

Yes: `<tr v-if="!visibleItems.length"><td colspan="8" class="empty-cell">暂无符合条件的反馈工单</td></tr>` (`FeedbackTicketsPage.vue:165`). The footer still renders 共 {{ filteredItems.length || total }} 条 with `v-if="totalPages > 1"` around the pager (`:165`), so with a single empty page the pager is hidden but the count line remains.

## NATIVE_RISKS

None. Desktop console: no safe-area insets, no Android back-button handling, no keyboard/dial/clipboard. `mediaUrl` falls back to `http://localhost:3000` when `VITE_API_BASE_URL` is unset (`FeedbackTicketsPage.vue:91`).

## ISSUES

- **P1 SECURITY (ISSUE-001)** — all four endpoints this page uses are unguarded (`controllers.ts:2603`, `:2644`, `:2679`, `:2699`), so ticket contents are publicly readable and any caller can post a reply or change a ticket's status.
- **P2 STATE_MACHINE** — the row-level 标记已解决 button fires a write before the operator has done anything: `resolveTicket` opens the drawer and calls `setStatus('resolved')` in the same tick (`FeedbackTicketsPage.vue:125`). The server then rejects it with 请先回复用户，再将工单标记为已解决 (`store.service.ts:1611-1612`) — and because the error surface is clipped (`:244`), the operator sees nothing happen.
- **P2 UX** — the row 回复 button is a no-op alias of 查看 (`FeedbackTicketsPage.vue:124`); it does not focus the reply box, so the two buttons are indistinguishable in effect.
- **P2 UX** — no visible error state at ≥1200px; every failure message is clipped to 1×1 (`FeedbackTicketsPage.vue:244`).
- **P2 DATA** — the four metric cards can be a persisted fixture rather than live counts (`controllers.ts:2625-2640`) and the UI discards the `source` discriminator, so the operator cannot tell which.
- **P3 UX** — 来源筛选 is client-side only (`FeedbackTicketsPage.vue:50-52`), so it filters the already-loaded 100 rows and the footer count can disagree with the visible rows.
- **P3 UX** — the displayed 工单 ID is synthesised from the page index (`FeedbackTicketsPage.vue:86-90`) and changes as the operator pages, so it cannot be used to reference a ticket.
- **P3 DUPLICATE** — `GET /feedback/tickets` (`controllers.ts:2579`), `GET /feedback/tickets/:id` (`:2653`), `GET /feedback/:id` (`:2658`), `PATCH /feedback/:id/reply` (`:2670`), `POST /feedback/tickets/:id/reply` (`:2663`), `PATCH /feedback/tickets/:id/status` (`:2688`) and `PATCH /feedback/:id/resolve` (`:2708`) are alternative routes with no caller in the UI (`ISSUE-014`).

## FINAL_STATUS

PARTIAL — the reply and status writes are real, the state machine is genuinely enforced server-side with a real 1000-char and reply-before-resolve rule, and screenshots resolve through a real per-owner media check; but the endpoints are unguarded, the row 标记已解决 button is a broken shortcut, and the error channel is invisible at desktop width.

### Static evidence

- Controls discovered in component: 26
- API reads (static): `GET /api/admin/v1/feedback`, `GET /api/admin/v1/feedback/summary`, `GET /api/admin/v1/users`, `GET /api/admin/v1/feedback-categories`, `GET /api/admin/v1/reply-presets`
- API writes (static): `POST /api/admin/v1/feedback/:param/reply`, `PATCH /api/admin/v1/feedback/:param/status`
- Candidate fake markers in `artifacts/product-audit/fake-markers.json` for `FeedbackTicketsPage.vue`: 2 (placeholders at 162 and 166); adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md` row A15.
- Appended: the test contract `tests/contracts/admin-interactions.json` declares `admin-ticket-processing` (P0, `PATCH /api/admin/v1/feedback/:id/status`) and `admin-ticket-resolve` after a typed reply (P0, same endpoint); the tests therefore exercise the `/feedback/:id/status` alias traced above, not the `/feedback/tickets/:id/status` route.
