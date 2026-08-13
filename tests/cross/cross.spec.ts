import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { resetTestDatabase } from '../../scripts/test-database.js';
import { DAPI_PROVIDER_ID } from '../../apps/api/src/remote-ai-provider.service.js';

process.env.DATABASE_URL = resetTestDatabase(`goodnight_treehole_test_cross_${process.pid}_${process.env.VITEST_POOL_ID ?? '0'}`);
process.env.DAPI_BASE_URL ??= 'https://api.deepseek.com';
process.env.DAPI_MODEL ??= 'deepseek-chat';

describe('cross terminal acceptance loops', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    if (!process.env.DAPI_API_KEY && !process.env.AI_PRIMARY_API_KEY && !process.env.DEEPSEEK_API_KEY) {
      throw new Error('A supplied DAPI key is required for cross-end AI acceptance.');
    }
    const { createServer } = await import('../../apps/api/src/main.js');
    app = await createServer();
    await app.init();
    const login = await request(app.getHttpServer()).post('/api/admin/v1/login').send({ username: 'admin', password: 'admin123' }).expect(201);
    token = login.body.token;
  });

  afterAll(async () => { await app?.close(); });

  async function waitForJob(server: any, jobId: string) {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const response = await request(server).get(`/api/admin/v1/ai/jobs/${jobId}`).set('Authorization', `Bearer ${token}`).expect(200);
      if (!['queued', 'running'].includes(response.body.item.status)) return response.body.item;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`AI job ${jobId} did not reach a terminal state`);
  }

  it('uses the supplied remote DAPI and persists the completed AiJob', async () => {
    const server = app.getHttpServer();
    const regeneration = await request(server).post('/api/v1/letters/letter_today/regenerate').send({ style: 'warm' }).expect(201);
    const completedJob = await waitForJob(server, regeneration.body.jobId);

    expect(completedJob).toMatchObject({ status: 'succeeded', providerId: DAPI_PROVIDER_ID, fallbackUsed: false });
    expect(completedJob.modelName).toMatch(/deepseek/i);
    expect(completedJob.result.length).toBeGreaterThan(10);
    expect(completedJob.traceJson).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: 'provider-attempt', providerId: DAPI_PROVIDER_ID, role: 'primary', status: 'succeeded' }),
      expect.objectContaining({ event: 'terminal', providerId: DAPI_PROVIDER_ID, status: 'succeeded' }),
    ]));

    const refreshed = await request(server).get(`/api/admin/v1/ai/jobs/${completedJob.id}`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(refreshed.body.item).toMatchObject({ id: completedJob.id, status: 'succeeded', providerId: DAPI_PROVIDER_ID });

    const restoredForFront = await request(server).get('/api/v1/ai/tasks/latest?taskType=today_letter').expect(200);
    expect(restoredForFront.body.item).toMatchObject({
      id: completedJob.id,
      status: 'succeeded',
      providerId: DAPI_PROVIDER_ID,
      result: completedJob.result,
    });
  }, 120_000);

  it('makes feedback and reply preset admin changes visible to front APIs', async () => {
    const server = app.getHttpServer();
    const feedbackText = `跨端反馈-${Date.now()}`;
    const presetText = `新的快捷回复-${Date.now()}`;

    await request(server).post('/api/v1/feedback').send({ categoryId: 'cat_1', content: feedbackText, sourcePage: '/pages/feedback/index', assetIds: [] }).expect(201);
    await request(server).get('/api/admin/v1/feedback/tickets').set('Authorization', `Bearer ${token}`).expect((response) => expect(response.body.items.some((ticket: any) => ticket.content === feedbackText)).toBe(true));
    await request(server).post('/api/admin/v1/reply-presets').set('Authorization', `Bearer ${token}`).send({ text: presetText, scene: 'comfort' }).expect(201);
    await request(server).get('/api/v1/reply-presets').expect((response) => expect(response.body.items.some((preset: any) => preset.text === presetText)).toBe(true));
  });

  it('rejects local-model activation and keeps every route on DAPI', async () => {
    const server = app.getHttpServer();
    await request(server).put('/api/admin/v1/system/settings').set('Authorization', `Bearer ${token}`).send({ localModelFirst: true }).expect(400);
    await request(server).post('/api/admin/v1/ai/ollama/sync-models').set('Authorization', `Bearer ${token}`).expect(400);
    await request(server).get('/api/admin/v1/ai/routes?page=1&pageSize=100').expect((response) => {
      expect(response.body.items.every((route: any) => route.primaryProviderId === DAPI_PROVIDER_ID)).toBe(true);
    });
    await request(server).get('/api/admin/v1/config').expect((response) => expect(response.body.item.localModelFirst).toBe(false));
  });
});
