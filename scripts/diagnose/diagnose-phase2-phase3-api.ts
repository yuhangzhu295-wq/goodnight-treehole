import fs from 'node:fs/promises';
import { ensureFrontRestDirs, frontRestArtifacts } from './front-rest-common';

const requiredSnippets = [
  { name: 'GET /api/v1/tools', text: "@Get('tools')" },
  { name: 'POST /api/v1/tools/run', text: "@Post('tools/run')" },
  { name: 'POST /api/v1/tools/emotion-decompose', text: "@Post('tools/emotion-decompose')" },
  { name: 'POST /api/v1/diaries', text: "@Post('diaries')" },
  { name: 'POST /api/v1/diaries/export', text: "@Post('diaries/export')" },
  { name: 'GET /api/v1/diaries', text: "@Get('diaries')" },
  { name: 'GET /api/v1/reports/monthly', text: "@Get('reports/monthly')" },
  { name: 'GET /api/v1/reports/monthly/:month/advice', text: "@Get('reports/monthly/:month/advice')" },
  { name: 'POST /api/v1/reports/monthly/:month/poster', text: "@Post('reports/monthly/:month/poster')" },
  { name: 'GET /api/v1/letters?status=', text: "@Get('letters')" },
  { name: 'PATCH /api/v1/letters/:id/read', text: "@Patch('letters/:id/read')" },
  { name: 'POST /api/v1/letters/:id/like', text: "@Post('letters/:id/like')" },
  { name: 'DELETE /api/v1/letters/:id/favorite', text: "@Delete('letters/:id/favorite')" },
  { name: 'GET /api/v1/favorites?type=', text: "@Get('favorites')" },
  { name: 'PUT /api/v1/settings/privacy', text: "@Put('settings/privacy')" },
  { name: 'GET /api/v1/feedback/faqs', text: "@Get('feedback/faqs')" },
  { name: 'POST /api/v1/feedback', text: "@Post('feedback')" },
];

async function main() {
  await ensureFrontRestDirs();
  const controllers = await fs.readFile('apps/api/src/controllers.ts', 'utf8');
  const rows = requiredSnippets.map((item) => ({
    name: item.name,
    ok: controllers.includes(item.text),
    evidence: controllers.includes(item.text) ? 'controller route exists' : `missing ${item.text}`,
  }));

  const lines = [
    '# Front Rest API Diagnosis',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| Result | API | Evidence |',
    '| --- | --- | --- |',
    ...rows.map((row) => `| ${row.ok ? 'PASS' : 'FAIL'} | ${row.name} | ${row.evidence} |`),
    '',
  ];
  await fs.writeFile(frontRestArtifacts.api, lines.join('\n'));
  if (rows.some((row) => !row.ok)) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
