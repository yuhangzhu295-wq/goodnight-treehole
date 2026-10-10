import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import http from 'node:http';
import https from 'node:https';

// Node 20 keeps client connections alive by default. Supertest starts and stops an ephemeral server
// per request when the app is not already listening, so a pooled socket can be reused against a
// server that a spec has deliberately closed (third-stage-persistence-independent restarts the API).
// The result is `read ECONNRESET` with nothing logged by the app, because the request never reaches a
// handler. Pooling is mutated rather than replaced so the existing agent object keeps its identity.
http.globalAgent.keepAlive = false;
https.globalAgent.keepAlive = false;

import path from 'node:path';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hashSessionSecret } from '../../apps/api/src/anonymous-session.service.js';

let identityClient: PrismaClient | null = null;
function identityPrisma(): PrismaClient {
  if (!identityClient) {
    identityClient = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  }
  return identityClient;
}

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
// A dedicated secret for C-end identity credentials. Kept separate from JWT_SECRET because one spec
// deliberately unsets JWT_SECRET to prove the admin token refuses a missing secret, and that must not
// also break every C-end request in the same process.
if (!process.env.CEND_TOKEN_SECRET) {
  process.env.CEND_TOKEN_SECRET = `test-cend-identity-${process.pid}`;
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

/**
 * Issues a real session credential for a user, exactly as the server would.
 *
 * This is a database write, so it is async. A credential cannot be minted for a user that does not
 * exist, so the fixture ensures the user row first: having a session implies being a user, which is
 * also true in production. Credentials are cached per user so a spec that acts as the same user many
 * times does not create a session per request.
 */
const identityCache = new Map<string, Promise<string>>();

export function identityFor(userId: string): Promise<string> {
  const cached = identityCache.get(userId);
  if (cached) return cached;
  const created = issueIdentityFor(userId);
  identityCache.set(userId, created);
  return created;
}

async function issueIdentityFor(userId: string): Promise<string> {
  const prisma = identityPrisma();
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, openid: `openid_${userId}`, anonymousCode: `anon_${userId}`, nickname: `测试_${userId}` },
    update: {},
  });
  const secret = crypto.randomBytes(32).toString('base64url');
  const session = await prisma.anonymousSession.create({
    data: {
      userId,
      secretHash: hashSessionSecret(secret),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  return `${session.id}.${secret}`;
}

export async function demoUserHeaders() {
  return { 'x-goodnight-user-id': await identityFor(DEMO_USER_ID) };
}

export async function waitForAiJob(server: unknown, jobId: string, timeoutMs = 120_000, userId = DEMO_USER_ID) {
  const deadline = Date.now() + timeoutMs;
  let response: request.Response | undefined;
  while (Date.now() < deadline) {
    let req = request(server).get(`/api/v1/ai/tasks/${jobId}`);
    if (userId) {
      req = req.set('x-goodnight-user-id', await identityFor(userId));
    }
    response = await req.expect(200);
    if (!['queued', 'running'].includes(response.body.status)) return response.body;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(
    `AI job ${jobId} did not reach a terminal state; last status: ${response?.body?.status ?? 'unknown'}`,
  );
}
