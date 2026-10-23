// Run every control suite against the device and report one line per page.
//
// The suites were run by hand, one command each, and the routes were typed from memory. Two things
// went wrong with that and both are fixed here: the route argument is repaired after Git Bash's path
// conversion (see `cli-route.mjs`), and the peer routes come from the fixture the seed writes instead
// of from a record id that only exists for one account.
//
// Exit codes: 0 = every suite green, 1 = a suite failed, 2 = a fixture or the device is missing.
//
// Usage: node scripts/run-control-suites.mjs [--only name,name]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { repoFile } from './repo-root.mjs';

const onlyArg = process.argv.indexOf('--only');
const only = onlyArg > -1 ? new Set(String(process.argv[onlyArg + 1] ?? '').split(',').filter(Boolean)) : null;

const fixturePath = repoFile('artifacts/ui-v2/fixtures/peer-fixtures.json');
const fixtures = existsSync(fixturePath) ? JSON.parse(readFileSync(fixturePath, 'utf8')) : null;

// `runner` names the script that understands the case file's shape, not the file's name:
// `privacy-effects.json` asserts on text and url (verify-controls), `square-effects.json` asserts on
// the API response (verify-control-effects).
const SUITES = [
  { name: 'diary-list', route: '/pages/diary/list', cases: 'diary-list.json', runner: 'controls' },
  { name: 'future-self', route: '/pages/future-self/index', cases: 'future-self.json', runner: 'controls' },
  { name: 'letter-today', route: '/pages/letter/index', cases: 'letter-today.json', runner: 'controls' },
  { name: 'mood-create', route: '/pages/mood/create', cases: 'mood-create.json', runner: 'controls' },
  { name: 'mood-create-effects', route: '/pages/mood/create', cases: 'mood-create-effects.json', runner: 'effects' },
  { name: 'post-detail', route: '/pages/post/detail?id=post_seed_shimian', cases: 'post-detail.json', runner: 'controls' },
  { name: 'post-detail-effects', route: '/pages/post/detail?id=post_seed_shimian', cases: 'post-detail-effects.json', runner: 'effects' },
  { name: 'privacy-effects', route: '/pages/settings/privacy', cases: 'privacy-effects.json', runner: 'controls' },
  { name: 'safety-support', route: '/pages/safety/index', cases: 'safety-support.json', runner: 'controls' },
  { name: 'square-effects', route: '/pages/square/index', cases: 'square-effects.json', runner: 'effects' },
  { name: 'tool-run', route: '/pages/tool/run', cases: 'tool-run.json', runner: 'controls' },
  { name: 'tool-index', route: '/pages/tool/index', cases: 'tool-index.json', runner: 'controls' },
  { name: 'peer-requests', route: '/pages/peer/requests', cases: 'peer-requests.json', runner: 'controls' },
  { name: 'peer-detail', route: fixtures?.detailRoute, cases: 'peer-detail.json', runner: 'controls' },
  { name: 'peer-consent', route: fixtures?.consentRoute, cases: 'peer-consent.json', runner: 'controls' },
];

const selected = SUITES.filter((suite) => !only || only.has(suite.name));
if (!selected.length) {
  console.error(`--only matched no suite; known names: ${SUITES.map((s) => s.name).join(', ')}`);
  process.exit(2);
}

/**
 * The fixtures the suites need and cannot create themselves.
 *
 * Both are skipped under `--only`, which is the iteration path. They are not optional for a full
 * run: `diary-list` opens the first row, and a fresh install (a deploy uninstalls the package, so the
 * app gets a new anonymous identity) has no rows at all - which reads as a broken list page.
 */
function runFixture(label, script, args) {
  try {
    const output = execFileSync(process.execPath, [repoFile('scripts', script), ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const last = output.trim().split('\n').filter(Boolean).slice(-1)[0] ?? '';
    console.log(`fixture ${label.padEnd(6)} ${last}`);
  } catch (error) {
    console.error(`fixture ${label} failed: ${String(error.stdout ?? error.message ?? error).trim().split('\n').slice(-1)[0]}`);
    process.exit(2);
  }
}

if (!only) {
  runFixture('diary', 'seed-diary.mjs', [
    '--if-empty',
    '今天的会开得比想象中顺利',
    '轮到我发言时还是有点卡住，但把想说的写下来之后就没那么慌了。',
    '下次想试试先说结论，再补细节。',
  ]);
  // The letter must be generated *after* the diary, or it has no source and 原始记录 never renders.
  runFixture('letter', 'reset-letter.mjs', []);
  runFixture('peer', 'seed-peer-incoming-request.mjs', []);
}

// A peer route is generated per run, so a missing fixture is a setup problem, not a product failure.
const missingFixture = selected.filter((suite) => !suite.route);
if (missingFixture.length) {
  console.error(
    `no route for: ${missingFixture.map((s) => s.name).join(', ')} - run node scripts/seed-peer-incoming-request.mjs first`,
  );
  process.exit(2);
}

const results = [];
for (const suite of selected) {
  const runner = suite.runner === 'effects' ? 'verify-control-effects.mjs' : 'verify-controls.mjs';
  const cases = `tests/ui-controls/${suite.cases}`;
  let output = '';
  let failedToRun = '';
  try {
    output = execFileSync(process.execPath, [repoFile('scripts', runner), suite.route, repoFile(cases)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    if (!/controls (?:behaved|had their expected effect)/.test(output)) failedToRun = String(error.message ?? error).slice(0, 200);
  }
  const summary = /(\d+)\/(\d+) controls (?:behaved as expected|had their expected effect)/.exec(output);
  const failed = /failed: (.+)/.exec(output);
  const note = /\[nav\] .+/.exec(output);
  if (!summary) {
    results.push({ suite: suite.name, verdict: 'ERROR', detail: failedToRun || 'no summary line' });
  } else {
    const [, passed, total] = summary;
    const ok = passed === total && !failed;
    results.push({
      suite: suite.name,
      verdict: ok ? 'PASS' : 'FAIL',
      detail: `${passed}/${total}${failed ? ` - ${failed[1]}` : ''}${note ? ` - ${note[0]}` : ''}`,
    });
  }
  const last = results[results.length - 1];
  console.log(`${last.verdict.padEnd(5)} ${suite.name.padEnd(20)} ${last.detail}`);
  // The selector alone says nothing about why it failed; the child printed the reason next to it.
  if (last.verdict !== 'PASS') {
    for (const line of output.split('\n')) {
      if (/^FAIL/.test(line.trim()) || /\[nav\]/.test(line)) console.log(`      ${line.trim()}`);
    }
  }
}

const bad = results.filter((r) => r.verdict !== 'PASS');
console.log(`\n${results.length - bad.length}/${results.length} suites green`);
if (bad.length) {
  console.log(`not green: ${bad.map((r) => r.suite).join(', ')}`);
  process.exitCode = 1;
}
