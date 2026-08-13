import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp, waitForAiJob } from './helpers';
import { StoreService, type AIJob } from '../../apps/api/src/store.service';

describe('front private publish business flow', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApiTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps a private mood out of the square and persists its asynchronous private letter', async () => {
    const server = app.getHttpServer();
    const content = `private mood ${Date.now()}`;
    const store = app.get(StoreService);
    const jobsBefore = store.aiJobs.length;
    const created = await request(server)
      .post('/api/v1/moods')
      .send({ content, emotion: 'anxious', visibility: 'PRIVATE', replyStyle: 'poetic' })
      .expect(201);

    expect(created.body.post).toBeUndefined();
    expect(created.body.letter.id).toBeTruthy();
    expect(created.body.job.id).toBeTruthy();
    expect(created.body.jobs).toHaveLength(1);
    expect(created.body.diary.id).toBeTruthy();
    expect(created.body.diary.hasLetter).toBe(false);
    expect(created.body.next).toBe('/pages/diary/index');
    expect(store.aiJobs).toHaveLength(jobsBefore + 1);

    const completed = await waitForAiJob(server, created.body.job.id);
    expect(completed.status).toBe('succeeded');
    expect(completed.job.providerId).toBe('provider_dapi_deepseek');

    await request(server).get('/api/v1/posts').expect((response) => {
      expect(response.body.items.some((item: any) => item.content === content)).toBe(false);
    });
    let linkedDiary = false;
    for (let attempt = 0; attempt < 20 && !linkedDiary; attempt += 1) {
      const diaries = await request(server).get('/api/v1/diaries').expect(200);
      linkedDiary = diaries.body.items.some((item: any) => item.id === created.body.diary.id && item.hasLetter);
      if (!linkedDiary) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(linkedDiary).toBe(true);
  }, 120_000);

  it('queues exactly the supported public reply style and falls back safely for an invalid request', async () => {
    const server = app.getHttpServer();
    const store = app.get(StoreService);
    const queued = new Map<string, AIJob>();
    let sequence = 0;
    const persist = vi.spyOn(store, 'persist').mockImplementation(() => undefined);
    const flush = vi.spyOn(store, 'flush').mockResolvedValue();
    const queueAiJob = vi.spyOn(store, 'queueAiJob').mockImplementation((input) => {
      const job = {
        id: `style-test-job-${++sequence}`,
        userId: input.userId,
        contentId: input.contentId,
        contentType: input.contentType,
        taskType: 'public_ai_reply',
        jobType: input.jobType,
        style: input.style,
        providerId: 'provider_template',
        modelName: 'safe-template',
        status: 'queued',
        promptSummary: input.promptSummary,
        result: '',
        durationMs: 0,
        retryCount: 0,
        traceJson: [],
        routeVersion: 1,
        createdAt: new Date().toISOString(),
      } as AIJob;
      queued.set(job.id, job);
      return job;
    });
    const waitForAiJob = vi.spyOn(store, 'waitForAiJob').mockImplementation(async (jobId) => {
      const job = queued.get(jobId);
      if (!job) throw new Error('queued job was not found');
      job.status = 'fallback';
      job.result = '测试用的安全兜底回应。';
      job.durationMs = 1;
      job.completedAt = new Date().toISOString();
      return job;
    });

    try {
      const selected = await request(server)
        .post('/api/v1/moods')
        .send({ content: `public poetic mood ${Date.now()}`, emotion: 'anxious', visibility: 'PUBLIC', replyStyle: 'poetic' })
        .expect(201);

      expect(selected.body.jobs).toHaveLength(1);
      expect(selected.body.job.style).toBe('poetic');
      expect(selected.body.jobs.map((job: { style: string }) => job.style)).toEqual(['poetic']);
      expect(queueAiJob).toHaveBeenLastCalledWith(expect.objectContaining({ style: 'poetic' }));

      const fallback = await request(server)
        .post('/api/v1/moods')
        .send({ content: `public fallback mood ${Date.now()}`, emotion: 'anxious', visibility: 'PUBLIC', replyStyles: ['unsupported-style'] })
        .expect(201);

      expect(fallback.body.jobs).toHaveLength(1);
      expect(fallback.body.job.style).toBe('warm');
      expect(queueAiJob).toHaveBeenLastCalledWith(expect.objectContaining({ style: 'warm' }));

      // Let the intentionally asynchronous reply attachment finish while the
      // persistence stub is still active, then restore the real methods.
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      waitForAiJob.mockRestore();
      queueAiJob.mockRestore();
      flush.mockRestore();
      persist.mockRestore();
    }
  });
});
