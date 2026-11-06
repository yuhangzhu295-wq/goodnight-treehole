// Give the walkthrough account a real diary so the list page can be reworked and reviewed against
// actual rows instead of an empty state. Writes through the public API exactly as the app does.
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
if (!cred) {
  console.log('NO CREDENTIAL');
  process.exit(1);
}
const out = await ev(`(async()=>{
  var H={'content-type':'application/json','x-goodnight-user-id':${JSON.stringify(cred)}};
  var res=[];
  // A private mood writes its companion diary row, which is what the diary list reads.
  var m = await fetch('http://127.0.0.1:3000/api/v1/moods',{method:'POST',headers:H,body:JSON.stringify({
    content:'把截图走查又跑了一遍，这一轮把广场和日记的插画都清掉了，屏幕终于肯让正文占地方。',
    emotion:'平静', visibility:'PRIVATE'
  })});
  var b = await m.json();
  res.push({status:m.status, moodId:b.mood&&b.mood.id, diaryId:b.diary&&b.diary.id});
  var d = await fetch('http://127.0.0.1:3000/api/v1/me/diaries',{headers:H});
  var db = await d.json();
  res.push({diaries:d.status, count:(db.items||[]).length});
  return JSON.stringify(res);
})()`);
console.log(out);
ws.close();
