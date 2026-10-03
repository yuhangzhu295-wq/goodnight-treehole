# FINAL PRODUCT CLOSURE

**`FULL_PRODUCT_VERIFIED` = `false`.**

The closure round closed every issue it was given, plus the one remaining P1. It did **not** reach
`FULL_PRODUCT_VERIFIED`, because one gate is still false for a reason outside the repository: the
DeepSeek (DAPI) account returns **HTTP 402**, so the one test that asserts a live model answer cannot
pass. Per the round's own rule, the `product-closure-verified` tag was **not** created.

```
OPEN_P0=0
OPEN_P1=0
FAKE_BUTTON_COUNT=0
FAKE_FUNCTION_COUNT=0
ALL_CORE_FLOW=true
ANDROID_VERIFIED=true
ADMIN_VERIFIED=true
QA_ALL_PASS=false        <-- 13 of 14 steps pass; test:cross is blocked on the DAPI balance
BACKUP_SAFE=false        <-- bundle/mirror/pg_dump/evidence all verified; 8 commits not pushed
```

## What this round changed

| Commit | What it fixes |
| --- | --- |
| `ad3ae74` | **Prisma runtime sync blocker.** `apps/api` declared `@prisma/client@^7.8.0` while the CLI, the root devDependency and the schema generator were all 5.22. Prisma 7 dropped the `prisma-client-js` generated-client layout, so `prisma generate` wrote `.prisma/client` into the 5.22 package while `apps/api` resolved the 7.8 package, which ships no generated client. No schema change could ever reach the runtime. |
| `506162c` | **ISSUE-025 data layer.** `SafetyEvent` gains `status` / `handledAt` / `handledBy` / `note`; the journey-create path persists the triggering excerpt; `handleSafetyEvent` mutates in memory only so the caller commits the state change and its audit row in one transaction. Also drops an unreachable `'critical'` level from the safety-first check. |
| `c1f0642` | **ISSUE-025 operator surface, ISSUE-026, ISSUE-028.** A real `PATCH safety/events/:id/handle` with an audit-logged write; the safety page renders the trigger text and handled state with working 标记为已处理 / 重新打开 actions. Every experience/safety list route now filters on the `q` the search box already sent, the page size is honoured and clamped, and `TablePage` has a working pager and page-size control. The peer-conversation table and drawer render report state, reason and time with a real 已举报 filter. |
| `427c647` | **ISSUE-007 product side (the last open P1).** Every AI surface accepted the job status `fallback` and rendered canned template text as if it were a model reply. Six surfaces now carry a real, status-driven notice that says the content is a safety fallback, not a live model answer. |
| `2d0faf8` | Stale admin visual spec that could never pass. |
| `9d4b8e4` | Click diagnostics no longer require a funded provider to test clickability. |

## The five items the round was asked to close

### 1. ISSUE-025 - safety event admin closed loop — FIXED_VERIFIED

The chain the round specified, verified end to end:

```
user triggers risk  ->  SafetyEvent  ->  admin sees it  ->  handles it  ->  status update  ->  AuditLog
```

- **User triggers risk.** Driven through the real route in two places: the HTTP flow
  (`work/verify-safety-closure.mjs`) and the **native Android app** — typing the risk text into the
  real 今晚 page routed to the safety-first screen and created a real `SafetyEvent` row
  (`work/verify-android-native.mjs` run, row `safety_f4c65b1baa`).
- **SafetyEvent.** Created with the triggering excerpt persisted, so the operator can see *why* the
  event fired. Previously the payload held only `{escalation:true}` and the text was invisible.
- **Admin sees it.** The safety page lists the trigger text, the source and the handled state; the
  detail drawer adds handler, time and note.
- **Handles it / status update.** `PATCH /api/admin/v1/safety/events/:id/handle` — a real write that
  records actor, time and note, and can reopen an event.
- **AuditLog.** `SAFETY_EVENT_HANDLE` with `before.status=open` and `after.status=handled`, committed
  in the same transaction as the state change.
- **No fake button.** The action was clicked in a real browser (`work/verify-admin-closure-ui.mjs`),
  the table refreshed, the row left the 待处理 filter, and the new state was read back from PostgreSQL.

Verification: `work/verify-safety-closure.mjs` 19/19, `work/verify-admin-closure-ui.mjs` 18/18,
`work/verify-android-native.mjs` 8/8.

### 2. ISSUE-026 - admin search / pagination — FIXED_VERIFIED

`q`, `page` and `pageSize` were sent by the shared search box but read by **no handler** in the
experience or safety groups, and no page beyond 1 was reachable because `TablePage` had no pager.
`journeys?q=zzzznomatch` returned the same rows as no query.

All 11 routes in the two groups now filter on `q` over their real fields and page over the real
dataset. `TablePage` gained a pager and a page-size control, and the 11 routes got nav test ids
instead of `data-testid="undefined"`.

Verification: `work/verify-admin-search-pagination.mjs` 58/58 (search hit, search miss → 0 rows,
page size honoured, total is the full dataset, page 2 disjoint from page 1, page size clamped, for
each of journeys, actions, checkins, peer-experiences, peer-matches, follow-ups, notifications,
peer-conversations, safety-events, support-plans, memory), plus the browser pager check.

Note on "real database pagination": this product loads its PostgreSQL state into an authoritative
in-memory store and flushes writes back (the same architecture the rest of the admin already uses).
The list endpoints therefore page over that store, which is the DB-backed dataset — not a stub and
not a client-side slice. Rewriting admin lists to issue per-request SQL would be an architecture
change, which this round was explicitly told not to make.

### 3. ISSUE-028 - peer conversation report — FIXED_VERIFIED

`reportedAt`, `reportReason` and `reporterUserId` were written by the user report route and returned
by the admin list, but never rendered, so a reported conversation looked identical to a normal one.
The conversation table now shows 举报状态 / 举报原因 / 举报时间, the drawer adds the reporter, and a
real 已举报 filter reaches the API.

Verification: `work/verify-peer-report-admin.mjs` 24/24 through the real two-user flow (privacy →
consent → published experiences → match → request → connect → consent → conversation → report),
asserting the operator-visible fields, the filter, the search, and PostgreSQL persistence. It also
pins that the *user*-facing projection does not leak the reporter identity.

### 4. Prisma environment blocker — FIXED_VERIFIED

Root cause: two `@prisma/client` versions in the workspace, with the generated client written into
the wrong one. Fixed by pinning `apps/api` to 5.22.0, then, as the round required: deleting the old
generated client, regenerating, and verifying the runtime.

Proof the blocker is really gone — the ISSUE-025 migration added four columns and the runtime client
picked them up immediately (sample row keys include `status,handledAt,handledBy,note`), which was
impossible before.

Also found and removed: an empty, untracked `prisma/migrations/20261001000000_action_plan_mode/`
directory that made every `prisma migrate` command fail with P3015.

### 5. DAPI — BLOCKED_EXTERNAL

Kept real; nothing was simulated.

| Provider | Result |
| --- | --- |
| `provider_dapi_deepseek` (primary) | **HTTP 402** — `Remote provider returned HTTP 402.` |
| `provider_openai_remote` (secondary) | **HTTP 401** |
| `provider_qwen` (local model) | `enabled=false`, `disabled://local-model` — no local model can stand in |
| `OLLAMA_ENABLED` / `AI_LOCAL_MODEL_ENABLED` | `false` |

117 of 123 AI jobs in the database are `fallback`; the 6 successes predate the balance running out.
No model was substituted to make an AI surface look healthy, and the round's own rule is followed:
the 402 is recorded as `BLOCKED_EXTERNAL`, never as a pass.

The one useful consequence: the failure is now *reproducible on demand*, which is what made the
ISSUE-007 degradation path verifiable rather than blocked.

## ISSUE-007 - the last open P1, closed on the product side

The register carried ISSUE-007 as the only open P1 with two halves. The external half (a funded
account) is still `BLOCKED_EXTERNAL`. The product half — "no mp view surfaces the failure; the
fallback text is presented as a normal AI result" — is fixed.

Six surfaces that display AI results now carry a status-driven notice
(`apps/mp/src/aiStatus.ts` + `AiDegradationNotice.vue`): the daily letter, tool run, emotion
decompose, the action plan, the monthly report and journey analysis. `PeerConversation` already
refused non-succeeded assists and was left alone.

Verification: `work/verify-ai-degradation-ui.mjs` 9/9 — it first proves the provider really is
refusing (402), then drives the real tool and decompose flows and asserts the notice appears, and
finally pins the classifier contract (a `succeeded` job yields no notice; `fallback` and `failed`
yield theirs). Confirmed again on the **native Android app** in `work/verify-android-native.mjs`.

## Product surface measured in this round

| Dimension | Count | How measured |
| --- | --- | --- |
| MP routes | 55 | `apps/mp/src/router.ts` |
| MP views | 39 | `apps/mp/src/views/*.vue` |
| Admin resources | 24 | 13 dedicated pages + 11 `TablePage` resources |
| Admin routes | 39 | `apps/admin/src/router.ts` |
| API route handlers | 267 | `@Get/@Post/@Put/@Patch/@Delete` in `apps/api/src/controllers.ts` |
| Prisma models / enums | 51 / 18 | `prisma/schema.prisma` |
| Tracked migrations | 10 | `git ls-files prisma/migrations` |

## Verification evidence for this round

| Suite | Result |
| --- | --- |
| `work/verify-safety-closure.mjs` | 19/19 |
| `work/verify-admin-search-pagination.mjs` | 58/58 |
| `work/verify-peer-report-admin.mjs` | 24/24 |
| `work/verify-admin-closure-ui.mjs` (real browser) | 18/18 |
| `work/verify-ai-degradation-ui.mjs` (real browser, real 402) | 9/9 |
| `work/verify-android-native.mjs` (real emulator WebView) | 8/8 |
| Prior-round regressions (`verify-fixed-issues`, `verify-settings-enforced`, `verify-login-throttle`, `verify-privacy-data`, `verify-hug`, `verify-admin-error-visible`, `verify-core-flow`) | 9/9, 7/7, 7/7, 8/8, 7/7, 4/4, 15/15 — no regressions |

## Why the tag was not created

Two gates are false, for two different reasons.

**1. `QA_ALL_PASS=false` — externally blocked.** The round's rule is explicit: the tag requires
`QA_ALL_PASS=true`, among other gates. `pnpm qa:all` runs 14 steps; 13 pass and the 14th is
`test:cross`, whose single failing case is `uses the supplied remote DAPI and persists the completed
AiJob`. That test exists to prove the live provider path works — it asserts
`providerId: 'provider_dapi_deepseek'`, `status: 'succeeded'`, `fallbackUsed: false`. It cannot pass
while the account returns 402, and weakening it to accept a fallback would delete the only test that
covers the real DAPI integration. It was therefore left intact and the gate is reported as false.

**2. `BACKUP_SAFE=false` — one push short.** `scripts/backup-all.ps1` produced and verified the
bundle (53,680,223 bytes), the mirror, the `pg_dump` (18,742,030 bytes, 34,470 entries, 52 live
tables) and the evidence archive (28,474,212 bytes, 89 files, now including
`artifacts/product-closure`). The only failing component is `backup-code`'s integrity check: the
branch is 8 commits ahead of `origin/codex/post-recovery-validation`. Publishing to GitHub was not
authorised in this round, so it was not done — `git push` on this branch is the single action needed.

To reach `FULL_PRODUCT_VERIFIED`: fund the DeepSeek account (or supply a working primary key), push
the branch, then re-run `pnpm test:cross` and `pnpm qa:all`. Every other gate in the list is already
satisfied and reproducible from the commands in `CURRENT_CLOSURE_STATUS.md`.

## Remaining open items (recorded, not hidden)

| Item | Severity | Status |
| --- | --- | --- |
| ISSUE-020 report history | P2 | OPEN — `PeerExperience.reportCount` now persists, but there is no per-report history model, so an individual report is overwritten by a later one |
| ISSUE-027 user note persistence | P2 | OPEN — `userNote` still writes only an `AuditLog` row; `User` has no note field. No longer blocked by Prisma |
| `20261001000000_action_plan_mode` migration SQL | P2 | OPEN — applied in the database, missing from the repository; needs the original file or a shadow-DB reconstruction |
| ISSUE-014 / 015 / 016 | P3 | OPEN — product decisions (orphan endpoints, dead aliases, Square reachability), not defects |
| Two pre-existing schema/DB drift items | P3 | OPEN — an extra `DecisionRecord` index and a `MemoryItem.updatedAt` default; unrelated to this round |
