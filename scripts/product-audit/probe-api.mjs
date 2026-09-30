const BASE = 'http://127.0.0.1:3000';
async function hit(path, init) {
  const res = await fetch(BASE + path, init);
  const text = await res.text();
  let body = text;
  try { body = JSON.stringify(JSON.parse(text)); } catch {}
  return `${res.status} ${path}\n   ${body.slice(0, 600)}`;
}
const out = [];
out.push(await hit('/api/v1/posts'));
out.push(await hit('/api/v1/tonight'));
out.push(await hit('/api/admin/v1/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) }));
out.push(await hit('/api/v1/letters/today'));
out.push(await hit('/api/v1/tools'));
out.push(await hit('/api/v1/me/profile'));
out.push(await hit('/api/v1/peers'));
out.push(await hit('/api/v1/notifications'));
out.push(await hit('/api/v1/settings/privacy'));
out.push(await hit('/api/v1/reports/monthly'));
console.log(out.join('\n'));
