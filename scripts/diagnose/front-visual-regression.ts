import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';

const steps: Array<{ name: string; args: string[] }> = [
  {
    name: 'capture-layout-after',
    args: ['visual:capture-front', '--', '--phase', 'layout-after', '--out-dir', 'artifacts/screenshots/layout-after'],
  },
  {
    name: 'compare-layout',
    args: [
      'visual:compare-front',
      '--',
      '--phase',
      'layout-after',
      '--screenshots',
      'artifacts/screenshots/layout-after',
      '--out-dir',
      'artifacts/diffs/layout',
    ],
  },
];

async function main(): Promise<void> {
  await fs.mkdir('artifacts/screenshots/layout-after', { recursive: true });
  await fs.mkdir('artifacts/diffs/layout', { recursive: true });
  await fs.mkdir('artifacts/traces/layout', { recursive: true });

  for (const step of steps) {
    console.log(`\n==> ${step.name}`);
    const result = spawnSync('pnpm', step.args, { stdio: 'inherit', shell: true });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
