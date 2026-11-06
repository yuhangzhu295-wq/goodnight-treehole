// Make sure the app identity has a letter that can answer 原始记录, without deleting anything.
//
// A letter only carries a source (`sourceMoodId`, and therefore the 原始记录 row) when it was created
// after the mood it answers. This script does not remove letters to force a fresh one: earlier versions
// did, and every attempt to scope the delete still had to prove which letter was its own. It deletes
// nothing at all now.
//
// It asks the API for today's letter (which generates one when the identity has none) and reports whether
// that letter has a source. A fresh install always does, because the runner seeds a diary first; on a
// reused identity that already had a letter without a source it exits 3 and the runner marks letter-today
// as BLOCKED rather than running a case against a row that cannot exist.
//
// Exit codes: 0 = a sourced letter is ready, 2 = the identity/credential or the database URL is unusable,
// 3 = no sourced letter is available.
//
// Usage: node scripts/reset-letter.mjs
import { readFileSync } from 'node:fs';
import { repoFile } from './repo-root.mjs';
import { withSession } from './device-session.mjs';

const env = readFileSync(repoFile('.env'), 'utf8');
const url = env.match(/^DATABASE_URL="?([^"\n]+)"?$/m)?.[1];
if (!url) throw new Error('DATABASE_URL not found in .env');
// This fixture drives the local stack only; a URL that names a remote host is refused outright.
if (!/@(?:127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error('refusing to run: DATABASE_URL does not point at the local development database');
  process.exit(2);
}

const identity = await withSession(async ({ call, ev }) => {
  await call('Runtime.enable');
  const read = (key) =>
    ev(
      `(async function(){
        try {
          var p = window.Capacitor.Plugins.Preferences;
          var v = await p.get({ key: ${JSON.stringify(key)} });
          return v.value || '';
        } catch (e) { return ''; }
      })()`,
      true,
    );
  return { userId: String((await read('goodnight-identity-user-id')) ?? ''), credential: String((await read('goodnight-identity-credential')) ?? '') };
});
if (!identity.userId || !identity.credential) {
  console.error('could not read the app identity and credential from the device');
  process.exit(2);
}

// Ask for a letter and wait for it: generation is an AI job, and a suite that opens the page while it
// runs sees the empty state and reports every control as missing.
let letter = null;
for (let attempt = 0; attempt < 40; attempt += 1) {
  const res = await fetch('http://127.0.0.1:3000/api/v1/letters/today', { headers: { 'x-goodnight-user-id': identity.credential } });
  const body = await res.json().catch(() => ({}));
  if (body?.item?.content) {
    letter = body.item;
    break;
  }
  await new Promise((r) => setTimeout(r, 3000));
}

const sourced = Boolean(letter?.sourceDiaryId);
console.log(
  letter
    ? `letter ${letter.id} for ${identity.userId} ${sourced ? 'has a source' : 'has no source'}`
    : `no letter was generated for ${identity.userId}`,
);
if (!sourced) {
  console.error('no sourced letter is available: the 原始记录 case cannot run on this identity');
  process.exitCode = 3;
}
