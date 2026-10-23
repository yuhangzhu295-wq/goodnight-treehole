// Drop the app identity's generated letters so the next read regenerates one from the newest mood.
//
// A letter only carries a source (`sourceMoodId`, and therefore the 原始记录 row) when it was created
// after the mood it answers. The identity's first letter is usually created the moment the page is
// opened - before any diary exists - so it has no source, and 原始记录 could never be exercised.
//
// The identity is the anonymous account the app bootstraps on this device, and the URL guard below keeps
// this on the local development database; the rows it removes are letters that same fixture generated.
// Saved diaries are not touched.
//
// Usage: node scripts/reset-letter.mjs
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { repoFile } from './repo-root.mjs';
import { withSession } from './device-session.mjs';

const env = readFileSync(repoFile('.env'), 'utf8');
const url = env.match(/^DATABASE_URL="?([^"\n]+)"?$/m)?.[1];
if (!url) throw new Error('DATABASE_URL not found in .env');
// This script deletes rows. It only ever runs against the local development database: a URL that names
// a remote host is refused outright, so it cannot be pointed at anything real by accident.
if (!/@(?:127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error('refusing to run: DATABASE_URL does not point at the local development database');
  process.exit(2);
}

const userId = await withSession(async ({ call, ev }) => {
  await call('Runtime.enable');
  const value = await ev(
    `(async function(){
      try {
        var p = window.Capacitor.Plugins.Preferences;
        var u = await p.get({ key: 'goodnight-identity-user-id' });
        return u.value || '';
      } catch (e) { return ''; }
    })()`,
    true,
  );
  return String(value ?? '');
});
if (!userId) {
  console.error('could not read the app identity from the device');
  process.exit(2);
}

const credential = await withSession(async ({ call, ev }) => {
  await call('Runtime.enable');
  return String(
    (await ev(
      `(async function(){
        try {
          var p = window.Capacitor.Plugins.Preferences;
          var c = await p.get({ key: 'goodnight-identity-credential' });
          return c.value || '';
        } catch (e) { return ''; }
      })()`,
      true,
    )) ?? '',
  );
});

if (!credential) {
  console.error('could not read the app credential from the device; nothing deleted');
  process.exit(2);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
// Every letter of this identity. It is the anonymous account the app bootstrapped on this device, not a
// person's account, and the URL guard above keeps this on the local database. Keeping a previously
// saved letter would leave the fixture with a letter that has no source, so 原始记录 could not be
// exercised - and the row this script deletes is the one the fixture itself generated.
const { count } = await prisma.letter.deleteMany({ where: { userId } });
await prisma.$disconnect();

// Generate it now rather than leaving the first page view to do it: the generation is an AI job that
// can take a minute, and a suite that opens the page while it runs sees the empty state and reports
// every control as missing.
let ready = false;
if (credential) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const res = await fetch('http://127.0.0.1:3000/api/v1/letters/today', { headers: { 'x-goodnight-user-id': credential } });
    const body = await res.json().catch(() => ({}));
    if (body?.item?.content) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}
console.log(
  `deleted ${count} letter(s) for ${userId}; ` +
    `${ready ? 'a new one is generated' : 'generation did not finish in time'}`,
);
// A fixture that is not ready must fail, or the suite tests the empty state and calls it a page.
if (!ready) process.exitCode = 2;
