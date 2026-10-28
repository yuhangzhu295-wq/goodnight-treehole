// Seed notifications matching 14_NotificationCenter.png for the current device user
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
    console.error('No device credential found');
    process.exit(1);
  }

  const profileRes = await fetch('http://127.0.0.1:3000/api/v1/me/profile', {
    headers: { 'x-goodnight-user-id': cred },
  });
  const profile = await profileRes.json();
  const userId = profile.item?.id;
  if (!userId) {
    console.error('No userId returned for credential');
    process.exit(1);
  }

  process.env.DATABASE_URL =
    process.env.DATABASE_URL ||
    'postgresql://goodnight:goodnight@127.0.0.1:15432/goodnight_treehole?schema=public';

  const { PrismaClient } = await import(
    pathToFileURL(path.join(repo, 'node_modules/@prisma/client/default.js')).href
  );
  const prisma = new PrismaClient();

  // Delete previous test notifications for clean review state
  await prisma.userNotification.deleteMany({
    where: { userId },
  });

  const now = Date.now();
  const fifteenMinAgo = new Date(now - 15 * 60 * 1000);
  const twentyMinAgo = new Date(now - 20 * 60 * 1000);
  const yesterday1 = new Date(now - 24 * 60 * 60 * 1000);
  const yesterday2 = new Date(now - 26 * 60 * 60 * 1000);

  // Exact 4 notifications from 14_NotificationCenter.png:
  // Today:
  // 1. 上次那件事，后来怎么样了？ (行动回访 · 15分钟前)
  // 2. 一条交流请求有新进展 (同路 · 20分钟前)
  // Yesterday:
  // 3. 写给未来的我 (一封预定的信已经到期)
  // 4. 上一次的行动结果 (你的记录已保存)
  await prisma.userNotification.createMany({
    data: [
      {
        id: `notif_${now}_1`,
        userId,
        type: 'FOLLOW_UP',
        title: '上次那件事，后来怎么样了？',
        body: '行动回访提醒',
        status: 'unread',
        createdAt: fifteenMinAgo,
      },
      {
        id: `notif_${now}_2`,
        userId,
        type: 'PEER_REQUEST',
        title: '一条交流请求有新进展',
        body: '交流请求有新进展',
        status: 'unread',
        createdAt: twentyMinAgo,
      },
      {
        id: `notif_${now}_3`,
        userId,
        type: 'FUTURE_SELF',
        title: '写给未来的我',
        body: '一封预定的信已经到期',
        status: 'read',
        createdAt: yesterday1,
      },
      {
        id: `notif_${now}_4`,
        userId,
        type: 'JOURNEY_CHECKIN',
        title: '上一次的行动结果',
        body: '你的记录已保存',
        status: 'read',
        createdAt: yesterday2,
      },
    ],
  });

  console.log('Seeded 4 notifications for', userId);
  await prisma.$disconnect();
});
