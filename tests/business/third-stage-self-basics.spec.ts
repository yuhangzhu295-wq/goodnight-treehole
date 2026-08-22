import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createApiTestApp } from './helpers';

describe('third-stage recovery, support plan, and stable self business loop', () => {
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

  it('creates, edits, reads, and persists a user-owned recovery system without health scoring', async () => {
    const server = app.getHttpServer();
    const userId = 'user_demo';
    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', userId)
      .send({ allowRecoveryData: true })
      .expect(200);

    const plan = {
      earlySignals: ['想躲开所有消息'],
      thingsThatHelp: ['先洗脸喝水'],
      thingsThatMakeWorse: ['反复翻旧聊天'],
      safePeople: ['小林'],
      places: ['客厅靠窗的位置'],
      smallActions: ['站起来走两分钟'],
      professionalSupport: '需要时预约心理咨询',
      emergencyPreference: '先给小林发求助卡',
    };
    const savedPlan = await request(server)
      .put('/api/v1/me/support-plan')
      .set('x-goodnight-user-id', userId)
      .send({ title: '独立验真低谷预案', plan })
      .expect(200);
    const planId = savedPlan.body.item.id as string;
    expect(savedPlan.body.item).toMatchObject({ userId, title: '独立验真低谷预案', plan });
    expect(await prisma.personalSupportPlan.findUnique({ where: { id: planId } })).toMatchObject({ userId, title: '独立验真低谷预案' });

    const editedPlan = await request(server)
      .put('/api/v1/me/support-plan')
      .set('x-goodnight-user-id', userId)
      .send({ title: '独立验真低谷预案（更新）', plan: { ...plan, smallActions: ['走到窗边深呼吸'] } })
      .expect(200);
    expect(editedPlan.body.item).toMatchObject({ id: planId, title: '独立验真低谷预案（更新）' });
    expect((await request(server).get('/api/v1/me/support-plan').set('x-goodnight-user-id', userId).expect(200)).body.item.plan.smallActions).toEqual(['走到窗边深呼吸']);

    const profile = {
      stableDescription: '稳定时我会先慢下来，再决定要不要回复。',
      sleepPattern: '通常在十一点前放下手机。',
      eatingPattern: '会规律吃一点热的东西。',
      focusPattern: '可以完成二十分钟的小任务。',
      bodyState: '肩膀是放松的。',
      contactPeople: ['小林'],
      usualLikes: ['听雨声'],
      recoverySigns: ['愿意洗澡'],
      stabilityAnchors: ['先睡一觉'],
      realityReminder: '我可以把今天缩小到下一步。',
    };
    const stable = await request(server)
      .put('/api/v1/me/stable-self')
      .set('x-goodnight-user-id', userId)
      .send({ profile })
      .expect(200);
    expect(stable.body.item.profile).toMatchObject(profile);
    expect(await prisma.stableSelfProfile.findUnique({ where: { userId } })).toMatchObject({ profile });

    const signals = [
      { food: 'yes', outside: 'no', humanContact: 'partial', sleep: 'no', mustDo: 'partial', comfort: 'yes' },
      { food: 'yes', outside: 'partial', humanContact: 'yes', sleep: 'partial', mustDo: 'partial', comfort: 'yes' },
      { food: 'partial', outside: 'yes', humanContact: 'yes', sleep: 'yes', mustDo: 'yes', comfort: 'yes' },
      { food: 'yes', outside: 'yes', humanContact: 'yes', sleep: 'partial', mustDo: 'yes', comfort: 'partial' },
    ];
    const snapshots: Array<{ id: string; summary: string }> = [];
    for (let index = 0; index < signals.length; index += 1) {
      const response = await request(server)
        .post('/api/v1/me/recovery')
        .set('x-goodnight-user-id', userId)
        .send({ signals: signals[index], summary: `第 ${index + 1} 次恢复记录：如实记录生活功能。` })
        .expect(201);
      snapshots.push(response.body.item);
    }
    await Promise.all(
      snapshots.map((item, index) =>
        prisma.recoverySnapshot.update({
          where: { id: item.id },
          data: { createdAt: new Date(Date.now() - [7, 3, 2, 1][index] * 86_400_000) },
        }),
      ),
    );

    const recovery = await request(server).get('/api/v1/me/recovery').set('x-goodnight-user-id', userId).expect(200);
    expect(recovery.body.items).toEqual(
      expect.arrayContaining(
        snapshots.map((item) => expect.objectContaining({ id: item.id, summary: item.summary })),
      ),
    );
    expect(await prisma.recoverySnapshot.count({ where: { userId, id: { in: snapshots.map((item) => item.id) } } })).toBe(4);
    const payload = JSON.stringify(recovery.body);
    expect(payload).not.toMatch(/recovery score|健康百分比|抑郁指数|焦虑指数|人群排名/i);
  });
});
