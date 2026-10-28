/* global URL, console, fetch */
import { chromium } from 'playwright';

const API = 'http://127.0.0.1:3000';
const FRONT = 'http://127.0.0.1:5173';

// The boundary card only renders when peer matching is off, which is the state in which
// the user is most likely to want to read the privacy rules.
await fetch(`${API}/api/v1/me/privacy`, {
  method: 'PATCH', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ allowPeerMatching: false }),
});

const browser = await chromium.launch();
const page = await (await browser.newContext({ locale: 'zh-CN' })).newPage();
await page.setViewportSize({ width: 430, height: 764 });
await page.goto(`${FRONT}/pages/peers/index`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

const button = page.getByTestId('peer-privacy-boundary');
console.log('boundary button rendered:', await button.count());
if (await button.count()) {
  const before = new URL(page.url()).pathname;
  await button.click();
  await page.waitForTimeout(1500);
  const after = new URL(page.url()).pathname;
  console.log(`click: ${before} -> ${after}`);
  console.log('landed on the privacy settings page:', after === '/pages/settings/privacy');
  console.log('page text sample:', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 80));
}

// restore the demo user's original setting
await fetch(`${API}/api/v1/me/privacy`, {
  method: 'PATCH', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ allowPeerMatching: true, allowAnonymousExperienceStats: true }),
});
console.log('restored allowPeerMatching=true');
await browser.close();
