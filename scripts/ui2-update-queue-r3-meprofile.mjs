// Round 3 queue update: MeProfile, including the UI2-016 fix.
import { readFileSync, writeFileSync } from 'node:fs';
const PATH = 'docs/design-v2/UI_V2_MASTER_QUEUE.json';
const queue = JSON.parse(readFileSync(PATH, 'utf8'));

const task = queue.tasks.find((t) => t.page === 'MeProfile');
if (!task) throw new Error('MeProfile task not found');

Object.assign(task, {
  implemented: 'yes',
  rendered: 'no',
  interactionTested: 'no',
  issue:
    'UI2-016 FIXED: the root was `<section v-if="profile">` with no try/catch, so a failed profile request rendered a completely blank page. The root and the bar now always render, only the content is gated, and a failure shows a message with a retry.',
  note:
    'Restyle adopted from the design plus the UI2-016 fix. VERIFIED at code level: build ✓, typecheck ✓, `front-profile-back` preserved, the API call byte-identical, the root no longer gated, the file ends with </style> and its tags balance (the build is the proof — vue-tsc does not check template structure). The design\'s chrome copy was adopted (bar title 匿名资料, section titles 基本资料/账号安全, row labels 昵称/匿名编号/账号状态/匿名身份说明), following the precedent of the already-reviewed Me.vue. NOT VERIFIED visually: the emulator shut down mid-render. Deliberate omissions, each because no real action exists behind it: the design\'s 保存资料 CTA (there is no PATCH/PUT for the profile), its 已登录设备 / 查看与撤销会话 row (listActiveForUser returns no deviceId while revoke-device requires one, and there is no per-session revoke route), its 匿名身份说明 chevron (no explaining page), and the row chevrons. The root class also dropped `goodnight-page`, which returns the shell\'s safe-area top padding so the bar clears the status bar, and drops the 130px tab-bar reserve that this route does not need.',
});
task.done = 'no';

queue.updatedAt = new Date().toISOString();
writeFileSync(PATH, `${JSON.stringify(queue, null, 2)}\n`);
console.log(`MeProfile: implemented=${task.implemented} rendered=${task.rendered} (UI2-016 fixed)`);
