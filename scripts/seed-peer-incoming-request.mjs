// Fill the app identity's 同行请求 inbox with real requests, so its accept/decline controls exist.
//
// Two things have to be true before that page has anything to click: the app's own account must own a
// *published* peer experience, and somebody else must have asked for it. Neither is faked here - the
// experience is published through the product's own admin review endpoint, and every request walks
// suggestion -> request -> (respond) exactly as the UI does. The only rows written directly are the
// user and session rows that mint a credential for a second anonymous account.
//
// Target state, re-established on every run:
//   * 4 requests in 待回应                  - the suite accepts one, declines one, and still needs a
//                                            row left over to prove the list reloaded rather than
//                                            blanked
//   * at least one request in 已结束          - a declined request, so that tab has a record
//   * at least one request in 已接受          - so the consent action exists
//   * at least one `suggested` match          - 匿名经历's 请求匿名交流 needs one
//
// It prints the route for that last one as PEER_DETAIL_ROUTE, because the page is keyed by
// experience id + match id and neither is knowable in advance.
//
// Usage: node scripts/seed-peer-incoming-request.mjs [--want 3]
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import crypto, { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { repoFile } from './repo-root.mjs';

const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3000/api/v1';
const ADMIN_BASE = process.env.ADMIN_BASE ?? 'http://127.0.0.1:3000/api/admin/v1';

/**
 * Which account the app is actually running as.
 *
 * This used to be a hardcoded id, and a reinstall gives the app a new anonymous identity: the seed
 * then filled a different account's inbox, the page rendered its empty state, and the control suite
 * reported five missing controls. Reading the id off the device is what keeps the fixture pointed at
 * the account the page will ask as.
 */
async function deviceUserId() {
  const { withSession } = await import('./device-session.mjs');
  let found = '';
  await withSession(async ({ call, ev }) => {
    await call('Runtime.enable');
    const raw = await ev(
      `(async function(){
        try {
          var P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences;
          if (!P) return '';
          var u = await P.get({ key: 'goodnight-identity-user-id' });
          return u.value || '';
        } catch (e) { return ''; }
      })()`,
      true,
    );
    found = String(raw ?? '');
  });
  return found;
}

const APP_USER = process.env.APP_USER || (await deviceUserId());
if (!APP_USER) {
  console.error('could not read the app identity from the device; pass APP_USER=<user id>');
  process.exit(2);
}

const wantArg = process.argv.indexOf('--want');
// Four, not three: the control suite accepts one and declines one, and the runner retries a failed
// suite once. Three left the retry with a single pending row, so its decline case found nothing and the
// second attempt failed on the fixture rather than on the page.
const WANT_PENDING = wantArg > -1 ? Number(process.argv[wantArg + 1]) : 4;
if (!Number.isInteger(WANT_PENDING) || WANT_PENDING < 1) {
  console.error('--want must be a positive integer');
  process.exit(1);
}

const env = readFileSync(repoFile('.env'), 'utf8');
const url = env.match(/^DATABASE_URL="?([^"\n]+)"?$/m)?.[1];
if (!url) throw new Error('DATABASE_URL not found in .env');
const prisma = new PrismaClient({ datasources: { db: { url } } });

async function call(method, path, { credential, body, admin, adminRoute } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (credential) headers['x-goodnight-user-id'] = credential;
  if (admin) headers.authorization = admin;
  const res = await fetch(`${adminRoute ? ADMIN_BASE : BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${typeof json === 'string' ? json.slice(0, 200) : JSON.stringify(json).slice(0, 200)}`);
  }
  return json;
}

const log = (...args) => console.log(...args);

/** A real session credential for a known user id, creating the user row if it is missing. */
async function mintCredential(userId) {
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, openid: `openid_${userId}`, anonymousCode: `anon_${userId}`, nickname: `测试_${userId}` },
    update: {},
  });
  const secret = crypto.randomBytes(32).toString('base64url');
  const session = await prisma.anonymousSession.create({
    data: { userId, secretHash: createHash('sha256').update(secret).digest('hex'), expiresAt: new Date(Date.now() + 30 * 86400_000) },
  });
  return `${session.id}.${secret}`;
}

const owner = await mintCredential(APP_USER);
log(`owner ${APP_USER} credential minted`);

// Both switches matter: sharing is required to publish an experience, matching is required before
// any suggestion (and therefore any request) can be made.
await call('PATCH', '/settings/privacy', {
  credential: owner,
  body: { allowPeerMatching: true, allowAnonymousExperienceShare: true },
});

// ---- publishing an experience, the way the moderation console does it --------------------------
let adminTokenCache = '';
async function adminToken() {
  if (adminTokenCache) return adminTokenCache;
  const login = await call('POST', '/auth/login', {
    adminRoute: true,
    body: { username: process.env.ADMIN_USERNAME ?? 'admin', password: process.env.ADMIN_PASSWORD ?? 'admin123' },
  });
  adminTokenCache = login.token ?? login.accessToken ?? login.item?.token;
  if (!adminTokenCache) throw new Error(`admin login returned no token: ${JSON.stringify(login).slice(0, 200)}`);
  return adminTokenCache;
}

/** Creates an experience through the API, then publishes it through the real admin review route. */
async function publishExperience(credential, fields) {
  const created = await call('POST', '/peer-experiences', { credential, body: { ...fields, consented: true } });
  const id = created.item?.id ?? created.id;
  const reviewed = await call('PATCH', `/peer-experiences/${id}/review`, {
    adminRoute: true,
    admin: await adminToken(),
    body: { status: 'published' },
  });
  if (reviewed.item?.status !== 'published') throw new Error(`experience ${id} did not reach published`);
  log(`  published experience ${id}`);
  return id;
}

// ---- the experience other people ask about ------------------------------------------------------
let experience = await prisma.peerExperience.findFirst({
  where: { userId: APP_USER, status: 'published' },
  orderBy: { createdAt: 'desc' },
});
if (experience) {
  log(`owner already has a published experience ${experience.id}`);
} else {
  const journeys = (await call('GET', '/journeys', { credential: owner })).items ?? [];
  const journeyId = journeys[0]?.id
    ?? (await call('POST', '/journeys', {
      credential: owner,
      body: {
        title: '把作息一点点调回来',
        domain: '生活',
        content: '想先把起床时间固定下来，再谈别的。',
        feelings: ['疲惫'],
        needs: ['被听见'],
      },
    })).journey?.id;
  if (!journeyId) throw new Error('could not create a journey for the owner');

  const experienceId = await publishExperience(owner, {
    journeyId,
    title: '我把起床时间先固定了下来',
    domain: '生活',
    stage: '进行中',
    content: '先不谈早睡，只把起床时间固定在同一刻。两周之后，晚上反而自己困了。',
    tags: ['固定起床时间'],
  });
  experience = await prisma.peerExperience.findUnique({ where: { id: experienceId } });
  if (!experience || experience.status !== 'published') throw new Error('experience did not reach published');
}

// ---- helpers that create one real request -------------------------------------------------------
/** A fresh anonymous account, a journey, and a request aimed at the owner's experience. */
async function requestAsStranger(reason, question) {
  const stranger = (await call('POST', '/auth/anonymous', { body: { deviceLabel: 'peer-inbox-seed' } })).item;
  if (!stranger?.credential) throw new Error('anonymous sign-in returned no credential');
  await call('PATCH', '/settings/privacy', {
    credential: stranger.credential,
    body: { allowPeerMatching: true, allowAnonymousExperienceShare: true },
  });
  const journey = await call('POST', '/journeys', {
    credential: stranger.credential,
    body: {
      title: '想找一个走过类似一段路的人',
      domain: experience.domain,
      content: '想听听走过这一段的人后来是怎么过的。',
      feelings: ['不安'],
      needs: ['被理解'],
    },
  });
  const journeyId = journey.journey?.id;
  if (!journeyId) throw new Error('stranger could not create a journey');
  const suggestion = await call('POST', `/journeys/${journeyId}/peer-matches`, { credential: stranger.credential, body: {} });
  const match = (suggestion.items ?? []).find((item) => item.peerExperienceId === experience.id);
  if (!match) {
    throw new Error(`owner's experience was not suggested to the stranger: ${JSON.stringify(suggestion).slice(0, 300)}`);
  }
  await call('PATCH', `/peer-matches/${match.id}`, {
    credential: stranger.credential,
    body: { status: 'requested', requestReason: reason, requestQuestion: question },
  });
  return { matchId: match.id, strangerUserId: stranger.userId };
}

const inbox = async () => (await call('GET', '/peer-requests', { credential: owner })).items ?? [];
const countOf = (items, status) => items.filter((item) => item.status === status).length;

// ---- top up the pending inbox -------------------------------------------------------------------
let items = await inbox();
log(`inbox now: ${items.length} total (${countOf(items, 'requested')} 待回应 / ${countOf(items, 'connected')} 已接受 / ${countOf(items, 'declined')} 已拒绝)`);

const reasons = [
  '看到你写的这一段，想问问你是怎么开始的。',
  '我也在调作息，想听听你后来有没有反复。',
  '想找一个人聊聊这段路上最难的那几天。',
  '你写的这句我读了两遍，想多问一句。',
];
const questions = [
  '你是怎么让自己第二天还愿意继续的？',
  '最难的那个早晨你是怎么处理的？',
  '中间有没有想过放弃，后来怎么留下的？',
  '如果只能留下一个做法，你会选哪个？',
];

let created = 0;
while (countOf(await inbox(), 'requested') < WANT_PENDING) {
  const index = created % reasons.length;
  const { matchId } = await requestAsStranger(reasons[index], questions[index]);
  created += 1;
  log(`  + pending request ${matchId}`);
  if (created > 8) throw new Error('could not reach the wanted pending count');
}

// ---- keep one answered request so 已结束 is not permanently empty --------------------------------
items = await inbox();
if (!countOf(items, 'declined')) {
  const { matchId } = await requestAsStranger('想问问你后来是怎么熬过去的。', '你后来还失眠吗？');
  // The owner answers it through the same endpoint the page's decline button calls.
  await call('POST', `/peer-matches/${matchId}/respond`, { credential: owner, body: { status: 'declined' } });
  log(`  + declined request ${matchId} (so 已结束 has a record)`);
}

// ---- and one accepted one, so 已接受 has a row and its consent action exists ---------------------
items = await inbox();
if (!countOf(items, 'connected')) {
  const { matchId } = await requestAsStranger('看到你也走过这一段，想继续聊几句。', '那时候你是怎么让自己放松下来的？');
  await call('POST', `/peer-matches/${matchId}/respond`, { credential: owner, body: { status: 'connected' } });
  log(`  + accepted request ${matchId} (so 已接受 has a row)`);
}

// ---- a suggested (not yet requested) match, so 匿名经历 has a request action --------------------
// The page's 请求匿名交流 button only exists when the route carries a matchId, and a match only has
// that button while it is still `suggested`. Suggest excludes experiences this account already
// matched, so a walkthrough account that has been through the flow needs a fresh experience to be
// suggested - one published by another account, through the same review route as everything else.
const suggestedMatch = async () =>
  prisma.peerMatch.findFirst({ where: { userId: APP_USER, status: 'suggested' }, orderBy: { createdAt: 'desc' } });

async function ownerJourneyId() {
  const journeys = (await call('GET', '/journeys', { credential: owner })).items ?? [];
  if (journeys[0]?.id) return journeys[0].id;
  const created = await call('POST', '/journeys', {
    credential: owner,
    body: { title: '想找一个人聊聊这段路', domain: '生活', content: '想听听走过的人怎么说。', feelings: ['不安'], needs: ['被理解'] },
  });
  const id = created.journey?.id;
  if (!id) throw new Error('could not create a journey for the owner');
  return id;
}

let detailMatch = await suggestedMatch();
if (!detailMatch) {
  const journeyId = await ownerJourneyId();
  await call('POST', `/journeys/${journeyId}/peer-matches`, { credential: owner, body: {} });
  detailMatch = await suggestedMatch();
}
if (!detailMatch) {
  // Every published experience is already matched to this account; publish one more from a stranger
  // so there is something new to be suggested.
  const stranger = (await call('POST', '/auth/anonymous', { body: { deviceLabel: 'peer-suggestion-seed' } })).item;
  await call('PATCH', '/settings/privacy', {
    credential: stranger.credential,
    body: { allowPeerMatching: true, allowAnonymousExperienceShare: true },
  });
  const sJourney = await call('POST', '/journeys', {
    credential: stranger.credential,
    body: { title: '我把夜里想说的话留到白天', domain: '生活', content: '先写下来，第二天再决定说不说。', feelings: ['犹豫'], needs: ['被听见'] },
  });
  await publishExperience(stranger.credential, {
    journeyId: sJourney.journey?.id,
    title: '我把夜里想说的话留到白天',
    domain: '生活',
    stage: '进行中',
    content: '夜里想到的话先写下来，白天再看一遍，很多就不必说了。',
    tags: ['先写下来'],
  });
  await call('POST', `/journeys/${await ownerJourneyId()}/peer-matches`, { credential: owner, body: {} });
  detailMatch = await suggestedMatch();
}
if (!detailMatch) throw new Error('no suggested match could be produced for the owner');

// ---- report ------------------------------------------------------------------------------------
items = await inbox();
const pending = items.filter((item) => item.status === 'requested');
const declined = items.filter((item) => item.status === 'declined');
const accepted = items.filter((item) => item.status === 'connected');
log(`\ninbox: ${items.length} total / ${pending.length} 待回应 / ${accepted.length} 已接受 / ${declined.length} 已结束`);
log(`experience: ${experience.id}`);
for (const item of pending) log(`  pending  ${item.id}`);
for (const item of accepted) log(`  accepted ${item.id}`);
for (const item of declined) log(`  declined ${item.id}`);
log(`  suggested ${detailMatch.id} on ${detailMatch.peerExperienceId}`);
const detailRoute = `/pages/peer/detail?id=${detailMatch.peerExperienceId}&matchId=${detailMatch.id}`;
const consentRoute = accepted[0] ? `/pages/peer/consent?matchId=${accepted[0].id}` : '';
log(`\nPEER_DETAIL_ROUTE=${detailRoute}`);
log(`PEER_CONSENT_ROUTE=${consentRoute}`);

// Written down because these ids are generated per run: a suite that hardcoded one would be testing
// a record from a previous fixture. `run-control-suites.mjs` reads this file.
const fixtureDir = repoFile('artifacts/ui-v2/fixtures');
mkdirSync(fixtureDir, { recursive: true });
writeFileSync(
  `${fixtureDir}/peer-fixtures.json`,
  `${JSON.stringify(
    {
      ownerUserId: APP_USER,
      pending: pending.map((item) => item.id),
      accepted: accepted.map((item) => item.id),
      declined: declined.map((item) => item.id),
      detailRoute,
      consentRoute,
    },
    null,
    2,
  )}\n`,
);
log(`fixtures: ${fixtureDir}/peer-fixtures.json`);

await prisma.$disconnect();
if (pending.length < WANT_PENDING || declined.length < 1 || accepted.length < 1) {
  console.error('seed did not reach the target state');
  process.exit(1);
}
