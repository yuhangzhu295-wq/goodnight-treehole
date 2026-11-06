/**
 * Measures the user-visible consequence of a mood being attributed to the demo account.
 *
 * Creates a mood as a freshly issued anonymous user, then asks each identity to list diaries. If the
 * creator cannot see their own record while the demo account can, the write is not merely
 * mis-attributed on paper - the user loses the thing they just saved.
 */
import { PrismaClient } from '@prisma/client';

const base = process.env.API_BASE ?? 'http://127.0.0.1:3000';

async function call(method, path, body, credential) {
  const headers = { 'content-type': 'application/json' };
  if (credential) headers['x-goodnight-user-id'] = credential;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: { raw: text } };
  }
}

async function issue(label) {
  const res = await call('POST', '/api/v1/auth/anonymous', { deviceLabel: label });
  return { userId: res.json?.item?.userId, credential: res.json?.item?.credential };
}

const a = await issue('probe-a');
const b = await issue('probe-b');
const demoRes = await call('POST', '/api/v1/auth/demo', {});
const demo = { userId: demoRes.json?.item?.userId, credential: demoRes.json?.item?.credential };
console.log('A =', a.userId, ' B =', b.userId, ' demo =', demo.userId, '(demo status', demoRes.status + ')');

const marker = `owner-probe-${Date.now()}`;
const created = await call('POST', '/api/v1/moods', { content: marker, emotion: '焦虑', visibility: 'PRIVATE' }, a.credential);
console.log('A creates a mood ->', created.status);
console.log('  stored under userId:', created.json?.mood?.userId);

async function diaryHas(credential, label) {
  const res = await call('GET', '/api/v1/diaries', undefined, credential);
  const items = res.json?.items ?? res.json?.diary ?? [];
  const found = Array.isArray(items) && items.some((item) => item.content === marker);
  console.log(`  ${label} GET /diaries -> ${res.status}, sees the record: ${found}`);
  return found;
}

console.log('who can see the record A just created:');
const aSees = await diaryHas(a.credential, 'A (creator)');
const bSees = await diaryHas(b.credential, 'B (stranger)');
const demoSees = demo.credential ? await diaryHas(demo.credential, 'demo     ') : false;

console.log();
console.log(aSees ? 'A sees it: OK' : 'A sees it: NO - the creator lost the record');
console.log(bSees ? 'B sees it: LEAK - a stranger can read it' : 'B sees it: no');
console.log(demoSees ? 'demo sees it: yes (confirms the demo attribution)' : 'demo sees it: no');

const prisma = new PrismaClient();
const rows = await prisma.mood.findMany({ where: { content: marker }, select: { id: true, userId: true } });
await prisma.diary.deleteMany({ where: { content: marker } });
await prisma.mood.deleteMany({ where: { content: marker } });
console.log('cleaned up', rows.length, 'mood row(s)');
await prisma.$disconnect();
