# Continuous Resume Status

Per-task state so progress does not live only in a session context. `IMPLEMENTED` is **not** `DONE`:
the columns are separate on purpose.

**HEAD at this writing:** `c16b71a` on `codex/ui-v2-native-redesign`, **pushed, local == remote.**
Working tree clean.

**Last verified evidence:**
- CI **green** on `c16b71a` (run 38396476874) and on the commits before it. The job runs the
  migration-immutability check, `prisma migrate deploy` on a fresh database, typecheck, lint, unit
  tests, the Batch 1 gate, **the full business suite**, and the baseline-diff gate.
- Full business suite: **42/42 files, 277 passed / 0 failed / 7 skipped**. Baseline-diff gate
  `Total Failures 0 | Known Baseline 0 | New Regressions 0`, exit 0.
- `pnpm typecheck` clean; `pnpm lint` 0 errors (9 pre-existing warnings); `pnpm test:unit` 36/36.

## Where the work stands

| # | Task | State | Evidence / notes |
| --- | --- | --- | --- |
| 1 | Batch 1 (8 models) | DONE | `PERSISTENCE_BATCH1_ACCEPTED` |
| 2 | Batch 2 (5 peer models) | DONE | `PERSISTENCE_BATCH2_STABLE`, three review rounds closed |
| 3 | Batch 3 design | DONE | `DESIGN_APPROVED` |
| 4 | B3 step 1 (PrivacySetting, TrustedContact, StableSelfProfile, RealityHandoff, PersonalSupportPlan) | implemented, tested, **review open** | findings 2/6/7/8 below touch it |
| 5 | B3 step 2a (journey transition, idempotent graduation) | implemented, tested, review open | 12/12 mutations |
| 6 | B3 step 2b (MemoryItem state machine) | implemented, tested, review open | 9 cases |
| 7 | B3 RecoverySnapshot | implemented, tested, review open | 6/6 mutations (M13–M18) |
| 8 | B3 DecisionRecord + CooldownItem | implemented, tested | `batch3-decision-cooldown.spec.ts` |
| 9 | B3 MessageToFutureSelf + worker (A6: consent read inside the claim transaction) | implemented, tested | `batch3-future-self-authority.spec.ts` |
| 10 | **B3-R11 revocable anonymous session** (P0: identity spoofing) | implemented, live-verified | credential `<sessionId>.<secret>`, only `sha256(secret)` stored, DB lookup so instances agree and restarts preserve identity; expiry / per-device revocation / rotation. `batch3-identity-credential.spec.ts` (16), `docs/architecture/IDENTITY_CREDENTIAL_STORAGE.md` |
| 11 | **Legacy sweep data loss (P0)** | fixed, reproduced, mutation-proven | reproduced on the real DB (`moodCount 13 → 0`); ownership rule in `relational-runtime.mapper.ts`; `tests/business/legacy-sweep-ownership.spec.ts` 4/4; **M50** proven. `docs/architecture/LEGACY_SWEEP_DATA_LOSS_AUDIT.md` |
| 12 | Batch 3 final gate | **1 of 8 gates established** | `SELF_FULL_FLUSH=false` ESTABLISHED — `BATCH3_SELF_FULL_FLUSH_GATE.md`, 4/4 tests plus a discriminating mutation. The other seven are not established; `PERSISTENCE_BATCH3_STABLE` stays **false** |
| 13 | Batch 4 — retire the legacy flush for the 16 models that still carry an active sweep | **not started** | the audit's §3.1 lists them with writer counts; the ownership rule closed the exposure, this removes the dual writer |
| 14 | Test database isolation | partial | the runner leases a database per file; the design's seed/fixture rules are not done |
| 15 | CI | **green** | see above; the tolerated-failure baseline was **cleared**, so any failure is now a new regression |
| 16 | C-end UI V2 (39 pages) | Rounds 1–2 done, 3–4 not started | `docs/design-v2/UI_V2_MASTER_QUEUE.json`; see below |
| 17 | Android verification | not done | `PHYSICAL_ANDROID_VERIFIED=false` (no physical device) |
| 18 | Admin verification | not done | |
| 19 | Security / privacy regression | partial | |
| 20 | DAPI live | **BLOCKED_EXTERNAL** | empty `DAPI_API_KEY` |
| 21 | FINAL QA, backup | not done | |

## UI V2 — exact position

Branch `codex/ui-v2-native-redesign`. Queue: `docs/design-v2/UI_V2_MASTER_QUEUE.json`; issues:
`docs/design-v2/UI_V2_ISSUES.md` (15 entries, all with the `UI2-` prefix — the numbers are namespaced
because the repo already had a product-audit `ISSUE-001..027` series).

**Round 1 (4 pages)** and **Round 2 (10 pages)** are all *rendered* on device. `done` is **no** for
every page: the `visualApproved` and `codeReviewApproved` axes are outstanding because no reviewer
provider was reachable, and interaction coverage is uneven.

Defects found and fixed on this branch, all verified on a real APK on `emulator-5554`:
`UI2-008` (footer/composer covered by the tab bar), `UI2-009` (a failed read receipt swallowed the
notification tap), `UI2-010` (composer not pinned, conversation opened on its oldest message),
`UI2-011` (raw English network error in the Chinese UI), `UI2-012` (同路人's 我的请求 tab listed the
wrong direction), `UI2-013` (consent page's fake acknowledgement), `UI2-014` (two symptom options
clipped and unreachable), `UI2-015` (JourneyDetail still V1).

**Next UI entry point:** the stabilize step of JourneyDetail was restyled but **not captured**, so its
appearance is unverified. After that, Round 3 (11 pages) then Round 4 (14 pages), following the
per-page loop in each page's `逐页提示词/NN_*.md`: read the design → preserve the data contract →
minimal UI change → targeted tests → real emulator screenshot → visual-judge → fix → regression →
commit/push.

## Product defects fixed on this branch (not UI)

1. **`POST /journeys/:id/graduation-consent` always returned 401** (`缺少用户身份标识`).
   `saveGraduationConsent` called `this.graduationSummary(journeyId)` in all four return paths without
   forwarding the resolved user, so `requireJourney` resolved an empty id. **A user could never share
   their graduated journey anonymously.** Fixed and verified live; a missing credential still 401s.
2. **`POST /peer-experiences` never returned the draft's `status`** — the response used the
   other-viewer projection. The three owner-facing write responses now add it back.

Details: `docs/architecture/PEER_JOURNEY_CONTRACT_FIXES.md`.

3. **`FutureSelf.vue` blanked itself when the optional context was refused** (A8). The letter list
   and three optional context lists loaded in one `Promise.all`, and `/me/recovery` is gated on
   `allowRecoveryData`, so turning that consent off hid letters that were independently readable.
   The letters are now the critical path and the optional context degrades on its own. Pinned by a
   test in `batch3-future-self-authority.spec.ts`.

Six specs were **stale**, not the product: two asserted single-sided consent (the contract is
two-sided), two called endpoints with no credential (relying on the demo fallback R-06 removed), one
read the now-disabled `store.aiJobs` getter. DAPI-dependent assertions are **skipped** via
`requireDapi(ctx)` with `NOT_RUN_NO_SECRET` — never asserted into a pass. Consequence to remember:
**the memory scoping in `third-stage-memory-independent` has no coverage until credentials exist.**

## Open findings from the Batch 3 review

1. **Fixed** (`207b514`) — AI eligibility is one owner-scoped statement.
2. **Open (P1)** — the in-process privacy cache is still consulted by two display projections and by
   `createReply`, so a cross-instance revocation can lag. The write gate must read the database.
3. **Fixed** (`207b514`) — memory state operations refuse on an effectively expired row.
4. **Fixed** (`207b514`) — the journey root lock is unconditional in both entry points.
5. **Fixed** — RecoverySnapshot registered with three exits; graduation and the derived snapshot are
   one atomic transaction.
6. **CLOSED** — the fallback was on 21 C-end routes, none of them Self routes (the ones the finding cited are peer routes and were already fixed). Measured: six of six read routes answered 200 without a credential and one served a real record. All 21 now require an identity; two remaining fallbacks are intentional (`/auth/demo`, and an admin route behind `this.admin(auth)`). See `DEMO_USER_FALLBACK_CLOSURE.md`. Seven specs were relying on the removed fallback and now send the demo identity.
7. **Open (P1)** — the audited admin memory read has no route, and the admin table still expands
   content from list rows.
8. **Open (P1)** — `MemoryCenter.vue` does not call the new re-consent route, so the approved flow is
   unreachable from the product.
9. **Fixed** (`207b514`) — M9/M10 insert their racy read before the barrier and genuinely fail.
10. **Open (P2)** — mutation coverage is missing for the memory exits, the eligibility predicates,
    deletion terminality and the audited read.
11. **M51** (over-correction mutation) is proven by direct observation per the audit's §4.

## External blockers

- **DAPI**: empty `DAPI_API_KEY`, so `DAPI_VERIFIED=false` and `QA_ALL_PASS=false` are forced. The
  development agent's model is unrelated to the product's DAPI.
- **Physical Android device**: absent, so `PHYSICAL_ANDROID_VERIFIED=false`.
- **`app.close()` stall**: intermittently exceeds 30–120 s, cause **not identified** after
  instrumenting both provider hooks and the HTTP server. Recorded as open.
- **Reviewer providers intermittently unreachable**; when that happens the work is marked
  `WAITING_REVIEW` rather than self-approved.

## Environment facts that cost time (read before the next session)

0. **WSL2 suspends and the forwarded ports die with it.** `ensure-infra.mjs` probes TCP properly
   and reports the containers reachable, but the VM can suspend seconds later, so the next process
   sees `ECONNREFUSED`. Hold it awake for the whole run, e.g. `(wsl.exe -e sleep 1200 &)` before
   `ensure-infra.mjs`, and pass an explicit IPv4 `DATABASE_URL` (`127.0.0.1`, not `localhost`)
   to the test runner, which otherwise prefers the `.env` value.

1. **The local API is not in watch mode.** It runs as `npx tsx src/main.ts`, so after editing
   `apps/api/src` the endpoint keeps returning old results until the process on port 3000 is killed
   and `pnpm --filter @goodnight/api dev` is restarted.
2. **`adb reverse tcp:3000 tcp:3000` is lost** when the emulator or adb server restarts. The app then
   shows `网络连接不上，请检查网络后重试` (the UI2-011 message) and every page looks empty.
3. **Another project's automation steals the emulator foreground** about every 35 seconds
   (`com.yuhangzhu295.cozyfocus`, launched from uid 2000; `pm disable-user` does not stop it). Use
   `scripts/ui2-capture.mjs`, which re-asserts our activity **before each tap** and refuses to write a
   capture unless the complete `topResumedActivity` is ours and the frame is portrait.
4. **github.com:443 is intermittently unreachable**; `git push` may need several retries over minutes.
   Always confirm `git rev-parse HEAD origin/<branch>` collapses to one line before calling it pushed.

## Next entry point

Batch 3's final gate (task 12) and then Batch 4 (task 13), or continue the UI V2 rounds — both are
valid; Batch 4 is the data-safety one and carries higher risk than the UI track.
