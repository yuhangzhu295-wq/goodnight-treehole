import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const apiBaseUrl = (process.env.GOODNIGHT_API_URL ?? 'http://127.0.0.1:3000/api').replace(/\/$/, '');
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://goodnight@127.0.0.1:55432/goodnight_treehole?schema=public';
const runId = `final-ai-routing-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

type Job = {
  id: string;
  status: string;
  providerId: string;
  modelName: string;
  durationMs: number;
  result?: string;
  fallbackUsed?: boolean;
  errorMessage?: string;
  traceJson?: Array<Record<string, unknown>>;
};

type Evidence = {
  runId: string;
  generatedAt: string;
  apiBaseUrl: string;
  result: 'PASS' | 'FAIL';
  checks: Array<{ name: string; ok: boolean; evidence: unknown }>;
  jobs: Record<string, unknown>;
  error?: string;
};

const evidence: Evidence = {
  runId,
  generatedAt: new Date().toISOString(),
  apiBaseUrl,
  result: 'FAIL',
  checks: [],
  jobs: {},
};

function check(name: string, ok: boolean, details: unknown) {
  evidence.checks.push({ name, ok, evidence: details });
  if (!ok) throw new Error(`${name}: ${JSON.stringify(details)}`);
}

async function api<T>(pathName: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${pathName}`, init);
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${pathName} returned ${response.status}: ${text}`);
  return body as T;
}

async function waitForTerminalJob(id: string) {
  const deadline = Date.now() + 180_000;
  const observedStatuses: string[] = [];
  let job: Job | undefined;
  while (Date.now() < deadline) {
    const response = await api<{ job: Job }>(`/v1/ai/tasks/${id}`);
    job = response.job;
    observedStatuses.push(job.status);
    if (!['queued', 'running'].includes(job.status)) return { job, observedStatuses };
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`AI job ${id} did not reach a terminal state within 180 seconds`);
}

function traceHas(job: Job, match: Record<string, unknown>) {
  return (job.traceJson ?? []).some((event) => Object.entries(match).every(([key, value]) => event[key] === value));
}

function lifecycleComplete(job: Job) {
  return traceHas(job, { event: 'queued', status: 'queued' })
    && traceHas(job, { event: 'running', status: 'running' })
    && (traceHas(job, { event: 'terminal', status: 'succeeded' }) || traceHas(job, { event: 'terminal', status: 'fallback' }));
}

async function waitForPersistedJobs(ids: string[]) {
  const deadline = Date.now() + 90_000;
  let persisted: Array<{
    id: string;
    status: string;
    providerId: string;
    modelName: string;
    durationMs: number | null;
    fallbackUsed: boolean;
    traceJson: unknown;
    completedAt: Date | null;
  }> = [];
  while (Date.now() < deadline) {
    persisted = await prisma.aIJob.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, providerId: true, modelName: true, durationMs: true, fallbackUsed: true, traceJson: true, completedAt: true },
    });
    if (persisted.length === ids.length && persisted.every((job) => job.completedAt && !['queued', 'running'].includes(job.status) && lifecycleComplete(job as Job))) return persisted;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return persisted;
}

function reportMarkdown() {
  return [
    '# Final AI routing proof',
    '',
    `Run: \`${runId}\``,
    `Generated: ${evidence.generatedAt}`,
    '',
    '| Result | Check | Evidence |',
    '| --- | --- | --- |',
    ...evidence.checks.map((item) => `| ${item.ok ? 'PASS' : 'FAIL'} | ${item.name} | ${JSON.stringify(item.evidence).replace(/\|/g, '\\|')} |`),
    '',
    'The three persisted jobs are explicitly marked `FINAL_ACCEPTANCE_*`; their durable trace is retained as acceptance evidence and the marked database rows are removed by the cleanup step so test data does not pollute user operations.',
    '',
  ].join('\n');
}

async function main() {
  const login = await api<{ token: string }>('/admin/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const auth = { authorization: `Bearer ${login.token}` };
  const [providerResponse, routeResponse] = await Promise.all([
    api<{ items: Array<Record<string, any>> }>('/admin/v1/ai/providers?pageSize=100', { headers: auth }),
    api<{ items: Array<Record<string, any>> }>('/admin/v1/ai/routes?pageSize=20', { headers: auth }),
  ]);
  const rational = routeResponse.items.find((item) => item.style === 'rational');
  const warm = routeResponse.items.find((item) => item.style === 'warm');
  const light = routeResponse.items.find((item) => item.style === 'light');
  const rationalPrimary = providerResponse.items.find((item) => item.id === rational?.primaryProviderId);
  const rationalBackup = providerResponse.items.find((item) => item.id === rational?.backupProviderId);
  const warmPrimary = providerResponse.items.find((item) => item.id === warm?.primaryProviderId);
  const warmBackup = providerResponse.items.find((item) => item.id === warm?.backupProviderId);

  check('Rational route uses Qwen as its primary text model', Boolean(rationalPrimary && /^qwen2\.5:7b-instruct/i.test(rationalPrimary.modelName)), rationalPrimary);
  check('Rational route has a distinct, correctly classified safe-template backup and never defaults to LLaVA', Boolean(rationalBackup && rationalPrimary && rationalBackup.id !== rationalPrimary.id && rationalBackup.type === 'template' && rationalBackup.modelName === 'safe-response-template' && !/^llava:/i.test(rationalBackup.modelName)), rationalBackup);
  check('Light route copy has no question-mark corruption', Boolean(light?.label === '轻松一点' && light?.promptTemplate === '轻松一点但不轻浮。' && !/\?{2,}/.test(`${light?.label ?? ''}${light?.promptTemplate ?? ''}`)), light);
  check('Warm route has a text primary and a distinct classified template backup', Boolean(warmPrimary && warmBackup && warmPrimary.id !== warmBackup.id && warmPrimary.usageTags?.includes('text') && warmBackup.type === 'template' && warmBackup.modelName === 'safe-response-template'), { warmPrimary, warmBackup });

  const common = { taskType: 'public_ai_reply', style: 'warm' };
  const primaryStart = await api<{ jobId: string; status: string; job: Job }>('/v1/ai/tasks', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...common, sourceId: `${runId}-primary`, content: `FINAL_ACCEPTANCE_PRIMARY_PROOF_${runId}` }),
  });
  const primaryResult = await waitForTerminalJob(primaryStart.jobId);

  const backupStart = await api<{ jobId: string; status: string; job: Job }>('/v1/ai/tasks', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...common, sourceId: `${runId}-backup`, content: `FINAL_ACCEPTANCE_BACKUP_PROOF_${runId}`, simulatePrimaryFail: true }),
  });
  const backupResult = await waitForTerminalJob(backupStart.jobId);

  const templateStart = await api<{ jobId: string; status: string; job: Job }>('/v1/ai/tasks', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...common, sourceId: `${runId}-template`, content: `FINAL_ACCEPTANCE_TEMPLATE_PROOF_${runId}`, simulatePrimaryFail: true, simulateBackupFail: true }),
  });
  const templateResult = await waitForTerminalJob(templateStart.jobId);

  evidence.jobs = { primary: { start: primaryStart, ...primaryResult }, backup: { start: backupStart, ...backupResult }, template: { start: templateStart, ...templateResult } };
  check('Primary task is an asynchronous queued/running/terminal model call', primaryResult.job.status === 'succeeded' && primaryResult.job.providerId === warmPrimary.id && primaryResult.job.modelName === warmPrimary.modelName && primaryResult.job.durationMs > 0 && lifecycleComplete(primaryResult.job), primaryResult);
  check('Forced primary failure reaches the distinct safe template backup without exposing reasoning', backupResult.job.status === 'fallback' && backupResult.job.fallbackUsed === true && backupResult.job.providerId === warmBackup.id && backupResult.job.modelName === warmBackup.modelName && backupResult.job.durationMs > 0 && lifecycleComplete(backupResult.job) && !/(thinking process|<\/?think>)/i.test(backupResult.job.result ?? '') && traceHas(backupResult.job, { event: 'provider-attempt', role: 'primary', status: 'failed', reason: 'simulated-primary-failure' }) && traceHas(backupResult.job, { event: 'provider-attempt', role: 'backup', status: 'fallback', modelName: warmBackup.modelName, template: true, templateStage: 'backup' }), backupResult);
  check('Forced primary and backup failures reach persisted template fallback', templateResult.job.status === 'fallback' && templateResult.job.fallbackUsed === true && templateResult.job.modelName === 'fallback-template' && lifecycleComplete(templateResult.job) && traceHas(templateResult.job, { event: 'provider-attempt', role: 'primary', status: 'failed', reason: 'simulated-primary-failure' }) && traceHas(templateResult.job, { event: 'provider-attempt', role: 'backup', status: 'failed', reason: 'simulated-backup-failure' }) && traceHas(templateResult.job, { event: 'template-fallback', status: 'fallback', template: true, fallbackUsed: true }), templateResult);

  const persisted = await waitForPersistedJobs([primaryStart.jobId, backupStart.jobId, templateStart.jobId]);
  const persistedById = new Map(persisted.map((job) => [job.id, job]));
  check('All three jobs are persisted in PostgreSQL with terminal trace chains', [primaryStart.jobId, backupStart.jobId, templateStart.jobId].every((id) => {
    const job = persistedById.get(id);
    return Boolean(job && job.completedAt && !['queued', 'running'].includes(job.status) && lifecycleComplete(job as Job));
  }), persisted);

  evidence.result = 'PASS';
}

main().catch((error) => {
  evidence.error = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(evidence.error);
  process.exitCode = 1;
}).finally(async () => {
  const tracesDir = path.resolve('artifacts/traces/final');
  const reportsDir = path.resolve('artifacts/test-report');
  await Promise.all([
    fs.mkdir(tracesDir, { recursive: true }),
    fs.mkdir(reportsDir, { recursive: true }),
  ]);
  await Promise.all([
    fs.writeFile(path.join(tracesDir, `${runId}.json`), JSON.stringify(evidence, null, 2), 'utf8'),
    fs.writeFile(path.join(reportsDir, `${runId}.md`), reportMarkdown(), 'utf8'),
  ]);
  await prisma.$disconnect();
});
