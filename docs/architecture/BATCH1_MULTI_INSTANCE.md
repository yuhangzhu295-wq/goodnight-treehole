# BATCH 1 MULTI-INSTANCE POSITION & VERIFICATION

Architectural definition, empirical proof, and boundary specification for multi-instance behavior across Batch 1 migrated models.

---

## 1. Multi-Instance Stance: Precision and Scope Boundary

The multi-instance position of the application following the Batch 1 persistence migration must be stated with precision and without hedging:

> **The eight migrated models (`LifeJourney`, `SituationSnapshot`, `JourneyUpdate`, `ActionCommitment`, `OutcomeCheckin`, `SafetyEvent`, `UserNotification`, `AIJob`) are multi-instance safe. The application as a whole is NOT multi-instance safe.**

Batch 1 removed in-memory store authority, legacy upserts, and absence sweeps for these eight models, binding their state exclusively to PostgreSQL interactive transactions and row-level locks. However, full application multi-instance readiness is blocked by architectural boundaries that deliberately remain outside Batch 1 scope.

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
