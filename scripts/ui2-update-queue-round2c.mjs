// Round 2 queue update, part 3: the last page of the round (RealityHandoff), reached from 行动.
import { readFileSync, writeFileSync } from 'node:fs';
const PATH = 'docs/design-v2/UI_V2_MASTER_QUEUE.json';
const queue = JSON.parse(readFileSync(PATH, 'utf8'));

const task = queue.tasks.find((t) => t.page === 'RealityHandoff');
if (!task) throw new Error('RealityHandoff task not found');

Object.assign(task, {
  rendered: 'yes',
  interactionTested: 'yes',
  screenshot: 'artifacts/ui-v2/android/R2_RealityHandoff_after.png',
  note:
    'Reached from 行动 -> 找现实中的人. The 求助文本预览 is real logic, not static copy: changing the support method from 听我说 10 分钟 to 陪我出去走走 rewrote the preview text (R2_RealityHandoff_method.png), while the recipient choice does not vary it. The page states 系统不会自动联系任何人, which matches the contract that nothing is ever sent.',
});
task.done = 'no';

queue.updatedAt = new Date().toISOString();
writeFileSync(PATH, `${JSON.stringify(queue, null, 2)}\n`);

const round2 = queue.rounds.find((r) => r.round === 2);
const inRound2 = queue.tasks.filter((t) => t.round === 2);
console.log(`round 2 pages: ${inRound2.length}`);
for (const t of inRound2) {
  console.log(
    `  ${t.page.padEnd(22)} rendered=${t.rendered.padEnd(4)} interaction=${t.interactionTested.padEnd(4)} business=${t.businessVerified.padEnd(4)} done=${t.done}`,
  );
}
console.log(`round 2 gate: ${round2.gate}`);
