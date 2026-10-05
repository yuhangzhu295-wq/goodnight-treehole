# TEST BASELINE FAILURES

The business suite does not currently pass in full. This file records the failing set **before**
the Batch 1 persistence work, so that each sub-batch can be judged by whether it *adds* a
failure rather than by an absolute pass count that the environment cannot produce.

Measured by the orchestrator, not taken from an implementer's summary.

## Command and baseline

```
npx vitest run tests/business/ --reporter=basic
```

| | Baseline `5de2d0e` | Branch `270a61c` (sub-batch A, pre-fix) |
| --- | --- | --- |
| Test files | 10 failed / 13 passed (23) | 10 failed / 14 passed (24) |
| Tests | 12 failed / 33 passed (45) | 11 failed / 39 passed (50) |

The file and test counts differ because sub-batch A adds `batch1-usernotification.spec.ts`
(5 tests). The 23-file baseline is the comparable figure.

## The baseline failing set (12 tests)

```
first-batch-core-loop.spec.ts        pauses ordinary routing for a safety event, persists the real-world handoff, and records notification readback
front-me.spec.ts                     loads profile, stats, report, and persists privacy settings
front-publish-private.spec.ts        keeps a private mood out of the square and persists its asynchronous private letter
front-publish-public.spec.ts         creates a public post, queues AI, and becomes visible after admin approval
front-tools.spec.ts                  runs decompose and generic tools, then saves a real diary record
goodnight-2-incremental.spec.ts      connects two distinct persisted users through a reviewed experience and a 72 hour human conversation
goodnight-2-incremental.spec.ts      delivers an overdue follow-up through Redis/BullMQ and persists the unread notification
goodnight-2-incremental.spec.ts      persists situation, action, peer, safety and recovery records across refreshes
peer-support-stage.spec.ts           requires privacy, consent, and an active conversation before messages can cross users
persistence-durability.spec.ts       Defect 1: PATCH /api/v1/journeys/:id persists title and summary to database before response
third-stage-memory-independent.spec.ts  uses only consented, active, in-scope memory in a real DAPI AI job and records the exact memory ids
third-stage-monthly-report.spec.ts   summarizes persisted recovery facts without sending data to AI before long-term analysis is allowed
```

## Causes actually verified

Only two causes were diagnosed; the rest are recorded as observed, not explained.

**1. External AI unavailable — `.env` has `DAPI_API_KEY=""` (length 2, i.e. empty).**

`DAPI_BASE_URL` is set but the key is empty, so any assertion that a real DAPI call reaches
`succeeded` cannot hold. Confirmed directly on `peer-support-stage.spec.ts`:
`AssertionError: expected 'failed' to be 'succeeded'`, and the same assertion fails identically
at the baseline commit. This is the `AI_LIVE_BLOCKED_EXTERNAL` class, not a product defect and
not a migration defect — it is the same condition that blocks `QA_ALL_PASS` and `DAPI_VERIFIED`
in the closure register. It must be reported as blocked-external, never as a pass.

**2. Connection-pool exhaustion under parallel suite load.**

`persistence-durability.spec.ts` Defect 1 fails with
`Too many database connections opened: FATAL: sorry, too many clients already` when the suite
runs in parallel. It fails on the baseline commit as well, so it is pre-existing infrastructure
behaviour, not a product defect — and equally not a pass. The same class of artifact invalidated
the benchmark's first concurrency trial (read-phase pool exhaustion), which is why the benchmark
document refuses to claim "no lost updates" from it. Running the spec in isolation passes.

**Everything else** in the list above is recorded as "present on both commits, cause not
individually diagnosed". It is not claimed to be external-AI, and it is not claimed to be
harmless. A sub-batch is only required to keep the set from growing.

## The development database IS polluted — at the schema level

`DEV_DB_NOT_POLLUTED` cannot be claimed from a `public`-schema row count. Measured directly on the
project database (container `goodnight-treehole-postgres-1`, port 15432):

| Measurement | Value |
| --- | --- |
| Live rows in `public` across 54 tables | 1304 |
| Applied migrations | 12 |
| **Leftover `goodnight_treehole_test_*` schemas** | **429** |

`public` is stable, so a row count taken there does not move and looks clean. The pollution is
elsewhere: `resetTestDatabase()` (`scripts/test-database.ts:23–33`) drops only the schema it is
about to recreate, and the name it recreates is derived from the process and pool id
(`goodnight_treehole_test_business_43220_1`), so **each run mints new schema names and never
drops the old ones**. 429 schemas have accumulated, roughly 20 per full business-suite run, and
the three verification runs performed while reviewing sub-batch A added to the count.

An implementer reported "dev DB row count before 1304, after 1304, `DEV_DB_NOT_POLLUTED`
confirmed". The numbers are right and the conclusion does not follow: they were taken from
`public` only. This is the second time in this round that a measurement was taken against the
wrong target (the first was port 5432 instead of 15432), so the rule for the remaining
sub-batches is that a pollution claim must name the query and the scope it covered.

This is the concrete justification for the test-isolation work (`TEST_ISOLATION_DESIGN.md`): a
per-run database created by `prisma migrate deploy` and dropped afterwards, never a
`db push`-built schema inside the development database.

## After test isolation (`9150f45`)

The suite now runs through `scripts/test-runner.ts`, which leases **one freshly migrated database
per spec file** (`goodnight_treehole_test_<runId>`, built by `prisma migrate deploy`, dropped
afterwards) and runs files serially.

| | Baseline `5de2d0e` | After isolation `9150f45` |
| --- | --- | --- |
| Test files | 10 failed / 13 passed (23) | 9 failed / 16 passed (25) |
| Tests | 12 failed / 33 passed (45) | 10 failed / 46 passed (56) |

The failing set is a strict subset of the baseline. Three things changed, and each is explained:

**1. The connection-pool exhaustion class is gone.** `persistence-durability` Defect 1 and
`third-stage-persistence-independent` previously failed intermittently with
`FATAL: sorry, too many clients already`; serial execution against a per-file database removed
it. Note this also means the earlier "runs pass in isolation" observations were measured against
the old environment and are not directly comparable.

**2. A first attempt at one database *per run* was rejected.** Sharing one database across the
whole suite broke file-to-file isolation — the old design gave each file its own schema — and
four specs that previously passed began failing from cross-file contamination
(`front-letter`, `third-stage-archive`, `third-stage-security-independent`,
`third-stage-privacy-2`, each passing in isolation). `TEST_ISOLATION_DESIGN.md` §4 prescribes
one database **per file** as the fallback, which is what shipped. The four are green again.

**3. `persistence-durability` Defect 1 now fails for a different, real reason — a product
defect the old environment was masking.** Its cause changed from pool exhaustion to an assertion:

```
AssertionError: expected '这次的重点不是立刻解决全部问题，而是先承认"测试旅程持久化写入耐久性"确实…'
                to be '持久化验证总结内容'
```

The test PATCHes `summary`, and the database then holds an AI-generated fallback summary — an AI
completion is overwriting user-confirmed content. This was bisected rather than assumed:

| Code | Environment | Result |
| --- | --- | --- |
| `5de2d0e` (pre-batch) | old per-schema | PASS 2/2 |
| `3234ef0` (sub-batches A+B) | old per-schema | PASS 2/2 |
| `9150f45` (sub-batches A+B) | new per-file database | **FAIL (assertion)** |

Sub-batches A and B are therefore **not** the cause; the new environment surfaced it. It is
**deterministic**: 4 of 4 isolated runs through the runner fail, and it only *looks*
intermittent in a full-suite run because file ordering sometimes masks it. This is the exact
interleaving `BATCH1_DESIGN.md` assigns to **sub-batch D**: "`user_confirmed` and AI completion
interleaved: the confirmed content must never be reverted to draft by the AI". It is recorded
here as an open product defect to be closed by D — the isolation change did not create it, it
stopped hiding it — and D must fix the behaviour, not the ordering.

**Resolved by sub-batch D (`501d115`).** The AI completion write now carries a commit-time
condition (`confidence: { not: 'user_confirmed' }`) plus an `updatedAt` CAS on the Journey, so a
user PATCH or confirmation that lands during the AI call makes the AI write affect 0 rows.
`persistence-durability` passes 2/2 in three consecutive isolated runs, and it was failing 4/4
before. With it, the suite's failing set is 8 files / 9 tests against this baseline's 10 files /
12 tests — every remaining failure is `AI_LIVE_BLOCKED_EXTERNAL` or a pre-existing
non-AI expectation.

**Leaked schemas.** The count had grown from 429 to **672** during this round's verification runs.
They were dropped (only the `goodnight_treehole_test_*` prefix; `public` untouched at 54 tables,
12 migrations, 1304 rows) and the runner no longer creates any, because it leases databases
instead of schemas. Both counts now measure zero.

**Cost.** Serial per-file leasing costs ~7.0 s per file of which ~2.2 s is create + 12 migrations
+ drop, so the business suite runs in ~175 s instead of ~40 s. That is the accepted price of
file-level isolation, per the design's fallback.

## How this is used

A sub-batch's regression evidence is a diff against this list, not a pass count:

- the failing set must remain a **subset** of the baseline set;
- any test that newly fails, or that changes from failing to passing, must be explained with a
  cause — a newly passing notification test is not automatically good news, and a newly failing
  one is not automatically a flake.

Sub-batch A took three attempts to reach that state, and both intermediate failures were real
regressions rather than flakes — which is why they were fixed in code instead of by relaxing an
assertion. Both came from the same cause: making `UserNotification` database-authoritative
changed *when* a notification becomes observable relative to the legacy in-memory store.

1. **First attempt** — the worker created the notification inside the same transaction as the
   claim, so it became visible at commit, before `reloadRuntimeState()` refreshed the store.
   `third-stage-decision-vault` then failed intermittently (measured 1 of 3 isolated runs): a
   reader could see the `COOLDOWN_RELEASED` notification while `/api/v1/decisions` still read
   `cooling`, which is the state the notification's deep link leads to.
2. **Second attempt** — the fix put the legacy-model writes in one transaction, the reload
   next, and the claim plus notification in a second transaction. That inverted the window:
   `third-stage-privacy-2` polls `messageToFutureSelf.deliveredAt` and then requires the
   FollowUpJob to be `delivered`, but the legacy write now committed *before* the claim, so the
   legacy state became visible while the job was still `pending`.
3. **Final** — the claim commits **atomically with the legacy-model writes**, then the store is
   reloaded, then the notification is created last and idempotently. That satisfies both
   directions: legacy state visible ⇒ job already `delivered`, and notification visible ⇒ store
   already consistent. The notification create is not skipped when the claim matched zero rows
   (a retry after a crash between the two transactions would otherwise lose it permanently);
   instead it is gated on the job's current status being `delivered` and made idempotent by the
   deterministic id, so a duplicate is a `P2002` no-op.

Verified independently by the orchestrator: `10 failed / 40 passed`, and the newly-failing set
against this baseline is **empty**. `first-batch-core-loop` and
`goodnight-2-incremental > delivers an overdue follow-up…` also moved from failing to passing,
because notification reads are no longer served from the store.
