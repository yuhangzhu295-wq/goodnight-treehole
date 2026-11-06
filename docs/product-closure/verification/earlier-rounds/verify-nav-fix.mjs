/* global URL, console */
import { chromium } from 'playwright';

const FRONT = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const page = await (await browser.newContext({ locale: 'zh-CN' })).newPage();
await page.setViewportSize({ width: 430, height: 764 });

// ISSUE-005: the peer privacy-boundary button must reach a real route
await page.goto(`${FRONT}/pages/peers/index`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const boundary = page.getByTestId('peer-privacy-boundary');
if (await boundary.count()) {
  await boundary.click();
  await page.waitForTimeout(1200);
  console.log('privacy boundary ->', new URL(page.url()).pathname);
} else {
  console.log('privacy boundary button not shown (privacy already enabled) - checking route directly');
  await page.goto(`${FRONT}/pages/settings/privacy`, { waitUntil: 'domcontentloaded' });
  console.log('privacy route ->', new URL(page.url()).pathname, 'title:', (await page.title()).slice(0, 20));
}

// ISSUE-004: the tool subtree must be reachable by tapping through the app
await page.goto(`${FRONT}/pages/me/index`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const toolEntry = page.getByTestId('entry-tool-index');
console.log('tool entry present on Me:', await toolEntry.count());
await toolEntry.first().scrollIntoViewIfNeeded();
await toolEntry.first().click();
await page.waitForTimeout(1500);
console.log('tool entry ->', new URL(page.url()).pathname + new URL(page.url()).search);

// and from the tool index a concrete tool must be reachable
const toolButton = page.locator('[data-testid^="tool-"]').first();
console.log('tool buttons on index:', await page.locator('[data-testid^="tool-"]').count());
if (await toolButton.count()) {
  await toolButton.click();
  await page.waitForTimeout(1500);
  console.log('tool click ->', new URL(page.url()).pathname + new URL(page.url()).search);
}

await page.screenshot({ path: 'artifacts/screenshots/front/tool-entry.png' });
await browser.close();
