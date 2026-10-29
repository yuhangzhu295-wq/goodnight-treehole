import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp, demoUserHeaders } from './helpers';

describe('front square interactions', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApiTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('filters by mood key and persists hug/favorite operations', async () => {
    const server = app.getHttpServer();
    const all = await request(server).get('/api/v1/posts').expect(200);
    expect(all.body.items.length).toBeGreaterThan(0);

    const filtered = await request(server).get('/api/v1/posts?mood=anxious').set(await demoUserHeaders()).expect(200);
    expect(filtered.body.items.length).toBeGreaterThan(0);
    expect(filtered.body.items.length).toBeLessThanOrEqual(all.body.items.length);

    const first = all.body.items[0];
    const hugged = await request(server).post(`/api/v1/posts/${first.id}/hugs`).set(await demoUserHeaders()).expect(201);
    expect(hugged.body.item.hugCount).toBe(first.hugCount + 1);

    await request(server).post(`/api/v1/posts/${first.id}/favorite`).set(await demoUserHeaders()).expect(201);
    await request(server).get('/api/v1/favorites?type=post').set(await demoUserHeaders()).expect((response) => {
      expect(response.body.items.some((item: any) => item.targetId === first.id)).toBe(true);
    });
  });

  it('persists reply likes and per-user hidden posts across fresh reads', async () => {
    const server = app.getHttpServer();
    const all = await request(server).get('/api/v1/posts').set(await demoUserHeaders()).expect(200);
    const post = all.body.items.find((item: any) => item.replyCount > 0) ?? all.body.items[0];
    const replies = await request(server).get(`/api/v1/posts/${post.id}/replies`).set(await demoUserHeaders()).expect(200);
    const reply = replies.body.items[0];
    expect(reply).toBeTruthy();

    const liked = await request(server).post(`/api/v1/replies/${reply.id}/like`).set(await demoUserHeaders()).expect(201);
    expect(liked.body.item.likeCount).toBe((reply.likeCount ?? 0) + 1);
    await request(server).get(`/api/v1/posts/${post.id}/replies`).set(await demoUserHeaders()).expect((response) => {
      const persisted = response.body.items.find((item: any) => item.id === reply.id);
      expect(persisted.likeCount).toBe(liked.body.item.likeCount);
    });

    await request(server).post(`/api/v1/posts/${post.id}/hide`).set(await demoUserHeaders()).expect(201);
    await request(server).get('/api/v1/posts').set(await demoUserHeaders()).expect((response) => {
      expect(response.body.items.some((item: any) => item.id === post.id)).toBe(false);
    });
    await request(server).get(`/api/v1/posts/${post.id}`).set(await demoUserHeaders()).expect(200);
  });
});
