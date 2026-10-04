/* global console */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const ADMIN = 'http://127.0.0.1:5174';
const browser = await chromium.launch();
const context = await browser.newContext({ locale: 'zh-CN', acceptDownloads: true });
const page = await context.newPage();

await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('admin-login-username').fill('admin');
await page.getByTestId('admin-login-password').fill('admin123');
await page.getByTestId('admin-login-submit').click();
await page.waitForURL('**/dashboard', { timeout: 15000 });

await page.goto(`${ADMIN}/users`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);

const button = page.getByRole('button', { name: /导出/ }).first();
console.log('export button found:', await button.count() > 0);

const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 15000 }),
  button.click(),
]);
const target = 'artifacts/test-report/' + download.suggestedFilename();
await download.saveAs(target);
const text = await fs.readFile(target, 'utf8');
const parsed = JSON.parse(text);
console.log('downloaded:', download.suggestedFilename());
console.log('format:', parsed.format, 'count:', parsed.count);

// what the operator is told on screen
const status = await page.locator('.users-status').first().textContent().catch(() => null);
console.log('on-screen status:', JSON.stringify(status));
await page.screenshot({ path: 'artifacts/screenshots/admin/users-export.png', fullPage: false });

await browser.close();
