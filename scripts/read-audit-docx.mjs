// Extract the audit DOCX's text and table so the per-page checklist can be read rather than guessed.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const DOCX = 'C:/Users/zyu33/Downloads/审计';
const WORK = 'C:/Users/zyu33/Projects/goodnight-treehole/artifacts/v2-source/audit-docx';

mkdirSync(WORK, { recursive: true });
// Unzip into the work dir. `unzip -o` keeps re-runs idempotent.
execFileSync('unzip', ['-o', '-q', DOCX, '-d', WORK], { stdio: 'ignore' });
const xml = readFileSync(path.join(WORK, 'word/document.xml'), 'utf8');
const text = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// Paragraphs in document order.
const paras = [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)].map((m) => text(m[1]).trim()).filter(Boolean);
console.log('paragraphs:', paras.length);
for (const p of paras.slice(0, 40)) console.log('P|', p.slice(0, 200));

const tables = [...xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)];
console.log('tables:', tables.length);
tables.forEach((t, ti) => {
  const rows = [...t[1].matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)];
  console.log(`table ${ti}: ${rows.length} rows`);
  writeFileSync(path.join(WORK, `table-${ti}.txt`), rows.map((r, ri) => {
    const cells = [...r[1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((c) => text(c[1]).replace(/\s+/g, ' ').trim());
    return `[${ri}] ` + cells.join(' | ');
  }).join('\n'), 'utf8');
});
const media = readFileSync(path.join(WORK, 'word/_rels/document.xml.rels'), 'utf8');
const imgs = [...media.matchAll(/Id="(rId\d+)"[^>]*Target="media\/([^"]+\.png)"/g)].map((m) => `${m[1]} => ${m[2]}`);
console.log('embedded images:', imgs.length);
writeFileSync(path.join(WORK, 'paragraphs.txt'), paras.join('\n'), 'utf8');
writeFileSync(path.join(WORK, 'image-map.txt'), imgs.join('\n'), 'utf8');
