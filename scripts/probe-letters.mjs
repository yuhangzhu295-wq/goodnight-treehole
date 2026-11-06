
const list = await (await fetch('http://127.0.0.1:9333/json')).json();
const page = list.find((t) => t.type === 'page');
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
const cred = await ev(
  "(async () => { var p = window.Capacitor.Plugins.Preferences; var r = await p.get({ key: 'goodnight-identity-credential' }); return r && r.value ? r.value : ''; })()",
);
if (!cred) {
  console.log('NO CREDENTIAL');
  process.exit(1);
}
const probe = async (method, path, body) => {
  const out = await ev(
    "(async () => { try { var r = await fetch('http://127.0.0.1:3000" + path + "', { method: '" + method + "', headers: { 'content-type': 'application/json', 'x-goodnight-user-id': " + JSON.stringify(cred) + " }, body: " + JSON.stringify(body === undefined ? null : body) + " }); var t = await r.text(); return r.status + ' ' + t.slice(0, 600); } catch (e) { return 'FETCH_ERR ' + e.message; } })()",
  );
  console.log(method, path, '=>', out);
  return out;
};
await probe('GET', '/api/v1/letters/today');
await probe('GET', '/api/v1/letters');
await probe('GET', '/api/v1/moods?page=1&pageSize=3');
await probe('GET', '/api/v1/journeys');
ws.close();
