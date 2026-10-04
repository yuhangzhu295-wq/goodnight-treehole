import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { assertVisualFixtureRuntime, resolveUploadsDirectory } from './runtime-environment.js';

const frontApiPaths = [
  'GET /api/v1/posts',
  'GET /api/v1/posts/:id',
  'POST /api/v1/posts/:id/hug',
  'POST /api/v1/posts/:id/hugs',
  'POST /api/v1/posts/:id/favorite',
  'POST /api/v1/posts/:id/report',
  'POST /api/v1/posts/:id/hide',
  'DELETE /api/v1/posts/:id',
  'POST /api/v1/posts',
  'POST /api/v1/moods',
  'POST /api/v1/moods/:id/queue-ai-replies',
  'GET /api/v1/posts/:id/replies',
  'GET /api/v1/reply-presets',
  'POST /api/v1/posts/:id/replies',
  'POST /api/v1/replies/:id/like',
  'POST /api/v1/ai/generate',
  'POST /api/v1/ai/tasks',
  'GET /api/v1/ai/tasks/:id',
  'POST /api/v1/ai/tools/breakdown',
  'GET /api/v1/letters/today',
  'GET /api/v1/letters/:id',
  'GET /api/v1/letters',
  'POST /api/v1/letters/:id/regenerate',
  'POST /api/v1/letters/generate',
  'POST /api/v1/letters/:id/poster',
  'POST /api/v1/share-image',
  'POST /api/v1/letters/:id/save-to-diary',
  'POST /api/v1/letters/:id/favorite',
  'GET /api/v1/tools',
  'POST /api/v1/tools/run',
  'POST /api/v1/tools/emotion-decompose',
  'POST /api/v1/tools/decompose',
  'POST /api/v1/tools/rewrite',
  'POST /api/v1/tools/rant',
  'POST /api/v1/tools/heal',
  'POST /api/v1/tools/sleep',
  'POST /api/v1/tools/work',
  'POST /api/v1/tools/future',
  'POST /api/v1/tools/emotion-decompose/:taskId/save',
  'GET /api/v1/me/profile',
  'GET /api/v1/me/stats',
  'GET /api/v1/me/growth-card',
  'DELETE /api/v1/me/data',
  'POST /api/v1/diaries',
  'POST /api/v1/diaries/export',
  'GET /api/v1/exports/:assetId/download',
  'GET /api/v1/diaries',
  'GET /api/v1/diaries/:id',
  'DELETE /api/v1/diaries/:id',
  'GET /api/v1/favorites',
  'DELETE /api/v1/favorites/:id',
  'GET /api/v1/reports/monthly',
  'GET /api/v1/report/month',
  'GET /api/v1/reports/monthly/:month/advice',
  'POST /api/v1/reports/monthly/:month/poster',
  'POST /api/v1/report/share-image',
  'GET /api/v1/settings/privacy',
  'GET /api/v1/privacy-settings',
  'PUT /api/v1/settings/privacy',
  'PATCH /api/v1/settings/privacy',
  'PATCH /api/v1/privacy-settings',
  'GET /api/v1/feedback/categories',
  'GET /api/v1/feedback/faqs',
  'POST /api/v1/feedback',
  'GET /api/v1/feedback',
  'POST /api/v1/uploads/sign',
  'POST /api/v1/upload',
  'POST /api/v1/assets/complete',
  'POST /api/v1/media/upload',
  'DELETE /api/v1/media/:id',
  'GET /api/v1/peers',
  'POST /api/v1/peer-experiences',
  'POST /api/v1/journeys/:id/peer-matches',
  'PATCH /api/v1/peer-matches/:id',
  'POST /api/v1/peer-matches/:id/respond',
  'POST /api/v1/peer-matches/:id/consent',
  'GET /api/v1/peer-requests',
  'GET /api/v1/peer-experiences/:id',
  'GET /api/v1/peer-conversations',
  'POST /api/v1/peer-conversations/:matchId/messages',
  'POST /api/v1/peer-conversations/:matchId/assist',
  'POST /api/v1/peer-conversations/:matchId/close',
  'POST /api/v1/peer-conversations/:matchId/report',
  'POST /api/v1/peer-conversations/:matchId/block',
  'POST /api/v1/peer-conversations/:matchId/feedback',
];

type RouteDoc = {
  path: string;
  summary?: string;
  description?: string;
  deprecated?: boolean;
  responses?: Record<string, { description: string }>;
};

type ApiRouteEntry = string | RouteDoc;

const adminApiPaths: ApiRouteEntry[] = [
  'POST /api/admin/v1/auth/login',
  'POST /api/admin/v1/login',
  'POST /api/admin/v1/auth/logout',
  'GET /api/admin/v1/me',
  'GET /api/admin/v1/dashboard/overview',
  'GET /api/admin/v1/dashboard',
  'GET /api/admin/v1/users',
  'GET /api/admin/v1/users/:id',
  'PATCH /api/admin/v1/users/:id/status',
  {
    path: 'PATCH /api/admin/v1/users/:id/tags',
    summary: 'PATCH /api/admin/v1/users/:id/tags (Deprecated)',
    description: '已废弃：用户标签功能未实现；本请求未保存任何标签。',
    deprecated: true,
    responses: { '410': { description: 'Gone - 端点已废弃，未保存任何标签' } },
  },
  {
    path: 'POST /api/admin/v1/users/:id/tags',
    summary: 'POST /api/admin/v1/users/:id/tags (Deprecated)',
    description: '已废弃：用户标签功能未实现；本请求未保存任何标签。',
    deprecated: true,
    responses: { '410': { description: 'Gone - 端点已废弃，未保存任何标签' } },
  },
  'DELETE /api/admin/v1/users/:id/data',
  'GET /api/admin/v1/posts',
  'GET /api/admin/v1/posts/:id',
  {
    path: 'PATCH /api/admin/v1/posts/:id/review',
    summary: 'PATCH /api/admin/v1/posts/:id/review',
    description: '帖子审核统一入口，支持审核通过、隐藏、驳回及标记风险。',
    responses: { '200': { description: 'OK' } },
  },
  'PATCH /api/admin/v1/posts/:id/moderation',
  'PATCH /api/admin/v1/posts/:id/approve',
  'PATCH /api/admin/v1/posts/:id/reject',
  'PATCH /api/admin/v1/posts/:id/block',
  {
    path: 'PATCH /api/admin/v1/posts/:id/visibility',
    summary: 'PATCH /api/admin/v1/posts/:id/visibility (Deprecated)',
    description: '已废弃：该接口不再修改帖子内容或可见范围；审核、隐藏与恢复请使用 PATCH /api/admin/v1/posts/:id/review。',
    deprecated: true,
    responses: { '410': { description: 'Gone - 端点已废弃，不再修改帖子或可见范围' } },
  },
  'DELETE /api/admin/v1/posts/:id',
  'GET /api/admin/v1/replies',
  'GET /api/admin/v1/replies/:id',
  'PATCH /api/admin/v1/replies/:id/moderation',
  'PATCH /api/admin/v1/replies/:id/approve',
  'PATCH /api/admin/v1/replies/:id/block',
  'PATCH /api/admin/v1/replies/:id/edit',
  'GET /api/admin/v1/ai/providers',
  'POST /api/admin/v1/ai/providers',
  'PUT /api/admin/v1/ai/providers/:id',
  'PATCH /api/admin/v1/ai/providers/:id',
  'POST /api/admin/v1/ai/providers/:id/test',
  'GET /api/admin/v1/ai/ollama/status',
  'POST /api/admin/v1/ai/ollama/sync-models',
  'GET /api/admin/v1/ai/routes',
  'PUT /api/admin/v1/ai/routes/:style',
  'PATCH /api/admin/v1/ai/routes/:style',
  'POST /api/admin/v1/ai/routes/:style/test',
  'GET /api/admin/v1/ai/jobs',
  'GET /api/admin/v1/ai/jobs/:id',
  'POST /api/admin/v1/ai/jobs/:id/retry',
  'POST /api/admin/v1/ai/jobs/:id/fallback',
  'GET /api/admin/v1/feedback/tickets',
  'GET /api/admin/v1/feedback',
  'GET /api/admin/v1/feedback/tickets/:id',
  'POST /api/admin/v1/feedback/tickets/:id/reply',
  'PATCH /api/admin/v1/feedback/:id/reply',
  'PATCH /api/admin/v1/feedback/tickets/:id/status',
  'PATCH /api/admin/v1/feedback/:id/resolve',
  'GET /api/admin/v1/faqs',
  'POST /api/admin/v1/faqs',
  'PUT /api/admin/v1/faqs/:id',
  'DELETE /api/admin/v1/faqs/:id',
  'GET /api/admin/v1/reply-presets',
  'POST /api/admin/v1/reply-presets',
  'PUT /api/admin/v1/reply-presets/:id',
  'DELETE /api/admin/v1/reply-presets/:id',
  'GET /api/admin/v1/feedback-categories',
  'POST /api/admin/v1/feedback-categories',
  'PUT /api/admin/v1/feedback-categories/:id',
  'DELETE /api/admin/v1/feedback-categories/:id',
  'GET /api/admin/v1/system/settings',
  'GET /api/admin/v1/settings',
  'PUT /api/admin/v1/system/settings',
  'PATCH /api/admin/v1/settings',
  'GET /api/admin/v1/audit-logs',
];

function toOpenApi(entries: ApiRouteEntry[]) {
  const result: Record<string, Record<string, any>> = {};
  for (const entry of entries) {
    const rawMethodAndPath = typeof entry === 'string' ? entry : entry.path;
    const [method, rawPath] = rawMethodAndPath.split(' ');
    const path = rawPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
    const op = method.toLowerCase();
    const doc: Partial<RouteDoc> = typeof entry === 'string' ? {} : entry;

    result[path] = result[path] || {};
    result[path][op] = {
      summary: doc.summary ?? rawMethodAndPath,
      ...(doc.description ? { description: doc.description } : {}),
      ...(doc.deprecated ? { deprecated: true } : {}),
      responses: doc.responses ?? { '200': { description: 'OK' }, '201': { description: 'Created' } },
    };
  }
  return result;
}

function setupOpenApi(app: any) {
  const document = {
    openapi: '3.0.3',
    info: {
      title: '晚安树洞 API',
      version: '0.1.0',
      description: '前台、后台、AI 路由、上传与联动验收接口',
    },
    paths: { ...toOpenApi(frontApiPaths), ...toOpenApi(adminApiPaths) },
  };
  const adapter = app.getHttpAdapter();
  adapter.get('/docs-json', (_req: unknown, res: any) => res.json(document));
  adapter.get('/docs', (_req: unknown, res: any) => res.json(document));
}

export async function createServer() {
  assertVisualFixtureRuntime();
  // Content-Disposition must be exposed explicitly: it is not one of the CORS-safelisted
  // response headers, so without this the admin app can download a file but cannot read the
  // filename the server chose and has to fall back to a generic name.
  const app = await NestFactory.create(AppModule, {
    cors: { origin: true, exposedHeaders: ['Content-Disposition'] },
  });
  (app as any).useStaticAssets(resolveUploadsDirectory(), { prefix: '/uploads/' });
  setupOpenApi(app);
  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const app = await createServer();
  await app.listen(Number(process.env.API_PORT ?? 3000), '0.0.0.0');
  console.log(`API listening on http://localhost:${process.env.API_PORT ?? 3000}`);
}
