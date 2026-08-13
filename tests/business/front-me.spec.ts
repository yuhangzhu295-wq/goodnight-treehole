import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp, waitForAiJob } from './helpers';

describe('front me center interactions', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApiTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('loads profile, stats, report, and persists privacy settings', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/v1/me/profile').expect((response) => {
      expect(response.body.item.id).toBe('user_demo');
    });
    await request(server).get('/api/v1/me/stats').expect((response) => {
      expect(response.body.item.diaryCount).toBeGreaterThanOrEqual(0);
      expect(response.body.item.streakDays).toBeGreaterThan(0);
    });
    await request(server).patch('/api/v1/privacy-settings').send({ allowHumanReplies: false }).expect(200);
    await request(server).get('/api/v1/privacy-settings').expect((response) => {
      expect(response.body.item.allowHumanReplies).toBe(false);
    });
    const month = '2026-07';
    const report = await request(server).get(`/api/v1/report/month?month=${month}`).expect(200);
    expect(report.body.item.trend.length).toBeGreaterThan(0);
    const completed = await waitForAiJob(server, report.body.item.aiJobId);
    expect(completed.status).toBe('succeeded');
    await request(server).get(`/api/v1/report/month?month=${month}`).expect((response) => {
      expect(response.body.item.summary).toBeTruthy();
    });
    await request(server).post('/api/v1/report/share-image').send({ month }).expect((response) => {
      expect(response.body.posterUrl).toContain('report_');
      expect(response.body.asset.usageType).toBe('monthly-report-poster');
    });
  }, 120_000);
});
