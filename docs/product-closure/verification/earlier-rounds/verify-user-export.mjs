/* global console, fetch */
const BASE = 'http://127.0.0.1:3000';
const out = [];
const login = await (await fetch(BASE + '/api/admin/v1/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' }),
})).json();
const auth = { authorization: `Bearer ${login.token}` };

const res = await fetch(BASE + '/api/admin/v1/users/export', { headers: auth });
const body = await res.json();
out.push(`export -> ${res.status} ${JSON.stringify(body.item)}`);
const url = body.item?.downloadUrl;

// the returned URL must actually resolve and be a real file
const dl = await fetch(BASE + url, { headers: auth });
const text = await dl.text();
out.push(`download -> ${dl.status} content-type=${dl.headers.get('content-type')} disposition=${dl.headers.get('content-disposition')}`);
let parsed = null;
try { parsed = JSON.parse(text); } catch { parsed = null; }
out.push(`parsed format=${parsed?.format} count=${parsed?.count} firstUser=${parsed?.users?.[0]?.id}`);

// the control route must still work
const one = await fetch(BASE + '/api/admin/v1/users/user_demo', { headers: auth });
out.push(`users/:id -> ${one.status} ${(await one.text()).slice(0, 90)}`);

// the admin export must not be reachable through the public user export route
const publicTry = await fetch(BASE + url);
out.push(`public route on admin asset -> ${publicTry.status} (401/404 expected)`);

// no token must not be able to export
const noToken = await fetch(BASE + '/api/admin/v1/users/export');
out.push(`export without token -> ${noToken.status} (401 expected)`);

console.log(out.join('\n'));
