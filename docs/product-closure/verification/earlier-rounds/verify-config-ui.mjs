/* global console */
import { chromium } from 'playwright';

const ADMIN = 'http://127.0.0.1:5174';
const browser = await chromium.launch();
const page = await (await browser.newContext({ locale: 'zh-CN' })).newPage();
await page.setViewportSize({ width: 1448, height: 1200 });
await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('admin-login-username').fill('admin');
await page.getByTestId('admin-login-password').fill('admin123');
await page.getByTestId('admin-login-submit').click();
await page.waitForURL('**/dashboard', { timeout: 15000 });
await page.goto(`${ADMIN}/ops/config`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

const fields = await page.locator('[data-testid^="admin-config-field-"]').count();
const inert = await page.locator('[data-testid^="admin-config-inert-"]').count();
const disabled = await page.locator('[data-testid^="admin-config-field-"][disabled]').count();
console.log(`fields=${fields} markedNotImplemented=${inert} disabled=${disabled}`);

// wired settings must be editable, unwired ones must not
for (const key of ['defaultPageSize', 'highRiskBlockEnabled', 'manualReviewThreshold', 'logRetentionDays']) {
  const dis = await page.locator(`[data-testid="admin-config-field-${key}"]`).isDisabled();
  const marked = await page.locator(`[data-testid="admin-config-inert-${key}"]`).count();
  console.log(`  wired ${key}: disabled=${dis} marked=${marked} (expect false/0)`);
}
for (const key of ['aiTimeoutSeconds', 'dailyDigestEnabled', 'notifyEmail']) {
  const dis = await page.locator(`[data-testid="admin-config-field-${key}"]`).isDisabled();
  const marked = await page.locator(`[data-testid="admin-config-inert-${key}"]`).count();
  console.log(`  unwired ${key}: disabled=${dis} marked=${marked} (expect true/1)`);
}

// saving must not be possible while every changed field is unwired
await page.screenshot({ path: 'artifacts/product-closure/issues/ISSUE-003/config-after.png', fullPage: true });
console.log('screenshot written');
await browser.close();
