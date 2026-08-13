import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { ensureFrontRestDirs, frontRestArtifacts } from './front-rest-common';

const steps = [
  { name: 'runtime', command: 'tsx scripts/diagnose/diagnose-phase2-phase3-runtime.ts' },
  { name: 'overlay', command: 'tsx scripts/diagnose/diagnose-phase2-phase3-overlay.ts' },
  { name: 'routes', command: 'tsx scripts/diagnose/diagnose-phase2-phase3-routes.ts' },
  { name: 'api', command: 'tsx scripts/diagnose/diagnose-phase2-phase3-api.ts' },
  { name: 'clickability', command: 'tsx scripts/diagnose/diagnose-phase2-phase3-clickability.ts' },
];

async function readMaybe(file: string) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return '_report not generated_';
  }
}

async function main() {
  await ensureFrontRestDirs();
  const results: Array<{ name: string; ok: boolean; status: number | null }> = [];
  for (const step of steps) {
    console.log(`\n==> front-rest:${step.name}`);
    const [command, ...args] = step.command.split(' ');
    const result = spawnSync(command, args, { stdio: 'inherit', shell: true });
    results.push({ name: step.name, ok: result.status === 0, status: result.status });
  }

  const runtime = await readMaybe(frontRestArtifacts.runtime);
  const overlay = await readMaybe(frontRestArtifacts.overlay);
  const routes = await readMaybe(frontRestArtifacts.routes);
  const api = await readMaybe(frontRestArtifacts.api);
  const clickability = await readMaybe(frontRestArtifacts.clickabilityMd);
  const lines = [
    '# Front Rest Current Diagnosis',
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
  await fs.writeFile(frontRestArtifacts.diagnosis, lines.join('\n'));
  if (results.some((item) => !item.ok)) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
