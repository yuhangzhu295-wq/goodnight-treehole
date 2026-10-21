// Capture one named route and report what it rendered, so a page's acceptance can be checked
// without eyeballing a PNG.
//
// Unlike capture-all-ui.mjs this is for the review loop: it takes the route as an argument, waits
// for the page to settle, and prints the rendered text length, the error elements it found, and
// where the screenshot was written.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ADB = process.env.ADB_PATH ?? [process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'].join('/');
const CDP_PORT = 9333;
const OUT = 'artifacts/ui-v2/r2';
const route = process.argv[2];
const slug = process.argv[3] ?? route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
const waitMs = Number(process.argv[4] ?? 3000);

if (!route) {
  console.error('usage: node scripts/capture-page.mjs <route> [slug] [waitMs]');
  process.exit(1);
}
const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const ctl = async (fn) => { try { return await fn(); } catch (e) { return { __error: String(e && e.message) }; } };

function ensureForeground() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const focus = adb('shell', 'dumpsys', 'window');
    if (focus.includes('com.goodnight.treehole')) return true;
    adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
    adb('shell', 'wm', 'dismiss-keyguard');
    adb('shell', 'am', 'start', '-n', 'com.goodnight.treehole/.MainActivity');
    execFileSync(process.execPath, ['-e', 'setTimeout(()=>{}, 1500)']);
  }
  return adb('shell', 'dumpsys', 'window').includes('com.goodnight.treehole');
}

// The emulator's foreground is shared with other projects on this machine, and another app takes it
// within seconds. A WebView that has been covered stops answering CDP, which is how this script used
// to hang until the shell timeout. Every CDP call therefore races a deadline, and a miss is reported
// rather than waited on.
const withDeadline = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);

fs.mkdirSync(OUT, { recursive: true });
if (!ensureForeground()) {
  console.error('ABORT: another app holds the foreground');
  process.exit(2);
}
const pid = adb('shell', 'pidof', 'com.goodnight.treehole');
adb('forward', '--remove-all');
adb('forward', `tcp:${CDP_PORT}`, `localabstract:webview_devtools_remote_${pid}`);
adb('reverse', 'tcp:3000', 'tcp:3000');

const list = await ctl(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json());
if (!Array.isArray(list)) throw new Error('no CDP target: ' + JSON.stringify(list));
const target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
const ws = new WebSocket(target.webSocketDebuggerUrl);
let seq = 0;
const waiters = new Map();
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  const f = waiters.get(msg.id);
  if (f) { waiters.delete(msg.id); f(msg); }
});
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
const call = (method, params) => withDeadline(new Promise((res) => { const id = ++seq; waiters.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} })); }), 15_000, `CDP ${method}`);
const ev = async (expression, awaitPromise = true) => {
  const r = await ctl(async () => call('Runtime.evaluate', { expression, awaitPromise, returnByValue: true }));
  if (r?.__error || r?.result?.exceptionDetails) return null;
  return r?.result?.result?.value;
};
await call('Runtime.enable');
await call('Page.enable');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Navigate with a real anchor click: pushState alone leaves the router's internal state behind.
await ev(`(function(){var a=document.createElement('a');a.href=${JSON.stringify(route)};a.style.display='none';document.body.appendChild(a);a.click();a.remove();})()`, false);
// Re-assert the foreground before reading the page: the wait below is exactly when another app
// steals it, and a covered WebView returns the previous page's text.
if (!ensureForeground()) {
  console.error('ABORT: another app took the foreground while the page was loading');
  process.exit(2);
}
await sleep(waitMs);
if (!ensureForeground()) {
  console.error('ABORT: another app took the foreground before the capture');
  process.exit(2);
}

const state = await ev(`(function(){
  var page=document.querySelector('.goodnight-page')||document.querySelector('main')||document.body;
  var text=(page?page.innerText:'')||'';
  var errs=Array.from(document.querySelectorAll('[role=alert],.error-note,.error')).filter(function(e){return (e.innerText||'').trim();}).map(function(e){return (e.innerText||'').trim().slice(0,60);});
  var imgs=Array.from(page?page.querySelectorAll('img,div'):[]).filter(function(e){var bg=getComputedStyle(e).backgroundImage;return bg&&bg!=='none'&&bg.indexOf('.png')>=0;}).length;
  var bg=getComputedStyle(page||document.body).backgroundColor;
  return JSON.stringify({len:text.replace(/\\s+/g,' ').trim().length,text:text.replace(/\\s+/g,' ').trim().slice(0,400),errs:errs.slice(0,4),decorativeLayers:imgs,background:bg});
})()`, false);

const shot = await ctl(async () => call('Page.captureScreenshot', { format: 'png' }));
let file = null;
if (shot?.result?.data) {
  file = path.join(OUT, `${slug}.png`).replaceAll('\\', '/');
  fs.writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
}
ws.close();
let parsed = {};
try {
  parsed = JSON.parse(state || '{}');
} catch {
  // An unreadable payload leaves `parsed` empty; the report then shows the page with no text, which
  // is the honest result of a capture whose page state could not be read.
  parsed = {};
}
console.log(JSON.stringify({ route, slug, file, ...parsed }, null, 1));
