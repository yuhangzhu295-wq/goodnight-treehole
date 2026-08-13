import fs from 'node:fs/promises';
import { ensureFirst5Dirs, first5Artifacts } from './first5-common';

const requiredRoutes = [
  '/pages/square/index',
  '/pages/mood/create',
  '/pages/post/detail',
  '/pages/letter/index',
];

async function main() {
  await ensureFirst5Dirs();
  const router = await fs.readFile('apps/mp/src/router.ts', 'utf8');
  const app = await fs.readFile('apps/mp/src/App.vue', 'utf8');
  const rows = requiredRoutes.map((route) => ({
    route,
    ok: router.includes(route),
    evidence: router.includes(route) ? 'registered in apps/mp/src/router.ts' : 'missing from router',
  }));
  rows.push({
    route: 'tabbar letter',
    ok: app.includes('/pages/letter/index') && app.includes('tab-letter'),
    evidence: app.includes('/pages/letter/index') ? 'tab-letter points to current letter route' : 'tab-letter route missing',
  });

  const lines = [
    '# First5 Route Diagnosis',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| Result | Route | Evidence |',
    '| --- | --- | --- |',
    ...rows.map((row) => `| ${row.ok ? 'PASS' : 'FAIL'} | ${row.route} | ${row.evidence} |`),
    '',
  ];
  await fs.writeFile(first5Artifacts.routes, lines.join('\n'));
  if (rows.some((row) => !row.ok)) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
