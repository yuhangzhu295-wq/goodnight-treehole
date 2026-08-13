import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import type { Page, Response } from 'playwright';
import { ensureFirst5Dirs, inspectElementFromPoint, killPorts, waitForUrl } from './diagnose/first5-common';

export const first5Urls = {
  api: 'http://127.0.0.1:3000',
  front: 'http://127.0.0.1:5173',
};

export type ReportRow = {
  name: string;
  ok: boolean;
  evidence?: string;
  error?: string;
};

export function reportMarkdown(title: string, rows: ReportRow[]) {
  return [
    `# ${title}`,
    '',
    `Generated: ${new Date().toISOString()}`,
    `Total: ${rows.length}`,
    `Passed: ${rows.filter((row) => row.ok).length}`,
    `Failed: ${rows.filter((row) => !row.ok).length}`,
    '',
    '| Result | Check | Evidence |',
    '| --- | --- | --- |',
    ...rows.map((row) => `| ${row.ok ? 'PASS' : 'FAIL'} | ${row.name} | ${(row.ok ? row.evidence : row.error)?.replace(/\|/g, '\\|') ?? ''} |`),
    '',
  ].join('\n');
}

export async function writeReport(path: string, title: string, rows: ReportRow[]) {
  await fs.writeFile(path, reportMarkdown(title, rows));
}

export async function step(rows: ReportRow[], reportPath: string, title: string, name: string, fn: () => Promise<string>) {
  try {
    rows.push({ name, ok: true, evidence: await fn() });
  } catch (error: any) {
    rows.push({ name, ok: false, error: error?.message ?? String(error) });
  }
  await writeReport(reportPath, title, rows);
}

function spawnLogged(name: string, command: string, args: string[], env: Record<string, string>) {
  const log = createWriteStream(`artifacts/test-report/${name}.log`, { flags: 'w' });
  const proc = spawn(command, args, { shell: true, env: { ...process.env, ...env } });
  proc.stdout?.pipe(log);
  proc.stderr?.pipe(log);
  return proc;
}

export function kill(proc: ChildProcess) {
  if (process.platform === 'win32' && proc.pid) spawnSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore' });
  else proc.kill();
}

export async function startFirst5Stack(name: string) {
  await ensureFirst5Dirs();
  killPorts();
  await Promise.all([
    fs.rm(`apps/api/data/goodnight-store.${name}.json`, { force: true }),
    fs.rm('node_modules/.vite', { recursive: true, force: true }),
    fs.rm('apps/mp/node_modules/.vite', { recursive: true, force: true }),
  ]);
  const env = {
    GOODNIGHT_STORE_FILE: `data/goodnight-store.${name}.json`,
    VITE_API_BASE_URL: first5Urls.api,
  };
  const procs = [
    spawnLogged(`${name}-api`, 'pnpm', ['--dir', 'apps/api', 'start'], env),
    spawnLogged(`${name}-front`, 'pnpm', ['--dir', 'apps/mp', 'dev', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], env),
  ];
  await waitForUrl(`${first5Urls.api}/api/v1/posts`);
  await waitForUrl(`${first5Urls.front}/pages/square/index`);
  return procs;
}

export async function expectApi(page: Page, method: string, path: string | RegExp, action: () => Promise<void>) {
  const responsePromise = page.waitForResponse((res: Response) => {
    const url = new URL(res.url());
    const decoded = decodeURIComponent(`${url.pathname}${url.search}`);
    const pathOk = typeof path === 'string' ? decoded.includes(path) : path.test(decoded);
    return res.request().method() === method && pathOk;
  }, { timeout: 10000 });
  await action();
  const response = await responsePromise;
  if (!response.ok()) throw new Error(`${method} ${String(path)} returned ${response.status()}`);
  return `${method} ${decodeURIComponent(new URL(response.url()).pathname + new URL(response.url()).search)} => ${response.status()}`;
}

export async function expectApiJson<T>(page: Page, method: string, path: string | RegExp, action: () => Promise<void>) {
  const responsePromise = page.waitForResponse((res: Response) => {
    const url = new URL(res.url());
    const decoded = decodeURIComponent(`${url.pathname}${url.search}`);
    const pathOk = typeof path === 'string' ? decoded.includes(path) : path.test(decoded);
    return res.request().method() === method && pathOk;
  }, { timeout: 10000 });
  await action();
  const response = await responsePromise;
  if (!response.ok()) throw new Error(`${method} ${String(path)} returned ${response.status()}`);
  return response.json() as Promise<T>;
}

export async function assertNoVisibleTestWords(page: Page) {
  const words = ['Rewrite', 'Rant', 'Heal', 'Sleep', 'Work', 'Future', 'Poster', 'Save', 'Clear data', 'Live backend sync ok'];
  for (const word of words) {
    if (await page.getByText(word, { exact: false }).first().isVisible().catch(() => false)) {
      throw new Error(`visible forbidden test word: ${word}`);
    }
  }
}

export async function assertNoProxyDom(page: Page) {
  const bad = await page.evaluate(() => Array.from(document.querySelectorAll('[class*="hotspot"], [class*="proxy-button"], [class*="click-layer"], [class*="test-layer"], [class*="interaction-layer"], [class*="ref-shell"], [class*="ref-content"]')).map((el) => ({
    tag: el.tagName,
    className: String((el as HTMLElement).className),
  })));
  if (bad.length) throw new Error(`forbidden proxy DOM found: ${JSON.stringify(bad)}`);
}

export async function assertRealDomHit(page: Page, testId: string) {
  const hit = await inspectElementFromPoint(page, testId);
  if (!(hit as any).matchesExpected || (hit as any).forbiddenLayer) {
    throw new Error(`elementFromPoint miss for ${testId}: ${JSON.stringify(hit)}`);
  }
  return `${(hit as any).tagName}->${(hit as any).hitTestId}`;
}

export async function screenshot(page: Page, phase: 'before' | 'after', name: string) {
  const path = `artifacts/screenshots/first5/${phase}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
}

export async function apiJson<T>(path: string) {
  const response = await fetch(`${first5Urls.api}${path}`);
  if (!response.ok) throw new Error(`GET ${path} returned ${response.status}`);
  return response.json() as Promise<T>;
}
