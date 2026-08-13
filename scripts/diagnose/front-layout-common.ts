import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { frontVisualPages, type FrontVisualPage } from '../visual/front-pages.ts';

export const BASE_URL = process.env.FRONT_BASE_URL ?? 'http://127.0.0.1:5173';
export const API_HEALTH_URL = process.env.API_HEALTH_URL ?? 'http://127.0.0.1:3000/api/health';
export const layoutViewports = [375, 390, 414, 430] as const;

export type LayoutViewport = (typeof layoutViewports)[number];

export type LayoutPageResult<T> = {
  page: string;
  route: string;
  viewport: LayoutViewport;
  data: T;
};

export async function reachable(url: string): Promise<boolean> {
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
  const log = createWriteStream(`artifacts/layout/${name}.log`, { flags: 'w' });
  const proc = spawn(command, args, { shell: true, env: { ...process.env, ...env } });
  proc.stdout?.pipe(log);
  proc.stderr?.pipe(log);
  return proc;
}

export async function ensureLayoutRuntime(): Promise<ChildProcess[]> {
  await fs.mkdir('artifacts/layout', { recursive: true });
  const started: ChildProcess[] = [];
  if (!(await reachable(API_HEALTH_URL))) {
    started.push(
      startLogged('front-layout-api', 'pnpm', ['--filter', '@goodnight/api', 'dev'], {
        GOODNIGHT_STORE_FILE: 'data/goodnight-store.layout.json',
      }),
    );
  }
  if (!(await reachable(`${BASE_URL}/pages/square/index`))) {
    started.push(
      startLogged('front-layout-mp', 'pnpm', ['--filter', '@goodnight/mp', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
        VITE_API_BASE_URL: 'http://127.0.0.1:3000',
      }),
    );
  }
  await waitFor(API_HEALTH_URL, 'API');
  await waitFor(`${BASE_URL}/pages/square/index`, 'front');
  return started;
}

export function stopStarted(processes: ChildProcess[]): void {
  for (const proc of processes) {
    if (!proc.pid) continue;
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      proc.kill('SIGTERM');
    }
  }
}

export async function withLayoutPages<T>(
  analyze: (page: Page, item: FrontVisualPage, viewport: LayoutViewport) => Promise<T>,
): Promise<Array<LayoutPageResult<T>>> {
  const started = await ensureLayoutRuntime();
  const results: Array<LayoutPageResult<T>> = [];
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
    for (const viewport of layoutViewports) {
      let context: BrowserContext | undefined;
      try {
        context = await browser.newContext({
          viewport: { width: viewport, height: 764 },
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
        });
        const page = await context.newPage();
        await page.addInitScript('globalThis.__name = (target) => target;');
        for (const item of frontVisualPages) {
          await page.goto(`${BASE_URL}${item.route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.locator('main.phone-shell').waitFor({ state: 'visible', timeout: 10000 });
          await page.evaluate(
            () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
          );
          results.push({ page: item.name, route: item.route, viewport, data: await analyze(page, item, viewport) });
        }
      } finally {
        await context?.close();
      }
    }
  } finally {
    await browser?.close();
    stopStarted(started);
  }
  return results;
}

export async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir('artifacts/layout', { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

export async function writeMarkdown(file: string, content: string): Promise<void> {
  await fs.mkdir('artifacts/layout', { recursive: true });
  await fs.writeFile(file, content);
}

export function markdownTable(headers: string[], rows: Array<Array<string | number>>): string {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}
