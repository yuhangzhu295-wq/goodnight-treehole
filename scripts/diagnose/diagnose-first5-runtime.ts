import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { chromium } from 'playwright';
import { ensureFirst5Dirs, first5Artifacts, killPorts, waitForUrl } from './first5-common';

const urls = {
  api: 'http://127.0.0.1:3000',
  front: 'http://127.0.0.1:5173',
  admin: 'http://127.0.0.1:5174',
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

async function main() {
  await ensureFirst5Dirs();
  killPorts();
  const env = {
    GOODNIGHT_STORE_FILE: 'data/goodnight-store.first5-runtime.json',
    VITE_API_BASE_URL: urls.api,
  };
  const procs = [
    spawnLogged('first5-runtime-api', 'pnpm', ['--dir', 'apps/api', 'start'], env),
    spawnLogged('first5-runtime-front', 'pnpm', ['--dir', 'apps/mp', 'dev', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], env),
    spawnLogged('first5-runtime-admin', 'pnpm', ['--dir', 'apps/admin', 'dev', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], env),
  ];

  const result: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    checks: [],
  };
  const checks = result.checks as Array<Record<string, unknown>>;

  try {
    await waitForUrl(`${urls.api}/api/health`);
    await waitForUrl(`${urls.front}/pages/square/index`);
    await waitForUrl(`${urls.admin}/login`);

    const apiHealth = await fetch(`${urls.api}/api/health`).then((res) => res.json());
    checks.push({ name: 'api health', ok: apiHealth.ok === true, evidence: apiHealth.fingerprint });

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    await page.goto(`${urls.front}/pages/square/index`, { waitUntil: 'domcontentloaded' });
    const build = await page.evaluate(() => (window as any).__GOODNIGHT_FRONT_BUILD__ ?? null);
    const url = page.url();
    await page.screenshot({ path: 'artifacts/screenshots/first5/before/01-square-runtime.png', fullPage: true });
    await browser.close();

    checks.push({ name: 'front 5173 reachable', ok: url.includes('/pages/square/index'), evidence: url });
    checks.push({ name: 'front build marker', ok: Boolean(build?.scope === 'front-first5'), evidence: build });
    checks.push({ name: 'admin 5174 reachable', ok: true, evidence: `${urls.admin}/login` });
  } catch (error: any) {
    checks.push({ name: 'runtime exception', ok: false, evidence: error?.message ?? String(error) });
  } finally {
    await import('node:fs/promises').then((fs) => fs.writeFile(first5Artifacts.runtime, JSON.stringify(result, null, 2)));
    for (const proc of procs) kill(proc);
  }

  if (checks.some((item) => !item.ok)) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
