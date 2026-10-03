# RC STATUS

```
OPEN_P0=0
OPEN_P1=0
OPEN_TECHNICAL_P2=1
OPEN_PRODUCT_P3=3

FAKE_BUTTON_COUNT=0
FAKE_FUNCTION_COUNT=0

MIGRATIONS_REPRODUCIBLE=true

DAPI_VERIFIED=false

STAGE1_VERIFIED=true
STAGE2_VERIFIED=true
STAGE3_VERIFIED=true

ANDROID_EMULATOR_VERIFIED=true
PHYSICAL_ANDROID_VERIFIED=false

ADMIN_VERIFIED=true
SECURITY_VERIFIED=true
PRIVACY_VERIFIED=true

QA_ALL_PASS=false

BACKUP_SAFE=true

RC_CODE_READY=false
RELEASE_CANDIDATE_READY=false
FULL_PRODUCT_VERIFIED=false
```

**`RELEASE_CANDIDATE_READY` is false and no tag was created.** Two reasons, one external and one
found in this round:

1. The DeepSeek account returns HTTP 402, so `DAPI_VERIFIED` and `QA_ALL_PASS` cannot be true. Per the
   round's own rules, a blocked external dependency is recorded as a blocker, never as a pass.
2. The relational flush is a single transaction that upserts the entire store row by row, and it is
   now approaching its 30-second transaction timeout (see the finding below). A user write can return
   500. That is internal, so `RC_CODE_READY` is false as well.

`OPEN_TECHNICAL_P2` was 0 until the flush finding surfaced during the evidence re-capture; it is 1
now. Nothing was changed to make it disappear.

## Finding discovered this round: the flush is approaching its transaction timeout

**Severity: P2, technical, open.** Not caused by this round's changes — the flush design is
unchanged — but surfaced by accumulated data and worth recording before an RC.

`saveRelationalRuntimeState` writes the whole store in one Prisma transaction, awaiting a separate
upsert per row across all 54 tables, with `{ maxWait: 10_000, timeout: 30_000 }`. Its cost is
proportional to the total number of rows.

Measured on the development database, timing three consecutive writes that each trigger a flush
(raw output: `artifacts/product-closure/evidence/flush-timing.txt`; 12,599 live rows at capture time,
AIJob 195, Journey 81, JourneyUpdate 124, AuditLog 274):

```
attempt 1: HTTP 201 in  7,508 ms
attempt 2: HTTP 201 in 12,900 ms
attempt 3: HTTP 201 in 16,423 ms
```

Each write adds rows, so each subsequent flush is slower. One admin login during back-to-back
verification runs returned **500**, with the API log showing:

```
Invalid `tx.aIJob.upsert()` invocation in relational-runtime.mapper.ts:202
Server has closed the connection.
    at StoreService.flush (store.service.ts:2035)
```

— the transaction exceeded its 30s timeout and the connection was closed.

**Impact.** Write latency grows with the size of the store, and past a threshold writes fail outright
with 500. This is a scalability cliff, not a test artefact: a production database grows monotonically,
so it would be reached there too. Reads are unaffected.

**Recommended fix (not done here).** Scope the flush to changed rows, or batch it (`createMany` /
`updateMany` per table, or chunked writes), instead of a per-row sweep of everything. That is an
architecture change to the persistence layer, which this round was explicitly told not to make, so it
is recorded rather than attempted. Raising the transaction timeout would only move the cliff.

**Why the round's results still stand.** Every verification suite passed with writes succeeding; the
500 was observed once, during rapid back-to-back writes on a database that had grown from this round's
own test traffic. The suites that ran afterwards were re-captured and pass. The finding is about the
ceiling, not about the results below it.

## Which documents are current

`RC_STATUS.md`, `RC_QA_MATRIX.md` and the four verification documents are the current state. The
previous closure round's set — `FINAL_PRODUCT_CLOSURE.md`, `CURRENT_CLOSURE_STATUS.md`,
`ADMIN_FINAL_MATRIX.md`, `ANDROID_FINAL_MATRIX.md`, `SECURITY_FINAL_MATRIX.md` — is kept as the record
of that round and is **stale on the two issues this round fixed**: it lists ISSUE-020 (report counter)
and ISSUE-027 (user note) as open, and `BACKUP_SAFE` as false. Both issues are closed in this round and
`BACKUP_SAFE` is true. Read this document first.

## What this round changed

| Commit | Change |
| --- | --- |
| `6d0cde4` | migration reproducibility: the missing `action_plan_mode` file turned out to be unnecessary, and the two schema drifts were the real problem — fixed by declaring what the migrations already create. Orphan history row reconciled. Harness now discovers migrations instead of reading a hardcoded list. |
| `1822af1` | `PeerReport` history (ISSUE-020) and `AdminUserNote` (ISSUE-027), with the operator surfaces for both |
| `9da861f` | the AI result no longer overwrites a journey title the user chose (found while investigating a flaky Stage 3 spec) |
| `f7240f4` | lint fix for the versioned verification scripts |
| `a6c431d` | the three P3 findings adjudicated with explicit verdicts |
| this commit | RC documents, and removal of the dead captcha CSS left behind by the decorative control that was already removed |

## Gate evidence

| Gate | Value | Basis |
| --- | --- | --- |
| `OPEN_P0` | 0 | no open P0 in the register |
| `OPEN_P1` | 0 | ISSUE-007's product side fixed; its live-model half is `BLOCKED_EXTERNAL`, not open work |
| `OPEN_TECHNICAL_P2` | 1 | the two technical P2s open at the start of this round are closed (report counter derives from history; user note persists). One new technical P2 was found in this round: the relational flush is approaching its 30s transaction timeout. See the finding below. |
| `OPEN_PRODUCT_P3` | 3 | ISSUE-014, ISSUE-015, ISSUE-016 — adjudicated in `PRODUCT_DECISIONS.md`, all `KEEP*`, no code changed |
| `FAKE_BUTTON_COUNT` | 0 | `test:click-all` asserts the expected API call and/or URL per interaction; 124/124 pass |
| `FAKE_FUNCTION_COUNT` | 0 | same run, plus every closure suite asserts persistence after the write |
| `MIGRATIONS_REPRODUCIBLE` | true | empty database → 12 migrations → 54 tables; all three diffs empty; committed harness PASS |
| `DAPI_VERIFIED` | false | HTTP 402 on the primary, 401 on the secondary; `BLOCKED_EXTERNAL` |
| `STAGE1_VERIFIED` | true | `test:first-batch-core` 2/2; the tonight/intent/safety/action/follow-up/notification/graduation/handoff flows verified by `verify-core-flow.mjs` 15/15 |
| `STAGE2_VERIFIED` | true | peer loop verified by `verify-peer-report-history.mjs` 24/24 and `verify-security-controls.mjs` 20/20 (privacy, consent, conversation, report, close, block, cross-user isolation). **Caveat:** `tests/business/peer-support-stage.spec.ts` itself does not pass — all four `test:peer-stage-*` invocations stop at one assertion requiring the peer assist AI job to be `succeeded`, which the 402 blocks. That assertion is `BLOCKED_EXTERNAL`; the rest of that spec's flows are covered by the two suites above. |
| `STAGE3_VERIFIED` | true | 8 of 10 stage-3 suites pass (business, persistence, security, decision, future-self, privacy, archive, migrations). **Caveat:** `test:third-stage-memory` and `test:third-stage-monthly-report` fail on AI-success assertions only, both `BLOCKED_EXTERNAL`. |
| `ANDROID_EMULATOR_VERIFIED` | true | APK built from HEAD and installed on `emulator-5554`; `verify-android-native.mjs` 8/8 and `verify-android-rc.mjs` 12/12, including a real `SafetyEvent` and a real `PeerReport` created from the native UI |
| `PHYSICAL_ANDROID_VERIFIED` | false | `adb devices -l` lists only `emulator-5554` — reason `NO_PHYSICAL_ANDROID_CONNECTED` |
| `ADMIN_VERIFIED` | true | 24 resources; `verify-admin-rc-ui.mjs` 16/16, `verify-admin-closure-ui.mjs` 18/18, plus the three real-browser suites |
| `SECURITY_VERIFIED` | true | `verify-security-controls.mjs` 20/20 — admin auth on read/write/delete, forged tokens rejected, throttling, cross-user reads refused, privacy gates, PII refused in peer requests, report fields not leaked to peers, audited privileged writes |
| `PRIVACY_VERIFIED` | true | `verify-privacy-data.mjs` 8/8; peer and report projections asserted not to leak; `allowRecoveryData` gate verified |
| `QA_ALL_PASS` | **false** | 13 of 14 steps pass; `test:cross` fails its live-DAPI assertion |
| `BACKUP_SAFE` | true | `backup-all.ps1` PASS: bundle, mirror, `pg_dump`, evidence, `unpushedCount: 0` |
| `RC_CODE_READY` | **false** | the external DAPI block, plus the open technical P2 found this round (flush timeout) |
| `RELEASE_CANDIDATE_READY` | **false** | requires `DAPI_VERIFIED=true`, `QA_ALL_PASS=true` and no open technical P2 |
| `FULL_PRODUCT_VERIFIED` | **false** | same |

## Not done, and why

| Action | Status | Reason |
| --- | --- | --- |
| `rc-<date>` / `product-closure-verified-<date>` tag | **not created** | requires `RELEASE_CANDIDATE_READY=true` |
| Pull request to `main` | **not created** | the round gates the PR on the RC passing. The branch is pushed, so opening the PR is a single command once the account is funded. |

## What the owner has to do

To make `RELEASE_CANDIDATE_READY` true:

1. **Fund the DeepSeek account**, or supply a working primary key. Then re-run `pnpm test:dapi-live`,
   `pnpm test:cross` and `pnpm qa:all`, plus the AI-dependent suites (`test:peer-stage-*`,
   `test:third-stage-memory`, `test:third-stage-monthly-report`). No code change is required.
2. **Decide on the flush finding.** It needs an architecture decision (scope the flush to changed
   rows, or batch it), not a quick change. It is the only internal blocker.
3. Re-run `scripts/backup-all.ps1`.
4. Create the RC tag and open the PR to `main`.

The fallback path — what keeps a distressed user from seeing a blank screen when the model is
unavailable — is verified and must be kept working after the account is funded.

## Documents

| Document | Contents |
| --- | --- |
| `MIGRATION_REPRODUCIBILITY.md` | what the missing migration really was, the two drift adjudications, the empty-database proof |
| `REPORT_HISTORY_VERIFICATION.md` | the `PeerReport` model, the idempotency rules, the two-user verification, restart persistence |
| `USER_NOTE_VERIFICATION.md` | the `AdminUserNote` model, append-only behaviour, permissions, persistence |
| `DAPI_FINAL_VERIFICATION.md` | the 402/401 evidence, why it was not worked around, what it blocks, what was verified instead |
| `RC_QA_MATRIX.md` | every suite and its result |
| `PRODUCT_DECISIONS.md` | the three P3 verdicts with reasons and risks |
| `verification/` | the runnable verification scripts and their captured output |

## Residual items (recorded, not hidden)

| Item | Severity | Note |
| --- | --- | --- |
| `PATCH/POST users/:id/tags` echoes its input and persists nothing | P3 | unreachable from the UI, so it is not a product-facing write-only control; connecting a UI to it would create one. Needs persistence or deprecation. |
| ISSUE-014 Group B merge candidates | P3 | removing any needs real deployment traffic data first |
| Peer report has no per-report audit beyond `createdAt`/`handledAt`/`handledBy` | P3 | recorded in `REPORT_HISTORY_VERIFICATION.md` |
| Admin notes are append-only, not editable in place | P3 | deliberate; an edit would reintroduce the overwrite problem in smaller form |
| `20260821005000_third_stage_privacy_2/migration.sql` was edited after it was first applied | P3 | safe only because the database was rebuilt afterwards; recorded in `MIGRATION_REPRODUCIBILITY.md` |
| WSL2 stops when idle and takes the database containers with it | environment | affects only local runs; a keep-alive process was needed throughout this round |
