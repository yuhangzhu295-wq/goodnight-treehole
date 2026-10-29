/**
 * Measures which user a mood created through the public API is attributed to.
 *
 * The question is not answerable by reading the controller alone, because the store method may
 * substitute an identity of its own. This issues a real anonymous session, creates a mood with that
 * credential, and then reads the row back from PostgreSQL.
 */
import { PrismaClient } from '@prisma/client';

const base = process.env.API_BASE ?? 'http://127.0.0.1:3000';

async function post(path, body, credential) {
  const headers = { 'content-type': 'application/json' };
  if (credential) headers['x-goodnight-user-id'] = credential;
  const res = await fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

const session = await post('/api/v1/auth/anonymous', { deviceLabel: 'mood-owner-probe' });
const credential = session.json?.item?.credential;
const sessionUserId = session.json?.item?.userId;
if (!credential) {
  console.log('could not obtain an anonymous session:', JSON.stringify(session));
  process.exit(1);
}
console.log('anonymous session issued for', sessionUserId);

const marker = `mood-owner-probe-${Date.now()}`;
const created = await post(
  '/api/v1/moods',
  { content: marker, emotion: '焦虑', visibility: 'PRIVATE' },
  credential,
);
console.log('create status', created.status);
console.log('create body:', JSON.stringify(created.json).slice(0, 400));

const prisma = new PrismaClient();
// Look the row up by the marker rather than by the id in the response: the response shape is not the
// thing under test, and keying off it would make a wrong shape look like a missing row.
const rows = await prisma.mood.findMany({
  where: { content: marker },
  select: { id: true, userId: true, content: true },
});
console.log('rows in postgres:', JSON.stringify(rows));
console.log('expected userId:', sessionUserId);
console.log(
  rows.length === 1 && rows[0].userId === sessionUserId
    ? 'VERDICT: correct - the mood belongs to the session that created it'
    : 'VERDICT: WRONG OWNER - attributed to ' + rows.map((r) => r.userId).join(', '),
);

if (rows.length) {
  await prisma.mood.deleteMany({ where: { content: marker } });
  console.log('probe rows removed:', rows.length);
}
await prisma.$disconnect();
