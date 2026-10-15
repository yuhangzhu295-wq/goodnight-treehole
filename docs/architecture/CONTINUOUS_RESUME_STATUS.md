# Continuous Resume Status

Per-task state so progress does not live only in a session context. `IMPLEMENTED` is **not** `DONE`:
the columns are separate on purpose.

**HEAD at this writing:** `a3a106e` on `codex/ui-v2-native-redesign`, **pushed, local == remote.**
Working tree clean.

**Last verified evidence (2026-10-15, second pass):**
- **Latest full run: `tests/business` + `tests/api` + `tests/e2e` = 60/60 files, 326 passed / 0 failed / 8 skipped.**
- `pnpm typecheck` clean; `pnpm lint` **0 errors** (9 pre-existing warnings); `pnpm test:unit` **38/38**.
- **Latest full run (2026-10-15): `tests/business` + `tests/api` + `tests/e2e` = 60/60 files,
  326 passed / 0 failed / 8 skipped.** One file (`third-stage-persistence-independent`) failed inside
  that run with `Can't reach database server at 172.31.189.221:5432` — the WSL VM suspending
  mid-suite, not a regression. Re-run alone: 2/2.
- `tests/unit` 38/38; `pnpm typecheck` clean; `pnpm lint` **0 errors** (9 pre-existing warnings).
- Reverse proofs on this branch: **M-E** (reply gate reads cache → 403 becomes 201), **M-F** (journey owner
  filter removed → 8 of 16 foreign-id cases report `stranger got 200/201`), **M-G** (safety read gated
  on consent → `expected 200 "OK", got 403`), **M-H** (claim's status guard removed →
  `expected 'superseded' to be 'delivered'`), plus the three mutations for the write-ownership fix.
- `tests/cross`: **did not run** — refuses without a DAPI key (`A supplied DAPI key is required for
  cross-end AI acceptance`). That is `NOT_RUN_NO_SECRET`, **not** a pass, and it means the one edit
  made to `tests/cross/cross.spec.ts` in this pass is unverified.
- The write-ownership fix is reverse-proved by three mutations (see `DEMO_USER_FALLBACK_CLOSURE.md`).
- CI on the commits before `a3a106e` was green; `a3a106e` itself has not been through CI yet.

Earlier evidence: CI **green** on `c16b71a` (run 38396476874) — migration-immutability check,
`prisma migrate deploy` on a fresh database, typecheck, lint, unit tests, the Batch 1 gate, the full
business suite, and the baseline-diff gate. The tolerated-failure baseline was **cleared**, so any
failure is now a new regression.

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
| 11a | **C-end write paths filed everything under `user_demo` (P0)** | fixed `57b6714`, mutation-proven, device-verified | `createMood` resolved its owner with the fixed demo id and never read the request identity, so a mood created by an anonymous session was stored under `user_demo` and was **absent from its author's own diary list** while the demo account held it. Also made "not interested" global and `favoritedByCurrentUser` identical for every viewer. Fixed with `viewerUserId()` (reads) and `requireViewerId()` (writes, 401 without). `tests/business/cend-write-ownership.spec.ts` 7/7; three mutations each fail the named assertion |
| 11b | **`GET /api/v1/tonight` served the demo account's private dashboard (P0)** | fixed `c8d48e8`, reverse-proved | The identity matrix listed this as a public "Tonight summary"; it returns the caller's journey, actions, check-ins, follow-ups, peer matches and latest letter. Measured: no credential and an unrelated credential both received `user_demo`'s PRIVATE journey. Now 401 without an identity |
| 12 | Batch 3 final gate | **2 of 8 established, 2 more partly** | `SELF_FULL_FLUSH=false` ESTABLISHED — `BATCH3_SELF_FULL_FLUSH_GATE.md`, 4/4 tests plus a discriminating mutation. **`SELF_ROUTE_IDENTITY_PASS=true` ESTABLISHED** (2026-10-15) for its identity and ownership axes — 87/87 C-end and 4/4 admin routes have a 401 negative test, 43/43 parameterised routes have foreign-id evidence, mutation M-F fails 8/16; `BATCH3_ROUTE_IDENTITY_GATE.md`. **`PRIVACY_PASS` and `MULTI_INSTANCE_SELECTED_FLOWS_PASS` PARTLY established** (2026-10-15) — see the design's §4 rows for exactly what each now holds and what neither claims (consent is enforced centrally by `privacyAllows`; one Self flow races, not all; no Self flush/reload race). `PERSISTENCE_BATCH3_STABLE` stays **false** |
| 13 | Batch 4 — retire the legacy flush for the 16 models that still carry an active sweep | **not started** | the audit's §3.1 lists them with writer counts; the ownership rule closed the exposure, this removes the dual writer |
| 14 | Test database isolation | partial | the runner leases a database per file; the design's seed/fixture rules are not done |
| 15 | CI | **green** | see above; the tolerated-failure baseline was **cleared**, so any failure is now a new regression |
| 16 | C-end UI V2 (39 pages) | Rounds 1–2 rendered; Round 3 implemented (1 page partial); **Round 4 not started** | `docs/design-v2/UI_V2_MASTER_QUEUE.json`; see below |
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

**Next UI entry point:** Round 3 is implemented (10 pages; `ReportMonth` is shell-only, and the six
pages below still owe a device render), and **Round 4 (14 pages) has one page touched**: `Square.vue`
had its hardcoded `· 2 小时前` and `想被理解` replaced with real data (`d51f378`) — a data fix, not the
restyle, so its hero, cards and mood pills are still the V1 language. Round 4's remaining pages:
MoodCreate, PostDetail, LetterToday, ToolIndex, ToolDecompose, ToolRun, DiaryList, DiaryDetail,
LetterList, LetterDetail, FavoriteList, FeedbackHelp, HelpFaqs.

Round 3 pages that still owe a verified render: PrivacySettings, DataPolicy, ReportMonth's lower
half, Archive, MemoryCenter, DecisionVault.

Follow the per-page loop in each page's `逐页提示词/NN_*.md`: read the design → preserve the data
contract → minimal UI change → targeted tests → real emulator screenshot → visual-judge → fix →
regression → commit/push.

**A note for the next session about `Square`:** its design (`22_Square.png`) is a flat list with
`最新/热门` tabs, and the API's `GET /api/v1/posts` takes only `emotion`/`mood` — there is **no sort
parameter**, so a `热门` tab has no backend today. Either add a real `sort` parameter or leave the tab
out; do not ship a tab that only reorders the fetched page and calls itself 热门.

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
2. **Narrowed to a display-only lag, and now pinned** (2026-10-15). The finding read *"the
   in-process privacy cache is still consulted by two display projections and by `createReply`, so a
   cross-instance revocation can lag. The write gate must read the database."* Re-measured: the
   `createReply` half was already fixed (it awaits `getPrivacySettings`), and every authorization
   path goes through `privacyAllows` (16 callers), which reads the row whenever
   `DIRECT_DB_MODELS.PrivacySetting` is true - as does `activeMemoriesForTask`'s live branch. What
   remains cache-backed is **display only**: `decoratePost`'s `allowHumanReplies` and
   `peerExperienceSummary`'s `allowAnonymousExperienceStats`. A stale display can offer a reply the
   server then refuses with 403; no reply gets through.
   The gate was unpinned - a change back to the cached accessor would not have failed any test - so
   `tests/business/privacy-gate-reads-database.spec.ts` now revokes **directly in PostgreSQL**,
   asserts the process cache is still stale (so the scenario is what it claims), expects 403 with the
   privacy message, then restores consent and expects 201. **M-E** (gate reads
   `getCachedPrivacySettings`) fails it with `expected 403 "Forbidden", got 201 "Created"`.
   The display lag is left as a bounded, documented behaviour rather than fixed by making
   `decoratePost` async and adding a batched privacy read per feed; that is a scoped follow-up.
3. **Fixed** (`207b514`) — memory state operations refuse on an effectively expired row.
4. **Fixed** (`207b514`) — the journey root lock is unconditional in both entry points.
5. **Fixed** — RecoverySnapshot registered with three exits; graduation and the derived snapshot are
   one atomic transaction.
6. **CLOSED** — the fallback was on 21 C-end routes, none of them Self routes (the ones the finding cited are peer routes and were already fixed). Measured: six of six read routes answered 200 without a credential and one served a real record. All 21 now require an identity; two remaining fallbacks are intentional (`/auth/demo`, and an admin route behind `this.admin(auth)`). See `DEMO_USER_FALLBACK_CLOSURE.md`. Seven specs were relying on the removed fallback and now send the demo identity.
   **A second pass (2026-10-15) covered the two shapes the first pass could not:** writes that never
   consulted the identity at all (`createMood`, `uploadMedia`, `createFeedbackTicket`, `createReply`,
   `hidePostForCurrentUser`), and `GET /api/v1/tonight`, which the identity matrix had itself declared
   public. Both are fixed and reverse-proved. The matrix is corrected in
   `SELF_ROUTE_IDENTITY_MATRIX.md` §4–5. **Still open:** `queueAI`'s unreachable
   `input.userId ?? getDemoUserId()` default (Batch 4).
7. **CLOSED as stale** (2026-10-15) — the finding read *"the audited admin memory read has no route,
   and the admin table still expands content from list rows."* Both halves are addressed:
   `GET /api/admin/v1/memory/:id` (`controllers.ts:2860`) calls
   `getAuditedMemoryForAdmin(id, admin.id)`, and the list route
   (`controllers.ts:2869`) returns metadata only with a comment stating the search never runs over
   the memory text. Fixed in a commit after the review was written.
8. **CLOSED as stale** (2026-10-15) — the finding read *"`MemoryCenter.vue` does not call the new
   re-consent route, so the approved flow is unreachable from the product."* It does call it:
   `apps/mp/src/views/MemoryCenter.vue:133` posts to `/api/v1/me/memories/:id/reactivate`, and the
   control renders for `effectiveState(item) === 'expired'` as `data-testid="memory-reconsent"`
   ("重新确认使用", line 378). The route is `controllers.ts:1206`.
9. **Fixed** (`207b514`) — M9/M10 insert their racy read before the barrier and genuinely fail.
10. **Open (P2)** — mutation coverage is missing for the memory exits, the eligibility predicates,
    deletion terminality and the audited read.
11. **M51** (over-correction mutation) is proven by direct observation per the audit's §4.
12. **Open (documentation, P2)** — `SELF_ROUTE_IDENTITY_MATRIX.md` §2's "Negative Test" column names
    tests such as *"Peer: User C is refused on match between A and B"* and attributes them to
    `batch3-identity-matrix.spec.ts`. Those names occur **nowhere in the repository**; the peer
    coverage that exists is in `batch2-peer-verification.spec.ts` test 3.3 and works at the
    persistence layer. The column therefore reads as evidence while pointing at nothing, and reading
    the document cannot reveal it. Recorded in `BATCH3_ROUTE_IDENTITY_GATE.md` §4/§5; the column
    itself has not been rewritten, because doing so would erase the evidence of how the gate was
    mis-read.

## External blockers

- **DAPI**: empty `DAPI_API_KEY`, so `DAPI_VERIFIED=false` and `QA_ALL_PASS=false` are forced. The
  development agent's model is unrelated to the product's DAPI.
- **Physical Android device**: absent, so `PHYSICAL_ANDROID_VERIFIED=false`.
- **`app.close()` stall**: intermittently exceeds 30–120 s, cause **not identified** after
  instrumenting both provider hooks and the HTTP server. Recorded as open.
- **Reviewer providers intermittently unreachable**; when that happens the work is marked
  `WAITING_REVIEW` rather than self-approved.

## Environment facts that cost time (read before the next session)

0. **WSL2 suspends and the forwarded ports die with it.** Hold it awake for the whole run from the
   Windows side - `(wsl.exe -e sleep 21600 &)` in a Git Bash session works and survives tool calls;
   a `nohup sleep` started *inside* WSL does not, because WSL tears the process tree down when the
   invoking command returns. Symptom when it lapses: `psql: FATAL: the database system is shutting
   down`, then `[INFRASTRUCTURE_FAILURE] Cannot connect to PostgreSQL`. A `-l -v` state of `Stopped`
   that flips to `Running` on the next invocation is this, not a test failure.
   `netsh interface portproxy` needs an elevated shell and cannot be recreated here, so point
   `DATABASE_URL`/`REDIS_URL` at the WSL IP directly (`wsl.exe -e bash -lc "hostname -I"`), and pass
   `TEST_PG_PORT=5432` - the `.env` values use ports 15432/16379 that no longer forward.

1. **The local API is not in watch mode.** It runs as `npx tsx src/main.ts`, so after editing
   `apps/api/src` the endpoint keeps returning old results until the process on port 3000 is killed
   and `pnpm --filter @goodnight/api dev` is restarted.
2. **`adb reverse tcp:3000 tcp:3000` is lost** when the emulator or adb server restarts. The app then
   shows `网络连接不上，请检查网络后重试` (the UI2-011 message) and every page looks empty.
3. **Another project's automation steals the emulator foreground** (`com.yuhangzhu295.cozyfocus`,
   running as its own process; `pm disable-user` does not stop it). The rate is worse than "about
   every 35 seconds": on 2026-10-15 a `dumpsys` check reported our activity on top and a screenshot
   taken seconds later showed CozyFocus, and a tap issued in that window landed in the other app and
   looked like "submit did nothing". Use `scripts/ui2-capture.mjs`, which re-asserts our activity
   **before each tap** and refuses to write a capture unless the complete `topResumedActivity` is ours
   and the frame is portrait; `scripts/device-mood-e2e.sh` is a smaller version that aborts instead of
   tapping blind. Neither can close the check-to-tap gap. **Do not kill the other project's processes.**
   For data questions, prefer verifying with the credential the app holds
   (`scripts/verify-device-credential-ownership.mjs`) over tapping the UI.
4. **`adb shell` paths get mangled by Git Bash**: `/data/data/...` becomes `C:/Program Files/Git/...`.
   Set `MSYS_NO_PATHCONV=1` for those commands.
5. **github.com:443 is intermittently unreachable**; `git push` may need several retries over minutes.
   Always confirm `git rev-parse HEAD origin/<branch>` collapses to one line before calling it pushed.

## Next entry point

The identity/data-safety thread is at a clean stopping point: both P0s found in this pass are fixed,
reverse-proved, device-verified and pushed. The largest remaining user-facing item is **UI V2
Round 4 (14 pages)**, then Round 3's six missing renders. **Batch 4** (task 13) is the higher-risk
data-safety one — it removes the dual writer for the 16 models in
`LEGACY_SWEEP_DATA_LOSS_AUDIT.md` §3.1 — and Batch 3's remaining seven gates (task 12) sit next to it.

Two things to re-check before starting either: the API on port 3000 must be restarted after any
`apps/api/src` edit (it is not in watch mode), and `adb reverse tcp:3000 tcp:3000` must be re-applied
after an emulator or adb-server restart.
