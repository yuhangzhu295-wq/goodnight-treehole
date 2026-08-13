import { Injectable } from '@nestjs/common';
import { visualFixtureAiStubAllowed, visualFixtureMode } from './runtime-environment.js';

export interface OllamaModel {
  name: string;
  model: string;
  size: number;
  digest: string;
  modifiedAt?: string;
  family?: string;
  parameterSize?: string;
  quantization?: string;
  capabilities: string[];
}

interface OllamaTagsResponse {
  models?: Array<{
    name?: string;
    model?: string;
    size?: number;
    digest?: string;
    modified_at?: string;
    capabilities?: string[];
    details?: { family?: string; parameter_size?: string; quantization_level?: string };
  }>;
}

interface OllamaGenerateResponse {
  model?: string;
  response?: string;
  total_duration?: number;
}

@Injectable()
export class OllamaService {
  readonly baseUrl = visualFixtureMode
    ? 'http://127.0.0.1:11435'
    : String(process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434').replace(/\/$/, '');

  async listModels(): Promise<OllamaModel[]> {
    this.assertRuntimeAllowed();
    const response = await this.request(`${this.baseUrl}/api/tags`, { method: 'GET' }, 10_000);
    const data = await response.json() as OllamaTagsResponse;
    return (data.models ?? []).map((item) => ({
      name: item.name ?? item.model ?? 'unknown',
      model: item.model ?? item.name ?? 'unknown',
      size: item.size ?? 0,
      digest: item.digest ?? '',
      modifiedAt: item.modified_at,
      family: item.details?.family,
      parameterSize: item.details?.parameter_size,
      quantization: item.details?.quantization_level,
      capabilities: item.capabilities ?? [],
    }));
  }

  async generate(input: { model: string; prompt: string; timeoutMs: number; json?: boolean; maxTokens?: number }) {
    this.assertRuntimeAllowed();
    const startedAt = Date.now();
    const response = await this.request(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        prompt: input.prompt,
        stream: false,
        format: input.json ? 'json' : undefined,
        keep_alive: '5m',
        options: { temperature: 0.65, num_predict: input.maxTokens ?? 360 },
      }),
    }, input.timeoutMs);
    const data = await response.json() as OllamaGenerateResponse;
    const result = data.response?.trim();
    if (!result) throw new Error('Ollama returned an empty response');
    return { model: data.model ?? input.model, result, durationMs: Math.max(1, Date.now() - startedAt), totalDurationNs: data.total_duration };
  }

  private async request(url: string, init: RequestInit, timeoutMs: number) {
    this.assertRuntimeAllowed();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) throw new Error(`Ollama request failed: HTTP ${response.status}`);
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw new Error(`Ollama request timed out after ${Math.ceil(timeoutMs / 1000)} seconds`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private assertRuntimeAllowed() {
    if (visualFixtureMode && !visualFixtureAiStubAllowed()) {
      throw new Error('Visual fixture AI must use the isolated stub at 127.0.0.1:11435.');
    }
  }
}
