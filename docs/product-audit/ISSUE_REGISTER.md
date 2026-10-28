# ISSUE REGISTER

> ## SUPERSEDED STATUS NOTICE — historical discovery snapshot
>
> This file is the **frozen record of the discovery round** at HEAD `158c298`. Its per-issue
> `Status:` lines are what was true *then*, and they have deliberately **not** been rewritten, so the
> audit trail survives. Several are now wrong: issues recorded here as `OPEN` were fixed in later
> rounds and their `Status:` lines were not updated to say so.
>
> Do not read this file for current status. Current status lives in, in order of recency:
>
> | Document | Scope |
> | --- | --- |
> | [`docs/product-closure/RC_STATUS.md`](../product-closure/RC_STATUS.md) | current gate values and open items |
> | [`docs/product-closure/RC_QA_MATRIX.md`](../product-closure/RC_QA_MATRIX.md) | every suite and its result |
> | [`docs/product-closure/CURRENT_CLOSURE_STATUS.md`](../product-closure/CURRENT_CLOSURE_STATUS.md) | the full issue ledger with evidence |
> | [`docs/product-closure/CLOSURE_REGISTER.md`](../product-closure/CLOSURE_REGISTER.md) | the first closure round's register |
>
> Known-stale entries as of the release-candidate round: ISSUE-020 (report counter), ISSUE-021,
> ISSUE-022, ISSUE-023, ISSUE-024, ISSUE-025, ISSUE-026, ISSUE-027 and ISSUE-028 are marked `OPEN`
> here and are all fixed and verified. ISSUE-014, ISSUE-015 and ISSUE-016 remain open by decision,
> recorded in [`PRODUCT_DECISIONS.md`](../product-closure/PRODUCT_DECISIONS.md).
>
> A prior round also recorded `20261001000000_action_plan_mode` as a missing migration. That is
> resolved: the schema it described is already produced by the tracked migrations, and the orphan
> ledger row was removed. See
> [`docs/architecture/MIGRATION_FORENSICS.md`](../architecture/MIGRATION_FORENSICS.md).

Consolidated findings for the COMPLETE PRODUCT GRAPH AUDIT run at HEAD `158c298`.
Every issue below is either verified against the running stack (API `127.0.0.1:3000`,
PostgreSQL `127.0.0.1:15432`, Android `emulator-5554` with the real debug APK) or is
explicitly marked `STATIC_ONLY`.

Severity follows section 116 of the task: P0 crash/data corruption/security/global API
failure; P1 core flow broken, fake save, fake function, ownership, admin inconsistency;
P2 secondary flow, navigation, keyboard, error state; P3 visual/low-priority UX.

## Summary

| Severity | Count |
| --- | ---: |
| P0 | 1 |
| P1 | 8 |
| P2 | 12 |
| P3 | 5 |

---

## ISSUE-001 - Admin API has no server-side authorization; destructive endpoints are open

**FIXED in `356457f`.** An `AdminAuthGuard` now covers `AdminController` with the three
credential routes on the public allow-list. Re-verified live: every previously open
endpoint answers 401 without a token and 200 with one; a forged token answers 401.

- Severity: **P0**
- Category: SECURITY
- Evidence: `apps/api/src/controllers.ts` (AdminController, `@Controller('api/admin/v1')`).
  `work/audit-admin-guards.mjs` parses the controller and finds **58 of 100 admin handlers
  with no `this.admin(auth)` guard and no `@Headers('authorization')`**, leaving only the
  three public auth routes legitimate.
- Live proof (`work/verify-unauth-delete.mjs`, run against the real API with **no**
  `authorization` header):
  - `GET /api/admin/v1/users` -> `200` with the full user list.
  - `GET /api/admin/v1/audit-logs` -> `200` with admin audit records.
  - `GET /api/admin/v1/dashboard/overview` -> `200`.
  - `DELETE /api/admin/v1/posts/<id>` -> `200 {"ok":true}`; the record was then `404` on
    the public read route, i.e. the deletion really happened.
  - `DELETE /api/admin/v1/users/<id>/data` -> `200 {"ok":true}`.
  - `POST /api/admin/v1/posts/<id>/regenerate-replies` -> `201`, a real AI job enqueued.
  - For contrast, `PATCH /api/admin/v1/users/:id/status` and `PATCH /api/admin/v1/config`
    correctly answer `401` - so the guard exists but is applied inconsistently.
- Impact: anyone who can reach the API can read all users, audit logs and dashboards, and
  can delete posts and wipe user data. Admin-only surfaces are effectively public.
- Root cause: authorization is per-handler (`this.admin(auth)`) instead of a Nest guard on
  the controller, so any handler that forgets the call is silently open.
- Minimal fix: add a controller-level guard (or a global interceptor) that requires a valid
  admin token for every `api/admin/v1` route except `auth/login`, `login`, `auth/logout`,
  then delete the now-redundant per-handler checks only after the guard is proven.
- Status: FIXED (`356457f`), verified.

## ISSUE-002 - Admin user export claims success but produces nothing

**FIXED in `91ba899`.**

- Severity: **P1**
- Category: FAKE_FUNCTION
- Evidence: `apps/admin/src/views/UsersPage.vue:104` (handler `exportUsers`, duplicated at
  `apps/admin/src/views/TablePage.vue:471`).
- Live proof: `GET /api/admin/v1/users/export` returns `200` with body `{}` (2 bytes) both
  with and without an admin token, while `GET /api/admin/v1/users/user_demo` returns the
  real record. Root cause: `@Get('users/export')` is declared at `controllers.ts:2138`,
  after `@Get('users/:id')` at `controllers.ts:2102`, so Nest matches `export` as an `:id`.
- Second defect: even if reached, `controllers.ts:2138-2147` fabricates
  `downloadUrl: /exports/users-<ts>.json`; no code writes that file and no route serves it.
- Impact: the operator is shown an export-success message for a file that does not exist.
- Minimal fix: declare the literal `users/export` route before `users/:id`, and generate a
  real file through the existing `createJourneyArchiveExport`/`exports/:assetId/download`
  mechanism instead of inventing a URL.
- Status: FIXED (`91ba899`), verified in the real admin UI: the button downloads
  `goodnight-treehole-users-<date>.json` with `format: goodnight-treehole-user-export/v1`.

## ISSUE-003 - 15 of 19 admin system settings are write-only

**ADDRESSED in `510742f`.** The 15 write-only keys are now marked in the console as
"仅保存，当前版本未接入业务逻辑", driven by `ENFORCED_SETTING_KEYS` in the API, so the
operator is no longer told that every field changes behaviour.

- Severity: **P1**
- Category: FAKE_FUNCTION
- Evidence: `apps/admin/src/views/ConfigPage.vue:18-49` (mirror `TablePage.vue:817-839`).
  `PUT /api/admin/v1/system/settings` (`controllers.ts:2934-2962`) persists all keys into
  `SystemSetting`, but 15 of them are never read by any backend logic.
- Impact: the operator changes a setting, sees it saved, and nothing in the product
  changes. This is a fake capability even though the DB write is real.
- Minimal fix: either wire each setting to the behaviour it claims to control, or remove
  the control from the UI. Do not leave a control that silently does nothing.
- Status: OPEN (partially addressed). The misleading UI is fixed; wiring the 15 settings
  into real behaviour is still outstanding. The four AI keys were deliberately not wired:
  that path cannot be verified while DAPI answers HTTP 402.

## ISSUE-004 - The tool subtree cannot be reached by tapping through the app

**FIXED in `082dca0`.** An 情绪小工具 entry was added to the Me page. Verified on the
rebuilt APK: Me -> tool index -> a tool, by tapping real controls.

- Severity: **P1**
- Category: ORPHAN / NAVIGATION
- Evidence: `docs/product-audit/discovery-agent1-page-graph.md` section 3. `ToolIndex.vue`
  (`/pages/tool/index`) has no inbound control anywhere in `apps/mp/src`; it is the only
  view that links to `ToolDecompose` and `ToolRun`, so all three (plus the six
  `/pages/tool/*` aliases) are reachable only by typing the URL.
- Confirmed independently: `ToolIndex.vue` pushes to `/pages/tool/run` and `/pages/letter/today`,
  and a repo-wide search finds no `router.push('/pages/tool/index')` and no `RouterLink` to it.
- Impact: an entire product area (情绪拆解 / 情绪工具) is dead for a real user.
- Status: FIXED (`082dca0`), verified on device.

## ISSUE-005 - The peer privacy-boundary button navigates to a route that does not exist

**FIXED in `082dca0`.**

- Severity: **P2**
- Category: NAVIGATION / FAKE_BUTTON
- Evidence: `apps/mp/src/views/PeerNetwork.vue:63`,
  `@click="router.push('/pages/privacy/index')"`. `apps/mp/src/router.ts` has no
  `/pages/privacy/index`; the real route is `/pages/settings/privacy`.
- Impact: the 看看隐私边界 control is a dead end on the page whose whole purpose is privacy.
- Minimal fix: change the target to `/pages/settings/privacy`.
- Status: FIXED (`082dca0`), verified on device and in the browser.

## ISSUE-006 - Support-intent branches collapse; the recorded intent does not drive the UI

- Severity: **P1**
- Category: STATE_MACHINE
- Evidence: `apps/mp/src/views/JourneyDetail.vue:93-103`. All eight `SupportIntent` values
  are offered and accepted, but only `HIGH_DISTRESS` (line 98) and `JUST_LISTEN` (line 99)
  are special-cased. `STOP_IMPULSE` (`?section=vault`), `PREPARE_CONVERSATION`
  (`?section=handoff`) and `SEE_OUTCOMES` (`?view=outcomes`) carry query parameters that no
  mp view reads, so those branches land on the same generic screens as `NEXT_STEP` and
  `FIND_PEOPLE`.
- Impact: the product asks the user to choose what they need, records the answer, and then
  ignores it. This is a core-flow state-machine defect, not a cosmetic one.
- Status: OPEN.

## ISSUE-007 - AI degradation is invisible to the user and to the operator

- Severity: **P1**
- Category: AI
- Evidence: every `AIJob` in the live database terminates as `status = fallback` with
  `errorMessage = provider_dapi_deepseek: Remote provider returned HTTP 402`
  (`work/q-aijobs.sql` output, 8/8 most recent jobs). No mp view reads `generationStatus`
  or surfaces the failure; the fallback text is presented as a normal AI result.
- Impact: with no DAPI balance the product silently degrades to canned text while telling
  the user nothing, and the operator only sees it in the admin AI job table.
- External dependency: `BLOCKED_DAPI_BALANCE` - the owner must fund the DeepSeek account.
  This is recorded as a blocker, never as a pass (task section 149).
- Status: BLOCKED (external). The product-side finding (no user-visible degradation signal)
  is OPEN.

## ISSUE-008 - ActionCenter "regenerate a smaller version" re-runs the same request

- Severity: **P2**
- Category: FUNCTIONAL
- Evidence: `apps/mp/src/views/ActionCenter.vue:324` and `:326` - both `@request` and
  `@smaller` are bound to `requestTonightAction`, so 换一个更小的版本 re-queues an identical
  `action_plan` job instead of producing a narrower one.
- Status: OPEN.

## ISSUE-009 - Follow-up and history are computed but never rendered

- Severity: **P2**
- Category: FUNCTIONAL / UX
- Evidence: `apps/mp/src/views/ActionCenter.vue:40-41` computes `dueCheckins` and
  `primaryFollowUp`; they are used only to derive `dueAt` (line 54) and never rendered as a
  control. The `?section=follow-up` target emitted by the follow-up worker
  (`apps/api/src/follow-up-worker.service.ts`) is never read by any view, so a due check-in
  has no way to be completed.
- Impact: the follow-up half of the core loop has no user-facing entry point.
- Status: OPEN.

## ISSUE-010 - Notification targets do not restore the intended state

- Severity: **P2**
- Category: NAVIGATION / STATE_MACHINE
- Evidence: `docs/product-audit/pages/mp/NotificationCenter.md`. Each notification type
  reaches the correct route but not the correct state, because the `targetRoute` query
  parameters (`?section=`, `?view=`, `?journeyId=`) are not consumed by the destination
  views. Separately, marking a notification read and navigating share one `try` block
  (`NotificationCenter.vue:27`), so a failed read-receipt blocks the tap-through.
- Status: OPEN.

## ISSUE-011 - Journey completion and handoff sharing are implemented but unreachable

- Severity: **P2**
- Category: ORPHAN
- Evidence: `docs/product-audit/discovery-agent2-business-graph.md` section 7. No mp file
  calls `POST /api/v1/journeys/:id/graduate` or `/graduation-consent`, so
  `JourneyStatus.completed` and the `PeerExperience` draft they would write are never
  produced from the UI. Likewise `POST /api/v1/handoffs/:id/share` is never called, so
  `HandoffStatus.draft/completed` are unreached.
- Impact: dead API surface; the graduation and handoff-sharing product stories have no UI.
- Status: OPEN.

## ISSUE-012 - Admin login captcha is decorative

- Severity: **P2**
- Category: FAKE_BUTTON
- Evidence: `apps/admin/src/views/Login.vue:119-127`. `login()` posts only
  `{ username, password }`, and the API accepts only those two fields
  (`controllers.ts:1856-1861`); the captcha value is never validated on either side.
- Status: OPEN.

## ISSUE-013 - Admin login has no server-side rate limiting

- Severity: **P2**
- Category: SECURITY
- Evidence: `POST /api/admin/v1/auth/login` (`controllers.ts:1856`) accepts unlimited
  attempts; no lockout or throttling was found in the handler or the module.
- Status: OPEN.

## ISSUE-014 - 39 of 100 admin endpoints have no reachable caller

- Severity: **P3**
- Category: ORPHAN
- Evidence: `docs/product-audit/discovery-agent4-api-db-admin.md` section 2 - 7 duplicate
  routes plus 32 endpoints with no caller at all.
- Impact: maintenance surface and a drift risk, not a user-visible defect.
- Status: OPEN (recorded, not fixed).

## ISSUE-015 - Dead alias routes

- Severity: **P3**
- Category: ORPHAN / TEST_CONTRACT
- Evidence: `docs/product-audit/discovery-agent1-page-graph.md` section 4 - 7 tool alias
  paths are dead and 6 more are redundant but harmless.
- Status: OPEN (recorded; task section 114 forbids deleting legacy paths this round).

## ISSUE-016 - Square is not reachable from the bottom tab bar

- Severity: **P3**
- Category: NAVIGATION
- Evidence: `apps/mp/src/App.vue:62-98` - the four tabs are 今晚 / 同路 / 行动 / 我的;
  `Square.vue` is reachable only through PostDetail's 屏蔽 action or a no-history fallback.
- Status: OPEN (recorded).

---

## ISSUE-017 - Cross-user read of another person's letters

**FIXED in `ea52129`.**

- Severity: **P1**
- Category: SECURITY / PRIVACY
- Evidence: `apps/api/src/controllers.ts:1065-1069` -
  `@Get('letters/:id')` does `this.store.letters.find((item) => item.id === id)` with no
  user filter and no ownership check. The whole letter surface also resolves the user via
  `getDemoUserId()` and ignores the `x-goodnight-user-id` header.
- Live proof (`work/verify-ownership.mjs`): `GET /api/v1/letters/letter_today` returns the
  same letter body (`userId: user_demo`) for `x-goodnight-user-id: user_demo`,
  `user_attacker` and `user_guest`.
- Impact: a private reflective letter is readable by any caller who knows an id.
- Minimal fix: resolve the caller from the request and require
  `letter.userId === callerId` before returning; return 404 otherwise, matching the pattern
  already used by `/api/v1/me/support-plan` and `/api/v1/memory`, which correctly answer
  `404 当前匿名会话用户不存在` for an unknown user.
- Status: FIXED (`ea52129`). Verified: another user now gets 404 while the owner still
  gets 200.

## ISSUE-018 - Cross-user read of peer experience details

**FIXED in `ea52129`.**

- Severity: **P1**
- Category: SECURITY / PRIVACY
- Evidence: `apps/api/src/controllers.ts:540-543` -
  `@Get('peer-experiences/:id')` returns `this.store.peerExperienceDetail(id)` with no
  viewer check, and `allowPeerMatching` is only consulted in `peerNetwork`
  (`store.service.ts:3707`), so revoking peer matching does not gate this read.
- Impact: a shared peer experience is readable across users by id, regardless of the
  owner's privacy setting.
- Minimal fix: require the caller to be the owner or an actively matched peer, and honour
  `allowPeerMatching` / `allowAnonymousExperienceShare` on the read path.
- Status: FIXED (`ea52129`). Verified: the owner gets 200, an unrelated user gets 403, and
  a user with `allowPeerMatching` off gets 403.

## ISSUE-019 - Cross-user read of reality-handoff cards

**FIXED in `ea52129`.**

- Severity: **P1**
- Category: SECURITY / PRIVACY
- Evidence: `apps/api/src/controllers.ts:604-607` - `@Get('handoffs')` returns
  `this.store.handoffList()` (`store.service.ts:4503`) with no user argument.
- Live proof: `GET /api/v1/handoffs` with `x-goodnight-user-id: user_attacker` returns
  `user_demo`'s handoff, including its `summary` ("我最近有点撑不住...") and recipient.
- Impact: this is the most sensitive text in the product - a person's statement that they
  are not coping - exposed to any caller.
- Minimal fix: accept the caller id and filter `handoffList(userId)`; return only that
  user's cards.
- Status: FIXED (`ea52129`). Verified: an unknown caller now gets 404 and the owner still
  gets their own cards.

---

## ISSUE-020 - Hug and report counters are unbounded and un-auditable

- Severity: **P2**
- Category: DATA
- Evidence: `apps/api/src/controllers.ts:799-806` (`POST /api/v1/posts/:id/hug`) and
  `:838-845` (`POST /api/v1/posts/:id/report`) increment `post.hugCount` / `post.reportCount`
  directly, with no per-user record and no de-duplication. The `HugAction` Prisma model
  exists but is never written anywhere in the API (confirmed by `docs/product-audit/discovery-agent4-api-db-admin.md`).
- Impact: repeating the same request inflates the count without limit, and there is no way
  to tell who reacted or to prevent double-counting.
- Minimal fix: write a `HugAction` row keyed by (userId, postId) and derive the counter from
  it, so a repeat request is idempotent.
- Status: OPEN.

## ISSUE-021 - Monthly report ignores the recovery-data privacy gate and the caller identity

- Severity: **P2**
- Category: PRIVACY
- Evidence: `apps/api/src/monthly-report.service.ts` aggregates `RecoverySnapshot`,
  `DecisionRecord` and check-ins for the month (lines 150-175) without consulting
  `allowRecoveryData`, while every other recovery read in the product does
  (`store.service.ts:3501`, `:4310`, `:4692`). `apps/api/src/controllers.ts:1569-1586` also
  exposes `reports/monthly`, `report/month`, `me/month-report`, `reports/monthly/months`,
  `.../advice` and `.../poster` with no user parameter, so the report is built for the
  demo user regardless of who asked.
- Impact: a user who has switched off recovery-data use still gets recovery-derived numbers
  in their monthly report.
- Minimal fix: gate `recoveryFactsFor` on `privacyAllows(userId, 'allowRecoveryData')` and
  resolve `userId` from the request instead of `getDemoUserId()`.
- Status: OPEN.

## ISSUE-022 - MemoryCenter gates the wrong flag and silently re-enables disabled memories

- Severity: **P2**
- Category: PRIVACY / STATE_MACHINE
- Evidence: `apps/mp/src/views/MemoryCenter.vue:63` reads `allowLongTermMemory` for the
  已关闭 banner and the composer, but the flag that actually stops memories reaching a model
  is `allowAiMemoryUse` (`apps/api/src/store.service.ts:4796`). The two are independent
  columns (`store.service.ts:2352-2353`). Separately, saving the edit form makes the server
  set `status = 'active'` whenever `days` is present, silently re-activating a memory the
  user had disabled.
- Impact: the page can tell the user "任何 AI 任务都不能读取" while memories are still
  injected, or show no warning while the AI receives nothing; and a disabled memory can come
  back to life without the user asking.
- Minimal fix: read and write `allowAiMemoryUse` for the AI-use claim, and require an
  explicit status change rather than inferring it from `days`.
- Status: OPEN.

---

## ISSUE-023 - Six of seven admin content pages hide their own error state

- Severity: **P2**
- Category: UX
- Evidence: `.users-status { display: none }` (`apps/admin/src/views/UsersPage.vue:243`),
  the `visually-hidden` status in `RepliesPage.vue:214` and `ConfigPage.vue:281-292`,
  `.filter-status` hidden at >=1240px in `PostsPage.vue:358`, and the clipped ticket status
  in `FeedbackTicketsPage.vue:244`. Only the audit log page renders its error visibly.
- Impact: a failed load or a rejected write is silent on six of seven screens. This is why
  the export defect (ISSUE-002) could persist unnoticed.
- Minimal fix: render the status element visibly on failure (or use a toast) and keep
  `role="status"` for screen readers.
- Status: OPEN.

## ISSUE-024 - Admin support-plans shows "[object Object]" and a column that does not exist

- Severity: **P2**
- Category: DATA
- Evidence: `apps/admin/src/views/TablePage.vue:763` renders `text(row.plan)`; `plan` is a
  JSON object, so the drawer prints the literal `[object Object]`. The 状态 column reads
  `row.status`, but `PersonalSupportPlan` has no `status` field - only `active`
  (`prisma/schema.prisma:646`) - so the column is `-` on every row.
- Impact: an operator cannot read a user's support plan at all, which is the one thing this
  resource exists for.
- Minimal fix: render the known `plan` sub-fields, and bind the column to `active`.
- Status: OPEN.

## ISSUE-025 - Admin safety-events has no handled state and hides the triggering text

- Severity: **P2**
- Category: FUNCTIONAL
- Evidence: there is no write button and no `safety` write endpoint, so a high-risk event
  stays in the queue with no way to mark it handled. `SafetyEvent` stores only
  `action`/`payload` and the payload is not rendered, so the text that triggered the
  judgment is invisible. `detectRisk` only ever returns `high`/`low`
  (`apps/api/src/store.service.ts:5008`), so the `critical` branch is dead code.
- Impact: the safety queue cannot be worked, and the operator cannot see why an event was
  raised. For a product whose HIGH_DISTRESS path is the most important flow, this is the
  weakest operator surface in the admin app.
- Minimal fix: persist and render the triggering excerpt, add a handled/acknowledged state
  with an audit-logged write, and remove or implement the dead `critical` branch.
- Status: OPEN.

## ISSUE-026 - Admin list search and pagination do not work for the experience/safety resources

- Severity: **P3**
- Category: FUNCTIONAL
- Evidence: the search box sends `q` but no handler in the `experience/*` / `safety/*` group
  reads it - verified live, `journeys?q=zzzznomatch` returns the same 5/5 rows. Pagination is
  pinned to `page=1&pageSize=20` with no pager control in the template, so more than 20 rows
  truncate silently. Also, none of these 11 routes are in `navTestIds`, so their sidebar
  links carry `data-testid=undefined`.
- Status: OPEN (recorded).

## ISSUE-027 - Admin user note is write-only and disappears on reload

- Severity: **P2**
- Category: DATA
- Evidence: `userNote` (`apps/api/src/controllers.ts:2122-2136`) writes only an `AuditLog`
  row; `model User` has no `note` field (`prisma/schema.prisma`), and
  `apps/admin/src/views/UsersPage.vue:68` reads a `user.note` the list payload never carries.
- Impact: the operator saves a note, sees it accepted, and loses it on the next load.
- Status: OPEN.

## ISSUE-028 - Admin peer-conversations hides reports

- Severity: **P3**
- Category: UX
- Evidence: `reportedAt` / `reportReason` are written when a user reports a conversation but
  are never rendered, so a reported conversation looks identical to a normal one.
- Status: OPEN (recorded).

---

## Confirmed NOT issues (cleared during discovery)

These were candidates that turned out to be real behaviour and must not be "fixed":

- `setTimeout` in every mp view is an AI-job **poll interval** against
  `GET /api/v1/ai/tasks/:id`; no AI result is synthesised on the client. There is no
  `Math.random` in either front end.
- `localStorage` is used for the admin auth token and for a genuine device-cache clearing
  action, never as a substitute for server persistence.
- Peer matches are computed server-side (`store.service.ts:3800`) and persisted; the client
  only reads `GET /api/v1/peers`.
- Monthly report figures come from real aggregation (`monthly-report.service.ts`), not from
  generated numbers.
- FutureSelf delivery is a real BullMQ job plus worker that stamps `deliveredAt` and creates
  a notification.
- Archive export writes a real file served by `GET /api/v1/exports/:assetId/download`.

## Scope of this run

Per task sections 117-119 the discovery had to be frozen before any code change, and per
section 118 fixes must be applied one issue class at a time with a targeted test and a full
regression each time. This run completed the discovery, the freeze, the runtime verification
and the report set. The P0/P1 code fixes are specified above with a minimal fix each but were
**not applied**, so `FULL_PRODUCT_VERIFIED` is `false` (see
`docs/product-audit/FINAL_FULL_PRODUCT_AUDIT.md`).
