import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { saveRelationalRuntimeState } from '../apps/api/src/relational-runtime.mapper.ts';
import { createVisualFixtureSeed, visualFixtureMonth } from '../fixtures/visual/v1/seed.ts';

const root = process.cwd();
const fixtureRoot = path.join(root, 'fixtures', 'visual', 'v1');
const runtimeRoot = path.join(root, 'artifacts', 'visual-fixtures', 'v1', 'runtime');
const uploadsRoot = path.join(runtimeRoot, 'uploads');
const databaseName = 'goodnight_treehole_visual_v1';

function assertFixtureTarget() {
  if (process.env.VISUAL_FIXTURE_MODE !== '1' || process.env.VISUAL_FIXTURE_VERSION !== 'v1') throw new Error('Fixture seeding requires VISUAL_FIXTURE_MODE=1 and VISUAL_FIXTURE_VERSION=v1.');
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('Fixture seeding requires DATABASE_URL.');
  const url = new URL(raw);
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== '55433' || url.pathname !== `/${databaseName}` || url.searchParams.get('schema') !== 'public') {
    throw new Error('Refusing to seed a non-fixture database target.');
  }
  if (path.resolve(process.env.GOODNIGHT_UPLOADS_DIR ?? '') !== uploadsRoot) throw new Error('Refusing to seed a non-fixture uploads directory.');
  if (uploadsRoot === path.join(root, 'data', 'uploads')) throw new Error('Fixture uploads directory resolves to live uploads.');
}

async function copyFixtureMedia(state: Record<string, any>) {
  await fs.rm(uploadsRoot, { recursive: true, force: true });
  await fs.mkdir(uploadsRoot, { recursive: true });
  const assetsDir = path.join(fixtureRoot, 'assets');
  for (const asset of state.assets as Array<Record<string, any>>) {
    const target = path.join(uploadsRoot, asset.storageKey);
    if (!target.startsWith(`${uploadsRoot}${path.sep}`)) throw new Error(`Unsafe fixture media key: ${asset.storageKey}`);
    if (asset.storageKey.endsWith('.png')) {
      const encoded = await fs.readFile(path.join(assetsDir, 'fixture-feedback.png.base64'), 'utf8');
      await fs.writeFile(target, Buffer.from(encoded.trim(), 'base64'));
    } else {
      await fs.copyFile(path.join(assetsDir, asset.storageKey), target);
    }
    asset.size = (await fs.stat(target)).size;
  }
}

function monthlyStatistics(state: Record<string, any>) {
  const userId = 'user_demo';
  const diaries = [...state.diaries].filter((item: any) => item.userId === userId && item.createdAt.startsWith(visualFixtureMonth))
    .sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt))
    .map((item: any) => ({ emotion: item.emotion, content: item.content, createdAt: item.createdAt, moodId: item.moodId }));
  const diaryMoodIds = new Set(diaries.map((item: any) => item.moodId).filter(Boolean));
  const unlinkedMoods = [...state.moods].filter((item: any) => item.userId === userId && item.status === 'active' && item.createdAt.startsWith(visualFixtureMonth) && !diaryMoodIds.has(item.id))
    .sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt))
    .map((item: any) => ({ emotion: item.emotion, content: item.content, createdAt: item.createdAt, moodId: item.id }));
  const records = [...diaries, ...unlinkedMoods];
  const distribution = records.reduce((all: Record<string, number>, item: any) => ({ ...all, [item.emotion]: (all[item.emotion] ?? 0) + 1 }), {});
  const byDay = new Map<number, any[]>();
  for (const record of records) {
    const day = Number(record.createdAt.slice(8, 10)) || 1;
    byDay.set(day, [...(byDay.get(day) ?? []), record]);
  }
  const score: Record<string, number> = { 恋爱: 4, 工作: 3, 焦虑: 2, 委屈: 2, 难过: 2, 孤独: 2, 失眠: 1, 生气: 1 };
  const dailyTrend = Array.from({ length: 31 }, (_, index) => {
    const day = index + 1;
    const items = byDay.get(day) ?? [];
    return items.length ? { day, count: items.length, score: Math.round((items.reduce((sum, item) => sum + (score[item.emotion] ?? 2), 0) / items.length) * 10) / 10 } : { day, count: 0, score: null };
  });
  const trend = Array.from({ length: 7 }, (_, index) => {
    const start = Math.floor((index * 31) / 7) + 1;
    const end = Math.floor(((index + 1) * 31) / 7);
    return dailyTrend.slice(start - 1, end).reduce((sum, point) => sum + point.count, 0);
  });
  const linkedMoodIds = new Set(records.map((item: any) => item.moodId).filter(Boolean));
  const postIds = state.posts.filter((post: any) => post.userId === userId && linkedMoodIds.has(post.moodId)).map((post: any) => post.id);
  const replyCount = state.replies.filter((reply: any) => postIds.includes(reply.postId) && reply.status === 'published').length;
  const keywords = ['工作', '汇报', '睡眠', '失眠', '关系', '委屈', '焦虑', '项目', '家人', '恋爱']
    .map((keyword) => ({ keyword, count: records.map((record: any) => record.content).join('\n').split(keyword).length - 1 }))
    .filter((item) => item.count > 0).sort((a, b) => b.count - a.count).slice(0, 5);
  const top = Object.entries(distribution).sort((a, b) => b[1] - a[1])[0];
  return { month: visualFixtureMonth, recordDays: byDay.size, totalRecords: records.length, topEmotion: top?.[0] ?? '暂无', topEmotionCount: top?.[1] ?? 0, replyCount, trend, dailyTrend, emotionDistribution: distribution, keywords: keywords.map((item) => item.keyword), keywordCounts: keywords };
}

async function main() {
  assertFixtureTarget();
  const manifest = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'manifest.json'), 'utf8')) as Record<string, any>;
  const seedSource = await fs.readFile(path.join(fixtureRoot, 'seed.ts'));
  const seedSha256 = crypto.createHash('sha256').update(seedSource).digest('hex');
  if (manifest.seedSha256 !== seedSha256) throw new Error('Fixture seed checksum does not match the versioned manifest.');
  const state = createVisualFixtureSeed();
  await copyFixtureMedia(state);
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    await saveRelationalRuntimeState(prisma, state);
    const stats = monthlyStatistics(state);
    const sourceSignature = crypto.createHash('sha256').update(JSON.stringify({ userId: 'user_demo', ...stats })).digest('hex').slice(0, 24);
    const report = await prisma.monthlyReport.upsert({
      where: { userId_month: { userId: 'user_demo', month: visualFixtureMonth } },
      create: { userId: 'user_demo', month: visualFixtureMonth, recordDays: stats.recordDays, topEmotion: stats.topEmotion, replyCount: stats.replyCount, trendJson: { values: stats.trend, daily: stats.dailyTrend }, distributionJson: stats.emotionDistribution, keywordsJson: { items: stats.keywords, sourceSignature, summaryJobId: 'vf_job_month_summary', summaryStatus: 'succeeded', topEmotionCount: stats.topEmotionCount, totalRecords: stats.totalRecords }, summary: state.aiJobs.find((job: any) => job.id === 'vf_job_month_summary')?.result ?? '' },
      update: { recordDays: stats.recordDays, topEmotion: stats.topEmotion, replyCount: stats.replyCount, trendJson: { values: stats.trend, daily: stats.dailyTrend }, distributionJson: stats.emotionDistribution, keywordsJson: { items: stats.keywords, sourceSignature, summaryJobId: 'vf_job_month_summary', summaryStatus: 'succeeded', topEmotionCount: stats.topEmotionCount, totalRecords: stats.totalRecords }, summary: state.aiJobs.find((job: any) => job.id === 'vf_job_month_summary')?.result ?? '' },
    });
    await prisma.reportAdvice.deleteMany({ where: { reportId: report.id } });
    await prisma.reportAdvice.create({ data: { reportId: report.id, content: '把注意力放在已经做到的部分，给下一周留出一点可调整的空间。' } });
    await prisma.runtimeState.update({ where: { id: 'default' }, data: { payload: { schemaVersion: 2, persistence: 'relational-primary', fixture: { id: manifest.id, version: manifest.version, runtimeInstanceId: manifest.runtimeInstanceId }, seededAt: '2026-07-01T00:00:00.000Z' } } });
    const [users, posts, diaries, jobs, tickets, mediaAssets, activeJobs] = await Promise.all([prisma.user.count(), prisma.post.count({ where: { reviewStatus: 'published' } }), prisma.diary.count(), prisma.aIJob.count({ where: { status: { in: ['succeeded', 'failed', 'fallback', 'cancelled'] } } }), prisma.feedbackTicket.count(), prisma.mediaAsset.count(), prisma.aIJob.count({ where: { status: { in: ['queued', 'running'] } } })]);
    const actual = { users, publicPosts: posts, privateDiaries: diaries, terminalAiJobs: jobs, feedbackTickets: tickets, mediaAssets, activeJobs };
    for (const [key, expected] of Object.entries(manifest.expected ?? {})) if (actual[key as keyof typeof actual] !== expected) throw new Error(`Fixture count mismatch for ${key}: ${actual[key as keyof typeof actual]} !== ${expected}`);
    if (activeJobs) throw new Error(`Fixture contains ${activeJobs} non-terminal AI jobs.`);
    const media = await Promise.all((state.assets as Array<any>).map(async (asset) => ({ id: asset.id, storageKey: asset.storageKey, bytes: (await fs.stat(path.join(uploadsRoot, asset.storageKey))).size, sha256: crypto.createHash('sha256').update(await fs.readFile(path.join(uploadsRoot, asset.storageKey))).digest('hex') })));
    await fs.mkdir(runtimeRoot, { recursive: true });
    await fs.writeFile(path.join(runtimeRoot, 'seed-evidence.json'), JSON.stringify({ fixture: manifest.id, version: manifest.version, database: databaseName, generatedAt: new Date().toISOString(), seedSha256, counts: actual, media }, null, 2));
    console.log(JSON.stringify({ fixture: manifest.id, counts: actual, sourceSignature }, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
