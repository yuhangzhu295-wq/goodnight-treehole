import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Expected baseline migrations and their SHA-256 checksums.
 *
 * These are the checksums of the **canonical file content**: the bytes git stores, with LF line
 * endings. They are not checksums of "whatever the working tree happens to contain on this machine".
 *
 * Why that distinction matters, and what went wrong before: the first version of this list was
 * recorded by hashing the files as they sat in a Windows working tree, where `core.autocrlf=true`
 * had converted them to CRLF. Nine of the twelve entries therefore pinned the CRLF representation.
 * The check hashes raw bytes, so it passed on that Windows checkout and failed in CI, where the
 * Linux checkout is LF - reporting nine unchanged migrations as "modified" and stopping the pipeline
 * before anything else ran.
 *
 * Two things keep that from recurring:
 *   1. `.gitattributes` pins `prisma/migrations/**\/migration.sql` to `eol=lf`, so every checkout on
 *      every platform produces LF.
 *   2. `normaliseLineEndings` below collapses CRLF to LF before hashing, so a file that still
 *      arrives with CRLF (a merge, an editor, a tool that rewrites line endings) is compared on its
 *      content rather than on its byte representation.
 *
 * Neither of those weakens the check: any real edit to a migration still changes its LF content and
 * still fails. What is no longer a failure is a pure line-ending difference, which is not a change
 * to the migration.
 *
 * Provenance of these values: each equals `sha256(git show HEAD:<path>)` and `sha256` of the
 * LF-normalised working tree, and the development database's `_prisma_migrations` ledger agrees with
 * the CRLF form of the same content (that database was built from a CRLF checkout). See
 * docs/architecture/MIGRATION_FORENSICS.md.
 */
export const BASELINE_MIGRATIONS: Record<string, string> = {
  '20260712000000_runtime_state': '7be1a8ae3fe49d7ed6c313b3d09443f57fefbfee705aaacc41efd810bbe6811a',
  '20260808010000_hidden_post': '221c94c34cb8d8d1c1ad09c38476ea43c6bb00aff77010c13b1d7e47a35b1d99',
  '20260816000000_goodnight_2_incremental': 'ea4a625d07dfb54b355bcca6f58cc60d99b978d618dd1da49db85a47c3d3802b',
  '20260819000000_second_stage_peer_support': '73589a8bd7344ba5882c757b7eaf9017f95d6d37e3fb779d5c016d2978a4e282',
  '20260820010000_third_stage_stable_self': '0c45232d30b7cd5169a0bbb5cfcfe95e48c723727e90e3fc432799bfc0708091',
  '20260820020000_third_stage_memory_transparency': '2edeeee54de58b942067c2df927cfeef6f5ed9384c537b2bbaf0bb81c5a1cab5',
  '20260821003000_third_stage_decision_vault': '1c356486659c8e1fc95dcf5fe7ad90fe4947dd02406562f7495a1c2f4f332b10',
  '20260821004000_third_stage_future_self_context': 'd7ee59ed26be978db8860c0efb5ad1bfae4416e9d8e0798f8574dc08e7fe6b78',
  '20260821005000_third_stage_privacy_2': '2b1c2ca6d3c6ed014c07cfdfaa032a0692280858c3258f88df93f8746578de10',
  '20261003000000_safety_event_handled': 'cbd6011fe9ab8252945ed4fbbcba96068e432cc2bc51510a6337955df93a2466',
  '20261004000000_peer_report_history': 'aa1274e5feda76a660bc806e7b4b802b3ebe9edae8efc7ad00bd6378b74c8523',
  '20261004010000_admin_user_note': '44a927f0739ea07abbfa379cfe084513e257e59084947ad6e12f5d6b94814ddc',
};

/** Collapses CRLF to LF so a file's line-ending representation cannot change its checksum. */
export function normaliseLineEndings(content: Buffer | string): Buffer {
  const text = Buffer.isBuffer(content) ? content.toString('utf8') : content;
  return Buffer.from(text.replace(/\r\n/g, '\n'), 'utf8');
}

export function sha256(content: Buffer | string): string {
  return crypto.createHash('sha256').update(normaliseLineEndings(content)).digest('hex');
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
          `  (compared with LF line endings collapsed, so this is a content difference)\n` +
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
