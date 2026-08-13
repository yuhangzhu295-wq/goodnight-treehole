import { spawnSync } from 'node:child_process';

const steps = [
  'lint',
  'typecheck',
  'diagnose:first5',
  'test:front-first5-real-user',
  'test:front-first5-business-flow',
];

for (const step of steps) {
  console.log(`\n==> ${step}`);
  const result = spawnSync('pnpm', [step], { stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
