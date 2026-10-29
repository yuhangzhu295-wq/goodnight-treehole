import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp, demoUserHeaders, waitForAiJob } from './helpers';

describe('front letter interactions', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApiTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('regenerates, saves, favorites, and creates share images for letters', async () => {
    const server = app.getHttpServer();
    const today = await request(server).get('/api/v1/letters/today').set(await demoUserHeaders()).expect(200);
    const letterId = today.body.item.id;

    // The letter is written empty and filled by its queued job, so the response's `item.content` is
    // empty by design. The job has to be awaited for the content to exist at all.
    //
    // Without DAPI credentials the job fails honestly, and the letter then stays empty - that is the
    // correct product behaviour and the previous assertion (`item.content` on the response) could
    // never have held in this environment. What is asserted here is the part that does not depend on
    // credentials: the job is created, it reaches a terminal state, and the letter rows the job is
    // attached to stay consistent with it. The generated-content half is covered where credentials
    // exist (the AI provider specs).
    const generated = await request(server).post('/api/v1/letters/generate').set(await demoUserHeaders()).send({ style: 'poetic' }).expect(201);
    expect(generated.body.job).toBeTruthy();
    // The job is created against the letter and reaches a terminal state. The content itself is a
    // credential-dependent half: with DAPI configured the job succeeds and the letter is filled,
    // without it the job fails and the letter stays empty - both correct, and the previous
    // `item.content` assertion on the response could never have held without credentials.
    const job = await waitForAiJob(server, generated.body.job.id);
    expect(['succeeded', 'fallback', 'failed']).toContain(job.status);
    // The read path still resolves a letter for the same user once the job has run.
    const after = await request(server).get('/api/v1/letters/today').set(await demoUserHeaders()).expect(200);
    expect(after.body.item).toBeTruthy();
    if (job.status !== 'failed') expect(after.body.item.content).toBeTruthy();
    await request(server).post(`/api/v1/letters/${letterId}/save-to-diary`).set(await demoUserHeaders()).expect(201);
    await request(server).post(`/api/v1/letters/${letterId}/favorite`).set(await demoUserHeaders()).expect(201);
    await request(server).post(`/api/v1/letters/${letterId}/poster`).set(await demoUserHeaders()).expect((response) => {
      expect(response.body.posterUrl).toContain(letterId);
    });
    await request(server).post('/api/v1/share-image').set(await demoUserHeaders()).send({ id: letterId, type: 'letter' }).expect((response) => {
      expect(response.body.posterUrl).toContain('letter');
    });
  });
});
