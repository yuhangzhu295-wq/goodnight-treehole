// Drives the real peer-matching flow to produce ONE active conversation for the demo identity,
// so the conversation page's active state (composer, send, keyboard, both bubble sides) can be
// captured on device.
//
// Everything goes through the product's own endpoints - privacy gate, experience publication, the
// admin review that publishes it, match suggestion, request, respond, both sides' consent - rather
// than flipping a status column, so the capture also exercises the flow the UI depends on.
//
// Re-running is idempotent: any older active conversation is closed through the product's own close
// endpoint, leaving exactly one, and its messages are topped up to the full script. Writes to the
// local development database only (API on 127.0.0.1:3000).
const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3000/api/v1';
const ADMIN_BASE = process.env.ADMIN_BASE ?? 'http://127.0.0.1:3000/api/admin/v1';

async function call(method, path, { credential, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (credential) headers['x-goodnight-user-id'] = credential;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) {
    const detail = json && typeof json === 'object' ? JSON.stringify(json) : String(json);
    throw new Error(`${method} ${path} -> ${res.status} ${detail}`);
  }
  return json;
}

const log = (...args) => console.log(...args);

// `as` is which participant sends it: 'self' is the demo identity the app runs as, 'peer' is the
// other side. A short message, a long one (wraps and scrolls), and enough to fill the screen.
const SCRIPT = [
  { as: 'self', content: '第一晚我也睡不着，就起来写了一会儿。' },
  { as: 'peer', content: '我懂那种感觉。我那时候也是躺着越想越清醒，后来干脆起来写下来。' },
  {
    as: 'self',
    content:
      '我后来发现，把话先写下来、第二天再看，能帮我分清哪些是真的想说的，哪些只是当时太满了。'.repeat(3),
  },
  { as: 'peer', content: '这个方法我也用过。第二天再看，很多话就没那么非说不可了。' },
  { as: 'self', content: '你那边现在最想先解决的是哪一件事？' },
  { as: 'peer', content: '大概是想先让自己晚上能睡着，别的都往后放。' },
  { as: 'self', content: '嗯，我在听。' },
  { as: 'peer', content: '慢慢说就好，不用一次讲完。' },
  { as: 'self', content: '那几天你是怎么熬过去的？' },
  { as: 'peer', content: '就是一天一天过，没做什么特别的事，但也没有更糟。' },
  { as: 'self', content: '谢谢你说这些。' },
];

const a = (await call('POST', '/auth/demo')).item;
log(`A (demo) userId=${a.userId}`);

// B = a fresh anonymous identity that publishes the experience and plays the peer side.
const b = (await call('POST', '/auth/anonymous', { body: { deviceLabel: 'ui2-round2-peer' } })).item;
log(`B (anonymous) userId=${b.userId}`);

await call('PATCH', '/settings/privacy', {
  credential: b.credential,
  body: { allowAnonymousExperienceShare: true },
});

const bJourney = await call('POST', '/journeys', {
  credential: b.credential,
  body: {
    title: '我把消息留到第二天再看',
    domain: '关系',
    content: '我习惯把难受的话先写下来，第二天再决定要不要发出去。',
    feelings: ['犹豫'],
    needs: ['被理解'],
  },
});
const experience = await call('POST', '/peer-experiences', {
  credential: b.credential,
  body: {
    journeyId: bJourney.journey?.id,
    title: '我把消息留到第二天再看',
    domain: '关系',
    stage: '已完成',
    content: '我习惯把难受的话先写下来，第二天再决定要不要发出去。这样我能分清哪些是真想说的。',
    tags: ['先写下来'],
    consented: true,
  },
});
const experienceId = experience.item?.id ?? experience.id;
log(`B: created experience ${experienceId}`);

// A new experience starts as pending_review, so it is not a match candidate yet. Approving it
// through the product's own admin review endpoint keeps this on the real path.
const loginRes = await fetch(`${ADMIN_BASE}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    username: process.env.ADMIN_USERNAME ?? 'admin',
    password: process.env.ADMIN_PASSWORD ?? 'admin123',
  }),
});
const loginJson = await loginRes.json();
if (!loginRes.ok) throw new Error(`admin login -> ${loginRes.status} ${JSON.stringify(loginJson)}`);
const adminToken = loginJson.token ?? loginJson.accessToken ?? loginJson.item?.token;
if (!adminToken) throw new Error(`admin login returned no token: ${JSON.stringify(loginJson).slice(0, 200)}`);
const reviewRes = await fetch(`${ADMIN_BASE}/peer-experiences/${experienceId}/review`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json', authorization: adminToken },
  body: JSON.stringify({ status: 'published' }),
});
const reviewJson = await reviewRes.json();
if (!reviewRes.ok) throw new Error(`review -> ${reviewRes.status} ${JSON.stringify(reviewJson)}`);
log(`admin: reviewed -> ${reviewJson.item?.status}`);

const aJourney = await call('POST', '/journeys', {
  credential: a.credential,
  body: {
    title: '想找一个走过类似一段路的人',
    domain: '关系',
    content: '想找一个走过类似一段路的人聊一会。',
    feelings: ['不安'],
    needs: ['被听见'],
  },
});
const aJourneyId = aJourney.journey?.id;

const suggestion = await call('POST', `/journeys/${aJourneyId}/peer-matches`, {
  credential: a.credential,
  body: {},
});
const suggested = (suggestion.items ?? []).find((item) => item.peerExperienceId === experienceId);
if (!suggested) throw new Error(`no match suggested for ${experienceId}: ${JSON.stringify(suggestion).slice(0, 300)}`);
const matchId = suggested.id;
log(`A: suggested match ${matchId} status=${suggested.status}`);

// A suggested match is not a request yet; peer-requests stays empty until this PATCH runs.
await call('PATCH', `/peer-matches/${matchId}`, {
  credential: a.credential,
  body: {
    status: 'requested',
    requestReason: '想找一个走过类似一段路的人聊一会',
    requestQuestion: '你后来是怎么让自己不那么着急的？',
  },
});
const requests = await call('GET', '/peer-requests', { credential: b.credential });
log(`B: peer-requests shows it: ${Boolean((requests.items ?? []).find((i) => i.id === matchId))}`);

await call('POST', `/peer-matches/${matchId}/respond`, {
  credential: b.credential,
  body: { status: 'connected' },
});
log('B: responded connected');

const first = await call('POST', `/peer-matches/${matchId}/consent`, { credential: a.credential });
const second = await call('POST', `/peer-matches/${matchId}/consent`, { credential: b.credential });
log(`A: consent -> pending=${Boolean(first?.pending)}; B: consent -> active=${Boolean(second?.conversation)}`);

for (const [index, step] of SCRIPT.entries()) {
  const credential = step.as === 'self' ? a.credential : b.credential;
  await call('POST', `/peer-conversations/${matchId}/messages`, { credential, body: { content: step.content } });
  log(`  ${step.as.padEnd(4)} message ${index + 1} (${step.content.length} chars)`);
}

// Leave exactly one active conversation, so the device capture is deterministic. Older ones are
// closed with the product's own endpoint rather than deleted.
const others = ((await call('GET', '/peer-conversations', { credential: a.credential })).items ?? []).filter(
  (item) => item.status === 'active' && item.matchId !== matchId,
);
for (const old of others) {
  await call('POST', `/peer-conversations/${old.matchId}/close`, { credential: a.credential });
  log(`closed the older active conversation ${old.matchId}`);
}

const list = (await call('GET', '/peer-conversations', { credential: a.credential })).items ?? [];
const active = list.filter((item) => item.status === 'active');
log(`\nMATCH_ID=${matchId}`);
log(`active conversations now: ${active.length}`);
for (const item of active) log(`  ${item.matchId} messages=${item.messages?.length}`);
