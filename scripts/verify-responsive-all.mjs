// Measure every listed page at the three widths the acceptance bar names, plus a large-font setting.
//
// A page that is fine at one width can clip, overflow, or hide its primary action at another, and the
// only way to know is to resize the viewport and re-measure. Runs all pages in one CDP session so the
// emulator is not re-attached per page - re-attaching is what made the single-page version fail when
// another project stole the foreground.
//
// Usage: node scripts/verify-responsive-all.mjs [route ...]
import { execFileSync } from 'node:child_process';

const ADB = process.env.ADB_PATH ?? [process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'].join('/');
const CDP = 9333;
const DEFAULT_ROUTES = [
  '/pages/tonight/index',
  '/pages/square/index',
  '/pages/peers/index',
  '/pages/action/index',
  '/pages/me/index',
  '/pages/diary/index',
  '/pages/letter/list',
  '/pages/letter/today',
  '/pages/favorite/index',
  '/pages/settings/privacy',
  '/pages/settings/data-policy',
  '/pages/help/feedback',
  '/pages/help/faqs',
  '/pages/mood/create',
  '/pages/tool/index',
  '/pages/stable-self/index',
  '/pages/decision/index',
  '/pages/memory/index',
  '/pages/safety/index',
  '/pages/future-self/index',
];
const routes = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ROUTES;
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function ensureForeground() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (adb('shell', 'dumpsys', 'window').includes('com.goodnight.treehole')) return true;
    adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
    adb('shell', 'wm', 'dismiss-keyguard');
    adb('shell', 'am', 'start', '-n', 'com.goodnight.treehole/.MainActivity');
    execFileSync(process.execPath, ['-e', 'setTimeout(()=>{}, 1500)']);
  }
  return adb('shell', 'dumpsys', 'window').includes('com.goodnight.treehole');
}
if (!ensureForeground()) { console.error('ABORT: another app holds the foreground'); process.exit(2); }

adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
adb('shell', 'wm', 'dismiss-keyguard');
adb('shell', 'am', 'start', '-n', 'com.goodnight.treehole/.MainActivity');
let pid = '';
try { pid = adb('shell', 'pidof', 'com.goodnight.treehole'); } catch { pid = ''; }
if (!pid) { console.error('ABORT: the app is not running'); process.exit(2); }
adb('forward', '--remove-all');
adb('forward', `tcp:${CDP}`, `localabstract:webview_devtools_remote_${pid}`);

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

const measure = () => ev(`(function(){
  function b(sel){var e=document.querySelector(sel);if(!e)return null;var r=e.getBoundingClientRect();return {t:Math.round(r.top),b:Math.round(r.bottom),w:Math.round(r.width),h:Math.round(r.height)};}
  var fab=b('.write-fab')||b('.primary'), row=b('.post-row')||b('.diary-card')||b('.letter-row')||b('.tool-row');
  var overflowX = document.documentElement.scrollWidth - window.innerWidth;
  var clipped = Array.from(document.querySelectorAll('button, a, input, textarea, select'))
    .filter(function(e){var r=e.getBoundingClientRect();return r.width>0&&(r.left<-1||r.right>window.innerWidth+1);})
    .map(function(e){return (e.getAttribute('data-testid')||e.className||e.tagName)+'@'+Math.round(e.getBoundingClientRect().left)+'..'+Math.round(e.getBoundingClientRect().right);});
  var tab=b('.tabbar');
  var tabCovers = tab && row ? (tab.t < row.b) : false;
  return JSON.stringify({overflowX:overflowX, clipped:clipped.slice(0,4), fabVisible:fab?fab.b<=window.innerHeight+1&&fab.t>=0:null, fabCoversRow:fab&&row?(fab.t<row.b&&fab.b>row.t):null, tabCoversContent:tabCovers});
})()`, false);

const results = [];
for (const route of routes) {
  await ev(`(function(){var a=document.createElement('a');a.href=${JSON.stringify(route)};a.style.display='none';document.body.appendChild(a);a.click();a.remove();})()`, false);
  await sleep(2600);
  const pageResults = {};
  for (const width of [360, 390, 430]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(1400);
    let m = null;
    try { m = JSON.parse((await measure()) || '{}'); } catch { m = {}; }
    pageResults[width] = m;
  }
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await ev("(function(){document.documentElement.style.fontSize='20px';document.body.style.fontSize='18px';})()", false);
  await sleep(1300);
  let large = null;
  try { large = JSON.parse((await measure()) || '{}'); } catch { large = {}; }
  pageResults.large = large;
  await ev("(function(){document.documentElement.style.fontSize='';document.body.style.fontSize='';})()", false);

  const problems = [];
  for (const [key, m] of Object.entries(pageResults)) {
    if (!m || typeof m.overflowX !== 'number') { problems.push(`${key}: no reading`); continue; }
    if (m.overflowX > 1) problems.push(`${key}: horizontal overflow ${m.overflowX}px`);
    if (m.clipped && m.clipped.length) problems.push(`${key}: clipped ${m.clipped.join(', ')}`);
    if (m.fabCoversRow) problems.push(`${key}: primary action covers a row`);
    if (m.tabCoversContent) problems.push(`${key}: tab bar covers content`);
  }
  results.push({ route, problems });
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${route}${problems.length ? ' — ' + problems.join('; ') : ''}`);
}

ws.close();
const failed = results.filter((r) => r.problems.length);
console.log(`\n${results.length - failed.length}/${results.length} pages pass at all widths and font scale`);
if (failed.length) console.log('failed: ' + failed.map((r) => r.route).join(', '));
