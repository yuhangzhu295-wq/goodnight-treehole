// Round 3 queue update: Archive, plus a record of the commit-message error that captured it.
import { readFileSync, writeFileSync } from 'node:fs';
const PATH = 'docs/design-v2/UI_V2_MASTER_QUEUE.json';
const queue = JSON.parse(readFileSync(PATH, 'utf8'));

const task = queue.tasks.find((t) => t.page === 'Archive');
if (!task) throw new Error('Archive task not found');

Object.assign(task, {
  implemented: 'yes',
  rendered: 'no',
  interactionTested: 'no',
  note:
    'Layout adopted from the design\'s shared language: the gradient hero with its tree cutout replaced by a bare-chevron bar and a page lead, the tabs and the 旅程归档 entry merged into one chip row, the time-scope filter moved under the tabs, the card replaced by month groups of hairline rows, and the page\'s bottom padding reserving the tab bar (this route IS in tabbarPaths). VERIFIED at code level: build ✓, typecheck ✓, and the testid VALUES are unchanged — the diff only renames the loop variable, so `index === 0 ? ...` became `entry.index === 0 ? ...` and renders identical attribute values. NOT VERIFIED visually. Deliberate omissions: the design\'s search icon (no search API or behaviour exists, so it would be a dead control), its 关系/工作/生活 category chips (those categories are not in the data contract; the page keeps its two real axes, content type and time scope), and its row subtitles and footer note (design-only copy). The page keeps its own heading 日记与回信 rather than the mock\'s 旅程归档, because the page covers diaries, posts and letters too.',
  commitNote:
    'PROCESS ERROR: most of this file was committed inside a29bb46, whose message says "restyle DecisionVault ... one file touched". It was not one file — my `git add -A` swept the in-flight Archive.vue in while a background agent was still writing it. I had verified DecisionVault while Archive was clean and then committed after the agent wrote the file. The swept code was checked afterwards and is coherent (build and typecheck pass, testid values unchanged), and the remainder is committed on its own. Do not run `git add -A` while a background agent is writing the same working tree.',
});
task.done = 'no';

queue.updatedAt = new Date().toISOString();
writeFileSync(PATH, `${JSON.stringify(queue, null, 2)}\n`);
console.log(`Archive: implemented=${task.implemented} rendered=${task.rendered} (recorded the commit-message error)`);
