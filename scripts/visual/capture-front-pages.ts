import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { frontVisualPages, pickPages } from './front-pages.ts';

const BASE_URL = process.env.FRONT_BASE_URL ?? 'http://127.0.0.1:5173';
const API_URL = process.env.API_HEALTH_URL ?? 'http://127.0.0.1:3000/api/health';
const DPR = 941 / 430;

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const next = process.argv[index + 1];
  return next === '--' ? process.argv[index + 2] : next;
}

async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function waitFor(url: string, label: string): Promise<void> {
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label}: ${url}`);
}

function startLogged(name: string, command: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  const log = createWriteStream(`artifacts/test-report/${name}.log`, { flags: 'w' });
  const proc = spawn(command, args, { shell: true, env: { ...process.env, ...env } });
  proc.stdout?.pipe(log);
  proc.stderr?.pipe(log);
  return proc;
}

async function ensureRuntime(): Promise<ChildProcess[]> {
  await fs.mkdir('artifacts/test-report', { recursive: true });
  const started: ChildProcess[] = [];
  if (!(await reachable(API_URL))) {
    started.push(
      startLogged('visual-front-api', 'pnpm', ['--filter', '@goodnight/api', 'dev'], {
        GOODNIGHT_STORE_FILE: 'data/goodnight-store.visual.json',
      }),
    );
  }
  if (!(await reachable(`${BASE_URL}/pages/square/index`))) {
    started.push(
      startLogged('visual-front-mp', 'pnpm', ['--filter', '@goodnight/mp', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
        VITE_API_BASE_URL: 'http://127.0.0.1:3000',
      }),
    );
  }
  await waitFor(API_URL, 'API');
  await waitFor(`${BASE_URL}/pages/square/index`, 'front');
  return started;
}

function stopStarted(processes: ChildProcess[]): void {
  for (const proc of processes) {
    if (!proc.pid) continue;
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      proc.kill('SIGTERM');
    }
  }
}

async function main(): Promise<void> {
  const phase = readArg('--phase') ?? 'after';
  const pageId = readArg('--page');
  const pages = pickPages(pageId);
  const outDir = path.resolve(readArg('--out-dir') ?? `artifacts/screenshots/claude-${phase}`);
  const traceDir = path.resolve('artifacts/traces/claude-front');
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(traceDir, { recursive: true });

  const started = await ensureRuntime();
  const report: Array<Record<string, unknown>> = [];
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: { width: 430, height: 764 },
      deviceScaleFactor: DPR,
      isMobile: true,
      hasTouch: true,
      recordVideo: { dir: traceDir, size: { width: 430, height: 764 } },
    });
    page = await context.newPage();
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    for (const item of pages) {
      const url = `${BASE_URL}${item.route}`;
      const errorStart = pageErrors.length;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.locator('main.phone-shell').waitFor({ state: 'visible', timeout: 10000 });
      if (item.id === '04') {
        await page.getByTestId('btn-open-reply').click();
        await page.locator('[data-state="reply-sheet"] .reply-sheet').waitFor({ state: 'visible', timeout: 10000 });
      }
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
      );
      const file = path.join(outDir, `${item.name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      const metrics = await page.evaluate(() => ({
        path: location.pathname + location.search,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyWidth: document.body.scrollWidth,
        title: document.title,
      }));
      const hasHorizontalScroll = metrics.scrollWidth > metrics.clientWidth || metrics.bodyWidth > metrics.clientWidth;
      report.push({ ...item, url, screenshot: file, hasHorizontalScroll, errors: pageErrors.slice(errorStart) });
      console.log(`${item.name} -> ${file} hscroll=${hasHorizontalScroll}`);
    }
  } finally {
    await page?.close().catch(() => undefined);
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    stopStarted(started);
  }

  await fs.writeFile(path.join(outDir, 'capture-report.json'), JSON.stringify({ phase, pages: report }, null, 2));
  if (pages.length === frontVisualPages.length) {
    await fs.writeFile('artifacts/traces/claude-front/capture-report.json', JSON.stringify({ phase, pages: report }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
