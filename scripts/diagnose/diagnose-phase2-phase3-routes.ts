import fs from 'node:fs/promises';
import { ensureFrontRestDirs, frontRestArtifacts, frontRestRoutes } from './front-rest-common';

async function main() {
  await ensureFrontRestDirs();
  const router = await fs.readFile('apps/mp/src/router.ts', 'utf8');
  const app = await fs.readFile('apps/mp/src/App.vue', 'utf8');
  const rows = frontRestRoutes.map((route) => ({
    route,
    ok: router.includes(route),
    evidence: router.includes(route) ? 'registered in apps/mp/src/router.ts' : 'missing from router',
  }));
  rows.push({
    route: 'tabbar keeps first5-compatible routes',
    ok: app.includes('/pages/letter/index') && app.includes('tab-letter') && app.includes('/pages/tool/index') && app.includes('/pages/me/index'),
    evidence: 'bottom tabbar must keep existing first5 entrypoints',
  });

  const lines = [
    '# Front Rest Route Diagnosis',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| Result | Route | Evidence |',
    '| --- | --- | --- |',
    ...rows.map((row) => `| ${row.ok ? 'PASS' : 'FAIL'} | ${row.route} | ${row.evidence} |`),
    '',
  ];
  await fs.writeFile(frontRestArtifacts.routes, lines.join('\n'));
  if (rows.some((row) => !row.ok)) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
