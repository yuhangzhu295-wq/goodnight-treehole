// Round 3 queue update: StableSelf.
import { readFileSync, writeFileSync } from 'node:fs';
const PATH = 'docs/design-v2/UI_V2_MASTER_QUEUE.json';
const queue = JSON.parse(readFileSync(PATH, 'utf8'));

const task = queue.tasks.find((t) => t.page === 'StableSelf');
if (!task) throw new Error('StableSelf task not found');

Object.assign(task, {
  implemented: 'yes',
  rendered: 'yes',
  interactionTested: 'partial',
  screenshot: 'artifacts/ui-v2/android/R3_StableSelf_after.png',
  note:
    'Layout adopted from the design: bare-chevron bar, heading + the real subtitle, bare section blocks instead of cards, the design\'s rounded-square check rows for anchors and contacts, and a pinned full-width CTA. The script block is untouched (verified by diff) and the only data-testid is preserved. The real page has four sections plus a details block where the mock shows two, and the real titles were kept where the mock\'s wording did not describe the real data. Two pieces of user-facing copy were ADDED by the implementer: the heading 清醒时候的提醒 and the note 这只是你自己记录过的判断，不是 AI 对你的结论。 The design shows a heading and a note block, but that wording is not in the mock or the original file. UNVERIFIED: the saved-state rendering (the API was erroring, so only the empty/error state was exercised).',
});
task.done = 'no';

queue.updatedAt = new Date().toISOString();
writeFileSync(PATH, `${JSON.stringify(queue, null, 2)}\n`);
console.log(`StableSelf: implemented=${task.implemented} rendered=${task.rendered} interaction=${task.interactionTested}`);
