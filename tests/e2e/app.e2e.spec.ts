import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { resetTestDatabase } from '../../scripts/test-database.js';

process.env.DATABASE_URL = resetTestDatabase(`goodnight_treehole_test_e2e_${process.pid}_${process.env.VITEST_POOL_ID ?? '0'}`);

describe('main user/admin flows', () => {
  let app: INestApplication;
  beforeAll(async () => { const { createServer } = await import('../../apps/api/src/main.js'); app = await createServer(); await app.init(); });
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
