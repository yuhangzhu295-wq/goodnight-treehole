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
"proven" if its removal makes the **named** test fail — a failure in an unrelated test is reported
as `PROVEN-UNRELATED`, not as proof, and the harness refuses to run at all unless its baseline run
comes back green.

Baseline before the run: **28 passed**, child exit status checked.

| Mutation | Verdict |
| --- | --- |
| M1 expire-on-send closure rolls back (P1-4) | **PROVEN** — 2 failed / 26 passed, includes `2.6a` |
| M2a `respondMatch`: CAS removed, post-lock re-read kept | NOT PROVEN — 0 failed / 28 passed |
| M2b `respondMatch`: post-lock re-read removed, CAS kept | NOT PROVEN — 0 failed / 28 passed |
| M2c `respondMatch`: **both** guards removed (the original defect) | **PROVEN** — 1 failed / 27 passed, includes `2.1` |
| M3 `createMatches` takes no root locks (P0-3) | **PROVEN** — 3 failed / 25 passed, includes `3.6` |
| M4 peer draft persisted unredacted (P1-5) | **PROVEN** — 2 failed / 26 passed, includes `7.1` |
| M5 response boundary stops redacting (P1-5) | **PROVEN** — 1 failed / 27 passed, includes `7.2` |
| M6 match projection drops the consent fields | **PROVEN** — 1 failed / 27 passed, includes `3.2` |
| M7 peer network truncates the match list | **PROVEN** — 2 failed / 26 passed, includes `3.2` |
| M8 close notification throws after the commit | **PROVEN** — 1 failed / 27 passed, includes `6.1` |
| M9 peer match leaves the registry (three exits) | **PROVEN** — 25 failed / 3 passed, includes `5.1` |
| M10 journey reference not re-resolved under the lock | **PROVEN** — 1 failed / 27 passed, includes `3.5` |
| M11 the deadline read as the transaction-start time again (P1-4) | **PROVEN** — 1 failed / 27 passed, includes `2.6c` |
| M12 the focused match is not appended past the cap (reachability) | **PROVEN** — 1 failed / 27 passed, includes `3.7` |

M2a/M2b are reported as **not proven on their own** on purpose. The post-lock re-read and the CAS
predicate are two independent mechanisms that both stop the loser; either one alone is sufficient,
so removing either alone leaves the suite green. Removing both reproduces the review's defect
(M2c). The honest statement is therefore: *the state check and the write are connected by two
independent mechanisms, and the test proves the conjunction, not each half.*

Two mutations prove the later review rounds' findings were real. **M11** reverts
`clock_timestamp()` to `NOW()` — the transaction-start clock — and lets a send that began before
the deadline write after it; `2.6c` fails. **M12** removes the focus clause and `3.7` fails, which
is the evidence that the cap alone could not guarantee reachability.

**What a PROVEN verdict means here, and what it does not.** It means the named test fails when
that guard is removed, and that the baseline run was green with a clean child exit. It is evidence
of *sensitivity*, not a causal proof: a named test could in principle fail for a reason other than
the guard's removal, and the harness does not diagnose why the failure happened.

## 4. Second review round: what it found, and what was corrected

A second independent review of the fix commit returned `REQUEST_CHANGES` with four real defects and
several overclaims. All are addressed here; the claims were narrowed where the reviewer was right.

### Defects in the fix, now fixed

**D1 — the deadline was read as the transaction-start time (P1).** The locked deadline check used
PostgreSQL `NOW()`, which is the **transaction-start** timestamp. A transaction that began before
the deadline but waited for a lock until after it therefore compared against a pre-deadline instant
and could write after the deadline had passed. All four sites
(`sendMessage`, `requireOpenConversation`, `saveConversationFeedback`, `expireDueConversations`)
now use `clock_timestamp()`, which is evaluated at the call — after the lock. `2.6c` is the
discriminating test: the send transaction is held open for 2 s while the deadline is 1.2 s away,
and the message must be refused and the closure committed. Mutation **M11** reverts the clock and
the test fails.

**D2 — the model's output was spread into `structuredResult` unredacted (P1).** The peer-assist
parser redacted the three fields it named and then spread `...parsed`, so every other field the
model chose to emit was persisted with no redaction. The output is now **whitelisted**
(`draft`, `reminders`, `summary`), not spread. The admin AI-job endpoints
(`GET /ai/jobs`, `GET /ai/jobs/:id`) now also apply the response-boundary redaction, so a row
written before this change cannot leak on read either.

**D3 — a notification failure was ignored on two paths (P1).** The request path discarded the
result of `peerNotificationAfterCommit`; it now returns `notificationPending`. The expiry sweep
runs from read paths and has **no response channel**, so its failures remain recorded but
unreported — that limitation is now stated rather than implied. The claim that the obligation is
"retryable" has been **withdrawn**: a deterministic id makes an attempted retry idempotent, it does
not create a retry, and nothing in production retries. The client views also ignore the flag; that
is recorded as a UI gap for PHASE 6.

**D4 — the mutation harness could report a false "PROVEN" (P1).** It classified solely from a
nonzero failure count, so a failure in an *unrelated* test would have been read as evidence about
the mutated guard. It now (a) refuses to run at all unless a baseline run is green, (b) names the
test that must fail for each mutation, and (c) reports `PROVEN-UNRELATED` when the failures do not
include that test. Patch application is also inside the `try/finally` that restores the files, so
an I/O failure part-way through cannot leave a patched tree behind.

### Overclaims, corrected

**C1 — lock-order necessity.** The earlier text said `3.6` proves necessity. It proves the roots
are held before the peer row on the paths it exercises; it does not prove the order was *necessary*,
because no deadlock was reproduced. The justification is structural and is now described as such.

**C2 — "the tests can now fail" was too broad.** Two exceptions existed and are now removed or
disclosed: consent case `1.4` rendezvoused the HTTP requests before they started and now uses
`_onBeforeLock` inside the transaction like the other races; `5.2` covered a subset of the direct
operations and now covers all of them, including `updateExperience`, `reviewExperience` and
`handleReport`. Its table parser now also recognises unqualified raw SQL targets, which it
previously missed. Two gaps remain and are stated: the expire/sweep cases are **sequential by
design** (they exercise both orderings rather than an overlap), and `5.2`'s contract is not
literally "peer tables only" — the two audited admin actions also append to `AuditLog`.

**C3 — the unbounded match list was a scalability trade-off.** Removing the top-3 slice fixed the
waiting page's lookup but made the response unbounded. `peerNetwork` now returns the three
highest-scoring matches first (the network page renders exactly those), then the user's other
in-flight matches — the ones the waiting and consent pages look up — capped at 50.

## 5. Third review round: two more real defects, both fixed

A third independent review of `c1fbc65` confirmed D1, D2 and C1/C2 closed, and raised two P1
defects plus two P2 qualifications.

**R1 — the cap did not guarantee the waiting page could reach its match (P1).** `peerNetwork`
bounded the list at 50, but a requested/connected match beyond the cap is dropped, and
`PeerMatchWaiting.vue` / `PeerConsent.vue` look their match up **solely** in that response — so the
page would render its empty fallback. A cap alone cannot express reachability. `/api/v1/peers` now
accepts `?matchId=`, which appends that match if it belongs to the caller, independently of the
cap; both views pass it. Case `3.7` proves both halves: with 60 higher-scoring in-flight matches
the target is genuinely absent from the plain response and genuinely present with `matchId`, and
the response grows by exactly one. Mutation **M12** removes the focus clause and `3.7` fails.

**R2 — the shutdown fallback did not close the worker (P1).** A BullMQ `Worker` holds **two** Redis
connections: the main one and a duplicated blocking one (`worker.blockingConnection`). The
inherited `disconnect()` only touches the main connection, so the fallback left the blocking
connection open, and it did not await `disconnect()` at all. The timer was also `unref()`'d, so it
could not keep an idle process alive long enough to fire. Fixed: the fallback awaits
`worker.disconnect()` and then force-closes `worker.blockingConnection`, and the timer is no longer
`unref()`'d.

**The interruption window is now disclosed in the code.** `deliver()` claims a job as `delivered`
in one transaction and writes its notification in a second. A forced close between the two loses
that notification while the job already reads `delivered`, so a retry will not re-deliver it. That
ordering is pre-existing; the bounded shutdown adds a bounded moment at which it can be
interrupted instead of an unbounded hang. Closing it properly means folding the notification into
the claim transaction, which is a change to the follow-up delivery path and is **not** made here.

**R3 — the harness did not check the child's own outcome (P2).** A run that printed `0 failed` and
then died on a signal, timed out, or failed to spawn would have passed the baseline gate. The
harness now requires a clean child exit (`status` non-null, no signal, no spawn error) for the
baseline and for every mutation run, and reports `INCONCLUSIVE` otherwise. It also states the
verdict more narrowly: a named test failing when a guard is removed is evidence of **sensitivity**,
not of causal proof.

**R4 — "retryable" survived in two older documents (P2).** `BATCH2_PEER_DESIGN.md` §3.11 now
carries the corrected semantics. `BATCH2_PEER_REVIEW.md` keeps the reviewer's original wording —
it is the record of what was raised — with an explicit recorded correction beneath it.

### Still open: `app.close()` can stall, and the cause is not fully identified

Measured repeatedly, and **not** resolved:

- `prisma.$disconnect()` 7–20 ms, `worker.onModuleDestroy` 4–5 ms (after the bound),
  `prismaSvc.onModuleDestroy` 14–20 ms, `httpAdapter.close()` 0–1 ms, zero open connections.
- `app.close()` itself then stalls — observed exceeding 30 s, 45 s and 120 s, and once returning in
  21 ms. With the worker's shutdown bounded, one run in four still reported
  `app.close did not finish within 45000ms`.

The bounded worker close therefore reduced but did not eliminate the stall, which means the
remaining cause is elsewhere in `app.close()` — after both provider hooks have returned — and is
**not identified**. What is in place: the product's unbounded graceful Redis close is bounded and
reports its fallback, and the test teardown is bounded and **reports** a stall to stderr without
turning it into a failing file. This is recorded as an **open defect, not a fixed one**.

## 6. What the new tests do not prove

Recorded so the claims stay inside the evidence.

1. **No deadlock was reproduced.** `3.4`/`3.5` hold a peer write open against a real journey
   delete and a full legacy flush and assert no `40P01`, but removing the root locks does not fail
   them — they show the overlap is safe, not that the lock order is *necessary*. `3.6` proves the
   roots are held before the peer row on the paths it exercises; necessity remains unproven and
   rests on the structural argument in `BATCH2_LOCK_ORDER.md`. M3 confirms `3.6` fails when the
   root locks are removed.
2. **The `User` `FOR UPDATE` lock makes peer writes wait behind a full legacy flush.** That is the
   cost of joining the hierarchy. It is a wait, not a deadlock, and it is not measured here.
3. **`4.1` case B is the discriminating half.** Case A (row present, FK omitted) would also pass
   before Batch 2, because `fkUpdate(undefined)` already omitted the column. Case B (row present,
   FK **explicitly null**) is what fails without the registry exits. The empty-set case C is kept
   from the original test.
4. **`PeerReport.experienceId` has no detach writer.** It is set once at insert and never changed.
   Nothing detaches it today, and no test claims otherwise.
5. **The expiry sweep has no response channel.** Its notification failures are recorded in-process
   and reported to nobody. There is no durable record and nothing retries.
6. **The clock fix is proven for the send path only.** `2.6c` holds the send transaction across the
   deadline. The same `clock_timestamp()` change was made in `requireOpenConversation`,
   `saveConversationFeedback` and `expireDueConversations`, but no test holds *those* transactions
   across a deadline; for them the change is argued, not measured.

## 7. Suite results

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

### One production change outside the peer scope, and why

`FollowUpWorkerService.onModuleDestroy` awaited `worker.close()` and `connection.quit()` with no
bound. Both wait on the Redis socket, and that wait does not necessarily end — it was measured
never returning, which is what made `app.close()` hang and turned this file into a *failing file
with zero failing tests*. The shutdown path now attempts the graceful close with a 3 s budget and
falls back to a hard `disconnect()`, reporting the fallback to stderr.

This is a deviation from "change nothing outside the peer models" and is recorded as one. The
justification is that the unbounded wait is itself a defect — a graceful shutdown that can hang
forever is worse than one that drops the socket — and that it corrupted the evidence: any spec
file's teardown could hang for reasons unrelated to what it tests. The delivery path is untouched;
when Redis is responsive the graceful close is what runs, and the budget is only a ceiling.

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

## 8. Claim position

`PERSISTENCE_BATCH2_STABLE` is claimed **only** for the peer models and only against the evidence
above. `PEER_STATE_MACHINE_PASS`, `PEER_CONCURRENCY_PASS`, `PEER_MULTI_INSTANCE_SAFE`,
`PEER_SECURITY_PASS` and `PEER_PII_PASS` are established by the tests in §3 with the exclusions in
§4. `PERSISTENCE_BATCH2_FULL` is **not** claimed: Batch 3–4 models are still memory-authoritative.
`FULL_MULTI_INSTANCE_READY` is **not** claimed.
