// Peer pages, with real data on both sides of the conversation.
//
// The accepting side has to own a *published* experience - a new one stays `pending_review` until an
// admin approves it, and this script does not fake that approval. `user_demo` owns three of them, so
// the demo user is the receiving side. A second anonymous account plays the requester, because a user
// is never matched against their own experience (the candidate query excludes them) - so a single
// account cannot fill both halves.
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const WEB = 'http://127.0.0.1:3000';
const env = readFileSync('C:/Users/zyu33/Projects/goodnight-treehole/.env', 'utf8');
const url = env.match(/^DATABASE_URL="?([^"\n]+)"?$/m)?.[1];
const prisma = new PrismaClient({ datasources: { db: { url } } });

const json = (t) => { try { return JSON.parse(t); } catch { return t.slice(0, 300); } };
const H = (c) => ({ 'content-type': 'application/json', 'x-goodnight-user-id': c });
const post = (c, p, b) => fetch(WEB + p, { method: 'POST', headers: H(c), body: JSON.stringify(b || {}) }).then(async (r) => ({ status: r.status, body: json(await r.text()) }));
const patch = (c, p, b) => fetch(WEB + p, { method: 'PATCH', headers: H(c), body: JSON.stringify(b || {}) }).then(async (r) => ({ status: r.status, body: json(await r.text()) }));
const get = (c, p) => fetch(WEB + p, { headers: H(c) }).then(async (r) => ({ status: r.status, body: json(await r.text()) }));

// Mint a credential for the app's own account, so the pages have data for the credential the capture
// uses. The receiving side is `user_demo`, which owns the published experiences.
const APP_USER = 'user_anon_4c115912';
const DEMO = 'user_demo';
const mintCredential = async (userId) => {
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, openid: `openid_${userId}`, anonymousCode: `anon_${userId}`, nickname: `测试_${userId}` },
    update: {},
  });
  const s = crypto.randomBytes(32).toString('base64url');
  const session = await prisma.anonymousSession.create({
    data: { userId, secretHash: createHash('sha256').update(s).digest('hex'), expiresAt: new Date(Date.now() + 30 * 86400_000) },
  });
  return `${session.id}.${s}`;
};
const requesterCredential = await mintCredential(APP_USER);
const demoCredential = await mintCredential(DEMO);
console.log('requester (app account) + demo credentials minted');

// The published experiences the requester can match against come from the network view. Its own
// peer-matching switch has to be on first, or the view returns empty by design.
await patch(requesterCredential, '/api/v1/settings/privacy', { allowPeerMatching: true, allowAnonymousExperienceShare: true });
const published = (await get(requesterCredential, '/api/v1/peers')).body?.item?.experiences ?? [];
console.log('published for the requester:', published.length, published.map((e) => e.id));
if (!published.length) {
  console.log('NO PUBLISHED EXPERIENCE TO MATCH AGAINST');
  process.exit(1);
}
const targetExp = published[0];

// A journey of our own to hang the match on.
const created = await post(requesterCredential, '/api/v1/journeys', {
  title: '想把作息调回来',
  content: '最近总在凌晨才睡，想先固定起床时间',
  domain: targetExp.domain ?? '生活',
});
const journeyId = created.body?.journey?.id ?? created.body?.item?.id;
await patch(requesterCredential, '/api/v1/settings/privacy', { allowPeerMatching: true, allowAnonymousExperienceShare: true });

const suggest = await post(requesterCredential, `/api/v1/journeys/${journeyId}/peer-matches`, {});
const matches = suggest.body?.items ?? suggest.body?.matches ?? [];
// Suggest is empty when every published experience already has a match for this user (the query
// excludes experiences the user has already been paired with). A fresh journey is not enough, so
// reuse the existing request if there is one.
const target = matches.find((m) => m.peerExperienceId === targetExp.id) ?? matches[0];
const existing = target
  ? { id: target.id, status: target.status }
  : ((await get(requesterCredential, '/api/v1/peer-requests?scope=sent')).body?.items ?? [])[0];
console.log('suggest:', suggest.status, 'matches:', matches.length, 'reusing:', existing?.id, existing?.status);
if (!existing?.id) {
  console.log('NO MATCH TO USE');
  process.exit(1);
}
const matchId = existing.id;

const requested = await patch(requesterCredential, `/api/v1/peer-matches/${matchId}`, {
  status: 'requested',
  requestReason: '看到你也走过这一段，想问问后来是怎么熬过去的。',
  requestQuestion: '最难的那个早晨你是怎么处理的？',
});
console.log('requested:', requested.status, requested.body?.item?.status ?? requested.body);

// The receiving side (the demo account, which owns the published experience) reads its inbox, then
// accepts, which opens the conversation.
const inbox = await get(demoCredential, '/api/v1/peer-requests');
console.log('demo inbox:', inbox.status, (inbox.body?.items ?? []).map((m) => `${m.id}:${m.status}`));
const accepted = await post(demoCredential, `/api/v1/peer-matches/${matchId}/respond`, { status: 'connected' });
console.log('accept:', accepted.status, accepted.body?.item?.status ?? accepted.body);
const consented = await post(demoCredential, `/api/v1/peer-matches/${matchId}/consent`, {});
console.log('demo consent:', consented.status, JSON.stringify(consented.body).slice(0, 240));
// Consent is bilateral: the first one is recorded and the conversation stays pending until the other
// side also consents, at which point it activates.
const requesterConsent = await post(requesterCredential, `/api/v1/peer-matches/${matchId}/consent`, {});
console.log('requester consent:', requesterConsent.status, JSON.stringify(requesterConsent.body).slice(0, 240));
const convos = await get(requesterCredential, '/api/v1/peer-conversations');
console.log('requester conversations:', convos.status, (convos.body?.items ?? []).length, JSON.stringify(convos.body).slice(0, 400));

// A message, so the conversation page has a real exchange. The list is newest-first and holds closed
// history too, so this picks the active conversation rather than whichever row happens to be first.
const live = (convos.body?.items ?? []).find((c) => c.status === 'active') ?? (convos.body?.items ?? [])[0];
if (live) {
  const matchId = live.matchId ?? live.id;
  const sent = await post(requesterCredential, `/api/v1/peer-conversations/${matchId}/messages`, { content: '谢谢你愿意接住我这句话。' });
  console.log('message:', sent.status, JSON.stringify(sent.body).slice(0, 240));
}
await prisma.$disconnect();
process.exit(0);
