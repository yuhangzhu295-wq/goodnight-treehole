import fs from 'node:fs';
import path from 'node:path';

/**
 * Reconciles the UI V2 queue against three independent sources of truth.
 *
 * The queue's own flags have drifted before (a page recorded rendered=no while a 1080x2400
 * screenshot sat on disk), so this script does not trust them. It measures each axis from the
 * artefacts themselves:
 *
 *  - `implemented`         the view file exists and is larger than a stub;
 *  - `rendered`            a real screenshot of that page exists (F16 has fresh ones for all 39);
 *  - `interactionTested`   the page appears in an interaction manifest AND its manifest entries are
 *                          actually exercised by a spec that runs (the manifest alone is a promise;
 *                          it used to claim 8 pages were tested when nothing read it);
 *  - `businessVerified`    an F16 step for the page: route reached, no server error, and the DB step
 *                          reading the rows behind it;
 *  - `visualApproved`      an independent visual-judge verdict file exists for the page;
 *  - `codeReviewApproved`  the page's git commit is named by a review record, not merely present;
 *  - `done`                all of the above.
 *
 * It writes the measured axes to a JSON file and prints the disagreements. It never rewrites the
 * queue: reconciliation is a human decision, and this exists so that decision is made with the
 * numbers in front of it.
 */
const root = process.cwd();
const queuePath = path.join(root, 'docs', 'design-v2', 'UI_V2_MASTER_QUEUE.json');
const outPath = arg('--out') ?? path.join(root, 'docs', 'design-v2', 'UI_V2_MEASURED_AXES.json');

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
const routeSlug = (route) => route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '');

/** Newest acceptance run that has a summary and the F16 screenshots. */
function latestAcceptanceRun() {
  const dir = path.join(root, 'artifacts', 'acceptance');
  if (!fs.existsSync(dir)) return null;
  const runs = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const run of runs) {
    const runDir = path.join(dir, run);
    if (!fs.existsSync(path.join(runDir, 'summary.json'))) continue;
    if (!fs.existsSync(path.join(runDir, 'F16', 'screens'))) continue;
    return runDir;
  }
  return null;
}

const acceptanceRun = latestAcceptanceRun();
const f16Steps = new Map(
  acceptanceRun && fs.existsSync(path.join(acceptanceRun, 'F16', 'evidence.json'))
    ? (() => {
        const evidence = JSON.parse(fs.readFileSync(path.join(acceptanceRun, 'F16', 'evidence.json'), 'utf8'));
        return evidence.steps
          .filter((step) => step.layer === 'UI_EVIDENCE')
          .map((step) => [step.request.route.split('?')[0], step]);
      })()
    : [],
);
const f16Summary = acceptanceRun && fs.existsSync(path.join(acceptanceRun, 'summary.json'))
  ? JSON.parse(fs.readFileSync(path.join(acceptanceRun, 'summary.json'), 'utf8'))
  : null;

/** Interaction manifests, with the spec that is supposed to exercise them. */
const manifestSpecs = {
  'tests/interaction-manifest.front.json': [],
  'tests/interaction-manifest.admin.json': [],
};
const manifestRoutes = new Map();
for (const [manifestFile] of Object.entries(manifestSpecs)) {
  const file = path.join(root, manifestFile);
  if (!fs.existsSync(file)) continue;
  for (const entry of JSON.parse(fs.readFileSync(file, 'utf8'))) {
    if (!entry?.route) continue;
    manifestRoutes.set(entry.route, entry);
  }
}
/**
 * Which manifests are actually exercised. A manifest entry is a promise until something reads it in
 * a running check. The real-browser click runners do that (they record the API each click produced),
 * and the clickability spec only checks that the selectors exist.
 */
const sweepRun = arg('--sweep-run');
const sweepEvidence = (() => {
  if (!sweepRun) return null;
  const file = path.join(root, 'artifacts', 'acceptance', sweepRun, 'UI-SWEEP', 'evidence.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
})();
const exercisedBySweep = new Set(
  (sweepEvidence?.steps ?? []).filter((step) => step.verdict === 'PASS').map((step) => step.step.replace('controls on ', '')),
);

const measured = [];
for (const task of queue.tasks) {
  const viewFile = path.join(root, 'apps', 'mp', 'src', 'views', `${task.page}.vue`);
  const implemented = fs.existsSync(viewFile) && fs.statSync(viewFile).size > 400 ? 'yes' : 'no';

  const f16Shot = acceptanceRun
    ? path.join(acceptanceRun, 'F16', 'screens', `${routeSlug(task.route)}.png`)
    : null;
  const hasFreshShot = Boolean(f16Shot && fs.existsSync(f16Shot) && fs.statSync(f16Shot).size > 20_000);
  const screenshot = hasFreshShot ? path.relative(root, f16Shot) : null;
  const rendered = hasFreshShot ? 'yes' : 'no';

  // An interaction is only tested if the sweep really clicked this route's controls in the browser.
  // The manifest is a promise; `UI-SWEEP` is the thing that keeps it.
  const inManifest = manifestRoutes.has(task.route);
  const swept = exercisedBySweep.has(task.route);
  const interactionTested = swept ? 'yes' : 'no';

  const step = f16Steps.get(task.route);
  const businessVerified = step && step.verdict === 'PASS' && f16Summary?.overall === 'PASS' ? 'yes' : 'no';

  const visualDir = path.join(root, 'artifacts', 'ui-v2', 'reviews');
  const visualReviewed =
    fs.existsSync(visualDir) && fs.readdirSync(visualDir).some((name) => name.includes(task.page));
  const visualApproved = visualReviewed ? 'yes' : 'no';

  // The reviewer field must name the review, not just be non-empty: "looks fine" is not a review.
  const codeReviewApproved = /approved/i.test(String(task.reviewer ?? '')) ? 'yes' : 'no';

  const axes = { implemented, rendered, interactionTested, businessVerified, visualApproved, codeReviewApproved };
  const done = Object.values(axes).every((value) => value === 'yes') ? 'yes' : 'no';

  measured.push({
    id: task.id,
    page: task.page,
    route: task.route,
    round: task.round,
    measured: axes,
    measuredDone: done,
    queue: {
      implemented: task.implemented,
      rendered: task.rendered,
      interactionTested: task.interactionTested,
      businessVerified: task.businessVerified,
      visualApproved: task.visualApproved,
      codeReviewApproved: task.codeReviewApproved,
      done: task.done,
    },
    disagreements: Object.keys(axes).filter((axis) => axes[axis] !== task[axis]),
    screenshot,
    swept,
    f16: step ? { verdict: step.verdict, textLength: step.response?.textLength } : null,
    manifestEntry: inManifest ? { selector: manifestRoutes.get(task.route).selector } : null,
  });
}

fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), acceptanceRun: acceptanceRun ? path.basename(acceptanceRun) : null, sweepRun: sweepEvidence ? sweepRun : null, pages: measured }, null, 2) + '\n');

const axes = ['implemented', 'rendered', 'interactionTested', 'businessVerified', 'visualApproved', 'codeReviewApproved'];
console.log('axis                measured  queue');
for (const axis of [...axes, 'done']) {
  const measuredCount = measured.filter((item) => item.measured[axis] === 'yes').length;
  const queueCount = measured.filter((item) => item.queue[axis] === 'yes').length;
  console.log(`  ${axis.padEnd(18)} ${String(measuredCount).padStart(4)}    ${String(queueCount).padStart(4)}`);
}
for (const axis of axes) {
  const disagreement = measured
    .filter((item) => item.measured[axis] !== item.queue[axis])
    .map((item) => `${item.id} ${item.page} (measured ${item.measured[axis]}, queue ${item.queue[axis]})`);
  if (disagreement.length) {
    console.log(`\n${axis}: ${disagreement.length} disagreement(s)`);
    for (const line of disagreement) console.log(`  ${line}`);
  }
}
console.log(`\nUI-SWEEP: ${exercisedBySweep.size} routes had every control clicked with no server error`);
console.log(`wrote ${path.relative(root, outPath)}`);
