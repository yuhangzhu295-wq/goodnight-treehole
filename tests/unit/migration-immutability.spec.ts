import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkMigrationImmutability,
  normaliseLineEndings,
  sha256,
  BASELINE_MIGRATIONS,
} from '../../scripts/check-migration-immutability';

/**
 * The immutability gate has to hold on every platform, and it has to keep failing on a real edit.
 *
 * It failed in CI for nine unchanged migrations because the pinned hashes had been recorded from a
 * CRLF working tree while CI checks out LF. These tests pin both halves of the fix: a line-ending
 * difference is not a content difference, and a content difference still is.
 */
describe('migration immutability integrity', () => {
  const sourceDir = path.resolve(__dirname, '../../prisma/migrations');
  let sandbox: string;

  /** A throwaway repo root containing the real migrations, optionally rewritten. */
  function buildSandbox(transform: (name: string, sql: string) => string = (_, sql) => sql) {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-immutability-'));
    const target = path.join(sandbox, 'prisma', 'migrations');
    fs.mkdirSync(target, { recursive: true });
    for (const name of Object.keys(BASELINE_MIGRATIONS)) {
      const dir = path.join(target, name);
      fs.mkdirSync(dir, { recursive: true });
      const sql = fs.readFileSync(path.join(sourceDir, name, 'migration.sql'), 'utf8');
      fs.writeFileSync(path.join(dir, 'migration.sql'), transform(name, sql));
    }
    return sandbox;
  }

  beforeEach(() => {
    sandbox = '';
  });

  afterEach(() => {
    if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true });
  });

  it('confirms all 12 baseline migrations match their recorded checksums exactly', () => {
    const result = checkMigrationImmutability();
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(Object.keys(BASELINE_MIGRATIONS)).toHaveLength(12);
  });

  it('passes on an LF checkout, which is what CI has', () => {
    const root = buildSandbox((_, sql) => sql.replace(/\r\n/g, '\n'));
    const result = checkMigrationImmutability(root);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('passes on a CRLF checkout, which is what a Windows working tree has', () => {
    const root = buildSandbox((_, sql) => sql.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'));
    const result = checkMigrationImmutability(root);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('still fails when a migration actually changes, so the fix is not a weakening', () => {
    const root = buildSandbox((name, sql) =>
      name === '20260712000000_runtime_state' ? `${sql}\n-- an unauthorised edit\n` : sql,
    );
    const result = checkMigrationImmutability(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('20260712000000_runtime_state'))).toBe(true);
  });

  it('still fails when a migration is deleted', () => {
    const root = buildSandbox();
    fs.rmSync(path.join(root, 'prisma', 'migrations', '20260808010000_hidden_post'), {
      recursive: true,
      force: true,
    });
    const result = checkMigrationImmutability(root);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('20260808010000_hidden_post'))).toBe(true);
  });

  it('treats CRLF and LF as the same content, and only that', () => {
    const lf = 'CREATE TABLE "x" (\n  "id" TEXT\n);\n';
    const crlf = lf.replace(/\n/g, '\r\n');
    expect(sha256(lf)).toBe(sha256(crlf));
    expect(sha256(lf)).not.toBe(sha256(lf.replace('TEXT', 'INTEGER')));
    expect(normaliseLineEndings(crlf).toString('utf8')).toBe(lf);
  });
});
