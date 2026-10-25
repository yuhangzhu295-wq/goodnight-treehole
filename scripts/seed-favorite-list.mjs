// Seed a deterministic favourites list for the FavoriteList control suite.
//
// The page has to show one list across types, a per-type filter and a working removal, so it needs
// favourites of more than one kind. These rows are real Favourite rows for the device's own identity,
// pointing at real posts and letters the same account owns, written through the same database the API
// reads.
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
  // Re-runs replace the previous fixture rows, so the list assertions stay deterministic. The marker
  // lives inside the target's own text, not in a visible title. Old targets are removed too: leaving
  // them behind accumulates rows in the other lists the same account can open.
  const stalePosts = await prisma.post.findMany({
    where: { userId, content: { contains: 'UI收藏' } },
    select: { id: true },
  });
  const staleLetters = await prisma.letter.findMany({
    where: { userId, content: { contains: 'UI收藏' } },
    select: { id: true },
  });
  const staleMoods = await prisma.mood.findMany({
    where: { userId, content: { contains: 'UI收藏' } },
    select: { id: true },
  });
  if (stalePosts.length) {
    await prisma.favorite.deleteMany({
      where: { userId, targetType: 'post', targetId: { in: stalePosts.map((row) => row.id) } },
    });
    await prisma.post.deleteMany({ where: { id: { in: stalePosts.map((row) => row.id) } } });
  }
  if (staleLetters.length) {
    await prisma.favorite.deleteMany({
      where: { userId, targetType: 'letter', targetId: { in: staleLetters.map((row) => row.id) } },
    });
    await prisma.letter.deleteMany({ where: { id: { in: staleLetters.map((row) => row.id) } } });
  }
  // A post is unique on its mood, so the mood goes with it.
  if (staleMoods.length) {
    await prisma.mood.deleteMany({ where: { id: { in: staleMoods.map((row) => row.id) } } });
  }

  // Local calendar midnights, so the “今天收藏 / 昨天收藏” labels are what the page will show.
  const localMidnight = (offsetDays = 0) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offsetDays);
    return date;
  };

  // Post requires a mood, so the fixture creates one and points the post at it. The content starts
  // with a sentence a person could have written; the marker is at the end, out of the visible title.
  const mood = await prisma.mood.create({
    data: {
      userId,
      emotion: '工作',
      content: '我把没说完的话留到第二天再想。（UI收藏）',
      visibility: 'PRIVATE',
      riskLevel: 'low',
      riskScore: 0,
    },
  });
  const post = await prisma.post.create({
    data: {
      userId,
      moodId: mood.id,
      emotion: '工作',
      content: '汇报前我又把提纲改了一遍，最后还是先发给了自己。（UI收藏）',
      visibility: 'PRIVATE',
    },
  });
  const letter = await prisma.letter.create({
    data: {
      userId,
      title: '关于第一次尝试的回信',
      content: '关于第一次尝试的回信正文。（UI收藏）',
      style: 'warm',
      status: 'read',
    },
  });
  // Through the same write path the API uses, so the redundant projections (`Post.favoriteCount`,
  // `Letter.favorite`) stay in step with the Favourite rows.
  await prisma.$transaction(async (tx) => {
    await tx.favorite.create({
      data: { userId, targetType: 'post', targetId: post.id, createdAt: localMidnight(0) },
    });
    await tx.post.update({ where: { id: post.id }, data: { favoriteCount: 1 } });
    await tx.favorite.create({
      data: { userId, targetType: 'letter', targetId: letter.id, createdAt: localMidnight(-1) },
    });
    await tx.letter.update({ where: { id: letter.id }, data: { favorite: true } });
  });
  console.log('favorite list seeded');
} finally {
  await prisma.$disconnect();
}
