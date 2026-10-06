# Persistence Batch 3 — Self System Design

**Status: DESIGN GATE NOT PASSED as written — the four escalations below are resolved by orchestrator decision in §0.4, and implementation proceeds on that basis.**
**Reviewed checkout:** branch `codex/post-recovery-validation`, HEAD `a004541`. Read-only review; no database, migration, worker or concurrency test was run.

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

### S3 — Decision: `outcome` becomes a real transition, matching the UI *(P0-DECISION)*

The plan names six states. Today only `cooling→ready`, `ready→decided`, `decided→archived` are reachable; `outcome` is a **text field, not a status**, and `updateDecision` can change `decision`/`outcome` with no state transition (`store.service.ts:5398–5425`).

**Decision — implement the reviewed `decided → outcome → archived` transition.** The mini-program already has the user-facing step: the decision vault's post-cooldown flow ends with **"保存结果并归档"** (save the result and archive). So `outcome` is the missing *state*, not a missing *feature* — the same shape as Batch 2's unilateral-consent defect. Entering `outcome` requires the outcome text; `archived` follows it.

Also decided: **cooldown readiness is a database-time transition.** A list must not age decisions by flushing other models; the deadline comparison happens in the transaction against database time, so two instances cannot disagree about `ready`.

**Repeated cooldowns for one decision: the current behaviour is kept** (another cooling cooldown is permitted, `store.service.ts:5452–5469`) but the races must prove a **stale worker cannot set a superseded decision ready early**. If the tests cannot establish that, it escalates rather than being assumed.

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
| Decision create/edit/transition | one `DecisionRecord`; `cooling→ready` and `decided→outcome→archived` are DB-clock-guarded transitions |
| Cooldown create | one `CooldownItem` + optional linked `DecisionRecord` + one existing `FollowUpJob`, atomic; schedule Redis **after** commit |
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

**Worker strategy.** Target: the transaction commits `MessageToFutureSelf` + its pending `FollowUpJob` first; the deterministic job id equals the durable follow-up id; enqueue only after commit. On enqueue error the DB job stays pending and a **bounded startup and periodic reconciler** re-enqueues idempotently. `removeOnComplete:false` (`follow-up-queue.ts:25–29`) requires an explicit policy for reconciling an already-completed BullMQ id — do not assume `Queue.add` recreates it. A `delivered` row missing its notification is reconciled separately, never regressed to pending. The worker loads the current DB job rather than trusting a stale payload.

**Failure semantics.** HTTP success requires its specified DB write to commit. DB-commit/Redis-failure is a **pending durable scheduling obligation**, not a rolled-back message. A delivered message with a missing notification is a retryable notification obligation. A failed graduation-derived insert rolls back graduation if that history was promised. AI context selection fails **closed** on missing or revoked consent.

**Concurrency.** Preserve `User → LifeJourney → ActionCommitment → child`, locking multiple rows of each level in deterministic id order. For a Self write with a Journey FK: lock owned `User`, then the Journey, then the Self child; check FK and owner **inside** that transaction. FutureSelf referencing a decision/recovery row locks `User` then the target Self row in a stable order. Delivery touching message/decision/cooldown locks `User` first, then the affected Self rows in a documented order, then `FollowUpJob` — reconciled with Batch 1's action-follow-up order. Privacy revocation and an AI-context gate must serialize at the `User`/privacy boundary or use an equivalent commit-time predicate. Use conditional status updates or `updatedAt` CAS, never stale-object whole-row upserts.

---

## 3. Reference safety — verdict

**Current: REFUTED if the arrays are removed without the conversions above. Target: NOT YET PROVEN.**

1. **Incoming references.** Every registered Self row except `CooldownItem` and `StableSelfProfile` has a `User` FK; the latter two and privacy are unique per User (`schema.prisma:229–249,587–739`). Nullable Journey FKs exist on Decision, Handoff, FutureSelf, SupportPlan, Memory and Recovery. `CooldownItem.decisionId` references `DecisionRecord` with `onDelete:SetNull` (`:617–618`). FutureSelf `contextRefId` is a **plain string** (`:665–667`), as are the worker payload ids. None may be cleared because a snapshot lacks its source row.
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

| Gate | Evidence needed | At reviewed HEAD |
| --- | --- | --- |
| `SELF_FULL_FLUSH=false` | SQL trace per operation + forced legacy flush: no snapshot writes/sweeps on the ten tables | **Not established** |
| `SELF_DUAL_WRITER=false` | complete writer inventory, permitted cross-boundary detaches, worker cutover, SQL trace | **Not established** |
| `MEMORY_STATE_PASS=true` | four eligibility predicates, the explicit consent/reactivation/deletion contract, expiry/revocation races and guard mutations | **Blocked by S2 (now decided)** |
| `DECISION_STATE_PASS=true` | reviewed six-state meaning incl. `outcome`, DB-time deadline transition, worker/manual/cooldown races and mutations | **Blocked by S3 (now decided)** |
| `FUTURE_SELF_QUEUE_PASS=true` | DB/Redis fault injection, periodic reconciliation, restart, duplicate worker, post-claim crash, final-row checks | **Not established** |
| `PRIVACY_PASS=true` | DB-authoritative settings; the S4 disclosure decision and its negative tests; owner/safety/AI reads under revocation | **Blocked by S4 (now decided)** |
| `MULTI_INSTANCE_SELECTED_FLOWS_PASS=true` | the strict-barrier races above, independent-client rows, DB-only reads, stale flush/reload | **No Batch 3 evidence** |

`PERSISTENCE_BATCH3_STABLE=true` only when all seven hold, the escalations are adjudicated (done here), and an independent review accepts the implementation. This is a **selected Self-flow** claim — not application-wide multi-instance safety, live-AI verification, or any visual/pet-presence result.

---

## 5. Implementation boundary

**Permitted after approval:** `direct-db-models.ts`, `relational-runtime.mapper.ts`, `store.service.ts`, `controllers.ts`, `monthly-report.service.ts`, `follow-up-worker.service.ts`, `follow-up-queue.ts`, `app.module.ts`, one new Self persistence/reconciliation service (or a separately justified narrow pair), `batch1-persistence.service.ts` **only** for an identified atomic graduation/RecoverySnapshot insert or a necessary correction to its existing Self-FK detaches, and targeted Self tests under `tests/business/`. The admin views may change for §0.4/S4.

**Migration decision.** A DB-time Decision transition, Recovery history and durable FutureSelf scheduling need **no** new migration — current columns and the existing `FollowUpJob` index suffice, and `MemoryItem.status` is already `String`, so a `deleted` spelling needs none. A **new tracked migration is required only if** the approved policy demands a database-enforced constraint or new field (a partial unique active-plan constraint, a per-message queue marker, or re-consent metadata `consentedAt` cannot represent). Never edit an applied migration.

**Must not change:** ownership or behaviour of the eight Batch 1 or five Batch 2 models, general Peer/AI/legacy content, applied migrations, production/development data, fixture/recovery scripts, the transaction timeout, or mini-program presentation as an incidental persistence fix. A genuinely required Self UI/API contract change — particularly explicit memory re-consent, and the §0.4/S4 admin disclosure change — is named here rather than smuggled in.

**Review order:** product decisions (done, §0.4) → reference-safety approval → atomic Decision/Cooldown and FutureSelf/worker boundaries → individual triple exits and DB-only reads → privacy/admin disclosure → strict-barrier races, fault injection and SQL-scope measurement → independent Batch 3 gate.
