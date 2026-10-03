# PRODUCT DECISIONS

Adjudication of the three P3 findings carried out of the product audit. The RC round was told not
to delete legacy capability to empty a list, and not to auto-reconnect anything, so each item gets an
explicit verdict with its reason and its risk. All three verdicts are **P3** and **no code changed**
for any of them.

Verdict vocabulary: `KEEP` / `KEEP_FOR_COMPATIBILITY` / `DEPRECATE` / `REMOVE_AFTER_MIGRATION` /
`RECONNECT_TO_UI`.

Method: the old audit's counts were re-derived from the current code rather than trusted, because
the admin and the mini-program both changed after that audit. The re-derivation compared every route
declared in `apps/api/src/controllers.ts` against callers in `apps/admin/src`, `apps/mp/src`,
`apps/api/src` (workers and services), `scripts/` and `tests/`.

## ISSUE-014 — admin endpoints with no reachable caller

**Verdict: `KEEP_FOR_COMPATIBILITY`, in two groups. P3. No code change.**

The recorded finding ("39 of 100 admin endpoints have no reachable caller") is stale in both
directions. The controller now declares **107** admin routes, and "the admin UI does not call it" is
not the same as "nothing calls it". Two groups matter:

### Group A — called from tests or scripts (not orphans at all)

`POST login`, `GET auth/me`, `GET users/:id`, `DELETE users/:id/data`, `GET posts/:id`,
`PATCH posts/:id/{moderation,approve,block}`, `DELETE posts/:id`,
`PATCH replies/:id/moderation`, `POST ai/ollama/sync-models`, `GET feedback/tickets`,
`GET feedback/tickets/:id`.

Callers include `tests/business/helpers.ts:38`, `tests/business/admin-sync.spec.ts:23-35`,
`tests/cross/cross.spec.ts:69-77` and `scripts/final-feedback-upload-flow.ts:80`. Deleting these
would break contract tests and business-flow scripts that are still in use.

`POST ai/ollama/sync-models` deserves a specific note: it deliberately refuses local-model calls, and
a test asserts that refusal. It is a guard, not an unconnected feature, and must not be "connected".

### Group B — no request found anywhere in the repository

`POST auth/logout`; `GET me`, `GET dashboard`, `GET dashboard/summary`, `GET dashboard/activity`,
`GET dashboard/emotion-distribution`, `GET dashboard/ai-summary`; `PATCH/POST users/:id/tags`;
`PATCH posts/:id/{reject,visibility,risk}`; `GET replies/:id`,
`PATCH replies/:id/{approve,block,edit}`; `GET ai/ollama/status`, `DELETE ai/providers/:id`,
`PUT ai/routes/:style`; `GET feedback/:id`, `POST feedback/tickets/:id/reply`,
`PATCH feedback/:id/reply`, `PATCH feedback/tickets/:id/status`, `PATCH feedback/:id/resolve`;
`GET/PATCH settings`.

The live UI uses the parallel routes instead (`dashboard/overview`, `posts/:id/review`,
`replies/:id/review`, `feedback/:id/status`, `config` — `Dashboard.vue:83`,
`TablePage.vue:572-589`, `TablePage.vue:629-650`).

**Why not `REMOVE_AFTER_MIGRATION` now.** Not finding a caller inside this repository does not prove
that a released client, a bookmark, or an external admin integration does not exist. Removing them
during an RC would be exactly the "delete to empty a list" move the round forbids.

**Merge candidates, for a later, evidence-led pass** (not this round): the moderation shortcut routes
that delegate to the same handler; `PUT` vs `PATCH ai/routes`; the `feedback/tickets` and `feedback`
route pairs; `settings` vs `config`.

**Two endpoints that must not be "fixed" by connecting them:**

- `PATCH/POST users/:id/tags` only echoes the tags back and persists nothing
  (`controllers.ts:2476-2484`). Wiring a UI to it would create a write-only control, which this
  project's rules forbid. It needs persistence first, or it should be deprecated.
- `PATCH posts/:id/visibility` changes visibility and review status directly
  (`controllers.ts:2566-2582`). Reconnecting it needs a product review of what it should mean next to
  the existing `review` route.

**Not an orphan:** `GET users/export/:assetId/download`. The server generates that download URL and
the admin fetches it after requesting an export (`store.service.ts:1878-1906`,
`UsersPage.vue:141-145`). Searching only for the literal URL in the front end misclassifies it.

## ISSUE-015 — tool alias routes

**Verdict: `KEEP_FOR_COMPATIBILITY`. P3. No code change.**

Seven paths remain registered: `/pages/tool/{breakdown,rewrite,rant,heal,sleep,work,future}`
(`apps/mp/src/router.ts:79-88`). The first loads `ToolDecompose`, the other six load `ToolRun`, and
those six are not the same page with a different title: `ToolRun.vue:21-36` picks the task type from
the path and `ToolRun.vue:62-79` calls the task API with it. The old claim that these are one generic
page is wrong.

The live tool entry in 我的 (`Me.vue:76-85`) points at `/pages/tool/decompose` and
`/pages/tool/run?type=…` (`ToolIndex.vue:12-18`, `38-45`) — **not** at these aliases. So no current UI
links to them.

**Why not `DEPRECATE`.** The aliases are not unreferenced: `scripts/audit-front-navigation-layout.ts:162-163`
still expects `/breakdown` and `/rewrite`, and `scripts/problem02-ai-dynamic-report.ts:117` opens
`/breakdown` directly. External deep links cannot be ruled out by searching this repository. Notifications
navigate to whatever `targetRoute` the server stored (`NotificationCenter.vue:37-39`), so any historical
notification carrying an alias path would break.

**Also note:** the other "dead aliases" in the old finding must not be removed either —
`/pages/post/create` has a live Square button (`Square.vue:211`) and `/pages/me/month-report` has a live
我的 entry (`Me.vue:92`).

## ISSUE-016 — Square is not in the bottom tab bar

**Verdict: `KEEP_AS_SECONDARY`. P3. No code change, and explicitly not a fifth bottom-tab item.**

The four tab targets are 今晚 / 同路 / 行动 / 我的. `tabbarPaths` in `apps/mp/src/App.vue:7-41` lists
Square only to mean "show the tab bar when this page is open" — it is not an entry point
(`App.vue:73-112`).

Square is still a real surface with a real list and real interactions (`router.ts:72-78`,
`Square.vue:47-83`). It is not "reachable only by typing the route": from 我的 the diary and letter
lists open MoodCreate, publishing leads to PostDetail, and PostDetail's own actions and its
no-history fallback reach Square; favourites and archive also open PostDetail
(`Me.vue:88-90`, `DiaryList.vue:149`, `MoodCreate.vue:126-127`, `PostDetail.vue:57`, `124`,
`FavoriteList.vue:34-36`, `LetterToday.vue:68`). What is true is that the bottom bar has no direct,
stable Square entry.

**Why keep it secondary rather than reconnect or remove.** Journey, Peer and the personal-record
surfaces already carry the main paths (`router.ts:48-71`, `Me.vue:88-98`), while Square carries the
existing public-post, interaction and look-back scenarios. Adding it to the bottom bar would displace
a main-path entry to satisfy a navigation audit; removing the page would break PostDetail's fallback
and existing post browsing. Neither is justified in an RC.

## Summary

| Issue | Verdict | Scope | Risk if changed now |
| --- | --- | --- | --- |
| ISSUE-014 | `KEEP_FOR_COMPATIBILITY` (2 groups) | P3, no code change | breaks contract tests, business-flow scripts, or unknown external callers |
| ISSUE-015 | `KEEP_FOR_COMPATIBILITY` | P3, no code change | breaks audit/AI scripts and any historical deep link or notification target |
| ISSUE-016 | `KEEP_AS_SECONDARY` | P3, no code change | reconnecting displaces a main path; removing breaks PostDetail fallback and existing browsing |

Two follow-ups worth recording for after the RC: `users/:id/tags` has no persistence and should
either gain it or be deprecated, and the merge candidates in ISSUE-014 Group B need real deployment
traffic data before anything is removed.
