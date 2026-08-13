import http from 'node:http';

const port = Number(process.env.FIXTURE_AI_STUB_PORT ?? 11435);

if (
  process.env.VISUAL_FIXTURE_MODE !== '1'
  || process.env.VISUAL_FIXTURE_VERSION !== 'v1'
  || process.env.VISUAL_FIXTURE_AI_MODE !== 'stub'
  || process.env.VISUAL_FIXTURE_AI_BASE_URL !== 'http://127.0.0.1:11435'
  || process.env.AI_LOCAL_MODEL_ENABLED !== 'false'
  || process.env.OLLAMA_ENABLED !== 'false'
  || process.env.AI_ALLOW_OLLAMA_FALLBACK !== 'false'
  || port !== 11435
) {
  throw new Error('The fixture AI stub may only start in visual-fixture v1 mode on port 11435.');
}

const models = [
  { name: 'fixture-stub:stable', model: 'fixture-stub:stable', size: 734003200, digest: 'visual-fixture-v1-primary', modified_at: '2026-07-01T00:00:00.000Z', capabilities: ['completion'], details: { family: 'fixture-stub', parameter_size: 'fixed', quantization_level: 'n/a' } },
  { name: 'fixture-stub-backup:stable', model: 'fixture-stub-backup:stable', size: 524288000, digest: 'visual-fixture-v1-backup', modified_at: '2026-07-01T00:00:00.000Z', capabilities: ['completion'], details: { family: 'fixture-stub', parameter_size: 'fixed', quantization_level: 'n/a' } },
];

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
  response.setHeader('content-type', 'application/json; charset=utf-8');
  if (request.method === 'GET' && url.pathname === '/api/tags') {
    response.end(JSON.stringify({ models }));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/api/generate') {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const input = raw ? JSON.parse(raw) as { model?: string; format?: unknown } : {};
    const structured = input.format === 'json';
    response.end(JSON.stringify({ model: input.model ?? 'fixture-stub:stable', response: structured ? JSON.stringify({ summary: '这是隔离视觉 fixture 的固定结构化响应。', actions: ['写下一件能做的小事', '给自己十分钟休息'] }) : '这是隔离视觉 fixture 的固定模型响应。', total_duration: 42000000 }));
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ error: 'fixture-ai-stub-route-not-found' }));
});

server.listen(port, '127.0.0.1', () => console.log(`Visual fixture AI stub listening on http://127.0.0.1:${port}`));

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
