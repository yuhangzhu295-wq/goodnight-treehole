import { spawnSync } from 'node:child_process';

const steps = [
  'lint',
  'typecheck',
  'qa:first5',
  'qa:front-rest',
  'visual:capture-front',
  'visual:compare-front',
  'diagnose:first5',
  'diagnose:front-rest',
];

for (const step of steps) {
  console.log(`\n==> ${step}`);
  const result = spawnSync('pnpm', [step], { stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
