/* global console, fetch */
const BASE = 'http://127.0.0.1:3000';
const out = [];
const hit = async (label, method, path, body, token) => {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  out.push(`${label}: ${method} ${path} -> ${res.status} ${text.slice(0, 140)}`);
  return { status: res.status, text };
};

// login must still work with no token (it is on the public allow-list)
const login = await hit('LOGIN (public)', 'POST', '/api/admin/v1/login', { username: 'admin', password: 'admin123' });
const token = JSON.parse(login.text).token;
out.push(`token acquired: ${Boolean(token)}`);
await hit('LOGIN alias (public)', 'POST', '/api/admin/v1/auth/login', { username: 'admin', password: 'admin123' });
await hit('LOGOUT (public)', 'POST', '/api/admin/v1/auth/logout');

// authenticated access must still work for every shape of endpoint
await hit('ME', 'GET', '/api/admin/v1/me', null, token);
await hit('auth/me', 'GET', '/api/admin/v1/auth/me', null, token);
await hit('overview', 'GET', '/api/admin/v1/dashboard/overview', null, token);
await hit('users', 'GET', '/api/admin/v1/users', null, token);
await hit('users/:id', 'GET', '/api/admin/v1/users/user_demo', null, token);
await hit('posts', 'GET', '/api/admin/v1/posts', null, token);
await hit('replies', 'GET', '/api/admin/v1/replies', null, token);
await hit('tickets', 'GET', '/api/admin/v1/feedback/tickets', null, token);
await hit('providers', 'GET', '/api/admin/v1/ai/providers', null, token);
await hit('routes', 'GET', '/api/admin/v1/ai/routes', null, token);
await hit('jobs', 'GET', '/api/admin/v1/ai/jobs', null, token);
await hit('presets', 'GET', '/api/admin/v1/reply-presets', null, token);
await hit('faqs', 'GET', '/api/admin/v1/faqs', null, token);
await hit('categories', 'GET', '/api/admin/v1/feedback-categories', null, token);
await hit('settings', 'GET', '/api/admin/v1/system/settings', null, token);
await hit('audit-logs', 'GET', '/api/admin/v1/audit-logs', null, token);
await hit('experience/journeys', 'GET', '/api/admin/v1/journeys', null, token);
await hit('safety/events', 'GET', '/api/admin/v1/safety/events', null, token);
await hit('memory', 'GET', '/api/admin/v1/memory', null, token);

// a rejected bad token must not leak anything
await hit('bad token', 'GET', '/api/admin/v1/users', null, 'not-a-real-token');

console.log(out.join('\n'));
