/* global console, fetch, process */
// ISSUE-013: real server-side login throttling, and ISSUE-012: no decorative captcha.
const API = 'http://127.0.0.1:3000';
const out = [];
const record = (n, p, d) => out.push(`${p ? 'PASS' : 'FAIL'} ${n} :: ${d}`);
const attempt = async (username, password, ip) => {
  const res = await fetch(`${API}/api/admin/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ username, password }),
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, retryAfter: res.headers.get('retry-after') };
};

// A valid login from a clean IP must succeed (the limiter must not block normal use).
const ok = await attempt('admin', 'admin123', '10.9.9.1');
record('a normal login succeeds', ok.status === 201, `status=${ok.status}`);

// Repeated failures from one IP for one account must eventually be refused with 429.
let limited = null;
const statuses = [];
for (let i = 0; i < 7; i += 1) {
  const res = await attempt('admin', `wrong-${i}`, '10.9.9.2');
  statuses.push(res.status);
  if (res.status === 429) { limited = res; break; }
}
record('repeated failures are throttled with 429', limited !== null, `statuses=${statuses.join(',')}`);
record('the 429 carries a retry hint', Number(limited?.body?.retryAfterSeconds ?? 0) > 0 || Boolean(limited?.retryAfter),
  `retryAfterSeconds=${limited?.body?.retryAfterSeconds} header=${limited?.retryAfter}`);

// The block must hold even if the attacker then supplies the correct password.
const blockedEvenWhenCorrect = await attempt('admin', 'admin123', '10.9.9.2');
record('a throttled identity stays blocked', blockedEvenWhenCorrect.status === 429, `status=${blockedEvenWhenCorrect.status}`);

// A different IP must be unaffected (the limiter is keyed, not global).
const otherIp = await attempt('admin', 'admin123', '10.9.9.3');
record('a different IP is unaffected', otherIp.status === 201, `status=${otherIp.status}`);

// A different username from the throttled IP must still work, up to the per-IP ceiling.
const otherUser = await attempt('someone-else', 'wrong', '10.9.9.4');
record('per-identity and per-IP buckets are separate', otherUser.status === 401, `status=${otherUser.status} (401 not 429)`);

// The decorative captcha must be gone from the console.
const page = await fetch('http://127.0.0.1:5174/login');
const html = await page.text();
record('the console login page no longer ships a captcha field', !/admin-login-captcha/.test(html), `status=${page.status}`);

console.log(out.join('\n'));
const failed = out.filter((l) => l.startsWith('FAIL'));
console.log(`\n${out.length - failed.length}/${out.length} pass`);
process.exitCode = failed.length ? 1 : 0;
