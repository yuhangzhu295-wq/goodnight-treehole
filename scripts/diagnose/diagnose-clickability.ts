import { chromium, type Page } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { cleanRuntime, kill, spawnLogged, urls, wait } from '../real-browser-utils';
import { resetTestDatabase } from '../test-database';

type ManifestItem = {
  page: string;
  route: string;
  selector: string;
  fill?: string;
  file?: string;
  select?: string;
  setup?: Array<{ selector: string; fill?: string; select?: string }>;
  setupClick?: string;
  setupClickAfterRow?: string;
  setupText?: string;
  expectedAction: string;
  expectedUrl?: string | null;
  expectedApi?: string | null;
  priority: string;
};

type Result = ManifestItem & {
  side: 'front' | 'admin';
  ok: boolean;
  hit?: unknown;
  urlBefore?: string;
  urlAfter?: string;
  apiSeen?: boolean;
  storeHashChanged?: boolean;
  error?: string;
};

const storeFile = 'apps/api/data/goodnight-store.diagnose-clickability.json';

function apiMatcher(expected?: string | null) {
  if (!expected) return undefined;
  const [method, rawPath] = expected.split(' ');
  const [pathOnly, query] = rawPath.split('?');
  const pattern = pathOnly
    .split('/')
    .map((part) => (part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  const regex = new RegExp(`^${pattern}${query ? `\\?${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` : '(?:\\?.*)?'}$`);
  return { method, regex };
}

async function hashStore() {
  try {
    const content = await fs.readFile(storeFile);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return '';
  }
}

async function inspectHit(page: Page, testId: string) {
  const locator = page.getByTestId(testId);
  await page.evaluate((id) => {
    document.querySelector(`[data-testid="${id}"]`)?.scrollIntoView({ block: 'center', inline: 'center' });
  }, testId);
  await page.waitForTimeout(80);
  const box = await locator.boundingBox();
  if (!box) throw new Error(`No visible bounding box for ${testId}`);
  return page.evaluate(
    ({ x, y, testId: expected }) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const closest = el?.closest('[data-testid]') as HTMLElement | null;
      const style = el ? getComputedStyle(el) : undefined;
      const className = typeof el?.className === 'string' ? el.className : '';
      const closestClass = typeof closest?.className === 'string' ? closest.className : '';
      return {
        x,
        y,
        tagName: el?.tagName,
        text: (el?.textContent ?? '').trim().slice(0, 80),
        className,
        dataTestId: el?.getAttribute('data-testid'),
        closestDataTestId: closest?.getAttribute('data-testid'),
        closestTagName: closest?.tagName,
        closestClass,
        pointerEvents: style?.pointerEvents,
        zIndex: style?.zIndex,
        matchesExpected: closest?.getAttribute('data-testid') === expected || el?.getAttribute('data-testid') === expected,
        forbiddenLayer: /hotspot|live-layer|ref-content|ref-shell|admin-ref|proxy|overlay/i.test(`${className} ${closestClass}`),
      };
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2, testId },
  );
}

async function act(page: Page, item: ManifestItem) {
  const locator = page.getByTestId(item.selector);
  await locator.waitFor({ state: 'visible', timeout: 8000 });
  const count = await locator.count();
  if (count !== 1) throw new Error(`Expected one element for ${item.selector}, got ${count}`);
  if (item.file != null) {
    await locator.setInputFiles(item.file, { timeout: 5000 });
  } else if (item.fill != null) {
    await locator.fill(item.fill, { timeout: 5000 });
  } else if (item.select != null) {
    await locator.selectOption(item.select, { timeout: 5000 });
  } else {
    await locator.click({ timeout: 5000 });
  }
}

async function runItem(page: Page, base: string, item: ManifestItem, side: Result['side']): Promise<Result> {
  const requests: Array<{ method: string; path: string }> = [];
  const listener = (request: any) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) requests.push({ method: request.method(), path: `${url.pathname}${url.search}` });
  };
  page.on('request', listener);
  try {
    await page.goto(`${base}${item.route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(500);
    for (const setup of item.setup ?? []) {
      await act(page, { ...item, selector: setup.selector, fill: setup.fill, select: setup.select });
      await page.waitForTimeout(120);
    }
    if (item.setupClick) {
      await act(page, { ...item, selector: item.setupClick, fill: undefined, select: undefined });
      await page.waitForTimeout(400);
    }
    if (item.setupText && item.selector === 'admin-ticket-processing') {
      const summary = page.locator('summary').filter({ hasText: item.setupText }).first();
      await summary.click({ timeout: 5000 });
      await page.waitForTimeout(250);
    }
    if (item.setupClickAfterRow) {
      await act(page, { ...item, selector: item.setupClickAfterRow, fill: undefined, select: undefined });
      await page.waitForTimeout(250);
    }
    const hit = item.file
      ? { tagName: 'INPUT', dataTestId: item.selector, closestDataTestId: item.selector, matchesExpected: true, forbiddenLayer: false }
      : await inspectHit(page, item.selector);
    if (!(hit as any).matchesExpected) throw new Error(`elementFromPoint did not resolve to ${item.selector}: ${JSON.stringify(hit)}`);
    if ((hit as any).forbiddenLayer) throw new Error(`Forbidden proxy/overlay layer hit: ${JSON.stringify(hit)}`);
    const beforeHash = await hashStore();
    const beforeUrl = page.url();
    requests.length = 0;
    await act(page, item);
    if (item.expectedUrl && !page.url().includes(item.expectedUrl)) {
      await page.waitForURL((url) => url.toString().includes(item.expectedUrl!), { timeout: 15000 }).catch(() => undefined);
    }
    await page.waitForTimeout(item.expectedApi ? 750 : 300);
    const afterHash = await hashStore();
    const matcher = apiMatcher(item.expectedApi);
    const apiSeen = matcher ? requests.some((req) => req.method === matcher.method && matcher.regex.test(req.path)) : undefined;
    if (matcher && !apiSeen) {
      throw new Error(`Expected API not seen: ${item.expectedApi}; saw ${requests.map((req) => `${req.method} ${req.path}`).join(', ')}`);
    }
    if (item.expectedUrl && !page.url().includes(item.expectedUrl)) throw new Error(`Expected URL containing ${item.expectedUrl}, got ${page.url()}`);
    return { ...item, side, ok: true, hit, urlBefore: beforeUrl, urlAfter: page.url(), apiSeen, storeHashChanged: Boolean(beforeHash && beforeHash !== afterHash) };
  } catch (error: any) {
    return { ...item, side, ok: false, error: error?.message ?? String(error), urlAfter: page.url() };
  } finally {
    page.off('request', listener);
  }
}

async function loginAdmin(page: Page) {
  await page.goto(`${urls.admin}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('admin-login-username').fill('admin');
  await page.getByTestId('admin-login-password').fill('admin123');
  await page.getByTestId('admin-login-submit').click();
  await page.waitForURL('**/dashboard', { timeout: 10000 });
}

function toMarkdown(results: Result[]) {
  const passed = results.filter((item) => item.ok).length;
  return [
    '# Clickability Diagnosis',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Total: ${results.length}`,
    `Passed: ${passed}`,
    `Failed: ${results.length - passed}`,
    '',
    '| Result | Side | Page | Selector | elementFromPoint | API | Store | URL/Error |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...results.map((item) => {
      const hit = item.hit as any;
      const hitText = hit ? `${hit.tagName}->${hit.closestDataTestId ?? hit.dataTestId ?? ''}` : '';
      return `| ${item.ok ? 'PASS' : 'FAIL'} | ${item.side} | ${item.page} | ${item.selector} | ${hitText} | ${item.expectedApi ?? ''} | ${item.storeHashChanged ? 'changed' : ''} | ${item.ok ? item.urlAfter ?? '' : (item.error ?? '').replace(/\|/g, '\\|')} |`;
    }),
    '',
  ].join('\n');
}

async function main() {
  await fs.mkdir('artifacts/diagnosis/dom-map/front', { recursive: true });
  await fs.mkdir('artifacts/diagnosis/dom-map/admin', { recursive: true });
  await fs.rm(storeFile, { force: true });
  await cleanRuntime();
  const env = {
    DATABASE_URL: resetTestDatabase('goodnight_treehole_test_diagnose_clickability'),
    GOODNIGHT_STORE_FILE: 'data/goodnight-store.diagnose-clickability.json',
    VITE_API_BASE_URL: urls.api,
  };
  const procs = [
    spawnLogged('diagnose-clickability-api', 'pnpm', ['--dir', 'apps/api', 'start'], env),
    spawnLogged('diagnose-clickability-front', 'pnpm', ['--dir', 'apps/mp', 'dev', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], env),
    spawnLogged('diagnose-clickability-admin', 'pnpm', ['--dir', 'apps/admin', 'dev', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], env),
  ];
  let previousHumanReplies: boolean | undefined;

  try {
    await wait(`${urls.api}/api/v1/posts`);
    await wait(`${urls.front}/pages/square/index`);
    await wait(`${urls.admin}/login`);
    const frontManifest = JSON.parse(await fs.readFile('tests/interaction-manifest.front.json', 'utf8')) as ManifestItem[];
    const adminManifest = JSON.parse(await fs.readFile('tests/interaction-manifest.admin.json', 'utf8')) as ManifestItem[];
    const browser = await chromium.launch();
    const context = await browser.newContext();
    await context.tracing.start({ screenshots: true, snapshots: true });
    const front = await context.newPage();
    await front.setViewportSize({ width: 430, height: 764 });
    const admin = await context.newPage();
    await admin.setViewportSize({ width: 1448, height: 1086 });
    const results: Result[] = [];
    const privacyResponse = await fetch(`${urls.api}/api/v1/me/privacy`);
    const privacyPayload = await privacyResponse.json() as { item?: { allowHumanReplies?: boolean } };
    previousHumanReplies = privacyPayload.item?.allowHumanReplies;
    if (previousHumanReplies === false) {
      const enableResponse = await fetch(`${urls.api}/api/v1/me/privacy`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ allowHumanReplies: true }),
      });
      if (!enableResponse.ok) throw new Error(`Could not enable human replies for clickability precondition: ${enableResponse.status}`);
    }

    for (const item of frontManifest) {
      const result = await runItem(front, urls.front, item, 'front');
      results.push(result);
      await fs.writeFile('artifacts/diagnosis/clickability-report.json', JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
      await fs.writeFile('artifacts/diagnosis/clickability-report.md', toMarkdown(results));
    }

    for (const item of adminManifest.filter((entry) => entry.route === '/login')) {
      const result = await runItem(admin, urls.admin, item, 'admin');
      results.push(result);
      await fs.writeFile('artifacts/diagnosis/clickability-report.json', JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
      await fs.writeFile('artifacts/diagnosis/clickability-report.md', toMarkdown(results));
    }
    await loginAdmin(admin);
    for (const item of adminManifest.filter((entry) => entry.route !== '/login')) {
      const result = await runItem(admin, urls.admin, item, 'admin');
      results.push(result);
      await fs.writeFile('artifacts/diagnosis/clickability-report.json', JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
      await fs.writeFile('artifacts/diagnosis/clickability-report.md', toMarkdown(results));
    }

    await front.goto(`${urls.front}/pages/square/index`, { waitUntil: 'domcontentloaded' });
    await fs.writeFile('artifacts/diagnosis/dom-map/front/square.json', JSON.stringify(await front.locator('[data-testid]').evaluateAll((els) => els.map((el) => ({ testId: el.getAttribute('data-testid'), tag: el.tagName, text: (el.textContent ?? '').trim().slice(0, 80) }))), null, 2));
    await admin.goto(`${urls.admin}/dashboard`, { waitUntil: 'domcontentloaded' });
    await fs.writeFile('artifacts/diagnosis/dom-map/admin/dashboard.json', JSON.stringify(await admin.locator('[data-testid]').evaluateAll((els) => els.map((el) => ({ testId: el.getAttribute('data-testid'), tag: el.tagName, text: (el.textContent ?? '').trim().slice(0, 80) }))), null, 2));
    await context.tracing.stop({ path: 'artifacts/traces/diagnose-clickability-trace.zip' });
    await browser.close();

    const failed = results.filter((item) => !item.ok);
    if (failed.length) {
      console.error(toMarkdown(failed));
      process.exit(1);
    }
  } finally {
    if (typeof previousHumanReplies === 'boolean' && previousHumanReplies === false) {
      await fetch(`${urls.api}/api/v1/me/privacy`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ allowHumanReplies: false }),
      }).catch(() => undefined);
    }
    for (const proc of procs) kill(proc);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
