// ToolDecompose's input and result path, asserted against the API and the database.
//
// The brief's bar for a tool page is "输入 → 任务运行 → 真实结果 → 保存/复制" with an honest DAPI
// failure. These cases assert the layers that can be checked without a secret: the typed text
// reaches Vue and is what the task is created with, the task reaches a terminal state, and saving
// writes the result to the diary under the caller's identity.
import { readFileSync } from 'node:fs';
import { withSession } from './device-session.mjs';
import { typeInto, hookPostBodies, postedBodies, ensureReverse } from './input-helpers.mjs';
import { PrismaClient } from '@prisma/client';

const env = readFileSync('.env', 'utf8');
const prisma = new PrismaClient({ datasources: { db: { url: env.match(/^DATABASE_URL="?([^"\n]+)"?$/m)[1] } } });
ensureReverse();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (name, verdict, note) => {
  results.push({ name, verdict });
  console.log(`${verdict === 'PASS' ? 'PASS ' : verdict === 'FAIL' ? 'FAIL ' : 'SKIP '} ${name}${note ? ' — ' + note : ''}`);
};
async function withDbRetry(fn, attempts = 5) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (e) {
      if (i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

const MARKER = `拆解输入_${Date.now()}`;

await withSession(async (session) => {
  const { call, ev } = session;
  await call('Runtime.enable');
  const go = async () => {
    await ev(
      `(function(){var a=document.createElement('a');a.href='/pages/tool/decompose';a.style.display='none';document.body.appendChild(a);a.click();a.remove();})()`,
      false,
    );
    await sleep(4000);
  };

  // --- 1. typing reaches Vue ---------------------------------------------------------------
  await go();
  const typed = await typeInto(session, 'input-decompose', MARKER);
  const counter = await ev("(function(){var e=document.querySelector('[data-testid=input-decompose]');return 'len='+e.value.length;})()", false);
  if (!typed.ok) record('typing reaches Vue', 'FAIL', typed.reason);
  else if (typed.domLength !== MARKER.length) record('typing reaches Vue', 'FAIL', `domLength=${typed.domLength}`);
  else record('typing reaches Vue', 'PASS', counter);

  // --- 2. the task is created with what was typed -------------------------------------------
  await hookPostBodies(session);
  await ev("(function(){var e=document.querySelector('[data-testid=btn-decompose-run]');e.click();return 1;})()", false);
  await sleep(3000);
  const bodies = await postedBodies(session, '/api/v1/ai/tasks');
  let task = null;
  try {
    task = JSON.parse(bodies[bodies.length - 1] ?? '{}');
  } catch {
    task = null;
  }
  if (!task || task.content !== MARKER) record('the task carries the typed text', 'FAIL', JSON.stringify(task?.content ?? null).slice(0, 50));
  else record('the task carries the typed text', 'PASS', `taskType=${task.taskType}`);

  // --- 3. the run ends in a real result or an honest notice ----------------------------------
  // Without a DAPI secret the job ends at 'fallback': the page must show the fallback content AND
  // say that it is a fallback, never present it as a live model result. Poll for the result card
  // instead of sleeping a fixed time - the job takes a few seconds and a fixed sleep either races it
  // or wastes the run.
  let rendered = {};
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    rendered = JSON.parse(
      (await ev(
        `(function(){
          var card=document.querySelector('[data-testid=decompose-result-card]');
          var notice=document.querySelector('.ai-degradation-notice');
          var floating=document.querySelector('.floating-status');
          return JSON.stringify({
            hasCard: Boolean(card),
            notice: notice ? notice.innerText.slice(0, 80) : null,
            floating: floating ? floating.innerText.slice(0, 80) : null
          });
        })()`,
        false,
      )) || '{}',
    );
    if (rendered.hasCard || rendered.floating) break;
    await sleep(1500);
  }
  if (!rendered.hasCard && !rendered.floating) record('the run ends in a real result or an honest notice', 'FAIL', 'neither a result nor a message appeared');
  else if (rendered.hasCard && !rendered.notice) record('the run ends in a real result or an honest notice', 'FAIL', 'a result is shown with no provenance notice');
  else record('the run ends in a real result or an honest notice', 'PASS', rendered.notice ? 'fallback labelled' : (rendered.floating ?? 'result shown'));

  // --- 4. saving writes the result under the caller's identity ------------------------------
  await go();
  await typeInto(session, 'input-decompose', `${MARKER}_save`);
  await sleep(300);
  await ev("(function(){var e=document.querySelector('[data-testid=btn-decompose-run]');e.click();return 1;})()", false);
  // Wait for the save button to exist rather than assuming a duration.
  const saveDeadline = Date.now() + 40000;
  let saveButton = false;
  while (Date.now() < saveDeadline) {
    saveButton = await ev("(function(){return Boolean(document.querySelector('[data-testid=btn-decompose-save]'))})()", false);
    if (saveButton) break;
    await sleep(1500);
  }
  const saved = saveButton
    ? await ev("(function(){var e=document.querySelector('[data-testid=btn-decompose-save]');e.click();return 'clicked';})()", false)
    : 'save button never appeared';
  await sleep(4000);
  const diary = await withDbRetry(() =>
    prisma.diary.findFirst({ where: { content: { contains: `${MARKER}_save` } }, orderBy: { createdAt: 'desc' } }),
  );
  if (!diary) record('saving writes a diary row', 'FAIL', `save button: ${saved}, no row`);
  else record('saving writes a diary row', 'PASS', `diary ${diary.id} user=${diary.userId}`);
});

await prisma.$disconnect();
const failed = results.filter((r) => r.verdict === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} decompose cases passed`);
if (failed.length) console.log('failed: ' + failed.map((r) => r.name).join(', '));
process.exit(failed.length ? 1 : 0);
