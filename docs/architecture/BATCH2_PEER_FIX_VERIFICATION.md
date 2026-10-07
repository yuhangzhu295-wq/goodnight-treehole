# Batch 2 Peer — Review Defects: Fixes and Verification

Records the fix round for the three P0 and three P1 defects raised in
`docs/architecture/BATCH2_PEER_REVIEW.md`, and — separately from the fixes — what the tests do and
do not prove.

## 1. What was changed

| Review item | Fix |
| --- | --- |
| **P0-1** state check disconnected from the write | `createMatches`, `updateMatchRequest`, `respondMatch`, `blockMatchDirect`, `closeConversation` and `blockConversation` now (a) acquire the root locks, (b) **re-read the row after locking**, and (c) write through a compare-and-swap predicate that carries the status that was read, with an affected-row check. `createMatches` no longer upserts: a suggestion refresh may only rewrite a match that is still `suggested`. |
| **P0-2** close/feedback/assist boundary outside the database operation | `saveConversationFeedback` takes the conversation row `FOR UPDATE` and decides participant, status and deadline under that lock; `closeConversation` and `blockConversation` re-read after locking and CAS. `requestPeerResponseAssist` now calls the new `requireOpenConversation`, which performs the participant + deadline check under the row lock with database time and **commits** the expiry it detects. |
| **P0-3** lock order not followed | New `lockPeerWriteRoots(tx, userIds, journeyIds)`: every peer write acquires `User` (sorted) → `LifeJourney` (sorted) before its own rows. Applied to all eleven write paths. Per-path table and the FK-writer matrix are in `BATCH2_LOCK_ORDER.md`. A journey reference is re-resolved under the lock, so the create/delete race has one deterministic outcome instead of a foreign-key error. |
| **P1-4** expire-on-send rolled back its own closure | `sendMessage` returns a sentinel from the transaction instead of throwing inside it, so the closure commits and the rejection is raised after commit. `expireDueConversations` became one conditional statement on database time. |
| **P1-5** AI draft PII gap | The model-generated `draft`/`reminders` are redacted in `parseStructuredTaskResult` (persistence) and again at the response boundary by `peerAssistJobForResponse`, applied to both `/api/v1/ai/tasks/:id` and `/api/v1/ai/tasks/latest`. |
| **P1-6** tests that could not fail | All six race cases now call the persistence layer directly with `_onBeforeLock`, a hook that fires **inside the open transaction before any lock is taken**, so two parties meeting at the barrier then genuinely contend for the same rows. The barrier rejects on timeout. Assertions are now "exactly one" for transitions, conversations and reports. `4.1` was rewritten as the omitted-field case. `5.1` was extended by `5.2`, which asserts every direct operation's write set. |
| **Also required** — consent write set | `consentMatch` writes only the caller's own consent column. |
| **Also required** — notification semantics | `peerNotificationAfterCommit` records a failed post-commit notification in `peerNotificationFailures` and returns `false`; the affected operations report `notificationPending: true`. Semantics are stated in `BATCH2_LOCK_ORDER.md` §4. |

## 2. Two product defects the fix round found

Both were found by writing the tests the review asked for, not by reading the code.

**The waiting page could never show the pending state.** `peerMatchForUser` dropped
`requesterConsentAt` and `ownerConsentAt`, so `PeerMatchWaiting.vue`'s `hasRequesterConsented` was
permanently `false`: after a caller had consented, the page still said "对方已同意，请确认同行边界"
and still offered the 确认边界 button. Fixed by including both fields in the projection.

**The waiting page could not reliably find its match.** `peerNetwork` sliced the match list to the
three highest-scoring matches before returning it, but `PeerMatchWaiting.vue` and
`PeerConsent.vue` look their match up by id in that same list. A match outside the top three made
the page render its empty fallback. The list is no longer truncated; `PeerNetwork.vue` still slices
for display. `3.2` fails if either fix is reverted (mutations M6 and M7).

Both were unreachable by the previous suite: it asserted the HTTP contract of the consent
endpoints and never read the projection the views actually consume.

## 3. Mutation results

`scripts/batch2-mutation-check.ts` removes each guard, runs the suite, and reverts. A guard is only
"proven" if its removal makes a test fail.

| Mutation | Verdict |
| --- | --- |
| M1 expire-on-send closure rolls back (P1-4) | **PROVEN** — 1 failed / 25 passed |
| M2a `respondMatch`: CAS removed, post-lock re-read kept | NOT PROVEN — 0 failed / 26 passed |
| M2b `respondMatch`: post-lock re-read removed, CAS kept | NOT PROVEN — 0 failed / 26 passed |
| M2c `respondMatch`: **both** guards removed (the original defect) | **PROVEN** — 1 failed / 25 passed |
| M3 `createMatches` takes no root locks (P0-3) | **PROVEN** — 3 failed / 23 passed |
| M4 peer draft persisted unredacted (P1-5) | **PROVEN** — 2 failed / 24 passed |
| M5 response boundary stops redacting (P1-5) | **PROVEN** — 1 failed / 25 passed |
| M6 match projection drops the consent fields | **PROVEN** — 1 failed / 25 passed |
| M7 peer network truncates the match list | **PROVEN** — 1 failed / 25 passed |
| M8 close notification throws after the commit | **PROVEN** — 1 failed / 25 passed |
| M9 peer match leaves the registry (three exits) | **PROVEN** — 23 failed / 3 passed |
| M10 journey reference not re-resolved under the lock | **PROVEN** — 1 failed / 25 passed |

M2a/M2b are reported as **not proven on their own** on purpose. The post-lock re-read and the CAS
predicate are two independent mechanisms that both stop the loser; either one alone is sufficient,
so removing either alone leaves the suite green. Removing both reproduces the review's defect
(M2c). The honest statement is therefore: *the state check and the write are connected by two
independent mechanisms, and the test proves the conjunction, not each half.*

## 4. What the new tests do not prove

Recorded so the claims stay inside the evidence.

1. **The database-clock property is not discriminated.** `expireDueConversations` now closes on
   the server clock in one statement, but the test environment has one clock, so a version using
   the application clock would also pass `2.6a`/`2.6b`. The change is a correctness improvement
   for environments where the two clocks differ (and for concurrent instances); **the suite does
   not prove it.** No mutation is claimed for it.
2. **No deadlock was reproduced.** `3.4`/`3.5` hold a peer write open against a real journey
   delete and a full legacy flush and assert no `40P01`, but removing the root locks does not fail
   them — they show the overlap is safe, not that the lock order is *necessary*. That necessity is
   proven instead by `3.6`, which probes `FOR UPDATE` on the `User` and `LifeJourney` rows from a
   separate connection while the peer transaction is parked, and observes the lock timeout. M3
   confirms `3.6` fails when the root locks are removed.
3. **The `User` `FOR UPDATE` lock makes peer writes wait behind a full legacy flush.** That is the
   cost of joining the hierarchy. It is a wait, not a deadlock, and it is not measured here.
4. **`4.1` case B is the discriminating half.** Case A (row present, FK omitted) would also pass
   before Batch 2, because `fkUpdate(undefined)` already omitted the column. Case B (row present,
   FK **explicitly null**) is what fails without the registry exits. The empty-set case C is kept
   from the original test.
5. **`PeerReport.experienceId` has no detach writer.** It is set once at insert and never changed.
   Nothing detaches it today, and no test claims otherwise.

## 5. Suite results

| Check | Result |
| --- | --- |
| `batch2-peer-verification.spec.ts` | **26 passed / 0 failed**, and 4 consecutive clean runs after the fixture fixes |
| `peer-support-stage.spec.ts` | 10 passed / 1 skipped — unchanged from the recorded baseline |
| Full business suite | **7 failed / 23 passed files, 8 failed / 131 passed tests** — exactly the recorded baseline set |
| `pnpm check:baseline-diff` | **SUCCESS** — 8 failures, 8 known baseline, **0 new regressions** |
| `pnpm check:migrations` | 12 baseline migrations still immutable |
| `pnpm typecheck` | clean (`apps/api`, `apps/mp`) |
| `pnpm lint` | 0 errors (7 pre-existing warnings in unrelated files) |
| Mutation harness | 10 of 12 mutations proven; the 2 unproven ones are the redundant half of a two-guard pair (M2a/M2b), with M2c proving the pair |

### Fixture defects found in this round and fixed

Writing the tests surfaced three defects in the tests themselves, each of which had produced a
false signal:

1. **Leaked Prisma clients.** `3.4` and `4.1` created a `PrismaClient` per call and never
   disconnected it. This kept connections open and made the harness teardown time out — reported
   as a *failing file with zero failing tests*. Fixed by holding one client and disconnecting it.
2. **Pool starvation in `3.4`.** The legacy flush was started last, so it had to wait for a pooled
   connection while the other two parties held theirs and waited at the barrier; the delete's
   five-second transaction timeout then fired. The flush now starts first and the test waits until
   it is inside its transaction before starting the other two.
3. **A per-operation query listener that leaked.** `5.2` registered and removed a `$on('query')`
   listener per operation, and Prisma exposes no `$off`, so listeners accumulated
   (`MaxListenersExceededWarning`) and the captured window became ambiguous. Replaced with one
   listener sliced by index.

### Environment findings, recorded as environment

- **The WSL2 VM stops and kills the database containers.** One full-suite run collapsed to 21
  failed files with `FATAL: the database system is shutting down`. The VM needs a long-lived
  session held open; when it is not held, every run after the first fails.
- **Under sustained load the suite degrades into `Test timed out in 5000ms` on unrelated files.**
  A run with 2.2 GB free physical memory produced new failures in `front-letter`,
  `peer-support-stage` and `third-stage-*`; every one of them passes in isolation, and the same
  suite run on a quieter machine produces exactly the baseline set. These were **not** counted as
  regressions, and the full-suite figure recorded above is from a run taken after the machine had
  been idle.
- **The teardown hook timeout was a stall, not a slow close.** Measured: `prisma.$disconnect` 7 ms,
  `app.close` 21 ms, `harness.close` 13–173 ms, with the HTTP server already closed, zero open
  connections and both shutdown hooks at 2–18 ms. It has been observed to exceed 30 s once. The
  two teardown hooks now carry an explicit 120 s timeout, which does not convert a failed close
  into a pass — if the close never completes, the hook still fails.

## 6. Claim position

`PERSISTENCE_BATCH2_STABLE` is claimed **only** for the peer models and only against the evidence
above. `PEER_STATE_MACHINE_PASS`, `PEER_CONCURRENCY_PASS`, `PEER_MULTI_INSTANCE_SAFE`,
`PEER_SECURITY_PASS` and `PEER_PII_PASS` are established by the tests in §3 with the exclusions in
§4. `PERSISTENCE_BATCH2_FULL` is **not** claimed: Batch 3–4 models are still memory-authoritative.
`FULL_MULTI_INSTANCE_READY` is **not** claimed.
