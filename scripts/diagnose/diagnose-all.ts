import { spawnSync } from 'node:child_process';

const steps = [
  'diagnose:runtime',
  'diagnose:dom-overlays',
  'diagnose:routes',
  'diagnose:api-bindings',
  'diagnose:clickability',
  'audit:ui-artifacts',
];

for (const step of steps) {
  console.log(`\n==> ${step}`);
  const result = spawnSync('pnpm', [step], { stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
