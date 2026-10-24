/* global console, fetch */
const API = 'http://127.0.0.1:3000';
const out = [];
const j = async (path, init) => {
  const res = await fetch(API + path, init);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
};
const H = (user) => ({ 'content-type': 'application/json', 'x-goodnight-user-id': user });

// admin publishes a peer experience owned by user_guest
const login = await j('/api/admin/v1/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
const auth = { 'content-type': 'application/json', authorization: `Bearer ${login.body.token}` };

await j('/api/v1/me/privacy', { method: 'PATCH', headers: H('user_guest'), body: JSON.stringify({ allowPeerMatching: true, allowAnonymousExperienceStats: true, allowAnonymousExperienceShare: true }) });

const journey = await j('/api/v1/journeys', { method: 'POST', headers: H('user_guest'), body: JSON.stringify({ title: 'SCOPE-PROBE 走出分开后的晚上', domain: '恋爱', content: `SCOPE-PROBE-${Date.now()} 我想知道别人后来是怎么走出来的。`, visibility: 'PRIVATE' }) });
const journeyId = journey.body.journey?.id;
out.push(`guest journey: ${journey.status} ${journeyId}`);

const exp = await j('/api/v1/peer-experiences', { method: 'POST', headers: H('user_guest'), body: JSON.stringify({ journeyId, title: 'SCOPE-PROBE 经历', domain: '恋爱', stage: '分开后', content: '我先把想说的话写成三句，再决定什么时候开口。', tags: ['沟通'], consented: true }) });
const expId = exp.body.item?.id;
out.push(`experience: ${exp.status} ${expId} status=${exp.body.item?.status}`);

await j(`/api/admin/v1/peer-experiences/${expId}/review`, { method: 'PATCH', headers: auth, body: JSON.stringify({ status: 'published' }) });
out.push('published via admin');

// owner can read it
const owner = await j(`/api/v1/peer-experiences/${expId}`, { headers: H('user_guest') });
out.push(`owner read: ${owner.status} (expect 200)`);

// a different, unrelated user must not
const stranger = await j(`/api/v1/peer-experiences/${expId}`, { headers: H('user_demo') });
out.push(`unrelated user read: ${stranger.status} ${JSON.stringify(stranger.body).slice(0, 120)} (expect 403/404)`);

// a user who has peer matching switched off must not
await j('/api/v1/me/privacy', { method: 'PATCH', headers: H('user_demo'), body: JSON.stringify({ allowPeerMatching: false }) });
const off = await j(`/api/v1/peer-experiences/${expId}`, { headers: H('user_demo') });
out.push(`user_demo with peer matching OFF: ${off.status} ${JSON.stringify(off.body).slice(0, 120)} (expect 403)`);
await j('/api/v1/me/privacy', { method: 'PATCH', headers: H('user_demo'), body: JSON.stringify({ allowPeerMatching: true }) });

// owner can still read their own handoffs and letters
const ho = await j('/api/v1/handoffs', { headers: H('user_demo') });
out.push(`user_demo own handoffs: ${ho.status} count=${ho.body.items?.length}`);
const lt = await j('/api/v1/letters/letter_today', { headers: H('user_demo') });
out.push(`user_demo own letter: ${lt.status}`);

console.log(out.join('\n'));
