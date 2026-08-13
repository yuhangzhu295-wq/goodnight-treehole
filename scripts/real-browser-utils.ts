import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import type { Page } from 'playwright';
import { resetTestDatabase } from './test-database';

export const ports = { api: 3000, front: 5173, admin: 5174 };
export const urls = {
  api: 'http://127.0.0.1:3000',
  front: 'http://127.0.0.1:5173',
  admin: 'http://127.0.0.1:5174',
};

export async function cleanRuntime() {
  await fs.mkdir('artifacts/test-report', { recursive: true });
  await fs.mkdir('artifacts/debug', { recursive: true });
  const ps = `
    $ports = @(3000,3001,5173,5174)
    foreach ($port in $ports) {
      $ids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
      foreach ($id in $ids) {
        if ($id -and $id -ne $PID) {
          Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
        }
      }
    }
  `;
  spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore' });
  await Promise.all([
    fs.rm('apps/mp/dist', { recursive: true, force: true }),
    fs.rm('apps/admin/dist', { recursive: true, force: true }),
    fs.rm('node_modules/.vite', { recursive: true, force: true }),
    fs.rm('apps/mp/node_modules/.vite', { recursive: true, force: true }),
    fs.rm('apps/admin/node_modules/.vite', { recursive: true, force: true }),
    fs.rm('playwright-report', { recursive: true, force: true }),
    fs.rm('test-results', { recursive: true, force: true }),
  ]);
}

export function spawnLogged(name: string, command: string, args: string[], env: Record<string, string> = {}) {
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

export async function wait(url: string) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

export async function startFrontStack() {
  const env = { DATABASE_URL: resetTestDatabase('goodnight_treehole_test_real_front'), GOODNIGHT_STORE_FILE: 'data/goodnight-store.real-browser.json', VITE_API_BASE_URL: urls.api };
  await fs.rm(env.GOODNIGHT_STORE_FILE, { force: true });
  await fs.rm(`apps/api/${env.GOODNIGHT_STORE_FILE}`, { force: true });
  const procs = [
    spawnLogged('real-api', 'pnpm', ['--dir', 'apps/api', 'start'], env),
    spawnLogged('real-front', 'pnpm', ['--dir', 'apps/mp', 'dev', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], env),
  ];
  await wait(`${urls.api}/api/v1/posts`);
  await wait(`${urls.front}/pages/square/index`);
  return procs;
}

export async function startAdminStack() {
  const env = { DATABASE_URL: resetTestDatabase('goodnight_treehole_test_real_admin'), GOODNIGHT_STORE_FILE: 'data/goodnight-store.real-browser.json', VITE_API_BASE_URL: urls.api };
  await fs.rm(env.GOODNIGHT_STORE_FILE, { force: true });
  await fs.rm(`apps/api/${env.GOODNIGHT_STORE_FILE}`, { force: true });
  const procs = [
    spawnLogged('real-api', 'pnpm', ['--dir', 'apps/api', 'start'], env),
    spawnLogged('real-admin', 'pnpm', ['--dir', 'apps/admin', 'dev', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], env),
  ];
  await wait(`${urls.api}/api/v1/posts`);
  await wait(`${urls.admin}/login`);
  return procs;
}

export async function startFullStack() {
  const env = { DATABASE_URL: resetTestDatabase('goodnight_treehole_test_real_cross'), GOODNIGHT_STORE_FILE: 'data/goodnight-store.real-browser-cross.json', VITE_API_BASE_URL: urls.api };
  await fs.rm(env.GOODNIGHT_STORE_FILE, { force: true });
  await fs.rm(`apps/api/${env.GOODNIGHT_STORE_FILE}`, { force: true });
  const procs = [
    spawnLogged('real-cross-api', 'pnpm', ['--dir', 'apps/api', 'start'], env),
    spawnLogged('real-cross-front', 'pnpm', ['--dir', 'apps/mp', 'dev', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], env),
    spawnLogged('real-cross-admin', 'pnpm', ['--dir', 'apps/admin', 'dev', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], env),
  ];
  await wait(`${urls.api}/api/v1/posts`);
  await wait(`${urls.front}/pages/square/index`);
  await wait(`${urls.admin}/login`);
  return procs;
}

export async function clickPercent(page: Page, xPercent: number, yPercent: number) {
  const box = await page.locator('.phone-shell, .admin-shell, .login').boundingBox();
  if (!box) throw new Error('Shell bounding box not found');
  await page.mouse.click(box.x + (box.width * xPercent) / 100, box.y + (box.height * yPercent) / 100);
}

export async function ensureNoVisibleTestWords(page: Page) {
  const words = ['Rewrite', 'Rant', 'Heal', 'Sleep', 'Work', 'Future', 'Poster', 'Save', 'Clear data', 'Live backend sync ok'];
  for (const word of words) {
    if (await page.getByText(word, { exact: false }).first().isVisible().catch(() => false)) {
      throw new Error(`Visible test artifact found: ${word}`);
    }
  }
}

export function markdown(title: string, rows: Array<{ name: string; ok: boolean; evidence?: string; error?: string }>) {
  return [
    `# ${title}`,
    '',
    `Total: ${rows.length}`,
    `Passed: ${rows.filter((row) => row.ok).length}`,
    `Failed: ${rows.filter((row) => !row.ok).length}`,
    '',
    '| Result | Check | Evidence |',
    '| --- | --- | --- |',
    ...rows.map((row) => `| ${row.ok ? 'PASS' : 'FAIL'} | ${row.name} | ${row.ok ? row.evidence ?? '' : row.error ?? ''} |`),
    '',
  ].join('\n');
}
