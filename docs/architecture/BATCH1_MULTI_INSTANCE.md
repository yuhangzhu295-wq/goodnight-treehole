# BATCH 1 MULTI-INSTANCE POSITION & VERIFICATION

Architectural definition, empirical proof, and boundary specification for multi-instance behavior across Batch 1 migrated models.

---

## 1. Multi-Instance Stance: Precision and Scope Boundary

The multi-instance position of the application following the Batch 1 persistence migration is stated with empirical precision, verified flow-by-flow across two independent application instances sharing the same PostgreSQL database:

> **Multi-instance safety is proven per migrated business flow for the eight Batch 1 models (`LifeJourney`, `SituationSnapshot`, `JourneyUpdate`, `ActionCommitment`, `OutcomeCheckin`, `SafetyEvent`, `UserNotification`, and `AIJob`). The application as a whole remains NOT multi-instance safe because 35 unmigrated models remain authoritative in process memory.**
>
> Following the gate feedback (`BATCH1_FINAL_GATE.md`), controlled two-instance shared-database race tests were implemented in `tests/business/batch1-multi-instance.spec.ts` covering every migrated flow against competing operations, legacy flushes, and instance restarts. All eight migrated models hold their concurrency, non-regression, and deadlock-free properties.
>
> **The stale-snapshot foreign-key defect is now fixed.** An earlier version of this document recorded that when an unmigrated legacy model (`Mood`, `Post`, `Diary`, …) had a valid `journeyId` in the database while another instance flushed a stale snapshot omitting that field, the mapper silently nulled the committed foreign key. That is closed: the update branch now distinguishes an **omitted** field (`undefined` — the snapshot has no opinion, so the committed value survives) from an **explicit detach** (`null`) from a **supplied reference** (a string, validated against the in-transaction existence check). Applied to `journeyId` on the 12 legacy models that shared the vulnerable expression and to the other guarded FKs, verified by `batch1-multi-instance.spec.ts` Test 8 for all three outcomes and mutation-tested. The remaining reason the full application is not multi-instance safe is the process-local store itself — 35 unmigrated models whose state on instance A is invisible to instance B until a reload — not foreign-key loss.

Batch 1 removed in-memory store authority, legacy upserts, and absence sweeps for these eight models, binding their state exclusively to PostgreSQL interactive transactions, conditional CAS updates, and the global row-lock hierarchy (`User` -> `LifeJourney` -> `ActionCommitment`).

---

## 2. AIJob Lifecycle: Stale-Only Boot Recovery

### 2.1 The Pre-Existing Flaw in Boot Recovery

Prior to commit `686c004`, `StoreService.onModuleInit()` called `recoverInterruptedAiJobs()`, which executed an unconditional database mutation:
```sql
UPDATE "AIJob"
SET status = 'failed'
WHERE status IN ('queued', 'running');
```
In a single-instance development environment, this cleanly reaped orphaned jobs left behind when a process was terminated abruptly (e.g. `Ctrl+C`). In a multi-instance production environment, however, this logic was destructive: whenever Instance B booted (due to auto-scaling, deployment rolling restart, or crash recovery), it immediately marked all active, in-flight jobs on Instance A as `failed`, breaking active user requests.

### 2.2 Stale-Only Recovery Architecture

`recoverInterruptedAiJobs` has been redesigned as a **database-driven, stale-only recovery mechanism** based on a 5-minute staleness window (`DEFAULT_AI_JOB_STALENESS_MS = 300,000 ms`, configurable via `AI_JOB_STALENESS_MS`):

```ts
const staleBefore = new Date(Date.now() - stalenessThresholdMs);

const staleJobs = await this.prisma.aIJob.findMany({
  where: {
    status: { in: ['queued', 'running'] },
    updatedAt: { lte: staleBefore },
  },
});
```

A job is only failed on boot if its `updatedAt` timestamp is older than `Date.now() - 5m`.

### 2.3 Justification of the 5-Minute Window

The 5-minute threshold is derived from empirical runtime characteristics:
1. **Provider Request Timeout**: Individual external AI provider HTTP calls (DAPI or LLM upstream) enforce strict timeouts of 30–60 seconds per request.
2. **Retry Candidate Ceiling**: The AI routing layer attempts a primary provider and, upon failure or timeout, proceeds through configured fallback providers (typically 2–3 attempts with exponential backoff). The maximum wall-clock duration for all candidate attempts does not exceed 2–3 minutes.
3. **Client Polling / Wait Ceiling**: Synchronous client waiting routines (`waitForAiJob`) enforce a timeout ceiling of 30–60 seconds. Background tasks complete within 2–3 minutes.
4. **Observable In-Flight Progression**: While a job is `running`, the executing instance periodically writes progress events to PostgreSQL via `recordJobProgress(id, traceEntry)` (e.g. `provider-attempt-started`, `provider-attempt-failed`). Each progress record updates `traceJson` and touches `updatedAt = new Date()`.
5. **Conclusion**: An active job continuously advances `updatedAt`. A job whose `updatedAt` is older than 5 minutes has definitively halted due to an unhandled crash or dead process.

---

## 3. Two-Instance Empirical Proof

Multi-instance safety for the migrated models is proven through automated tests in `tests/business/batch1-aijob.spec.ts` (tests 9 and 10), executed against two independent application instances (`appA` and `appB`) connecting to the same PostgreSQL database:

### 3.1 Non-Interference During Boot (`batch1-aijob.spec.ts` Test 9)

1. **Instance A Starts Active Job**:
   Instance A creates an `AIJob`, transitions it to `running`, and records observable progression (`recordJobProgress` with `provider-attempt-started`), updating `updatedAt`.
2. **Simulate Stale Dead-Instance Job**:
   A separate orphaned job is created in the database and backdated past the 5-minute threshold (`updatedAt = now - 10m`).
3. **Instance B Boots**:
   Instance B initializes against the same database, executing `StoreService.onModuleInit()` → `recoverInterruptedAiJobs()`.
4. **Verified Assertions**:
   - **Active Job Survives**: Instance A's running job remains `running` in PostgreSQL; it is NOT failed by Instance B's boot.
   - **Active Job Completes**: Instance A subsequently completes the job to `succeeded` (`updateJobTerminal`). The terminal write succeeds (`updated: true`) and persists.
   - **Stale Job Reaped**: The genuinely stale 10-minute-old job is transitioned to `status: 'failed'`, with `reason: 'stale-job-recovered-by-service-restart'` recorded in `traceJson`.

### 3.2 Terminal State Race Resolution (`batch1-aijob.spec.ts` Test 10)

1. **Concurrent Terminal Writes**:
   Instance A and Instance B concurrently attempt conflicting terminal updates on the same in-flight job (Instance A writes `succeeded`, Instance B writes `fallback`).
2. **Database CAS Protection**:
   `updateJobTerminal` executes inside an interactive transaction guarded by:
   ```sql
   WHERE id = $1 AND status IN ('queued', 'running')
   ```
3. **Verified Assertions**:
   - Exactly one instance wins the update (`updatedCount = 1`).
   - The losing instance receives `updated: false` without throwing an unhandled exception or corrupting state.
   - The final database row reflects exactly one winner (`succeeded` or `fallback`), with consistent duration and completion timestamp.

### 3.3 Comprehensive Two-Instance Shared-Database Verification (`batch1-multi-instance.spec.ts`)

To discharge the gate's requirement, controlled two-instance, shared-database races were implemented across all migrated business flows in `tests/business/batch1-multi-instance.spec.ts`. All assertions verify committed rows from an **independent** Prisma client:

1. **Journey Concurrent Patching (Test 1)**:
   - **Race**: Instance A patches `title`, Instance B concurrently patches `summary` on the same `LifeJourney`.
   - **Outcome**: **HOLDS**. PostgreSQL row-level locks serialize the transactions without deadlocks (`40P01`). Both `title` and `summary` persist in the database without lost fields.
2. **Journey AI Completion vs User Confirmation (Test 2)**:
   - **Race**: User confirmation on Instance A (`confirmSituation`, `confidence: 'user_confirmed'`) races background AI completion on Instance B (`applySituationAnalysisAiCompletion`).
   - **Outcome**: **HOLDS**. The commit-time condition (`confidence: { not: 'user_confirmed' }`) and CAS guard prevent the AI completion from overwriting user-confirmed facts, feelings, or summary. User-confirmed content survives.
3. **Action + Checkin Concurrent Transitions (Test 3)**:
   - **Race**: Instance A submits `completed` check-in while Instance B concurrently submits `skipped` check-in on the same `ActionCommitment`.
   - **Outcome**: **HOLDS**. Row locks on `User` -> `LifeJourney` -> `ActionCommitment` plus CAS on `OutcomeCheckin` (`where: { status: 'pending' }`) ensure exactly one transition occurs. Exactly one terminal `OutcomeCheckin` exists in PostgreSQL.
4. **SafetyEvent Creation vs Archive/Detach (Test 4)**:
   - **Race**: High-risk `SafetyEvent` creation on Instance A races `deleteJourneyArchive` on Instance B.
   - **Outcome**: **HOLDS**. When the safety event is created on an active journey, `deleteJourneyArchive` explicitly detaches it (`journeyId = null`), allowing the high-risk audit record to survive in PostgreSQL. If the journey has already been deleted, PostgreSQL foreign-key constraints prevent attaching a safety event to a non-existent journey. In no case does a safety record end up referencing a deleted journey.
5. **UserNotification Delivery Retry vs Mark-Read (Test 5)**:
   - **Race**: Worker delivery retry on Instance A overlaps mark-read on Instance B.
   - **Outcome**: **HOLDS**. A `StrictBarrier` ensures both operations execute concurrently. The test verifies delivery idempotency and read-state preservation: duplicate worker delivery does not revert the notification's status from `read` back to `unread`, and exactly one notification row persists in PostgreSQL. This is proven by mutation testing (forcing the duplicate delivery to overwrite status via `upsert({ status: 'unread' })` fails the assertion). It proves read-state idempotency and non-reversion under concurrent execution, and does not claim row-lock blocking contention between the duplicate insert (`createMany({ skipDuplicates: true })`) and the reader.
6. **Legacy-Flush Competition with Migrated Writes (Test 6)**:
   - **Race**: Instance A creates `Journey` + `SituationSnapshot` + `JourneyUpdate` while Instance B executes a full legacy flush (`saveRelationalRuntimeState`).
   - **Outcome**: **HOLDS**. No `40P01` deadlock occurs. A `StrictBarrier` verifies that both transactions hold row locks in PostgreSQL simultaneously before proceeding. Because legacy upserts and absence sweeps for the eight models are guarded off by `DIRECT_DB_MODELS`, the migrated rows and their foreign keys survive intact.
7. **Restart / Reload State Safety (Test 7)**:
   - **Race**: Instance A commits a new journey; Instance B executes `store.reloadRuntimeState()` strictly within Instance A's open commit window and subsequently calls `persistAndFlush()`.
   - **Outcome**: **HOLDS**. Reload only reads PostgreSQL without seeing uncommitted rows, and absence sweeps for migrated models are absent, so Instance B's flush does not revert or delete rows committed by Instance A.
8. **Stale-Snapshot Foreign-Key Preservation (Test 8 — Resolved)**:
   - **Scenario**: Legacy model `Mood` has `journeyId = null` when Instance B loads state. Instance A (or direct write) sets a valid `journeyId`. Instance B subsequently flushes a snapshot where `journeyId` was omitted (`undefined`).
   - **Outcome**: **RESOLVED**. The legacy mapper now distinguishes snapshot omission (`undefined`, which omits the FK column from update, keeping the database committed value) from explicit detach (`null`, which clears the FK) across all 12 unmigrated models with `journeyId` relations (`Mood`, `Post`, `Diary`, `PeerExperience`, `PeerMatch`, `DecisionRecord`, `RealityHandoff`, `MessageToFutureSelf`, `PersonalSupportPlan`, `MemoryItem`, `RecoverySnapshot`, `AgentDecisionLog`), while `FollowUpJob` retains its existing-row preservation path. Test 8 proves that the valid committed foreign key survives stale snapshot flushes, and also verifies explicit detach and valid update.

---

## 4. Scope Boundary: The Two Unmigrated Blockers

Multi-instance safety is **strictly confined to the eight Batch 1 models**. The application cannot be deployed in a multi-instance production cluster due to two blockers outside Batch 1 scope:

### Blocker 1: The `followUpJobs` In-Memory Mirror
- `FollowUpJob` is not a registered `DIRECT_DB_MODELS` entity in Batch 1.
- While worker deliveries write directly to PostgreSQL and claim jobs with CAS, `StoreService.data.followUpJobs` remains an in-memory mirror.
- Domain features such as journey graduation count completed follow-ups by querying the in-memory array (`store.data.followUpJobs`, `store.service.ts:3915`).
- **Consequence**: When Instance A delivers a follow-up job in PostgreSQL, Instance B's in-memory mirror remains unaware until `reloadRuntimeState()` or server restart. A user requesting graduation on Instance B may see stale follow-up counts.

### Blocker 2: 35 Unmigrated Models in the Process-Local Store
- 35 models (`Mood`, `Post`, `Reply`, `Letter`, `Diary`, `PeerExperience`, `PeerMatch`, `DecisionRecord`, `MessageToFutureSelf`, `CooldownItem`, etc.) remain authoritative in `StoreService.data`.
- Mutations to these models update process memory and trigger a full store flush (`saveRelationalRuntimeState`).
- **Consequence**:
  - A write to an unmigrated model on Instance A is invisible to Instance B.
  - If Instance B subsequently executes a flush, it flushes its own stale in-memory snapshot, overwriting Instance A's database changes.
  - Absence sweeps for unmigrated models on Instance B will delete rows created by Instance A.

Until all remaining models are migrated off `StoreService` to direct database persistence, the application runtime requires a single authoritative writer process.

---

## 5. Residual Risks

Even within the migrated Batch 1 models, two residual operational risks exist:

### Risk 1: Wall-Clock Skew Between Instances
Because the 5-minute staleness window is calculated via local process wall-clock time (`Date.now() - stalenessThresholdMs`):
- If the system clock of Instance B drifts forward relative to Instance A (e.g. Instance B is >5 minutes ahead of Instance A due to unsynchronized NTP), Instance B booting could calculate a threshold that encompasses Instance A's active jobs, incorrectly marking them stale.
- **Mitigation**: Production environments must enforce strict NTP / PTP synchronization across all container hosts.

### Risk 2: Long-Running Jobs Without Progress Writes
If a future AI task type requires extended execution (e.g. complex multi-step reasoning, large document analysis, or slow external model generation taking >5 minutes) without emitting periodic `recordJobProgress` updates:
- Its `updatedAt` timestamp will remain static.
- An instance rebooting after 5 minutes would judge the job stale and transition it to `failed`.
- **Mitigation**: Any job exceeding 2 minutes must implement heartbeat progress reporting via `recordJobProgress` during chunk processing or candidate iterations, or configure a task-specific `stalenessThresholdMs`.

---

## 6. Summary Checklist

- [x] Stale-only recovery architecture documented (5-minute window on `updatedAt`).
- [x] Staleness window justification established (provider timeouts, retry candidates, wait ceiling).
- [x] Observable progression via `recordJobProgress` documented.
- [x] Two-instance proof documented (non-interference on boot, stale job recovery, CAS terminal race).
- [x] Scope boundary stated plainly: migrated models are safe; application is not.
- [x] Two blockers outside Batch 1 named: `followUpJobs` in-memory mirror and 35 unmigrated models.
- [x] Residual risks identified: clock skew and long-running jobs without progress updates.
