import { Injectable } from '@nestjs/common';
import type { AIProvider } from '@goodnight/shared-types';
import { assertNoLegacyLocalModelEndpoint, visualFixtureMode } from './runtime-environment.js';

export const DAPI_PROVIDER_ID = 'provider_dapi_deepseek';
export const REMOTE_BACKUP_PROVIDER_ID = 'provider_openai_remote';
export const DAPI_BASE_URL = 'https://api.deepseek.com';
export const REMOTE_BACKUP_BASE_URL = 'https://api.openai.com/v1';

type ChatCompletionResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string }; text?: string }>;
};

export class RemoteProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly canFailOver = false,
  ) {
    super(message);
    this.name = 'RemoteProviderError';
  }
}

export function sanitizeProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/(api[_-]?key|token)=([^\s&]+)/gi, '$1=[redacted]')
    .slice(0, 280);
}

function normalizeUrl(value: string) {
  return value.trim().replace(/\/$/, '');
}

function enabledApiKey(value?: string) {
  const trimmed = String(value ?? '').trim();
  return trimmed || undefined;
}

function isFailoverStatus(status?: number) {
  return status === 401 || status === 429 || Boolean(status && status >= 500);
}

/**
 * OpenAI-compatible remote runtime. It intentionally owns no local-model
 * fallback and never discovers or invokes a loopback model endpoint.
 */
@Injectable()
export class RemoteAiProviderService {
  primaryDefinition(): AIProvider {
    const apiKey = this.primaryApiKey();
    return {
      id: DAPI_PROVIDER_ID,
      name: 'DAPI · DeepSeek',
      type: 'cloud',
      providerKind: 'openai-compatible',
      baseUrl: this.primaryBaseUrl(),
      modelName: this.primaryModel(),
      apiKeyStatus: apiKey ? 'configured' : 'missing',
      enabled: Boolean(apiKey),
      priority: 1,
      dailyLimit: 10_000,
      timeoutSeconds: 30,
      failoverEnabled: true,
      usageTags: ['remote', 'primary', 'dapi', 'deepseek'],
      failureRate: 0,
      avgLatencyMs: 0,
      todayCalls: 0,
      modelMeta: { family: 'openai-compatible', capabilities: ['chat'], discoveredAt: undefined },
    };
  }

  secondaryDefinition(): AIProvider {
    const apiKey = this.secondaryApiKey();
    return {
      id: REMOTE_BACKUP_PROVIDER_ID,
      name: 'OpenAI API · 远程备用',
      type: 'cloud',
      providerKind: 'openai-compatible',
      baseUrl: this.secondaryBaseUrl(),
      modelName: String(process.env.AI_SECONDARY_MODEL ?? '').trim() || 'gpt-4o-mini',
      apiKeyStatus: apiKey ? 'configured' : 'missing',
      enabled: Boolean(apiKey),
      priority: 2,
      dailyLimit: 10_000,
      timeoutSeconds: 30,
      failoverEnabled: false,
      usageTags: ['remote', 'secondary', 'openai'],
      failureRate: 0,
      avgLatencyMs: 0,
      todayCalls: 0,
      modelMeta: { family: 'openai-compatible', capabilities: ['chat'], discoveredAt: undefined },
    };
  }

  async generate(provider: AIProvider, input: { prompt: string; timeoutMs: number; json?: boolean; maxTokens?: number }) {
    if (visualFixtureMode) {
      throw new RemoteProviderError('Visual fixture mode never calls a remote AI provider.', undefined, false);
    }
    const startedAt = Date.now();
    if (provider.id === DAPI_PROVIDER_ID) {
      const endpoint = this.primaryBaseUrl();
      const apiKey = this.primaryApiKey();
      if (!apiKey) throw new RemoteProviderError('DAPI key is not configured.', 401, false);
      const model = this.primaryModel();
      const result = await this.complete({ endpoint, model, prompt: input.prompt, timeoutMs: input.timeoutMs, json: input.json, maxTokens: input.maxTokens, apiKey });
      return { model: result.model || model, result: result.content, durationMs: Math.max(1, Date.now() - startedAt) };
    }
    if (provider.id === REMOTE_BACKUP_PROVIDER_ID) {
      const apiKey = this.secondaryApiKey();
      if (!apiKey) throw new RemoteProviderError('Remote backup API key is not configured.', 401, false);
      const model = String(process.env.AI_SECONDARY_MODEL ?? '').trim() || 'gpt-4o-mini';
      const result = await this.complete({ endpoint: this.secondaryBaseUrl(), model, prompt: input.prompt, timeoutMs: input.timeoutMs, json: input.json, maxTokens: input.maxTokens, apiKey });
      return { model: result.model || model, result: result.content, durationMs: Math.max(1, Date.now() - startedAt) };
    }
    throw new RemoteProviderError('Provider is not permitted by the current remote AI policy.', undefined, false);
  }

  canFailOver(error: unknown) {
    if (error instanceof RemoteProviderError) return error.canFailOver;
    return true;
  }

  private primaryBaseUrl() {
    const configured = normalizeUrl(process.env.DAPI_BASE_URL || process.env.AI_PRIMARY_BASE_URL || DAPI_BASE_URL);
    this.assertRemoteHttps(configured, 'DAPI_BASE_URL');
    return configured;
  }

  private secondaryBaseUrl() {
    const configured = normalizeUrl(process.env.AI_SECONDARY_BASE_URL || REMOTE_BACKUP_BASE_URL);
    this.assertRemoteHttps(configured, 'AI_SECONDARY_BASE_URL');
    return configured;
  }

  private primaryApiKey() {
    return enabledApiKey(process.env.DAPI_API_KEY) ?? enabledApiKey(process.env.AI_PRIMARY_API_KEY) ?? enabledApiKey(process.env.DEEPSEEK_API_KEY);
  }

  private primaryModel() {
    return String(process.env.DAPI_MODEL ?? process.env.AI_PRIMARY_MODEL ?? '').trim() || 'deepseek-chat';
  }

  private secondaryApiKey() {
    return enabledApiKey(process.env.AI_SECONDARY_API_KEY) ?? enabledApiKey(process.env.OPENAI_API_KEY);
  }

  private assertRemoteHttps(endpoint: string, label: string) {
    assertNoLegacyLocalModelEndpoint(endpoint, label);
    let url: URL;
    try { url = new URL(endpoint); } catch { throw new RemoteProviderError(`${label} is not a valid URL.`, undefined, false); }
    if (url.protocol !== 'https:') throw new RemoteProviderError(`${label} must use HTTPS.`, undefined, false);
  }

  private async complete(input: { endpoint: string; model: string; prompt: string; timeoutMs: number; json?: boolean; maxTokens?: number; apiKey?: string }) {
    const payload = await this.requestJson<ChatCompletionResponse>({
      endpoint: input.endpoint,
      path: '/chat/completions',
      method: 'POST',
      timeoutMs: input.timeoutMs,
      apiKey: input.apiKey,
      body: JSON.stringify({
        model: input.model,
        messages: [
          { role: 'system', content: '你是晚安树洞的情绪陪伴助手。用中文回应，不做心理诊断，不作绝对承诺。' },
          { role: 'user', content: input.prompt },
        ],
        temperature: 0.65,
        max_tokens: input.maxTokens ?? 360,
        response_format: input.json ? { type: 'json_object' } : undefined,
      }),
    });
    const content = payload.choices?.[0]?.message?.content?.trim() ?? payload.choices?.[0]?.text?.trim();
    if (!content) throw new RemoteProviderError('Remote provider returned an empty response.', undefined, true);
    return { model: payload.model, content };
  }

  private async requestJson<T>(input: { endpoint: string; path: string; method: 'GET' | 'POST'; timeoutMs: number; apiKey?: string; body?: string }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (input.body) headers['content-type'] = 'application/json';
      if (input.apiKey) headers.authorization = `Bearer ${input.apiKey}`;
      const response = await fetch(`${input.endpoint}${input.path}`, {
        method: input.method,
        headers,
        body: input.body,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new RemoteProviderError(`Remote provider returned HTTP ${response.status}.`, response.status, isFailoverStatus(response.status));
      }
      return await response.json() as T;
    } catch (error) {
      if (error instanceof RemoteProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new RemoteProviderError('Remote provider request timed out.', undefined, true);
      }
      if (error instanceof SyntaxError) {
        throw new RemoteProviderError('Remote provider returned malformed JSON.', undefined, true);
      }
      if (error instanceof TypeError) {
        throw new RemoteProviderError('Remote provider is unreachable.', undefined, true);
      }
      throw new RemoteProviderError('Remote provider returned malformed JSON.', undefined, true);
    } finally {
      clearTimeout(timeout);
    }
  }
}
