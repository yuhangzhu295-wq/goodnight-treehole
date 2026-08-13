import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://goodnight@127.0.0.1:55432/goodnight_treehole?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

type Check = { name: string; ok: boolean; evidence: string };

function hasCorruptedText(value: unknown): boolean {
  if (typeof value === 'string') return value.includes('??') || value.toLowerCase().includes('jiaolv');
  if (Array.isArray(value)) return value.some((item) => hasCorruptedText(item));
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).some((item) => hasCorruptedText(item));
  return false;
}

function markdown(checks: Check[]) {
  return [
    '# Final PostgreSQL persistence acceptance',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Total: ${checks.length}; passed: ${checks.filter((item) => item.ok).length}; failed: ${checks.filter((item) => !item.ok).length}`,
    '',
    '| Result | Check | Evidence |',
    '| --- | --- | --- |',
    ...checks.map((item) => `| ${item.ok ? 'PASS' : 'FAIL'} | ${item.name} | ${item.evidence} |`),
    '',
  ].join('\n');
}

async function main() {
  const checks: Check[] = [];
  const counts = await Promise.all([
    prisma.user.count(), prisma.mood.count(), prisma.post.count(), prisma.diary.count(), prisma.reply.count(),
    prisma.aIJob.count(), prisma.feedbackTicket.count(), prisma.mediaAsset.count(), prisma.systemSetting.count(),
  ]);
  const countSnapshot = {
    users: counts[0], moods: counts[1], posts: counts[2], diaries: counts[3], replies: counts[4],
    aiJobs: counts[5], feedbackTickets: counts[6], mediaAssets: counts[7], systemSettings: counts[8],
  };
  checks.push({ name: 'PostgreSQL relation tables are readable', ok: counts.every((count) => Number.isInteger(count) && count >= 0), evidence: JSON.stringify(countSnapshot) });

  const runtime = await prisma.runtimeState.findUnique({ where: { id: 'default' } });
  const relationalPrimary = Boolean(runtime && typeof runtime.payload === 'object' && !Array.isArray(runtime.payload) && (runtime.payload as Record<string, unknown>).persistence === 'relational-primary');
  checks.push({ name: 'Relation tables remain the authoritative source', ok: relationalPrimary, evidence: JSON.stringify(runtime?.payload ?? null) });

  const runningJobs = await prisma.aIJob.findMany({ where: { status: { in: ['queued', 'running'] } }, select: { id: true, status: true, createdAt: true, contentId: true, contentType: true, jobType: true, modelName: true, promptSummary: true } });
  checks.push({ name: 'No queued or running AI jobs remain', ok: runningJobs.length === 0, evidence: JSON.stringify(runningJobs) });

  const publishedWithoutTimestamp = await prisma.post.findMany({ where: { reviewStatus: 'published', publishedAt: null }, select: { id: true, createdAt: true } });
  checks.push({ name: 'Published posts retain a durable publication timestamp', ok: publishedWithoutTimestamp.length === 0, evidence: publishedWithoutTimestamp.length ? JSON.stringify(publishedWithoutTimestamp) : '0 posts' });

  const [moods, posts, diaries, replies, tickets] = await Promise.all([
    prisma.mood.findMany({ select: { id: true, content: true, emotion: true }, take: 1000 }),
    prisma.post.findMany({ select: { id: true, content: true, emotion: true }, take: 1000 }),
    prisma.diary.findMany({ select: { id: true, content: true, emotion: true }, take: 1000 }),
    prisma.reply.findMany({ select: { id: true, content: true }, take: 1000 }),
    prisma.feedbackTicket.findMany({ select: { id: true, content: true, reply: true }, take: 1000 }),
  ]);
  const dirty = [...moods, ...posts, ...diaries, ...replies, ...tickets].filter((record) => hasCorruptedText(record));
  checks.push({ name: 'Business text has no ?? or jiaolv residue', ok: dirty.length === 0, evidence: dirty.length ? JSON.stringify(dirty) : '0 records' });

  const aiJobs = await prisma.aIJob.findMany({
    select: { id: true, contentId: true, promptSummary: true, result: true, errorMessage: true, structuredResult: true, traceJson: true },
    take: 1000,
  });
  const dirtyAiJobs = aiJobs.filter((job) => hasCorruptedText(job));
  checks.push({ name: 'AI job prompt, result, error, structured result, and trace have no ?? or jiaolv residue', ok: dirtyAiJobs.length === 0, evidence: dirtyAiJobs.length ? JSON.stringify(dirtyAiJobs) : '0 jobs' });

  const settings = await prisma.systemSetting.findMany({ select: { key: true, value: true, updatedAt: true }, orderBy: { key: 'asc' } });
  const replySetting = settings.find((item) => item.key === 'allowHumanRepliesDefault');
  checks.push({ name: 'Authoritative system setting is persisted', ok: Boolean(replySetting && typeof replySetting.value === 'boolean'), evidence: JSON.stringify(replySetting ?? null) });

  const result = {
    generatedAt: new Date().toISOString(),
    databaseUrl: databaseUrl.replace(/:[^:@/]+@/, ':***@'),
    counts: countSnapshot,
    dirtyRecords: dirty,
    dirtyAiJobs,
    systemSettingKeys: settings.map((item) => ({ key: item.key, updatedAt: item.updatedAt, value: item.value })),
    checks,
  };
  await fs.mkdir(path.resolve('artifacts/test-report'), { recursive: true });
  await fs.mkdir(path.resolve('artifacts/traces/final'), { recursive: true });
  await Promise.all([
    fs.writeFile(path.resolve('artifacts/test-report/final-database-report.md'), markdown(checks), 'utf8'),
    fs.writeFile(path.resolve('artifacts/traces/final/final-database-audit.json'), JSON.stringify(result, null, 2), 'utf8'),
  ]);
  if (checks.some((check) => !check.ok)) throw new Error('Final database audit contains failed checks');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
