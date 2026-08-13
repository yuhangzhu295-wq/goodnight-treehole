import fs from 'node:fs/promises';
import { ensureFirst5Dirs, first5Artifacts } from './first5-common';

const requiredSnippets = [
  { name: 'GET /api/v1/posts', text: "@Get('posts')" },
  { name: 'GET /api/v1/posts/:id', text: "@Get('posts/:id')" },
  { name: 'POST /api/v1/posts/:id/hug', text: "@Post('posts/:id/hug')" },
  { name: 'POST /api/v1/posts/:id/favorite', text: "@Post('posts/:id/favorite')" },
  { name: 'POST /api/v1/moods', text: "@Post('moods')" },
  { name: 'GET /api/v1/posts/:id/replies', text: "@Get('posts/:id/replies')" },
  { name: 'GET /api/v1/reply-presets', text: "@Get('reply-presets')" },
  { name: 'POST /api/v1/posts/:id/replies', text: "@Post('posts/:id/replies')" },
  { name: 'GET /api/v1/letters/today', text: "@Get('letters/today')" },
  { name: 'POST /api/v1/letters/:id/regenerate', text: "@Post('letters/:id/regenerate')" },
  { name: 'POST /api/v1/letters/:id/save-to-diary', text: "@Post('letters/:id/save-to-diary')" },
  { name: 'POST /api/v1/letters/:id/poster', text: "@Post('letters/:id/poster')" },
  { name: 'POST /api/v1/assets/complete', text: "@Post('assets/complete')" },
];

async function main() {
  await ensureFirst5Dirs();
  const controllers = await fs.readFile('apps/api/src/controllers.ts', 'utf8');
  const rows = requiredSnippets.map((item) => ({
    name: item.name,
    ok: controllers.includes(item.text),
    evidence: controllers.includes(item.text) ? 'controller route exists' : `missing ${item.text}`,
  }));

  const lines = [
    '# First5 API Diagnosis',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '| Result | API | Evidence |',
    '| --- | --- | --- |',
    ...rows.map((row) => `| ${row.ok ? 'PASS' : 'FAIL'} | ${row.name} | ${row.evidence} |`),
    '',
  ];
  await fs.writeFile(first5Artifacts.api, lines.join('\n'));
  if (rows.some((row) => !row.ok)) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
