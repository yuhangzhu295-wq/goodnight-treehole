/* global console, fetch */
// ISSUE-024: the support-plan drawer must render real fields, never "[object Object]", and
// the status column must read the field that actually exists.
import { chromium } from 'playwright';

const ADMIN = 'http://127.0.0.1:5174';
const browser = await chromium.launch();
const page = await (await browser.newContext({ locale: 'zh-CN' })).newPage();
await page.setViewportSize({ width: 1448, height: 1086 });
await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('admin-login-username').fill('admin');
await page.getByTestId('admin-login-password').fill('admin123');
await page.getByTestId('admin-login-submit').click();
await page.waitForURL('**/dashboard', { timeout: 20000 });

// Seed one support plan through the real front-end API so the resource has data to render.
const api = 'http://127.0.0.1:3000';
await fetch(`${api}/api/v1/me/support-plan`, {
  method: 'PUT', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'ISSUE-024 验证计划', plan: { warningSigns: ['睡不好', '不想说话'], trustedContacts: ['妈妈 138****0000'], grounding: '先深呼吸四次', notes: '不要太晚联系我' } }),
});

await page.goto(`${ADMIN}/safety/support-plans`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1600);

const rows = await page.locator('table tbody tr').count();
console.log('rows:', rows);
let body = await page.locator('body').innerText();
console.log('list contains [object Object]:', /\[object Object\]/.test(body));

if (rows > 0) {
  // The row itself opens the drawer.
  await page.locator('table tbody tr').first().click();
  await page.waitForTimeout(1400);
  const drawer = page.getByTestId('admin-detail-drawer');
  console.log('drawer open:', await drawer.count());
  const drawerText = (await drawer.count()) ? await drawer.innerText() : '';
  console.log('drawer text:', drawerText.replace(/\s+/g, ' ').slice(0, 300));
  body = await page.locator('body').innerText();
  console.log('drawer contains [object Object]:', /\[object Object\]/.test(body));
  const hasStatus = /生效中|已停用/.test(body);
  console.log('status column reads the real field:', hasStatus);
  console.log('drawer shows real plan labels:', /预警信号|信任联系人|稳定方法|备注/.test(body));
  console.log('drawer sample:', body.replace(/\s+/g, ' ').slice(0, 260));
}
await page.screenshot({ path: 'artifacts/product-closure/issues/ISSUE-024/support-plans-after.png', fullPage: false });
await browser.close();
