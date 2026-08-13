import { spawnSync } from 'node:child_process';
const steps = [
  'lint',
  'typecheck',
  'test:unit',
  'test:api',
  'test:e2e',
  'test:visual',
  'diagnose:all',
  'audit:ui-artifacts',
  'test:real-browser-front-clicks',
  'test:real-browser-admin-clicks',
  'test:real-browser-cross-flow',
  'test:click-all',
  'test:business-flow',
  'test:cross',
];
for (const step of steps) {
  console.log(`\n==> ${step}`);
  const result = spawnSync('pnpm', [step], { stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
