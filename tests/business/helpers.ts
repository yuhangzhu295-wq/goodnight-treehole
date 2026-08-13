import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { resetTestDatabase } from '../../scripts/test-database.js';

const workerId = process.env.VITEST_POOL_ID ?? '0';
const storeFile = path.resolve('artifacts/runtime', `goodnight-store.business-spec-${process.pid}-${workerId}.json`);
fs.mkdirSync(path.dirname(storeFile), { recursive: true });
fs.rmSync(storeFile, { force: true });
process.env.GOODNIGHT_STORE_FILE = storeFile;
process.env.DATABASE_URL = resetTestDatabase(
  `goodnight_treehole_test_business_${process.pid}_${workerId}`,
);

export async function createApiTestApp(): Promise<INestApplication> {
  const { createServer } = await import('../../apps/api/src/main.js');
  const app = await createServer();
  await app.init();
  return app;
}

export async function loginAdmin(server: unknown) {
  const response = await request(server).post('/api/admin/v1/login').send({ username: 'admin', password: 'admin123' }).expect(201);
  return response.body.token as string;
}

export function auth(token: string) {
  return `Bearer ${token}`;
}

export async function waitForAiJob(server: unknown, jobId: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let response: request.Response | undefined;
  while (Date.now() < deadline) {
    response = await request(server).get(`/api/v1/ai/tasks/${jobId}`).expect(200);
    if (!['queued', 'running'].includes(response.body.status)) return response.body;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`AI job ${jobId} did not reach a terminal state; last status: ${response?.body?.status ?? 'unknown'}`);
}
