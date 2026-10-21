// Check the page at the three widths the acceptance bar names, plus a large-font setting.
// A page that is fine at one width can clip, overflow, or hide its primary action at another, and
// the only way to know is to resize the viewport and re-measure rather than to look once.
import { execFileSync } from 'node:child_process';

const ADB = process.env.ADB_PATH ?? [process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'].join('/');
const CDP = 9333;
const route = process.argv[2] ?? '/pages/square/index';
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

await ev(`(function(){var a=document.createElement('a');a.href=${JSON.stringify(route)};a.style.display='none';document.body.appendChild(a);a.click();a.remove();})()`, false);
await sleep(5000);

const probe = async (label) => {
  const out = await ev(`(function(){
    function b(sel){var e=document.querySelector(sel);if(!e)return null;var r=e.getBoundingClientRect();return {t:Math.round(r.top),b:Math.round(r.bottom),l:Math.round(r.left),r:Math.round(r.right),w:Math.round(r.width),h:Math.round(r.height)};}
    var fab=b('.write-fab'), row=b('.post-row'), tab=b('.tabbar');
    // Anything wider than the viewport, or a control that hangs off an edge, is a real defect.
    var overflowX = document.documentElement.scrollWidth - window.innerWidth;
    var clipped = Array.from(document.querySelectorAll('.post-row .plain-action, .write-fab, .mood-pill, .post-more'))
      .filter(function(e){var r=e.getBoundingClientRect();return r.left < -1 || r.right > window.innerWidth + 1;})
      .map(function(e){return (e.getAttribute('data-testid')||e.className)+'@'+Math.round(e.getBoundingClientRect().left)+'..'+Math.round(e.getBoundingClientRect().right);});
    return JSON.stringify({
      viewport: window.innerWidth + 'x' + window.innerHeight,
      overflowX: overflowX,
      clipped: clipped,
      fabVisible: fab ? (fab.b <= window.innerHeight + 1 && fab.t >= 0) : null,
      fabCoversRow: fab && row ? (fab.t < row.b && fab.b > row.t) : null,
      tabbarTop: tab ? Math.round(tab.t) : null,
      rowCount: document.querySelectorAll('.post-row').length,
      fontScale: getComputedStyle(document.documentElement).fontSize,
      bodyFont: getComputedStyle(document.body).fontSize
    });
  })()`, false);
  console.log(label, out);
  return out ? JSON.parse(out) : null;
};

const results = {};
for (const width of [360, 390, 430]) {
  await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(1200);
  results[width] = await probe(`width ${width}:`);
}
// Large-font: the OS setting a reader would actually use.
await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await call('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
await ev(`(function(){document.documentElement.style.fontSize='20px';document.body.style.fontSize='18px';})()`, false);
await sleep(1200);
results['font-large'] = await probe('font large:');

const bad = [];
for (const [k, v] of Object.entries(results)) {
  if (!v) { bad.push(`${k}: no reading`); continue; }
  if (v.overflowX > 1) bad.push(`${k}: horizontal overflow ${v.overflowX}px`);
  if (v.clipped && v.clipped.length) bad.push(`${k}: clipped controls ${v.clipped.join(', ')}`);
  if (v.fabCoversRow) bad.push(`${k}: publish button covers a row`);
}
console.log(bad.length ? `FAIL: ${bad.join(' | ')}` : 'PASS: no overflow, no clipped controls, no covered rows at any width');
ws.close();
