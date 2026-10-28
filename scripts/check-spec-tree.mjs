#!/usr/bin/env node
/**
 * verifies `git ls-files` and the spec tree agree, then records the aggregate result.
 *
 * The acceptance report quotes a per-file count, so the set of files the suite covers has to be
 * derivable, not remembered. This prints it and fails when a spec exists on disk but is untracked
 * (which is how a file gets run in one place and skipped in another).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const roots = ['tests/unit', 'tests/business', 'tests/api', 'tests/e2e', 'tests/acceptance'];
const onDisk = roots
  .flatMap((dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.spec.ts')).map((name) => path.join(dir, name)) : []))
  .map((value) => value.replaceAll('\\', '/'))
  .sort();

const tracked = execFileSync('git', ['ls-files', ...roots], { encoding: 'utf8' })
  .split('\n')
  .filter((line) => line.endsWith('.spec.ts'))
  .sort();

const untracked = onDisk.filter((file) => !tracked.includes(file));
const deletedButTracked = tracked.filter((file) => !fs.existsSync(file));

console.log(`spec files on disk: ${onDisk.length}; tracked: ${tracked.length}`);
for (const file of untracked) console.log(`  UNTRACKED ${file}`);
for (const file of deletedButTracked) console.log(`  DELETED ${file}`);
if (untracked.length || deletedButTracked.length) process.exit(1);
console.log('spec tree is consistent with git');
