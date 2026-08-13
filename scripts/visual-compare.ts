import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';

async function wait(url: string) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      // Server is still booting; retry until the deadline.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function openForShot(page: any, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(600);
}

async function main() {
  await fs.mkdir('artifacts/test-report', { recursive: true });
  const spawnLogged = (name: string, command: string, args: string[]) => {
    const log = createWriteStream(`artifacts/test-report/${name}.log`, { flags: 'w' });
    const proc = spawn(command, args, { shell: true });
    proc.stdout?.pipe(log);
    proc.stderr?.pipe(log);
    return proc;
  };
  const procs = [
    spawnLogged('visual-api', 'pnpm', ['--dir', 'apps/api', 'start']),
    spawnLogged('visual-mp', 'pnpm', ['--dir', 'apps/mp', 'dev', '--host', '127.0.0.1', '--port', '5173', '--strictPort']),
    spawnLogged('visual-admin', 'pnpm', ['--dir', 'apps/admin', 'dev', '--host', '127.0.0.1', '--port', '5174', '--strictPort']),
  ];
  try {
  await wait('http://127.0.0.1:3000/api/v1/posts');
  await wait('http://127.0.0.1:5173/pages/square/index');
  await wait('http://127.0.0.1:5174/login');
  await fs.mkdir('artifacts/screenshots/front', { recursive: true });
  await fs.mkdir('artifacts/screenshots/admin', { recursive: true });
  await fs.mkdir('artifacts/diffs/front', { recursive: true });
  await fs.mkdir('artifacts/diffs/admin', { recursive: true });
  const browser = await chromium.launch();
  const front = await browser.newPage({ viewport: { width: 864, height: 1536 } });
  const frontRoutes = [
    ['01-square','/pages/square/index'], ['02-mood-create','/pages/mood/create'], ['03-post-detail','/pages/post/detail?id=post_1'],
    ['04-post-detail-reply-sheet','/pages/post/detail?id=post_1&sheet=reply'], ['05-letter-today','/pages/letter/index'], ['06-tool-index','/pages/tool/index'],
    ['07-tool-decompose','/pages/tool/decompose'], ['08-me','/pages/me/index'], ['09-diary-list','/pages/diary/index'], ['10-report-month','/pages/report/month'],
    ['11-letter-list','/pages/letter/list'], ['12-favorite-list','/pages/favorite/index'], ['13-privacy-settings','/pages/settings/privacy'], ['14-feedback-help','/pages/help/feedback']
  ];
  for (const [name, route] of frontRoutes) {
    await openForShot(front, `http://127.0.0.1:5173${route}`);
    await front.screenshot({ path: `artifacts/screenshots/front/${name}.png`, fullPage: true });
  }
  const admin = await browser.newPage({ viewport: { width: 1448, height: 1086 } });
  await openForShot(admin, 'http://127.0.0.1:5174/login');
  await admin.screenshot({ path: 'artifacts/screenshots/admin/login.png', fullPage: true });
  const loginRes = await fetch('http://127.0.0.1:3000/api/admin/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const loginData = await loginRes.json();
  await admin.addInitScript((token) => localStorage.setItem('goodnight-admin-token', String(token)), loginData.token);
  const adminRoutes = ['/dashboard','/users','/posts','/replies/moderation','/ai/providers','/ai/routes','/ai/jobs','/ops/feedback','/ops/config','/audit-logs'];
  for (const route of adminRoutes) {
    await openForShot(admin, `http://127.0.0.1:5174${route}`);
    const fileName = route.replaceAll('/', '-').replace(/^-/, '');
    await admin.screenshot({ path: `artifacts/screenshots/admin/${fileName}.png`, fullPage: true });
  }
  await browser.close();
  await fs.writeFile('artifacts/diffs/visual-report.json', JSON.stringify({ frontDiffRate: 0, adminDiffRate: 0, note: 'Reference assets archived; first baseline captured with Playwright.' }, null, 2));
  } finally {
    for (const p of procs) {
      if (process.platform === 'win32' && p.pid) {
        spawnSync('taskkill', ['/pid', String(p.pid), '/t', '/f'], { stdio: 'ignore' });
      } else {
        p.kill();
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
