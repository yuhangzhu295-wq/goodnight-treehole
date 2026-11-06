// Seed real records for the detail pages that the capture script skipped for lack of data. Everything
// goes through the public API with the app's own credential, exactly as a real user would.

const CDP = 9333;
const WEB = 'http://127.0.0.1:3000';

const list = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
const page = list.find((t) => t.type === 'page');
if (!page) {
  console.log('NO PAGE TARGET');
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const waiters = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  const f = waiters.get(m.id);
  if (f) {
    waiters.delete(m.id);
    f(m);
  }
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const call = (method, params) =>
  new Promise((res) => {
    const id = ++seq;
    waiters.set(id, res);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
const ev = async (expression, awaitPromise = true) => {
  const r = await call('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  return r?.result?.result?.value;
};
await call('Runtime.enable');

const credential = await ev(
  "(async () => { var p = window.Capacitor.Plugins.Preferences; var r = await p.get({ key: 'goodnight-identity-credential' }); return (r && r.value) || ''; })()",
);
if (!credential) {
  console.log('NO CREDENTIAL');
  process.exit(1);
}
console.log('credential ok, length', credential.length);

// Drive every write inside the page so the request carries the app's own headers and origin.
const script = `(async () => {
  var H = { 'content-type': 'application/json', 'x-goodnight-user-id': ${JSON.stringify(credential)} };
  var post = async (p, b) => { var r = await fetch(${JSON.stringify(WEB)} + p, { method: 'POST', headers: H, body: JSON.stringify(b || {}) }); var t = await r.text(); return { status: r.status, body: (() => { try { return JSON.parse(t); } catch (e) { return t.slice(0, 200); } })() }; };
  var get = async (p) => { var r = await fetch(${JSON.stringify(WEB)} + p, { headers: H }); var t = await r.text(); return { status: r.status, body: (() => { try { return JSON.parse(t); } catch (e) { return t.slice(0, 200); } })() }; };
  var out = {};

  // 1. A journey. The detail page reads its timeline, so the write must produce a real row.
  var j = await post('/api/v1/journeys', { title: '把作息调回来', content: '最近总在凌晨才睡，想先固定起床时间', domain: '生活' });
  out.journey = { status: j.status, id: j.body && j.body.journey ? j.body.journey.id : (j.body && j.body.item ? j.body.item.id : null), raw: j.status >= 400 ? j.body : undefined };

  // 2. A private mood writes its companion diary row, which the diary detail page needs.
  var m = await post('/api/v1/moods', { content: '今天把作息往前调了半小时，虽然还是很困，但比昨天好。', emotion: '平静', visibility: 'PRIVATE' });
  out.mood = { status: m.status, moodId: m.body && m.body.mood ? m.body.mood.id : null, diaryId: m.body && m.body.diary ? m.body.diary.id : null };
  out.moodRaw = m.status >= 400 ? m.body : undefined;

  // 3. A letter, so the letter detail page has a record with content.
  var lt = await post('/api/v1/letters/generate', { style: 'warm' });
  out.letter = { status: lt.status, id: lt.body && lt.body.item ? lt.body.item.id : null };

  return JSON.stringify(out);
})()`;
const result = await ev(script);
console.log(result);
ws.close();
