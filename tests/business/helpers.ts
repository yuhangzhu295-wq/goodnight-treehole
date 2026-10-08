import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import path from 'node:path';

export function assertTestDatabaseUrl(rawUrl = process.env.DATABASE_URL): string {
  if (!rawUrl) {
    throw new Error(
      'DATABASE_URL is not set. Tests must be executed through the isolated test runner (e.g. pnpm test:business:isolated).',
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`DATABASE_URL is not a valid URL: ${rawUrl}`);
  }
  const dbName = parsed.pathname.replace(/^\//, '');
  if (!/^goodnight_treehole_test_[a-z0-9_]+$/.test(dbName)) {
    throw new Error(`Refusing non-lease test database: "${dbName}". Expected format: goodnight_treehole_test_<runId>.`);
  }
  if (dbName === 'goodnight_treehole' || dbName === 'goodnight_treehole_cleanroom') {
    throw new Error(`Refusing to run tests against development database: "${dbName}".`);
  }
  return rawUrl;
}

// Read and validate the runner-provided DATABASE_URL before any import
// of apps/api/src/prisma-runtime.service.ts captures the URL at module load.
const testDatabaseUrl = assertTestDatabaseUrl();
process.env.DATABASE_URL = testDatabaseUrl;

const workerId = process.env.VITEST_POOL_ID ?? '0';
if (!process.env.GOODNIGHT_STORE_FILE) {
  process.env.GOODNIGHT_STORE_FILE = path.resolve(
    'artifacts/runtime',
    `goodnight-store.business-spec-${process.pid}-${workerId}.json`,
  );
}
if (!process.env.FOLLOW_UP_QUEUE_NAME) {
  process.env.FOLLOW_UP_QUEUE_NAME = `goodnight-follow-ups-test-${process.pid}-${workerId}`;
}

export async function createApiTestApp(): Promise<INestApplication> {
  const { createServer } = await import('../../apps/api/src/main.js');
  const app = await createServer();
  await app.init();
  return app;
}

export function followUpTestConnection() {
  const value = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6380');
  return {
    host: value.hostname,
    port: Number(value.port || 6379),
    username: value.username || undefined,
    password: value.password || undefined,
    maxRetriesPerRequest: null,
  };
}

export async function loginAdmin(server: unknown) {
  const response = await request(server)
    .post('/api/admin/v1/login')
    .send({ username: 'admin', password: 'admin123' })
    .expect(201);
  return response.body.token as string;
}

export function auth(token: string) {
  return `Bearer ${token}`;
}

export const DEMO_USER_ID = 'user_demo';

export function demoUserHeaders() {
  return { 'x-goodnight-user-id': DEMO_USER_ID };
}

export async function waitForAiJob(server: unknown, jobId: string, timeoutMs = 120_000, userId = DEMO_USER_ID) {
  const deadline = Date.now() + timeoutMs;
  let response: request.Response | undefined;
  while (Date.now() < deadline) {
    let req = request(server).get(`/api/v1/ai/tasks/${jobId}`);
    if (userId) {
      req = req.set('x-goodnight-user-id', userId);
    }
    response = await req.expect(200);
    if (!['queued', 'running'].includes(response.body.status)) return response.body;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    `AI job ${jobId} did not reach a terminal state; last status: ${response?.body?.status ?? 'unknown'}`,
  );
}
