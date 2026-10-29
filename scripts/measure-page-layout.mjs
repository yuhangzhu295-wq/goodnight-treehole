// Read the computed style of the page's own elements, so a claim about font size, colour or overlap
// is measured rather than inferred from a screenshot.
import { execFileSync } from 'node:child_process';
import { normalizeRoute } from './cli-route.mjs';

const ADB = process.env.ADB_PATH ?? [process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'].join('/');
const CDP = 9333;
const route = normalizeRoute(process.argv[2] ?? '/pages/square/index');
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
await ev(`(function(){var a=document.createElement('a');a.href=${JSON.stringify(route)};a.style.display='none';document.body.appendChild(a);a.click();a.remove();})()`, false);
await new Promise((r) => setTimeout(r, 6000));

const report = await ev(`(function(){
  function box(sel){var e=document.querySelector(sel);if(!e)return null;var r=e.getBoundingClientRect();return {top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right),w:Math.round(r.width),h:Math.round(r.height)};}
  function style(sel,props){var e=document.querySelector(sel);if(!e)return null;var cs=getComputedStyle(e);var o={};props.forEach(function(p){o[p]=cs[p]});return o;}
  var out={};
  out.h1=style('.square-hero .hero-copy h1',['fontSize','color','lineHeight']);
  out.fab=style('.write-fab',['width','height','borderRadius','backgroundColor','fontSize']);
  out.fabBox=box('.write-fab');
  out.firstRow=box('.post-row');
  out.rowBg=style('.post-row',['borderBottomColor','paddingTop']);
  out.avatar=style('.post-avatar',['width','height','fontSize']);
  out.actBtn=style('.plain-action',['minHeight','fontSize']);
  out.tabbar=box('.tabbar');
  // Overlap: does the publish button cover the first row?
  out.fabOverFirstRow = out.fabBox && out.firstRow ? (out.fabBox.top < out.firstRow.bottom) : null;
  out.docWidth=document.documentElement.scrollWidth;
  out.winWidth=window.innerWidth;
  out.horizontalOverflow = out.docWidth > out.winWidth + 1;
  return JSON.stringify(out);
})()`, false);
console.log(report);
ws.close();
