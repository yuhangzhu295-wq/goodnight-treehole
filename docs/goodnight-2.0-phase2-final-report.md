# GoodnightTreeHole 2.0 Phase 2 Final Report

Date: 2026-08-17  
Baseline: `fc33307561b573d64a47b638d009a826ad46e531`  
Delivery rule: incremental changes only; no Ollama/local model; no fake
interaction or static reference-page replacement.

## 1. Latest commit

The requested baseline is `fc33307561b573d64a47b638d009a826ad46e531`. This
working tree contains the Phase 2 incremental changes and evidence; no commit
or remote push is claimed in this report.

## 2. Modified files

API/runtime: `apps/api/src/store.service.ts`, `apps/api/src/controllers.ts`,
`apps/api/src/app.module.ts`, `apps/api/src/relational-runtime.mapper.ts`,
`apps/api/src/follow-up-queue.ts`, `apps/api/src/follow-up-worker.service.ts`.

Front/admin: the 2.0 views and router plus existing `Square.vue`,
`MoodCreate.vue`, `PostDetail.vue`, `LetterToday.vue`, `ToolIndex.vue`,
`Me.vue`, `JourneyDetail.vue`, and `ReportMonth.vue`.

Data/contracts/tests: `prisma/schema.prisma`, three migration files,
`packages/shared-types/src/goodnight-2.ts`, shared exports, interaction
manifests, business helpers/specs, browser scripts and capture scripts.

Docs/evidence: this report, the phase audit/progress/migration/visual reports,
`docs/unrelated-existing-issues.md`, and 23 local evidence screenshots.

## 3. Final page structure

New 2.0 routes are `/pages/tonight/index`, `/pages/journey/detail`,
`/pages/action/index`, `/pages/peers/index`, `/pages/peer/requests`,
`/pages/peer/detail`, `/pages/peer/conversation`, `/pages/future-self/index`,
`/pages/reality-handoff/index`, and `/pages/recovery/index`. Existing square,
compose, detail/reply sheet, letter, tools, diary, report, favorite, privacy,
feedback and Me routes remain wired to their original API contracts.

## 4. SupportIntent

Intent choices are persisted after snapshot confirmation and route the user to a
specific next step. The UI does not silently choose or overwrite the intent.

## 5. SituationFingerprint

Typed domain, subdomain, stage, context tags, behavior patterns and recovery
lead are persisted and returned as matching inputs; no raw owner identity is
exposed in bounded peer lists.

## 6. Matching algorithm

Matching uses domain/subdomain/context similarity, fingerprint similarity,
stage distance, recovery lead and trust/reputation signals. Responses include a
bounded score breakdown and explanation and are covered by the two-user test.

## 7. Action recommendation

The journey detail page queues an asynchronous action-plan job, renders a
structured recommendation, and requires explicit accept or reject before a
real `ActionCommitment` is saved.

## 8. Adaptive Action

Missed check-ins record a barrier and can create an adapted action with
`parentActionId`, `adaptationReason` and attempt number. The original action is
not silently replaced.

## 9. Redis FollowUp

`FollowUpJob` is persisted and scheduled through BullMQ on `REDIS_URL`, with
retry/backoff and idempotent delivery. The worker updates PostgreSQL and reloads
runtime state for the next request.

## 10. Notification

`UserNotification` records are created for due follow-ups and peer events.
List/read endpoints resolve the requested runtime user and the guest inbox/read
path was verified against Prisma.

## 11. Peer full flow

The isolated real PostgreSQL flow covers publish, match, request, recipient
notification, reject/self-accept guard, accept, 72-hour conversation, both-user
messages, expiry/close and database readback.

## 12. Graduation flywheel

Graduation metrics and consent create an editable pending-review peer experience.
The public path is moderated; the draft is not auto-published.

## 13. Decision Vault

Decision records have real create/list/update routes and are surfaced in the
action center. The browser flow verifies DOM change plus API persistence.

## 14. Cooldown

Cooldown records have a real expiry/status path and are tested through the
action center; no toast-only save is used.

## 15. Reality Handoff

Handoff recipient, channel, summary and share status persist through API. The
visible default `当面聊` is now also the bound model value, fixing the previous
false validation failure. Browser evidence verifies save and share.

## 16. Future Self

Future messages are saved with a delivery timestamp and returned from the API;
the follow-up queue owns the reminder path.

## 17. Support Plan

The user can save a structured support plan and retrieve it after refresh. Admin
has a live list endpoint/view for the same authoritative records.

## 18. Loop Detection

`loop_detection` is available as a persisted structured asynchronous AI task
contract. Status: **PARTIAL** because a dedicated user-facing intervention,
case history and resolution workflow are not yet complete.

## 19. Recovery

Recovery has privacy-guarded structured `yes/partial/no` check-ins, summary
records, readback and a real front page. This area is accepted as DONE.

## 20. Me

The Me surface remains live and its diary, letters, favorites, report, privacy,
feedback and clear-data actions are tested. Consolidating all new journey,
recovery and loop insights into one 2.0 information architecture is PARTIAL.

## 21. Report

The monthly report uses live statistics and async summary/advice jobs. Its two
real actions are now fixed above the tabBar with reserved page space so they are
not occluded. It is functional, but legacy visual diff remains measurable.

## 22. Privacy

Privacy flags gate peer matching, anonymous statistics, recovery, long-term
analysis and memory routes. Toggle persistence and guarded API behavior passed.

## 23. Admin

Admin dashboard, journeys, actions, check-ins, peer experiences/matches,
follow-ups, notifications, conversations, safety, support and memory lists are
live. Post/reply/peer review and AI/config operations remain available. Status:
**PARTIAL** for the new operational resources because every detailed mutation
workflow is not yet implemented.

## 24. Migration

`prisma migrate status` on public reports up-to-date. A clean temporary schema
successfully applied all three migrations and was removed. See
`docs/goodnight-2.0-migration-repair.md`; no production backup is claimed.

## 25. UI/browser screenshots

The local browser capture command produced 23 screenshots at `390x844` with
`captured=23 overflow=0`. Paths and hashes are in
`docs/evidence/goodnight-2.0-phase2/capture-report.json`.

## 26. Unit

Latest `pnpm qa:all`: unit suite `7/7` passed. Latest lint and typecheck stages
also passed.

## 27. API

Latest API suite passed, including route guards, persistence paths, user
identity, peer state transitions and AI job records. The full endpoint map was
booted from the real Nest application.

## 28. E2E

Latest E2E suite passed `12/12`; assertions cover route/API behavior rather than
only HTTP status or page presence.

## 29. Visual

The visual layout suite passed and all 14 legacy front captures reported
`hscroll=false`. Current source/reference diff rates are 10.42%–22.25%; this is
not pixel-perfect and remains a tuning backlog.

## 30. Click-all

Latest click-all output passed all listed front and admin controls, including
the previously failing `btn-report-poster`, `btn-report-advice` and
`btn-tool-run-save`. State-changing actions asserted their API or DOM outcome.

## 31. Business-flow

`pnpm test:business-flow` completed successfully in the latest `qa:all` run.
It exercises create/refresh/persist behavior across journey, action, check-in,
graduation, peer, decision, cooldown, handoff, future-self, support, memory,
recovery and safety paths.

## 32. Cross

Latest cross suite passed `3/3`, including front-to-admin visibility and a
persisted remote DAPI job. The two-user peer business suite passed `3/3`.

## 33. qa:all

The final `pnpm qa:all` run after the last source fix exited with code `0` and
included lint, typecheck, unit, API, E2E, visual, diagnostics, artifact audit,
front/admin/cross browser flows, click-all, business-flow and cross tests.

## 34. SQL/Prisma

The 2.0 migration is additive and has been applied successfully in an isolated
clean schema. Business tests use isolated PostgreSQL schemas for setup but use
direct Prisma reads to verify persisted outcomes.

## 35. Redis

Runtime and worker use `redis://127.0.0.1:6380`. The installed service is
Redis `5.0.14.1`; BullMQ warns that >=6.2 is recommended. Queue tests passed,
but production should upgrade or explicitly accept this compatibility risk.

## 36. Unrelated existing issues

The old admin rebuild checkpoint is historical and remains `IN_PROGRESS`; it is
not current evidence. The local database role cannot create databases, so
migration verification used a temporary schema. These are documented in
`docs/unrelated-existing-issues.md`.

## 37. Remaining risks

- Loop detection lacks a dedicated user-facing intervention and case workflow.
- Admin operations and consolidated Me/report/recovery 2.0 information
  architecture are partial.
- Visual diff is not pixel-perfect, especially diary; report is 18.21% in the
  final local comparison after the tabBar safety fix.
- Redis should be upgraded to the BullMQ-recommended version before production.
- Production DAPI credentials, provider allow-list, backup and staging migration
  rollout still require operator-owned deployment controls.

## Acceptance summary

Core real-data Phase 2 flows, DAPI policy, PostgreSQL/Redis persistence, clean
migrations, browser clicks and cross-end checks are verified. The report
intentionally keeps the remaining areas marked PARTIAL rather than presenting
the project as pixel-perfect or feature-complete.
