import { chromium, type Page } from 'playwright';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import { resetTestDatabase } from './test-database';

type FlowResult = { name: string; ok: boolean; evidence: string; error?: string };
type ApiCheck = { endpoint: string; ok: boolean; evidence: string };

const apiPort = 3110;
const frontPort = 5193;
const adminPort = 5194;
const apiBase = `http://127.0.0.1:${apiPort}`;
const frontBase = `http://127.0.0.1:${frontPort}`;
const adminBase = `http://127.0.0.1:${adminPort}`;

async function wait(url: string) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      // still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

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

function clearTestPort(port: number) {
  const script = `$listener = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue; if ($listener) { Stop-Process -Id $listener.OwningProcess -Force }`;
  spawnSync('powershell.exe', ['-NoProfile', '-Command', script], { stdio: 'ignore' });
}

async function json(path: string, init?: RequestInit) {
  const res = await fetch(`${apiBase}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} => ${res.status}`);
  return res.json();
}

async function loginAdmin(page: Page) {
  await page.goto(`${adminBase}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('admin-login-username').fill('admin');
  await page.getByTestId('admin-login-password').fill('admin123');
  await page.getByTestId('admin-login-submit').click();
  await page.waitForURL('**/dashboard', { timeout: 10000 });
}

async function waitForAriaPressed(page: Page, testId: string, expected: boolean) {
  const control = page.getByTestId(testId);
  if (await control.count() !== 1) throw new Error(`${testId} must resolve to one control`);
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await control.getAttribute('aria-pressed') === String(expected)) return;
    await page.waitForTimeout(50);
  }
  throw new Error(`${testId} did not render aria-pressed=${expected}`);
}

async function waitForPrivacyValue(expected: boolean) {
  const deadline = Date.now() + 5000;
  let last: any;
  while (Date.now() < deadline) {
    last = await json('/api/v1/settings/privacy');
    if (last.item.allowHumanReplies === expected) return last;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Privacy API did not settle to ${expected}; last=${last?.item?.allowHumanReplies}`);
}

async function runFlow(name: string, fn: () => Promise<string>): Promise<FlowResult> {
  try {
    return { name, ok: true, evidence: await fn() };
  } catch (error: any) {
    return { name, ok: false, evidence: '', error: error?.message ?? String(error) };
  }
}

function toMarkdown(title: string, rows: Array<{ name?: string; endpoint?: string; ok: boolean; evidence: string; error?: string }>) {
  const lines = [
    `# ${title}`,
    '',
    `Total: ${rows.length}`,
    `Passed: ${rows.filter((row) => row.ok).length}`,
    `Failed: ${rows.filter((row) => !row.ok).length}`,
    '',
    '| Result | Name | Evidence |',
    '| --- | --- | --- |',
  ];
  for (const row of rows) lines.push(`| ${row.ok ? 'PASS' : 'FAIL'} | ${row.name ?? row.endpoint} | ${row.ok ? row.evidence : row.error ?? ''} |`);
  return `${lines.join('\n')}\n`;
}

async function main() {
  [apiPort, frontPort, adminPort].forEach(clearTestPort);
  await fs.mkdir('artifacts/test-report', { recursive: true });
  await fs.mkdir('artifacts/screenshots/business', { recursive: true });
  await fs.mkdir('artifacts/videos/business-flow', { recursive: true });
  await fs.mkdir('artifacts/traces', { recursive: true });
  await fs.rm('apps/api/data/goodnight-store.business-flow.json', { force: true });

  const env = {
    API_PORT: String(apiPort),
    DATABASE_URL: resetTestDatabase('goodnight_treehole_test_business_flow'),
    GOODNIGHT_STORE_FILE: 'data/goodnight-store.business-flow.json',
    VITE_API_BASE_URL: apiBase,
  };
  const procs = [
    spawnLogged('business-api', 'pnpm', ['--dir', 'apps/api', 'start'], env),
    spawnLogged('business-front', 'pnpm', ['--dir', 'apps/mp', 'dev', '--host', '127.0.0.1', '--port', String(frontPort), '--strictPort'], env),
    spawnLogged('business-admin', 'pnpm', ['--dir', 'apps/admin', 'dev', '--host', '127.0.0.1', '--port', String(adminPort), '--strictPort'], env),
  ];

  try {
    await wait(`${apiBase}/api/v1/posts`);
    await wait(`${frontBase}/pages/square/index`);
    await wait(`${adminBase}/login`);

    const browser = await chromium.launch();
    const context = await browser.newContext({ recordVideo: { dir: 'artifacts/videos/business-flow' } });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const front = await context.newPage();
    await front.setViewportSize({ width: 430, height: 764 });
    const admin = await context.newPage();
    await admin.setViewportSize({ width: 1448, height: 1086 });
    await loginAdmin(admin);

    const flows: FlowResult[] = [];
    const apiChecks: ApiCheck[] = [];

    flows.push(await runFlow('front mood publish -> admin approve -> front visible', async () => {
      await front.goto(`${frontBase}/pages/mood/create`, { waitUntil: 'domcontentloaded' });
      const content = `Business mood ${Date.now()}`;
      await front.getByTestId('input-mood-content').fill(content);
      await front.getByTestId('mood-visibility-public').click();
      await front.getByTestId('btn-submit-mood').click();
      await front.waitForURL('**/pages/post/detail**', { timeout: 10000 });
      const postsBefore = await json('/api/admin/v1/posts');
      const created = postsBefore.items.find((item: any) => item.content === content);
      if (!created) throw new Error('Created post not found in admin API');
      await admin.goto(`${adminBase}/posts`, { waitUntil: 'domcontentloaded' });
      await admin.getByTestId('admin-post-search').fill(content);
      await admin.getByTestId('posts-row-first').waitFor({ state: 'visible', timeout: 10000 });
      await admin.getByTestId('posts-row-first').click();
      await admin.getByTestId('admin-post-approve').click();
      await front.goto(`${frontBase}/pages/square/index`, { waitUntil: 'domcontentloaded' });
      const publicPosts = await json('/api/v1/posts');
      const visible = publicPosts.items.some((item: any) => item.content === content || item.id === created.id);
      if (!visible) throw new Error('Approved post not visible on front API');
      return `post=${created.id}`;
    }));

    flows.push(await runFlow('reply bottom sheet -> admin approve -> front replies visible', async () => {
      const privacyBeforeReply = await json('/api/v1/settings/privacy');
      if (!privacyBeforeReply.item.allowHumanReplies) {
        await front.goto(`${frontBase}/pages/settings/privacy`, { waitUntil: 'domcontentloaded' });
        await front.getByTestId('toggle-privacy-human').click();
        await waitForAriaPressed(front, 'toggle-privacy-human', true);
        const restored = await waitForPrivacyValue(true);
        if (!restored.item.allowHumanReplies) throw new Error('Human replies could not be restored for moderation flow');
      }
      await front.goto(`${frontBase}/pages/post/detail?id=post_1&sheet=reply`, { waitUntil: 'domcontentloaded' });
      const content = `Business reply ${Date.now()}`;
      await front.getByTestId('input-reply-content').fill(content);
      await front.getByTestId('btn-submit-reply').click();
      await front.waitForURL('**/pages/post/detail**', { timeout: 10000 });
      const allReplies = await json('/api/admin/v1/replies');
      const reply = allReplies.items.find((item: any) => item.content === content);
      if (!reply) throw new Error('Reply not found in admin API');
      await admin.goto(`${adminBase}/replies/moderation`, { waitUntil: 'domcontentloaded' });
      await admin.getByTestId('admin-reply-search').fill(content);
      await admin.getByTestId('replies-row-first').waitFor({ state: 'visible', timeout: 10000 });
      await admin.getByTestId('replies-row-first').click();
      await admin.getByTestId('admin-reply-approve').click();
      const publicReplies = await json('/api/v1/posts/post_1/replies');
      if (!publicReplies.items.some((item: any) => item.id === reply.id)) throw new Error('Approved reply not visible on front API');
      return `reply=${reply.id}`;
    }));

    flows.push(await runFlow('admin AI route save/test -> front letter regeneration uses route', async () => {
      await admin.goto(`${adminBase}/ai/routes`, { waitUntil: 'domcontentloaded' });
      const warmRoute = admin.getByTestId('admin-route-card-warm');
      if (await warmRoute.count() !== 1) throw new Error('Warm route card must be uniquely available');
      await warmRoute.click();
      await admin.getByTestId('admin-route-save').click();
      await admin.getByTestId('admin-route-test').click();
      await front.goto(`${frontBase}/pages/letter/index`, { waitUntil: 'domcontentloaded' });
      await front.getByTestId('btn-letter-warm').click();
      const jobs = await json('/api/admin/v1/ai/jobs');
      if (!jobs.items.some((item: any) => item.contentType === 'Letter' || item.contentType === 'RouteTest')) throw new Error('AI jobs not created');
      return `jobs=${jobs.items.length}`;
    }));

    flows.push(await runFlow('front feedback -> admin reply/resolve -> front feedback status query', async () => {
      await front.goto(`${frontBase}/pages/help/feedback`, { waitUntil: 'domcontentloaded' });
      const content = `Business ticket ${Date.now()}`;
      await front.getByTestId('input-feedback-content').fill(content);
      await front.getByTestId('btn-feedback-submit').click();
      await admin.goto(`${adminBase}/ops/feedback`, { waitUntil: 'domcontentloaded' });
      await admin.getByTestId('admin-feedback-search').fill(content);
      await admin.getByTestId('tickets-row-first').waitFor({ state: 'visible', timeout: 10000 });
      await admin.getByTestId('tickets-row-first').click();
      const replyResponse = admin.waitForResponse((response) => response.url().includes('/api/admin/v1/feedback/') && response.url().endsWith('/reply') && response.request().method() === 'POST');
      await admin.getByTestId('admin-ticket-reply').click();
      if (!(await replyResponse).ok()) throw new Error('Admin ticket reply API failed');
      const resolveResponse = admin.waitForResponse((response) => response.url().includes('/api/admin/v1/feedback/') && response.url().endsWith('/status') && response.request().method() === 'PATCH');
      await admin.getByTestId('admin-ticket-resolve').click();
      if (!(await resolveResponse).ok()) throw new Error('Admin ticket resolve API failed');
      const tickets = await json('/api/v1/feedback');
      const ticket = tickets.items.find((item: any) => item.content === content);
      if (!ticket) throw new Error('Ticket missing from front status API');
      return `ticket=${ticket.id};status=${ticket.status}`;
    }));

    flows.push(await runFlow('privacy toggles persist through API', async () => {
      await front.goto(`${frontBase}/pages/settings/privacy`, { waitUntil: 'domcontentloaded' });
      const before = await json('/api/v1/settings/privacy');
      await front.getByTestId('toggle-privacy-human').click();
      await waitForAriaPressed(front, 'toggle-privacy-human', !before.item.allowHumanReplies);
      const toggled = await waitForPrivacyValue(!before.item.allowHumanReplies);
      if (toggled.item.allowHumanReplies === before.item.allowHumanReplies) throw new Error('Privacy toggle did not persist');
      await front.getByTestId('toggle-privacy-human').click();
      await waitForAriaPressed(front, 'toggle-privacy-human', before.item.allowHumanReplies);
      const restored = await waitForPrivacyValue(before.item.allowHumanReplies);
      if (restored.item.allowHumanReplies !== before.item.allowHumanReplies) throw new Error(`Privacy toggle did not restore (before=${before.item.allowHumanReplies}; toggled=${toggled.item.allowHumanReplies}; restored=${restored.item.allowHumanReplies})`);
      return `toggled=${toggled.item.allowHumanReplies};restored=${restored.item.allowHumanReplies}`;
    }));

    flows.push(await runFlow('tool decompose run/save -> diary created', async () => {
      await front.goto(`${frontBase}/pages/tool/decompose`, { waitUntil: 'domcontentloaded' });
      await front.getByTestId('input-decompose').fill('Business decompose input');
      await front.getByTestId('btn-decompose-run').click();
      await front.waitForTimeout(500);
      await front.getByTestId('btn-decompose-save').click();
      const diaries = await json('/api/v1/diaries');
      if (!diaries.items.some((item: any) => item.source === 'tool-decompose' || String(item.content).includes('Business decompose input'))) throw new Error('Saved decompose diary missing');
      return `diaries=${diaries.items.length}`;
    }));

    flows.push(await runFlow('letter save -> diary count increases', async () => {
      const before = await json('/api/v1/diaries');
      await front.goto(`${frontBase}/pages/letter/index`, { waitUntil: 'domcontentloaded' });
      await front.getByTestId('btn-letter-save').click();
      const after = await json('/api/v1/diaries');
      if (after.items.length <= before.items.length) throw new Error('Diary count did not increase');
      return `before=${before.items.length};after=${after.items.length}`;
    }));

    flows.push(await runFlow('favorite add/remove persists', async () => {
      await front.goto(`${frontBase}/pages/post/detail?id=post_1`, { waitUntil: 'domcontentloaded' });
      await front.getByTestId('btn-favorite').click();
      const before = await json('/api/v1/favorites');
      await front.goto(`${frontBase}/pages/favorite/index`, { waitUntil: 'domcontentloaded' });
      await front.getByTestId('filter-fav-post').click();
      await front.getByTestId('favorite-card-first').waitFor({ state: 'visible', timeout: 10000 });
      await front.getByTestId('btn-favorite-remove').click();
      const after = await json('/api/v1/favorites');
      if (after.items.length >= before.items.length) throw new Error('Favorite was not removed');
      return `before=${before.items.length};after=${after.items.length}`;
    }));

    flows.push(await runFlow('admin DAPI refresh/test persists', async () => {
      await admin.goto(`${adminBase}/ai/providers`, { waitUntil: 'domcontentloaded' });
      await admin.getByTestId('admin-provider-refresh').click();
      const providers = await json('/api/admin/v1/ai/providers');
      const provider = providers.items.find((item: any) => item.enabled && item.id === 'provider_dapi_deepseek');
      if (!provider) throw new Error('No enabled DAPI provider found after refresh');
      const testRequest = admin.waitForResponse((response) => response.url().includes(`/api/admin/v1/ai/providers/${provider.id}/test`) && response.request().method() === 'POST', { timeout: 15000 });
      await admin.getByTestId(`admin-provider-test-${provider.id}`).click();
      const testResponse = await testRequest;
      if (!testResponse.ok()) throw new Error(`Provider test failed: ${testResponse.status()}`);
      const reread = await json('/api/admin/v1/ai/providers');
      const persisted = reread.items.find((item: any) => item.id === provider.id);
      if (!persisted?.enabled) throw new Error('DAPI provider was not persisted');
      return `providers=${reread.items.length}; tested=${persisted.modelName}; status=${testResponse.status()}`;
    }));

    flows.push(await runFlow('clear user data removes diaries/favorites/letters', async () => {
      await front.goto(`${frontBase}/pages/me/index`, { waitUntil: 'domcontentloaded' });
      await front.getByTestId('btn-clear-data').click();
      await front.getByTestId('btn-clear-confirm').click();
      const [diaries, favorites, letters] = await Promise.all([json('/api/v1/diaries'), json('/api/v1/favorites'), json('/api/v1/letters')]);
      if (diaries.items.length || favorites.items.length || letters.items.length) throw new Error('User data not fully cleared');
      return 'diaries=0;favorites=0;letters=0';
    }));

    const apiEndpoints = [
      '/api/v1/posts',
      '/api/v1/feedback',
      '/api/v1/diaries',
      '/api/v1/favorites',
      '/api/admin/v1/posts',
      '/api/admin/v1/replies',
      '/api/admin/v1/ai/jobs',
      '/api/admin/v1/feedback/tickets',
    ];
    for (const endpoint of apiEndpoints) {
      const data = await json(endpoint);
      apiChecks.push({ endpoint, ok: Array.isArray(data.items), evidence: `items=${data.items?.length ?? 0}` });
    }

    await front.screenshot({ path: 'artifacts/screenshots/business/front-final.png', fullPage: true });
    await admin.screenshot({ path: 'artifacts/screenshots/business/admin-final.png', fullPage: true });
    await context.tracing.stop({ path: 'artifacts/traces/business-flow-trace.zip' });
    await browser.close();

    await fs.writeFile('artifacts/test-report/business-flow-report.md', toMarkdown('Business flow report', flows));
    await fs.writeFile('artifacts/test-report/api-report.md', toMarkdown('API report', apiChecks));

    const failed = flows.filter((item) => !item.ok);
    if (failed.length) {
      console.error(toMarkdown('Business flow failures', failed));
      process.exit(1);
    }
  } finally {
    for (const proc of procs) kill(proc);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
