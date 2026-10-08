import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApiTestApp, loginAdmin, demoUserHeaders } from './helpers';

describe('persistence durability regression tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApiTestApp();
    const server = app.getHttpServer();
    // Both endpoints under test are public routes, so no admin token is needed here. The login is
    // kept because it triggers a full flush, leaving the store settled before the assertions below.
    await loginAdmin(server);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('Defect 1: PATCH /api/v1/journeys/:id persists title and summary to database before response', async () => {
    const server = app.getHttpServer();
    const initialTitle = `ORIG_JOURNEY_${Date.now()}`;
    const initialContent = '测试旅程持久化写入耐久性';

    const created = await request(server)
      .post('/api/v1/journeys')
      .set(demoUserHeaders())
      .send({ title: initialTitle, domain: '生活', content: initialContent })
      .expect(201);

    const journeyId = created.body.journey.id as string;
    expect(journeyId).toBeTruthy();

    // Verify initial title is present in PostgreSQL
    const freshPrismaBefore = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    try {
      const initialDbRecord = await freshPrismaBefore.lifeJourney.findUnique({ where: { id: journeyId } });
      expect(initialDbRecord?.title).toBe(initialTitle);
    } finally {
      await freshPrismaBefore.$disconnect();
    }

    // PATCH journey title and summary
    const patchedTitle = `PATCHED_JOURNEY_${Date.now()}`;
    const patchedSummary = '持久化验证总结内容';
    const patchRes = await request(server)
      .patch(`/api/v1/journeys/${journeyId}`)
      .set(demoUserHeaders())
      .send({ title: patchedTitle, summary: patchedSummary })
      .expect(200);

    expect(patchRes.body.item.title).toBe(patchedTitle);
    expect(patchRes.body.item.summary).toBe(patchedSummary);

    // Re-read through a fresh PrismaClient to assert durability in PostgreSQL
    const freshPrismaAfter = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    try {
      const persistedRecord = await freshPrismaAfter.lifeJourney.findUnique({ where: { id: journeyId } });
      expect(persistedRecord?.title).toBe(patchedTitle);
      expect(persistedRecord?.summary).toBe(patchedSummary);
    } finally {
      await freshPrismaAfter.$disconnect();
    }
  });

  it('Defect 2: POST /api/v1/tools/emotion-decompose/:taskId/save commits diary to database and uses shared id helper', async () => {
    const server = app.getHttpServer();
    const taskId = `task_decompose_${Date.now()}`;

    // The load-bearing assertion is the fresh-PrismaClient read proving durability,
    // not whether the endpoint returns 200 or 201. Status code must not gate the durability check.
    const saveRes = await request(server)
      .post(`/api/v1/tools/emotion-decompose/${taskId}/save`)
      .send({});

    // Assert durability in PostgreSQL through a fresh PrismaClient immediately after the HTTP response
    const freshPrisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    try {
      const dbDiary = await freshPrisma.diary.findFirst({
        where: {
          source: 'tool-decompose',
          content: { contains: taskId },
        },
      });

      expect(dbDiary).not.toBeNull();
      // Verify shared id helper format: id('diary') -> prefix "diary_" followed by 10 hex characters (5 bytes)
      // Old code used `diary_${Date.now()}` which is purely numeric timestamp
      expect(dbDiary?.id).toMatch(/^diary_[a-f0-9]{10}$/);
    } finally {
      await freshPrisma.$disconnect();
    }

    // Secondary response check evaluated after durability: tolerates 200 or 201
    expect([200, 201]).toContain(saveRes.status);
    expect(saveRes.body).toEqual({ ok: true });
  });
});
