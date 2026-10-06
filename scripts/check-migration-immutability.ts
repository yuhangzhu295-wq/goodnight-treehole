import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Expected baseline migrations and their SHA-256 checksums,
 * as verified and recorded in docs/architecture/MIGRATION_FORENSICS.md.
 * Existing migrations are immutable: once committed, they must never be edited.
 */
export const BASELINE_MIGRATIONS: Record<string, string> = {
  '20260712000000_runtime_state': '202b73ce0ff759b047f3aeace77f4e60233fc183245235afb6c1ad6620d943ac',
  '20260808010000_hidden_post': '6108f22c6a47f7254c09f0f1a296ba130ff964e10e8cd5e67fac124e6039d303',
  '20260816000000_goodnight_2_incremental': '771324767c94e5a7c22f97fbff34d8728f6f303cfe1dd794c1796480ee7550c0',
  '20260819000000_second_stage_peer_support': '33e9c5d54e59efed1505cd859b5bac5cc53960f4dc458591e693beb855634e4d',
  '20260820010000_third_stage_stable_self': 'fd49019eb6576acc470881ab70d007537afcbc38ed97076fbca428eb0d10f5da',
  '20260820020000_third_stage_memory_transparency': 'bb25f95ee563d557b443afbed13ae482ca8591a300ce46604ec518262bb19997',
  '20260821003000_third_stage_decision_vault': 'ae1573fff6b702df17ab2c2f86a691c91d12bdece1ca4ce45a4c6c6304b1370f',
  '20260821004000_third_stage_future_self_context': '256ce2e561ec812e066b2b3d80579a8997d255872dc6d587699aee8118032f31',
  '20260821005000_third_stage_privacy_2': '7b67177a53a4138298a22228aa52928ff75a2f9f2ddeeebfc57b55a23b583d71',
  '20261003000000_safety_event_handled': 'cbd6011fe9ab8252945ed4fbbcba96068e432cc2bc51510a6337955df93a2466',
  '20261004000000_peer_report_history': 'aa1274e5feda76a660bc806e7b4b802b3ebe9edae8efc7ad00bd6378b74c8523',
  '20261004010000_admin_user_note': '44a927f0739ea07abbfa379cfe084513e257e59084947ad6e12f5d6b94814ddc',
};

function sha256(content: Buffer | string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function checkMigrationImmutability(repoRoot = process.cwd()): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const migrationsDir = path.resolve(repoRoot, 'prisma', 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    errors.push(`Migrations directory not found at: ${migrationsDir}`);
    return { ok: false, errors };
  }

  // 1. Check all baseline migrations against recorded checksums
  for (const [migrationName, expectedChecksum] of Object.entries(BASELINE_MIGRATIONS)) {
    const migrationSqlPath = path.join(migrationsDir, migrationName, 'migration.sql');
    if (!fs.existsSync(migrationSqlPath)) {
      errors.push(
        `Baseline migration missing: ${migrationName}/migration.sql. Existing migrations must not be deleted.`,
      );
      continue;
    }

    const content = fs.readFileSync(migrationSqlPath);
    const actualChecksum = sha256(content);
    if (actualChecksum !== expectedChecksum) {
      errors.push(
        `Baseline migration modified: ${migrationName}/migration.sql\n` +
          `  Expected SHA-256: ${expectedChecksum}\n` +
          `  Actual SHA-256:   ${actualChecksum}\n` +
          `  Rule violation: Existing migrations are immutable (see docs/architecture/MIGRATION_FORENSICS.md).`,
      );
    }
  }

  // 2. Discover all entries in prisma/migrations
  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const sqlPath = path.join(migrationsDir, entry.name, 'migration.sql');
      if (!fs.existsSync(sqlPath)) {
        errors.push(`Migration directory "${entry.name}" is missing migration.sql`);
      }
    }
  }

  // 3. Git-level check: ensure no modified/deleted migrations in working tree or git history
  try {
    const gitDiff = spawnSync('git', ['diff', '--name-status', 'HEAD', '--', 'prisma/migrations'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    if (gitDiff.status === 0 && gitDiff.stdout.trim()) {
      const lines = gitDiff.stdout.trim().split('\n');
      for (const line of lines) {
        const [status, filePath] = line.trim().split(/\s+/);
        if (status === 'M' || status === 'D') {
          errors.push(
            `Git working tree has ${status === 'M' ? 'modified' : 'deleted'} migration file: ${filePath}. Existing migrations must be immutable.`,
          );
        }
      }
    }

    // Also check staged changes
    const gitDiffStaged = spawnSync('git', ['diff', '--cached', '--name-status', '--', 'prisma/migrations'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    if (gitDiffStaged.status === 0 && gitDiffStaged.stdout.trim()) {
      const lines = gitDiffStaged.stdout.trim().split('\n');
      for (const line of lines) {
        const [status, filePath] = line.trim().split(/\s+/);
        if (status === 'M' || status === 'D') {
          errors.push(
            `Git staging area has ${status === 'M' ? 'modified' : 'deleted'} migration file: ${filePath}. Existing migrations must be immutable.`,
          );
        }
      }
    }
  } catch {
    // If git is not available, checksum check provides deterministic verification
  }

  return { ok: errors.length === 0, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const result = checkMigrationImmutability();
  if (!result.ok) {
    console.error('================================================================================');
    console.error('[MIGRATION_IMMUTABILITY_CHECK] FAILED');
    console.error('================================================================================');
    for (const err of result.errors) {
      console.error(`- ${err}`);
    }
    console.error('================================================================================');
    process.exit(1);
  }
  console.log('[MIGRATION_IMMUTABILITY_CHECK] PASSED: All 12 baseline migrations verified immutable.');
}
