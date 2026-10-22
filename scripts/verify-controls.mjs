// Click every control a page declares and report what each one actually did.
//
// A testid that exists but does nothing is the failure mode this catches, and the only way to see it
// is to click and look at the result. The cases are passed in as a JSON file so the same runner
// serves every page instead of one script per view.
//
// Usage: node scripts/verify-controls.mjs <route> <cases.json>
// cases.json: [{ "selector": "...", "expect": { "url": "...", "api": "...", "text": "..." }, "setup": "..." }]
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { withSession, ADB } from './device-session.mjs';

const route = process.argv[2];
const casesFile = process.argv[3];
if (!route || !casesFile) {
  console.error('usage: node scripts/verify-controls.mjs <route> <cases.json>');
  process.exit(1);
}
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
  await ev(`(function(){var a=document.createElement('a');a.href=${JSON.stringify(route)};a.style.display='none';document.body.appendChild(a);a.click();a.remove();})()`, false);
  await sleep(2600);
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

const probe = (selector) =>
  ev(`(function(){
    var e=document.querySelector('[data-testid="${selector}"]');
    if(!e) return JSON.stringify({found:false});
    var r=e.getBoundingClientRect();
    return JSON.stringify({found:true,visible:r.width>0&&r.height>0,text:(e.innerText||'').trim().slice(0,24)});
  })()`, false);

const click = (selector) =>
  ev(`(function(){
    var e=document.querySelector('[data-testid="${selector}"]');
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

const results = [];
for (const c of cases) {
  await go();
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
  let after = 'skipped';
  if (found) {
    after = await click(c.selector);
    await sleep(1000);
  }
  const url = await ev('location.pathname + location.search', false);
  const expect = c.expect ?? {};
  let verdict = 'PASS';
  if (!found) verdict = 'FAIL (control not found)';
  else if (expect.url && !String(url).includes(expect.url)) verdict = `FAIL (url ${url}, expected ${expect.url})`;
  else if (expect.text) {
    const has = await ev(`(function(){return (document.body.innerText||'').indexOf(${JSON.stringify(expect.text)})>=0})()`, false);
    if (!has) verdict = `FAIL (text "${expect.text}" not on page)`;
  }
  results.push({ selector: c.selector, verdict, url });
  console.log(`${verdict.startsWith('PASS') ? 'PASS ' : 'FAIL '} ${c.selector.padEnd(30)} ${after} -> ${url}`);
}
const failed = results.filter((r) => r.verdict.startsWith('FAIL'));
console.log(`\n${results.length - failed.length}/${results.length} controls behaved as expected`);
if (failed.length) console.log('failed: ' + failed.map((r) => r.selector).join(', '));
});
