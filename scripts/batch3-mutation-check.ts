/**
 * Mutation harness for persistence Batch 3, step 1
 * (`PrivacySetting`, `TrustedContact`, `StableSelfProfile`, `RealityHandoff`, `PersonalSupportPlan`).
 *
 * Same discipline as `scripts/batch2-mutation-check.ts`: a guard is only proven if removing it makes
 * a **named** test fail. The harness refuses to run at all unless its baseline is green, requires a
 * clean child exit, reports `PROVEN-UNRELATED` when the failures do not include the named test, and
 * restores every patched file in a `finally` that also covers patch application.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const SELF = 'apps/api/src/self-persistence.service.ts';
const STORE = 'apps/api/src/store.service.ts';
const REGISTRY = 'apps/api/src/direct-db-models.ts';
const SELF_SPEC = 'tests/business/batch3-self-verification.spec.ts';
const PRIVACY_SPEC = 'tests/business/third-stage-privacy-2.spec.ts';
const TRANSITION_SPEC = 'tests/business/batch3-journey-transition.spec.ts';
const B1 = 'apps/api/src/batch1-persistence.service.ts';

const mutations = [
  {
    id: 'M1 support plan: an unspecified journeyId detaches instead of being omitted',
    spec: SELF_SPEC,
    expectFailing: ['3.1'],
    patches: [
      {
        file: SELF,
        old: "        if (journeyIdSpecified) {\n          if (params.journeyId === null) {\n            updateData.journey = { disconnect: true };\n          } else if (suppliedJourneyId) {\n            updateData.journey = { connect: { id: suppliedJourneyId } };\n          }\n        }",
        new: '        updateData.journey = { disconnect: true };',
      },
    ],
  },
  {
    id: 'M2 reality handoff: the journey ownership check removed',
    spec: SELF_SPEC,
    expectFailing: ['2.1'],
    patches: [
      {
        file: SELF,
        old: "      if (targetJourneyId) {\n        const journey = await tx.lifeJourney.findUnique({ where: { id: targetJourneyId } });\n        if (!journey || journey.userId !== params.userId) {\n          throw new NotFoundException('旅程不存在或无权访问');\n        }\n      }",
        new: '      // mutation: journey ownership not checked',
      },
    ],
  },
  {
    id: 'M3 support plan: the in-transaction privacy gate removed',
    spec: SELF_SPEC,
    expectFailing: ['2.8'],
    patches: [
      {
        file: SELF,
        old: "      const privacy = await tx.privacySetting.findUnique({ where: { userId: params.userId } });\n      if (privacy?.allowRecoveryData !== true) {\n        throw new ForbiddenException('请先在隐私设置中允许保存支持计划');\n      }",
        new: '      // mutation: privacy gate removed',
      },
    ],
  },
  {
    id: 'M4 admin support-plan list: the plan JSON is returned again',
    spec: SELF_SPEC,
    expectFailing: ['1.6'],
    patches: [
      {
        file: SELF,
        old: '        select: {\n          id: true,\n          userId: true,\n          journeyId: true,\n          title: true,\n          active: true,\n          createdAt: true,\n          updatedAt: true,\n        },',
        new: '        select: {\n          id: true,\n          userId: true,\n          journeyId: true,\n          title: true,\n          plan: true,\n          active: true,\n          createdAt: true,\n          updatedAt: true,\n        },',
      },
      {
        file: SELF,
        old: '        title: r.title,\n        active: r.active,',
        new: '        title: r.title,\n        plan: (r as { plan?: unknown }).plan,\n        active: r.active,',
      },
    ],
  },
  {
    id: 'M5 admin audited read: content returned without persisting the audit row',
    spec: SELF_SPEC,
    expectFailing: ['1.7'],
    patches: [
      {
        file: SELF,
        old: "    await this.prisma.auditLog.create({\n      data: {\n        id: genId('audit'),\n        adminUserId,\n        action: 'SUPPORT_PLAN_READ_FULL',",
        new: "    if (false) await this.prisma.auditLog.create({\n      data: {\n        id: genId('audit'),\n        adminUserId,\n        action: 'SUPPORT_PLAN_READ_FULL',",
      },
    ],
  },
  {
    id: 'M6 registry: PersonalSupportPlan unregistered (legacy writer returns)',
    spec: SELF_SPEC,
    expectFailing: ['5.1'],
    patches: [{ file: REGISTRY, old: "  PersonalSupportPlan: 'personalSupportPlans',\n", new: '' }],
  },
  {
    id: 'M7 registry: PrivacySetting unregistered (destructive per-user upsert returns)',
    spec: SELF_SPEC,
    expectFailing: ['4.1'],
    patches: [{ file: REGISTRY, old: "  PrivacySetting: 'privacySettings',\n", new: '' }],
  },
  {
    id: 'M8 the export privacy gate loses its await again (the gate stops enforcing)',
    spec: PRIVACY_SPEC,
    expectFailing: ['persists independent consent'],
    patches: [
      {
        file: STORE,
        old: "    await this.privacyAllows(userId, 'allowDataExport', '请先在隐私设置中允许导出个人数据');\n    const generatedAt = now();",
        new: "    this.privacyAllows(userId, 'allowDataExport', '请先在隐私设置中允许导出个人数据');\n    const generatedAt = now();",
      },
    ],
  },
  {
    id: 'M9 patchJourney: guard before the lock AND an unconditional write (the ordering claim)',
    spec: TRANSITION_SPEC,
    expectFailing: ['1.5'],
    patches: [
      {
        file: B1,
        old: '      // The transition rule runs under the LifeJourney lock, so a graduation committing concurrently\n      // cannot slip between the check and the write.\n      const locked = await lockJourneyAndAssertTransition(tx, journeyId, body.status);',
        new: '      const [preRow] = await tx.$queryRaw<any[]>`SELECT * FROM "LifeJourney" WHERE id = ${journeyId}`;\n      const locked = { status: preRow.status } as any;\n      if (body.status && preRow.status !== body.status && !(ALLOWED_JOURNEY_TRANSITIONS[preRow.status] ?? []).includes(body.status)) {\n        throw new BadRequestException("mutation: pre-lock guard");\n      }',
      },
      {
        file: B1,
        old: "        const result = await tx.lifeJourney.updateMany({\n          where: { id: journeyId, status: locked.status },\n          data,\n        });\n        if (result.count === 0) {\n          throw new ConflictException('旅程状态已被并发更新，请刷新重试');\n        }",
        new: '        await tx.lifeJourney.updateMany({ where: { id: journeyId }, data });',
      },
    ],
  },
  {
    id: 'M10 updateJourneyStatus: guard before the lock AND an unconditional write',
    spec: TRANSITION_SPEC,
    expectFailing: ['1.6'],
    patches: [
      {
        file: B1,
        old: "      // The transition rule runs under the LifeJourney lock (the same helper both entry points use),\n      // and the write is conditional on the status that was read there.\n      const locked = await lockJourneyAndAssertTransition(tx, journeyId, status);\n\n      const updated = await tx.lifeJourney.updateMany({\n        where: { id: journeyId, status: locked.status },\n        data: { status, updatedAt: new Date() },\n      });\n      if (updated.count === 0) {\n        throw new ConflictException('旅程状态已被并发更新，请刷新重试');\n      }",
        new: '      const [preRow] = await tx.$queryRaw<any[]>`SELECT * FROM "LifeJourney" WHERE id = ${journeyId}`;\n      if (preRow.status !== status && !(ALLOWED_JOURNEY_TRANSITIONS[preRow.status] ?? []).includes(status)) {\n        throw new BadRequestException("mutation: pre-lock guard");\n      }\n      await tx.lifeJourney.updateMany({ where: { id: journeyId }, data: { status, updatedAt: new Date() } });',
      },
    ],
  },
  {
    id: 'M11 graduation: unconditional transition (a repeat graduation counts as a second one)',
    spec: TRANSITION_SPEC,
    expectFailing: ['2.1'],
    patches: [
      {
        file: B1,
        old: "      if (journey.status === 'completed') {\n        return { journey: mapLifeJourneyRow(journey), transitioned: false };\n      }",
        new: '      // mutation: no already-completed short circuit',
      },
      {
        file: B1,
        old: "      const updated = await tx.lifeJourney.updateMany({\n        where: { id: journeyId, status: { notIn: ['completed'] } },\n        data: {\n          status: 'completed',\n          stage: 'graduated',\n          completedAt: nowTime,\n          updatedAt: nowTime,\n        },\n      });\n      const finalRow = await tx.lifeJourney.findUniqueOrThrow({ where: { id: journeyId } });\n      return { journey: mapLifeJourneyRow(finalRow), transitioned: updated.count > 0 };",
        new: "      await tx.lifeJourney.updateMany({\n        where: { id: journeyId },\n        data: { status: 'completed', stage: 'graduated', completedAt: nowTime, updatedAt: nowTime },\n      });\n      const finalRow = await tx.lifeJourney.findUniqueOrThrow({ where: { id: journeyId } });\n      return { journey: mapLifeJourneyRow(finalRow), transitioned: true };",
      },
    ],
  },
  {
    id: 'M12 same-status requests refused (the hybrid PATCH contract breaks)',
    spec: TRANSITION_SPEC,
    expectFailing: ['1.4'],
    patches: [
      {
        file: B1,
        old: '  if (!target || row.status === target) return row;',
        new: '  if (!target) return row;',
      },
    ],
  },
];

const countOccurrences = (haystack, needle) => haystack.split(needle).length - 1;
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const stripAnsi = (text: string) => text.replace(ANSI_PATTERN, '');

function runSpec(spec) {
  const run = spawnSync(
    process.execPath,
    [
      'node_modules/tsx/dist/cli.mjs',
      'scripts/test-runner.ts',
      'vitest',
      'run',
      spec,
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

// Optional filter: `tsx scripts/batch3-mutation-check.ts M10` runs one mutation.
const only = process.argv[2];
const selected = only ? mutations.filter((m) => m.id.startsWith(only)) : mutations;
if (!selected.length) {
  console.error(`No mutation matches "${only}"`);
  process.exit(1);
}

const specs = [...new Set(selected.map((m) => m.spec))];
const baselines = new Map<string, ReturnType<typeof runSpec>>();
console.log('=== baseline runs (each must be green before any mutation result is meaningful) ===');
for (const spec of specs) {
  const baseline = runSpec(spec);
  baselines.set(spec, baseline);
  if (!childOk(baseline) || baseline.failed === null || baseline.failed > 0) {
    console.error(`ABORT: baseline for ${spec} is not green (failed=${baseline.failed}, status=${baseline.status}).`);
    console.error(baseline.failedTests.slice(0, 6).join('\n'));
    process.exit(1);
  }
  console.log(`baseline green: ${spec} — ${baseline.passed} passed`);
}
console.log('');

const results = [];

for (const mutation of selected) {
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
      const run = runSpec(mutation.spec);
      if (!childOk(run)) {
        detail = `child did not exit cleanly: status=${run.status} signal=${run.signal} spawnError=${run.spawnError}`;
      } else if (run.failed === null) {
        detail = 'could not parse the summary';
      } else if (run.failed === 0) {
        verdict = 'NOT PROVEN (test still passes)';
        detail = `0 failed / ${run.passed} passed`;
      } else {
        const matched = run.failedTests.filter((line) =>
          mutation.expectFailing.some((expected) => line.includes(expected)),
        );
        if (matched.length > 0) {
          verdict = 'PROVEN (the named test fails without the guard)';
          detail = `${run.failed} failed / ${run.passed} passed; matched: ${matched[0].slice(0, 80)}`;
        } else {
          verdict = 'PROVEN-UNRELATED (failures did not include the named test)';
          detail = `${run.failed} failed / ${run.passed} passed; failed: ${run.failedTests.slice(0, 2).join(' | ').slice(0, 150)}`;
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
for (const row of results) console.log(`${row.verdict.padEnd(52)} ${row.id}  [${row.detail}]`);
fs.writeFileSync(
  'artifacts/runtime/batch3-step1-mutation-report.json',
  JSON.stringify({ baselines: [...baselines.keys()], results }, null, 2),
);
