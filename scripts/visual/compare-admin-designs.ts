import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { pickAdminPages } from './admin-pages.ts';

type PngImage = PNG & { width: number; height: number };
const viewports = [1366, 1440] as const;

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const next = process.argv[index + 1];
  return next === '--' ? process.argv[index + 2] : next;
}

function resizeNearest(src: PngImage, width: number, height: number): PNG {
  if (src.width === width && src.height === height) return src;
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const sx = Math.min(src.width - 1, Math.floor((x / width) * src.width));
    const sy = Math.min(src.height - 1, Math.floor((y / height) * src.height));
    const source = (sy * src.width + sx) * 4;
    const target = (y * width + x) * 4;
    out.data[target] = src.data[source]; out.data[target + 1] = src.data[source + 1]; out.data[target + 2] = src.data[source + 2]; out.data[target + 3] = src.data[source + 3];
  }
  return out;
}

async function main() {
  const pixelmatch = (await import('pixelmatch')).default;
  const pages = pickAdminPages(readArg('--page'));
  const screenshotDir = readArg('--screenshots') ?? 'artifacts/screenshots/admin';
  const outDir = readArg('--out-dir') ?? 'artifacts/diffs/admin';
  await fsp.mkdir(outDir, { recursive: true });
  const rows: Array<Record<string, unknown>> = [];
  for (const item of pages) for (const width of viewports) {
    const design = PNG.sync.read(fs.readFileSync(item.design)) as PngImage;
    const screenshotPath = path.join(screenshotDir, `${item.name}-${width}.png`);
    const shot = PNG.sync.read(fs.readFileSync(screenshotPath)) as PngImage;
    const normalized = resizeNearest(shot, design.width, design.height);
    const diff = new PNG({ width: design.width, height: design.height });
    const mismatches = pixelmatch(design.data, normalized.data, diff.data, design.width, design.height, { threshold: 0.12, includeAA: true });
    const diffRate = mismatches / (design.width * design.height);
    const diffPath = path.join(outDir, `${item.name}-${width}.diff.png`);
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
    rows.push({ id: item.id, page: item.name, viewportWidth: width, screenshot: screenshotPath, design: item.design, diff: diffPath, diffRate: Number(diffRate.toFixed(4)), diffPercent: `${(diffRate * 100).toFixed(2)}%` });
    console.log(`${item.name} ${width}px diff=${(diffRate * 100).toFixed(2)}%`);
  }
  await fsp.writeFile(path.join(outDir, 'visual-report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), pages: rows }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
