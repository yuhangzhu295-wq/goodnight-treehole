# Batch 2 Peer — Independent Review Outcome

**Verdict: `REQUEST_CHANGES`** — three P0 and three P1 defects, raised by an independent conformance
review of `git diff 8020b60..42e9f70` at HEAD `b4f87c3`.

This document exists to correct the record. `CONTINUOUS_RUN_LOG.md` had recorded PHASE 1 as
"verified and closed" on the strength of the implementer's test results. The review shows those
tests **do not prove what they claim**, so that closure was **not** evidence-based. The Batch 2
gate is **not** satisfied.

## Why this matters beyond the six defects

The tests passed and the orchestrator reproduced them: `batch2-peer-verification.spec.ts` 15/15,
`peer-support-stage.spec.ts` 10 pass / 1 skipped, the full suite with no new failures. All of that
was true and none of it was sufficient — because the tests were constructed so that they could not
fail. Specifically:

- the concurrency barriers rendezvous the **HTTP requests before they start**, not the transactions
  at their read/lock points, so `close vs send` and `expire vs send` execute **sequentially**;
- two race cases assert only "at least one succeeded" or "the final state is X", never
  **exactly one** transition;
- the omitted-field foreign-key test makes the **whole peer row absent** from the stale snapshot,
  which is the empty-set case, **not** the §0.4/A5 case of a present row with one omitted field.

This is the project's own recurring lesson (`feedback-mutation-test-proves-the-guard`,
`feedback-a-green-build-is-not-a-pass`): a passing test is only evidence once it has been shown to
fail against the unfixed code.

## P0 defects

### P0-1 — the state check and the write are disconnected

`updateMatchRequest`, `respondMatch` and `blockMatchDirect` read identity/status with a plain query
and then update **unconditionally by id** (`peer-persistence.service.ts:440–507,510–524,401–434`).
Two transactions can both read `requested` and then write `connected` and `declined`; the later
write can overwrite `blocked`. `createMatches` upserts an existing match's score with no state
guard, so a suggestion refresh can rewrite a match already in the request flow.

This is the exact class the design forbade — a pre-check followed by an unscoped update — and that
Batch 1 shipped once and had to repair.

**Required:** lock then re-read inside the transaction, or make the update conditional on identity
**and** expected status with an affected-row check. The suggestion refresh must not modify a match
that has left `suggested`.

### P0-2 — close, feedback and assist do not establish the boundary inside the database operation

`closeConversation` and `saveConversationFeedback` do a plain `findUnique` pre-check then update by
id (`:784–789,802–865`): close and block can overwrite each other's close reason, and feedback can
write on a stale state. `requireConversation` reads first and `requestPeerResponseAssist` then
checks expiry with the **application clock** before creating the AI job
(`store.service.ts:4936–4964`).

**Required:** participant, status and deadline checks belong inside the locked transaction read or
the conditional write. Assist queues only after that check passes and still only produces a draft.

### P0-3 — the lock order is not followed on two-party paths

consent reads match/experience, then locks sorted Users, then the match; `blockConversation` reads
conversation/match, locks the User, then updates match and conversation; report and send lock the
conversation without the User. And peer create/update paths that touch a **Journey FK** do not use
`User → LifeJourney → peer child`, while Batch 1's deletion locks User, then Journey, then detaches
peer rows (`batch1-persistence.service.ts:2109–2129,2193–2216`).

No `40P01` was observed, so this is an **unproved lock order**, not a reproduced deadlock. The
design's requirement was a per-path proof, and it does not exist. This project has already produced
`40P01` twice.

**Required:** document per path which `User`/`LifeJourney`/peer rows it touches, lock them in the
established order, re-read after locking — then add a two-instance test in which a peer write
**genuinely overlaps** a Journey delete and a legacy flush.

## P1 defects

### P1-4 — the expire-on-send branch rolls back its own closure

`sendMessage` takes database time under the lock and correctly rejects a due message, but sets
`closedReason='expired'` and then **throws** (`:751–782,941–985`) — so the transaction rolls back
and the closure never commits. The HTTP entry calls `expireDueConversations` first, which is why
the tests passed and this was missed. That batch expiry also filters and writes with `new Date()`
(`store.service.ts:4908–4915`), the application clock rather than the database clock.

**Required:** make the closure a **committable** transition constrained by database time; test both
orderings of the send/close race directly. Claim only a lock-held database-time check (§0.4/A8),
not a commit-time guarantee.

### P1-5 — the AI draft output PII gap is still open

Input is validated, but the model-generated `draft`/`reminders` are never PII-checked or redacted,
and the task-status endpoint returns `job.result`, the whole `job`, and `structuredResult` verbatim
(`store.service.ts:7031–7034`; `controllers.ts:1143–1159`). The design flagged this and it was not
fixed.

**Required:** apply peer PII validation/redaction to generated text **at persistence and at the
response boundary**; test with a simulated completion containing a phone number and an email.

### P1-6 — the new tests do not discriminate

See "Why this matters" above for the four specific construction faults
(`batch2-peer-verification.spec.ts:9–49,397–468,518–554,597–637`).

**Required:** barriers that rendezvous **inside** the transaction and fail on timeout; assertions of
**exactly one** transition and one notification; `4.1` rewritten as the omitted-field case (row
present, one FK omitted, another instance has committed a value — assert the committed value
survives); `5.1` extended to every direct operation's write set. Plus the missing cases: a
notification failure after a committed transition, the UI pending state, and database-layer
ownership negative cases.

## Also required

`consentMatch`'s second call writes **both** consent fields even when one is unchanged; §0.4/A4's
strict write set says only the caller's field.

Notification-failure semantics must be stated explicitly: a failure after a committed peer
transition leaves the peer state committed plus a **retryable notification obligation** — it must
not be reported as an atomic failure, and the partial delivery must be exposed or logged.

## What the review confirmed as correct

Recorded so the fixes do not disturb working behaviour:

- **The migration** is a new directory; no applied migration was edited; legacy `active`
  conversations receive only the owner fact, and `requesterConsentAt` stays `NULL` — no fabricated
  requester consent.
- **The consent main path**: first consent creates no conversation, the second creates it, a repeat
  does not move the deadline, and consent after block/decline is refused.
- **The report change** is correct and is the required narrowing: a repeat by the same reporter
  returns the existing open row without rewriting it; the scorer now counts report rows; the admin
  view derives its report fields by `createdAt` then id and filters on the derived values; the HTTP
  shape stays `{ item: conversation }`.
- **The triple exits** are in place — the five tables' loader, upsert and absence sweep are
  registry-guarded, and the non-peer `journeyIds` checks remain.
- **The feedback-derived experience redaction gap** the design flagged was fixed (domain, subDomain,
  tags redacted per field).
- **Notification ordering** commits the peer transaction before notifying.
- **AI assist does not write a `PeerMessage`.**

## Consequence for the run

`PEER_STATE_MACHINE_PASS`, `PEER_CONCURRENCY_PASS`, `PEER_MULTI_INSTANCE_SAFE`, `PEER_SECURITY_PASS`
and `PEER_PII_PASS` are **not** established by the current tests. `PERSISTENCE_BATCH2_STABLE` is
**not** claimed. PHASE 1 is **reopened** pending these fixes and a re-review.
