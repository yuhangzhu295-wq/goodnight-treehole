#!/usr/bin/env node
/* global process, console, fetch, setTimeout */
/**
 * Verifies BullMQ against the real Redis, including worker-restart durability.
 *
 * Two phases so the caller can restart the API between them:
 *
 *   node scripts/recovery/verify-bullmq.mjs create
 *     - enables allowFutureSelfNotifications
 *     - creates a future message whose deliverAt is ~20s away
 *     - proves the delayed job exists in Redis under bull:goodnight-follow-ups:delayed
 *     - writes artifacts/recovery/bullmq-job.json
 *
 *   <restart the API / worker here>
 *
 *   node scripts/recovery/verify-bullmq.mjs verify
 *     - waits for the due time
 *     - asserts the FollowUpJob reached 'delivered' in PostgreSQL
 *     - asserts a real UserNotification row was created
 *
 * Redis is inspected through redis-cli rather than ioredis so this script runs from
 * the repository root without depending on apps/api's module resolution.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const artifacts = path.join(repoRoot, 'artifacts', 'recovery');
fs.mkdirSync(artifacts, { recursive: true });
const stateFile = path.join(artifacts, 'bullmq-job.json');

const API = process.env.SMOKE_API_URL ?? 'http://127.0.0.1:3000';
const QUEUE = process.env.FOLLOW_UP_QUEUE_NAME ?? 'goodnight-follow-ups';
const REDIS_CLI = process.env.REDIS_CLI ?? 'C:\\Program Files\\Redis\\redis-cli.exe';
const REDIS_PORT = process.env.SMOKE_REDIS_PORT ?? '16379';
const PG_BIN = process.env.TEST_PG_BIN ?? 'C:\\Program Files\\PostgreSQL\\18\\bin';
const PG_PORT = process.env.TEST_PG_PORT ?? '15432';

const phase = process.argv[2];
const failures = [];

function record(name, ok, detail) {
  if (!ok) failures.push(`${name}: ${JSON.stringify(detail)}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` -> ${JSON.stringify(detail)}`}`);
}

function redis(...args) {
  const result = spawnSync(REDIS_CLI, ['-p', REDIS_PORT, ...args], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`redis-cli failed: ${result.stderr}`);
  // redis-cli on Windows terminates lines with CRLF; strip the CR so callers can
  // compare key names and set members directly.
  return result.stdout.replace(/\r/g, '').trim();
}

function redisLines(...args) {
  return redis(...args).split('\n').filter(Boolean);
}

function psql(sql) {
  const result = spawnSync(`${PG_BIN}\\psql.exe`, [
    '-h', '127.0.0.1', '-p', PG_PORT, '-U', 'goodnight', '-d', 'goodnight_treehole', '-tAc', sql,
  ], { encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env.TEST_PG_PASSWORD ?? 'goodnight' }, windowsHide: true });
  if (result.status !== 0) throw new Error(`psql failed: ${result.stderr}`);
  return result.stdout.trim();
}

if (phase === 'create') {
  const privacy = await fetch(`${API}/api/v1/me/privacy`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ allowFutureSelfNotifications: true }),
  });
  record('enable-future-self-notifications', privacy.ok, { status: privacy.status });

  // Long enough that the caller can restart the worker before the job comes due,
  // which is what makes the durability claim meaningful.
  const delayMs = Number(process.env.SMOKE_DELAY_MS ?? 60_000);
  const deliverAt = new Date(Date.now() + delayMs).toISOString();
  const created = await fetch(`${API}/api/v1/future-messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'RECOVERY-BULLMQ 请记得，你已经先停下来了一次。', deliverAt }),
  });
  const body = await created.json();
  record('create-future-message', created.status === 201, { status: created.status, body });
  if (created.status !== 201) process.exit(1);

  const followUpId = body.followUp.id;
  const queueName = body.queue?.queue ?? QUEUE;

  const redisPing = redis('ping');
  record('redis-reachable', redisPing === 'PONG', { redisPing });

  const delayed = redisLines('zrange', `bull:${queueName}:delayed`, '0', '-1');
  const jobKeys = redisLines('keys', `bull:${queueName}:*`);
  record('job-present-in-redis-delayed-set', delayed.includes(followUpId), { delayed, followUpId });
  record('job-hash-exists-in-redis', jobKeys.includes(`bull:${queueName}:${followUpId}`), { jobKeys });

  const hash = redis('hget', `bull:${queueName}:${followUpId}`, 'name');
  const delayValue = redis('hget', `bull:${queueName}:${followUpId}`, 'delay');

  fs.writeFileSync(stateFile, `${JSON.stringify({ followUpId, queueName, deliverAt, createdAt: new Date().toISOString(), hash, delayValue }, null, 2)}\n`);
  console.log(`\nrecorded: followUpId=${followUpId} deliverAt=${deliverAt} delay=${delayValue}ms`);
  console.log(failures.length === 0 ? '\n=== create PASS ===' : `\n=== create FAIL (${failures.length}) ===`);
  process.exit(failures.length === 0 ? 0 : 1);
}

if (phase === 'verify') {
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  // Poll from now, not from deliverAt: the restart in between can push the caller
  // past the due time, and a job that already delivered must still verify.
  const deadline = Date.now() + 60_000;

  const redisPing = redis('ping');
  record('redis-still-reachable-after-restart', redisPing === 'PONG', { redisPing });

  let jobRow = '';
  let notification = '';
  do {
    jobRow = psql(`select status from "FollowUpJob" where id = '${state.followUpId}';`);
    notification = psql(`select id || '|' || type || '|' || status from "UserNotification" where id = 'notification_${state.followUpId}';`);
    if (jobRow === 'delivered' && notification) break;
    await new Promise((r) => setTimeout(r, 2000));
  } while (Date.now() < deadline);

  record('follow-up-job-survived-restart-and-delivered', jobRow === 'delivered', { followUpId: state.followUpId, status: jobRow });
  record('real-notification-created', notification.startsWith(`notification_${state.followUpId}`), { notification });
  record('notification-is-future-self-type', notification.includes('|FUTURE_SELF|'), { notification });

  const stillQueued = redisLines('zrange', `bull:${state.queueName}:delayed`, '0', '-1');
  record('delayed-set-no-longer-holds-job', !stillQueued.includes(state.followUpId), { stillQueued });

  console.log(failures.length === 0 ? '\n=== verify PASS ===' : `\n=== verify FAIL (${failures.length}) ===`);
  process.exit(failures.length === 0 ? 0 : 1);
}

console.error('usage: verify-bullmq.mjs <create|verify>');
process.exit(2);
