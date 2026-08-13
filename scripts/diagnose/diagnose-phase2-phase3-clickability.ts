import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import {
  apiMatcher,
  ensureFrontRestDirs,
  frontRestArtifacts,
  hashFile,
  inspectElementFromPoint,
  killPorts,
  readFrontRestContracts,
  waitForUrl,
  type FrontRestContract,
} from './front-rest-common';
import { resetTestDatabase } from '../test-database';

const urls = {
  api: 'http://127.0.0.1:3000',
  front: 'http://127.0.0.1:5173',
};
const storeFile = 'apps/api/data/goodnight-store.front-rest-clickability.json';

type Result = FrontRestContract & {
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
      .map((el) => `${el.tagName}:${el.getAttribute('data-testid') ?? ''}:${el.getAttribute('data-state') ?? ''}:${el.textContent?.trim().slice(0, 60) ?? ''}`)
      .join('|');
    const formValues = Array.from(document.querySelectorAll('input, textarea, select'))
      .map((el) => {
        const item = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const checked = item instanceof HTMLInputElement ? item.checked : '';
        return `${item.tagName}:${item.getAttribute('data-testid') ?? ''}:${item.value}:${checked}`;
      })
      .join('|');
    return `${location.href}::${document.body.innerText.slice(0, 4000)}::${stateful}::${formValues}`;
  });
}

async function prepare(page: Page, item: FrontRestContract) {
  if (item.route.includes('/pages/letter/list') || item.selector.includes('letter')) {
    const letters = await fetch(`${urls.api}/api/v1/letters`).then((res) => res.json() as Promise<any>);
    if (!letters.items?.length) {
      await fetch(`${urls.api}/api/v1/moods`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: '诊断补种：给回信列表一条真实记录。', emotion: '焦虑', visibility: 'PRIVATE', style: 'warm' }),
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
  }
  if (item.route.includes('/pages/favorite/index') || item.selector.includes('fav')) {
    await fetch(`${urls.api}/api/v1/posts/post_1/favorite`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => undefined);
    const letters = await fetch(`${urls.api}/api/v1/letters`).then((res) => res.json() as Promise<any>);
    const firstLetter = letters.items?.[0];
    if (firstLetter) {
      await fetch(`${urls.api}/api/v1/letters/${firstLetter.id}/favorite`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => undefined);
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  if (item.selector === 'btn-decompose-run') {
    await page.getByTestId('input-decompose').fill('今天心里有点乱，想知道自己到底在担心什么。');
  }
  if (item.selector === 'btn-decompose-save') {
    await page.getByTestId('input-decompose').fill('我很累，也很想被理解。');
    await page.getByTestId('btn-decompose-run').click();
    await page.getByTestId('decompose-result-card').waitFor({ state: 'visible', timeout: 120000 });
  }
  if (item.selector === 'btn-clear-confirm') {
    await page.getByTestId('btn-clear-data').click();
    await page.getByTestId('clear-confirm-panel').waitFor({ state: 'visible', timeout: 5000 });
  }
  if (item.selector === 'btn-diary-filter-confirm') {
    await page.getByTestId('btn-diary-filter').click();
    await page.getByTestId('filter-diary-emotion-jiaolv').click();
    await page.getByTestId('filter-diary-letter-true').click();
  }
  if (item.selector === 'btn-feedback-submit') {
    await page.getByTestId('input-feedback-content').fill('这里是真实反馈提交验证：按钮需要创建后台工单。');
  }
  if (item.selector === 'btn-report-poster') {
    const button = page.getByTestId('btn-report-poster');
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      if (await button.isEnabled()) break;
      await page.waitForTimeout(250);
    }
    if (!(await button.isEnabled())) throw new Error('月报总结在 120 秒内未完成，分享图按钮仍不可用');
  }
}

async function act(page: Page, item: FrontRestContract) {
  if (item.selector === 'btn-feedback-upload') {
    await page.getByTestId('input-feedback-upload').setInputFiles({
      name: 'feedback-proof.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X7mW3wAAAABJRU5ErkJggg==', 'base64'),
    });
    return;
  }
  const locator = page.getByTestId(item.selector);
  await locator.click({ timeout: 5000 });
}

async function runItem(page: Page, item: FrontRestContract): Promise<Result> {
  const requests: Array<{ method: string; path: string }> = [];
  const listener = (request: any) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) {
      requests.push({ method: request.method(), path: decodeURIComponent(`${url.pathname}${url.search}`) });
    }
  };
  page.on('request', listener);
  try {
    await page.goto(`${urls.front}${item.route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(300);
    await prepare(page, item);
    const hit = await inspectElementFromPoint(page, item.selector);
    if (!(hit as any).matchesExpected) throw new Error(`elementFromPoint missed ${item.selector}: ${JSON.stringify(hit)}`);
    if ((hit as any).forbiddenLayer) throw new Error(`elementFromPoint hit forbidden layer: ${JSON.stringify(hit)}`);

    const beforeUrl = page.url();
    const beforeDom = await bodyHash(page);
    const beforeStore = await hashFile(storeFile);
    requests.length = 0;
    await act(page, item);
    if (item.selector === 'btn-decompose-run') {
      await page.getByTestId('decompose-result-card').waitFor({ state: 'visible', timeout: 120000 });
    } else if (item.selector === 'btn-report-advice') {
      await page.getByTestId('report-advice-panel').waitFor({ state: 'visible', timeout: 120000 });
    } else {
      await page.waitForTimeout(950);
    }
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
    if (!signal) throw new Error('No URL/DOM/network/store change after click');

    return { ...item, ok: true, hit, apiSeen, urlBefore: beforeUrl, urlAfter: afterUrl, domChanged, storeHashChanged, signal };
  } catch (error: any) {
    return { ...item, ok: false, error: error?.message ?? String(error), urlAfter: page.url() };
  } finally {
    page.off('request', listener);
  }
}

function toMarkdown(results: Result[]) {
  const passed = results.filter((item) => item.ok).length;
  return [
    '# Front Rest Clickability Diagnosis',
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
  await ensureFrontRestDirs();
  killPorts();
  await fs.rm(storeFile, { force: true });
  const databaseUrl = resetTestDatabase('goodnight_treehole_test_front_rest');
  const env = {
    DATABASE_URL: databaseUrl,
    GOODNIGHT_STORE_FILE: 'data/goodnight-store.front-rest-clickability.json',
    VITE_API_BASE_URL: urls.api,
  };
  const procs = [
    spawnLogged('front-rest-clickability-api', 'pnpm', ['--dir', 'apps/api', 'start'], env),
    spawnLogged('front-rest-clickability-front', 'pnpm', ['--dir', 'apps/mp', 'dev', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], env),
  ];
  const results: Result[] = [];
  try {
    await waitForUrl(`${urls.api}/api/v1/posts`);
    await waitForUrl(`${urls.front}/pages/tool/index`);
    const contracts = (await readFrontRestContracts()).sort((left, right) => Number(left.selector === 'btn-clear-confirm') - Number(right.selector === 'btn-clear-confirm'));
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'zh-CN' });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    for (const item of contracts) {
      const result = await runItem(page, item);
      results.push(result);
      await fs.writeFile(frontRestArtifacts.clickabilityJson, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
      await fs.writeFile(frontRestArtifacts.clickabilityMd, toMarkdown(results));
    }
    await context.tracing.stop({ path: 'artifacts/traces/front-rest/diagnose-front-rest-clickability.zip' });
    await browser.close();
  } finally {
    for (const proc of procs) kill(proc);
  }
  await fs.writeFile(frontRestArtifacts.clickabilityJson, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  await fs.writeFile(frontRestArtifacts.clickabilityMd, toMarkdown(results));
  if (results.some((item) => !item.ok)) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
