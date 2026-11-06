/* global console, document, getComputedStyle, process */
// ISSUE-023: the status line on each admin page must actually be visible when it carries a
// message. The check writes a message into the element and measures it, which is the same
// state the element is in after a failed request.
import { chromium } from 'playwright';

const ADMIN = 'http://127.0.0.1:5174';
const PAGES = [
  { path: '/users', selector: '.users-status' },
  { path: '/replies/moderation', selector: '.reply-status' },
  { path: '/posts', selector: '.posts-status-line' },
  { path: '/ops/config', selector: '.config-status' },
];

const browser = await chromium.launch();
const page = await (await browser.newContext({ locale: 'zh-CN' })).newPage();
await page.setViewportSize({ width: 1448, height: 1086 });
await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('admin-login-username').fill('admin');
await page.getByTestId('admin-login-password').fill('admin123');
await page.getByTestId('admin-login-submit').click();
await page.waitForURL('**/dashboard', { timeout: 15000 });

let failures = 0;
for (const target of PAGES) {
  await page.goto(`${ADMIN}${target.path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const result = await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return { found: false };
    const original = el.textContent;
    el.textContent = '加载失败：无法连接服务端';
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const visible = rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
    el.textContent = original;
    return { found: true, visible, width: Math.round(rect.width), height: Math.round(rect.height), display: style.display };
  }, target.selector);
  const pass = result.found && result.visible;
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${target.path} ${target.selector} :: ${JSON.stringify(result)}`);
}

await browser.close();
console.log(`\n${PAGES.length - failures}/${PAGES.length} pass`);
process.exitCode = failures ? 1 : 0;
