/* global console, fetch, setTimeout */
const BASE = 'http://127.0.0.1:3000';
const create = await fetch(BASE + '/api/v1/ai/tasks', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ taskType: 'public_ai_reply', content: 'DAPI balance probe: reply warmly in one short sentence.' }),
});
const created = await create.json();
const id = created.jobId;
console.log('job', id, 'initial', created.status);
const deadline = Date.now() + 60_000;
let last;
while (Date.now() < deadline) {
  const res = await fetch(`${BASE}/api/v1/ai/tasks/${id}`);
  last = await res.json();
  if (!['queued', 'running'].includes(last.status)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
console.log(JSON.stringify({ status: last?.status, providerId: last?.providerId, modelName: last?.modelName, result: String(last?.result ?? '').slice(0, 300), error: String(last?.error ?? last?.errorMessage ?? '').slice(0, 300) }, null, 2));
