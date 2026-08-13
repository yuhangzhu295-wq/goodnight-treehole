import { PrismaClient } from '@prisma/client';
import { RUNTIME_DATABASE_URL } from '../apps/api/src/prisma-runtime.service';

const prisma = new PrismaClient({ datasources: { db: { url: RUNTIME_DATABASE_URL } } });

async function main() {
  const reply = await prisma.reply.updateMany({
    where: { content: '后台操作文本' },
    data: { content: '我会陪你慢慢理清现在的感受。' },
  });
  console.log(JSON.stringify({ normalizedReplies: reply.count }));
}

main().finally(() => prisma.$disconnect());
