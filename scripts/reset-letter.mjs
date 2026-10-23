// Drop the app identity's generated letters so the next read regenerates one from the newest mood.
//
// A letter only carries a source (`sourceMoodId`, and therefore the 原始记录 row) when it was created
// after the mood it answers. The identity's first letter is usually created the moment the page is
// opened - before any diary exists - so it has no source, and 原始记录 could never be exercised.
// Deleting the generated letter is a fixture reset: the letter is regenerated on the next read, and no
// user-authored content is touched.
//
// Usage: node scripts/reset-letter.mjs
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { repoFile } from './repo-root.mjs';
import { withSession } from './device-session.mjs';

const env = readFileSync(repoFile('.env'), 'utf8');
const url = env.match(/^DATABASE_URL="?([^"\n]+)"?$/m)?.[1];
if (!url) throw new Error('DATABASE_URL not found in .env');

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

const prisma = new PrismaClient({ datasources: { db: { url } } });
const { count } = await prisma.letter.deleteMany({ where: { userId } });
await prisma.$disconnect();
console.log(`deleted ${count} generated letter(s) for ${userId}; the next read will regenerate one`);
