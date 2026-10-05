# BATCH1_DESIGN.md

Implementation-grade design for the Batch 1 persistence migration.

Targets and migration boundary follow `PERSISTENCE_WRITE_GRAPH.md` §6–9; the performance
baseline follows `PERSISTENCE_BENCHMARK.md` §3. **This design is gated by the proof
obligation in `BATCH1_REFERENCE_SAFETY.md`; it does not authorise starting work until the P0
decisions below are approved by `code-reviewer`.** P0 is the AuditLog/FollowUpJob
survivability and reference safety from that document; only after it is resolved does the
fixed implementation order apply. Any diff may grant new database write authority to the
eight models only, and may not use the opportunity to migrate Peer, FollowUpJob, AuditLog or
any other table's ownership.

| Dimension | Design constraint for the eight models |
| --- | --- |
| **Source of truth** | After a model switches, its PostgreSQL row is the sole authority. There must be no mutable copy of the eight tables in `store`; responses are built from the committed row or the same transaction's return value. "Database write plus a convenient `store.persist()`" is not allowed — that is dual writing. |
| **Repository boundaries** | Add **exactly one** Batch 1 persistence service under `apps/api/src/`; it exposes per-business-operation read/write methods plus a central registry, and does **not** expose a "save all state" method. The existing `PrismaRuntimeService` injects the database client (`prisma-runtime.service.ts:10–27`); controllers/services keep auth, copy and route shape, the repository owns database conditions and transactions. |
| **Transaction boundaries** | create Journey+Snapshot+Update(+SafetyEvent), confirm Snapshot+Journey(+Update), action creation Action+Checkin+FollowUpJob+Update, check-in Action+Checkin+FollowUpJob+Update, and SafetyEvent+AuditLog handling are each **one local database transaction**. FollowUpJob and AuditLog are existing cross-domain side effects and do not enter the eight-model registry just because they participate. External AI/Redis/filesystem work must never sit inside a long transaction. |
| **Read path / cache** | Default to a per-request database query with owner, status and stable ordering/pagination. A **read-only adapter** is kept only for read code that still depends on a synchronous array getter: it obtains rows via a database query and maps them to a non-writable value for that call; it must not return a mutable `this.data.*`, must not be enumerated by `persist()`, and must not treat a cache miss as "does not exist". If a synchronous call chain cannot be safely made async, **pause that model's switch** — do not work around it by hydrating the eight tables at boot. No long-lived cache in the first pass; a later cache must be keyed by model/id/user, invalidated on commit, and must never participate in FK or delete decisions. |
| **Legacy compatibility** | Map old row shapes to the existing HTTP shape, preserving `undefined`/JSON/date, status and ordering semantics; `loadRelationalRuntimeState()` no longer loads or fills registered models (`mapper:24–69, 105, 108–112, 125, 128`). Handle the `!users.length` legacy-file/seed fallback specially (`mapper:70; store:1241–1242, 2043–2048`): the eight tables inside those files must not become the database authority. |
| **Dual-write prevention** | The registry simultaneously stops the model's legacy upsert, its absence sweep, and the "snapshot is missing the id ⇒ the FK does not exist" judgement; it also stops array `unshift`, in-place object mutation and the use of `persist()` as the commit action for that write. Legacy models keep their existing path but must not incidentally rewrite a migrated row. |
| **Delete strategy** | None of the eight models uses `deleteAbsent`: notifications are deleted by authorised specific ids, safety records are handled only under explicit rules or detached from a Journey, AIJobs are deleted by archive/test conditions and id, and Journey deletion lists its Snapshot/Update/Action/Checkin children inside the transaction and deletes per current business intent; a non-deleting archive only changes status (`store:3154–3165, 3169–3216`). Before deleting an Action, decide whether its Checkins are deleted or retained and nulled per `schema:502`; the database cascade (`schema:425, 453, 477, 500`) is not the business requirement. |
| **Reload strategy** | The eight tables are never reassigned by `reloadRuntimeState()`; that function loads legacy models only, and the worker no longer calls it (`store:1255–1275; worker:63`). `mutationVersion` still protects only this instance's legacy store against changes during a load; it is not a database version. |
| **Worker strategy** | Delivery reads FollowUpJob from the database, conditionally claims it in a transaction, idempotently creates the UserNotification by fixed id, completes the FollowUpJob, and applies the optional FutureSelf/Cooldown/Decision updates (`worker:26–61`); the `reloadRuntimeState()` call is removed. The legacy mapper's overwrite/delete of FollowUpJob must be resolved first (P0 below), otherwise UserNotification must not be registered. An AIJob must be committed as queued before the external call starts, and running/terminal are updated by id under a condition (`store:5536–5966`). |
| **Failure semantics** | A synchronous HTTP operation awaits the database commit before returning success; a transaction failure raises a distinguishable error, does not update a read-only projection, and never returns a 200 that looks written. An external AI failure lands on a persisted `fallback` or `failed` terminal state; a failed terminal-state commit must not be disguised as success. A Redis enqueue failure leaves a persisted pending FollowUpJob and is reported or compensated explicitly — the design must not claim database and Redis are atomic. |
| **Concurrency semantics** | Use conditional updates such as `updateMany({ where: { id, userId, expectedStatus/updatedAt… } })` and check the count, or lock the row in the transaction, then re-read or return a conflict on failure. Reading an object and unconditionally upserting all fields is forbidden. Models without `updatedAt` use append-only, deterministic id, status CAS, or parent-row mutual exclusion. |

### Reviewable definition of `DIRECT_DB_MODELS`

In the **single new** repository file under `apps/api/src/`, export a read-only, type-bounded
configuration keyed by Prisma model name with the corresponding `StoreData` collection name,
for example the conceptual shape:

`LifeJourney→lifeJourneys; SituationSnapshot→situationSnapshots; JourneyUpdate→journeyUpdates; ActionCommitment→actionCommitments; OutcomeCheckin→outcomeCheckins; SafetyEvent→safetyEvents; UserNotification→notifications; AIJob→aiJobs`.

Membership grows as a controlled constant, not dynamically at boot based on environment or
whether an array is empty. The mapper and the loader use **the same** configuration. Adding a
member must, in the same diff, also provide:

1. the model's legacy upsert does not run (`mapper:190–194, 202, 228, 231`);
2. the model's legacy sweep does not run (`mapper:249–251, 260, 263, 273, 277, 284`);
3. the FK checks pointing at it switch to ids **queried inside the transaction** or ids known
   to have just been committed in that transaction, and never conclude non-existence from an
   unloaded array (`mapper:157–168, 195–230`). The sets that actually need re-sourcing are
   Journey, AIJob and ActionCommitment; the others stay with the legacy model. The check must
   be consistent with the transaction the legacy flush runs, so that a business delete cannot
   slip in between reading the ids and writing the FK. For an existing FK on a legacy row,
   the absence of the relation from a stale snapshot must not silently null it: distinguish
   **an explicit request to detach** from **a missing/stale reference**, using the latest row
   in the transaction plus an explicit command; if they cannot be distinguished, refuse the
   write rather than guess.

Adding only the constant and omitting any of these behaviours does not satisfy the registry
definition. The plan's §6.3 and §8 first row are correct in direction; `BATCH1_REFERENCE_SAFETY.md`
supplies every consumer.

---

## P0 decisions (orchestrator)

`BATCH1_REFERENCE_SAFETY.md` §6 leaves the gate open on two survivability unknowns. Both are
resolved below with narrow rules that are provable from the code and that do **not** migrate
any table's ownership. These are the decisions `code-reviewer` must approve or reject before
implementation; they are also the reason the gate can move from NOT PASSED to PASS.

### D1 — AuditLog is append-only and is never swept

**Finding.** `AuditLog` (`schema:1125–1140`) has no `updatedAt` and no mutable column: a row
is written once and never changes. The mapper nevertheless prunes it with
`deleteAbsent(tx.auditLog, …)` at `mapper:291`, whose empty-list branch is
`deleteMany({})`. Any API instance holding a stale `auditLogs` array will therefore delete
audit rows written by another instance — including the row a SafetyEvent handling transaction
just committed. This is a pre-existing defect, and it is exactly the mechanism that would
destroy the audit half of the SafetyEvent closed loop.

**Decision.** Remove the `AuditLog` absence sweep (`mapper:291`). Audit rows are never deleted
by any flush.

**Known gap this creates — retention must not be claimed absent.** `pruneAuditLogsByRetention()`
(`store:2359–2368`, called at boot from `store:1247`) filters `this.data.auditLogs` by age
against the `logRetentionDays` system setting (`controllers.ts:185` lists it as an enforced
setting). Today that setting is applied **through the flush**: the pruned array reaches
`deleteAbsent` at `mapper:291`, which deletes the dropped rows. Removing `mapper:291`
therefore **stops `logRetentionDays` from deleting database rows**. This is an explicit,
accepted consequence of D1, not an absence of a path: the boot prune still trims the in-memory
array, so an operator lowering the window sees the admin audit list shrink for that instance
while the rows persist in the database, and audit rows accumulate bounded only by insert rate.
A database-side retention delete — an explicit, age-bounded `deleteMany` on `AuditLog`, owned
and scheduled deliberately — is **separate scope** and must be reviewed on its own. If this
consequence is not acceptable, D1 must not be approved and SafetyEvent must not be registered.

**Why it is provable.** Deleting a `deleteMany` statement cannot delete a row. The only
remaining AuditLog write is the id-keyed upsert at `mapper:240`. For any audit row whose id is
still present in `state.auditLogs`, the in-memory shape was loaded from the database at boot
(`mapper:107`) and is never mutated in place — `store.audit()` (`store:2418`) only `unshift`s
new rows, and `pruneAuditLogsByRetention` only removes entries from the array
(`store:2365–2366`). The upsert's `update` branch therefore writes back the same bytes that
were read, and cannot corrupt a committed row. For any audit row whose id is **not** in the
array, the upsert does not touch it, and after the sweep removal nothing else does. Hence no
flush can alter or remove a committed audit row. This does not migrate AuditLog ownership and
does not widen the eight-model registry.

**Consequence for the SafetyEvent step.** The SafetyEvent handling transaction
(SafetyEvent status update + AuditLog insert) may commit safely; no other instance can erase
the audit row. The audit record is queryable by `resourceType`/`resourceId`
(`schema:1139`), which is how the admin view and its verification read it.

### D2 — FollowUpJob is never swept and its status is monotonic under flush

**Finding.** The worker already writes `FollowUpJob` and `UserNotification` **directly** to
the database (`worker:29–49`) and only then reloads the store. `FollowUpJob` is therefore
already dual-written today: the direct worker write versus the mapper's array-driven
`upsert` (`mapper:230`, which writes `status` and `completedAt` unconditionally) and its
sweep (`mapper:275`, empty-list branch `deleteMany({})`). A stale instance can revert
`delivered` → `pending` or delete a delivered job. Removing the worker's reload does not
address another instance's flush.

**Decision.** Keep `FollowUpJob` **out** of `DIRECT_DB_MODELS` (as the round requires) and
apply two narrow protections in the mapper, plus one required change in the worker:

1. Remove the `FollowUpJob` absence sweep (`mapper:275`). No flush deletes a FollowUpJob row.
2. Make the mapper's FollowUpJob write **status-monotonic**. Replace the unconditional
   `upsert` at `mapper:230` with: insert when the row is absent; otherwise a guarded update
   that applies the array's fields only when the array's `status` is not a *regression* out of
   a terminal database state, and that never clears `completedAt`. Concretely the guard is
   `updateMany({ where: { id, ...(arrayStatusIsTerminal ? {} : { status: { notIn: TERMINAL } }) }, data })`
   with **`TERMINAL = ['delivered', 'completed']`**, and `completedAt` is only ever set
   forward, never nulled.
3. **Required worker change — this does not exist in the current code.** `worker:38–51`
   currently awaits `userNotification.create` (`:38`) and `followUpJob.update` (`:51`) as two
   separate statements with no enclosing transaction. The required shape is given under
   "Delivery ordering" below.

**Status lattice, verified against every write site.** The only statuses any code writes to a
`FollowUpJob` are `pending` (creation: `store:3617, 3627, 3675, 4868, 5004`), `delivered`
(`worker:51`) and `completed` (`store:3690`). `scheduled` is *recognised but never written* —
it appears only in the worker's skip guard (`worker:28`) and the admin counter
(`controller:1921`). `cancelled` is never written to a `FollowUpJob` (the `cancelled` at
`store:290` is the AiJob status). The observed transitions are `pending → delivered` and
`pending → completed`; **no backward transition exists in the code**, so the terminal set is
exactly `['delivered','completed']` and the guard blocks no legitimate write. If a future
change introduces `cancelled`, or a legitimate `delivered → pending` reschedule, that change
must add the write path and revisit `TERMINAL`; it must not be assumed here.

**Why it is provable.** (1) removes a delete, which cannot delete a row. (2) can only block a
write; a blocked write leaves the committed value intact, and a permitted write is either the
same status or a forward transition — and because the terminal set is exactly the set of
statuses the code can produce as terminal, no legitimate write is blocked. So a committed
`delivered`/`completed` can never be reverted to a non-terminal state, and `completedAt` can
never be unset. (3) is a compare-and-swap on a `String` status column (`schema:780`); two
workers cannot both observe `pending`.

**Delivery ordering — AMENDED after implementation review.** An earlier draft of this section
required the notification create and the job claim to commit together in one transaction. That
is **wrong** once `UserNotification` is database-authoritative, and it was falsified in
sub-batch A: with the create inside the claim's transaction the notification becomes visible at
commit — before `reloadRuntimeState()` refreshes the legacy store — so a reader can see a
`COOLDOWN_RELEASED` notification while `/api/v1/decisions`, which still reads the store, says
`cooling`. `third-stage-decision-vault` failed intermittently (1 of 3 isolated runs, measured by
the orchestrator) on exactly that. The correct order is:

1. **transaction A** — the guarded FollowUpJob claim
   (`updateMany({ where: { id, status: { in: ['pending','scheduled'] } }, data: { status: 'delivered', completedAt } })`)
   **together with** the legacy-model updates (`messageToFutureSelf`, `cooldownItem`,
   `decisionRecord`), applied only when the claim matched a row. They commit atomically, so
   *legacy state visible ⇒ job already delivered*.
2. **`reloadRuntimeState()`** — the store now reflects the delivery, so *notification visible ⇒
   the state it refers to is already consistent*.
3. **the notification, last and idempotently** — `createMany({ skipDuplicates: true })`, gated on
   `futureNotificationsAllowed` and on the job's current status being `delivered`.

The asymmetry is deliberate. The harmful ordering is *tell the user to act while the state is
not ready*, because the notification deep-links to state that contradicts it. The benign
ordering is *the state is ready and the notification follows*, which is the natural order for
any asynchronous notification. The remaining window — state consistent, notification not yet
created — is therefore correct, not a defect.

**Retry and races.** Do **not** early-return when the claim matched 0 rows. A crash between
step 1 and step 3 leaves the job `delivered` with no notification; BullMQ retries, the claim
then matches 0 rows, and an early return would lose the notification permanently. The step-3
status gate is what makes that retry self-healing. Two workers racing the same job are
serialized by the claim, and `skipDuplicates` makes the loser's duplicate attempt a no-op
rather than a failed statement — the loser does not need to detect that it lost.

This ordering applies to every remaining sub-batch that couples a migrated model's visibility
to legacy store state. The general rule: **the direct-database write that makes a migrated row
visible must happen after the coupled legacy state has committed and the store has been
reloaded; and any legacy state a reader uses to infer the migrated row's state must commit in
the same transaction as that row's authoritative transition.**

**Note on registry semantics.** `DIRECT_DB_MODELS` governs **flush ownership**, not which
tables a transaction may write. The worker's transactional claim therefore does not, and must
not, add `FollowUpJob` to the registry. Batch 1's `BATCH1_DUAL_WRITER` condition refers to the
migrated models; FollowUpJob is not migrated, and D2 is a compatibility protection, not a
second ownership.

**Why `worker.reloadRuntimeState()` stays.** `BATCH1_REFERENCE_SAFETY.md` §5 is correct that
the reload cannot protect committed batch-1 rows, and the plan removes it once the models it
touches are migrated. It must **not** be removed in Batch 1: the worker also direct-writes
`MessageToFutureSelf`, `CooldownItem` and `DecisionRecord` (`worker:53–61`), which are legacy
models whose authority is still the array. Without the reload the worker's own instance would
hold a stale array and its next flush would clobber those rows. The reload is therefore
retained for the legacy models, and D1/D2 — not the reload — are what protect the committed
rows. Once those three models migrate (a later batch), the reload is removed.

### D3 — The "no schema change" claim is upheld by row locking, and must be proven by test

The safety review found that the invariants "a user has at most one active Journey"
(`store:3159–3162`; the index at `schema:418` is not unique) and "an action has at most one
pending OutcomeCheckin" (`store:3661–3685`; `schema:514–515` has no unique constraint) are
enforced today only by the single-instance in-memory store. The design keeps the "no schema
change" claim, but only via explicit serialization, and only if the tests prove it:

- **Journey single-active**: locking the user's existing Journey rows is **not sufficient**.
  Prisma's interactive transactions default to PostgreSQL `READ COMMITTED`, and `SELECT … FOR
  UPDATE` locks existing rows only — it does not stop another transaction from **inserting** a
  new matching row between the check and the act. Lock the **parent `User` row** instead
  (`SELECT id FROM "User" WHERE id = $1 FOR UPDATE`) inside the restore/graduate transaction,
  so every writer for that user serializes on one row, then do the check-then-act. Two
  instances restoring different Journeys for the same user must not both end up active.
  *Narrowed scope qualification:* This mutual exclusion is enforced across the restore and
  activation paths (`restoreArchivedJourney`, `updateJourneyStatus('active')`), which reject
  with `400` if an active journey exists; initial journey creation (`createJourney`) creates
  a new journey without blocking on prior active journeys, preserving existing product behavior.
- **Global row-lock order is Journey → Action**: every transaction that touches both
  `LifeJourney` and `ActionCommitment` (including `createActionCommitment`, `checkinAction`,
  `ensurePendingCheckin`, `deleteJourneyArchive`, and test cleanup) must take locks in that
  strict order (`LifeJourney` row locked with `FOR UPDATE` before `ActionCommitment`). This
  prevents cyclic wait-for deadlocks (`40P01`) between competing check-in and archive deletion
  transactions.
- **OutcomeCheckin single-pending**: lock the parent Action row in the transaction before the
  check-then-insert (following the Journey → Action order by locking LifeJourney first). Two
  concurrent check-ins must produce at most one pending row. If an action
  is already terminal (`completed` or `missed`), subsequent check-in requests are explicitly
  idempotent: the existing terminal row is returned unchanged, preventing rewrites of `checkedAt`
  or `reflection`, and avoiding duplicate JourneyUpdates.
- **Status CAS for models without `updatedAt`**: SafetyEvent, UserNotification and
  OutcomeCheckin use expected-status conditions (`open`/`handled`, `unread`, `pending`) or a
  row lock in a local transaction. A repeated notification read must be idempotent; a check-in
  may transition out of `pending` only once.
- **`updatedAt` CAS** for Journey, SituationSnapshot, ActionCommitment, AIJob
  (`schema:398, 447, 490, 1105`), writing only changed fields and checking the affected row
  count. For Journey PATCH (`PATCH /api/v1/journeys/:id`), the CAS is enforced when the caller
  supplies `expectedUpdatedAt`, returning `409 Conflict` on mismatch. Unversioned PATCH requests
  fall back to field-level last-writer-wins on changed fields. The AI write to a Snapshot additionally
  uses `confidence != user_confirmed` as a **commit-time condition** (`store:2778–2783, 3243–3361`),
  not a pre-transaction check.

*Deliberate partial-apply in situation analysis AI completion:* The AI callback (`applySituationAnalysisAiCompletion`)
updates two separate entities (`SituationSnapshot` and `LifeJourney`) with independent CAS guards.
If a user edits the Journey title or summary while AI generation is in flight, the Journey's `updatedAt` CAS
matches 0 rows and does not overwrite user edits (Defect 1 fix), while the SituationSnapshot
receives the structured analysis if unconfirmed (`confidence !== 'user_confirmed'`). This partial application is intentional: user
edits to the Journey are protected by the `updatedAt` CAS, while unconfirmed psychological signals in the snapshot are retained via the commit-time `user_confirmed` condition.

*Known limitation on FollowUpJob mirror:* `FollowUpJob` is not a registered direct-db model in
Batch 1. The in-memory `followUpJobs` mirror in `StoreService` remains a second read input, and
graduation counts that array (`store:3915`), so cross-instance worker delivery can make the
displayed follow-up count in graduation summaries stale until full reload.

**Escalation rule.** If the concurrency tests cannot demonstrate an invariant without a
unique constraint, then the "Batch 1 needs no schema change" claim is false for that model:
**stop that model's switch and request a separate schema review** rather than accepting the
race as a product change. A schema change is out of scope for this round and must be reviewed
on its own.

### D4 — Test-isolation and loud-failure obligations (verification, not design)

These are discharge obligations, not open design questions; they are listed so the gate is
closed by evidence rather than assertion:

- every registered model gets a database-only read test (insert via a fresh `PrismaClient`,
  read through each affected API/service path, then re-read the final row from a fresh
  client after the response);
- store getters for registered models fail loudly in dev/test instead of returning an empty
  array;
- the test database is per-run and built by `prisma migrate deploy` (**`db push` is
  forbidden**), with `KEEP_TEST_DB_ON_FAILURE` support and no growth of the dev database.

---

## Per-model writer/read/test gate in the fixed order

Each step migrates **all reads and writes for that step**, completes the legacy mapper's
triple exit, and only then commits the registry member. Each step is tested against an
isolated database built by tracked migrations; `TEST_ISOLATION_DESIGN.md` §2–4 is the test
precondition, and cleanup scripts must not run against the development database.

| Order | Direct writer and transaction | Reads that must change before registration | Targeted test and P0 condition |
| --- | --- | --- | --- |
| **1 UserNotification** | Worker `deliver()` (`worker:26–63`), `store.readNotification()` (`store:4705–4714`), the Peer notification helper (`store:4208–4233`) and its call chain; archive/test cleanup (`store:2861–2984, 3169–3216`) becomes a user-scoped database delete by id/route. Peer business rules unchanged. | front-end/admin notification list and counts (`controller:1919–1922, 2201–2210`), any `store.notifications` getter consumer; the worker must not reload the whole store for this. | after a new notification exists in the database, trigger one legacy login flush and confirm a fresh client still reads it; a read state must not revert to unread; a retried identical BullMQ job creates exactly one notification. **D2 must be in place first.** |
| **2 SafetyEvent** | high-risk Journey creation (`store:2755–2765`), HIGH_DISTRESS (`:2994–3039`), admin handling (`:3480–3497; controller:2262–2275`); handling and its AuditLog commit in one transaction; archiving a Journey only detaches SafetyEvents that must survive (`store:3212`; `schema:744`). | intent detection (`store:3007–3010`), admin list, detail, dashboard, and the existence check that runs before handling (`controller:1919, 2246–2271`). | a high-risk event is visible in the database; a failed handling rolls back both status and audit; after success another instance's legacy flush does not delete the audit row; after archive deletion the safety record survives with `journeyId=NULL`. **D1 is the precondition for registration.** |
| **3 AIJob** | `queueAI/queueAiJob/runAiJob/waitForAiJob` (`store:5499–5966`) commit queued → execute → conditionally update running/terminal; boot `migrateAiJobs/recoverInterruptedAiJobs` (`store:2050–2079`) become targeted database recovery; admin retry (`controller:2879–2904`) and archive/test deletion. Creators include Journey, action plans, Peer assist, legacy content generation and the monthly report (`store:2766, 3383, 3565, 3739, 4483, 5364, 5472; controller:1001, 1071–1106, 1188, 1313–1398, 2599, 2862; monthly-report.service.ts:340–446`); the main route is not the only one. | status/latest/tool-save/admin list and dashboard (`store:5612–5635; controller:838, 1092–1106, 1398, 1893–1944, 2879–2890`), the monthly report's array fallback (`monthly-report.service.ts:387–388, 432–446`), the Letter/Reply/AgentDecisionLog id guards (`mapper:203–229`). The Journey/Snapshot callbacks on AI completion must already be scoped database queries/conditional writes (`store:2774–2848, 3383–3458`) — do not wait for the Journey array to disappear. | two instances may produce only one terminal state for the same job; a legacy flush does not revert a terminal state or null the Letter/Reply links. Use an injected remote provider **fixed to return HTTP 402** (no payment, no real DAPI request) to verify a normal task persists `fallback`, a Peer assist persists `failed`, and the error and trace are persisted; the normal fallback and the Peer failed branch are `store:5917–5965`. Preserve current product policy rather than re-disabling the template button (`controller:2906–2908`). |
| **4 Journey + SituationSnapshot + JourneyUpdate** | `createJourney`, `setJourneyIntent`, `confirmSituation`, `reanalyzeSituation`, `acknowledgeSafety`, `addJourneyUpdate`, `restoreArchivedJourney`, `deleteJourneyArchive`, `updateJourneyStatus`, `graduateJourney`, the Journey/Update changes triggered by actions, and the AI completion callbacks; `controller.patchJourney` must genuinely commit (`controller:393–404`; the current code already has a persist-and-flush and must not fall back to an array write). Legacy paths: `store:2683–2849, 2994–3531, 3577–3715, 3768–3788, 5233–5239`. | `requireJourney`, home, list/detail, fingerprint, timeline, archive, graduation (`store:2625–2680, 2987–2991, 3079–3151, 3224–3240, 3791–3823; controller:296–384, 491–508`), the Peer/Decision/Recovery/FutureSelf validation and match inputs (`store:4074–4090`), the monthly report's `availableMonths` (`monthly-report.service.ts:303–327`) and admin statistics/dashboard (`controller:1881–1944, 2059–2071`). | interleaved `user_confirmed` and AI completion: the confirmed content is never reverted to draft by the AI (`store:2778–2835, 3243–3361`); two instances PATCHing the same Journey lose no field; legacy Mood/Post/Diary/Peer/Decision/FollowUpJob Journey FKs are preserved; archive deletion removes only the agreed objects and detaches the rest. |
| **5 ActionCommitment + OutcomeCheckin** | `createActionCommitment/checkinAction/createAdaptiveAction` (`store:3577–3715, 3751–3765`), archive/test cleanup (`store:2900–2975, 3175–3216`), the Checkin's FollowUpJob status and Update in one transaction (`store:3686–3715`); `parentActionId` is only a string but must still be validated. | home, journey detail/actions/archive/graduation, adaptive parent, Peer draft, admin actions/checkins, the monthly report and `availableMonths` (`store:2649–2680, 3079–3151, 3224–3227, 3727–3748, 3791–3823; controller:1912–1915, 2060–2108; monthly-report.service.ts:172–203, 303–327`). | two check-ins on one action yield at most one claim of pending; a failed action+checkin transaction leaves no half Update/FollowUpJob; the AIJob content link and the Checkin FK are not nulled and a legacy flush does not delete the action or checkin. |

**Operationalising the read gate.** Per the plan §7.1–3, for each model first insert a
database-only row via an independent Prisma client, then assert through every affected
API/service read path that it appears; for paths that cannot be covered individually, add a
dev/test assertion that forbids reading the eight registered store getters. The test must also
read the final row from a fresh client after the response. An API returning the right object
is not database proof. Anywhere a migrated array still decides existence, authorisation,
statistics, copy or an async callback, pause that step's registration.

---

## Deletion, cross-boundary survivability and concurrency rules

**Explicit deletion matrix.** `deleteJourneyArchive()` today deletes the Journey and its four
child types, AIJobs, Notifications and exported Assets, while retaining and detaching
Mood/Post/Diary/Peer/Decision/RealityHandoff/FutureSelf/SupportPlan/Memory/Recovery/Safety/
AgentDecisionLog/FollowUpJob (`store:3169–3221`). The implementation must first verify
permission against the database's current user and archive state, collect the action ids and
target rows, and perform conditional deletes and detaches in a local transaction; test
cleanup does the same, verifying the demo user and touching only explicit ids
(`store:2861–2984`). Deletion of the exported file happens after the database commit
(`store:3216–3219`), so filesystem and database atomicity must not be promised; a failed file
cleanup is reported or compensated separately and must not deny a completed database delete.
Admin SafetyEvent handling is an update, not a delete; AI admin retry creates a new job rather
than deleting the old one (`controller:2887–2904`). Wherever `deleteAbsent` currently expresses
"it was deleted", an authorised command must be found instead — an empty-list table wipe is
never acceptable.

**P0 (resolved above, pending review).** Non-Batch-1 tables are protected by narrow rules, not
by migrating them: AuditLog by D1, FollowUpJob by D2. If `code-reviewer` judges either
protection insufficient to prove safety within the permitted files, **stop that model's
switch and request a separate boundary review** — do not privately add FollowUpJob or
AuditLog to `DIRECT_DB_MODELS`, and do not widen the diff to keep two write authorities.

**Concurrency.** See D3. The "no schema change" position is conditional on the locking tests
passing; a failed invariant escalates to a separate schema review rather than being accepted.

---

## Failure and verification semantics

Every migrated synchronous route keeps its current response shape and auth; a database
rejection or transaction failure returns an error and **must not mutate the in-memory object
and then answer 200**. If committing the queued AIJob fails, the microtask does not start; the
HTTP 402 test injects a fixed failing response to verify the real database rows and traces for
the normal `fallback` and the Peer `failed` branches, rather than calling a real account; it
must also verify that a failed terminal database write cannot let the waiter announce success
from stale array state (`store:5612–5623, 5917–5965`). Delayed delivery must rehearse
database-success/Redis-failure, redelivery and two-worker competition. Performance acceptance
follows the plan §8 and the benchmark §3: the legacy flush performs **zero upserts and zero
sweeps** for the eight tables, and cost is measured by changed-row count, not only by response
latency.

---

## Precise implementation boundary and priority

**P0, before any code:** resolve the AuditLog/FollowUpJob cross-instance survivability
(D1/D2), fix the archive deletion matrix and prove the schema-free concurrency invariants
(D3), and put the database-only read gate in place (D4). Without these the proof obligation in
`BATCH1_REFERENCE_SAFETY.md` is not discharged.

**P1, switch step by step**, with the file limits from the plan §9:

- `apps/api/src/app.module.ts`: register the new provider only.
- `apps/api/src/prisma-runtime.service.ts`: provide the client and stop boot hydration for
  registered models only; do not change the connection or transaction timeout (`:17–27`).
- `apps/api/src/relational-runtime.mapper.ts`: registry-driven exclusion of the eight tables'
  upsert/sweep, the listed FK-existence conversions, and the separately reviewed cross-boundary
  protections D1/D2 (`:157–168, 190–231, 249–292`); do not migrate other models here.
- `apps/api/src/store.service.ts`: only the Batch 1 writers/readers in the table, AI
  lifecycle/callbacks, cross-domain Journey reads, archive/cleanup, and the necessary
  boot/queue boundaries; do not rewrite Peer/SupportIntent/Action product rules.
- `apps/api/src/controllers.ts`: only the Batch 1 routes in the table and the explicitly
  listed notification/AI/admin-statistics cross consumers; preserve contracts.
- `apps/api/src/monthly-report.service.ts`: only Journey/Action/Checkin statistics and AIJob
  lookup/creation (`:172–203, 303–327, 340–446`).
- `apps/api/src/follow-up-worker.service.ts`: only the local idempotent delivery transaction
  and the cancellation of the whole-store reload for migrated models (`:26–64`); do not change
  kinds/copy (`:67–84`). Per D2 the reload stays for the legacy models the worker still
  writes.
- **one** new Batch 1 repository file in the same directory; tests cover only the above
  behaviour, callbacks, worker, FK, archive, concurrency and write scope.

**Do not touch** `apps/mp`: visually frozen. Do not change Journey UX, SupportIntent, Peer
flow or Action design; do not change `prisma/schema.prisma`, existing migrations, database
contents, general admin configuration, fixture/recovery scripts, or the transaction timeout.
If a P0 proof requires more than these files, **stop that model's switch and request a
separate boundary review** rather than widening the diff or keeping two write authorities.
