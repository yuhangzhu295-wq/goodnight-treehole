/* global console, fetch */
const BASE = 'http://127.0.0.1:3000';
const out = [];
const show = async (label, path, userHeader) => {
  const headers = {};
  if (userHeader) headers['x-goodnight-user-id'] = userHeader;
  const res = await fetch(BASE + path, { headers });
  const text = await res.text();
  out.push(`${label}\n  ${res.status} ${path} (x-goodnight-user-id=${userHeader ?? 'none'})\n  ${text.slice(0, 260)}`);
  return { status: res.status, text };
};

// 1. does GET /api/v1/letters/:id scope by user?
const letters = JSON.parse((await (await fetch(BASE + '/api/v1/letters')).text()));
const letterId = letters.items?.[0]?.id;
out.push(`first letter id = ${letterId}`);
if (letterId) {
  await show('letter as user_demo', `/api/v1/letters/${letterId}`, 'user_demo');
  await show('letter as a DIFFERENT user', `/api/v1/letters/${letterId}`, 'user_attacker');
  await show('letter as a DIFFERENT user (2)', `/api/v1/letters/${letterId}`, 'user_guest');
}

// 2. does GET /api/v1/peer-experiences/:id scope by viewer?
const peers = JSON.parse((await (await fetch(BASE + '/api/v1/peers')).text()));
const expId = peers.item?.experiences?.[0]?.id;
out.push(`first peer experience id = ${expId ?? '(none visible for user_demo)'}`);
if (expId) {
  await show('peer experience as user_demo', `/api/v1/peer-experiences/${expId}`, 'user_demo');
  await show('peer experience as a DIFFERENT user', `/api/v1/peer-experiences/${expId}`, 'user_attacker');
}

// 3. is /api/v1/decisions or /api/v1/cooldown scoped?
await show('decisions as user_attacker', '/api/v1/decisions', 'user_attacker');
await show('me/support-plan as user_attacker', '/api/v1/me/support-plan', 'user_attacker');
await show('me/stable-self as user_attacker', '/api/v1/me/stable-self', 'user_attacker');
await show('memory as user_attacker', '/api/v1/memory', 'user_attacker');
await show('handoffs as user_attacker', '/api/v1/handoffs', 'user_attacker');

console.log(out.join('\n\n'));
