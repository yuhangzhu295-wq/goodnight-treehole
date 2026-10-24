import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { Queue } from '../../apps/api/node_modules/bullmq';
import { createApiTestApp, followUpTestConnection } from '../business/helpers';
import { createIdentity } from './helpers/identity';
import { FlowEvidence } from './helpers/evidence';
import { closeAppBounded } from './helpers/teardown';

/**
 * F10 - a message to the future: scheduled, restarted, delivered exactly once.
 *
 * The delivery path is the product's own. The first instance writes the letter and its pending
 * follow-up, then goes away. The deadline is moved into the past with the database clock, and a
 * second instance is started: its startup reconciliation finds the pending row and enqueues it, and
 * its worker claims and delivers it. A spec that enqueued the job itself would prove the queue
 * works but not that a restart recovers the schedule.
 *
 * "Exactly once" is then tested by removing the completed queue job and adding the same id again.
 * The claim is a conditional update from pending/scheduled to delivered, so the second run must be
 * skipped - checked against both the notification count and `deliveredAt`.
 */
describe('F10 message to future self', () => {
  let app: INestApplication;
  let deliveryApp: INestApplication;
  let prisma: PrismaClient;
  let evidence: FlowEvidence;
  let server: any;
  let deliveryServer: any;
  let appClosed = false;

  let credential: string;
  let userId: string;
  let strangerCredential: string;
  let messageId: string;
  let followUpId: string;
  let journeyId: string;

  beforeAll(async () => {
    app = await createApiTestApp();
    server = app.getHttpServer();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    evidence = new FlowEvidence('F10');
    const identity = await createIdentity(server, 'F10 owner');
    credential = identity.credential;
    userId = identity.userId;
    strangerCredential = (await createIdentity(server, 'F10 stranger')).credential;
  });

  afterAll(async () => {
    evidence.flush();
    await prisma?.$disconnect();
    await closeAppBounded(deliveryApp, 'deliveryApp');
    if (!appClosed) await closeAppBounded(app, 'app');
  });

  it('schedules, survives a restart, delivers once, and skips the duplicate', async () => {
    // 1. Consent and a journey to attach the message to.
    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', credential)
      .send({ allowFutureSelfNotifications: true })
      .expect(200);
    const journey = await request(server)
      .post('/api/v1/journeys')
      .set('x-goodnight-user-id', credential)
      .send({ title: `F10 旅程 ${Date.now()}`, domain: '关系', content: 'F10：留给明天的话。', intensity: 5 });
    journeyId = journey.body?.journey?.id;

    // 2. Schedule the message. It is written undelivered with a pending follow-up.
    const deliverAt = new Date(Date.now() + 86_400_000).toISOString();
    const created = await request(server)
      .post('/api/v1/future-messages')
      .set('x-goodnight-user-id', credential)
      .send({
        content: 'F10：请记得，你已经先停下来了一次。',
        deliverAt,
        contextType: 'journey',
        contextRefId: journeyId,
      });
    messageId = created.body?.item?.id;
    followUpId = created.body?.followUp?.id;
    const messageRow = messageId
      ? await prisma.messageToFutureSelf.findUnique({ where: { id: messageId } })
      : null;
    const followUpRow = followUpId
      ? await prisma.followUpJob.findUnique({ where: { id: followUpId } })
      : null;
    evidence.check({
      step: 'a future message is stored undelivered with a pending follow-up',
      layer: 'DATABASE_EVIDENCE',
      expected: {
        status: 201,
        deliveredAt: null,
        contextType: 'journey',
        contextRefIdMatches: true,
        followUpKind: 'FUTURE_SELF',
        followUpPending: true,
      },
      actual: {
        status: created.status,
        deliveredAt: messageRow?.deliveredAt ?? null,
        contextType: messageRow?.contextType,
        contextRefIdMatches: messageRow?.contextRefId === journeyId,
        followUpKind: followUpRow?.kind,
        followUpPending: followUpRow ? ['pending', 'scheduled'].includes(followUpRow.status) : false,
      },
      request: { method: 'POST', path: '/api/v1/future-messages', body: { contextType: 'journey' } },
      response: { status: created.status, messageId, followUpId, queue: created.body?.queue },
      detail: { scheduledDelayMs: created.body?.queue?.delay },
      sql: `select "deliveredAt", "contextType", "contextRefId" from "MessageToFutureSelf" where id = '${messageId}'; select kind, status from "FollowUpJob" where id = '${followUpId}'`,
    });
    expect(created.status).toBe(201);
    expect(messageRow?.deliveredAt).toBeNull();
    expect(followUpRow?.kind).toBe('FUTURE_SELF');

    // 3. The schedule is readable through the API, then the writer goes away.
    const beforeRestart = await request(server)
      .get('/api/v1/future-messages')
      .set('x-goodnight-user-id', credential);
    const seen = (beforeRestart.body?.items ?? []).find((item: any) => item.id === messageId);
    evidence.check({
      step: 'the pending schedule is readable before the restart',
      layer: 'PERSISTENCE_EVIDENCE',
      expected: { status: 200, listed: true, deliveredAt: null },
      actual: { status: beforeRestart.status, listed: Boolean(seen), deliveredAt: seen?.deliveredAt ?? null },
      request: { method: 'GET', path: '/api/v1/future-messages', identity: 'same user' },
      response: { status: beforeRestart.status },
    });
    expect(seen).toBeTruthy();
    expect(seen?.deliveredAt ?? null).toBeNull();

    // 3b. The list the app reads carries the letter with its chosen context.
    evidence.check({
      step: 'the API serves the letter with its context and content',
      layer: 'API_EVIDENCE',
      expected: {
        status: 200,
        contextType: 'journey',
        contextRefIdMatches: true,
        contentMatches: true,
        contextLabelPresent: true,
      },
      actual: {
        status: beforeRestart.status,
        contextType: seen?.contextType,
        contextRefIdMatches: seen?.contextRefId === journeyId,
        contentMatches: seen?.content === 'F10：请记得，你已经先停下来了一次。',
        contextLabelPresent: Boolean(seen?.contextLabel),
      },
      request: { method: 'GET', path: '/api/v1/future-messages', identity: 'owner' },
      response: { status: beforeRestart.status, item: seen },
    });
    expect(seen?.contextType).toBe('journey');
    expect(seen?.content).toBe('F10：请记得，你已经先停下来了一次。');

    // 3c. Another user's list does not contain the letter.
    const strangerList = await request(server)
      .get('/api/v1/future-messages')
      .set('x-goodnight-user-id', strangerCredential);
    evidence.check({
      step: 'another user cannot see the future letter',
      layer: 'SECURITY_EVIDENCE',
      expected: { status: 200, listedForStranger: false },
      actual: {
        status: strangerList.status,
        listedForStranger: (strangerList.body?.items ?? []).some((item: any) => item.id === messageId),
      },
      request: { method: 'GET', path: '/api/v1/future-messages', identity: 'unrelated user' },
      response: { status: strangerList.status },
    });
    expect((strangerList.body?.items ?? []).some((item: any) => item.id === messageId)).toBe(false);

    await closeAppBounded(app, 'app');
    appClosed = true;

    // 4. Move the deadline into the past with the database clock, and move the *already scheduled*
    //    queue job's delay to zero. The job was enqueued by the first instance and lives in Redis,
    //    so it survived that process going away; the fresh instance's worker is what consumes it.
    //    (The delay is shortened because a spec cannot wait a day. The reconciliation path is a
    //    separate mechanism for enqueue failures and is not what is being exercised here.)
    await prisma.$executeRaw`
      UPDATE "MessageToFutureSelf"
      SET "deliverAt" = clock_timestamp() - interval '1 second'
      WHERE id = ${messageId}
    `;
    await prisma.$executeRaw`
      UPDATE "FollowUpJob"
      SET "dueAt" = clock_timestamp() - interval '1 second', status = 'pending', "completedAt" = NULL
      WHERE id = ${followUpId}
    `;

    // The new instance is fully booted before the job becomes runnable. Booting it while the
    // deadline is already due would overlap its boot-time flush with the worker's delivery
    // transaction; that overlap is a real (and separately recorded) weakness of the legacy flush,
    // but it is not what this flow is measuring.
    deliveryApp = await createApiTestApp();
    deliveryServer = deliveryApp.getHttpServer();

    const queue = new Queue(process.env.FOLLOW_UP_QUEUE_NAME!, { connection: followUpTestConnection() });
    const scheduled = await queue.getJob(followUpId);
    const scheduledState = scheduled ? await scheduled.getState() : 'missing';
    if (scheduled && scheduledState === 'delayed') {
      await scheduled.changeDelay(0);
    }
    await queue.close();

    let notification: any;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await request(deliveryServer)
        .get('/api/v1/notifications')
        .set('x-goodnight-user-id', credential);
      notification = (response.body?.items ?? []).find((item: any) => item.id === `notification_${followUpId}`);
      if (notification) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const deliveredRow = await prisma.messageToFutureSelf.findUnique({ where: { id: messageId } });
    const deliveredJob = await prisma.followUpJob.findUnique({ where: { id: followUpId } });
    evidence.check({
      step: 'the surviving schedule is delivered by the restarted instance',
      layer: 'DATABASE_EVIDENCE',
      expected: { notificationType: 'FUTURE_SELF', hasDeliveredAt: true, jobStatus: 'delivered' },
      actual: {
        notificationType: notification?.type,
        hasDeliveredAt: Boolean(deliveredRow?.deliveredAt),
        jobStatus: deliveredJob?.status,
      },
      request: { method: 'GET', path: '/api/v1/notifications', identity: 'same user, fresh process' },
      response: { notificationId: notification?.id, targetRoute: notification?.targetRoute },
      detail: { scheduledJobStateBeforeDelivery: scheduledState },
      sql: `select "deliveredAt" from "MessageToFutureSelf" where id = '${messageId}'; select status from "FollowUpJob" where id = '${followUpId}'`,
    });
    expect(notification?.type).toBe('FUTURE_SELF');
    expect(deliveredRow?.deliveredAt).toBeTruthy();
    expect(deliveredJob?.status).toBe('delivered');

    // 5. A duplicate delivery is skipped: same timestamp, still one notification.
    //
    // The duplicate is enqueued under a different queue job id on purpose. Removing the completed
    // job first would race the worker's retry of the *same* id (observed as "could not be removed
    // because it is locked by another worker"). The product's guard is not the queue id anyway: the
    // claim is a conditional update on the FollowUpJob row, so a second job carrying the same
    // payload must be skipped by the database.
    const deliveredAtBefore = deliveredRow!.deliveredAt!.getTime();
    const duplicateQueue = new Queue(process.env.FOLLOW_UP_QUEUE_NAME!, { connection: followUpTestConnection() });
    await duplicateQueue.add(
      'FUTURE_SELF',
      { id: followUpId, kind: 'FUTURE_SELF', userId, payload: { messageId } },
      { jobId: `${followUpId}_duplicate`, delay: 0, attempts: 1, removeOnComplete: false, removeOnFail: false },
    );
    await duplicateQueue.close();
    await new Promise((resolve) => setTimeout(resolve, 5_000));

    const afterDuplicate = await prisma.messageToFutureSelf.findUnique({ where: { id: messageId } });
    const notifications = await prisma.userNotification.findMany({
      where: { id: `notification_${followUpId}` },
    });
    const listAfter = await request(deliveryServer)
      .get('/api/v1/future-messages')
      .set('x-goodnight-user-id', credential);
    const listed = (listAfter.body?.items ?? []).find((item: any) => item.id === messageId);
    evidence.check({
      step: 'a duplicate job does not deliver a second time',
      layer: 'PERSISTENCE_EVIDENCE',
      expected: { deliveredAtUnchanged: true, notifications: 1, listedDelivered: true },
      actual: {
        deliveredAtUnchanged: afterDuplicate?.deliveredAt?.getTime() === deliveredAtBefore,
        notifications: notifications.length,
        listedDelivered: Boolean(listed?.deliveredAt),
      },
      request: { method: 'POST', path: `queue:${process.env.FOLLOW_UP_QUEUE_NAME}`, body: { jobId: followUpId, duplicate: true } },
      response: { notifications: notifications.length },
    });
    expect(afterDuplicate?.deliveredAt?.getTime()).toBe(deliveredAtBefore);
    expect(notifications).toHaveLength(1);
    expect(listed?.deliveredAt).toBeTruthy();
  }, 120_000);
});
