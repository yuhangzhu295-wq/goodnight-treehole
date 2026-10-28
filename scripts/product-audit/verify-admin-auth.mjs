/* global console, fetch */
const BASE = 'http://127.0.0.1:3000';
const out = [];
async function probe(label, method, path, body, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  out.push(`${label}\n  ${method} ${path} (token=${token ? 'yes' : 'NO'}) -> ${res.status}\n  ${text.slice(0, 220)}`);
}

// Safe probes: read-only or against an id that does not exist.
await probe('read, no token', 'GET', '/api/admin/v1/users');
await probe('read, no token', 'GET', '/api/admin/v1/audit-logs');
await probe('read, no token', 'GET', '/api/admin/v1/dashboard/overview');
await probe('mutation, no token (nonexistent id)', 'DELETE', '/api/admin/v1/users/__probe_missing__/data');
await probe('mutation, no token (nonexistent id)', 'DELETE', '/api/admin/v1/posts/__probe_missing__');
await probe('mutation, no token (nonexistent id)', 'POST', '/api/admin/v1/posts/__probe_missing__/regenerate-replies');
await probe('mutation, no token (nonexistent id)', 'PATCH', '/api/admin/v1/users/__probe_missing__/status', { status: 'banned' });
await probe('config mutation, no token', 'PATCH', '/api/admin/v1/config', { appName: '__probe__' });

console.log(out.join('\n\n'));
