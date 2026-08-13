import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { pickPages } from './front-pages.ts';

type PngImage = PNG & { width: number; height: number };

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const next = process.argv[index + 1];
  return next === '--' ? process.argv[index + 2] : next;
}

function resizeNearest(src: PngImage, width: number, height: number): PNG {
  if (src.width === width && src.height === height) return src;
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(src.width - 1, Math.floor((x / width) * src.width));
      const sy = Math.min(src.height - 1, Math.floor((y / height) * src.height));
      const source = (sy * src.width + sx) * 4;
      const target = (y * width + x) * 4;
      out.data[target] = src.data[source];
      out.data[target + 1] = src.data[source + 1];
      out.data[target + 2] = src.data[source + 2];
      out.data[target + 3] = src.data[source + 3];
    }
  }
  return out;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

async function main(): Promise<void> {
  const pixelmatch = (await import('pixelmatch')).default;
  const phase = readArg('--phase') ?? 'after';
  const pageId = readArg('--page');
  const pages = pickPages(pageId);
  const screenshotDir = readArg('--screenshots') ?? `artifacts/screenshots/claude-${phase}`;
  const outDir = readArg('--out-dir') ?? (phase === 'after' ? 'artifacts/diffs/claude-front' : `artifacts/diffs/claude-front/${phase}`);
  await fsp.mkdir(outDir, { recursive: true });

  const rows: Array<Record<string, unknown>> = [];
  for (const item of pages) {
    const design = PNG.sync.read(fs.readFileSync(item.design)) as PngImage;
    const screenshotPath = path.join(screenshotDir, `${item.name}.png`);
    const shot = PNG.sync.read(fs.readFileSync(screenshotPath)) as PngImage;
    const normalized = resizeNearest(shot, design.width, design.height);
    const diff = new PNG({ width: design.width, height: design.height });
    const mismatches = pixelmatch(design.data, normalized.data, diff.data, design.width, design.height, {
      threshold: 0.12,
      includeAA: true,
    });
    const diffRate = mismatches / (design.width * design.height);
    const diffPath = path.join(outDir, `${item.name}.diff.png`);
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
    rows.push({
      id: item.id,
      page: item.name,
      route: item.route,
      design: item.design,
      screenshot: screenshotPath,
      diff: diffPath,
      diffRate: Number(diffRate.toFixed(4)),
      diffPercent: pct(diffRate),
      screenshotSize: `${shot.width}x${shot.height}`,
      designSize: `${design.width}x${design.height}`,
    });
    console.log(`${item.name} diffRate=${diffRate.toFixed(4)} (${pct(diffRate)})`);
  }

  const report = { phase, generatedAt: new Date().toISOString(), pages: rows };
  await fsp.writeFile(path.join(outDir, 'visual-report.json'), JSON.stringify(report, null, 2));

  if (!pageId) {
    const checklist = [
      '# 晚安树洞前台 01-14 视觉回归检查表',
      '',
      `生成时间：${report.generatedAt}`,
      '',
      '| 页面 | 截图 | 设计图 | diff | diffRate | 检查结论 |',
      '| --- | --- | --- | --- | ---: | --- |',
      ...rows.map((row) => {
        const diffRate = Number(row.diffRate);
        const result = diffRate <= 0.09 ? '通过，细节可继续微调' : diffRate <= 0.16 ? '可接受但仍需局部微调' : '需继续修复';
        return `| ${row.page} | \`${row.screenshot}\` | \`${row.design}\` | \`${row.diff}\` | ${row.diffPercent} | ${result} |`;
      }),
      '',
      '说明：本检查表只统计视觉像素差异；真实按钮、路由和 API 交互以 `qa:first5`、`qa:front-rest`、`diagnose:first5`、`diagnose:front-rest` 为准。',
    ].join('\n');
    await fsp.writeFile('docs/claude-page-by-page-visual-checklist.md', checklist);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
