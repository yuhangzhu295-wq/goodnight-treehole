import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp } from './helpers';

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
    const today = await request(server).get('/api/v1/letters/today').expect(200);
    const letterId = today.body.item.id;

    await request(server).post('/api/v1/letters/generate').send({ style: 'poetic' }).expect((response) => {
      expect(response.body.job).toBeTruthy();
      expect(response.body.item.content).toBeTruthy();
    });
    await request(server).post(`/api/v1/letters/${letterId}/save-to-diary`).expect(201);
    await request(server).post(`/api/v1/letters/${letterId}/favorite`).expect(201);
    await request(server).post(`/api/v1/letters/${letterId}/poster`).expect((response) => {
      expect(response.body.posterUrl).toContain(letterId);
    });
    await request(server).post('/api/v1/share-image').send({ id: letterId, type: 'letter' }).expect((response) => {
      expect(response.body.posterUrl).toContain('letter');
    });
  });
});
