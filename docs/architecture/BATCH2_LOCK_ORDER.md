# Batch 2 Peer — Lock Order, Foreign-Key Writers, Notification Semantics

This document answers the three things the independent review of `git diff 8020b60..42e9f70`
required but did not find (`docs/architecture/BATCH2_PEER_REVIEW.md`, P0-3 and "Also required"):

1. a per-path statement of which `User` / `LifeJourney` / peer rows each peer write locks, and the
   order it locks them in;
2. the §0.4/A5 matrix — every writer that can change a peer foreign-key column, and whether it
   omits, detaches, or supplies the reference;
3. what a notification failure after a committed peer transition means.

## 1. The global hierarchy

```
User (sorted by id)  ->  LifeJourney (sorted by id)  ->  peer row
```

Why the roots come first. Every peer table carries a `User` foreign key, and `PeerExperience` /
`PeerMatch` also carry an optional `LifeJourney` foreign key:

| Table | `User` FK | `LifeJourney` FK |
| --- | --- | --- |
| `PeerExperience` | `userId` (required) | `journeyId` (optional, `SetNull`) |
| `PeerMatch` | `userId` (required) | `journeyId` (optional, `SetNull`) |
| `PeerConversation` | `starterUserId`, `receiverUserId` (required) | — |
| `PeerMessage` | `senderUserId` (required) | — |
| `PeerReport` | `reporterUserId` (required) | — |

Inserting a row, or updating a row's foreign-key column, takes an implicit `FOR KEY SHARE` on the
referenced row. `FOR KEY SHARE` conflicts with `FOR UPDATE`. Two writers already take `FOR UPDATE`
on these roots and then descend:

- the legacy full flush (`relational-runtime.mapper.ts`) writes `User` first, then its children;
- `deleteJourneyArchive` (`batch1-persistence.service.ts`) locks `User`, then `LifeJourney`, then
  detaches peer rows (`peerExperience.updateMany`, `peerMatch.updateMany`, …).

A peer transaction that locked its own child row before these roots therefore cycles against both
writers and raises `40P01`. This project has already produced that deadlock twice (Batch 1's
sub-batch C, and the `User` ↔ `LifeJourney` root cycle). The fix is structural: peer writes acquire
the roots **first**, in the same deterministic sorted order, and only then touch their own rows.

Sorting is what makes the multi-party paths (consent, block, feedback) safe against each other:
both participants' `User` rows are always taken in ascending id order regardless of who is calling.

### Verified mechanism

`lockUsers` uses `$executeRaw` with a `SELECT … FOR UPDATE`. This was measured on the project
database rather than assumed:

```
$ node -e "…p.\$executeRaw\`SELECT 1 FROM \"User\" WHERE id='user_demo' FOR UPDATE\`"
executeRaw SELECT FOR UPDATE -> 1
```

Prisma returns the affected-row count (`1`) and the statement does take the lock; it is not a
silently-ignored no-op. `$queryRaw` returns the row itself. Both forms are in use.

## 2. Per-path lock table

Every peer write path, in the order it acquires locks. "CAS" means the write predicate carries the
status that was read, so a concurrent transition cannot be silently overwritten.

| Path | Method | Roots locked (in order) | Peer rows | Write predicate |
| --- | --- | --- | --- | --- |
| Experience create | `createExperience` | `User(userId)` → `LifeJourney(journeyId)` | — | insert |
| Experience update | `updateExperience` | none (no FK column written) | `PeerExperience` | `id` + `userId` + `status='pending_review'` |
| Experience review | `reviewExperience` | none | `PeerExperience` | `id` |
| Match create / refresh | `createMatches` | `User(all userIds)` → `LifeJourney(all journeyIds)` | `PeerMatch` | insert, or `id` + `status='suggested'` |
| Match request | `updateMatchRequest` | `User(requester, owner)` | `PeerMatch` | `id` + `userId` + `status='suggested'` |
| Match respond | `respondMatch` | `User(requester, owner)` | `PeerMatch` | `id` + `status IN allowedFrom` |
| Match block (direct) | `blockMatchDirect` | `User(requester, owner)` | `PeerMatch` | `id` + `status IN {suggested,requested,connected}` |
| Consent | `consentMatch` | `User(requester, owner)` | `PeerMatch` (`FOR UPDATE`) → `PeerConversation` | `FOR UPDATE` re-read; insert only on the second consent |
| Open-conversation check | `requireOpenConversation` | none (no FK column written) | `PeerConversation` (`FOR UPDATE`) | `FOR UPDATE` re-read |
| Close | `closeConversation` | `User(starter, receiver)` | `PeerConversation` | `id` + `status='active'` |
| Block conversation | `blockConversation` | `User(starter, receiver)` | `PeerMatch` → `PeerConversation` | both CAS |
| Send message | `sendMessage` | `User(sender)` | `PeerConversation` (`FOR UPDATE`) | `FOR UPDATE` re-read, database time |
| Report | `reportConversation` | `User(reporter)` | `PeerConversation` (`FOR UPDATE`) | `FOR UPDATE` re-read |
| Feedback | `saveConversationFeedback` | `User(userId)` → `LifeJourney(shareExperienceData.journeyId)` | `PeerConversation` (`FOR UPDATE`) | `FOR UPDATE` re-read, database time |
| Expiry sweep | `expireDueConversations` | none | `PeerConversation` (all due rows, one statement) | single `UPDATE … WHERE status='active' AND "expiresAt" <= NOW()` |

Two paths deliberately take **no** root lock, and the reason is the same for both: they write no
foreign-key column, so they never request a `FOR KEY SHARE` on `User` or `LifeJourney` and cannot
form the cycle.

Reads that happen before the locks (`consentMatch`, `updateMatchRequest`, `respondMatch`,
`blockMatchDirect`, `closeConversation`, `blockConversation`) are non-locking reads used only to
learn *which* roots to lock. Each of them re-reads the row **after** locking and makes its
decision on that locked read; the CAS predicate is the authority for the write.

### The journey reference under the lock

`createExperience`, `createMatches` and `saveConversationFeedback` write a supplied
`LifeJourney` reference. After locking the journey, the reference is re-resolved
(`resolveJourneyRefUnderLock`): a journey a concurrent delete removed resolves to `null`.

This is deliberate and matches existing semantics — `fkUpdate`
(`relational-runtime.mapper.ts:790`) already treats a supplied-but-invalid reference as a detach.
The effect is that both orderings of the create/delete race end in **one** deterministic state
(the peer row exists, detached from the deleted journey) instead of a foreign-key error that
discards the user's write.

## 3. §0.4/A5 — every writer of a peer foreign-key column

The registry's three exits stop the legacy flush from writing peer tables, so the peer-to-peer
guards can no longer clear a peer FK through a legacy flush. That is narrower than "nothing can
change a peer FK", so each column is enumerated here.

| Column | Writers | Omitted | Explicit detach | Supplied + validated |
| --- | --- | --- | --- | --- |
| `PeerExperience.userId` | `createExperience` insert | — | — | insert-time FK |
| `PeerExperience.journeyId` | `createExperience` insert; `deleteJourneyArchive` detach | never omitted (no peer update path touches it) | `deleteJourneyArchive` → `NULL`; `resolveJourneyRefUnderLock` → `NULL` when the journey is gone | lock-time existence check |
| `PeerMatch.userId` | `createMatches` insert | — | — | insert-time FK |
| `PeerMatch.journeyId` | `createMatches` insert; `deleteJourneyArchive` detach | never omitted | `deleteJourneyArchive` → `NULL`; `resolveJourneyRefUnderLock` → `NULL` | lock-time existence check |
| `PeerMatch.peerExperienceId` | `createMatches` insert | — | — | insert-time FK |
| `PeerConversation.matchId` | `consentMatch` insert | — | — | insert-time FK (unique) |
| `PeerConversation.starterUserId` / `receiverUserId` | `consentMatch` insert | — | — | insert-time FK |
| `PeerMessage.conversationId` | `sendMessage` insert | — | — | insert-time FK |
| `PeerMessage.senderUserId` | `sendMessage` insert | — | — | insert-time FK |
| `PeerReport.conversationId` | `reportConversation` insert | — | — | insert-time FK |
| `PeerReport.experienceId` | `reportConversation` insert (from the match's `peerExperienceId`) | — | no detach path exists | insert-time FK |
| `PeerReport.reporterUserId` | `reportConversation` insert | — | — | insert-time FK |

**No peer writer omits a foreign-key field on update.** The three-case resolution (`undefined` →
omit, `null` → detach, string → validated) therefore has no peer-side "omit" writer at all; the
only omit writer that ever existed was the legacy flush, and it no longer writes these tables. The
omitted-field test (case 4.1) therefore exercises the legacy path's contract directly, which is
where the omit case can still occur.

`PeerReport.experienceId` is the one nullable peer FK with **no** detach writer. It is set once at
insert and never changed. If `deleteJourneyArchive` is expected to detach it, that expectation is
wrong today and must not be recorded as covered.

## 4. Notification semantics after a committed transition

Peer notifications are a **cross-boundary side effect, not a sixth migrated model**. Every peer
notification call runs *after* the peer state transition has been committed by a direct database
write in its own transaction. The consequences are stated here explicitly because the review
required it:

- **The peer state is committed and stays committed.** A notification failure must never be
  reported as a failure of the transition, and must never roll it back. The transition already
  returned from its transaction.
- **What remains is a notification obligation**, and it is retryable. The row id is deterministic
  (`notification_peer_<suffix>_<userId>`, `batch1-persistence.service.ts:608`), so the write is an
  idempotent upsert: the next successful invocation of the same operation writes the same row and
  does not duplicate it.
- **The partial delivery is exposed, not swallowed.** `StoreService.peerNotificationFailures`
  records `{ userId, suffix, type, at, message }` for every failed write, and the affected
  operations return `notificationPending: true` to the caller
  (`startPeerConversation`, `closePeerConversation`, `blockPeerConversation`).
- **No atomicity is claimed** between the peer transaction and the notification. The design says
  "commit first, then notify"; it does not say the two are one unit, and this document does not
  claim it either.

The legacy (in-memory) branches keep the throwing `peerNotification`, because there the
notification is written by the same `persistAndFlush()` as the state change, so a failure there
*is* atomic with it.

## 5. What this does not claim

- No commit-time guarantee for expiry. §0.4/A8 stands: the enforceable rule is a **lock-held
  database-time check**, and both orderings around expiry are tested directly.
- No claim that the lock order was *proved* by observing zero `40P01`. It is enforced by
  construction (every peer write path acquires the roots first, sorted) and exercised by the
  two-instance overlap test in §6, which fails on a barrier timeout rather than passing silently.
- The `User` `FOR UPDATE` lock means a peer write can block behind the legacy full flush for the
  duration of that flush. That is the cost of joining the hierarchy, and it is a wait, not a
  deadlock.

## 6. Tests

Three cases in `tests/business/batch2-peer-verification.spec.ts` cover this, and they prove
different things:

- **3.4** holds a peer write open at `_onAfterLock` (inside the transaction, after the roots are
  locked) while a `deleteJourneyArchive` and a full `saveRelationalRuntimeState` flush run against
  the same rows. It asserts no `40P01`, that the peer row survives and that the delete detached it.
- **3.5** forces the other ordering: the delete holds `User` + `LifeJourney` while the peer create
  waits, then resolves the reference. It asserts the single deterministic outcome — the peer row
  exists, detached, no foreign-key error.
- **3.6** proves the lock order is *enforced* rather than merely documented. While the peer
  transaction is parked at `_onAfterLock`, a separate connection attempts
  `SELECT … FOR UPDATE` on the same `User` and `LifeJourney` rows with `lock_timeout = 500ms`; both
  must time out. Removing the root locks makes this test fail (mutation M3 in
  `BATCH2_PEER_FIX_VERIFICATION.md`).

**What 3.4 and 3.5 do not prove:** removing the root locks does not fail them. They show that the
overlap is safe, not that the lock order is necessary. Necessity is what 3.6 establishes. Every
barrier fails on timeout, so a run in which the operations do not actually overlap cannot pass.
