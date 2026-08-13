import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureFirst5Dirs, first5Artifacts, forbiddenFirst5Terms } from './first5-common';

const roots = ['apps/mp/src'];
const sourceExtensions = /\.(vue|ts|scss|css|html)$/;
const extraPatterns = [
  { label: 'design png as page body', regex: /design_refs[\\/]+front[\\/]+0[1-5].*\.png|background-image:\s*url\([^)]*0[1-5].*\.png/i },
  { label: 'transparent hidden click layer', regex: /opacity:\s*0(?:\.0+)?\s*(?:;|$)|pointer-events:\s*auto.*transparent/i },
  { label: 'proxy overlay class', regex: /interaction-layer|hotspot|proxy-button|click-layer|test-layer/i },
];

async function listFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = await Promise.all(entries.map(async (entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return sourceExtensions.test(entry.name) ? [full] : [];
  }));
  return out.flat();
}

async function main() {
  await ensureFirst5Dirs();
  const findings: Array<{ file: string; line: number; type: string; evidence: string }> = [];
  for (const root of roots) {
    for (const file of await listFiles(root)) {
      const content = await fs.readFile(file, 'utf8');
      content.split(/\r?\n/).forEach((line, index) => {
        for (const pattern of extraPatterns) {
          if (pattern.regex.test(line)) findings.push({ file, line: index + 1, type: pattern.label, evidence: line.trim() });
        }
        for (const term of forbiddenFirst5Terms) {
          if (line.includes(term)) findings.push({ file, line: index + 1, type: 'forbidden term', evidence: term });
        }
      });
    }
  }

  const lines = [
    '# First5 Overlay Diagnosis',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Findings: ${findings.length}`,
    '',
    '| Result | File | Line | Type | Evidence |',
    '| --- | --- | --- | --- | --- |',
    ...(findings.length
      ? findings.map((item) => `| FAIL | ${item.file} | ${item.line} | ${item.type} | ${item.evidence.replace(/\|/g, '\\|')} |`)
      : ['| PASS | - | - | no design image shell, proxy layer, or visible test term found | - |']),
    '',
  ];
  await fs.writeFile(first5Artifacts.overlay, lines.join('\n'));
  if (findings.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
