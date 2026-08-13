import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import {
  apiMatcher,
  ensureFirst5Dirs,
  first5Artifacts,
  hashFile,
  inspectElementFromPoint,
  killPorts,
  readContracts,
  waitForUrl,
  type First5Contract,
} from './first5-common';

const urls = {
  api: 'http://127.0.0.1:3000',
  front: 'http://127.0.0.1:5173',
};
const storeFile = 'apps/api/data/goodnight-store.first5-clickability.json';

type Result = First5Contract & {
  ok: boolean;
  hit?: unknown;
  apiSeen?: boolean;
  urlBefore?: string;
  urlAfter?: string;
  domChanged?: boolean;
  storeHashChanged?: boolean;
  signal?: string;
  error?: string;
};

function spawnLogged(name: string, command: string, args: string[], env: Record<string, string>) {
  const log = createWriteStream(`artifacts/test-report/${name}.log`, { flags: 'w' });
  const proc = spawn(command, args, { shell: true, env: { ...process.env, ...env } });
  proc.stdout?.pipe(log);
  proc.stderr?.pipe(log);
  return proc;
}

function kill(proc: ChildProcess) {
  if (process.platform === 'win32' && proc.pid) spawnSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore' });
  else proc.kill();
}

async function bodyHash(page: Page) {
  return page.evaluate(() => {
    const stateful = Array.from(document.querySelectorAll('[data-state], .active, .is-active, [aria-pressed="true"]'))
      .map((el) => `${el.tagName}:${el.getAttribute('data-testid') ?? ''}:${el.getAttribute('data-state') ?? ''}:${el.textContent?.trim().slice(0, 40) ?? ''}`)
      .join('|');
    const formValues = Array.from(document.querySelectorAll('input, textarea, select'))
      .map((el) => {
        const item = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const checked = item instanceof HTMLInputElement ? item.checked : '';
        return `${item.tagName}:${item.getAttribute('data-testid') ?? ''}:${item.value}:${checked}`;
      })
      .join('|');
    return `${location.href}::${document.body.innerText.slice(0, 3000)}::${stateful}::${formValues}`;
  });
}

async function prepare(page: Page, item: First5Contract) {
  if (item.route.includes('/pages/mood/create')) {
    await page.getByTestId('input-mood-content').fill('第一轮真实交互诊断：这个按钮必须是真的。').catch(() => undefined);
    await page.getByTestId(item.selector === 'mood-emotion-weiqu' ? 'mood-emotion-jiaolv' : 'mood-emotion-weiqu').click().catch(() => undefined);
    await page.getByTestId(item.selector === 'mood-visibility-public' ? 'mood-visibility-private' : 'mood-visibility-public').click().catch(() => undefined);
    await page.getByTestId(item.selector === 'mood-style-warm' ? 'mood-style-rational' : 'mood-style-warm').click().catch(() => undefined);
  }
  if (item.route.includes('sheet=reply')) {
    await page.getByTestId('input-reply-content').fill('第一轮真实回应诊断。').catch(() => undefined);
  }
}

async function act(page: Page, item: First5Contract) {
  const locator = page.getByTestId(item.selector);
  if (item.selector === 'input-mood-content') {
    await locator.fill('第一轮真实交互诊断输入内容', { timeout: 2000 });
    return;
  }
  if (item.selector === 'input-reply-content') {
    await locator.fill('第一轮真实回应诊断输入内容', { timeout: 2000 });
    return;
  }
  if (item.selector === 'select-reply-visibility') {
    await locator.selectOption('PRIVATE', { timeout: 2000 });
    return;
  }
  await locator.click({ timeout: 2000 });
}

async function runItem(page: Page, item: First5Contract): Promise<Result> {
  const requests: Array<{ method: string; path: string }> = [];
  const listener = (request: any) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) {
      requests.push({ method: request.method(), path: decodeURIComponent(`${url.pathname}${url.search}`) });
    }
  };
  page.on('requestfinished', listener);
  try {
    if (item.selector === 'tab-square') {
      await page.goto(`${urls.front}/pages/letter/index`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } else if (item.selector.endsWith('-back')) {
      await page.goto(`${urls.front}/pages/square/index`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.goto(`${urls.front}${item.route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } else {
      await page.goto(`${urls.front}${item.route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    }
    await page.waitForTimeout(250);
    await prepare(page, item);
    const hit = await inspectElementFromPoint(page, item.selector);
    if (!(hit as any).matchesExpected) throw new Error(`elementFromPoint missed ${item.selector}: ${JSON.stringify(hit)}`);
    if ((hit as any).forbiddenLayer) throw new Error(`elementFromPoint hit forbidden layer: ${JSON.stringify(hit)}`);

    const beforeUrl = page.url();
    const beforeDom = await bodyHash(page);
    const beforeStore = await hashFile(storeFile);
    requests.length = 0;
    await act(page, item);
    await page.waitForTimeout(800);
    const afterUrl = page.url();
    const afterDom = await bodyHash(page);
    const afterStore = await hashFile(storeFile);
    const matcher = apiMatcher(item.expectedApi);
    const apiSeen = matcher ? requests.some((req) => req.method === matcher.method && matcher.regex.test(req.path)) : false;
    if (matcher && !apiSeen) throw new Error(`Expected API not seen: ${item.expectedApi}; saw ${requests.map((req) => `${req.method} ${req.path}`).join(', ')}`);
    if (item.expectedUrl && !afterUrl.includes(item.expectedUrl)) throw new Error(`Expected URL containing ${item.expectedUrl}, got ${afterUrl}`);

    const domChanged = beforeDom !== afterDom;
    const storeHashChanged = Boolean(beforeStore && afterStore && beforeStore !== afterStore);
    const urlChanged = beforeUrl !== afterUrl;
    const signal = [
      urlChanged ? 'url' : '',
      domChanged ? 'dom' : '',
      apiSeen ? 'network' : '',
      storeHashChanged ? 'store' : '',
    ].filter(Boolean).join('+');
    if (!signal) throw new Error('No URL/DOM/network/store change within 800ms after click');

    return { ...item, ok: true, hit, apiSeen, urlBefore: beforeUrl, urlAfter: afterUrl, domChanged, storeHashChanged, signal };
  } catch (error: any) {
    return { ...item, ok: false, error: error?.message ?? String(error), urlAfter: page.url() };
  } finally {
    page.off('requestfinished', listener);
  }
}

function toMarkdown(results: Result[]) {
  const passed = results.filter((item) => item.ok).length;
  return [
    '# First5 Clickability Diagnosis',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Total: ${results.length}`,
    `Passed: ${passed}`,
    `Failed: ${results.length - passed}`,
    '',
    '| Result | Page | Text | Selector | Hit | API | Signal | URL/Error |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...results.map((item) => {
      const hit = item.hit as any;
      return `| ${item.ok ? 'PASS' : 'FAIL'} | ${item.page} | ${item.visibleText} | ${item.selector} | ${hit ? `${hit.tagName}->${hit.hitTestId}` : ''} | ${item.expectedApi} | ${item.signal ?? ''} | ${item.ok ? item.urlAfter ?? '' : (item.error ?? '').replace(/\|/g, '\\|')} |`;
    }),
    '',
  ].join('\n');
}

async function main() {
  await ensureFirst5Dirs();
  killPorts();
  await fs.rm(storeFile, { force: true });
  const env = {
    GOODNIGHT_STORE_FILE: 'data/goodnight-store.first5-clickability.json',
    VITE_API_BASE_URL: urls.api,
  };
  const procs = [
    spawnLogged('first5-clickability-api', 'pnpm', ['--dir', 'apps/api', 'start'], env),
    spawnLogged('first5-clickability-front', 'pnpm', ['--dir', 'apps/mp', 'dev', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], env),
  ];
  const results: Result[] = [];
  try {
    await waitForUrl(`${urls.api}/api/v1/posts`);
    await waitForUrl(`${urls.front}/pages/square/index`);
    const contracts = await readContracts();
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    for (const item of contracts) {
      const result = await runItem(page, item);
      results.push(result);
      await fs.writeFile(first5Artifacts.clickabilityJson, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
      await fs.writeFile(first5Artifacts.clickabilityMd, toMarkdown(results));
    }
    await context.tracing.stop({ path: 'artifacts/traces/first5/diagnose-first5-clickability.zip' });
    await browser.close();
  } finally {
    for (const proc of procs) kill(proc);
  }
  await fs.writeFile(first5Artifacts.clickabilityJson, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  await fs.writeFile(first5Artifacts.clickabilityMd, toMarkdown(results));
  if (results.some((item) => !item.ok)) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
