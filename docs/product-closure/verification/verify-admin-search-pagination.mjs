/* global console, fetch */
// ISSUE-026: admin list search and pagination must really reach the API and the dataset for
// the experience and safety groups. Before this fix the search box sent `q` and no handler in
// those groups read it (journeys?q=zzzznomatch returned the same rows), and no page beyond 1
// was reachable. This checks every affected endpoint against real rows.
const API = 'http://127.0.0.1:3000';
const out = [];
const record = (name, pass, detail) => out.push(`${pass ? 'PASS' : 'FAIL'} ${name} :: ${detail}`);
const j = async (path, init) => {
  const res = await fetch(API + path, init);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
};
const JSONH = { 'content-type': 'application/json' };

const login = await j('/api/admin/v1/login', { method: 'POST', headers: JSONH, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
const auth = { authorization: `Bearer ${login.body.token}` };
record('admin login', Boolean(login.body.token), `status=${login.status}`);

// `memory` hides soft-deleted rows (correctly), so the ambient dataset can be empty.
// Create a real memory item through the user route so the resource has a live row to page.
const stamp = Date.now();
const seededMemory = await j('/api/v1/memory', {
  method: 'POST',
  headers: { ...JSONH, 'x-goodnight-user-id': 'user_demo' },
  body: JSON.stringify({ category: 'CLOSURE-MEMORY', title: `CLOSURE-MEMORY-${stamp}`, content: '用于验证后台有限记忆列表的搜索与分页。', scope: 'all_ai', days: 30 }),
});
record('a real memory item exists for the list to page through', seededMemory.status === 201, `status=${seededMemory.status}`);

// Every list route in the experience + safety groups that the search box feeds.
const RESOURCES = [
  ['journeys', '/api/admin/v1/journeys'],
  ['actions', '/api/admin/v1/actions'],
  ['checkins', '/api/admin/v1/checkins'],
  ['peer-experiences', '/api/admin/v1/peer-experiences'],
  ['peer-matches', '/api/admin/v1/peer-matches'],
  ['follow-ups', '/api/admin/v1/follow-ups'],
  ['notifications', '/api/admin/v1/notifications'],
  ['peer-conversations', '/api/admin/v1/peer-conversations'],
  ['safety-events', '/api/admin/v1/safety/events'],
  ['support-plans', '/api/admin/v1/support/plans'],
  ['memory', '/api/admin/v1/memory'],
];

for (const [name, path] of RESOURCES) {
  const all = await j(`${path}?pageSize=100`, { headers: auth });
  const total = all.body.total;
  const sample = (all.body.items ?? [])[0];
  if (!sample) {
    record(`${name}: has data to page through`, false, 'no rows');
    continue;
  }

  // search must hit a real row and must not be a no-op
  const hit = await j(`${path}?q=${encodeURIComponent(sample.id)}&pageSize=100`, { headers: auth });
  const miss = await j(`${path}?q=zzzznomatchzzzz&pageSize=100`, { headers: auth });
  record(`${name}: search finds a real row by id`,
    hit.status === 200 && hit.body.total >= 1 && (hit.body.items ?? []).some((item) => item.id === sample.id),
    `total=${hit.body.total} expected>=1`);
  record(`${name}: search is not a no-op (nonsense query -> 0 rows)`,
    miss.status === 200 && miss.body.total === 0 && (miss.body.items ?? []).length === 0,
    `total=${miss.body.total}`);

  // pagination must slice the whole dataset and report the full total
  const p1 = await j(`${path}?page=1&pageSize=5`, { headers: auth });
  const p2 = await j(`${path}?page=2&pageSize=5`, { headers: auth });
  const ids1 = (p1.body.items ?? []).map((item) => item.id);
  const ids2 = (p2.body.items ?? []).map((item) => item.id);
  const expectedTotalPages = Math.max(1, Math.ceil(total / 5));
  record(`${name}: page size is honoured and the total is the full dataset`,
    p1.body.pageSize === 5 && p1.body.total === total && p1.body.totalPages === expectedTotalPages,
    `total=${p1.body.total} totalPages=${p1.body.totalPages} expected=${expectedTotalPages}`);
  record(`${name}: page 2 returns a different slice`,
    total <= 5 || (ids1.length > 0 && ids2.length > 0 && !ids1.some((id) => ids2.includes(id))),
    `total=${total} page1=${ids1.length} page2=${ids2.length} disjoint=${!ids1.some((id) => ids2.includes(id))}`);

  // page size must be bounded, not unbounded
  const huge = await j(`${path}?pageSize=100000`, { headers: auth });
  record(`${name}: page size is clamped to a sane maximum`, huge.body.pageSize <= 100, `pageSize=${huge.body.pageSize}`);
}

// A non-numeric page must not silently return an empty page.
const weird = await j('/api/admin/v1/journeys?page=abc&pageSize=abc', { headers: auth });
record('a malformed page falls back to page 1', weird.status === 200 && weird.body.page === 1, `page=${weird.body.page} pageSize=${weird.body.pageSize}`);

const failed = out.filter((line) => line.startsWith('FAIL'));
console.log(out.join('\n'));
console.log(`\n${out.length - failed.length}/${out.length} pass`);
process.exitCode = failed.length ? 1 : 0;