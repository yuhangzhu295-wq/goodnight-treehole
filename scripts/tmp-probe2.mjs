import { execFileSync } from 'node:child_process';
const ADB = [process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'].join('/');
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
adb('shell', 'am', 'start', '-n', 'com.goodnight.treehole/.MainActivity');
const pid = adb('shell', 'pidof', 'com.goodnight.treehole');
adb('forward', '--remove-all');
adb('forward', 'tcp:9333', 'localabstract:webview_devtools_remote_' + pid);
const l = await (await fetch('http://127.0.0.1:9333/json')).json();
const t = l.find((x) => x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl);
let n = 0; const w = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); const f = w.get(m.id); if (f) { w.delete(m.id); f(m); } });
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const call = (me, p) => new Promise((r) => { const id = ++n; w.set(id, r); ws.send(JSON.stringify({ id, method: me, params: p || {} })); });
const ev = async (x, ap = true) => { const r = await call('Runtime.evaluate', { expression: x, awaitPromise: ap, returnByValue: true }); return r?.result?.result?.value; };
await call('Runtime.enable');
await new Promise((r) => setTimeout(r, 4000));
const cred = await ev("(async()=>{var p=window.Capacitor.Plugins.Preferences;var r=await p.get({key:'goodnight-identity-credential'});return (r&&r.value)||''})()");
console.log('cred:', cred ? cred.length + ' chars' : '(none)');
const out = await ev(`(async()=>{
  var H={'x-goodnight-user-id':${JSON.stringify(cred || '')}};
  var res={};
  for (var p of ['/api/v1/tonight','/api/v1/notifications']) {
    try { var r = await fetch('http://127.0.0.1:3000'+p,{headers:H}); var txt = await r.text(); res[p]=r.status+' '+txt.slice(0,90); }
    catch(e){ res[p]='ERR '+e.message; }
  }
  return JSON.stringify(res,null,1);
})()`);
console.log(out);
ws.close(); process.exit(0);
