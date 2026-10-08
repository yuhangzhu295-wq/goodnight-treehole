# Continuous Resume Status

Per-task state for the persistence programme, so progress does not live only in a session context.
`IMPLEMENTED` is **not** `DONE`: the columns are separate on purpose.

**HEAD at this writing:** `207b514` on `codex/post-recovery-validation`, pushed. Last verified
baseline: full suite 7 failed / 26 passed files, 8 failed / 173 passed tests, `check:baseline-diff`
SUCCESS with 0 new regressions; unit suite 15/15; typecheck and lint clean.

| # | Task | IMPLEMENTED | TESTED | REVIEW_APPROVED | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | Batch 1 (8 models) | yes | yes | yes | `PERSISTENCE_BATCH1_ACCEPTED` |
| 2 | Batch 2 (5 peer models) | yes | yes | yes | `PERSISTENCE_BATCH2_STABLE`; three review rounds, all closed |
| 3 | Batch 3 design | yes | n/a | yes | ten review passes, `DESIGN_APPROVED` |
| 4 | Batch 3 step 1 (PrivacySetting, TrustedContact, StableSelfProfile, RealityHandoff, PersonalSupportPlan) | yes | yes | **no** | 8/8 mutations; review findings 2, 6, 7, 8 below touch it |
| 5 | Batch 3 step 2a (journey transition rule, idempotent graduation) | yes | yes | **no** | 12/12 mutations after M9/M10 were repaired |
| 6 | Batch 3 step 2b (MemoryItem state machine) | yes | yes | **no** | 9 cases; the review found the eligibility query and two state-table defects, both fixed |
| 7 | Batch 3 RecoverySnapshot | yes | yes | **no** | 6/6 mutations (M13-M18); closes finding 5 |
| 8 | Batch 3 DecisionRecord + CooldownItem | no | no | no | |
| 9 | Batch 3 MessageToFutureSelf + worker | no | no | no | |
| 10 | Batch 3 route identity / admin disclosure matrix | partial | partial | no | findings 6 and 7 |
| 11 | Batch 3 final gate | no | no | no | `PERSISTENCE_BATCH3_STABLE` stays **false** |
| 12 | Batch 4 legacy store retirement | no | no | no | needs `LEGACY_STORE_RETIREMENT_PLAN.md` first |
| 13 | Test database isolation | partial | partial | no | the runner leases a database per file already; the design's seed/fixture rules are not done |
| 14 | GitHub Actions CI | no | no | no | |
| 15 | C-end UI de-AI | partial | partial | no | global layer done; ~21 files remain, plus the `design_refs/` baseline conflict |
| 16 | Android verification | no | no | no | `PHYSICAL_ANDROID_VERIFIED=false` (no physical device) |
| 17 | Admin verification | no | no | no | |
| 18 | Security / privacy regression | partial | partial | no | |
| 19 | DAPI live | no | no | no | `BLOCKED_EXTERNAL` — empty `DAPI_API_KEY` |

## Open findings from the Batch 3 review, in the reviewer's order

1. **Fixed** (`207b514`) — AI eligibility is now one owner-scoped statement with all predicates.
2. **Open (P1)** — the in-process privacy cache is still consulted by two display projections and by
   `createReply`, so a cross-instance revocation can lag. The write gate must read the database.
3. **Fixed** (`207b514`) — memory state operations now refuse on an effectively expired row.
4. **Fixed** (`207b514`) — the journey root lock is unconditional in both entry points.
5. **Fixed** — RecoverySnapshot registered with three exits; graduation and derived snapshot are one atomic transaction.
6. **Open (P1)** — Self routes still silently fall back to the demo user.
7. **Open (P1)** — the audited admin memory read has no route, and the admin table still expands
   content from list rows.
8. **Open (P1)** — `MemoryCenter.vue` does not call the new re-consent route, so the approved flow is
   unreachable from the product.
9. **Fixed** (`207b514`) — M9/M10 now insert their racy read before the barrier and genuinely fail.
10. **Open (P2)** — mutation coverage is missing for the memory exits, the eligibility predicates,
    deletion terminality and the audited read.

## External blockers

- **DAPI**: `.env` has an empty `DAPI_API_KEY`, so `DAPI_VERIFIED=false` and `QA_ALL_PASS=false` are
  forced. The development agent's own model is unrelated to the product's DAPI.
- **Physical Android device**: absent, so `PHYSICAL_ANDROID_VERIFIED=false`.
- **`app.close()` stall**: observed exceeding 30–120 s intermittently, cause **not identified** after
  instrumenting both provider hooks (each returns in milliseconds) and the HTTP server (zero
  connections). Recorded as open, not fixed.
- The review agents are intermittently unreachable (provider quota or upstream timeouts). When that
  happens the subtask is marked `WAITING_FOR_INDEPENDENT_REVIEW` rather than self-approved.

## Next entry point

RecoverySnapshot (task 7): register it with the three exits, move the graduation-derived insert into
the graduation transaction so finding 5 closes, and convert its readers.
