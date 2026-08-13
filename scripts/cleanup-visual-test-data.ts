import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://goodnight@127.0.0.1:55432/goodnight_treehole?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const marker = /^(Business |E2E_|PUBLIC_|PRIVATE_|HUMAN_REPLY_|DECOMPOSE_|FEEDBACK_|RELATION_|FINAL_|TEST_|FLOW_AI_|route_test_|admin sync |public business |private mood |\u524d\u540e\u53f0\u95ed\u73af|\u8de8\u7aef|\u771f\u5b9e\u6d4f\u89c8\u5668|\u7b2c\u4e00\u8f6e\u771f\u5b9e|\u8de8\u9875\u9762\u4e1a\u52a1\u6d41|\u8fd9\u91cc\u662f\u771f\u5b9e\u53cd\u9988|\u7aef\u5230\u7aef\u6d4b\u8bd5)|\u89c6\u89c9\u9a8c\u6536\u62c6\u89e3/i;
const hasMarker = (value: string | null | undefined) => Boolean(value && (marker.test(value) || /\u7aef\u5230\u7aef\u6d4b\u8bd5/i.test(value)));
const isFinalAcceptanceAiProof = (value: string | null | undefined) => Boolean(value && /^(?:final-ai-routing-|FINAL_ACCEPTANCE_)/i.test(value));

async function main() {
  const [moods, posts, replies, diaries, letters, tickets, jobs] = await Promise.all([
    prisma.mood.findMany({ select: { id: true, content: true } }),
    prisma.post.findMany({ select: { id: true, moodId: true, content: true } }),
    prisma.reply.findMany({ select: { id: true, postId: true, aiJobId: true, content: true } }),
    prisma.diary.findMany({ select: { id: true, moodId: true, letterId: true, content: true, source: true } }),
    prisma.letter.findMany({ select: { id: true, sourceMoodId: true, title: true, content: true } }),
    prisma.feedbackTicket.findMany({ select: { id: true, content: true, reply: true } }),
    prisma.aIJob.findMany({ select: { id: true, contentId: true, promptSummary: true } }),
  ]);
  const targetPosts = new Set(posts.filter((item) => hasMarker(item.content)).map((item) => item.id));
  const targetMoodIds = new Set(moods.filter((item) => hasMarker(item.content)).map((item) => item.id));
  for (const post of posts) if (targetMoodIds.has(post.moodId)) targetPosts.add(post.id);
  const targetLetters = new Set(letters.filter((item) => hasMarker(item.title) || hasMarker(item.content) || (item.sourceMoodId ? targetMoodIds.has(item.sourceMoodId) : false)).map((item) => item.id));
  const targetDiaries = new Set(diaries.filter((item) => hasMarker(item.content) || hasMarker(item.source) || (item.moodId ? targetMoodIds.has(item.moodId) : false) || (item.letterId ? targetLetters.has(item.letterId) : false)).map((item) => item.id));
  const targetReplies = replies.filter((item) => hasMarker(item.content) || targetPosts.has(item.postId));
  const targetJobs = jobs.filter((item) => isFinalAcceptanceAiProof(item.contentId) || isFinalAcceptanceAiProof(item.promptSummary) || hasMarker(item.contentId) || hasMarker(item.promptSummary) || targetMoodIds.has(item.contentId) || targetPosts.has(item.contentId) || targetDiaries.has(item.contentId) || targetLetters.has(item.contentId));
  const targetTickets = tickets.filter((item) => hasMarker(item.content) || hasMarker(item.reply));

  const postIds = [...targetPosts]; const moodIds = [...targetMoodIds]; const diaryIds = [...targetDiaries]; const letterIds = [...targetLetters];
  const result: Record<string, number> = {};
  await prisma.$transaction(async (tx) => {
    if (postIds.length) {
      result.hugActions = (await tx.hugAction.deleteMany({ where: { postId: { in: postIds } } })).count;
      result.favorites = (await tx.favorite.deleteMany({ where: { targetType: 'post', targetId: { in: postIds } } })).count;
    }
    result.replies = targetReplies.length ? (await tx.reply.deleteMany({ where: { id: { in: targetReplies.map((item) => item.id) } } })).count : 0;
    result.diaries = diaryIds.length ? (await tx.diary.deleteMany({ where: { id: { in: diaryIds } } })).count : 0;
    result.letters = letterIds.length ? (await tx.letter.deleteMany({ where: { id: { in: letterIds } } })).count : 0;
    result.posts = postIds.length ? (await tx.post.deleteMany({ where: { id: { in: postIds } } })).count : 0;
    result.moods = moodIds.length ? (await tx.mood.deleteMany({ where: { id: { in: moodIds } } })).count : 0;
    result.jobs = targetJobs.length ? (await tx.aIJob.deleteMany({ where: { id: { in: targetJobs.map((item) => item.id) } } })).count : 0;
    result.tickets = targetTickets.length ? (await tx.feedbackTicket.deleteMany({ where: { id: { in: targetTickets.map((item) => item.id) } } })).count : 0;
  });
  await fs.mkdir(path.resolve('artifacts/traces/final'), { recursive: true });
  await fs.writeFile(path.resolve('artifacts/traces/final/cleanup-visual-test-data.json'), JSON.stringify({ generatedAt: new Date().toISOString(), candidates: { posts: postIds.length, moods: moodIds.length, replies: targetReplies.length, diaries: diaryIds.length, letters: letterIds.length, jobs: targetJobs.length, tickets: targetTickets.length }, deleted: result }, null, 2), 'utf8');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
