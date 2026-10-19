import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PublicController } from '../../apps/api/src/controllers.js';
import { StoreService } from '../../apps/api/src/store.service.js';
import { runWithIdentity } from '../../apps/api/src/anonymous-session.service.js';

/**
 * These unit tests call the store directly, so no request carries an identity. Writes require one,
 * so it is published explicitly here rather than inherited from a default.
 */
function asUser<T>(userId: string, fn: () => T): T {
  return runWithIdentity({ userId, sessionId: `unit-${userId}` }, fn);
}

const temporaryFiles: string[] = [];

/**
 * MediaAsset is database-authoritative, so a caller can no longer seed the legacy array; the stub
 * below is the table. `get` answers the feedback screenshot validation, `findOwnedReady` the
 * draft-delete guard, `readyByIds` the ticket decoration, and the rest are the calls the store
 * makes on its way there.
 */
function stubMediaAssetTable(rows: Map<string, any>) {
  return {
    findMany: async ({ where, select }: any = {}) => {
      const ids: string[] = where?.id?.in ?? [...rows.keys()];
      const picked = ids.map((id) => rows.get(id)).filter((row) => {
        if (!row) return false;
        if (where?.userId && row.userId !== where.userId) return false;
        if (where?.status && row.status !== where.status) return false;
        return true;
      });
      return select?.id ? picked.map((row) => ({ id: row.id })) : picked;
    },
    findUnique: async ({ where }: any) => rows.get(where?.id) ?? null,
    findFirst: async ({ where }: any) => (where?.userId ? (rows.get(where.id)?.userId === where.userId ? rows.get(where.id) : null) : rows.get(where.id) ?? null),
    create: async ({ data }: any) => {
      rows.set(data.id, { ...data, size: Number(data.size ?? 0) });
      return rows.get(data.id);
    },
    update: async ({ where, data }: any) => Object.assign(rows.get(where.id), data),
    count: async () => rows.size,
    get: async (id: string) => rows.get(id) ?? null,
    findOwnedReady: async (id: string, userId: string) => {
      const row = rows.get(id);
      return row?.userId === userId && row?.status === 'ready' ? row : null;
    },
    markDeleted: async (id: string) => Object.assign(rows.get(id), { status: 'deleted' }),
    readyByIds: async (ids: string[]) => ids.map((id) => rows.get(id)).filter((row) => row?.status === 'ready'),
  };
}

function createStore(assetRows?: Map<string, any>) {
  const rows = assetRows ?? new Map<string, any>();
  return new StoreService(
    {
      saveRuntimeState: async () => undefined,
      auditLog: { create: async () => undefined },
      // Mood is database-authoritative; the draft-delete guard asks whether any mood carries the asset.
      // The draft-delete guard asks these by `mediaAssetId`; the mood-draft path asks them by mood.
      moodAttachment: { findMany: async () => [], count: async () => 0 },
      diaryAttachment: { findMany: async () => [], count: async () => 0 },
      post: { count: async () => 0 },
      diary: { count: async () => 0 },
      // MediaAsset is database-authoritative; the draft-delete guard reads attachments through it.
      mediaAsset: {
        ...stubMediaAssetTable(rows),
        // The draft-delete guard now asks the join tables by mediaAssetId, so the stub answers
        // them. With no links the reply ticket's screenshot is unattached, which is what makes the
        // 403 below come from the ticket attachment rather than from a missing method.
        moodAttachment: { count: async () => 0 },
        diaryAttachment: { count: async () => 0 },
      },
      letter: { count: async () => 0 },
    } as any,
  );
}

function addFeedbackAsset(store: StoreService, rows: Map<string, any>) {
  const storageKey = `feedback-lifecycle-${Date.now()}-${Math.random().toString(16).slice(2)}.png`;
  const file = path.resolve(process.cwd(), 'data/uploads', storageKey);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from('real-test-image'));
  temporaryFiles.push(file);

  const asset = {
    id: `media_feedback_${Math.random().toString(16).slice(2)}`,
    userId: store.getDemoUserId(),
    storageKey,
    url: `/uploads/${storageKey}`,
    mimeType: 'image/png',
    size: fs.statSync(file).size,
    width: 1,
    height: 1,
    usageType: 'feedback',
    status: 'ready' as const,
    createdAt: new Date().toISOString(),
  };
  rows.set(asset.id, asset);
  return asset;
}

afterEach(() => {
  for (const file of temporaryFiles.splice(0)) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

describe('feedback media and lifecycle', () => {
  it('persists MediaAsset ids, decorates them as real URLs, and protects attached files', async () => {
    const assetRows = new Map<string, any>();
    const store = createStore(assetRows);
    const asset = addFeedbackAsset(store, assetRows);
    const ticket = await asUser('user_demo', () =>
      store.createFeedbackTicket({
        categoryId: 'cat_1',
        content: '截图上传后的反馈',
        sourcePage: '/pages/help/feedback',
        assetIds: [asset.id],
      }),
    );

    expect(ticket.screenshots).toEqual([asset.id]);
    expect((await store.decorateFeedbackTicket(ticket)).screenshots).toEqual([
      expect.objectContaining({ id: asset.id, url: asset.url, mimeType: 'image/png' }),
    ]);
    // The 403 is the draft delete refusing an attached file, not the 404 a foreign id would give:
    // the ticket above is what makes it attached, so the order of these two lines is the point.
    await expect(store.deleteMediaAsset(asset.id)).rejects.toMatchObject({ status: 403 });
    await expect(store.deleteMediaAsset('media_not_uploaded')).rejects.toMatchObject({ status: 404 });
    // The identity is supplied here too: a request with none is refused with 401 before any body
    // validation, so without it this would assert the wrong rejection.
    await expect(
      asUser('user_demo', () =>
        store.createFeedbackTicket({
          categoryId: 'cat_1',
          content: '超过上限的截图',
          assetIds: [asset.id, asset.id, asset.id],
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('moves reply work through processing before a ticket can be resolved', async () => {
    const store = createStore();
    const ticket = await asUser('user_demo', () =>
      store.createFeedbackTicket({ categoryId: 'cat_1', content: '请协助处理', assetIds: [] }),
    );

    await expect(store.updateFeedbackTicketStatus('admin_1', ticket.id, 'resolved')).rejects.toMatchObject({ status: 400 });
    const replied = await store.replyToFeedbackTicket('admin_1', ticket.id, '已经收到，会尽快处理。');
    expect(replied).toMatchObject({ status: 'processing', repliedBy: 'admin_1', reply: '已经收到，会尽快处理。' });

    const resolved = await store.updateFeedbackTicketStatus('admin_1', ticket.id, 'resolved');
    expect(resolved.status).toBe('resolved');
  });

  /**
   * The FAQ route stopped reading the in-memory `store.faqs` array when `FaqItem` became
   * database-authoritative (Batch 4), so the old form of this test - mutate the array, call the
   * route, expect the array's filtering - no longer describes the contract. It also constructed the
   * controller with two arguments while the class now takes six, which is what broke CI.
   *
   * What the route owes the C-end is narrower and still worth pinning at unit level: it serves exactly
   * the persisted rows the service returns, and an empty table yields an empty list rather than
   * display-only fallback questions. (That the table itself filters by `enabled`, and that a disabled
   * FAQ disappears, is asserted against a real database in `batch4-faq-item-gate.spec.ts`.)
   */
  it('serves exactly the persisted FAQ rows, with no display-only fallback when there are none', async () => {
    const store = createStore();
    const rows = [{ id: 'faq_1', question: '怎么联系客服？', answer: '在帮助中心提交反馈。', sortOrder: 1, enabled: true }];
    const feedbackPersistence = { listPublicFaqs: async () => rows };
    const controller = new PublicController(
      store,
      {} as any,
      {} as any,
      {} as any,
      feedbackPersistence as any,
      {} as any,
    );

    expect((await controller.faqs()).items).toEqual(rows);

    feedbackPersistence.listPublicFaqs = async () => [];
    expect((await controller.faqs()).items).toEqual([]);
  });
});
