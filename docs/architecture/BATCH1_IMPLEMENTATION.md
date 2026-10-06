# BATCH1_IMPLEMENTATION.md

Status of the Batch 1 persistence migration: moving eight models from the memory-authoritative
store to PostgreSQL-authoritative incremental writes.

**This report records the completion of all eight Batch 1 migrated models**, verified through
the five D+E review rounds up to commit `27aba38`, and links the empirical AFTER benchmark
report in `docs/architecture/BATCH1_BENCHMARK_AFTER.md`. The §60 measurement conditions have been
empirically evaluated: statement cost is flat ($O(1)$) across database scales, though
`BATCH1_MULTI_INSTANCE_SAFE` remains explicitly unverified and is not claimed.

## What Batch 1 is

The measured problem (`PERSISTENCE_BENCHMARK.md`): a single legacy write costs `N + 93` SQL
statements where `N` is the total row count of the database, because `StoreService` treats
in-memory state as authoritative and flushes **every row of every table** on any change, with
about 40 full-table absence sweeps. At 12,600 rows a notification read cost 12,694 statements
and 15.4 s p50. The fix is to move models, one at a time, to direct incremental writes so a
business write costs work proportional to what changed, not to database size.

## Gate and design

Before any code was written, the round required proof that removing a model from the in-memory
arrays cannot silently null a foreign key or delete a row that should survive.

- `BATCH1_REFERENCE_SAFETY.md` — the consumer inventory. It **refuted** the safety claim for the
  current implementation (an empty id set nulls every nullable FK that uses it as a guard, and an
  empty array makes `deleteAbsent` run `deleteMany({})`) and left the gate open on two P0
  unknowns: AuditLog survivability and FollowUpJob survivability/status.
- `BATCH1_DESIGN.md` — the implementation design, including D1–D4, which resolve those unknowns
  without migrating any additional table's ownership.
- The gate was **approved** by `code-reviewer` after one REQUEST_CHANGES round (`5de2d0e`).
- D2's "notification and claim commit in one transaction" text was later **amended**
  (`be099cf`) after sub-batch A falsified it empirically; the design of record now documents the
  correct ordering and the general rule for the remaining sub-batches.

## Migrated models

| #   | Model                                             | State                                                                               | Commit                         |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------ |
| A   | `UserNotification`                                | **Done, reviewed APPROVE**                                                          | `81308e7`                      |
| B   | `SafetyEvent` (+ D1 AuditLog)                     | **Done, reviewed APPROVE**                                                          | `3234ef0`                      |
| C   | `AIJob`                                           | **Done; review fixes applied; deadlock regression found and fixed**                 | `cd919fd`                      |
| D   | `Journey` + `SituationSnapshot` + `JourneyUpdate` | **Done; reviewed — 11 blocking defects found across five review rounds, all fixed** | `501d115`, `e927716`–`27aba38` |
| E   | `ActionCommitment` + `OutcomeCheckin`             | **Done; same review rounds** — completes the eight models                           | `6a64701`, `e927716`–`27aba38` |

### A — UserNotification

The registry (`DIRECT_DB_MODELS`) drives three exits for a migrated model: no boot hydration, no
legacy upsert, no absence sweep. Every notification read moved to the database — the worker
delivery, `readNotification`, the Peer notification helper and its callers, the admin list and
dashboard count, archive deletion and test cleanup. The store getter throws in dev/test instead
of returning an empty array, so a missed consumer fails loudly.

Its precondition **D2** also shipped: the FollowUpJob absence sweep was removed, and the mapper's
FollowUpJob write became status-monotonic — insert when absent, and when present a guarded update
that cannot regress a terminal row (`['delivered','completed']`, verified against every write
site) and can never clear `completedAt`.

Two ordering regressions were found and fixed during implementation, both real rather than
flaky, and both from the same cause — making notifications database-authoritative changed _when_
they become observable relative to the legacy store:

1. notification created inside the claim's transaction → visible at commit, before
   `reloadRuntimeState()` → a reader could see `COOLDOWN_RELEASED` while `/api/v1/decisions`
   still said `cooling` (failed 1 of 3 isolated runs);
2. the first fix inverted the window → legacy state visible before the claim → the FollowUpJob
   was still `pending` when `messageToFutureSelf.deliveredAt` was set.

The shipped order is: **claim + legacy writes atomically → reload → notification last and
idempotently** (`createMany({ skipDuplicates: true })`, gated on the job being `delivered` and on
`futureNotificationsAllowed`). The notification is not skipped when the claim matched zero rows,
because that is the crash-recovery path.

Review also required: the terminal branch must not overwrite `kind`/`dueAt`/`payload`/`journeyId`
from a stale array; the registry was extracted to a zero-dependency leaf module
(`direct-db-models.ts`) after the implementation hid a real import cycle
(`mapper → batch1-persistence → prisma-runtime → mapper`) behind `await import(...)` in the flush
hot path.

### B — SafetyEvent, plus D1

`SafetyEvent` writes moved to the database: high-risk Journey creation, the HIGH_DISTRESS intent
path, and admin handling, where the status update and the AuditLog insert share **one
transaction** so a failure leaves neither. The admin existence check reads the database. Reads
moved: intent detection, admin list, detail and dashboard. Archive deletion **detaches** safety
events (`journeyId = null`) rather than deleting them.

**D1**: the `deleteAbsent(tx.auditLog, …)` sweep is removed. Audit rows are append-only and no
flush can now delete one. The accepted consequence is explicit and documented: `logRetentionDays`
is currently enforced _through_ that sweep, so it stops deleting database rows and audit rows
accumulate, bounded only by insert rate. No replacement retention delete was added — that is
separate scope. `pruneAuditLogsByRetention` still trims the in-memory array.

Two consumers the design had not listed were found and converted (`ensurePhaseTwoCoverage`,
`cleanupBrowserFixtures`). Review found two P1s, both fixed: the in-memory audit mirror used a
post-commit timestamp instead of the transaction's, and the archive-detachment test could not
distinguish the explicit detach from the `onDelete: SetNull` cascade — it now fails if the detach
is removed, which the implementer demonstrated by temporarily removing it.

### C — AIJob

`AIJob` writes and lifecycle moved completely to PostgreSQL:

- **Triple exit**: registered `AIJob: 'aiJobs'` in `DIRECT_DB_MODELS`, stopped boot hydration in `loadRelationalRuntimeState`, stopped legacy upsert in `saveRelationalRuntimeState`, and removed the `tx.aIJob` absence sweep.
- **Database lifecycle**: `queueAiJob` commits the job as `queued` to PostgreSQL before any microtask runs, tracked by `pendingJobCommits` and awaitable via `awaitJobCommit(jobId)`. `runAiJob` executes status CAS `updateMany({ where: { id, status: 'queued' }, data: { status: 'running' } })` to claim execution, and `updateJobTerminal` updates terminal states (`succeeded`, `fallback`, `failed`) within an interactive transaction conditioned on `status in ['queued', 'running']`.
- **P0-2 fixed**: `monthly-report.service.ts` awaits `awaitJobCommit(queued.id)` before querying `prisma.aIJob.findUnique`, preventing race conditions where the report advice would read null.
- **P0-3 fixed**: `updateJobTerminal` reads the latest row inside the transaction and merges caller trace entries onto `existing.traceJson` by JSON signature, preserving the audit trail rather than overwriting with a stale caller array.
- **P1-2 (known limitation & guard documentation)**: `AgentDecisionLog.aiJobId` is a plain string column with no foreign key constraint in Prisma schema (`schema:764–768`). In `saveRelationalRuntimeState`, `jobIds` is queried in-transaction, and a secondary database lookup checks whether an existing row in DB already has `aiJobId`. This prevents a stale in-memory snapshot flush from silently nulling `aiJobId`. This guard is essential and must never be removed.
- **P1-4 (semantic change & guard documentation)**: `saveRelationalRuntimeState` previously swept `AIProvider` using `deleteAbsent(tx.aIProvider, ...)`, which violated `AIJob_providerId_fkey` (which has `ON DELETE RESTRICT`) whenever an existing `AIJob` referenced a provider not in the snapshot. The mapper now explicitly queries `tx.aIJob.findMany({ select: { providerId: true }, distinct: ['providerId'] })` and protects any provider referenced by any database `AIJob`. Deliberate semantic change: an admin deleting a provider that any historical or active `AIJob` still references will no longer take effect through the snapshot path.
- **P1-5**: `recoverInterruptedAiJobs` marks all `queued`/`running` jobs `failed` on boot without instance scoping, matching pre-existing boot repair semantics. Multi-instance fencing belongs to the subsequent clustering phase.
- **P2-1**: Concurrency testing verifies the database CAS predicate and single-winner guarantees under concurrent transaction attempts.
- **AI completion callback — corrected during review.** The first implementation made the callback a **direct writer** of `SituationSnapshot` and `LifeJourney` in its own transaction. Because those two models are still legacy-owned until sub-batch D, that created a **second writer** to tables the legacy flush also upserts, and the two transactions deadlocked: `PostgresError 40P01` on `tx.situationSnapshot.upsert()` inside `persistAndFlush` from `setJourneyIntent`, surfacing as a 500 on `PATCH /api/v1/journeys/:id`. `first-batch-core-loop` — passing after A and B — began failing. The corrected callback keeps a **single writer**: it queries the row, **hydrates it into the store array if the object is missing** (which is what closes the silent-loss path), re-checks `confidence !== 'user_confirmed'` against the database row at write time, then persists through the serialized `persistAndFlush()`. A comment at the site records that the hydration is transitional and disappears once sub-batch D makes the callback a legitimate direct writer — so it is not "simplified" back into a deadlock.
- **Injected 402 degradation**: verified through injected `RemoteProviderError(..., 402, false)` that normal tasks transition to `fallback` (with `fallbackUsed: true` and trace), Peer assist tasks transition to `failed` (with `fallbackUsed: false` and trace), and a failed terminal commit cannot let the waiter announce success. This is `INJECTED_402_VERIFIED`; it is **not** a live-AI pass, and no live-AI success is claimed anywhere.

**Lesson worth carrying into D and E:** during the transition, a model may be written directly **or** by the legacy flush, never both. "Convert the callback to a direct write" is only correct once the table it writes has actually migrated. The design's dual-write prohibition is not a formality — violating it produced a reproducible deadlock, not a subtle slowdown.

### D — Journey + SituationSnapshot + JourneyUpdate

The FK anchor of the whole batch. Full triple exit for all three models (hydration `mapper:95/96/99`, state mapping `399/421/451`, upsert `991/1030/1085`, sweep `2386/2332/2240`).

**The FK guard is the property everything else depends on.** `journeyIds` was the guard protecting nullable `journeyId` foreign keys on fifteen dependent models; with `lifeJourneys` no longer hydrated, the in-memory set would be empty and every one of those FKs would be written `NULL` — the silent-corruption path `BATCH1_REFERENCE_SAFETY.md` §1.1 documents. The mapper now collects candidate ids from all fifteen models (`mapper:843–859`) and resolves them **inside the transaction** against the database (`tx.lifeJourney.findMany`, `:860–866`), so a valid reference is preserved and only a genuinely absent Journey yields `NULL`. Verified by the orchestrator by reading the code, not inferred from tests.

**The Defect 1 fix is behavioural, not timing-based.** The AI completion write carries a commit-time condition — `confidence: { not: 'user_confirmed' }` in the CAS update (`batch1-persistence.service.ts:1997`) — plus an `updatedAt` CAS on the Journey, so a user PATCH or confirmation landing during the AI call makes the AI write affect 0 rows. `persistence-durability` passes 2/2 in three consecutive isolated runs; it failed 4/4 before this sub-batch.

**D3 concurrency**: the parent `User` row is locked with `SELECT … FOR UPDATE` inside the restore/graduate/activate transactions (`:1738, :1773, :1792`) before the check-then-act, because locking the user's Journey rows cannot block a concurrent insert under `READ COMMITTED`. (Narrowed scope: restore and activation paths enforce single-active mutual exclusion; initial creation does not block on active journeys). `patchJourney` enforces `updatedAt` CAS when `expectedUpdatedAt` is provided by the caller (raising 409 Conflict), falling back to field-level last-writer-wins for unversioned PATCH requests. Archive deletion detaches the dependent models explicitly (`updateMany({ journeyId: null })`, `:1826–1834`) inside the verified deletion transaction rather than relying on the cascade or external calls. In sub-batch E, `checkinAction` serializes on parent Action row lock, performs status CAS on `OutcomeCheckin` transitions out of `pending`, and is explicitly idempotent on terminal check-ins (never rewriting `checkedAt` or `reflection`). A known limitation is that the `followUpJobs` in-memory mirror remains a second read input for graduation follow-up counts until FollowUpJob migrates.

**Review found three blocking defects, all fixed in `e927716`.** The `code-reviewer` model was
quota-exhausted, so this review ran on `architecture-reviewer` instead — a different model than
the one that reviewed A/B/C, which is worth knowing when weighing it. It found:

1. **A completed check-in could be rewritten.** `checkinAction`'s CAS returned on a zero-row
   match but then fell through and updated the existing terminal row blindly, including
   `reflection` and `checkedAt`, so a second request rewrote a completed check-in. Fixed by
   making a zero-row CAS an idempotent return of the unchanged terminal row and by skipping the
   duplicate `JourneyUpdate`. Idempotent-return was chosen over rejecting with a conflict so that
   a client retry or a worker redelivery does not produce a false error for an action that
   already succeeded.
2. **Archive deletion detached SafetyEvents before its deletion transaction**, so a failed
   deletion left retained safety events without their `journeyId`. The detach now happens
   **inside** the verified deletion transaction. (Sub-batch B's reviewer had judged the earlier
   split acceptable; on review it is not, because the failure mode is silent.)
3. **High-risk Journey creation was not atomic with its SafetyEvent** — the Journey committed,
   the AI job was queued, and only then was the SafetyEvent created in a separate transaction.
   A SafetyEvent failure therefore left a committed high-risk Journey with **no safety record**,
   the exact outcome the safety path exists to prevent. The SafetyEvent is now created in the
   same transaction as the Journey/Snapshot/Update.

Also fixed: `patchJourney` now accepts and forwards `expectedUpdatedAt`, returning `409` on a
conflict, with unversioned requests keeping field-level last-writer-wins — and the D3 claim was
qualified to say exactly that, rather than claiming a CAS the controller never supplied. The
single-active-Journey guarantee was **narrowed** to the restore/activation paths, because
product rules allow a user to create journeys directly and the existing `first-batch-core-loop`
flow depends on it. The `followUpJobs` mirror is recorded as a known limitation: graduation's
follow-up count reads that array, so cross-instance delivery can make it briefly stale, and it
must not be described as database-authoritative.

Each fix was mutation-tested — the guard was removed, the new test confirmed to fail, the guard
restored — and the observed failures are recorded in the sub-batch report.

### E — ActionCommitment + OutcomeCheckin

The last two models; the batch is now complete. Full triple exit for both, and the `commitmentId`
guard — which protects `OutcomeCheckin.commitmentId` — gets the same treatment as `journeyIds`:
candidates are collected and resolved inside the transaction (`mapper:882–896`), with a secondary
database check at `:1194–1210` so a stale snapshot cannot null an existing reference. Verified by
the orchestrator by reading the code.

Writes moved: action creation, check-in, adaptive actions, archive deletion and test cleanup,
with the check-in's FollowUpJob status and JourneyUpdate in one transaction. Reads moved: home,
journey actions/detail/archive/graduation, adaptive parent, Peer draft, admin actions and
check-ins, and the monthly report. `checkinAction` serializes on the parent `ActionCommitment`
row (`FOR UPDATE`) and transitions out of `pending` by status CAS, which is what makes the
one-pending-check-in-per-action invariant hold without a schema change.

## The D+E review cycle: eleven blocking defects in five rounds

D and E were reviewed five times, and each round after the first found further real defects. The
sequence is recorded because it is the clearest demonstration in this batch of why the
review-then-fix loop cannot be skipped:

1. **Round 1** (`e927716`) — a completed check-in could be rewritten; archive deletion detached
   SafetyEvents before its deletion transaction; **high-risk Journey creation was not atomic with
   its SafetyEvent**, so a failure could leave a committed high-risk Journey with no safety
   record.
2. **Round 2** (`6480df4`) — a status-bearing PATCH bypassed the new `expectedUpdatedAt` CAS and
   silently discarded content fields; the HIGH_DISTRESS intent path still split the Journey and
   SafetyEvent commits; archive deletion resolved its action set outside the transaction; an
   idempotent check-in returned client guidance derived from the _request_ rather than the
   _returned row_, so a completed action retried as "missed" directed the user to the barrier
   flow.
3. **Round 3** (`a992d60`) — the unified PATCH had dropped the **ownership check entirely**, so
   `PATCH /journeys/:id` could edit another user's Journey, and archiving no longer checked
   `allowJourneyArchiveRetention`; the status-only response shape had changed from `{ journey }`
   to `{ item }`; the activation path took the parent-`User` lock only when its initial read said
   the target was not already active; the archive action set was still exposed to concurrent
   inserts.
4. **Round 4** (`3e48bcc`) — archive deletion locked `LifeJourney` first while check-in locked
   `ActionCommitment` first: opposing lock orders, the same cycle that produced sub-batch C's
   deadlock.
5. **Round 5** (`8ea7a2c`) — the deadlock's real root was **one level higher**: the legacy flush
   writes `User` before the FK-referencing legacy rows, while action creation held `LifeJourney`
   and inserted a row referencing `User`, forming a `User` ↔ `LifeJourney` cycle. This produced
   the reproducible `40P01` in `first-batch-core-loop` on `POST /api/v1/journeys/:id/actions`.
6. **Round 6** (`27aba38`) — multi-journey cleanup locked `LifeJourney` without the parent `User`
   lock, and with no deterministic order among journey ids, giving a second, flush-independent
   deadlock path. **APPROVED.**

The result is a documented lock-root hierarchy — **`User` → `LifeJourney` → `ActionCommitment` →
child rows, with deterministic id ordering for multi-row locks** — that is stated in
`BATCH1_DESIGN.md` as a precondition for every present and future transaction touching the
journey domain, together with the mechanism (an FK insert takes a key-share lock on the parent
row) and the reason `User` comes first while the legacy flush exists. The rule is explicitly
marked for re-derivation once the remaining legacy models migrate and the flush is retired.

Two properties are proved rather than asserted: inverting the lock order **reproduces** `40P01`
in a dedicated test using two independent Prisma clients, and the corrected order races real
concurrent operations — action creation against the legacy flush itself — with zero deadlocks.
`first-batch-core-loop` passes 5 consecutive isolated runs after having failed on this exact
path.

## Test isolation (step 16)

Delivered early rather than last, because the evidence made it a precondition for trustworthy
regression evidence for C–E:

- `scripts/test-runner.ts` leases one freshly migrated database **per spec file**
  (`goodnight_treehole_test_<runId>`, `CREATE`/`DROP` via the maintenance `postgres` connection,
  `prisma migrate deploy` with a migration-count check, per-run store file / uploads / queue
  name, `finally` cleanup, `KEEP_TEST_DB_ON_FAILURE`, serial execution).
- `tests/business/helpers.ts` no longer provisions anything; it validates the injected URL and
  refuses a development-database name.
- `prisma db push` is no longer used for the test database.
- 672 leaked `goodnight_treehole_test_*` schemas were dropped; `public` is untouched (54 tables,
  12 migrations, 1304 rows).

## Evidence

Independently reproduced by the orchestrator, not taken from implementer summaries:

| Check                                                    | Result                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npx vitest run tests/business/` before isolation        | 10 failed / 46 passed; newly-failing set vs baseline **empty**                                                                                                                                                                                                                                   |
| Same, after isolation (`9150f45`)                        | 9 failed / 16 passed files; failing set a **strict subset** of baseline                                                                                                                                                                                                                          |
| Same, after sub-batch C (`cd919fd`)                      | 9 failed / 17 passed files, 10 failed / 54 passed tests; failing set within baseline; **0** `40P01` deadlocks                                                                                                                                                                                    |
| Same, after sub-batch D (`501d115`)                      | **8 failed / 19 passed** files, 9 failed / 62 passed tests; failing set a strict subset of baseline; **0** `40P01`; `persistence-durability` 2/2 in 3 consecutive isolated runs                                                                                                                  |
| Same, after sub-batch E and its review fixes (`e927716`) | **8 failed / 20 passed** files, 9 failed / 70 passed tests; failing set a strict subset of baseline; **0** `40P01`; tree clean                                                                                                                                                                   |
| Same, after the five D+E review rounds (`27aba38`)       | **8 failed / 20 passed** files, 9 failed / 82 passed tests; failing set exactly the 8 baseline files; **exactly one** `40P01` in the entire output, and it is the intentional lock-inversion mutation test; `batch1-action` 15/15, `batch1-journey` 12/12, `third-stage-archive` 1/1; tree clean |
| `batch1-usernotification.spec.ts`                        | 6/6                                                                                                                                                                                                                                                                                              |
| `batch1-safetyevent.spec.ts`                             | 5/5                                                                                                                                                                                                                                                                                              |
| `batch1-aijob.spec.ts`                                   | 8/8                                                                                                                                                                                                                                                                                              |
| `batch1-journey.spec.ts`                                 | 7/7                                                                                                                                                                                                                                                                                              |
| `batch1-action.spec.ts`                                  | 8/8                                                                                                                                                                                                                                                                                              |
| `persistence-durability.spec.ts`                         | 2/2                                                                                                                                                                                                                                                                                              |
| `first-batch-core-loop.spec.ts`                          | 5/5 isolated after the deadlock fix                                                                                                                                                                                                                                                              |
| `third-stage-decision-vault` / `third-stage-privacy-2`   | 5/5 and 5/5 isolated                                                                                                                                                                                                                                                                             |
| Dev DB `public` rows                                     | 1304 before and after runs                                                                                                                                                                                                                                                                       |
| Leaked test schemas                                      | 672 → 0                                                                                                                                                                                                                                                                                          |

Baseline failing set and its causes: `TEST_BASELINE_FAILURES.md`. The suite is not green, and
`QA_ALL_PASS` cannot be claimed: most remaining failures are `AI_LIVE_BLOCKED_EXTERNAL`
(`.env` has `DAPI_API_KEY=""`), which is the same condition that blocks `DAPI_VERIFIED`.

## Measurement and §60 verification (closed by AFTER benchmark)

The empirical AFTER benchmark is recorded in `docs/architecture/BATCH1_BENCHMARK_AFTER.md`
(machine-readable artifact in `artifacts/persistence-benchmark-after-results.json`).

Key empirical findings:

- **`BATCH1_SQL_COST_LINEAR_WITH_DB_SIZE = false` (PROVEN)**: Tested on isolated databases at
  $N = 1,007$ and $N = 12,607$ rows. Statement count for single business writes on migrated models
  is strictly flat ($O(1)$) across both scales: `createJourney` (6 statements vs 6 statements,
  15.4–18.7 ms p50), `createJourneyHighRisk` (7 vs 7 statements, 14.7–17.2 ms p50), `checkinAction`
  (15 vs 15 statements, 18.4–26.2 ms p50), `readNotification` (5 vs 5 statements, 7.8–8.8 ms p50),
  `writeAction` (11 vs 11 statements, 16.7–19.9 ms p50), `deliverFollowUp` (48 vs 48 steady-state
  statements, 53 published avg at 12.6k with warm-up outlier; 31.7–77.4 ms p50; note statement count
  is flat but read I/O volume scales with unmigrated tables), `readNotifications` (1 vs 1 statement),
  and `readJourneyDetail` (5 vs 5 statements).
  This eliminates the BEFORE baseline's $N + 93$ ($1,093 \to 12,694$) statement scaling.
- **`BATCH1_FULL_FLUSH_ON_WRITE = false` (PROVEN)**: Confirmed in code and by query event capture
  during a full legacy store flush — exactly 0 upserts run for any of the eight migrated models.
- **`BATCH1_DELETE_ABSENT = false` (PROVEN)**: Confirmed in code and by query event capture —
  exactly 0 `DELETE FROM` statements run for any of the eight migrated models during flushes.
- **`BATCH1_DUAL_WRITER = false` (PROVEN)**: The eight models write exclusively through
  `Batch1PersistenceService` and adhere to the `User` → `LifeJourney` → `ActionCommitment` lock
  hierarchy.
- **`BATCH1_FK_SILENT_CLEARING = false` (PROVEN)**: `journeyIds`, `jobIds`, and `commitmentIds`
  guards are resolved from PostgreSQL inside the active transaction; no guard checks an unhydrated array.
- **`BATCH1_PERSISTENCE_TESTS_PASS` (PROVEN)**: 6/6 test files and 48/48 tests pass cleanly on
  isolated leased databases (`batch1-action` 15/15, `batch1-aijob` 8/8, `batch1-journey` 12/12,
  `batch1-safetyevent` 5/5, `batch1-usernotification` 6/6, `persistence-durability` 2/2).
- **`DEV_DB_NOT_POLLUTED` (PROVEN)**: Dev database `goodnight_treehole` public schema row count
  remains exactly 1,304 rows before and after runs. 0 test schemas and 0 test databases remain.
- **`MIGRATION_CLEANROOM_PASS` (PROVEN)**: Verified clean replay from zero across all 12 tracked
  migrations via `scripts/verify-third-stage-migrations.ts`.

## Open items this report does not close

- **Multi-instance safety is proven for two `AIJob` paths only.** Boot recovery and the
  terminal-state CAS race were exercised with two independent instances against one database.
  **No cross-instance Journey, Action, Checkin, SafetyEvent or notification flow was raced against
  a competing legacy flush**, so the earlier "all eight models are multi-instance safe" wording was
  wrong and has been withdrawn from `BATCH1_MULTI_INSTANCE.md`. Application-wide safety is absent
  for the two reasons that remain outside this batch: the `followUpJobs` mirror is a second read
  input, and 35 models are still process-local.
- **The stale-snapshot foreign-key case is untested.** The guards close the *empty-array* failure —
  the round's founding hard gate — but a legacy row whose database `journeyId` is valid while its
  stale snapshot omits the field can still be nulled by a competing flush. That case has no test.
- **The benchmark's latency comparison is not like-for-like.** The `BEFORE` figures include the
  drained AI lifecycle and its five flushes; the `AFTER` recording stops at the HTTP operation. The
  statement-count flatness is the real result; the latency ratios are not yet comparable. See the
  warning box in `BATCH1_BENCHMARK_AFTER.md`.
- **Distributed concurrency under multi-client network load is unmeasured.** Single-process
  coroutines pass 1/5/10 concurrent with 0 lost updates and 0 pool exhaustion.
- **CI does not verify the baseline identity.** The full-suite job is `continue-on-error` and its
  label no longer claims a baseline match, but a failing-set diff against
  `TEST_BASELINE_FAILURES.md` is still required before CI can catch a new regression.
- **D/E were reviewed by different models than A/B/C.** `code-reviewer` was quota-exhausted, so
  `architecture-reviewer` did the first pass and `final-gate` the follow-ups. That mix found eleven
  blocking defects, so the coverage was real — but the reviewer model differs, which is recorded
  rather than hidden.
- **The lock-hierarchy rule is a live architectural constraint.** Every future transaction that
  writes `LifeJourney`, or inserts a row whose foreign key references `User` or `LifeJourney`, must
  acquire `User` → `LifeJourney` locks first, with multi-row locks in deterministic id order. It is
  stated in `BATCH1_DESIGN.md` under D3 and must be re-derived when the legacy flush is retired.

**The final gate returned `PERSISTENCE_BATCH1_REJECTED`** — see `BATCH1_FINAL_GATE.md`. The
rejection concerns the *strength of the stated guarantees*, not the reality of the improvement: the
statement-count flatness is measured and real, but the multi-instance claim covers two paths rather
than eight models, the latency comparison is not like-for-like, the stale-snapshot FK case is
untested, and CI cannot yet distinguish a new failure from a known one.

`PERSISTENCE_BATCH1_STABLE` is **not** claimed, and neither is "all eight models are
multi-instance safe". `QA_ALL_PASS` is separately blocked by `AI_LIVE_BLOCKED_EXTERNAL`.
