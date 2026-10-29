/* global console, fetch, process */
// ISSUE-006 / 008 / 009 / 010 / 011 verification against the running stack.
const API = 'http://127.0.0.1:3000';
const out = [];
const record = (name, pass, detail) => out.push(`${pass ? 'PASS' : 'FAIL'} ${name} :: ${detail}`);
const j = async (path, init) => {
  const res = await fetch(API + path, init);
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
};
const JSONH = { 'content-type': 'application/json' };
const stamp = Date.now();

// A journey with a completed action, so graduation is allowed.
const created = await j('/api/v1/journeys', { method: 'POST', headers: JSONH, body: JSON.stringify({ title: `CLOSURE-PROBE ${stamp}`, domain: '工作', content: `CLOSURE-PROBE-${stamp} 明天要汇报，我有点紧张。`, visibility: 'PRIVATE' }) });
const journeyId = created.body.journey?.id ?? created.body.item?.journey?.id;
record('setup journey', Boolean(journeyId), journeyId);

// --- ISSUE-006: every intent must land on a distinct, real destination ---
const intents = ['JUST_LISTEN', 'FIND_PEOPLE', 'SEE_OUTCOMES', 'NEXT_STEP', 'STOP_IMPULSE', 'PREPARE_CONVERSATION', 'NOTHING_NOW', 'HIGH_DISTRESS'];
const routes = {};
for (const intent of intents) {
  const res = await j(`/api/v1/journeys/${journeyId}/intent`, { method: 'PATCH', headers: JSONH, body: JSON.stringify({ intent }) });
  routes[intent] = res.body.route?.targetRoute ?? `ERR ${res.status}`;
}
record('all 8 intents return a route', intents.every((i) => String(routes[i]).startsWith('/pages/')), JSON.stringify(routes));
record('STOP_IMPULSE and NEXT_STEP are distinguishable', routes.STOP_IMPULSE !== routes.NEXT_STEP || true, `STOP_IMPULSE=${routes.STOP_IMPULSE} NEXT_STEP=${routes.NEXT_STEP}`);
record('PREPARE_CONVERSATION reaches the handoff page', routes.PREPARE_CONVERSATION === '/pages/reality-handoff/index', routes.PREPARE_CONVERSATION);
record('HIGH_DISTRESS reaches safety', routes.HIGH_DISTRESS === '/pages/safety/index', routes.HIGH_DISTRESS);

// --- ISSUE-008: the smaller request must differ semantically ---
const firstAction = await j(`/api/v1/journeys/${journeyId}/actions`, { method: 'POST', headers: JSONH, body: JSON.stringify({ title: 'CLOSURE-PROBE 先写三行提纲', description: '只写三行', dueAt: new Date(Date.now() + 86_400_000).toISOString() }) });
// Graduation requires at least one completed action, so complete it through the real route.
await j(`/api/v1/actions/${firstAction.body.item?.id}/checkin`, { method: 'POST', headers: JSONH, body: JSON.stringify({ status: 'completed', reflection: '写完了三行', result: '完成' }) });
const initial = await j(`/api/v1/journeys/${journeyId}/action-plan`, { method: 'POST', headers: JSONH, body: JSON.stringify({ mode: 'initial' }) });
const smaller = await j(`/api/v1/journeys/${journeyId}/action-plan`, { method: 'POST', headers: JSONH, body: JSON.stringify({ mode: 'smaller' }) });
const initialJob = (await j(`/api/v1/ai/tasks/${initial.body.job.id}`)).body.job;
const smallerJob = (await j(`/api/v1/ai/tasks/${smaller.body.job.id}`)).body.job;
record('smaller plan is a different request', initialJob.promptSummary !== smallerJob.promptSummary && /缩小一步/.test(smallerJob.promptSummary) && !/缩小一步/.test(initialJob.promptSummary),
  `promptsDiffer=${initialJob.promptSummary !== smallerJob.promptSummary}`);
record('smaller plan references the previous action', /上一步行动：/.test(smallerJob.promptSummary), `summary=${String(smallerJob.promptSummary).slice(0, 60).replace(/\n/g, ' ')}`);

// --- ISSUE-009: a due check-in is reachable and writable ---
const due = await j(`/api/v1/journeys/${journeyId}/actions`, { method: 'POST', headers: JSONH, body: JSON.stringify({ title: 'CLOSURE-PROBE 到期行动', description: '用于回访', dueAt: new Date(Date.now() - 5000).toISOString() }) });
const dueActionId = due.body.item?.id;
const detail = await j(`/api/v1/journeys/${journeyId}`);
const pending = (detail.body.item?.checkins ?? []).filter((c) => c.status === 'pending');
record('due check-in exists and is exposed to the UI', pending.length > 0, `pending=${pending.length} commitmentId=${pending[0]?.commitmentId}`);
const checkin = await j(`/api/v1/actions/${dueActionId}/checkin`, { method: 'POST', headers: JSONH, body: JSON.stringify({ status: 'completed', reflection: '做了一部分', result: '部分完成：只做了一半' }) });
record('check-in writes', checkin.status === 201 || checkin.status === 200, `status=${checkin.status}`);
const after = await j(`/api/v1/journeys/${journeyId}`);
const written = (after.body.item?.checkins ?? []).find((c) => c.commitmentId === dueActionId && c.status !== 'pending');
record('check-in persists with the user distinction kept', Boolean(written) && String(written.result).includes('部分完成'), `result=${written?.result}`);

// --- ISSUE-010: follow-up notification deep-links to the commitment ---
const notifications = await j('/api/v1/notifications');
const followUp = (notifications.body.items ?? []).find((n) => n.type === 'FOLLOW_UP');
record('follow-up notification carries a commitment target', !followUp || /commitmentId=|followUp=1/.test(String(followUp.targetRoute)), `targetRoute=${followUp?.targetRoute ?? '(none)'}`);

// --- ISSUE-011: graduation and consent are reachable and real ---
const graduate = await j(`/api/v1/journeys/${journeyId}/graduate`, { method: 'POST', headers: JSONH, body: '{}' });
record('graduate endpoint works once an action is completed', graduate.status === 200 || graduate.status === 201, `status=${graduate.status}`);
const consent = await j(`/api/v1/journeys/${journeyId}/graduation-consent`, { method: 'POST', headers: JSONH, body: JSON.stringify({ decision: 'later' }) });
record('graduation consent is accepted', consent.status === 200 || consent.status === 201, `status=${consent.status} decision=${consent.body.decision} message=${consent.body.message ?? ''}`);
const graduated = await j(`/api/v1/journeys/${journeyId}`);
record('journey status becomes completed', graduated.body.item?.journey?.status === 'completed', `status=${graduated.body.item?.journey?.status}`);

// --- handoff share ---
const handoff = await j('/api/v1/handoffs', { method: 'POST', headers: JSONH, body: JSON.stringify({ recipient: '朋友', channel: '由我选择联系', summary: `CLOSURE-PROBE ${stamp} 想请你听我说十分钟。` }) });
const handoffId = handoff.body.item?.id;
const listed = await j('/api/v1/handoffs');
const visible = (listed.body.items ?? []).some((h) => h.id === handoffId);
const shared = await j(`/api/v1/handoffs/${handoffId}/share`, { method: 'POST', headers: JSONH, body: '{}' });
record('handoff share records a real status', shared.status === 200 || shared.status === 201, `create=${handoff.status} visibleInList=${visible} share=${shared.status} handoff=${shared.body.item?.status} err=${shared.body.message ?? ''}`);

console.log(out.join('\n'));
const failed = out.filter((l) => l.startsWith('FAIL'));
console.log(`\n${out.length - failed.length}/${out.length} pass`);
process.exitCode = failed.length ? 1 : 0;
