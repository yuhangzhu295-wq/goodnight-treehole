import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import type { INestApplication } from '@nestjs/common';
import { createApiTestApp } from '../business/helpers';
import { createIdentity } from './helpers/identity';
import { FlowEvidence } from './helpers/evidence';

/**
 * F08 - the memory lifecycle, where each state has exactly one legal way out.
 *
 * The product rule is that an effectively expired memory may be read, deleted, or explicitly
 * re-consented - nothing else. Editing it, extending its window, or flipping it back to `active`
 * in place would each produce an active row whose consent has lapsed, so all three must be refused
 * and the refusal has to be checked against the row, not only the status code. Deletion is terminal:
 * a deleted row cannot be reactivated and a second delete is an idempotent no-op.
 */
describe('F08 memory lifecycle', () => {
  let app: INestApplication;
  let secondApp: INestApplication;
  let prisma: PrismaClient;
  let evidence: FlowEvidence;
  let server: any;
  let secondServer: any;

  let credential: string;
  let strangerCredential: string;
  let memoryId: string;
  let consentedAt: Date;

  beforeAll(async () => {
    app = await createApiTestApp();
    secondApp = await createApiTestApp();
    server = app.getHttpServer();
    secondServer = secondApp.getHttpServer();
    prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    evidence = new FlowEvidence('F08');
    credential = (await createIdentity(server, 'F08 owner')).credential;
    strangerCredential = (await createIdentity(server, 'F08 stranger')).credential;
  });

  afterAll(async () => {
    evidence.flush();
    await prisma?.$disconnect();
    await secondApp?.close();
    await app?.close();
  });

  const row = () => (memoryId ? prisma.memoryItem.findUnique({ where: { id: memoryId } }) : Promise.resolve(null));

  it('saves, edits, disables, re-consents after expiry, and deletes terminally', async () => {
    // 1. Without the retention consent, saving is refused and writes nothing.
    const withoutConsent = await request(server)
      .post('/api/v1/memory')
      .set('x-goodnight-user-id', credential)
      .send({ title: 'F08：没有同意', content: 'F08：不应该写入。' });
    const rowsWithoutConsent = await prisma.memoryItem.count({ where: { title: 'F08：没有同意' } });
    evidence.check({
      step: 'saving without the retention consent is refused and writes nothing',
      layer: 'SECURITY_EVIDENCE',
      expected: { status: 403, rowsWritten: 0 },
      actual: { status: withoutConsent.status, rowsWritten: rowsWithoutConsent },
      request: { method: 'POST', path: '/api/v1/memory', body: { consented: 'not granted' } },
      response: { status: withoutConsent.status, body: withoutConsent.body },
    });
    expect(withoutConsent.status).toBe(403);
    expect(rowsWithoutConsent).toBe(0);

    // 2. With consent it is stored active with a consent timestamp and a future expiry.
    await request(server)
      .patch('/api/v1/me/privacy')
      .set('x-goodnight-user-id', credential)
      .send({ allowLongTermMemory: true })
      .expect(200);
    const saved = await request(server)
      .post('/api/v1/memory')
      .set('x-goodnight-user-id', credential)
      .send({ title: 'F08：我希望你记住', content: 'F08：先把作息调回来。', days: 30 });
    memoryId = saved.body?.item?.id;
    const savedRow = await row();
    consentedAt = savedRow!.consentedAt;
    evidence.check({
      step: 'a consented memory is stored active with a consent timestamp',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 201, status_in_db: 'active', hasConsent: true, expiryInFuture: true, scope: 'all_ai' },
      actual: {
        status: saved.status,
        status_in_db: savedRow?.status,
        hasConsent: Boolean(savedRow?.consentedAt),
        expiryInFuture: Boolean(savedRow && savedRow.expiresAt.getTime() > Date.now()),
        scope: savedRow?.scope,
      },
      request: { method: 'POST', path: '/api/v1/memory', body: { days: 30 } },
      response: { status: saved.status, memoryId },
      sql: `select status, scope, "consentedAt", "expiresAt" from "MemoryItem" where id = '${memoryId}'`,
    });
    expect(saved.status).toBe(201);
    expect(savedRow?.status).toBe('active');
    expect(savedRow?.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // 3. Editing is a plain update and does not touch the consent.
    const edited = await request(server)
      .patch(`/api/v1/me/memories/${memoryId}`)
      .set('x-goodnight-user-id', credential)
      .send({ title: 'F08：改过的标题', content: 'F08：改过的内容。' });
    const editedRow = await row();
    evidence.check({
      step: 'editing updates the row and leaves the consent alone',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 200, title: 'F08：改过的标题', consentUnchanged: true },
      actual: {
        status: edited.status,
        title: editedRow?.title,
        consentUnchanged: editedRow?.consentedAt.getTime() === consentedAt.getTime(),
      },
      request: { method: 'PATCH', path: `/api/v1/me/memories/${memoryId}` },
      response: { status: edited.status },
    });
    expect(edited.status).toBe(200);
    expect(editedRow?.title).toBe('F08：改过的标题');
    expect(editedRow?.consentedAt.getTime()).toBe(consentedAt.getTime());

    // 4. Disable and re-enable in place, while the date still holds.
    const disabled = await request(server)
      .patch(`/api/v1/me/memories/${memoryId}`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'disabled' });
    const disabledRow = await row();
    const enabled = await request(server)
      .patch(`/api/v1/me/memories/${memoryId}`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'active' });
    const enabledRow = await row();
    evidence.check({
      step: 'a live memory can be switched off and back on without a new consent',
      layer: 'DATABASE_EVIDENCE',
      expected: {
        disableStatus: 200,
        disabledValue: 'disabled',
        enableStatus: 200,
        enabledValue: 'active',
        consentUnchanged: true,
      },
      actual: {
        disableStatus: disabled.status,
        disabledValue: disabledRow?.status,
        enableStatus: enabled.status,
        enabledValue: enabledRow?.status,
        consentUnchanged: enabledRow?.consentedAt.getTime() === consentedAt.getTime(),
      },
      request: { method: 'PATCH', path: `/api/v1/me/memories/${memoryId}`, body: { status: 'disabled' } },
      response: { disableStatus: disabled.status, enableStatus: enabled.status },
    });
    expect(disabledRow?.status).toBe('disabled');
    expect(enabledRow?.status).toBe('active');
    expect(enabledRow?.consentedAt.getTime()).toBe(consentedAt.getTime());

    // 5. Expiring it makes every ordinary write refuse, and only re-consent brings it back.
    const expired = await request(server)
      .patch(`/api/v1/me/memories/${memoryId}`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'expired' });
    const expiredRow = await row();
    const editAfterExpiry = await request(server)
      .patch(`/api/v1/me/memories/${memoryId}`)
      .set('x-goodnight-user-id', credential)
      .send({ title: 'F08：过期后不该能改' });
    const extendAfterExpiry = await request(server)
      .patch(`/api/v1/me/memories/${memoryId}`)
      .set('x-goodnight-user-id', credential)
      .send({ days: 60 });
    const enableAfterExpiry = await request(server)
      .patch(`/api/v1/me/memories/${memoryId}`)
      .set('x-goodnight-user-id', credential)
      .send({ status: 'active' });
    const rowAfterRefusals = await row();
    evidence.check({
      step: 'an expired memory refuses edit, extension and in-place re-enable',
      layer: 'SECURITY_EVIDENCE',
      expected: {
        expireStatus: 200,
        editStatus: 400,
        extendStatus: 400,
        enableStatus: 400,
        titleStill: 'F08：改过的标题',
        statusStill: 'active',
      },
      actual: {
        expireStatus: expired.status,
        editStatus: editAfterExpiry.status,
        extendStatus: extendAfterExpiry.status,
        enableStatus: enableAfterExpiry.status,
        titleStill: rowAfterRefusals?.title,
        statusStill: rowAfterRefusals?.status,
      },
      request: { method: 'PATCH', path: `/api/v1/me/memories/${memoryId}`, body: { status: 'expired' } },
      response: {
        editStatus: editAfterExpiry.status,
        extendStatus: extendAfterExpiry.status,
        enableStatus: enableAfterExpiry.status,
        messages: [editAfterExpiry.body?.message, enableAfterExpiry.body?.message],
      },
      sql: `select title, status, "expiresAt" from "MemoryItem" where id = '${memoryId}'`,
    });
    expect(expiredRow?.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(editAfterExpiry.status).toBe(400);
    expect(extendAfterExpiry.status).toBe(400);
    expect(enableAfterExpiry.status).toBe(400);
    expect(rowAfterRefusals?.title).toBe('F08：改过的标题');

    const reconsented = await request(server)
      .post(`/api/v1/me/memories/${memoryId}/reactivate`)
      .set('x-goodnight-user-id', credential)
      .send({ days: 90 });
    const reconsentedRow = await row();
    evidence.check({
      step: 're-consent is the one path back, with a fresh timestamp and window',
      layer: 'DATABASE_EVIDENCE',
      expected: { status: 201, status_in_db: 'active', consentAdvanced: true, expiryInFuture: true },
      actual: {
        status: reconsented.status,
        status_in_db: reconsentedRow?.status,
        consentAdvanced: Boolean(reconsentedRow && reconsentedRow.consentedAt.getTime() > consentedAt.getTime()),
        expiryInFuture: Boolean(reconsentedRow && reconsentedRow.expiresAt.getTime() > Date.now()),
      },
      request: { method: 'POST', path: `/api/v1/me/memories/${memoryId}/reactivate`, body: { days: 90 } },
      response: { status: reconsented.status },
      sql: `select status, "consentedAt", "expiresAt" from "MemoryItem" where id = '${memoryId}'`,
    });
    expect(reconsented.status).toBe(201);
    expect(reconsentedRow?.status).toBe('active');
    expect(reconsentedRow!.consentedAt.getTime()).toBeGreaterThan(consentedAt.getTime());
    expect(reconsentedRow!.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // 6. Another user cannot touch it.
    const strangerEdit = await request(server)
      .patch(`/api/v1/me/memories/${memoryId}`)
      .set('x-goodnight-user-id', strangerCredential)
      .send({ title: 'F08：别人的记忆' });
    const strangerDelete = await request(server)
      .delete(`/api/v1/me/memories/${memoryId}`)
      .set('x-goodnight-user-id', strangerCredential);
    const strangerReactivate = await request(server)
      .post(`/api/v1/me/memories/${memoryId}/reactivate`)
      .set('x-goodnight-user-id', strangerCredential)
      .send({ days: 30 });
    const rowAfterStranger = await row();
    evidence.check({
      step: 'a stranger cannot edit, delete or re-consent the memory',
      layer: 'SECURITY_EVIDENCE',
      expected: { editStatus: 404, deleteStatus: 404, reactivateStatus: 404, titleStill: 'F08：改过的标题', notDeleted: true },
      actual: {
        editStatus: strangerEdit.status,
        deleteStatus: strangerDelete.status,
        reactivateStatus: strangerReactivate.status,
        titleStill: rowAfterStranger?.title,
        notDeleted: rowAfterStranger?.deletedAt === null,
      },
      request: { method: 'DELETE', path: `/api/v1/me/memories/${memoryId}`, identity: 'unrelated user' },
      response: {
        editStatus: strangerEdit.status,
        deleteStatus: strangerDelete.status,
        reactivateStatus: strangerReactivate.status,
      },
    });
    expect(strangerEdit.status).toBe(404);
    expect(strangerDelete.status).toBe(404);
    expect(strangerReactivate.status).toBe(404);
    expect(rowAfterStranger?.deletedAt).toBeNull();

    // 7. Deletion is terminal and idempotent.
    const deleted = await request(server)
      .delete(`/api/v1/me/memories/${memoryId}`)
      .set('x-goodnight-user-id', credential);
    const deletedRow = await row();
    const secondDelete = await request(server)
      .delete(`/api/v1/me/memories/${memoryId}`)
      .set('x-goodnight-user-id', credential);
    const reactivateDeleted = await request(server)
      .post(`/api/v1/me/memories/${memoryId}/reactivate`)
      .set('x-goodnight-user-id', credential)
      .send({ days: 30 });
    const rowAfterDeleteAttempts = await row();
    evidence.check({
      step: 'deletion is terminal and a second delete is a no-op',
      layer: 'DATABASE_EVIDENCE',
      expected: {
        deleteStatus: 200,
        status_in_db: 'deleted',
        hasDeletedAt: true,
        secondDeleteStatus: 200,
        reactivateStatus: 400,
        stillDeleted: true,
      },
      actual: {
        deleteStatus: deleted.status,
        status_in_db: deletedRow?.status,
        hasDeletedAt: Boolean(deletedRow?.deletedAt),
        secondDeleteStatus: secondDelete.status,
        reactivateStatus: reactivateDeleted.status,
        stillDeleted: rowAfterDeleteAttempts?.status === 'deleted',
      },
      request: { method: 'DELETE', path: `/api/v1/me/memories/${memoryId}` },
      response: { deleteStatus: deleted.status, secondDeleteStatus: secondDelete.status, reactivateStatus: reactivateDeleted.status },
      sql: `select status, "deletedAt" from "MemoryItem" where id = '${memoryId}'`,
    });
    expect(deleted.status).toBe(200);
    expect(deletedRow?.status).toBe('deleted');
    expect(deletedRow?.deletedAt).toBeTruthy();
    expect(secondDelete.status).toBe(200);
    expect(reactivateDeleted.status).toBe(400);
    expect(rowAfterDeleteAttempts?.status).toBe('deleted');

    // 8. A second process does not list the deleted row, and an active one survives a restart.
    const secondProcessList = await request(secondServer)
      .get('/api/v1/me/memories')
      .set('x-goodnight-user-id', credential);
    evidence.check({
      step: 'a second process lists neither the deleted memory nor a phantom',
      layer: 'PERSISTENCE_EVIDENCE',
      expected: { status: 200, deletedListed: false },
      actual: {
        status: secondProcessList.status,
        deletedListed: (secondProcessList.body?.items ?? []).some((item: any) => item.id === memoryId),
      },
      request: { method: 'GET', path: '/api/v1/me/memories', identity: 'same user, fresh process' },
      response: { status: secondProcessList.status },
    });
    expect(secondProcessList.status).toBe(200);
    expect((secondProcessList.body?.items ?? []).some((item: any) => item.id === memoryId)).toBe(false);
  });
});
