import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp, waitForAiJob, identityFor, DEMO_USER_ID } from './helpers';

// The AI summary can only reach 'succeeded' with DAPI credentials. Without them the job stops at
// 'fallback', which is NOT_RUN_NO_SECRET, so that half is skipped explicitly rather than asserted
// into a pass or left to fail.
const dapiConfigured = Boolean(process.env.DAPI_API_KEY);

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
    // Every call carries the demo identity: R-06 refuses an identity-less request with 401 instead
    // of falling back to the demo user, so these must not rely on that fallback.
    const demoHeaders = { 'x-goodnight-user-id': await identityFor(DEMO_USER_ID) };
    await request(server)
      .get('/api/v1/me/profile')
      .set(demoHeaders)
      .expect((response) => {
        expect(response.body.item.id).toBe('user_demo');
      });
    await request(server)
      .get('/api/v1/me/stats')
      .set(demoHeaders)
      .expect((response) => {
        expect(response.body.item.diaryCount).toBeGreaterThanOrEqual(0);
        expect(response.body.item.streakDays).toBeGreaterThan(0);
      });
    // allowJourneyLongTermAnalysis is the consent /api/v1/report/month checks before it
    // will create a monthly_recovery_summary job (monthly-report.service.ts:312). Without
    // it the endpoint correctly returns aiJobStatus "disabled" and no aiJobId, and the
    // waitForAiJob below would poll /api/v1/ai/tasks/undefined.
    await request(server)
      .patch('/api/v1/privacy-settings')
      .set(demoHeaders)
      .send({ allowHumanReplies: false, allowJourneyLongTermAnalysis: true })
      .expect(200);
    await request(server)
      .get('/api/v1/privacy-settings')
      .set(demoHeaders)
      .expect((response) => {
        expect(response.body.item.allowHumanReplies).toBe(false);
      });
    const month = '2026-07';
    const report = await request(server)
      .get(`/api/v1/report/month?month=${month}`)
      .set(demoHeaders)
      .expect(200);
    expect(report.body.item.trend.length).toBeGreaterThan(0);
  }, 120_000);

  it.skipIf(!dapiConfigured)(
    'summarizes the monthly report through a real AI job and renders its poster',
    async () => {
      const server = app.getHttpServer();
      const demoHeaders = { 'x-goodnight-user-id': await identityFor(DEMO_USER_ID) };
      const month = '2026-07';
      const report = await request(server)
        .get(`/api/v1/report/month?month=${month}`)
        .set(demoHeaders)
        .expect(200);
      const completed = await waitForAiJob(server, report.body.item.aiJobId);
      expect(completed.status).toBe('succeeded');
      await request(server)
        .get(`/api/v1/report/month?month=${month}`)
        .set(demoHeaders)
        .expect((response) => {
          expect(response.body.item.summary).toBeTruthy();
        });
      await request(server)
        .post('/api/v1/report/share-image')
        .set(demoHeaders)
        .send({ month })
        .expect((response) => {
          expect(response.body.posterUrl).toContain('report_');
          expect(response.body.asset.usageType).toBe('monthly-report-poster');
        });
    },
    120_000,
  );
});
