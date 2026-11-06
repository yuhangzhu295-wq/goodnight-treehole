#!/usr/bin/env node
/* global process, console */
/**
 * Runs a command with the repository .env loaded into its environment.
 *
 * Why this exists: the API reads its configuration from `process.env` only -
 * neither `apps/api` nor the repo root pulls in a dotenv loader, so `pnpm dev:api`
 * alone never sees `.env`. Prisma CLI and Vite load `.env` themselves, which is
 * why migrations and the front dev server work without this wrapper.
 *
 * Node refuses `--env-file` inside NODE_OPTIONS, so a child-process wrapper is the
 * only way to inject the file without editing the package scripts or writing the
 * values into the Windows user environment (where they would leak into unrelated
 * projects that also read DATABASE_URL).
 *
 * Usage (from the repository root):
 *   node scripts/recovery/with-env.mjs pnpm dev:api
 *   node scripts/recovery/with-env.mjs pnpm test:first-batch-core
 *
 * Values already present in the environment win over .env, so an explicit
 * `DATABASE_URL=... node scripts/recovery/with-env.mjs ...` still overrides.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const envFile = process.env.GOODNIGHT_ENV_FILE ?? path.join(repoRoot, '.env');

function parseEnvFile(contents) {
  const values = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('usage: node scripts/recovery/with-env.mjs <command> [args...]');
  process.exit(2);
}

let fileValues = {};
if (fs.existsSync(envFile)) {
  fileValues = parseEnvFile(fs.readFileSync(envFile, 'utf8'));
} else {
  console.warn(`[with-env] ${envFile} not found; running with the inherited environment only.`);
}

const child = spawn(command, args, {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: true,
  env: { ...fileValues, ...process.env },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
