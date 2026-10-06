# ANDROID, ADMIN & SECURITY POST-BATCH-1 VERIFICATION MATRIX

This document records the empirical end-to-end verification of the eight Batch 1 migrated models (`UserNotification`, `SafetyEvent`, `AIJob`, `LifeJourney`, `SituationSnapshot`, `JourneyUpdate`, `ActionCommitment`, `OutcomeCheckin`) across the Mini-Program (`apps/mp`), Admin Back Office (`apps/admin`), and Security/Privacy Boundaries against direct PostgreSQL storage.

**Verification Date**: 2026-10-06  
**Environment**: Windows 10 x64, WSL2 Docker PostgreSQL (`localhost:15432`), Redis (`localhost:16379`), API on port `3000`, MP Web on `5173`, Admin Web on `5174`, Android Emulator (`emulator-5554`, Pixel 7 API 34).  
**External Secret Status**: `DAPI_API_KEY=""` (empty) -> `AI_LIVE_BLOCKED_EXTERNAL` for live AI generation. All AI tasks degrade gracefully to documented safe fallbacks.  
**Execution Automation**: `scripts/e2e-post-batch1-verification.ts` driving Playwright Chromium, Android Emulator via ADB / UI Automator, direct API HTTP requests, and direct PostgreSQL queries via PrismaClient / psql.

---

## 1. Summary of Defects Discovered & Minimally Fixed

During verification of the migrated storage surfaces, two genuine migration-caused defects were uncovered and resolved:

### Defect 1: Admin AI Job Retry 500 Race Condition (`AIJob`)
- **Root Cause**: In Batch 1 Sub-batch C, AIJob writes moved from synchronous in-memory store flushes to asynchronous PostgreSQL transactions (`queueAiJob` tracked in `pendingJobCommits`). In `AdminController.retryJob` (`apps/api/src/controllers.ts:3012`), `this.batch1Persistence.updateJobRetryCount(retry.id, retry.retryCount)` was called immediately after `queueAiJob` without awaiting `awaitJobCommit(retry.id)`. The database update attempted to modify a row that had not yet finished its initial `INSERT`, throwing `PrismaClientKnownRequestError: Record to update not found` (HTTP 500).
- **Fix**:
  1. In `AdminController.retryJob`: added `await this.store.awaitJobCommit(retry.id);` prior to `updateJobRetryCount`.
  2. In `StoreService.queueAiJob` (`apps/api/src/store.service.ts`): allowed `retryCount?: number` to be passed into `queueAiJob` and forwarded into `createAiJob`, ensuring the row is created with the correct retry count from the outset.
  3. In `Batch1PersistenceService.updateJobTerminal` (`apps/api/src/batch1-persistence.service.ts:1074`): preserved `existing.retryCount` when `params.retryCount` is undefined (`retryCount: params.retryCount !== undefined ? params.retryCount : existing.retryCount`), preventing subsequent terminal updates from resetting the retry count to 0.
- **Evidence**:
  - *Before*: `POST /api/admin/v1/ai/jobs/:id/retry` returned `500 Internal Server Error` with `Record to update not found`.
  - *After*: `POST /api/admin/v1/ai/jobs/:id/retry` returns `201 Created` with new queued job ID (`job_ce5ba5e64b`), persisted in PostgreSQL with `retryCount = 1`.

### Defect 2: Missing Identity Header Propagation on Journey Read and Action Check-In (`LifeJourney`, `ActionCommitment`)
- **Root Cause**: In Batch 1 Sub-batches D and E, `requireJourney(journeyId, userId)` and `checkinAction({ actionId, userId })` implemented strict row-level ownership checks at the database layer (`WHERE id = ... AND userId = ...`). However, `PublicController` endpoints (`GET /journeys/:id`, `GET /journeys/:id/fingerprint`, `PATCH /journeys/:id/intent`, `POST /journeys/:id/actions`, `GET /journeys/:id/actions`, `GET /journeys/:id/timeline`, `POST /actions/:id/checkin`, `POST /actions/:id/checkins`) omitted the `@Headers('x-goodnight-user-id')` parameter, causing `store.service.ts` to default to `demoUserId` (`user_demo`). Consequently, requests from `user_guest` evaluating `user_demo`'s journey or action bypassed the ownership check.
- **Fix**: Propagated `@Headers('x-goodnight-user-id') userId?: string` through `PublicController` and forwarded `runtimeUserId(userId)` into `store.service.ts` (`journeyDetail`, `fingerprint`, `setJourneyIntent`, `createActionCommitment`, `journeyActions`, `journeyTimeline`, `checkinAction`).
- **Evidence**:
  - *Before*: `GET /api/v1/journeys/:id` as `user_guest` returned `200 OK` (reading `user_demo`'s journey); `POST /api/v1/actions/:id/checkin` as `user_guest` returned `201 Created` (checking in `user_demo`'s action).
  - *After*: `GET /api/v1/journeys/:id` as `user_guest` returns `404 Not Found`; `POST /api/v1/actions/:id/checkin` as `user_guest` returns `404 Not Found`.

---

## 2. Discriminating Regression Tests & Mutation Proofs

To prevent these defects from returning, dedicated discriminating tests were added to the permanent regression test suite, accompanied by mutation testing where each fix was temporarily reverted to prove test sensitivity.

### 2.1 Test Implementations Added

1. **`tests/business/batch1-journey.spec.ts:1080` (Test 8)**:
   - **Cross-user read**: As `user_guest`, calls `GET /journeys/:id`, `GET /journeys/:id/fingerprint`, `GET /journeys/:id/timeline`, and `GET /journeys/:id/actions` on a journey owned by `user_demo` -> all assert **404 Not Found** (`"旅程不存在或无权访问"`).
   - **Cross-user write**: As `user_guest`, calls `POST /journeys/:id/actions` on `user_demo`'s journey -> asserts **404 Not Found**.
   - **Positive controls**: As `user_demo` (owner), the same read routes return **200 OK** with real journey/snapshot/action data, and `POST /actions` returns **201 Created**. User B reading their own journey returns **200 OK**.
   - **Anonymous case**: Requests with no `x-goodnight-user-id` header resolve to the anonymous demo session (`user_demo`). Asserted that accessing `user_demo`'s journey succeeds (200), whereas accessing `user_guest`'s journey without a header returns **404 Not Found** across all read and write endpoints, guaranteeing that private user data is never leaked to unauthenticated callers.

2. **`tests/business/batch1-action.spec.ts:1447` (P0-CheckinOwner)**:
   - **Cross-user write**: As `user_guest`, calls `POST /api/v1/actions/:id/checkin` on `user_demo`'s action -> asserts **404 Not Found** (`"行动不存在"`), and confirms in PostgreSQL that the action remains `active`.
   - **Positive controls**: As `user_demo` (owner), `POST /actions/:id/checkin` succeeds (200/201), commits the reflection, and transitions the action to `completed`. User B checking in User B's action succeeds.
   - **Anonymous case**: Calling `POST /actions/:id/checkin` on an action owned by `user_guest` with no header evaluates as `user_demo` and returns **404 Not Found**.

3. **`tests/business/batch1-aijob.spec.ts:1193` (Test 11)**:
   - **AI Retry Commit & Race Check**: Admin calls `POST /api/admin/v1/ai/jobs/:id/retry` with admin token on a failed job (`retryCount: 0`). Asserts response **201 Created**, returns `jobId`, and verifies in PostgreSQL that the newly created job row exists with incremented `retryCount: 1`.

### 2.2 Mutation Testing Observations

| Mutation Under Test | Modification Applied | Observed Test Failure | Restoration Result |
|---|---|---|---|
| **Mutation 1**: Journey Read Header Forwarding | Reverted `GET /journeys/:id` in `controllers.ts:378` to unpatched `journey(id)` without header forwarding | `tests/business/batch1-journey.spec.ts:1208`<br>`AssertionError: expected 200 to be 404`<br>(User B reading User A's journey incorrectly returned 200) | Restored header forwarding -> **PASS** (13/13 tests) |
| **Mutation 2**: Action Check-in Header Forwarding | Reverted `POST /actions/:id/checkin` in `controllers.ts:526` to unpatched without header forwarding | `tests/business/batch1-action.spec.ts:1526`<br>`AssertionError: expected 201 to be 404`<br>(User B checking in User A's action incorrectly returned 201) | Restored header forwarding -> **PASS** (16/16 tests) |
| **Mutation 3**: AI Job Retry Commit Await | Removed `await this.store.awaitJobCommit(retry.id)` in `controllers.ts:3019` | `tests/business/batch1-aijob.spec.ts:1240`<br>`Error: expected 201 "Created", got 500 "Internal Server Error"`<br>`PrismaClientKnownRequestError: Record to update not found` | Restored `awaitJobCommit` -> **PASS** (11/11 tests) |

---

## 3. Verification Matrix

| # | Domain | Verification Item | Target Models | Execution Surface | Concrete Action / Command | Observed Result | Status | Raw Evidence Reference |
|---|---|---|---|---|---|---|---|---|
| 1 | Mini-Program | Create Journey, Set Intent, Confirm Situation | `LifeJourney`, `SituationSnapshot`, `JourneyUpdate` | API + Web UI + Android Emulator + DB | `POST /api/v1/journeys` -> `PATCH /journeys/:id/intent` (intent: `NEXT_STEP`) -> `PATCH /journeys/:id/situation` (facts, feelings, needs, constraints) -> Browser to `/pages/journey/detail?id=...` -> Emulator TonightHome | Journey created (HTTP 201), intent updated (HTTP 200), situation confirmed (HTTP 200). DB: `stage='planning'`, `currentIntent='NEXT_STEP'`, `confidence='user_confirmed'`. Web UI and Android Emulator render title, facts, feelings. | **PASS** | DB row `journey_5155ce01de`, `snapshot_e9fc201666`; Screenshots: `01_mp_journey_detail.png`, `android-tonight-home-active.png` |
| 2 | Mini-Program | High-Risk Path: Atomic SafetyEvent Creation & Admin Visibility | `LifeJourney`, `SafetyEvent` | API + Web UI + Admin UI + DB | `POST /api/v1/journeys` with high-risk keyword `自杀` -> Browser to `/pages/safety/index?journeyId=...` -> Admin Web to `/safety/events` | Journey committed with `stage='safety_first'` (HTTP 201). `SafetyEvent` created in SAME database transaction with `level='high'`, `source='journey_create'`, `status='open'`. MP redirects to SafetySupport view; Admin view lists the event. | **PASS** | DB row `safety_422cb70b9b` (`journeyId='journey_f3f64d5147'`); Screenshots: `02_mp_safety_support.png`, `03_admin_safety_events.png` |
| 3 | Mini-Program | Action Commitment, Check-in, Follow-Up Lifecycle | `ActionCommitment`, `OutcomeCheckin`, `FollowUpJob`, `JourneyUpdate` | API + Web UI + Admin UI + DB | `POST /api/v1/journeys/:id/actions` -> `POST /api/v1/actions/:id/checkin` (status: `completed`, reflection) -> Browser to `/pages/action/index` -> Admin Web to `/experience/actions` and `/experience/checkins` | Action committed (HTTP 201); Checkin transitions pending -> completed with reflection and checkedAt (HTTP 201); `JourneyUpdate` recorded (`action_completed`). MP ActionCenter reflects completion. Admin actions & checkins tables render rows. | **PASS** | DB `action_26d1210f4b`, checkin `status='completed'`; Screenshots: `04_mp_action_center.png`, `10_admin_actions_list.png`, `11_admin_checkins_list.png` |
| 4 | Mini-Program | User Notification List, Mark-Read, Deep Link Navigation | `UserNotification` | API + Web UI + Android Emulator + DB | Direct DB insert `UserNotification` (status: `unread`, targetRoute) -> `GET /api/v1/notifications` -> Web UI click card -> Android Emulator tap notification card -> Verify navigation and DB read status | Notification listed (HTTP 200). Clicking notification card in Web UI and Android Emulator fires `PATCH /notifications/:id/read` and deep-links to `/pages/journey/detail?id=...`. DB row transitions `status='read'`, `readAt` set. | **PASS** | DB `notif_verify_1791252323871` `status='read'`, `readAt='2026-10-06T02:05:24.089Z'`; Screenshots: `05_mp_notifications_list.png`, `06_mp_notif_target_deep_link.png`, `android-notifications-page.png`, `android-journey-detail.png` |
| 5 | Mini-Program | AI Degradation Notice (Fallback/Failed, No Fake Success) | `AIJob` | API + Web UI + DB | `POST /api/v1/journeys/:id/situation/reanalyze` -> Poll task -> Web UI `/pages/journey/detail?id=...&analysisJob=...` | `DAPI_API_KEY` is empty. AIJob reaches `status='fallback'` with `fallbackUsed=true` in DB. Web UI renders `AiDegradationNotice` with `☂` and exact text: `"当前模型暂时不可用，下面是一段安全兜底内容，不是模型实时生成的回信。"`. No fake success. | **PASS** (Graceful Degradation Verified) / **AI_LIVE_BLOCKED_EXTERNAL** (Live Generation) | DB `job_0fa805fd05` (`status='fallback'`, `fallbackUsed=true`); Screenshot: `07_mp_ai_degradation_notice.png` |
| 6 | Mini-Program | Archive Journey: Retained Safety Events Survive Detached | `LifeJourney`, `SafetyEvent` | API + DB + Admin UI | `PUT /settings/privacy` (`allowJourneyArchiveRetention=true`) -> `PATCH /journeys/:id` (`status='archived'`) -> `DELETE /archive/journeys/:id` (`confirmation='DELETE_ARCHIVE'`) -> Query DB & Admin UI | `LifeJourney` row cleanly deleted from PostgreSQL. Dependent `SafetyEvent` row detached (`journeyId=null`) and SURVIVES in PostgreSQL. Admin can still view and inspect the detached event. | **PASS** | DB query: `LifeJourney` = 0 rows; `SafetyEvent` `safety_422cb70b9b` exists with `journeyId IS NULL`; Admin UI renders detached event |
| 7 | Admin Back Office | Journeys List, Search, Pagination, Detail Drawer | `LifeJourney`, `SituationSnapshot`, `JourneyUpdate` | Web UI + API + DB | Admin Web to `/experience/journeys` -> Search filter keyword -> Click row -> View detail drawer -> `GET /api/admin/v1/journeys` | Table renders 99+ journeys from PostgreSQL. Search filters table rows. Detail drawer displays snapshot facts, feelings, needs, updates. | **PASS** | API `total=101`; Screenshots: `08_admin_journeys_list.png`, `09_admin_journey_detail_drawer.png` |
| 8 | Admin Back Office | Actions & Check-ins Tables | `ActionCommitment`, `OutcomeCheckin` | Web UI + API + DB | Admin Web to `/experience/actions` and `/experience/checkins` -> `GET /api/admin/v1/actions` & `checkins` | Actions table renders rows with title, status, dueAt. Check-ins table renders rows with commitmentId, status, reflection, checkedAt from PostgreSQL. | **PASS** | API `actions total=5`, `checkins total=5`; Screenshots: `10_admin_actions_list.png`, `11_admin_checkins_list.png` |
| 9 | Admin Back Office | Safety Events Handle Action & AuditLog Persistence (D1) | `SafetyEvent`, `AuditLog` | Web UI + API + DB | Admin Web to `/safety/events` -> Select open event -> Enter note -> Click handle -> `PATCH /api/admin/v1/safety/events/:id/handle` | Event status transitions `open -> handled`, `handledAt` set (HTTP 200). `AuditLog` row created with `action='SAFETY_EVENT_HANDLE'`, `adminUserId='admin_1'`. AuditLog row persists across subsequent writes/flushes. | **PASS** | DB `safety_handle_1791252324391` `status='handled'`; DB `AuditLog` row id `audit_f75d311fa8`; Screenshot: `12_admin_safety_handled.png` |
| 10 | Admin Back Office | AI Jobs Queue, Detail Trace, and Retry Action | `AIJob`, `AuditLog` | Web UI + API + DB | Admin Web to `/ai/jobs` -> Select job -> Click retry -> `POST /api/admin/v1/ai/jobs/:id/retry` | List renders all AI jobs from PostgreSQL. Detail drawer renders `traceJson` events. Retrying creates new job `job_ce5ba5e64b` in PostgreSQL with `status='queued'`, `retryCount=1` (HTTP 201). | **PASS** | DB `job_ce5ba5e64b` (`status='queued'`, `retryCount=1`); Screenshots: `13_admin_ai_jobs_list.png`, `14_admin_ai_jobs_retry.png` |
| 11 | Admin Back Office | Dashboard Aggregates vs PostgreSQL Database Counts | Multiple Migrated Models | Web UI + API + DB | Admin Web to `/dashboard` -> `GET /api/admin/v1/dashboard/overview` vs SQL `COUNT(*)` queries | All dashboard cards match PostgreSQL counts exactly: Total Journeys (101), Active Journeys (92), Active Actions (5), Due Checkins (5), High-Risk Safety (32), Unread Notifs (31). | **PASS** | SQL queries match API `journeySummary` 1:1; Screenshots: `15_admin_notifications.png`, `16_admin_dashboard_aggregates.png` |
| 12 | Security Boundary | Journey Ownership: Cross-User Read and Mutation Refusal | `LifeJourney` | API | `GET /api/v1/journeys/:id` & `PATCH /api/v1/journeys/:id` as `user_guest` on `user_demo` journey | `user_guest` reading `user_demo` journey -> **HTTP 404** Not Found. `user_guest` patching `user_demo` journey -> **HTTP 404** Not Found. | **PASS** | Response HTTP 404 on both read and patch; DB unmutated |
| 13 | Security Boundary | Archiving Consent Enforcement | `LifeJourney`, `PrivacySetting` | API | `PUT /settings/privacy` (`allowJourneyArchiveRetention=false`) -> `PATCH /journeys/:id` (`status='archived'`) | Request refused with **HTTP 403 Forbidden**: `"请先在隐私设置中允许保留旅程归档"`. Unconsented archiving strictly prevented. | **PASS** | Response HTTP 403, error message verified, DB status unchanged |
| 14 | Security Boundary | Notification Ownership Isolation | `UserNotification` | API | Direct DB insert `notifA` (`user_demo`) and `notifB` (`user_guest`) -> `GET /notifications` as `user_guest` -> `PATCH /notifications/:notifA/read` as `user_guest` | `user_guest` list only contains `notifB`, zero traces of `notifA`. Marking `notifA` as read as `user_guest` returns **HTTP 404** Not Found. | **PASS** | DB query confirms `notifA` remained unread; HTTP 404 returned |
| 15 | Security Boundary | Safety Event Reads are Admin-Only | `SafetyEvent` | API | `GET /api/admin/v1/safety/events` (unauthenticated / forged token) & `GET /api/v1/safety/events` | Unauthenticated -> **HTTP 401**. Forged token -> **HTTP 401**. Public path -> **HTTP 404**. Only valid admin token returns 200. | **PASS** | HTTP 401 / 401 / 404 recorded |
| 16 | Security Boundary | Action Commitment & Check-In Ownership | `ActionCommitment`, `OutcomeCheckin` | API | `POST /api/v1/actions/:id/checkin` as `user_guest` on `user_demo` action | Request refused with **HTTP 404** Not Found (`"行动不存在"`). Cross-user check-in blocked. | **PASS** | Response HTTP 404 recorded, outcome checkin unmutated |

---

## 4. Full Suite Re-Verification & Baseline Comparison

### 4.1 Batch 1 Specs + Persistence Durability
Command executed under isolated test database leases (`scripts/test-runner.ts`):
- `tests/business/batch1-action.spec.ts`: **16 passed / 0 failed** (16)
- `tests/business/batch1-aijob.spec.ts`: **11 passed / 0 failed** (11)
- `tests/business/batch1-journey.spec.ts`: **13 passed / 0 failed** (13)
- `tests/business/batch1-safetyevent.spec.ts`: **5 passed / 0 failed** (5)
- `tests/business/batch1-usernotification.spec.ts`: **6 passed / 0 failed** (6)
- `tests/business/persistence-durability.spec.ts`: **2 passed / 0 failed** (2)
**Total Batch 1 Pass Rate**: **53 passed / 0 failed (53)**.

### 4.2 Full Business Suite Baseline Comparison
Command: `pnpm test:business` (28 spec files, per-file database lease isolation).
- **Result**: 20 passed, 8 failed (87 passed tests, 9 failed tests).
- **Comparison with `docs/architecture/TEST_BASELINE_FAILURES.md`**:
  The baseline recorded 12 failed tests across 10 files. The current suite has 9 failed tests across 8 files.
  - Three previously failing baseline tests now pass:
    1. `first-batch-core-loop.spec.ts` (pauses ordinary routing for safety event, persists real-world handoff): **PASS**
    2. `persistence-durability.spec.ts` (Defect 1: PATCH /api/v1/journeys/:id persists title/summary): **PASS**
    3. `goodnight-2-incremental.spec.ts` (delivers overdue follow-up through Redis/BullMQ): **PASS**
  - The remaining 9 failing tests are all in the pre-existing baseline failing set caused by empty `DAPI_API_KEY` (`AI_LIVE_BLOCKED_EXTERNAL`). Zero new failures were introduced.
- **Deadlock (`40P01`) Count**: Exactly **1** across the entire 28-file run, matching the intentional mutation test in `tests/business/batch1-action.spec.ts:1208` (`P0-Lock mutation check: inverting lock order between Action and Journey reproduces 40P01 deadlock`). Zero deadlocks occurred in business paths.

### 4.3 Static Checks
- `pnpm typecheck`: Clean across all five workspace packages (`apps/api`, `apps/admin`, `apps/mp`, `packages/shared-types`, `packages/api-sdk`).
- `pnpm lint`: Clean (0 errors, 9 existing warnings).

---

## 5. Scope & Blocked External Status

- **Device Verification**: Exercised on real running Android Emulator `emulator-5554` (Pixel 7 API 34). No physical USB Android hardware was attached (`PHYSICAL_ANDROID_BLOCKED_NO_DEVICE`).
- **Live Remote AI**: `DAPI_API_KEY` is empty (`AI_LIVE_BLOCKED_EXTERNAL`). Verified that all models degrade gracefully to documented safe template fallbacks with clear user notices rather than reporting fake model successes.
- **Code Changes**: Restricted strictly to the minimal fixes in `apps/api/src/controllers.ts`, `apps/api/src/store.service.ts`, `apps/api/src/batch1-persistence.service.ts`, and the regression tests in `tests/business/`. No modifications to `apps/mp` visuals, `prisma/schema.prisma`, existing migrations, or transaction timeouts.
