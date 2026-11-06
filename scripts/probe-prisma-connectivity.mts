/**
 * Diagnostic: can this process reach PostgreSQL at all, and with which client shape?
 *
 * Written because the running API reported "Can't reach database server at <ip>:5432" for every
 * query while a separate node process with the same URL succeeded. This reproduces both client
 * shapes from inside `apps/api`, which is where the API process runs, so a difference in runtime or
 * resolution shows up here instead of in the server.
 */
import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL ?? '(unset)';
const shown = url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@');
console.log('[probe] DATABASE_URL =', shown);

async function attempt(label: string, make: () => PrismaClient) {
  const client = make();
  try {
    const rows = await client.$queryRawUnsafe('select 1 as ok');
    console.log(`[probe] ${label}: OK`, JSON.stringify(rows));
  } catch (error) {
    const message = (error as Error).message.split('\n').filter(Boolean).slice(0, 3).join(' | ');
    console.log(`[probe] ${label}: FAIL`, message);
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}

await attempt('datasources shape', () => new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } }));
await attempt('env only', () => new PrismaClient());
