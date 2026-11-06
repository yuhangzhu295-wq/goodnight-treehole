// Produces a real PEER_REQUEST aimed at the demo identity, so the 同行请求 inbox
// (/pages/peer/requests) can be captured with a live pending request, then carried through
// accept -> 边界确认 -> conversation.
//
// The demo identity has to own a published experience for anyone to ask it anything, so this
// publishes one for it through the product's own admin review, then has a second identity send the
// request. Local development database only.
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
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

const log = (...a) => console.log(...a);
const demo = (await call('POST', '/auth/demo')).item;
log(`demo userId=${demo.userId}`);

await call('PATCH', '/settings/privacy', {
  credential: demo.credential,
  body: { allowAnonymousExperienceShare: true, allowPeerMatching: true },
});

// The demo identity publishes the experience others will ask about.
const demoJourney = await call('POST', '/journeys', {
  credential: demo.credential,
  body: {
    title: '我把自己的一天拆成了三块',
    domain: '精力',
    content: '我把一天拆成三块，只求其中一块做成。',
    feelings: ['疲惫'],
    needs: ['可持续'],
  },
});
const experience = await call('POST', '/peer-experiences', {
  credential: demo.credential,
  body: {
    journeyId: demoJourney.journey?.id,
    title: '我把自己的一天拆成了三块',
    domain: '精力',
    stage: '已完成',
    content: '我试过把一天拆成三块，只要求其中一块真正做成。这样晚上不至于觉得自己什么都没干。',
    tags: ['拆小'],
    consented: true,
  },
});
const experienceId = experience.item?.id ?? experience.id;

const login = await fetch(`${ADMIN_BASE}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    username: process.env.ADMIN_USERNAME ?? 'admin',
    password: process.env.ADMIN_PASSWORD ?? 'admin123',
  }),
});
const token = (await login.json()).token ?? (await login.json()).accessToken;
const review = await fetch(`${ADMIN_BASE}/peer-experiences/${experienceId}/review`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json', authorization: token },
  body: JSON.stringify({ status: 'published' }),
});
log(`demo experience ${experienceId} -> ${(await review.json()).item?.status}`);

// A second identity asks about it.
const asker = (await call('POST', '/auth/anonymous', { body: { deviceLabel: 'ui2-inbox-asker' } })).item;
await call('PATCH', '/settings/privacy', {
  credential: asker.credential,
  body: { allowPeerMatching: true },
});
const askerJourney = await call('POST', '/journeys', {
  credential: asker.credential,
  body: {
    title: '想把一天拆开试试',
    domain: '精力',
    content: '想问问别人怎么把一天拆开的。',
    feelings: ['混乱'],
    needs: ['方法'],
  },
});
const suggestion = await call('POST', `/journeys/${askerJourney.journey?.id}/peer-matches`, {
  credential: asker.credential,
  body: {},
});
const suggested = (suggestion.items ?? []).find((i) => i.peerExperienceId === experienceId);
if (!suggested) throw new Error(`no suggestion for ${experienceId}`);
await call('PATCH', `/peer-matches/${suggested.id}`, {
  credential: asker.credential,
  body: {
    status: 'requested',
    requestReason: '我最近也在试着把一天拆开，想问问你后来是怎么坚持的。',
    requestQuestion: '把一天拆成三块之后，你会怎么安排最先做哪一块？',
  },
});

const notifications = await call('GET', '/notifications', { credential: demo.credential });
const pending = (notifications.items ?? []).filter((n) => n.type === 'PEER_REQUEST' && n.status === 'unread');
log(`\nMATCH_ID=${suggested.id}`);
log(`demo PEER_REQUEST notifications unread: ${pending.length}`);
for (const n of pending.slice(0, 3)) log(`  ${n.id} "${n.title}" -> ${n.targetRoute}`);
