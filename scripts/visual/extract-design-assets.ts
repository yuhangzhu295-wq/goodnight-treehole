import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

type Crop = {
  source: string;
  file: string;
  x: number;
  y: number;
  width: number;
  height: number;
  transparentLight?: boolean;
};

const crops: Crop[] = [
  { source: '06-tool-index.png', file: 'tree-top.png', x: 470, y: 72, width: 470, height: 248 },
  { source: '01-square.png', file: 'avatar-baby.png', x: 58, y: 455, width: 134, height: 134 },
  { source: '01-square.png', file: 'square-baby.png', x: 665, y: 570, width: 225, height: 190 },
  { source: '02-mood-create.png', file: 'mood-baby-pencil.png', x: 590, y: 935, width: 260, height: 240 },
  { source: '03-post-detail.png', file: 'leaf-corner.png', x: 700, y: 360, width: 180, height: 170, transparentLight: true },
  { source: '05-letter-today.png', file: 'letter-envelope.png', x: 62, y: 255, width: 310, height: 212 },
  { source: '05-letter-today.png', file: 'letter-card-leaf-tl.png', x: 54, y: 628, width: 112, height: 190, transparentLight: true },
  { source: '05-letter-today.png', file: 'letter-card-leaf-tr.png', x: 722, y: 632, width: 170, height: 175, transparentLight: true },
  { source: '05-letter-today.png', file: 'letter-card-leaf-bl.png', x: 68, y: 1070, width: 92, height: 210, transparentLight: true },
  { source: '05-letter-today.png', file: 'letter-card-leaf-br.png', x: 646, y: 1032, width: 242, height: 240, transparentLight: true },
  { source: '05-letter-today.png', file: 'letter-paper-corner.png', x: 66, y: 620, width: 170, height: 180, transparentLight: true },
  { source: '05-letter-today.png', file: 'letter-baby.png', x: 650, y: 218, width: 170, height: 145 },
  { source: '06-tool-index.png', file: 'tool-baby-letter.png', x: 600, y: 370, width: 260, height: 280 },
  { source: '06-tool-index.png', file: 'tool-footer-ribbon.png', x: 40, y: 1462, width: 860, height: 96 },
  { source: '06-tool-index.png', file: 'tool-icon-decompose.png', x: 70, y: 700, width: 145, height: 145 },
  { source: '06-tool-index.png', file: 'tool-icon-rewrite.png', x: 495, y: 700, width: 145, height: 145 },
  { source: '06-tool-index.png', file: 'tool-icon-rant.png', x: 70, y: 905, width: 145, height: 145 },
  { source: '06-tool-index.png', file: 'tool-icon-heal.png', x: 495, y: 905, width: 145, height: 145 },
  { source: '06-tool-index.png', file: 'tool-icon-sleep.png', x: 70, y: 1110, width: 145, height: 145 },
  { source: '06-tool-index.png', file: 'tool-icon-work.png', x: 495, y: 1110, width: 145, height: 145 },
  { source: '06-tool-index.png', file: 'tool-icon-future.png', x: 70, y: 1315, width: 145, height: 145 },
  { source: '06-tool-index.png', file: 'tool-icon-report.png', x: 495, y: 1315, width: 145, height: 145 },
  { source: '07-tool-decompose.png', file: 'decompose-baby.png', x: 90, y: 885, width: 220, height: 220 },
  { source: '08-me.png', file: 'profile-baby.png', x: 78, y: 380, width: 172, height: 172 },
  { source: '08-me.png', file: 'growth-leaves.png', x: 730, y: 842, width: 165, height: 98, transparentLight: true },
  { source: '10-report-month.png', file: 'report-chart-card.png', x: 65, y: 475, width: 808, height: 335 },
  { source: '14-feedback-help.png', file: 'feedback-footer-leaves.png', x: 52, y: 1395, width: 835, height: 170 },
];

function cropImage(crop: Crop, outDir: string): void {
  const input = PNG.sync.read(fs.readFileSync(path.join('design_refs/front', crop.source)));
  const safeWidth = Math.min(crop.width, input.width - crop.x);
  const safeHeight = Math.min(crop.height, input.height - crop.y);
  const output = new PNG({ width: safeWidth, height: safeHeight });
  PNG.bitblt(input, output, crop.x, crop.y, safeWidth, safeHeight, 0, 0);
  if (crop.transparentLight) {
    for (let y = 0; y < output.height; y += 1) {
      for (let x = 0; x < output.width; x += 1) {
        const idx = (output.width * y + x) << 2;
        const red = output.data[idx];
        const green = output.data[idx + 1];
        const blue = output.data[idx + 2];
        const average = (red + green + blue) / 3;
        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
        if (average > 232 && chroma < 34) output.data[idx + 3] = 0;
      }
    }
  }
  fs.writeFileSync(path.join(outDir, crop.file), PNG.sync.write(output));
}

async function main(): Promise<void> {
  const outDir = path.resolve('apps/mp/src/assets/goodnight');
  await fsp.mkdir(outDir, { recursive: true });
  for (const crop of crops) {
    cropImage(crop, outDir);
    console.log(`${crop.source} -> ${path.join(outDir, crop.file)}`);
  }
  await fsp.writeFile(
    path.join(outDir, 'asset-manifest.json'),
    JSON.stringify(
      crops.map((crop) => ({ ...crop, generatedFrom: path.join('design_refs/front', crop.source) })),
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
