// Round 3 queue update: FutureSelf.
import { readFileSync, writeFileSync } from 'node:fs';
const PATH = 'docs/design-v2/UI_V2_MASTER_QUEUE.json';
const queue = JSON.parse(readFileSync(PATH, 'utf8'));

const task = queue.tasks.find((t) => t.page === 'FutureSelf');
if (!task) throw new Error('FutureSelf task not found');

Object.assign(task, {
  implemented: 'yes',
  rendered: 'yes',
  interactionTested: 'partial',
  screenshot: 'artifacts/ui-v2/android/R3_FutureSelf_{after,bottom}.png',
  issue:
    'A8 degradation fixed (the page blanked when the optional recovery context was refused); the CTA was behind the tab bar; the API 500 surfaced as raw English',
  note:
    'Restructured to the design: a bare-chevron bar, 留给之后的自己 with the design\'s copy, an input-first textarea, 什么时候再看 chips, a 通知 row reporting the real allowFutureSelfNotifications consent, and 已保存的信 rows of icon + status. Deviations: no 全部 › beside 已保存的信 (no destination exists, and the list is not truncated); 关联记录 is kept because the brief forbids dropping functionality to match a mock; and 明天晚上 is kept as a fourth preset beyond the design\'s three.',
});
task.done = 'no';

queue.updatedAt = new Date().toISOString();
writeFileSync(PATH, `${JSON.stringify(queue, null, 2)}\n`);
console.log(`FutureSelf: implemented=${task.implemented} rendered=${task.rendered} interaction=${task.interactionTested}`);
