/* global console, fetch, process */
// ISSUE-027 user note persistence. Before this change "saving a note" wrote only an AuditLog
// row, so the note was never business data: it vanished on the next load, and the admin view
// read a `user.note` the list payload never carried. This asserts the notes are real records
// with history, readable only by an authenticated admin.
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
const USER = 'user_demo';
const NOTE_1 = `RC-NOTE-1-${stamp} 首次沟通：情绪波动较大，建议跟进`;
const NOTE_2 = `RC-NOTE-2-${stamp} 已电话回访，状态稳定`;

const login = await j('/api/admin/v1/login', { method: 'POST', headers: JSONH, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
const auth = { authorization: `Bearer ${login.body.token}` };
record('admin login', Boolean(login.body.token), `status=${login.status}`);

// ---- create two notes: they must not overwrite each other ----
const created1 = await j(`/api/admin/v1/users/${USER}/notes`, { method: 'POST', headers: { ...JSONH, ...auth }, body: JSON.stringify({ content: NOTE_1 }) });
record('admin can create a note', created1.status === 201 && Boolean(created1.body.item?.id), `status=${created1.status}`);
const created2 = await j(`/api/admin/v1/users/${USER}/notes`, { method: 'POST', headers: { ...JSONH, ...auth }, body: JSON.stringify({ content: NOTE_2 }) });
record('a second note is a separate row, not an overwrite',
  created2.status === 201 && created2.body.item?.id !== created1.body.item?.id,
  `id1=${created1.body.item?.id} id2=${created2.body.item?.id}`);

const list = await j(`/api/admin/v1/users/${USER}/notes`, { headers: auth });
const items = list.body.items ?? [];
record('both notes are readable', list.status === 200 && items.some((n) => n.content === NOTE_1) && items.some((n) => n.content === NOTE_2), `items=${items.length}`);
record('the older note is still intact (no overwrite)',
  items.find((n) => n.content === NOTE_1)?.content === NOTE_1, `found=${items.some((n) => n.content === NOTE_1)}`);
record('the newest note is the current one', list.body.current?.content === NOTE_2, `current=${String(list.body.current?.content).slice(0, 24)}`);

// ---- the user list carries the current note, which is what the drawer reads ----
const users = await j(`/api/admin/v1/users?q=${encodeURIComponent(USER)}&pageSize=50`, { headers: auth });
const listed = (users.body.items ?? []).find((u) => u.id === USER);
record('the user list payload carries the current note', listed?.note === NOTE_2, `note=${String(listed?.note).slice(0, 24)}`);

const prisma = new PrismaClient();
try {
  const rows = await prisma.adminUserNote.findMany({ where: { userId: USER }, orderBy: { createdAt: 'asc' } });
  record('the notes are real persisted rows', rows.length >= 2 && rows.every((r) => r.authorAdminId && r.content), `rows=${rows.length}`);
  record('each row records its author', new Set(rows.map((r) => r.authorAdminId)).size >= 1, rows.map((r) => r.authorAdminId).join(','));

  // ---- AuditLog is kept, but it is not the storage ----
  const audits = await prisma.auditLog.findMany({ where: { action: 'USER_NOTE_CREATE' }, orderBy: { createdAt: 'desc' }, take: 5 });
  record('the write is still audited', audits.length > 0, `USER_NOTE_CREATE rows=${audits.length}`);
  record('the audit row and the note row are different records',
    Boolean(audits[0]?.id) && rows.some((r) => r.id === created2.body.item?.id),
    `auditId=${audits[0]?.id?.slice(0, 20)} noteId=${created2.body.item?.id}`);

  // ---- delete is a soft delete, so history is preserved ----
  const del = await j(`/api/admin/v1/users/${USER}/notes/${created2.body.item.id}`, { method: 'DELETE', headers: auth });
  record('admin can retract a note', del.status === 200 && Boolean(del.body.item?.deletedAt), `status=${del.status}`);
  const afterDelete = await j(`/api/admin/v1/users/${USER}/notes`, { headers: auth });
  const afterItems = afterDelete.body.items ?? [];
  record('a retracted note leaves the operator view',
    !afterItems.some((n) => n.content === NOTE_2) && afterItems.some((n) => n.content === NOTE_1),
    `items=${afterItems.length} current=${String(afterDelete.body.current?.content).slice(0, 20)}`);
  const retracted = await prisma.adminUserNote.findUnique({ where: { id: created2.body.item.id } });
  record('the retracted note is soft-deleted, not destroyed', Boolean(retracted) && retracted?.deletedAt !== null, `deletedAt=${retracted?.deletedAt?.toISOString?.() ?? retracted?.deletedAt}`);

  // ---- the legacy route now persists real data too ----
  const legacy = await j(`/api/admin/v1/users/${USER}/note`, { method: 'POST', headers: { ...JSONH, ...auth }, body: JSON.stringify({ note: `RC-NOTE-LEGACY-${stamp} 兼容入口`, tags: ['运营关注'] }) });
  const legacyRows = await prisma.adminUserNote.count({ where: { userId: USER, content: `RC-NOTE-LEGACY-${stamp} 兼容入口` } });
  record('the legacy note route now writes a real note row', legacy.status === 201 && legacyRows === 1, `status=${legacy.status} rows=${legacyRows}`);

  // ---- re-login keeps the notes ----
  const relogin = await j('/api/admin/v1/login', { method: 'POST', headers: JSONH, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
  const relist = await j(`/api/admin/v1/users/${USER}/notes`, { headers: { authorization: `Bearer ${relogin.body.token}` } });
  record('the notes survive a fresh admin login', (relist.body.items ?? []).some((n) => n.content === NOTE_1), `items=${(relist.body.items ?? []).length}`);
} finally {
  await prisma.$disconnect();
}

// ---- permissions ----
const noAuthList = await j(`/api/admin/v1/users/${USER}/notes`, {});
record('reading notes requires admin auth', noAuthList.status === 401, `status=${noAuthList.status}`);
const noAuthCreate = await j(`/api/admin/v1/users/${USER}/notes`, { method: 'POST', headers: JSONH, body: JSON.stringify({ content: 'x' }) });
record('writing notes requires admin auth', noAuthCreate.status === 401, `status=${noAuthCreate.status}`);
const noAuthDelete = await j(`/api/admin/v1/users/${USER}/notes/${created1.body.item.id}`, { method: 'DELETE' });
record('deleting notes requires admin auth', noAuthDelete.status === 401, `status=${noAuthDelete.status}`);

// A normal user must not be able to read the operator note through the public API.
const publicProbes = [
  ['/api/v1/me/privacy', { 'x-goodnight-user-id': USER }],
  ['/api/v1/journeys', { 'x-goodnight-user-id': USER }],
  ['/api/v1/notifications', { 'x-goodnight-user-id': USER }],
  ['/api/v1/me/support-plan', { 'x-goodnight-user-id': USER }],
];
let leaked = [];
for (const [path, headers] of publicProbes) {
  const res = await j(path, { headers });
  if (JSON.stringify(res.body).includes(NOTE_1) || JSON.stringify(res.body).includes('adminUserNote')) leaked.push(path);
}
record('no public endpoint exposes the operator note', leaked.length === 0, leaked.length ? `leaked via ${leaked.join(', ')}` : `probed ${publicProbes.length} routes`);

// ---- validation ----
const empty = await j(`/api/admin/v1/users/${USER}/notes`, { method: 'POST', headers: { ...JSONH, ...auth }, body: JSON.stringify({ content: '   ' }) });
record('an empty note is rejected', empty.status === 400, `status=${empty.status}`);
const unknownUser = await j('/api/admin/v1/users/user_does_not_exist/notes', { method: 'POST', headers: { ...JSONH, ...auth }, body: JSON.stringify({ content: 'x' }) });
record('a note for an unknown user is rejected', unknownUser.status === 404, `status=${unknownUser.status}`);

const failed = out.filter((line) => line.startsWith('FAIL'));
console.log(out.join('\n'));
console.log(`\n${out.length - failed.length}/${out.length} pass`);
process.exitCode = failed.length ? 1 : 0;