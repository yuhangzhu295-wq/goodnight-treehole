import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';

async function main() {
  const root = process.cwd();
  const source = path.resolve(root, process.argv[2] ?? 'data/goodnight-store.json');
  const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://goodnight@127.0.0.1:55432/goodnight_treehole?schema=public';
  if (!fs.existsSync(source)) throw new Error(`JSON store not found: ${source}`);
  const backupDir = path.resolve(root, 'data/json-backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backup = path.join(backupDir, `${path.basename(source)}.${new Date().toISOString().replace(/[:.]/g, '-')}.bak`);
  fs.copyFileSync(source, backup);
  const payload = JSON.parse(fs.readFileSync(source, 'utf8'));
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await prisma.runtimeState.upsert({
    where: { id: 'default' },
    create: { id: 'default', payload: payload as Prisma.InputJsonValue },
    update: { payload: payload as Prisma.InputJsonValue },
  });
  const count = (key: string) => Array.isArray(payload[key]) ? payload[key].length : 0;
  console.log(JSON.stringify({
    source,
    backup,
    checksum: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    counts: { users: count('users'), moods: count('moods'), posts: count('posts'), replies: count('replies'), aiJobs: count('aiJobs'), assets: count('assets') },
  }, null, 2));
  await prisma.$disconnect();
}

void main();
