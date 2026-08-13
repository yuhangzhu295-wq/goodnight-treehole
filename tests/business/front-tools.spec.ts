import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp, waitForAiJob } from './helpers';

describe('front tool interactions', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApiTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('runs decompose and generic tools, then saves a real diary record', async () => {
    const server = app.getHttpServer();
    const decompose = await request(server).post('/api/v1/tools/decompose').send({ content: 'tool decompose input' }).expect(201);
    expect(decompose.body.taskId).toBeTruthy();
    const decomposeResult = await waitForAiJob(server, decompose.body.taskId);
    expect(decomposeResult.status).toBe('succeeded');
    expect(decomposeResult.result).toBeTruthy();
    expect(decomposeResult.job.providerId).toBe('provider_dapi_deepseek');

    const run = await request(server).post('/api/v1/tools/run').send({ type: 'work-support', input: 'tool run input' }).expect(201);
    const runResult = await waitForAiJob(server, run.body.taskId);
    expect(runResult.status).toBe('succeeded');
    expect(runResult.result).toBeTruthy();

    const diary = await request(server)
      .post('/api/v1/diaries')
      .send({ content: runResult.result, emotion: 'work', source: 'tool-run', toolResult: runResult })
      .expect(201);

    await request(server).get('/api/v1/diaries').expect((response) => {
      expect(response.body.items.some((item: any) => item.id === diary.body.item.id && item.source === 'tool-run')).toBe(true);
    });
  }, 120_000);
});
