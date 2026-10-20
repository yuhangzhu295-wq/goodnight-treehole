import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createApiTestApp, identityFor } from './helpers';

/**
 * The letter routes used to fall back to the literal seed id `'mood_1'` when a user had no mood of
 * their own. The seed writes `mood_seed_*` ids, not `mood_1`, so that id points at no row: writing
 * the letter hits `Letter_sourceMoodId_fkey` and the read returns 500. That is exactly the state a
 * brand-new user is in - they have not written a mood yet - so "今日回信" was unopenable for the
 * one user who most needs it.
 *
 * `sourceMoodId` is nullable by design, so the correct behaviour for "no mood to point at" is to
 * leave it null, which is what these cases pin down.
 */
describe('letter source fallback', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function freshUserHeaders(): Promise<Record<string, string>> {
    const userId = `user_letter_fallback_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return { 'x-goodnight-user-id': await identityFor(userId) };
  }

  it('returns 200 for a user who has never written a mood', async () => {
    const server = app.getHttpServer();
    const response = await request(server)
      .get('/api/v1/letters/today')
      .set(await freshUserHeaders())
      .expect(200);
    expect(response.body.item).toBeTruthy();
  });

  it('leaves sourceMoodId null rather than pointing at a mood row that does not exist', async () => {
    const server = app.getHttpServer();
    const response = await request(server)
      .get('/api/v1/letters/today')
      .set(await freshUserHeaders())
      .expect(200);
    const letterId = response.body.item.id;
    const row = await prisma.letter.findUnique({ where: { id: letterId } });
    expect(row).toBeTruthy();
    expect(row?.sourceMoodId).toBeNull();
  });

  it('points at a real mood row when the user does have one', async () => {
    const server = app.getHttpServer();
    const headers = await freshUserHeaders();
    const created = await request(server)
      .post('/api/v1/moods')
      .set(headers)
      .send({ content: '今天把回信的外键问题修好了。', emotion: '开心', visibility: 'PRIVATE' })
      .expect(201);
    const moodId = created.body.mood.id;

    const response = await request(server).get('/api/v1/letters/today').set(headers).expect(200);
    const row = await prisma.letter.findUnique({ where: { id: response.body.item.id } });
    expect(row?.sourceMoodId).toBe(moodId);
  });

  it('POST /letters/generate also succeeds for a mood-less user', async () => {
    const server = app.getHttpServer();
    const response = await request(server)
      .post('/api/v1/letters/generate')
      .set(await freshUserHeaders())
      .send({ style: 'poetic' })
      .expect(201);
    expect(response.body.item).toBeTruthy();
    expect(response.body.item.sourceMoodId ?? null).toBeNull();
  });
});
