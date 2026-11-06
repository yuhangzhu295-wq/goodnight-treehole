// Round 2 queue update, part 4: JourneyDetail's V2 redesign.
import { readFileSync, writeFileSync } from 'node:fs';
const PATH = 'docs/design-v2/UI_V2_MASTER_QUEUE.json';
const queue = JSON.parse(readFileSync(PATH, 'utf8'));

const task = queue.tasks.find((t) => t.page === 'JourneyDetail');
if (!task) throw new Error('JourneyDetail task not found');

Object.assign(task, {
  implemented: 'yes',
  rendered: 'yes',
  interactionTested: 'partial',
  screenshot:
    'artifacts/ui-v2/android/R2_JourneyDetail_{confirm_v2,temperature_v2,intent_v2,timeline_v2}.png',
  issue:
    'UI2-014 fixed (two symptom options were clipped and unreachable), UI2-015 fixed (the V1 night-sky hero, illustrations and serif type replaced by the design\'s stable bar, status card and timeline)',
  note:
    'All five steps were restyled to the V2 flat language and every data-testid, prop, emit and API call kept. Four steps were captured on device; the stabilize step was not, so its appearance is unverified. The confirm/temperature/intent steps were clicked through to reach the timeline, so the flow is exercised, but the stabilize controls (breathing, cooldown, note) were not.',
});
task.done = 'no';

queue.updatedAt = new Date().toISOString();
writeFileSync(PATH, `${JSON.stringify(queue, null, 2)}\n`);

const round2 = queue.tasks.filter((t) => t.round === 2);
console.log(`round 2: ${round2.length} pages`);
for (const t of round2) {
  console.log(
    `  ${t.page.padEnd(22)} rendered=${t.rendered.padEnd(4)} interaction=${t.interactionTested.padEnd(8)} implemented=${t.implemented.padEnd(4)} done=${t.done}`,
  );
}
