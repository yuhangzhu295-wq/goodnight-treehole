// Verify the V2 design images really belong to this app before they are used as a target.
// A design package that turns out to be another product would invalidate every comparison, so this
// checks each image's dimensions against the package's own README spec and reports anything else.
import { readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import path from 'node:path';

const DIR = 'C:/Users/zyu33/Downloads/V2 完整交付包/设计图';
const files = readdirSync(DIR).filter((f) => f.endsWith('.png')).sort();

/** PNG width/height straight from the IHDR chunk — no decoder dependency. */
function pngSize(file) {
  const bytes = statSync(file).size;
  const buf = Buffer.alloc(24);
  const handle = openSync(file, 'r');
  try {
    readSync(handle, buf, 0, 24, 0);
  } finally {
    closeSync(handle);
  }
  if (buf.toString('ascii', 1, 4) !== 'PNG') return { bytes };
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes };
}

const rows = files.map((f) => {
  const size = pngSize(path.join(DIR, f));
  return { file: f, ...size };
});
const offSpec = rows.filter((r) => !r.width || r.width !== 780 || r.height !== 1688);
console.log('design images:', rows.length);
console.log('matching the README spec (780x1688):', rows.filter((r) => r.width === 780 && r.height === 1688).length);
console.log('off-spec:', offSpec.map((r) => `${r.file} ${r.width}x${r.height}`).join(', ') || 'none');
const zero = rows.filter((r) => !r.bytes);
console.log('empty files:', zero.map((r) => r.file).join(', ') || 'none');
console.log('first/last:', rows[0].file, rows[rows.length - 1].file);
// The numbering must be a complete 01..39 run, or a page is missing its reference.
const nums = rows.map((r) => Number(r.file.slice(0, 2))).sort((a, b) => a - b);
const gaps = [];
for (let i = 1; i <= 39; i += 1) if (!nums.includes(i)) gaps.push(i);
console.log('numbering gaps (01..39):', gaps.join(', ') || 'none');
