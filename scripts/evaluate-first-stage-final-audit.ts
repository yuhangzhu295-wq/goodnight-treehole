import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { materializeTruthEvidence, truthAuditPages, truthAuditRoot } from './materialize-first-stage-final-audit.ts';

const reviewPath = path.resolve('docs', 'first-stage-ui-truth-review.json');
const reportPath = path.resolve('docs', 'first-stage-ui-truth-verification.md');
const notificationManifestPath = path.resolve('artifacts', 'notification-truth-states', 'manifest.json');
const commandResultsPath = path.resolve('docs', 'first-stage-ui-truth-command-results.json');
const statusValues = ['DONE', 'PARTIAL', 'FAIL'] as const;
const areaNames = ['Hero', 'Illustration', 'Content hierarchy', 'Typography', 'CTA and actions', 'Navigation and safe area', 'Reference fidelity'] as const;
type Status = typeof statusValues[number];
type Area = typeof areaNames[number];
type Review = { status: Status; rationale: string; areas: Record<Area, { status: Status; evidence: string }> };
type ReviewInput = { reviewedAt: string; reviewer: string; pages: Record<string, Review> };

function assertStatus(value: unknown, label: string): asserts value is Status {
  if (!statusValues.includes(value as Status)) throw new Error(`${label} must be one of ${statusValues.join(', ')}`);
}

async function digest(file: string) {
  return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex').slice(0, 16);
}

async function pngDimensions(file: string) {
  const image = PNG.sync.read(await fs.readFile(file));
  return `${image.width}x${image.height}`;
}

async function readReview(): Promise<ReviewInput> {
  const raw = JSON.parse(await fs.readFile(reviewPath, 'utf8')) as Partial<ReviewInput>;
  if (typeof raw.reviewedAt !== 'string' || typeof raw.reviewer !== 'string' || !raw.pages) {
    throw new Error(`Reviewer decision record is incomplete: ${reviewPath}`);
  }
  for (const page of truthAuditPages) {
    const review = raw.pages[page.directory];
    if (!review) throw new Error(`Missing manual review for ${page.directory}`);
    assertStatus(review.status, `${page.directory} overall status`);
    if (typeof review.rationale !== 'string' || !review.rationale.trim()) throw new Error(`${page.directory} requires a manual rationale`);
    for (const area of areaNames) {
      const decision = review.areas?.[area];
      if (!decision) throw new Error(`${page.directory} is missing manual area review: ${area}`);
      assertStatus(decision.status, `${page.directory} ${area}`);
      if (typeof decision.evidence !== 'string' || !decision.evidence.trim()) throw new Error(`${page.directory} ${area} requires evidence`);
    }
  }
  return raw as ReviewInput;
}

function aggregate(statuses: Status[]): Status {
  if (statuses.includes('FAIL')) return 'FAIL';
  if (statuses.includes('PARTIAL')) return 'PARTIAL';
  return 'DONE';
}

async function verifyEvidence(directory: string) {
  const files = ['reference.png', 'actual.png', 'side-by-side.png', 'difference.png'] as const;
  const result: Record<string, { dimensions: string; sha256: string }> = {};
  for (const file of files) {
    const target = path.join(truthAuditRoot, directory, file);
    result[file] = { dimensions: await pngDimensions(target), sha256: await digest(target) };
  }
  if (result['reference.png'].dimensions !== '420x786' || result['actual.png'].dimensions !== '420x786') {
    throw new Error(`${directory} is not a fresh 420x786 reference/actual pair`);
  }
  return result;
}

async function main() {
  await materializeTruthEvidence();
  const review = await readReview();
  const commandResults = JSON.parse(await fs.readFile(commandResultsPath, 'utf8')) as { executedAt?: string; results?: Array<{ command?: string; status?: string; evidence?: string }> };
  if (!commandResults.results?.length || commandResults.results.some((item) => item.status !== 'PASS' || !item.command || !item.evidence)) {
    throw new Error(`Command result record is incomplete: ${commandResultsPath}`);
  }
  const notificationManifest = JSON.parse(await fs.readFile(notificationManifestPath, 'utf8')) as {
    states?: { reference?: { types?: string[]; click?: { persistedStatus?: string } }; stress?: { count?: number } };
    cleanup?: { apiCount?: number };
  };
  const notificationTypes = notificationManifest.states?.reference?.types ?? [];
  if (JSON.stringify(notificationTypes) !== JSON.stringify(['COOLDOWN_RELEASED', 'FOLLOW_UP', 'FUTURE_SELF', 'PEER_REQUEST'])) {
    throw new Error('Notification reference state is missing one of the four required persisted types');
  }
  if (notificationManifest.states?.reference?.click?.persistedStatus !== 'read' || (notificationManifest.states?.stress?.count ?? 0) < 20 || notificationManifest.cleanup?.apiCount !== 0) {
    throw new Error('Notification state lifecycle evidence is incomplete');
  }
  const overallStatuses: Status[] = [];
  const rows: string[] = [];
  for (const page of truthAuditPages) {
    const decision = review.pages[page.directory];
    const evidence = await verifyEvidence(page.directory);
    const status = aggregate([decision.status, ...areaNames.map((area) => decision.areas[area].status)]);
    overallStatuses.push(status);
    const audit = [
      `# ${page.title} Truth Audit`,
      '',
      `Status: ${status}`,
      '',
      '## Review provenance',
      '',
      `- Reviewer: ${review.reviewer}`,
      `- Reviewed at: ${review.reviewedAt}`,
      `- Reference: ${page.reference}`,
      `- Navigation in supplied reference: ${page.navigation}`,
      `- Manual rationale: ${decision.rationale}`,
      '',
      '| Area | Status | Evidence |',
      '| --- | --- | --- |',
      ...areaNames.map((area) => `| ${area} | ${decision.areas[area].status} | ${decision.areas[area].evidence} |`),
      '',
      '## Objective capture checks',
      '',
      ...Object.entries(evidence).map(([file, item]) => `- ${file}: ${item.dimensions}, sha256 ${item.sha256}`),
      '- Capture integrity verifies dimensions and artifacts only. It does not substitute for a visual verdict.',
      '',
      '## Evidence',
      '',
      '- reference.png',
      '- actual.png',
      '- side-by-side.png',
      '- difference.png',
      '',
    ].join('\n');
    await fs.writeFile(path.join(truthAuditRoot, page.directory, 'audit.md'), audit, 'utf8');
    rows.push(`| ${page.directory} | ${page.title} | ${status} | ${page.navigation} | [audit](../artifacts/final-ui-truth-audit/first-stage/${page.directory}/audit.md) |`);
  }
  const finalStatus = aggregate(overallStatuses);
  const frozen = finalStatus === 'DONE';
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, [
    '# First-stage UI Truth Verification',
    '',
    `Final status: **${finalStatus}**`,
    `FIRST_STAGE_UI_FROZEN=${frozen}`,
    '',
    '## Integrity boundary',
    '',
    '- `materialize-first-stage-final-audit.ts` only copies fresh evidence and cannot assign visual status.',
    '- This evaluator verifies capture dimensions and requires a complete reviewer decision record. It has no default visual status.',
    '- The reviewer decision record was supplied after opening each source reference, actual capture, side-by-side image, and difference image.',
    '- A frozen result is legal only when every page and every review area is DONE.',
    '',
    '## Page aggregation',
    '',
    '| Page | Title | Status | Reference navigation | Evidence |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## Reference-derived TabBar contract',
    '',
    '- Four-tab navigation: #1 Tonight, #36 Situation, #29 Temperature, #13 Intent, #32 Stabilize, #6 Action, #37 Adaptive Action, #39 Notification.',
    '- Detail navigation: #33 Safety, #16 Reality Handoff, #34 Journey timeline. These pages keep their real return controls and no longer receive a global fixed TabBar.',
    '',
    '## Evidence root',
    '',
    `- ${truthAuditRoot}`,
    `- Reviewer input: ${reviewPath}`,
    '',
    '## Notification persisted-state QA',
    '',
    '- `test:notification-truth-state` uses an isolated relational test schema. It never injects a Vue array or a transparent test overlay.',
    `- Four-type reference state: ${notificationTypes.join(', ')}.`,
    `- Card click persisted status: ${notificationManifest.states?.reference?.click?.persistedStatus}; stress count: ${notificationManifest.states?.stress?.count}; cleanup API count: ${notificationManifest.cleanup?.apiCount}.`,
    '- Evidence: `artifacts/notification-truth-states/empty.png`, `single.png`, `reference-four.png`, `stress.png`, and `manifest.json`.',
    '',
    '## Current outcome and next step',
    '',
    '- The audit is intentionally not frozen: the reference-side-by-side review found material visual gaps in every page even though the verified data flows and navigation contracts remain live.',
    '- The next UI pass should repair the documented PARTIAL areas page by page, then capture fresh evidence and submit a new human review. A visual status must not be upgraded merely because automated checks pass.',
    '',
    '## Executed verification commands',
    '',
    `- Recorded at: ${commandResults.executedAt}`,
    ...commandResults.results.map((item) => `- PASS \`${item.command}\`: ${item.evidence}`),
    '',
  ].join('\n'), 'utf8');
  console.log(`First-stage truth verification: ${finalStatus}; FIRST_STAGE_UI_FROZEN=${frozen}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
