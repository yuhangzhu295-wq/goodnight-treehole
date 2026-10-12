import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { auth, createApiTestApp, loginAdmin, waitForAiJob, dapiConfigured } from './helpers';

describe('front public publish business flow', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApiTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // Approval and visibility do not depend on the AI reply, so this half always runs.
  it('keeps a public post out of the feed until an admin approves it', async () => {
    const server = app.getHttpServer();
    const content = `public business post ${Date.now()}`;
    const created = await request(server)
      .post('/api/v1/posts')
      .send({ content, mood: 'work', visibility: 'PUBLIC', style: 'warm' })
      .expect(201);

    expect(created.body.post.content).toBe(content);
    expect(created.body.job.status).toMatch(/queued|running/);

    await request(server).get('/api/v1/posts?mood=work').expect((response) => {
      expect(response.body.items.some((item: any) => item.id === created.body.post.id)).toBe(false);
    });

    const token = await loginAdmin(server);
    await request(server).patch(`/api/admin/v1/posts/${created.body.post.id}/approve`).set('Authorization', auth(token)).expect(200);

    await request(server).get('/api/v1/posts?mood=work').expect((response) => {
      expect(response.body.items.some((item: any) => item.id === created.body.post.id)).toBe(true);
    });
  }, 120_000);

  // The AI reply itself needs DAPI credentials; without them the job stops at 'fallback', which is
  // NOT_RUN_NO_SECRET. Reported as skipped rather than asserted into a pass.
  it.skipIf(!dapiConfigured)('queues a real AI reply for the public post', async () => {
    const server = app.getHttpServer();
    const created = await request(server)
      .post('/api/v1/posts')
      .send({ content: `public ai post ${Date.now()}`, mood: 'work', visibility: 'PUBLIC', style: 'warm' })
      .expect(201);

    const completed = await waitForAiJob(server, created.body.job.id);
    expect(completed.status).toBe('succeeded');
    expect(completed.result).toBeTruthy();
    expect(completed.job.providerId).toBe('provider_dapi_deepseek');
    expect(completed.job.modelName).toBeTruthy();
  }, 120_000);
});
