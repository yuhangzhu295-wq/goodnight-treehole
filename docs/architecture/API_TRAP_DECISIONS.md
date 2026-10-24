# API TRAP DECISIONS

Two admin endpoints were flagged by the product audit as traps: they look like they do something they
do not. The round requires a decision before release, because both are the "fake save" pattern the
project forbids. Read-only analysis by the architecture-reviewer subagent, from the code.

## Trap 1 — `PATCH` / `POST /api/admin/v1/users/:id/tags`

**Verdict: `DEPRECATE` — both handlers return HTTP 410 Gone. P0. No schema change.**

### Facts

Both handlers only echo the request: they return `{ id, tags: body.tags }`, never look the user up,
never touch the store and never persist (`controllers.ts:2479-2486`; `POST` delegates to the same
handler). The audit's claim is confirmed.

`User` has no tags field or relation (`schema.prisma:136-184`), and neither the user list nor the user
detail returns tags (`controllers.ts:2370-2384, 2410-2413`). A repository-wide search finds **no
caller** — not the admin UI, not a test, not a script. They appear only in the route declarations, a
generated API-doc list, and the original requirements text. (The admin note request also carries
`tags`, but that request saves the note content and only puts the tags in the response:
`TablePage.vue:540-542`, `controllers.ts:2433-2442`.)

### Decision and reasoning

There is no tag read or display path anywhere. Adding a data model so that two unused write endpoints
can appear to work is not the minimal fix, and continuing to return success is a fake function. So the
endpoints stop pretending.

### Exact change

Both handlers perform no write and return **HTTP 410 Gone** with an explicit body:
`code: "ENDPOINT_DEPRECATED"`, `message: "用户标签功能未实现；本请求未保存任何标签"`. They must not return
an `item` that reads as saved. Update the success-response documentation at `main.ts:104-105` to record
the deprecation. Add a regression asserting both verbs return 410 and that re-reading the user shows no
tags.

### What this breaks

Nothing inside the repository. An external caller relying on the current 200 will now receive 410 and
must stop treating tags as saved. The tag capability in the original requirements remains undelivered —
it is no longer misrepresented as delivered.

## Trap 2 — `PATCH posts/:id/visibility` versus `PATCH posts/:id/review`

**Verdict: keep `/review` as the single moderation workflow; `DEPRECATE` `/visibility` (HTTP 410).
P0. No schema change.**

### Facts

`/review` maps its `status` to a moderation action and calls `postModeration()` →
`store.moderatePost()`: `approve` sets `reviewStatus=published` and stamps `publishedAt`, `hide` sets
`hidden`, `reject` sets `rejected`, and `risk` **only increments `reportCount`**; all write an audit row
and persist, and the controller awaits the flush (`controllers.ts:2526-2553`,
`store.service.ts:6544-6556`). It does not touch `visibility`.

`/visibility` sets `post.visibility` directly and, if the body carries `reviewStatus`, assigns the
review status too (stamping `publishedAt` when it is `published`) — then audits and calls `persist()`
**without awaiting the flush**, and never goes through the moderation method
(`controllers.ts:2569-2585`). So the two do overlap, and `/visibility` can reach a state `/review`
cannot produce, for example `visibility=PRIVATE, reviewStatus=published`. The `reviewStatus` value is
only a TypeScript assertion — there is no runtime enum check, though the Prisma enum has four values
(`schema.prisma:21-31, 284-300`).

**One audit claim is inaccurate and is corrected here:** "both routes can bypass the review state
machine" is not right. The admin UI's two post pages call **only `/review`, never `/visibility`**
(`PostsPage.vue:98-107, 120-132`, `TablePage.vue:572-577`). `/review` is the existing single moderation
entry point. It should also not be described as a strict state machine: `moderatePost()` itself checks
no allowed transitions.

Also worth recording, because it affects how this endpoint could be used: `publicPosts()` filters on
`reviewStatus=published` and **does not check `visibility`** (`store.service.ts:5243-5261`). Setting
`visibility=PRIVATE` alone is therefore not a reliable takedown.

### Decision and reasoning

The UI and the moderation interaction tests already depend on `/review`, and there is no evidence the
back office needs a separate way to change a post's visibility. Keeping `/visibility` alive while
merely removing its `reviewStatus` field would leave an endpoint that looks like a takedown but may
leave the post in the public list.

### Exact change

`/visibility` performs no mutation and returns **HTTP 410 Gone** explaining that it no longer modifies
posts and that moderation, hiding and restoring go through `PATCH /api/admin/v1/posts/:id/review`.
Update the API documentation at `main.ts:109-113`: a deprecated entry point must not continue to claim
success, and the current moderation route should be listed as such. Add a test asserting `/visibility`
returns 410 while post status, visibility and the audit log are all unchanged, and that `/review` still
persists its actions.

### What this breaks

The admin UI is unaffected. A direct external caller of `/visibility` receives 410 and must move to
`/review`. If an external caller genuinely needs to change the user-chosen public/private scope
independently, that is an unproven separate product requirement — it should be designed, not inherited
from this endpoint's mixed write behaviour.

## Also answered

**Peer report operator actions — the existing `AuditLog` is sufficient; do not add a second history
table.** The handle route captures `before`, mutates the report, and writes an `AuditLog` row with
action `PEER_REPORT_HANDLE`, resource type `PeerReport`, the report id, the admin id, and before/after —
then flushes the state change and the audit row together (`controllers.ts:2306-2319`,
`store.service.ts:4569-4587, 2409-2429`). One caveat to record rather than solve: the audit log is
subject to a **30-day retention policy applied at boot** (`store.service.ts:2352-2369`). If the product
needs per-report traceability beyond that window, the retention period has to be decided first — a
second log table is not the answer to a retention question.

**Admin user notes — the UI currently misleads, and this is a P1 to fix.** `UsersPage.vue` pre-fills the
current note into an editable textarea, labels the button 保存备注 ("save note") and reports success as
用户备注已保存 ("user note saved") — but the request is `POST /notes`, which **appends** a new row
(`UsersPage.vue:67-72, 128-136, 205-216`). An operator would reasonably believe they are editing the
current note. Correction, no schema change: leave the input empty by default, label the action 新增备注
("add note") with a line stating that submitting appends and does not modify history, and keep the
history list read-only except for delete.

## Third unawaited-persist gap found here

`/visibility` calls `this.store.persist()` without awaiting the flush (`controllers.ts:2583`), the same
class as the two defects already fixed this round. It is moot if the endpoint is deprecated as decided,
but it is recorded so that if the decision is reversed the durability gap is not inherited silently.

## Cannot determine

- Whether an external client outside this repository calls either endpoint, or whether any compliance
  requirement sets a retention period for report-handling history longer than the current audit log's.
- This was a read-only review: no service was run, no database was queried, no test was executed.
