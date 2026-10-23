// Click every control a page declares and report what each one actually did.
//
// A testid that exists but does nothing is the failure mode this catches, and the only way to see it
// is to click and look at the result. The cases are passed in as a JSON file so the same runner
// serves every page instead of one script per view.
//
// Usage: node scripts/verify-controls.mjs <route> <cases.json>
// cases.json: [{ "selector": "...", "expect": { "url": "...", "api": "...", "text": "..." }, "setup": "..." }]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { withSession, ADB } from './device-session.mjs';
import { repoFile } from './repo-root.mjs';
import { readRouteArg } from './cli-route.mjs';

// Git Bash turns a leading-slash argument into a Windows path. Unrepaired, the navigation is refused,
// the previously open page stays open, and every control is reported missing - a full round of false
// negatives that looks like a broken page.
const { route, repaired } = readRouteArg(process.argv[2]);
// A relative cases path is resolved against the repository, not the caller's working directory.
const casesFile = process.argv[3] ? (path.isAbsolute(process.argv[3]) ? process.argv[3] : repoFile(process.argv[3])) : '';
if (!route || !casesFile) {
  console.error('usage: node scripts/verify-controls.mjs <route> <cases.json>');
  process.exit(1);
}
if (repaired) console.error(`note: repaired the route argument to "${route}" (Git Bash path conversion)`);
const cases = JSON.parse(readFileSync(casesFile, 'utf8'));

// The app reaches the API over `adb reverse`; without it every page renders its error state and the
// run would report working controls against a broken page.
try {
  execFileSync(ADB, ['reverse', 'tcp:3000', 'tcp:3000'], { stdio: 'ignore' });
} catch {
  // The page itself will show it if it matters.
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await withSession(async ({ call, ev }) => {
await call('Runtime.enable');

const go = async () => {
  // A real navigation, not a synthetic anchor click. `a.click()` on a `display:none` anchor stopped
  // navigating in this WebView: every case then probed whatever page was already open and reported
  // its controls as missing, which reads as a product defect and is not one. `location.assign`
  // performs the same same-origin document load and was measured to work.
  const expected = new URL(route, 'https://localhost').pathname;
  let here = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // A case that ends on another page (accept navigates to the consent screen) leaves the previous
    // document still unloading; an assignment issued then is simply lost. Re-issuing until the path
    // is actually ours is what makes each case start from the page it names.
    try {
      await ev(`(function(){ location.assign(${JSON.stringify(route)}); })()`, false);
    } catch {
      // The document was replaced mid-call; the next iteration re-issues against the new one.
    }
    await sleep(2600);
    here = String(await ev('location.pathname', false));
    if (here === expected) break;
  }
  if (here !== expected) {
    // Never let a case run against the wrong page: every control it then fails to find would be
    // reported as a product defect.
    console.log(`[nav] could not reach ${expected} (still on ${here || 'unknown'})`);
  }
  // Wait for the page's rows: probing before the feed loads reports a missing control that is only
  // late, which is a different thing from absent.
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    const ready = await ev("(function(){return Boolean(document.querySelector('[data-testid], .goodnight-page'))})()", false);
    if (ready) return true;
    await sleep(600);
  }
  return false;
};

/**
 * A case selector ending in `*` matches the first control whose testid starts with the rest. Cases
 * that name a record id (`peer-request-accept-peer_match_1792…`) only exist for the account that
 * happened to own that record, so they were skipped on every other identity; a prefix lets the same
 * case exercise whatever record the page currently shows.
 */
function selectorExpression(selector) {
  return selector.endsWith('*')
    ? `[data-testid^="${selector.slice(0, -1)}"]`
    : `[data-testid="${selector}"]`;
}

const probe = (selector) =>
  ev(`(function(){
    var e=document.querySelector('${selectorExpression(selector)}');
    if(!e) return JSON.stringify({found:false});
    var r=e.getBoundingClientRect();
    return JSON.stringify({found:true,visible:r.width>0&&r.height>0,text:(e.innerText||'').trim().slice(0,24)});
  })()`, false);

const click = (selector) =>
  ev(`(function(){
    var e=document.querySelector('${selectorExpression(selector)}');
    if(!e) return 'not found';
    // The testid often marks a container while the handler sits on a control inside it (a row whose
    // click lives on its button). Clicking the container alone would report a working control as
    // broken, so fall through to the first clickable descendant.
    var target = e;
    if (!e.onclick && typeof e.click === 'function') {
      var inner = e.querySelector('button, a, [role=button], input');
      if (inner) target = inner;
    }
    target.scrollIntoView({block:'center'});
    target.click();
    return 'clicked ' + target.tagName + (target === e ? '' : ' (inner)');
  })()`, false);

const fill = async (selector, value) =>
  ev(`(function(){
    var e=document.querySelector('[data-testid="${selector}"]');
    if(!e) return 'not found';
    e.focus();
    e.value = ${JSON.stringify(value)};
    e.dispatchEvent(new Event('input', {bubbles:true}));
    e.dispatchEvent(new Event('change', {bubbles:true}));
    return 'filled';
  })()`, false);

/** Waits for a selector to appear, because a result panel only exists after the job finishes. */
const waitFor = async (selector, timeoutMs = 90000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const p = await probe(selector);
    if (p && JSON.parse(p).found) return true;
    await sleep(1200);
  }
  return false;
};

/** Whether any element matches a raw CSS selector, for the present/gone assertions below. */
const exists = async (css) =>
  (await ev(`(function(){return Boolean(document.querySelector(${JSON.stringify(css)}))})()`, false)) === true;

/**
 * Waits for a raw CSS selector, used as a case's `waitFor`.
 *
 * The page frame (header, tabs) renders before its data arrives, so "some testid exists" is not the
 * same as "the list has loaded". A case that probed the moment the frame appeared reported a control
 * as missing while the request was still in flight.
 */
const waitForSelector = async (css, timeoutMs = 20000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await exists(css)) return true;
    await sleep(700);
  }
  return false;
};

/** The testid of the element a case selector resolves to, so its disappearance can be checked. */
const testIdOf = (selector) =>
  ev(`(function(){
    var e=document.querySelector('${selectorExpression(selector)}');
    return e ? (e.getAttribute('data-testid') || '') : '';
  })()`, false);

const results = [];
for (const c of cases) {
  await go();
  // `waitFor` is the page's own content signal, so a case never probes a frame whose data has not
  // arrived yet.
  if (c.waitFor) await waitForSelector(c.waitFor);
  // `prefill` runs the page's own action first (type into the box, submit) so controls that only
  // exist after that action - a result panel and its buttons - are there to be probed. Re-navigating
  // for every case would otherwise clear the result and report them as missing.
  if (c.prefill) {
    if (c.prefill.fill) await fill(c.prefill.fill.selector, c.prefill.fill.value);
    if (c.prefill.click) await click(c.prefill.click);
    await waitFor(c.prefill.waitFor ?? c.selector, c.prefill.timeoutMs);
  }
  // A control that lives on another tab only exists after that tab is selected.
  if (c.tab) {
    await waitFor(c.tab, 15000);
    await click(c.tab);
    await sleep(1400);
  }
  if (c.setup) {
    await click(c.setup);
    await sleep(1100);
  }
  const before = await probe(c.selector);
  const found = before && JSON.parse(before).found;
  const clickedTestId = found ? await testIdOf(c.selector) : '';
  const urlBefore = await ev('location.pathname + location.search', false);
  let after = 'skipped';
  if (found) {
    after = await click(c.selector);
    // `settleMs` is for a control whose effect is a request (a poster render, a regeneration): the
    // default one second is enough for a navigation and not for an API round trip.
    await sleep(c.settleMs ?? 1000);
  }
  const url = await ev('location.pathname + location.search', false);
  const expect = c.expect ?? {};
  const problems = [];
  if (!found) problems.push('control not found');
  if (expect.url && !String(url).includes(expect.url)) problems.push(`url ${url}, expected ${expect.url}`);
  // A back button has no fixed destination - it goes wherever history says, which on this runner is
  // usually the previous case's page. "The URL changed" is the only honest assertion for it; asserting
  // a particular page fails as soon as two cases in a row are on the same component.
  if (expect.urlChanged && String(url) === String(urlBefore)) problems.push(`url did not change (${url})`);
  if (expect.text) {
    const has = await ev(`(function(){return (document.body.innerText||'').indexOf(${JSON.stringify(expect.text)})>=0})()`, false);
    if (!has) problems.push(`text "${expect.text}" not on page`);
  }
  // The three below describe the page *after* the action, which is the only way to tell a control
  // that ran from one that merely did not throw: an empty list looks the same either way. They take
  // raw CSS so a case can assert on a row class rather than only on a testid.
  if (expect.present && !(await exists(expect.present))) {
    problems.push(`nothing matches "${expect.present}" after the action`);
  }
  if (expect.gone && (await exists(expect.gone))) {
    problems.push(`"${expect.gone}" is still on the page`);
  }
  if (expect.controlGone) {
    // The exact element that was clicked, not the prefix: the prefix would still match the next row.
    const still = clickedTestId
      ? await exists(`[data-testid="${clickedTestId}"]`)
      : await exists(selectorExpression(c.selector));
    if (still) problems.push('the control is still there, so nothing was recorded');
  }
  const verdict = problems.length ? `FAIL (${problems.join('; ')})` : 'PASS';
  results.push({ selector: c.selector, verdict, url });
  console.log(`${verdict.startsWith('PASS') ? 'PASS ' : 'FAIL '} ${c.selector.padEnd(30)} ${after} -> ${url}`);
}
const failed = results.filter((r) => r.verdict.startsWith('FAIL'));
console.log(`\n${results.length - failed.length}/${results.length} controls behaved as expected`);
if (failed.length) console.log('failed: ' + failed.map((r) => r.selector).join(', '));
// The exit code is the verdict. Printed counts alone let a red run pass for a green one in any
// wrapper that only looks at whether the command ran.
if (failed.length) process.exitCode = 1;
});
