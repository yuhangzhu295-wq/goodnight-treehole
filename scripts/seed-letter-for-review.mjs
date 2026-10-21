// Give the walkthrough account a real letter so the inbox can be reviewed against actual rows rather
// than its empty state. A private mood is what produces a letter, exactly as in the product.
import { execFileSync } from 'node:child_process';

const ADB = [process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'].join('/');
const CDP = 9333;
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
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
const ev = async (x, ap = true) => {
  const r = await call('Runtime.evaluate', { expression: x, awaitPromise: ap, returnByValue: true });
  return r?.result?.result?.value ?? r?.result?.exceptionDetails?.text ?? null;
};
await call('Runtime.enable');
const cred = await ev("(async()=>{var p=window.Capacitor.Plugins.Preferences;var r=await p.get({key:'goodnight-identity-credential'});return (r&&r.value)||''})()");
if (!cred) { console.log('NO CREDENTIAL'); process.exit(1); }
const out = await ev(`(async()=>{
  var H={'content-type':'application/json','x-goodnight-user-id':${JSON.stringify(cred)}};
  var post=async(p,b)=>{var r=await fetch('http://127.0.0.1:3000'+p,{method:'POST',headers:H,body:JSON.stringify(b||{})});return {s:r.status,b:await r.json().catch(()=>null)};};
  var get=async(p)=>{var r=await fetch('http://127.0.0.1:3000'+p,{headers:H});return {s:r.status,b:await r.json().catch(()=>null)};};
  var res={};
  var m = await post('/api/v1/moods', { content: '今天把收件箱的插画清掉了，列表终于像收件箱。', emotion: '平静', visibility: 'PRIVATE', replyStyle: 'warm' });
  res.mood = m.s;
  res.letterId = m.b && m.b.letter ? m.b.letter.id : null;
  var l = await get('/api/v1/letters');
  res.letters = l.s;
  res.count = (l.b && l.b.items || []).length;
  res.rows = (l.b && l.b.items || []).map(x=>({id:x.id,status:x.status,favorite:x.favorite,like:x.likeCount,style:x.style}));
  return JSON.stringify(res);
})()`);
console.log(out);
ws.close();
