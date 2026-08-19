import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { chromium, type Page } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { cleanRuntime, kill, spawnLogged, urls, wait } from './real-browser-utils.ts';
import { resetTestDatabase } from './test-database.ts';

const root = path.resolve('artifacts', 'notification-truth-states');
const reference = 'C:\\Users\\zyu33\\Desktop\\图片素材88\\晚安树洞_UI_01-41_业务说明\\39_提醒与回访.png';
const fidelityRoot = path.resolve('artifacts', 'reference-fidelity', 'first-stage');
const viewport = { width: 420, height: 786 };
const fixturePrefix = 'truth_notice_';

type NoticeFixture = { id: string; type: string; title: string; body: string; targetRoute: string };

function notice(type: string, suffix: string, targetRoute: string, body: string): NoticeFixture {
  return { id: `${fixturePrefix}${suffix}`, type, title: ({
    FOLLOW_UP: '昨天那件事，后来怎么样了？',
    PEER_REQUEST: '有人想和你聊聊这段经历',
    FUTURE_SELF: '清醒时候的你，留了一句话',
    COOLDOWN_RELEASED: '现在还想这样做吗？',
  } as Record<string, string>)[type] ?? '提醒与回访', body, targetRoute };
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${urls.api}${url}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${url}: ${response.status} ${String((body as { message?: string }).message ?? '')}`.trim());
  return body as T;
}

async function writePng(file: string, image: PNG) {
  await fs.writeFile(file, PNG.sync.write(image));
}

async function writeReferenceEvidence(actualBuffer: Buffer) {
  const actual = PNG.sync.read(actualBuffer);
  const referenceImage = PNG.sync.read(await fs.readFile(reference));
  if (actual.width !== referenceImage.width || actual.height !== referenceImage.height) throw new Error('Notification reference capture must be 420x786');
  const side = new PNG({ width: actual.width + referenceImage.width, height: actual.height });
  PNG.bitblt(referenceImage, side, 0, 0, referenceImage.width, referenceImage.height, 0, 0);
  PNG.bitblt(actual, side, 0, 0, actual.width, actual.height, referenceImage.width, 0);
  const difference = new PNG({ width: actual.width, height: actual.height });
  pixelmatch(referenceImage.data, actual.data, difference.data, actual.width, actual.height, { threshold: 0.12, includeAA: false, diffColor: [232, 102, 90] });
  await fs.mkdir(fidelityRoot, { recursive: true });
  await writePng(path.join(fidelityRoot, 'notification-reference.png'), referenceImage);
  await writePng(path.join(fidelityRoot, 'notification-actual.png'), actual);
  await writePng(path.join(fidelityRoot, 'notification-side-by-side.png'), side);
  await writePng(path.join(fidelityRoot, 'notification-difference.png'), difference);
}

async function capture(page: Page, state: string, expectedCount: number) {
  await page.goto(`${urls.front}/pages/notifications/index`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(250);
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    visibleCards: document.querySelectorAll('.notice-card').length,
    tabbarVisible: [...document.querySelectorAll<HTMLElement>('.tabbar')].some((node) => getComputedStyle(node).display !== 'none'),
    pageHeight: document.documentElement.scrollHeight,
  }));
  if (metrics.scrollWidth > metrics.viewportWidth) throw new Error(`${state} has horizontal overflow`);
  if (metrics.visibleCards !== expectedCount) throw new Error(`${state} rendered ${metrics.visibleCards} cards, expected ${expectedCount}`);
  if (!metrics.tabbarVisible) throw new Error(`${state} must render the reference four-tab navigation`);
  const screenshot = await page.screenshot({ fullPage: false });
  await fs.writeFile(path.join(root, `${state}.png`), screenshot);
  return { metrics, screenshot };
}

async function main() {
  await cleanRuntime();
  await fs.mkdir(root, { recursive: true });
  const databaseUrl = resetTestDatabase('goodnight_treehole_test_notification_truth');
  const env = {
    DATABASE_URL: databaseUrl,
    GOODNIGHT_STORE_FILE: 'data/goodnight-store.notification-truth.json',
    VITE_API_BASE_URL: urls.api,
    FOLLOW_UP_QUEUE_NAME: 'goodnight-follow-ups-notification-truth',
  };
  await fs.rm(env.GOODNIGHT_STORE_FILE, { force: true });
  await fs.rm(`apps/api/${env.GOODNIGHT_STORE_FILE}`, { force: true });
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let api = spawnLogged('truth-notification-api', 'pnpm', ['--dir', 'apps/api', 'start'], env);
  const front = spawnLogged('truth-notification-front', 'pnpm', ['--dir', 'apps/mp', 'dev', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], env);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, locale: 'zh-CN' });
  const page = await context.newPage();
  const manifest: Record<string, unknown> = { schema: 'goodnight_treehole_test_notification_truth', fixtureMode: 'isolated persisted relational records', states: {} };

  const restartApi = async () => {
    kill(api);
    api = spawnLogged('truth-notification-api', 'pnpm', ['--dir', 'apps/api', 'start'], env);
    await wait(`${urls.api}/api/v1/notifications`);
  };

  try {
    await wait(`${urls.api}/api/v1/notifications`);
    await wait(`${urls.front}/pages/notifications/index`);
    const user = await db.user.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!user) throw new Error('Test runtime did not initialize a persistent demo user');

    manifest.states.empty = { api: await json('/api/v1/notifications'), capture: (await capture(page, 'empty', 0)).metrics };

    const single = notice('FOLLOW_UP', 'single', '/pages/action/index?section=follow-up', '不用写得完整，告诉我现在发生了什么就好。');
    await db.userNotification.create({ data: { ...single, userId: user.id, status: 'unread' } });
    await restartApi();
    manifest.states.single = { api: await json('/api/v1/notifications'), capture: (await capture(page, 'single', 1)).metrics };

    await db.userNotification.deleteMany({ where: { id: { startsWith: fixturePrefix } } });
    const longFutureCopy = '给未来的自己留下一段完整的话：'.padEnd(160, '请慢一点呼吸，先照顾好自己。');
    const referenceItems = [
      notice('FOLLOW_UP', 'followup', '/pages/action/index?section=follow-up', '不用写得完整，告诉我现在发生了什么就好。'),
      notice('PEER_REQUEST', 'peer', '/pages/peer/request?id=truth', '对方看见了你留下的后来记录，你可以选择接受、拒绝，或暂时不想。'),
      notice('FUTURE_SELF', 'future', '/pages/future-self/index', longFutureCopy.slice(0, 160)),
      notice('COOLDOWN_RELEASED', 'cooldown', '/pages/action/index?section=vault', '你之前放进决定保险箱的事情，已经到了可以重新看一眼的时间。'),
    ];
    await db.userNotification.createMany({ data: referenceItems.map((item, index) => ({ ...item, userId: user.id, status: 'unread', createdAt: new Date(Date.now() - index * 60_000) })) });
    await restartApi();
    const referenceApi = await json<{ items: Array<{ id: string; type: string; status: string }> }>('/api/v1/notifications');
    const types = referenceApi.items.map((item) => item.type).sort();
    const expectedTypes = ['COOLDOWN_RELEASED', 'FOLLOW_UP', 'FUTURE_SELF', 'PEER_REQUEST'];
    if (referenceApi.items.length !== 4 || JSON.stringify(types) !== JSON.stringify(expectedTypes)) throw new Error(`Reference notification types are incorrect: ${types.join(', ')}`);
    const referenceCapture = await capture(page, 'reference-four', 4);
    await writeReferenceEvidence(Buffer.from(referenceCapture.screenshot));
    await page.getByTestId(`notification-${referenceItems[0].id}`).click();
    await page.waitForURL('**/pages/action/index?section=follow-up', { timeout: 15_000 });
    const readBack = await json<{ items: Array<{ id: string; status: string }> }>('/api/v1/notifications');
    if (readBack.items.find((item) => item.id === referenceItems[0].id)?.status !== 'read') throw new Error('Notification click did not persist the read status through the API');
    manifest.states.reference = { types, click: { id: referenceItems[0].id, route: page.url(), persistedStatus: 'read' }, capture: referenceCapture.metrics };

    const stressItems = Array.from({ length: 16 }, (_, index) => notice('FOLLOW_UP', `stress_${index}`, '/pages/action/index?section=follow-up', `第 ${index + 1} 条回访：${'请先照顾好此刻的自己。'.repeat(10)}`.slice(0, 160)));
    await db.userNotification.createMany({ data: stressItems.map((item, index) => ({ ...item, userId: user.id, status: 'unread', createdAt: new Date(Date.now() + index + 1) })) });
    await restartApi();
    const stressApi = await json<{ items: Array<{ id: string }> }>('/api/v1/notifications');
    if (stressApi.items.length < 20) throw new Error(`Stress state has ${stressApi.items.length} notifications, expected at least 20`);
    manifest.states.stress = { count: stressApi.items.length, capture: (await capture(page, 'stress', stressApi.items.length)).metrics };

    await db.userNotification.deleteMany({ where: { id: { startsWith: fixturePrefix } } });
    await restartApi();
    const cleanup = await json<{ items: unknown[] }>('/api/v1/notifications');
    if (cleanup.items.length !== 0) throw new Error(`Notification cleanup leaked ${cleanup.items.length} records into the isolated test runtime`);
    manifest.cleanup = { apiCount: cleanup.items.length };
  } finally {
    await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    await context.close();
    await browser.close();
    kill(api);
    kill(front);
    await db.$disconnect();
    await cleanRuntime();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
