import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApiTestApp } from './helpers';

describe('third-stage journey archive business loop', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    app = await createApiTestApp();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  it('keeps a completed history private, exports a persisted file, restores an archived Journey, and deletes only after confirmation', async () => {
    const server = app.getHttpServer();
    const demo = 'user_demo';
    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', demo)
      .send({ allowJourneyArchiveRetention: true, allowDataExport: true, allowRecoveryData: true })
      .expect(200);

    const created = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', demo)
      .send({
        title: `归档闭环 ${Date.now()}`,
        domain: '关系',
        content: '我想把这段经历完整留住，等自己平静后再回看。',
        facts: ['对话中断了两天', '我担心自己说错话'],
        intensity: 8,
      })
      .expect(201);
    const journeyId = created.body.journey.id as string;

    await request(server)
      .patch(`/api/v1/journeys/${journeyId}/intent`)
      .set('x-goodnight-user-id', demo)
      .send({ intent: 'NEXT_STEP' })
      .expect(200);

    const completed = await request(server)
      .post(`/api/v1/journeys/${journeyId}/actions`)
      .set('x-goodnight-user-id', demo)
      .send({ title: '先喝一杯温水', description: '让身体先慢下来。' })
      .expect(201);
    const missed = await request(server)
      .post(`/api/v1/journeys/${journeyId}/actions`)
      .set('x-goodnight-user-id', demo)
      .send({ title: '今晚十点前关掉对话框', description: '给自己一个休息边界。' })
      .expect(201);
    await request(server)
      .post(`/api/v1/actions/${completed.body.item.id}/checkin`)
      .set('x-goodnight-user-id', demo)
      .send({ status: 'completed', reflection: '喝水后不那么着急了。', intensity: 6 })
      .expect(201);
    await request(server)
      .post(`/api/v1/actions/${missed.body.item.id}/checkin`)
      .set('x-goodnight-user-id', demo)
      .send({ status: 'missed', reflection: '没做到，明天把行动缩小。', intensity: 7, barrier: 'forgot' })
      .expect(201);
    await request(server)
      .post(`/api/v1/actions/${missed.body.item.id}/adapt`)
      .set('x-goodnight-user-id', demo)
      .send({ title: '先设十分钟提醒', description: '把开始缩小到十分钟。', barrier: 'forgot' })
      .expect(201);
    await request(server)
      .post('/api/v1/me/recovery')
      .set('x-goodnight-user-id', demo)
      .send({ journeyId, signals: { sleep: 'partial', humanContact: 'yes', comfort: 'yes' }, summary: '我给朋友发了一句近况。' })
      .expect(201);
    await request(server)
      .post('/api/v1/decisions')
      .set('x-goodnight-user-id', demo)
      .send({ journeyId, question: '今晚是否立刻解释？', options: ['现在解释', '明天再看'], criteria: ['先睡一觉'] })
      .expect(201);

    for (let index = 0; index < 102; index += 1) {
      await request(server)
        .post(`/api/v1/journeys/${journeyId}/updates`)
        .set('x-goodnight-user-id', demo)
        .send({ kind: index === 101 ? 'later' : 'note', content: `归档时间线 ${index + 1}：我如实记录了这一步。` })
        .expect(201);
    }

    await request(server)
      .patch(`/api/v1/journeys/${journeyId}/status`)
      .set('x-goodnight-user-id', demo)
      .send({ status: 'archived' })
      .expect(200);

    const list = await request(server).get('/api/v1/archive/journeys').set('x-goodnight-user-id', demo).expect(200);
    const listed = list.body.items.find((item: any) => item.journey.id === journeyId);
    expect(listed).toMatchObject({ journey: { status: 'archived' }, actionStats: { completed: 1, missed: 1, adjusted: 1 } });

    const detail = await request(server).get(`/api/v1/archive/journeys/${journeyId}`).set('x-goodnight-user-id', demo).expect(200);
    expect(detail.body.item).toMatchObject({
      journey: { id: journeyId, status: 'archived', currentIntent: 'NEXT_STEP' },
      actionStats: { total: 3, completed: 1, missed: 1, adjusted: 1 },
      recovery: [expect.objectContaining({ journeyId })],
      decisions: [expect.objectContaining({ journeyId })],
    });
    expect(detail.body.item.timeline.length).toBeGreaterThanOrEqual(103);
    expect(detail.body.item.timeline).toContainEqual(expect.objectContaining({ kind: 'later', content: '归档时间线 102：我如实记录了这一步。' }));
    expect(detail.body.item.later).toHaveLength(1);

    const exported = await request(server)
      .post(`/api/v1/archive/journeys/${journeyId}/export`)
      .set('x-goodnight-user-id', demo)
      .expect(201);
    expect(exported.body.item.asset).toMatchObject({ usageType: 'journey-archive-export', status: 'ready' });
    const file = await request(server).get(exported.body.item.downloadUrl).expect(200);
    expect(file.headers['content-type']).toContain('application/json');
    expect(file.text).toContain('goodnight-treehole-journey-archive-export/v1');
    expect(file.text).toContain(journeyId);
    expect(await prisma.mediaAsset.findUnique({ where: { id: exported.body.item.asset.id } })).toMatchObject({
      usageType: 'journey-archive-export',
      userId: demo,
    });

    const { StoreService } = await import('../../apps/api/src/store.service.js');
    await app.get(StoreService).reloadRuntimeState();
    const afterReload = await request(server).get(`/api/v1/archive/journeys/${journeyId}`).set('x-goodnight-user-id', demo).expect(200);
    expect(afterReload.body.item.timeline.length).toBeGreaterThanOrEqual(103);
    expect(afterReload.body.item.actionStats).toMatchObject({ completed: 1, missed: 1, adjusted: 1 });

    await request(server).post(`/api/v1/archive/journeys/${journeyId}/restore`).set('x-goodnight-user-id', demo).send({}).expect(201);
    expect((await request(server).get(`/api/v1/journeys/${journeyId}`).expect(200)).body.item.journey.status).toBe('active');
    expect((await request(server).get('/api/v1/archive/journeys').expect(200)).body.items.some((item: any) => item.journey.id === journeyId)).toBe(false);

    await request(server).patch(`/api/v1/journeys/${journeyId}/status`).send({ status: 'archived' }).expect(200);
    await request(server).delete(`/api/v1/archive/journeys/${journeyId}`).send({ confirmation: 'wrong' }).expect(400);
    await request(server).delete(`/api/v1/archive/journeys/${journeyId}`).send({ confirmation: 'DELETE_ARCHIVE' }).expect(200);
    expect((await request(server).get('/api/v1/archive/journeys').expect(200)).body.items.some((item: any) => item.journey.id === journeyId)).toBe(false);
    expect(await prisma.lifeJourney.findUnique({ where: { id: journeyId } })).toBeNull();
    expect(await prisma.journeyUpdate.count({ where: { journeyId } })).toBe(0);
    expect(await prisma.actionCommitment.count({ where: { journeyId } })).toBe(0);
  }, 120_000);
});
