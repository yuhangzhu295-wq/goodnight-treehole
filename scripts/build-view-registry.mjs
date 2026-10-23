// Build the Batch-0 view registry: one id per distinct component, with every route that reaches it,
// the design image it is measured against, and whether it is an alias of another view.
//
// The registry is derived from the router and the audit mapping, so it can be re-derived after any
// route change instead of drifting from the code.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { repoFile } from './repo-root.mjs';

const router = readFileSync('apps/mp/src/router.ts', 'utf8');
const pages = JSON.parse(readFileSync(repoFile('artifacts/v2-source/audit-pages.json'), 'utf8'));

const routes = [...router.matchAll(/\{ path: '(\/pages[^']+)', component: (\w+)/g)].map((m) => ({
  path: m[1],
  component: m[2],
}));

const byComponent = new Map();
for (const r of routes) {
  if (!byComponent.has(r.component)) byComponent.set(r.component, []);
  byComponent.get(r.component).push(r.path);
}

// slug -> component, resolved from the captured route: an audit slug's route is the canonical one.
// Detail pages carry their id as a query string (`?id=`), which the audit's route string omits, so
// match on the path alone.
const bare = (p) => p.split('?')[0];
const slugToComponent = new Map();
for (const p of pages) {
  const hit = [...byComponent.entries()].find(([, paths]) => paths.some((r) => bare(r) === bare(p.route)));
  slugToComponent.set(p.slug, hit ? hit[0] : null);
}

const registry = [];
for (const [component, paths] of [...byComponent.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const slugs = pages.filter((p) => slugToComponent.get(p.slug) === component);
  const canonical = slugs.find((s) => s.route && paths.some((r) => bare(r) === bare(s.route))) ?? slugs[0];
  const aliases = slugs.filter((s) => s !== canonical);
  registry.push({
    component,
    routes: paths,
    viewId: `VIEW-${String(registry.length + 1).padStart(2, '0')}`,
    design: canonical?.design ?? null,
    priority: canonical?.priority ?? null,
    canonicalSlug: canonical?.slug ?? null,
    aliasSlugs: aliases.map((a) => ({ slug: a.slug, route: a.route, relation: a.relation })),
    relation: canonical?.relation ?? null,
  });
}

mkdirSync('artifacts/v2-source', { recursive: true });
writeFileSync('artifacts/v2-source/view-registry.json', JSON.stringify(registry, null, 1) + '\n', 'utf8');

console.log('routes:', routes.length, 'components:', byComponent.size, 'registry entries:', registry.length);
const multi = registry.filter((r) => r.routes.length > 1);
console.log('components reached by more than one route:', multi.length);
for (const r of multi) console.log(' ', r.viewId, r.component, '=>', r.routes.join(' , '), '| aliases:', r.aliasSlugs.map((a) => a.slug).join(', ') || 'none');
const noAudit = registry.filter((r) => !r.canonicalSlug);
console.log('components with no audit capture:', noAudit.map((r) => r.component).join(', ') || 'none');
const routesCaptured = new Set(pages.map((p) => bare(p.route)));
const uncaptured = routes.filter((r) => !routesCaptured.has(bare(r.path)));
console.log('routes with no audit entry:', uncaptured.map((r) => r.path).join(', ') || 'none');
