/* global console, fetch, process */
// ISSUE-021 (monthly privacy) and ISSUE-022 (memory permissions).
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

// --- ISSUE-021: the report belongs to the caller ---
const demo = await j('/api/v1/reports/monthly', { headers: H('user_demo') });
const guest = await j('/api/v1/reports/monthly', { headers: H('user_guest') });
record('monthly report is caller-scoped', demo.status === 200 && guest.status === 200 && demo.body.item?.totalRecords !== guest.body.item?.totalRecords,
  `demo=${demo.body.item?.totalRecords} guest=${guest.body.item?.totalRecords}`);
const unknown = await j('/api/v1/reports/monthly', { headers: H('user_attacker') });
record('unknown caller is rejected', unknown.status === 404, `status=${unknown.status}`);

// --- ISSUE-021: allowRecoveryData gates recovery-derived facts ---
const on = await j('/api/v1/reports/monthly', { headers: H('user_demo') });
const onFacts = on.body.item?.recovery;
await j('/api/v1/settings/privacy', { method: 'PUT', headers: H('user_demo'), body: JSON.stringify({ allowRecoveryData: false }) });
const off = await j('/api/v1/reports/monthly', { headers: H('user_demo') });
const offFacts = off.body.item?.recovery;
record('allowRecoveryData gates the report facts', Number(onFacts?.actionCount ?? 0) > 0 && Number(offFacts?.actionCount ?? -1) === 0,
  `on actionCount=${onFacts?.actionCount} off actionCount=${offFacts?.actionCount}`);
record('the API cannot be used to bypass it', Number(offFacts?.journeyCount ?? -1) === 0 && Number(offFacts?.recoveryCheckinCount ?? -1) === 0,
  `journeyCount=${offFacts?.journeyCount} recoveryCheckinCount=${offFacts?.recoveryCheckinCount}`);
await j('/api/v1/settings/privacy', { method: 'PUT', headers: H('user_demo'), body: JSON.stringify({ allowRecoveryData: true }) });
const restored = await j('/api/v1/reports/monthly', { headers: H('user_demo') });
record('facts return after re-enabling', Number(restored.body.item?.recovery?.actionCount ?? 0) > 0, `actionCount=${restored.body.item?.recovery?.actionCount}`);

// --- ISSUE-022: a disabled memory must not silently re-activate ---
const created = await j('/api/v1/memory', { method: 'POST', headers: H('user_demo'), body: JSON.stringify({ title: `MEM-PROBE ${Date.now()}`, content: '验证停用后不会被自动重新启用', scope: 'all_ai', days: 30 }) });
const memoryId = created.body.item?.id;
await j(`/api/v1/me/memories/${memoryId}`, { method: 'PATCH', headers: H('user_demo'), body: JSON.stringify({ status: 'disabled' }) });
const disabled = await j('/api/v1/me/memories', { headers: H('user_demo') });
const disabledItem = (disabled.body.items ?? []).find((m) => m.id === memoryId);
record('memory can be disabled', disabledItem?.status === 'disabled', `status=${disabledItem?.status}`);
// Editing the retention window must not flip the status back.
await j(`/api/v1/me/memories/${memoryId}`, { method: 'PATCH', headers: H('user_demo'), body: JSON.stringify({ days: 60 }) });
const afterEdit = await j('/api/v1/me/memories', { headers: H('user_demo') });
const afterItem = (afterEdit.body.items ?? []).find((m) => m.id === memoryId);
record('editing days does not re-activate a disabled memory', afterItem?.status === 'disabled', `status=${afterItem?.status}`);

// --- ISSUE-022: the AI gate is a separate flag ---
await j('/api/v1/settings/privacy', { method: 'PUT', headers: H('user_demo'), body: JSON.stringify({ allowAiMemoryUse: false }) });
const privacyOff = await j('/api/v1/settings/privacy', { headers: H('user_demo') });
record('allowAiMemoryUse is independent of allowLongTermMemory', privacyOff.body.item?.allowAiMemoryUse === false && privacyOff.body.item?.allowLongTermMemory === true,
  `aiUse=${privacyOff.body.item?.allowAiMemoryUse} storage=${privacyOff.body.item?.allowLongTermMemory}`);
await j('/api/v1/settings/privacy', { method: 'PUT', headers: H('user_demo'), body: JSON.stringify({ allowAiMemoryUse: true }) });

// cleanup the probe memory
await j(`/api/v1/memory/${memoryId}`, { method: 'DELETE', headers: H('user_demo') });

console.log(out.join('\n'));
const failed = out.filter((l) => l.startsWith('FAIL'));
console.log(`\n${out.length - failed.length}/${out.length} pass`);
process.exitCode = failed.length ? 1 : 0;
