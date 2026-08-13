import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { StoreService } from '../../apps/api/src/store.service.js';
import { RemoteAiProviderService } from '../../apps/api/src/remote-ai-provider.service.js';

describe('domain services', () => {
  it('routes AI through primary, backup, then template fallback', async () => {
    const definitions = new RemoteAiProviderService();
    const remote = { primaryDefinition: () => definitions.primaryDefinition(), secondaryDefinition: () => definitions.secondaryDefinition(), canFailOver: () => true, generate: async () => ({ model: 'remote-unit-model', result: '这是远程模型生成的测试回应。', durationMs: 12 }) } as any;
    const store = new StoreService({ saveRuntimeState: async () => undefined } as any, remote);
    store.enforceRemoteAiProviderPolicy();
    const ok = await store.runAiJob({ userId: 'user_demo', contentId: 'x', contentType: 'Mood', jobType: '今日回信', style: 'warm', promptSummary: 'hi' });
    expect(ok.modelName).toBe('remote-unit-model');
    expect(ok.status).toBe('succeeded');
    const fallback = await store.runAiJob({ userId: 'user_demo', contentId: 'x', contentType: 'Mood', jobType: '今日回信', style: 'warm', promptSummary: 'hi', simulatePrimaryFail: true, simulateBackupFail: true });
    expect(fallback.status).toBe('fallback');
    expect(fallback.providerId).toBe(store.aiRoutes.find((route) => route.style === 'warm')?.fallbackTemplateId);
  });
  it('keeps privacy settings separate from system defaults', () => {
    const store = new StoreService({ saveRuntimeState: async () => undefined } as any);
    store.systemSettings.defaultVisibility.value = 'PUBLIC';
    expect(store.privacySettings.user_demo.defaultVisibility).toBe('PRIVATE');
  });

  it('writes a diary export as a persisted downloadable media asset', async () => {
    const snapshots: unknown[] = [];
    const persistence = { saveRuntimeState: async (payload: unknown) => { snapshots.push(payload); } };
    const store = new StoreService(persistence as any);
    const result = await store.createDiaryExport();
    const download = store.getDiaryExportDownload(result.asset.id);

    try {
      expect(result.asset.status).toBe('ready');
      expect(result.downloadUrl).toBe(result.asset.url);
      expect(result.asset.url).toContain(`/api/v1/exports/${result.asset.id}/download`);
      expect(fs.existsSync(download.filePath)).toBe(true);
      expect(JSON.parse(fs.readFileSync(download.filePath, 'utf8'))).toMatchObject({
        format: 'goodnight-treehole-diary-export/v1',
        count: result.count,
      });
      expect((snapshots.at(-1) as { assets: Array<{ id: string }> }).assets.some((asset) => asset.id === result.asset.id)).toBe(true);
    } finally {
      fs.rmSync(download.filePath, { force: true });
    }
  });

  it('moderates replies out of public response list', () => {
    const store = new StoreService({ saveRuntimeState: async () => undefined } as any);
    const reply = store.createReply('post_1', { content: '我也在这里', anonymous: true });
    store.moderateReply('admin_1', reply.id, 'block');
    expect(store.replies.filter((item) => item.postId === 'post_1' && item.status === 'published').some((item) => item.id === reply.id)).toBe(false);
  });
});
