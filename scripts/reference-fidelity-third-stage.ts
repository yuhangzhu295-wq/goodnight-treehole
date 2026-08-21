import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const referenceRoot = 'C:\\Users\\zyu33\\Desktop\\图片素材88\\晚安树洞_UI_01-41_业务说明';
const artifactRoot = path.resolve('artifacts', 'reference-fidelity', 'third-stage');
const frontUrl = process.env.FRONT_URL ?? 'http://127.0.0.1:5173';
const primaryViewport = { width: 420, height: 786 };
const responsiveViewports = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
] as const;

const pages = {
  me: { reference: '38_我的旅程_正式版.png', route: '/pages/me/index', tabbar: true },
  recovery: { reference: '09_生活回来一点了吗.png', route: '/pages/recovery/index', tabbar: true },
  'support-plan': { reference: '41_低谷预案_正式版.png', route: '/pages/support-plan/index', tabbar: true },
  'stable-self': { reference: '27_清醒时候的我.png', route: '/pages/stable-self/index', tabbar: false },
  memory: { reference: '15_AI记得什么.png', route: '/pages/memory/index', tabbar: false },
  decision: { reference: '12_决定保险箱.png', route: '/pages/decision/index', tabbar: false },
  'future-self': { reference: '35_写给未来的我_正式版.png', route: '/pages/future-self/index', tabbar: true },
  privacy: { reference: '07_隐私设置.png', route: '/pages/settings/privacy', tabbar: true },
  report: { reference: '08_这个月你是怎么走过来的.png', route: '/pages/report/month', tabbar: true },
  archive: { reference: '30_日记与回信_正式版.png', route: '/pages/archive/index', tabbar: true },
} as const;

type PageName = keyof typeof pages;

async function writePng(file: string, png: PNG) {
  await fs.writeFile(file, PNG.sync.write(png));
}

async function capture(name: PageName) {
  const config = pages[name];
  const destination = path.join(artifactRoot, name);
  const responsive = path.join(destination, 'responsive');
  await fs.mkdir(responsive, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: primaryViewport });
  try {
    await page.goto(`${frontUrl}${config.route}`, { waitUntil: 'networkidle' });
    await page.locator('.phone-shell').waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForTimeout(250);
    const metrics = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      tabbarVisible: Boolean(document.querySelector('.tabbar')),
      buttons: document.querySelectorAll('button').length,
    }));
    if (metrics.scrollWidth > metrics.viewportWidth) throw new Error(`${name} has horizontal overflow`);
    if (metrics.tabbarVisible !== config.tabbar) throw new Error(`${name} tabbar visibility does not match its reference`);

    const actual = PNG.sync.read(await page.screenshot());
    const reference = PNG.sync.read(await fs.readFile(path.join(referenceRoot, config.reference)));
    if (reference.width !== primaryViewport.width || reference.height !== primaryViewport.height) {
      throw new Error(`${name} reference must be 420x786, received ${reference.width}x${reference.height}`);
    }
    const difference = new PNG({ width: reference.width, height: reference.height });
    const mismatched = pixelmatch(reference.data, actual.data, difference.data, reference.width, reference.height, {
      threshold: 0.12,
      includeAA: false,
      diffColor: [232, 102, 90],
    });
    const side = new PNG({ width: reference.width + actual.width, height: reference.height });
    PNG.bitblt(reference, side, 0, 0, reference.width, reference.height, 0, 0);
    PNG.bitblt(actual, side, 0, 0, actual.width, actual.height, reference.width, 0);
    await writePng(path.join(destination, `${name}-reference.png`), reference);
    await writePng(path.join(destination, `${name}-actual.png`), actual);
    await writePng(path.join(destination, `${name}-side-by-side.png`), side);
    await writePng(path.join(destination, `${name}-difference.png`), difference);

    for (const viewport of responsiveViewports) {
      await page.setViewportSize(viewport);
      await page.goto(`${frontUrl}${config.route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(180);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (overflow) throw new Error(`${name} has horizontal overflow at ${viewport.width}x${viewport.height}`);
      await page.screenshot({ path: path.join(responsive, `${name}-${viewport.width}x${viewport.height}.png`) });
    }
    return { name, route: config.route, differenceRate: mismatched / (reference.width * reference.height), ...metrics };
  } finally {
    await browser.close();
  }
}

async function main() {
  const requested = process.argv.includes('--page') ? process.argv[process.argv.indexOf('--page') + 1] : undefined;
  const selected = requested ? [requested as PageName] : (Object.keys(pages) as PageName[]);
  for (const name of selected) {
    if (!(name in pages)) throw new Error(`Unknown third-stage page: ${name}`);
  }
  const evidence = [];
  for (const name of selected) evidence.push(await capture(name));
  await fs.mkdir(artifactRoot, { recursive: true });
  await fs.writeFile(path.join(artifactRoot, 'latest.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
}

void main();
