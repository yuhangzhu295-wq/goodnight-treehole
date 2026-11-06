#!/usr/bin/env node
/**
 * Builds the acceptance run summary from the evidence each flow wrote.
 *
 * This is a gate, not a report generator: it exits non-zero when a flow is missing, when a flow's
 * evidence verdict is FAIL, or when a flow does not carry every evidence layer its manifest entry
 * requires. A summary that only counted files would call a run complete because nothing crashed.
 *
 * Usage:
 *   node scripts/acceptance/build-summary.mjs [--run <runId>] [--require-all] [--out <path>]
 *
 * Without --run it takes the newest directory under artifacts/acceptance.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const acceptanceRoot = path.join(root, 'artifacts', 'acceptance');
const manifestPath = path.join(root, 'tests', 'acceptance', 'flow-manifest.json');

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const requireAll = process.argv.includes('--require-all');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

let runId = arg('--run');
if (!runId) {
  const runs = fs
    .readdirSync(acceptanceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  runId = runs.at(-1);
}
if (!runId) {
  console.error('no acceptance run directory found');
  process.exit(2);
}

const runDir = path.join(acceptanceRoot, runId);
const flows = [];

for (const flow of manifest.flows) {
  const file = path.join(runDir, flow.id, 'evidence.json');
  if (!fs.existsSync(file)) {
    flows.push({
      id: flow.id,
      title: flow.title,
      spec: flow.spec,
      status: 'NOT_RUN',
      verdict: 'NOT_RUN',
      steps: 0,
      missingLayers: flow.evidence,
      failures: [],
    });
    continue;
  }
  const evidence = JSON.parse(fs.readFileSync(file, 'utf8'));
  const steps = Array.isArray(evidence.steps) ? evidence.steps : [];
  const layers = new Set(steps.map((step) => step.layer));
  const missingLayers = flow.evidence.filter((layer) => !layers.has(layer));
  const failures = steps.filter((step) => step.verdict !== 'PASS').map((step) => step.step);
  const verdict = evidence.verdict === 'PASS' && missingLayers.length === 0 && failures.length === 0 ? 'PASS' : 'FAIL';
  flows.push({
    id: flow.id,
    title: flow.title,
    spec: flow.spec,
    status: 'RAN',
    verdict,
    recordedAt: evidence.recordedAt,
    gitSha: evidence.gitSha,
    databaseUrl: evidence.databaseUrl,
    steps: steps.length,
    evidenceLayers: [...layers].sort(),
    missingLayers,
    failures,
  });
}

const counted = flows.filter((flow) => flow.status === 'RAN');
const failed = flows.filter((flow) => flow.verdict === 'FAIL');
const notRun = flows.filter((flow) => flow.status === 'NOT_RUN');
const overall =
  failed.length > 0 || (requireAll && notRun.length > 0) ? 'FAIL' : notRun.length > 0 ? 'INCOMPLETE' : 'PASS';

const summary = {
  runId,
  generatedAt: new Date().toISOString(),
  manifest: path.relative(root, manifestPath).replaceAll('\\', '/'),
  overall,
  requireAll,
  counts: {
    flows: flows.length,
    ran: counted.length,
    passed: flows.filter((flow) => flow.verdict === 'PASS').length,
    failed: failed.length,
    notRun: notRun.length,
  },
  flows,
};

const out = arg('--out') ?? path.join(runDir, 'summary.json');
fs.writeFileSync(out, JSON.stringify(summary, null, 2) + '\n');

console.log(`run ${runId}: ${overall} (${counted.length}/${flows.length} flows ran)`);
for (const flow of flows) {
  const detail =
    flow.verdict === 'PASS'
      ? `${flow.steps} steps`
      : flow.status === 'NOT_RUN'
        ? `not run (needs ${flow.missingLayers.join(', ')})`
        : `${flow.failures.length} failed steps, missing layers: ${flow.missingLayers.join(', ') || 'none'}`;
  console.log(`  ${flow.verdict.padEnd(9)} ${flow.id} ${flow.title} - ${detail}`);
}
console.log(`wrote ${path.relative(root, out).replaceAll('\\', '/')}`);

if (overall === 'FAIL') process.exit(1);
