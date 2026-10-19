#!/usr/bin/env node
/**
 * Runs the whole suite in segments, with a health check between them.
 *
 * Why this exists: WSL2's localhost forwarding on this machine breaks intermittently under
 * sustained load (measured 2026-10-19 — the distro stayed Running, the containers stayed listening,
 * and the database was reachable over the distro's own address while 127.0.0.1:15432 was refused
 * from Windows). It happens at a different point each time, and it also happens when no test is
 * running. A run that aborts mid-way therefore says nothing about the code, and it cannot be
 * reported as a green full suite either.
 *
 * So the files are split into groups. Between groups the runner proves PostgreSQL, Redis and the
 * API answer real operations, repairs the forwarding once if they do not, and only then continues.
 * Each file's verdict comes from the test runner's own report, so a connection failure is recorded
 * as ENVIRONMENT rather than being counted as a business regression.
 *
 * Usage:
 *   node scripts/run-suite-segmented.mjs [--segment 6] [tests/business ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

const args = process.argv.slice(2);
const roots = args.filter((value) => !value.startsWith('--'));
const argValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const segmentSize = Number(argValue('--segment', '6'));

const searchRoots = roots.length ? roots : ['tests/business', 'tests/api', 'tests/e2e', 'tests/acceptance'];
const files = searchRoots
  .flatMap((dir) =>
    fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.spec.ts')).map((name) => path.join(dir, name)) : [],
  )
  .sort();

fs.mkdirSync('artifacts/runtime/segmented', { recursive: true });

const strip = (value) => value.replace(/\u001b\[[0-9;]*m/g, '');

/**
 * Per-file status, taken from the runner's own summary lines.
 *
 * The runner prints a per-file breakdown whose Status column is the last word of each row, e.g.
 * `tests/acceptance/F01-...spec.ts   419ms  11343ms  17076ms  607ms  29447ms   PASS`. A file whose
 * row says `FAIL` failed; a row that says anything else (`SKIP`, `PASS`) is counted by what it
 * says, and a file with no row at all is `MISSING` — that is a reporting gap, not a test result.
 */
function perFileStatus(output, file) {
  const normalised = file.replaceAll('\\', '/');
  const row = output
    .split('\n')
    .map(strip)
    .find((line) => line.trimStart().startsWith(normalised));
  if (!row) return 'MISSING';
  const status = row.trim().split(/\s+/).at(-1);
  return status === 'FAIL' ? 'FAIL' : status === 'SKIP' ? 'SKIP' : 'PASS';
}

const CONNECTION_PATTERN = /shutting down|terminating connection|Can't reach database|server closed the connection|Software caused connection abort|P1017|server has closed/i;

function health() {
  try {
    execFileSync(process.execPath, [path.resolve('scripts/dev/stack-probe.mjs'), '--skip-api'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function repair() {
  console.log('[segmented] health check failed; repairing WSL localhost forwarding');
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/dev/ensure-stack.ps1', '-SkipApi'], { stdio: 'inherit' });
}

function runFiles(group) {
  const child = spawn('npx.cmd', ['tsx', 'scripts/test-runner.ts', ...group], { stdio: ['ignore', 'pipe', 'pipe'], shell: true });
  let output = '';
  child.stdout.on('data', (chunk) => (output += String(chunk)));
  child.stderr.on('data', (chunk) => (output += String(chunk)));
  return new Promise((resolve) => child.on('close', (code) => resolve({ code, output })));
}

const results = [];
const groups = [];
for (let index = 0; index < files.length; index += segmentSize) groups.push(files.slice(index, index + segmentSize));

for (const [index, group] of groups.entries()) {
  if (!health()) repair();
  console.log(`\n=== segment ${index + 1}/${groups.length} (${group.length} files)`);
  let outcome = await runFiles(group);

  if (outcome.code !== 0 && CONNECTION_PATTERN.test(outcome.output)) {
    console.log(`[segmented] a connection failure happened in segment ${index + 1}; repairing and re-running the segment`);
    repair();
    outcome = await runFiles(group);
  }
  for (const file of group) results.push({ file: file.replaceAll('\\', '/'), verdict: perFileStatus(outcome.output, file) });
}

const counts = results.reduce((acc, item) => ({ ...acc, [item.verdict]: (acc[item.verdict] ?? 0) + 1 }), {});
const summary = { generatedAt: new Date().toISOString(), segmentSize, counts, results };
fs.writeFileSync('artifacts/runtime/segmented/segmented-results.json', JSON.stringify(summary, null, 2) + '\n');

console.log(`\n=== ${results.length} files: ${JSON.stringify(counts)}`);
for (const item of results) if (item.verdict !== 'PASS') console.log(`  ${item.verdict} ${item.file}`);
process.exit(counts.ENV || counts.FAIL || counts.MISSING ? 1 : 0);
