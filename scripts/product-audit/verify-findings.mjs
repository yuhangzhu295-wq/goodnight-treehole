const BASE = 'http://127.0.0.1:3000';
const out = [];
const show = async (label, path, init) => {
  const res = await fetch(BASE + path, init);
  const text = await res.text();
  out.push(`${label}\n  ${res.status} ${res.headers.get('content-type')} len=${text.length}\n  ${text.slice(0, 300)}`);
  return { res, text };
};

const login = await fetch(BASE + '/api/admin/v1/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' }),
});
const { token } = await login.json();
const auth = { headers: { authorization: `Bearer ${token}` } };

await show('A03a  users/export WITH admin token', '/api/admin/v1/users/export', auth);
await show('A03b  users/export WITHOUT token', '/api/admin/v1/users/export');
await show('A03c  users/:id control (user_demo)', '/api/admin/v1/users/user_demo', auth);
await show('A03d  users list', '/api/admin/v1/users', auth);

// does the fabricated export URL resolve?
const exp = await (await fetch(BASE + '/api/admin/v1/users/export', auth)).text();
let downloadUrl = null;
try { downloadUrl = JSON.parse(exp).item?.downloadUrl ?? JSON.parse(exp).downloadUrl ?? null; } catch {}
out.push(`A03e  downloadUrl parsed = ${JSON.stringify(downloadUrl)}`);
if (downloadUrl) await show('A03f  fabricated downloadUrl fetch', downloadUrl);

console.log(out.join('\n\n'));
