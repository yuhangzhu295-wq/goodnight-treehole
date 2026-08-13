import { spawnSync } from 'node:child_process';

const steps = [
  'lint',
  'typecheck',
  'diagnose:front-rest',
  'test:front-phase2-tools',
  'test:front-phase3-me',
  'test:front-rest-cross-flow',
];

for (const step of steps) {
  console.log(`\n==> ${step}`);
  const result = spawnSync('pnpm', [step], { stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
