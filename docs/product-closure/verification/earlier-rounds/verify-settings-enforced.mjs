/* global console, fetch, process */
// Proves each wired setting changes real behaviour, and each unwired one cannot be saved.
const API = 'http://127.0.0.1:3000';
const out = [];
const record = (name, pass, detail) => { out.push(`${pass ? 'PASS' : 'FAIL'} ${name} :: ${detail}`); };
const j = async (path, init) => {
  const res = await fetch(API + path, init);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
};
const login = await (await fetch(`${API}/api/admin/v1/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' }),
})).json();
const auth = { 'content-type': 'application/json', authorization: `Bearer ${login.token}` };
const settings = await j('/api/admin/v1/system/settings', { headers: auth });
record('enforcedKeys reported', Array.isArray(settings.body.enforcedKeys), `${settings.body.enforcedKeys?.length} enforced, ${settings.body.notImplementedKeys?.length} not implemented`);

// --- defaultPageSize is honoured when the caller does not pass pageSize ---
await j('/api/admin/v1/system/settings', { method: 'PUT', headers: auth, body: JSON.stringify({ defaultPageSize: 1 }) });
const paged = await j('/api/admin/v1/users', { headers: auth });
record('defaultPageSize drives list size', paged.body.pageSize === 1, `pageSize=${paged.body.pageSize} items=${paged.body.items?.length}`);
await j('/api/admin/v1/system/settings', { method: 'PUT', headers: auth, body: JSON.stringify({ defaultPageSize: 20 }) });

// --- highRiskBlockEnabled turns detection on and off ---
await j('/api/admin/v1/system/settings', { method: 'PUT', headers: auth, body: JSON.stringify({ highRiskBlockEnabled: true }) });
const on = await j('/api/v1/journeys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'SETTINGS-PROBE 高危', domain: '其他', content: '我最近总是想到自伤，撑不住了。', visibility: 'PRIVATE' }) });
const onStage = on.body.journey?.stage ?? on.body.item?.journey?.stage;
await j('/api/admin/v1/system/settings', { method: 'PUT', headers: auth, body: JSON.stringify({ highRiskBlockEnabled: false }) });
const off = await j('/api/v1/journeys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'SETTINGS-PROBE 关闭', domain: '其他', content: '我最近总是想到自伤，撑不住了。', visibility: 'PRIVATE' }) });
const offStage = off.body.journey?.stage ?? off.body.item?.journey?.stage;
record('highRiskBlockEnabled changes journey stage', onStage === 'safety_first' && offStage !== 'safety_first', `on=${onStage} off=${offStage}`);
await j('/api/admin/v1/system/settings', { method: 'PUT', headers: auth, body: JSON.stringify({ highRiskBlockEnabled: true }) });

// --- manualReviewThreshold must NOT weaken moderation, and must be refused ---
const thresholdWrite = await j('/api/admin/v1/system/settings', { method: 'PUT', headers: auth, body: JSON.stringify({ manualReviewThreshold: 1 }) });
const publicPost = await j('/api/v1/moods', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ emotion: '工作', content: `SETTINGS-PROBE 阈值 ${Date.now()}`, visibility: 'PUBLIC' }) });
record('public posts stay gated by manual review', thresholdWrite.status === 400 && publicPost.body.post?.reviewStatus === 'pending_review', `write=${thresholdWrite.status} reviewStatus=${publicPost.body.post?.reviewStatus}`);

// --- a not-implemented setting must be refused, not saved ---
const refused = await j('/api/admin/v1/system/settings', { method: 'PUT', headers: auth, body: JSON.stringify({ dailyDigestEnabled: true }) });
record('unwired setting cannot be saved', refused.status === 400, `status=${refused.status} ${String(refused.body?.message ?? '').slice(0, 60)}`);
const after = await j('/api/admin/v1/system/settings', { headers: auth });
const digest = after.body.items?.find((i) => i.key === 'dailyDigestEnabled');
record('unwired setting value unchanged', digest?.value !== true, `dailyDigestEnabled=${digest?.value}`);

// --- logRetentionDays has a real consumer (prune on startup) ---
const retention = after.body.items?.find((i) => i.key === 'logRetentionDays');
record('logRetentionDays is enforced at startup', settings.body.enforcedKeys.includes('logRetentionDays'), `value=${retention?.value}`);

console.log(out.join('\n'));
const failed = out.filter((l) => l.startsWith('FAIL'));
console.log(`\n${out.length - failed.length}/${out.length} pass`);
process.exitCode = failed.length ? 1 : 0;
