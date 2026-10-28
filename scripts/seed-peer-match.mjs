// Complete the peer chain for the walkthrough user: enable their switches, get a match suggestion
// against the second user's published experience, then move it to `requested` - the state the
// detail / wait / consent pages are designed to show.
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
const primary = await ev(
  "(async () => { var p = window.Capacitor.Plugins.Preferences; var r = await p.get({ key: 'goodnight-identity-credential' }); return (r && r.value) || ''; })()",
);
if (!primary) {
  console.log('NO PRIMARY CREDENTIAL');
  process.exit(1);
}
const script = `(async () => {
  var H = { 'content-type': 'application/json', 'x-goodnight-user-id': ${JSON.stringify(primary)} };
  var post = async (p, b) => { var r = await fetch(${JSON.stringify(WEB)} + p, { method: 'POST', headers: H, body: JSON.stringify(b || {}) }); var t = await r.text(); return { status: r.status, body: (() => { try { return JSON.parse(t); } catch (e) { return t.slice(0, 300); } })() }; };
  var get = async (p) => { var r = await fetch(${JSON.stringify(WEB)} + p, { headers: H }); var t = await r.text(); return { status: r.status, body: (() => { try { return JSON.parse(t); } catch (e) { return t.slice(0, 300); } })() }; };
  var patch = async (p, b) => { var r = await fetch(${JSON.stringify(WEB)} + p, { method: 'PATCH', headers: H, body: JSON.stringify(b || {}) }); var t = await r.text(); return { status: r.status, body: (() => { try { return JSON.parse(t); } catch (e) { return t.slice(0, 300); } })() }; };
  var out = {};

  var mine = await get('/api/v1/journeys');
  var journeyId = mine.body && mine.body.items && mine.body.items[0] ? mine.body.items[0].journey.id : null;
  out.journeyId = journeyId;

  var priv = await patch('/api/v1/settings/privacy', { allowPeerMatching: true, allowAnonymousExperienceShare: true });
  out.privacyStatus = priv.status;
  if (priv.status >= 400) out.privacyError = priv.body;

  // A match suggestion only exists once suggested, so ask for one.
  var suggest = await post('/api/v1/journeys/' + journeyId + '/peer-matches', {});
  out.suggestStatus = suggest.status;
  if (suggest.status >= 400) { out.suggestError = suggest.body; return JSON.stringify(out); }
  var matches = suggest.body && suggest.body.items ? suggest.body.items : (suggest.body && suggest.body.matches ? suggest.body.matches : []);
  out.suggestCount = matches.length;
  var first = matches[0];
  if (!first) return JSON.stringify(out);
  out.matchId = first.id;
  out.matchStatus = first.status;

  // "requested" is what the wait / consent pages render, and it is the state a real user reaches by
  // asking the peer a question.
  var requested = await patch('/api/v1/peer-matches/' + first.id, {
    status: 'requested',
    requestReason: '看到你也想把作息调回来，想问问你是怎么熬过前三周的。',
    requestQuestion: '闹钟响了但起不来的那个瞬间，你是怎么处理的？',
  });
  out.requestedStatus = requested.status;
  if (requested.status >= 400) out.requestedError = requested.body;
  else out.requestedResultStatus = requested.body && requested.body.item ? requested.body.item.status : null;

  var requests = await get('/api/v1/peer-requests?scope=sent');
  out.sentRequests = requests.status === 200 && requests.body.items ? requests.body.items.length : null;
  var received = await get('/api/v1/peer-requests');
  out.receivedRequests = received.status === 200 && received.body.items ? received.body.items.length : null;
  return JSON.stringify(out);
})()`;
console.log(await ev(script));
ws.close();
