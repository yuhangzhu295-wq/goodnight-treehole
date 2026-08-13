import fs from 'node:fs/promises';
import path from 'node:path';

const apiBase = String(process.env.API_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const providerId = 'provider_dapi_deepseek';

async function json(url: string, init?: RequestInit) {
  const response = await fetch(`${apiBase}${url}`, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${url} failed: HTTP ${response.status} ${payload.message ?? ''}`.trim());
  return payload;
}

async function waitForJob(token: string, jobId: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const payload = await json(`/api/admin/v1/ai/jobs/${jobId}`, { headers: { authorization: `Bearer ${token}` } });
    if (!['queued', 'running'].includes(payload.item?.status)) return payload.item;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`DAPI AiJob ${jobId} did not finish within 120 seconds`);
}

async function main() {
  if (!process.env.DAPI_API_KEY && !process.env.AI_PRIMARY_API_KEY && !process.env.DEEPSEEK_API_KEY) {
    throw new Error('No supplied DAPI key was found in the process environment.');
  }

  const login = await json('/api/admin/v1/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const auth = { authorization: `Bearer ${login.token}`, 'content-type': 'application/json' };
  const providerTest = await json(`/api/admin/v1/ai/providers/${providerId}/test`, { method: 'POST', headers: auth });
  if (!providerTest.ok || providerTest.item?.providerId !== providerId) throw new Error('DAPI provider test did not succeed.');

  const regeneration = await json('/api/v1/tools/run', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'sleep-comfort', style: 'warm', content: `DAPI 真实验收 ${Date.now()}：今晚有些紧张，请给一个具体而温柔的小建议。` }),
  });
  const job = await waitForJob(login.token, regeneration.jobId);
  const checks = {
    providerTestSucceeded: providerTest.ok === true,
    jobSucceeded: job.status === 'succeeded',
    usedDapi: job.providerId === providerId,
    remoteModelRecorded: Boolean(job.modelName && /deepseek/i.test(job.modelName)),
    resultRecorded: String(job.result ?? '').trim().length > 10,
    terminalTraceRecorded: Array.isArray(job.traceJson) && job.traceJson.some((entry: any) => entry.event === 'terminal' && entry.status === 'succeeded'),
  };
  if (Object.values(checks).some((value) => !value)) throw new Error(`DAPI acceptance failed: ${JSON.stringify(checks)}`);

  const report = {
    generatedAt: new Date().toISOString(),
    apiBase,
    providerId,
    providerModel: providerTest.item.modelName,
    providerDurationMs: providerTest.item.durationMs,
    job: { id: job.id, status: job.status, providerId: job.providerId, modelName: job.modelName, durationMs: job.durationMs, fallbackUsed: job.fallbackUsed },
    checks,
  };
  const reportDir = path.resolve('artifacts', 'test-report');
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(path.join(reportDir, 'dapi-live-report.json'), JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(path.join(reportDir, 'dapi-live-report.md'), [
    '# DAPI live acceptance', '',
    `- Generated: ${report.generatedAt}`,
    `- Provider: ${providerId}`,
    `- Provider model: ${report.providerModel}`,
    `- AiJob: ${job.id}`,
    `- AiJob status: ${job.status}`,
    `- AiJob model: ${job.modelName}`,
    `- Fallback used: ${Boolean(job.fallbackUsed)}`,
    '', '## Checks',
    ...Object.entries(checks).map(([name, value]) => `- ${value ? 'PASS' : 'FAIL'} ${name}`),
    '', 'No API key or authorization token is written to this report.', '',
  ].join('\n'), 'utf8');
  console.log(JSON.stringify(report));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
