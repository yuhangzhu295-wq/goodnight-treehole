// Live verification that graduation-consent no longer 401s.
//
// Before the fix, POST /journeys/:id/graduation-consent always answered 401
// "缺少用户身份标识": saveGraduationConsent called this.graduationSummary(journeyId) without
// forwarding the resolved user, so requireJourney resolved an empty id. That broke anonymous sharing
// of a graduated journey for every caller.
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
await call('PATCH', '/settings/privacy', {
  credential: demo.credential,
  body: { allowAnonymousExperienceShare: true, allowRecoveryData: true },
});

const journey = (await call('POST', '/journeys', {
  credential: demo.credential,
  body: { title: '毕业同意验证', domain: '关系', content: '验证用。', feelings: ['平静'], needs: ['确认'] },
})).json.journey;

const action = await call('POST', `/journeys/${journey.id}/actions`, {
  credential: demo.credential,
  body: { title: '先写下来再开口', description: '验证用' },
});
const actionId = action.json?.item?.id ?? action.json?.action?.id;
console.log(`journey=${journey.id} action=${actionId} (create -> ${action.status})`);

const checkin = await call('POST', `/actions/${actionId}/checkin`, {
  credential: demo.credential,
  body: { status: 'completed', reflection: '验证用' },
});
console.log(`checkin -> ${checkin.status}`);

const graduated = await call('POST', `/journeys/${journey.id}/graduate`, { credential: demo.credential });
console.log(`graduate -> ${graduated.status} journeyStatus=${graduated.json?.journey?.status}`);

for (const decision of ['willing', 'later', 'no']) {
  const consent = await call('POST', `/journeys/${journey.id}/graduation-consent`, {
    credential: demo.credential,
    body: { decision },
  });
  const draft = consent.json?.draft;
  console.log(
    `graduation-consent decision=${decision} -> ${consent.status}` +
      (draft ? ` draft=${draft.id} draftStatus=${draft.status}` : ` draft=${JSON.stringify(draft)}`),
  );
}

const missing = await call('POST', `/journeys/${journey.id}/graduation-consent`, { body: { decision: 'willing' } });
console.log(`without a credential -> ${missing.status} (must stay 401)`);
