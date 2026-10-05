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
| C | `AIJob` | Not started | — |
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
| `batch1-usernotification.spec.ts` | 6/6 |
| `batch1-safetyevent.spec.ts` | 5/5 |
| `third-stage-decision-vault` / `third-stage-privacy-2` | 5/5 and 5/5 isolated |
| Dev DB `public` rows | 1304 before and after runs |
| Leaked test schemas | 672 → 0 |

Baseline failing set and its causes: `TEST_BASELINE_FAILURES.md`. The suite is not green, and
`QA_ALL_PASS` cannot be claimed: most remaining failures are `AI_LIVE_BLOCKED_EXTERNAL`
(`.env` has `DAPI_API_KEY=""`), which is the same condition that blocks `DAPI_VERIFIED`.

## Open items this report does not close

- **Sub-batches C, D, E** — six models still memory-authoritative.
- **A real product defect, newly unmasked** — `persistence-durability` Defect 1 now fails with an
  assertion rather than pool exhaustion: an AI completion overwrites the user's PATCHed journey
  summary. Bisected to confirm sub-batches A/B are not the cause; it is the interleaving
  sub-batch D is specified to fix.
- **§60 success conditions** — `BATCH1_FULL_FLUSH_ON_WRITE`, `BATCH1_DELETE_ABSENT`,
  `BATCH1_SQL_COST_LINEAR_WITH_DB_SIZE` and the rest are still **false** for the six unmigrated
  models. The before/after benchmark, concurrency and multi-instance reports are not yet
  produced.
- **Remaining phases** — the peer mega-spec split, GitHub CI, clean dev-DB rebuild, load and
  concurrency gates, Android/Admin/Security regression, live AI, and the final gate.

`PERSISTENCE_BATCH1_STABLE` is **not** claimed. `BATCH1_REFERENCE_SAFETY.md`'s safety properties
are proven of the design and observed for two models; they are not yet verified for the batch.
