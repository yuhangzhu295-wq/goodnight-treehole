import fs from 'node:fs/promises';

const frontRoutes = [
  '/pages/square/index',
  '/pages/mood/create',
  '/pages/post/detail',
  '/pages/letter/index',
  '/pages/tool/index',
  '/pages/tool/decompose',
  '/pages/me/index',
  '/pages/diary/list',
  '/pages/report/month',
  '/pages/letter/list',
  '/pages/favorite/list',
  '/pages/settings/privacy',
  '/pages/feedback/index',
];

const adminRoutes = [
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
  '/audit-logs',
];

async function main() {
  await fs.mkdir('artifacts/diagnosis', { recursive: true });
  const frontRouter = await fs.readFile('apps/mp/src/router.ts', 'utf8');
  const adminRouter = await fs.readFile('apps/admin/src/router.ts', 'utf8');
  const result = {
    generatedAt: new Date().toISOString(),
    front: frontRoutes.map((route) => ({ route, present: frontRouter.includes(route) })),
    frontReplySheet: { route: '/pages/post/detail?sheet=reply', independentRoute: frontRouter.includes('post/detail/reply'), expected: 'same-route-state' },
    admin: adminRoutes.map((route) => ({ route, present: adminRouter.includes(route) })),
  };
  await fs.writeFile('artifacts/diagnosis/route-binding-report.json', JSON.stringify(result, null, 2));
  const missing = [...result.front, ...result.admin].filter((item) => !item.present);
  if (missing.length || result.frontReplySheet.independentRoute) {
    console.error(JSON.stringify({ missing, frontReplySheet: result.frontReplySheet }, null, 2));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
