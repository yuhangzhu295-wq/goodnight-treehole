// Seed a deterministic inbox for the LetterList control suite.
//
// The list needs letters across the grouping boundaries (today, the previous days, 更早) and both read
// states. The AI letter fixture can be unavailable, and a test that skips the list entirely would leave
// the tabs and rows unverified. These rows are real Letter rows for the device's own identity, written
// through the same database the API reads.
//
// Exit codes: 0 = seeded, 3 = the app has no identity yet.
import { execFileSync } from 'node:child_process';
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
  // Re-runs replace the previous fixture rows, so the grouping assertions stay deterministic. The
  // marker lives in the content, not the title: the title is what the page shows a person.
  //
  // Read the ids first. A favourite row points at a letter id and the Favourite table has no foreign
  // key to Letter, so deleting the letters first would leave unopenable favourites behind and the
  // cleanup query would already have nothing to find.
  const previous = await prisma.letter.findMany({
    where: { userId, content: { contains: 'UI清单' } },
    select: { id: true },
  });
  if (previous.length) {
    await prisma.favorite.deleteMany({
      where: { userId, targetType: 'letter', targetId: { in: previous.map((row) => row.id) } },
    });
  }
  await prisma.letter.deleteMany({ where: { userId, content: { contains: 'UI清单' } } });

  // Local calendar midnights, not millisecond offsets: a run at 00:30 would otherwise place the
  // "today" letter in yesterday's group, and a DST change would shift the date boundaries.
  const localMidnight = (offsetDays = 0) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offsetDays);
    return date;
  };
  const rows = [
    {
      title: '关于你上次写的那件事',
      content: 'UI清单：今天的回信内容，用来验证未读状态。',
      status: 'unread',
      createdAt: localMidnight(0),
    },
    {
      title: '关于工作压力的一封回信',
      content: 'UI清单：昨天的回信内容，用来验证具体日期分组。',
      status: 'read',
      createdAt: localMidnight(-1),
    },
    {
      title: '关于搬家后睡不着的回信',
      content: 'UI清单：前天的回信内容。',
      status: 'read',
      createdAt: localMidnight(-2),
    },
    {
      title: '关于和家里通话的回信',
      content: 'UI清单：更早的回信内容，用来验证更早分组。',
      status: 'unread',
      createdAt: localMidnight(-10),
    },
  ];
  await prisma.letter.createMany({
    data: rows.map((row) => ({ userId, style: 'warm', ...row })),
  });
  console.log('letter list seeded');
} finally {
  await prisma.$disconnect();
}
