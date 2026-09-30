/* global process, console */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const writeJson = (p, v) => {
  fs.mkdirSync(path.dirname(path.join(ROOT, p)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, p), JSON.stringify(v, null, 2) + '\n');
};

// ---------- 1. MP routes ----------
const mpRouterSrc = read('apps/mp/src/router.ts');
const mpImportRe = /const\s+(\w+)\s*=\s*\(\)\s*=>\s*import\('\.\/views\/([\w.]+)'\)/g;
const mpViewByConst = {};
let m;
while ((m = mpImportRe.exec(mpRouterSrc))) mpViewByConst[m[1]] = m[2];

const mpRouteRe = /\{\s*path:\s*'([^']+)'\s*,\s*(?:redirect:\s*'([^']+)'\s*,?|component:\s*(\w+)\s*,?)\s*\}/g;
const mpRoutes = [];
while ((m = mpRouteRe.exec(mpRouterSrc))) {
  const [, p, redirect, comp] = m;
  mpRoutes.push({
    path: p,
    component: redirect ? null : mpViewByConst[comp] ?? comp,
    componentConst: redirect ? null : comp,
    redirect: redirect ?? null,
  });
}
const tabRoutes = (mpRouterSrc.match(/tabRoutes\s*=\s*\[([^\]]+)\]/) || [])[1]
  ?.split(',')
  .map((s) => s.trim().replace(/^'|'$/g, ''))
  .filter(Boolean) ?? [];

// group routes by component (alias groups)
const mpByView = {};
for (const r of mpRoutes) {
  if (!r.component) continue;
  (mpByView[r.component] ??= []).push(r.path);
}
const mpRouteInventory = mpRoutes.map((r) => ({
  ...r,
  tabRoute: tabRoutes.includes(r.path),
  aliasGroup: r.component ? mpByView[r.component] : [],
  aliasCount: r.component ? mpByView[r.component].length : 0,
  legacyOrCurrent: r.component && mpByView[r.component].length > 1 ? 'ALIAS' : 'CURRENT',
  sourceFile: 'apps/mp/src/router.ts',
}));

// ---------- 2. Admin routes ----------
const adminRouterSrc = read('apps/admin/src/router.ts');
const adminImportRe = /import\s+(\w+)\s+from\s+'\.\/views\/([\w.]+)'/g;
const adminViewByConst = {};
while ((m = adminImportRe.exec(adminRouterSrc))) adminViewByConst[m[1]] = m[2];
const adminRouteRe = /\{\s*path:\s*'([^']+)'\s*,\s*(?:redirect:\s*'([^']+)'|component:\s*(\w+))([^}]*)\}/g;
const adminRoutes = [];
while ((m = adminRouteRe.exec(adminRouterSrc))) {
  const [, p, redirect, comp, rest] = m;
  const title = (rest.match(/title:\s*'([^']+)'/) || [])[1] ?? null;
  const resource = (rest.match(/resource:\s*'([^']+)'/) || [])[1] ?? null;
  adminRoutes.push({
    path: p,
    component: redirect ? null : adminViewByConst[comp] ?? comp,
    redirect: redirect ?? null,
    title,
    resource,
    viaTablePage: !redirect && (adminViewByConst[comp] ?? comp) === 'TablePage.vue',
  });
}
// explicit resource list from menuGroups (covers TablePage resources)
const menuItemRe = /\{\s*path:\s*'([^']+)',\s*label:\s*'([^']+)',\s*resource:\s*'([^']+)',\s*group:\s*'([^']+)'\s*\}/g;
const adminMenu = [];
while ((m = menuItemRe.exec(adminRouterSrc))) {
  adminMenu.push({ path: m[1], label: m[2], resource: m[3], group: m[4] });
}
for (const item of adminMenu) {
  const found = adminRoutes.find((r) => r.path === item.path);
  if (found) {
    found.title ??= item.label;
    found.resource ??= item.resource;
    found.group = item.group;
  } else {
    // generated TablePage route (built from menuGroups via .map in router.ts)
    adminRoutes.push({
      path: item.path,
      component: 'TablePage.vue',
      redirect: null,
      title: item.label,
      resource: item.resource,
      viaTablePage: true,
      generatedFromMenu: true,
    });
  }
}

// ---------- 3. API endpoints ----------
const controllersSrc = read('apps/api/src/controllers.ts');
const ctrlRe = /@Controller\('([^']+)'\)\s*\nexport class (\w+)/g;
const controllers = [];
while ((m = ctrlRe.exec(controllersSrc))) controllers.push({ base: m[1], class: m[2], index: m.index });
for (let i = 0; i < controllers.length; i++) controllers[i].end = controllers[i + 1]?.index ?? controllersSrc.length;
const methodRe = /@(Get|Post|Patch|Put|Delete)\(([^)]*)\)/g;
const apiEndpoints = [];
for (const c of controllers) {
  const body = controllersSrc.slice(c.index, c.end);
  const baseOffset = c.index;
  let mm;
  const localRe = new RegExp(methodRe.source, 'g');
  while ((mm = localRe.exec(body))) {
    const route = (mm[2].match(/'([^']*)'/) || [])[1] ?? '';
    const line = controllersSrc.slice(0, baseOffset + mm.index).split('\n').length;
    apiEndpoints.push({
      controller: c.class,
      method: mm[1].toUpperCase(),
      path: '/' + [c.base, route].filter(Boolean).join('/'),
      line,
    });
  }
}

// ---------- 4. Prisma models ----------
const schemaSrc = read('prisma/schema.prisma');
const models = [];
const modelRe = /^(model|enum)\s+(\w+)\s*\{/gm;
while ((m = modelRe.exec(schemaSrc))) models.push({ kind: m[1], name: m[2] });

// ---------- 5. MP views -> controls ----------
const MP_VIEWS_DIR = 'apps/mp/src/views';
const ADMIN_VIEWS_DIR = 'apps/admin/src/views';
const listViews = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.vue'));

const CONTROL_PATTERNS = [
  { kind: 'click', re: /@click(?:\.[\w-]+)*\s*=\s*"([^"]*)"/g },
  { kind: 'submit', re: /@submit(?:\.[\w-]+)*\s*=\s*"([^"]*)"/g },
  { kind: 'change', re: /@change(?:\.[\w-]+)*\s*=\s*"([^"]*)"/g },
  { kind: 'input', re: /@input(?:\.[\w-]+)*\s*=\s*"([^"]*)"/g },
  { kind: 'routerlink', re: /<RouterLink[^>]*to\s*=\s*"([^"]*)"/g },
  { kind: 'routerpush', re: /router\.push\(\s*([^)]*)\)/g },
  { kind: 'windowopen', re: /window\.open\(([^)]*)\)/g },
  { kind: 'tel', re: /tel:\/?\/?([0-9*#,;+]+)/g },
  { kind: 'role-button', re: /role\s*=\s*"(button|link|switch|tab)"/g },
  { kind: 'testid', re: /data-testid\s*=\s*"([^"]*)"/g },
];

function scanControls(dir, viewFile) {
  const src = read(path.join(dir, viewFile));
  const found = [];
  for (const { kind, re } of CONTROL_PATTERNS) {
    const r = new RegExp(re.source, 'g');
    let x;
    while ((x = r.exec(src))) {
      const handler = (x[1] ?? '').trim();
      if (!handler) continue;
      found.push({
        kind,
        handler: handler.slice(0, 160),
        line: src.slice(0, x.index).split('\n').length,
      });
    }
  }
  // detect fake-ish markers
  const fakeMarkers = [];
  const markerRe = /(console\.log|Math\.random|setTimeout|localStorage\.|TODO|FIXME|mock|placeholder|stub|demo|simulate|dummy)/gi;
  let y;
  while ((y = markerRe.exec(src))) {
    fakeMarkers.push({ marker: y[1], line: src.slice(0, y.index).split('\n').length });
  }
  return { controls: found, fakeMarkers };
}

const mpViews = listViews(MP_VIEWS_DIR);
const adminViews = listViews(ADMIN_VIEWS_DIR);

const mpViewData = {};
for (const v of mpViews) mpViewData[v] = scanControls(MP_VIEWS_DIR, v);
const adminViewData = {};
for (const v of adminViews) adminViewData[v] = scanControls(ADMIN_VIEWS_DIR, v);

// ---------- 6. API calls used by views ----------
const apiCallRe = /(?:api\.(?:get|post|patch|put|delete)|fetch)\s*\(\s*([`'"][^`'"]*[`'"])/g;
const apiCallsByView = {};
for (const v of mpViews) {
  const src = read(path.join(MP_VIEWS_DIR, v));
  const r = new RegExp(apiCallRe.source, 'g');
  const set = new Set();
  let x;
  while ((x = r.exec(src))) set.add(x[1].replace(/^[`'"]|[`'"]$/g, ''));
  apiCallsByView[v] = [...set];
}

// ---------- 7. outputs ----------
writeJson('artifacts/product-audit/mp-routes.json', {
  generatedFrom: 'apps/mp/src/router.ts',
  totalRoutes: mpRouteInventory.length,
  totalUniqueViews: Object.keys(mpByView).length,
  tabRoutes,
  routes: mpRouteInventory,
});
writeJson('artifacts/product-audit/admin-routes.json', {
  generatedFrom: 'apps/admin/src/router.ts',
  totalRoutes: adminRoutes.length,
  routes: adminRoutes,
  menu: adminMenu,
});
writeJson('artifacts/product-audit/api-endpoints.json', {
  generatedFrom: 'apps/api/src/controllers.ts',
  total: apiEndpoints.length,
  endpoints: apiEndpoints,
});
writeJson('artifacts/product-audit/db-models.json', {
  generatedFrom: 'prisma/schema.prisma',
  models: models.filter((x) => x.kind === 'model'),
  enums: models.filter((x) => x.kind === 'enum'),
});

const controlManifest = [];
for (const v of mpViews) {
  for (const c of mpViewData[v].controls) {
    controlManifest.push({
      surface: 'mp',
      view: v,
      routes: mpByView[v.replace(/\.vue$/, '')] ?? [],
      ...c,
      apiCalls: apiCallsByView[v],
      runtimeVisible: null,
      runtimeClickable: null,
      verified: false,
    });
  }
}
for (const v of adminViews) {
  for (const c of adminViewData[v].controls) {
    controlManifest.push({ surface: 'admin', view: v, ...c, runtimeVisible: null, runtimeClickable: null, verified: false });
  }
}
writeJson('artifacts/product-audit/control-manifest.json', {
  generatedFrom: ['apps/mp/src/views/**/*.vue', 'apps/admin/src/views/**/*.vue'],
  total: controlManifest.length,
  controls: controlManifest,
});

writeJson('artifacts/product-audit/fake-markers.json', {
  note: 'Static candidate markers only. Each must be adjudicated (see section 25/26 of the task).',
  mp: Object.fromEntries(mpViews.map((v) => [v, mpViewData[v].fakeMarkers])),
  admin: Object.fromEntries(adminViews.map((v) => [v, adminViewData[v].fakeMarkers])),
});

console.log(JSON.stringify({
  mpRoutes: mpRouteInventory.length,
  mpUniqueViews: Object.keys(mpByView).length,
  adminRoutes: adminRoutes.length,
  apiEndpoints: apiEndpoints.length,
  dbModels: models.filter((x) => x.kind === 'model').length,
  controls: controlManifest.length,
  mpViewFiles: mpViews.length,
  adminViewFiles: adminViews.length,
}, null, 2));
