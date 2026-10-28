/**
 * Mutation harness for the Batch 2 review fixes.
 *
 * For each guard added by the review fixes, remove it and run the spec. A guard whose removal
 * leaves the suite green is NOT proven by the suite, and that has to be reported as unproven
 * rather than covered. Where two guards are redundant, both are removed together so the original
 * defect is reproduced.
 *
 * Two things this harness refuses to do, because the earlier version did them:
 *   - it does not report a mutation as proven from a nonzero failure count alone. A failure in an
 *     unrelated test is not evidence about this guard, so each mutation names the test that must
 *     fail, and a mismatch is reported as `PROVEN-UNRELATED` instead of `PROVEN`.
 *   - it does not run against a dirty environment. A baseline run must come back green first; if
 *     it does not, the harness aborts, because no mutation result would be interpretable.
 *
 * File restoration happens in a `finally` that also covers patch application, so an I/O failure
 * part-way through cannot leave a patched file behind.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const SPEC = 'tests/business/batch2-peer-verification.spec.ts';
const PEER = 'apps/api/src/peer-persistence.service.ts';
const STORE = 'apps/api/src/store.service.ts';
const REGISTRY = 'apps/api/src/direct-db-models.ts';

const mutations = [
  {
    id: 'M1 expire-on-send closure rolls back (P1-4)',
    expectFailing: ['2.6a'],
    patches: [
      {
        file: PEER,
        old: "        return { expired: true as const };\n      }\n\n      const msgId = genId('peer_message');",
        new: "        throw new BadRequestException('这段 72 小时会话已经结束');\n      }\n\n      const msgId = genId('peer_message');",
      },
    ],
  },
  {
    id: 'M2a respondMatch: CAS removed, post-lock re-read kept (P0-1)',
    expectFailing: [],
    patches: [
      {
        file: PEER,
        old: '      const cas = await tx.peerMatch.updateMany({\n        where: { id: matchId, status: { in: allowedFrom } },',
        new: '      const cas = await tx.peerMatch.updateMany({\n        where: { id: matchId },',
      },
    ],
  },
  {
    id: 'M2b respondMatch: post-lock re-read removed, CAS kept (P0-1)',
    expectFailing: [],
    patches: [
      {
        file: PEER,
        old: '      const match = await tx.peerMatch.findUniqueOrThrow({\n        where: { id: matchId },\n        include: { peerExperience: true },\n      });\n\n      const isExperienceOwner = match.peerExperience?.userId === userId;\n      const isRequester = match.userId === userId;',
        new: '      const match = pre;\n\n      const isExperienceOwner = match.peerExperience?.userId === userId;\n      const isRequester = match.userId === userId;',
      },
    ],
  },
  {
    id: 'M2c respondMatch: BOTH guards removed (the original defect) (P0-1)',
    expectFailing: ['2.1'],
    patches: [
      {
        file: PEER,
        old: '      const match = await tx.peerMatch.findUniqueOrThrow({\n        where: { id: matchId },\n        include: { peerExperience: true },\n      });\n\n      const isExperienceOwner = match.peerExperience?.userId === userId;\n      const isRequester = match.userId === userId;',
        new: '      const match = pre;\n\n      const isExperienceOwner = match.peerExperience?.userId === userId;\n      const isRequester = match.userId === userId;',
      },
      {
        file: PEER,
        old: '      const cas = await tx.peerMatch.updateMany({\n        where: { id: matchId, status: { in: allowedFrom } },',
        new: '      const cas = await tx.peerMatch.updateMany({\n        where: { id: matchId },',
      },
    ],
  },
  {
    id: 'M3 createMatches takes no root locks (P0-3)',
    expectFailing: ['3.6'],
    patches: [
      {
        file: PEER,
        old: "      // This path writes `PeerMatch.journeyId`, so it joins the global lock order\n      // (`User` -> `LifeJourney` -> peer row) before touching any match row.\n      await lockPeerWriteRoots(\n        tx,\n        matches.map((m) => m.userId),\n        matches.map((m) => m.journeyId),\n      );",
        new: '      // mutation: root locks removed',
      },
    ],
  },
  {
    id: 'M4 peer draft is persisted unredacted (P1-5)',
    expectFailing: ['7.1'],
    patches: [
      {
        file: STORE,
        old: "        draft: this.redactPeerPublicText(draft),\n        reminders: arrays('reminders').map((item) => this.redactPeerPublicText(item)),\n        summary: this.redactPeerPublicText(draft),",
        new: "        draft,\n        reminders: arrays('reminders'),\n        summary: draft,",
      },
    ],
  },
  {
    id: 'M5 response boundary stops redacting (P1-5)',
    expectFailing: ['7.2'],
    patches: [
      {
        file: STORE,
        old: "    if (job.taskType !== 'peer_response_assist' && job.jobType !== 'peer_response_assist') return job;",
        new: '    return job;',
      },
    ],
  },
  {
    id: 'M6 match projection drops the consent fields (UI pending state)',
    expectFailing: ['3.2'],
    patches: [
      {
        file: STORE,
        old: '      requesterConsentAt: match.requesterConsentAt,\n      ownerConsentAt: match.ownerConsentAt,\n',
        new: '',
      },
    ],
  },
  {
    id: 'M7 peer network truncates the match list again (UI pending state)',
    expectFailing: ['3.2'],
    patches: [
      {
        file: STORE,
        old: '    const PEER_NETWORK_MATCH_LIMIT = 50;\n    const sortedMatches = userMatches.sort((a, b) => b.score - a.score);\n    const selectedMatches = sortedMatches.slice(0, 3);\n    for (const match of sortedMatches) {\n      if (match.status === \'suggested\') continue;\n      if (selectedMatches.includes(match)) continue;\n      selectedMatches.push(match);\n    }\n    let topMatches = selectedMatches.slice(0, PEER_NETWORK_MATCH_LIMIT);',
        new: '    const topMatches = userMatches.sort((a, b) => b.score - a.score).slice(0, 3);',
      },
    ],
  },
  {
    id: 'M8 close notification throws after the commit (notification semantics)',
    expectFailing: ['6.1'],
    patches: [
      {
        file: STORE,
        old: '        notificationDelivered =\n          (await this.peerNotificationAfterCommit(\n            res.conversation.starterUserId,',
        new: '        notificationDelivered =\n          (await this.peerNotification(\n            res.conversation.starterUserId,',
      },
    ],
  },
  {
    id: 'M9 peer match leaves the registry (three exits)',
    expectFailing: ['5.1'],
    patches: [{ file: REGISTRY, old: "  PeerMatch: 'peerMatches',\n", new: '' }],
  },
  {
    id: 'M10 journey reference is not re-resolved under the lock (A5)',
    expectFailing: ['3.5'],
    patches: [
      {
        file: PEER,
        old: '  if (!journeyId) return null;\n  const rows = await tx.$queryRaw<any[]>`SELECT id FROM "LifeJourney" WHERE id = ${journeyId}`;\n  return rows.length ? journeyId : null;',
        new: '  return journeyId ?? null;',
      },
    ],
  },
  {
    id: 'M11 the deadline is read as the transaction-start time again (P1-4)',
    expectFailing: ['2.6c'],
    patches: [
      {
        file: PEER,
        old: "      // 2. Under lock, compare database time against expiresAt (§0.4/A8)\n      // clock_timestamp(), not NOW(): NOW() is the TRANSACTION-START time, so a transaction that\n      // began before the deadline but waited for a lock until after it would compare against a\n      // pre-deadline instant and let the write through. clock_timestamp() is evaluated at this\n      // call, which is after the lock was acquired — the instant the deadline decision claims.\n      const [timeRow] = await tx.$queryRaw<any[]>`SELECT clock_timestamp() as db_now`;",
        new: "      // mutation: back to the transaction-start clock\n      const [timeRow] = await tx.$queryRaw<any[]>`SELECT NOW() as db_now`;",
      },
    ],
  },
  {
    id: 'M12 the focused match is not included past the cap (reachability)',
    expectFailing: ['3.7'],
    patches: [
      {
        file: STORE,
        old: "    if (focusMatchId && !topMatches.some((match) => match.id === focusMatchId)) {\n      const focused = sortedMatches.find((match) => match.id === focusMatchId);\n      if (focused) topMatches = [...topMatches, focused];\n    }",
        new: '    // mutation: focus match not appended',
      },
    ],
  },
];

const countOccurrences = (haystack, needle) => haystack.split(needle).length - 1;

// Built from a char code rather than written literally: a control character in a regex literal
// trips `no-control-regex`.
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const stripAnsi = (text: string) => text.replace(ANSI_PATTERN, '');

function runSpec() {
  const run = spawnSync(
    process.execPath,
    [
      'node_modules/tsx/dist/cli.mjs',
      'scripts/test-runner.ts',
      'vitest',
      'run',
      SPEC,
      '--pool=forks',
      '--maxWorkers=1',
      '--minWorkers=1',
      '--reporter=basic',
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 900_000 },
  );
  const output = stripAnsi(`${run.stdout ?? ''}${run.stderr ?? ''}`);
  const summary = output.match(/Tests:\s+(\d+) failed \| (\d+) passed \((\d+)\)/);
  const failedTests = output
    .split(/\r?\n/)
    .filter((line) => /^\s*(FAIL|×)\s/.test(line))
    .map((line) => line.trim());
  return {
    output,
    // The child's own outcome, not just the printed summary: a run that prints "0 failed" and then
    // dies on a signal, times out, or fails to spawn must not be read as a green baseline.
    status: run.status,
    signal: run.signal,
    spawnError: run.error ? String(run.error.message) : null,
    failed: summary ? Number(summary[1]) : null,
    passed: summary ? Number(summary[2]) : null,
    failedTests,
  };
}

const childOk = (run: { status: number | null; signal: string | null; spawnError: string | null }) =>
  run.spawnError === null && run.signal === null && run.status !== null;

console.log('=== baseline run (must be green before any mutation result is meaningful) ===');
const baseline = runSpec();
if (!childOk(baseline)) {
  console.error(
    `ABORT: the baseline run did not exit cleanly (status=${baseline.status} signal=${baseline.signal} spawnError=${baseline.spawnError}).`,
  );
  process.exit(1);
}
if (baseline.failed === null) {
  console.error('ABORT: could not parse the baseline summary; no mutation result would be interpretable.');
  console.error(baseline.output.split('\n').slice(-12).join('\n'));
  process.exit(1);
}
if (baseline.failed > 0) {
  console.error(
    `ABORT: baseline run already has ${baseline.failed} failing test(s); no mutation result would be interpretable.`,
  );
  console.error(baseline.failedTests.slice(0, 8).join('\n'));
  process.exit(1);
}
console.log(`baseline green: ${baseline.passed} passed (child exit status ${baseline.status})\n`);

const results = [];

for (const mutation of mutations) {
  let verdict = 'INCONCLUSIVE';
  let detail = '';
  const originals = new Map();

  try {
    for (const patch of mutation.patches) {
      if (!originals.has(patch.file)) originals.set(patch.file, fs.readFileSync(patch.file, 'utf8'));
      const current = fs.readFileSync(patch.file, 'utf8');
      const found = countOccurrences(current, patch.old);
      if (found !== 1) {
        verdict = 'PATCH-FAILED';
        detail = `${patch.file}: expected 1 match, found ${found}`;
        break;
      }
      fs.writeFileSync(patch.file, current.replace(patch.old, patch.new));
    }

    if (verdict !== 'PATCH-FAILED') {
      const run = runSpec();
      if (!childOk(run)) {
        verdict = 'INCONCLUSIVE';
        detail = `child did not exit cleanly: status=${run.status} signal=${run.signal} spawnError=${run.spawnError}`;
      } else if (run.failed === null) {
        detail = 'could not parse the summary';
      } else if (run.failed === 0) {
        verdict = 'NOT PROVEN (test still passes)';
        detail = `0 failed / ${run.passed} passed`;
      } else if (mutation.expectFailing.length === 0) {
        verdict = 'PROVEN-UNRELATED (a test failed, but this mutation expected none to)';
        detail = `${run.failed} failed / ${run.passed} passed; failed: ${run.failedTests.slice(0, 2).join(' | ').slice(0, 140)}`;
      } else {
        const matched = run.failedTests.filter((line) =>
          mutation.expectFailing.some((expected) => line.includes(expected)),
        );
        if (matched.length > 0) {
          verdict = 'PROVEN (the named test fails without the guard)';
          detail = `${run.failed} failed / ${run.passed} passed; matched: ${matched[0].slice(0, 90)}`;
        } else {
          verdict = 'PROVEN-UNRELATED (failures did not include the named test)';
          detail = `${run.failed} failed / ${run.passed} passed; failed: ${run.failedTests.slice(0, 3).join(' | ').slice(0, 160)}`;
        }
      }
    }
  } finally {
    for (const [file, content] of originals) fs.writeFileSync(file, content);
  }

  results.push({ id: mutation.id, expectFailing: mutation.expectFailing, verdict, detail });
  console.log(`${mutation.id} -> ${verdict} :: ${detail}`);
}

console.log('\n=== MUTATION SUMMARY ===');
for (const row of results) {
  console.log(`${row.verdict.padEnd(52)} ${row.id}  [${row.detail}]`);
}
fs.writeFileSync('artifacts/runtime/batch2-mutation-report.json', JSON.stringify({ baseline, results }, null, 2));
