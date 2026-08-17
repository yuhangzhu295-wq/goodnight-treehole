import fs from 'node:fs/promises';
import path from 'node:path';

const roots = ['apps/mp/src', 'apps/admin/src'];
const forbiddenPatterns = [
  {
    label: 'design reference image background',
    regex: /backgroundImage:\s*`?url\([^)]*design_refs|background-image:\s*url\([^)]*design_refs/i,
  },
  {
    label: 'hidden real page content',
    regex: /(?:\.|class(?:Name)?\s*=\s*["'`][^"'`]*\b)(?:ref-content|admin-ref-content)\b/i,
  },
  {
    label: 'proxy hotspot class',
    regex: /(?:\.|class(?:Name)?\s*=\s*["'`][^"'`]*\b)(?:hotspot|live-layer|admin-live-layer|click-layer|proxy)\b/i,
  },
  {
    label: 'design reference shell class',
    regex: /ref-shell|admin-ref-shell/i,
  },
];

async function listFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    if (!/\.(vue|ts|scss|css|html)$/.test(entry.name)) return [];
    return [full];
  }));
  return files.flat();
}

async function main() {
  await fs.mkdir('artifacts/diagnosis', { recursive: true });
  const findings: Array<{ file: string; line: number; label: string; text: string }> = [];
  for (const root of roots) {
    for (const file of await listFiles(root)) {
      const content = await fs.readFile(file, 'utf8');
      content.split(/\r?\n/).forEach((line, index) => {
        for (const pattern of forbiddenPatterns) {
          if (pattern.regex.test(line)) {
            findings.push({ file, line: index + 1, label: pattern.label, text: line.trim() });
          }
        }
      });
    }
  }

  const lines = [
    '# DOM Overlay Diagnosis',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Findings: ${findings.length}`,
    '',
    '| Result | File | Line | Type | Evidence |',
    '| --- | --- | --- | --- | --- |',
    ...(findings.length
      ? findings.map((item) => `| FAIL | ${item.file} | ${item.line} | ${item.label} | ${item.text.replace(/\|/g, '\\|')} |`)
      : ['| PASS | - | - | no source overlay / image-background shell pattern found | - |']),
    '',
  ];
  await fs.writeFile('artifacts/diagnosis/dom-overlay-report.md', lines.join('\n'));
  if (findings.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
