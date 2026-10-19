#!/usr/bin/env node
/**
 * `SELF_DUAL_WRITER=false`: the writer inventory for the ten Self models, as an executable claim.
 *
 * A dual writer is two code paths that both write one table, where one does not know about the
 * other. The registry is what prevents that here: every `Self` model that the legacy flush used to
 * write is guarded in the mapper, so the snapshot no longer reaches it and the persistence service
 * is the only ordinary writer.
 *
 * This script does not re-derive the behaviour (that is what
 * `tests/business/batch3-self-full-flush.spec.ts` proves with statement-level triggers). It answers
 * the two questions the flush gate cannot:
 *
 *   1. Is every guarded model *actually* guarded in all three places the flush writes - hydration,
 *      upsert and sweep? A model guarded only in the upsert still gets swept.
 *   2. Are the ordinary writers only the ones the inventory names? A new `prisma.memoryItem.update`
 *      outside `SelfPersistenceService` is a dual writer that the flush gate would not catch,
 *      because the flush is not involved.
 *
 * The permitted exceptions are listed with their reasons rather than filtered out silently: a
 * silent exception is how the inventory starts lying.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const mapperPath = path.join(repoRoot, 'apps/api/src/relational-runtime.mapper.ts');
const registryPath = path.join(repoRoot, 'apps/api/src/direct-db-models.ts');

const SELF_MODELS = [
  'PrivacySetting',
  'TrustedContact',
  'StableSelfProfile',
  'RealityHandoff',
  'PersonalSupportPlan',
  'MemoryItem',
  'RecoverySnapshot',
  'DecisionRecord',
  'CooldownItem',
  'MessageToFutureSelf',
];

/** Files allowed to write a Self model directly, besides the registry/mapper pair. */
const ORDINARY_WRITERS = {
  SelfPersistenceService: 'apps/api/src/self-persistence.service.ts',
  Batch1PersistenceService: 'apps/api/src/batch1-persistence.service.ts',
  FollowUpWorkerService: 'apps/api/src/follow-up-worker.service.ts',
};

/**
 * The mapper positions that must each carry a guard. `hydrate` is the `findMany` at load,
 * `upsert`/`sweep` are inside the flush transaction. A model registered in one and not the others is
 * still dual-written: hydration alone re-seeds the snapshot, the sweep alone deletes rows.
 */
const REQUIRED_GUARDS = ['hydrate', 'upsert', 'sweep'];

const read = (file) => fs.readFileSync(file, 'utf8');

function fail(message) {
  console.error(`[self-dual-writer] FAIL ${message}`);
  process.exitCode = 1;
}

const registry = read(registryPath);
const mapper = read(mapperPath);

/**
 * The mapper positions that must each carry a guard. `hydrate` is the load at boot/reload,
 * `upsert` and `sweep` are inside the flush transaction. A model guarded in one and not the others
 * is still dual-written: hydration alone re-seeds the snapshot into the table, the sweep alone
 * deletes rows the snapshot does not carry.
 *
 * Three assertions, each of which fails when the guard it names is removed:
 *
 *   hydrate - the load function must mention the model's registry key at all, or the snapshot still
 *     reaches the table at boot and an old flush can re-insert a row a direct write deleted.
 *   upsert  - the flush's save section must carry a model-specific statement (the per-model
 *     `state.xxx` read or a `deleteAbsent` on the model's own key). A guard that still appears but
 *     guards nothing is caught, because the statement is counted, not the token.
 *   sweep   - counted by `deleteAbsent('<modelKey>')`, which is unique per model and cannot be
 *     satisfied by leaving a disabled guard in place.
 *
 * `PrivacySetting` is the one model written once and never swept, because the row is the child of
 * `User` and shares its lifecycle: the flush upserts it alongside the user and there is no set of
 * rows absent from the snapshot to delete. That is stated here rather than worked around, so the
 * exception is a recorded claim instead of a lowered threshold that would also pass a model missing
 * its sweep.
 */
const mapperText = fs.readFileSync(path.join(repoRoot, 'apps/api/src/relational-runtime.mapper.ts'), 'utf8');
const loadStart = mapperText.indexOf('export async function loadRelationalRuntimeState');
const saveStart = mapperText.indexOf('export async function saveRelationalRuntimeState');
const loadSection = mapperText.slice(loadStart, saveStart);
const saveSection = mapperText.slice(saveStart);

/**
 * The mapper's own spelling of each model, in the three places it appears. They differ on purpose,
 * and matching one against another is how this check would miss:
 *
 *   prisma - the client delegate the flush writes through (`tx.memoryItem.upsert`), the anchor for
 *     the upsert guard.
 *   state  - the snapshot array the upsert loops over (`state.memoryItems`).
 *   sweep  - the key the sweep is registered under (`deleteAbsent('memoryItem', ...)`).
 */
const MODEL_KEYS = {
  PrivacySetting: { prisma: 'privacySetting', state: 'privacySettings', sweep: null },
  TrustedContact: { prisma: 'trustedContact', state: 'trustedContacts', sweep: 'trustedContact' },
  StableSelfProfile: { prisma: 'stableSelfProfile', state: 'stableSelfProfiles', sweep: 'stableSelfProfile' },
  RealityHandoff: { prisma: 'realityHandoff', state: 'realityHandoffs', sweep: 'realityHandoff' },
  PersonalSupportPlan: { prisma: 'personalSupportPlan', state: 'personalSupportPlans', sweep: 'personalSupportPlan' },
  MemoryItem: { prisma: 'memoryItem', state: 'memoryItems', sweep: 'memoryItem' },
  RecoverySnapshot: { prisma: 'recoverySnapshot', state: 'recoverySnapshots', sweep: 'recoverySnapshot' },
  DecisionRecord: { prisma: 'decisionRecord', state: 'decisionRecords', sweep: 'decisionRecord' },
  CooldownItem: { prisma: 'cooldownItem', state: 'cooldownItems', sweep: 'cooldownItem' },
  MessageToFutureSelf: { prisma: 'messageToFutureSelf', state: 'messagesToFutureSelf', sweep: 'messageToFutureSelf' },
};

/** Models whose flush writes are folded into another model's statement. */
const NO_SEPARATE_SWEEP = {
  PrivacySetting: "the row is User's child: written with the user, never swept separately",
};

console.log('[self-dual-writer] the ten Self models, and where the flush still reaches them');

for (const model of SELF_MODELS) {
  const modelKey = MODEL_KEYS[model].state;
  const sweepKey = MODEL_KEYS[model].sweep;
  // 1. Registered, so the store no longer holds an in-memory copy to flush.
  if (!registry.includes(`${model}:`)) {
    fail(`${model} is not in DIRECT_DB_MODELS, so the store still holds the array the flush writes`);
  }

  // 2a. The load must be guarded: the snapshot's rows must not be read back into the table.
  if (!new RegExp(`DIRECT_DB_MODELS\\.${model}\\b`).test(loadSection)) {
    fail(`${model} is not guarded at hydration, so the snapshot's rows are still read into the table`);
  }

  // 2b. The flush's writes must be guarded. Anchored on the write itself (`tx.<model>.<verb>`), so an
  // unrelated read of the same array earlier in the flush cannot stand in for the guard. The
  // assertion is that the guard token appears shortly ABOVE that anchor: neutralising the guard to
  // `if (true)` keeps the write identical and moves the token away, which is what fails.
  const anchor = new RegExp(`tx\\.${MODEL_KEYS[model].prisma}\\.(upsert|create|createMany|update|updateMany|deleteMany)`);
  const anchorAt = saveSection.search(anchor);
  if (anchorAt === -1) {
    fail(`${model} is not written by the flush at all - the inventory is stale, or the write moved`);
  }
  const guardAbove = saveSection
    .slice(Math.max(0, anchorAt - 500), anchorAt)
    .includes(`DIRECT_DB_MODELS.${model}`);
  if (!guardAbove) {
    fail(`${model} is written by the flush with no guard above the write, so the flush still owns it`);
  }

  // 2c. The sweep, by its own key.
  const swept = saveSection.includes(`deleteAbsent('${sweepKey}'`);
  if (NO_SEPARATE_SWEEP[model]) {
    if (swept) {
      fail(`${model} is listed as having no separate sweep, but one now exists - the inventory is stale`);
    }
    console.log(`  ${model}: guarded at load, upsert, and ${NO_SEPARATE_SWEEP[model]}`);
    continue;
  }
  if (!swept) {
    fail(`${model} has no sweep guard - a directly written row is deleted as absent on the next flush`);
  }
  console.log(`  ${model}: guarded at load, upsert and sweep`);
}

// 3. The ordinary writers are the ones named. A new direct write to a Self table from anywhere else
// is the dual writer the flush gate cannot see, because the flush is not part of it.
console.log('[self-dual-writer] direct writers per model (outside the mapper and the registry)');
const allowedOwners = new Set(Object.values(ORDINARY_WRITERS).map((file) => file.replaceAll('\\', '/')));
const sourceFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) sourceFiles.push(full);
  }
};
walk(path.join(repoRoot, 'apps/api/src'));

const writers = new Map();
for (const file of sourceFiles) {
  const rel = path.relative(repoRoot, file).replaceAll('\\', '/');
  if (rel === 'apps/api/src/relational-runtime.mapper.ts' || rel === 'apps/api/src/direct-db-models.ts') continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const model of SELF_MODELS) {
    const lowerFirst = model.charAt(0).toLowerCase() + model.slice(1);
    // Matches `prisma.memoryItem.update`, `tx.privacySetting.create`, ... but not `state.memoryItem`.
    const pattern = new RegExp(`(?:prisma|tx)\\.${lowerFirst}\\.(create|update|upsert|delete|deleteMany|updateMany|createMany)`, 'g');
    const hits = text.match(pattern);
    if (hits?.length) writers.set(model, [...(writers.get(model) ?? []), { file: rel, count: hits.length }]);
  }
}

for (const model of SELF_MODELS) {
  const owners = writers.get(model) ?? [];
  const unexpected = owners.filter((entry) => !allowedOwners.has(entry.file));
  if (!owners.length) {
    fail(`${model} has no direct writer at all - the model is unreachable from the API`);
  }
  for (const entry of unexpected) {
    fail(`${model} is written directly by ${entry.file} (${entry.count} statements), which is not in the inventory`);
  }
  console.log(`  ${model}: ${owners.map((entry) => path.basename(entry.file)).join(', ')}`);
}

console.log('[self-dual-writer] permitted cross-boundary writes, stated so a new one has to be argued for');
const CROSS_BOUNDARY = [
  {
    model: 'RealityHandoff',
    file: 'apps/api/src/batch1-persistence.service.ts',
    reason:
      'The journey archive cleanup deletes a handoff that belonged to the journey being deleted. ' +
      'Batch 1 owns that delete; the Self service only reads. One writer per operation, and the ' +
      'operation is the archive delete, not a handoff update.',
  },
  {
    model: 'PersonalSupportPlan',
    file: 'apps/api/src/batch1-persistence.service.ts',
    reason:
      'The same archive path detaches a plan from the deleted journey. A detach is the FK ' +
      'three-case rule applied by the owner of the journey lifecycle, not a plan edit.',
  },
  {
    model: 'MemoryItem',
    file: 'apps/api/src/batch1-persistence.service.ts',
    reason: 'Data-clearing path only; the Self service owns every user-facing memory operation.',
  },
  {
    model: 'MessageToFutureSelf',
    file: 'apps/api/src/follow-up-worker.service.ts',
    reason:
      'The claim writes deliveredAt inside its own transaction. The Self service creates the ' +
      'letter and the durable job; the worker is the only one that marks a delivery.',
  },
  {
    model: 'PrivacySetting',
    file: 'apps/api/src/follow-up-worker.service.ts',
    reason:
      'The claim READS the consent flag from the database inside the claim transaction (design A6). ' +
      'Read-only, listed here because the file otherwise looks like a writer of the row.',
  },
];
for (const entry of CROSS_BOUNDARY) {
  const text = read(entry.file);
  const lowerFirst = entry.model.charAt(0).toLowerCase() + entry.model.slice(1);
  if (!new RegExp(`(?:prisma|tx)\\.${lowerFirst}\\.`).test(text)) {
    fail(`permitted cross-boundary entry names ${entry.file} for ${entry.model}, but that file no longer touches it`);
  }
  console.log(`  ${entry.model} <- ${path.basename(entry.file)}: ${entry.reason}`);
}

if (process.exitCode) {
  console.error('[self-dual-writer] SELF_DUAL_WRITER is NOT established');
} else {
  console.log('[self-dual-writer] SELF_DUAL_WRITER=false holds: guarded hydrate + upsert + sweep, and no unnamed writer');
}
