import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { StoreService } from '../../apps/api/src/store.service.js';
import { runWithIdentity } from '../../apps/api/src/anonymous-session.service.js';

/**
 * Two contract breaks the draft-delete guard had after MediaAsset became database-authoritative.
 *
 * 1. The guard passed the *asset id* where a `moodId` was expected, so "is this image attached to
 *    published content" always answered no and an attached image was deleted - leaving the mood and
 *    its post pointing at a file that no longer exists.
 * 2. The lookup was scoped to the demo account while upload attributes the row to the real caller,
 *    so every other user's own draft image was a 404 to its author.
 *
 * Both are asserted here against the store's own service seam, which is where the queries live.
 */
const temporaryFiles: string[] = [];

function createStore(rows: Map<string, any>) {
  const moodAttachmentLinks = new Set<string>();
  const diaryAttachmentLinks = new Set<string>();
  const store = new StoreService(
    {
      saveRuntimeState: async () => undefined,
      auditLog: { create: async () => undefined },
      mediaAsset: {
        findMany: async ({ where }: any = {}) => [...rows.values()].filter((row) => !where?.userId || row.userId === where.userId),
        findUnique: async ({ where }: any) => rows.get(where?.id) ?? null,
        findFirst: async ({ where }: any) =>
          [...rows.values()].find(
            (row) =>
              (!where?.id || row.id === where.id) &&
              (!where?.userId || row.userId === where.userId) &&
              (!where?.status || row.status === where.status),
          ) ?? null,
        create: async ({ data }: any) => {
          rows.set(data.id, { ...data });
          return rows.get(data.id);
        },
        update: async ({ where, data }: any) => Object.assign(rows.get(where.id), data),
        updateMany: async () => ({ count: 0 }),
        count: async () => rows.size,
        // The two calls the delete guard makes. A moodId-shaped query would have been answered here
        // too, which is exactly why the defect was invisible: the stub could not tell the difference.
        moodAttachment: {
          count: async ({ where }: any) => (moodAttachmentLinks.has(where.mediaAssetId) ? 1 : 0),
        },
        diaryAttachment: {
          count: async ({ where }: any) => (diaryAttachmentLinks.has(where.mediaAssetId) ? 1 : 0),
        },
      },
      moodAttachment: { count: async ({ where }: any) => (moodAttachmentLinks.has(where.mediaAssetId) ? 1 : 0) },
      diaryAttachment: { count: async ({ where }: any) => (diaryAttachmentLinks.has(where.mediaAssetId) ? 1 : 0) },
      mood: { count: async () => 0 },
      post: { count: async () => 0 },
      diary: { count: async () => 0 },
      letter: { count: async () => 0 },
      feedbackTicket: { findMany: async () => [] },
      // The ticket guard is a containment query now; with no ticket rows the answer is false.
      $queryRaw: async () => [{ found: false }],
    } as any,
  );
  (store as any).moodsDb = { attachmentIdsFor: async () => [] };
  (store as any).diariesDb = { attachmentIdsFor: async () => [], isAttachedToAnyRow: async () => false };
  return { store, moodAttachmentLinks, diaryAttachmentLinks };
}

function writeUpload(name: string) {
  const file = path.resolve(process.cwd(), 'data/uploads', name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from('real-test-image'));
  temporaryFiles.push(file);
  return { storageKey: name, file };
}

afterEach(() => {
  for (const file of temporaryFiles.splice(0)) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

describe('draft delete: an attached image is refused, and the author can delete their own', () => {
  it('refuses a delete when the asset is attached to a mood', async () => {
    const rows = new Map<string, any>();
    const { store, moodAttachmentLinks } = createStore(rows);
    const { storageKey } = writeUpload(`attached-mood-${Date.now()}.png`);
    rows.set('media_attached_1', {
      id: 'media_attached_1',
      userId: 'user_demo',
      storageKey,
      url: `/uploads/${storageKey}`,
      mimeType: 'image/png',
      size: 15,
      usageType: 'mood',
      status: 'ready',
      createdAt: new Date().toISOString(),
    });
    // The published mood carries this asset.
    moodAttachmentLinks.add('media_attached_1');

    await expect(runWithIdentity({ userId: 'user_demo', sessionId: 'unit-demo' }, () => store.deleteMediaAsset('media_attached_1'))).rejects.toMatchObject({ status: 403 });
    expect(rows.get('media_attached_1').status).toBe('ready');
  });

  it('refuses a delete when the asset is attached to a diary', async () => {
    const rows = new Map<string, any>();
    const { store, diaryAttachmentLinks } = createStore(rows);
    const { storageKey } = writeUpload(`attached-diary-${Date.now()}.png`);
    rows.set('media_attached_2', {
      id: 'media_attached_2',
      userId: 'user_demo',
      storageKey,
      url: `/uploads/${storageKey}`,
      mimeType: 'image/png',
      size: 15,
      usageType: 'mood',
      status: 'ready',
      createdAt: new Date().toISOString(),
    });
    diaryAttachmentLinks.add('media_attached_2');

    await expect(runWithIdentity({ userId: 'user_demo', sessionId: 'unit-demo' }, () => store.deleteMediaAsset('media_attached_2'))).rejects.toMatchObject({ status: 403 });
    expect(rows.get('media_attached_2').status).toBe('ready');
  });

  it('lets the author delete their own unattached draft, not somebody else\'s', async () => {
    const rows = new Map<string, any>();
    const { store } = createStore(rows);
    const storageKeys = ['own-draft.png', 'other-draft.png'].map((name) => {
      const { storageKey } = writeUpload(`${name}-${Date.now()}`);
      return storageKey;
    });
    rows.set('media_own', {
      id: 'media_own', userId: 'user_guest', storageKey: storageKeys[0], url: `/uploads/${storageKeys[0]}`,
      mimeType: 'image/png', size: 15, usageType: 'mood', status: 'ready', createdAt: new Date().toISOString(),
    });
    rows.set('media_other', {
      id: 'media_other', userId: 'user_demo', storageKey: storageKeys[1], url: `/uploads/${storageKeys[1]}`,
      mimeType: 'image/png', size: 15, usageType: 'mood', status: 'ready', createdAt: new Date().toISOString(),
    });

    // The author's own draft, with the caller named - this used to 404 because the lookup was
    // scoped to the demo account the legacy array had.
    await expect(
      runWithIdentity({ userId: 'user_guest', sessionId: 'unit-guest' }, () => store.deleteMediaAsset('media_own', 'user_guest')),
    ).resolves.toBeUndefined();
    expect(rows.get('media_own').status).toBe('deleted');

    // Another user's draft is still not theirs to delete.
    await expect(
      runWithIdentity({ userId: 'user_guest', sessionId: 'unit-guest' }, () => store.deleteMediaAsset('media_other', 'user_guest')),
    ).rejects.toMatchObject({ status: 404 });
    expect(rows.get('media_other').status).toBe('ready');
  });
});

describe('draft delete: a screenshot on a real feedback ticket is refused', () => {
  /**
   * The path the review caught: the ticket check scanned `this.feedbackTickets`, the in-memory array,
   * but the real route writes tickets through `FeedbackPersistenceService` - so a ticket created over
   * HTTP never appeared and its image was deleted out from under it.
   *
   * This drives the real service, not a hand-written replacement: the stub below is the
   * `FeedbackTicket` table and the service runs its actual `$queryRaw` against it. Replacing the
   * service with an object that answers the question itself (an earlier version of this test) would
   * keep passing if the query or its call site regressed.
   */
  function createStoreWithTickets(rows: Map<string, any>, ticketRows: any[]) {
    const store = new StoreService(
      {
        saveRuntimeState: async () => undefined,
        auditLog: { create: async () => undefined },
        mediaAsset: {
          findMany: async () => [...rows.values()],
          findUnique: async ({ where }: any) => rows.get(where?.id) ?? null,
          findFirst: async ({ where }: any) =>
            [...rows.values()].find(
              (row) => (!where?.id || row.id === where.id) && (!where?.userId || row.userId === where.userId) && (!where?.status || row.status === where.status),
            ) ?? null,
          create: async ({ data }: any) => {
            rows.set(data.id, { ...data });
            return rows.get(data.id);
          },
          update: async ({ where, data }: any) => Object.assign(rows.get(where.id), data),
          updateMany: async () => ({ count: 0 }),
          count: async () => rows.size,
          moodAttachment: { count: async () => 0 },
          diaryAttachment: { count: async () => 0 },
          isAttachedToAnyRow: async () => false,
          ownedReadyByIds: async (ids: string[]) => ids.map((id) => rows.get(id)).filter(Boolean),
        },
        moodAttachment: { count: async () => 0 },
        diaryAttachment: { count: async () => 0 },
        mood: { count: async () => 0 },
        post: { count: async () => 0 },
        diary: { count: async () => 0 },
        letter: { count: async () => 0 },
        // The real service's query is `screenshots @> '["<id>"]'::jsonb`; the stub evaluates that
        // containment against the fixture rows, so the service's own code path is what runs.
        $queryRaw: async (strings: any, ...values: any[]) => {
          const sql = String(strings?.raw ?? strings);
          if (!sql.includes('FeedbackTicket')) return [{ found: false }];
          // The service binds exactly one value: the JSON array containing the asset id. Asserting
          // that shape means a future change that prepends a parameter fails loudly here instead of
          // silently answering about the wrong value.
          if (values.length !== 1) throw new Error(`expected one bound parameter, got ${values.length}`);
          const parsed = JSON.parse(String(values[0]));
          if (!Array.isArray(parsed) || parsed.length !== 1) throw new Error(`expected a one-element JSON array, got ${String(values[0])}`);
          const needle = parsed[0];
          return [{ found: ticketRows.some((ticket) => (ticket.screenshots ?? []).includes(needle)) }];
        },
      } as any,
    );
    (store as any).moodsDb = { attachmentIdsFor: async () => [] };
    (store as any).diariesDb = { attachmentIdsFor: async () => [], isAttachedToAnyRow: async () => false };
    return store;
  }

  it('refuses a delete when the asset is a screenshot on a ticket in the table', async () => {
    const rows = new Map<string, any>();
    const ticketRows: any[] = [];
    const store = createStoreWithTickets(rows, ticketRows);
    const { storageKey } = writeUpload(`ticket-shot-${Date.now()}.png`);
    rows.set('media_ticket_1', {
      id: 'media_ticket_1',
      userId: 'user_demo',
      storageKey,
      url: `/uploads/${storageKey}`,
      mimeType: 'image/png',
      size: 15,
      usageType: 'feedback',
      status: 'ready',
      createdAt: new Date().toISOString(),
    });
    ticketRows.push({ id: 'ticket_1', userId: 'user_demo', screenshots: ['media_ticket_1'] });

    await expect(
      runWithIdentity({ userId: 'user_demo', sessionId: 'unit-demo' }, () => store.deleteMediaAsset('media_ticket_1')),
    ).rejects.toMatchObject({ status: 403 });
    expect(rows.get('media_ticket_1').status).toBe('ready');
  });

  it('allows the delete when no ticket references the asset', async () => {
    const rows = new Map<string, any>();
    const ticketRows: any[] = [];
    const store = createStoreWithTickets(rows, ticketRows);
    const { storageKey } = writeUpload(`unreferenced-${Date.now()}.png`);
    rows.set('media_free_1', {
      id: 'media_free_1',
      userId: 'user_demo',
      storageKey,
      url: `/uploads/${storageKey}`,
      mimeType: 'image/png',
      size: 15,
      usageType: 'mood',
      status: 'ready',
      createdAt: new Date().toISOString(),
    });
    // A ticket exists, but references a different asset.
    ticketRows.push({ id: 'ticket_2', userId: 'user_demo', screenshots: ['media_other'] });

    await expect(
      runWithIdentity({ userId: 'user_demo', sessionId: 'unit-demo' }, () => store.deleteMediaAsset('media_free_1')),
    ).resolves.toBeUndefined();
    expect(rows.get('media_free_1').status).toBe('deleted');
  });
});
