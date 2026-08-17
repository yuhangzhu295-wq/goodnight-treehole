import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp, waitForAiJob } from './helpers';

describe('first batch core support loop', () => {
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

  it('keeps the confirmed fingerprint, temperature, action adaptation and timeline in one persisted journey', async () => {
    const server = app.getHttpServer();
    const content = `第一批真实链路 ${Date.now()}：分开后想联系对方，今晚睡不着。`;
    const created = await request(server).post('/api/v1/journeys').send({ domain: '关系', relationScene: '想联系 TA', content }).expect(201);
    const journeyId = created.body.journey.id as string;
    const analysis = await waitForAiJob(server, created.body.job.id);
    expect(analysis.status).toMatch(/succeeded|fallback/);
    expect(analysis.job.providerId).not.toMatch(/ollama|local/i);

    const firstConfirmation = await request(server)
      .patch(`/api/v1/journeys/${journeyId}/situation`)
      .send({ facts: [content], feelings: ['想念又慌张'], needs: ['先不要冲动'], constraints: ['今晚睡不着'], intensity: 8, behaviorSignals: ['身体感觉：胸口闷', '脑子里最吵的一句：我怕自己又忍不住联系他'] })
      .expect(200);
    expect(firstConfirmation.body.item).toMatchObject({ confidence: 'user_confirmed', intensity: 8 });

    const reanalysis = await request(server).post(`/api/v1/journeys/${journeyId}/situation/reanalyze`).send({}).expect(201);
    const reanalysisJob = await waitForAiJob(server, reanalysis.body.job.id);
    expect(reanalysisJob.status).toMatch(/succeeded|fallback/);
    expect(reanalysisJob.job.providerId).not.toMatch(/ollama|local/i);

    await request(server)
      .patch(`/api/v1/journeys/${journeyId}/situation`)
      .send({ facts: [content], feelings: ['想念又慌张'], needs: ['先不要冲动'], constraints: ['今晚睡不着'], intensity: 8 })
      .expect(200);
    const intent = await request(server).patch(`/api/v1/journeys/${journeyId}/intent`).send({ intent: 'NEXT_STEP' }).expect(200);
    expect(intent.body.route.targetRoute).toBe('/pages/action/index');

    const plan = await request(server).post(`/api/v1/journeys/${journeyId}/action-plan`).send({ content }).expect(201);
    const planJob = await waitForAiJob(server, plan.body.job.id);
    expect(planJob.structured.title).toBeTruthy();
    const action = await request(server)
      .post(`/api/v1/journeys/${journeyId}/actions`)
      .send({ title: planJob.structured.title, description: planJob.structured.completionDefinition })
      .expect(201);
    const actionId = action.body.item.id as string;

    const missed = await request(server).post(`/api/v1/actions/${actionId}/checkin`).send({ status: 'missed', reflection: '情绪太强，今天没有做到。', barrier: 'emotion_too_strong' }).expect(201);
    expect(missed.body.adaptive.required).toBe(true);
    const adaptive = await request(server).post(`/api/v1/actions/${actionId}/adaptive-plan`).send({ barrier: 'emotion_too_strong' }).expect(201);
    const adaptiveJob = await waitForAiJob(server, adaptive.body.job.id);
    const smaller = await request(server)
      .post(`/api/v1/actions/${actionId}/adapt`)
      .send({ title: adaptiveJob.structured.title, description: adaptiveJob.structured.completionDefinition, barrier: 'emotion_too_strong' })
      .expect(201);
    expect(smaller.body.item).toMatchObject({ parentActionId: actionId, attemptNumber: 2, status: 'active' });

    await request(server).post(`/api/v1/journeys/${journeyId}/updates`).send({ kind: 'stabilize_note', content: '我先不做决定，先让自己慢一点。' }).expect(201);
    const refreshed = await request(server).get(`/api/v1/journeys/${journeyId}`).expect(200);
    expect(refreshed.body.item.journey).toMatchObject({ id: journeyId, initialIntensity: 8, intensity: 8 });
    expect(refreshed.body.item.updates.some((item: { kind: string }) => item.kind === 'intensity')).toBe(true);
    expect(refreshed.body.item.updates.some((item: { kind: string }) => item.kind === 'checkin')).toBe(true);
    expect(refreshed.body.item.commitments.some((item: { id: string; parentActionId?: string }) => item.id === smaller.body.item.id && item.parentActionId === actionId)).toBe(true);

    const persisted = await prisma.lifeJourney.findUnique({ where: { id: journeyId }, include: { snapshot: true, commitments: true, updates: true } });
    expect(persisted).toMatchObject({ initialIntensity: 8, intensity: 8 });
    expect(persisted?.snapshot?.confidence).toBe('user_confirmed');
    expect(persisted?.commitments.some((item) => item.parentActionId === actionId && item.attemptNumber === 2)).toBe(true);
    expect(persisted?.updates.some((item) => item.kind === 'stabilize_note')).toBe(true);
  }, 120_000);

  it('pauses ordinary routing for a safety event, persists the real-world handoff, and records notification readback', async () => {
    const server = app.getHttpServer();
    const created = await request(server).post('/api/v1/journeys').send({ domain: '其他', content: `安全分流回归 ${Date.now()}：我现在很难受，需要有人陪。` }).expect(201);
    const journeyId = created.body.journey.id as string;
    const route = await request(server).patch(`/api/v1/journeys/${journeyId}/intent`).send({ intent: 'HIGH_DISTRESS' }).expect(200);
    expect(route.body.route.targetRoute).toBe('/pages/safety/index');
    expect(await prisma.safetyEvent.findFirst({ where: { journeyId, level: 'high' } })).toBeTruthy();

    const acknowledged = await request(server).post(`/api/v1/journeys/${journeyId}/safety/acknowledge`).send({}).expect(201);
    expect(acknowledged.body.journey).toMatchObject({ stage: 'stabilizing', currentIntent: 'JUST_LISTEN' });
    const handoff = await request(server).post('/api/v1/handoffs').send({ journeyId, recipient: '朋友', channel: '由我选择联系', summary: '我最近有点撑不住，今晚如果有空能陪我说十分钟话吗？我现在不需要建议，只希望有人在。' }).expect(201);
    const contact = await request(server).post('/api/v1/trusted-contacts').send({ nickname: '小林', relation: '朋友', contactHint: '通讯录中的小林' }).expect(201);
    expect(contact.body.item.enabled).toBe(true);
    expect(await prisma.realityHandoff.findUnique({ where: { id: handoff.body.item.id } })).toMatchObject({ journeyId, recipient: '朋友', status: 'ready' });

    const overdue = await request(server).post(`/api/v1/journeys/${journeyId}/actions`).send({ title: '十分钟后回来看一眼', dueAt: new Date(Date.now() - 3_000).toISOString() }).expect(201);
    const notificationId = `notification_${overdue.body.followUp.id}`;
    let notification: { id: string; status: string } | undefined;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const notices = await request(server).get('/api/v1/notifications').expect(200);
      notification = notices.body.items.find((item: { id: string }) => item.id === notificationId);
      if (notification) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect(notification).toMatchObject({ id: notificationId, status: 'unread' });
    await request(server).patch(`/api/v1/notifications/${notificationId}/read`).expect(200);
    expect(await prisma.userNotification.findUnique({ where: { id: notificationId } })).toMatchObject({ status: 'read' });
  }, 30_000);
});
