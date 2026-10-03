/* global console, fetch, process */
// ISSUE-020 report history. Before this change a report overwrote the conversation's single set
// of report columns, so a second report destroyed the first one's reason and reporter. This
// drives the real two-user peer flow and asserts the history instead.
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
const as = (user) => ({ ...JSONH, 'x-goodnight-user-id': user });
const stamp = Date.now();
const OWNER = 'user_guest';
const A = 'user_demo';
const REASON_A = `RC-REPORT-A-${stamp} 对方索要我的真实联系方式`;
const REASON_B = `RC-REPORT-B-${stamp} 对方反复发无关广告`;

// ---- setup: two users, published experiences, match, connected conversation ----
const login = await j('/api/admin/v1/login', { method: 'POST', headers: JSONH, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
const auth = { authorization: `Bearer ${login.body.token}` };
record('admin login', Boolean(login.body.token), `status=${login.status}`);

for (const user of [OWNER, A]) {
  await j('/api/v1/me/privacy', { method: 'PATCH', headers: as(user), body: JSON.stringify({ allowPeerMatching: true, allowAnonymousExperienceShare: true }) });
}
const ownerJourney = await j('/api/v1/journeys', { method: 'POST', headers: as(OWNER), body: JSON.stringify({ title: `RC-RPT owner ${stamp}`, domain: '关系', content: `先把话写下来 ${stamp}`, intensity: 5 }) });
const ownerExp = await j('/api/v1/peer-experiences', { method: 'POST', headers: as(OWNER), body: JSON.stringify({ journeyId: ownerJourney.body.journey?.id, title: `RC-RPT 经历 ${stamp}`, domain: '关系', stage: 'graduated', content: '我后来先照顾今天的自己。', tags: ['报告历史验证'], consented: true }) });
const aJourney = await j('/api/v1/journeys', { method: 'POST', headers: as(A), body: JSON.stringify({ title: `RC-RPT a ${stamp}`, domain: '关系', content: `我想去联系对方 ${stamp}`, intensity: 6 }) });
const aExp = await j('/api/v1/peer-experiences', { method: 'POST', headers: as(A), body: JSON.stringify({ journeyId: aJourney.body.journey?.id, title: `RC-RPT a 经历 ${stamp}`, domain: '关系', stage: 'graduated', content: '自己的匿名经历。', tags: ['报告历史验证'], consented: true }) });
for (const id of [ownerExp.body.item?.id, aExp.body.item?.id]) {
  await j(`/api/admin/v1/peer-experiences/${id}/review`, { method: 'PATCH', headers: { ...JSONH, ...auth }, body: JSON.stringify({ status: 'published' }) });
}
const suggested = await j(`/api/v1/journeys/${aJourney.body.journey?.id}/peer-matches`, { method: 'POST', headers: as(A), body: JSON.stringify({}) });
const match = (suggested.body.items ?? []).find((item) => item.peerExperienceId === ownerExp.body.item?.id);
await j(`/api/v1/peer-matches/${match?.id}`, { method: 'PATCH', headers: as(A), body: JSON.stringify({ status: 'requested', requestReason: '我也在学着别急着联系。' }) });
await j(`/api/v1/peer-matches/${match?.id}/respond`, { method: 'POST', headers: as(OWNER), body: JSON.stringify({ status: 'connected' }) });
const consent = await j(`/api/v1/peer-matches/${match?.id}/consent`, { method: 'POST', headers: as(OWNER), body: JSON.stringify({}) });
const conversationId = consent.body.conversation?.id;
record('a real conversation exists between two users', Boolean(conversationId), `conversationId=${conversationId}`);

// ---- user A reports ----
const reportA = await j(`/api/v1/peer-conversations/${match.id}/report`, { method: 'POST', headers: as(A), body: JSON.stringify({ reason: REASON_A }) });
record('user A can file a report', reportA.status === 201, `status=${reportA.status}`);
const userProjection = JSON.stringify(reportA.body);
record('the user-facing response leaks neither reporter nor reason',
  !userProjection.includes('reporterUserId') && !userProjection.includes('reportReason') && !userProjection.includes(REASON_A),
  `keys=${Object.keys(reportA.body.item ?? {}).join(',')}`);

// ---- user B reports the same conversation ----
const reportB = await j(`/api/v1/peer-conversations/${match.id}/report`, { method: 'POST', headers: as(OWNER), body: JSON.stringify({ reason: REASON_B }) });
record('the other participant can report the same conversation', reportB.status === 201, `status=${reportB.status}`);

const prisma = new PrismaClient();
try {
  const rows = await prisma.peerReport.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });
  record('two independent report rows exist (no overwrite)', rows.length === 2, `rows=${rows.length}`);
  record('each row keeps its own reporter', new Set(rows.map((r) => r.reporterUserId)).size === 2, rows.map((r) => r.reporterUserId).join(','));
  record('each row keeps its own reason',
    rows.some((r) => r.reason === REASON_A) && rows.some((r) => r.reason === REASON_B),
    rows.map((r) => String(r.reason).slice(0, 22)).join(' | '));
  record('both rows start open', rows.every((r) => r.status === 'open'), rows.map((r) => r.status).join(','));
  const experience = await prisma.peerExperience.findUnique({ where: { id: ownerExp.body.item?.id } });
  record('the experience counter is derived from the history', experience?.reportCount === rows.length,
    `reportCount=${experience?.reportCount} historyRows=${rows.length}`);

  // ---- admin can read them separately ----
  const adminList = await j(`/api/admin/v1/peer-reports?q=${encodeURIComponent(`RC-REPORT-`)}&pageSize=100`, { headers: auth });
  const mine = (adminList.body.items ?? []).filter((item) => item.conversationId === conversationId);
  record('admin sees both reports as separate rows', adminList.status === 200 && mine.length === 2, `status=${adminList.status} rows=${mine.length}`);
  record('admin rows carry reporter, reason, time and status',
    mine.every((r) => r.reporterUserId && r.reason && r.createdAt && r.status) && mine.some((r) => r.experienceTitle),
    mine.map((r) => `${r.reporterUserId}:${r.status}`).join(' '));

  // ---- closing one report must not touch the other ----
  const targetA = mine.find((r) => r.reporterUserId === A);
  const handled = await j(`/api/admin/v1/peer-reports/${targetA.id}/handle`, { method: 'PATCH', headers: { ...JSONH, ...auth }, body: JSON.stringify({ status: 'handled', note: `RC-NOTE-${stamp} 已处理` }) });
  record('admin can close one report', handled.status === 200 && handled.body.item?.status === 'handled', `status=${handled.status}`);
  const afterHandle = await prisma.peerReport.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });
  const rowA = afterHandle.find((r) => r.reporterUserId === A);
  const rowB = afterHandle.find((r) => r.reporterUserId === OWNER);
  record('the closed report is handled and the other is untouched',
    afterHandle.length === 2 && rowA?.status === 'handled' && Boolean(rowA?.handledAt) && rowB?.status === 'open' && rowB?.handledAt === null,
    `A=${rowA?.status} B=${rowB?.status} rows=${afterHandle.length}`);
  record('closing a report writes an audit row', await (async () => {
    const logs = await j('/api/admin/v1/audit-logs?pageSize=100', { headers: auth });
    return (logs.body.items ?? []).some((l) => l.resourceId === targetA.id && l.action === 'PEER_REPORT_HANDLE');
  })(), 'PEER_REPORT_HANDLE present');

  // ---- idempotency: a closed report can be re-filed, but an open one is never duplicated ----
  // A's report is handled at this point and B's is still open, so this is the exact state where
  // the two rules diverge.
  const refileA = await j(`/api/v1/peer-conversations/${match.id}/report`, { method: 'POST', headers: as(A), body: JSON.stringify({ reason: `RC-REPORT-A3-${stamp} 再次举报` }) });
  const afterRefile = await prisma.peerReport.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });
  record('a new report after the previous one was closed creates a new row',
    refileA.status === 201 && afterRefile.length === 3 && afterRefile.filter((r) => r.reporterUserId === A).length === 2,
    `rows=${afterRefile.length} A_rows=${afterRefile.filter((r) => r.reporterUserId === A).length}`);
  const dupA = await j(`/api/v1/peer-conversations/${match.id}/report`, { method: 'POST', headers: as(A), body: JSON.stringify({ reason: `RC-REPORT-A4-${stamp} 补充说明` }) });
  const afterDup = await prisma.peerReport.findMany({ where: { conversationId } });
  record('reporting again while a report is still open updates it instead of duplicating',
    dupA.status === 201 && afterDup.length === 3,
    `status=${dupA.status} rows=${afterDup.length}`);
  record('the derived counter follows the history',
    (await prisma.peerExperience.findUnique({ where: { id: ownerExp.body.item?.id } }))?.reportCount === afterRefile.length,
    `rows=${afterRefile.length}`);

  // ---- the conversation list still points at the most recent report ----
  const conv = await prisma.peerConversation.findUnique({ where: { id: conversationId } });
  record('the conversation keeps a pointer to the latest report', conv?.reporterUserId === A && Boolean(conv?.reportedAt),
    `latestReporter=${conv?.reporterUserId} reason=${String(conv?.reportReason).slice(0, 20)}`);

  // ---- auth ----
  const noAuth = await j('/api/admin/v1/peer-reports', {});
  record('the report list requires admin auth', noAuth.status === 401, `status=${noAuth.status}`);
  const badHandle = await j(`/api/admin/v1/peer-reports/${targetA.id}/handle`, { method: 'PATCH', headers: JSONH, body: JSON.stringify({ status: 'handled' }) });
  record('handling a report requires admin auth', badHandle.status === 401, `status=${badHandle.status}`);
  const badStatus = await j(`/api/admin/v1/peer-reports/${targetA.id}/handle`, { method: 'PATCH', headers: { ...JSONH, ...auth }, body: JSON.stringify({ status: 'nonsense' }) });
  record('an invalid status is rejected', badStatus.status === 400, `status=${badStatus.status}`);
  const missing = await j('/api/admin/v1/peer-reports/nope/handle', { method: 'PATCH', headers: { ...JSONH, ...auth }, body: JSON.stringify({ status: 'handled' }) });
  record('an unknown report is rejected', missing.status === 404, `status=${missing.status}`);

  // ---- the counterpart still cannot see the report through the user API ----
  const ownerView = await j('/api/v1/peer-conversations', { headers: as(OWNER) });
  record('the report is not exposed through the user conversation API',
    !JSON.stringify(ownerView.body).includes('reportReason') && !JSON.stringify(ownerView.body).includes(REASON_A),
    `status=${ownerView.status}`);
} finally {
  await prisma.$disconnect();
}

const failed = out.filter((line) => line.startsWith('FAIL'));
console.log(out.join('\n'));
console.log(`\n${out.length - failed.length}/${out.length} pass`);
process.exitCode = failed.length ? 1 : 0;