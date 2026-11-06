/**
 * Measures the SELF_ROUTE_IDENTITY_PASS gate against `SELF_ROUTE_IDENTITY_MATRIX.md` §2.
 *
 * The gate's wording is "the per-route identity/ownership/consent matrix, with a negative test per
 * route". Eyeballing a 91-row table against a 27-test spec is how a gap gets missed, so this parses
 * the table and looks for each route in the spec, attributing the hit to the section it appears in:
 *
 *   1.x  unauthenticated -> 401
 *   2.x  credential validity
 *   3.x  cross-user isolation (User B refused on User A's record)
 *   4.x  admin
 *   5.x  the demo fallback is gone
 *
 * The two checks are deliberately different for two kinds of route:
 *   - a route **with a path parameter** names a target record, so a foreign-id test is meaningful
 *     and required;
 *   - a route **without one** (`/me/...`, a list) is scoped to the caller by construction, so a
 *     single isolation test covers the family and a per-route foreign-id test cannot exist.
 *
 * A route the script cannot find is a *candidate* gap, not proof of one - a test may reach it through
 * a helper or a differently spelled placeholder. Every reported gap still has to be read.
 *
 * Usage: node scripts/audit-identity-gate-coverage.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const matrix = fs.readFileSync(path.join(root, 'docs/architecture/SELF_ROUTE_IDENTITY_MATRIX.md'), 'utf8');
const spec = fs.readFileSync(path.join(root, 'tests/business/batch3-identity-matrix.spec.ts'), 'utf8');

const section = matrix.split('## 2. Route Identity Matrix')[1]?.split('\n## ')[0] ?? '';
const rows = [];
for (const line of section.split('\n')) {
  const m = line.match(/^\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*`([^`]+)`\s*\|/);
  if (m) rows.push({ method: m[1], path: m[2], parameterised: /\/:/.test(m[2]) });
}

/**
 * The spec is split by test-name prefix so a hit can be attributed to a section rather than merely
 * found somewhere in the file.
 */
const sections = { unauthenticated: [], crossUser: [], admin: [], other: [] };
let current = 'other';
for (const line of spec.split('\n')) {
  const name = line.match(/it\('(\d+)\.(\d+)/);
  if (name) {
    const group = name[1];
    current = group === '1' ? 'unauthenticated' : group === '3' ? 'crossUser' : group === '4' ? 'admin' : 'other';
  }
  sections[current].push(line);
}

/**
 * Foreign-id coverage also lives outside the matrix spec, and it comes in two strengths:
 *
 *  - `http`     - the route is called over HTTP with another user's id (`batch3-foreign-id-ownership`
 *                 covers the journey / action / memory families this way);
 *  - `db-layer` - the operation is exercised against the persistence layer with a non-participant
 *                 caller, which is what `batch2-peer-verification` test 3.3 does for the peer family.
 *                 Stronger for ownership, but it is not per-route HTTP coverage and is labelled so.
 */
const httpCoverage = fs.readFileSync(path.join(root, 'tests/business/batch3-foreign-id-ownership.spec.ts'), 'utf8');
const peerSpec = fs.readFileSync(path.join(root, 'tests/business/batch2-peer-verification.spec.ts'), 'utf8');
const peerDbLayerCovered = /every direct peer operation refuses a caller who is not a participant/.test(peerSpec);

const PEER_FAMILIES = ['/api/v1/peers', '/api/v1/peer-experiences', '/api/v1/peer-matches', '/api/v1/peer-conversations', '/api/v1/peer-requests'];
const isPeerRoute = (routePath) => PEER_FAMILIES.some((family) => routePath === family || routePath.startsWith(`${family}/`));

function patternFor(routePath) {
  const parts = routePath
    .split('/')
    .map((segment) => (segment.startsWith(':') ? "[^/'`\" )]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  return new RegExp(`['\`"]${parts.join('/')}['\`"]`);
}

function appearsIn(lines, routePath) {
  const pattern = patternFor(routePath);
  return lines.some((line) => pattern.test(line));
}

const results = rows.map((row) => {
  const httpForeignId = appearsIn(httpCoverage.split('\n'), row.path);
  const dbLayer = isPeerRoute(row.path) && peerDbLayerCovered;
  return {
    ...row,
    refused401: appearsIn(sections.unauthenticated, row.path),
    crossUser: appearsIn(sections.crossUser, row.path) || httpForeignId || dbLayer,
    coverage: httpForeignId ? 'http' : dbLayer ? 'db-layer' : appearsIn(sections.crossUser, row.path) ? 'matrix-section' : 'none',
    admin: appearsIn(sections.admin, row.path),
  };
});

const isAdminRoute = (routePath) => routePath.startsWith('/api/admin/');
const missing401 = results.filter((r) => !isAdminRoute(r.path) && !r.refused401);
const missingAdmin = results.filter((r) => isAdminRoute(r.path) && !r.admin);
const parameterised = results.filter((r) => r.parameterised && !isAdminRoute(r.path));
const missingOwnership = parameterised.filter((r) => r.coverage === 'none');

console.log(`matrix routes parsed:                 ${results.length}`);
console.log(`  with a 401 negative test:           ${results.filter((r) => !isAdminRoute(r.path) && r.refused401).length} / ${results.filter((r) => !isAdminRoute(r.path)).length} C-end routes`);
console.log(`  admin routes with a negative test:  ${results.filter((r) => isAdminRoute(r.path) && r.admin).length} / ${results.filter((r) => isAdminRoute(r.path)).length}`);
console.log(`  parameterised C-end routes:         ${parameterised.length}`);
console.log(`  of those, foreign-id covered:       ${parameterised.filter((r) => r.coverage !== 'none').length}`);
for (const kind of ['matrix-section', 'http', 'db-layer']) {
  const n = parameterised.filter((r) => r.coverage === kind).length;
  if (n) console.log(`      ${kind.padEnd(15)} ${n}`);
}
console.log();

if (missing401.length) {
  console.log('CANDIDATE GAP: no 401 assertion found for');
  for (const r of missing401) console.log(`  ${r.method} ${r.path}`);
  console.log();
}
if (missingAdmin.length) {
  console.log('CANDIDATE GAP: admin route with no negative test found for');
  for (const r of missingAdmin) console.log(`  ${r.method} ${r.path}`);
  console.log();
}
if (missingOwnership.length) {
  console.log('CANDIDATE GAP: parameterised route never exercised with a foreign id');
  for (const r of missingOwnership) console.log(`  ${r.method} ${r.path}`);
  console.log();
}

const clean = missing401.length === 0 && missingAdmin.length === 0 && missingOwnership.length === 0;
console.log(`VERDICT: ${clean ? 'every matrix route is covered by the section it belongs to' : 'candidate gaps above must each be read before the gate is claimed'}`);
