import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { auth, createApiTestApp, loginAdmin } from './helpers';

describe('admin sync business flow', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApiTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('uses admin aliases to approve/block posts and enforce user status', async () => {
    const server = app.getHttpServer();
    const token = await loginAdmin(server);
    const content = `admin sync post ${Date.now()}`;
    const created = await request(server).post('/api/v1/posts').send({ content, mood: 'aggrieved', visibility: 'PUBLIC' }).expect(201);

    await request(server).patch(`/api/admin/v1/posts/${created.body.post.id}/approve`).set('Authorization', auth(token)).expect(200);
    await request(server).get('/api/v1/posts?mood=aggrieved').expect((response) => {
      expect(response.body.items.some((item: any) => item.id === created.body.post.id)).toBe(true);
    });

    await request(server).patch(`/api/admin/v1/posts/${created.body.post.id}/block`).set('Authorization', auth(token)).expect(200);
    await request(server).get('/api/v1/posts?mood=aggrieved').expect((response) => {
      expect(response.body.items.some((item: any) => item.id === created.body.post.id)).toBe(false);
    });

    await request(server).patch('/api/admin/v1/users/user_demo/status').set('Authorization', auth(token)).send({ status: 'banned' }).expect(200);
    await request(server).post('/api/v1/posts').send({ content: 'blocked by admin', mood: 'work', visibility: 'PUBLIC' }).expect(403);
    await request(server).patch('/api/admin/v1/users/user_demo/status').set('Authorization', auth(token)).send({ status: 'normal' }).expect(200);
  });
});
