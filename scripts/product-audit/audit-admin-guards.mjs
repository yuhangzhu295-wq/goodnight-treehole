import fs from 'node:fs';
const src = fs.readFileSync('apps/api/src/controllers.ts', 'utf8');

const start = src.indexOf("@Controller('api/admin/v1')");
const body = src.slice(start);
const baseLine = src.slice(0, start).split('\n').length;

// Split the AdminController class into method blocks at each decorator.
const methodRe = /@(Get|Post|Patch|Put|Delete)\(([^)]*)\)/g;
const marks = [];
let m;
while ((m = methodRe.exec(body))) marks.push({ method: m[1].toUpperCase(), route: (m[2].match(/'([^']*)'/) || [])[1] ?? '', index: m.index });

const rows = [];
for (let i = 0; i < marks.length; i++) {
  const from = marks[i].index;
  const to = marks[i + 1]?.index ?? body.length;
  const block = body.slice(from, to);
  const line = baseLine + body.slice(0, from).split('\n').length - 1;
  const guarded = /this\.admin\(/.test(block) || /@Headers\('authorization'\)[\s\S]{0,400}this\.admin\(/.test(block);
  const delegates = /return\s+(?:await\s+)?this\.(\w+)\(/.test(block);
  const isPublicAuth = /auth\/login|^'login'|auth\/logout|auth\/me|^'me'/.test(marks[i].route);
  rows.push({ method: marks[i].method, route: marks[i].route, line, guarded, delegates, isPublicAuth, writes: ['POST','PATCH','PUT','DELETE'].includes(marks[i].method) });
}

const unguarded = rows.filter((r) => !r.guarded && !r.isPublicAuth);
console.log(`total admin handlers: ${rows.length}`);
console.log(`public (login/me/logout): ${rows.filter((r) => r.isPublicAuth).length}`);
console.log(`unguarded: ${unguarded.length}`);
console.log('');
console.log('| Method | Route | Line | Delegates | Write |');
console.log('| --- | --- | ---: | --- | --- |');
for (const r of unguarded) console.log(`| ${r.method} | ${r.route} | ${r.line} | ${r.delegates ? 'yes' : 'no'} | ${r.writes ? 'WRITE' : ''} |`);

fs.writeFileSync('artifacts/product-audit/admin-unguarded.json', JSON.stringify({ generatedAt: new Date().toISOString(), total: rows.length, unguarded }, null, 2) + '\n');
