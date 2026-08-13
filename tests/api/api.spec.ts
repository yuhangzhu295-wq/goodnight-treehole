import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { resetTestDatabase } from '../../scripts/test-database';

describe('api contracts', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL = resetTestDatabase('goodnight_treehole_test_api_contracts');
    const { createServer } = await import('../../apps/api/src/main.js');
    app = await createServer();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves front APIs and moderation affects visibility', async () => {
    const server = app.getHttpServer();
    const login = await request(server)
      .post('/api/admin/v1/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(201);
    const mood = await request(server)
      .post('/api/v1/moods')
      .send({ content: '公开树洞测试', emotion: '工作', visibility: 'PUBLIC' })
      .expect(201);
    const postId = mood.body.post.id;

    await request(server).get('/api/v1/posts').expect(200).expect((res) => {
      expect(res.body.items.some((post: any) => post.id === postId)).toBe(false);
    });
    await request(server)
      .patch(`/api/admin/v1/posts/${postId}/moderation`)
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ action: 'approve' })
      .expect(200);
    await request(server).get('/api/v1/posts').expect((res) => {
      expect(res.body.items.some((post: any) => post.id === postId)).toBe(true);
    });
  });

  it('front FAQ reads admin-created FAQ', async () => {
    const server = app.getHttpServer();
    const login = await request(server)
      .post('/api/admin/v1/auth/login')
      .send({ username: 'admin', password: 'admin123' })
      .expect(201);

    await request(server)
      .post('/api/admin/v1/faqs')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ question: '测试 FAQ？', answer: '来自后台。' })
      .expect(201);
    await request(server).get('/api/v1/feedback/faqs').expect((res) => {
      expect(res.body.items.some((faq: any) => faq.question === '测试 FAQ？')).toBe(true);
    });
  });
});
