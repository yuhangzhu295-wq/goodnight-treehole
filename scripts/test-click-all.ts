import { chromium, type Page } from 'playwright';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { resetTestDatabase } from './test-database.js';

type ManifestItem = {
  page: string;
  route: string;
  selector: string;
  fill?: string;
  select?: string;
  file?: string;
  setup?: Array<{ selector: string; fill?: string; select?: string; file?: string }>;
  setupClick?: string;
  setupText?: string;
  setupPlaceholder?: { placeholder: string; fill: string };
  expectedAction: string;
  expectedUrl?: string | null;
  expectedApi?: string | null;
  expectedVisibleTestId?: string;
  expectedHiddenTestId?: string;
  expectedText?: string;
  priority: string;
};

type Result = ManifestItem & { ok: boolean; error?: string; url?: string; apiSeen?: boolean; apiStatus?: number };

const apiPort = 3100;
const frontPort = 5183;
const adminPort = 5184;
const apiBase = `http://127.0.0.1:${apiPort}`;
const frontBase = `http://127.0.0.1:${frontPort}`;
const adminBase = `http://127.0.0.1:${adminPort}`;
const scope = String(process.env.CLICK_ALL_SCOPE ?? 'all').toLowerCase();
const resumeFrom = String(process.env.CLICK_ALL_FROM_SELECTOR ?? '').trim();

function resumeItems(items: ManifestItem[], ignoreMissingResume = false) {
  if (!resumeFrom) return items;
  const index = items.findIndex((item) => item.selector === resumeFrom);
  if (index < 0) {
    if (ignoreMissingResume) return items;
    throw new Error(`Resume selector not found: ${resumeFrom}`);
  }
  return items.slice(index);
}

async function wait(url: string) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function enableMonthlyReportActions() {
  const privacyResponse = await fetch(`${apiBase}/api/v1/me/privacy`);
  if (!privacyResponse.ok) throw new Error(`Could not read monthly-report privacy: ${privacyResponse.status}`);
  const privacyPayload = await privacyResponse.json() as { item?: Record<string, unknown> };
  const updateResponse = await fetch(`${apiBase}/api/v1/me/privacy`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...privacyPayload.item,
      allowJourneyLongTermAnalysis: true,
      allowMonthlyReportShare: true,
    }),
  });
  if (!updateResponse.ok) throw new Error(`Could not grant explicit monthly-report consent: ${updateResponse.status}`);

  const month = new Date().toISOString().slice(0, 7);
  const deadline = Date.now() + 120000;
  let lastStatus = 'unavailable';
  while (Date.now() < deadline) {
    const response = await fetch(`${apiBase}/api/v1/reports/monthly?month=${month}`);
    if (!response.ok) throw new Error(`Could not prepare monthly report: ${response.status}`);
    const payload = await response.json() as { item?: { summary?: string; aiJobStatus?: string } };
    const report = payload.item;
    lastStatus = String(report?.aiJobStatus ?? 'unavailable');
    if (report?.summary && lastStatus === 'succeeded') return;
    if (['failed', 'fallback', 'cancelled'].includes(lastStatus)) {
      throw new Error(`Monthly report job did not finish through DAPI: ${lastStatus}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  throw new Error(`Monthly report job did not complete before click verification: ${lastStatus}`);
}

async function createAdminReviewCandidate() {
  const response = await fetch(`${apiBase}/api/v1/moods`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content: `点击回归待审核内容 ${Date.now()}`,
      emotion: 'anxious',
      visibility: 'PUBLIC',
      replyStyle: 'warm',
    }),
  });
  if (!response.ok) throw new Error(`Could not create an isolated admin review candidate: ${response.status}`);
}

function spawnLogged(name: string, command: string, args: string[], env: Record<string, string>) {
  const log = createWriteStream(`artifacts/test-report/${name}.log`, { flags: 'w' });
  const proc = spawn(command, args, { shell: false, windowsHide: true, env: { ...process.env, ...env } });
  proc.stdout?.pipe(log);
  proc.stderr?.pipe(log);
  return proc;
}

async function assertPortFree(port: number) {
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Test port ${port} is already in use; refusing to connect to a stale service`)));
    server.once('listening', () => server.close(() => resolve()));
    server.listen(port, '127.0.0.1');
  });
}

function kill(proc: ChildProcess) {
  if (process.platform === 'win32' && proc.pid) {
    spawnSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore' });
  } else {
    proc.kill();
  }
}

function cleanupTestPorts() {
  if (process.platform !== 'win32') return;
  const snapshot = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true });
  const ports = new Set([apiPort, frontPort, adminPort]);
  const processIds = new Set<number>();
  for (const line of String(snapshot.stdout ?? '').split(/\r?\n/)) {
    const match = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i);
    if (match && ports.has(Number(match[1]))) processIds.add(Number(match[2]));
  }
  for (const processId of processIds) {
    spawnSync('taskkill', ['/pid', String(processId), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
  }
}

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

async function act(page: Page, item: ManifestItem) {
  const locator = page.getByTestId(item.selector);
  await locator.waitFor({ state: 'visible', timeout: 120000 });
  if (item.file != null) {
    await locator.setInputFiles(item.file, { timeout: 120000 });
  } else if (item.fill != null) {
    await locator.fill(item.fill, { timeout: 120000 });
  } else if (item.select != null) {
    await locator.selectOption(item.select, { timeout: 120000 });
  } else {
    await locator.click({ timeout: 120000 });
  }
}

async function runItem(page: Page, base: string, item: ManifestItem): Promise<Result> {
  const requests: Array<{ method: string; path: string; status: number }> = [];
  const listener = (response: any) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/')) requests.push({ method: response.request().method(), path: `${url.pathname}${url.search}`, status: response.status() });
  };
  page.on('response', listener);
  try {
    await page.goto(`${base}${item.route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(180);
    for (const setup of item.setup ?? []) {
      await act(page, { ...item, selector: setup.selector, fill: setup.fill, select: setup.select, file: setup.file });
      await page.waitForTimeout(setup.file ? 1800 : 160);
    }
    if (item.setupClick) {
      await act(page, { ...item, selector: item.setupClick, fill: undefined, select: undefined });
      await page.waitForTimeout(180);
    }
    if (item.setupPlaceholder) {
      await page.getByPlaceholder(item.setupPlaceholder.placeholder).fill(item.setupPlaceholder.fill, { timeout: 120000 });
      await page.waitForTimeout(180);
    }
    if (item.setupText) {
      await page.getByText(item.setupText, { exact: true }).click({ timeout: 120000 });
      await page.waitForTimeout(500);
    }
    requests.length = 0;
    await act(page, item);
    await page.waitForTimeout(300);
    const matcher = apiMatcher(item.expectedApi);
    if (matcher) {
      const deadline = Date.now() + 15000;
      while (!requests.some((req) => req.method === matcher.method && matcher.regex.test(req.path)) && Date.now() < deadline) {
        await page.waitForTimeout(250);
      }
    }
    const matched = matcher ? requests.find((req) => req.method === matcher.method && matcher.regex.test(req.path)) : undefined;
    const apiSeen = matcher ? Boolean(matched) : undefined;
    if (matcher && !apiSeen) throw new Error(`Expected API not seen: ${item.expectedApi}; saw ${requests.map((r) => `${r.method} ${r.path}`).join(', ')}`);
    if (matched && matched.status >= 400) throw new Error(`Expected API failed: ${matched.method} ${matched.path} => ${matched.status}`);
    if (item.expectedUrl) {
      const deadline = Date.now() + 15000;
      while (!page.url().includes(item.expectedUrl) && Date.now() < deadline) await page.waitForTimeout(100);
      if (!page.url().includes(item.expectedUrl)) throw new Error(`Expected URL containing ${item.expectedUrl}, got ${page.url()}`);
    }
    if (item.expectedVisibleTestId) {
      await page.getByTestId(item.expectedVisibleTestId).waitFor({ state: 'visible', timeout: 15000 });
    }
    if (item.expectedHiddenTestId) {
      await page.getByTestId(item.expectedHiddenTestId).waitFor({ state: 'hidden', timeout: 15000 });
    }
    if (item.expectedText) {
      await page.getByText(item.expectedText, { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
    }
    return { ...item, ok: true, url: page.url(), apiSeen, apiStatus: matched?.status };
  } catch (error: any) {
    return { ...item, ok: false, error: error?.message ?? String(error), url: page.url() };
  } finally {
    page.off('response', listener);
  }
}

async function loginAdmin(page: Page) {
  await page.goto(`${adminBase}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('admin-login-username').fill('admin');
  await page.getByTestId('admin-login-password').fill('admin123');
  await page.getByTestId('admin-login-submit').click();
  await page.waitForURL('**/dashboard', { timeout: 10000 });
}

function toMarkdown(results: Result[]) {
  const passed = results.filter((item) => item.ok).length;
  const lines = [
    '# Click-all report',
    '',
    `Total: ${results.length}`,
    `Passed: ${passed}`,
    `Failed: ${results.length - passed}`,
    '',
    '| Result | Page | Selector | Action | API | URL/Error |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const item of results) {
    lines.push(`| ${item.ok ? 'PASS' : 'FAIL'} | ${item.page} | ${item.selector} | ${item.expectedAction} | ${item.expectedApi ?? ''} | ${item.ok ? item.url ?? '' : item.error ?? ''} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function writeReports(results: Result[]) {
  await fs.writeFile('artifacts/test-report/click-all-report.json', JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  await fs.writeFile('artifacts/test-report/click-all-report.md', toMarkdown(results));
}

async function main() {
  await fs.mkdir('artifacts/test-report', { recursive: true });
  await fs.mkdir('artifacts/videos/click-all', { recursive: true });
  await fs.mkdir('artifacts/traces', { recursive: true });
  await fs.mkdir('artifacts/runtime', { recursive: true });

  const storeFile = path.resolve('artifacts/runtime', `goodnight-store.click-all-${process.pid}.json`);
  await fs.rm(storeFile, { force: true });

  const databaseUrl = resetTestDatabase(`goodnight_treehole_test_click_all_${process.pid}`);
  const env = {
    API_PORT: String(apiPort),
    GOODNIGHT_STORE_FILE: storeFile,
    VITE_API_BASE_URL: apiBase,
    DATABASE_URL: databaseUrl,
  };
  await Promise.all([assertPortFree(apiPort), assertPortFree(frontPort), assertPortFree(adminPort)]);
  const pnpm = process.platform === 'win32' ? process.execPath : 'pnpm';
  const pnpmPrefix = process.platform === 'win32'
    ? [path.join(String(process.env.APPDATA), 'npm', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')]
    : [];
  const procs = [
    spawnLogged('click-all-api', pnpm, [...pnpmPrefix, '--dir', 'apps/api', 'start'], env),
    spawnLogged('click-all-front', pnpm, [...pnpmPrefix, '--dir', 'apps/mp', 'dev', '--host', '127.0.0.1', '--port', String(frontPort), '--strictPort'], env),
    spawnLogged('click-all-admin', pnpm, [...pnpmPrefix, '--dir', 'apps/admin', 'dev', '--host', '127.0.0.1', '--port', String(adminPort), '--strictPort'], env),
  ];
  let previousPeerMatching: boolean | undefined;

  try {
    await wait(`${apiBase}/api/v1/posts`);
    await wait(`${frontBase}/pages/square/index`);
    await wait(`${adminBase}/login`);
    const privacyResponse = await fetch(`${apiBase}/api/v1/me/privacy`);
    const privacyPayload = await privacyResponse.json() as { item?: { allowPeerMatching?: boolean } };
    previousPeerMatching = privacyPayload.item?.allowPeerMatching;
    if (previousPeerMatching === false) {
      const enableResponse = await fetch(`${apiBase}/api/v1/me/privacy`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ allowPeerMatching: true, allowAnonymousExperienceStats: true }),
      });
      if (!enableResponse.ok) throw new Error(`Could not enable peer matching for click-all precondition: ${enableResponse.status}`);
    }
    await enableMonthlyReportActions();

    const frontManifest = JSON.parse(await fs.readFile('tests/interaction-manifest.front.json', 'utf8')) as ManifestItem[];
    const adminManifest = JSON.parse(await fs.readFile('tests/interaction-manifest.admin.json', 'utf8')) as ManifestItem[];
    const browser = await chromium.launch();
    const context = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
      recordVideo: { dir: 'artifacts/videos/click-all' },
    });
    await context.tracing.start({ screenshots: true, snapshots: true });

    const front = await context.newPage();
    await front.setViewportSize({ width: 430, height: 764 });
    const admin = await context.newPage();
    await admin.setViewportSize({ width: 1448, height: 1086 });
    const results: Result[] = [];

    if (scope !== 'admin') {
      for (const item of resumeItems(frontManifest)) {
        const result = await runItem(front, frontBase, item);
        results.push(result);
        console.log(`${result.ok ? 'PASS' : 'FAIL'} front ${item.selector}`);
        await writeReports(results);
      }
    }

    if (scope !== 'front') {
      // Front click tests intentionally exercise hide/block actions. Seed one
      // real, pending post so admin moderation always reviews an independent record.
      await createAdminReviewCandidate();
      const loginItems = adminManifest.filter((item) => item.route === '/login');
      for (const item of loginItems) {
        const result = await runItem(admin, adminBase, item);
        results.push(result);
        console.log(`${result.ok ? 'PASS' : 'FAIL'} admin ${item.selector}`);
        await writeReports(results);
      }
      await loginAdmin(admin);
      for (const item of resumeItems(adminManifest.filter((item) => item.route !== '/login'), true)) {
        const result = await runItem(admin, adminBase, item);
        results.push(result);
        console.log(`${result.ok ? 'PASS' : 'FAIL'} admin ${item.selector}`);
        await writeReports(results);
      }
    }

    await context.tracing.stop({ path: 'artifacts/traces/click-all-trace.zip' });
    await browser.close();

    await writeReports(results);
    const failed = results.filter((item) => !item.ok);
    if (failed.length) {
      throw new Error(toMarkdown(failed));
    }
  } finally {
    if (previousPeerMatching === false) {
      await fetch(`${apiBase}/api/v1/me/privacy`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ allowPeerMatching: false, allowAnonymousExperienceStats: false }),
      }).catch(() => undefined);
    }
    for (const proc of procs) kill(proc);
    cleanupTestPorts();
    await fs.rm(storeFile, { force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
