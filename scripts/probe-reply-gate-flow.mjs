/**
 * Reproduces the reply-gate flow against a running API and prints each step's status, so a 404 can
 * be attributed to a step instead of guessed at.
 *
 * Usage: node scripts/probe-reply-gate-flow.mjs
 */
import { PrismaClient } from '@prisma/client';

const base = process.env.API_BASE ?? 'http://127.0.0.1:3000';

async function call(method, path, body, cred) {
  const headers = { 'content-type': 'application/json' };
  if (cred) headers['x-goodnight-user-id'] = cred;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json };
}

async function issue(path) {
  const res = await call('POST', path, {});
  return { userId: res.json?.item?.userId, credential: res.json?.item?.credential };
}

const demo = await issue('/api/v1/auth/demo');
const guest = await issue('/api/v1/auth/anonymous');
console.log('demo =', demo.userId, ' guest =', guest.userId);

const admin = await call('POST', '/api/admin/v1/auth/login', { username: 'admin', password: 'admin123' });
const adminToken = admin.json?.token;
console.log('admin login ->', admin.status);

const marker = `reply-gate-probe-${Date.now()}`;
const created = await call('POST', '/api/v1/moods', { content: marker, emotion: 'work', visibility: 'PUBLIC' }, demo.credential);
console.log('1. create public mood ->', created.status, ' postId:', created.json?.post?.id);
const postId = created.json?.post?.id;
if (!postId) {
  console.log('   body:', JSON.stringify(created.json).slice(0, 300));
  process.exit(1);
}

const approved = await call('PATCH', `/api/admin/v1/posts/${postId}/moderation`, { action: 'approve' }, undefined);
// the moderation route needs the bearer token, not a user credential
const approved2 = await fetch(`${base}/api/admin/v1/posts/${postId}/moderation`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` },
  body: JSON.stringify({ action: 'approve' }),
});
console.log('2. approve ->', approved.status, '/', approved2.status);

const prisma = new PrismaClient();
await prisma.privacySetting.upsert({
  where: { userId: demo.userId },
  create: { userId: demo.userId, allowHumanReplies: true },
  update: { allowHumanReplies: true },
});

const reply1 = await call('POST', `/api/v1/posts/${postId}/replies`, { content: '探针回复 1' }, guest.credential);
console.log('3. reply with consent on ->', reply1.status, JSON.stringify(reply1.json).slice(0, 160));

await prisma.privacySetting.update({ where: { userId: demo.userId }, data: { allowHumanReplies: false } });
const reply2 = await call('POST', `/api/v1/posts/${postId}/replies`, { content: '探针回复 2' }, guest.credential);
console.log('4. reply after revoke   ->', reply2.status, JSON.stringify(reply2.json).slice(0, 160));

await prisma.privacySetting.update({ where: { userId: demo.userId }, data: { allowHumanReplies: true } });
const reply3 = await call('POST', `/api/v1/posts/${postId}/replies`, { content: '探针回复 3' }, guest.credential);
console.log('5. reply after restore  ->', reply3.status, JSON.stringify(reply3.json).slice(0, 160));

const rows = await prisma.post.findMany({ where: { moodId: { not: null }, content: marker }, select: { id: true, moodId: true, content: true } });
console.log('posts with this content in postgres:', JSON.stringify(rows));

await prisma.reply.deleteMany({ where: { postId } });
await prisma.post.deleteMany({ where: { id: postId } });
await prisma.diary.deleteMany({ where: { content: marker } });
await prisma.mood.deleteMany({ where: { content: marker } });
console.log('cleaned up');
await prisma.$disconnect();
