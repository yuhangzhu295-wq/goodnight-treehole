/* global console, fetch, process */
// ISSUE-025: a user-triggered risk must become a real SafetyEvent that admin can see,
// handle, and that leaves an audit trail - with no fake button anywhere in the loop.
//
// The chain under test:
//   user journey with high-risk text -> SafetyEvent (trigger text persisted)
//   -> admin list shows the trigger text and the open state
//   -> admin handles it (real write) -> status/handledAt/handledBy/note persisted
//   -> AuditLog row recorded -> survives a re-read of the database
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
// `detectRisk` is keyword-based (HIGH_RISK_PATTERN), so the fixture must contain a
// pattern the product actually treats as high risk for the safety path to fire.
const RISK_TEXT = `CLOSURE-SAFETY-${stamp} 我又有了自杀的念头，撑不住了`;

// --- trigger: a real user writes high-risk content through the real journey route ---
const created = await j('/api/v1/journeys', {
  method: 'POST',
  headers: { ...JSONH, 'x-goodnight-user-id': 'user_demo' },
  body: JSON.stringify({ title: `CLOSURE-SAFETY ${stamp}`, domain: '情绪', content: RISK_TEXT, visibility: 'PRIVATE' }),
});
const journeyId = created.body.journey?.id ?? created.body.item?.journey?.id;
record('user journey with high-risk text is accepted', created.status === 201 && Boolean(journeyId), `status=${created.status} journeyId=${journeyId}`);

// --- admin sees it ---
const login = await j('/api/admin/v1/login', { method: 'POST', headers: JSONH, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
const token = login.body.token;
const auth = { authorization: `Bearer ${token}` };
record('admin login', Boolean(token), `status=${login.status}`);

const listQ = `?q=${encodeURIComponent(`CLOSURE-SAFETY-${stamp}`)}`;
const listed = await j(`/api/admin/v1/safety/events${listQ}`, { headers: auth });
const event = (listed.body.items ?? []).find((item) => item.journeyId === journeyId);
record('the risk produced a SafetyEvent visible in admin', listed.status === 200 && Boolean(event), `status=${listed.status} total=${listed.body.total}`);
record('the triggering text is persisted on the event', Boolean(event?.triggerExcerpt) && event.triggerExcerpt.includes(`CLOSURE-SAFETY-${stamp}`), `triggerExcerpt=${JSON.stringify(String(event?.triggerExcerpt ?? '').slice(0, 60))}`);
record('a new event starts open', event?.status === 'open', `status=${event?.status}`);

// --- the search filter is real, not decorative ---
const miss = await j('/api/admin/v1/safety/events?q=zzzznomatchzzzz', { headers: auth });
record('safety search really filters (no match -> 0 rows)', miss.status === 200 && miss.body.total === 0 && miss.body.items.length === 0, `total=${miss.body.total}`);
const hit = await j('/api/admin/v1/safety/events?q=user_demo', { headers: auth });
record('safety search matches the owning user', hit.status === 200 && hit.body.total > 0, `total=${hit.body.total}`);

// --- pagination is real ---
const page1 = await j('/api/admin/v1/safety/events?page=1&pageSize=2', { headers: auth });
const page2 = await j('/api/admin/v1/safety/events?page=2&pageSize=2', { headers: auth });
const ids1 = (page1.body.items ?? []).map((i) => i.id);
const ids2 = (page2.body.items ?? []).map((i) => i.id);
record('pagination returns distinct pages with a stable total',
  page1.body.total > 2 && page1.body.pageSize === 2 && page1.body.totalPages === Math.ceil(page1.body.total / 2) && !ids1.some((id) => ids2.includes(id)),
  `total=${page1.body.total} totalPages=${page1.body.totalPages} page1=${ids1.length} page2=${ids2.length}`);

// --- handle it: real write + audit ---
const NOTE = `CLOSURE-NOTE-${stamp} 已联系用户并给出求助渠道`;
const handled = await j(`/api/admin/v1/safety/events/${event.id}/handle`, {
  method: 'PATCH', headers: { ...JSONH, ...auth }, body: JSON.stringify({ status: 'handled', note: NOTE }),
});
const handledItem = handled.body.item;
record('admin can mark the event handled', handled.status === 200 && handledItem?.status === 'handled', `status=${handled.status}`);
record('handle records time, actor and note', Boolean(handledItem?.handledAt) && Boolean(handledItem?.handledBy) && handledItem?.note === NOTE,
  `handledAt=${handledItem?.handledAt} handledBy=${handledItem?.handledBy}`);
record('handling writes an AuditLog row', await (async () => {
  const logs = await j('/api/admin/v1/audit-logs?pageSize=100', { headers: auth });
  const row = (logs.body.items ?? []).find((l) => l.resourceId === event.id && l.action === 'SAFETY_EVENT_HANDLE');
  return Boolean(row) && row.beforeJson?.status === 'open' && row.afterJson?.status === 'handled';
})(), 'SAFETY_EVENT_HANDLE with before=open after=handled');

// --- status filter is real ---
const openOnly = await j('/api/admin/v1/safety/events?status=open', { headers: auth });
const handledOnly = await j('/api/admin/v1/safety/events?status=handled', { headers: auth });
record('handled events leave the open queue',
  (handledOnly.body.items ?? []).some((i) => i.id === event.id) && !(openOnly.body.items ?? []).some((i) => i.id === event.id),
  `open=${openOnly.body.total} handled=${handledOnly.body.total}`);

// --- survives a fresh read of the database (not just in-memory) ---
const prisma = new PrismaClient();
try {
  const row = await prisma.safetyEvent.findUnique({ where: { id: event.id } });
  record('handled state is persisted in PostgreSQL', row?.status === 'handled' && Boolean(row?.handledAt) && row?.note === NOTE,
    `status=${row?.status} handledAt=${row?.handledAt?.toISOString?.() ?? row?.handledAt}`);
  const audit = await prisma.auditLog.findFirst({ where: { resourceType: 'SafetyEvent', resourceId: event.id, action: 'SAFETY_EVENT_HANDLE' } });
  record('audit trail is persisted in PostgreSQL', Boolean(audit), `auditId=${audit?.id}`);
  const trigger = row?.payload;
  record('trigger text is persisted in the DB payload', Boolean(trigger && String(trigger.triggerExcerpt ?? '').includes(`CLOSURE-SAFETY-${stamp}`)),
    `payload=${JSON.stringify(trigger).slice(0, 60)}`);
} finally {
  await prisma.$disconnect();
}

// --- reopen works too, so the queue state is not one-way ---
const reopened = await j(`/api/admin/v1/safety/events/${event.id}/handle`, {
  method: 'PATCH', headers: { ...JSONH, ...auth }, body: JSON.stringify({ status: 'open' }),
});
record('an event can be reopened', reopened.status === 200 && reopened.body.item?.status === 'open' && !reopened.body.item?.handledAt, `status=${reopened.body.item?.status}`);
// restore handled so the queue reflects a worked event
await j(`/api/admin/v1/safety/events/${event.id}/handle`, { method: 'PATCH', headers: { ...JSONH, ...auth }, body: JSON.stringify({ status: 'handled', note: NOTE }) });

// --- invalid input must not be silently accepted ---
const bad = await j(`/api/admin/v1/safety/events/${event.id}/handle`, { method: 'PATCH', headers: { ...JSONH, ...auth }, body: JSON.stringify({ status: 'nonsense' }) });
record('an invalid status is rejected', bad.status === 400, `status=${bad.status}`);
const missing = await j(`/api/admin/v1/safety/events/does_not_exist/handle`, { method: 'PATCH', headers: { ...JSONH, ...auth }, body: JSON.stringify({ status: 'handled' }) });
record('an unknown event is rejected', missing.status === 404, `status=${missing.status}`);
const unauth = await j(`/api/admin/v1/safety/events/${event.id}/handle`, { method: 'PATCH', headers: JSONH, body: JSON.stringify({ status: 'handled' }) });
record('the handle route requires admin auth', unauth.status === 401, `status=${unauth.status}`);

const failed = out.filter((line) => line.startsWith('FAIL'));
console.log(out.join('\n'));
console.log(`\n${out.length - failed.length}/${out.length} pass`);
process.exitCode = failed.length ? 1 : 0;