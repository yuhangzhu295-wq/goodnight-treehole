import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://goodnight@127.0.0.1:55432/goodnight_treehole?schema=public';
const apiBase = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api';
const apiHealthUrl = `${new URL(apiBase).origin}/api/health`;
const uploadsDirectory = path.resolve('data/uploads');
const manifestPath = path.resolve('artifacts/traces/final/cleanup-current-final-flow.json');
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

type PublicFlow = {
  marker: string;
  ok: boolean;
  post: { id: string; moodId: string };
  poeticAiJob: { id: string };
};

type PrivateFlow = {
  marker: string;
  ok: boolean;
  diary: { id: string; moodId: string; attachment: { id: string } };
};

type HumanFlow = {
  marker: string;
  ok: boolean;
  evidence: {
    publicPost: { id: string; moodId: string; jobIds: string[] };
    firstReply: { id: string };
    restoredReply: { id: string };
    mute: { recoveryPostId: string; recoveryMoodId: string };
    terminalJobs: Array<{ id: string }>;
  };
};

type FeedbackFlow = {
  marker: string;
  ok: boolean;
  ticket: { id: string; screenshots: Array<{ id: string }> };
};

type AiRoutingTrace = {
  runId: string;
  result: string;
  jobs: {
    primary: { job: { id: string } };
    backup: { job: { id: string } };
    template: { job: { id: string } };
  };
};

type MarkedId = { id: string; marker: string };

type CleanupPlan = {
  markers: string[];
  aiRunId: string;
  moods: MarkedId[];
  posts: MarkedId[];
  replies: MarkedId[];
  diaries: MarkedId[];
  tickets: MarkedId[];
  jobs: MarkedId[];
  mediaIds: string[];
  auditResourceIds: string[];
  signature: string;
};

type CleanupManifest = {
  signature?: string;
  plan?: CleanupPlan;
  phases?: Record<string, unknown>;
};

const phase = process.argv.find((arg) => arg.startsWith('--phase='))?.slice('--phase='.length);

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function required(value: string | undefined | null, label: string) {
  if (!value) throw new Error(`Missing required ${label}`);
  return value;
}

function uniqueMarked(values: MarkedId[]) {
  const byId = new Map<string, MarkedId>();
  for (const value of values) byId.set(value.id, value);
  return [...byId.values()];
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.resolve(file), 'utf8')) as T;
}

async function latestAiTrace() {
  const traceDir = path.resolve('artifacts/traces/final');
  const files = (await fs.readdir(traceDir)).filter((file) => /^final-ai-routing-.*\.json$/i.test(file));
  if (!files.length) throw new Error('No final AI routing trace is available for scoped cleanup');
  const entries = await Promise.all(files.map(async (file) => ({ file, stat: await fs.stat(path.join(traceDir, file)) })));
  entries.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return { file: path.join(traceDir, entries[0]!.file), trace: await readJson<AiRoutingTrace>(path.join(traceDir, entries[0]!.file)) };
}

async function crudAuditResourceIds() {
  const file = path.resolve('artifacts/test-report/final-live-admin-crud-report.md');
  const text = await fs.readFile(file, 'utf8');
  if (!/Run:\s+`TEST_FINAL_/i.test(text) || !/passed:\s*10;\s*failed:\s*0/i.test(text)) {
    throw new Error('Refusing to infer admin audit cleanup IDs from an invalid CRUD proof');
  }
  return unique([...text.matchAll(/\b(?:preset|faq)_\d+\b/g)].map((match) => match[0]!));
}

async function buildPlan(): Promise<CleanupPlan> {
  const [publicFlow, privateFlow, humanFlow, feedbackFlow, routing, crudResourceIds] = await Promise.all([
    readJson<PublicFlow>('artifacts/test-report/final-public-moderation-flow.json'),
    readJson<PrivateFlow>('artifacts/test-report/final-private-diary-flow.json'),
    readJson<HumanFlow>('artifacts/test-report/final-human-reply-mute-flow.json'),
    readJson<FeedbackFlow>('artifacts/test-report/final-feedback-upload-flow.json'),
    latestAiTrace(),
    crudAuditResourceIds(),
  ]);
  const expectedMarkers = [
    ['public', publicFlow.marker, 'TEST_FINAL_PUBLIC_MODERATION_'],
    ['private', privateFlow.marker, 'TEST_FINAL_PRIVATE_DIARY_'],
    ['human', humanFlow.marker, 'TEST_FINAL_HUMAN_REPLY_MUTE_'],
    ['feedback', feedbackFlow.marker, 'TEST_FINAL_FEEDBACK_UPLOAD_'],
  ] as const;
  for (const [label, marker, prefix] of expectedMarkers) {
    if (!marker?.startsWith(prefix)) throw new Error(`Refusing cleanup: ${label} report does not have its explicit marker`);
  }
  if (!publicFlow.ok || !privateFlow.ok || !humanFlow.ok || !feedbackFlow.ok || routing.trace.result !== 'PASS') {
    throw new Error('Refusing cleanup because one or more current final-flow reports did not pass');
  }
  const aiRunId = required(routing.trace.runId, 'AI routing run id');
  if (!aiRunId.startsWith('final-ai-routing-')) throw new Error('Refusing cleanup: latest AI trace is not a final routing proof');

  const moods = uniqueMarked([
    { id: required(publicFlow.post?.moodId, 'public mood id'), marker: publicFlow.marker },
    { id: required(privateFlow.diary?.moodId, 'private mood id'), marker: privateFlow.marker },
    { id: required(humanFlow.evidence?.publicPost?.moodId, 'human public mood id'), marker: humanFlow.marker },
    { id: required(humanFlow.evidence?.mute?.recoveryMoodId, 'human recovery mood id'), marker: humanFlow.marker },
  ]);
  const posts = uniqueMarked([
    { id: required(publicFlow.post?.id, 'public post id'), marker: publicFlow.marker },
    { id: required(humanFlow.evidence?.publicPost?.id, 'human public post id'), marker: humanFlow.marker },
    { id: required(humanFlow.evidence?.mute?.recoveryPostId, 'human recovery post id'), marker: humanFlow.marker },
  ]);
  const replies = uniqueMarked([
    { id: required(humanFlow.evidence?.firstReply?.id, 'first human reply id'), marker: humanFlow.marker },
    { id: required(humanFlow.evidence?.restoredReply?.id, 'restored human reply id'), marker: humanFlow.marker },
  ]);
  const diaries = uniqueMarked([{ id: required(privateFlow.diary?.id, 'private diary id'), marker: privateFlow.marker }]);
  const tickets = uniqueMarked([{ id: required(feedbackFlow.ticket?.id, 'feedback ticket id'), marker: feedbackFlow.marker }]);
  const jobs = uniqueMarked([
    { id: required(publicFlow.poeticAiJob?.id, 'public AI job id'), marker: publicFlow.marker },
    ...required(humanFlow.evidence?.publicPost?.jobIds?.[0], 'human public AI job id').split('|').map((id) => ({ id, marker: humanFlow.marker })),
    ...humanFlow.evidence.terminalJobs.map((item) => ({ id: required(item.id, 'human terminal AI job id'), marker: humanFlow.marker })),
    { id: required(routing.trace.jobs?.primary?.job?.id, 'primary routing job id'), marker: aiRunId },
    { id: required(routing.trace.jobs?.backup?.job?.id, 'backup routing job id'), marker: aiRunId },
    { id: required(routing.trace.jobs?.template?.job?.id, 'template routing job id'), marker: aiRunId },
  ]);
  const mediaIds = unique([
    required(privateFlow.diary?.attachment?.id, 'private diary media id'),
    ...feedbackFlow.ticket.screenshots.map((item) => required(item.id, 'feedback media id')),
  ]);
  const auditResourceIds = unique([...posts.map((item) => item.id), ...replies.map((item) => item.id), ...tickets.map((item) => item.id), ...crudResourceIds]);
  const withoutSignature = { markers: expectedMarkers.map(([, marker]) => marker), aiRunId, moods, posts, replies, diaries, tickets, jobs, mediaIds, auditResourceIds };
  return { ...withoutSignature, signature: createHash('sha256').update(JSON.stringify(withoutSignature)).digest('hex') };
}

async function apiIsHealthy() {
  try {
    const response = await fetch(apiHealthUrl, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function readManifest(): Promise<CleanupManifest> {
  try {
    return await readJson<CleanupManifest>(manifestPath);
  } catch {
    return {};
  }
}

async function writeManifest(plan: CleanupPlan, phaseName: string, payload: Record<string, unknown>) {
  const prior = await readManifest();
  const manifest: CleanupManifest = {
    ...prior,
    signature: plan.signature,
    plan,
    phases: { ...prior.phases, [phaseName]: { at: new Date().toISOString(), ...payload } },
  };
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

function assertExactRows<T extends { id: string; content: string; userId: string }>(label: string, expected: MarkedId[], rows: T[]) {
  if (rows.length !== expected.length) throw new Error(`Refusing cleanup: ${label} count changed (expected ${expected.length}, found ${rows.length})`);
  const byId = new Map(rows.map((item) => [item.id, item]));
  for (const target of expected) {
    const row = byId.get(target.id);
    if (!row || row.userId !== 'user_demo' || !row.content.includes(target.marker)) {
      throw new Error(`Refusing cleanup: ${label} ${target.id} is not this run's marked user_demo record`);
    }
  }
}

async function verifyOwnedRows(plan: CleanupPlan) {
  const [moods, posts, replies, diaries, tickets, jobs, media] = await Promise.all([
    prisma.mood.findMany({ where: { id: { in: plan.moods.map((item) => item.id) } }, select: { id: true, content: true, userId: true } }),
    prisma.post.findMany({ where: { id: { in: plan.posts.map((item) => item.id) } }, select: { id: true, content: true, userId: true } }),
    prisma.reply.findMany({ where: { id: { in: plan.replies.map((item) => item.id) } }, select: { id: true, content: true, userId: true } }),
    prisma.diary.findMany({ where: { id: { in: plan.diaries.map((item) => item.id) } }, select: { id: true, content: true, userId: true } }),
    prisma.feedbackTicket.findMany({ where: { id: { in: plan.tickets.map((item) => item.id) } }, select: { id: true, content: true, userId: true } }),
    prisma.aIJob.findMany({ where: { id: { in: plan.jobs.map((item) => item.id) } }, select: { id: true, contentId: true, promptSummary: true, userId: true, status: true } }),
    prisma.mediaAsset.findMany({ where: { id: { in: plan.mediaIds } }, include: { moodAttachments: true, diaryAttachments: true } }),
  ]);
  assertExactRows('moods', plan.moods, moods);
  assertExactRows('posts', plan.posts, posts);
  assertExactRows('replies', plan.replies, replies.map((item) => ({ ...item, userId: item.userId ?? 'user_demo' })));
  assertExactRows('diaries', plan.diaries, diaries);
  assertExactRows('tickets', plan.tickets, tickets);
  if (jobs.length !== plan.jobs.length || media.length !== plan.mediaIds.length) throw new Error('Refusing cleanup: a planned AI job or media asset is missing');
  const jobMarkers = new Map(plan.jobs.map((item) => [item.id, item.marker]));
  for (const job of jobs) {
    const marker = jobMarkers.get(job.id)!;
    const matches = marker === plan.aiRunId
      ? job.contentId.startsWith(plan.aiRunId) && job.promptSummary.startsWith('FINAL_ACCEPTANCE_')
      : job.promptSummary.includes(marker);
    if (job.userId !== 'user_demo' || !matches || ['queued', 'running'].includes(job.status)) {
      throw new Error(`Refusing cleanup: AI job ${job.id} is not a terminal record from this run`);
    }
  }
  for (const asset of media) {
    if (asset.userId !== 'user_demo' || asset.status !== 'ready') throw new Error(`Refusing cleanup: media ${asset.id} is not a ready asset owned by the test user`);
  }
}

async function cleanRelations(plan: CleanupPlan) {
  if (await apiIsHealthy()) throw new Error('Refusing relation cleanup while API is running; stop only this project API first to prevent stale-state writes');
  await verifyOwnedRows(plan);
  const postIds = plan.posts.map((item) => item.id);
  const replyIds = plan.replies.map((item) => item.id);
  const diaryIds = plan.diaries.map((item) => item.id);
  const moodIds = plan.moods.map((item) => item.id);
  const ticketIds = plan.tickets.map((item) => item.id);
  const jobIds = plan.jobs.map((item) => item.id);
  const result = await prisma.$transaction(async (tx) => {
    const deleted: Record<string, number> = {};
    deleted.hugActions = (await tx.hugAction.deleteMany({ where: { postId: { in: postIds } } })).count;
    deleted.favorites = (await tx.favorite.deleteMany({ where: { targetId: { in: unique([...postIds, ...replyIds, ...diaryIds]) } } })).count;
    deleted.auditLogs = (await tx.auditLog.deleteMany({ where: { resourceId: { in: plan.auditResourceIds } } })).count;
    deleted.moderationLogs = (await tx.moderationLog.deleteMany({ where: { targetId: { in: unique([...postIds, ...replyIds]) } } })).count;
    deleted.replies = (await tx.reply.deleteMany({ where: { postId: { in: postIds } } })).count;
    deleted.diaries = (await tx.diary.deleteMany({ where: { id: { in: diaryIds } } })).count;
    deleted.posts = (await tx.post.deleteMany({ where: { id: { in: postIds } } })).count;
    deleted.moods = (await tx.mood.deleteMany({ where: { id: { in: moodIds } } })).count;
    deleted.jobs = (await tx.aIJob.deleteMany({ where: { id: { in: jobIds } } })).count;
    deleted.tickets = (await tx.feedbackTicket.deleteMany({ where: { id: { in: ticketIds } } })).count;
    return deleted;
  });
  await writeManifest(plan, 'relations', { result, mediaPending: plan.mediaIds });
  return result;
}

async function ensureManifestMatches(plan: CleanupPlan) {
  const manifest = await readManifest();
  if (manifest.signature !== plan.signature || !manifest.phases?.relations) throw new Error('Refusing cleanup phase without the matching successful relation-cleanup manifest');
}

async function markMedia(plan: CleanupPlan) {
  if (!(await apiIsHealthy())) throw new Error('Refusing media cleanup while API is stopped; start this project API after relation cleanup first');
  await ensureManifestMatches(plan);
  const assets = await prisma.mediaAsset.findMany({ where: { id: { in: plan.mediaIds } }, include: { moodAttachments: true, diaryAttachments: true } });
  if (assets.length !== plan.mediaIds.length || assets.some((asset) => asset.status !== 'ready' || asset.moodAttachments.length || asset.diaryAttachments.length)) {
    throw new Error('Refusing media cleanup: expected this run\'s detached ready assets after API restart');
  }
  const deletions: Array<{ id: string; status: number }> = [];
  for (const id of plan.mediaIds) {
    const response = await fetch(`${apiBase}/v1/media/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(`Real media API deletion failed for ${id}: HTTP ${response.status}`);
    deletions.push({ id, status: response.status });
  }
  const marked = await prisma.mediaAsset.findMany({ where: { id: { in: plan.mediaIds } }, select: { id: true, status: true, storageKey: true } });
  if (marked.length !== plan.mediaIds.length || marked.some((asset) => asset.status !== 'deleted')) throw new Error('Media API did not persist deleted status for every planned asset');
  if ((await Promise.all(marked.map((asset) => fs.access(path.join(uploadsDirectory, asset.storageKey)).then(() => true).catch(() => false)))).some(Boolean)) {
    throw new Error('Media API reported success but a planned physical file remains');
  }
  await writeManifest(plan, 'mediaMarked', { deletions, assets: marked });
  return deletions;
}

async function purgeMedia(plan: CleanupPlan) {
  if (await apiIsHealthy()) throw new Error('Refusing media-row purge while API is running; stop only this project API to avoid re-persisting deleted tombstones');
  await ensureManifestMatches(plan);
  const assets = await prisma.mediaAsset.findMany({ where: { id: { in: plan.mediaIds } }, select: { id: true, status: true, storageKey: true } });
  if (assets.length !== plan.mediaIds.length || assets.some((asset) => asset.status !== 'deleted')) throw new Error('Refusing media-row purge: assets are not all API-deleted tombstones');
  if ((await Promise.all(assets.map((asset) => fs.access(path.join(uploadsDirectory, asset.storageKey)).then(() => true).catch(() => false)))).some(Boolean)) {
    throw new Error('Refusing media-row purge while a planned physical file still exists');
  }
  const deleted = await prisma.mediaAsset.deleteMany({ where: { id: { in: plan.mediaIds } } });
  if (deleted.count !== plan.mediaIds.length) throw new Error(`Expected ${plan.mediaIds.length} media rows to purge, deleted ${deleted.count}`);
  await writeManifest(plan, 'mediaPurged', { deleted: deleted.count, mediaIds: plan.mediaIds });
  return deleted.count;
}

async function verifyClean(plan: CleanupPlan) {
  if (!(await apiIsHealthy())) throw new Error('Refusing final cleanup verification while API is stopped; start this project API after the media-row purge');
  await ensureManifestMatches(plan);
  const [moods, posts, replies, diaries, tickets, jobs, media, audits, moderation] = await Promise.all([
    prisma.mood.count({ where: { id: { in: plan.moods.map((item) => item.id) } } }),
    prisma.post.count({ where: { id: { in: plan.posts.map((item) => item.id) } } }),
    prisma.reply.count({ where: { postId: { in: plan.posts.map((item) => item.id) } } }),
    prisma.diary.count({ where: { id: { in: plan.diaries.map((item) => item.id) } } }),
    prisma.feedbackTicket.count({ where: { id: { in: plan.tickets.map((item) => item.id) } } }),
    prisma.aIJob.count({ where: { id: { in: plan.jobs.map((item) => item.id) } } }),
    prisma.mediaAsset.count({ where: { id: { in: plan.mediaIds } } }),
    prisma.auditLog.count({ where: { resourceId: { in: plan.auditResourceIds } } }),
    prisma.moderationLog.count({ where: { targetId: { in: unique([...plan.posts.map((item) => item.id), ...plan.replies.map((item) => item.id)]) } } }),
  ]);
  const result = { moods, posts, replies, diaries, tickets, jobs, media, audits, moderation };
  if (Object.values(result).some((count) => count !== 0)) throw new Error(`Scoped final-flow cleanup verification failed: ${JSON.stringify(result)}`);
  await writeManifest(plan, 'verified', { result, ok: true });
  return result;
}

async function main() {
  if (!['dry-run', 'relations', 'media-mark', 'media-purge', 'verify'].includes(phase ?? '')) {
    throw new Error('Use --phase=dry-run|relations|media-mark|media-purge|verify');
  }
  const plan = await buildPlan();
  if (phase === 'dry-run') {
    await verifyOwnedRows(plan);
    console.log(JSON.stringify({ phase, plan }, null, 2));
    return;
  }
  const result = phase === 'relations'
    ? await cleanRelations(plan)
    : phase === 'media-mark'
      ? await markMedia(plan)
      : phase === 'media-purge'
        ? await purgeMedia(plan)
        : await verifyClean(plan);
  console.log(JSON.stringify({ phase, result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
