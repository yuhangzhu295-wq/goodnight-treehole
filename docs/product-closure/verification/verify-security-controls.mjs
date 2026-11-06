/* global console, fetch, process */
// Security controls that the closure round touched or depends on, re-asserted against the running
// stack. Each check states the control, not just a status code.
import { PrismaClient } from '@prisma/client';

const API = 'http://127.0.0.1:3000';
const out = [];
const record = (name, pass, detail) => out.push(`${pass ? 'PASS' : 'FAIL'} ${name} :: ${detail}`);
const j = async (path, init) => {
  const res = await fetch(API + path, init);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
};
const JSONH = { 'content-type': 'application/json' };
const stamp = Date.now();

// ---- 1. admin surface is closed by default ----
const login = await j('/api/admin/v1/login', { method: 'POST', headers: JSONH, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
const token = login.body.token;
record('admin login succeeds with valid credentials', login.status === 201 && Boolean(token), `status=${login.status}`);
const auth = { authorization: `Bearer ${token}` };

const protectedRoutes = [
  ['GET', '/api/admin/v1/safety/events'],
  ['GET', '/api/admin/v1/peer-conversations'],
  ['GET', '/api/admin/v1/audit-logs'],
  ['GET', '/api/admin/v1/users/export'],
];
let allClosed = true;
for (const [method, path] of protectedRoutes) {
  const res = await j(path, { method });
  if (res.status !== 401) { allClosed = false; record(`  ${method} ${path} rejects a missing token`, false, `status=${res.status}`); }
}
record('admin reads reject a missing token', allClosed, `${protectedRoutes.length} routes -> 401`);

const forged = await j('/api/admin/v1/safety/events', { headers: { authorization: 'Bearer forged.token.value' } });
record('admin reads reject a forged token', forged.status === 401, `status=${forged.status}`);

const handleNoAuth = await j('/api/admin/v1/safety/events/safety_does_not_exist/handle', { method: 'PATCH', headers: JSONH, body: JSON.stringify({ status: 'handled' }) });
record('the new safety write route requires admin auth', handleNoAuth.status === 401, `status=${handleNoAuth.status}`);

// ---- 2. login throttling is server-side and real ----
let limited = null;
const statuses = [];
for (let i = 0; i < 8; i += 1) {
  const res = await fetch(`${API}/api/admin/v1/auth/login`, {
    method: 'POST',
    headers: { ...JSONH, 'x-forwarded-for': '10.44.44.44' },
    body: JSON.stringify({ username: 'admin', password: `wrong-${i}` }),
  });
  statuses.push(res.status);
  if (res.status === 429) { limited = await res.json().catch(() => ({})); break; }
}
record('repeated login failures are throttled with 429', limited !== null, `statuses=${statuses.join(',')}`);
record('the 429 carries a retry hint', Number(limited?.retryAfterSeconds ?? 0) > 0, `retryAfterSeconds=${limited?.retryAfterSeconds}`);
const stillBlocked = await fetch(`${API}/api/admin/v1/auth/login`, { method: 'POST', headers: { ...JSONH, 'x-forwarded-for': '10.44.44.44' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
record('a throttled identity stays blocked even with the right password', stillBlocked.status === 429, `status=${stillBlocked.status}`);

// ---- 3. cross-user reads are refused ----
const attacker = 'user_attacker';
const letters = await j('/api/v1/letters', { headers: { 'x-goodnight-user-id': 'user_demo' } });
const someoneElsesLetter = (letters.body.items ?? []).find((item) => item.userId && item.userId !== attacker) ?? (letters.body.items ?? [])[0];
if (someoneElsesLetter) {
  const res = await j(`/api/v1/letters/${someoneElsesLetter.id}`, { headers: { 'x-goodnight-user-id': attacker } });
  record("another user's letter is not readable", res.status === 404 || res.status === 403, `status=${res.status}`);
} else {
  record("another user's letter is not readable", false, 'no letter available to test');
}
const ownHandoffs = await j('/api/v1/handoffs', { headers: { 'x-goodnight-user-id': 'user_demo' } });
record('an unknown user identity is rejected on user-scoped reads', (await j('/api/v1/handoffs', { headers: { 'x-goodnight-user-id': attacker } })).status === 404, 'status=404');
record('a real user can read their own handoffs', ownHandoffs.status === 200, `status=${ownHandoffs.status} count=${(ownHandoffs.body.items ?? []).length}`);

// ---- 4. peer matching is gated by the privacy flag ----
// The collection route reports the gate and exposes nothing; the journey-scoped route refuses
// outright. Both are real controls, so both are asserted.
await j('/api/v1/me/privacy', { method: 'PATCH', headers: { ...JSONH, 'x-goodnight-user-id': 'user_guest' }, body: JSON.stringify({ allowPeerMatching: false }) });
const gatedNetwork = await j('/api/v1/peers', { headers: { 'x-goodnight-user-id': 'user_guest' } });
const gatedPayload = gatedNetwork.body?.item ?? {};
record('peer network exposes nothing while the privacy flag is off',
  gatedNetwork.status === 200 && gatedPayload.privacyEnabled === false
    && (gatedPayload.experiences ?? []).length === 0 && (gatedPayload.matches ?? []).length === 0,
  `status=${gatedNetwork.status} privacyEnabled=${gatedPayload.privacyEnabled} experiences=${(gatedPayload.experiences ?? []).length} matches=${(gatedPayload.matches ?? []).length}`);

const gatedJourney = await j('/api/v1/journeys', { method: 'POST', headers: { ...JSONH, 'x-goodnight-user-id': 'user_guest' }, body: JSON.stringify({ title: `SEC gate ${stamp}`, domain: '关系', content: `隐私闸门验证 ${stamp}`, intensity: 4 }) });
const gatedScoped = await j(`/api/v1/journeys/${gatedJourney.body.journey?.id}/peers`, { headers: { 'x-goodnight-user-id': 'user_guest' } });
record('the journey-scoped peer route refuses while the flag is off', gatedScoped.status === 403, `status=${gatedScoped.status}`);

await j('/api/v1/me/privacy', { method: 'PATCH', headers: { ...JSONH, 'x-goodnight-user-id': 'user_guest' }, body: JSON.stringify({ allowPeerMatching: true }) });
const ungated = await j('/api/v1/peers', { headers: { 'x-goodnight-user-id': 'user_guest' } });
record('peer network opens once the flag is on', ungated.status === 200 && (ungated.body?.item?.privacyEnabled ?? false) === true, `status=${ungated.status} privacyEnabled=${ungated.body?.item?.privacyEnabled}`);

// ---- 5. contact details cannot be pushed into a peer request ----
const ownerJourney = await j('/api/v1/journeys', { method: 'POST', headers: { ...JSONH, 'x-goodnight-user-id': 'user_guest' }, body: JSON.stringify({ title: `SEC owner ${stamp}`, domain: '关系', content: `先把话写下来 ${stamp}`, intensity: 5 }) });
const ownerExp = await j('/api/v1/peer-experiences', { method: 'POST', headers: { ...JSONH, 'x-goodnight-user-id': 'user_guest' }, body: JSON.stringify({ journeyId: ownerJourney.body.journey?.id, title: `SEC 经历 ${stamp}`, domain: '关系', stage: 'graduated', content: '我后来先照顾今天的自己。', tags: ['安全验证'], consented: true }) });
const reqJourney = await j('/api/v1/journeys', { method: 'POST', headers: { ...JSONH, 'x-goodnight-user-id': 'user_demo' }, body: JSON.stringify({ title: `SEC req ${stamp}`, domain: '关系', content: `我想去联系对方 ${stamp}`, intensity: 6 }) });
const reqExp = await j('/api/v1/peer-experiences', { method: 'POST', headers: { ...JSONH, 'x-goodnight-user-id': 'user_demo' }, body: JSON.stringify({ journeyId: reqJourney.body.journey?.id, title: `SEC req 经历 ${stamp}`, domain: '关系', stage: 'graduated', content: '自己的匿名经历。', tags: ['安全验证'], consented: true }) });
for (const id of [ownerExp.body.item?.id, reqExp.body.item?.id]) await j(`/api/admin/v1/peer-experiences/${id}/review`, { method: 'PATCH', headers: { ...JSONH, ...auth }, body: JSON.stringify({ status: 'published' }) });
const suggested = await j(`/api/v1/journeys/${reqJourney.body.journey?.id}/peer-matches`, { method: 'POST', headers: { ...JSONH, 'x-goodnight-user-id': 'user_demo' }, body: JSON.stringify({}) });
// Any match the matcher suggested works for the PII rule; requiring the specific experience made
// this depend on how the matcher ranks a growing pool of experiences.
const match = (suggested.body.items ?? []).find((item) => item.peerExperienceId === ownerExp.body.item?.id)
  ?? (suggested.body.items ?? [])[0];
if (match) {
  const pii = [
    ['phone', '我的手机号是 13800138000'],
    ['email', '我的邮箱是 sec@example.com'],
    ['address', '我住在杭州市西湖区文三路附近'],
    ['wechat', '我的微信号是 secwx2026'],
    ['national id', '身份证号 11010519491231002X'],
  ];
  let blocked = true;
  const results = [];
  for (const [label, reason] of pii) {
    const res = await j(`/api/v1/peer-matches/${match.id}`, { method: 'PATCH', headers: { ...JSONH, 'x-goodnight-user-id': 'user_demo' }, body: JSON.stringify({ status: 'requested', requestReason: reason }) });
    results.push(`${label}=${res.status}`);
    if (res.status !== 400) blocked = false;
  }
  record('contact details are refused in a peer request', blocked, results.join(' '));
  const clean = await j(`/api/v1/peer-matches/${match.id}`, { method: 'PATCH', headers: { ...JSONH, 'x-goodnight-user-id': 'user_demo' }, body: JSON.stringify({ status: 'requested', requestReason: '我也在学着别急着联系。' }) });
  record('a clean peer request is accepted', clean.status === 200, `status=${clean.status}`);
} else {
  record('contact details are refused in a peer request', false, 'no suggested match available');
}

// ---- 6. the operator's report view does not leak back to the peer ----
const prisma = new PrismaClient();
try {
  const conversations = await prisma.peerConversation.findMany({ where: { reportedAt: { not: null } }, take: 1 });
  if (conversations.length) {
    const conversation = conversations[0];
    const reporter = conversation.reporterUserId;
    const other = conversation.starterUserId === reporter ? conversation.receiverUserId : conversation.starterUserId;
    const forReporter = await j('/api/v1/peer-conversations', { headers: { 'x-goodnight-user-id': reporter } });
    const payload = JSON.stringify(forReporter.body);
    record('the user-facing conversation payload does not expose report fields',
      !payload.includes('reportReason') && !payload.includes('reporterUserId'),
      `keys=${Object.keys((forReporter.body.items ?? [])[0] ?? {}).join(',')}`);
    const forOther = await j('/api/v1/peer-conversations', { headers: { 'x-goodnight-user-id': other } });
    record('the counterpart does not see the report either',
      !JSON.stringify(forOther.body).includes('reportReason'), `status=${forOther.status}`);
  } else {
    record('the user-facing conversation payload does not expose report fields', false, 'no reported conversation');
  }

  // ---- 7. privileged writes leave an audit trail ----
  const auditCount = await prisma.auditLog.count({ where: { action: 'SAFETY_EVENT_HANDLE' } });
  record('privileged safety writes are audited', auditCount > 0, `SAFETY_EVENT_HANDLE rows=${auditCount}`);
  const lastAudit = await prisma.auditLog.findFirst({ where: { action: 'SAFETY_EVENT_HANDLE' }, orderBy: { createdAt: 'desc' } });
  record('the audit row records actor, resource and before/after state',
    Boolean(lastAudit?.adminUserId) && lastAudit?.resourceType === 'SafetyEvent' && Boolean(lastAudit?.beforeJson) && Boolean(lastAudit?.afterJson),
    `admin=${lastAudit?.adminUserId} resource=${lastAudit?.resourceType}/${lastAudit?.resourceId} before=${JSON.stringify(lastAudit?.beforeJson)?.slice(0, 40)}`);
} finally {
  await prisma.$disconnect();
}

// ---- 8. no decorative security control ----
const loginPage = await fetch('http://127.0.0.1:5174/login').then((r) => r.text()).catch(() => '');
record('the admin login page ships no decorative captcha', loginPage.length > 0 && !/admin-login-captcha/.test(loginPage), `pageBytes=${loginPage.length}`);

const failed = out.filter((line) => line.startsWith('FAIL'));
console.log(out.join('\n'));
console.log(`\n${out.length - failed.length}/${out.length} pass`);
process.exitCode = failed.length ? 1 : 0;