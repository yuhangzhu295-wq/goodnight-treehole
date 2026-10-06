# Persistence Batch 2 — Peer System Design

**Status: DESIGN GATE NOT PASSED as written — the two P0 items below are resolved by orchestrator decision in §0.1/§0.2, and implementation proceeds on that basis.**
**Reviewed checkout:** branch `codex/post-recovery-validation`, HEAD `8c59665`. Read-only review; no database, concurrency or migration test was run.

Citations are `file:line` at that HEAD.

---

## 0.1 Orchestrator decision — P0-1 bilateral consent is IN scope, and will be implemented

The reviewer concluded that bilateral consent cannot be represented without a schema change and therefore sits outside Batch 2. **I am overriding that conclusion**, for three reasons:

1. **The master plan requires the invariant.** Batch 2's core invariants state *"只有双方 Consent：conversation 才能 active"* and *"accepted != active"*. A batch that migrates these five models while leaving the invariant unsatisfied cannot claim `PEER_STATE_MACHINE_PASS`, and the plan makes that a precondition for `PERSISTENCE_BATCH2_STABLE`.
2. **A schema change is not forbidden — only *editing applied migrations* is.** The plan says *"所有已应用migration：immutable"* and *"任何schema变化：新migration"*. A **new** migration is the sanctioned mechanism, so "needs a schema change" is not by itself a reason to exclude the work.
3. **The product already intends bilateral consent — but not as a working requester flow.** The page at `/pages/peer/consent` is titled **"开始前，先确认边界"** with the button **"同意并开始同行"**, and its rules and acknowledgement are **role-neutral** ("你将以匿名身份进入限时会话", "我已知晓…"; `PeerConsent.vue:74–112,115–130`), so it is usable as the consent screen for *either* participant. The requester's waiting screen states the bilateral requirement outright: `/pages/peer/wait` tells them **both** must confirm the boundary (`PeerMatchWaiting.vue:14–25,53–56,71–74`).

   **Correction (from the rebuttal review) — do not overstate this.** It is *not* a working requester path today: the page loads its match from `/api/v1/peer-requests` (`PeerConsent.vue:14–18`), an owner-only list (`store.service.ts:4478–4489`); the owner reaches it after accepting (`PeerRequests.vue:26–45,123–145`); and the handler assumes the click **starts** a conversation and navigates straight to `conversation.matchId` (`PeerConsent.vue:25–35,115–123`). The requester lands on `/pages/peer/wait`, whose only actions are refresh and return (`PeerMatchWaiting.vue:87–100`). So the justification is *role-neutral copy plus an explicit bilateral promise on the waiting screen* — not an existing requester consent flow. The requester navigation, a pending-state response and the response contract are all part of the work.

   Also: `PeerMatchWaiting.vue:87–100` marks the boundary step as done as soon as the match is `connected`, before either consent exists. That is a false state and must be corrected, not preserved.

**Decision.** Implement bilateral consent in this batch:

- Add a **new migration** recording two independent consent facts (the requester's and the owner's). Do not edit any applied migration.
- The requester must be able to record consent; the conversation may become `active` **only when both facts exist**. `accepted != active` must remain true.
- The existing `/pages/peer/consent` boundary screen is the natural place for the requester's step; the owner keeps theirs.
- No migration may invent an `expired` or `accepted` *status* — the eight logical states stay projections of existing fields plus the two new consent facts (§1).

If implementing this turns out to require a product-behaviour change beyond adding the requester's consent step — for example removing an existing step, or changing who may initiate — **stop and escalate**; that would be a genuine product decision. Adding the missing half of an already-designed bilateral flow is not.

## 0.2 Orchestrator decision — P0-2 report semantics

The plan specifies `Report → PeerReport create`. The implementation also updates an existing open report on repeat, mutates three denormalized `PeerConversation` pointers, and recomputes `PeerExperience.reportCount` (`store.service.ts:4611–4657`).

**Decision — the derived-read branch is selected; the write-narrowing alternatives are withdrawn.** Keep the operator behaviour and move every derived value to a read, so the report operation writes exactly one row:

- A repeat report by the same reporter on the same conversation **returns the existing open report** and writes nothing. (API-contract note: previously a second reason *replaced* the first — `store.service.ts:4615–4635` — and it no longer will.)
- `PeerExperience.reportCount` is **retired as a write** and becomes a database-derived count over *all* reports regardless of handling status, which is the current rule (`store.service.ts:4647–4657`). **The scorer must be converted with it**: suggestion scoring reads `experience.reportCount === 0` (`store.service.ts:4215–4228`), so retiring the write without changing the scorer silently changes match safety.
- The three `PeerConversation` latest-report pointers are **retired as writes**; the admin conversation view must stop reading `reportReason` / `reported` / `reportedAt` from those columns (`controllers.ts:2317–2345`; `apps/admin/src/views/TablePage.vue:346–348,839–842`) and derive them from the latest report ordered deterministically by `createdAt` then id, applying its `q` and `reported` filters to the derived values.
- The report operation's declared write set is therefore **exactly one `PeerReport` insert** (zero on a repeat while an open report exists). If implementation turns out to need a counter or pointer write, that is an **expansion to `PeerReport` + `PeerExperience` and/or `PeerConversation`** and the create-only gate must be renegotiated explicitly — not described as if create-only still held.

## 0.3 Priority

P0: the two decisions above — **resolved**. Then approve this design at the review gate.
P1: implement the triple exits, direct ownership-checked paths, the bilateral-consent migration, and the reference-safety proof.
P2: independently measure, race-test and gate the result.

Persistence success must not be presented as a pet-presence or visual-experience gate (`BATCH1_FINAL_GATE.md:27–29`).

---

## 0.4 Amendments required by the rebuttal review (blocking — all resolved here)

The rebuttal review upheld both overrides but listed seven blocking items that must be folded in before implementation. Each is resolved below; where a resolution contradicts an earlier section, **this section governs** and the earlier text is corrected.

### A1 — Reconcile the document with its overrides *(blocking)*
Statements that still called the consent change out of scope, the report decision outstanding, or that banned `prisma/schema.prisma` / migrations / `apps/mp` have been corrected. The governing statements are §0.1, §0.2 and §6 below.

### A2 — Implementation boundary, expanded *(blocking)*
In addition to §6.1, Batch 2 may change:
- `prisma/schema.prisma` — to declare the two consent facts; **applied migrations stay immutable**;
- **one new** tracked migration directory under `prisma/migrations/`;
- `apps/mp/src/views/PeerConsent.vue`, `PeerMatchWaiting.vue`, `PeerNetwork.vue` — requester consent, pending state, and navigation;
- `apps/mp/src/views/PeerRequests.vue` — only if the owner-side pending presentation changes;
- `apps/admin/src/views/TablePage.vue` — only if the admin response contract is deliberately changed (preferred: keep the field names and change the API's derivation instead);
- `apps/mp/src/router.ts` — only if a new route is introduced (the consent route already exists).

The blanket bans on schema, new migrations and `apps/mp` are **withdrawn**; the ban on *editing applied migrations* stands.

### A3 — The two consent facts, legacy rows, and the response contract *(blocking)*
- The two facts live on **`PeerMatch`** as separate timestamps (requester's and owner's). Keeping them on the match means no conversation row exists before activation, preserving today's "no conversation until both consent" semantics.
- **First consent** commits **only the caller's own `PeerMatch` field** and returns a **pending** response — it must not fabricate an `active` conversation. The requester's UI renders that pending state (this is what `PeerMatchWaiting.vue` gets wrong today).
- **Second consent** atomically writes **the other `PeerMatch` field plus one `PeerConversation` create** in a single transaction. `startsAt` and the 72-hour deadline are set **once, at activation**.
- **Duplicate consent** writes neither field nor another conversation, and must not move `startsAt`/`expiresAt`.
- **Legacy rows** predating the migration have no recorded requester consent and must **not** be represented as having given it. The migration states one rule: existing `active` conversations are **grandfathered** as already-active with the migration's own timestamp (preferred — it does not retroactively break live conversations), or are closed. Choose one and record it.
- The conversation's own `consentAcceptedAt` records **activation**, not either party's consent.

### A4 — Corrected consent write scope (§3.3) *(blocking)*
"`PeerMatch` + `PeerConversation` in one transaction" is the **maximum set across the two calls**, not what each call always writes:

| Call | Write set |
| --- | --- |
| First consent (either party) | one `PeerMatch` consent field |
| Second consent (the other party) | the other `PeerMatch` consent field **+** one `PeerConversation` create |
| Duplicate consent | none |
| Consent after block/decline/close | none — rejected, no revival |

Notifications follow commit and must never announce activation after only one consent.

### A5 — Reference safety: the omitted-field case *(blocking)*
§4 notes that `fkUpdate(undefined)` omits the update (`mapper:776–784`). Once all five peer upserts and sweeps are disabled, their peer-to-peer guards can no longer clear a peer FK through a legacy flush — but that is **narrower** than §4 currently claims, because §4 does not enumerate every *other* writer that can change a peer FK. Required before the target verdict:
- enumerate, per peer FK column, every writer that can change it, including the nullable `PeerReport.experienceId` and the non-FK `matchId` string;
- for each, distinguish *omitted / no opinion* from *explicit detach* from *supplied and DB-validated reference*;
- verify the owner/status checks on Batch 1's two peer-FK detaches (`batch1-persistence.service.ts:2124–2130,2210–2217`) and race them against a peer operation holding a previously-read journey reference;
- add a test where **one instance omits a field while another has committed its value**, then reload and legacy-flush. The empty-array test alone is not sufficient — this is the exact case that took Batch 1 four review rounds to find.

Registration of a model is refused until its row of this matrix and its test exist.

### A6 — Extended consent races *(blocking)*
Beyond §5's seven categories, the bilateral step adds:
- owner consents first → requester sees pending → requester consents second → one conversation;
- requester consents first after acceptance → owner sees pending → owner consents second → one conversation;
- requester consents twice before the owner: timestamp and deadline unchanged, no conversation;
- both consent concurrently: exactly one conversation;
- **consent versus block**, including block after the first fact and before the second — a blocked match must never become active;
- admin decline/block racing consent: no transition revives a terminal match.

Each result is read from an independent client, on both instances without reload. `PeerMatchWaiting.vue`'s "boundary confirmed" indicator must be tested for the pending state, since it is currently wrong.

### A7 — Report projection and race, specified *(blocking)*
- Latest-report ordering: deterministic, `createdAt` then id.
- `reported=true` filtering and the admin `q` search operate on the **derived** values, not the retired columns.
- Admin response **field names stay** (`reportReason`, `reportedAt`, `reporterUserId`); only their source changes, so `TablePage.vue` needs no change.
- Repeat-report HTTP shape is unchanged: the route returns `{ item: conversation }` today (`store.service.ts:4643–4644`) and continues to, even though the operation returns the existing report internally.
- Concurrent same-reporter reports are serialized on the conversation row; the schema has **no** unique constraint for an open `(conversationId, reporterUserId)` (`schema.prisma:837–859`), so the check-and-insert must be serialized explicitly or the invariant escalated.

### A8 — 72-hour wording qualified *(advisory, adopted)*
A pre-insert database-time check does not by itself prove the transaction **commits** before the deadline. The enforceable rule is: under the conversation lock, compare database time at the guarded insert/transition, and test both orderings around expiry. Do not claim a commit-time guarantee the mechanism does not establish.

## 0. Scope and blocking conclusion

Batch 2 may transfer authority for **only** `PeerExperience`, `PeerMatch`, `PeerConversation`, `PeerMessage`, `PeerReport`.

`UserNotification` is already database-authoritative under Batch 1 (`apps/api/src/direct-db-models.ts:1–10`), and peer notification calls already go through its direct writer (`apps/api/src/store.service.ts:4320–4336`; `apps/api/src/batch1-persistence.service.ts:601–629`). Notifications are a cross-boundary side effect, **not a sixth migrated model**.

**Current state.** All five peer tables still hydrate into store arrays, and the legacy mapper upserts and absence-sweeps them (`relational-runtime.mapper.ts:108–109,126–128,516–554,718–762,1304–1401,2099–2165,2338–2419`). A stale instance can therefore overwrite another instance's peer transition or delete its peer rows. Batch 1's accepted pattern requires three simultaneous exits — no hydration, no legacy upsert, no absence sweep — plus replacement of array-derived FK decisions (`BATCH1_DESIGN.md:28–55`).

### P0-1 — bilateral consent is not represented and not obtained *(resolution in §0.1)*

The master plan requires **"only bilateral consent makes a conversation active"**. The code does not do this:

- A request sets `PeerMatch.status = requested`; the experience owner's acceptance sets `connected` and stamps `acceptedAt`; the **same owner alone** may then consent, immediately creating an `active` conversation (`store.service.ts:4408–4436,4444–4475`).
- The requester is **explicitly rejected** at the consent endpoint (`:4448–4450`; `tests/business/peer-support-stage.spec.ts:274–293`).
- Neither `PeerMatch` nor `PeerConversation` has a separate requester-consent field (`schema.prisma:547–573,803–831`).

So `accepted != active` holds, but **`active` requires only one party's consent**. The existing schema and routes cannot record two independent consent decisions. Adding that representation and a requester-side action is a schema + API + **product-behaviour** change (the requester gains a new step), which the plan's implementation boundary explicitly excludes from Batch 2.

**Verdict: I cannot establish "both participants have consented". Do not relabel the current unilateral activation as bilateral consent, and do not claim `PEER_STATE_MACHINE_PASS`.**

### P0-2 — "Report → PeerReport create only" is not today's behaviour *(resolution in §0.2)*

Reporting **updates an existing open report** on repeat, mutates three denormalized `PeerConversation` pointers, and recomputes `PeerExperience.reportCount` (`store.service.ts:4611–4657`). The plan's per-operation scope says "Report → a `PeerReport` create". Leaving the derived fields stale changes the operator view and the matching safety score; writing them contradicts the stated scope.

**Decide explicitly:** do the derived fields become database-derived reads, does a repeated report return the existing open report rather than rewriting it, and is the operator-visible pointer retired or updated by a separately specified operation.


Persistence success must not be presented as a pet-presence or visual-experience gate (`BATCH1_FINAL_GATE.md:27–29`). The peer API is real persistence-backed functionality, but its stated two-party consent is presently a **false product claim**.

---

## 1. State machine and safety invariants

| Required state | Actual representation at HEAD | Verdict |
| --- | --- | --- |
| `suggested` | `PeerMatch.status = suggested` on creation (`store.service.ts:4241–4259`; `schema.prisma:97–103`) | Reachable |
| `requested` | match status after the requester acts (`:4408–4424`) | Reachable |
| `declined` | match status set by the owner while `requested` (`:4410–4411,4423`) | Reachable |
| `accepted-no-consent` | match `connected` + `acceptedAt`, **no conversation yet** (`:4410–4411,4435–4437,4478–4488`) | Reachable as a **derived pair of facts**, not a status value |
| `active` | `PeerConversation.status = active`, inserted by owner-only consent (`:4444–4465`; `schema.prisma:811–817`) | Reachable, but **the bilateral invariant fails** |
| `closed` | conversation `closed`, reason `closed` (`:4338–4351,4604–4609`) | Reachable |
| `expired` | conversation stays `closed` with `closedReason = expired` (`:4338–4351,4371–4379`) | Reachable as a **derived state** |
| `blocked` | match `blocked`; an existing conversation becomes `closed` with `closedReason = blocked` (`:4412–4413,4739–4747`) | Reachable as a match state or derived closure |

`PeerMatchStatus` permits `suggested|requested|connected|declined|blocked` — **no literal `accepted`** (`schema.prisma:97–103`). `PeerConversation.status` is a plain string, created `active` and closed `closed`; its type also lists `extended`, but no transition to it was found (`store.service.ts:587–603,4338–4379,4444–4465`). **Do not invent an expiry or consent status in a migration.** A read projection can name the eight logical states from existing fields — except an independently recorded bilateral-consent state, which **cannot** be derived.

**Participants only.** `requirePeerConversation` finds a conversation whose starter or receiver matches the runtime user (`:4382–4389`), and send/assist/close/report/block/feedback call it (`:4566–4612,4739–4755`). The replacement repository must enforce that predicate **inside the database operation**: read predicates constrain starter/receiver; writes lock or condition on conversation id, participant identity, current state and expiry. A preflight controller check followed by an unscoped update is unacceptable — Batch 1 shipped exactly that ownership bypass and had to repair it (`BATCH1_IMPLEMENTATION.md:192–195`).

**AI draft only.** The assist route calls `requestPeerResponseAssist`, which checks participant, active state and PII in the supplied source, then queues an `AIJob` of type `peer_response_assist`; it does **not** create a `PeerMessage` (`controllers.ts:821–827`; `store.service.ts:4586–4601`). Its prompt demands a JSON draft for human editing and forbids auto-send (`:6514`); parsing yields `draft` and `reminders` (`:6558–6561`). The migrated assist must retain the DB participant/expiry check and **must never call the message writer**, including from an AI completion callback. The task-result read for PII was not verified: the *source* rejection is proven, but I could not establish that the model-generated draft is redacted at the AI task response boundary (`controllers.ts:1142–1158`).

**PII sites.** `peerPiiFlags` detects phone, email, WeChat/QQ-like accounts, ID number and address hints; `assertPeerDraftSafe` rejects detected text (`store.service.ts:4265–4289`). `redactPeerPublicText` redacts those plus name hints; `redactPeerPublicValue` recurses through JSON/arrays (`:4291–4318`). Experience create redacts title/content/domain/subdomain/tags/retrospective/later summary/actions (`:4027–4066`); update redacts mutable public fields (`:3980–3999`); the graduation-derived draft redacts title/domain/subdomain/content/tags (`:3925–3954`); feedback-derived sharing redacts `shareText` (`:4773–4795`). Request reason and question are **rejected**, not redacted, before persistence (`:4414–4422`); human message and assist source likewise (`:4566–4582,4586–4592`); feedback notes likewise (`:4761–4763`). Public summary/detail and the historical message projection redact again on read (`:4114–4137,4160–4168,4502–4555`). Migration must keep **write validation and output redaction**; reading from PostgreSQL must not bypass the historical-row protection. **Existing gap:** the feedback-created experience copies `journey.domain`, snapshot subdomain/tags or source fields without applying `redactPeerPublicText` per field (`:4776–4787`) — a targeted review is required before any `PEER_PII_PASS`.

**72 hours.** Creation sets `expiresAt = startsAt + 72h` (`:4453–4464`). Expiry is **lazy**, not a scheduled job: conversation list and `requirePeerConversation` call `expirePeerConversations`, which scans active in-memory conversations, closes due ones with reason `expired`, notifies and flushes (`:4338–4389,4558–4564`). No standalone peer expiry worker was found. After migration, expiry must use the **database's current time inside the transaction**, serialize on the conversation row, and reject a message whose insert would occur at or after expiry. If send commits before the deadline, keep it; if expiry/close wins, insert nothing. A request-time pre-check is insufficient. Without traffic a due row may stay physically `active` until the next read/write unless an approved worker is added — an unconditional "all expired rows are already closed" claim would be false.

---

## 2. Five-model ownership and operation inventory

"Direct" is the **proposed target**, not a claim about today. Reads must come from PostgreSQL after registration; no long-lived writable peer array survives.

| Model | Current writers → target disposition | Current reads to convert | Deletion / expiry |
| --- | --- | --- | --- |
| `PeerExperience` | graduation draft create (`store.service.ts:3917–3958`), user create (`:4005–4077`), pending-review edit (`:3961–4002`), feedback `shareLater` create (`:4750–4798`), admin review (`controllers.ts:2240–2254`), report-count recomputation (`store.service.ts:4647–4657`), journey archive/test cleanup detach-or-remove (`:3130–3131,3415–3423`; `batch1-persistence.service.ts:2124–2130,2210–2217`), legacy upsert (`mapper:1304–1354`). Each peer mutation becomes a narrow direct operation; Batch 1's journey-deletion transaction keeps its targeted peer-FK detach but must not gain peer-table ownership via the flush. Report count becomes DB-derived or an expressly reviewed consistent write. | owner edit/create and share feedback, published network, match generation and projection, experience detail, journey peers/detail/archive, request and consent ownership lookup, report/admin context, admin list/detail/dashboard, monthly facts/months (`store.service.ts:3973–3979,4080–4115,4140–4145,4188–4196,4402–4405,4446–4449,4502–4555,4661–4675,4768–4770,3308–3310,3451–3467`; `controllers.ts:2013,2220–2254`; `monthly-report.service.ts:205–207,336–337`) | retain on archive with `journeyId = NULL`; test cleanup deletes only verified fixture ids. Deleting an experience cascades matches, conversations, messages and reports (`schema.prisma:553–554,803–810,837–847,861–866`): forbid an incidental or unrestricted delete. No 72h expiry on experience. |
| `PeerMatch` | suggestion creates rows (`store.service.ts:4188–4262`); requester request, owner accept/decline and participant block transition (`:4392–4436`); conversation block also changes the match (`:4739–4747`); archive/test detach/removal (`:3130–3131,3422–3423`; `batch1-persistence.service.ts:2128–2129,2215–2216`); legacy upsert (`mapper:1355–1401`). Convert to row-locked / status-CAS direct writes. `@@unique([userId, peerExperienceId])` already guards duplicate suggestion (`schema.prisma:571`). | network/journey detail/archive/peers, suggestion exclusion set, request list, match projection, experience access, conversation consent/report/block/feedback, admin list/dashboard (`store.service.ts:3308–3310,3337–3338,3451–3467,4089–4099,4140–4157,4191–4196,4402–4405,4446–4449,4478–4512,4614,4741,4768–4770`; `controllers.ts:2018,2256–2276`) | retain/detach `journeyId` on archive; explicit fixture-only cleanup. No match expiry transition exists; conversation expiry is a separate derived state. A match delete cascades its conversation tree; no absence sweep. |
| `PeerConversation` | owner consent creates (`store.service.ts:4444–4475`); close/expiry/block call `closePeerConversationRecord` (`:4338–4379,4604–4609,4739–4747`); report updates latest-report pointers (`:4611–4644`); feedback updates fields (`:4750–4798`); legacy upsert (`mapper:2099–2139`). Consent requires a scoped `PeerMatch` + `PeerConversation` transaction **after the P0-1 escalation**; close and expiry are scoped status transitions; report-pointer semantics need the P0-2 decision. | participant lookup, list/message projection, match/request reads, journey archive, report admin view and message counts, dashboard, monthly facts/months (`store.service.ts:3337–3369,4171–4185,4371–4389,4437,4451,4484–4488,4558–4564,4661–4675`; `controllers.ts:2019–2021,2317–2345`; `monthly-report.service.ts:200–204,338–340`) | retain closed and expired histories; close rather than delete at 72h; never delete because an array is absent. Match/User cascades exist in schema; only explicit authorised retention/fixture policy may delete, with child-history consequences reviewed. |
| `PeerMessage` | only human send was located (`store.service.ts:4566–4583`); legacy upsert (`mapper:2140–2165`). AI assist is **not** a message writer (`:4586–4601`). Direct insert is append-only; there is no message update for send retries and no idempotency key — do not claim retry deduplication beyond the actual request identity. | participant conversation projection and admin message counts (`store.service.ts:4160–4185`; `controllers.ts:2328–2344`) | retain on close/expiry/report. Conversation deletion cascades messages (`schema.prisma:861–875`); prohibit absence sweep. |
| `PeerReport` | participant report creates **or rewrites the open report** (`store.service.ts:4611–4635`); admin handling updates status/note and the controller appends `AuditLog` then flushes (`:4680–4695`; `controllers.ts:2417–2430`); legacy upsert (`mapper:2342–2373`). Direct create/update requires the resolved repeat semantics; admin status and the existing `AuditLog` must commit consistently without moving `AuditLog` authority. | open-report detection, report count, admin list/context/handle, the conversation's latest-report context (`store.service.ts:4619–4621,4654–4675,4680–4682`; `controllers.ts:2389–2430`) | keep report history across close/expiry/handling; experience deletion sets `experienceId` null, but conversation deletion cascades reports (`schema.prisma:837–859`). `matchId` is a nullable **string, not an FK** (`:845`): never read an unhydrated match array as permission to erase it. Fixture cleanup only by explicit reviewed ids. |

`PeerReputation` is **not in scope**. Suggestion scoring reads it (`store.service.ts:4215–4218`) while its legacy upsert/sweep remains (`mapper:1402–1418,2472–2473`). Its process-local staleness means a two-instance claim about peer **scoring** cannot be made merely because the five target models move.

---

## 3. The twelve design decisions

### 3.1 Source of truth
For each registered peer model, its PostgreSQL row is authoritative; response projections come from transaction results or fresh DB reads, never from mutable `StoreData` collections. Never return success for a peer mutation that only changed an array or emitted a notification.

### 3.2 Repository boundaries
Add **one** peer persistence service under `apps/api/src/`, wired in `app.module.ts`, exposing business operations and owner-scoped reads — not a `savePeerState` or whole-table copy. Keep route contracts, text limits, privacy gates and redaction at the service/controller boundary; put database ownership, status predicates, locks and transaction writes in the repository. Extend the zero-dependency registry (`direct-db-models.ts:1–18`) by the five entries **only when all reads/writers for an entry and its triple exit are ready**. Do not make `Batch1PersistenceService` a second peer-state writer; its targeted journey cleanup and notification operation are pre-existing cross-boundary work (`batch1-persistence.service.ts:601–629,2124–2130,2210–2217`).

### 3.3 Transaction boundaries
**Per-operation write scope is an acceptance constraint, not a suggestion:**

| Operation | Authoritative peer-table write set | Required condition |
| --- | --- | --- |
| Suggest | `PeerMatch` inserts only | owner-scoped journey; published non-self experience; unique requester/experience |
| Request | `PeerMatch` transition only | requester and `suggested` checked in DB |
| Accept / decline | `PeerMatch` transition only | experience owner and `requested` checked in DB |
| Consent | `PeerMatch` + `PeerConversation` in **one transaction** | both independently recorded consents, match accepted/not blocked, unique conversation by `matchId`; **blocked pending P0-1** |
| Message | one `PeerMessage` create | same transaction checks/locks participant conversation, active status and DB deadline |
| Report | one `PeerReport` create | same transaction validates participant conversation; **repeat/denormalisation decision outstanding (P0-2)** |
| Close | one `PeerConversation` transition | same transaction validates participant and expected active state |
| Block | `PeerMatch` + `PeerConversation` transition | atomic, so no blocked match retains a sendable active conversation |
| Experience submit/edit/review | target `PeerExperience` only | owner/status or administrator predicate, review status rules |
| Feedback with `shareLater` | `PeerConversation` feedback + optional `PeerExperience` create | atomic if both requested; a distinct operation, not "Message" |
| Admin report handling | `PeerReport` transition + existing `AuditLog` insert | one transaction if audit is promised as evidence; `AuditLog` is **not** migrated |
| Expiry | due `PeerConversation` transition only | DB-clock and status guard; notifications after committed state |

Reading/locking a parent row is permitted without re-persisting it. **Reverse the current notification-before-commit hazard**: request, consent and close currently call the notification writer before or separately from the peer flush (`store.service.ts:4423–4436,4465–4475,4338–4369`). Commit the peer transition first, then emit deterministic-id notifications without resetting read state (`batch1-persistence.service.ts:609–627`). If notification fails, expose/retry the partial delivery; **do not claim an atomic peer-plus-notification transaction that was not designed**. Batch 1's ordering lesson is authoritative (`BATCH1_DESIGN.md:153–189`).

### 3.4 Read path strategy
Indexed, owner-scoped DB queries with stable order and pagination. Convert every read inventoried in §2 **before** disabling its array; `peerRequestList` and the admin paths are currently synchronous (`store.service.ts:4478–4490`; `controllers.ts:2220–2276,2317–2430`) and must become awaited rather than returning empty projections. Build public DTOs from DB rows, retaining anonymity and output redaction (`store.service.ts:4114–4185,4502–4555`). A DB-only inserted row must appear through its authorised read without a reload, and a nonparticipant must not fetch it by guessed id.

### 3.5 Cache strategy
No authoritative or writable peer cache in Batch 2. In-memory `PeerReputation` and privacy reads may remain legacy dependencies but cannot be used as proof that a peer row does not exist (`store.service.ts:4081–4084,4215–4218,4505–4512`). A later cache is read-only, user-scoped, invalidated on commit, and excluded from FK/authorisation/deletion decisions.

### 3.6 Legacy compatibility
Preserve current HTTP shapes (`item`, `conversation`, `items`, anonymous `self`/`peer` authors) and status projections (`controllers.ts:564–649,807–855`; `store.service.ts:4140–4185`). Stop boot/worker-reload hydration per registered collection, including the legacy JSON/seed fallback (`store.service.ts:1372–1385,1388–1407,2233–2237`). A fallback file cannot become authority for a migrated peer table. Do not silently replace `connected` with `active`: acceptance and an active conversation are different facts.

### 3.7 Dual-write prevention
Registry membership must guard all five mapper upserts, all five sweeps and all five loader mappings (`mapper:108–109,126–128,516–554,718–762,1304–1401,2099–2165,2338–2419`). Remove peer `unshift`/in-place mutation followed by `persistAndFlush` as a commit action (`store.service.ts:3956–3958,4073–4074,4258–4262,4420–4436,4465–4475,4581–4583,4634–4644,4741–4747,4796–4798`). The legacy flush may continue for unrelated models but must execute **zero** inserts/upserts/updates/deletes against the five peer tables. Retain the narrowly scoped Batch 1 journey-FK detaches inside its archive/fixture transactions — explicit business operations, not a second snapshot writer.

### 3.8 Delete strategy
Remove the five `deleteAbsent` calls, not just their hydration (`mapper:2338–2340,2374–2377,2404–2419`); the empty-id implementation deletes **every row** (`:772–774`). Preserve archive semantics by detaching `PeerExperience.journeyId` and `PeerMatch.journeyId` inside the already-scoped Batch 1 deletion transaction; never treat missing peer arrays as a reason to delete experience, match or cascading conversation history. Convert browser-fixture cleanup's peer filtering to explicitly owned database ids; the filters at `store.service.ts:3130–3131` become ineffective once arrays are unhydrated, and the archive's later array detach (`:3415–3433`) must not be relied on for DB rows.

### 3.9 Reload strategy
`reloadRuntimeState` must neither reassign nor infer deletion of registered peer collections. It currently reloads full state and replaces `this.data` if this instance's mutation version is unchanged (`store.service.ts:1388–1407`) — that version is not a cross-instance database revision. Keep reload for unrelated legacy models, as Batch 1 does. Test reload followed by a legacy flush against a peer row committed by another instance.

### 3.10 Worker strategy
No peer expiry worker exists; expiry runs on list and participant-required operations (`store.service.ts:4371–4389,4558–4564`). Keep lazy expiry initially as an idempotent DB transition. If product requires guaranteed closure without traffic, specify and review a new scheduled invocation separately — do not call an unimplemented job "the expiry solution".

### 3.11 Failure semantics
Await the peer commit before returning success. Roll back all specified peer writes on failed ownership/status/FK/PII/transaction checks. A notification failure after commit leaves peer state committed and a **retryable missing notification**, not a rolled-back request. On AI failure, persist the `AIJob` failure without creating a message. A report-handling audit failure must not yield a handled report without the promised audit.

### 3.12 Concurrency semantics
Honour the **`User` → `LifeJourney` → `ActionCommitment` → child** lock hierarchy where a transaction touches the Journey graph, and lock multiple users/rows in deterministic id order (`BATCH1_DESIGN.md:225–245`). Peer transactions spanning requester and owner must establish a consistent sorted-`User.id` order **before** locking match/conversation rows, reconciled with the legacy flush's User-first order. After locking, re-read match/experience/participant/state/expiry **from the transaction**. Use expected-status conditional updates; the unique constraints prevent duplicate inserts but not state regression. `PeerReport` has **no** uniqueness for an open report by `(conversationId, reporterUserId)` (`schema.prisma:837–859`): serialize repeat-report decisions on the parent conversation or escalate if the invariant cannot be proved without a constraint. No row-lock argument counts as "proven" until two-client barrier races pass.

---

## 4. Reference-safety proof obligation

**Current verdict: REFUTED. Target verdict: NOT YET PROVEN.** Removing the five arrays today would make an unrelated legacy flush skip peer child upserts and issue five table-wide `deleteMany({})` sweeps. Adding five registry entries alone does not discharge the proof (`mapper:772–784,2338–2419`).

**Every FK/reference consumer:**
1. `PeerExperience.userId → User`; optional `journeyId → LifeJourney` (`schema.prisma:518–524`); legacy create/update uses `journeyIds` (`mapper:1304–1354`).
2. `PeerMatch.userId → User`, optional `journeyId → LifeJourney`, required `peerExperienceId → PeerExperience` (`schema.prisma:547–554`); the mapper's `peerExperienceIds` filters rows and `journeyIds` decides the optional FK (`mapper:876–881,1355–1401`).
3. `PeerConversation.matchId → PeerMatch`, starter/receiver → User (`schema.prisma:803–810`); mapper filters on `peerMatchIds`/`userIds` (`mapper:879–880,2099–2139`).
4. `PeerMessage.conversationId → PeerConversation`, sender → User (`schema.prisma:861–866`); mapper filters on `peerConversationIds`/`userIds` (`mapper:880,2140–2165`). A valid User FK does **not** prove participation.
5. `PeerReport.conversationId → PeerConversation`, optional `experienceId → PeerExperience`, reporter → User (`schema.prisma:837–847`); mapper uses `peerExperienceIdSet` for create/update (`mapper:876–881,2342–2373`). `matchId` is a nullable **string, not an FK** (`:845`).
6. Incoming relations: `PeerMatch` requires `PeerExperience`; `PeerConversation` requires `PeerMatch`; messages and reports require `PeerConversation` (`schema.prisma:540–541,553–554,566,805–806,827–828,839–840,843–844,863–864`). These are cascade/SetNull boundaries, **not** permission to prune a migrated parent from a stale snapshot.

**Every peer-touching absence sweep:** `PeerMessage` `mapper:2338–2341`; `PeerReport` `:2374–2377`; `PeerConversation` `:2404–2407`; `PeerMatch` `:2413–2416`; `PeerExperience` `:2417–2420`. All five must be skipped by the registry; their order does not make a stale-snapshot sweep safe.

**Every peer-FK id-set generation site:** `peerExperienceIds`, `peerMatchIds`, `peerConversationIds`, `peerExperienceIdSet`, `userIds` at `mapper:876–881`; `journeyIds` candidates include peer Journey FKs at `:906–926`. After registration no **remaining** legacy consumer found here needs a peer-target set — the peer-to-peer references are in the five migrated upserts themselves; remove those guards **with** the upserts, but **keep the non-peer `journeyIds` checks**. Business id sets also need replacement: suggestion's existing-experience set (`store.service.ts:4191–4196`), archive's linked-match set (`:3337–3338`), cleanup's journey/action sets and peer filtering (`:3060–3105,3130–3131`), journey-peer experience ids (`:3454–3466`).

**Mapper/reload/flush entry points:** `loadRelationalRuntimeState` queries and maps all five (`mapper:108–109,126–128,516–554,718–762`); `saveRelationalRuntimeState` builds the sets, upserts and sweeps (`:876–881,1304–1401,2099–2165,2338–2419`); store boot/`reloadRuntimeState`/`persist`/`flush` route legacy snapshots through them (`store.service.ts:1372–1407,2200–2237`). Existing Batch 1 archive and test-cleanup transactions also directly detach two peer Journey FKs (`batch1-persistence.service.ts:2124–2130,2210–2217`): retain and race-test them while removing the subsequent peer array detach as a write mechanism.

**Target safety condition.** Only after (a) all five triple exits, (b) direct DB replacements for every enumerated set/read/write, (c) transaction-scoped archive detaches and fixture deletes, and (d) tests injecting DB-only peer rows plus stale omitted references and competing legacy flushes can we say removing the arrays cannot silently clear a peer FK or delete a surviving peer row. **That is not proved at this HEAD.** As Batch 1 demonstrated, a valid FK with a stale snapshot that omits its field is a different test from an empty id set (`BATCH1_FINAL_GATE.md:12,22–24`). The existing `fkUpdate` already distinguishes omitted / explicit null / supplied reference (`mapper:776–784`); preserve that distinction at every remaining cross-boundary FK update.

---

## 5. Verification plan and Batch 2 gate

Per-spec leased databases deployed from tracked migrations, independent Prisma readers, two separately initialized API instances; no development database, no `db push`. The existing 11 independent peer cases establish useful single-instance behaviour (`tests/business/peer-support-stage.spec.ts:130–498`); they do **not** prove the new DB-authoritative two-instance or bilateral-consent invariants.

| Race | Required committed invariant |
| --- | --- |
| A/B accepting the same requested match simultaneously | exactly one acceptance transition; no duplicate conversation; no rollback from accepted/blocked |
| Duplicate request | exactly one `suggested → requested`; one durable notification identity; loser is an idempotent result or conflict |
| Duplicate consent | at most one conversation per `matchId`; never active before **both** recorded consents; repeat does not reset the deadline or regress state |
| Simultaneous messages | both persist once under distinct request identities; no lost insert, no author spoof, no AI auto-send |
| Close vs send | serial order observable: a send committed before close remains; a send after close commits nothing |
| Concurrent reports | one open report per reporter/conversation under the agreed policy; different reporters never overwrite; handled history remains |
| Expire vs send | no message committed at/after the DB deadline or after expired closure; prior messages survive |

Tests need strict rendezvous with failure on non-arrival, independent-client final-row assertions, a competing legacy flush and reload, ownership-negative cases, and a mutation that fails when each critical guard is removed. A successful non-overlapping run is not concurrency evidence.

**Required two-instance scenario:** A requests; B accepts; A consents; B consents; A and B alternate messages. After every step, query the **same PostgreSQL state** with an independent client and read it from both instances without restart. **This cannot currently pass as specified** because requester consent is rejected and the second consent is unrecordable (`store.service.ts:4444–4465`; `peer-support-stage.spec.ts:285–293`).

| Gate variable | Evidence needed | Present verdict |
| --- | --- | --- |
| `PEER_FULL_FLUSH=false` | SQL trace per operation plus a forced legacy flush: zero legacy upserts/updates and zero absence sweeps for all five | **Not established; the mapper currently flushes all five** |
| `PEER_DUAL_WRITER=false` | static writer inventory + traces showing the repository is the sole ordinary writer, with only the scoped Batch 1 FK detach | **Not established** |
| `PEER_STATE_MACHINE_PASS=true` | all eight logical states distinctly tested; `accepted != active`; two independently recorded consents before activation | **Blocked by P0-1** |
| `PEER_CONCURRENCY_PASS=true` | all seven races with strict barriers, independent final-row checks and mutation-sensitive guards; no unexpected `40P01`, duplicate, regression or lost update | **No Batch 2 evidence** |
| `PEER_MULTI_INSTANCE_SAFE=true` | the specified A/B flow, DB-only-row reads, competing flush/reload, archive detach, independent observer; claim restricted to the five models and tested paths | **Blocked by P0-1 and absent tests** |
| `PEER_SECURITY_PASS=true` | database-layer owner/participant predicates; nonparticipant read/send/close/report/assist tests; cross-user journey/experience ownership; admin separation; close/send race | **Not established for target** |
| `PEER_PII_PASS=true` | DB-row and HTTP assertions for every §1 redaction site, legacy/historic rows, feedback-derived experience fields and AI-generated draft output | **Not established; feedback-copy and AI-output questions open** |

`PERSISTENCE_BATCH2_STABLE=true` is permitted **only if every listed predicate is independently discharged** and the P0 escalations are approved and implemented under their own scope. Batch 1 acceptance does not confer Batch 2 approval.

---

## 6. Implementation boundary

**Permitted Batch 2 files, subject to gate approval:**
`direct-db-models.ts` (add exactly five entries) · `relational-runtime.mapper.ts` (five-model triple exits; remove peer-only FK-set assumptions) · `store.service.ts` (enumerated peer writers/readers, redaction, projections, archive/fixture compatibility, boot/reload isolation) · `controllers.ts` (enumerated peer/admin routes, awaits, dashboard counts, scoped audit coordination) · `monthly-report.service.ts` (peer counts and available months) · `batch1-persistence.service.ts` (**only** a necessary correction to its existing peer Journey-FK detach) · `app.module.ts` (provider wiring) · **one new** peer repository under `apps/api/src/`, plus targeted peer tests under `tests/business/`.

**Do not change** production/development database contents, **applied** migrations (a *new* migration is required and permitted — see §0.4/A2), unrelated Journey/Action behaviour, `PeerReputation`/privacy-setting/`AIJob`/`AuditLog`/`UserNotification` ownership, generic worker delivery, fixture/recovery scripts, or transaction timeouts.

`prisma/schema.prisma`, one new tracked migration, and the three peer mini-program views **are in scope** per §0.4/A2 — the earlier blanket ban on them is withdrawn.

The bilateral-consent change is **approved as part of Batch 2** (§0.1, §0.4/A2–A4): it is the missing half of a flow the product already promises. If implementation reveals it needs a product change beyond adding the requester's consent step — removing an existing step, or changing who may initiate — stop and escalate; that would be a genuine product decision. Report denormalisation is resolved in §0.2 and §0.4/A7: derived reads, one report insert, no silent extra writes.

**Review order:** P0 consent and report decisions → reference-safety review gate → one-model-at-a-time triple exit with DB-only read and negative ownership tests → race, multi-instance, PII, SQL-scope and regression evidence. Stop a model's switch on an unconverted array consumer, an unproved FK/deletion path, or a failed invariant. Do not use a writable mirror or a full flush to make a failing test appear to pass.
