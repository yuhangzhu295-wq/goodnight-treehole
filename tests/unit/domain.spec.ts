import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { StoreService } from '../../apps/api/src/store.service.js';
import { RemoteAiProviderService } from '../../apps/api/src/remote-ai-provider.service.js';
import { runWithIdentity } from '../../apps/api/src/anonymous-session.service.js';

/**
 * These unit tests call the store directly, so no request carries an identity. Writes require one,
 * so it is published explicitly here rather than inherited from a default.
 */
function asUser<T>(userId: string, fn: () => T): T {
  return runWithIdentity({ userId, sessionId: `unit-${userId}` }, fn);
}

/**
 * A StoreService persistence stub that answers the one database read these unit tests now reach:
 * the AI memory-eligibility query. It answers "no consent", so the query returns nothing without
 * touching MemoryItem — these tests are about routing and export, not about memory.
 */
const stubPersistence = {
  saveRuntimeState: async () => undefined,
  privacySetting: { findUnique: async () => null },
  $queryRaw: async () => [],
  // An audit row is also written to the table so an operator action is readable without a restart.
  auditLog: { create: async () => undefined },
  // The AI routing tables are database-authoritative since Batch 4; these tests assert the
  // primary/backup/template order, so the stub answers with one route per style and its providers.
  // upsert/no-op updates keep the in-memory policy's shape for the unit tests; the gate covers the
  // real table behaviour.
  // AIStyleRoute is database-authoritative, so the route this test resolves comes from the table. The
  // stub supplies the warm row the legacy seed used, with the three provider FKs the policy points at
  // the DAPI primary/secondary and the safe template.
    // Mood is database-authoritative; the diary export resolves a mood's attachments through it.
    mood: { findUnique: async () => null, findMany: async () => [], findFirst: async () => null },
    moodAttachment: { findMany: async () => [] },
    diary: { findMany: async () => [], findFirst: async () => null, count: async () => 0 },
  // MediaAsset is database-authoritative; uploads and the export pipeline write through it.
  mediaAsset: { findMany: async () => [], findUnique: async () => null, findFirst: async () => null, create: async (a: any) => ({ id: 'asset', ...a?.data }), update: async () => ({}) },
    diaryAttachment: { findMany: async () => [] },
  aIStyleRoute: {
    findMany: async () => [
      {
        id: 'route_warm',
        style: 'warm',
        primaryProviderId: 'provider_primary',
        backupProviderId: 'provider_secondary',
        fallbackTemplateId: 'provider_safe_template',
        promptVersion: 'v1',
        promptTemplate: 'template',
        label: 'warm',
        taskTypes: ['post_reply', 'today_letter'],
        routeVersion: 1,
        enabled: true,
      },
    ],
    findUnique: async () => null,
    update: async () => null,
  },
  aIProvider: {
    findMany: async () => [],
    // The remote stub generates 'remote-unit-model', so the two managed providers must resolve to it;
    // the safe template keeps its own name.
    findUnique: async ({ where }: any) =>
      where?.id === 'provider_safe_template'
        ? { id: 'provider_safe_template', modelName: 'safe-template', enabled: true, type: 'template', providerKind: 'template' }
        : where?.id
          ? { id: where.id, modelName: 'remote-unit-model', enabled: true, type: 'cloud', providerKind: 'openai-compatible' }
          : null,
    upsert: async () => ({}),
    update: async () => ({}),
  },
};


describe('domain services', () => {
  it('routes AI through primary, backup, then template fallback', async () => {
    // The primary provider is only *enabled* when a key is configured (`enabled: Boolean(apiKey)`),
    // and routing skips a disabled primary before it ever calls generate(). Relying on a developer's
    // .env made this test pass locally and fail in CI, where DAPI_API_KEY is deliberately empty: it
    // got the template instead of the stubbed remote. The keys are set here so the routing path this
    // test is about is actually exercised, and no network call happens because `remote` is a stub.
    const savedPrimary = process.env.DAPI_API_KEY;
    const savedSecondary = process.env.AI_SECONDARY_API_KEY;
    process.env.DAPI_API_KEY = 'unit-test-primary-key';
    process.env.AI_SECONDARY_API_KEY = 'unit-test-secondary-key';
    try {
      const definitions = new RemoteAiProviderService();
      const remote = { primaryDefinition: () => definitions.primaryDefinition(), secondaryDefinition: () => definitions.secondaryDefinition(), canFailOver: () => true, generate: async () => ({ model: 'remote-unit-model', result: '这是远程模型生成的测试回应。', durationMs: 12 }) } as any;
      const store = new StoreService(stubPersistence as any, remote);
      await store.enforceRemoteAiProviderPolicy();
      const ok = await store.runAiJob({ userId: 'user_demo', contentId: 'x', contentType: 'Mood', jobType: '今日回信', style: 'warm', promptSummary: 'hi' });
      expect(ok.modelName).toBe('remote-unit-model');
      expect(ok.status).toBe('succeeded');
      const fallback = await store.runAiJob({ userId: 'user_demo', contentId: 'x', contentType: 'Mood', jobType: '今日回信', style: 'warm', promptSummary: 'hi', simulatePrimaryFail: true, simulateBackupFail: true });
      expect(fallback.status).toBe('fallback');
      // The template the route points at is the built-in last resort. The in-memory route array is
      // gone (AIStyleRoute is database-authoritative), so the assertion reads the definition the
      // policy applies instead - which is what "the route's fallback" means now.
      const route = await (store as any).resolveAiRouteRecord('warm', 'post_reply');
      expect(route.fallbackTemplateId).toBe((store as any).safeTemplateDefinition().id);
      expect(fallback.providerId).toBe(route.fallbackTemplateId);
    } finally {
      if (savedPrimary === undefined) delete process.env.DAPI_API_KEY;
      else process.env.DAPI_API_KEY = savedPrimary;
      if (savedSecondary === undefined) delete process.env.AI_SECONDARY_API_KEY;
      else process.env.AI_SECONDARY_API_KEY = savedSecondary;
    }
  });
  it('keeps privacy settings out of the store: they are database-authoritative from Batch 3', () => {
    const store = new StoreService(stubPersistence as any);
    store.systemSettings.defaultVisibility.value = 'PUBLIC';
    // PrivacySetting is a registered direct-DB model, so the store no longer holds a privacy map at
    // all. The previous assertion read that map; it is replaced by an assertion about the contract
    // that exists now. Reading a privacy *value* needs a database, so those assertions live in the
    // business suite instead of here.
    expect(() => (store as any).privacySettings).toThrow(/is disabled/);
    expect(() => (store as any).data.privacySettings).toThrow(/is disabled/);
  });

  it('writes a diary export as a persisted downloadable media asset', async () => {
    const snapshots: unknown[] = [];
    const persistence = { saveRuntimeState: async (payload: unknown) => { snapshots.push(payload); } };
    const store = new StoreService(persistence as any);
    // The export gate reads privacy from the database now, so this unit test stubs that one
    // collaborator: it is testing the export asset pipeline, not the gate. The gate itself is
    // covered against a real database by `third-stage-privacy-2.spec.ts`.
    (store as any).selfPersistence = {
      getPrivacySettings: async () => ({ allowDataExport: true }),
    };
    // Mood is database-authoritative, so a diary with no attachments of its own resolves them
    // through the mood service. These fixtures carry none, which is what the stub answers.
    (store as any).moodsDb = { listForUser: async () => [], attachmentIdsFor: async () => [], isAttachedToAny: async () => false };
    (store as any).lettersDb = { latestBySourceMoods: async () => new Map() };
    // Diary is too, so the export's diary list comes from the table. The fixtures hold none.
    (store as any).diariesDb = { listForUser: async () => [], attachmentIdsFor: async () => [] };
    // MediaAsset is too: the export writes an asset row for the generated document.
    // The export writes the asset and the download reads it back by id. Without a returned row the
    // download has no storageKey to resolve, which is what the real table provides.
    const createdAssets = new Map<string, any>();
    (store as any).mediaAssetsDb = {
      create: async (input: any) => {
        const data = input?.data ?? input ?? {};
        const row = { ...data, id: data.id, createdAt: new Date().toISOString() };
        createdAssets.set(row.id, row);
        return row;
      },
      markDeleted: async () => ({}),
      get: async (id: string) => createdAssets.get(id) ?? null,
      readyByIds: async () => [],
      // The export resolves its attachments through this, so a diary with attachments needs the rows
      // back rather than the ids alone.
      ownedReadyByIds: async (ids: string[]) => ids.map((id) => createdAssets.get(id)).filter(Boolean),
      isAttachedToAnyRow: async () => false,
    };
    // The identity is stated rather than defaulted: the store no longer picks an owner for a caller
    // that did not name one, so a fixture needing the demo user has to say so.
    const result = await store.createDiaryExport('user_demo');
    const download = await store.getDiaryExportDownload(result.asset.id, 'user_demo');

    try {
      expect(result.asset.status).toBe('ready');
      expect(result.downloadUrl).toBe(result.asset.url);
      expect(result.asset.url).toContain(`/api/v1/exports/${result.asset.id}/download`);
      expect(fs.existsSync(download.filePath)).toBe(true);
      expect(JSON.parse(fs.readFileSync(download.filePath, 'utf8'))).toMatchObject({
        format: 'goodnight-treehole-diary-export/v1',
        count: result.count,
      });
      // The flush no longer carries MediaAsset rows, so the last snapshot must not contain the
      // export; the row lives in the table the stub stands in for.
      expect((snapshots.at(-1) as { assets?: Array<{ id: string }> }).assets ?? []).not.toContainEqual(
        expect.objectContaining({ id: result.asset.id }),
      );
      expect(createdAssets.get(result.asset.id)).toMatchObject({
        id: result.asset.id,
        userId: 'user_demo',
        usageType: 'diary-export',
        status: 'ready',
      });
    } finally {
      fs.rmSync(download.filePath, { force: true });
    }
  });

  it('moderates replies out of public response list', async () => {
    const store = new StoreService(stubPersistence as any);
    // Reply is database-authoritative since Batch 4, so this unit test stubs the two persistence
    // collaborators it now reaches: the favourite pre-fetch used by the post decoration, and the
    // reply rows themselves. The database behaviour is covered by the Batch 4 gate and F12.
    const rows = new Map<string, any>();
    (store as any).favoritesDb = { postIdsForUser: async () => new Set<string>() };
    // Post is database-authoritative too, so `createReply`'s counter projection writes through this
    // stub instead of the in-memory copy the flush no longer hydrates.
    (store as any).postsDb = {
      setReplyCount: async () => undefined,
      // `post_1` is the legacy seed this spec has always used.
      get: async (id: string) =>
        id === 'post_1'
          ? {
              id,
              userId: 'user_demo',
              visibility: 'PUBLIC',
              reviewStatus: 'published',
              status: 'active',
              publishedAt: null,
              createdAt: new Date(),
            }
          : null,
      replyCountsForPosts: async () => new Map<string, number>(),
    };
    (store as any).repliesDb = {
      create: async (input: any) => {
        const row = { id: input.id ?? 'reply_unit_1', ...input, likeCount: 0 };
        rows.set(row.id, row);
        return row;
      },
      get: async (id: string) => rows.get(id) ?? null,
      moderate: async (id: string, action: 'approve' | 'block') => {
        const row = rows.get(id);
        row.status = action === 'approve' ? 'published' : 'blocked';
        return row;
      },
      countsForPosts: async () => new Map<string, number>(),
    };
    // createReply became async when the human-reply gate started reading the database (R-02), so
    // this test has to await it: without the await, `reply` is a Promise and `reply.id` is
    // undefined, which made the assertion below pass against a reply that was never created.
    const reply = await asUser('user_demo', () => store.createReply('post_1', { content: '我也在这里', anonymous: true }));
    expect(reply.id).toBeTruthy();
    await store.moderateReply('admin_1', reply.id, 'block');
    expect((await (store as any).repliesDb.get(reply.id)).status).toBe('blocked');
  });
});
