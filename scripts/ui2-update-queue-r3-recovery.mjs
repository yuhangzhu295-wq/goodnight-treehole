// Round 3 queue update: Recovery.
import { readFileSync, writeFileSync } from 'node:fs';
const PATH = 'docs/design-v2/UI_V2_MASTER_QUEUE.json';
const queue = JSON.parse(readFileSync(PATH, 'utf8'));

const task = queue.tasks.find((t) => t.page === 'Recovery');
if (!task) throw new Error('Recovery task not found');

Object.assign(task, {
  implemented: 'yes',
  rendered: 'yes',
  interactionTested: 'partial',
  screenshot: 'artifacts/ui-v2/android/R3_Recovery_after.png',
  issue: 'The first attempt appended its CSS after </style>, so the page rendered unstyled; reverted and redone inside the block.',
  note:
    'Restructured to the design: a bare-chevron bar, 今天的状态 with the design\'s copy, the six indicators as topic chips, the selected topic\'s three-state control, a contextual note, a real 最近一周 grid built from the records, 以前的记录 rows of title + date · category, and a pinned full-width 记录今天. The signals payload is unchanged: all six indicators and their three states still reach the API in the same shape. Deviations: 最近一次变化 and 与稳定期参考比对 are kept as subdued single lines (the brief forbids dropping functionality to match a mock), and the week grid marks only whether a day has a record rather than scoring it.',
});
task.done = 'no';

queue.updatedAt = new Date().toISOString();
writeFileSync(PATH, `${JSON.stringify(queue, null, 2)}\n`);
console.log(`Recovery: implemented=${task.implemented} rendered=${task.rendered} interaction=${task.interactionTested}`);
