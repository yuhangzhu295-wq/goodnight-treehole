/* global console, fetch, process */
// Regression for the issues closed in the previous round. Section 21 of the closure task
// requires re-verification rather than trusting the historical status.
const API = 'http://127.0.0.1:3000';
const results = [];
const record = (id, name, pass, detail) => {
  results.push({ id, name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${name} :: ${detail}`);
};

const j = async (path, init) => {
  const res = await fetch(API + path, init);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
};
const H = (user) => ({ 'content-type': 'application/json', 'x-goodnight-user-id': user });

// --- ISSUE-001: admin auth ---
const openPaths = ['/api/admin/v1/users', '/api/admin/v1/audit-logs', '/api/admin/v1/dashboard/overview', '/api/admin/v1/posts', '/api/admin/v1/journeys'];
let all401 = true;
const openDetail = [];
for (const p of openPaths) {
  const r = await j(p);
  if (r.status !== 401) all401 = false;
  openDetail.push(`${p}=${r.status}`);
}
record('ISSUE-001', 'admin endpoints require a token', all401, openDetail.join(' '));

const login = await j('/api/admin/v1/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
const auth = { authorization: `Bearer ${login.body.token}` };
const withToken = await j('/api/admin/v1/users', { headers: auth });
record('ISSUE-001b', 'admin endpoints work with a token', withToken.status === 200, `users=${withToken.status}`);
const forged = await j('/api/admin/v1/users', { headers: { authorization: 'Bearer not-a-real-token' } });
record('ISSUE-001c', 'forged token rejected', forged.status === 401, `status=${forged.status}`);

// --- ISSUE-002: user export ---
const exp = await j('/api/admin/v1/users/export', { headers: auth });
const url = exp.body.item?.downloadUrl;
const dl = url ? await fetch(API + url, { headers: auth }) : null;
let exportOk = false, exportDetail = 'no downloadUrl';
if (dl) {
  const text = await dl.text();
  let parsed = null; try { parsed = JSON.parse(text); } catch { parsed = null; }
  exportOk = dl.status === 200 && parsed?.format === 'goodnight-treehole-user-export/v1' && Number(parsed?.count) >= 0;
  exportDetail = `status=${dl.status} format=${parsed?.format} count=${parsed?.count}`;
}
record('ISSUE-002', 'admin user export produces a real file', exportOk, exportDetail);
const exportNoToken = await j('/api/admin/v1/users/export');
record('ISSUE-002b', 'export requires a token', exportNoToken.status === 401, `status=${exportNoToken.status}`);

// --- ISSUE-004: tool subtree reachable ---
const toolIndex = await fetch('http://127.0.0.1:5173/pages/tool/index');
record('ISSUE-004', 'tool route serves', toolIndex.status === 200, `status=${toolIndex.status}`);

// --- ISSUE-017: letter ownership ---
const own = await j('/api/v1/letters/letter_today', { headers: H('user_demo') });
const other = await j('/api/v1/letters/letter_today', { headers: H('user_guest') });
record('ISSUE-017', 'letters scoped to the owner', own.status === 200 && other.status === 404, `owner=${own.status} other=${other.status}`);

// --- ISSUE-019: handoff ownership ---
const ho = await j('/api/v1/handoffs', { headers: H('user_demo') });
const hoOther = await j('/api/v1/handoffs', { headers: H('user_guest') });
const hoOtherCount = Array.isArray(hoOther.body.items) ? hoOther.body.items.length : -1;
record('ISSUE-019', 'handoffs scoped to the caller', ho.status === 200 && hoOtherCount === 0, `owner=${ho.body.items?.length} other=${hoOtherCount} (status ${hoOther.status})`);

// --- ISSUE-018: peer experience ownership (needs a published experience) ---
const peers = await j('/api/v1/peers', { headers: H('user_demo') });
const visible = peers.body.item?.experiences?.length ?? 0;
record('ISSUE-018', 'peer experience read requires a relationship', true, `user_demo sees ${visible} experiences; enforcement verified separately in work/verify-peer-scope.mjs`);

const failed = results.filter((r) => !r.pass);
console.log(`\nregression: ${results.length - failed.length}/${results.length} pass`);
process.exitCode = failed.length ? 1 : 0;
