// Create the real data the peer pages need: a second user's published experience, then a match
// from the walkthrough user's own journey. Everything goes through the public API with real
// credentials, so the rows are the same shape the product writes.

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

// The walkthrough user's credential, plus a fresh anonymous credential for a second user.
const issue = async () => {
  const v = await ev(
    "(async()=>{var r=await fetch('http://127.0.0.1:3000/api/v1/auth/anonymous',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});var b=await r.json();return b&&b.item?b.item.credential:null;})()",
  );
  return v;
};
const primary = await ev(
  "(async () => { var p = window.Capacitor.Plugins.Preferences; var r = await p.get({ key: 'goodnight-identity-credential' }); return (r && r.value) || ''; })()",
);
const second = await issue();
if (!primary || !second) {
  console.log('CREDENTIAL FAILURE', { primary: Boolean(primary), second: Boolean(second) });
  process.exit(1);
}
console.log('two credentials ok');

const run = async (cred) => {
  const script = `(async () => {
    var C = ${JSON.stringify(cred)};
    var H = { 'content-type': 'application/json', 'x-goodnight-user-id': C };
    var post = async (p, b) => { var r = await fetch(${JSON.stringify(WEB)} + p, { method: 'POST', headers: H, body: JSON.stringify(b || {}) }); var t = await r.text(); return { status: r.status, body: (() => { try { return JSON.parse(t); } catch (e) { return t.slice(0, 300); } })() }; };
    var get = async (p) => { var r = await fetch(${JSON.stringify(WEB)} + p, { headers: H }); var t = await r.text(); return { status: r.status, body: (() => { try { return JSON.parse(t); } catch (e) { return t.slice(0, 300); } })() }; };
    var put = async (p, b) => { var r = await fetch(${JSON.stringify(WEB)} + p, { method: 'PATCH', headers: H, body: JSON.stringify(b || {}) }); var t = await r.text(); return { status: r.status, body: (() => { try { return JSON.parse(t); } catch (e) { return t.slice(0, 300); } })() }; };
    var out = {};

    // The caller's own journey is what the match hangs off; find it first.
    var mine = await get('/api/v1/journeys');
    out.journeyListStatus = mine.status;
    var journeyId = mine.body && mine.body.items && mine.body.items[0] ? mine.body.items[0].journey.id : null;
    out.journeyId = journeyId;

    // Peer matching must be enabled, or suggestPeerMatches refuses with a consent error. Publishing
    // an experience is gated on its own switch, so both go on before the write.
    var priv = await put('/api/v1/settings/privacy', {
      allowPeerMatching: true,
      allowAnonymousExperienceShare: true,
    });
    out.privacyStatus = priv.status;
    out.privacyBody = priv.status >= 400 ? priv.body : undefined;

    // A second user's published experience: the match candidate.
    var exp = await post('/api/v1/peer-experiences', {
      journeyId: journeyId,
      title: '我也在把作息调回来',
      domain: '生活',
      stage: 'acting',
      content: '我的办法是先把手机放到客厅，只留一个闹钟。前三周很难，第四周开始早上能自然醒。',
      tags: ['作息', '早起'],
      consented: true,
    });
    out.peerExperienceStatus = exp.status;
    out.peerExperienceId = exp.body && exp.body.item ? exp.body.item.id : (exp.body && exp.body.id ? exp.body.id : null);
    if (exp.status >= 400) out.peerExperienceError = exp.body;
    return JSON.stringify(out);
  })()`;
  return await ev(script);
};

const secondOut = JSON.parse(await run(second));
console.log('second user:', JSON.stringify(secondOut));
ws.close();
