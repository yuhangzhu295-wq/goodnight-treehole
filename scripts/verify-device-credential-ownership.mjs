/**
 * End-to-end check of the write-ownership fix using the credential the emulator's app actually
 * holds, read from its private storage.
 *
 * The UI tap path is unusable on this emulator: another project's app (com.yuhangzhu295.cozyfocus)
 * repeatedly claims the foreground, sometimes within a second of a check, so a tap can land in the
 * other app. That is an environment limitation, not a product one, and it is reported as such -
 * what follows still exercises the real client identity over HTTP, which is the part the fix
 * changed.
 *
 * Usage: node scripts/verify-device-credential-ownership.mjs <credential> <expectedUserId>
 */
import { PrismaClient } from '@prisma/client';

const [credential, expectedUserId] = process.argv.slice(2);
if (!credential || !expectedUserId) {
  console.log('usage: node scripts/verify-device-credential-ownership.mjs <credential> <expectedUserId>');
  process.exit(1);
}

const base = process.env.API_BASE ?? 'http://127.0.0.1:3000';

async function call(method, path, body, cred) {
  const headers = { 'content-type': 'application/json' };
  if (cred) headers['x-goodnight-user-id'] = cred;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: { raw: text.slice(0, 200) } };
  }
}

const marker = `device-owner-${Date.now()}`;
const prisma = new PrismaClient();

try {
  // 1. The device's own credential creates a mood.
  const created = await call('POST', '/api/v1/moods', { content: marker, emotion: '焦虑', visibility: 'PRIVATE' }, credential);
  console.log('create with the device credential ->', created.status);
  console.log('  response reports owner:', created.json?.mood?.userId ?? '(none)');

  const rows = await prisma.mood.findMany({ where: { content: marker }, select: { userId: true } });
  console.log('  row in postgres owner:', JSON.stringify(rows.map((r) => r.userId)));
  const owned = rows.length === 1 && rows[0].userId === expectedUserId;
  console.log(owned ? '  VERDICT: owned by the device user' : '  VERDICT: WRONG OWNER');

  // 2. The device can read it back; the demo account cannot.
  const mine = await call('GET', '/api/v1/diaries', undefined, credential);
  const mineSees = (mine.json?.items ?? []).some((i) => i.content === marker);
  console.log('device GET /diaries ->', mine.status, 'sees its own record:', mineSees);

  const demo = await call('POST', '/api/v1/auth/demo', {});
  const demoCred = demo.json?.item?.credential;
  const demoRes = demoCred ? await call('GET', '/api/v1/diaries', undefined, demoCred) : { status: 0, json: {} };
  const demoSees = (demoRes.json?.items ?? []).some((i) => i.content === marker);
  console.log('demo   GET /diaries ->', demoRes.status, 'sees it:', demoSees);

  // 3. The home dashboard is now the device user's own.
  const home = await call('GET', '/api/v1/tonight', undefined, credential);
  console.log('device GET /tonight ->', home.status, 'journey owner:', home.json?.item?.journey?.userId ?? '(none)');

  console.log();
  console.log(mineSees ? 'device sees its own record: YES' : 'device sees its own record: NO');
  console.log(demoSees ? 'demo sees it: YES - isolation broken' : 'demo sees it: no');

  await prisma.diary.deleteMany({ where: { content: marker } });
  await prisma.mood.deleteMany({ where: { content: marker } });
  console.log('cleaned up');
} finally {
  await prisma.$disconnect();
}
