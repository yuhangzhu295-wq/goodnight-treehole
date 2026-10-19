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

// Async since Batch 4: the DAPI-only policy writes its provider rows through the table, so the
// store is not usable until that write has landed. Awaiting it here is what makes "the historical
// local provider was disabled by the policy" observable instead of a race the assertions lose.
async function createStore(remote: { generate: ReturnType<typeof vi.fn> }) {
  const definitions = new RemoteAiProviderService();
  // The provider and route tables. AIProvider/AIStyleRoute became database-authoritative in Batch 4,
  // so the policy writes and the routing reads both go through these. A stateful stub is what makes
  // "the historical local provider was disabled" observable: the policy writes the row and the
  // assertions read the same rows back.
  const providerRows = new Map<string, any>();
  const routeRows = new Map<string, any>();
  const local = {
    baseUrl: 'disabled://local-model',
    listModels: vi.fn(() => { throw new Error('local discovery must never run'); }),
    generate: vi.fn(() => { throw new Error('local generation must never run'); }),
  };
  const store = new StoreService(
    // MemoryItem became database-authoritative in Batch 3, so the AI-context read now queries the
    // database. This spec is about provider policy, not memory, so the stub answers with "no
    // consent": the eligibility query then returns nothing without touching MemoryItem at all.
    {
      loadRuntimeState: async () => null,
      saveRuntimeState: async () => undefined,
      privacySetting: { findUnique: async () => null },
      $queryRaw: async () => [],
      // AIProvider and AIStyleRoute are database-authoritative since Batch 4, so the routing reads
      // and the policy writes go through the service this spec is exercising. The stub is the table:
      // `findMany` is what listRoutes reads, and the policy's own writes land here and nowhere else,
      // which is why the assertions below read the store's service rather than an array.
      aIProvider: {
        findMany: async () => [...providerRows.values()],
        // The service passes a bare id string (`findUnique({ where: id })`) for provider lookups, and
        // `{ where: { style } }` for routes, so both shapes are answered.
        findUnique: async (args: any) => {
          const where = typeof args?.where === 'string' ? { id: args.where } : (args?.where ?? {});
          return providerRows.get(where.id) ?? (where.style ? [...routeRows.values()].find((row) => row.style === where.style) ?? null : null);
        },
        findFirst: async ({ where }: any) =>
          [...providerRows.values()].find((row) =>
            Object.entries(where ?? {}).every(([key, value]) => row[key] === value || (Array.isArray(value) && value.includes(row[key]))),
          ) ?? null,
        create: async ({ data }: any) => {
          providerRows.set(data.id, { ...data });
          return providerRows.get(data.id);
        },
        update: async (args: any) => {
          const id = typeof args?.where === 'string' ? args.where : args?.where?.id;
          Object.assign(providerRows.get(id), args.data);
          return providerRows.get(id);
        },
        // `saveProvider` upserts on a bare id string, so `where` is the id here, not `{ id }`.
        upsert: async (args: any) => {
          const id = typeof args?.where === 'string' ? args.where : args?.where?.id;
          const existing = providerRows.get(id);
          if (existing) Object.assign(existing, args.update);
          else providerRows.set(id, { id, ...args.create });
          return providerRows.get(id);
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const row of providerRows.values()) {
            if (Object.entries(where ?? {}).every(([key, value]) => row[key] === value)) {
              Object.assign(row, data);
              count += 1;
            }
          }
          return { count };
        },
        count: async () => providerRows.size,
      },
      aIStyleRoute: {
        // The routes the store's `loadLegacyStore` used to seed, so the DAPI-only policy has the
        // same five styles to retarget. Without them `resolveAiRouteRecord` returns null and every
        // runAiJob in this spec fails on "no route" before the provider policy is exercised at all.
        findMany: async () => [...routeRows.values()],
        findUnique: async (args: any) => {
          const where = typeof args?.where === 'string' ? { id: args.where } : (args?.where ?? {});
          return routeRows.get(where.id) ?? (where.style ? [...routeRows.values()].find((row) => row.style === where.style) ?? null : null);
        },
        findFirst: async ({ where }: any) =>
          [...routeRows.values()].find((row) => Object.entries(where ?? {}).every(([key, value]) => row[key] === value)) ?? null,
        create: async ({ data }: any) => {
          routeRows.set(data.id, { ...data });
          return routeRows.get(data.id);
        },
        update: async ({ where, data }: any) => {
          Object.assign(routeRows.get(where.id), data);
          return routeRows.get(where.id);
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const row of routeRows.values()) {
            if (Object.entries(where ?? {}).every(([key, value]) => row[key] === value)) {
              Object.assign(row, data);
              count += 1;
            }
          }
          return { count };
        },
      },
    } as any,
    { primaryDefinition: () => definitions.primaryDefinition(), secondaryDefinition: () => definitions.secondaryDefinition(), canFailOver: () => true, ...remote } as any,
  );
  await store.enforceRemoteAiProviderPolicy();
  // The five styles the legacy store seeded, so `resolveAiRouteRecord` has the same rows the real
  // table has. Without them every runAiJob below fails on "no route" before the policy is exercised.
  for (const style of ['warm', 'rational', 'light', 'clear', 'poetic']) {
    routeRows.set(`route_${style}`, {
      id: `route_${style}`,
      style,
      // The ids the policy itself writes (primary = DAPI, backup = the remote OpenAI, fallback = the
      // safe template). Seeding with the ids the policy sets means this seed is a snapshot of the
      // table the policy would have produced, not a competing definition of it.
      primaryProviderId: DAPI_PROVIDER_ID,
      backupProviderId: REMOTE_BACKUP_PROVIDER_ID,
      fallbackTemplateId: 'provider_safe_template',
      promptVersion: 1,
      enabled: true,
      taskTypes: [],
    });
  }
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
    const { store, local } = await createStore(remote);
    // AIProvider is database-authoritative since Batch 4, so the historical local row the policy has
    // to disable is written to the table the service reads. The assertions below read the same
    // service, which is what makes "disabled" observable rather than an array edit nobody flushes.
    await (store as any).prisma.aIProvider.create({
      data: {
        id: 'provider_ollama_history', name: '历史本地模型', type: 'local', providerKind: 'ollama', baseUrl: 'http://127.0.0.1:11434', modelName: 'old-model', apiKeyStatus: 'configured', enabled: true,
        priority: 9, dailyLimit: 1, timeoutSeconds: 1, failoverEnabled: true, usageTags: ['local'], failureRate: 0, avgLatencyMs: 0, todayCalls: 0,
      },
    });

    const result = await store.syncOllamaModels();

    expect(result).toMatchObject({ online: false, disabled: true, baseUrl: 'disabled://local-model' });
    expect(local.listModels).not.toHaveBeenCalled();
    expect(local.generate).not.toHaveBeenCalled();
    const afterPolicy = await (store as any).aiRoutingDb.getProvider('provider_ollama_history');
    expect(afterPolicy).toMatchObject({ enabled: false, failoverEnabled: false });
    const routes = await (store as any).aiRoutingDb.listRoutes();
    expect(routes.every((route: any) => route.primaryProviderId === DAPI_PROVIDER_ID)).toBe(true);
  });

  it('records a successful DAPI result and never calls the local adapter', async () => {
    const remote = { generate: vi.fn(async () => ({ model: 'deepseek-v4-flash', result: '先让自己慢下来，今晚只做一个很小的动作。', durationMs: 25 })) };
    const { store, local } = await createStore(remote);

    const job = await store.runAiJob({
      userId: 'user_demo', contentId: 'dapi-primary', contentType: 'Letter', jobType: 'today_letter', style: 'warm', promptSummary: '今天有点疲惫。',
    });

    expect(job).toMatchObject({ status: 'succeeded', providerId: DAPI_PROVIDER_ID, modelName: 'deepseek-v4-flash', fallbackUsed: false });
    expect(job.result).toContain('慢下来');
    expect(local.generate).not.toHaveBeenCalled();
  });

  it('uses only the remote backup before the safe template fallback', async () => {
    const remote = {
      // `canFailOver` decides whether a primary error stops the candidate loop. A timeout does not
      // fail over (retrying a dead primary is the loop), a 5xx does. This case is the 5xx shape, so
      // the loop reaches the backup at all - without the flag the break above stops at the primary
      // and the safe template answers, which is the same product behaviour with a different error.
      canFailOver: (error: unknown) => !/timed out|timeout/i.test(String(error)),
      generate: vi.fn(async (provider: { id: string }) => {
        if (provider.id === DAPI_PROVIDER_ID) throw new Error('primary unavailable (502)');
        return { model: 'gpt-4o-mini', result: '远程备用已经接住这次请求。', durationMs: 30 };
      }),
    };
    const { store, local } = await createStore(remote);

    const backupJob = await store.runAiJob({ userId: 'user_demo', contentId: 'remote-backup', contentType: 'Letter', jobType: 'today_letter', style: 'warm', promptSummary: '今天有点疲惫。' });
    expect(backupJob).toMatchObject({ status: 'succeeded', providerId: REMOTE_BACKUP_PROVIDER_ID, fallbackUsed: true, retryCount: 1 });

    remote.generate.mockRejectedValue(new Error('all remote providers unavailable'));
    const fallbackJob = await store.runAiJob({ userId: 'user_demo', contentId: 'template-fallback', contentType: 'Letter', jobType: 'today_letter', style: 'warm', promptSummary: '今天有点疲惫。' });
    expect(fallbackJob).toMatchObject({ status: 'fallback', fallbackUsed: true, providerId: 'provider_safe_template' });
    expect(local.generate).not.toHaveBeenCalled();
  });
});
