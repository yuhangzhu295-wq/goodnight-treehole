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
/**
 * Read lazily: the fixture phase rewrites this file before the suites run, and the routes it holds are
 * ids generated per run. Reading it at module load meant peer-detail opened the previous run's match,
 * whose status had already moved on, so the request PATCH failed and the case saw no navigation.
 */
const fixtures = () => (existsSync(fixturePath) ? JSON.parse(readFileSync(fixturePath, 'utf8')) : null);

// `runner` names the script that understands the case file's shape, not the file's name:
// `privacy-effects.json` asserts on text and url (verify-controls), `square-effects.json` asserts on
// the API response (verify-control-effects).
const SUITES = [
  { name: 'data-policy', route: '/pages/settings/data-policy', cases: 'data-policy.json', runner: 'controls' },
  { name: 'diary-list', route: '/pages/diary/list', cases: 'diary-list.json', runner: 'controls' },
  { name: 'favorite-list', route: '/pages/favorite/index', cases: 'favorite-list.json', runner: 'controls' },
  { name: 'help-faqs', route: '/pages/help/faqs', cases: 'help-faqs.json', runner: 'controls' },
  { name: 'feedback-help', route: '/pages/help/feedback', cases: 'feedback-help.json', runner: 'controls' },
  { name: 'future-self', route: '/pages/future-self/index', cases: 'future-self.json', runner: 'controls' },
  { name: 'letter-today', route: '/pages/letter/index', cases: 'letter-today.json', runner: 'controls' },
  { name: 'letter-list', route: '/pages/letter/list', cases: 'letter-list.json', runner: 'controls' },
  { name: 'me-profile', route: '/pages/me/profile', cases: 'me-profile.json', runner: 'controls' },
  { name: 'mood-create', route: '/pages/mood/create', cases: 'mood-create.json', runner: 'controls' },
  { name: 'mood-create-effects', route: '/pages/mood/create', cases: 'mood-create-effects.json', runner: 'effects' },
  { name: 'post-detail', route: '/pages/post/detail?id=post_seed_shimian', cases: 'post-detail.json', runner: 'controls' },
  { name: 'post-detail-effects', route: '/pages/post/detail?id=post_seed_shimian', cases: 'post-detail-effects.json', runner: 'effects' },
  { name: 'privacy-effects', route: '/pages/settings/privacy', cases: 'privacy-effects.json', runner: 'controls' },
  { name: 'safety-support', route: '/pages/safety/index', cases: 'safety-support.json', runner: 'controls' },
  { name: 'square-effects', route: '/pages/square/index', cases: 'square-effects.json', runner: 'effects' },
  { name: 'tool-run', route: '/pages/tool/run', cases: 'tool-run.json', runner: 'controls' },
  { name: 'tool-index', route: '/pages/tool/index', cases: 'tool-index.json', runner: 'controls' },
  { name: 'tool-decompose', route: '/pages/tool/decompose', cases: 'tool-decompose.json', runner: 'controls' },
  { name: 'peer-requests', route: '/pages/peer/requests', cases: 'peer-requests.json', runner: 'controls' },
  { name: 'peer-detail', route: () => fixtures()?.detailRoute, cases: 'peer-detail.json', runner: 'controls' },
  { name: 'peer-consent', route: () => fixtures()?.consentRoute, cases: 'peer-consent.json', runner: 'controls' },
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
function runFixture(label, script, args, { required = true, blockedExitCodes = [] } = {}) {
  try {
    const output = execFileSync(process.execPath, [repoFile('scripts', script), ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const last = output.trim().split('\n').filter(Boolean).slice(-1)[0] ?? '';
    console.log(`fixture ${label.padEnd(6)} ${last}`);
    return 'ok';
  } catch (error) {
    const text = String(`${error.stdout ?? ''}${error.stderr ?? ''}` || error.message || error).trim();
    const tail = text.split('\n').filter(Boolean).slice(-3).join(' / ') || 'no output';
    // A documented exit code means "the precondition cannot be built here": a blocked suite, not a
    // failure of the page and not a pass.
    if (blockedExitCodes.includes(error.status)) {
      console.warn(`fixture ${label} blocked (exit ${error.status}): ${tail}`);
      return 'blocked';
    }
    // A letter is produced by an AI job, so its fixture can legitimately be slow or unavailable. The
    // suites that do not read it must still run. The diary and peer fixtures are deterministic and
    // abort the run when they fail.
    if (required) {
      console.error(`fixture ${label} failed (exit ${error.status ?? '?'}): ${tail}`);
      process.exit(2);
    }
    console.warn(`fixture ${label} unavailable (exit ${error.status ?? '?'}): ${tail}`);
    return 'unavailable';
  }
}

// `--only` selects suites, not fixtures: skipping the fixtures left the peer inbox with whatever the
// previous run had consumed, and the decline case then failed on an empty list rather than on its own
// behaviour. Use `--no-fixtures` when iterating on a page whose data is already in place.
const skipFixtures = process.argv.includes('--no-fixtures');
/** 'ok' | 'blocked' | 'unavailable' | null (fixtures skipped). */
let letterFixture = null;
if (!skipFixtures) {
  runFixture('diary', 'seed-diary.mjs', [
    '--if-empty',
    '今天的会开得比想象中顺利',
    '轮到我发言时还是有点卡住，但把想说的写下来之后就没那么慌了。',
    '下次想试试先说结论，再补细节。',
  ]);
  // The letter must be generated *after* the diary, or it has no source and 原始记录 never renders.
  letterFixture = runFixture('letter', 'reset-letter.mjs', [], { required: false, blockedExitCodes: [3] });
  runFixture('peer', 'seed-peer-incoming-request.mjs', []);
}

// This one is not optional even under `--no-fixtures`: the profile suite's revoke case is
// destructive, and without a known second session it could cut off an account's real credential.
// The fixture refuses rather than guesses, and that refusal stops the run.
if (selected.some((suite) => suite.name === 'me-profile')) {
  runFixture('session', 'seed-second-session.mjs', [], { required: true });
}

// The inbox suite asserts today/date/更早 groups and both read states, so it needs its own rows;
// the AI letter fixture can legitimately be unavailable.
if (selected.some((suite) => suite.name === 'letter-list')) {
  runFixture('letterlist', 'seed-letter-list.mjs', [], { required: true });
}

// The favourites suite asserts a cross-type list, a per-type filter and a real removal.
if (selected.some((suite) => suite.name === 'favorite-list')) {
  runFixture('favorites', 'seed-favorite-list.mjs', [], { required: true });
}

// A peer route is generated per run, so a missing fixture is a setup problem, not a product failure.
const resolveRoute = (suite) => (typeof suite.route === 'function' ? suite.route() : suite.route);
const missingFixture = selected.filter((suite) => !resolveRoute(suite));
if (missingFixture.length) {
  console.error(
    `no route for: ${missingFixture.map((s) => s.name).join(', ')} - run node scripts/seed-peer-incoming-request.mjs first`,
  );
  process.exit(2);
}

const results = [];
for (const suite of selected) {
  // One case in letter-today opens the diary the letter answers, which only exists when the letter was
  // generated from a mood. When the fixture cannot produce that, the suite is reported as blocked
  // instead of being run against a page that legitimately has no 原始记录 row.
  if (suite.name === 'letter-today' && letterFixture === 'blocked') {
    results.push({ suite: suite.name, verdict: 'BLOCK', detail: 'no sourced letter available on this identity' });
    console.log(`BLOCK ${suite.name.padEnd(20)} no sourced letter available on this identity`);
    continue;
  }
  const runner = suite.runner === 'effects' ? 'verify-control-effects.mjs' : 'verify-controls.mjs';
  const cases = `tests/ui-controls/${suite.cases}`;
  let output = '';
  let failedToRun = '';
  let attempts = 0;
  // One retry, recorded. These suites drive a device against a local VM that restarts under load: a
  // page whose data request lands during a restart renders its error state, and the case then reports
  // the control as missing. A second attempt on a suite that already passed standalone separates that
  // from a real regression; both attempts stay in the log, and a suite that fails twice is red.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    attempts = attempt;
    output = '';
    failedToRun = '';
    try {
      output = execFileSync(process.execPath, [repoFile('scripts', runner), resolveRoute(suite), repoFile(cases)], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
      if (!/controls (?:behaved|had their expected effect)/.test(output)) failedToRun = String(error.message ?? error).slice(0, 200);
    }
    const summaryNow = /(\d+)\/(\d+) controls (?:behaved as expected|had their expected effect)/.exec(output);
    const failedNow = /failed: (.+)/.exec(output);
    if (summaryNow && summaryNow[1] === summaryNow[2] && !failedNow) break;
    if (attempt === 1) {
      console.log(`      retrying ${suite.name} once (first attempt: ${failedNow ? failedNow[1] : failedToRun || 'no summary'})`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
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
      detail: `${passed}/${total}${failed ? ` - ${failed[1]}` : ''}${attempts > 1 ? ` (passed on retry ${attempts})` : ''}${note ? ` - ${note[0]}` : ''}`,
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
