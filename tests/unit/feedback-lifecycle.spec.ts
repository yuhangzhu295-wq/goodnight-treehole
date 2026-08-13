import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PublicController } from '../../apps/api/src/controllers.js';
import { StoreService } from '../../apps/api/src/store.service.js';

const temporaryFiles: string[] = [];

function createStore() {
  return new StoreService(
    {
      saveRuntimeState: async () => undefined,
    } as any,
  );
}

function addFeedbackAsset(store: StoreService) {
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
  store.assets.unshift(asset);
  return asset;
}

afterEach(() => {
  for (const file of temporaryFiles.splice(0)) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

describe('feedback media and lifecycle', () => {
  it('persists MediaAsset ids, decorates them as real URLs, and protects attached files', async () => {
    const store = createStore();
    const asset = addFeedbackAsset(store);
    const ticket = await store.createFeedbackTicket({
      categoryId: 'cat_1',
      content: '截图上传后的反馈',
      sourcePage: '/pages/help/feedback',
      assetIds: [asset.id],
    });

    expect(ticket.screenshots).toEqual([asset.id]);
    expect(store.decorateFeedbackTicket(ticket).screenshots).toEqual([
      expect.objectContaining({ id: asset.id, url: asset.url, mimeType: 'image/png' }),
    ]);
    await expect(store.deleteMediaAsset(asset.id)).rejects.toMatchObject({ status: 403 });
    await expect(store.createFeedbackTicket({
      categoryId: 'cat_1',
      content: '超过上限的截图',
      assetIds: [asset.id, asset.id, asset.id],
    })).rejects.toMatchObject({ status: 400 });
  });

  it('moves reply work through processing before a ticket can be resolved', async () => {
    const store = createStore();
    const ticket = await store.createFeedbackTicket({ categoryId: 'cat_1', content: '请协助处理', assetIds: [] });

    await expect(store.updateFeedbackTicketStatus('admin_1', ticket.id, 'resolved')).rejects.toMatchObject({ status: 400 });
    const replied = await store.replyToFeedbackTicket('admin_1', ticket.id, '已经收到，会尽快处理。');
    expect(replied).toMatchObject({ status: 'processing', repliedBy: 'admin_1', reply: '已经收到，会尽快处理。' });

    const resolved = await store.updateFeedbackTicketStatus('admin_1', ticket.id, 'resolved');
    expect(resolved.status).toBe('resolved');
  });

  it('returns only persisted enabled FAQ records to the frontend', () => {
    const store = createStore();
    const controller = new PublicController(store, {} as any);
    const original = store.faqs[0];

    store.faqs = store.faqs.map((item) => item.id === original.id ? { ...item, enabled: false } : item);
    expect(controller.faqs().items.some((item) => item.id === original.id)).toBe(false);

    store.faqs = store.faqs.map((item) => ({ ...item, enabled: false }));
    expect(controller.faqs().items).toEqual([]);
  });
});
