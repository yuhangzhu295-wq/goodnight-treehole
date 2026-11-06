/* global console, fetch, document, process */
// Browser acceptance for the two admin surfaces added in this round: the report queue and the
// operator note history. Real entry (sidebar) -> real action (click) -> real API -> real DB.
import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';

const ADMIN = 'http://127.0.0.1:5174';
const API = 'http://127.0.0.1:3000';
const out = [];
const record = (name, pass, detail) => out.push(`${pass ? 'PASS' : 'FAIL'} ${name} :: ${detail}`);

const apiLogin = await fetch(`${API}/api/admin/v1/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
const token = (await apiLogin.json()).token;
const api = async (path) => (await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } })).json();

const browser = await chromium.launch();
const page = await (await browser.newContext({ locale: 'zh-CN' })).newPage();
await page.setViewportSize({ width: 1448, height: 1086 });

/** Poll until `check` returns true. The admin pages reload their list after a write, and a
 *  single read races that reload: the row is re-fetched and re-rendered a moment later. */
async function waitFor(check, label, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    last = await check().catch(() => '');
    if (last) return last;
    await page.waitForTimeout(400);
  }
  return '';
}

async function rowsOf() {
  return page.locator('.resource-table tbody tr').evaluateAll((rs) =>
    rs.map((r) => Array.from(r.querySelectorAll('td')).map((c) => c.textContent.trim()).join('|')));
}
await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('admin-login-username').fill('admin');
await page.getByTestId('admin-login-password').fill('admin123');
await page.getByTestId('admin-login-submit').click();
await page.waitForURL('**/dashboard', { timeout: 20000 });
record('admin login through the real form', true, page.url());

async function openSecondaryNav() {
  const details = page.locator('details.more-nav');
  if (await details.count()) {
    if (!(await details.evaluate((el) => el.hasAttribute('open')))) await details.locator('summary').click();
    await page.waitForTimeout(400);
  }
}

// ---------------- report queue ----------------
await openSecondaryNav();
await page.getByTestId('admin-nav-peer-reports').click();
await page.waitForURL('**/experience/peer-reports', { timeout: 15000 });
await page.waitForTimeout(1500);
record('the report queue is reachable from the sidebar', page.url().includes('/experience/peer-reports'), page.url());

const headers = await page.locator('.resource-table thead th').allInnerTexts();
record('the report table renders reporter, reason and state',
  headers.includes('举报人') && headers.includes('举报原因') && headers.includes('处理状态'),
  headers.join(' | '));

// This check handles the report it works on, so repeated runs drain the open queue. Make sure
// there is one open report by filing one through the real user route when needed.
async function ensureOpenReport() {
  let open = await api('/api/admin/v1/peer-reports?status=open&pageSize=100');
  if ((open.items ?? []).length) return (open.items ?? []).length;
  const prisma = new PrismaClient();
  try {
    const conversation = await prisma.peerConversation.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!conversation) return 0;
    await fetch(`${API}/api/v1/peer-conversations/${conversation.matchId}/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goodnight-user-id': conversation.starterUserId },
      body: JSON.stringify({ reason: `RC-UI-REPORT-${Date.now()} 后台界面验证用举报` }),
    });
  } finally {
    await prisma.$disconnect();
  }
  open = await api('/api/admin/v1/peer-reports?status=open&pageSize=100');
  return (open.items ?? []).length;
}

// Force a known state: filter to 待处理 so the first row is genuinely open.
const openCount = await ensureOpenReport();
record('there is an open report to work', openCount > 0, `openReports=${openCount}`);
if (openCount > 0) {
  await page.selectOption('select[data-testid="admin-user-status-filter"]', 'open');
  await page.waitForTimeout(1500);
  const firstId = (await page.getByTestId('peer-reports-row-first').locator('td').first().innerText()).trim();
  record('the first row carries a real report id', /^peer_report_/.test(firstId), `id=${firstId}`);

  const rowBefore = (await page.getByTestId('peer-reports-row-first').locator('td').allInnerTexts()).join(' | ');
  record('an open report renders as 待处理', rowBefore.includes('待处理'), rowBefore.replace(/\n/g, ' ').slice(0, 110));

  await page.getByTestId('peer-reports-row-first').click();
  await page.waitForTimeout(400);
  const drawer = await page.getByTestId('admin-detail-drawer').innerText();
  record('the report drawer shows reason, time and reporter',
    drawer.includes('举报原因') && drawer.includes('举报时间') && drawer.includes('举报人'),
    drawer.replace(/\s+/g, ' ').slice(0, 130));
  await page.getByTestId('admin-detail-close').click();
  await page.waitForTimeout(400);

  await page.getByTestId('admin-report-handle').click();
  // The 待处理 filter is active, so the correct refresh is the row leaving this list rather
  // than staying and changing its badge.
  const leftOpen = await waitFor(async () => {
    const rows = await rowsOf();
    return !rows.some((r) => r.includes(firstId)) ? `openRows=${rows.length}` : '';
  }, 'row leaves the open list');
  const after = await api(`/api/admin/v1/peer-reports?q=${encodeURIComponent(firstId)}`);
  const afterItem = (after.items ?? []).find((r) => r.id === firstId);
  record('clicking 标记为已处理 writes through the API',
    afterItem?.status === 'handled' && Boolean(afterItem?.handledAt),
    `status=${afterItem?.status} handledAt=${afterItem?.handledAt}`);
  record('the row leaves the 待处理 list after handling', Boolean(leftOpen), leftOpen || 'row still listed as open');

  // ...and shows up under 已处理, which is where the operator would look for it next.
  await page.selectOption('select[data-testid="admin-user-status-filter"]', 'handled');
  const shownHandled = await waitFor(async () => {
    const rows = await rowsOf();
    const row = rows.find((r) => r.includes(firstId));
    return row && row.includes('已处理') ? 'row-updated' : '';
  }, 'handled list');
  record('the report appears under 已处理', Boolean(shownHandled), shownHandled || 'not shown as handled');
}

// ---------------- operator notes ----------------
await page.goto(`${ADMIN}/users`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1800);
await page.getByTestId('users-row-first').click();
await page.waitForTimeout(1200);
const userDrawer = page.getByTestId('admin-detail-drawer');
record('the user drawer opens', await userDrawer.isVisible(), 'drawer visible');
record('the note history block renders', await page.getByTestId('admin-user-note-history').count() > 0, 'history element present');

const stamp = Date.now();
const noteText = `RC-UI-NOTE-${stamp} 浏览器写入的运营备注`;
const textarea = userDrawer.locator('textarea').first();
await textarea.fill(noteText);
await page.getByTestId('admin-user-note').click();
const noteShown = await waitFor(async () => {
  const text = await page.getByTestId('admin-user-note-history').innerText().catch(() => '');
  return text.includes(noteText) ? 'history-updated' : '';
}, 'note history');
record('saving a note appends it to the visible history', Boolean(noteShown), noteShown || 'note never appeared in the history');

const selectedUserId = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="users-row-first"]');
  return el?.getAttribute('data-visual-id') ?? '';
});
const notesApi = await api(`/api/admin/v1/users/${selectedUserId}/notes`);
record('the saved note is persisted for that user',
  (notesApi.items ?? []).some((n) => n.content === noteText),
  `userId=${selectedUserId} items=${(notesApi.items ?? []).length}`);

// retract it through the UI
const beforeDelete = (await api(`/api/admin/v1/users/${selectedUserId}/notes`)).items.length;
await page.getByTestId('admin-user-note-delete').first().click();
const removed = await waitFor(async () => {
  const text = await page.getByTestId('admin-user-note-history').innerText().catch(() => '');
  return !text.includes(noteText) ? 'history-updated' : '';
}, 'note delete');
const afterDelete = (await api(`/api/admin/v1/users/${selectedUserId}/notes`)).items.length;
record('deleting through the UI removes the note', afterDelete === beforeDelete - 1, `before=${beforeDelete} after=${afterDelete}`);
record('the history refreshes after the delete', Boolean(removed), removed || 'note still listed');

await browser.close();
const failed = out.filter((line) => line.startsWith('FAIL'));
console.log(out.join('\n'));
console.log(`\n${out.length - failed.length}/${out.length} pass`);
process.exitCode = failed.length ? 1 : 0;