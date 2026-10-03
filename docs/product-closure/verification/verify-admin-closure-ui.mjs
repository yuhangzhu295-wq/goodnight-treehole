/* global console, fetch */
// Browser-level acceptance for the admin surfaces touched by the closure round.
// Real entry (sidebar) -> real action (button click) -> real API -> real DB -> real refresh.
import { chromium } from 'playwright';

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

await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('admin-login-username').fill('admin');
await page.getByTestId('admin-login-password').fill('admin123');
await page.getByTestId('admin-login-submit').click();
await page.waitForURL('**/dashboard', { timeout: 20000 });
record('admin login through the real form', true, page.url());

// ---------------- safety events ----------------
// reachable from the sidebar, not just by typing the URL. The experience/safety groups live
// in the collapsible "更多管理" section, so a real user expands it first.
async function openSecondaryNav() {
  const details = page.locator('details.more-nav');
  if (await details.count()) {
    const isOpen = await details.evaluate((el) => el.hasAttribute('open'));
    if (!isOpen) await details.locator('summary').click();
    await page.waitForTimeout(400);
  }
}
await openSecondaryNav();
await page.getByTestId('admin-nav-safety-events').click();
await page.waitForURL('**/safety/events', { timeout: 15000 });
await page.waitForTimeout(1200);
record('safety page is reachable from the sidebar', page.url().includes('/safety/events'), page.url());

const headers = await page.locator('.resource-table thead th').allInnerTexts();
record('safety table shows the trigger text and the handled state',
  headers.includes('触发文本') && headers.includes('处理状态'),
  headers.join(' | '));

const firstRow = page.getByTestId('safety-events-row-first');
const firstId = (await firstRow.locator('td').first().innerText()).trim();
record('the first row carries a real event id', /^safety_/.test(firstId), `id=${firstId}`);

// force a known open state through the API so the button has real work to do
await fetch(`${API}/api/admin/v1/safety/events/${firstId}/handle`, {
  method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ status: 'open' }),
});
await page.getByTestId('admin-table-prev-page').isVisible().catch(() => {});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

const rowStatusBefore = (await firstRow.locator('td').allInnerTexts()).join(' | ');
record('an open event renders as 待处理 before handling', rowStatusBefore.includes('待处理'), rowStatusBefore.replace(/\n/g, ' ').slice(0, 120));

await firstRow.click();
await page.waitForTimeout(400);
// Selecting a row opens the detail drawer; its mask covers the toolbar, so the operator
// closes the drawer before using the action buttons (same flow as every other resource).
record('selecting a row opens the detail drawer', await page.getByTestId('admin-detail-drawer').isVisible(), 'drawer visible');
const drawerText = await page.getByTestId('admin-detail-drawer').innerText();
record('the safety drawer shows the trigger text and the handled state',
  drawerText.includes('触发文本') && drawerText.includes('处理状态') && drawerText.includes('处理人'),
  drawerText.replace(/\s+/g, ' ').slice(0, 160));
await page.getByTestId('admin-detail-close').click();
await page.waitForTimeout(400);
await page.getByTestId('admin-safety-handle').click();
await page.waitForTimeout(2000);

const afterApi = await api(`/api/admin/v1/safety/events?q=${encodeURIComponent(firstId)}`);
const afterItem = (afterApi.items ?? []).find((item) => item.id === firstId);
record('clicking 标记为已处理 really writes through the API', afterItem?.status === 'handled' && Boolean(afterItem?.handledAt),
  `status=${afterItem?.status} handledAt=${afterItem?.handledAt}`);

const rowStatusAfter = (await page.getByTestId('safety-events-row-first').locator('td').allInnerTexts()).join(' | ');
record('the table refreshes and shows the new state', rowStatusAfter.includes('已处理'), rowStatusAfter.replace(/\n/g, ' ').slice(0, 120));

// the handled event must leave the 待处理 filter
await page.selectOption('select[data-testid="admin-user-status-filter"]', 'open');
await page.waitForTimeout(1500);
const openIds = await page.locator('.resource-table tbody tr').evaluateAll((rows) => rows.map((row) => row.querySelector('td')?.textContent?.trim() ?? ''));
record('the 待处理 filter excludes the handled event', !openIds.includes(firstId), `openRows=${openIds.length} containsHandled=${openIds.includes(firstId)}`);

// search must really filter in the browser too
await page.selectOption('select[data-testid="admin-user-status-filter"]', 'all');
await page.getByTestId('admin-search').fill('zzzznomatchzzzz');
await page.waitForTimeout(1500);
const emptyShown = await page.locator('.empty-cell').count();
record('searching a nonsense query shows the empty state', emptyShown > 0, `emptyCells=${emptyShown}`);
await page.getByTestId('admin-search').fill('');

// pagination must be operable, not just displayed
await page.getByTestId('admin-table-page-size').selectOption('10');
await page.waitForTimeout(1500);
const pagerText1 = await page.getByTestId('admin-table-pagination').innerText();
const pageOneIds = await page.locator('.resource-table tbody tr').evaluateAll((rows) => rows.map((row) => row.querySelector('td')?.textContent?.trim() ?? ''));
await page.getByTestId('admin-table-next-page').click();
await page.waitForTimeout(1500);
const pagerText2 = await page.getByTestId('admin-table-pagination').innerText();
const pageTwoIds = await page.locator('.resource-table tbody tr').evaluateAll((rows) => rows.map((row) => row.querySelector('td')?.textContent?.trim() ?? ''));
record('the pager moves to page 2 and shows a different slice',
  pagerText2.includes('2 /') && pageOneIds.length > 0 && pageTwoIds.length > 0 && !pageOneIds.some((id) => pageTwoIds.includes(id)),
  `pager1=${pagerText1.replace(/\s+/g, ' ')} pager2=${pagerText2.replace(/\s+/g, ' ')}`);
await page.getByTestId('admin-table-prev-page').click();
await page.waitForTimeout(1000);
const backText = await page.getByTestId('admin-table-pagination').innerText();
record('the pager returns to page 1', backText.includes('1 /'), backText.replace(/\s+/g, ' '));

// ---------------- peer conversation reports ----------------
await openSecondaryNav();
await page.getByTestId('admin-nav-peer-conversations').click();
await page.waitForURL('**/experience/peer-conversations', { timeout: 15000 });
await page.waitForTimeout(1500);
record('peer-conversations page is reachable from the sidebar', page.url().includes('/experience/peer-conversations'), page.url());

const convHeaders = await page.locator('.resource-table thead th').allInnerTexts();
record('the conversation table renders report reason, time and state',
  convHeaders.includes('举报原因') && convHeaders.includes('举报时间') && convHeaders.includes('举报状态'),
  convHeaders.join(' | '));

const reportedRows = await page.locator('.resource-table tbody tr').evaluateAll((rows) =>
  rows.map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim() ?? '')));
const reportedRow = reportedRows.find((cells) => cells.includes('已举报'));
record('a reported conversation is visibly marked', Boolean(reportedRow), reportedRow ? reportedRow.slice(4, 7).join(' | ') : 'no 已举报 row found');

// the 已举报 filter must reach the API
await page.selectOption('select[data-testid="admin-user-status-filter"]', 'reported');
await page.waitForTimeout(1500);
const filtered = await page.locator('.resource-table tbody tr').evaluateAll((rows) =>
  rows.map((row) => Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim() ?? '')));
record('the 已举报 filter only shows reported conversations',
  filtered.length > 0 && filtered.every((cells) => cells.includes('已举报')),
  `rows=${filtered.length} allReported=${filtered.every((cells) => cells.includes('已举报'))}`);

// opening a reported conversation must show reason/time in the drawer
await page.locator('.resource-table tbody tr').first().click();
await page.waitForTimeout(500);
const drawer = await page.getByTestId('admin-detail-drawer').innerText();
record('the detail drawer exposes reason, time and reporter',
  drawer.includes('举报原因') && drawer.includes('举报时间') && drawer.includes('举报人'),
  drawer.replace(/\s+/g, ' ').slice(0, 160));

await browser.close();
const failed = out.filter((line) => line.startsWith('FAIL'));
console.log(out.join('\n'));
console.log(`\n${out.length - failed.length}/${out.length} pass`);
process.exitCode = failed.length ? 1 : 0;