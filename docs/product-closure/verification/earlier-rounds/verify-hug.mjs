/* global console, fetch, process */
// ISSUE-020 (hug half): the counter must be idempotent per user and derive from real rows.
const API = 'http://127.0.0.1:3000';
const out = [];
const record = (n, p, d) => out.push(`${p ? 'PASS' : 'FAIL'} ${n} :: ${d}`);
const j = async (path, init) => {
  const res = await fetch(API + path, init);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
};
const H = (user) => ({ 'content-type': 'application/json', 'x-goodnight-user-id': user });

const posts = await j('/api/v1/posts');
const post = posts.body.items?.[0];
record('a public post exists', Boolean(post), `id=${post?.id} hugCount=${post?.hugCount}`);
const before = Number(post?.hugCount ?? 0);

// One user hugging repeatedly must only count once.
await j(`/api/v1/posts/${post.id}/hug`, { method: 'POST', headers: H('user_demo') });
const first = await j(`/api/v1/posts/${post.id}/hug`, { method: 'POST', headers: H('user_demo') });
const third = await j(`/api/v1/posts/${post.id}/hug`, { method: 'POST', headers: H('user_demo') });
record('repeated hugs from one user count once', first.body.item?.hugCount === third.body.item?.hugCount && first.body.alreadyHugged === true,
  `first=${first.body.item?.hugCount} (already=${first.body.alreadyHugged}) third=${third.body.item?.hugCount}`);
record('the hug added exactly one', Number(third.body.item?.hugCount ?? 0) === before + 1, `before=${before} after=${third.body.item?.hugCount}`);
record('existing displayed counts are preserved', before > 0 ? Number(first.body.item?.hugCount ?? 0) >= before : true, `before=${before} afterFirst=${first.body.item?.hugCount}`);

// A second user must add one more.
const guest = await j(`/api/v1/posts/${post.id}/hug`, { method: 'POST', headers: H('user_guest') });
record('a different user adds another', Number(guest.body.item?.hugCount ?? 0) === before + 2, `count=${guest.body.item?.hugCount}`);

// Un-hugging removes only that user's row.
const removed = await j(`/api/v1/posts/${post.id}/hug`, { method: 'DELETE', headers: H('user_demo') });
record('un-hug removes only the caller\'s row', Number(removed.body.item?.hugCount ?? 0) === before + 1, `count=${removed.body.item?.hugCount}`);

// It must survive a fresh read.
const reread = await j('/api/v1/posts');
const fresh = reread.body.items?.find((p) => p.id === post.id);
record('the count persists across a fresh read', Number(fresh?.hugCount ?? -1) === before + 1, `count=${fresh?.hugCount}`);

// cleanup: remove the guest hug too
await j(`/api/v1/posts/${post.id}/hug`, { method: 'DELETE', headers: H('user_guest') });

console.log(out.join('\n'));
const failed = out.filter((l) => l.startsWith('FAIL'));
console.log(`\n${out.length - failed.length}/${out.length} pass`);
process.exitCode = failed.length ? 1 : 0;
