// Fail the run with a distinct exit code when the local stack is not serving.
//
// Without this, a database or WSL2-forwarding outage reaches the page as a 500, the page renders its
// error banner, and the page-level assertions then report "the field did not take focus" or "the
// record is missing" - product defects that do not exist. The environment is not the product, and a
// run that cannot tell them apart is not evidence either way.
//
// Exit code 2 means "environment", 1 (from the caller) means "product".
const HEALTH_URL = process.env.API_HEALTH_URL ?? 'http://127.0.0.1:3000/api/v1/feedback/faqs';

export async function requireStack({ attempts = 3, waitMs = 2000 } = {}) {
  let last = '';
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(4000) });
      if (res.ok) return;
      last = `HTTP ${res.status}`;
    } catch (error) {
      last = error.message;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, waitMs));
  }
  console.error(`STACK DOWN: ${HEALTH_URL} -> ${last}`);
  console.error('Run scripts/stack-up.sh (and scripts/restart-api.ps1 if the API itself is gone), then re-run.');
  process.exit(2);
}
