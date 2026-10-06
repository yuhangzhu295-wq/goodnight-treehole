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
- **Fix**: Added `await this.store.awaitJobCommit(retry.id);` prior to `updateJobRetryCount` in `AdminController.retryJob`.
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

## 2. Verification Matrix

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
| 16 | Security Boundary | Action Commitment & Check-In Ownership | `ActionCommitment`, `OutcomeCheckin` | API | `POST /api/v1/actions/:id/checkin` as `user_guest` on `user_demo` action | Request refused with **HTTP 404** Not Found (`"行动承诺不存在或无权访问"`). Cross-user check-in blocked. | **PASS** | Response HTTP 404 recorded, outcome checkin unmutated |

---

## 3. Raw Evidence & Database Query Verification

### 3.1 Database Aggregate Consistency
SQL executed against container `goodnight-treehole-postgres-1` (port `15432`) at snapshot:
```sql
SELECT 'TotalJourneys' AS metric, COUNT(*) FROM "LifeJourney"
UNION ALL
SELECT 'ActiveJourneys', COUNT(*) FROM "LifeJourney" WHERE status = 'active'
UNION ALL
SELECT 'ActiveActions', COUNT(*) FROM "ActionCommitment" WHERE status = 'active'
UNION ALL
SELECT 'DueCheckins', COUNT(*) FROM "OutcomeCheckin" WHERE status = 'pending'
UNION ALL
SELECT 'HighRiskSafety', COUNT(*) FROM "SafetyEvent" WHERE level = 'high'
UNION ALL
SELECT 'UnreadNotifications', COUNT(*) FROM "UserNotification" WHERE status = 'unread';
```
Returned:
```
       metric        | count 
---------------------+-------
 TotalJourneys       |   101
 ActiveJourneys      |    92
 ActiveActions       |     5
 DueCheckins         |     5
 HighRiskSafety      |    32
 UnreadNotifications |    31
```
Admin API `/api/admin/v1/dashboard/overview` returned:
```json
{
  "journeySummary": {
    "total": 101,
    "active": 92,
    "actions": 5,
    "dueCheckins": 5,
    "safetyEvents": 32,
    "unreadNotifications": 31
  }
}
```
**Variance**: 0 across all six aggregate metrics.

### 3.2 AuditLog Survival (D1 Guarantee)
After handling safety event `safety_handle_1791252324391`:
```sql
SELECT id, "adminUserId", action, "resourceType", "resourceId", "createdAt" 
FROM "AuditLog" 
WHERE "resourceId" = 'safety_handle_1791252324391';
```
Returned:
```
        id        | adminUserId |        action        | resourceType |           resourceId           |        createdAt        
------------------+-------------+----------------------+--------------+--------------------------------+-------------------------
 audit_f75d311fa8 | admin_1     | SAFETY_EVENT_HANDLE  | SafetyEvent  | safety_handle_1791252324391    | 2026-10-06 02:05:24.402
```
Subsequent state persists and memory flushes did NOT delete this row, confirming absence sweeps remain disabled for `AuditLog`.

### 3.3 Safety Event Detachment on Journey Archive
After deleting archived journey `journey_f3f64d5147`:
```sql
SELECT id, "userId", title FROM "LifeJourney" WHERE id = 'journey_f3f64d5147';
-- (0 rows)

SELECT id, "userId", "journeyId", level, status FROM "SafetyEvent" WHERE id = 'safety_422cb70b9b';
--        id         |  userId   | journeyId | level | status 
-- ------------------+-----------+-----------+-------+--------
--  safety_422cb70b9b| user_demo |           | high  | open
```
The parent `LifeJourney` was deleted, but `SafetyEvent` survived with `journeyId IS NULL`.

---

## 4. UI Screenshot Registry

All visual artifacts are saved in `artifacts/verification/screenshots/`:
- `01_mp_journey_detail.png` — Mini-Program Journey Detail page rendering confirmed facts and needs.
- `02_mp_safety_support.png` — Mini-Program Safety Support page (`/pages/safety/index`) on high-risk journey.
- `03_admin_safety_events.png` — Admin Back Office Safety Events table (`/safety/events`) displaying open event.
- `04_mp_action_center.png` — Mini-Program Action Center (`/pages/action/index`) rendering completed action.
- `05_mp_notifications_list.png` — Mini-Program Notification Center (`/pages/notifications/index`) showing unread card.
- `06_mp_notif_target_deep_link.png` — Target Journey Detail page navigated via notification card click.
- `07_mp_ai_degradation_notice.png` — Mini-Program Journey Detail page rendering `AiDegradationNotice` with `☂`.
- `08_admin_journeys_list.png` — Admin Journeys table (`/experience/journeys`) with search filter.
- `09_admin_journey_detail_drawer.png` — Admin Journey detail drawer showing snapshot & updates.
- `10_admin_actions_list.png` — Admin Actions table (`/experience/actions`).
- `11_admin_checkins_list.png` — Admin Check-ins table (`/experience/checkins`).
- `12_admin_safety_handled.png` — Admin Safety Events table showing handled event.
- `13_admin_ai_jobs_list.png` — Admin AI Jobs table (`/ai/jobs`) with task list and execution metrics.
- `14_admin_ai_jobs_retry.png` — Admin AI Jobs detail drawer after initiating retry.
- `15_admin_notifications.png` — Admin Notifications table (`/experience/notifications`).
- `16_admin_dashboard_aggregates.png` — Admin Dashboard (`/dashboard`) displaying aggregate metrics matching PostgreSQL.
- `android-tonight-home.png` — Android Pixel 7 Emulator displaying initial TonightHome.
- `android-tonight-home-active.png` — Android Pixel 7 Emulator displaying TonightHome with active journey.
- `android-notifications-page.png` — Android Pixel 7 Emulator displaying Notification Center.
- `android-journey-detail.png` — Android Pixel 7 Emulator displaying Journey Detail via deep link.

---

## 5. Scope Statement & Blocked External Items

- **Device Verification**: Verified on real running Android Emulator `emulator-5554` (Pixel 7 API 34, Google APIs Play Store x86_64). No physical USB Android device was attached (`PHYSICAL_ANDROID_BLOCKED_NO_DEVICE`).
- **Live AI Generation**: `DAPI_API_KEY` is empty (`AI_LIVE_BLOCKED_EXTERNAL`). Verified that all models degrade gracefully to documented safe template fallbacks with clear user notices rather than reporting fake model successes.
- **Unit & Business Regression Suite**: 48/48 Batch 1 tests passed (`batch1-usernotification`: 6/6, `batch1-safetyevent`: 5/5, `batch1-aijob`: 10/10, `batch1-journey`: 12/12, `batch1-action`: 15/15). Core support loop passed 2/2 (`first-batch-core-loop.spec.ts`).
- **Typecheck & Lint**: `pnpm typecheck` passed (0 errors across 5 workspace packages); `pnpm lint` passed (0 errors).
