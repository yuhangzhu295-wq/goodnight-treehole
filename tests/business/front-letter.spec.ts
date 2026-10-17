import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp, demoUserHeaders } from './helpers';

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

    await request(server).post('/api/v1/letters/generate').set(await demoUserHeaders()).send({ style: 'poetic' }).expect((response) => {
      expect(response.body.job).toBeTruthy();
      expect(response.body.item.content).toBeTruthy();
    });
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
