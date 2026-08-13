import { Prisma } from '@prisma/client';

type DbClient = any;
type RuntimeData = Record<string, any>;

const asArray = <T = any>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];
const iso = (value: Date | string | null | undefined) => value ? new Date(value).toISOString() : new Date(0).toISOString();
const date = (value: Date | string | null | undefined) => {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};
const json = (value: unknown) => value === undefined ? Prisma.JsonNull : value as Prisma.InputJsonValue;
const valid = <T extends string>(value: unknown, values: readonly T[], fallback: T): T => values.includes(String(value) as T) ? String(value) as T : fallback;
const jobStatus = (value: unknown) => ({ success: 'succeeded', fallback_completed: 'fallback' }[String(value)] ?? valid(value, ['queued', 'running', 'succeeded', 'failed', 'fallback', 'cancelled'] as const, 'failed'));

export function isRelationalPrimary(payload: unknown) {
  return Boolean(payload && typeof payload === 'object' && (payload as Record<string, unknown>).persistence === 'relational-primary');
}

function attachmentIds(items: Array<{ mediaAssetId: string; sortOrder: number }> = []) {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder).map((item) => item.mediaAssetId);
}

export async function loadRelationalRuntimeState(db: DbClient): Promise<RuntimeData | undefined> {
  const [users, adminUsers, moods, posts, replies, letters, diaries, favorites, categories, faqs, presets, tickets, settings, providers, routes, jobs, assets, audits] = await Promise.all([
    db.user.findMany({ include: { privacySetting: true }, orderBy: { createdAt: 'desc' } }),
    db.adminUser.findMany({ include: { role: true }, orderBy: { createdAt: 'desc' } }),
    db.mood.findMany({ include: { attachments: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'desc' } }),
    db.post.findMany({ orderBy: { createdAt: 'desc' } }),
    db.reply.findMany({ orderBy: { createdAt: 'desc' } }),
    db.letter.findMany({ orderBy: { createdAt: 'desc' } }),
    db.diary.findMany({ include: { attachments: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'desc' } }),
    db.favorite.findMany({ orderBy: { createdAt: 'desc' } }),
    db.feedbackCategory.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.faqItem.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.replyPreset.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.feedbackTicket.findMany({ orderBy: { createdAt: 'desc' } }),
    db.systemSetting.findMany({ orderBy: { key: 'asc' } }),
    db.aIProvider.findMany({ orderBy: { priority: 'asc' } }),
    db.aIStyleRoute.findMany({ orderBy: { style: 'asc' } }),
    db.aIJob.findMany({ orderBy: { createdAt: 'desc' } }),
    db.mediaAsset.findMany({ orderBy: { createdAt: 'desc' } }),
    db.auditLog.findMany({ orderBy: { createdAt: 'desc' } }),
  ]);
  if (!users.length) return undefined;

  const moodAttachmentMap = new Map(moods.map((item: any) => [item.id, attachmentIds(item.attachments)]));
  return {
    users: users.map((item: any) => ({ id: item.id, openid: item.openid, nickname: item.nickname, anonymousCode: item.anonymousCode, avatarUrl: item.avatarUrl ?? '', status: item.status, createdAt: iso(item.createdAt) })),
    adminUsers: adminUsers.map((item: any) => ({ id: item.id, username: item.username, passwordHash: item.passwordHash, displayName: item.displayName, role: item.role?.code ?? 'super_admin', status: item.status, lastLoginAt: item.lastLoginAt ? iso(item.lastLoginAt) : undefined })),
    privacySettings: Object.fromEntries(users.map((item: any) => [item.id, item.privacySetting ? {
      defaultVisibility: item.privacySetting.defaultVisibility,
      allowAnonymousPublic: item.privacySetting.allowAnonymousPublic,
      allowHumanReplies: item.privacySetting.allowHumanReplies,
      allowMonthlyReportShare: item.privacySetting.allowMonthlyReportShare,
    } : { defaultVisibility: 'PRIVATE', allowAnonymousPublic: true, allowHumanReplies: true, allowMonthlyReportShare: true }])),
    moods: moods.map((item: any) => ({ id: item.id, userId: item.userId, emotion: item.emotion, content: item.content, visibility: item.visibility, riskLevel: item.riskLevel, riskScore: item.riskScore, status: item.status, attachmentIds: moodAttachmentMap.get(item.id) ?? [], createdAt: iso(item.createdAt) })),
    posts: posts.map((item: any) => ({ id: item.id, moodId: item.moodId, userId: item.userId, emotion: item.emotion, content: item.content, visibility: item.visibility, status: item.status, reviewStatus: item.reviewStatus, hugCount: item.hugCount, replyCount: item.replyCount, favoriteCount: item.favoriteCount, reportCount: item.reportCount, attachmentIds: moodAttachmentMap.get(item.moodId) ?? [], createdAt: iso(item.createdAt), publishedAt: item.publishedAt ? iso(item.publishedAt) : undefined })),
    replies: replies.map((item: any) => ({ id: item.id, postId: item.postId, userId: item.userId ?? undefined, type: item.type, style: item.style, content: item.content, status: item.status, riskLevel: item.riskLevel, likeCount: item.likeCount, aiJobId: item.aiJobId ?? undefined, createdAt: iso(item.createdAt) })),
    letters: letters.map((item: any) => ({ id: item.id, userId: item.userId, sourceMoodId: item.sourceMoodId ?? item.legacySourceMoodId ?? undefined, style: item.style, title: item.title, content: item.content, status: item.status, savedToDiary: item.savedToDiary, aiJobId: item.aiJobId ?? undefined, generationStatus: item.generationStatus ?? undefined, favorite: item.favorite, likeCount: item.likeCount, createdAt: iso(item.createdAt) })),
    diaries: diaries.map((item: any) => ({ id: item.id, userId: item.userId, moodId: item.moodId ?? undefined, letterId: item.letterId ?? undefined, emotion: item.emotion, content: item.content, hasLetter: item.hasLetter, source: item.source ?? undefined, toolResult: item.toolResult ?? undefined, attachmentIds: attachmentIds(item.attachments), createdAt: iso(item.createdAt) })),
    favorites: favorites.map((item: any) => ({ id: item.id, userId: item.userId, targetType: item.targetType, targetId: item.targetId, createdAt: iso(item.createdAt) })),
    feedbackCategories: categories.map((item: any) => ({ id: item.id, name: item.name, sortOrder: item.sortOrder, enabled: item.enabled })),
    faqs: faqs.map((item: any) => ({ id: item.id, question: item.question, answer: item.answer, sortOrder: item.sortOrder, enabled: item.enabled, createdAt: iso(item.createdAt) })),
    replyPresets: presets.map((item: any) => ({ id: item.id, text: item.text, scene: item.scene, sortOrder: item.sortOrder, enabled: item.enabled, createdAt: iso(item.createdAt) })),
    feedbackTickets: tickets.map((item: any) => ({ id: item.id, userId: item.userId, categoryId: item.categoryId, sourcePage: item.sourcePage, content: item.content, status: item.status, priority: item.priority, screenshots: asArray(item.screenshots), reply: item.reply ?? '', repliedBy: item.repliedBy ?? undefined, createdAt: iso(item.createdAt), repliedAt: item.repliedAt ? iso(item.repliedAt) : undefined })),
    systemSettings: Object.fromEntries(settings.map((item: any) => [item.key, { value: item.value, description: item.description, updatedBy: item.updatedBy ?? 'system', updatedAt: iso(item.updatedAt) }])),
    aiProviders: providers.map((item: any) => ({ id: item.id, name: item.name, type: item.type, baseUrl: item.baseUrl, modelName: item.modelName, apiKeyStatus: item.apiKeyStatus, enabled: item.enabled, priority: item.priority, dailyLimit: item.dailyLimit, timeoutSeconds: item.timeoutSeconds, failoverEnabled: item.failoverEnabled, usageTags: asArray(item.usageTags), failureRate: item.failureRate, avgLatencyMs: item.avgLatencyMs, todayCalls: item.todayCalls, providerKind: item.providerKind, modelMeta: item.modelMeta ?? undefined })),
    aiRoutes: routes.map((item: any) => ({ id: item.id, style: item.style, label: item.label, taskTypes: asArray(item.taskTypes), primaryProviderId: item.primaryProviderId, backupProviderId: item.backupProviderId, fallbackTemplateId: item.fallbackTemplateId, promptVersion: item.promptVersion, promptTemplate: item.promptTemplate, enabled: item.enabled, routeVersion: item.routeVersion })),
    aiJobs: jobs.map((item: any) => ({ id: item.id, userId: item.userId, contentId: item.contentId, contentType: item.contentType, taskType: item.taskType ?? undefined, jobType: item.jobType, style: item.style, providerId: item.providerId, modelName: item.modelName, status: item.status, promptSummary: item.promptSummary, promptVersion: item.promptVersion ?? undefined, result: item.result ?? '', structuredResult: item.structuredResult ?? undefined, errorMessage: item.errorMessage ?? undefined, durationMs: item.durationMs ?? 0, retryCount: item.retryCount, fallbackUsed: item.fallbackUsed, traceJson: asArray(item.traceJson), routeVersion: item.routeVersion, createdAt: iso(item.createdAt), completedAt: item.completedAt ? iso(item.completedAt) : undefined })),
    assets: assets.map((item: any) => ({ id: item.id, userId: item.userId, storageKey: item.storageKey, url: item.url, mimeType: item.mimeType, size: item.size, width: item.width, height: item.height, usageType: item.usageType, status: item.status, createdAt: iso(item.createdAt) })),
    auditLogs: audits.map((item: any) => ({ id: item.id, adminUserId: item.adminUserId, action: item.action, resourceType: item.resourceType, resourceId: item.resourceId, beforeJson: item.beforeJson ?? null, afterJson: item.afterJson ?? null, ip: item.ip ?? '', userAgent: item.userAgent ?? '', createdAt: iso(item.createdAt) })),
  };
}

async function deleteAbsent(model: any, ids: string[]) {
  await model.deleteMany(ids.length ? { where: { id: { notIn: ids } } } : {});
}

export async function saveRelationalRuntimeState(db: DbClient, state: RuntimeData): Promise<void> {
  const users = asArray(state.users);
  if (!users.length) throw new Error('Relational persistence requires at least one user');
  const providerMap = new Map(asArray(state.aiProviders).filter((item: any) => item?.id).map((item: any) => [item.id, { ...item }]));
  const fallbackProvider = (providerId: string) => {
    const key = providerId || 'provider_legacy_template';
    if (!providerMap.has(key)) providerMap.set(key, { id: key, name: `迁移兼容 ${key}`, type: 'template', baseUrl: 'local://template', modelName: 'legacy-template', apiKeyStatus: 'configured', enabled: true, priority: 999, dailyLimit: 99999, timeoutSeconds: 1, failoverEnabled: false, usageTags: ['compatibility'], failureRate: 0, avgLatencyMs: 0, todayCalls: 0, providerKind: 'template' });
    return key;
  };
  const routes = asArray(state.aiRoutes).filter((item: any) => ['warm', 'rational', 'light', 'clear', 'poetic'].includes(item?.style));
  for (const route of routes) {
    route.primaryProviderId = fallbackProvider(route.primaryProviderId);
    route.backupProviderId = fallbackProvider(route.backupProviderId);
    route.fallbackTemplateId = fallbackProvider(route.fallbackTemplateId);
  }
  const jobs = asArray(state.aiJobs);
  for (const job of jobs) job.providerId = fallbackProvider(job.providerId);
  const moodIds = new Set(asArray(state.moods).map((item: any) => item.id));
  const letterIds = new Set(asArray(state.letters).map((item: any) => item.id));
  const jobIds = new Set(jobs.map((item: any) => item.id));

  await db.$transaction(async (tx: DbClient) => {
    const adminUsers = asArray(state.adminUsers);
    const roles = [...new Set(adminUsers.map((item: any) => String(item.role || 'super_admin')))];
    for (const role of roles) {
      const roleId = `role_${role}`;
      await tx.adminRole.upsert({ where: { id: roleId }, create: { id: roleId, code: role, name: role, permissions: [] }, update: { code: role, name: role } });
    }
    for (const item of adminUsers) {
      const role = String(item.role || 'super_admin');
      await tx.adminUser.upsert({ where: { id: item.id }, create: { id: item.id, username: item.username, passwordHash: item.passwordHash, displayName: item.displayName, roleId: `role_${role}`, status: valid(item.status, ['active', 'disabled'] as const, 'active'), lastLoginAt: item.lastLoginAt ? date(item.lastLoginAt) : null }, update: { username: item.username, passwordHash: item.passwordHash, displayName: item.displayName, roleId: `role_${role}`, status: valid(item.status, ['active', 'disabled'] as const, 'active'), lastLoginAt: item.lastLoginAt ? date(item.lastLoginAt) : null } });
    }
    for (const item of users) {
      await tx.user.upsert({ where: { id: item.id }, create: { id: item.id, openid: item.openid, nickname: item.nickname, anonymousCode: item.anonymousCode, avatarUrl: item.avatarUrl || null, status: valid(item.status, ['normal', 'limited', 'banned'] as const, 'normal'), createdAt: date(item.createdAt) }, update: { openid: item.openid, nickname: item.nickname, anonymousCode: item.anonymousCode, avatarUrl: item.avatarUrl || null, status: valid(item.status, ['normal', 'limited', 'banned'] as const, 'normal') } });
      const privacy = state.privacySettings?.[item.id] ?? {};
      await tx.privacySetting.upsert({ where: { userId: item.id }, create: { userId: item.id, defaultVisibility: valid(privacy.defaultVisibility, ['PRIVATE', 'PUBLIC'] as const, 'PRIVATE'), allowAnonymousPublic: privacy.allowAnonymousPublic ?? true, allowHumanReplies: privacy.allowHumanReplies ?? true, allowMonthlyReportShare: privacy.allowMonthlyReportShare ?? true }, update: { defaultVisibility: valid(privacy.defaultVisibility, ['PRIVATE', 'PUBLIC'] as const, 'PRIVATE'), allowAnonymousPublic: privacy.allowAnonymousPublic ?? true, allowHumanReplies: privacy.allowHumanReplies ?? true, allowMonthlyReportShare: privacy.allowMonthlyReportShare ?? true } });
    }
    for (const item of asArray(state.assets)) {
      const storageKey = item.storageKey ?? item.objectKey ?? `legacy/${item.id}`;
      await tx.mediaAsset.upsert({ where: { id: item.id }, create: { id: item.id, userId: item.userId, storageKey, url: item.url, mimeType: item.mimeType, size: item.size, width: item.width ?? 0, height: item.height ?? 0, usageType: item.usageType, status: item.status, createdAt: date(item.createdAt) }, update: { userId: item.userId, storageKey, url: item.url, mimeType: item.mimeType, size: item.size, width: item.width ?? 0, height: item.height ?? 0, usageType: item.usageType, status: item.status } });
    }
    for (const item of asArray(state.moods)) await tx.mood.upsert({ where: { id: item.id }, create: { id: item.id, userId: item.userId, emotion: item.emotion, content: item.content, visibility: valid(item.visibility, ['PRIVATE', 'PUBLIC'] as const, 'PRIVATE'), riskLevel: item.riskLevel ?? 'low', riskScore: Number(item.riskScore ?? 0), status: item.status ?? 'active', createdAt: date(item.createdAt) }, update: { userId: item.userId, emotion: item.emotion, content: item.content, visibility: valid(item.visibility, ['PRIVATE', 'PUBLIC'] as const, 'PRIVATE'), riskLevel: item.riskLevel ?? 'low', riskScore: Number(item.riskScore ?? 0), status: item.status ?? 'active' } });
    for (const item of asArray(state.posts)) await tx.post.upsert({ where: { id: item.id }, create: { id: item.id, moodId: item.moodId, userId: item.userId, emotion: item.emotion, content: item.content, visibility: valid(item.visibility, ['PRIVATE', 'PUBLIC'] as const, 'PUBLIC'), status: item.status ?? 'active', reviewStatus: valid(item.reviewStatus, ['pending_review', 'published', 'hidden', 'rejected'] as const, 'pending_review'), hugCount: Number(item.hugCount ?? 0), replyCount: Number(item.replyCount ?? 0), favoriteCount: Number(item.favoriteCount ?? 0), reportCount: Number(item.reportCount ?? 0), createdAt: date(item.createdAt), publishedAt: item.publishedAt ? date(item.publishedAt) : null }, update: { moodId: item.moodId, userId: item.userId, emotion: item.emotion, content: item.content, visibility: valid(item.visibility, ['PRIVATE', 'PUBLIC'] as const, 'PUBLIC'), status: item.status ?? 'active', reviewStatus: valid(item.reviewStatus, ['pending_review', 'published', 'hidden', 'rejected'] as const, 'pending_review'), hugCount: Number(item.hugCount ?? 0), replyCount: Number(item.replyCount ?? 0), favoriteCount: Number(item.favoriteCount ?? 0), reportCount: Number(item.reportCount ?? 0), publishedAt: item.publishedAt ? date(item.publishedAt) : null } });
    for (const item of providerMap.values()) await tx.aIProvider.upsert({ where: { id: item.id }, create: { id: item.id, name: item.name, type: valid(item.type, ['local', 'cloud', 'template'] as const, 'template'), baseUrl: item.baseUrl, modelName: item.modelName, enabled: item.enabled !== false, priority: Number(item.priority ?? 0), dailyLimit: Number(item.dailyLimit ?? 1000), timeoutSeconds: Number(item.timeoutSeconds ?? 10), failoverEnabled: item.failoverEnabled !== false, usageTags: json(item.usageTags ?? []), providerKind: item.providerKind ?? 'other', apiKeyStatus: item.apiKeyStatus ?? 'missing', failureRate: Number(item.failureRate ?? 0), avgLatencyMs: Number(item.avgLatencyMs ?? 0), todayCalls: Number(item.todayCalls ?? 0), modelMeta: json(item.modelMeta) }, update: { name: item.name, type: valid(item.type, ['local', 'cloud', 'template'] as const, 'template'), baseUrl: item.baseUrl, modelName: item.modelName, enabled: item.enabled !== false, priority: Number(item.priority ?? 0), dailyLimit: Number(item.dailyLimit ?? 1000), timeoutSeconds: Number(item.timeoutSeconds ?? 10), failoverEnabled: item.failoverEnabled !== false, usageTags: json(item.usageTags ?? []), providerKind: item.providerKind ?? 'other', apiKeyStatus: item.apiKeyStatus ?? 'missing', failureRate: Number(item.failureRate ?? 0), avgLatencyMs: Number(item.avgLatencyMs ?? 0), todayCalls: Number(item.todayCalls ?? 0), modelMeta: json(item.modelMeta) } });
    for (const item of routes) await tx.aIStyleRoute.upsert({ where: { style: item.style }, create: { id: item.id ?? `route_${item.style}`, style: item.style, primaryProviderId: item.primaryProviderId, backupProviderId: item.backupProviderId, fallbackTemplateId: item.fallbackTemplateId, promptVersion: item.promptVersion ?? 'v1', promptTemplate: item.promptTemplate ?? '', label: item.label ?? item.style, taskTypes: json(item.taskTypes ?? []), routeVersion: Number(item.routeVersion ?? 1), enabled: item.enabled !== false }, update: { primaryProviderId: item.primaryProviderId, backupProviderId: item.backupProviderId, fallbackTemplateId: item.fallbackTemplateId, promptVersion: item.promptVersion ?? 'v1', promptTemplate: item.promptTemplate ?? '', label: item.label ?? item.style, taskTypes: json(item.taskTypes ?? []), routeVersion: Number(item.routeVersion ?? 1), enabled: item.enabled !== false } });
    for (const item of jobs) await tx.aIJob.upsert({ where: { id: item.id }, create: { id: item.id, userId: item.userId, contentId: item.contentId, contentType: item.contentType, jobType: item.jobType, taskType: item.taskType ?? null, style: valid(item.style, ['warm', 'rational', 'light', 'clear', 'poetic'] as const, 'warm'), providerId: item.providerId, modelName: item.modelName ?? '', status: jobStatus(item.status), promptSummary: item.promptSummary ?? '', promptVersion: item.promptVersion ?? null, result: item.result ?? null, structuredResult: json(item.structuredResult), errorMessage: item.errorMessage ?? null, durationMs: Number(item.durationMs ?? 0), retryCount: Number(item.retryCount ?? 0), fallbackUsed: Boolean(item.fallbackUsed), routeVersion: Number(item.routeVersion ?? 0), traceJson: json(item.traceJson ?? []), createdAt: date(item.createdAt), completedAt: item.completedAt ? date(item.completedAt) : null }, update: { userId: item.userId, contentId: item.contentId, contentType: item.contentType, jobType: item.jobType, taskType: item.taskType ?? null, style: valid(item.style, ['warm', 'rational', 'light', 'clear', 'poetic'] as const, 'warm'), providerId: item.providerId, modelName: item.modelName ?? '', status: jobStatus(item.status), promptSummary: item.promptSummary ?? '', promptVersion: item.promptVersion ?? null, result: item.result ?? null, structuredResult: json(item.structuredResult), errorMessage: item.errorMessage ?? null, durationMs: Number(item.durationMs ?? 0), retryCount: Number(item.retryCount ?? 0), fallbackUsed: Boolean(item.fallbackUsed), routeVersion: Number(item.routeVersion ?? 0), traceJson: json(item.traceJson ?? []), completedAt: item.completedAt ? date(item.completedAt) : null } });
    for (const item of asArray(state.letters)) {
      const sourceMoodId = moodIds.has(item.sourceMoodId) ? item.sourceMoodId : null;
      const legacySourceMoodId = item.sourceMoodId && !sourceMoodId ? item.sourceMoodId : null;
      const aiJobId = jobIds.has(item.aiJobId) ? item.aiJobId : null;
      await tx.letter.upsert({ where: { id: item.id }, create: { id: item.id, userId: item.userId, sourceMoodId, legacySourceMoodId, style: item.style, title: item.title, content: item.content, status: item.status ?? 'unread', savedToDiary: Boolean(item.savedToDiary), aiJobId, generationStatus: item.generationStatus ?? null, favorite: Boolean(item.favorite), likeCount: Number(item.likeCount ?? 0), createdAt: date(item.createdAt) }, update: { userId: item.userId, sourceMoodId, legacySourceMoodId, style: item.style, title: item.title, content: item.content, status: item.status ?? 'unread', savedToDiary: Boolean(item.savedToDiary), aiJobId, generationStatus: item.generationStatus ?? null, favorite: Boolean(item.favorite), likeCount: Number(item.likeCount ?? 0) } });
    }
    for (const item of asArray(state.diaries)) {
      const moodId = moodIds.has(item.moodId) ? item.moodId : null;
      const letterId = letterIds.has(item.letterId) ? item.letterId : null;
      await tx.diary.upsert({ where: { id: item.id }, create: { id: item.id, userId: item.userId, moodId, letterId, emotion: item.emotion, content: item.content, hasLetter: Boolean(item.hasLetter), source: item.source ?? null, toolResult: json(item.toolResult), createdAt: date(item.createdAt) }, update: { userId: item.userId, moodId, letterId, emotion: item.emotion, content: item.content, hasLetter: Boolean(item.hasLetter), source: item.source ?? null, toolResult: json(item.toolResult) } });
    }
    for (const item of asArray(state.replies)) {
      const candidateJobId = item.aiJobId ?? (String(item.id).startsWith('reply_job_') ? String(item.id).slice('reply_'.length) : null);
      const aiJobId = jobIds.has(candidateJobId) ? candidateJobId : null;
      await tx.reply.upsert({ where: { id: item.id }, create: { id: item.id, postId: item.postId, userId: item.userId ?? null, type: valid(item.type, ['USER', 'AI'] as const, 'AI'), style: item.style ?? 'warm', content: item.content, status: valid(item.status, ['pending_review', 'published', 'blocked'] as const, 'pending_review'), riskLevel: item.riskLevel ?? 'low', likeCount: Number(item.likeCount ?? 0), aiJobId, createdAt: date(item.createdAt) }, update: { postId: item.postId, userId: item.userId ?? null, type: valid(item.type, ['USER', 'AI'] as const, 'AI'), style: item.style ?? 'warm', content: item.content, status: valid(item.status, ['pending_review', 'published', 'blocked'] as const, 'pending_review'), riskLevel: item.riskLevel ?? 'low', likeCount: Number(item.likeCount ?? 0), aiJobId } });
    }
    for (const item of asArray(state.favorites)) await tx.favorite.upsert({ where: { userId_targetType_targetId: { userId: item.userId, targetType: valid(item.targetType, ['post', 'letter', 'diary'] as const, 'post'), targetId: item.targetId } }, create: { id: item.id, userId: item.userId, targetType: valid(item.targetType, ['post', 'letter', 'diary'] as const, 'post'), targetId: item.targetId, createdAt: date(item.createdAt) }, update: {} });
    for (const item of asArray(state.feedbackCategories)) await tx.feedbackCategory.upsert({ where: { id: item.id }, create: { id: item.id, name: item.name, sortOrder: Number(item.sortOrder ?? 0), enabled: item.enabled !== false }, update: { name: item.name, sortOrder: Number(item.sortOrder ?? 0), enabled: item.enabled !== false } });
    for (const item of asArray(state.faqs)) await tx.faqItem.upsert({ where: { id: item.id }, create: { id: item.id, question: item.question, answer: item.answer, sortOrder: Number(item.sortOrder ?? 0), enabled: item.enabled !== false, createdAt: date(item.createdAt) }, update: { question: item.question, answer: item.answer, sortOrder: Number(item.sortOrder ?? 0), enabled: item.enabled !== false } });
    for (const item of asArray(state.replyPresets)) await tx.replyPreset.upsert({ where: { id: item.id }, create: { id: item.id, text: item.text, scene: item.scene, sortOrder: Number(item.sortOrder ?? 0), enabled: item.enabled !== false, createdAt: date(item.createdAt) }, update: { text: item.text, scene: item.scene, sortOrder: Number(item.sortOrder ?? 0), enabled: item.enabled !== false } });
    for (const item of asArray(state.feedbackTickets)) await tx.feedbackTicket.upsert({ where: { id: item.id }, create: { id: item.id, userId: item.userId, categoryId: item.categoryId, sourcePage: item.sourcePage, content: item.content, status: valid(item.status, ['open', 'processing', 'resolved', 'closed'] as const, 'open'), priority: item.priority ?? 'medium', screenshots: json(item.screenshots ?? []), reply: item.reply || null, repliedBy: item.repliedBy || null, repliedAt: item.repliedAt ? date(item.repliedAt) : null, createdAt: date(item.createdAt) }, update: { userId: item.userId, categoryId: item.categoryId, sourcePage: item.sourcePage, content: item.content, status: valid(item.status, ['open', 'processing', 'resolved', 'closed'] as const, 'open'), priority: item.priority ?? 'medium', screenshots: json(item.screenshots ?? []), reply: item.reply || null, repliedBy: item.repliedBy || null, repliedAt: item.repliedAt ? date(item.repliedAt) : null } });
    for (const [key, item] of Object.entries(state.systemSettings ?? {})) await tx.systemSetting.upsert({ where: { key }, create: { key, value: json((item as any).value), description: (item as any).description ?? key, updatedBy: (item as any).updatedBy ?? null }, update: { value: json((item as any).value), description: (item as any).description ?? key, updatedBy: (item as any).updatedBy ?? null } });
    for (const item of asArray(state.auditLogs)) await tx.auditLog.upsert({ where: { id: item.id }, create: { id: item.id, adminUserId: item.adminUserId, action: item.action, resourceType: item.resourceType, resourceId: item.resourceId, beforeJson: json(item.beforeJson), afterJson: json(item.afterJson), ip: item.ip || null, userAgent: item.userAgent || null, createdAt: date(item.createdAt) }, update: { adminUserId: item.adminUserId, action: item.action, resourceType: item.resourceType, resourceId: item.resourceId, beforeJson: json(item.beforeJson), afterJson: json(item.afterJson), ip: item.ip || null, userAgent: item.userAgent || null } });

    await tx.moodAttachment.deleteMany();
    const moodAttachments = asArray(state.moods).flatMap((item: any) => asArray<string>(item.attachmentIds).map((mediaAssetId, sortOrder) => ({ moodId: item.id, mediaAssetId, sortOrder })));
    if (moodAttachments.length) await tx.moodAttachment.createMany({ data: moodAttachments, skipDuplicates: true });
    await tx.diaryAttachment.deleteMany();
    const diaryAttachments = asArray(state.diaries).flatMap((item: any) => asArray<string>(item.attachmentIds).map((mediaAssetId, sortOrder) => ({ diaryId: item.id, mediaAssetId, sortOrder })));
    if (diaryAttachments.length) await tx.diaryAttachment.createMany({ data: diaryAttachments, skipDuplicates: true });

    await deleteAbsent(tx.reply, asArray(state.replies).map((item: any) => item.id));
    await deleteAbsent(tx.diary, asArray(state.diaries).map((item: any) => item.id));
    await deleteAbsent(tx.favorite, asArray(state.favorites).map((item: any) => item.id));
    await deleteAbsent(tx.letter, asArray(state.letters).map((item: any) => item.id));
    await deleteAbsent(tx.post, asArray(state.posts).map((item: any) => item.id));
    await deleteAbsent(tx.mood, asArray(state.moods).map((item: any) => item.id));
    await deleteAbsent(tx.aIJob, jobs.map((item: any) => item.id));
    await deleteAbsent(tx.aIStyleRoute, routes.map((item: any) => item.id ?? `route_${item.style}`));
    await deleteAbsent(tx.aIProvider, [...providerMap.keys()]);
    await deleteAbsent(tx.feedbackTicket, asArray(state.feedbackTickets).map((item: any) => item.id));
    await deleteAbsent(tx.feedbackCategory, asArray(state.feedbackCategories).map((item: any) => item.id));
    await deleteAbsent(tx.faqItem, asArray(state.faqs).map((item: any) => item.id));
    await deleteAbsent(tx.replyPreset, asArray(state.replyPresets).map((item: any) => item.id));
    await deleteAbsent(tx.auditLog, asArray(state.auditLogs).map((item: any) => item.id));
    await deleteAbsent(tx.mediaAsset, asArray(state.assets).map((item: any) => item.id));
    const fixtureMarker = process.env.VISUAL_FIXTURE_MODE === '1'
      ? { fixture: { id: 'visual-v1', version: process.env.VISUAL_FIXTURE_VERSION ?? 'unknown', runtimeInstanceId: process.env.RUNTIME_INSTANCE_ID ?? 'unknown' } }
      : {};
    await tx.runtimeState.upsert({ where: { id: 'default' }, create: { id: 'default', payload: { schemaVersion: 2, persistence: 'relational-primary', compatibilitySnapshotAt: new Date().toISOString(), ...fixtureMarker } }, update: { payload: { schemaVersion: 2, persistence: 'relational-primary', compatibilitySnapshotAt: new Date().toISOString(), ...fixtureMarker } } });
  });
}
