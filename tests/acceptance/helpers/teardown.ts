import type { INestApplication } from '@nestjs/common';

/**
 * Closes a Nest application with a bound.
 *
 * `app.close()` can wait on the Redis socket while the follow-up worker shuts down. Observed in the
 * combined acceptance run as `Hook timed out in 30000ms` in `afterAll` for a file whose single test
 * had passed - a stalled teardown reported as a failed flow, which is the wrong verdict in both
 * directions. The worker bounds its own close, but a test must not depend on that holding every
 * time, so the wait is bounded here too and a stall is reported instead of failing the file.
 */
export async function closeAppBounded(
  app: INestApplication | undefined,
  label: string,
  budgetMs = 20_000,
): Promise<void> {
  if (!app) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<'expired'>((resolve) => {
    timer = setTimeout(() => resolve('expired'), budgetMs);
  });
  try {
    const outcome = await Promise.race([app.close().then(() => 'done' as const), expired]);
    if (outcome === 'expired') {
      console.error(`[acceptance] ${label} close did not finish within ${budgetMs}ms`);
    }
  } catch (error) {
    console.error(`[acceptance] ${label} close failed: ${(error as Error).message}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
