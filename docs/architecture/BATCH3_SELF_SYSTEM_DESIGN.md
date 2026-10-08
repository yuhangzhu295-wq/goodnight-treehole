# Persistence Batch 3 — Self System Design

**Status: DESIGN GATE NOT PASSED as written — the four escalations below are resolved by orchestrator decision in §0.4, and implementation proceeds on that basis.**
**A second independent review of this document returned `REQUEST_CHANGES` with four P0 and four P1 findings. All eight are adjudicated in §0.5, which supersedes §0.4 wherever the two disagree.**
**Reviewed checkouts:** the first review read HEAD `a004541`; the second read HEAD `446b57a`. Both were read-only. Citations are `file:line` as checked at each review.

Citations are `file:line` at that HEAD. `schema.prisma` = `prisma/schema.prisma`; bare `.ts` files are under `apps/api/src/`.

---

## 0.4 Orchestrator decisions on the four escalations

### S1 — Scope: ten models, and `FollowUpJob` stays outside the registry *(P0-SCOPE)*

The reviewer derived the real Self list from the schema (there is **no** `Archive`, `Recovery` or generic `Self` table; Recovery is `RecoverySnapshot`, and "archive" is `LifeJourney.status` plus detach/delete operations). It proposes nine Self models plus `PrivacySetting` as an authority dependency:

`DecisionRecord`, `CooldownItem`, `RealityHandoff`, `TrustedContact`, `MessageToFutureSelf`, `PersonalSupportPlan`, `StableSelfProfile`, `MemoryItem`, `RecoverySnapshot` + `PrivacySetting`.

**Accepted, with the reasoning recorded:** `CooldownItem` is inseparable from `DecisionRecord` (its `decisionId` FK would otherwise depend on an unhydrated array), and `PrivacySetting` is included because AI-memory eligibility, recovery access, archive retention and notification consent cannot be cross-instance safe while privacy is a stale per-process map. Its inclusion is a narrow ownership migration of one existing table — **not** permission to redesign those preferences.

**`FollowUpJob`: option A.** It stays **outside** the ten-model registry. It is operationally shared with action follow-ups and decision cooldowns, so migrating its whole-table authority would drag non-Self flows into this batch. Batch 3 may perform only **explicitly scoped** FutureSelf/cooldown transaction and worker writes against it, and must prove its existing legacy-mapper protection still holds. Expanding to option B requires a separately reviewed boundary.

**`AgentDecisionLog`: excluded.** Despite the name, its schema is an AI decision/audit record keyed by `taskType`/`decision`/a plain-string `aiJobId`, not a person's `DecisionRecord`. Its archive `journeyId` detach and AIJob-reference protections are retained unchanged.

### S2 — Memory: `expired` is terminal; an extension never restores eligibility *(P0-MEMORY)*

The reviewer found the plan's explicit prohibition is **violated today**:

- The date-extension path sets **any status other than `disabled`** to `active`, so it **reactivates an explicitly `expired` row** with no activation request (`store.service.ts:5804–5817`);
- physical expiry while `status='active'` is likewise reversed by extending `expiresAt` (`:5842–5845`);
- `deleteMemory` sets `deletedAt` but writes `status='expired'`, so the required logical **`deleted` state has no representation** (`:532–546,5823–5831`).

**Decision — option A, which is what the plan requires.**
- Effective `expired` is **terminal** until a separately explicit, newly consented reactivation action. A date/expiry change **never** restores AI eligibility.
- Deletion is **terminal** and represented as `status='deleted'` **plus** `deletedAt`. The `status` column is already `String` (`schema.prisma:713–716`), so this spelling needs no schema change.
- The four AI-eligibility predicates are enforced in **one owner-scoped database query**: `status='active'`, `deletedAt IS NULL`, `expiresAt >` **database** current time, an allowlisted task/scope predicate, and current `allowAiMemoryUse=true`. `allowLongTermMemory` governs **saving**, not by itself permission to inject existing material into AI (`store.service.ts:5749–5783,5834–5845`).
- The final consent check must sit close enough to prompt dispatch to define its race with revocation, and a test must establish that linearization point.

### S3 — Decision: `outcome` is an **optional** state, not a required step *(P0-DECISION — corrected by §0.5/A1)*

The plan names six states. Today only `cooling→ready`, `ready→decided`, `decided→archived` are reachable; `outcome` is a **text field, not a status**, and `updateDecision` can change `decision`/`outcome` with no state transition (`store.service.ts:5398–5425`).

**Decision — corrected.** The original text here inferred that "保存结果并归档" was the missing `outcome` step. **That inference was wrong**, and the second review refuted it: the decision-vault page treats the result as optional and, on that button, PATCHes the result and then PATCHes `archived` directly — it never sends `status:'outcome'` (`apps/mp/src/views/DecisionVault.vue:124–155,240–250`; `store.service.ts:5503–5526`). Requiring `outcome` first would break the product's normal archive action.

So: **`decided → archived` stays valid** and carries an optional outcome text in the same write. **`decided → outcome → archived` is additionally accepted** when a caller supplies a non-empty outcome and asks for the intermediate state. Both paths are legal; neither is required. The plan's state is therefore representable without changing what the product does today, and `DECISION_STATE_PASS` is scoped to the four states that exist plus `outcome` as an accepted optional state — **not** to a mandatory six-state walk. Whether the product *should* require an outcome is a product question, recorded as open in §0.5/A1, and not decided here.

Also decided: **cooldown readiness is a database-time transition.** A list must not age decisions by flushing other models; the deadline comparison happens in the transaction against `clock_timestamp()` (never `NOW()`, which is the transaction-start clock), so two instances cannot disagree about `ready`.

**Repeated cooldowns for one decision: the current behaviour is kept** (another cooling cooldown is permitted, `store.service.ts:5452–5469`) but the races must prove a **stale worker cannot set a superseded decision ready early** — see §0.5/A2 for the exact predicate that makes that true.

### S4 — Admin disclosure: metadata in list/search, full content only via an audited single-record read *(P0-PRIVACY)*

The plan requires **admin minimal disclosure** for `PersonalSupportPlan`. Today the admin support-plan list searches and returns `JSON.stringify(plan)` and the whole plan, and the admin memory list returns `content` (`controllers.ts:2467–2501`) — bulk exposure of the most sensitive material in the product.

**Decision.**
- **List and search** return counts, status, ids, owner and non-sensitive metadata only. **No plan JSON, no memory content.**
- **Full content** is available only through an explicit **single-record** admin read, which is **audited** (`AuditLog` already exists and is append-only since Batch 1's D1).
- This preserves the operator's ability to respond to a safety case while removing bulk browsing of private text.
- The admin UI must change accordingly (its columns currently render those fields); that change is part of Batch 3, and PHASE 8 re-verifies the admin surface.

### S5 — FutureSelf notification policy *(P1-NOTIFY)*

Accepted as the reviewer assumed: with notifications off, the message is **delivered silently and retained** — the letter is the value, the notification is optional. A later opt-in does **not** retroactively notify an already-delivered letter.

---

## 0.5 Adjudication of the second design review

The second review returned `REQUEST_CHANGES` with four P0 and four P1 findings. It verified as
correct: the ten-model list and the schema/legacy-writer mapping; the absence of any `Archive` /
`Recovery` / generic `Self` table; that `FollowUpJob` and `AgentDecisionLog` are still
legacy-written and unregistered; and that the `PrivacySetting` per-user upsert
(`relational-runtime.mapper.ts:1034–1071`) turns an omitted map entry into a destructive write —
**on the legacy path only**, since no direct path exists yet. It also confirmed `deleteMemory`
writes `status='expired'` while setting `deletedAt` (`store.service.ts:5917–5935`) and that the
required `deleted` spelling has no representation.

Where the review and §0.4 disagreed, §0.5 governs.

### A1 — Decision state machine: corrected, not forced *(P0-1)*

> **Extended by §0.6/A1**, which answers who may take the `outcome` path and why no caller can get stuck.

See S3. `decided → archived` with an optional outcome text stays valid; `outcome` is additionally
accepted as an optional intermediate state. **Open product question, recorded and not decided
here:** whether an outcome should ever be required, and whether an outcome may be recorded after
archiving. Implementation must not answer it by changing the page's behaviour.

### A2 — Cooldown release and expiry: one invariant, stated as predicates *(P0-2)*

> **Superseded by §0.6/A2.** The predicate below compared the job's `payload.cooldownId` against
> "the decision's current cooldown id", and the schema has no such field — `DecisionRecord` carries
> `cooldownUntil` only. §0.6/A2 replaces this with a defined current-cooldown *state* and the
> decidable predicates. The rest of this subsection (the failure it describes, and the mutation
> requirement) still stands.

The review is right that "use database time" is not a specification. Today the worker releases a
cooldown and readies a decision purely because the job is `pending`/`scheduled`
(`follow-up-worker.service.ts:39–69`), without checking the item's own deadline, the decision's
current deadline, or whether the job has been superseded — so a stale, rescheduled or delayed job
can release early.

**Required invariant — every expiry write path uses the same shape**, evaluated under the row lock
with `clock_timestamp()` (never `NOW()`, the transaction-start clock):

| Path | Predicate (all inside the transaction, after the row lock) |
| --- | --- |
| Follow-up job claim | `FollowUpJob.id = :id AND status IN ('pending','scheduled') AND dueAt <= clock_timestamp()` |
| Cooldown release | the claim above **and** `CooldownItem.status='active'` **and** `CooldownItem.releaseAt <= clock_timestamp()` **and** `CooldownItem.id` is still the decision's **current** cooldown (the job's `payload.cooldownId` equals the decision's current cooldown id) |
| Decision ready | `DecisionRecord.status='cooling'` **and** `cooldownUntil <= clock_timestamp()` **and** the current cooldown is released/superseded, as one conditional update with an affected-row check |
| Delivery stamp | the claim above, in the same transaction as the notification write (A6) |

A **superseded** job — one whose `payload.cooldownId` no longer matches the decision's current
cooldown, or whose decision was re-cooled after the job was scheduled — is closed as
`superseded`, not released: it must not move any decision or cooldown forward. Re-cooling a
decision cancels the outstanding job in the same transaction as the new cooldown, so the
superseded case is the *crash-recovery* path, not the normal one.

Each predicate gets a mutation: removing the item-deadline term, the current-cooldown term, or the
`status` term must fail its named test.

### A3 — Graduation is idempotent, and the snapshot follows a real transition *(P0-3)*

> **Superseded in scope by §0.6/A3.** "At most one snapshot per journey" is not achievable without forbidding reopen, and the reopen path exists. The invariant is per **graduation transition**.

`graduateJourney` locks the journey and then rewrites `completed`/`completedAt` regardless of the
prior state (`batch1-persistence.service.ts:2075–2093`), and the caller appends a derived
`RecoverySnapshot` on every call (`store.service.ts:4002–4017`). Two sequential requests therefore
produce two "graduation" snapshots, and `RecoverySnapshot` has no source key or unique constraint
to tell a repeat graduation from a legitimate user check-in (`schema.prisma:728–739`).

**Required.** Graduation is allowed only from the non-terminal states; the Journey transition is a
conditional update with an affected-row check, and the derived snapshot is appended **only when
that update affected a row**. A repeat or concurrent graduation returns the already-completed
journey and appends nothing. The invariant to test is "at most one graduation-derived snapshot per
journey", proven by a duplicate request and by two concurrent ones from separate instances, not by
"the insert failed and we rolled back".

If a database-level guarantee is required rather than a transaction-level one, that needs a source
marker and a constrained unique index — i.e. a new migration. It is **not** required for the
transaction-level invariant above, and no migration is proposed on this basis.

### A4 — Per-path lock table and the FK writer matrix *(P0-4)*

> **Extended by §0.6/A4**, which adds the two writers missing here (the admin `defaultVisibility` fan-out and the id-scoped fixture cleanup) and states that the matrix is read per column.

§2's single sentence and §3's summary are not the per-path proof Batch 2 required. The table below
is normative; the implementation must match it, and a path that locks a child before a root is a
defect. `User` and `LifeJourney` are always taken in sorted id order, before any child row.

| Path | Roots locked first | Then | Write predicate |
| --- | --- | --- | --- |
| Privacy preference change | `User(owner)` | `PrivacySetting` | owner-scoped patch of the changed fields only; **never** a whole-row write from a possibly-partial snapshot |
| Memory save / update / delete | `User(owner)` → `LifeJourney` if supplied | `MemoryItem` | create/update owner-scoped; delete is a conditional soft delete; privacy read **inside** the transaction |
| Decision create / edit | `User(owner)` → `LifeJourney` if supplied | `DecisionRecord` | create validated; edit owner-scoped, no status change |
| Decision deadline transition | `User(owner)` | `DecisionRecord` | CAS on `status` + `clock_timestamp()` deadline (A2) |
| Cooldown create | `User(owner)` → `LifeJourney` if the decision carries one | `DecisionRecord` → `CooldownItem` → existing `FollowUpJob` | one transaction; Redis enqueue **after** commit |
| Cooldown release / decision ready | `User(owner)` | `DecisionRecord` → `CooldownItem` → `FollowUpJob` | the A2 predicates |
| Reality handoff create / share | `User(owner)` → `LifeJourney` if supplied | `RealityHandoff` | create validated |
| Trusted contact create | `User(owner)` | `TrustedContact` | create validated; no FK edit or detach exists |
| Future message create | `User(owner)` → `LifeJourney` if supplied | `MessageToFutureSelf` → new `FollowUpJob` | one transaction; enqueue after commit |
| Future message deliver | `User(owner)` | `MessageToFutureSelf` → `FollowUpJob` → `UserNotification` | the A2 claim, notification in the **same** transaction (A6) |
| Support-plan save | `User(owner)` → `LifeJourney` if supplied | `PersonalSupportPlan` | serialize absent-row create on the `User` root; update omits an unsupplied `journeyId` |
| Stable-self save | `User(owner)` | `StableSelfProfile` | unique-per-user upsert / CAS |
| Recovery check-in | `User(owner)` → `LifeJourney` | `RecoverySnapshot` | append only; no Journey patch |
| Graduation | `User(owner)` → `LifeJourney` | `RecoverySnapshot` | A3: conditional Journey transition, snapshot only on a real transition |
| Journey archive delete | `User` → `LifeJourney` (Batch 1's existing order) | Self rows | detach surviving Self Journey FKs; no collection sweep |

**Correction to §3.1.** That paragraph called `CooldownItem` and `StableSelfProfile` exceptions to
the `User` FK. They are not: both carry a `User` FK (`schema.prisma:613–700`), and both appear in
the lock table above. What is true is narrower — they have no nullable *Journey* FK, and
`StableSelfProfile` is unique per user.

**FK writer matrix.** For every Self FK column, each writer is classified as **omit** (the column
is absent from the update, so a committed value survives), **detach** (`null`, only where an
authorised operation removes the association), or **supply** (a value validated for existence and
ownership inside the transaction). `fkUpdate`'s behaviour is not a proof for the direct path.

| Column | Writers | Omit | Detach | Supply |
| --- | --- | --- | --- | --- |
| `PrivacySetting.userId` | legacy per-user upsert; direct create; direct patch | patch (never re-assigns) | — | create, against a verified `User` |
| `DecisionRecord.userId` | legacy upsert; create; edit; worker | edit, worker | — | create |
| `DecisionRecord.journeyId` | legacy upsert; create; edit; archive detach | edit, worker | archive (Journey deleted) | create |
| `CooldownItem.userId` | legacy upsert; create; release | release | — | create |
| `CooldownItem.decisionId` | legacy upsert; create; decision deletion (`SetNull`) | release | only on an authorised decision deletion | create, validated against the decision **and** the same owner |
| `RealityHandoff.userId` / `journeyId` | legacy upsert; create; share; archive detach | share (both) | archive (Journey only) | create |
| `TrustedContact.userId` | legacy upsert; create | — | — | create |
| `MessageToFutureSelf.userId` / `journeyId` | legacy upsert; create; deliver; archive detach | deliver (both) | archive (Journey only) | create |
| `PersonalSupportPlan.userId` / `journeyId` | legacy upsert; create; update-active; archive detach | update (an unsupplied `journeyId` must not erase the current value) | archive (Journey only) | create, update |
| `StableSelfProfile.userId` | legacy upsert; owner upsert | update | — | create |
| `MemoryItem.userId` / `journeyId` | legacy upsert; create; content/status/expiry update; soft delete; archive detach | update, soft delete | archive (Journey only) | create |
| `RecoverySnapshot.userId` / `journeyId` | legacy upsert; check-in; graduation; archive detach | — (rows are append-only; history is never rewritten) | archive (Journey only) | create |

`MessageToFutureSelf.contextRefId` is a **plain string, not an FK** (`schema.prisma:665–670`). It
still needs its own rule: validate the referenced type/owner at create, and define what it means
after the referenced row is deleted. It is not covered by the FK matrix.

### A5 — Memory: the contract, not just the mechanism *(P1-5)*

> **Extended by §0.6/A5**, which separates re-enable from re-consent by **effective** state so a `disabled` row past its date cannot become a nominal `active`.

The technical fixes in S2 stand. What was missing is the contract, and it must be written before
implementation because the UI does not support it today:

- **Allowed operations per state.** `active`: read, use in AI, edit, extend, disable, delete.
  `disabled`: read, re-enable, delete. `expired`: read, **delete**, and re-activate only through
  the explicit re-consent action; **not** editable and **not** usable in AI. `deleted`: nothing —
  terminal, irreversible, and excluded even if status, dates or consent change later.
- **Effective expiry while `status='active'`.** The row is not rewritten by a clock; eligibility is
  decided by the query predicate `status='active' AND "deletedAt" IS NULL AND "expiresAt" >
  clock_timestamp()`. A later extension therefore cannot revive it, because the extension is
  refused for a row whose effective state is expired (it must first go through re-consent).
- **Re-consent.** A dedicated owner-scoped action that sets `status='active'`, a fresh
  `consentedAt`, and a **future** `expiresAt` in one conditional update; it is the only path from
  `expired` to `active`, and it is what the plan's "explicit new consent" means. `consentedAt` is
  the audit of that act and is never carried over from the previous activation.
- **Delete is terminal.** `status='deleted'` **plus** `deletedAt`; no update path may move a row out
  of `deleted`.
- **Required UI change, named here rather than smuggled in:** `MemoryCenter.vue` shows "恢复使用"
  only for `disabled` and still allows editing an expired row (`MemoryCenter.vue:101–115,307–330`).
  It must gain the re-consent action for `expired` and lose the edit affordance. That is part of
  Batch 3 because the design cannot promise a flow the page does not have.
- **AI linearization.** Eligibility is checked in one owner-scoped query immediately before prompt
  dispatch, and the design must state which point the check linearizes at: revocation commits
  either before the query (the memory is excluded) or after dispatch (the in-flight request is
  allowed to complete and the revocation applies to the next one). It must not claim both.

### A6 — FutureSelf delivery: the notification is part of the claim *(P1-6)*

The review is right that "delivered with a missing notification" cannot distinguish *consent was
off* from *the notification write failed*, and that the worker currently reads the consent flag
from the untrusted queue payload before claiming the job (`follow-up-worker.service.ts:34–37`).

**Resolution: remove the ambiguity instead of recording it.**

- The consent flag is read from the **database** inside the claim transaction, not from the payload.
- When consent is on, the `UserNotification` row is written **in the same transaction as the
  claim**. A crash after the claim therefore cannot produce "delivered without a notification": the
  two either both commit or neither does.
- When consent is off, the delivery deliberately writes no notification. "Delivered with no
  notification row" then means exactly one thing — consent was off at the decision point — and no
  reconciler may invent one.
- A later opt-in does not retroactively notify an already-delivered letter (S5, unchanged).
- **What "delivered" means to the user is a product statement that must be made explicitly**:
  either the list state changes, or an in-app reminder appears, or it is only a background
  timestamp. `FutureSelf.vue:81–88,95–105,129–135` currently shows the letter's content before its
  due date and says it will arrive "通过提醒送达", which does not match a silent delivery with
  notifications off. The page copy and the reveal rule are corrected as part of Batch 3.

### A7 — Admin disclosure: an audited read means audit-first *(P1-7)*

S4's direction is right; the review is right that it is a new access policy rather than an existing
capability, and that `store.audit()` writes only to an in-memory array which a later legacy flush
persists (`store.service.ts:2718–2739`).

**Required.**
- **List and search** may match and return only: id, owner id, status, timestamps, counts, and
  non-sensitive labels. **No plan JSON, no memory content, no full-text matching over private
  text.** Today the admin support-plan list searches `JSON.stringify(plan)` and the memory list
  returns `content` (`controllers.ts:2482–2515`); both are removed.
- **Single-record full content** is a separate owner-scoped-by-role read with its own route. It
  **persists the `AuditLog` row first and returns the content only if that write committed**; the
  audit row records who, which record, and why, and **never** contains the private text itself.
  Returning content whose audit failed is not an audited read.
- The admin UI stops expanding `plan`/`content` from list rows (`apps/admin/src/views/TablePage.vue:880–897`)
  and calls the single-record route instead.
- Negative tests: a list/search response contains no private text for any query string; a
  single-record read without a committed audit row returns no content; another owner's record is
  refused.

### A8 — Route-level identity and consent, before any read conversion *(P1-8)*

Several Self routes do not accept a caller identity at all and fall back to the demo user
(`controllers.ts:665–742,779–795`; `store.service.ts:5453–5455,5551–5555,5658–5666`). Converting
those reads to owner-scoped SQL does not fix the entry contract, and the migration would look
complete while the route stayed wrong.

**Required.** A per-route matrix naming, for every Self route: the identity it accepts, the
ownership check, the consent gate it must pass, and the negative test. A route that cannot accept
an identity must be corrected or explicitly recorded as single-user-by-design; "the demo user
happens to be the caller" is not a gate.

**And one degradation defect to fix with it:** `FutureSelf.vue:91–109` loads the letter list and the
optional recovery context in one `Promise.all`, so turning off `allowRecoveryData` makes the whole
page show an error even though the letters are independently readable. The optional context must
degrade on its own; a database-authoritative read does not change that.

### A9 — What this batch does not claim, restated

`DECISION_STATE_PASS` covers the states that exist plus `outcome` as an optional state (A1), **not**
a mandatory six-state walk. `MEMORY_STATE_PASS` covers the A5 contract including the required UI
change. No new migration is proposed by this batch: A2's predicates, A3's transaction-level
idempotency, A5's `deleted` spelling and A6's same-transaction notification all fit the existing
columns. A migration becomes necessary only if A3 is escalated to a database-enforced uniqueness,
which is not proposed.

---

## 0.6 Third pass — the verification of §0.5, and what it still found

A verification of the §0.5 revision returned `REQUEST_CHANGES` again. It confirmed A6, A7 and A8
resolved, and found that A1, A3, A4 and A5 were only partly closed and that A2 — the cooldown
identity — was **not** implementable as written. This section resolves all of it and, where §2
still carried the old instruction, §2 is rewritten rather than overridden.

### A2 (reopened, P0) — "the decision's current cooldown" had no representation

> **Extended by §0.7/F1** (bind the release to one owner and one decision, not just an id) and **§0.7/F2** (normalise pre-existing duplicates; the invariant holds only after the legacy writer exits).

The review is right: `DecisionRecord` has `cooldownUntil` but **no `cooldownId`**, and
`CooldownItem` only carries the reverse `decisionId` (`schema.prisma:587–625,774–787`). "The job's
`payload.cooldownId` equals the decision's current cooldown id" therefore had nothing to compare
against. Two things follow.

**1. Current cooldown becomes a defined state, not a lookup.** Creating a cooldown for a decision,
inside the transaction that already locks the decision row, first closes whatever is current:

```
lock User(owner) -> LifeJourney if any -> DecisionRecord -> its active CooldownItem -> its outstanding FollowUpJob
CooldownItem(active, this decision)  -> status='superseded'
FollowUpJob(pending|scheduled, payload.cooldownId = that cooldown) -> status='superseded'
insert the new CooldownItem(status='active', releaseAt) + FollowUpJob(kind='DECISION_COOLDOWN', payload={decisionId, cooldownId})
```

"Current cooldown for a decision" is then exactly **the row with `status='active'` for that
decision**, unique by construction because this transaction serializes on the decision row. No new
column and no new migration: `FollowUpJob.status` and `CooldownItem.status` are both `String`
(`schema.prisma:774–787`, and `CooldownItem.status` likewise), and nothing treats an unknown status
as actionable — the only status reads are the claim's `IN ('pending','scheduled')`
(`follow-up-worker.service.ts:45`) and the check-in path's `'pending'`
(`batch1-persistence.service.ts:2720`).

**2. The stale item is closed, not orphaned.** This closes the review's new P0: a superseded job
must not leave an `active` cooldown behind. `superseded` is terminal for a `CooldownItem`; the list
shows it as superseded history; it can never become current again.

**3. The predicates, restated so they are decidable** (all under the row lock, all with
`clock_timestamp()` — never `NOW()`, the transaction-start clock):

| Path | Predicate |
| --- | --- |
| Follow-up job claim | `id=:id AND status IN ('pending','scheduled') AND dueAt <= clock_timestamp()` |
| Cooldown release | the claim, **and** `CooldownItem.id = payload.cooldownId`, **and** `CooldownItem.status='active'`, **and** `CooldownItem.releaseAt <= clock_timestamp()` |
| Job whose cooldown is no longer active | close the job as `superseded` and touch **nothing** else — this is the crash-recovery path, and it must not move a decision or a cooldown forward |
| Decision ready | `DecisionRecord.status='cooling'` **and** `cooldownUntil <= clock_timestamp()` **and** the decision has no `active` cooldown (the current one is `released` or `superseded`), as one conditional update with an affected-row check |
| Delivery stamp | the claim, in the same transaction as the notification write (A6) |

`kind` distinguishes the two job families (`action_checkin` vs the decision/cooldown family), so a
cooldown job is never matched by the check-in path and vice versa. A `CooldownItem` whose
`decisionId` was cleared by an authorised decision deletion is closed as `superseded` rather than
released, since there is no decision left to move.

### A3 (reopened, P0) — the promise is per transition, and the reopen path exists

> **Superseded by §0.7/F3.** The reopen path is an **API defect**, not a legitimate second
> transition: the product's own archive sheet says a completed journey cannot be restored. The
> endpoint is corrected to refuse it, which restores the per-journey invariant below.

The review found that `updateJourneyStatus` accepts `'active' | 'paused' | 'archived'`
(`batch1-persistence.service.ts:2044–2071`) and does **not** exclude a `completed` journey, so a
completed journey can be reopened and graduated a second time. "At most one snapshot per journey"
is therefore not achievable without forbidding reopen — a product decision this batch does not take.

**Restated invariant: at most one graduation-derived `RecoverySnapshot` per graduation
transition.** The Journey transition becomes conditional (from a non-terminal status to
`completed`) with an affected-row check, and the snapshot is appended **only when that update
affected a row**. A duplicate request and two concurrent graduations from separate instances
therefore produce exactly one snapshot. A deliberate reopen followed by a second graduation
legitimately appends a second snapshot, and a test asserts that explicitly, so the behaviour is
documented rather than accidental.

A stricter once-per-journey rule would need a graduation source marker and a constrained unique
index — a new migration — and it would also require deciding whether reopening is allowed at all.
**Neither is proposed here**; if the product wants once-per-journey, it is a product decision plus a
migration, raised rather than assumed.

### A1 (reopened, P1) — the `outcome` path, and why nothing gets stuck

The page's status type and action area do not know `outcome` (`DecisionVault.vue:7,240–252`). So:

- The `outcome` state is reachable **only** by an explicit `status:'outcome'` request carrying a
  non-empty outcome text. The current UI never sends it, so nothing changes for existing users.
- The archive transition accepts **both** `decided` and `outcome` as source states. A caller that
  enters `outcome` can always archive, so no request can reach a state with no exit. That is the
  answer to "can a caller get stuck": it cannot, because `outcome → archived` is accepted by the
  same endpoint that performs `decided → archived`.
- The UI is **not** changed to expose `outcome` in this batch; exposing it would be a product
  decision about whether an outcome is a separate step. Recorded as open, per A1.

### A4 (reopened, P1) — two missing writers, and per-field classification

> **Extended by §0.7/F6**, which adds the boot privacy-default repair and re-expresses "cleanup by id" as explicit SQL id sets.

The review found two writers absent from the lock table:

| Path | Roots locked first | Then | Notes |
| --- | --- | --- | --- |
| Admin `defaultVisibility` fan-out | every affected `User`, **sorted**, in batches | `PrivacySetting` | today it rewrites every in-memory privacy row (`controllers.ts:3461–3472`); after registration it becomes an explicit multi-user update. A bulk write over all owners is a cross-boundary admin operation and is reviewed as one, not as an ordinary owner patch. |
| Fixture / test cleanup by id | none (no FK column is written) | the named rows only | today it filters the in-memory collections by id and journey (`store.service.ts:3243–3266`); after registration it becomes an explicit id-scoped delete. It must never be a collection sweep, and it must not delete a row it did not name. |

The FK matrix is also read as **per column**, not per row: every column listed there is an
independent obligation. The two corrections the review asked for are already in the table —
`CooldownItem.userId`/`decisionId` and `StableSelfProfile.userId` each carry their own omit /
detach / supply classification.

**The "no migration" claim, restated honestly.** A2 and A3 need no migration **because** current
identity is defined as a status plus a serializing transaction (A2) and the invariant is
per-transition (A3). Neither claim rests on a column that does not exist. If either is later
escalated to a database-enforced rule, that escalation brings a migration with it.

### A5 (reopened, P1) — a `disabled` row past its date must not become a nominal `active`

`MemoryCenter.vue:272–279,307–345` offers "恢复使用" for `disabled` and allows editing an expired
row. If that action simply sets `status='active'`, a row whose `expiresAt` has already passed
becomes active-but-ineffective — a state that looks restored and is not.

**Required:** the re-enable path and the re-consent path are distinct, and the distinction is by
**effective** state, not by the stored status:

- stored `disabled`, and `expiresAt` is still in the future → "恢复使用" re-enables in place.
- stored `disabled` **or** `expired`, and `expiresAt` has passed → "恢复使用" is **refused**; the
  only way back is the explicit re-consent action, which sets a fresh `consentedAt` and a **future**
  `expiresAt` in one conditional update.

### §2 rewritten where it contradicted §0.5

Two normative paragraphs in §2 still carried the superseded instruction. They are corrected in
place, not merely overridden:

- the transaction table's Decision row no longer reads `decided → outcome → archived` as a required
  walk (A1);
- the failure-semantics paragraph no longer calls a delivered-but-unnotified message "a retryable
  notification obligation" — with A6 the notification is in the claim transaction, so the case
  cannot arise from a crash, and when consent was off the absence of a row is the intended state
  that no reconciler may fill in.

---


---

## 0.7 Fourth pass — the verification of §0.6, and what it still found

A verification of §0.6 confirmed A1 and A5 resolved and found A2, A3 and A4 still partly closed,
plus four new findings. All are resolved here. The most important one is not a persistence detail
at all: the product already states the rule that A3 was missing.

### F1 — The cooldown release must be bound to one owner **and** one decision *(P1)*

§0.6 checked `CooldownItem.id = payload.cooldownId` but not that the item belongs to the decision
the job names, nor that both belong to the job's owner. A malformed or stale payload could
therefore release one decision's cooldown while readying another. The current code already updates
the two independently (`follow-up-worker.service.ts:57–67`), so nothing prevents it today.

**Required — every cooldown job handler checks the whole association before either write**, inside
the transaction that locks `User(owner)`:

```
FollowUpJob.userId            = CooldownItem.userId
FollowUpJob.payload.decisionId = CooldownItem.decisionId
FollowUpJob.payload.cooldownId = CooldownItem.id
CooldownItem.status = 'active'  AND  CooldownItem.releaseAt <= clock_timestamp()
DecisionRecord.id = payload.decisionId  AND  DecisionRecord.userId = the same owner
```

If any term fails, the job closes as `superseded` and **nothing else is written**.

> **Corrected by §0.9/H2.** The sentence that stood here said a `NULL`-decision cooldown "was
> deleted" and always closes as `superseded`. That is only one of two cases, and the two have
> opposite outcomes. See §0.9/H2 for the durable distinction.

### F2 — "Unique by construction" is only true after the cutover, and pre-existing duplicates must be normalised *(P1)*

The schema has no unique-active constraint on `CooldownItem`, today's creation path permits
repeated `active` rows (`store.service.ts:5551–5586`), and while `CooldownItem` is still
legacy-owned the mapper can persist a status from its array (`relational-runtime.mapper.ts:1788–1810`).
So the invariant is **conditional on the cutover**, not free.

**Required.**
- A **one-time normalisation** in the same transaction that first applies the new rule: for each
  decision with more than one `active` cooldown, keep the latest by `createdAt` (tie-break id) and
  mark the rest `superseded`, closing their outstanding jobs. The normalisation is idempotent and
  is asserted by a test that seeds duplicates and observes exactly one survivor.
- The invariant is claimed **only after** the legacy writer has exited for `CooldownItem`, which is
  the `SELF_FULL_FLUSH=false` gate: zero legacy INSERT/UPDATE/DELETE on the ten tables under a
  forced flush. Until that gate holds, "exactly one active cooldown" is a target, not a fact.

### F3 — The completed-journey reopen is an API defect, and the product already says so *(P1)*

§0.6 treated `completed → active` as a legitimate reopen and therefore restated the graduation
invariant as per-transition. The verification found the product's own copy: the archive sheet tells
the user **"已完成的 Journey 保留为完整历史，不能恢复为进行中。"** and offers the restore button only
for `archived` (`apps/mp/src/views/Archive.vue:283–286`). The general status endpoint accepting
`completed → active` (`batch1-persistence.service.ts:2044–2071`) contradicts what the product
promises the user.

**Resolution: align the API with the product rule rather than redesigning around it.**
- `updateJourneyStatus` refuses `completed → active` (and any transition out of `completed`), with a
  test asserting the refusal and the unchanged row. This is a defect fix against the product's own
  stated rule, not a new product decision.
- Graduation is then one-way in practice, so **the original invariant stands: at most one
  graduation-derived `RecoverySnapshot` per journey.** The mechanism is still the conditional
  Journey update with an affected-row check (§0.6/A3), and the invariant no longer needs the
  reopen-and-regraduate case to be blessed as a second transition.
- No migration: the uniqueness is enforced by the transition being one-way, not by an index.
- If the product later decides completed journeys may reopen, that decision reopens A3 with it, and
  the once-per-journey claim must then be re-derived. Recorded, not assumed.

### F4 — The cooldown job kind is `DECISION_COOLDOWN` *(P2)*

§0.6 wrote `decision_cooldown`; the canonical value in the code is **`DECISION_COOLDOWN`**
(`store.service.ts:5578`), and the check-in family is `action_checkin`
(`batch1-persistence.service.ts:2721`). The design uses the existing canonical value, and the
worker validates that a job's `kind` matches the handler it is running rather than dispatching on a
payload field.

### F5 — Supersession must survive the legacy `FollowUpJob` writer *(P2)*

`FollowUpJob` stays outside the registry (§0.4/S1), so its legacy mapper keeps writing it during the
cutover — and that mapper treats only `delivered` and `completed` as terminal
(`relational-runtime.mapper.ts:2024–2026,2053–2055,2084–2098`), which means a stale array can rewrite
a `superseded` row back to a live status. The claim predicates alone do not make that safe.

**Required:** `superseded` is added to the mapper's terminal set for `FollowUpJob` in the same
change that introduces it, and a test forces a legacy flush over a stale array containing a
pre-supersession snapshot and asserts the row stays `superseded`. Without this, §0.6's claim that
"nothing treats an unknown status as actionable" is true of the worker and false of the mapper.

### F6 — Two more writers, and what "cleanup by id" actually selects *(P1)*

§0.6/A4 listed the admin `defaultVisibility` fan-out and the fixture cleanup, but the cleanup is not
merely "the ids we were given": it also selects by `journeyId` and, in legacy mode, by fixture-text
match, and it removes associated follow-up jobs (`store.service.ts:3158–3199,3243–3269`). And a
third writer is named in §1 but was absent from the lock table: the **boot privacy-default repair**
(`store.service.ts:2872–2892`).

| Path | Roots locked first | Then | Notes |
| --- | --- | --- | --- |
| Boot privacy-default repair | the affected `User`s, sorted, in batches | `PrivacySetting` | it must not recreate a row for every user on every boot; after registration it repairs only rows it can show to be missing, and it never overrides an existing value |
| Fixture / test cleanup | none (no FK column is written) | only the rows it can name | the selection must be re-expressed in SQL as explicit id sets: the ids supplied by the caller, the ids reached through a named `journeyId`, and — for the legacy fixture-text mode — the ids the test itself created. A text-match sweep over a private table is not an acceptable post-migration mechanism; the mode is retired or narrowed to test-owned ids |

### F7 — §2 consistency, completed

Beyond the two paragraphs already rewritten, §2's cooldown-create row said "one existing
`FollowUpJob`" where the rule supersedes **every** outstanding job for that decision, and its worker
paragraph still required reconciling a delivered message's missing notification. Both are corrected
in place. A grep of the document for the superseded phrasings (`retryable`, `decided→outcome→archived`
as a required walk, `decision_cooldown`) returns nothing.

---

## 0.8 Fifth pass — the verification of §0.7, and what it still found

The verification of §0.7 found three blocking gaps and two overstated claims. All are resolved
here. Two of them are the same mistake twice: a rule that was fixed at one entry point while a
second entry point kept the old behaviour.

### G1 — `patchJourney` is a second reopen path, and F3 only fixed one of them *(P1)*

F3 named `updateJourneyStatus`. The verification found that `PATCH /journeys/:id` reaches
`patchJourney` (`controllers.ts:399–417`), which accepts `status: 'active'` and **does not look at
the current status at all** before writing (`batch1-persistence.service.ts:1668–1726`). Refusing the
transition in one entry point while the other still allows it proves nothing about the invariant.

**Required.** One shared terminal-state guard, used by **both** status entry points, refusing any
transition out of `completed` (and out of `archived` except the explicit restore path, which the
product does allow for `archived`). The guard lives in one place so a third entry point cannot be
added without it. The test matrix asserts the refusal through **each** route, not through one.

### G2 — The legacy `FollowUpJob` mapper overwrites a terminal DB row from a stale array *(P1)*

F5 added `superseded` to the mapper's terminal set. The verification showed that is not enough:
when the **array** says `delivered`/`completed`, the mapper updates the row **unconditionally** by
id (`relational-runtime.mapper.ts:2076–2086`), so a stale snapshot rewrites a DB `superseded` back
to `delivered`. The non-terminal branch is already guarded by `status: { notIn: [...] }`
(`:2087–2099`); the terminal branch is not.

**Required — the precedence rule, not just a longer list.** A DB row that is already in the terminal
set is **never** rewritten by the legacy flush, whichever branch would run:

- `superseded` joins `delivered` and `completed` in `TERMINAL_FOLLOW_UP_STATUSES`;
- the terminal branch gains the same `status: { notIn: TERMINAL_FOLLOW_UP_STATUSES }` guard the
  non-terminal branch already has, so a terminal row's status and completion are immutable to the
  legacy writer.

Tests: a stale array whose entry says `delivered` while the DB row is `superseded` leaves the row
`superseded`; and the same for `completed`. This is a change to a Batch 1 mapper path and is named
as a deviation in §5.

### G3 — An unlinked cooldown is created that way, not only left behind by a deletion *(P1)*

F1 described the `NULL`-decision cooldown as "its decision was deleted". The verification is right
that `createCooldown` accepts a cooldown with no decision in the first place
(`store.service.ts:5551–5582`). The rule is the same either way, but the framing was wrong.

**Corrected:** a cooldown may legitimately have no `decisionId` at creation. For such a cooldown the
association check reduces to `FollowUpJob.userId = CooldownItem.userId` and
`payload.cooldownId = CooldownItem.id`, the decision-side terms are vacuous, and the release writes
only the cooldown — never a decision. A cooldown that *lost* its decision to an authorised deletion
is closed as `superseded` instead, because the job it belongs to can no longer be validated against
a decision. **The two cases are told apart by the job's durable payload, and the rule is in
§0.9/H2**, which supersedes the "always `superseded`" wording this paragraph replaced.

### G4 — "Exactly one active cooldown" is wrong; it is **at most one** *(P2)*

A decision that has never been cooled, or whose cooldown has been released, has **zero** active
cooldowns. The invariant is "**at most one `active` `CooldownItem` per decision**", and the
normalisation in F2 is "keep the latest, supersede the rest", which yields one or zero. Corrected
everywhere the stronger phrasing appeared.

### G5 — The cleanup does not remove the job for every row it removes *(P2)*

F6 said the fixture cleanup "removes associated follow-up jobs". The verification is right that it
does not hold for every deleted cooldown or decision: it filters follow-up jobs by their own
criteria (`store.service.ts:3243–3269`), so a job belonging to a removed cooldown can survive.

**Corrected, and narrowed to what will be true after the change:** the cleanup must name, for every
row it deletes, the follow-up jobs it also deletes — by the same explicit id sets — and the design
asserts only that: *the rows the cleanup names are deleted, and no row it did not name is.* It does
not claim that removing a cooldown removes "its" job, because a job and a cooldown are separate
rows with separate id sets.

### G6 — §2's write set and §5's file boundary were incomplete *(P1)*

- §2's cooldown-create row now lists the **old** `CooldownItem`'s supersede and the **new**
  `FollowUpJob`'s insert, which the earlier wording omitted.
- §5's permitted-file list still described the Batch 1 changes as graduation + FK detach only. It
  now names all three: the graduation insert, the Self-FK detaches, **the shared terminal-state
  guard for journey status (G1)**, and **the `FollowUpJob` terminal-set and terminal-branch guard
  (G2)**.
- §5's "must not change production/development data" gains the one exception F2 requires: the
  idempotent historical-duplicate normalisation of `CooldownItem` active rows, which is a data
  change by definition and is therefore listed rather than implied.

---

## 0.9 Sixth pass — the verification of §0.8, and what it still found

The verification of §0.8 confirmed G2 resolved and found three blocking gaps: the terminal-transition
race, a contradiction this document introduced between §0.6/F1 and §0.8/G3, and a data-change
exception that forbids the very writes it needs. All three are resolved here.

### H1 — A read-time guard does not close the reopen; it must be a locked conditional write *(P0)*

G1's shared guard was described as a check. A check is not enough: `patchJourney` and
`updateJourneyStatus` both read the journey and then write it, and a graduation committing between
those two steps still turns a `completed` journey into `active` — the same read-then-write
disconnection Batch 2's P0-1 was about.

**Required — the guard is the write predicate, not a prior read:**

```
lock User(owner)  ->  lock LifeJourney(id)  ->  re-read status under the lock
transition out of a terminal status  =>  refuse
```

- both entry points use the same helper, which takes the two locks in the established order and
  performs a **conditional update** (`WHERE id = :id AND status NOT IN ('completed')`, with an
  affected-row check) rather than an unconditional write after a read;
- graduation performs its own conditional transition under the same `LifeJourney` lock, so the two
  serialize against each other instead of racing;
- the review's warning is recorded: a read-time guard would leave
  `completed → paused/archived` reachable when graduation commits in between.

The writers of `LifeJourney.status` in the product are `patchJourney`, `updateJourneyStatus`,
graduation, and the guarded legacy mapper; the explicit restore path already accepts only
`archived`. The two reopen routes are the ones that need the guard, and the mapper is already
conditional.

### H2 — The two unlinked-cooldown cases have opposite outcomes, and the payload tells them apart *(P0)*

§0.6/F1 said a `NULL`-decision cooldown closes as `superseded`; §0.8/G3 said it releases. Both
cannot be true, and the review is right that the difference must be durable and decidable.

**The distinction is the job's payload, which is written at creation and never rewritten:**

| Case | `CooldownItem.decisionId` | `FollowUpJob.payload.decisionId` | Outcome |
| --- | --- | --- | --- |
| **Created unlinked** — a standalone cooldown with no decision | `NULL` at creation | absent or `NULL` | **releases** the cooldown; the decision-side terms are vacuous and no decision is written |
| **Lost its decision** — an authorised decision deletion cleared the FK | `NULL` now | **a non-null decision id** | **closes as `superseded`** and releases nothing: the association existed and can no longer be validated |
| **Linked and intact** | non-null | the same id | the full association check in §0.7/F1 applies; release on the deadline |

The payload is the durable evidence because it is written in the same transaction that creates the
cooldown and is never updated afterwards. Reading the *current* `decisionId` alone cannot
distinguish the cases — which is exactly why the earlier wording was wrong. Both cases are named
in the test matrix (§4).

### H3 — The data-change exception must cover the rows the normalisation actually writes *(P0)*

F2's normalisation supersedes duplicate `active` `CooldownItem` rows **and closes their outstanding
`FollowUpJob` rows**. The §5 exception said "confined to that one table", which forbids half of what
the normalisation must do. **Corrected:** the exception covers `CooldownItem` rows and the
`FollowUpJob` rows belonging to the superseded cooldowns, and nothing else. It remains a single,
idempotent, re-runnable normalisation, and it is still the only exception to "must not change
production/development data" in this batch.

### H4 — The three tests the earlier passes promised are now named *(P1)*

§4's matrix gains: a cooldown **created unlinked** whose job releases it; a cooldown whose decision
was **deleted** whose job closes as `superseded`; and the reopen refusal asserted through
**`PATCH /journeys/:id`** as well as the status endpoint. Without the first two the H2 distinction
is untested, and without the third G1's "both entry points" claim is untested.

### H5 — §5's mapper deviation described half the change *(P2)*

The deviation paragraph said only that the terminal *set* grows. It now also names the **terminal
branch's DB-status guard** (§0.8/G2), which is the half that actually stops a stale array from
rewriting a `superseded` row.

---

## 0. Scope and present state

### 0.1 What is wrong today

Every proposed Self array still hydrates from PostgreSQL and is mapped back into `StoreData`; `PrivacySetting` is loaded through `User` (`relational-runtime.mapper.ts:77,113–121,157–174,573–676`). A legacy flush still writes privacy and all nine Self tables and absence-sweeps the nine collections (`:1034–1072,1757–1967,2466–2500`). `deleteAbsent` with an empty list issues an unrestricted `deleteMany({})` (`:786–788`).

**A new failure mode this batch must handle, which Batches 1 and 2 did not face:** `PrivacySetting` has **no** absence sweep, but its per-user upsert is `state.privacySettings?.[id] ?? {}` (`:1034–1070`) — so **an omitted privacy entry is a destructive write**. A stale snapshot missing `allowAiMemoryUse` writes `false` on the next flush, silently revoking (or, for a default-true field, silently granting) consent. Privacy must therefore never be reset from a missing map entry, and its upsert is the third-exit equivalent.

Neither Batch 1's nor Batch 2's acceptance transfers to Self: both are explicitly limited to their own models and tested flows (`BATCH1_FINAL_GATE.md:3,27–29`; `CONTINUOUS_RUN_LOG.md:52–70`).

---

## 1. Per-model authority, writers, reads, retention

PostgreSQL is authoritative for a model after its complete triple exit. Each operation checks the current owner in the database; a client-supplied user identifier is not proof of ownership (`store.service.ts:2681–2691`).

| Model | Writers → target | Readers to convert | Deletion / expiry |
| --- | --- | --- | --- |
| `PrivacySetting` | controller PUT/PATCH + aliases (`controllers.ts:1759–1804`); admin `defaultVisibility` fan-out (`:3428–3463`); boot default repair (`store.service.ts:2872–2891`); per-user mapper upsert (`mapper:1034–1072`) → owner-scoped direct patch; admin fan-out separately reviewed | settings aliases, admin user detail (`controllers.ts:1743–1757,2556–2558`); privacy gates throughout `store.service.ts` incl. `:2962–2964,4007–4015,4237,4287,4833,5323,5639,5675,5681,5725,5750,5834–5845,7446`; monthly gates (`monthly-report.service.ts:166–187,388–393,536`); worker (`follow-up-worker.service.ts:34–36`) | **no sweep, but stop the per-user legacy upsert**. Missing DB row ⇒ conservative **deny** for optional consent, never seed-derived approval |
| `MemoryItem` | `saveMemory`/`updateMemory`/`deleteMemory` (`store.service.ts:5737–5832`); archive/test (`:3261,3548`; `batch1-persistence.service.ts:2134,2221`); mapper (`:1917–1949`) → narrow direct transitions | user/usage endpoints (`controllers.ts:859–881`), AI prompt (`store.service.ts:5834–5845,6564–6575`), admin list (`controllers.ts:2483–2501`) | soft delete, never resurrect `deletedAt`; effective expiry on DB time; no sweep |
| `DecisionRecord` | create/update + list-time auto-transition (`store.service.ts:5348–5444`); `createCooldown` (`:5446–5483`); worker (`follow-up-worker.service.ts:63–67`); archive/test (`store.service.ts:3243–3248,3459–3461,3544`); mapper (`:1757–1787`) → direct transitions incl. the new `outcome` state | decision list, cooldown creation, FutureSelf context (`store.service.ts:5429–5453,5584–5590`); journey archive (`:3459–3461`); monthly (`monthly-report.service.ts:233–235,358–360`) | preserve decided/outcome/archived history; detach Journey on deletion; deadline ≠ delete |
| `CooldownItem` | `createCooldown` (`store.service.ts:5446–5483`), worker release (`follow-up-worker.service.ts:57–61`), fixture cleanup (`store.service.ts:3249–3253`), mapper (`:1788–1811`) → direct insert/release | user list (`store.service.ts:5486–5491`; `controllers.ts:691–699`), decision association (`store.service.ts:5446–5479,3264–3269`) | retain released history; release guarded by DB deadline, not a local-clock DTO |
| `RealityHandoff` | create/share (`store.service.ts:5493–5521`), archive/test (`:3254–3258,3545`), mapper (`:1812–1836`) → direct | owner list (`store.service.ts:5523–5531`; `controllers.ts:701–713`), archive/fixture counts (`store.service.ts:3214–3221,3296–3305`) | retain + detach Journey; explicit fixture deletion only |
| `TrustedContact` | create (`store.service.ts:5533–5546`), mapper (`:1837–1857`) → direct | enabled owner list (`store.service.ts:5549–5551`; `controllers.ts:716–723`) | preserve history; no disable endpoint exists today; do not infer removal from list omission |
| `MessageToFutureSelf` | create + `FollowUpJob` (`store.service.ts:5553–5625`), worker delivered stamp (`follow-up-worker.service.ts:50–55`), archive/test (`store.service.ts:3259,3546`), mapper (`:1858–1883`) → direct create/deliver | owner list + decision/recovery context (`store.service.ts:5584–5597,5628–5632`; `controllers.ts:726–743`); worker context (`follow-up-worker.service.ts:39–55,110–125`) | retain delivered message; `deliveredAt` monotonic; Journey detach does not cancel the schedule; `contextRefId` is a **string, not an FK** (`schema.prisma:665–670`) |
| `PersonalSupportPlan` | create/update-active (`store.service.ts:5634–5665`), archive/test (`:3260,3547`), mapper (`:1884–1904`) → direct | owner current plan (`store.service.ts:5668–5671`; `controllers.ts:745–764`), admin list/dashboard (`controllers.ts:2019,2467–2481`) | retain inactive plans; detach Journey. If one-active-per-user is intended, a parent `User` lock must serialize absent-row create (the schema has only a non-unique index, `schema.prisma:676–689`) |
| `StableSelfProfile` | owner upsert (`store.service.ts:5679–5720`), mapper (`:1905–1916`) → direct unique-user upsert/CAS | owner read (`store.service.ts:5673–5676`; `controllers.ts:766–777`) | retain; no sweep; `userId` uniqueness exists (`schema.prisma:691–700`) |
| `RecoverySnapshot` | owner check-in (`store.service.ts:5316–5346`); graduation-derived append (`:4002–4017`); archive/test (`:3262,3421,3549`); mapper (`:1950–1967`) → append-only direct inserts | recovery + Journey detail/archive (`store.service.ts:3408–3423,3473–3482,5723–5726`; `controllers.ts:779–795`), FutureSelf context (`store.service.ts:5591–5597`), monthly (`monthly-report.service.ts:166–202,249–284,344–360`), dashboard (`controllers.ts:2030`) | historical rows survive Journey deletion with null `journeyId`; no sweep; **no recomputation, no inferred medical label** |

**Recovery scoring finding.** Owner check-in normalises signals to `yes|partial|no` and graduation records a completed-action count (`store.service.ts:5327–5340,4002–4015`). Monthly reporting derives descriptive counts and a `returning|adjusting|steady|unrecorded` life-function label (`monthly-report.service.ts:244–283`). **No emotion-score or medical-diagnosis writer was found in these paths** — a scoped code finding, not a claim about all AI output. Migration must copy `summary`, `signals` and timestamps faithfully and must not generate a score, diagnosis or new "recovery level".

---

## 2. The twelve decisions

**Source of truth.** One PostgreSQL authority per registered model; a response comes from its committed row or a fresh owner-scoped query. An in-memory DTO cannot decide existence, consent, delivery, FK validity or deletion.

**Repository boundaries.** One Self persistence service exposing business operations and bounded projections — not `saveSelfState`. Validation and HTTP shapes stay at the route/service boundary; ownership, current privacy, lock order and transition predicates are enforced at the transactional boundary. Extend the zero-dependency registry for the approved ten models only. Batch 1's targeted Journey-deletion detaches remain legitimate cross-boundary operations (`batch1-persistence.service.ts:2108–2138,2181–2225`).

**Transaction boundaries** — the write set is **per operation**:

| Operation | Permitted writes in one local transaction |
| --- | --- |
| Privacy preference change | one owner's `PrivacySetting` changed fields only |
| Memory save/update/delete | one `MemoryItem`; save/update reads current privacy **in** the transaction; delete is a conditional soft delete |
| Decision create/edit/transition | one `DecisionRecord`; `cooling→ready` is a DB-clock-guarded transition, and archive is accepted from **both** `decided` and `outcome` (see §0.5/A1 and §0.6/A1 — `outcome` is optional, not a required step) |
| Cooldown create | the **previous** `active` `CooldownItem` for that decision (superseded), its outstanding `FollowUpJob`(s) (superseded), the owning `DecisionRecord`'s state, the **new** `CooldownItem`, and the **new** `FollowUpJob` — all in one transaction (§0.7/F1, §0.8/G6); schedule Redis **after** commit |
| Reality handoff create/share | one `RealityHandoff` |
| Trusted contact create | one `TrustedContact` |
| Future message create | one `MessageToFutureSelf` + one `FollowUpJob`, atomic, after owner-scoped context validation; enqueue after commit |
| Future message deliver | conditional `FollowUpJob` claim + matching `deliveredAt` in one transaction; notification last and idempotent |
| Support-plan save | one owned `PersonalSupportPlan`, serialized on the parent `User` if single-active is retained |
| Stable-self save | one owner's `StableSelfProfile` |
| Recovery check-in | one `RecoverySnapshot`; do **not** issue the current no-field Journey patch (`store.service.ts:5340–5344`) unless a distinct approved Journey change exists |
| Graduation | the Batch 1 Journey transition + one derived `RecoverySnapshot` in **one** transaction — never transition the Journey and then silently lose the history row |
| Journey archive delete / fixture cleanup | the existing Batch 1 transaction detaches surviving Self Journey FKs or deletes only authorised fixture ids; no collection sweep |

External AI, Redis and filesystem work never runs inside a long transaction. Locking or reading a graph row does not authorise re-persisting it.

**Read path.** Convert **all** §1 reads before unregistering an array, including synchronous controller methods, Journey/archive projections, monthly facts/month selection, admin counters and worker context. No "array empty, therefore nothing exists" fallback.

**Cache.** None authoritative. A later read-only owner-keyed projection must be invalidated on commit and never drive permission, AI context, status transitions, FK checks or deletion.

**Legacy compatibility.** Preserve route shapes and date/JSON conversion where safe; report deliberate changes in admin redaction and the new states. The loader skips all registered reads including `User`'s included privacy mapping; the boot seed/legacy-file fallback must not reauthorise registered rows (`mapper:77,135,157–174`; `store.service.ts:1442–1455`).

**Dual-write prevention.** Registry membership must simultaneously prevent hydration, every legacy upsert, and every applicable sweep; for `PrivacySetting` the per-`User` upsert is the third-exit equivalent. Force a legacy flush and assert **zero** legacy INSERT/UPDATE/DELETE on the ten registered tables.

**Delete strategy.** Remove the nine Self `deleteAbsent` calls (`mapper:2466–2500`). Privacy must never be reset from a missing map entry. Journey archive retains and detaches decisions, handoffs, messages, plans, memories and recovery; `CooldownItem.decisionId` is cleared **only on an authorised decision deletion**, never because a decision array disappeared. A deleted memory is excluded even if status, date or consent later change.

**Reload strategy.** `reloadRuntimeState` may refresh unrelated legacy tables but must neither assign registered Self collections nor reconstruct them from JSON/seed. **Do not remove the worker's full reload until all three worker-touched Self models — message, cooldown, decision — are registered and their reads are direct**; it exists to keep those legacy arrays consistent before notification visibility (`follow-up-worker.service.ts:43–75`).

**Worker strategy.** Target: the transaction commits `MessageToFutureSelf` + its pending `FollowUpJob` first; the deterministic job id equals the durable follow-up id; enqueue only after commit. On enqueue error the DB job stays pending and a **bounded startup and periodic reconciler** re-enqueues idempotently. `removeOnComplete:false` (`follow-up-queue.ts:25–29`) requires an explicit policy for reconciling an already-completed BullMQ id — do not assume `Queue.add` recreates it. **A `delivered` row whose notification is absent is not reconciled and not regressed to pending** (§0.6/A6): with the notification in the claim transaction the pair is atomic, and an absent row means consent was off. The worker loads the current DB job rather than trusting a stale payload, and validates that the job's `kind` matches the handler it is running (§0.7/F4).

**Failure semantics.** HTTP success requires its specified DB write to commit. DB-commit/Redis-failure is a **pending durable scheduling obligation**, not a rolled-back message. **A delivered message with a missing notification is not a case that needs reconciling** (§0.6/A6): when consent was on, the notification is written in the claim's own transaction, so the pair is atomic; when consent was off, the absent row is the intended state and no reconciler may invent one. A failed graduation-derived insert rolls back graduation if that history was promised. AI context selection fails **closed** on missing or revoked consent.

**Concurrency.** Preserve `User → LifeJourney → ActionCommitment → child`, locking multiple rows of each level in deterministic id order. For a Self write with a Journey FK: lock owned `User`, then the Journey, then the Self child; check FK and owner **inside** that transaction. FutureSelf referencing a decision/recovery row locks `User` then the target Self row in a stable order. Delivery touching message/decision/cooldown locks `User` first, then the affected Self rows in a documented order, then `FollowUpJob` — reconciled with Batch 1's action-follow-up order. Privacy revocation and an AI-context gate must serialize at the `User`/privacy boundary or use an equivalent commit-time predicate. Use conditional status updates or `updatedAt` CAS, never stale-object whole-row upserts.

---

## 3. Reference safety — verdict

**Current: REFUTED if the arrays are removed without the conversions above. Target: NOT YET PROVEN.**

1. **Incoming references.** Every registered Self row has a `User` FK (`schema.prisma:229–249,587–739`); `StableSelfProfile` and privacy are additionally unique per User. *(Corrected: an earlier version of this paragraph called `CooldownItem` and `StableSelfProfile` exceptions to the `User` FK. They are not — see §0.5/A4.)* Nullable Journey FKs exist on Decision, Handoff, FutureSelf, SupportPlan, Memory and Recovery. `CooldownItem.decisionId` references `DecisionRecord` with `onDelete:SetNull` (`:617–618`). FutureSelf `contextRefId` is a **plain string** (`:665–667`), as are the worker payload ids. None may be cleared because a snapshot lacks its source row.
2. **Self-target id-set consumers.** `decisionIds` is built from the `decisionRecords` array (`mapper:893`) and filters/resolves `CooldownItem` (`:1788–1809`): after a Decision cutover but before Cooldown, an empty set drops cooldown writes, can null their FK, and the cooldown sweep can delete rows. **Convert Decision + Cooldown as one cutover unit**, or replace that guard with a transaction-scoped, omission-safe database check first. `journeyIds` candidates still include six Self Journey references (`:933–959`); remove only registered candidates as they exit. Existing `User` ids are array-derived (`:897`) — no Self upsert may depend on that array after registration.
3. **Self sweeps.** Nine collections are swept at `mapper:2466–2500`; all nine must exit. Privacy has no sweep but its upsert default is destructive (§0.1).
4. **Mapper paths.** Loader `:113–121,573–676`; privacy via `User` `:77,157–174`; saver `:1034–1072,1757–1967`; sweeps `:2466–2500`. `fkUpdate` distinguishes undefined/omitted from explicit null and a supplied candidate (`:790–799`) — do not replace it with `item.journeyId ?? null` on an update. It is **not sufficient** for a stale but *supplied* old Journey id, nor for fields overwritten by an unconditional upsert.
5. **Non-mapper id-set/deletion sources.** Fixture cleanup derives decision/cooldown ids and Journey/action sets then filters Self arrays (`store.service.ts:3200–3228,3243–3269`); archive detail/deletion read Decisions/Recovery from arrays and detach Self arrays after the DB deletion (`:3421,3459–3461,3518–3553`); FutureSelf validates Decision/Recovery contexts against arrays (`:5584–5597`); support-plan "existing active" and stable-self upsert decide existence from arrays (`:5643–5665,5709–5719`); monthly and admin counts/lists do too (`monthly-report.service.ts:200–202,233–235,344–360`; `controllers.ts:2019,2030,2476–2501`). All must become database decisions.
6. **Flush/reload/worker.** Boot, `persist`, `flush`, reload can carry a stale snapshot (`store.service.ts:1442–1477,2299–2313`); the worker directly updates three Self tables then reloads (`follow-up-worker.service.ts:43–75`). **While a Self table remains legacy-owned, the worker's direct writes and its array upsert are competing authorities** — the gate must test and explicitly sequence that intermediate state.

**Omitted-field counterexample, distinct from empty sets.** Instance A holds an old Decision snapshot lacking `cooldownUntil` while B commits a deadline; A's ordinary upsert writes `cooldownUntil:null` (`mapper:1775–1785`) **even though `decisionIds` still contains the Decision**. Separately, an old privacy map missing `allowAiMemoryUse` writes `false` on A's next flush (`:1034–1069`), irrespective of any Memory id set. A stale Self `journeyId:undefined` must mean **no opinion**; explicit archive detach is `null`; a supplied new id requires current owner/FK validation. Test all three for each nullable Self Journey FK and for `CooldownItem.decisionId`, including a competing Batch 1 archive delete. A database `SetNull` does not prove these semantic distinctions.

---

## 4. Verification and the Batch 3 gate

Leased databases created by tracked `prisma migrate deploy`, two independently initialised API instances, an independent final-row Prisma client, isolated Redis queues. Every race needs a **strict barrier that fails on non-arrival**, final assertions from an independent client, and a mutation proving the named guard is load-bearing. Sequential requests are not concurrency evidence.

| Test | Invariant |
| --- | --- |
| DB-only Self row read via every authorised route/report/admin projection; legacy flush and restart | reads are DB-authoritative; no row swept, overwritten, hidden by an empty array, or exposed to another owner |
| Memory extension vs disable; expiry vs extension; deletion vs explicit activation; privacy revocation vs prompt preparation | AI receives only active, unexpired, allowed-scope, currently-consented, non-deleted memory; a date extension never silently re-enables; removing each predicate fails the test |
| Two instances listing/transitioning a cooling Decision at the deadline, plus worker release and manual ready competing | one DB-time rule decides readiness; no early ready, no backward transition, no double review timestamp; both instances agree without reload |
| Two simultaneous cooldowns for one decision; Decision update vs worker delivery | the approved multi-cooldown policy is enforced; **no stale worker sets a superseded decision ready early** |
| FutureSelf DB commit then Redis unavailable; API restart; Redis job loss; two workers; crash after claim before notification; privacy toggle during delivery | every scheduled message stays recoverable from DB; one monotonic delivery; at most one deterministic notification; no read-state reset |
| Two simultaneous support-plan saves with no active row; stable-self upserts; recovery check-in vs graduation/archive | at most one active plan if required; no lost profile update; recovery history persists once, retains original signals, is never turned into a diagnosis |
| Batch 1 archive delete vs a Self create/update with a Journey FK; stale `undefined`, explicit `null`, supplied valid/foreign id; Decision removal vs Cooldown | no surviving FK silently cleared, no deleted Journey resurrected, no Cooldown lost; no unexpected `40P01` |
| Admin disclosure and owner/safety readback with guessed ids and changed privacy | admin sees only approved fields (§0.4/S4); owner sees only their own full plan; authorised safety readback remains available |
| Stale/superseded cooldown job firing after the decision was re-cooled; two workers racing the same job; job whose item deadline has not arrived | no early release, no early `ready`, the superseded job closes without moving anything (§0.5/A2) |
| Duplicate graduation request; two concurrent graduations from separate instances | at most one graduation-derived `RecoverySnapshot` per **journey** (§0.7/F3); the second call returns the completed journey and appends nothing |
| Reopen a completed journey via the status endpoint | **refused**, matching the product copy in `Archive.vue`; the row is unchanged and no snapshot is appended (§0.7/F3) |
| Cooldown superseded by a new one; its job firing afterwards; the old item's terminal state; a job whose payload names a different decision or owner | the old `CooldownItem` ends `superseded`, never `active`; the mismatched job closes as `superseded` and moves nothing; **at most one** `active` cooldown exists per decision — zero when none is current — asserted after the duplicate normalisation (§0.6/A2, §0.7/F1/F2, §0.8/G4) |
| A `disabled` memory whose `expiresAt` has passed, re-enabled in place | refused; the only path back is the explicit re-consent action with a fresh `consentedAt` and a future `expiresAt` (§0.6/A5) |
| A cooldown **created unlinked** (no `decisionId` at creation); a cooldown whose decision was **deleted** afterwards | the first releases on its deadline and writes no decision; the second closes as `superseded` and releases nothing — told apart by the job payload, not by the current `decisionId` (§0.9/H2) |
| Reopening a completed journey through **`PATCH /journeys/:id`** as well as through the status endpoint | both routes refuse under the `LifeJourney` lock, and a graduation committing concurrently still leaves the journey completed (§0.9/H1) |
| Crash between the delivery claim and the notification; delivery with consent off; delivery with consent on | with consent on the notification is in the claim's transaction, so the pair is atomic; with consent off the absence of a row is the intended state and no reconciler invents one (§0.5/A6) |
| Every Self route called with a foreign id, and with no identity at all | the §0.5/A8 matrix holds: no route decides ownership from the demo-user fallback |

| Gate | Evidence needed | At reviewed HEAD |
| --- | --- | --- |
| `SELF_FULL_FLUSH=false` | SQL trace per operation + forced legacy flush: no snapshot writes/sweeps on the ten tables | **Not established** |
| `SELF_DUAL_WRITER=false` | complete writer inventory, permitted cross-boundary detaches, worker cutover, SQL trace | **Not established** |
| `MEMORY_STATE_PASS=true` | four eligibility predicates; the §0.5/A5 contract — allowed operations per state, effective expiry, the explicit re-consent action, irreversible delete, the named `MemoryCenter.vue` change, and the AI linearization point; expiry/revocation races and guard mutations | **Blocked by S2 + A5** |
| `DECISION_STATE_PASS=true` | the states that exist, plus `outcome` as an **optional** state (§0.5/A1, §0.6/A1) — **not** a mandatory six-state walk; the §0.6/A2 predicates and the superseded-cooldown terminal state; DB-time deadline transition; worker/manual/cooldown races and mutations | **Blocked by S3 + A1/A2** |
| `FUTURE_SELF_QUEUE_PASS=true` | DB/Redis fault injection, periodic reconciliation, restart, duplicate worker, post-claim crash, final-row checks; the §0.5/A6 same-transaction notification and the corrected "what delivered means" copy | **Not established** |
| `PRIVACY_PASS=true` | DB-authoritative settings; the §0.4/S4 + §0.5/A7 disclosure policy (metadata-only list/search, audit-before-disclosure single-record read) and its negative tests; owner/safety/AI reads under revocation | **Blocked by S4 + A7** |
| `SELF_ROUTE_IDENTITY_PASS=true` | the §0.5/A8 per-route identity/ownership/consent matrix, with a negative test per route, and the FutureSelf optional-context degradation fix | **Not established** |
| `MULTI_INSTANCE_SELECTED_FLOWS_PASS=true` | the strict-barrier races above, independent-client rows, DB-only reads, stale flush/reload | **No Batch 3 evidence** |

`PERSISTENCE_BATCH3_STABLE=true` only when all eight hold, the escalations are adjudicated (done in
§0.4 and §0.5), and an independent review accepts the implementation. This is a **selected
Self-flow** claim — not application-wide multi-instance safety, live-AI verification, or any
visual/pet-presence result. **`DECISION_STATE_PASS` does not mean the plan's six-state machine is
implemented** (A1), and **`MEMORY_STATE_PASS` does not mean the re-consent flow is reachable in the
UI** until the named `MemoryCenter.vue` change lands.

---

## 5. Implementation boundary

**Permitted after approval:** `direct-db-models.ts`, `relational-runtime.mapper.ts`, `store.service.ts`, `controllers.ts`, `monthly-report.service.ts`, `follow-up-worker.service.ts`, `follow-up-queue.ts`, `app.module.ts`, one new Self persistence/reconciliation service (or a separately justified narrow pair), `batch1-persistence.service.ts` for exactly four things, each named in §0.8: the atomic graduation/RecoverySnapshot insert, a necessary correction to its existing Self-FK detaches, the shared terminal-state guard for journey status used by **both** status entry points (§0.8/G1), and the `FollowUpJob` terminal-set plus terminal-branch guard (§0.8/G2). Plus targeted Self tests under `tests/business/`.

**Named UI/API contract changes that are part of this batch** (each one is required by a decision above, and none is smuggled in as an incidental persistence fix):

| Change | Required by |
| --- | --- |
| `MemoryCenter.vue` gains the re-consent action for `expired` and loses the edit affordance for it | §0.5/A5 |
| `FutureSelf.vue` stops coupling the letter list to the optional recovery context, and its copy/reveal rule matches silent delivery | §0.5/A6, A8 |
| Admin `TablePage.vue` stops expanding `plan`/`content` from list rows and calls the audited single-record route | §0.4/S4, §0.5/A7 |
| `MemoryItem.status='deleted'` becomes an accepted value in the app-level type and update validation (the column is already `String`) | §0.4/S2 |
| Every Self route that silently falls back to the demo user is corrected or explicitly recorded as single-user-by-design | §0.5/A8 |

**One change to a Batch 1 path, named as a deviation.** §0.7/F3 requires `updateJourneyStatus`
(`batch1-persistence.service.ts:2044–2071`) to refuse a transition out of `completed`. That is a
change to a Batch 1-owned path, and it is required because the endpoint contradicts the product's
own copy (`apps/mp/src/views/Archive.vue:283–286`: "已完成的 Journey 保留为完整历史，不能恢复为进行中。").
It is a defect fix against a stated product rule, not a new product decision, and it is what makes
the per-journey graduation invariant enforceable without a migration. It is listed here rather than
folded silently into "must not change Batch 1 behaviour".

**And one change to the legacy `FollowUpJob` mapper.** §0.7/F5 and §0.8/G2 require two things, not
one: `superseded` is added to that mapper's terminal set **and the terminal branch gains the same
`status: { notIn: TERMINAL_FOLLOW_UP_STATUSES }` guard the non-terminal branch already has**
(`relational-runtime.mapper.ts:2024–2026,2053–2055,2076–2099`). The set alone is insufficient —
when the stale *array* says `delivered`, the terminal branch updates unconditionally by id and would
rewrite a DB `superseded` back to `delivered`. `FollowUpJob`'s ownership is unchanged; its terminal
statuses and the immutability of a terminal row to the legacy writer are what change.

**Migration decision.** The §0.6/A2 predicates, §0.7/F1's association check, §0.7/F2's one-time
duplicate normalisation, §0.7/F3's one-way graduation, A5's `deleted` spelling and A6's
same-transaction notification all fit the existing columns and the existing `FollowUpJob` index —
**no new migration is proposed**. A migration becomes necessary only if the approved policy demands
a database-enforced constraint or a new field (a partial unique active-plan constraint, a partial
unique active-cooldown constraint, a per-message queue marker, or re-consent metadata `consentedAt`
cannot represent). A3 is explicitly **not** escalated to that, and F2's normalisation is a
transaction, not a constraint. Never edit an applied migration.

**Must not change:** ownership or behaviour of the eight Batch 1 or five Batch 2 models — with the
three named exceptions above (the journey terminal-state guard, the `FollowUpJob` terminal rule,
and the graduation insert/detaches) — general Peer/AI/legacy content, applied migrations,
fixture/recovery scripts, the transaction timeout, or mini-program presentation as an incidental
persistence fix.

**One deliberate data change, named rather than implied:** §0.7/F2's idempotent normalisation of
historical duplicate `active` `CooldownItem` rows changes existing production/development rows. It
covers **`CooldownItem` rows and the `FollowUpJob` rows belonging to the cooldowns it supersedes**
(§0.9/H3) and nothing else; it keeps the latest row per decision, is re-runnable without further
effect, and is the only exception to "must not change production/development data" in this batch.

**Review order:** product decisions (§0.4, §0.5) → reference-safety approval → atomic Decision/Cooldown and FutureSelf/worker boundaries → individual triple exits and DB-only reads → route identity matrix → privacy/admin disclosure → strict-barrier races, fault injection and SQL-scope measurement → independent Batch 3 gate. Each predicate in §0.5/A2 and A3 carries a named mutation; a green suite is not the gate.
