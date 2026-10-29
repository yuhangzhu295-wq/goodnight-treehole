# BATCH 1 CONCURRENCY REPORT

Consolidated concurrency report and evidence for the Batch 1 persistence migration (eight PostgreSQL-authoritative models), integrating empirical benchmark data from `BATCH1_BENCHMARK_AFTER.md` and verification proofs from the test suite.

---

## 1. Executive Summary

Batch 1 migrated eight domain models (`LifeJourney`, `SituationSnapshot`, `JourneyUpdate`, `ActionCommitment`, `OutcomeCheckin`, `SafetyEvent`, `UserNotification`, and `AIJob`) from whole-store in-memory hydration and flushes to direct, incremental PostgreSQL reads and writes.

Prior to this migration, concurrent mutations against the same entity caused severe connection pool exhaustion: at concurrency 5 and 10, the legacy store hydration (`loadRelationalRuntimeState()`) issued 43 parallel `findMany()` queries per coroutine, flooding the connection pool with 215–430 simultaneous queries and failing 80%–90% of requests with `FATAL: sorry, too many clients already`. Furthermore, uncoordinated locking between incremental writes and legacy flushes created cyclic wait-for dependencies that triggered PostgreSQL `40P01 (deadlock detected)` errors.

Under the Batch 1 architecture:
1. Every write operation against the migrated models executes with $O(1)$ flat statement cost (6 statements for journey mutation).
2. All transactions strictly observe the **lock-root hierarchy** (`User` → `LifeJourney` → `ActionCommitment` → child rows, with deterministic alphabetical sorting for multi-row operations).
3. Single-process concurrent coroutines achieve **100% success** (0 failures, 0 lost updates, 0 timeouts, 0 connection pool exhaustion errors) across 1, 5, and 10 concurrency levels.
4. Real concurrent races—including action creation racing legacy flush, conflicting batch cleanups, and multi-instance AI job terminal updates—execute with **zero deadlocks**.

---

## 2. Measured Concurrency Results

The empirical concurrency benchmark measures concurrent coroutines within a single Node.js process issuing simultaneous read-modify-write mutations against the exact same target row (`journey_concurrency_target`) in an isolated PostgreSQL database.

### 2.1 Concurrency Benchmark Metrics (AFTER vs. BEFORE)

| Coroutines (Concurrency) | Total Attempts | Successes | Failures | Lost Updates | Timeouts | Conn Closed / Pool Exhausted | Latency p50 (ms) | Latency max (ms) | Statements per Attempt |
| :----------------------- | :------------- | :-------- | :------- | :----------- | :------- | :--------------------------- | :--------------- | :--------------- | :--------------------- |
| **1 (AFTER)**            | 1              | 1 (100%)  | 0 (0%)   | 0            | 0        | 0                            | 22.0             | 22.0             | 6                      |
| **5 (AFTER)**            | 5              | 5 (100%)  | 0 (0%)   | 0            | 0        | 0                            | 70.4             | 91.4             | 6                      |
| **10 (AFTER)**           | 10             | 10 (100%) | 0 (0%)   | 0            | 0        | 0                            | 127.3            | 174.4            | 6                      |
| _5 (BEFORE Baseline)_    | 5              | 1 (20%)   | 4 (80%)  | Unverifiable | 0        | 4 (Pool exhausted)           | N/A              | N/A              | ~1,093+                |
| _10 (BEFORE Baseline)_   | 10             | 1 (10%)   | 9 (90%)  | Unverifiable | 0        | 9 (Pool exhausted)           | N/A              | N/A              | ~1,093+                |

*(Empirical source: `artifacts/persistence-benchmark-after-results.json` and `docs/architecture/BATCH1_BENCHMARK_AFTER.md` §4)*

### 2.2 Detailed Concurrency Sample Distributions

- **Concurrency 1**:
  - Durations: `[22.0 ms]`
  - p50: 22.0 ms, max: 22.0 ms
  - Statements per attempt: exactly 6 (`BEGIN`, `SELECT ... FOR UPDATE`, 3 `INSERT`/`UPDATE`, `COMMIT`)
- **Concurrency 5**:
  - Durations: `[53.0, 62.3, 70.4, 80.2, 91.4] ms`
  - p50: 70.4 ms, max: 91.4 ms
  - Statements per attempt: exactly `[6, 6, 6, 6, 6]`
- **Concurrency 10**:
  - Durations: `[85.0, 94.8, 104.2, 120.2, 127.3, 133.1, 147.8, 158.9, 162.7, 174.4] ms`
  - p50: 127.3 ms, max: 174.4 ms
  - Statements per attempt: exactly `[6, 6, 6, 6, 6, 6, 6, 6, 6, 6]`

### 2.3 Elimination of Connection Pool Flooding

- **BEFORE**: In the legacy architecture, any write triggered `loadRelationalRuntimeState()` or full `saveRelationalRuntimeState()`. Coroutines attempting concurrent writes each triggered 43 parallel queries, dumping hundreds of queries into Prisma's connection pool simultaneously. The pool was exhausted instantly, failing 80% to 90% of requests with PostgreSQL `FATAL: sorry, too many clients already`.
- **AFTER**: Coroutines no longer hydrate or flush the entire database. Each coroutine acquires a single pooled connection, obtains locks via the deterministic hierarchy, issues exactly 6 statements, and commits within 15–25 ms of active database time. The connection is promptly returned to the pool, resulting in 0 connection exhaustion errors, 0 timeouts, and 0 lost updates.

---

## 3. The Lock-Root Hierarchy

### 3.1 Architectural Definition

All transactions modifying or referencing the journey entity graph must acquire exclusive row locks (`SELECT ... FOR UPDATE`) according to the strict top-down hierarchy:

```
User (Root Lock)
  └── LifeJourney (Parent Lock)
        └── ActionCommitment (Child Lock)
              └── Dependent Rows (OutcomeCheckin, JourneyUpdate, SituationSnapshot, SafetyEvent, FollowUpJob)
```

For operations that lock multiple rows of the same table (such as batch cleanups, multi-journey deletions, or multi-user maintenance), row IDs must be locked in **deterministic alphabetical order** (`id ASC` / `.sort()`).

### 3.2 Root Cause Analysis: Why `User` Must Come First

During the implementation of sub-batch E, review round 5 (`commit 8ea7a2c`) diagnosed a recurring `PostgresError 40P01` deadlock in `first-batch-core-loop.spec.ts` during `POST /api/v1/journeys/:id/actions`.

The deadlock was caused by an insidious interaction between PostgreSQL foreign key locking semantics and the unmigrated legacy flush:

1. **PostgreSQL FK Key-Share Locks**: In PostgreSQL, inserting or updating any row that contains a foreign key referencing `User` (e.g., `ActionCommitment.userId`, `JourneyUpdate.userId`, `Mood.userId`) takes an implicit `FOR KEY SHARE` row lock on that `User` row to prevent the referenced user from being deleted or having its primary key modified concurrently.
2. **The Legacy Flush Order**: The legacy flush (`saveRelationalRuntimeState`) writes the `User` table first, and then writes foreign-key-referencing legacy tables (`Mood`, `Post`, `PeerExperience`, etc.). While writing `User`, the flush transaction holds an exclusive row lock on `User`.
3. **The Cyclic Wait-For Graph**:
   - **Transaction 1 (Action Creation)**: Acquired an exclusive lock on `LifeJourney` (`SELECT id FROM "LifeJourney" WHERE id = $1 FOR UPDATE`), and then attempted to insert `ActionCommitment`, which requested a `KEY SHARE` lock on `User`.
   - **Transaction 2 (Legacy Flush)**: Acquired an exclusive lock on `User`, and then attempted to flush rows referencing `LifeJourney`, which required a lock or validation on `LifeJourney`.
   - **Cycle**:
     - Transaction 1 held `LifeJourney`, waiting for `User`.
     - Transaction 2 held `User`, waiting for `LifeJourney`.
     - Result: `40P01 (deadlock detected)`.

By establishing `User` as the mandatory root lock:
- Any transaction writing to the journey graph locks `SELECT id FROM "User" WHERE id = $1 FOR UPDATE` *before* taking `LifeJourney`.
- Both the direct write transaction and the legacy flush serialize on the `User` row lock.
- The cyclic wait-for graph is broken at the root.

### 3.3 Scope and Lifetime of the Rule

The `User` root lock is an architectural precondition required as long as the legacy store flush exists and writes `User` prior to other tables. Once the remaining 35 legacy models are fully migrated to direct database writes in subsequent batches and the legacy store flush is retired, the lock hierarchy can be re-evaluated and simplified.

---

## 4. Evidence of Load-Bearing Ordering

The lock-root hierarchy and deterministic sorting are not theoretical conventions; they are actively verified by targeted tests in the test suite.

### 4.1 Mutation Proof: Reproducing `40P01` by Inverting Lock Order

`tests/business/batch1-action.spec.ts` contains an intentional mutation test (`P0-Lock mutation check: inverting lock order between Action and Journey reproduces 40P01 deadlock`):
- Two independent Prisma clients execute concurrent transactions against the same database:
  - Transaction 1 locks `ActionCommitment` first, then attempts to lock `LifeJourney`.
  - Transaction 2 locks `LifeJourney` first, then attempts to lock `ActionCommitment`.
- A synchronized barrier ensures both transactions hold their first lock before either attempts its second lock.
- **Observed Result**: PostgreSQL detects the inverted lock order, detects the cyclic dependency, and aborts one of the transactions with:
  ```
  PostgresError: deadlock detected (40P01)
  ```
- This confirms that without the strict hierarchy, concurrent operations on these tables reliably deadlock.

### 4.2 Race 1: Action Creation Racing Legacy Flush (Root Lock Proof)

`tests/business/batch1-action.spec.ts` (`P0-RootLock discriminating test`):
- Concurrently executes `store.createActionCommitment` (direct PostgreSQL write under the `User` → `LifeJourney` hierarchy) and `saveRelationalRuntimeState` (legacy flush writing `User` and upserting `Mood` with `journeyId`).
- Prior to the `User` root lock, this exact race caused the core loop deadlock (`8ea7a2c`).
- **Observed Result**: Both operations serialize cleanly on the `User` root lock; zero `40P01` errors occur; both transactions commit successfully.

### 4.3 Race 2: Conflicting Multi-Journey Cleanups (Deterministic Sort Proof)

`tests/business/batch1-action.spec.ts` (`P0-CleanupOrder discriminating test`):
- Two cleanup requests target overlapping journey sets in inverted order: `[journeyA, journeyB]` vs. `[journeyB, journeyA]`, where `journeyA` belongs to `user1` and `journeyB` belongs to `user2`.
- `deleteJourneysForTestCleanup` sorts `distinctUserIds` and `sortedJourneyIds` deterministically before acquiring row locks.
- A synchronized barrier ensures competing locks are held mid-transaction.
- **Observed Result**: With deterministic sorting enabled, transactions serialize cleanly with zero deadlocks. When sorting is removed, the opposing lock acquisitions trigger `40P01`.

### 4.4 Race 3: Action Check-In Racing Archive Deletion

`tests/business/batch1-action.spec.ts` (`P0-Lock discriminating test`):
- Concurrently dispatches `store.checkinAction` (which modifies action and check-in) and `persistence.deleteJourneyArchive` (which deletes journey and detaches/deletes children).
- Both operations follow the `User` → `LifeJourney` → `ActionCommitment` order.
- **Observed Result**: Zero `40P01` deadlocks; delete completes cleanly; check-in serializes without data corruption.

### 4.5 Race 4: Multi-Instance AI Job Terminal Race

`tests/business/batch1-aijob.spec.ts` (test 3 and test 10):
- Two application instances race to finalize the same `running` AI job with competing terminal states (`succeeded` vs. `fallback`).
- The transition is protected by database status CAS (`WHERE id = $1 AND status IN ('queued', 'running')`).
- **Observed Result**: Exactly one instance wins the update; the other returns `updated: false`; zero database deadlocks or inconsistent states.

---

## 5. Scope Boundary: What Is NOT Verified

To maintain strict architectural honesty, the boundaries of this concurrency verification are stated plainly:

1. **Single-Process Coroutine Concurrency Only**:
   The measured concurrency benchmarks (concurrency 1, 5, 10) were executed within a single Node.js runtime process utilizing asynchronous event-loop coroutines against a local PostgreSQL server.
2. **No Multi-Node Distributed Concurrency**:
   These tests do not measure distributed multi-node cluster contention, distributed network latency spikes, cross-node lock delays, or database connection pool contention across horizontally scaled API clusters.
3. **No External Multi-Client High-Sustained Concurrency**:
   High-concurrency sustained traffic under thousands of concurrent HTTP clients with network jitter and distributed barrier races has not been measured.
4. **FollowUpJob Mirror Asymmetry**:
   `FollowUpJob` remains outside Batch 1 direct DB models. The in-memory mirror `store.data.followUpJobs` remains a second read input, meaning cross-coroutine worker deliveries can leave in-memory graduation counts temporarily inconsistent until reload.

---

## 6. Summary Checklist

- [x] Concurrency 1 / 5 / 10 benchmarks measured: 100% success, 0 lost updates, 0 timeouts, 0 connection errors.
- [x] Flat $O(1)$ statement cost verified (6 statements per attempt).
- [x] Lock-root hierarchy (`User` → `LifeJourney` → `ActionCommitment`) fully documented.
- [x] Key-share lock and `User` ↔ `LifeJourney` cycle explained.
- [x] Deterministic ID sorting for multi-row operations verified.
- [x] Mutation test reproducing `40P01` documented.
- [x] Real concurrent operation races documented with 0 deadlocks.
- [x] Single-process vs. distributed scope boundary explicitly declared.
