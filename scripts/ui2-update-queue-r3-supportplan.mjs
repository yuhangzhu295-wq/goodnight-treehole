// Round 3 queue update: SupportPlan.
import { readFileSync, writeFileSync } from 'node:fs';
const PATH = 'docs/design-v2/UI_V2_MASTER_QUEUE.json';
const queue = JSON.parse(readFileSync(PATH, 'utf8'));

const task = queue.tasks.find((t) => t.page === 'SupportPlan');
if (!task) throw new Error('SupportPlan task not found');

Object.assign(task, {
  implemented: 'yes',
  rendered: 'yes',
  interactionTested: 'partial',
  screenshot: 'artifacts/ui-v2/android/R3_SupportPlan_after.png',
  note:
    'Layout adopted from the design: a bare-chevron bar titled 低谷预案, the note box, per-section title + 编辑 › toggling that one section into the existing chip editor, readable rows when not editing, and a pinned full-width 保存预案. Both data-testids, the sections array and keys, and the PUT /me/support-plan payload are unchanged. The real data has four sections where the mock shows three, and the real titles differ from the mock\'s, so the real ones are kept. UNVERIFIED: the saved-row rendering — the API was erroring during the capture (the page showed 服务暂时不可用), so only the empty state was exercised.',
});
task.done = 'no';

queue.updatedAt = new Date().toISOString();
writeFileSync(PATH, `${JSON.stringify(queue, null, 2)}\n`);
console.log(`SupportPlan: implemented=${task.implemented} rendered=${task.rendered} interaction=${task.interactionTested}`);
