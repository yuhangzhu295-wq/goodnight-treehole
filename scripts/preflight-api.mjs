// Fail the run with a distinct exit code when the local stack is not serving.
//
// Without this, a database or WSL2-forwarding outage reaches the page as a 500, the page renders its
// error banner, and the page-level assertions then report "the field did not take focus" or "the
// record is missing" - product defects that do not exist. The environment is not the product, and a
// run that cannot tell them apart is not evidence either way.
//
// Exit code 2 means "environment", 1 (from the caller) means "product".
import { execFileSync } from 'node:child_process';

const HEALTH_URL = process.env.API_HEALTH_URL ?? 'http://127.0.0.1:3000/api/v1/feedback/faqs';

async function probe() {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(4000) });
    return res.ok ? '' : `HTTP ${res.status}`;
  } catch (error) {
    return error.message;
  }
}

/**
 * The WSL2 → Windows port forwarding drops every so often while the containers stay Up, so the API
 * starts answering 500 "can't reach database". `docker compose up -d` (which stack-up.sh runs) brings
 * the forwarding back. Retrying is not hiding a product problem: the same probe has to pass before any
 * assertion runs, and the attempt is printed.
 */
function heal() {
  try {
    execFileSync('bash', ['scripts/stack-up.sh'], { stdio: 'ignore', cwd: process.cwd() });
    return true;
  } catch {
    return false;
  }
}

/** Polls the health URL for up to `budgetMs`, returning '' once it answers 200. */
async function pollUntilHealthy(budgetMs, intervalMs = 2000) {
  const deadline = Date.now() + budgetMs;
  let last = await probe();
  while (last && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    last = await probe();
  }
  return last;
}

export async function requireStack({ allowHeal = true } = {}) {
  // A 500 here is usually postgres still starting up, not a dead stack. Give it a few seconds before
  // touching anything: restarting containers that are mid-initialisation makes the outage longer.
  let last = await pollUntilHealthy(8000);
  if (!last) return;
  if (allowHeal) {
    console.log(`[preflight] stack not serving (${last}); bringing it up once`);
    heal();
    // Postgres accepts TCP before it accepts queries, so the API keeps answering 500 for a while after
    // the port opens. The budget has to cover that, or the run reports "STACK DOWN" during a restart
    // that was already working.
    last = await pollUntilHealthy(60000);
    if (!last) return;
  }
  console.error(`STACK DOWN: ${HEALTH_URL} -> ${last}`);
  console.error('Run scripts/stack-up.sh (and scripts/restart-api.ps1 if the API itself is gone), then re-run.');
  process.exit(2);
}

/**
 * Checked before reporting results, because this stack can drop in the middle of a run.
 *
 * When that happens the page under test correctly shows its error banner, every assertion after it
 * fails, and the report would name those failures as product defects. They are not: the run proves
 * nothing either way, so it exits 2 and says so instead of leaving a misleading tally.
 */
export async function requireStackAtEnd() {
  const problem = await probe();
  if (!problem) return;
  console.error(`\nSTACK WENT DOWN DURING THE RUN: ${HEALTH_URL} -> ${problem}`);
  console.error('The cases above ran against a failing API; re-run before drawing any conclusion.');
  process.exit(2);
}
