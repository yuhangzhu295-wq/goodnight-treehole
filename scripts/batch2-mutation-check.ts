/**
 * Mutation harness for the Batch 2 review fixes.
 *
 * For each guard added by the review fixes, remove it and run the spec. A guard whose removal
 * leaves the suite green is NOT proven by the suite, and that has to be reported as unproven
 * rather than covered. Where two guards are redundant, both are removed together so the original
 * defect is reproduced.
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
    patches: [
      {
        file: STORE,
        old: '    const topMatches = userMatches.sort((a, b) => b.score - a.score);',
        new: '    const topMatches = userMatches.sort((a, b) => b.score - a.score).slice(0, 3);',
      },
    ],
  },
  {
    id: 'M8 close notification throws after the commit (notification semantics)',
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
    patches: [{ file: REGISTRY, old: "  PeerMatch: 'peerMatches',\n", new: '' }],
  },
  {
    id: 'M10 journey reference is not re-resolved under the lock (A5)',
    patches: [
      {
        file: PEER,
        old: '  if (!journeyId) return null;\n  const rows = await tx.$queryRaw<any[]>`SELECT id FROM "LifeJourney" WHERE id = ${journeyId}`;\n  return rows.length ? journeyId : null;',
        new: '  return journeyId ?? null;',
      },
    ],
  },
];

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

const results = [];

for (const mutation of mutations) {
  const originals = new Map();
  let patchError = '';
  for (const patch of mutation.patches) {
    if (!originals.has(patch.file)) originals.set(patch.file, fs.readFileSync(patch.file, 'utf8'));
    const current = fs.readFileSync(patch.file, 'utf8');
    if (countOccurrences(current, patch.old) !== 1) {
      patchError = `${patch.file}: expected 1 match, found ${countOccurrences(current, patch.old)}`;
      break;
    }
    fs.writeFileSync(patch.file, current.replace(patch.old, patch.new));
  }

  if (patchError) {
    for (const [file, content] of originals) fs.writeFileSync(file, content);
    results.push({ id: mutation.id, verdict: 'PATCH-FAILED', detail: patchError });
    console.log(`${mutation.id} -> PATCH-FAILED (${patchError})`);
    continue;
  }

  let verdict;
  let detail = '';
  try {
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
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
    const aggregate = output.match(/Tests:\s+(\d+) failed \| (\d+) passed \((\d+)\)/);
    const fallback = output.match(/Tests\s+(\d+) failed \| (\d+) passed \((\d+)\)/);
    const match = aggregate ?? fallback;
    if (match) {
      const failed = Number(match[1]);
      const passed = Number(match[2]);
      verdict = failed > 0 ? 'PROVEN (test fails without the guard)' : 'NOT PROVEN (test still passes)';
      detail = `${failed} failed / ${passed} passed`;
    } else {
      verdict = 'INCONCLUSIVE';
      detail = output.split('\n').filter((line) => /Error|failed|Cannot/.test(line)).slice(0, 3).join(' | ');
    }
  } finally {
    for (const [file, content] of originals) fs.writeFileSync(file, content);
  }

  results.push({ id: mutation.id, verdict, detail });
  console.log(`${mutation.id} -> ${verdict} :: ${detail}`);
}

console.log('\n=== MUTATION SUMMARY ===');
for (const row of results) console.log(`${row.verdict.padEnd(36)} ${row.id}  [${row.detail}]`);
fs.writeFileSync('artifacts/runtime/batch2-mutation-report.json', JSON.stringify(results, null, 2));
