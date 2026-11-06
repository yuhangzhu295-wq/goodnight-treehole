// Updates the UI V2 master queue with the state actually reached in Round 2.
//
// The per-page axes are independent, so a page can be rendered and interaction-tested while still
// WAITING_REVIEW for the visual and code-review axes. `done` is only set when every axis is yes,
// and no page is set to `done` here.
import { readFileSync, writeFileSync } from 'node:fs';
const PATH = 'docs/design-v2/UI_V2_MASTER_QUEUE.json';
const queue = JSON.parse(readFileSync(PATH, 'utf8'));

const UPDATES = {
  'UI-V2-02': {
    rendered: 'yes',
    interactionTested: 'yes',
    screenshot: 'artifacts/ui-v2/android/R2_PeerNetwork_after.png',
    issue: 'UI2-004 (the feed shows near-identical rows: my own fixture duplicates, now hidden via admin review)',
    note: 'The 推荐 feed renders; the 已连接 link opens the conversation. Its rows are indistinguishable while the fixtures share a title, which is data, not layout.',
  },
  'UI-V2-10': {
    implemented: 'yes',
    rendered: 'yes',
    interactionTested: 'yes',
    businessVerified: 'yes',
    status: 'WAITING_REVIEW',
    visualApproved: 'WAITING_REVIEW',
    codeReviewApproved: 'WAITING_REVIEW',
    screenshot:
      'artifacts/ui-v2/android/R2_PeerConversation_{active,keyboard,typed,sent,sendfail,recovered,bottom,after,expired}.png',
    issue:
      'UI2-008 fixed (footer covered by the tab bar), UI2-010 fixed (composer not pinned, no scroll to the newest message), UI2-011 fixed (raw English network text)',
    note:
      'States exercised on emulator-5554: short, long and many messages; soft keyboard; scrolled to the bottom; failed send with the draft kept; network recovery; re-entry; closed; forced-expiry then restored; anonymous identity shown; AI assist failing honestly without a fake success. Send verified server-side (12 then 13 messages).',
  },
  'UI-V2-11': {
    rendered: 'yes',
    interactionTested: 'yes',
    screenshot: 'artifacts/ui-v2/android/R2_PeerGraduation_after.png',
    note: 'Reached by tapping 留下感受 on the closed conversation, which is itself the click test for UI2-008.',
  },
  'UI-V2-13': {
    implemented: 'yes',
    rendered: 'yes',
    screenshot: 'artifacts/ui-v2/android/R2_SafetySupport_after.png',
    issue: 'UI2-008 (same covered-footer class)',
    note: 'Redesigned in acfd8f9; the 5 original test ids and both tel: links preserved.',
  },
  'UI-V2-14': {
    implemented: 'yes',
    rendered: 'yes',
    interactionTested: 'yes',
    screenshot: 'artifacts/ui-v2/android/R2_NotificationCenter_after.png',
    issue: 'UI2-009 fixed (a failed read receipt used to swallow the tap)',
    note: 'The activation notice opens the active conversation, which is the deep link the Round 2 captures were reached through.',
  },
};

for (const task of queue.tasks) {
  const update = UPDATES[task.id];
  if (!update) continue;
  Object.assign(task, update);
  if (task.done !== 'yes') task.done = 'no';
}
queue.updatedAt = new Date().toISOString();
writeFileSync(PATH, `${JSON.stringify(queue, null, 2)}\n`);
for (const id of Object.keys(UPDATES)) {
  const t = queue.tasks.find((x) => x.id === id);
  console.log(`${id} ${t.page}: rendered=${t.rendered} interaction=${t.interactionTested} business=${t.businessVerified} done=${t.done}`);
}
