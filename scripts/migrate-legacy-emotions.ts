import { PrismaClient } from '@prisma/client';
import { RUNTIME_DATABASE_URL } from '../apps/api/src/prisma-runtime.service';

const prisma = new PrismaClient({ datasources: { db: { url: RUNTIME_DATABASE_URL } } });

async function main() {
  const mappings = [
    { from: '??', to: '其他' },
    { from: 'jiaolv', to: '焦虑' },
  ];
  const result: Record<string, number> = {};
  for (const mapping of mappings) {
    const [post, mood] = await Promise.all([
      prisma.post.updateMany({ where: { emotion: mapping.from }, data: { emotion: mapping.to } }),
      prisma.mood.updateMany({ where: { emotion: mapping.from }, data: { emotion: mapping.to } }),
    ]);
    result[`Post:${mapping.from}`] = post.count;
    result[`Mood:${mapping.from}`] = mood.count;
  }
  const remaining = await Promise.all([
    prisma.post.count({ where: { emotion: { in: mappings.map((item) => item.from) } } }),
    prisma.mood.count({ where: { emotion: { in: mappings.map((item) => item.from) } } }),
  ]);
  console.log(JSON.stringify({ result, remaining: { post: remaining[0], mood: remaining[1] } }, null, 2));
}

main().finally(() => prisma.$disconnect());
