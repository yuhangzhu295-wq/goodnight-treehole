# admin: replies (回应审核)

Route: `/replies/moderation`
Component: `apps/admin/src/views/RepliesPage.vue`
Group: 内容运营

## PURPOSE

The moderation queue for replies — both AI-generated and human — attached to anonymous posts. It is the queue that decides whether a reply becomes visible in the front end, and the only place where an operator can rewrite a reply's text before approving it. Dedicated view, not `TablePage.vue` (`apps/admin/src/router.ts:103`).

## USER_JOB

"Work through pending replies fastest, rewrite the ones that read badly, and block anything harmful."

## ENTRY

- Sidebar `data-testid=admin-nav-replies` (`apps/admin/src/views/Layout.vue:69`), in `primaryPaths` (`Layout.vue:26-36`).
- No other route pushes to `/replies/moderation`; it is reachable only from the sidebar. Notably the Dashboard's 待审核内容 metric counts pending replies (`apps/api/src/controllers.ts:1801-1803`) but its 审核内容 shortcut lands on `/posts`, not here.

## EXIT

No exit control. Actions reload in place (`mutate` → `load()`, `RepliesPage.vue:113-125`). The 处理待审核回应 button in the page intro only re-filters this page (`RepliesPage.vue:176`).

## ROUTES

`/replies/moderation` — `artifacts/product-audit/admin-routes.json` entry `{ path: "/replies/moderation", component: "RepliesPage.vue", title: "回应审核", resource: "replies", viaTablePage: false, group: "内容运营" }`; declared `apps/admin/src/router.ts:103`. No aliases, no query parameters.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| busy / `aria-busy` on table | `busy` | `RepliesPage.vue:21`, `:218` |
| status line (**screen-reader only**) | `status` (ref 正在读取回应审核数据…) | `RepliesPage.vue:20`, `:214` |
| queue tab selection | `filter` + `typeFilter` | `RepliesPage.vue:15-16`, `:182-196` |
| search | `search` | `RepliesPage.vue:14`, `:202` |
| review-status select | `filter` | `RepliesPage.vue:206-211` |
| detail drawer | `detailOpen` + `selected` | `RepliesPage.vue:19`, `:264` |
| editable reply body | `editContent` | `RepliesPage.vue:18`, `:280` |
| confirmation panel | `confirmation` | `RepliesPage.vue:22`, `:301` |
| pagination | `page` / `totalPages` | `RepliesPage.vue:11-13`, `:256-258` |

The five queue tabs are simultaneously filters and live counters: 全部回应 = `total`, 用户回应 = `humanCount`, AI 回应 = `aiCount`, 待审核 = `pendingCount`, 已拦截 = `blockedCount` (`RepliesPage.vue:32-34`, `:182-196`). The three counts are computed from the **current page only** (`items.value.filter(...)`), while 全部回应 shows the server `total`, so the counters are not comparable to each other.

## CONTROLS

| control | handler | real effect |
| --- | --- | --- |
| 处理待审核回应 (page intro) | `setQueue('pending_review')` (`RepliesPage.vue:176`) | sets `filter`; if nothing changed it forces `load()`, otherwise the `watch` at `:154-157` reloads |
| 全部回应 tab | `setQueue('all')` (`:182`) | `status=all`, `type=all` |
| 用户回应 tab | `setQueue('all','USER')` (`:185`) | adds `type=USER` (`RepliesPage.vue:72`) |
| AI 回应 tab | `setQueue('all','AI')` (`:188`) | adds `type=AI` |
| 待审核 tab | `setQueue('pending_review')` (`:191`) | adds `status=pending_review` |
| 已拦截 tab | `setQueue('blocked')` (`:194`) | adds `status=blocked` |
| 搜索回应 `data-testid=admin-reply-search` | `v-model=search` (`:202`) | adds `q=` (`RepliesPage.vue:70`) |
| 审核状态 select | `v-model=filter` (`:206`) | adds `status=` |
| 刷新列表 | `load` (`:213`) | re-issues `GET /replies` + `GET /posts` |
| row click / 查看 | `openDetail(reply)` (`:238`, `:246`) | opens the drawer and seeds `editContent` (`RepliesPage.vue:107-111`) |
| 上一页 / 下一页 | `changePage` (`:256`, `:258`) | bounded page change then `load()` |
| drawer × / mask click | `detailOpen = false` (`:271`, `:264`) | closes |
| 保存并通过 `data-testid=admin-reply-approve` | `review('approve')` (`:296`) | `PATCH /replies/:id/review {action:'approve', content}` with the edited text (`RepliesPage.vue:131-134`) |
| 仅保存修改 `data-testid=admin-reply-edit-approve` | `saveContent` (`:297`) | `PATCH /replies/:id/content {content}` (`RepliesPage.vue:150`) |
| 拦截回应 `data-testid=admin-reply-block` | `review('block')` (`:298`) | confirmation → `PATCH /replies/:id/review {action:'block'}` |
| 确认拦截 / 取消 | `confirmation.run()` / `null` (`:306`) | runs or cancels |

`artifacts/product-audit/control-manifest.json` lists 26 entries for `RepliesPage.vue`.

## API_READS

| endpoint | call site | handler |
| --- | --- | --- |
| `GET /api/admin/v1/replies?page&pageSize&q&status&type` | `RepliesPage.vue:74` | `AdminController.adminReplies` — `apps/api/src/controllers.ts:2304-2324` (filters at `:2313-2322`) |
| `GET /api/admin/v1/posts?page=1&pageSize=100` | `RepliesPage.vue:75` | `AdminController.adminPosts` — `controllers.ts:2167` (used to render the 来源树洞 excerpt, `RepliesPage.vue:31`, `:63`) |

Both fire in one `Promise.all` (`RepliesPage.vue:73-76`). The posts request is hard-coded to page 1 of 100, so a reply whose source post is not in the first 100 posts renders the literal fallback 来源树洞已不可用 (`RepliesPage.vue:63`).

## API_WRITES

| endpoint | call site | handler |
| --- | --- | --- |
| `PATCH /api/admin/v1/replies/:id/review` with `{action:'approve'\|'block', content?}` | `RepliesPage.vue:131` | `replyReview` — `controllers.ts:2340-2351`; maps `hide`→`block`, defaults to `block` for any unrecognised status, then delegates to `replyModeration` (`controllers.ts:2329-2338` → `store.moderateReply`, `store.service.ts:6126-6138`) |
| `PATCH /api/admin/v1/replies/:id/content` with `{content}` | `RepliesPage.vue:150` | `replyContent` — `controllers.ts:2353-2356`, which delegates to `replyEdit` (`:2372-2375`) → `replyModeration(action:'approve', content)` |

`moderateReply` overwrites `reply.content` when a body is supplied, sets `status` to `published`/`blocked`, recomputes the parent `post.replyCount` from published replies, writes `AuditLog` `REPLY_<ACTION>` (`store.service.ts:6135`), then persists. A missing reply throws `NotFoundException('回应不存在')` (`:6128`).

## DB_ENTITIES

- Read: **Reply** (list), **Post** (source excerpt and `replyCount`).
- Written: **Reply** (`content`, `status`), **Post** (`replyCount`), **AuditLog**, **AdminUser** (guard).

Schema: `Reply` `prisma/schema.prisma:291-310` (`content`, `status ReplyStatus`, `riskLevel`, `type ReplyType`, `style`), `Post.replyCount` `:274`, `AuditLog` `:1057-1072`. Matches the agent-4 table (AdminUser, AuditLog, Post, Reply).

## ADMIN_VISIBILITY

This page is the admin surface for replies. `GET /replies` (`controllers.ts:2304`) is **unguarded** (`artifacts/product-audit/admin-unguarded.json`), while the two write handlers are guarded via delegation to `replyModeration`, which calls `this.admin(auth)`.

## AI_USAGE

Read-only classification, no job creation. The page splits rows by `reply.type === 'AI'` (`RepliesPage.vue:40`, `:45`) and, for AI rows, shows a fixed note 该回应由 AI 服务生成。相关任务状态可在「AI 任务记录」中继续核查 (`RepliesPage.vue:289-292`) — plain text, with no link to `/ai/jobs` and no `aiJobId` shown even though `Reply.aiJobId` exists (`prisma/schema.prisma:303`). So an operator told to "check the AI job record" is given no way to do it from here. `riskLevel` is displayed as 低/中/高风险 or 待评估 (`RepliesPage.vue:47-49`), but nothing on this page writes it.

## PRIVACY

- The drawer renders the full source post body and the full reply body (`RepliesPage.vue:276`, `:280`), including human replies that may be private-context.
- The edit box lets an operator rewrite a *human* user's words before publishing (`RepliesPage.vue:280` → `moderateReply` overwrites `content`, `store.service.ts:6130`). There is no before/after diff surfaced in the UI; the only record is the `AuditLog` `beforeJson`/`afterJson` pair (`store.service.ts:6129`, `:6135`), which is only visible on the audit page.
- `GET /replies` is unguarded, so reply bodies are readable without a token.

## ERROR_STATES

No user-visible error state. `load()` writes `error?.message ?? '回应数据加载失败'` into `status` (`RepliesPage.vue:86-87`), and `status` is rendered only inside `<p class="visually-hidden" role="status">` (`:214`), whose CSS is the standard 1×1 clip (`RepliesPage.vue:514`). A failed load therefore leaves the previous table on screen with no visible signal. Write failures use the same channel (`mutate`, `:120-121`). This is a finding, not an absence of code.

## EMPTY_STATES

Yes: `<tr v-if="!items.length"><td colspan="7" class="empty-cell">暂无符合条件的回应</td></tr>` (`RepliesPage.vue:248-250`). Correctly scoped to the current query. The queue tabs above it keep showing their stale counts because those are computed from the previous `items`, so an empty result still shows e.g. 待审核 3 in the tab header.

## NATIVE_RISKS

None. Desktop console: no safe-area insets, no Android back-button handling, no keyboard/dial/clipboard. `window.matchMedia('(min-width: 1400px)')` is used for the wide-workspace layout and cleaned up in `onBeforeUnmount` (`RepliesPage.vue:158-165`).

## ISSUES

- **P1 SECURITY** — `GET /api/admin/v1/replies` is unguarded (`controllers.ts:2304`; `artifacts/product-audit/admin-unguarded.json`), exposing every reply body including human replies.
- **P2 UX** — the page has no visible error surface: all failures go to a `visually-hidden` status element (`RepliesPage.vue:214`), so a failed load or failed moderation looks like nothing happened.
- **P2 DATA** — the queue counters are inconsistent: 用户回应/AI 回应/待审核/已拦截 count only the 10 rows currently in `items` (`RepliesPage.vue:32-34`), while 全部回应 shows the server `total` (`:183`). The operator cannot trust the numbers as a workload measure.
- **P2 NAVIGATION** — the AI-origin note tells the operator to continue in AI 任务记录 but renders no link (`RepliesPage.vue:291`), and the reply's `aiJobId` is not displayed.
- **P3 UX** — 来源树洞 resolves only against the first 100 posts, so older replies show 来源树洞已不可用 (`RepliesPage.vue:63`, `:75`).
- **P3 DUPLICATE** — `PATCH /replies/:id/moderation` (`controllers.ts:2329`), `/approve` (`:2358`), `/block` (`:2367`), `/edit` (`:2372`) and `GET /replies/:id` (`:2325`) are duplicate routes with no caller (`ISSUE-014`).

## FINAL_STATUS

PARTIAL — every control maps to a real endpoint and the moderation writes genuinely change `Reply.status` and `Post.replyCount`, but the unguarded read, the invisible error channel and the page-scoped queue counters are three confirmed defects.

### Static evidence

- Controls discovered in component: 26
- API reads (static): `GET /api/admin/v1/replies`, `GET /api/admin/v1/posts`
- API writes (static): `PATCH /api/admin/v1/replies/:param/review`, `PATCH /api/admin/v1/replies/:param/content`
- Candidate fake markers in `artifacts/product-audit/fake-markers.json` for `RepliesPage.vue`: 1 (placeholder at line 202); adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md` row A22.
- Appended: the test contract `tests/contracts/admin-interactions.json` declares `admin-reply-approve` (P0, `PATCH /api/admin/v1/replies/:id/review`) and `admin-confirm-action` after `admin-reply-block` (P0, same endpoint); both match the handlers traced above.
