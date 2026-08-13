import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAPI_BASE_URL, DAPI_PROVIDER_ID, REMOTE_BACKUP_PROVIDER_ID, RemoteAiProviderService } from '../../apps/api/src/remote-ai-provider.service.js';
import { StoreService } from '../../apps/api/src/store.service.js';

const originalEnv = {
  DAPI_API_KEY: process.env.DAPI_API_KEY,
  AI_PRIMARY_API_KEY: process.env.AI_PRIMARY_API_KEY,
  AI_PRIMARY_BASE_URL: process.env.AI_PRIMARY_BASE_URL,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};

function createStore(remote: { generate: ReturnType<typeof vi.fn> }) {
  const definitions = new RemoteAiProviderService();
  const local = {
    baseUrl: 'disabled://local-model',
    listModels: vi.fn(() => { throw new Error('local discovery must never run'); }),
    generate: vi.fn(() => { throw new Error('local generation must never run'); }),
  };
  const store = new StoreService(
    { loadRuntimeState: async () => null, saveRuntimeState: async () => undefined } as any,
    { primaryDefinition: () => definitions.primaryDefinition(), secondaryDefinition: () => definitions.secondaryDefinition(), canFailOver: () => true, ...remote } as any,
  );
  store.enforceRemoteAiProviderPolicy();
  return { store, local };
}

beforeEach(() => {
  process.env.DAPI_API_KEY = 'test-dapi-key';
  process.env.OPENAI_API_KEY = 'test-openai-key';
  delete process.env.AI_PRIMARY_BASE_URL;
});

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.unstubAllGlobals();
});

describe('DAPI-only provider policy', () => {
  it('sends OpenAI-compatible chat requests to the configured remote DAPI', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.headers).toMatchObject({ authorization: 'Bearer test-dapi-key' });
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe('deepseek-chat');
      expect(body.messages.at(-1).content).toContain('测试远程连接');
      return new Response(JSON.stringify({ model: 'deepseek-v4-flash', choices: [{ message: { content: 'DAPI 远程连接正常。' } }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new RemoteAiProviderService();
    const response = await service.generate(service.primaryDefinition(), { prompt: '测试远程连接', timeoutMs: 5_000 });

    expect(response).toMatchObject({ model: 'deepseek-v4-flash', result: 'DAPI 远程连接正常。' });
    expect(fetchMock).toHaveBeenCalledWith(`${DAPI_BASE_URL}/chat/completions`, expect.any(Object));
  });

  it('keeps the DAPI timeout active until the response body is fully parsed', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => ({
      ok: true,
      status: 200,
      json: () => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      }),
    })));

    const service = new RemoteAiProviderService();
    await expect(service.generate(service.primaryDefinition(), {
      prompt: 'timeout coverage',
      timeoutMs: 20,
    })).rejects.toThrow('Remote provider request timed out.');
  });

  it('disables every historical local provider without discovering local models', async () => {
    const remote = { generate: vi.fn() };
    const { store, local } = createStore(remote);
    store.aiProviders.push({
      id: 'provider_ollama_history', name: '历史本地模型', type: 'local', providerKind: 'ollama', baseUrl: 'http://127.0.0.1:11434', modelName: 'old-model', apiKeyStatus: 'configured', enabled: true,
      priority: 9, dailyLimit: 1, timeoutSeconds: 1, failoverEnabled: true, usageTags: ['local'], failureRate: 0, avgLatencyMs: 0, todayCalls: 0,
    });

    const result = await store.syncOllamaModels();

    expect(result).toMatchObject({ online: false, disabled: true, baseUrl: 'disabled://local-model' });
    expect(local.listModels).not.toHaveBeenCalled();
    expect(local.generate).not.toHaveBeenCalled();
    expect(store.aiProviders.find((item) => item.id === 'provider_ollama_history')).toMatchObject({ enabled: false, failoverEnabled: false });
    expect(store.aiRoutes.every((route) => route.primaryProviderId === DAPI_PROVIDER_ID)).toBe(true);
  });

  it('records a successful DAPI result and never calls the local adapter', async () => {
    const remote = { generate: vi.fn(async () => ({ model: 'deepseek-v4-flash', result: '先让自己慢下来，今晚只做一个很小的动作。', durationMs: 25 })) };
    const { store, local } = createStore(remote);

    const job = await store.runAiJob({
      userId: 'user_demo', contentId: 'dapi-primary', contentType: 'Letter', jobType: 'today_letter', style: 'warm', promptSummary: '今天有点疲惫。',
    });

    expect(job).toMatchObject({ status: 'succeeded', providerId: DAPI_PROVIDER_ID, modelName: 'deepseek-v4-flash', fallbackUsed: false });
    expect(job.result).toContain('慢下来');
    expect(local.generate).not.toHaveBeenCalled();
  });

  it('uses only the remote backup before the safe template fallback', async () => {
    const remote = {
      generate: vi.fn(async (provider: { id: string }) => {
        if (provider.id === DAPI_PROVIDER_ID) throw new Error('primary unavailable');
        return { model: 'gpt-4o-mini', result: '远程备用已经接住这次请求。', durationMs: 30 };
      }),
    };
    const { store, local } = createStore(remote);

    const backupJob = await store.runAiJob({ userId: 'user_demo', contentId: 'remote-backup', contentType: 'Letter', jobType: 'today_letter', style: 'warm', promptSummary: '今天有点疲惫。' });
    expect(backupJob).toMatchObject({ status: 'succeeded', providerId: REMOTE_BACKUP_PROVIDER_ID, fallbackUsed: true, retryCount: 1 });

    remote.generate.mockRejectedValue(new Error('all remote providers unavailable'));
    const fallbackJob = await store.runAiJob({ userId: 'user_demo', contentId: 'template-fallback', contentType: 'Letter', jobType: 'today_letter', style: 'warm', promptSummary: '今天有点疲惫。' });
    expect(fallbackJob).toMatchObject({ status: 'fallback', fallbackUsed: true, providerId: 'provider_safe_template' });
    expect(local.generate).not.toHaveBeenCalled();
  });
});
