import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://goodnight@127.0.0.1:55432/goodnight_treehole?schema=public';
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

const targetIds = ['job_4c4544c717', 'job_a1257b6c17', 'job_a4d8385f2b'] as const;

function containsLegacyMarker(value: string | null): boolean {
  return Boolean(value && (value.includes('??') || value.toLowerCase().includes('jiaolv')));
}

function normalize(id: string, promptSummary: string | null, result: string | null) {
  if (id === 'job_4c4544c717') {
    if (!promptSummary?.includes('"??":4')) throw new Error(`${id} no longer has the expected legacy prompt marker`);
    return { promptSummary: promptSummary.replace('"??":4', '"未分类":4'), result };
  }

  if (!result?.includes('“??”（未知）') || !result.includes('“jiaolv”')) {
    throw new Error(`${id} no longer has the expected legacy result markers`);
  }
  return {
    promptSummary,
    result: result.replace('“??”（未知）', '“未分类”（未知）').replace('“jiaolv”', '“焦虑”'),
  };
}

async function main() {
  const jobs = await prisma.aIJob.findMany({
    where: { id: { in: [...targetIds] } },
    select: { id: true, promptSummary: true, result: true, updatedAt: true },
  });
  if (jobs.length !== targetIds.length) throw new Error(`Expected ${targetIds.length} legacy jobs, found ${jobs.length}`);

  const evidence: Array<{ id: string; changed: string[]; updatedAt: string }> = [];
  for (const id of targetIds) {
    const job = jobs.find((item) => item.id === id);
    if (!job) throw new Error(`Missing ${id}`);
    const next = normalize(job.id, job.promptSummary, job.result);
    const changed = [
      job.promptSummary !== next.promptSummary ? 'promptSummary' : null,
      job.result !== next.result ? 'result' : null,
    ].filter((field): field is string => Boolean(field));
    if (changed.length === 0) throw new Error(`${id} produced no normalization change`);

    const saved = await prisma.aIJob.update({
      where: { id: job.id },
      data: { promptSummary: next.promptSummary, result: next.result },
      select: { id: true, promptSummary: true, result: true, updatedAt: true },
    });
    if (containsLegacyMarker(saved.promptSummary) || containsLegacyMarker(saved.result)) {
      throw new Error(`${id} still contains a legacy marker after write`);
    }
    evidence.push({ id: saved.id, changed, updatedAt: saved.updatedAt.toISOString() });
  }

  await fs.mkdir(path.resolve('artifacts/traces/final'), { recursive: true });
  await fs.writeFile(
    path.resolve('artifacts/traces/final/legacy-ai-job-text-normalization.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), jobs: evidence }, null, 2),
    'utf8',
  );
  console.log(JSON.stringify({ normalized: evidence }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
