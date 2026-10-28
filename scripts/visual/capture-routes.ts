import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

// `scripts/visual/capture-front-pages.ts` only covers a fixed list of 14 pages, which is
// not enough to review the rest of the app. This helper takes route=name pairs so any
// page can be rendered and looked at:
//
//   pnpm exec tsx scripts/visual/capture-routes.ts /pages/action/index=action-center
//
// It prints `name hscroll=<bool>` per page so a horizontal-overflow regression shows up
// in the same pass.
const args = process.argv.slice(2);
let outDir = 'artifacts/screenshots/verify';
const pairs: string[] = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') {
    outDir = args[i + 1];
    i += 1;
    continue;
  }
  pairs.push(args[i]);
}
if (!pairs.length) {
  console.error('usage: capture-routes.ts [--out DIR] <route=name> ...');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const base = process.env.MP_BASE_URL ?? 'http://127.0.0.1:5173';
async function main() {
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();

for (const pair of pairs) {
  const [route, name] = pair.split('=');
  await page.goto(base + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const hscroll = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`${name} hscroll=${hscroll} -> ${file}`);
}

await browser.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
