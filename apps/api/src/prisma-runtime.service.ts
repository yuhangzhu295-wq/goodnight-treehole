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
    // Which database this process is actually pointed at, password removed. "Cannot reach the
    // database" does not say where it was trying, and the URL can come from three places
    // (DATABASE_URL, a .env file, or the fallback above), so the source of a failed connection is
    // worth one line at boot instead of an investigation.
    console.log(`[prisma] connecting to ${RUNTIME_DATABASE_URL.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@')}`);
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
