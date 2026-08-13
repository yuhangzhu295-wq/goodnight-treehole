import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://goodnight@127.0.0.1:55432/goodnight_treehole?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

async function main() {
  const targets = await prisma.post.findMany({
    where: { reviewStatus: 'published', publishedAt: null },
    select: { id: true, createdAt: true },
  });
  await prisma.$transaction(targets.map((post) => prisma.post.update({ where: { id: post.id }, data: { publishedAt: post.createdAt } })));
  const remaining = await prisma.post.count({ where: { reviewStatus: 'published', publishedAt: null } });
  if (remaining) throw new Error(`${remaining} published posts still have no publication timestamp`);

  await fs.mkdir(path.resolve('artifacts/traces/final'), { recursive: true });
  await fs.writeFile(
    path.resolve('artifacts/traces/final/backfill-post-published-at.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), source: 'createdAt (historical records had no separate publication timestamp)', updated: targets.map((post) => ({ id: post.id, publishedAt: post.createdAt.toISOString() })), remaining }, null, 2),
    'utf8',
  );
  console.log(JSON.stringify({ updated: targets.length, remaining }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
