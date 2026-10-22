// Click a control and assert its real effect, not just that the click landed.
//
// "The button was found and clicked" says nothing about whether the feature works. This drives the
// page, then reads the authoritative source - the API - and compares it against the value captured
// before the click, so a control that renders but does nothing fails here.
//
// Usage: node scripts/verify-control-effects.mjs <route> <cases.json>
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ADB = process.env.ADB_PATH ?? [process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'].join('/');
const CDP = 9333;
const route = process.argv[2];
const casesFile = process.argv[3];
if (!route || !casesFile) {
  console.error('usage: node scripts/verify-control-effects.mjs <route> <cases.json>');
  process.exit(1);
}
const cases = JSON.parse(readFileSync(casesFile, 'utf8'));
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
adb('shell', 'wm', 'dismiss-keyguard');
adb('shell', 'am', 'start', '-n', 'com.goodnight.treehole/.MainActivity');
let pid = '';
try { pid = adb('shell', 'pidof', 'com.goodnight.treehole'); } catch { pid = ''; }
if (!pid) { console.error('ABORT: the app is not running'); process.exit(2); }
adb('forward', '--remove-all');
adb('forward', `tcp:${CDP}`, `localabstract:webview_devtools_remote_${pid}`);
adb('reverse', 'tcp:3000', 'tcp:3000');

const list = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
const target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
if (!target) { console.error('ABORT: no CDP page target'); process.exit(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
let seq = 0;
const waiters = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  const f = waiters.get(m.id);
  if (f) { waiters.delete(m.id); f(m); }
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const call = (me, p) => new Promise((res) => { const id = ++seq; waiters.set(id, res); ws.send(JSON.stringify({ id, method: me, params: p || {} })); });
const ev = async (x, ap = true) => {
  const r = await call('Runtime.evaluate', { expression: x, awaitPromise: ap, returnByValue: true });
  return r?.result?.result?.value ?? null;
};
await call('Runtime.enable');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const go = async () => {
  await ev(`(function(){var a=document.createElement('a');a.href=${JSON.stringify(route)};a.style.display='none';document.body.appendChild(a);a.click();a.remove();})()`, false);
  await sleep(3000);
};
/** Waits for a control to exist before acting on it: the page may still be rendering. */
const waitFor = async (sel, timeoutMs = 12000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const has = await ev(`(function(){return Boolean(document.querySelector('[data-testid="${sel}"]'))})()`, false);
    if (has) return true;
    await sleep(800);
  }
  return false;
};

const click = (sel) =>
  ev(`(function(){
    var e=document.querySelector('[data-testid="${sel}"]');
    if(!e) return 'not found';
    var target=e;
    if(!e.onclick){var inner=e.querySelector('button, a, [role=button], input');if(inner)target=inner;}
    target.scrollIntoView({block:'center'});
    target.click();
    return 'clicked';
  })()`, false);
/**
 * Types into a field the way Vue actually notices.
 *
 * Assigning `el.value` and dispatching `input` is not enough: Vue installs its own value setter on the
 * element, so a plain assignment is overwritten before the listener runs. Going through the prototype
 * setter is the documented way to drive a v-model programmatically.
 */
const fill = (sel, value) =>
  ev(`(function(){
    var e=document.querySelector('[data-testid="${sel}"]');
    if(!e) return 'not found';
    var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(e, ${JSON.stringify(value)});
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
    return 'filled:' + e.value.slice(0, 12);
  })()`, false);

/**
 * Reads a value from the API through the page's own fetch, carrying the app's stored credential.
 *
 * The header matters: per-viewer fields (`favoritedByCurrentUser`, hide lists) are derived from the
 * caller's identity, and an unauthenticated read returns them as false/empty - which reads exactly
 * like "the click had no effect".
 */
const appCredential = async () =>
  ev("(async()=>{var p=window.Capacitor.Plugins.Preferences;var r=await p.get({key:'goodnight-identity-credential'});return (r&&r.value)||''})()");
let credential = await appCredential();

const apiRead = async (path) => {
  await go();
  credential = (await appCredential()) || credential;
  return ev(`(async()=>{
    var r = await fetch('http://127.0.0.1:3000${path}', { headers: { 'x-goodnight-user-id': ${JSON.stringify(credential || '')} } });
    var t = await r.text();
    return r.status + ' ' + t;
  })()`);
};

const results = [];
for (const c of cases) {
  await go();
  if (c.fill) await fill(c.fill.selector, c.fill.value);
  const before = c.expect.apiDelta ? await apiRead(c.expect.apiRead) : null;
  // A control inside a sheet or dialog only exists after its trigger is clicked.
  if (c.setup) {
    await waitFor(c.setup, 15000);
    await click(c.setup);
    await sleep(1200);
  }
  const ready = await waitFor(c.selector, 20000);
  if (!ready) { console.log(`FAIL (control never appeared) ${c.selector}`); results.push({ selector: c.selector, verdict: 'FAIL (never appeared)' }); continue; }
  const clicked = await click(c.selector);
  await sleep(c.settleMs ?? 2500);
  // A write often navigates (publishing leaves the composer). Wait for the URL to settle before
  // reading the effect, or the read races the redirect and sees the pre-write state.
  await sleep(c.expect.settleAfterMs ?? 3000);
  const after = c.expect.apiDelta ? await apiRead(c.expect.apiRead) : null;

  let verdict = 'PASS';
  const notes = [];
  if (clicked !== 'clicked') verdict = `FAIL (${clicked})`;
  if (c.expect.url) {
    const url = await ev('location.pathname + location.search', false);
    if (!String(url).includes(c.expect.url)) { verdict = `FAIL (url ${url})`; notes.push(`expected ${c.expect.url}`); }
  }
  if (c.expect.apiDelta && before && after) {
    // `pick` is stored as a string in the cases file (a JSON file cannot hold a function), so it is
    // compiled here and run against the parsed body.
    const picker = new Function('b', `return (${c.expect.pick})(b)`);
    const pick = (raw) => {
      try { return picker(JSON.parse(String(raw).replace(/^\d+\s/, ''))); } catch { return null; }
    };
    const b = pick(before);
    const a = pick(after);
    if (b === null || a === null) { notes.push(`could not read values (${b}/${a})`); if (verdict === 'PASS') verdict = 'INCONCLUSIVE'; }
    // `toggle: true` asserts the value flipped, which is what a reversible control (favourite, hide)
    // does; otherwise the exact delta is required.
    else if (c.expect.toggle) {
      if (a === b) { verdict = `FAIL (unchanged ${b}, expected a flip)`; notes.push(`${b} -> ${a}`); }
      else notes.push(`${b} -> ${a} (flipped)`);
    }
    else if (a - b !== c.expect.apiDelta) { verdict = `FAIL (delta ${a - b}, expected ${c.expect.apiDelta})`; notes.push(`${b} -> ${a}`); }
    else notes.push(`${b} -> ${a}`);
  }
  if (c.expect.text) {
    const has = await ev(`(function(){return (document.body.innerText||'').indexOf(${JSON.stringify(c.expect.text)})>=0})()`, false);
    if (!has) { verdict = `FAIL (text "${c.expect.text}" absent)`; }
  }
  results.push({ selector: c.selector, verdict });
  console.log(`${verdict.startsWith('PASS') ? 'PASS ' : verdict.padEnd(6)} ${c.selector.padEnd(28)} ${notes.join(' ')}`);
}
const failed = results.filter((r) => !r.verdict.startsWith('PASS'));
console.log(`\n${results.length - failed.length}/${results.length} controls had their expected effect`);
ws.close();
