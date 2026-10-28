// Round 2 queue update, part 2: the peer pages captured this session.
// Axes stay independent; `done` is never set here.
import { readFileSync, writeFileSync } from 'node:fs';
const PATH = 'docs/design-v2/UI_V2_MASTER_QUEUE.json';
const queue = JSON.parse(readFileSync(PATH, 'utf8'));

const UPDATES = {
  'UI-V2-05': {
    rendered: 'yes',
    screenshot: 'artifacts/ui-v2/android/R2_JourneyDetail_after.png',
    note:
      'Opened from 今晚 -> the recent-journey card. It lands on the flow\'s first step (confirm 发生了什么/现在/影响), rendered by SituationConfirmationScreen in the older illustrated style, so this is the entry state only - the temperature/intent/stabilize/timeline steps are not captured and the page is not yet redesigned to V2.',
  },
  'UI-V2-06': {
    rendered: 'yes',
    screenshot: 'artifacts/ui-v2/android/R2_PeerExperienceDetail_after.png',
    note:
      'Reached from 同路 -> 最新 -> 查看后来记录. Real content, an honest empty state for 后来是这样走过来的, and no action shown without a matchId (opening it from a match is the path that carries one; not captured).',
  },
  'UI-V2-07': {
    rendered: 'yes',
    interactionTested: 'yes',
    screenshot: 'artifacts/ui-v2/android/R2_PeerRequests_after.png',
    note:
      'Reached through its own PEER_REQUEST notification, with a live pending request. 我愿意聊聊 moves it into the 待确认边界的同行 panel and then into the boundary-confirmation page, so the accept -> consent -> waiting chain is verified end to end.',
  },
  'UI-V2-08': {
    rendered: 'yes',
    screenshot: 'artifacts/ui-v2/android/R2_PeerMatchWaiting_after.png',
    note: 'Reached by consenting on the previous page; shows 请求状态 / 正在等待对方决定, which is the correct state for the side that has consented.',
  },
  'UI-V2-09': {
    rendered: 'yes',
    interactionTested: 'yes',
    screenshot: 'artifacts/ui-v2/android/R2_PeerConsent_after.png',
    issue: 'UI2-013 fixed (a pre-checked, disabled checkbox claimed an acknowledgement the user never gave)',
    note:
      'All four boundary rules render. Consenting set ownerConsentAt while requesterConsentAt stayed undefined and no conversation was created, so accepting a request did not become an active chat - the behaviour the brief asks for.',
  },
};

for (const task of queue.tasks) {
  const update = UPDATES[task.id];
  if (!update) continue;
  Object.assign(task, update);
  task.done = 'no';
}
queue.updatedAt = new Date().toISOString();
writeFileSync(PATH, `${JSON.stringify(queue, null, 2)}\n`);
for (const id of Object.keys(UPDATES)) {
  const t = queue.tasks.find((x) => x.id === id);
  console.log(`${id} ${t.page}: rendered=${t.rendered} interaction=${t.interactionTested} done=${t.done}`);
}
