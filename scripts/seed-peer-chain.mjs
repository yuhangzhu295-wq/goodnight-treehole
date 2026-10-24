// Complete the peer chain for the walkthrough user. Unlike the CDP-driven scripts this one talks to
// the API directly, so it does not depend on the emulator's WebView staying attached.
// Credentials are the product's own: two real anonymous sessions.
const WEB = 'http://127.0.0.1:3000';

const post = async (cred, path, body) => {
  const r = await fetch(WEB + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goodnight-user-id': cred },
    body: JSON.stringify(body || {}),
  });
  const t = await r.text();
  return { status: r.status, body: json(t) };
};
const patch = async (cred, path, body) => {
  const r = await fetch(WEB + path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-goodnight-user-id': cred },
    body: JSON.stringify(body || {}),
  });
  const t = await r.text();
  return { status: r.status, body: json(t) };
};
const get = async (cred, path) => {
  const r = await fetch(WEB + path, { headers: { 'x-goodnight-user-id': cred } });
  const t = await r.text();
  return { status: r.status, body: json(t) };
};
function json(t) {
  try {
    return JSON.parse(t);
  } catch {
    return t.slice(0, 300);
  }
}

// Two real anonymous sessions: one plays the walkthrough user, one owns the published experience.
const anon = async () => {
  const r = await fetch(WEB + '/api/v1/auth/anonymous', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const b = json(await r.text());
  return b?.item?.credential ?? null;
};
const primary = await anon();
const second = await anon();
if (!primary || !second) throw new Error('could not mint anonymous credentials');
console.log('two credentials minted');

// --- second user: publish an experience -------------------------------------------
await patch(second, '/api/v1/settings/privacy', { allowAnonymousExperienceShare: true });
const j2 = await post(second, '/api/v1/journeys', {
  title: '把作息调回来',
  content: '最近总在凌晨才睡，想先固定起床时间',
  domain: '生活',
});
const journey2 = j2.body?.journey?.id ?? j2.body?.item?.id;
const exp = await post(second, '/api/v1/peer-experiences', {
  journeyId: journey2,
  title: '我也在把作息调回来',
  domain: '生活',
  stage: 'acting',
  content: '我的办法是先把手机放到客厅，只留一个闹钟。前三周很难，第四周开始早上能自然醒。',
  tags: ['作息', '早起'],
  consented: true,
});
console.log('experience:', exp.status, exp.body?.item?.id ?? exp.body?.id ?? exp.body);
if (exp.status >= 400) process.exit(1);
const experienceId = exp.body?.item?.id ?? exp.body?.id;

// --- primary user: suggest, then request -------------------------------------------
const j1 = await post(primary, '/api/v1/journeys', {
  title: '我想把作息调回来',
  content: '最近总在凌晨才睡，想先固定起床时间',
  domain: '生活',
});
const journey1 = j1.body?.journey?.id ?? j1.body?.item?.id;
console.log('primary journey:', journey1);
await patch(primary, '/api/v1/settings/privacy', { allowPeerMatching: true, allowAnonymousExperienceShare: true });

const suggest = await post(primary, `/api/v1/journeys/${journey1}/peer-matches`, {});
const matches = suggest.body?.items ?? suggest.body?.matches ?? [];
console.log('suggest:', suggest.status, 'matches:', matches.length, matches.map((m) => `${m.id}:${m.status}`));
const target = matches.find((m) => m.peerExperienceId === experienceId) ?? matches[0];
if (!target) {
  console.log('NO MATCH AGAINST THE SECOND USER');
  process.exit(1);
}
const requested = await patch(primary, `/api/v1/peer-matches/${target.id}`, {
  status: 'requested',
  requestReason: '看到你也想把作息调回来，想问问你是怎么熬过前三周的。',
  requestQuestion: '闹钟响了但起不来的那个瞬间，你是怎么处理的？',
});
console.log('requested:', requested.status, requested.body?.item?.status ?? requested.body);
if (requested.status >= 400) process.exit(1);
const matchId = requested.body?.item?.id ?? target.id;

// --- second user accepts, which produces the conversation -------------------------
const inbox = await get(second, '/api/v1/peer-requests');
const incoming = (inbox.body?.items ?? []).find((m) => m.id === matchId) ?? (inbox.body?.items ?? [])[0];
console.log('second user inbox:', inbox.status, (inbox.body?.items ?? []).map((m) => `${m.id}:${m.status}`));
if (incoming) {
  const responded = await post(second, `/api/v1/peer-matches/${matchId}/respond`, { status: 'connected' });
  console.log('accept:', responded.status, responded.body?.item?.status ?? responded.body);
  const consented = await post(second, `/api/v1/peer-matches/${matchId}/consent`, {});
  console.log('consent:', consented.status, JSON.stringify(consented.body).slice(0, 200));
  const convos = await get(second, '/api/v1/peer-conversations');
  console.log('conversations:', convos.status, (convos.body?.items ?? []).length, JSON.stringify(convos.body).slice(0, 300));
}
const primaryMatches = await get(primary, '/api/v1/peers');
console.log('primary peers view:', primaryMatches.status, JSON.stringify(primaryMatches.body).slice(0, 300));
process.exit(0);
