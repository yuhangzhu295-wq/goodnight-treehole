# Autonomous State

**Branch:** `codex/post-recovery-validation`  **HEAD:** `d3cde21` (== origin)
**Last verified baseline:** full suite 7 failed / 27 passed files, 8 failed / 183 passed tests;
`check:baseline-diff` SUCCESS, 0 new regressions. Unit 15/15. Typecheck and lint clean.

## Done, with evidence

| Task | Commit | Evidence |
| --- | --- | --- |
| Batch 1 (8 models) | — | `PERSISTENCE_BATCH1_ACCEPTED` |
| Batch 2 (5 peer models) | `446b57a` | three review rounds closed; 12/12 mutations |
| Batch 3 design | `539525a` | ten review passes, `DESIGN_APPROVED` |
| Batch 3 step 1 (5 models) | `98b7219` | 8/8 mutations; fixed eight missing `await`s that had disabled privacy gates |
| Batch 3 step 2a (journey rule) | `8c33cb8` | 12/12 mutations after M9/M10 were repaired to a pre-lock read |
| Batch 3 step 2b (MemoryItem) | `4440033` | 9 cases; found the missing mapper sweep guard that deleted committed rows |
| Batch 3 review round 1 fixes | `7314db3` | eligibility is one query; memory state table; unconditional root lock; M9/M10 discriminate |
| RecoverySnapshot + atomic graduation | `e4af158` | three exits verified by the orchestrator in the mapper; 10/10 new spec; fault injection rolls graduation back |
| R-02 authorization half | `8e6477b` | the human-reply gate reads the database, not the process cache |
| R-06 Self route demo fallback | this commit | 24/24 identity matrix spec; mutations M19-M23 proven; 0 new regressions |

## Running now

`B3-R07` — admin memory disclosure (metadata only in list/search, audited single-record read).

## Waiting

`B3-R05` — implemented and test-verified, but the independent review stream dropped. Marked
`WAITING_REVIEW`; it must not be self-approved, and it does not block other tasks.

## Open findings from the Batch 3 review

| # | Status |
| --- | --- |
| 1 eligibility one query | fixed `7314db3` |
| 2 privacy cache | authorization half fixed `8e6477b`; display half needs an async refactor |
| 3 memory state table | fixed `7314db3` |
| 4 journey root lock | fixed `7314db3` |
| 5 graduation atomicity | fixed `e4af158`; review pending |
| 6 Self route demo fallback | fixed |
| 7 admin memory disclosure | open, next READY task |
| 8 MemoryCenter re-consent | open |
| 9 M9/M10 discrimination | fixed `7314db3` |
| 10 mutation coverage | open |

## Not claimed

`PERSISTENCE_BATCH3_STABLE` stays **false** until the ten gate predicates hold with evidence and an
independent reviewer approves. `QA_ALL_PASS=false` and `DAPI_VERIFIED=false` are forced by the empty
`DAPI_API_KEY`. `PHYSICAL_ANDROID_VERIFIED=false` (no device). `FULL_MULTI_INSTANCE_READY=false`
(Phase 3 not done).
