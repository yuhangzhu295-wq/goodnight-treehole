import { PrismaClient } from '@prisma/client';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isRelationalPrimary, loadRelationalRuntimeState, saveRelationalRuntimeState } from '../apps/api/src/relational-runtime.mapper.js';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://goodnight@127.0.0.1:55432/goodnight_treehole?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const collections = ['users', 'moods', 'posts', 'replies', 'letters', 'diaries', 'favorites', 'feedbackCategories', 'faqs', 'replyPresets', 'feedbackTickets', 'aiProviders', 'aiRoutes', 'aiJobs', 'assets', 'auditLogs'] as const;

const count = (value: unknown) => Array.isArray(value) ? value.length : 0;

async function sourceFromBackup(artifactDir: string) {
  const backup = (await fs.readdir(artifactDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.startsWith('runtime-state-phase3-backup-') && entry.name.endsWith('.json'))
    .map((entry) => path.join(artifactDir, entry.name))
    .sort()
    .at(-1);
  if (!backup) throw new Error('RuntimeState is relational-primary and no Phase 3 source backup exists for resume.');
  return { source: JSON.parse(await fs.readFile(backup, 'utf8')) as Record<string, unknown>, backupFile: backup, resumed: true };
}

async function main() {
  const row = await prisma.runtimeState.findUnique({ where: { id: 'default' } });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const artifactDir = path.resolve('artifacts/resume');
  await fs.mkdir(artifactDir, { recursive: true });
  if (!row) throw new Error('RuntimeState.default does not exist; migration has no source payload.');
  const recovered = isRelationalPrimary(row.payload) ? await sourceFromBackup(artifactDir) : undefined;
  const source = recovered?.source ?? row.payload as Record<string, unknown>;
  const backupFile = recovered?.backupFile ?? path.join(artifactDir, `runtime-state-phase3-backup-${stamp}.json`);
  if (!recovered) await fs.writeFile(backupFile, JSON.stringify(source, null, 2));
  const sourceCounts = Object.fromEntries(collections.map((key) => [key, count(source[key])]));
  const uniqueFavorites = new Set((Array.isArray(source.favorites) ? source.favorites : []).map((item: any) => `${item.userId}|${item.targetType}|${item.targetId}`));
  const expectedCounts = { ...sourceCounts, favorites: uniqueFavorites.size };
  const integrityAdjustments = { duplicateFavoritesCollapsed: sourceCounts.favorites - expectedCounts.favorites };

  await saveRelationalRuntimeState(prisma, source);
  const hydrated = await loadRelationalRuntimeState(prisma);
  if (!hydrated) throw new Error('Relational read-back returned no runtime data after migration.');
  const hydratedCounts = Object.fromEntries(collections.map((key) => [key, count(hydrated[key])]));
  const mismatches = collections.filter((key) => expectedCounts[key] !== hydratedCounts[key]);
  if (mismatches.length) {
    throw new Error(`Relational read-back count mismatch: ${mismatches.map((key) => `${key} expected=${expectedCounts[key]} db=${hydratedCounts[key]}`).join('; ')}`);
  }

  const tableCounts = Object.fromEntries(await Promise.all([
    ['User', prisma.user.count()], ['Mood', prisma.mood.count()], ['Post', prisma.post.count()], ['Reply', prisma.reply.count()],
    ['Letter', prisma.letter.count()], ['Diary', prisma.diary.count()], ['Favorite', prisma.favorite.count()], ['MediaAsset', prisma.mediaAsset.count()],
    ['AIProvider', prisma.aIProvider.count()], ['AIStyleRoute', prisma.aIStyleRoute.count()], ['AIJob', prisma.aIJob.count()],
    ['FeedbackTicket', prisma.feedbackTicket.count()], ['AuditLog', prisma.auditLog.count()], ['PrivacySetting', prisma.privacySetting.count()],
    ['MoodAttachment', prisma.moodAttachment.count()], ['DiaryAttachment', prisma.diaryAttachment.count()],
  ].map(async ([name, value]) => [name, await value])));
  const report = {
    generatedAt: new Date().toISOString(),
    backupFile: path.relative(process.cwd(), backupFile),
    resumedFromBackup: Boolean(recovered?.resumed),
    sourceCounts,
    expectedCounts,
    hydratedCounts,
    integrityAdjustments,
    tableCounts,
    runtimeState: await prisma.runtimeState.findUnique({ where: { id: 'default' }, select: { id: true, payload: true, updatedAt: true } }),
    status: 'PASS',
  };
  await fs.writeFile(path.resolve('artifacts/test-report/phase3-relational-migration.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
