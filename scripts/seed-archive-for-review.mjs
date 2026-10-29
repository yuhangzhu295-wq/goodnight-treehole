// Seed archived journeys matching 21_Archive.png for the current device user
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = 'C:/Users/zyu33/Projects/goodnight-treehole';
const { withSession } = await import(pathToFileURL(path.join(repo, 'scripts/device-session.mjs')).href);

await withSession(async ({ ev }) => {
  const cred = await ev(`(async () => {
    const p = window.Capacitor.Plugins.Preferences;
    return (await p.get({ key: "goodnight-identity-credential" })).value;
  })()`, true);

  if (!cred) {
    console.error('No credential');
    process.exit(1);
  }

  const profileRes = await fetch('http://127.0.0.1:3000/api/v1/me/profile', {
    headers: { 'x-goodnight-user-id': cred },
  });
  const profile = await profileRes.json();
  const userId = profile.item?.id;

  process.env.DATABASE_URL =
    process.env.DATABASE_URL ||
    'postgresql://goodnight:goodnight@127.0.0.1:15432/goodnight_treehole?schema=public';

  const { PrismaClient } = await import(
    pathToFileURL(path.join(repo, 'node_modules/@prisma/client/default.js')).href
  );
  const prisma = new PrismaClient();

  const oct8 = new Date('2026-10-08T14:30:00Z');
  const oct5 = new Date('2026-10-05T10:15:00Z');
  const sep20 = new Date('2026-09-20T18:00:00Z');
  const sep10 = new Date('2026-09-10T12:00:00Z');

  const list = [
    { id: 'journey_arch_1', title: '一段已经结束的关系', domain: '关系', status: 'completed', endedAt: oct8 },
    { id: 'journey_arch_2', title: '每天睡不好那段时间', domain: '生活', status: 'completed', endedAt: oct5 },
    { id: 'journey_arch_3', title: '找工作的那段时间', domain: '工作', status: 'archived', endedAt: sep20 },
    { id: 'journey_arch_4', title: '搬到新城市之后', domain: '生活', status: 'archived', endedAt: sep10 },
  ];

  for (const item of list) {
    await prisma.lifeJourney.upsert({
      where: { id: item.id },
      update: {
        userId,
        title: item.title,
        domain: item.domain,
        stage: 'graduated',
        status: item.status,
        completedAt: item.endedAt,
        updatedAt: item.endedAt,
      },
      create: {
        id: item.id,
        userId,
        title: item.title,
        domain: item.domain,
        stage: 'graduated',
        status: item.status,
        completedAt: item.endedAt,
        updatedAt: item.endedAt,
      },
    });
  }

  console.log('Seeded archived journeys for', userId);
  await prisma.$disconnect();
});
