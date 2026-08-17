import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export const FOLLOW_UP_QUEUE_NAME = process.env.FOLLOW_UP_QUEUE_NAME ?? 'goodnight-follow-ups';
export const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6380';

let connection: Redis | undefined;
let queue: Queue | undefined;

function redisConnection() {
  connection ??= new Redis(REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  return connection;
}

export function followUpQueue() {
  queue ??= new Queue(FOLLOW_UP_QUEUE_NAME, { connection: redisConnection() });
  return queue;
}

export async function scheduleFollowUp(job: { id: string; kind: string; dueAt: string; userId: string; journeyId?: string; payload?: Record<string, unknown> }) {
  const delay = Math.max(0, Date.parse(job.dueAt) - Date.now());
  await followUpQueue().add(job.kind, job, {
    jobId: job.id,
    delay,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1_000 },
    removeOnComplete: false,
    removeOnFail: false,
  });
  return { queue: FOLLOW_UP_QUEUE_NAME, jobId: job.id, delay };
}

export async function closeFollowUpQueue() {
  await queue?.close();
  await connection?.quit();
  queue = undefined;
  connection = undefined;
}
