// Turn the audit DOCX's prose into a machine-checkable per-page record, so the queue and the index
// are derived from the report instead of being transcribed by hand.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const SRC = 'artifacts/v2-source/audit-docx/paragraphs.txt';
const OUT_DIR = 'artifacts/v2-source';
const lines = readFileSync(SRC, 'utf8').split('\n').map((l) => l.replace(/^P\| /, '').trim());

/** Strips the audit's own label prefix, keeping the sentence. */
const body = (line) => line.replace(/^[^\s]+\s{2,}/, '').trim();

const pages = [];
let current = null;
for (const line of lines) {
  const head = line.match(/^(\d{2}) \/ 52\s+·\s+([a-z0-9-]+)\s+·\s+(P[12])$/);
  if (head) {
    current = { index: Number(head[1]), slug: head[2], priority: head[3], route: '', design: '', relation: '', observation: '', fix: '', verify: '' };
    pages.push(current);
    continue;
  }
  if (!current) continue;
  if (line.startsWith('当前路由：')) current.route = body(line).replace(/^当前路由：/, '');
  else if (line.startsWith('比对参考：')) {
    const m = line.match(/设计图\/(\S+\.png)\s+·\s+(.+)$/);
    current.design = m ? m[1] : '';
    current.relation = m ? m[2].trim() : '';
  } else if (line.startsWith('现状与差异')) current.observation = body(line);
  else if (line.startsWith('建议修改')) current.fix = body(line);
  else if (line.startsWith('动态验收')) current.verify = body(line);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(path.join(OUT_DIR, 'audit-pages.json'), JSON.stringify(pages, null, 1) + '\n', 'utf8');

const p1 = pages.filter((p) => p.priority === 'P1');
const noDesign = pages.filter((p) => !p.design);
const aliases = pages.filter((p) => /别名/.test(p.relation));
const conflicts = pages.filter((p) => /冲突|不同业务状态|状态不可比|流程状态不可比|重大状态疑点/.test(p.relation));
console.log('pages:', pages.length, 'P1:', p1.length, 'P2:', pages.length - p1.length);
console.log('without own design image:', noDesign.length, noDesign.map((p) => p.slug).join(', '));
console.log('legal aliases:', aliases.length, aliases.map((p) => `${p.slug}->${p.design}`).join(', '));
console.log('state/architecture conflicts:', conflicts.length, conflicts.map((p) => `${p.slug}(${p.relation})`).join(', '));
const missingVerify = pages.filter((p) => !p.verify);
console.log('pages with no 动态验收 line:', missingVerify.map((p) => p.slug).join(', ') || 'none');
