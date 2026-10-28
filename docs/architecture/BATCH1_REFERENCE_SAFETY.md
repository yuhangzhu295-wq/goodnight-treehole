# BATCH1_REFERENCE_SAFETY.md

Reference-safety proof for the Batch 1 persistence migration (eight models:
LifeJourney, SituationSnapshot, JourneyUpdate, ActionCommitment, OutcomeCheckin,
SafetyEvent, UserNotification, AIJob).

**This document is a proof obligation, not a summary.** The claim under test:

> Removing these eight models from the in-memory authoritative arrays cannot cause silent
> data corruption — in particular it cannot null a foreign key or delete a row that should
> survive.

Scope note: this is a proof check of the **existing** code mechanism, not a correctness
guarantee for an implementation that does not exist yet. Performance motivation and the
write graph live in `PERSISTENCE_WRITE_GRAPH.md` §1–5, §8 and `PERSISTENCE_BENCHMARK.md`
§2–4 and are not re-audited here. The benchmark measured a single legacy flush at
approximately `N + 93` statements; its concurrency trial exhausted the connection pool in
the read phase and therefore **did not prove the absence of lost updates**.

Short names used below:

- `mapper` = `apps/api/src/relational-runtime.mapper.ts`
- `store` = `apps/api/src/store.service.ts`
- `controller` = `apps/api/src/controllers.ts`
- `worker` = `apps/api/src/follow-up-worker.service.ts`
- `schema` = `prisma/schema.prisma`

---

## 0. Verdict

**The safety claim is REFUTED for the current implementation and NOT YET PROVEN for the
target implementation.**

The current persister treats the in-memory arrays as three things at once: the *content* of
a row, the *evidence of existence* of a referenced row, and the *deletion list*. Stopping
the eight arrays from loading without simultaneously changing all three uses will silently
null foreign keys or execute full-table deletes. This is a direct consequence of
`mapper:136–168, 190–231, 249–284`; it is not speculation.

Two P0 unknowns remain for the target design, and they are **not** solved by "worker stops
reloading":

1. **AuditLog survivability.** A SafetyEvent handling transaction commits an `AuditLog` row
   that no other API instance's stale `auditLogs` array contains; the next flush from that
   instance can delete it (`mapper:291`).
2. **FollowUpJob survivability and status.** The worker already writes `FollowUpJob` and
   `UserNotification` **directly to the database** (`worker:29–49`) and then reloads. The
   mapper upserts `FollowUpJob` with the array's status (`mapper:230`) and sweeps the table
   (`mapper:275`). A stale instance can therefore revert `delivered` → `pending` or delete a
   delivered job. "The worker no longer reloads" fixes only one trigger path inside one
   instance; it does not fix cross-instance competition.

**Gate status: PASSED for design (implementation authorised), 2026-10-05.**

The first review left the gate NOT PASSED on the two P0 unknowns. Candidate resolutions were
recorded in `BATCH1_DESIGN.md` under "P0 decisions", reviewed by `code-reviewer`, and after
one round of corrections **APPROVED** (`3068fb0`). The four blocking findings were:

- **D1 was wrong to claim no retention path existed.** `pruneAuditLogsByRetention()`
  (`store:2359–2368`, boot call `store:1247`) is the live `logRetentionDays` implementation,
  and today it works *through* the sweep at `mapper:291`. D1 now records explicitly that
  removing the sweep stops retention from deleting database rows, as an accepted, visible
  consequence, with a database-side retention delete deferred to separate scope.
- **The D1 immutability proof was informal.** It is now stated precisely and verifiably.
- **The D2 terminal set was wrong.** It read `['completed','cancelled']`; `cancelled` is never
  written to a `FollowUpJob` and `delivered` *is* terminal, so the guard would have failed to
  prevent the exact regression it exists to prevent. Corrected to `['delivered','completed']`
  against every write site.
- **D2 described a worker transaction that does not exist.** `worker:38–51` is two
  unserialised statements today; D2 now states the required change and the concurrent-create
  handling explicitly.

The reviewer confirmed the corrected terminal set is complete against every `FollowUpJob`
status write, and that D1's retention consequence is visible, bounded, and less harmful than
the P0 it fixes, so it does not block SafetyEvent registration.

What this does **not** yet mean: the safety properties above are proven *of the design*, not
observed in a running system. They become verified facts only when the per-step targeted
tests in `BATCH1_DESIGN.md` pass — the FK-preservation regression, the database-only read
gate, and the concurrency invariants. Until then, treat them as the obligations the
implementation must discharge, not as results.

---

## 1. Foreign-key and reference consumers

### 1.1 Writes decided by snapshot id sets

`mapper:157–168` builds sets from the in-memory snapshot. The table lists every place that
uses one of those sets to decide a database write. Both the `create` and the `update` branch
of each row use the stated result. When the set is empty the `has` guard writes `NULL` into
the nullable column; for required relations the row is filtered out entirely and the
subsequent absence sweep may then delete it.

| Referenced object and set | Consumer and location | Result when the set is empty |
| --- | --- | --- |
| LifeJourney, `journeyIds` (`mapper:160`) | row filters for SituationSnapshot `:191`, JourneyUpdate `:192`, ActionCommitment `:193`, OutcomeCheckin `:194` | the four row types stop upserting; their sweeps `:249–251, 263` can delete all of them. Unsafe even if the child arrays still hold data. |
| LifeJourney, `journeyIds` | PeerExperience `:195`, PeerMatch `:196`, Mood `:198`, Post `:199`, Diary `:212`, DecisionRecord `:219`, RealityHandoff `:221`, MessageToFutureSelf `:223`, PersonalSupportPlan `:224`, MemoryItem `:226`, RecoverySnapshot `:227`, SafetyEvent `:228`, AgentDecisionLog `:229`, FollowUpJob `:230` | every `journeyId` becomes `NULL` in the corresponding legacy upsert. SafetyEvent must skip its legacy upsert entirely once migrated; the others can still be overwritten by a legacy flush. FollowUpJob is still outside Batch 1. |
| AIJob, `jobIds` (`mapper:159`) | Letter `aiJobId` `:203–207`; Reply `aiJobId` `:214–217`; AgentDecisionLog `aiJobId` `:229` | all write `NULL`. Reply first uses an explicit `item.aiJobId`, otherwise derives a candidate from a `reply_job_…` id (`:215`), and only then checks the set. Letter's `aiJobId` is a plain string column (`schema:346`), Reply has a real relation (`schema:325–326`); the two retention obligations must not be conflated. AgentDecisionLog's `aiJobId` is a string column (`schema:764–768`) and is still nulled by the mapper. |
| ActionCommitment, `commitmentIds` (`mapper:161`) | OutcomeCheckin `commitmentId` `:194` | writes `NULL`. `schema:501–502` also defines a real `SetNull` on action deletion, but **a missing array entry is not a business delete**. OutcomeCheckin must skip its legacy upsert once migrated. |
| Mood, `moodIds` (`mapper:157`) | Letter `sourceMoodId`/`legacySourceMoodId` `:203–207`; Diary `moodId` `:209–212` | Letter moves an unconfirmed source id into `legacySourceMoodId` and nulls the relation; Diary nulls the relation. Mood is not Batch 1 and should not empty because of this round, but it is the same snapshot assumption. |
| Letter, `letterIds` (`mapper:158`) | Diary `letterId` `:209–212` | Diary relation nulled; Letter is not Batch 1. |
| DecisionRecord, `decisionIds` (`mapper:162`) | CooldownItem row filter and `decisionId` `:220` | rows with a `decisionId` are filtered and may then be swept by `:264`; rows without one get a null reference. Not Batch 1, but the collateral deletion cannot be ignored. |
| PeerExperience, `peerExperienceIds`/`peerExperienceIdSet` (`mapper:163, 168`) | PeerMatch row filter `:196`; PeerReport `experienceId` `:255` | PeerMatch stops upserting and `:261` can delete it; the PeerReport nullable reference is nulled. |
| User, `userIds` (`mapper:164`) | UserNotification row filter `:231`; PeerConversation `:232`; PeerMessage `:233`; PeerReport `:255`; AdminUserNote `:257` | rows are skipped and their sweeps `:260, 259, 252, 256, 258` still run. Once UserNotification migrates, its legacy upsert and sweep must both exit. |
| AdminUser, `adminUserIds` (`mapper:165`) | AdminUserNote `:257` | stops upserting; `:258` can delete. |
| PeerMatch, `peerMatchIds` (`mapper:166`) | PeerConversation `:232` | stops upserting; `:259` can delete. |
| PeerConversation, `peerConversationIds` (`mapper:167`) | PeerMessage `:233`; PeerReport `:255` | stops upserting; `:252, 256` can delete. |

**References with no set guard that still need checking.** ActionCommitment's
`parentActionId` is taken straight from the object (`mapper:193`) and is a string, not a
Prisma relation (`schema:486`). AIJob's `contentId`/`contentType` are business strings
(`schema:1083–1086`) whose ownership is decided by archive and test cleanup against Journey
and Action ids (`store:2968–2973, 3193`). UserNotification links to Journey/Action through
the `targetRoute` string (`store:2926–2928, 3194`; `schema:795`), not a foreign key — the
absence of a relational match is not evidence that it may be deleted. AuditLog's
`resourceType`/`resourceId` are strings, not Journey foreign keys
(`schema:1125–1139`), and `mapper:240` does not use an id set; SafetyEvent handling must
preserve that audit record. PeerReputation references only User and `mapper:197` uses no
Journey/AIJob set, but it is still threatened by its own absence sweep (`:276`). "No guard"
does not mean "cannot be overwritten by a stale snapshot".

### 1.2 References the business code decides directly

- The worker decides the ids to process from the queued payload, but first reads FollowUpJob
  from the database (`worker:26–28`), creates a notification with the deterministic id
  `notification_${input.id}` (`:30–49`), and updates FollowUpJob, FutureSelf, Cooldown and
  Decision (`:51–61`). **These statements are not currently in one transaction.** The
  `journeyId` in the payload is not the notification's database foreign key.
- Safety events receive a `journeyId` on high-risk Journey creation and on the
  HIGH_DISTRESS intent path (`store:2755–2765, 3010–3025`); admin handling is
  `store:3480–3497`; the admin controller first verifies existence from the array and then
  writes the audit row and flushes separately (`controller:2269–2275`).
- Peer notifications are looked up, mutated or inserted in the array by deterministic id
  (`store:4213–4233`). Once notification writes migrate, this block must become a database
  write or it is a fake feature that returns a notification it never saved.
- `FollowUpJob` creation on actions, check-in, and other self-system writes still go through
  the legacy arrays (`store:3633–3647, 3686–3692, 4873–4875, 5009–5011`). It is outside the
  eight migrated models but the worker writes the same table concurrently.

---

## 2. All `deleteAbsent` consumers

Definition: `mapper:136–138`. A non-empty list runs
`deleteMany({ where: { id: { notIn: ids } } })`; **an empty list runs `deleteMany({})` with no
`where`**. The source contains exactly **40 call sites**; the benchmark's §3.2 recorded 42
actual absence-sweep SQL statements. The two counts measure different things and 42 must not
be described as 42 calls of this function.

| Location | Swept table | Direct risk once the array is empty |
| --- | --- | --- |
| `mapper:249, 250, 251` | OutcomeCheckin, JourneyUpdate, ActionCommitment | **unconditional full delete**; may also be removed by a later Journey cascade. |
| `:252, 256, 258, 259` | PeerMessage, PeerReport, AdminUserNote, PeerConversation | not Batch 1; a stale snapshot deletes rows; deleting PeerMatch can additionally cascade conversation/message/report (`schema:806, 840, 864`). |
| `:260` | UserNotification | **unconditional full delete**, including a notification the worker just committed. |
| `:261, 262` | PeerMatch, PeerExperience | not Batch 1; deleting PeerExperience cascades PeerMatch (`schema:554`). |
| `:263` | SituationSnapshot | **unconditional full delete**. |
| `:264, 265, 266, 267` | CooldownItem, DecisionRecord, RealityHandoff, TrustedContact | not Batch 1; must not be deleted because a legacy array is missing them. |
| `:268, 269, 270, 271, 272` | MessageToFutureSelf, PersonalSupportPlan, StableSelfProfile, MemoryItem, RecoverySnapshot | not Batch 1; their Journey links can survive and be nulled under their own relation rules. |
| `:273` | SafetyEvent | **unconditional full delete**, including handled records that must be retained. |
| `:274, 275, 276` | AgentDecisionLog, FollowUpJob, PeerReputation | not Batch 1; AgentDecisionLog and FollowUpJob in particular can be deleted after a commit. |
| `:277` | LifeJourney | **unconditional full delete**, and cascades the four Batch 1 child tables via `schema:425, 453, 477, 500`; other Journey relations are `SetNull`, e.g. PeerExperience, SafetyEvent, FollowUpJob (`schema:523, 744, 777`). |
| `:278, 279, 280, 281, 282, 283` | Reply, Diary, Favorite, Letter, Post, Mood | not Batch 1; Reply/Letter AIJob links may already have been nulled by the upsert. |
| `:284` | AIJob | **unconditional full delete**; whether Reply's relation even permits this must be checked against the real database constraint — a database refusal is not a safety strategy. |
| `:285, 286, 287, 288, 289, 290, 291, 292` | AIStyleRoute, AIProvider, FeedbackTicket, FeedbackCategory, FaqItem, ReplyPreset, AuditLog, MediaAsset | not Batch 1; `:291` can delete an AuditLog row that a safety-handling transaction just inserted and that no other API instance's stale array holds. |

Additionally the mapper unconditionally deletes and recreates MoodAttachment and
DiaryAttachment on every flush (`mapper:242–247`); although not `deleteAbsent`, it shows that
a legacy flush cannot be used as a general guard for committed cross-instance data.

---

## 3. Other existence sets built from arrays

The mapper sets above are the main source of database FK writes. The following sets are not
all FK guards, but they decide whether a business record exists and whether it should be
deleted, so they are part of this proof:

- `store:2871–2881` builds explicit Journey/Notification/Decision/Cooldown id sets from a
  test-cleanup request; `:2887–2913` then derives the Journeys and Actions to clean from the
  **Journey/Action arrays**; `:2924–2973` deletes and detaches other data accordingly,
  including AIJob. If the eight arrays are not loaded, cleanup may under-delete, return wrong
  counts, or retain records it should remove. Ids named by the request must be ownership-
  checked in the database.
- `store:3175–3177` builds `actionIds` from the Action array for archive deletion;
  `:3186–3216` uses it to delete Checkins and AIJobs and to detach cross-domain data. An
  empty Action array will miss the Action-linked AIJobs; deleting only the Journey triggers a
  database cascade whose semantics are not a substitute for the existing explicit cleanup.
- `store:3112–3113` builds a set from PeerMatch to filter archived conversations. The set
  still comes from a legacy model, but archive detail must be served together with database
  Journey data; a missing projection must not be read as "no conversation".
- `store:4077–4083` builds the set of PeerExperiences already suggested, from PeerMatch, and
  takes context from Snapshots. Once Snapshots stop loading, "no fingerprint read" can be
  mistaken for "no fingerprint", changing the match result.
- `monthly-report.service.ts:197–198` builds `journeysById` from Journey for report
  statistics; `:172–181, 303–327` similarly read Journey/Action/Checkin source arrays and will
  under-count once those switch. `controller:1506` and `monthly-report.service.ts:143, 274`
  build Mood id sets from Diary and other legacy data; they do not directly reference the
  eight migrated objects.
- `mapper:72`'s `moodAttachmentMap` converts database rows to in-memory attachment ids;
  `:143–156`'s `providerMap` is built from the legacy AIProvider array and manufactures a
  compatibility provider. Direct AIJob creation must still satisfy the real AIProvider
  required by `providerId` (`schema:1089–1090`) rather than relying on the ordering of a
  legacy AIJob upsert that will no longer run.

No further `Set`/`Map` built from a Batch 1 array and used as a database FK guard was found
outside the above. That judgement rests on a static search of set construction and the eight
array references in `apps/api/src`; **it is not a proof about future code or runtime dynamic
property access.**

---

## 4. Every mapper affecting authority

1. `loadRelationalRuntimeState()` loads the relational tables with 43 concurrent queries
   (`mapper:24–70`) and maps rows back to store shape (`:72–133`). The eight targets are
   mapped into arrays at `:105, 108–112, 125, 128`. After loading stops, any path still
   reading those arrays may return an empty value instead of failing. The
   `if (!users.length) return undefined` at `:70` triggers the legacy JSON/seed fallback
   (`store:1241–1242, 2043–2048`): that fallback must be scoped so the old files cannot become
   the new authority for the eight tables.
2. `saveRelationalRuntimeState()` builds providers and existence sets from store shape
   (`mapper:140–168`), upserts legacy data in a single transaction (`:170–240`), rebuilds
   attachments (`:242–247`), sweeps tables (`:249–292`), and updates RuntimeState
   (`:293–297`). The eight models' upserts are at `:190–194, 202, 228, 231`; unless these
   entry points are removed, a legacy flush can still overwrite a directly committed row.
3. `PrismaRuntimeService.loadRuntimeState()/saveRuntimeState()` route the RuntimeState
   marker to the two functions above (`prisma-runtime.service.ts:17–27`). This is a second
   entry point to load/save, not a second safety mechanism.
4. The worker's `notificationCopy()` (`worker:67–84`) converts a job kind/payload into a
   notification row; it is not a store↔database mapper, but its deterministic id and copy
   must be preserved after migration. `store:2050–2079` rewrites historical AIJob statuses at
   boot and marks unfinished jobs failed; once ownership moves to the database, these two
   array-repair functions must not keep pretending they handled database rows.

---

## 5. Counterexamples in load, queue, flush and reload

- At startup `store.onModuleInit()` loads or falls back, then runs AIJob repair, seed/override
  and configuration correction, and finally `flush()` (`store:1240–1252`). Some of those steps
  call `persist()` (`:2050–2079, 2118–2157`). A stale snapshot can therefore write back to the
  database at boot.
- `persist()` increments this instance's `mutationVersion`, enqueues into `persistQueue`, and
  when that queued task **starts** it clones `this.data` and calls the mapper
  (`store:2016–2031`). It converts an exception into `persistenceError` instead of letting the
  background task throw; `flush()` only waits for the existing queue and checks the error, and
  **does not initiate a save** (`:2033–2040`). These semantics serialize a single
  StoreService instance only; they cannot lock another API instance or the worker.
- `reloadRuntimeState()` waits for this instance's queue, records `mutationVersion`, reloads
  the whole dataset, replaces `this.data` only if the version is unchanged, and may then run
  configuration handling/flush (`store:1255–1275`). The version only detects `persist()`
  calls made by this instance during the read; it does **not** detect other database writers,
  changes made without `persist()`, and it does not protect already-committed Batch 1 rows.
  The worker calls it after delivery (`worker:63`).
- `queueAiJob()` first adds the queued job to the array and calls `persist()`, and a
  microtask runs shortly after; the running, terminal and catch branches keep mutating the
  array and enqueuing saves (`store:5536–5609, 5637–5966`). `waitForAiJob()` polls the array
  and only `flush()`es at a terminal state (`:5612–5623`). Once AIJob stops loading, this
  mechanism cannot be used as is.
- After awaiting, AI completion callbacks re-find the object from the **Journey/Snapshot
  arrays** and return immediately when it is missing (`store:2774–2783, 2837–2848,
  3365–3458`); even with AIJob itself persisted, the subsequent business update can be
  silently lost. The plan's §7 and §8 judge this correctly.
- Test cleanup and archive deletion are not direct database deletes but array filters followed
  by a flush (`store:2930–2975, 3186–3216`); once loading stops, these functions can no longer
  express a business delete.

---

## 6. Verdict, unknowns and the gate

**Current implementation: claim refuted.** An empty Journey/AIJob set nulls legacy
references and an empty array triggers an unrestricted delete; both follow directly from
`mapper:136–168, 190–231, 249–284`.

**Target implementation: not yet provable.** Beyond the plan's §6–9 (triple registry control,
database FK existence checks, stopping legacy upsert/sweep/boot hydration, rewriting every
read/write and the worker reload), the following must be settled and verified:

1. **AuditLog atomicity and survivability.** After a safety event and its audit commit in one
   transaction, another API instance's stale `auditLogs` array does not contain that audit
   row, and its next `mapper:291` can delete it. A narrow rule is required that forbids this
   deletion without migrating AuditLog into Batch 1 wholesale, together with a proven audit
   retention/cleanup semantic.
2. **FollowUpJob survivability and status.** The worker's direct writes (`worker:27–63`)
   race the legacy `mapper:230, 275` upsert/sweep; action check-in also flips it to completed
   from the legacy array (`store:3686–3692`). Removing the worker reload does not stop
   **another instance's** legacy flush from reverting delivered → pending or deleting the row.
   A protection boundary that does not migrate FollowUpJob ownership must be stated and
   tested.
3. **Legacy references to a Journey deleted by another instance.** A database id-set query
   prevents the false nulling caused by an empty array, but it is not a substitute for
   explicit archive deletion, child deletion and cross-domain detach; the transaction must
   check which references truly exist and define the deletion order, so a legacy snapshot
   cannot afterwards rebuild the association or delete a surviving row.
4. **Per-read-path verifiability.** The plan's §7 database-only read tests and a loud-failure
   check for reads of unmigrated arrays must actually exist, otherwise "no array consumer"
   remains an assertion.
5. **Real constraints and concurrency.** `schema:381–516, 739–800, 1081–1109, 1125–1139`
   provide relations and a partial `updatedAt`, but no cross-process serialization guarantee.
   Foreign keys, deletes and two interleaved writers must be tested in an isolated database
   created by migrations; this read-only review ran no such test. Isolation requirements per
   `TEST_ISOLATION_DESIGN.md` §2–4; known migration history per `MIGRATION_FORENSICS.md` §9,
   §82–117 — `db push` must not be used to stand in for a migration test.

**Gate: PASSED for design, implementation authorised** (see §0 for the review history).
Unknowns 1 and 2 are resolved by D1 and D2 in `BATCH1_DESIGN.md`; the concurrency invariants
in unknown 5 are resolved by D3's parent-row locking, with an escalation rule if the tests
cannot demonstrate them. Unknowns 3 and 4 are verification obligations, discharged by the
per-step tests rather than by argument. The findings in §1–§5 above remain the authoritative
list of consumers the implementation must convert; they are not retracted by the approval.
