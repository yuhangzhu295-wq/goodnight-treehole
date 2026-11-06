import { Inject, Injectable } from '@nestjs/common';
import { PrismaRuntimeService } from './prisma-runtime.service.js';

/**
 * Database authority for `AIProvider` and `AIStyleRoute`.
 *
 * These two move as a pair (`BATCH4_LEGACY_FLUSH_RETIREMENT.md` §5d, task
 * B4-AIPROVIDER-ROUTE-PAIR): `AIStyleRoute` carries three foreign keys into `AIProvider`
 * (primary/backup/fallback), so registering one without the other would strand the route rows on a
 * provider the flush no longer writes.
 *
 * They are also the pair the DAPI policy rewrites on every `reloadRuntimeState()` — that is, after
 * every follow-up delivery. While the flush still wrote these tables, that rewrite was one of the
 * two writers contending on the `User` row (`WORKER-RELOAD-FLUSH-LOCK`). With this service the
 * policy's writes go to the table and the flush stops touching either model.
 */
export type ProviderRow = {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  modelName: string;
  apiKeySecretRef: string | null;
  enabled: boolean;
  priority: number;
  dailyLimit: number;
  timeoutSeconds: number;
  failoverEnabled: boolean;
  usageTags: unknown;
  providerKind: string;
  apiKeyStatus: string;
  failureRate: number;
  avgLatencyMs: number;
  todayCalls: number;
  modelMeta: unknown;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class AiRoutingPersistenceService {
  constructor(@Inject(PrismaRuntimeService) private readonly prisma: PrismaRuntimeService) {}

  async listProviders() {
    return this.prisma.aIProvider.findMany({ orderBy: { priority: 'asc' } });
  }

  async getProvider(id: string) {
    return this.prisma.aIProvider.findUnique({ where: { id } });
  }

  async listRoutes() {
    return this.prisma.aIStyleRoute.findMany({ orderBy: { style: 'asc' } });
  }

  async getRouteByStyle(style: string) {
    return this.prisma.aIStyleRoute.findUnique({ where: { style: style as never } });
  }

  /** upsert on the caller's id: the policy re-applies the same definitions on every reload. */
  async saveProvider(input: {
    id: string;
    name: string;
    type: string;
    baseUrl: string;
    modelName: string;
    enabled: boolean;
    priority: number;
    dailyLimit: number;
    timeoutSeconds: number;
    failoverEnabled: boolean;
    usageTags: unknown;
    providerKind: string;
    apiKeyStatus: string;
    modelMeta?: unknown;
  }) {
    const data = {
      name: input.name,
      type: input.type as never,
      baseUrl: input.baseUrl,
      modelName: input.modelName,
      enabled: input.enabled,
      priority: input.priority,
      dailyLimit: input.dailyLimit,
      timeoutSeconds: input.timeoutSeconds,
      failoverEnabled: input.failoverEnabled,
      usageTags: (input.usageTags ?? []) as never,
      providerKind: input.providerKind,
      apiKeyStatus: input.apiKeyStatus,
      ...(input.modelMeta === undefined ? {} : { modelMeta: input.modelMeta as never }),
    };
    return this.prisma.aIProvider.upsert({ where: { id: input.id }, create: { id: input.id, ...data }, update: data });
  }

  /**
   * The policy's provider disable pass.
   *
   * `usageTags` is a Json column, so the tag is appended by rewriting the array rather than with a
   * SQL `array_append` — the row is small and this runs only where the in-memory version ran.
   */
  async applyPolicyToProviders(
    managedIds: string[],
    policy: { disableUnmanaged: boolean; markLocalMissing: boolean },
  ) {
    const rows = await this.prisma.aIProvider.findMany();
    for (const row of rows) {
      const managed = managedIds.includes(row.id);
      const template = row.providerKind === 'template' || row.type === 'template';
      const data: Record<string, unknown> = {};
      if (policy.markLocalMissing && (row.type === 'local' || row.providerKind === 'ollama')) {
        data.apiKeyStatus = 'missing';
      }
      if (policy.disableUnmanaged && !managed && !template) {
        data.enabled = false;
        data.failoverEnabled = false;
        const tags = Array.isArray(row.usageTags) ? [...row.usageTags] : [];
        if (!tags.includes('disabled-by-policy')) data.usageTags = [...tags, 'disabled-by-policy'];
      }
      if (Object.keys(data).length) {
        await this.prisma.aIProvider.update({ where: { id: row.id }, data: data as never });
      }
    }
  }

  /** The policy's route rewrite: point every style at the managed providers and bump the version. */
  async applyPolicyToRoutes(primaryId: string, backupId: string, fallbackTemplateId: string) {
    const rows = await this.prisma.aIStyleRoute.findMany();
    for (const row of rows) {
      const changed = row.primaryProviderId !== primaryId || row.backupProviderId !== backupId || !row.fallbackTemplateId;
      // `timeoutSeconds` belongs to the provider, not the route; the in-memory policy used to set it
      // on the route object where nothing read it. It is not written here.
      await this.prisma.aIStyleRoute.update({
        where: { id: row.id },
        data: {
          primaryProviderId: primaryId,
          backupProviderId: backupId,
          fallbackTemplateId,
          promptVersion: `dapi-${row.style}-v1`,
          routeVersion: changed ? Math.max(1, Number(row.routeVersion ?? 0)) + 1 : Math.max(1, Number(row.routeVersion ?? 0)),
        },
      });
    }
  }

  async saveRoute(input: {
    id?: string;
    style: string;
    primaryProviderId: string;
    backupProviderId: string;
    fallbackTemplateId: string;
    promptVersion: string;
    promptTemplate: string;
    label?: string;
    taskTypes?: unknown;
    enabled: boolean;
    bumpVersion?: boolean;
  }) {
    const data = {
      primaryProviderId: input.primaryProviderId,
      backupProviderId: input.backupProviderId,
      fallbackTemplateId: input.fallbackTemplateId,
      promptVersion: input.promptVersion,
      promptTemplate: input.promptTemplate,
      label: input.label ?? '',
      taskTypes: (input.taskTypes ?? []) as never,
      enabled: input.enabled,
      routeVersion: 1,
    };
    return input.id
      ? this.prisma.aIStyleRoute.upsert({ where: { id: input.id }, create: { id: input.id, style: input.style as never, ...data }, update: data })
      : this.prisma.aIStyleRoute.upsert({
          where: { style: input.style as never },
          create: { style: input.style as never, ...data },
          update: data,
        });
  }
}
