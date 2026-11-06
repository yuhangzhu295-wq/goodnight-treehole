/* global console */
// ANTI-AI UI CONTRACT — mechanical audit of the mini-program views.
// Counts the countable criteria (A/B/D/E/F/C/P) per page so the scope is measured,
// not guessed. Judgment criteria (G/H/I/J/N/Q) are collected for a separate pass.
import fs from 'node:fs';
import path from 'node:path';

const VIEWS = 'apps/mp/src/views';
const COMPONENTS = 'apps/mp/src/components';
const STYLES = 'apps/mp/src/styles';

// Components carry their own scoped styles and are shared by pages, so a violation
// inside one is invisible to a views-only scan. Collect both.
function listVue(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listVue(full));
    else if (entry.name.endsWith('.vue')) out.push(full);
  }
  return out;
}
const ALL_VUE = [...listVue(VIEWS), ...listVue(COMPONENTS)];
const ROOT_STYLE = 'apps/mp/src/styles.scss';

// pages the contract explicitly exempts from HERO_COUNT = 0
const HERO_EXEMPT = new Set(['TonightHome', 'SafetySupport', 'JourneyDetail']);

function analyze(file) {
  const src = fs.readFileSync(file, 'utf8');
  const template = src.split('<script')[0] || src;
  const styleMatch = src.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  const style = styleMatch ? styleMatch[1] : '';

  const count = (re, s) => (s.match(re) || []).length;

  // A. hero: a hero/cover block at the top of the page
  const heroCount =
    count(/class="[^"]*\bhero\b[^"]*"/g, template) +
    count(/class="[^"]*\bcover\b[^"]*"/g, template) +
    count(/class="[^"]*\bbanner\b[^"]*"/g, template);

  // B. decorative art: images/svg/emoji used as ornament
  const decorativeImages =
    count(/<img[^>]*class="[^"]*\b(deco|ornament|illustration|art|leaf|star|moon|glow|watercolor)\b/gi, template) +
    count(/class="[^"]*\b(deco|ornament|illustration|watercolor|glow|sparkle|leaf|star|moon)\b[^"]*"/gi, template) +
    count(/background-image\s*:\s*url\(/gi, style);

  // C. cards
  const cardClasses = count(/class="[^"]*\bcard\b[^"]*"/gi, template);
  const cardRule = count(/\.card\b[^{]*\{/g, style);

  // D. shadows
  const shadows = count(/box-shadow\s*:/gi, style);

  // E. gradients
  const gradients = count(/(linear-gradient|radial-gradient)/gi, style);

  // F. serif (honest regex: does not match sans-serif)
  const serif = count(/(font-family[^;]*?(?<!sans-)serif)|Georgia|"Songti|Songti|宋体|STSong|Noto Serif/gi, style + template);

  // I. density proxy: how many repeated list objects are rendered
  const listLoops = count(/v-for=/g, template);

  return { file: path.basename(file).replace('.vue', '') + (file.includes('components') ? ' [c]' : ''), heroCount, decorativeImages, cardClasses, cardRule, shadows, gradients, serif, listLoops };
}

const rows = ALL_VUE.sort().map(analyze);

// global styles in tokens.scss & goodnight-theme.scss
let themeStyle = '';
for (const f of fs.readdirSync(STYLES)) {
  if (f.endsWith('.scss') || f.endsWith('.css')) themeStyle += fs.readFileSync(path.join(STYLES, f), 'utf8');
}
const gTheme = (re) => (themeStyle.match(re) || []).length;

// all global styles including root styles.scss
let allGlobalStyle = themeStyle;
if (fs.existsSync(ROOT_STYLE)) {
  allGlobalStyle += '\n' + fs.readFileSync(ROOT_STYLE, 'utf8');
}
const gAll = (re) => (allGlobalStyle.match(re) || []).length;

console.log('='.repeat(96));
console.log('ANTI-AI UI CONTRACT — 机械审计（每页计数）');
console.log('='.repeat(96));
console.log(
  'page'.padEnd(24) +
  'A:hero'.padStart(7) + 'B:deco'.padStart(8) + 'C:card'.padStart(8) +
  'D:shdw'.padStart(7) + 'E:grad'.padStart(7) + 'F:serif'.padStart(8) + 'v-for'.padStart(7) + '  违规'
);
console.log('-'.repeat(96));

const violations = [];
for (const r of rows) {
  const v = [];
  if (!HERO_EXEMPT.has(r.file) && r.heroCount > 0) v.push('A');
  if (r.decorativeImages > 0) v.push('B');
  if (r.shadows > 0) v.push('D');
  if (r.gradients > 0) v.push('E');
  if (r.serif > 0) v.push('F');
  console.log(
    r.file.padEnd(24) +
    String(r.heroCount).padStart(7) + String(r.decorativeImages).padStart(8) + String(r.cardClasses).padStart(8) +
    String(r.shadows).padStart(7) + String(r.gradients).padStart(7) + String(r.serif).padStart(8) +
    String(r.listLoops).padStart(7) + '  ' + (v.join(',') || '-')
  );
  if (v.length) violations.push({ page: r.file, rules: v });
}

console.log('-'.repeat(96));
console.log(`\n全局主题样式 (${STYLES}):`);
console.log(`  box-shadow : ${gTheme(/box-shadow\s*:/gi)}`);
console.log(`  gradient   : ${gTheme(/(linear-gradient|radial-gradient)/gi)}`);
console.log(`  serif      : ${gTheme(/(?<!sans-)serif|Songti|宋体/gi)}`);
console.log(`  .card 规则 : ${gTheme(/\.card\b[^{]*\{/g)}`);
console.log(`  border-radius 用法: ${gTheme(/border-radius\s*:/gi)}`);

console.log(`\n全部全局样式 (${STYLES} + ${ROOT_STYLE}):`);
console.log(`  box-shadow (非 none) : ${gAll(/box-shadow\s*:\s*(?!none\b)(?!\s*none\b)[^;]+/gi)}`);
console.log(`  gradient             : ${gAll(/(linear-gradient|radial-gradient)/gi)}`);
console.log(`  serif                : ${gAll(/(?<!sans-)serif|Songti|宋体/gi)}`);
console.log(`  .card 规则           : ${gAll(/\.card\b[^{]*\{/g)}`);
console.log(`  border-radius 用法   : ${gAll(/border-radius\s*:/gi)}`);

console.log(`\n按条款汇总（页面数）：`);
const byRule = {};
for (const v of violations) for (const r of v.rules) byRule[r] = (byRule[r] || 0) + 1;
for (const [rule, n] of Object.entries(byRule).sort()) console.log(`  条款 ${rule}: ${n} 个页面`);
console.log(`  合计违规页面: ${violations.length} / ${rows.length}`);

// G. AI-tone copy: banned words
console.log('\n' + '='.repeat(96));
console.log('条款 G — AI 腔文案（禁用词命中）');
console.log('='.repeat(96));
const BANNED = ['陪你', '慢慢', '温柔', '小小', '接住', '不必证明', '此刻', '系统会帮你', '我理解'];
const hits = [];
for (const full of ALL_VUE) {
  const src = fs.readFileSync(full, 'utf8');
  const f = path.basename(full);
  const found = BANNED.filter((w) => src.includes(w));
  if (found.length) hits.push({ page: f.replace('.vue', ''), words: found });
}
for (const h of hits) console.log(`  ${h.page.padEnd(24)} ${h.words.join(' / ')}`);
console.log(`\n  命中页面: ${hits.length}`);
const allHits = {};
for (const h of hits) for (const w of h.words) allHits[w] = (allHits[w] || 0) + 1;
console.log('  各词命中次数: ' + Object.entries(allHits).sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w}×${n}`).join(', '));
