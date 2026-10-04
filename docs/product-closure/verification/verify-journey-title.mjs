/* global console, fetch, process, setTimeout */
// The rule: an AI result may refine a journey title the product generated, never one the user
// wrote. Both paths that apply an AI title are covered here, because the first fix guarded only
// the creation flow and left re-analysis overwriting the user's name.
import { PrismaClient } from '@prisma/client';

const API = 'http://127.0.0.1:3000';
const out = [];
const record = (name, pass, detail) => out.push(`${pass ? 'PASS' : 'FAIL'} ${name} :: ${detail}`);
const j = async (path, init) => {
  const res = await fetch(API + path, init);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
};
const JSONH = { 'content-type': 'application/json' };
const as = (user) => ({ ...JSONH, 'x-goodnight-user-id': user });
const stamp = Date.now();
const USER = 'user_demo';
const USER_TITLE = `我的名字-${stamp}`;

async function settle(jobId, user) {
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 600));
    const t = await j(`/api/v1/ai/tasks/${jobId}`, { headers: { 'x-goodnight-user-id': user } });
    if (!['queued', 'running'].includes(t.body.status)) return t.body.status;
  }
  return 'timeout';
}

const prisma = new PrismaClient();
try {
  // ---- 1. a journey the user named keeps that name through the creation job ----
  const named = await j('/api/v1/journeys', {
    method: 'POST', headers: as(USER),
    body: JSON.stringify({ title: USER_TITLE, domain: '关系', content: `标题规则验证 ${stamp} 我最近有点难受`, visibility: 'PRIVATE' }),
  });
  const namedId = named.body.journey?.id;
  record('a journey with a user title is created', named.status === 201 && Boolean(namedId), `status=${named.status} title=${named.body.journey?.title}`);
  record('the created journey carries the user title', named.body.journey?.title === USER_TITLE, `title=${named.body.journey?.title}`);

  const creationJob = await prisma.aIJob.findFirst({ where: { contentId: namedId }, orderBy: { createdAt: 'desc' } });
  if (creationJob) {
    const status = await settle(creationJob.id, USER);
    const after = await j(`/api/v1/journeys/${namedId}`, { headers: as(USER) });
    const title = after.body.item?.journey?.title;
    record(`the creation job completed (${status})`, ['succeeded', 'fallback'].includes(status), `status=${status}`);
    record('the async creation result did not rename the user journey', title === USER_TITLE, `title=${title}`);
  } else {
    record('the creation job completed', false, 'no AI job found for the journey');
  }

  // ---- 2. re-analysis must not rename it either (the path the first fix missed) ----
  const reanalyze = await j(`/api/v1/journeys/${namedId}/situation/reanalyze`, { method: 'POST', headers: as(USER), body: JSON.stringify({}) });
  record('re-analysis can be requested', reanalyze.status === 201 && Boolean(reanalyze.body.job?.id), `status=${reanalyze.status}`);
  const reStatus = await settle(reanalyze.body.job?.id, USER);
  record(`the re-analysis job completed (${reStatus})`, ['succeeded', 'fallback'].includes(reStatus), `status=${reStatus}`);
  const afterReanalyze = await j(`/api/v1/journeys/${namedId}`, { headers: as(USER) });
  const titleAfter = afterReanalyze.body.item?.journey?.title;
  record('re-analysis did not rename the user journey', titleAfter === USER_TITLE, `title=${titleAfter}`);
  const dbNamed = await prisma.lifeJourney.findUnique({ where: { id: namedId } });
  record('the user title is persisted unchanged', dbNamed?.title === USER_TITLE, `db title=${dbNamed?.title}`);

  // ---- 3. a journey the user did not name may still be named by the product ----
  const unnamed = await j('/api/v1/journeys', {
    method: 'POST', headers: as(USER),
    body: JSON.stringify({ domain: '工作', content: `标题规则验证 ${stamp} 明天要汇报，我有点紧张`, visibility: 'PRIVATE' }),
  });
  const unnamedId = unnamed.body.journey?.id;
  record('a journey without a user title falls back to the placeholder',
    unnamed.body.journey?.title === '正在整理的一件事', `title=${unnamed.body.journey?.title}`);
  const unnamedJob = await prisma.aIJob.findFirst({ where: { contentId: unnamedId }, orderBy: { createdAt: 'desc' } });
  let unnamedTitle = unnamed.body.journey?.title;
  if (unnamedJob) {
    await settle(unnamedJob.id, USER);
    const after = await j(`/api/v1/journeys/${unnamedId}`, { headers: as(USER) });
    unnamedTitle = after.body.item?.journey?.title;
    record('the product may still name a journey the user left unnamed',
      unnamedTitle !== '正在整理的一件事' && /里正在整理的一件事$/.test(String(unnamedTitle)),
      `title=${unnamedTitle}`);
  }

  // ---- 4. a journey the product named may be refined by a later AI result ----
  // Uses the title just observed rather than re-reading the database: the async completion flushes
  // its own write, so an immediate read can precede the commit.
  if (/里正在整理的一件事$/.test(String(unnamedTitle))) {
    const again = await j(`/api/v1/journeys/${unnamedId}/situation/reanalyze`, { method: 'POST', headers: as(USER), body: JSON.stringify({}) });
    await settle(again.body.job?.id, USER);
    const after = await j(`/api/v1/journeys/${unnamedId}`, { headers: as(USER) });
    record('a product-generated title may still be refined',
      /里正在整理的一件事$/.test(String(after.body.item?.journey?.title)),
      `title=${after.body.item?.journey?.title}`);
  } else {
    record('a product-generated title may still be refined', false, `no generated title to refine (${unnamedTitle})`);
  }
} finally {
  await prisma.$disconnect();
}

const failed = out.filter((line) => line.startsWith('FAIL'));
console.log(out.join('\n'));
console.log(`\n${out.length - failed.length}/${out.length} pass`);
process.exitCode = failed.length ? 1 : 0;
