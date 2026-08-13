import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createServer } from '../../apps/api/src/main.js';

describe('main user/admin flows', () => {
  let app: INestApplication;
  beforeAll(async () => { app = await createServer(); await app.init(); });
  afterAll(async () => { await app.close(); });
  it('reply bottom-sheet flow creates pending reply and admin blocks it', async () => {
    const server = app.getHttpServer();
    const login = await request(server).post('/api/admin/v1/auth/login').send({ username: 'admin', password: 'admin123' });
    const reply = await request(server).post('/api/v1/posts/post_1/replies').send({ content: '前台回复抽屉发布', anonymous: true }).expect(201);
    await request(server).get('/api/admin/v1/replies').expect((res) => expect(res.body.items.some((r: any) => r.id === reply.body.item.id)).toBe(true));
    await request(server).patch(`/api/admin/v1/replies/${reply.body.item.id}/moderation`).set('Authorization', `Bearer ${login.body.token}`).send({ action: 'block' }).expect(200);
    await request(server).get('/api/v1/posts/post_1/replies').expect((res) => expect(res.body.items.some((r: any) => r.id === reply.body.item.id)).toBe(false));
  });
});
