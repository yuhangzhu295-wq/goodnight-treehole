import fs from 'node:fs';
import path from 'node:path';

const roots = ['apps/mp/src', 'apps/admin/src'];
const forbidden = [
  'Rewrite',
  'Rant',
  'Heal',
  'Sleep',
  'Work',
  'Future',
  'Poster',
  'Save',
  'Clear data',
  'Live backend sync ok',
  'backend sync',
  'test hotspot',
  'debug',
  'click proxy',
  'fake click',
  'overlay label',
];

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    if (!/\.(vue|ts|tsx|js|scss|css|html)$/.test(entry.name)) return [];
    return [full];
  });
}

const failures: Array<{ file: string; term: string; line: number }> = [];

for (const root of roots) {
  for (const file of listFiles(root)) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const term of forbidden) {
      lines.forEach((line, index) => {
        if (line.includes(term)) failures.push({ file, term, line: index + 1 });
      });
    }
  }
}

fs.mkdirSync('artifacts/diagnosis', { recursive: true });
const report = [
  '# UI Artifact Audit',
  '',
  `Generated: ${new Date().toISOString()}`,
  `Forbidden terms: ${forbidden.join(', ')}`,
  `Failures: ${failures.length}`,
  '',
  '| Result | File | Line | Term |',
  '| --- | --- | --- | --- |',
  ...(failures.length
    ? failures.map((failure) => `| FAIL | ${failure.file} | ${failure.line} | ${failure.term} |`)
    : ['| PASS | - | - | no visible test artifact terms found in app source |']),
  '',
].join('\n');
fs.writeFileSync('artifacts/diagnosis/ui-artifact-audit.md', report);

if (failures.length) {
  console.error('Visible test artifact audit failed:');
  for (const failure of failures) {
    console.error(`${failure.file}:${failure.line} contains "${failure.term}"`);
  }
  process.exit(1);
}

console.log('Visible test artifact audit passed.');
