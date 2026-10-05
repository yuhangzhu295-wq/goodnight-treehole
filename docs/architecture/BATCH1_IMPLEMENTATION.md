# BATCH1_IMPLEMENTATION.md

Status of the Batch 1 persistence migration: moving eight models from the memory-authoritative
store to PostgreSQL-authoritative incremental writes.

**This report is current as of commit `9150f45` and is deliberately partial — it does not claim
the batch is finished.** Two of the eight models are migrated, reviewed and verified; the
remaining six are not started. The success conditions in §60 of the round brief are therefore
**not** met, and `PERSISTENCE_BATCH1_STABLE` must not be claimed.

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

| # | Model | State | Commit |
| --- | --- | --- | --- |
| A | `UserNotification` | **Done, reviewed APPROVE** | `81308e7` |
| B | `SafetyEvent` (+ D1 AuditLog) | **Done, reviewed APPROVE** | `3234ef0` |
| C | `AIJob` | **Done; review fixes applied; deadlock regression found and fixed** | `cd919fd` |
| D | `Journey` + `SituationSnapshot` + `JourneyUpdate` | Not started | — |
| E | `ActionCommitment` + `OutcomeCheckin` | Not started | — |

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
flaky, and both from the same cause — making notifications database-authoritative changed *when*
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
is currently enforced *through* that sweep, so it stops deleting database rows and audit rows
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

| Check | Result |
| --- | --- |
| `npx vitest run tests/business/` before isolation | 10 failed / 46 passed; newly-failing set vs baseline **empty** |
| Same, after isolation (`9150f45`) | 9 failed / 16 passed files; failing set a **strict subset** of baseline |
| Same, after sub-batch C (`cd919fd`) | 9 failed / 17 passed files, 10 failed / 54 passed tests; failing set within baseline; **0** `40P01` deadlocks |
| `batch1-usernotification.spec.ts` | 6/6 |
| `batch1-safetyevent.spec.ts` | 5/5 |
| `batch1-aijob.spec.ts` | 8/8 |
| `first-batch-core-loop.spec.ts` | 5/5 isolated after the deadlock fix |
| `third-stage-decision-vault` / `third-stage-privacy-2` | 5/5 and 5/5 isolated |
| Dev DB `public` rows | 1304 before and after runs |
| Leaked test schemas | 672 → 0 |

Baseline failing set and its causes: `TEST_BASELINE_FAILURES.md`. The suite is not green, and
`QA_ALL_PASS` cannot be claimed: most remaining failures are `AI_LIVE_BLOCKED_EXTERNAL`
(`.env` has `DAPI_API_KEY=""`), which is the same condition that blocks `DAPI_VERIFIED`.

## Open items this report does not close

- **Sub-batches D and E** — six models still memory-authoritative: `Journey`,
  `SituationSnapshot`, `JourneyUpdate`, `ActionCommitment`, `OutcomeCheckin`, and the
  `Journey`-coupled completion callback which becomes a legitimate direct writer only once D
  lands.
- **A real, reproducible product defect that D must fix** — `persistence-durability` Defect 1
  fails **4 of 4 isolated runs**: the test PATCHes a journey `summary` and the database then
  holds an AI-generated fallback summary, so an AI completion is overwriting user-confirmed
  content. It was bisected to confirm sub-batches A and B are not the cause (it passes with
  A+B code under the old test environment), and it is the interleaving
  `BATCH1_DESIGN.md` assigns to D: "`user_confirmed` and AI completion interleaved: the
  confirmed content must never be reverted to draft by the AI". It is deterministic in
  isolation and only *appears* intermittent in a full-suite run because run ordering sometimes
  masks it — so D must fix the behaviour, not the timing.
- **§60 success conditions** — `BATCH1_FULL_FLUSH_ON_WRITE`, `BATCH1_DELETE_ABSENT`,
  `BATCH1_SQL_COST_LINEAR_WITH_DB_SIZE` and the rest are still **false** for the six unmigrated
  models. The before/after benchmark, concurrency and multi-instance reports are not yet
  produced.
- **Remaining phases** — the peer mega-spec split, GitHub CI, clean dev-DB rebuild, load and
  concurrency gates, Android/Admin/Security regression, live AI, and the final gate.

`PERSISTENCE_BATCH1_STABLE` is **not** claimed. `BATCH1_REFERENCE_SAFETY.md`'s safety properties
are proven of the design and observed for three models; they are not yet verified for the batch.
