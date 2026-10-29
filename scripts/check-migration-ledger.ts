import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { BASELINE_MIGRATIONS, normaliseLineEndings } from './check-migration-immutability.js';

/**
 * Asserts that a database's migration ledger agrees with the pinned baseline.
 *
 * `check-migration-immutability.ts` proves the files on disk are unchanged. It cannot prove that the
 * database was actually built from them: a migration can be recorded as applied with a different
 * checksum, or be left unfinished after a failure, and the file check would still pass. This closes
 * that gap and is what the migration cleanroom runs against a database created from zero.
 *
 * Checks:
 *   1. every baselined migration is present and finished
 *   2. no migration is left unfinished or rolled back
 *   3. every recorded checksum matches the pinned baseline for that migration
 */
const sha256 = (content: Buffer | string) =>
  crypto.createHash('sha256').update(normaliseLineEndings(content)).digest('hex');

export async function checkMigrationLedger(
  databaseUrl = process.env.DATABASE_URL,
): Promise<{ ok: boolean; errors: string[]; checked: number }> {
  const errors: string[] = [];
  if (!databaseUrl) {
    return { ok: false, errors: ['DATABASE_URL is not set'], checked: 0 };
  }

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const rows = await prisma.$queryRaw<
      Array<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>
    >`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at ASC`;

    const byName = new Map(rows.map((r) => [r.migration_name, r]));

    for (const [name, expected] of Object.entries(BASELINE_MIGRATIONS)) {
      const row = byName.get(name);
      if (!row) {
        errors.push(`Baseline migration not applied: ${name}`);
        continue;
      }
      if (row.rolled_back_at) {
        errors.push(`Baseline migration was rolled back: ${name} at ${row.rolled_back_at.toISOString()}`);
      } else if (!row.finished_at) {
        errors.push(`Baseline migration is unfinished: ${name}`);
      }
      if (row.checksum !== expected) {
        errors.push(
          `Ledger checksum mismatch for ${name}\n` +
            `  recorded: ${row.checksum}\n` +
            `  baseline: ${expected}`,
        );
      }
    }

    // Any migration left unfinished or rolled back is a broken build, baseline or not.
    for (const row of rows) {
      if (row.rolled_back_at) errors.push(`Migration recorded as rolled back: ${row.migration_name}`);
      else if (!row.finished_at) errors.push(`Migration recorded as unfinished: ${row.migration_name}`);
    }

    // Every migration on disk must have been applied, so a new migration cannot be silently skipped.
    const migrationsDir = path.resolve('prisma', 'migrations');
    if (fs.existsSync(migrationsDir)) {
      for (const entry of fs.readdirSync(migrationsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (!fs.existsSync(path.join(migrationsDir, entry.name, 'migration.sql'))) continue;
        if (!byName.has(entry.name)) errors.push(`Migration on disk was never applied: ${entry.name}`);
      }
    }

    return { ok: errors.length === 0, errors, checked: rows.length };
  } catch (error) {
    return { ok: false, errors: [`Could not read the migration ledger: ${(error as Error).message}`], checked: 0 };
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  void (async () => {
    const result = await checkMigrationLedger();
    if (!result.ok) {
      console.error('================================================================================');
      console.error('[MIGRATION_LEDGER_CHECK] FAILED');
      console.error('================================================================================');
      for (const err of result.errors) console.error(`- ${err}`);
      process.exit(1);
    }
    console.log(
      `[MIGRATION_LEDGER_CHECK] PASSED: ${result.checked} migrations recorded, ledger agrees with the pinned baseline.`,
    );
  })();
}
