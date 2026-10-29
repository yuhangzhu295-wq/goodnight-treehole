// Restores the two seeded peer experiences that cleanup-ui2-fixtures.mjs hid by mistake. Those are
// pre-existing dev data owned by user_guest, not fixtures created by the UI V2 scripts.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const ADMIN_BASE = process.env.ADMIN_BASE ?? 'http://127.0.0.1:3000/api/admin/v1';
const SEEDED = ['experience_8a3d80c2f0', 'experience_0e8066823c'];

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

for (const id of SEEDED) {
  const before = await prisma.peerExperience.findUnique({ where: { id }, select: { userId: true, status: true } });
  if (!before) {
    console.log(`${id}: NOT FOUND`);
    continue;
  }
  const res = await fetch(`${ADMIN_BASE}/peer-experiences/${id}/review`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: token },
    body: JSON.stringify({ status: 'published' }),
  });
  const after = await prisma.peerExperience.findUnique({ where: { id }, select: { status: true } });
  console.log(`${id} (${before.userId}): ${before.status} -> ${after?.status} (http ${res.status})`);
}

const published = await prisma.peerExperience.findMany({
  where: { status: 'published' },
  select: { id: true, userId: true },
});
console.log(`published now: ${published.length}`);
for (const p of published) console.log(`  ${p.id} ${p.userId}`);
await prisma.$disconnect();
