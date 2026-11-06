// Round 3 queue update: DecisionVault.
import { readFileSync, writeFileSync } from 'node:fs';
const PATH = 'docs/design-v2/UI_V2_MASTER_QUEUE.json';
const queue = JSON.parse(readFileSync(PATH, 'utf8'));

const task = queue.tasks.find((t) => t.page === 'DecisionVault');
if (!task) throw new Error('DecisionVault task not found');

Object.assign(task, {
  implemented: 'yes',
  rendered: 'no',
  interactionTested: 'no',
  note:
    'Layout adopted from the design\'s shared language: a bare-chevron bar with the subtitle moved out to the page lead, sections as bare hairline blocks instead of cards, hairline-separated rows with a status icon tile, and the boundary note as the design\'s soft filled block. VERIFIED at code level: typecheck ✓, one file touched, the script untouched, and no user-facing string added, changed or removed (the only text difference is where the two header strings render). The file contains no data-testids in HEAD or now, so none were lost. NOT VERIFIED visually: I could not navigate to this page — its only entry is 我的 → 更多自我支持 → 决定保险箱, and the ActionCenter\'s 一个重要决定 shortcut opens a bottom sheet rather than this route. Deliberate omissions the implementer flagged: the design\'s 考虑中/冷静中/已决定 tab row and its section headings (design-only copy plus new filter behaviour), its per-row chevrons (no detail route exists, so they would be a false affordance), and its row subtitles (design-only strings); the page keeps its own heading 决定保险箱 rather than the mock\'s 重要决定.',
});
task.done = 'no';

queue.updatedAt = new Date().toISOString();
writeFileSync(PATH, `${JSON.stringify(queue, null, 2)}\n`);
console.log(`DecisionVault: implemented=${task.implemented} rendered=${task.rendered}`);
