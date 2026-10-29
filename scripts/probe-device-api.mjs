// Ask the app's own WebView to fetch the square feed and report the raw result. This separates
// "the page is broken" from "the device cannot reach the API", which are different bugs with
// different fixes, and the page's loading state alone cannot tell them apart.
import { execFileSync } from 'node:child_process';

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

const cred = await ev("(async()=>{var p=window.Capacitor.Plugins.Preferences;var r=await p.get({key:'goodnight-identity-credential'});return (r&&r.value)||'';})()");
console.log('credential:', cred ? `${cred.length} chars` : '(none)');
const probe = await ev(`(async()=>{
  var out = {};
  try {
    var r = await fetch('http://127.0.0.1:3000/api/v1/feedback/faqs');
    out.faqs = r.status + ' ' + (await r.text()).slice(0, 80);
  } catch (e) { out.faqs = 'ERR ' + e.message; }
  try {
    var p = await fetch('http://127.0.0.1:3000/api/v1/posts', { headers: { 'x-goodnight-user-id': ${JSON.stringify(cred || '')} } });
    var body = await p.text();
    out.posts = p.status + ' len=' + body.length + ' ' + body.slice(0, 120);
  } catch (e) { out.posts = 'ERR ' + e.message; }
  return JSON.stringify(out);
})()`);
console.log('probe:', probe);
ws.close();
