/* global console, fetch, process */
// Proves whether admin destructive endpoints are reachable without a token.
// Uses a throwaway record created and deleted by this script only.
const BASE = 'http://127.0.0.1:3000';
const log = (...a) => console.log(...a);

const created = await (await fetch(BASE + '/api/v1/posts', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-goodnight-user-id': 'user_demo' },
  body: JSON.stringify({ emotion: '工作', content: `UNAUTH-DELETE-PROBE-${Date.now()}`, visibility: 'PUBLIC' }),
})).json();
const postId = created.post?.id ?? created.item?.id ?? created.id;
log('created throwaway post:', postId);
if (!postId) { log('could not create post; aborting'); process.exit(1); }

const before = await (await fetch(`${BASE}/api/v1/posts/${postId}`)).text();
log('readable before delete:', before.slice(0, 120));

// NO authorization header on purpose.
const del = await fetch(`${BASE}/api/admin/v1/posts/${postId}`, { method: 'DELETE' });
log('DELETE /api/admin/v1/posts/:id without token ->', del.status, (await del.text()).slice(0, 160));

const after = await fetch(`${BASE}/api/v1/posts/${postId}`);
log('readable after delete:', after.status, (await after.text()).slice(0, 160));

// regenerate-replies on a throwaway post, still with no token
const created2 = await (await fetch(BASE + '/api/v1/posts', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-goodnight-user-id': 'user_demo' },
  body: JSON.stringify({ emotion: '工作', content: `UNAUTH-REGEN-PROBE-${Date.now()}`, visibility: 'PUBLIC' }),
})).json();
const postId2 = created2.post?.id ?? created2.item?.id ?? created2.id;
const regen = await fetch(`${BASE}/api/admin/v1/posts/${postId2}/regenerate-replies`, { method: 'POST' });
log('POST regenerate-replies without token ->', regen.status, (await regen.text()).slice(0, 200));
await fetch(`${BASE}/api/admin/v1/posts/${postId2}`, { method: 'DELETE' });
log('cleanup done');
