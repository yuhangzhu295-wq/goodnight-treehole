
const list = await (await fetch('http://127.0.0.1:9333/json')).json();
const targets = list.filter((t) => t.type === 'page');
console.log('targets:', JSON.stringify(targets.map((t) => ({ url: t.url }))));
const page = targets[0];
if (!page) {
  console.log('NO PAGE TARGET');
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
let n = 0;
const w = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  const f = w.get(m.id);
  if (f) {
    w.delete(m.id);
    f(m);
  }
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const call = (method, params) =>
  new Promise((r) => {
    const id = ++n;
    w.set(id, r);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
const ev = async (expression, awaitPromise = true) => {
  const r = await call('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  return r?.result?.result?.value;
};
await call('Runtime.enable');
console.log('href      :', await ev('location.href', false));
console.log('Capacitor :', await ev("typeof window.Capacitor !== 'undefined'", false));
console.log('PrefsPlugin:', await ev("window.Capacitor && window.Capacitor.Plugins ? Object.keys(window.Capacitor.Plugins).join(',') : 'none'", false));
const cred = await ev(
  "(async () => { var p = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences; if (!p) return 'NO_PLUGIN'; var r = await p.get({ key: 'goodnight-identity-credential' }); return r && r.value ? r.value : ''; })()",
);
console.log('credential:', JSON.stringify(cred && cred.length ? cred.slice(0, 12) + '…(' + cred.length + ')' : cred));
const who = cred
  ? await ev(
      "(async () => { var r = await fetch('http://127.0.0.1:3000/api/v1/auth/session', { headers: { 'x-goodnight-user-id': " + JSON.stringify(cred) + " } }); return r.status + ' ' + (await r.text()).slice(0, 200); })()",
    )
  : 'skipped';
console.log('session   :', who);
ws.close();
