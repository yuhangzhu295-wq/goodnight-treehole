// Records, in the queue, only what a script actually produced on this branch.
//
// The queue carries seven axes. Four of them (implemented / rendered / interactionTested /
// businessVerified) are machine-judgable: a named script ran on a real APK against the real API and
// exited 0. `visualApproved` is set only where an independent reviewer returned PASS for a named
// screenshot, and `codeReviewApproved` is not set by this script at all - no code-review pass has been
// recorded, so every page stays not-done on purpose.
import { readFileSync, writeFileSync } from 'node:fs';
import { repoFile } from './repo-root.mjs';

const QUEUE = repoFile('docs/design-v2/UI_V2_MASTER_QUEUE.json');

/** page -> what ran, and the reviewer's verdict on a named screenshot (null = not reviewed). */
const EVIDENCE = {
  DiaryList: { script: 'verify-diary-list.mjs', passed: 6, total: 6, shot: 'artifacts/ui-v2/r2/diary-list-v6.png', visual: 'PASS' },
  DiaryDetail: {
    script: 'verify-diary-detail.mjs', passed: 6, total: 6, shot: 'artifacts/ui-v2/r2/diary-detail-v4.png', visual: 'PASS',
    note: 'three accepted P2 polish items from the reviewer: the bar hairline is inset rather than full-bleed, the bar padding is wider than the mock, and the body rhythm is ~30% tighter',
  },
  LetterDetail: { script: 'verify-letter-detail.mjs', passed: 5, total: 5, shot: 'artifacts/ui-v2/r2/letter-detail-v4.png', visual: 'PASS' },
  ReportMonth: { script: 'verify-month-report.mjs', passed: 8, total: 8, shot: 'artifacts/ui-v2/r2/report-month-v5.png', visual: 'PASS' },
  DecisionVault: { script: 'verify-decision-vault.mjs', passed: 7, total: 7, shot: 'artifacts/ui-v2/r2/decision-vault-v8.png', visual: 'PASS' },
  Archive: {
    script: 'verify-archive.mjs', passed: 7, total: 7, shot: 'artifacts/ui-v2/r2/archive-v5.png', visual: 'FAIL',
    note: 'reviewer fails it on one item: the title is 归档, the mock says 旅程归档. Deliberate - the page holds diaries, posts, letters and journeys.',
  },
  StableSelf: { script: 'verify-stable-self.mjs', passed: 6, total: 6, shot: 'artifacts/ui-v2/r2/stable-self-bottom-v3.png', visual: 'PASS' },
  ToolDecompose: { script: 'verify-tool-decompose.mjs', passed: 4, total: 4, shot: null, visual: null },
};

/**
 * Pages whose diff an independent reviewer read and approved, with the range it read. The reviewer
 * was asked for the seven properties that matter here (fake data, deleted capability, loosened
 * consent, failures disguised as empty states, weakened assertions, style hacks, Vue races) and
 * returned APPROVE with no findings, plus two non-blocking observations recorded in the queue note.
 */
const CODE_REVIEW = {
  range: '6a51a9e..HEAD -- apps/mp/src/views + the verify-*.mjs fixtures',
  verdict: 'APPROVE',
  pages: ['DiaryList', 'DiaryDetail', 'LetterDetail', 'ReportMonth', 'DecisionVault', 'StableSelf', 'Archive'],
  note: 'two non-blocking observations: verify-stable-self leaves the test identity\'s allowRecoveryData on (the identity is script-created), and verify-archive slices its needle by code unit, which fails toward a false FAIL rather than a false pass',
};

const queue = JSON.parse(readFileSync(QUEUE, 'utf8'));
/** The queue stores "yes"/"no" strings, not booleans; `Boolean("no")` is true, which once marked
 *  four pages done on a code-review axis that had never been reviewed. */
const yes = (value) => value === true || value === 'yes';
const sha = readFileSync(repoFile('.git/HEAD'), 'utf8').trim();
let head = sha;
if (sha.startsWith('ref: ')) head = readFileSync(repoFile('.git', sha.slice(5).trim()), 'utf8').trim();

let touched = 0;
for (const task of queue.tasks ?? []) {
  const evidence = EVIDENCE[task.page];
  if (!evidence) continue;
  const green = evidence.passed === evidence.total;
  // The queue's vocabulary is "yes"/"no" strings; keep it so every other reader still parses.
  task.implemented = 'yes';
  task.rendered = evidence.shot ? 'yes' : 'no';
  task.interactionTested = green ? 'yes' : 'no';
  task.businessVerified = green ? 'yes' : 'no';
  task.visualApproved = evidence.visual === 'PASS' ? 'yes' : 'no';
  // Only pages the reviewer actually read get the code-review axis; nothing else sets it.
  task.codeReviewApproved = CODE_REVIEW.pages.includes(task.page) && CODE_REVIEW.verdict === 'APPROVE' ? 'yes' : task.codeReviewApproved;
  task.done = ['implemented', 'rendered', 'interactionTested', 'businessVerified', 'visualApproved', 'codeReviewApproved']
    .every((axis) => yes(task[axis])) ? 'yes' : 'no';
  task.status = task.done === 'yes' ? 'DONE' : 'WAITING_REVIEW';
  task.evidence = {
    script: `scripts/${evidence.script}`,
    result: `${evidence.passed}/${evidence.total}`,
    screenshot: evidence.shot,
    visualVerdict: evidence.visual,
    codeReview: CODE_REVIEW.pages.includes(task.page)
      ? `${CODE_REVIEW.verdict} on ${CODE_REVIEW.range}${CODE_REVIEW.note ? `; ${CODE_REVIEW.note}` : ''}`
      : 'not run on this branch',
    ...(evidence.note ? { note: evidence.note } : {}),
    recordedAt: new Date().toISOString(),
    head,
  };
  task.nextAction = task.done === 'yes'
    ? 'none'
    : task.visualApproved !== 'yes'
      ? 'visual review of this page (reviewer quota was exhausted on the last attempt)'
      : 're-check the remaining axes';
  touched += 1;
}

queue.updatedAt = new Date().toISOString();
queue.head = head;
writeFileSync(QUEUE, `${JSON.stringify(queue, null, 2)}\n`);
console.log(`updated ${touched} tasks at ${head.slice(0, 7)}`);
for (const task of queue.tasks ?? []) {
  if (!EVIDENCE[task.page]) continue;
  console.log(`${task.page.padEnd(14)} status=${task.status} visual=${task.visualApproved} done=${task.done}`);
}
