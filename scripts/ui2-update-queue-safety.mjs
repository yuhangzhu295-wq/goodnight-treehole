// Records the SafetySupport interaction evidence, separating what was proven from what was not.
import { readFileSync, writeFileSync } from 'node:fs';
const PATH = 'docs/design-v2/UI_V2_MASTER_QUEUE.json';
const queue = JSON.parse(readFileSync(PATH, 'utf8'));

const task = queue.tasks.find((t) => t.page === 'SafetySupport');
if (!task) throw new Error('SafetySupport task not found');

Object.assign(task, {
  rendered: 'yes',
  // Not 'yes': one of the two emergency links was confirmed with its number on screen, the other
  // only as far as the dialer being brought to the front.
  interactionTested: 'partial',
  screenshot: 'artifacts/ui-v2/android/R2_SafetySupport_after.png',
  note:
    'Reached from 行动 -> 先缓一缓. The danger block, the three 可以先做的事 steps, both action rows and the footer disclaimer all render. Emergency links: 紧急医疗求助 120 opened the dialer with 120 pre-filled (R2_SafetySupport_dialer.png) - no call was placed, the dialer needs an explicit Call. 12356 was seen to bring the dialer to the front (topResumedActivity com.google.android.dialer/...MainActivityDialAlias) but its number was never captured on screen: the dialer was still blank on the first attempt and every retry afterwards lost the foreground to the other project\'s automation or found the app no longer on this page. Recorded as partial, not verified.',
});
task.done = 'no';

queue.updatedAt = new Date().toISOString();
writeFileSync(PATH, `${JSON.stringify(queue, null, 2)}\n`);
console.log(`SafetySupport: rendered=${task.rendered} interaction=${task.interactionTested}`);
