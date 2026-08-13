import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { adminVisualPages, pickAdminPages } from './admin-pages.ts';

const BASE_URL = process.env.ADMIN_BASE_URL ?? 'http://127.0.0.1:5174';
const viewports = [1366, 1440] as const;

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const next = process.argv[index + 1];
  return next === '--' ? process.argv[index + 2] : next;
}

async function settle(page: Page, login = false) {
  await page.locator(login ? '.login-card' : 'main').waitFor({ state: 'visible', timeout: 10000 });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await settle(page, true);
  await page.getByTestId('admin-login-username').fill(process.env.ADMIN_USERNAME ?? 'admin');
  await page.getByTestId('admin-login-password').fill(process.env.ADMIN_PASSWORD ?? 'admin123');
  await page.getByTestId('admin-login-submit').click();
  await page.waitForURL(/\/dashboard$/, { timeout: 10000 });
  await settle(page);
}

async function main() {
  const phase = readArg('--phase') ?? 'current';
  const pages = pickAdminPages(readArg('--page'));
  const outDir = path.resolve(readArg('--out-dir') ?? 'artifacts/screenshots/admin');
  await fs.mkdir(outDir, { recursive: true });
  const report: Array<Record<string, unknown>> = [];
  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({ headless: true });
    for (const width of viewports) {
      let context: BrowserContext | undefined;
      let page: Page | undefined;
      try {
        context = await browser.newContext({ viewport: { width, height: 1080 }, deviceScaleFactor: 1 });
        page = await context.newPage();
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await settle(page, true);
        const loginItem = pages.find((item) => item.id === '01');
        if (loginItem) {
          const loginFile = path.join(outDir, `${loginItem.name}-${width}.png`);
          await page.screenshot({ path: loginFile, fullPage: false });
          report.push({ ...loginItem, viewportWidth: width, screenshot: loginFile, errors: [] });
        }
        const protectedPages = pages.filter((item) => item.id !== '01');
        if (!protectedPages.length) continue;
        await login(page);
        for (const item of protectedPages) {
          const errors: string[] = [];
          const captureError = (error: Error) => errors.push(error.message);
          page.on('pageerror', captureError);
          await page.goto(`${BASE_URL}${item.route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await settle(page);
          const file = path.join(outDir, `${item.name}-${width}.png`);
          await page.screenshot({ path: file, fullPage: false });
          page.off('pageerror', captureError);
          report.push({ ...item, viewportWidth: width, screenshot: file, errors });
          console.log(`${item.name} ${width}px -> ${file}`);
        }
      } finally {
        await page?.close().catch(() => undefined);
        await context?.close().catch(() => undefined);
      }
    }
  } finally {
    await browser?.close().catch(() => undefined);
  }

  await fs.writeFile(path.join(outDir, 'capture-report.json'), JSON.stringify({ phase, generatedAt: new Date().toISOString(), expectedPages: adminVisualPages.length, pages: report }, null, 2));
  if (report.length !== pages.length * viewports.length) throw new Error(`Expected ${pages.length * viewports.length} captures, received ${report.length}`);
  if (report.some((item) => (item.errors as string[]).length)) throw new Error('Admin capture encountered page errors');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
