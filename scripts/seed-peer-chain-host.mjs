// Build a complete, real peer conversation for one account, entirely from the host.
//
// The device-side seeds kept failing because the emulator's foreground is contested and the CDP
// connection drops mid-run. Nothing here needs the app: it writes through the public API with two
// real anonymous sessions, so the rows are exactly what the product would have written, and the
// walkthrough account ends up owning a live conversation to be reviewed against.
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const WEB = 'http://127.0.0.1:3000';
const env = readFileSync('.env', 'utf8');
const url = env.match(/^DATABASE_URL="?([^"\n]+)"?$/m)[1];
const prisma = new PrismaClient({ datasources: { db: { url } } });

const H = (c) => ({ 'content-type': 'application/json', 'x-goodnight-user-id': c });
const post = async (c, p, b) => {
  const r = await fetch(WEB + p, { method: 'POST', headers: H(c), body: JSON.stringify(b ?? {}) });
  const t = await r.text();
  return { status: r.status, body: (() => { try { return JSON.parse(t); } catch { return t.slice(0, 200); } })() };
};
const patch = async (c, p, b) => {
  const r = await fetch(WEB + p, { method: 'PATCH', headers: H(c), body: JSON.stringify(b ?? {}) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const get = async (c, p) => {
  const r = await fetch(WEB + p, { headers: H(c) });
  return { status: r.status, body: await r.json().catch(() => null) };
};

/** A real session credential for a user id, creating the user row if needed. */
async function session(userId) {
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, openid: `openid_${userId}`, anonymousCode: `anon_${userId}`, nickname: `测试_${userId}` },
    update: {},
  });
  const secret = crypto.randomBytes(32).toString('base64url');
  const row = await prisma.anonymousSession.create({
    data: { userId, secretHash: crypto.createHash('sha256').update(secret).digest('hex'), expiresAt: new Date(Date.now() + 86400000) },
  });
  return `${row.id}.${secret}`;
}

const anon = async () => {
  const r = await fetch(WEB + '/api/v1/auth/anonymous', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const b = await r.json();
  return b?.item?.credential ?? null;
};

const log = [];
const requester = await session('user_anon_4c115912');   // the walkthrough account
const peer = await anon();
if (!peer) throw new Error('could not mint a peer credential');
log.push(`requester + peer credentials: ${Boolean(requester)} ${Boolean(peer)}`);

// The requester needs a journey and peer matching enabled.
const journey = await post(requester, '/api/v1/journeys', {
  title: '想找人聊聊', content: '想把作息调回来，需要有人陪我走过前三周', domain: '生活',
});
const journeyId = journey.body?.journey?.id ?? journey.body?.item?.id;
log.push(`journey ${journey.status} ${journeyId}`);
if (!journeyId) { console.log(log.join('\n')); process.exit(1); }

await patch(requester, '/api/v1/settings/privacy', { allowPeerMatching: true, allowAnonymousExperienceShare: true });

// A suggestion excludes experiences this user is already paired with, so an account that has been
// through the flow before gets an empty list. Reuse its existing match in that case.
const suggest = await post(requester, `/api/v1/journeys/${journeyId}/peer-matches`, {});
let match = (suggest.body?.items ?? [])[0];
if (!match) {
  const prior = await get(requester, '/api/v1/peer-requests?scope=sent');
  match = (prior.body?.items ?? []).find((m) => m.status === 'connected') ?? (prior.body?.items ?? [])[0];
  log.push(`no new suggestion; reusing existing match ${match?.id} (${match?.status})`);
} else {
  log.push(`suggest ${suggest.status} matches=1`);
}
if (!match) { console.log(log.join('\n')); process.exit(1); }

// request -> accept -> both consents -> conversation activates.
await post(requester, `/api/v1/peer-matches/${match.id}`, {
  status: 'requested',
  requestReason: '看到你也走过这一段，想问问后来是怎么熬过去的。',
  requestQuestion: '最难的那个早晨你怎么处理的？',
});
const accept = await post(peer, `/api/v1/peer-matches/${match.id}/respond`, { status: 'connected' });
log.push(`accept ${accept.status}`);
const c1 = await post(requester, `/api/v1/peer-matches/${match.id}/consent`, {});
const c2 = await post(peer, `/api/v1/peer-matches/${match.id}/consent`, {});
log.push(`consents ${c1.status}/${c2.status} activated=${Boolean(c2.body?.conversation)}`);

const msg = await post(requester, `/api/v1/peer-conversations/${match.id}/messages`, { content: '谢谢你愿意接住我这句话。' });
log.push(`message ${msg.status}`);
const convos = await get(requester, '/api/v1/peer-conversations');
log.push(`conversations for the requester: ${(convos.body?.items ?? []).length}`);
log.push(`matchId: ${match.id}`);
console.log(log.join('\n'));
await prisma.$disconnect();
