import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { PrismaClient } from '@prisma/client';
import { cleanRuntime, kill, startFrontStack, urls } from './real-browser-utils';
import { resetTestDatabase } from './test-database';

const referenceDir = 'C:\\Users\\zyu33\\Desktop\\图片素材88\\晚安树洞_UI_01-41_业务说明';
const artifactDir = path.resolve('artifacts', 'reference-fidelity', 'peer-stage');
const viewport = { width: 420, height: 786 };
const responsiveViewports = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
] as const;

const references = {
  network: '02_有人也走过相似的路.png',
  detail: '05_匿名经历详情.png',
  requests: '28_我的请求_正式版.png',
  waiting: '31_同路匹配等待.png',
  consent: '21_同路会话前确认.png',
  conversation: '04_匿名同路会话.png',
  graduation: '40_Journey毕业分享.png',
} as const;

type State = keyof typeof references;
type Evidence = { state: State; route: string; reference: string; actual: string; sideBySide: string; difference: string; scrollWidth: number; scrollHeight: number; buttons: number };

function apiHeaders(userId?: string, extra: Record<string, string> = {}) {
  return { 'content-type': 'application/json', ...(userId ? { 'x-goodnight-user-id': userId } : {}), ...extra };
}

async function json<T>(route: string, init: RequestInit = {}) {
  const response = await fetch(`${urls.api}${route}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${route} -> ${response.status}: ${String((body as { message?: string }).message ?? '')}`);
  return body as T;
}

async function newPeerPage(context: BrowserContext, userId: string) {
  const page = await context.newPage();
  await page.route('**/api/**', async (route) => {
    const headers = { ...route.request().headers(), 'x-goodnight-user-id': userId };
    await route.continue({ headers });
  });
  return page;
}

async function writePng(file: string, png: PNG) {
  await fs.writeFile(file, PNG.sync.write(png));
}

async function capture(page: Page, state: State, route: string, expected: string[], evidence: Evidence[]) {
  await page.setViewportSize(viewport);
  await page.goto(`${urls.front}${route}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.phone-shell').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(350);
  if (!await page.locator('.tabbar').isVisible()) throw new Error(state + ' is missing the peer tabbar');
  const tabbarReachable = await page.evaluate(() => {
    const nav = document.querySelector<HTMLElement>('.tabbar');
    if (!nav) return false;
    const rect = nav.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('.tabbar') === nav;
  });
  if (!tabbarReachable) throw new Error(state + ' tabbar is covered by page content');
  const bodyText = await page.locator('body').innerText();
  for (const value of expected) {
    if (!bodyText.includes(value)) throw new Error(`${state} is missing visible copy: ${value}`);
  }
  if (/(match score|similarity|trust score|ranking|相似度\s*\d|帮助信誉|planning|stabilizing|graduated)/i.test(bodyText)) {
    throw new Error(`${state} exposed internal matching or stage data`);
  }
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    scrollHeight: document.documentElement.scrollHeight,
    buttons: document.querySelectorAll('button').length,
  }));
  if (metrics.scrollWidth > metrics.viewportWidth) throw new Error(`${state} has horizontal overflow`);

  const actualBuffer = await page.screenshot();
  const actual = PNG.sync.read(Buffer.from(actualBuffer));
  const referencePath = path.join(referenceDir, references[state]);
  const reference = PNG.sync.read(await fs.readFile(referencePath));
  if (actual.width !== reference.width || actual.height !== reference.height) {
    throw new Error(`${state} screenshot is ${actual.width}x${actual.height}, expected ${reference.width}x${reference.height}`);
  }
  const side = new PNG({ width: reference.width + actual.width, height: Math.max(reference.height, actual.height) });
  PNG.bitblt(reference, side, 0, 0, reference.width, reference.height, 0, 0);
  PNG.bitblt(actual, side, 0, 0, actual.width, actual.height, reference.width, 0);
  const difference = new PNG({ width: reference.width, height: reference.height });
  pixelmatch(reference.data, actual.data, difference.data, reference.width, reference.height, { threshold: 0.12, includeAA: false, diffColor: [232, 102, 90] });

  const stem = path.join(artifactDir, state);
  await writePng(`${stem}-reference.png`, reference);
  await writePng(`${stem}-actual.png`, actual);
  await writePng(`${stem}-side-by-side.png`, side);
  await writePng(`${stem}-difference.png`, difference);
  evidence.push({ state, route, reference: `${stem}-reference.png`, actual: `${stem}-actual.png`, sideBySide: `${stem}-side-by-side.png`, difference: `${stem}-difference.png`, scrollWidth: metrics.scrollWidth, scrollHeight: metrics.scrollHeight, buttons: metrics.buttons });
  await captureResponsive(page, state, route);
}

async function captureResponsive(page: Page, state: State, route: string) {
  for (const size of responsiveViewports) {
    await page.setViewportSize(size);
    await page.goto(`${urls.front}${route}`, { waitUntil: 'domcontentloaded' });
    await page.locator('.phone-shell').waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForTimeout(180);
    if (!await page.locator('.tabbar').isVisible()) throw new Error(state + ' is missing the peer tabbar at ' + size.width + 'x' + size.height);
    const tabbarReachable = await page.evaluate(() => {
      const nav = document.querySelector<HTMLElement>('.tabbar');
      if (!nav) return false;
      const rect = nav.getBoundingClientRect();
      return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('.tabbar') === nav;
    });
    if (!tabbarReachable) throw new Error(state + ' tabbar is covered at ' + size.width + 'x' + size.height);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) throw new Error(`${state} has horizontal overflow at ${size.width}x${size.height}`);
    await page.screenshot({ path: path.join(artifactDir, 'responsive', `${state}-${size.width}x${size.height}.png`) });
  }
}

async function main() {
  // startFrontStack owns this schema name. Reusing it keeps browser requests
  // and the Prisma evidence readback on the exact same isolated database.
  const databaseUrl = resetTestDatabase('goodnight_treehole_test_real_front');
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const evidence: Evidence[] = [];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let context: BrowserContext | undefined;
  let procs: Awaited<ReturnType<typeof startFrontStack>> = [];
  try {
    await fs.mkdir(path.join(artifactDir, 'responsive'), { recursive: true });
    await cleanRuntime();
    procs = await startFrontStack();

    const owner = 'user_guest';
    const requester = 'user_demo';
    await json('/api/v1/me/privacy', { method: 'PATCH', headers: apiHeaders(owner), body: JSON.stringify({ allowPeerMatching: true, allowAnonymousExperienceStats: true }) });
    await json('/api/v1/me/privacy', { method: 'PATCH', headers: apiHeaders(requester), body: JSON.stringify({ allowPeerMatching: true, allowAnonymousExperienceStats: true }) });
    const ownerJourney = await json<{ journey: { id: string } }>('/api/v1/journeys', { method: 'POST', headers: apiHeaders(owner), body: JSON.stringify({ title: '把想发的消息放到明天', domain: '关系', content: '我那时总想立刻联系对方，后来先给自己一晚的时间。', intensity: 5 }) });
    const experience = await json<{ item: { id: string } }>('/api/v1/peer-experiences', { method: 'POST', headers: apiHeaders(owner), body: JSON.stringify({ journeyId: ownerJourney.journey.id, title: '把想说的话先留在草稿里', domain: '关系', stage: 'graduated', content: '我没有强迫自己马上放下，只先把今晚过完。', tags: ['分开后想联系'], consented: true, laterSummary: { summary: '第三周开始，我能先照顾自己的节奏，再决定要不要联系。' }, helpfulActions: ['把想说的话写进草稿', '先喝一杯温水'] }) });
    const login = await json<{ token: string }>('/api/admin/v1/auth/login', { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
    await json(`/api/admin/v1/peer-experiences/${experience.item.id}/review`, { method: 'PATCH', headers: apiHeaders(undefined, { authorization: `Bearer ${login.token}` }), body: JSON.stringify({ status: 'published' }) });
    const requesterJourney = await json<{ journey: { id: string } }>('/api/v1/journeys', { method: 'POST', headers: apiHeaders(requester), body: JSON.stringify({ title: '今晚又想联系 TA', domain: '关系', content: '我很想马上发出那条消息，又担心让自己更难受。', intensity: 7 }) });
    await json(`/api/v1/journeys/${requesterJourney.journey.id}/situation`, { method: 'PATCH', headers: apiHeaders(requester), body: JSON.stringify({ facts: ['关系已经结束，但今晚很想联系对方'], feelings: ['想念'], needs: ['先别冲动'], domain: '关系', subDomain: '分开后想联系', contextTags: ['分开后想联系', '关系'], intensity: 7 }) });
    const suggested = await json<{ items: Array<{ id: string; peerExperienceId: string }> }>(`/api/v1/journeys/${requesterJourney.journey.id}/peer-matches`, { method: 'POST', headers: apiHeaders(requester), body: '{}' });
    const match = suggested.items.find((item) => item.peerExperienceId === experience.item.id);
    if (!match) throw new Error('real two-user fixture did not produce a match');

    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport, locale: 'zh-CN' });
    const requesterPage = await newPeerPage(context, requester);
    const ownerPage = await newPeerPage(context, owner);

    await capture(requesterPage, 'network', '/pages/peers/index', ['有人也走过', '看看 TA 后来怎么样'], evidence);
    await capture(requesterPage, 'detail', `/pages/peer/detail?id=${encodeURIComponent(experience.item.id)}&matchId=${encodeURIComponent(match.id)}`, ['TA 后来是这样走过来的', '请求匿名交流'], evidence);
    await requesterPage.getByRole('button', { name: '请求匿名交流', exact: true }).click();
    await requesterPage.getByLabel('我为什么想聊').fill('我也想先把今晚走过去，想听听你怎么给自己留一点空间。');
    await requesterPage.getByLabel('我最想问的一句').fill('你最开始那几天是怎么熬过来的？');
    await requesterPage.getByRole('button', { name: '递出匿名请求', exact: true }).click();
    await requesterPage.waitForURL('**/pages/peer/wait?*', { timeout: 15_000 });
    await capture(requesterPage, 'waiting', `/pages/peer/wait?matchId=${encodeURIComponent(match.id)}`, ['请求已经安静地送到对方那里', '一段同行会这样开始'], evidence);

    await capture(ownerPage, 'requests', '/pages/peer/requests', ['收到的请求', '有人想听听你的后来', '我愿意聊聊'], evidence);
    await ownerPage.getByRole('button', { name: '我愿意聊聊', exact: true }).click();
    await ownerPage.waitForURL('**/pages/peer/consent?*', { timeout: 15_000 });
    await capture(ownerPage, 'consent', `/pages/peer/consent?matchId=${encodeURIComponent(match.id)}`, ['开始前，先确认边界', '同意并开始同行'], evidence);
    await ownerPage.getByRole('button', { name: '同意并开始同行', exact: true }).click();
    await ownerPage.waitForURL('**/pages/peer/conversation?*', { timeout: 15_000 });
    await requesterPage.goto(`${urls.front}/pages/peer/conversation?matchId=${encodeURIComponent(match.id)}`, { waitUntil: 'domcontentloaded' });
    await requesterPage.getByPlaceholder('写下你想说的话…').fill('我现在还是有点想联系 TA，但愿意先把这十分钟过完。');
    await requesterPage.getByRole('button', { name: '发送', exact: true }).click();
    await requesterPage.waitForTimeout(250);
    await ownerPage.reload({ waitUntil: 'domcontentloaded' });
    await ownerPage.getByPlaceholder('写下你想说的话…').fill('我当时先喝口水，再把消息留在草稿里，过几天再决定。');
    await ownerPage.getByRole('button', { name: '发送', exact: true }).click();
    await requesterPage.reload({ waitUntil: 'domcontentloaded' });
    await requesterPage.getByPlaceholder('写下你想说的话…').fill('谢谢你。我会先写下来，不急着把今晚变成一个答案。');
    await requesterPage.getByRole('button', { name: '发送', exact: true }).click();
    await ownerPage.reload({ waitUntil: 'domcontentloaded' });
    await capture(ownerPage, 'conversation', `/pages/peer/conversation?matchId=${encodeURIComponent(match.id)}`, ['匿名同路', '我现在还是有点想联系'], evidence);
    await ownerPage.getByRole('button', { name: '结束', exact: true }).click();
    await ownerPage.getByRole('dialog').getByRole('button', { name: '确认结束', exact: true }).click();
    await ownerPage.waitForURL('**/pages/peer/graduate?*', { timeout: 15_000 });
    await capture(ownerPage, 'graduation', `/pages/peer/graduate?matchId=${encodeURIComponent(match.id)}`, ['这段同行', '以后也想把后来留给同路人'], evidence);
    await ownerPage.getByRole('button', { name: '有被接住', exact: true }).click();
    await ownerPage.getByLabel('想留下的一句话（可选）').fill('这段同行让我把急着证明自己的心，慢慢放下来。');
    await ownerPage.getByRole('button', { name: '以后也想把后来留给同路人', exact: true }).click();
    await ownerPage.getByText('已经收好这份感受', { exact: false }).waitFor({ state: 'visible', timeout: 10_000 });

    const conversation = await prisma.peerConversation.findUnique({ where: { matchId: match.id }, include: { messages: true } });
    const notifications = await prisma.userNotification.findMany({ where: { userId: { in: [owner, requester] }, type: { in: ['PEER_REQUEST', 'PEER_ACCEPTED', 'CONVERSATION_CLOSED'] } } });
    const shared = await prisma.peerExperience.findFirst({ where: { userId: owner, status: 'pending_review', title: '这段同行之后，我慢慢走了一点出来' } });
    if (conversation?.status !== 'closed' || conversation.messages.length !== 3 || !conversation.consentAcceptedAt || !conversation.feedback || !shared || notifications.length < 3) {
      throw new Error('database evidence is incomplete after the peer browser loop');
    }
    await fs.writeFile(path.join(artifactDir, 'database-evidence.json'), JSON.stringify({ matchId: match.id, conversation: { id: conversation.id, status: conversation.status, startsAt: conversation.startsAt, expiresAt: conversation.expiresAt, consentAcceptedAt: conversation.consentAcceptedAt, feedback: conversation.feedback, messageCount: conversation.messages.length }, notificationTypes: notifications.map((item) => item.type), sharedExperienceId: shared.id }, null, 2));
    await fs.writeFile(path.join(artifactDir, 'audit.md'), [
      '# Peer Stage Reference Fidelity Capture', '',
      'This run uses an isolated PostgreSQL schema, two persisted anonymous users, and live browser requests. Reference files are comparison evidence only and are never rendered by the product.', '',
      '| State | Reference | Actual | Side by side | Difference | Overflow | Buttons |',
      '| --- | --- | --- | --- | --- | ---: | ---: |',
      ...evidence.map((item) => `| #${item.state} | ${path.basename(item.reference)} | ${path.basename(item.actual)} | ${path.basename(item.sideBySide)} | ${path.basename(item.difference)} | ${item.scrollWidth} | ${item.buttons} |`), '',
      `- Responsive evidence: ${responsiveViewports.map((size) => `${size.width}x${size.height}`).join(', ')} for every state.`,
      '- Assertions: exact reference dimensions at 420x786, no horizontal overflow, human-facing copy, no internal matching score/stage exposure, and a live two-user persisted loop.',
    ].join('\n'));
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    for (const proc of procs.reverse()) kill(proc);
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
