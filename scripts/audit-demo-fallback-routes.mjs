// Maps every demo-user fallback in the C-end controllers to the route that reaches it.
//
// Finding 6 (open, P1): Self routes still silently fall back to the demo user. This produces the
// route list so the A8 identity matrix can be built from evidence rather than from a grep of line
// numbers in a design doc that has since shifted.
import { readFileSync } from 'node:fs';

const source = readFileSync('apps/api/src/controllers.ts', 'utf8').split('\n');

const ROUTE = /^\s*@(Get|Post|Patch|Put|Delete)\('([^']*)'\)/;
const CONTROLLER = /^@Controller\('([^']*)'\)/;

const rows = [];
let controller = '';
let current = null;

source.forEach((line, index) => {
  const controllerMatch = line.match(CONTROLLER);
  if (controllerMatch) controller = controllerMatch[1];

  const routeMatch = line.match(ROUTE);
  if (routeMatch) {
    current = { controller, method: routeMatch[1], path: routeMatch[2], line: index + 1 };
    return;
  }

  if (line.includes('getDemoUserId()') && current) {
    const shape = /requestedUserId\s*\|\|\s*this\.store\.getDemoUserId\(\)/.test(line)
      ? 'fallback-if-no-identity'
      : 'always-demo';
    rows.push({ ...current, shape, source: line.trim().slice(0, 110) });
  }
});

const byRoute = new Map();
for (const row of rows) {
  const key = `${row.method} /${row.controller}/${row.path}`;
  if (!byRoute.has(key)) byRoute.set(key, { ...row, hits: 0, shapes: new Set() });
  const entry = byRoute.get(key);
  entry.hits += 1;
  entry.shapes.add(row.shape);
}

console.log(`routes reaching a demo-user fallback: ${byRoute.size} (${rows.length} call sites)\n`);
for (const [route, entry] of [...byRoute].sort()) {
  console.log(`${route.padEnd(52)} ${[...entry.shapes].join(',').padEnd(24)} x${entry.hits}  line ${entry.line}`);
}
