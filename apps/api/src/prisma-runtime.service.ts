import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { isRelationalPrimary, loadRelationalRuntimeState, saveRelationalRuntimeState } from './relational-runtime.mapper.js';
import { assertVisualFixtureRuntime } from './runtime-environment.js';

// Keep local development aligned with docker-compose/.env.example. Production
// and tests always override this through DATABASE_URL.
export const RUNTIME_DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://goodnight:goodnight@127.0.0.1:5432/goodnight_treehole?schema=public';

@Injectable()
export class PrismaRuntimeService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    assertVisualFixtureRuntime();
    super({ datasources: { db: { url: RUNTIME_DATABASE_URL } } });
  }

  async loadRuntimeState<T>() {
    const row = await this.runtimeState.findUnique({ where: { id: 'default' } });
    if (row && isRelationalPrimary(row.payload)) {
      return await loadRelationalRuntimeState(this) as T | undefined;
    }
    return row?.payload as T | undefined;
  }

  async saveRuntimeState(payload: unknown) {
    await saveRelationalRuntimeState(this, payload as Record<string, unknown>);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
