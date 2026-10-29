// Give the walkthrough account a real, active peer conversation with a message, so the conversation
// page can be reviewed against actual rows. Writes through the public API with two real sessions:
// the app's own account as the requester, and user_demo (owner of a published experience) as the peer.
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
const appCred = await ev("(async()=>{var p=window.Capacitor.Plugins.Preferences;var r=await p.get({key:'goodnight-identity-credential'});return (r&&r.value)||''})()");
if (!appCred) { console.log('NO APP CREDENTIAL'); process.exit(1); }

// A second session for the peer side. Minted from the host, because the page-context fetch was
// returning nothing and a second identity is all the peer needs.
const minted = await (await fetch('http://127.0.0.1:3000/api/v1/auth/anonymous', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
})).json();
const peerCred = minted && minted.item ? minted.item.credential : '';
console.log('two credentials:', Boolean(appCred), Boolean(peerCred));

const out = await ev(`(async()=>{
  var A=${JSON.stringify(appCred)}, B=${JSON.stringify(peerCred)};
  var H=function(c){return {'content-type':'application/json','x-goodnight-user-id':c}};
  var post=function(c,p,b){return fetch('http://127.0.0.1:3000'+p,{method:'POST',headers:H(c),body:JSON.stringify(b||{})}).then(async function(r){return {s:r.status,b:await r.json().catch(function(){return null})}});};
  var get=function(c,p){return fetch('http://127.0.0.1:3000'+p,{headers:H(c)}).then(async function(r){return {s:r.status,b:await r.json().catch(function(){return null})}});};
  var res={};
  // The requester needs their own journey and peer matching on.
  var j = await post(A,'/api/v1/journeys',{title:'想找人聊聊',content:'想把作息调回来，需要有人陪我走过前三周',domain:'生活'});
  res.journey = j.s;
  res.journeyBody = j.b;
  var jid = j.b && j.b.journey ? j.b.journey.id : (j.b && j.b.item ? j.b.item.id : null);
  await post(A,'/api/v1/settings/privacy',{allowPeerMatching:true,allowAnonymousExperienceShare:true});
  var sug = await post(A,'/api/v1/journeys/'+jid+'/peer-matches',{});
  var matches = (sug.b && (sug.b.items||sug.b.matches)) || [];
  res.matches = matches.length;
  if (!matches.length) return JSON.stringify(res);
  var m = matches[0];
  // request -> the peer accepts -> both consent, which activates the conversation.
  await post(A,'/api/v1/peer-matches/'+m.id,{status:'requested',requestReason:'看到你也走过这一段，想问问后来是怎么熬过去的。',requestQuestion:'最难的那个早晨你怎么处理的？'});
  var acc = await post(B,'/api/v1/peer-matches/'+m.id+'/respond',{status:'connected'});
  res.accept = acc.s;
  var c1 = await post(A,'/api/v1/peer-matches/'+m.id+'/consent',{});
  var c2 = await post(B,'/api/v1/peer-matches/'+m.id+'/consent',{});
  res.consentA = c1.s; res.consentB = c2.s;
  res.activated = Boolean(c2.b && c2.b.conversation);
  res.matchId = m.id;
  var msg = await post(A,'/api/v1/peer-conversations/'+m.id+'/messages',{content:'谢谢你愿意接住我这句话。'});
  res.message = msg.s;
  var convos = await get(A,'/api/v1/peer-conversations');
  res.conversations = (convos.b && convos.b.items || []).length;
  return JSON.stringify(res);
})()`);
console.log(out);
ws.close();
