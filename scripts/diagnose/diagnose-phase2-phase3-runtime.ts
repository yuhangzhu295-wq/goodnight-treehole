import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { ensureFrontRestDirs, frontRestArtifacts, killPorts, waitForUrl } from './front-rest-common';
import { resetTestDatabase } from '../test-database';

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
  await ensureFrontRestDirs();
  killPorts();
  const env = {
    DATABASE_URL: resetTestDatabase('goodnight_treehole_test_front_rest_runtime'),
    GOODNIGHT_STORE_FILE: 'data/goodnight-store.front-rest-runtime.json',
    VITE_API_BASE_URL: urls.api,
  };
  const procs = [
    spawnLogged('front-rest-runtime-api', 'pnpm', ['--dir', 'apps/api', 'start'], env),
    spawnLogged('front-rest-runtime-front', 'pnpm', ['--dir', 'apps/mp', 'dev', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], env),
    spawnLogged('front-rest-runtime-admin', 'pnpm', ['--dir', 'apps/admin', 'dev', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], env),
  ];
  const result: Record<string, unknown> = { generatedAt: new Date().toISOString(), checks: [] };
  const checks = result.checks as Array<Record<string, unknown>>;

  try {
    await waitForUrl(`${urls.api}/api/health`);
    await waitForUrl(`${urls.front}/pages/tool/index`);
    await waitForUrl(`${urls.admin}/login`);

    const apiHealth = await fetch(`${urls.api}/api/health`).then((res) => res.json());
    checks.push({ name: 'api health', ok: apiHealth.ok === true, evidence: apiHealth.fingerprint });

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    await page.goto(`${urls.front}/pages/tool/index`, { waitUntil: 'domcontentloaded' });
    const build = await page.evaluate(() => (window as any).__GOODNIGHT_FRONT_BUILD__ ?? null);
    await page.screenshot({ path: 'artifacts/screenshots/front-rest/before/06-tool-runtime.png', fullPage: true });
    await browser.close();

    checks.push({ name: 'front 5173 reachable', ok: true, evidence: `${urls.front}/pages/tool/index` });
    checks.push({ name: 'front rest build marker', ok: Boolean(build?.frontRest === 'front-rest'), evidence: build });
    checks.push({ name: 'admin 5174 reachable', ok: true, evidence: `${urls.admin}/login` });
  } catch (error: any) {
    checks.push({ name: 'runtime exception', ok: false, evidence: error?.message ?? String(error) });
  } finally {
    await fs.writeFile(frontRestArtifacts.runtime, JSON.stringify(result, null, 2));
    for (const proc of procs) kill(proc);
  }

  if (checks.some((item) => !item.ok)) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
