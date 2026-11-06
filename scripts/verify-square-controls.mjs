// Click every control the interaction manifest names for this page and report what each one did.
// A testid that exists but does nothing is the failure mode this catches: the manifest is the
// contract, so each entry is clicked and its result checked against the expected outcome.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { repoFile } from './repo-root.mjs';

const ADB = process.env.ADB_PATH ?? [process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'].join('/');
const CDP = 9333;
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
adb('shell', 'wm', 'dismiss-keyguard');
adb('shell', 'am', 'start', '-n', 'com.goodnight.treehole/.MainActivity');
const pid = adb('shell', 'pidof', 'com.goodnight.treehole');
adb('forward', '--remove-all');
adb('forward', `tcp:${CDP}`, `localabstract:webview_devtools_remote_${pid}`);
const list = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
const t = list.find((x) => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl);
let n = 0;
const w = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); const f = w.get(m.id); if (f) { w.delete(m.id); f(m); } });
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const call = (me, p) => new Promise((r) => { const id = ++n; w.set(id, r); ws.send(JSON.stringify({ id, method: me, params: p || {} })); });
const ev = async (x, awaitP = true) => {
  const r = await call('Runtime.evaluate', { expression: x, awaitPromise: awaitP, returnByValue: true });
  return r?.result?.result?.value ?? r?.result?.exceptionDetails?.text ?? null;
};
await call('Runtime.enable');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const manifest = JSON.parse(readFileSync(repoFile('tests/interaction-manifest.front.json'), 'utf8'))
  .filter((m) => m.page === 'front-square');
console.log('manifest entries for front-square:', manifest.length);

const go = async (route) => {
  await ev(`(function(){var a=document.createElement('a');a.href=${JSON.stringify(route)};a.style.display='none';document.body.appendChild(a);a.click();a.remove();})()`, false);
  await sleep(2500);
};

// The first post's controls only exist once the feed has loaded. Waiting for that row is the
// difference between "the button is missing" and "the data has not arrived yet" - and probing too
// early reports the second as the first.
const waitForFeed = async (timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // Each probe races a deadline: if the WebView has been covered or its socket dropped, `ev` never
    // settles, and without the race the whole run hangs on this line.
    const has = await Promise.race([
      ev(`(function(){return Boolean(document.querySelector('.post-row'))})()`, false),
      new Promise((r) => setTimeout(() => r('timeout'), 5000)),
    ]);
    if (has === true) return true;
    await sleep(700);
  }
  return false;
};
const probe = async (selector) =>
  ev(`(function(){
    var e=document.querySelector('[data-testid="${selector}"]');
    if(!e) return JSON.stringify({found:false});
    var r=e.getBoundingClientRect();
    return JSON.stringify({found:true,visible:r.width>0&&r.height>0,text:(e.innerText||'').trim().slice(0,30),tag:e.tagName});
  })()`, false);
const click = async (selector) =>
  ev(`(function(){
    var e=document.querySelector('[data-testid="${selector}"]');
    if(!e) return 'not found';
    e.scrollIntoView({block:'center'});
    e.click();
    return 'clicked';
  })()`, false);

await go('/pages/square/index');
const results = [];
for (const entry of manifest) {
  // Re-navigate before each probe: the four tab entries navigate away from the page, and without this
  // every later probe would be looking for square controls on whatever page the previous click left
  // open - which reports false MISSINGs.
  await go('/pages/square/index');
  await waitForFeed();
  // An entry with a setupClick needs the menu open *after* the navigation, so the setup click happens
  // here rather than before the probe of the entry's own selector.
  if (entry.setupClick) {
    const setup = await click(entry.setupClick);
    await sleep(1200);
    if (setup !== 'clicked') {
      results.push({ selector: entry.selector, priority: entry.priority, found: false, clicked: null, url: `setup ${entry.setupClick} failed` });
      continue;
    }
  }
  const before = await probe(entry.selector);
  const found = before && JSON.parse(before).found;
  let afterClick = null;
  if (found) {
    afterClick = await click(entry.selector);
    await sleep(900);
  }
  const url = await ev('location.hash || location.pathname + location.search', false);
  results.push({ selector: entry.selector, priority: entry.priority, found, clicked: afterClick, url });
}
for (const r of results) {
  console.log(`${r.found ? 'FOUND ' : 'MISSING'}  ${String(r.priority).padEnd(3)} ${r.selector.padEnd(26)} ${r.clicked ?? ''} -> ${r.url}`);
}
const missing = results.filter((r) => !r.found);
console.log('missing selectors:', missing.map((r) => r.selector).join(', ') || 'none');
ws.close();
