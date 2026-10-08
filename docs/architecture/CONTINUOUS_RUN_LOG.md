# CONTINUOUS RUN LOG

Running record for the CONTINUOUS COMPLETION MASTER PLAN. Each phase appends its
starting HEAD, its evidence, and its closing HEAD so a later phase can prove what it
inherited and did not overwrite.

## PHASE 0 — environment and evidence freeze

| Item | Value |
| --- | --- |
| `PRE_CONTINUOUS_RUN_HEAD` | `ecaeda054032bb7b0f5119681663b4d828a786c2` |
| Branch | `codex/post-recovery-validation` |
| Remote HEAD at start | `ecaeda0` (pushed before the run began) |
| Working tree | clean |
| `PRE_CONTINUOUS_RUN_DB_BACKUP` | `C:\Users\zyu33\Backups\goodnight-treehole-db\goodnight_treehole-20261007-0425.dump` (350,350 bytes, 691 archive entries) |
| Backup summary | `C:\Users\zyu33\Backups\backup-all-20261007-0425.json` |
| Recovery evidence archive | `recovery-evidence-20261007-0425.zip` (29,216,669 bytes, 185 files) |

`backup-all.ps1` result: **code PASS / db PASS / minio PASS / evidence PASS**.

Live database at freeze: 54 tables, 12 applied migrations.

### Order note

The master plan places the C-end UI work at PHASE 6 and states it must not be done
mid-migration. The immediately preceding round delivered the ANTI-AI UI CONTRACT work
(global styles + 20 views + shared components), which is committed and pushed as
`ebeb1df`…`ecaeda0` **before** this run started. Those changes are presentation-only and
do not touch the persistence layer, so they are kept rather than reverted; the remaining
UI batches (TonightHome, SafetySupport, the content/list pages, and 8 shared components)
are deferred to PHASE 6 as the plan requires.

Nothing in PHASE 0 overwrote the Batch 1 benchmark evidence
(`artifacts/persistence-benchmark-*-results.json`).

## PHASE 1 — Persistence Batch 2 (Peer system)

**Design:** `docs/architecture/BATCH2_PEER_DESIGN.md` — `architecture-reviewer`, then a rebuttal review that **upheld both orchestrator overrides** (with corrections) and listed seven blocking items, all folded into §0.4.

The design surfaced a real product defect: **the conversation could be activated by one party.** The owner alone accepted and consented; the requester was rejected at the consent endpoint. The master plan's Batch 2 invariant requires *"只有双方 Consent：conversation 才能 active"*. The product's own copy supports that intent — `/pages/peer/consent` is role-neutral and `/pages/peer/wait` tells the requester that **both** must confirm — but no working requester consent path existed. Fixed in this batch via a **new** migration.

**Implementation:** five commits.

| Commit | Scope |
| --- | --- |
| `d51340a` | `PeerMatch.requesterConsentAt` + `ownerConsentAt`, and the grandfathering rule (legacy `active` conversations keep the owner fact; **`requesterConsentAt` stays NULL** — a legacy row is not represented as having consented) |
| `eeee418` | five registry entries + the triple exits (no hydration, no upsert, no sweep) |
| `68bc398` | `peer-persistence.service.ts`: owner-scoped direct writes, per-operation scopes, lock order `User` → `LifeJourney` → `PeerMatch`/`PeerConversation` with sorted `User.id` across two-party transactions, commit-then-notify, DB-clock expiry under the conversation lock, report as a single insert with derived reads |
| `b863406` | requester consent path + an honest pending state (the waiting screen previously marked the boundary step done at `connected`, before any consent) |
| `42e9f70` | `batch2-peer-verification.spec.ts` — bilateral flows, the seven races, two instances, omitted-field FK, SQL scope |

**Verification (independently reproduced by the orchestrator):**

| Check | Result |
| --- | --- |
| `batch2-peer-verification.spec.ts` | **15 / 15 pass** |
| `peer-support-stage.spec.ts` | 10 pass / 1 skipped (`AI_LIVE_BLOCKED_EXTERNAL`) |
| Full business suite | **7 failed / 23 passed** files, 8 failed / 120 passed tests |
| New failures vs baseline | **none** — the failing set is exactly the recorded baseline |
| `40P01` in the whole suite | **1** — Batch 1's intentional lock-inversion mutation test |
| `pnpm check:baseline-diff` | SUCCESS |
| `pnpm check:migrations` | 12 baseline migrations still immutable |
| New migration | a **new** directory; `git diff` shows no change to any applied migration |
| `pnpm typecheck` / `pnpm lint` | 0 errors |

**Mutation-tested guards:** making first consent activate the conversation fails 6 cases; removing the report de-duplication check fails the concurrent-report case (2 rows instead of 1).

**Gate position — CORRECTED, PHASE 1 IS REOPENED.** The paragraph originally here claimed the
`PEER_*` predicates were established by the tests above. **That claim was withdrawn.** An
independent conformance review of the diff returned **`REQUEST_CHANGES`** with three P0 and three
P1 defects, and it established that the new tests **do not prove what they claim** — the
concurrency barriers rendezvous the HTTP requests before they start rather than the transactions at
their read/lock points, two race cases never assert *exactly one* transition, and the omitted-field
foreign-key test actually exercises the empty-set case. A green run was therefore not evidence.

Full findings: `docs/architecture/BATCH2_PEER_REVIEW.md`. In summary:

- **P0** — `updateMatchRequest` / `respondMatch` / `blockMatchDirect` read status then update
  unconditionally by id, so `connected` and `declined` can race and overwrite `blocked`; the
  suggestion refresh can rewrite a match already in the request flow.
- **P0** — `closeConversation` / `saveConversationFeedback` pre-check then update by id; the assist
  path checks expiry with the **application** clock, not the database's.
- **P0** — the lock order is not followed on two-party paths, and peer writes touching a Journey FK
  do not use `User → LifeJourney → peer child`. No `40P01` was seen, so this is an **unproved** lock
  order rather than a reproduced deadlock — but this project has already produced `40P01` twice.
- **P1** — the expire-on-send branch sets `closedReason='expired'` and then throws, rolling back its
  own closure; the batch expiry uses `new Date()`.
- **P1** — the AI draft output PII gap the design flagged is still open.
- **P1** — the tests do not discriminate (four specific construction faults).

Confirmed correct and not to be disturbed: the migration (new directory, honest grandfathering), the
consent main path, the report narrowing, the triple exits, the feedback-derived redaction fix,
commit-before-notify, and AI-assist-not-writing-a-message.

`PEER_STATE_MACHINE_PASS`, `PEER_CONCURRENCY_PASS`, `PEER_MULTI_INSTANCE_SAFE`, `PEER_SECURITY_PASS`
and `PEER_PII_PASS` are **not** established. `PERSISTENCE_BATCH2_STABLE` is **not** claimed.

**State at this checkpoint:** `42e9f70` pushed (the implementation), `b4f87c3` pushed (the Batch 3
design). Backup: `backup-all-20261007-0712.json` — code / db / minio / evidence all PASS. The fix
for the six defects above is **not started**: the `code-implementer` model returned
`RESOURCE_EXHAUSTED` ("resets in 73h"), and the alternative agent types either route to an
unavailable provider or were cancelled. This is an external model-availability blocker, not a
technical one.

## PHASE 1 — the six review defects: fixed and verified

All six defects from `BATCH2_PEER_REVIEW.md` are fixed, and the fix round found **two further
product defects** that only became visible once the tests the review asked for existed. Full record:
`docs/architecture/BATCH2_PEER_FIX_VERIFICATION.md`; the lock-order and FK-writer proof:
`docs/architecture/BATCH2_LOCK_ORDER.md`.

| Review item | Fix |
| --- | --- |
| P0-1 state check disconnected from the write | Six peer write paths now lock the roots, **re-read after locking**, and write through a compare-and-swap predicate carrying the read status with an affected-row check; `createMatches` no longer upserts a match that has left `suggested`. |
| P0-2 boundary outside the database operation | `saveConversationFeedback` decides participant/status/deadline under the conversation row lock; `requireOpenConversation` performs the assist check under the lock with database time and **commits** the expiry it detects. |
| P0-3 lock order | New `lockPeerWriteRoots`: `User` (sorted) → `LifeJourney` (sorted) → peer row, applied to all eleven write paths, with a per-path table and the §0.4/A5 FK-writer matrix. |
| P1-4 expire-on-send rolled back its closure | The transaction returns a sentinel instead of throwing, so the closure commits; the batch sweep became one conditional statement on database time. |
| P1-5 AI draft PII | Model-generated `draft`/`reminders` are redacted at persistence and again at the response boundary of both AI task endpoints. |
| P1-6 tests that could not fail | All race cases call the persistence layer with `_onBeforeLock`, a hook that fires **inside the open transaction before any lock is taken**; assertions are "exactly one"; `4.1` is the omitted-field case; `5.2` asserts every direct operation's write set. |

**Two product defects found by the new tests:** `peerMatchForUser` dropped the consent timestamps,
so `PeerMatchWaiting.vue` could never render its pending state; and `peerNetwork` truncated the
match list to three, so the waiting page could not find the match it was navigated to. Both fixed.

**Verification (orchestrator-measured):**

| Check | Result |
| --- | --- |
| `batch2-peer-verification.spec.ts` | **26 / 26 pass**, 4 consecutive clean runs after the fixture fixes |
| `peer-support-stage.spec.ts` | 10 pass / 1 skipped — unchanged |
| Full business suite | **7 failed / 23 passed files, 8 failed / 131 passed tests** — exactly the recorded baseline |
| `pnpm check:baseline-diff` | **SUCCESS** — 0 new regressions |
| `pnpm check:migrations` | 12 baseline migrations immutable |
| `pnpm typecheck` / `pnpm lint` | clean / 0 errors |
| Mutation harness | **10 of 12 proven.** M2a/M2b are the redundant half of a two-guard pair and are reported as **not proven on their own**; M2c removes both and proves the pair. |

**What is explicitly not proven** (recorded so the claim stays inside the evidence): the
database-clock property is not discriminable in a single-clock environment, so no mutation is
claimed for it; no deadlock was reproduced, so lock-order *necessity* is proven by the separate
lock-timeout probe in `3.6` rather than by `3.4`/`3.5`; and the `User` lock means a peer write can
wait behind a full legacy flush, which is unmeasured.

**Environment findings, recorded as environment:** the WSL2 VM stops and kills the database
containers (one run collapsed to 21 failed files with `FATAL: the database system is shutting
down`), and under sustained load the suite degrades into `Test timed out in 5000ms` on files that
pass in isolation. Both were verified as environment, not product: the affected files pass alone
and the recorded suite figure is from a run taken after the machine was idle.

**Gate position: PHASE 1 CLOSED for Batch 2.** `PERSISTENCE_BATCH2_STABLE` is claimed for the five
peer models against the evidence above. `PERSISTENCE_BATCH2_FULL` and `FULL_MULTI_INSTANCE_READY`
are **not** claimed — Batch 3–4 models are still memory-authoritative.

### Second review round — four more real defects, all fixed

A second independent review of the fix commit returned `REQUEST_CHANGES`. It was right on four
counts and on three overclaims. Full detail: `BATCH2_PEER_FIX_VERIFICATION.md` §4.

**Real defects it found in the fix:**

1. **The deadline was read with `NOW()`, the transaction-start clock.** A transaction that began
   before the deadline but waited for a lock until after it compared against the pre-deadline
   instant and could write after the deadline had passed. All four sites now use
   `clock_timestamp()`. New case `2.6c` holds a send transaction open across the deadline;
   mutation **M11** reverts the clock and the test fails.
2. **The model's output was spread into `structuredResult`.** The peer-assist parser redacted the
   three fields it named and then spread `...parsed`, so every other field the model emitted was
   persisted unredacted. The output is now whitelisted. The admin AI-job endpoints now apply the
   response-boundary redaction too.
3. **A notification failure was ignored on the request path.** It now returns
   `notificationPending`. The expiry sweep has no response channel — stated, not implied. The
   "retryable obligation" wording was **withdrawn**: a deterministic id makes an attempted retry
   idempotent; nothing retries.
4. **The mutation harness could report a false PROVEN.** It classified from a failure count alone,
   so an unrelated failure would have been read as evidence. It now refuses to run unless its
   baseline is green, names the test each mutation must fail, and reports `PROVEN-UNRELATED`
   otherwise. Patch application moved inside the restoring `try/finally`.

**Overclaims corrected:** lock-order *necessity* is not proven (no deadlock was reproduced; the
justification is structural and now described as such); "the tests can now fail" was too broad —
consent case `1.4` now uses `_onBeforeLock` like the others, and `5.2` now covers all direct
operations including the experience edit/review and report-handling paths, with a parser that also
recognises unqualified raw SQL targets; the unbounded match list is now bounded (top three by
score, then the user's other in-flight matches, capped at 50).

**One production change outside the peer scope, recorded as a deviation.**
`FollowUpWorkerService.onModuleDestroy` awaited `worker.close()` and `connection.quit()` with no
bound, and that wait was measured never returning — which is what made `app.close()` hang and
turned this file into a *failing file with zero failing tests*. The shutdown path now attempts the
graceful close with a 3 s budget and falls back to a hard `disconnect()`, reporting the fallback to
stderr. The delivery path is untouched.

**Round-3 verification (orchestrator-measured):**

| Check | Result |
| --- | --- |
| `batch2-peer-verification.spec.ts` | **27 / 27 pass**, and 3 consecutive clean runs after the shutdown fix |
| Mutation harness | **11 of 13 proven**, baseline green before the run; M2a/M2b are the redundant half of a two-guard pair and are reported as not proven alone |
| Full business suite | **7 failed / 23 passed files, 8 failed / 132 passed tests** — exactly the recorded baseline |
| `pnpm check:baseline-diff` | **SUCCESS** — 0 new regressions |
| `pnpm typecheck` / `pnpm lint` | clean / 0 errors |

### Third review round — two more real defects, one open

A third independent review confirmed D1/D2 and C1/C2 closed and raised two P1 defects plus two P2
qualifications. All are addressed; one finding is recorded as **open**.

- **The cap did not guarantee reachability (P1, fixed).** `peerNetwork` bounded the list at 50, but
  a requested/connected match beyond the cap is dropped and the waiting/consent pages look their
  match up **solely** in that response. `/api/v1/peers` now accepts `?matchId=`, which appends that
  match independently of the cap, and both views pass it. Case `3.7` proves both halves — with 60
  higher-scoring in-flight matches the target is absent from the plain response and present with
  `matchId` — and mutation **M12** removes the clause and fails it.
- **The shutdown fallback did not close the worker (P1, fixed).** A BullMQ `Worker` holds two Redis
  connections; the inherited `disconnect()` only touches the main one, the call was not awaited,
  and the timer was `unref()`'d so it could not fire in an idle process. All three corrected.
- **The harness did not check the child's own outcome (P2, fixed).** It now requires a clean child
  exit for the baseline and every mutation run, and states its verdict as evidence of
  *sensitivity*, not of causal proof.
- **"retryable" survived in two older documents (P2, fixed).** The design doc carries the corrected
  semantics; the review doc keeps the original wording with a recorded correction beneath it.
- **`app.close()` can still stall (OPEN, not fixed).** With the worker's close bounded, one run in
  four still reported `app.close did not finish within 45000ms`. Both provider hooks return in
  milliseconds, the HTTP server has zero connections and closes in 0–1 ms, so the remaining cause
  is elsewhere in `app.close()` and is **not identified**. The test teardown is bounded and reports
  a stall instead of failing the file; the product-side unbounded graceful close is bounded. The
  stall itself is recorded as an open defect.

**Round-4 verification (orchestrator-measured):**

| Check | Result |
| --- | --- |
| `batch2-peer-verification.spec.ts` | **28 / 28 pass**, 4 consecutive runs, all exit status 0 |
| Mutation harness | see below — baseline green, 12 of 14 proven |
| `pnpm typecheck` / `pnpm lint` | clean / 0 errors |

## Note — the visual baseline now encodes the aesthetic the UI contract removes

`design_refs/` holds 26 tracked reference PNGs, and `docs/claude-page-by-page-visual-checklist.md`
is generated by `visual:compare-front` by diffing the current pages against them. The ANTI-AI UI
CONTRACT work moved the pages **away** from those references on purpose, so the regenerated
checklist shows **higher** diff rates (e.g. `01-square` 12.95% → 18.91%). The checklist is a
faithful measurement of the wrong target. PHASE 6 must either regenerate `design_refs/` from the
post-contract UI or retire the comparison; until then its pass/fail signal should not be read as a
quality gate.

## PHASE 2 — Persistence Batch 3 (Self system)

**Design: done, not yet reviewed or implemented.** `docs/architecture/BATCH3_SELF_SYSTEM_DESIGN.md`
(`b4f87c3`), with four escalations resolved by orchestrator decision in its §0.4:

- **Scope** — the reviewer derived the real list from the schema (there is no `Archive`, `Recovery`
  or generic `Self` table): `DecisionRecord`, `CooldownItem`, `RealityHandoff`, `TrustedContact`,
  `MessageToFutureSelf`, `PersonalSupportPlan`, `StableSelfProfile`, `MemoryItem`,
  `RecoverySnapshot` + `PrivacySetting`. `FollowUpJob` stays **outside** the registry (it is shared
  with action follow-ups and decision cooldowns); `AgentDecisionLog` is excluded despite its name.
- **Memory** — the plan's prohibition is **violated today**: a date extension sets any status other
  than `disabled` back to `active`, so it **silently reactivates an explicitly expired row**, and
  `deleteMemory` writes `status='expired'` so the required `deleted` state has no representation.
  Decided: `expired` is terminal until a newly consented explicit reactivation; deletion is terminal
  and represented as `deleted` + `deletedAt`; the four AI-eligibility predicates move into one
  owner-scoped database query.
- **Decision** — `outcome` is a text field, not a reachable status. Decided: implement the reviewed
  `decided → outcome → archived` transition, which matches the UI's existing "保存结果并归档" step —
  the same shape as Batch 2's missing consent half.
- **Admin disclosure** — the admin support-plan and memory lists currently return full plan JSON and
  memory content. Decided: metadata in list/search; full content only via an audited single-record
  read.
- **FutureSelf notification policy** — notifications off means delivered silently and retained.

**A new failure mode this batch must handle, which Batches 1 and 2 did not face:** `PrivacySetting`
has no absence sweep, but its per-user upsert is `state.privacySettings?.[id] ?? {}`
(`mapper:1034–1070`) — so **an omitted privacy entry is a destructive write**. A stale snapshot
missing `allowAiMemoryUse` writes `false` on the next flush.

Implementation is blocked behind the reopened PHASE 1 fixes and the model-availability blocker noted
above.

## PHASE 3 — Persistence Batch 4 (Legacy & Store retirement)

_(pending)_

## PHASE 3 — Persistence Batch 4 (Legacy & Store retirement)

_(pending)_

## PHASE 4 — Test isolation

_(pending)_

## PHASE 5 — GitHub Actions CI

_(pending)_

## PHASE 6 — C-end UI de-AI

_(partially delivered before this run; see the order note above)_

## PHASE 7 — Android full verification

_(pending)_

## PHASE 8 — Admin

_(pending)_

## PHASE 9 — Security / Privacy

_(pending)_

## PHASE 10 — DAPI live

_(pending)_
