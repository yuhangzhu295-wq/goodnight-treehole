import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceRoots = ['apps/mp/src', 'apps/admin/src'];
const sourceExtensions = new Set(['.vue', '.ts', '.scss']);
const requiredAdminRoutes = [
  '/login',
  '/dashboard',
  '/users',
  '/posts',
  '/replies/moderation',
  '/ai/providers',
  '/ai/routes',
  '/ai/jobs',
  '/ops/feedback',
  '/ops/config',
];

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(file)));
    else files.push(file);
  }
  return files;
}

async function pngFiles(dir: string): Promise<string[]> {
  return (await fs.readdir(dir)).filter((name) => name.endsWith('.png')).sort();
}

async function main(): Promise<void> {
  const [frontRefs, adminRefs, frontManifest, frontRouter, adminRouter, readme] = await Promise.all([
    pngFiles(path.join(root, 'design_refs/front')),
    pngFiles(path.join(root, 'design_refs/admin')),
    fs.readFile(path.join(root, 'scripts/visual/front-pages.ts'), 'utf8'),
    fs.readFile(path.join(root, 'apps/mp/src/router.ts'), 'utf8'),
    fs.readFile(path.join(root, 'apps/admin/src/router.ts'), 'utf8'),
    fs.readFile(path.join(root, 'README.md'), 'utf8'),
  ]);

  const frontendMappings = [...frontManifest.matchAll(/design:\s*'design_refs\/front\/[^']+'/g)].length;
  const frontRoutes = [...frontManifest.matchAll(/route:\s*'([^']+)'/g)].map((match) => match[1].split('?')[0]);
  const missingFrontRoutes = [...new Set(frontRoutes.filter((route) => !frontRouter.includes(`path: '${route}'`)))];
  const missingAdminRoutes = requiredAdminRoutes.filter((route) => !adminRouter.includes(`path: '${route}'`));
  const sourceFiles = (await Promise.all(sourceRoots.map((dir) => walk(path.join(root, dir))))).flat()
    .filter((file) => sourceExtensions.has(path.extname(file)));
  const directReferenceUsages: string[] = [];
  for (const file of sourceFiles) {
    if ((await fs.readFile(file, 'utf8')).includes('design_refs/')) directReferenceUsages.push(path.relative(root, file));
  }

  const failures: string[] = [];
  if (frontRefs.length !== 14) failures.push(`expected 14 front references, received ${frontRefs.length}`);
  if (adminRefs.length !== 10) failures.push(`expected 10 admin references, received ${adminRefs.length}`);
  if (frontendMappings !== 14) failures.push(`expected 14 front visual mappings, received ${frontendMappings}`);
  if (missingFrontRoutes.length > 0) failures.push(`front design routes missing from router: ${missingFrontRoutes.join(', ')}`);
  if (missingAdminRoutes.length > 0) failures.push(`admin design routes missing from router: ${missingAdminRoutes.join(', ')}`);
  if (directReferenceUsages.length > 0) failures.push(`source directly references design_refs: ${directReferenceUsages.join(', ')}`);
  if (/provided design references as the page background|clickable layers above those reference panels/i.test(readme)) {
    failures.push('README still describes the prohibited reference-background/hotspot pattern');
  }

  const report = {
    generatedAt: new Date().toISOString(),
    frontReferenceCount: frontRefs.length,
    adminReferenceCount: adminRefs.length,
    frontVisualMappingCount: frontendMappings,
    missingFrontRoutes,
    missingAdminRoutes,
    directReferenceUsages,
    failures,
    status: failures.length === 0 ? 'PASS' : 'FAIL',
  };
  await fs.mkdir(path.join(root, 'artifacts/resume'), { recursive: true });
  await fs.writeFile(path.join(root, 'artifacts/resume/phase1-design-reference-audit.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
