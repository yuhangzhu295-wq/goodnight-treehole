// Reproduces the graduation-consent 401 to see which check rejects it.
const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3000/api/v1';

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
  return { status: res.status, json };
}

const demo = (await call('POST', '/auth/demo')).json.item;
console.log(`demo credential acquired: ${demo.credential.slice(0, 18)}...`);

await call('PATCH', '/settings/privacy', {
  credential: demo.credential,
  body: { allowAnonymousExperienceShare: true, allowPeerMatching: true, allowAnonymousExperienceStats: true },
});

const journey = (await call('POST', '/journeys', {
  credential: demo.credential,
  body: { title: '毕业同意复现', domain: '关系', content: '复现用。', feelings: ['平静'], needs: ['确认'] },
})).json.journey;
console.log(`journey=${journey.id} status=${journey.status}`);

const graduated = await call('POST', `/journeys/${journey.id}/graduate`, { credential: demo.credential });
console.log(`graduate -> ${graduated.status} journeyStatus=${graduated.json?.journey?.status}`);

const consent = await call('POST', `/journeys/${journey.id}/graduation-consent`, {
  credential: demo.credential,
  body: { decision: 'willing' },
});
console.log(`graduation-consent -> ${consent.status}`);
console.log(JSON.stringify(consent.json).slice(0, 400));
