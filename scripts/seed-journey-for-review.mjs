// Seed a journey with timeline records matching 05_JourneyDetail.png for the device user
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

  const journeyId = 'journey_review_timeline';

  // Upsert journey
  const journey = await prisma.lifeJourney.upsert({
    where: { id: journeyId },
    update: {
      userId,
      title: '这事还在继续',
      domain: '睡眠',
      stage: 'clarifying',
      status: 'active',
      currentIntent: 'NEXT_STEP',
      initialIntensity: 3,
      intensity: 5,
    },
    create: {
      id: journeyId,
      userId,
      title: '这事还在继续',
      domain: '睡眠',
      stage: 'clarifying',
      status: 'active',
      currentIntent: 'NEXT_STEP',
      initialIntensity: 3,
      intensity: 5,
    },
  });

  // Snapshot
  await prisma.journeyUpdate.deleteMany({ where: { journeyId } });

  const now = Date.now();
  const today = new Date(now - 2 * 60 * 60 * 1000);
  const oct8 = new Date(now - 24 * 60 * 60 * 1000);
  const oct7 = new Date(now - 48 * 60 * 60 * 1000);

  // 1. 最初写下这件事
  await prisma.journeyUpdate.create({
    data: {
      id: `upd_${now}_1`,
      journey: { connect: { id: journeyId } },
      user: { connect: { id: userId } },
      kind: 'created',
      content: '当时还不知道该怎么处理。',
      createdAt: oct7,
    },
  });

  // 2. 确认当前处境
  await prisma.journeyUpdate.create({
    data: {
      id: `upd_${now}_2`,
      journey: { connect: { id: journeyId } },
      user: { connect: { id: userId } },
      kind: 'checkin',
      content: '记录了事实、感受与现在需要的支持。',
      createdAt: oct8,
    },
  });

  // 3. 有了新的想法
  await prisma.journeyUpdate.create({
    data: {
      id: `upd_${now}_3`,
      journey: { connect: { id: journeyId } },
      user: { connect: { id: userId } },
      kind: 'later',
      content: '把想说的话先留下，明天再看看。',
      createdAt: today,
    },
  });

  console.log('Seeded journey_review_timeline for user', userId);
  await prisma.$disconnect();
});
