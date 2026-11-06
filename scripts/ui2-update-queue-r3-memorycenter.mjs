// Round 3 queue update: MemoryCenter.
import { readFileSync, writeFileSync } from 'node:fs';
const PATH = 'docs/design-v2/UI_V2_MASTER_QUEUE.json';
const queue = JSON.parse(readFileSync(PATH, 'utf8'));

const task = queue.tasks.find((t) => t.page === 'MemoryCenter');
if (!task) throw new Error('MemoryCenter task not found');

Object.assign(task, {
  implemented: 'yes',
  rendered: 'no',
  interactionTested: 'no',
  note:
    'Layout adopted from the design\'s shared language: a bare-chevron bar with the subtitle moved out to the page lead, sections as bare hairline rows instead of cards, a bolder section title, and the four memory states colour-coded (active/disabled/expired/deleted) because the brief asks for them to be strictly distinguishable. VERIFIED at code level: build ✓, typecheck ✓, all six data-testids unchanged, and no user-facing string added, changed or removed (the only text difference is where the subtitle renders). NOT VERIFIED visually — I could not navigate to this page on the emulator, so no screenshot exists and the design comparison has not been made. Deliberate omissions the implementer flagged: the design\'s interactive toggle (this page only reads the two consent flags; adding a write would be a contract change, and a toggle that only navigates is a fake control), its 管理 section and 了解使用方式 link (no such data), its row icons/chevrons (no per-record icon, no detail view), and its closing deletion note (no equivalent text in the file, and inventing product copy is not a restyle).',
});
task.done = 'no';

queue.updatedAt = new Date().toISOString();
writeFileSync(PATH, `${JSON.stringify(queue, null, 2)}\n`);
console.log(`MemoryCenter: implemented=${task.implemented} rendered=${task.rendered} interaction=${task.interactionTested}`);
