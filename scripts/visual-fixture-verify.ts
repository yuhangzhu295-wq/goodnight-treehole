import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const root = process.cwd();
const fixtureRoot = path.join(root, 'fixtures', 'visual', 'v1');
const runtimeRoot = path.join(root, 'artifacts', 'visual-fixtures', 'v1', 'runtime');
const uploadsRoot = path.join(runtimeRoot, 'uploads');
const liveUploadsRoot = path.join(root, 'data', 'uploads');

function assertFixtureTarget() {
  if (process.env.VISUAL_FIXTURE_MODE !== '1' || process.env.VISUAL_FIXTURE_VERSION !== 'v1') throw new Error('Fixture verification requires visual-fixture v1 mode.');
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== '55433' || url.pathname !== '/goodnight_treehole_visual_v1' || url.searchParams.get('schema') !== 'public') throw new Error('Fixture verification refused a non-fixture database target.');
  if (path.resolve(process.env.GOODNIGHT_UPLOADS_DIR ?? '') !== uploadsRoot || uploadsRoot === liveUploadsRoot) throw new Error('Fixture verification refused a non-fixture uploads target.');
}

async function treeDigest(directory: string) {
  const entries: Array<{ path: string; bytes: number; sha256: string }> = [];
  async function visit(current: string) {
    const children = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const child of children) {
      const full = path.join(current, child.name);
      if (child.isDirectory()) await visit(full);
      else if (child.isFile()) {
        const content = await fs.readFile(full);
        entries.push({ path: path.relative(directory, full).replace(/\\/g, '/'), bytes: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex') });
      }
    }
  }
  await visit(directory);
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return { entries, sha256: crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex') };
}

async function main() {
  assertFixtureTarget();
  const manifest = JSON.parse(await fs.readFile(path.join(fixtureRoot, 'manifest.json'), 'utf8')) as Record<string, any>;
  const seedSha256 = crypto.createHash('sha256').update(await fs.readFile(path.join(fixtureRoot, 'seed.ts'))).digest('hex');
  if (manifest.seedSha256 !== seedSha256) throw new Error('Fixture seed checksum does not match the versioned manifest.');
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    const [users, posts, diaries, jobs, tickets, mediaAssets, activeJobs, marker] = await Promise.all([
      prisma.user.count(), prisma.post.count({ where: { reviewStatus: 'published' } }), prisma.diary.count(), prisma.aIJob.count({ where: { status: { in: ['succeeded', 'failed', 'fallback', 'cancelled'] } } }), prisma.feedbackTicket.count(), prisma.mediaAsset.count(), prisma.aIJob.count({ where: { status: { in: ['queued', 'running'] } } }), prisma.runtimeState.findUnique({ where: { id: 'default' } }),
    ]);
    const counts = { users, publicPosts: posts, privateDiaries: diaries, terminalAiJobs: jobs, feedbackTickets: tickets, mediaAssets, activeJobs };
    for (const [key, expected] of Object.entries(manifest.expected ?? {})) if (counts[key as keyof typeof counts] !== expected) throw new Error(`Fixture count mismatch for ${key}: ${counts[key as keyof typeof counts]} !== ${expected}`);
    if (activeJobs) throw new Error(`Fixture contains ${activeJobs} queued/running AI jobs.`);
    const fixtureMarker = (marker?.payload as any)?.fixture;
    if (!fixtureMarker || fixtureMarker.id !== manifest.id || fixtureMarker.version !== manifest.version || fixtureMarker.runtimeInstanceId !== manifest.runtimeInstanceId) throw new Error('Fixture RuntimeState marker is missing or does not match the manifest.');
    const ids = [manifest.reference.front.postId, manifest.reference.front.emotionAnalysisJobId, manifest.reference.admin.userId, manifest.reference.admin.replyId, manifest.reference.admin.jobId, manifest.reference.admin.ticketId];
    const [post, job, user, reply, ticket] = await Promise.all([
      prisma.post.findUnique({ where: { id: ids[0] } }), prisma.aIJob.findUnique({ where: { id: ids[1] } }), prisma.user.findUnique({ where: { id: ids[2] } }), prisma.reply.findUnique({ where: { id: ids[3] } }), prisma.feedbackTicket.findUnique({ where: { id: ids[5] } }),
    ]);
    if (!post || !job || !user || !reply || !ticket) throw new Error('One or more manifest reference records are absent.');
    const fixtureMedia = await treeDigest(uploadsRoot);
    const liveControl = await treeDigest(liveUploadsRoot);
    const baselineFile = path.join(runtimeRoot, 'live-uploads-baseline.json');
    const baseline = JSON.parse(await fs.readFile(baselineFile, 'utf8')) as { sha256?: string };
    if (baseline.sha256 !== liveControl.sha256) throw new Error('Live uploads digest changed while the fixture was active.');
    await fs.mkdir(runtimeRoot, { recursive: true });
    await fs.writeFile(path.join(runtimeRoot, 'verification-evidence.json'), JSON.stringify({ fixture: manifest.id, version: manifest.version, seedSha256, generatedAt: new Date().toISOString(), counts, runtimeMarker: fixtureMarker, references: { post: post.id, emotionAnalysisJob: job.id, user: user.id, reply: reply.id, ticket: ticket.id }, fixtureMedia, liveUploadsControl: liveControl, liveDatabaseMutations: 'not attempted' }, null, 2));
    console.log(JSON.stringify({ fixture: manifest.id, counts, fixtureMediaSha256: fixtureMedia.sha256, liveUploadsControlSha256: liveControl.sha256 }, null, 2));
  } finally { await prisma.$disconnect(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
