# Autonomous State

**Branch:** `codex/post-recovery-validation`  **HEAD:** `9146413`
**Last verified baseline:** full suite 7 failed / 27 passed files, 8 failed / 199 passed tests;
`check:baseline-diff` SUCCESS, 0 new regressions, previous-run comparison live (`files:37 (comparable)`).
Unit 15/15. Typecheck and lint clean.

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
| RecoverySnapshot + atomic graduation | `e4af158` | three exits verified in the mapper; 10/10 new spec; fault injection rolls graduation back |
| R-02 authorization half | `8e6477b` | the human-reply gate reads the database, not the process cache |
| R-06 Self route demo fallback | `5c5702f`.. | 24/24 identity matrix spec; mutations M19-M23 proven; 0 new regressions |
| R-07 admin disclosure | `5c5702f` | metadata only in list/search; audited single-record read |
| R-08 MemoryCenter re-consent | `5c5702f` | the UI calls the real re-consent endpoint; browser-verified |
| R-12 private /me aliases | `0f9bd71` | ten aliases require identity; 26/26 identity matrix; mutation M29 proven |
| R-13 admin token | `7b596cf` | HMAC bearer token + role check; 12/12 disclosure spec; mutations M30/M31 proven |
| Gate scope guard | `9146413` | nine tests for `compareWithPreviousRun`; reverse proof fails four named tests |

## Running now

Nothing. The next READY task is `B3-R15` (P2) or `B3-FLAKE` (P1); `B3-R12` and `B3-R13` are
`WAITING_REVIEW`.

## Also fixed this run

The baseline gate's previous-run record (`9146413`). The scope guard added in `f352429` never fired:
it wrote `/D/g` instead of `/\D/g`, so `Number('files:37')` was `NaN`, `NaN >= NaN` was false, and the
record was frozen. It had already been clobbered to `files:1` by a one-file run, which made
`scopeMatches` false on every full run and printed `0 new since previous run` unconditionally. The
comparison had therefore been inert since `f352429` — including during the R-12/R-13 work. The record
is repaired to `files:37` and the comparison is live again.

## Corrected claims

`B3-R14` was recorded as `DONE` in `f352429` with the evidence line "a narrower run cannot overwrite a
broader record". That was not true when it was written: the guard never fired. The entry now carries
`tested: yes` and the real history, and the fix has a reverse proof.

## Waiting on review

`B3-R05`, `B3-R06`, `B3-R07`, `B3-R08`, `B3-R12`, `B3-R13` are implemented and test-verified but not
independently reviewed. None may be self-approved. The review of R-05..R-08 returned
`REQUEST_CHANGES` (1 P0 + 3 P1 + 1 P2); the P1s are closed, the P0 is `B3-R11`.

## Open findings from the Batch 3 review

| # | Status |
| --- | --- |
| 1 eligibility one query | fixed `7314db3` |
| 2 privacy cache | authorization half fixed `8e6477b`; display half needs an async refactor (`decoratePost`, `peerExperienceSummary`, 14 call sites) |
| 3 memory state table | fixed `7314db3` |
| 4 journey root lock | fixed `7314db3` |
| 5 graduation atomicity | fixed `e4af158`; review pending |
| 6 Self route demo fallback | fixed `5c5702f`; completed for the `/me` aliases in `0f9bd71` |
| 7 admin memory disclosure | fixed `5c5702f`; the fabricated-token hole found by review is fixed `7b596cf` |
| 8 MemoryCenter re-consent | fixed `5c5702f` |
| 9 M9/M10 discrimination | fixed `7314db3` |
| 10 mutation coverage | partial: M29-M31 added; the harness still matches tests by substring |
| 11 identity header is not authentication | **open P0**, `B3-R11`, needs a session or signed anonymous credential |

## Not claimed

`PERSISTENCE_BATCH3_STABLE` stays **false** until the ten gate predicates hold with evidence and an
independent reviewer approves. It now has one more reason to stay false: the batch's identity claim
cannot be made while a caller who knows any user id can pass every ownership check (`B3-R11`).
`QA_ALL_PASS=false` and `DAPI_VERIFIED=false` are forced by the empty `DAPI_API_KEY`.
`PHYSICAL_ANDROID_VERIFIED=false` (no device). `FULL_MULTI_INSTANCE_READY=false` (Phase 3 not done).
