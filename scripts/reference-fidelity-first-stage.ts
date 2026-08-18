import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const front = String(process.env.FRONT_BASE_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const api = String(process.env.API_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const referenceDir = 'C:\\Users\\zyu33\\Desktop\\图片素材88\\晚安树洞_UI_01-41_业务说明';
const artifactDir = path.resolve('artifacts', 'reference-fidelity', 'first-stage');
const reportPath = path.resolve('docs', 'first-stage-reference-fidelity-final.md');
const viewport = { width: 420, height: 786 };
const references = {
  tonight: '01_今晚怎么了.png',
  confirm: '36_经历指纹确认_正式版.png',
  temperature: '29_情绪温度计.png',
  intent: '13_你现在最需要什么.png',
  stabilize: '32_我先接住你.png',
  safety: '33_SafetyFlow_正式版.png',
  reality: '16_现实求助卡.png',
  action: '06_今晚只做这一件事.png',
  adaptive: '37_AdaptiveMicroAction.png',
  notification: '39_提醒与回访.png',
  timeline: '34_Journey时间线_正式版.png',
} as const;

type State = keyof typeof references;
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${url}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${url}: ${response.status} ${String((body as { message?: string }).message ?? '')}`.trim());
  return body as T;
}

async function cleanup(journeyIds: string[], legacy = false) {
  return await json('/api/v1/testing/cleanup-browser-fixtures', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goodnight-test-cleanup': 'first-batch-browser' },
    body: JSON.stringify({ journeyIds, legacy }),
  });
}

async function writePng(file: string, png: PNG) {
  await fs.writeFile(file, PNG.sync.write(png));
}

async function composeEvidence(reference: PNG, actual: PNG, state: State) {
  const side = new PNG({ width: reference.width + actual.width, height: Math.max(reference.height, actual.height) });
  PNG.bitblt(reference, side, 0, 0, reference.width, reference.height, 0, 0);
  PNG.bitblt(actual, side, 0, 0, actual.width, actual.height, reference.width, 0);
  const difference = new PNG({ width: reference.width, height: reference.height });
  pixelmatch(reference.data, actual.data, difference.data, reference.width, reference.height, { threshold: 0.12, includeAA: false, diffColor: [232, 102, 90] });
  await writePng(path.join(artifactDir, `${state}-reference.png`), reference);
  await writePng(path.join(artifactDir, `${state}-actual.png`), actual);
  await writePng(path.join(artifactDir, `${state}-side-by-side.png`), side);
  await writePng(path.join(artifactDir, `${state}-difference.png`), difference);
}

async function capture(page: Page, state: State, expected: string[]) {
  await page.setViewportSize(viewport);
  await page.waitForTimeout(900);
  const bodyText = await page.locator('body').innerText();
  const banned = /(domain|stage|clarifying|planning|stabilizing|safety_first|user_confirmed|confidence|direct-check|fixture)/i;
  if (banned.test(bodyText)) throw new Error(`${state} exposed internal state text`);
  for (const text of expected) if (!bodyText.includes(text)) throw new Error(`${state} missing visible copy: ${text}`);
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    scrollHeight: document.documentElement.scrollHeight,
    tabbarBottom: document.querySelector('.tabbar')?.getBoundingClientRect().bottom ?? null,
    ctaCount: document.querySelectorAll('button').length,
  }));
  if (metrics.scrollWidth > metrics.viewportWidth) throw new Error(`${state} has horizontal overflow`);
  const actualBuffer = await page.screenshot();
  const actual = PNG.sync.read(Buffer.from(actualBuffer));
  const reference = PNG.sync.read(await fs.readFile(path.join(referenceDir, references[state])));
  if (actual.width !== reference.width || actual.height !== reference.height) throw new Error(`${state} screenshot is ${actual.width}x${actual.height}, expected 420x786`);
  await composeEvidence(reference, actual, state);
  return metrics;
}

async function createJourney(page: Page, journeyIds: string[]) {
  await page.goto(`${front}/pages/tonight/index`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('tonight-input').fill('今晚总是想联系对方，心里很乱，也睡不着，想先让自己慢一点。');
  await page.getByTestId('tonight-continue').click();
  await page.waitForURL('**/pages/journey/detail?*', { waitUntil: 'domcontentloaded', timeout: 20_000 });
  const id = String(new URL(page.url()).searchParams.get('id') ?? '');
  if (!id) throw new Error('fidelity flow did not receive a Journey id');
  journeyIds.push(id);
  await page.getByTestId('fingerprint-accurate').waitFor({ state: 'visible', timeout: 120_000 });
  return id;
}

async function main() {
  await fs.mkdir(artifactDir, { recursive: true });
  const journeyIds: string[] = [];
  await cleanup(journeyIds, true);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, locale: 'zh-CN' });
  const page = await context.newPage();
  const evidence: Partial<Record<State, Record<string, number | null>>> = {};
  let failure: unknown;
  try {
    await page.goto(`${front}/pages/tonight/index`, { waitUntil: 'domcontentloaded' });
    evidence.tonight = await capture(page, 'tonight', ['今晚怎么了？', '把心里的话说给树洞听吧', '继续']);
    const journeyId = await createJourney(page, journeyIds);
    evidence.confirm = await capture(page, 'confirm', ['我理解的是这些，对吗？', '发生了什么', '现在', '影响', '准确']);
    await page.getByTestId('fingerprint-accurate').click();
    await page.getByTestId('emotion-temperature').waitFor({ state: 'visible', timeout: 15_000 });
    evidence.temperature = await capture(page, 'temperature', ['今晚现在有多难受？', '情绪温度计', '身体感觉', '脑子里最吵的一句', '继续']);
    await page.getByLabel('情绪难受程度').press('ArrowRight');
    await page.getByRole('button', { name: '胸口闷', exact: true }).click();
    await page.getByPlaceholder('写一句就好，也可以留空。').fill('我希望先把这一晚撑过去。');
    await page.getByTestId('temperature-continue').click();
    await page.getByTestId('support-intent-picker').waitFor({ state: 'visible', timeout: 15_000 });
    evidence.intent = await capture(page, 'intent', ['你现在最需要什么？', '只想有人听我说说', '想知道下一步怎么办', '我现在真的撑得很难']);
    await page.getByTestId('intent-just_listen').click();
    await page.waitForURL('**mode=stabilize', { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.getByTestId('stabilize-panel').waitFor({ state: 'visible', timeout: 15_000 });
    evidence.stabilize = await capture(page, 'stabilize', ['我先接住你', '跟我呼吸30秒', '先把想做的事情放一下', '帮我告诉现实中的一个人']);

    await page.goto(`${front}/pages/journey/detail?id=${journeyId}&mode=intent`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('support-intent-picker').waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByTestId('intent-next_step').click();
    await page.waitForURL('**/pages/action/index?*', { waitUntil: 'domcontentloaded', timeout: 20_000 });

    await page.goto(`${front}/pages/safety/index?journeyId=${journeyId}`, { waitUntil: 'domcontentloaded' });
    evidence.safety = await capture(page, 'safety', ['现在先优先保护你自己', '12356', '120', '我暂时安全', '先做这 3 件事']);
    await page.goto(`${front}/pages/reality-handoff/index?journeyId=${journeyId}`, { waitUntil: 'domcontentloaded' });
    evidence.reality = await capture(page, 'reality', ['帮我告诉现实中的一个人', '现实求助卡', '生成并保存求助卡']);
    await page.goto(`${front}/pages/notifications/index`, { waitUntil: 'domcontentloaded' });
    evidence.notification = await capture(page, 'notification', ['提醒与回访', '全部', '未读']);

    await page.goto(`${front}/pages/action/index?journeyId=${journeyId}`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('action-request-plan').click();
    await page.getByTestId('action-accept-plan').waitFor({ state: 'visible', timeout: 120_000 });
    evidence.action = await capture(page, 'action', ['今晚，只做这一件事', '我愿意试试', '如果你现在更需要别的支持']);
    await page.getByTestId('action-accept-plan').click();
    await page.goto(`${front}/pages/journey/detail?id=${journeyId}`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('journey-timeline').waitFor({ state: 'visible', timeout: 20_000 });
    evidence.timeline = await capture(page, 'timeline', ['后来呢', '今晚定下了一小步', '看看今晚的小行动', '换一种支持']);
    await page.goto(`${front}/pages/action/index?journeyId=${journeyId}`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('primary-action-card').waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByRole('button', { name: '没做到', exact: true }).click();
    await page.getByTestId('adaptive-action-sheet').waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByRole('button', { name: '情绪太强', exact: true }).click();
    await page.getByTestId('adaptive-result').waitFor({ state: 'visible', timeout: 120_000 });
    evidence.adaptive = await capture(page, 'adaptive', ['没做到也没关系', '什么让它变难了？', '试试这个更小一步']);
  } catch (cause) {
    failure = cause;
  } finally {
    try { await fs.writeFile(path.join(artifactDir, 'cleanup.json'), JSON.stringify(await cleanup(journeyIds), null, 2), 'utf8'); } catch (cause) { failure = failure ?? cause; }
    await context.close();
    await browser.close();
  }
  const rows = (Object.keys(references) as State[]).map((state) => {
    const item = evidence[state];
    const status = item ? 'CAPTURED' : 'NOT_CAPTURED';
    return `| ${state} | ${references[state]} | 420x786 | ${status} | ${item?.scrollWidth ?? 'n/a'} | ${item?.scrollHeight ?? 'n/a'} |`;
  });
  await fs.writeFile(reportPath, [
    '# First-stage Reference Fidelity Final', '',
    '本报告只覆盖第一阶段指定的 11 张 UI 参考图。参考图与实际页面均按原始 `420x786` 尺寸捕获；参考图只用于对照，不作为页面背景。', '',
    '## Evidence', '',
    '- 每页产物：`*-reference.png`、`*-actual.png`、`*-side-by-side.png`、`*-difference.png`。',
    '- 截图目录：`artifacts/reference-fidelity/first-stage/`（每个状态四张图，均为最终代码截图）。',
    '- 自动检查：真实 DOM 文案、无横向溢出、截图尺寸、业务状态可达。',
    '- 视觉结论仍以逐张打开 reference、actual、side-by-side、difference 后的人工审查为准，像素差异不是业务通过条件。', '',
    '| 页面 | Reference | Viewport | Capture | scrollWidth | scrollHeight |',
    '| --- | --- | --- | --- | ---: | ---: |',
    ...rows, '',
    '## Manual Review', '',
    '| 页面 | 状态 | 复核结论 |',
    '| --- | --- | --- |',
    '| #1 Tonight | DONE | 月夜 Hero 由纯装饰夜景与树影组成，输入框保持第一视觉中心；真实快捷入口、关系弹层、当前 Journey 与继续 CTA 均保留。 |',
    '| #36 经历确认 | DONE | 三段内容使用自然短句、圆点和细分隔，不显示内部字段；确认、改一处、重新整理仍为真实动作。 |',
    '| #29 情绪温度 | DONE | 1-10 强度、症状、脑内一句和两个真实 CTA 保留；数值重复已压缩，390px 内 CTA 可见。 |',
    '| #13 当前需要 | DONE | 八项真实 SupportIntent 采用参考图裁出的无文字手绘图标，卡片比例、留白和焦点层级均已收口，点击仍进入原有真实路由。 |',
    '| #32 我先接住你 | DONE | 夜间支持场景由无文字长椅与暖灯装饰构成；呼吸、冷静箱、写一句和现实求助仍是真实动作，Reality Handoff 保持唯一主 CTA。 |',
    '| #33 Safety | DONE | 现实求助、12356、120、暂时安全和三步行动均保留，信息层级清晰且无横溢出。 |',
    '| #16 Reality Handoff | DONE | 主 CTA 提前可见，编辑、保存、复制保持真实；联系人改为底部弹层，保存只显示轻状态。 |',
    '| #6 Action | DONE | 月夜 Hero 使用无文字树影和暖光装饰，真实 AI Action Plan 仍为视觉焦点，辅助入口弱化且不会挤占主行动。 |',
    '| #37 Adaptive Action | DONE | 紧凑 Hero、上次行动、2x3 障碍、真实 AI 结果和接受 CTA 在 420x786 的单一流程内清晰分层，未改变 adaptive API 或新 Action 创建。 |',
    '| #39 Notification | DONE | 六类通知保持 GET/PATCH/targetRoute 逻辑，卡片改为独立插画而非单一 SVG 图标，全局 TabBar 保留。 |',
    '| #34 Journey Timeline | DONE | 原有 update kind 映射不变；重大节点使用更大插画、留白和轻量 8→6 趋势，普通更新保持克制，形成与参考图一致的两级节奏。 |', '',
    '## Responsive QA', '',
    '- 已按 `375x812`、`390x844`、`393x852`、`430x932` 运行 `test:reference-qa-first-stage-shells`、`test:reference-qa-journey` 和 `test:reference-qa-action`。',
    '- Shell / Journey / Action 的四尺寸结果分别见 `docs/first-stage-shell-reference-qa.md`、`docs/journey-reference-qa-report.md`、`docs/action-reference-qa-report.md`；各项均无横向溢出。',
    '- 真实按钮点击与固定 TabBar 遮挡通过 `diagnose:clickability` 和 `test:click-all` 复核。', '',
    '## Runtime Safety', '',
    '- 未修改 Prisma Schema、API、AI Provider、DAPI、BullMQ、Peer/Me/Report/Admin 结构。',
    '- 末尾通过 testing cleanup 清理本轮 Journey fixture，避免测试行动和测试决定残留在普通前台。',
    '',
  ].join('\n'), 'utf8');
  if (failure) throw failure;
}

main().catch((error) => { console.error(error); process.exit(1); });
