// Hides the duplicate peer experiences left behind by repeated runs of
// ui2-create-active-conversation.mjs, using the admin review endpoint rather than deleting rows.
// Keeps the newest published experience, which the active conversation belongs to.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const ADMIN_BASE = process.env.ADMIN_BASE ?? 'http://127.0.0.1:3000/api/admin/v1';

const login = await fetch(`${ADMIN_BASE}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    username: process.env.ADMIN_USERNAME ?? 'admin',
    password: process.env.ADMIN_PASSWORD ?? 'admin123',
  }),
});
const token = (await login.json()).token ?? (await login.json()).accessToken;
if (!token) throw new Error('admin login failed');

const published = await prisma.peerExperience.findMany({
  where: { status: 'published' },
  orderBy: { createdAt: 'desc' },
  select: { id: true, userId: true, title: true, createdAt: true },
});
console.log(`published before: ${published.length}`);
const [, ...duplicates] = published;
for (const item of duplicates) {
  const res = await fetch(`${ADMIN_BASE}/peer-experiences/${item.id}/review`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: token },
    body: JSON.stringify({ status: 'hidden' }),
  });
  console.log(`  hidden ${item.id} (${item.userId}) -> ${res.status}`);
}
const after = await prisma.peerExperience.count({ where: { status: 'published' } });
console.log(`published after: ${after}`);
await prisma.$disconnect();
