// Seed a second live session for the device's anonymous identity.
//
// The MeProfile control suite has to click 撤销 on a real non-current session. The product itself
// never creates a second session for one identity (there is no cross-device login), so without a
// fixture the revoke button is not on screen and the mutation would only be covered by the API
// tests. This inserts one row for the identity the installed app is using; the suite then revokes it
// through the page, which is the behaviour under test.
//
// The device credential is read from the app's private SharedPreferences via `run-as` (the debug
// build is debuggable) and is never printed. Only the new session id is reported.
//
// Exit codes: 0 = seeded, 3 = the app has no identity yet (open it once).
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { ADB } from './device-session.mjs';

const DEV_DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://goodnight:goodnight@127.0.0.1:15432/goodnight_treehole?schema=public';
const API_BASE = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  execFileSync(ADB, ['shell', 'am', 'start', '-n', 'com.goodnight.treehole/.MainActivity'], { stdio: 'ignore' });
} catch {
  // The read below reports the real problem.
}
await sleep(3500);

let xml = '';
try {
  xml = execFileSync(
    ADB,
    ['shell', 'run-as', 'com.goodnight.treehole', 'cat', 'shared_prefs/CapacitorStorage.xml'],
    { encoding: 'utf8' },
  );
} catch {
  console.error('could not read the app preferences; is the debug build installed?');
  process.exit(3);
}
const credential = xml.match(/<string name="goodnight-identity-credential">([^<]+)<\/string>/)?.[1];
if (!credential) {
  console.error('the app has no identity yet; open it once and retry');
  process.exit(3);
}

const profile = await fetch(`${API_BASE}/api/v1/me/profile`, {
  headers: { 'x-goodnight-user-id': credential },
});
if (!profile.ok) {
  console.error(`profile request failed: HTTP ${profile.status}`);
  process.exit(3);
}
const userId = (await profile.json()).item.id;

const prisma = new PrismaClient({ datasources: { db: { url: DEV_DATABASE_URL } } });
try {
  // A previous run that failed before revoking would otherwise leave several revoke buttons on the
  // page, and the suite's "the button is gone" assertion would be about the wrong row.
  await prisma.anonymousSession.updateMany({
    where: { userId, deviceLabel: '第二会话（验证撤销）', revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: 'fixture_reset' },
  });
  // The control suite clicks the only revoke button on the page. If a real second session exists,
  // refusing here is safer than revoking an account's actual credential.
  const active = await prisma.anonymousSession.count({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
  });
  if (active > 1) {
    console.error(`refusing to seed: ${active} active sessions exist, so the revoke target would be ambiguous`);
    process.exit(3);
  }
  const secret = crypto.randomBytes(32).toString('base64url');
  const row = await prisma.anonymousSession.create({
    data: {
      userId,
      secretHash: crypto.createHash('sha256').update(secret).digest('hex'),
      deviceLabel: '第二会话（验证撤销）',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  console.log(`second session seeded ${row.id}`);
} finally {
  await prisma.$disconnect();
}
