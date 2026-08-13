import fs from 'node:fs/promises';

type ManifestItem = {
  page: string;
  route: string;
  selector: string;
  expectedAction: string;
  expectedApi?: string | null;
};

async function main() {
  await fs.mkdir('artifacts/diagnosis', { recursive: true });
  await fs.mkdir('tests/contracts', { recursive: true });
  const front = JSON.parse(await fs.readFile('tests/interaction-manifest.front.json', 'utf8')) as ManifestItem[];
  const admin = JSON.parse(await fs.readFile('tests/interaction-manifest.admin.json', 'utf8')) as ManifestItem[];
  const rows = [...front.map((item) => ({ side: 'front', ...item })), ...admin.map((item) => ({ side: 'admin', ...item }))];
  const missingApi = rows.filter((item) => item.expectedAction.match(/publish|submit|save|approve|hide|block|resolve|add|test|retry|fallback|favorite|hug/i) && !item.expectedApi);
  const lines = [
    '# API Binding Diagnosis',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Controls: ${rows.length}`,
    `Mutating/API-backed controls: ${rows.filter((item) => item.expectedApi).length}`,
    `Suspicious missing API bindings: ${missingApi.length}`,
    '',
    '| Side | Page | Selector | Action | Expected API |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map((item) => `| ${item.side} | ${item.page} | ${item.selector} | ${item.expectedAction} | ${item.expectedApi ?? ''} |`),
    '',
  ];
  await fs.writeFile('artifacts/diagnosis/api-binding-report.md', lines.join('\n'));
  await fs.writeFile('tests/contracts/front-interactions.json', JSON.stringify({ generatedAt: new Date().toISOString(), rules: ['data-testid must be on the visible Chinese control itself', 'reply sheet is a state of /pages/post/detail', 'expectedApi must match network traffic when present'], controls: front }, null, 2));
  await fs.writeFile('tests/contracts/admin-interactions.json', JSON.stringify({ generatedAt: new Date().toISOString(), rules: ['admin controls use /api/admin/v1/* unless explicitly crossing to front API', 'management actions must update shared backend state'], controls: admin }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
