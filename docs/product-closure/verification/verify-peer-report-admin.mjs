/* global console, fetch, process */
// ISSUE-028: a report a user files against a peer conversation must reach the admin
// back office and be readable there (reason, time, status) - it must not be written and
// then hidden, which is what "reportedAt/reportReason are never rendered" meant.
//
// The chain under test:
//   two real users -> published experiences -> match -> request -> connect -> consent
//   -> conversation -> requester files a report
//   -> admin list carries reportReason / reportedAt / reporterUserId / status
//   -> the report survives a fresh read of the database
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
const OWNER = 'user_guest';
const REQUESTER = 'user_demo';
const REPORT_REASON = `CLOSURE-REPORT-${stamp} 对方一直索要我的真实联系方式`;
const as = (user, extra = {}) => ({ ...JSONH, 'x-goodnight-user-id': user, ...extra });

// --- privacy must allow peer matching, otherwise the flow is legitimately hidden ---
for (const user of [OWNER, REQUESTER]) {
  const res = await j('/api/v1/me/privacy', { method: 'PATCH', headers: as(user), body: JSON.stringify({ allowPeerMatching: true, allowAnonymousExperienceShare: true }) });
  record(`privacy allows peer matching for ${user}`, res.status === 200, `status=${res.status}`);
}

// --- two real experiences, published by admin ---
const login = await j('/api/admin/v1/login', { method: 'POST', headers: JSONH, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
const auth = { authorization: `Bearer ${login.body.token}` };
record('admin login', Boolean(login.body.token), `status=${login.status}`);

const ownerJourney = await j('/api/v1/journeys', { method: 'POST', headers: as(OWNER), body: JSON.stringify({ title: `CLOSURE-REPORT owner ${stamp}`, domain: '关系', content: `先把话写下来 ${stamp}`, intensity: 5 }) });
const ownerExperience = await j('/api/v1/peer-experiences', { method: 'POST', headers: as(OWNER), body: JSON.stringify({ journeyId: ownerJourney.body.journey?.id, title: `CLOSURE-REPORT 我把消息留到明天 ${stamp}`, domain: '关系', stage: 'graduated', content: '我没有马上让难过消失，只先照顾今天的自己。', tags: ['分开后想联系'], consented: true }) });
const ownerExperienceId = ownerExperience.body.item?.id;
record('owner publishes a consented experience', ownerExperience.status === 201 && Boolean(ownerExperienceId), `status=${ownerExperience.status}`);

const requesterJourney = await j('/api/v1/journeys', { method: 'POST', headers: as(REQUESTER), body: JSON.stringify({ title: `CLOSURE-REPORT requester ${stamp}`, domain: '关系', content: `我想立刻去联系对方 ${stamp}`, intensity: 7 }) });
const requesterExperience = await j('/api/v1/peer-experiences', { method: 'POST', headers: as(REQUESTER), body: JSON.stringify({ journeyId: requesterJourney.body.journey?.id, title: `CLOSURE-REPORT 今晚又想联系 ${stamp}`, domain: '关系', stage: 'graduated', content: '这是自己的匿名经历，用来触发同路匹配。', tags: ['分开后想联系'], consented: true }) });
record('requester publishes a consented experience', requesterExperience.status === 201, `status=${requesterExperience.status}`);

for (const id of [ownerExperienceId, requesterExperience.body.item?.id]) {
  const published = await j(`/api/admin/v1/peer-experiences/${id}/review`, { method: 'PATCH', headers: { ...JSONH, ...auth }, body: JSON.stringify({ status: 'published' }) });
  record(`admin publishes experience ${String(id).slice(0, 18)}`, published.status === 200, `status=${published.status}`);
}

// --- match -> request -> connect -> consent -> conversation ---
const suggested = await j(`/api/v1/journeys/${requesterJourney.body.journey?.id}/peer-matches`, { method: 'POST', headers: as(REQUESTER), body: JSON.stringify({}) });
const match = (suggested.body.items ?? []).find((item) => item.peerExperienceId === ownerExperienceId);
record('the requester is matched to the owner experience', suggested.status === 201 && Boolean(match), `status=${suggested.status} candidates=${(suggested.body.items ?? []).length}`);

const requested = await j(`/api/v1/peer-matches/${match?.id}`, { method: 'PATCH', headers: as(REQUESTER), body: JSON.stringify({ status: 'requested', requestReason: '我也在学着别急着联系。', requestQuestion: '你当时怎么熬过第一晚？' }) });
record('requester sends a real match request', requested.status === 200, `status=${requested.status}`);
const responded = await j(`/api/v1/peer-matches/${match?.id}/respond`, { method: 'POST', headers: as(OWNER), body: JSON.stringify({ status: 'connected' }) });
record('owner accepts the request', responded.status === 201, `status=${responded.status}`);
const consent = await j(`/api/v1/peer-matches/${match?.id}/consent`, { method: 'POST', headers: as(OWNER), body: JSON.stringify({}) });
const conversation = consent.body.conversation;
record('consent opens a real conversation', consent.status === 201 && Boolean(conversation?.id), `status=${consent.status} conversationId=${conversation?.id}`);

// --- the report ---
const reported = await j(`/api/v1/peer-conversations/${match?.id}/report`, { method: 'POST', headers: as(REQUESTER), body: JSON.stringify({ reason: REPORT_REASON }) });
record('user report is accepted', reported.status === 201, `status=${reported.status}`);
// The user-facing projection deliberately omits the reporter identity (the reporter knows
// they reported; exposing it to the counterpart would be a leak). The operator-facing
// fields are asserted below, against the admin list.
record('the user-facing response does not leak the reporter identity',
  reported.body.item?.reporterUserId === undefined && reported.body.item?.reportReason === undefined,
  `reporterUserId=${reported.body.item?.reporterUserId} keys=${Object.keys(reported.body.item ?? {}).join(',')}`);

// --- admin must be able to see it ---
const adminList = await j('/api/admin/v1/peer-conversations?pageSize=100', { headers: auth });
const adminRow = (adminList.body.items ?? []).find((item) => item.id === conversation?.id);
record('the reported conversation reaches the admin list', adminList.status === 200 && Boolean(adminRow), `status=${adminList.status} total=${adminList.body.total}`);
record('admin list carries the report reason', adminRow?.reportReason === REPORT_REASON, `reportReason=${JSON.stringify(String(adminRow?.reportReason ?? '').slice(0, 50))}`);
record('admin list carries the report time', Boolean(adminRow?.reportedAt), `reportedAt=${adminRow?.reportedAt}`);
record('admin list carries the reporter identity', adminRow?.reporterUserId === REQUESTER, `reporterUserId=${adminRow?.reporterUserId}`);
record('admin list carries the conversation status', Boolean(adminRow?.status), `status=${adminRow?.status}`);

// --- the reported-only filter is real ---
const onlyReported = await j('/api/admin/v1/peer-conversations?reported=true&pageSize=100', { headers: auth });
record('reported=true returns the reported conversation', (onlyReported.body.items ?? []).some((item) => item.id === conversation?.id), `total=${onlyReported.body.total}`);
record('reported=true excludes unreported conversations', (onlyReported.body.items ?? []).every((item) => Boolean(item.reportedAt)), `rows=${(onlyReported.body.items ?? []).length}`);

// --- search reaches the report reason ---
const searchHit = await j(`/api/admin/v1/peer-conversations?q=${encodeURIComponent(`CLOSURE-REPORT-${stamp}`)}`, { headers: auth });
record('admin search matches the report reason', searchHit.body.total === 1 && (searchHit.body.items ?? [])[0]?.id === conversation?.id, `total=${searchHit.body.total}`);
const searchMiss = await j('/api/admin/v1/peer-conversations?q=zzzznomatchzzzz', { headers: auth });
record('admin search really filters (no match -> 0 rows)', searchMiss.body.total === 0, `total=${searchMiss.body.total}`);

// --- persisted, not just in memory ---
const prisma = new PrismaClient();
try {
  const row = await prisma.peerConversation.findUnique({ where: { id: conversation.id } });
  record('report is persisted in PostgreSQL', row?.reportReason === REPORT_REASON && Boolean(row?.reportedAt) && row?.reporterUserId === REQUESTER,
    `reportReason=${JSON.stringify(String(row?.reportReason ?? '').slice(0, 40))} reportedAt=${row?.reportedAt?.toISOString?.() ?? row?.reportedAt}`);
} finally {
  await prisma.$disconnect();
}

const unauth = await j('/api/admin/v1/peer-conversations', {});
record('the admin conversation list requires auth', unauth.status === 401, `status=${unauth.status}`);

const failed = out.filter((line) => line.startsWith('FAIL'));
console.log(out.join('\n'));
console.log(`\n${out.length - failed.length}/${out.length} pass`);
process.exitCode = failed.length ? 1 : 0;