// Recycle the letter this fixture generated, so the next read creates one from the newest mood.
//
// A letter only carries a source (`sourceMoodId`, and therefore the 原始记录 row) when it was created
// after the mood it answers. A letter that already exists keeps whatever source it had - usually none,
// because the first one is generated the moment the page is opened, before any diary exists.
//
// Deleting letters by user id would remove letters a reader had saved, so this only ever removes ids it
// wrote down itself: `artifacts/ui-v2/fixtures/letter-fixture.json` records the id of the letter this
// script generated. Anything else on the identity is left alone. The URL guard keeps it on the local
// development database.
//
// Exit codes: 0 = a sourced letter is ready, 2 = could not read the identity/credential or the database
// is not local, 3 = no sourced letter is available (the page's 原始记录 case cannot run).
//
// Usage: node scripts/reset-letter.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
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

const fixtureDir = repoFile('artifacts/ui-v2/fixtures');
const fixtureFile = `${fixtureDir}/letter-fixture.json`;
const previous = existsSync(fixtureFile) ? JSON.parse(readFileSync(fixtureFile, 'utf8')) : null;

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
  console.error('could not read the app identity and credential from the device; nothing deleted');
  process.exit(2);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });
// Every letter that exists before this run. The id the API returns afterwards is attributed by this
// set, not by "different from the latest": after a recorded letter is deleted, `letters/today` can
// return an older letter that was already there, and calling that one "generated here" would let the
// next run delete it.
const preIds = new Set(
  (await prisma.letter.findMany({ where: { userId: identity.userId }, select: { id: true } })).map((row) => row.id),
);

// Only the ids this fixture recorded, and only while they still belong to the same identity and have
// not been kept by a reader since. A saved or favourited letter is user data: deleting it would null the
// diary's `letterId`.
const owned = (previous?.letterIds ?? []).filter((id) => typeof id === 'string' && id.length > 0);
let removed = 0;
if (owned.length) {
  const kept = await prisma.letter.findMany({
    where: { id: { in: owned }, userId: identity.userId, OR: [{ savedToDiary: true }, { favorite: true }] },
    select: { id: true },
  });
  const keptIds = new Set(kept.map((row) => row.id));
  const deletable = owned.filter((id) => !keptIds.has(id));
  if (deletable.length) {
    removed = (await prisma.letter.deleteMany({ where: { id: { in: deletable }, userId: identity.userId } })).count;
  }
  if (keptIds.size) console.log(`kept ${keptIds.size} letter(s) the reader had saved or favourited`);
}
await prisma.$disconnect();

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

// Record the id only when it is not one of the letters that existed before this run. Anything the
// identity already had is the reader's, and recording it would let the next run delete it.
const generatedHere = Boolean(letter && !preIds.has(letter.id));
const recordedIds = generatedHere ? [letter.id] : [];
mkdirSync(fixtureDir, { recursive: true });
writeFileSync(
  fixtureFile,
  `${JSON.stringify({ ownerUserId: identity.userId, letterIds: recordedIds }, null, 2)}\n`,
);

const sourced = Boolean(letter?.sourceDiaryId);
console.log(
  `recycled ${removed} letter(s) this fixture had generated for ${identity.userId}; ` +
    `${letter ? `current letter ${letter.id}` : 'no letter was generated'}` +
    `${sourced ? ' has a source' : ' has no source'}` +
    `${generatedHere ? '' : ' (not recorded: it existed before this run)'}`,
);
if (!sourced) {
  console.error('no sourced letter is available: the 原始记录 case cannot run on this identity');
  process.exitCode = 3;
}
