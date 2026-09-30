# admin: posts (树洞内容)

Route: `/posts`
Component: `apps/admin/src/views/PostsPage.vue`
Group: 内容运营

## PURPOSE

The content-moderation queue for anonymous posts. The operator filters the post list by emotion, review status, visibility and date, opens a row into a detail drawer that shows the full body plus attachments and interaction counts, and approves / rejects / hides / flags a post or re-queues its AI replies. It is a dedicated view, **not** `TablePage.vue` (`apps/admin/src/router.ts:102`).

## USER_JOB

"Clear the待审核 backlog and take risky public posts down, without losing the evidence of what I did."

## ENTRY

- Sidebar `data-testid=admin-nav-posts` (`apps/admin/src/views/Layout.vue:68`), one of the ten `primaryPaths` (`Layout.vue:26-36`).
- Dashboard 快捷操作 → 审核内容 and 最新树洞动态 → 查看全部 both `router.push('/posts')` (`apps/admin/src/views/Dashboard.vue:187`, `:210`).
- The global topbar search pushes `{ path: '/posts', query: { q } }` (`Layout.vue:81-85`), and `PostsPage` seeds `search` from `route.query.q` on setup and watches it (`PostsPage.vue:14`, `:163-166`).
- Dashboard's 待审核内容 metric implies a filtered entry but no link passes a review-status filter.

## EXIT

There is no explicit exit control; the operator leaves via the sidebar. Row-level actions stay on the page and reload it (`mutate()` calls `load()`, `PostsPage.vue:89-93`). The 9-column table's last cell holds 查看 / 隐藏 / 恢复 buttons (`PostsPage.vue:208`), all of which open or refresh the drawer rather than navigate.

## ROUTES

`/posts` — `artifacts/product-audit/admin-routes.json` entry `{ path: "/posts", component: "PostsPage.vue", title: "树洞内容", resource: "posts", viaTablePage: false, group: "内容运营" }`; declared `apps/admin/src/router.ts:102`. No aliases, no dynamic segments. The only query parameter it consumes is `q`.

## STATES

| state | driving variable | evidence |
| --- | --- | --- |
| loading (sets `aria-busy` on the table) | `busy` | `PostsPage.vue:24`, `:196` |
| status line | `status` (ref 正在读取树洞内容…) | `PostsPage.vue:23`, `:192` |
| filter: review status | `filter` | `PostsPage.vue:15`, `:187` |
| filter: emotion | `emotionFilter` | `PostsPage.vue:16`, `:186` |
| filter: visibility | `visibilityFilter` | `PostsPage.vue:17`, `:188` |
| filter: date range (client-side only) | `dateStart` / `dateEnd` | `PostsPage.vue:18-19`, `:189` |
| search | `search` | `PostsPage.vue:14`, `:190` |
| row selection set | `selectedIds` | `PostsPage.vue:21`, `:200` |
| detail drawer | `detailOpen` + `selected` | `PostsPage.vue:22`, `:224` |
| confirmation dialog | `confirmation` | `PostsPage.vue:25`, `:236` |
| pagination | `page` / `totalPages` | `PostsPage.vue:10-12`, `:216-218` |

At ≥1240px the page header and the three metric cards are hidden by CSS (`PostsPage.vue:346-348`), so the status line disappears on the reference desktop layout.

## CONTROLS

| control | handler | real effect |
| --- | --- | --- |
| 优先处理待审核 (page intro) | `filter = 'pending_review'` (`PostsPage.vue:175`) | sets the review-status filter; the `watch` at `:150-153` resets page to 1 and re-issues the list request |
| 情绪分类 select | `v-model=emotionFilter` (`:186`) | adds `emotion=<value>` to `GET /posts` (`PostsPage.vue:57`) |
| 内容状态 select | `v-model=filter` (`:187`) | adds `reviewStatus=<value>` (`PostsPage.vue:56`) |
| 可见范围 select | `v-model=visibilityFilter` (`:188`) | adds `visibility=PUBLIC\|PRIVATE` (`PostsPage.vue:58`) |
| 时间范围 (two date inputs) | `v-model=dateStart` / `dateEnd` (`:189`) | **client-side filter only** — filters `visibleItems` via `isWithinDateRange` (`PostsPage.vue:28`, `:43-49`); no request is made |
| 搜索内容 `data-testid=admin-post-search` | `v-model=search` (`:190`) | adds `q=` (`PostsPage.vue:55`) |
| 刷新列表 | `load` (`:191`) | re-issues `GET /posts` + `GET /users` |
| 批量隐藏 `class=batch-hide` | `hideSelected` (`:191`) | opens a confirmation, then `Promise.all` of `PATCH /posts/:id/review {action:'hide'}` for each selected id (`PostsPage.vue:139-155`) |
| select-all checkbox (header) | `toggleAll` (`:197`) | fills `selectedIds` from `visibleItems` |
| per-row checkbox | `toggleSelection` (`:200`) | adds/removes one id |
| row click | `openDetail(post)` (`:199`) | opens the drawer |
| row 查看 | `openDetail` (`:208`) | opens the drawer |
| row 隐藏 | `hidePost` (`:208`) → `review('hide')` | opens drawer, then confirmation, then `PATCH /posts/:id/review {action:'hide'}` |
| row 恢复 (only when `reviewStatus==='hidden'`) | `restorePost` (`:208`) | `PATCH /posts/:id/review {status:'published'}` (`PostsPage.vue:96`) |
| 上一页 / 下一页 | `changePage` (`:216`, `:218`) | bounded page change, then `load()` |
| drawer × / mask click | `detailOpen = false` (`:226`) | closes |
| 审核通过 `data-testid=admin-post-approve` | `review('approve')` (`:230`) | `PATCH /posts/:id/review {action:'approve'}`, no confirmation |
| 拒绝 `data-testid=admin-post-reject` | `review('reject')` (`:230`) | confirmation → `PATCH ... {action:'reject'}` |
| 隐藏 `data-testid=admin-post-hide` (inside 更多操作) | `review('hide')` (`:230`) | confirmation → `PATCH ... {action:'hide'}` |
| 恢复公开 `data-testid=admin-post-restore` | `restore` (`:230`) | `PATCH ... {status:'published'}` |
| 标记风险 `data-testid=admin-post-risk` | `review('risk')` (`:230`) | `PATCH ... {action:'risk'}` |
| 重新生成 AI 回应 `data-testid=admin-post-ai-reply` | `regenerate` (`:230`) | `POST /posts/:id/regenerate-replies` (`PostsPage.vue:97`) |
| 确认操作 / 取消 in the confirmation overlay | `confirmation.run()` / `null` (`:236`) | runs or cancels the pending write |
| attachment thumbnails `data-testid=admin-post-media` | `<a target=_blank>` (`:229`) | opens the media URL in a new tab |

Count: `artifacts/product-audit/control-manifest.json` lists 35 entries for `PostsPage.vue`.

## API_READS

| endpoint | call site | handler |
| --- | --- | --- |
| `GET /api/admin/v1/posts?page&pageSize&q&reviewStatus&emotion&visibility` | `PostsPage.vue:60` | `AdminController.adminPosts` — `apps/api/src/controllers.ts:2167-2190` (filters at `:2177-2187`, `decoratePost` at `:2188`) |
| `GET /api/admin/v1/users?page=1&pageSize=100` | `PostsPage.vue:61` | `AdminController.users` — `apps/api/src/controllers.ts:2085-2101` (used only to render 发布用户 labels, `PostsPage.vue:31`, `:41`) |

Both are fired in one `Promise.all` inside `load()` (`PostsPage.vue:59-62`).

## API_WRITES

| endpoint | call site | handler |
| --- | --- | --- |
| `PATCH /api/admin/v1/posts/:id/review` with `{action:'approve'\|'reject'\|'hide'\|'risk'}` | `PostsPage.vue:90`, `:96` | `postReview` — `controllers.ts:2206-2222`, which maps the body to an action and delegates to `postModeration` (`controllers.ts:2195-2204` → `store.moderatePost`, `store.service.ts:6111-6124`) |
| `PATCH /api/admin/v1/posts/:id/review` with `{status:'published'}` | `PostsPage.vue:96` | same handler; `body.status === 'published'` maps to action `approve` (`controllers.ts:2214-2215`) |
| `POST /api/admin/v1/posts/:id/regenerate-replies` | `PostsPage.vue:97` | `regenerateReplies` — `controllers.ts:2262-2295`; queues two `public_ai_reply` jobs (styles `warm`, `rational`) and writes `published` AI replies on completion |

`moderatePost` writes `reviewStatus` (published/hidden/rejected) or increments `reportCount` for `risk`, writes an `AuditLog` row `POST_<ACTION>` (`store.service.ts:6121`), then persists.

## DB_ENTITIES

- Read: **Post** (list + decorate), **User** (label lookup), **Reply** (counts and the regenerate path), **AIJob**, **AIProvider**.
- Written: **Post** (`reviewStatus`, `publishedAt`, `reportCount`), **Reply** (new AI rows), **AIJob**, **AuditLog**, and transitively **AdminUser** (the guard resolves the token to an admin).

Schema: `Post` `prisma/schema.prisma:262-289` (`reviewStatus`, `publishedAt`, `reportCount`), `Reply` `:291-310`, `AIJob` `:1013-1042`, `AuditLog` `:1057-1072`. Matches the agent-4 table (AIJob, AIProvider, AdminUser, AuditLog, Post, Reply).

## ADMIN_VISIBILITY

This page *is* the admin surface for posts. Note the split guard behaviour: `GET /posts` (`controllers.ts:2167`) and `POST /posts/:id/regenerate-replies` (`:2262`) are **unguarded** — both appear in `artifacts/product-audit/admin-unguarded.json` and `POST /posts/:id/regenerate-replies` returned `201` with a real job enqueued in the `ISSUE-001` live proof — while `PATCH /posts/:id/review` is listed as unguarded in the artifact but reaches `this.admin(auth)` through `postModeration`, so it answers `401` without a token (the 22 "enforced only via delegation" endpoints, `docs/product-audit/discovery-agent4-api-db-admin.md` §3a).

## AI_USAGE

Real and explicit. 重新生成 AI 回应 queues two genuine `AIJob` rows (`controllers.ts:2265-2275`) and, when each resolves to `succeeded` or `fallback`, inserts a `published` `Reply` with `type: 'AI'` and recomputes `post.replyCount` (`controllers.ts:2276-2292`). The UI message 已创建新的 AI 回应任务 is accurate — the handler returns `status: 'queued'` with `jobIds` (`controllers.ts:2294`) — but the button does not surface the job ids or the fallback outcome, so a fallback-generated reply is indistinguishable from a model-generated one in this view. That is the operator-side half of `ISSUE-007`.

## PRIVACY

- The list and the drawer render the full `content` of every post regardless of `visibility`; `GET /posts` applies no visibility restriction (`controllers.ts:2185` filters only when the operator explicitly picks one).
- `decoratePost` computes `allowHumanReplies` from the owner's `PrivacySetting.allowHumanReplies` and the system default (`store.service.ts:1863-1872`), so the admin view is aware of the owner's privacy choice but does not act on it.
- Attachment URLs are rendered straight from `selected.attachments` with the API base prefix (`PostsPage.vue:40`), so media is fetched unauthenticated from the public static path.
- `GET /posts` is unguarded (`ISSUE-001`), so private post bodies are readable by any caller.

## ERROR_STATES

Present but weak. `load()` catches and writes `error?.message ?? '树洞内容加载失败'` into `status` (`PostsPage.vue:72-73`), which renders in `<p class="muted filter-status" role="status">` (`:192`). Two concrete problems: the element has no `danger` styling so a failure looks identical to the normal "已加载 N 条" message; and at ≥1240px `.filter-status` is `display: none` (`PostsPage.vue:358`), so on the reference desktop layout a failed load is completely invisible — the table simply keeps its previous rows. Writes have the same pattern (`mutate`, `:92`).

## EMPTY_STATES

Yes: `<tr v-if="!visibleItems.length"><td colspan="9" class="empty-cell">暂无符合条件的树洞内容</td></tr>` (`PostsPage.vue:210`). It is scoped to `visibleItems`, so it correctly covers both "no rows" and "rows exist but the client-side date filter removed them". Note that the pagination footer still renders 共 {{ total }} 条 (`:214`) using the *server* total, so an empty table can sit above a non-zero total when a date filter is applied — a real inconsistency.

## NATIVE_RISKS

None. Desktop web console: no safe-area insets, no Android back-button handling, no keyboard, no dial/clipboard/camera. `mediaUrl` (`PostsPage.vue:40`) falls back to `http://localhost:3000` when `VITE_API_BASE_URL` is unset, which would break image loading outside local dev.

## ISSUES

- **P1 SECURITY** — `GET /api/admin/v1/posts` has no token guard (`controllers.ts:2167`; `artifacts/product-audit/admin-unguarded.json`), so the entire moderation queue including private post bodies is readable by an unauthenticated caller. `POST /posts/:id/regenerate-replies` is unguarded too and was proven live to enqueue a real AI job (`ISSUE-001`).
- **P2 FUNCTIONAL** — the 时间范围 filter is decorative at the API level: it filters only the current page of 10 rows client-side (`PostsPage.vue:28`, `:43-49`), so "last 7 days" can show fewer rows than actually exist and the 共 N 条 footer disagrees with the table.
- **P2 UX** — at ≥1240px the only status/error surface is hidden (`PostsPage.vue:358`), so failed loads and failed writes give no feedback at all.
- **P2 AI** — the regenerate action reports success for fallback-generated replies without distinguishing them (`controllers.ts:2277`), hiding the `ISSUE-007` degradation from the operator.
- **P3 UX** — the 共 N 条 footer is not recomputed after the client-side date filter (`PostsPage.vue:214` vs `:28`).
- **P3 DUPLICATE** — `PATCH /posts/:id/moderation` (`controllers.ts:2195`), `/approve` (`:2224`), `/reject` (`:2229`), `/risk` (`:2257`), `/block` (`:2234`), `/visibility` (`:2238`) and `DELETE /posts/:id` (`:2296`) are alternative routes to the same behaviour with no caller in the UI (`ISSUE-014`).

## FINAL_STATUS

PARTIAL — the read, both writes and every rendered control are traced and real, but the unguarded list endpoint plus the invisible error surface and the client-side-only date filter leave three concrete defects in the moderation loop.

### Static evidence

- Controls discovered in component: 35
- API reads (static): `GET /api/admin/v1/posts`, `GET /api/admin/v1/users`
- API writes (static): `PATCH /api/admin/v1/posts/:param/review`, `POST /api/admin/v1/posts/:param/regenerate-replies`
- Candidate fake markers in `artifacts/product-audit/fake-markers.json` for `PostsPage.vue`: 1 (placeholder at line 190); adjudicated NOT_FAKE in `docs/product-audit/discovery-agent5-fake-candidates.md` row A21.
- Appended: the live proof for `DELETE /api/admin/v1/posts/<id>` (200 and a real delete) is the same controller family; the UI never calls it — `adminDeletePost` (`controllers.ts:2296`) has no caller.
