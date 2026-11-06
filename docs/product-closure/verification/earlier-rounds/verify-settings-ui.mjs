/* global console */
import { chromium } from 'playwright';

const ADMIN = 'http://127.0.0.1:5174';
const browser = await chromium.launch();
const page = await (await browser.newContext({ locale: 'zh-CN' })).newPage();
await page.setViewportSize({ width: 1448, height: 1086 });

await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('admin-login-username').fill('admin');
await page.getByTestId('admin-login-password').fill('admin123');
await page.getByTestId('admin-login-submit').click();
await page.waitForURL('**/dashboard', { timeout: 15000 });

await page.goto(`${ADMIN}/ops/config`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

const inert = await page.locator('[data-testid^="admin-config-inert-"]').count();
const total = await page.locator('[data-testid^="admin-config-field-"]').count();
console.log('settings rendered:', total);
console.log('flagged as not enforced:', inert);

// the live keys must NOT be flagged
for (const key of ['appName', 'defaultVisibility', 'allowHumanRepliesDefault', 'allowMonthlyReportShare']) {
  const flagged = await page.locator(`[data-testid="admin-config-inert-${key}"]`).count();
  console.log(`  ${key}: flagged=${flagged} (expected 0)`);
}
// a known write-only key must be flagged
for (const key of ['aiTimeoutSeconds', 'dailyDigestEnabled', 'notifyEmail']) {
  const flagged = await page.locator(`[data-testid="admin-config-inert-${key}"]`).count();
  console.log(`  ${key}: flagged=${flagged} (expected 1)`);
}

await page.screenshot({ path: 'artifacts/screenshots/admin/config-enforced.png', fullPage: true });
await browser.close();
