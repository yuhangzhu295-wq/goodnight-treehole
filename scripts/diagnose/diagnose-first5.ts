import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { ensureFirst5Dirs, first5Artifacts } from './first5-common';

const steps = [
  { name: 'runtime', command: 'tsx scripts/diagnose/diagnose-first5-runtime.ts' },
  { name: 'overlay', command: 'tsx scripts/diagnose/diagnose-first5-overlay.ts' },
  { name: 'routes', command: 'tsx scripts/diagnose/diagnose-first5-routes.ts' },
  { name: 'api', command: 'tsx scripts/diagnose/diagnose-first5-api.ts' },
  { name: 'clickability', command: 'tsx scripts/diagnose/diagnose-first5-clickability.ts' },
];

async function readMaybe(file: string) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return '_report not generated_';
  }
}

async function main() {
  await ensureFirst5Dirs();
  const results: Array<{ name: string; ok: boolean; status: number | null }> = [];
  for (const step of steps) {
    console.log(`\n==> first5:${step.name}`);
    const [command, ...args] = step.command.split(' ');
    const result = spawnSync(command, args, { stdio: 'inherit', shell: true });
    results.push({ name: step.name, ok: result.status === 0, status: result.status });
  }

  const runtime = await readMaybe(first5Artifacts.runtime);
  const overlay = await readMaybe(first5Artifacts.overlay);
  const routes = await readMaybe(first5Artifacts.routes);
  const api = await readMaybe(first5Artifacts.api);
  const clickability = await readMaybe(first5Artifacts.clickabilityMd);
  const lines = [
    '# First5 Current Diagnosis',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| Step | Result | Status |',
    '| --- | --- | --- |',
    ...results.map((item) => `| ${item.name} | ${item.ok ? 'PASS' : 'FAIL'} | ${item.status ?? 'unknown'} |`),
    '',
    '## Runtime',
    '',
    '```json',
    runtime,
    '```',
    '',
    '## Overlay',
    '',
    overlay,
    '',
    '## Routes',
    '',
    routes,
    '',
    '## API',
    '',
    api,
    '',
    '## Clickability',
    '',
    clickability,
    '',
  ];
  await fs.writeFile(first5Artifacts.diagnosis, lines.join('\n'));
  if (results.some((item) => !item.ok)) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
