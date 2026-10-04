# PERSISTENCE WRITE GRAPH

Phase A output of the production architecture stabilisation round: a read-only audit of how the API
persists, why it is a production blocker, and the boundary for the first incremental migration step.

Produced by the architecture-reviewer subagent from the code, not from assumptions. Every claim below
carries a file:line. Where something could not be determined from the code it says so instead of
guessing.

## 1. Problem

A normal business write is not persisted as a business write. `StoreService.persist()` queues a clone
of the **entire in-memory state** (`store.service.ts:2016-2040`), and the mapper writes every populated
model inside one interactive transaction (`relational-runtime.mapper.ts:140-297`). Even an admin login
that changes `lastLoginAt` and appends an audit entry reaches the whole-store writer
(`store.service.ts:2385-2394`, `controllers.ts:1960-1981`).

Measured on this machine, recorded in `artifacts/product-closure/evidence/flush-timing.txt`: 12,599
live rows at capture, three consecutive writes each taking 7,508 / 12,900 / 16,423 ms, and one admin
login returning HTTP 500 with `Invalid tx.aIJob.upsert() invocation ... Server has closed the
connection` at `relational-runtime.mapper.ts:202` — the 30-second transaction timeout
(`relational-runtime.mapper.ts:297`).

Note on the numbers: the round brief quotes 12,776 rows, the checked-in evidence says 12,599 at
capture. The discrepancy was not resolved in the audit and the two must not be conflated.

There is also a correctness problem, not only latency: the application treats its in-memory copy as
authority while the BullMQ worker already writes some rows directly to PostgreSQL and then reloads the
whole store (`follow-up-worker.service.ts:26-64`). Two competing ownership models.

## 2. Root cause

| Mechanism | Evidence | Consequence |
| --- | --- | --- |
| Per-row round trips | 46 distinct upsert call sites, many invoked once per row, awaited in loops (`relational-runtime.mapper.ts:190-240`) | Cost grows with total persisted rows, not with rows changed by the request |
| Full-table reconciliation | `deleteAbsent()` issues `deleteMany({id: {notIn: ids}})` — and an unrestricted `deleteMany({})` when the list is empty (`mapper:136-138`) — invoked **40 times** per flush (`mapper:249-292`), plus a delete-and-rebuild of both attachment tables (`mapper:242-247`) | Every flush scans unrelated models; a stale or incomplete in-memory list can delete valid rows |
| Oversized transaction boundary | All of the above inside one interactive transaction with `maxWait: 10_000, timeout: 30_000` (`mapper:170-297`) | The transaction stays open across thousands of awaited statements; failure rolls back the whole snapshot. The observed 500 surfaced at the AIJob loop, which is where it timed out, not proof that AIJob alone is the cause |
| Authority and queuing | `persist()` serializes snapshots **within one StoreService instance** only (`store.service.ts:2016-2040`); `mutationVersion` guards adoption of a whole-store reload, it is not database concurrency control (`store.service.ts:1227-1228, 1262-1273`) | The queue is neither row-level persistence nor a cross-process lock; a second API instance and the worker are outside it |

Symbol note: there is no `writeQueue` symbol; the queue is `persistQueue`.

## 3. Two silent-write defects found by this audit, verified by the orchestrator

Both are correctness bugs in the current code, independent of the architecture work, and both are the
"fake save" the project's rules forbid.

**`PATCH /api/v1/journeys/:id` does not persist.** `controllers.ts:390-401` mutates the journey title
or summary in memory and then calls `await this.store.flush()`. But `flush()` only awaits an
already-queued write — it does not enqueue one (`store.service.ts:2033-2040`). Verified against the
database:

```
PATCH response status: 200   title in response: SILENT-PATCHED-…
DB title immediately after PATCH : SILENT-ORIG-…
API title after PATCH            : SILENT-PATCHED-…   (reads the in-memory store)
DB title 6s later                : SILENT-ORIG-…
```

The change lands only if some unrelated write later triggers a full flush — which today it usually
does, because the flush writes everything. On a restart without such a write, it is gone. The response
reports success either way.

**`POST /api/v1/tools/emotion-decompose/:taskId/save` returns before durability.**
`controllers.ts:1393-1411` appends a diary and calls `this.store.persist()` without `flush()`, and the
handler is not `async`, so it cannot await the queue. The client receives `{ok:true}` before the commit;
a crash in between loses the diary. It also builds the id as `diary_${Date.now()}` rather than through
the shared id helper.

## 4. Flush entry points

Every `persistAndFlush()` is `persist()` + `flush()`; `persist()` queues
`PrismaRuntimeService.saveRuntimeState()` → `saveRelationalRuntimeState()` → `$transaction`. So **every
`persist()` can cause a full transaction without a caller awaiting it**, and a bare `flush()` only
waits for an already-queued write.

| Trigger class | Notes | User-facing request path? |
| --- | --- | --- |
| Boot and reload | Boot loads all rows, runs reconciliation/seed/provider policy, then flushes (`store.service.ts:1240-1252, 2050-2156`); worker-initiated `reloadRuntimeState()` drains the queue and may flush (`store.service.ts:1255-1273`, `follow-up-worker.service.ts:63`) | No |
| Journey, Action, Safety | Controller routes plus async AI completion branches (`controllers.ts:298-544, 636-644`; `store.service.ts:2683-2849, 2994-3039, 3365-3788`) | Yes; completion runs later, outside the originating request |
| Peer and notifications | Including an ostensibly read-oriented peer path that expires due conversations and flushes (`store.service.ts:4266-4282`) | Yes |
| Memory/Decision/FutureSelf/Recovery/SupportPlan/Archive | Some reads mutate and flush (`store.service.ts:4824-4835`); delayed BullMQ jobs are scheduled after the flush | Yes for creation and mutating reads |
| Legacy content, tools, admin | Media, export, feedback, hugs, replies, moods, letters, diaries, favourites, privacy, AI config, moderation, admin config, and admin login (`store.service.ts:1584-1991, 2240-2342, 5275-5432`; `controllers.ts:903-1475, 1648-1736, 2411-3298`) | Yes |
| AI job lifecycle and callbacks | `queueAI()` mutates and persists, then runs the job on a microtask; running and terminal branches persist again (`store.service.ts:5499-5608, 5637-5965`). `waitForAiJob()` polls on a timer but flushes only on terminal state (`store.service.ts:5612-5623`) | Creation may be user-facing; completion is not |
| Delayed BullMQ delivery | Worker writes UserNotification, FollowUpJob and optional FutureSelf/Cooldown/Decision **directly**, then requests a whole-store reload (`follow-up-worker.service.ts:26-64`) | No at delivery time; a direct-DB writer |
| Other direct-DB writers | HiddenPost, HugAction (`store.service.ts:2312-2342, 5264-5273`); MonthlyReport/ReportAdvice (`monthly-report.service.ts:340-393, 428-448`) | Yes where invoked |

No API `setInterval` persistence scheduler was found. Separately invoked maintenance scripts have their
own transactions and are not flush entry points.

## 5. Write graph

`FULL` = the legacy flush upserts every populated mapped model, rebuilds both attachment relations, runs
40 absence sweeps, and updates RuntimeState. It is the set of *potentially touched* tables, not a claim
that every table holds rows on every run. **Per-row duration is unmeasured**; the only measured figures
are the three request timings above, which include request work and must not be presented as isolated
transaction timings.

Risk codes: `S` whole-store stale-copy / last-writer / absence-sweep, `A` asynchronously queued or
callback write, `X` cross-model or worker/direct-DB race.

| Domain | Business entities and the in-memory mutation | Flush trigger | Duration; risk |
| --- | --- | --- | --- |
| `POST /journeys` | Journey + draft Snapshot + created Update; high risk adds SafetyEvent; queues AIJob (`store.service.ts:2683-2773`) | `persistAndFlush()` then the AI callback flush (`:2774-2849`) — FULL twice on success | FULL; S/A/X |
| `PATCH journeys/:id/intent`, `/status`, archive restore | Journey fields; high-distress intent also SafetyEvent (`:2994-3039, 3154-3165, 5233-5239`) | `persistAndFlush()`; FULL | FULL; S/X |
| `PATCH journeys/:id` title/summary | Mutates Journey (`controllers.ts:390-399`) | **`flush()` only — no write queued** | No reliable transaction; silent loss (section 3) |
| Situation confirm / reanalyze | Snapshot fields, Journey intensity, optional Update; reanalyze queues AIJob and the completion revises Snapshot/Journey and adds AgentDecisionLog (`:3243-3361, 3365-3458`) | `persistAndFlush()` plus AI lifecycle persists; FULL each | FULL; S/A/X |
| Safety acknowledge; POST updates | Journey stage/update timestamp, appended Update (`:3462-3530`) | `persistAndFlush()`; FULL | FULL; S/X |
| Graduate | Journey completion, possible RecoverySnapshot (`:3768-3788`) | `persistAndFlush()`; FULL | FULL; S/X |
| Archive delete / test cleanup | Removes Journey, Snapshot, Update, Action, Checkin, AIJob, Notification and detaches many models (`:3169-3221`, `:2861-2975`) | `persistAndFlush()`; FULL with heavy sweeps | FULL; high S/X, cascade-loss risk |
| Action create / adaptive | Action, pending Checkin, FollowUpJob, Update; Journey stage (`:3577-3647, 3751-3765`) | FULL before the BullMQ enqueue (`:3645-3647`) | FULL; S/X, DB/Redis gap |
| Checkin | Action/Checkin/FollowUpJob updates plus Update (`:3650-3715`) | `persistAndFlush()`; FULL | FULL; S/X, worker competes for FollowUpJob |
| Action plan / adaptive plan | Reads Snapshot/Update/Action to compose the prompt, queues AIJob (`:3543-3574, 3727-3748`) | AI job persist + endpoint flush; FULL | FULL per enqueued write; S/A/X |
| Safety admin handle | SafetyEvent status/handler, plus AuditLog in the controller (`:3480-3497`; `controllers.ts:2259-2272`) | `persistAndFlush()`; FULL | FULL; S/X; audit and safety must commit together |
| Notification read | Notification status/readAt (`:4705-4714`) | `persistAndFlush()`; FULL | FULL; S/X |
| BullMQ due delivery | Direct create Notification, update FollowUpJob, optional FutureSelf/Cooldown/Decision (`follow-up-worker.service.ts:26-61`) | Direct statements, then a reload that may lead to FULL (`:63`) | Not benchmarked; X, non-atomic multi-statement |
| Every `queueAI` caller | Append queued AIJob; microtask marks running and terminal/failure (`:5499-5608, 5637-5965`) | Each `persist()` can enqueue FULL; callers sometimes wait via `flush()` | FULL per queued write; S/A/X |
| Peer experience, match, conversation, message, assist, close, report, block, feedback | PeerExperience/PeerMatch/PeerConversation/PeerMessage/PeerReport, notifications, counts (`:3814-4691`) | `persistAndFlush()` or AI queue + `flush()`; FULL | FULL; S/A/X |
| Self-system (memory, decision, future self, recovery, support plan, archive) | Their collections; some update Journey; cooldown and future message also create FollowUpJob (`:4717-5214`) | `persistAndFlush()`; FULL | FULL; S/X, DB/Redis gap |
| Legacy Square/Mood/Letter/Diary/Favourites/Tools | Store arrays, counters, AIJobs; later callbacks mutate linked rows (`:1584-1991, 2312-2342, 5275-5495`) | Mixed `persistAndFlush()`, `persist(); flush()`, and fire-and-forget `persist()` | FULL where awaited; S/A/X, response may precede commit |
| Legacy admin/auth/config | Store objects and audit history (`:2385-2394`; `controllers.ts:1960-1981, 2411-3298`) | `persist(); flush()` or `persistAndFlush()` | FULL; S/X; admin-login 500 documented |
| Already direct-DB | HiddenPost, HugAction, MonthlyReport/Advice | Direct SQL for those tables; hug and monthly side effects also invoke FULL | Mixed-ownership X |

Coverage qualification: this enumerates runtime write families, not one row per HTTP decorator; aliases
sharing a service operation are grouped. Per-endpoint transaction timing and per-table time are not
determined by the checked-in evidence.

## 6. Proposed design

1. **Add a narrow repository/persistence service beside the existing store**, using the already
   registered `PrismaRuntimeService` (`app.module.ts:1-13`). Repository methods represent business
   operations, not a generic snapshot writer: create Journey+Snapshot+Update(+SafetyEvent), confirm
   Snapshot+Journey(+Update), check in Action+Checkin+FollowUpJob+Update. Each writes only its changed
   rows in a scoped transaction.
2. **Commit before acknowledging.** Read current authoritative rows through the repository, run the
   scoped transaction, and only after a successful commit update or invalidate a narrowly keyed
   projection. Prefer DB reads on migrated paths. Never mutate the authoritative-looking store first,
   never reload the whole store afterwards, and never enqueue a legacy flush as a companion write.
3. **`DIRECT_DB_MODELS` registry.** A typed central registry maps each migrated Prisma model to its
   StoreData collection and declares DB authority. Membership must control **all three** legacy
   behaviours: omit the model's upserts, omit its `deleteAbsent` sweep, and stop snapshot-derived FK
   decisions from treating an absent store row as an absent DB row. A registry that skips only upserts
   is unsafe.
4. **One ownership unit at a time, no flag day.** Implement and verify every writer *and every read*
   for a unit, cut it over, then register it and remove its legacy write and sweep. Legacy models keep
   using `persist()` temporarily; its mapper then operates only on store-owned tables. For FKs into
   DB-owned Journey/AIJob, check the actual DB row or use a known committed id rather than a
   `journeyIds`/`jobIds` set computed from a possibly stale snapshot.
5. **Replace `deleteAbsent` with explicit deletion over time.** Migrated models get scoped, authorized
   business deletes. Archive deletion must state its intended child-deletion and nullable-link detach
   semantics; database cascades are not a statement of business intent. Never let an empty in-memory
   list mean "delete every row".
6. **Keep AI and delayed-work semantics consistent.** Persist a queued AIJob before starting external
   work; update one job by id for running/terminal transitions; make completion callbacks write their
   own scoped changes and check the latest DB `confidence` before replacing an AI draft. Keep the
   durable FollowUpJob then Redis enqueue contract initially and document its gap; remove the worker's
   whole-store reload once notification and read paths use the DB.

## 7. Batch plan

Order: (1) Journey, SituationSnapshot, JourneyUpdate, ActionCommitment, OutcomeCheckin, SafetyEvent,
UserNotification, AIJob. (2) PeerExperience, PeerMatch, PeerConversation, PeerMessage, PeerReport.
(3) Memory/Decision/FutureSelf/Recovery/SupportPlan/Archive. (4) Legacy.

Cross-batch dependencies that must not be silently dropped: PeerReputation, AgentDecisionLog,
FollowUpJob, AuditLog, and the legacy nullable Journey/AIJob links.

### First-batch work, per model

| Model | Writers that must change | Reads that must switch before DB authority |
| --- | --- | --- |
| Journey | `createJourney`, `setJourneyIntent`, `acknowledgeSafety`, `addJourneyUpdate`, action-create stage change, `graduateJourney`, `restoreArchivedJourney`, `updateJourneyStatus`, the AI completion branches, and `patchJourney` (which must become a real write) | `requireJourney`, `tonightHome`, journey list/detail/fingerprint/actions/timeline/archive/graduation, legacy `createMood` validation, and Peer/Recovery/Decision/FutureSelf consumers |
| SituationSnapshot | Creation, confirmation, reanalysis request, both async analysis completions; the user-confirmed guard must be enforced at commit, not on a stale object | `fingerprint`, journey detail/archive, `generateActionPlan`, graduation peer draft, match suggestion inputs |
| JourneyUpdate | Create-time update, confirmation intensity update, reanalysis-request update, safety acknowledgement, manual update, action-create/checkin updates, archive deletion | Journey detail/timeline/archive, action-plan prompt fallback, graduation peer draft, admin counts |
| ActionCommitment | Create, checkin status, adaptive create, archive deletion | `tonightHome`, journey detail/actions/archive/graduation, adaptive-plan parent, peer draft, admin actions, monthly statistics |
| OutcomeCheckin | Pending creation, completion/miss update, optional new checkin, archive deletion | `tonightHome`, journey detail/archive/graduation intensity, admin checkins, monthly statistics |
| SafetyEvent | High-risk journey creation, high-distress intent, admin handling with AuditLog **in the same scoped transaction**, archive-link detach | Intent safety check; admin safety list/detail/dashboard |
| UserNotification | Worker create, `readNotification`, peer notification creation/update, archive deletion | Front and admin notification lists, dashboard counts. Peer is batch 2, so its notification helper must use the new repository in batch 1 or its notifications are lost once the Notification sweep is disabled |
| AIJob | `queueAiJob`, `runAiJob` status/terminal/error updates, boot recovery, admin retry, archive and test-cleanup deletions | `waitForAiJob`, latest/status/admin-job reads, tool-save lookup, monthly report/advice, memory usage, dashboards. Legacy Letter/Reply/AgentDecisionLog FK mapping must resolve DB-owned ids |

**Cutover gate:** a model may not be added to `DIRECT_DB_MODELS` while any mutation or read above still
requires its store array to be authoritative. Batch 1 cannot be claimed by converting only the eight
principal HTTP writes — peer notification production, monthly reports, legacy FK mapping, async AI
callbacks, archive deletion, boot recovery, admin views and the worker are all part of the gate.

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| A legacy FULL flush overwrites or deletes a newly committed DB-owned row | The registry must exclude both upsert and sweep per migrated model; add a regression where a legacy login flush follows a direct Journey/AIJob/Notification write |
| A mixed-domain operation reads stale model A from the store while writing model B to the DB | Switch those decision-making reads to repository queries before cutover; use scoped cross-model transactions; do not treat a post-commit projection as authority |
| Snapshot id sets null legitimate FKs, or absence sweeps delete linked data | Verify FK existence against PostgreSQL for DB-owned models; test that legacy writes keep their links to a migrated Journey/AIJob |
| Boot is still O(rows) and boot repair can write the whole store | Stop hydrating migrated models once their reads switch; scope startup repairs to affected rows. Shortening the flush does not remove boot cost |
| An AI completion writes after the creating request committed, or after the user confirmed facts | The callback loads current DB state and commits a conditional update that cannot replace `user_confirmed`; one-row AIJob transitions with idempotent completion ids |
| Direct BullMQ writes and the whole-store reload race API mutations | Make delivery idempotent and scoped, remove the reload, use one transaction where delivery changes related rows |
| Archive delete or cleanup silently loses cross-domain records | Specify and test an explicit delete/detach matrix first; never read a missing projected row as delete intent |
| A request claims success before durable commit, or mutates without scheduling any write | On migrated paths await the scoped commit before returning; add tests that re-read through a fresh Prisma client after the response. Section 3 shows two live instances of this |
| DB commit succeeds but the Redis enqueue fails | Keep a durable pending FollowUpJob and add bounded reconciliation as separately reviewed work; do not claim DB and Redis are atomic |
| Performance looks fixed while the AI lifecycle still issues multiple FULL writes | Measure write amplification per job and assert the legacy flush never writes AIJob after cutover |

## 9. Implementation boundary for batch 1

Permitted production files and the permitted changes within them:

| File | Permitted |
| --- | --- |
| `app.module.ts` | Register the new narrowly scoped persistence provider alongside existing providers |
| `prisma-runtime.service.ts` | Expose/use the existing client for repository operations; adjust `loadRuntimeState` only to stop hydrating DB-owned batch-1 models. **Do not change connection or transaction timeouts** |
| `relational-runtime.mapper.ts` | Registry-controlled omission of the eight models' upserts and sweeps; correct FK existence handling for legacy rows; adapt boot loading for those models. Preserve unmigrated-model behaviour |
| `store.service.ts` | Only the batch-1 writers/readers named in section 7, the queue/job lifecycle and completion callbacks, batch-1 cross-domain archive/cleanup safety, and narrowly necessary shared persistence/boot behaviour. No general domain rewrite |
| `controllers.ts` | Batch-1 Journey/Action/Safety/Notification/AIJob endpoints and their DB-backed reads, including `patchJourney`; only the identified cross-domain AIJob/Notification consumers elsewhere. Preserve route shapes and authorization |
| `monthly-report.service.ts` | DB-backed Journey/Action/Checkin statistics and AIJob lookup/creation dependencies. Not a monthly-report redesign |
| `follow-up-worker.service.ts` | Scoped idempotent notification/delivery transaction and removal of the whole-store reload, preserving job kinds and message copy |
| one new file under `apps/api/src/` | The batch-1 repository/persistence service containing only the scoped operations and the registry. No other new production module is authorised |

Batch-1 tests may be added or changed only to exercise batch-1 routes, async callbacks, worker delivery,
coexistence with a legacy flush, archive/FK behaviour, and measured write scope.

**Must not touch in this batch:** Prisma schema or migrations unless a separately reviewed schema
blocker is demonstrated; Peer ownership or Peer business rules beyond routing its notification side
effect through the batch-1 repository; self-system ownership beyond batch-1 Journey reads and worker
coexistence; legacy content ownership beyond necessary AIJob/FK consumers; UI applications; generic
admin configuration; fixture or recovery scripts; the transaction timeout; database contents.

If a cross-batch dependency cannot be satisfied by a narrow read, a scoped transaction, or a
compatibility boundary, **stop that model's cutover and request a separately reviewed boundary change**
rather than widening the diff or leaving two authorities active.
