import { BadRequestException, Body, Controller, Delete, Get, Headers, Inject, NotFoundException, Param, Patch, Post, Put, Query, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import fs from 'node:fs';
import type { AIProvider, AIStyle, AIStyleRoute, Emotion, PrivacySetting, Visibility } from '@goodnight/shared-types';
import { normalizeStoreEmotion, StoreService, type AIGenerateInput } from './store.service.js';
import { MonthlyReportService } from './monthly-report.service.js';
import { DAPI_BASE_URL, DAPI_PROVIDER_ID, REMOTE_BACKUP_BASE_URL, REMOTE_BACKUP_PROVIDER_ID } from './remote-ai-provider.service.js';
import { assertNoLegacyLocalModelEndpoint, visualFixtureIdentity } from './runtime-environment.js';

function tokenFrom(header?: string) {
  return header?.replace(/^Bearer\s+/i, '');
}

function normalizedProviderUrl(value?: string) {
  return String(value ?? '').trim().replace(/\/$/, '');
}

function assertProviderMutation(current: Partial<AIProvider>, patch: Partial<AIProvider>) {
  const next = { ...current, ...patch };
  if (next.type === 'local' || next.providerKind === 'ollama') {
    throw new BadRequestException('本地模型已被 DAPI-only 运行策略禁用。');
  }
  if (next.providerKind === 'openai-compatible') {
    assertNoLegacyLocalModelEndpoint(next.baseUrl, 'AI provider');
    const baseUrl = normalizedProviderUrl(next.baseUrl);
    const approvedUrls = new Set([
      normalizedProviderUrl(process.env.DAPI_BASE_URL || process.env.AI_PRIMARY_BASE_URL || DAPI_BASE_URL),
      normalizedProviderUrl(process.env.AI_SECONDARY_BASE_URL || REMOTE_BACKUP_BASE_URL),
    ]);
    if (!approvedUrls.has(baseUrl)) {
      throw new BadRequestException('远程 AI Provider 必须使用已配置的 DAPI 或远程备用地址。');
    }
  }
  if (current.id === DAPI_PROVIDER_ID && normalizedProviderUrl(next.baseUrl) !== normalizedProviderUrl(process.env.DAPI_BASE_URL || process.env.AI_PRIMARY_BASE_URL || DAPI_BASE_URL)) {
    throw new BadRequestException('DAPI 主 Provider 的地址由运行策略固定。');
  }
  if (current.id === DAPI_PROVIDER_ID && patch.enabled === false) {
    throw new BadRequestException('DAPI 主 Provider 由运行策略锁定，不能停用。');
  }
  if (current.id === REMOTE_BACKUP_PROVIDER_ID && normalizedProviderUrl(next.baseUrl) !== normalizedProviderUrl(process.env.AI_SECONDARY_BASE_URL || REMOTE_BACKUP_BASE_URL)) {
    throw new BadRequestException('远程备用 Provider 的地址由运行策略固定。');
  }
}

const apiStartedAt = new Date().toISOString();
const FINGERPRINT = {
  gitCommitSha: process.env.GIT_COMMIT_SHA ?? 'unknown',
  buildTime: process.env.BUILD_TIME ?? apiStartedAt,
  processStartTime: apiStartedAt,
  runtimeInstanceId: process.env.RUNTIME_INSTANCE_ID ?? `api-${process.pid}`,
};

const CONFIG_DEFAULTS = {
  appName: '晚安树洞',
  appShortName: '树洞',
  defaultVisibility: 'PRIVATE',
  defaultPageSize: 10,
  highRiskBlockEnabled: true,
  allowHumanRepliesDefault: true,
  manualReviewThreshold: 0.65,
  localModelFirst: false,
  cloudModelBackup: true,
  aiTimeoutSeconds: 12,
  aiFailoverEnabled: true,
  aiRetryCount: 1,
  logRetentionDays: 30,
  sensitiveContentEncrypted: false,
  scheduledCacheCleanup: true,
  allowMonthlyReportShare: true,
  abnormalNotifyEnabled: false,
  notifyEmail: '',
  dailyDigestEnabled: false,
  dailyDigestTime: '09:00',
};

const EMOTION_TO_STORE: Record<string, Emotion> = {
  焦虑: '焦虑' as Emotion,
  委屈: '委屈' as Emotion,
  失眠: '失眠' as Emotion,
  恋爱: '恋爱' as Emotion,
  工作: '工作' as Emotion,
  难过: '难过' as Emotion,
  孤独: '孤独' as Emotion,
  生气: '生气' as Emotion,
  全部: '全部' as Emotion,
};

const EMOTION_TO_VIEW: Record<string, string> = {
  '鐒﹁檻': '焦虑',
  '濮斿眻': '委屈',
  '澶辯湢': '失眠',
  '鎭嬬埍': '恋爱',
  '宸ヤ綔': '工作',
  '鍏ㄩ儴': '全部',
  焦虑: '焦虑',
  委屈: '委屈',
  失眠: '失眠',
  恋爱: '恋爱',
  工作: '工作',
  难过: '难过',
  孤独: '孤独',
  生气: '生气',
  全部: '全部',
};

function normalizeEmotion(value?: string): Emotion {
  return normalizeStoreEmotion(EMOTION_TO_STORE[value ?? ''] ?? value);
}

function emotionLabel(value?: string) {
  return EMOTION_TO_VIEW[value ?? ''] ?? value ?? '焦虑';
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

@Controller('api')
export class HealthController {
  @Get('health')
  health() {
    return {
      ok: true,
      service: 'goodnight-api',
      generatedAt: new Date().toISOString(),
      fingerprint: FINGERPRINT,
      fixture: visualFixtureIdentity(),
    };
  }
}

@ApiTags('front')
@Controller('api/v1')
export class PublicController {
  constructor(
    @Inject(StoreService) private readonly store: StoreService,
    @Inject(MonthlyReportService) private readonly reports: MonthlyReportService,
  ) {}

  @Get('posts')
  async posts(@Query('emotion') emotion?: string, @Query('mood') mood?: string) {
    const items = await this.store.publicPosts(mood ?? emotion);
    return { items, total: items.length };
  }

  @Get('debug/fingerprint')
  fingerprint() {
    return FINGERPRINT;
  }

  @Get('config')
  config() {
    const item = Object.fromEntries(
      Object.entries(CONFIG_DEFAULTS).map(([key, value]) => [key, this.store.systemSettings[key]?.value ?? value]),
    );
    return { item };
  }

  @Get('tonight')
  tonight() {
    return { item: this.store.tonightHome() };
  }

  @Get('journeys')
  journeys() {
    return { items: this.store.lifeJourneys.filter((item) => item.userId === this.store.getDemoUserId()).map((item) => this.store.journeyDetail(item.id)) };
  }

  @Post('journeys')
  async createJourney(@Body() body: { title?: string; domain?: string; content?: string; facts?: string[]; feelings?: string[]; needs?: string[]; constraints?: string[]; visibility?: Visibility; intensity?: number }) {
    return await this.store.createJourney(body);
  }

  @Get('journeys/:id')
  journey(@Param('id') id: string) {
    return { item: this.store.journeyDetail(id) };
  }

  @Patch('journeys/:id')
  async patchJourney(@Param('id') id: string, @Body() body: { status?: 'active' | 'paused' | 'archived'; title?: string; summary?: string }) {
    if (body.status) return await this.store.updateJourneyStatus(id, body.status);
    const item = this.store.journeyDetail(id).journey;
    if (typeof body.title === 'string' && body.title.trim()) item.title = body.title.trim().slice(0, 120);
    if (typeof body.summary === 'string') item.summary = body.summary.trim().slice(0, 500);
    item.updatedAt = new Date().toISOString();
    await this.store.flush();
    return { item };
  }

  @Patch('journeys/:id/situation')
  async confirmSituation(@Param('id') id: string, @Body() body: { facts?: string[]; feelings?: string[]; needs?: string[]; constraints?: string[]; risks?: string[] }) {
    return await this.store.confirmSituation(id, body);
  }

  @Post('journeys/:id/snapshots')
  async confirmSnapshot(@Param('id') id: string, @Body() body: { facts?: string[]; feelings?: string[]; needs?: string[]; constraints?: string[]; risks?: string[] }) {
    return await this.store.confirmSituation(id, body);
  }

  @Post('journeys/:id/updates')
  async journeyUpdate(@Param('id') id: string, @Body() body: { content?: string; kind?: string }) {
    return await this.store.addJourneyUpdate(id, body);
  }

  @Post('journeys/:id/action-plan')
  async actionPlan(@Param('id') id: string, @Body() body: { content?: string }) {
    return await this.store.generateActionPlan(id, body.content);
  }

  @Post('journeys/:id/actions')
  async createAction(@Param('id') id: string, @Body() body: { title?: string; description?: string; dueAt?: string; reminderAt?: string }) {
    return await this.store.createActionCommitment(id, body);
  }

  @Get('journeys/:id/actions')
  journeyActions(@Param('id') id: string) {
    return { items: this.store.journeyActions(id) };
  }

  @Get('journeys/:id/timeline')
  journeyTimeline(@Param('id') id: string) {
    return { items: this.store.journeyTimeline(id) };
  }

  @Patch('journeys/:id/status')
  async journeyStatus(@Param('id') id: string, @Body() body: { status: 'active' | 'paused' | 'archived' }) {
    return await this.store.updateJourneyStatus(id, body.status);
  }

  @Post('journeys/:id/graduate')
  async graduate(@Param('id') id: string) {
    return await this.store.graduateJourney(id);
  }

  @Post('actions/:id/checkin')
  async actionCheckin(@Param('id') id: string, @Body() body: { status?: string; reflection?: string; result?: string; intensity?: number }) {
    return await this.store.checkinAction(id, body);
  }

  @Post('actions/:id/checkins')
  async actionCheckins(@Param('id') id: string, @Body() body: { status?: string; reflection?: string; result?: string; intensity?: number }) {
    return await this.store.checkinAction(id, body);
  }

  @Get('peers')
  peers() {
    return { item: this.store.peerNetwork() };
  }

  @Post('peer-experiences')
  async createPeerExperience(@Body() body: { journeyId?: string; title?: string; domain?: string; stage?: string; content?: string; tags?: string[]; consented?: boolean }) {
    return await this.store.createPeerExperience(body.journeyId, body);
  }

  @Post('journeys/:id/peer-matches')
  async peerMatches(@Param('id') id: string) {
    return await this.store.suggestPeerMatches(id);
  }

  @Get('journeys/:id/peers')
  journeyPeers(@Param('id') id: string) {
    return { items: this.store.journeyPeers(id) };
  }

  @Patch('peer-matches/:id')
  async peerMatch(@Param('id') id: string, @Body() body: { status: 'requested' | 'connected' | 'declined' | 'blocked' }) {
    return await this.store.updatePeerMatch(id, body.status);
  }

  @Post('decisions')
  async decision(@Body() body: { journeyId?: string; question?: string; options?: string[]; criteria?: string[] }) {
    return await this.store.createDecision(body);
  }

  @Patch('decisions/:id')
  async updateDecision(@Param('id') id: string, @Body() body: { decision?: string; status?: string }) {
    return await this.store.updateDecision(id, body);
  }

  @Post('cooldowns')
  async cooldown(@Body() body: { decisionId?: string; title?: string; reason?: string; hours?: number }) {
    return await this.store.createCooldown(body);
  }

  @Get('cooldown')
  cooldowns() {
    return { items: this.store.cooldownList() };
  }

  @Post('handoffs')
  async handoff(@Body() body: { journeyId?: string; recipient?: string; channel?: string; summary?: string }) {
    return await this.store.createRealityHandoff(body);
  }

  @Post('handoffs/:id/share')
  async shareHandoff(@Param('id') id: string) {
    return await this.store.shareRealityHandoff(id);
  }

  @Get('handoffs')
  handoffs() {
    return { items: this.store.handoffList() };
  }

  @Post('trusted-contacts')
  async trustedContact(@Body() body: { nickname?: string; relation?: string; contactHint?: string }) {
    return await this.store.saveTrustedContact(body);
  }

  @Post('future-messages')
  async futureMessage(@Body() body: { journeyId?: string; content?: string; deliverAt?: string }) {
    return await this.store.saveFutureMessage(body);
  }

  @Post('support-plans')
  async supportPlan(@Body() body: { journeyId?: string; title?: string; plan?: Record<string, unknown> }) {
    return await this.store.saveSupportPlan(body);
  }

  @Get('me/support-plan')
  supportPlanCurrent() {
    return { item: this.store.supportPlan() };
  }

  @Put('me/support-plan')
  async supportPlanPut(@Body() body: { journeyId?: string; title?: string; plan?: Record<string, unknown> }) {
    return await this.store.saveSupportPlan(body);
  }

  @Get('me/recovery')
  recovery() {
    return { items: this.store.recoveryList() };
  }

  @Get('memory')
  memories() {
    return { items: this.store.memoryItems.filter((item) => item.userId === this.store.getDemoUserId() && !item.deletedAt && Date.parse(item.expiresAt) > Date.now()) };
  }

  @Get('me/memories')
  memoriesAlias() {
    return this.memories();
  }

  @Post('memory')
  async memory(@Body() body: { journeyId?: string; category?: string; content?: string; days?: number }) {
    return await this.store.saveMemory(body);
  }

  @Delete('memory/:id')
  async deleteMemory(@Param('id') id: string) {
    return await this.store.deleteMemory(id);
  }

  @Delete('me/memories/:id')
  async deleteMemoryAlias(@Param('id') id: string) {
    return await this.store.deleteMemory(id);
  }

  @Get('posts/:id')
  post(@Param('id') id: string) {
    return { item: this.store.getPost(id, true) };
  }

  @Post('posts/:id/hug')
  async hug(@Param('id') id: string) {
    const post = this.store.getPost(id, true);
    post.hugCount += 1;
    this.store.persist();
    await this.store.flush();
    return { item: post };
  }

  @Delete('posts/:id/hug')
  async unHug(@Param('id') id: string) {
    const post = this.store.getPost(id, true);
    post.hugCount = Math.max(0, post.hugCount - 1);
    this.store.persist();
    await this.store.flush();
    return { item: post };
  }

  @Post('posts/:id/hugs')
  hugs(@Param('id') id: string) {
    return this.hug(id);
  }

  @Post('posts/:id/favorite')
  async favorite(@Param('id') id: string) {
    const post = this.store.getPost(id, true);
    this.store.addFavorite(this.store.getDemoUserId(), 'post', id);
    await this.store.persistAndFlush();
    return { item: this.store.decoratePost(post) };
  }

  @Delete('posts/:id/favorite')
  async deleteFavorite(@Param('id') id: string) {
    const post = this.store.getPost(id, true);
    this.store.removeFavoriteByTarget(this.store.getDemoUserId(), 'post', id);
    await this.store.persistAndFlush();
    return { item: this.store.decoratePost(post) };
  }

  @Post('posts/:id/report')
  async report(@Param('id') id: string) {
    const post = this.store.getPost(id, true);
    post.reportCount += 1;
    this.store.persist();
    await this.store.flush();
    return { item: post };
  }

  @Post('posts/:id/hide')
  async hideForCurrentUser(@Param('id') id: string) {
    const item = await this.store.hidePostForCurrentUser(id);
    return { ok: true, item };
  }

  @Delete('posts/:id')
  async deletePost(@Param('id') id: string) {
    const post = this.store.getPost(id, true);
    post.status = 'deleted';
    this.store.persist();
    await this.store.flush();
    return { ok: true };
  }

  @Post('posts')
  async createPost(@Body() body: { content: string; emotion?: Emotion; mood?: string; visibility?: Visibility; style?: AIStyle; replyStyles?: AIStyle[]; assetIds?: string[]; journeyId?: string }) {
    return this.store.createMood({
      content: body.content,
      emotion: normalizeEmotion(body.emotion ?? body.mood),
      visibility: body.visibility ?? 'PUBLIC',
      style: body.style,
      replyStyles: body.replyStyles,
      assetIds: body.assetIds,
      journeyId: body.journeyId,
    });
  }

  @Post('moods')
  async mood(@Body() body: { content: string; emotion?: Emotion; mood?: string; visibility: Visibility; style?: AIStyle; replyStyle?: AIStyle; replyStyles?: AIStyle[]; assetIds?: string[]; journeyId?: string }) {
    return this.store.createMood({
      ...body,
      emotion: normalizeEmotion(body.emotion ?? body.mood),
      style: body.style ?? body.replyStyle,
      replyStyles: body.replyStyles ?? (body.replyStyle ? [body.replyStyle] : undefined),
      journeyId: body.journeyId,
    });
  }

  @Post('moods/:id/queue-ai-replies')
  queueReplies(@Param('id') id: string) {
    const mood = this.store.moods.find((item) => item.id === id);
    const post = this.store.posts.find((item) => item.moodId === id);
    const styles: AIStyle[] = ['warm', 'rational', 'light', 'clear', 'poetic'];
    const jobs = styles.map((style) => this.store.queueAI({
      taskType: 'public_ai_reply',
      userId: mood?.userId ?? this.store.getDemoUserId(),
      sourceId: id,
      style,
      content: mood?.content ?? '',
    }));
    if (post) {
      void Promise.all(jobs.map((job) => this.store.waitForAiJob(job.id))).then((completed) => {
        for (const job of completed.filter((item) => ['succeeded', 'fallback'].includes(item.status))) {
          this.store.replies.unshift({ id: `reply_${job.id}`, postId: post.id, type: 'AI', style: job.style, content: job.result, status: 'published', riskLevel: 'low', likeCount: 0, createdAt: job.createdAt });
        }
        post.replyCount = this.store.replies.filter((item) => item.postId === post.id && item.status === 'published').length;
        this.store.persist();
      });
    }
    return { jobs, jobIds: jobs.map((job) => job.id), status: 'queued' };
  }

  @Get('posts/:id/replies')
  replies(@Param('id') id: string) {
    return { items: this.store.replies.filter((item) => item.postId === id && item.status === 'published') };
  }

  @Get('reply-presets')
  presets() {
    const now = new Date().toISOString();
    const required = ['抱抱你', '我懂你的感受', '会好起来的', '今晚早点休息', '你已经很棒了'].map((text, index) => ({
      id: `first5_preset_${index + 1}`,
      text,
      scene: 'comfort',
      sortOrder: index + 1,
      enabled: true,
      createdAt: now,
    }));
    const enabled = this.store.replyPresets.filter((item) => item.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
    const items = [...required, ...enabled].reduce<typeof enabled>((acc, item) => {
      if (!acc.some((seen) => seen.text === item.text)) acc.push(item);
      return acc;
    }, []);
    return { items };
  }

  @Post('posts/:id/replies')
  async reply(@Param('id') id: string, @Body() body: { content: string; anonymous?: boolean; visibility?: string }) {
    const item = this.store.createReply(id, body);
    await this.store.flush();
    return { item };
  }

  @Post('replies/:id/like')
  async likeReply(@Param('id') id: string) {
    return { item: await this.store.likeReply(id) };
  }

  @Post('ai/generate')
  aiGenerate(@Body() body: AIGenerateInput) {
    const job = this.store.queueAI(body);
    return { jobId: job.id, status: job.status, job };
  }

  @Post('ai/tasks')
  aiTask(@Body() body: AIGenerateInput) {
    const job = this.store.queueAI(body);
    return { jobId: job.id, status: job.status, job };
  }

  @Get('ai/tasks/latest')
  latestAiTask(@Query('taskType') taskType = 'negative_rewrite') {
    const job = this.store.latestSuccessfulAiJob(this.store.getDemoUserId(), taskType);
    return {
      item: job ?? null,
      jobId: job?.id ?? null,
      status: job?.status ?? null,
      result: job?.result ?? '',
    };
  }

  @Get('ai/tasks/:id')
  aiTaskStatus(@Param('id') id: string) {
    const job = this.store.aiJobs.find((item) => item.id === id);
    if (!job) throw new BadRequestException('AI 任务不存在');
    return { jobId: job.id, status: job.status, job, result: job.result, structured: job.structuredResult ?? {} };
  }

  @Get('letters/today')
  today() {
    const userId = this.store.getDemoUserId();
    const letter = this.store.letters.find((item) => item.userId === userId);
    const sourceId = letter?.sourceMoodId ?? this.store.moods.find((item) => item.userId === userId)?.id ?? 'mood_1';
    const source = this.store.resolveSourceContent(sourceId) || this.store.diaries.find((item) => item.userId === userId)?.content || '今天也辛苦了';
    if (!letter || !letter.content || /今天的你没有被焦虑打败|我会陪你把这件事放轻一点/.test(letter.content)) {
      const queued = this.store.queueLetterGeneration({ userId, sourceMoodId: sourceId, style: letter?.style ?? 'warm', content: source, letter });
      return { item: this.store.decorateLetter(queued.letter), jobId: queued.job.id, status: queued.job.status };
    }
    return { item: this.store.decorateLetter(letter) };
  }

  @Get('letters')
  letters(@Query('status') status?: string) {
    const userId = this.store.getDemoUserId();
    let items = this.store.letters.filter((item) => item.userId === userId);
    if (status === 'unread') items = items.filter((item) => item.status === 'unread');
    if (status === 'favorited' || status === 'fav') items = items.filter((item) => this.store.isFavorite(userId, 'letter', item.id));
    return { items: items.map((item) => this.store.decorateLetter(item)) };
  }

  @Get('letters/:id')
  letter(@Param('id') id: string) {
    const letter = this.store.letters.find((item) => item.id === id);
    return { item: letter ? this.store.decorateLetter(letter) : undefined };
  }

  @Patch('letters/:id/read')
  readLetter(@Param('id') id: string) {
    const letter = this.store.letters.find((item) => item.id === id);
    if (!letter) return { item: null };
    letter.status = 'read';
    this.store.persist();
    return { item: letter };
  }

  @Post('letters/:id/like')
  likeLetter(@Param('id') id: string) {
    const letter = this.store.letters.find((item) => item.id === id);
    if (!letter) return { item: null };
    letter.likeCount = (letter.likeCount ?? 0) + 1;
    this.store.persist();
    return { item: letter };
  }

  @Post('letters/:id/regenerate')
  regenerate(@Param('id') id: string, @Body() body: { style?: AIStyle; simulatePrimaryFail?: boolean; simulateBackupFail?: boolean }) {
    const letter = this.store.letters.find((item) => item.id === id) ?? this.store.letters[0];
    const source = this.store.resolveSourceContent(letter.sourceMoodId) || this.store.diaries.find((item) => item.userId === letter.userId)?.content || letter.content;
    const job = this.store.queueAI({
      taskType: 'today_letter',
      content: source,
      mood: body.style === 'rational' ? '焦虑' : undefined,
      style: body.style ?? letter.style,
      userId: letter.userId,
      sourceId: letter.id,
      simulatePrimaryFail: body.simulatePrimaryFail,
      simulateBackupFail: body.simulateBackupFail,
    });
    void this.store.waitForAiJob(job.id).then((completed) => {
      letter.style = body.style ?? letter.style;
      letter.content = completed.result;
      letter.status = 'unread';
      this.store.persist();
    });
    return { item: letter, jobId: job.id, status: job.status, job };
  }

  @Post('letters/generate')
  generateLetter(@Body() body: { style?: AIStyle; simulatePrimaryFail?: boolean; simulateBackupFail?: boolean }) {
    const userId = this.store.getDemoUserId();
    const letter = this.store.letters.find((item) => item.userId === userId);
    if (letter) return this.regenerate(letter.id, body);
    const queued = this.store.queueLetterGeneration({ userId, sourceMoodId: 'mood_1', style: body.style ?? 'warm', content: '今天也辛苦了' });
    return { item: queued.letter, jobId: queued.job.id, status: queued.job.status, job: queued.job };
  }

  @Post('letters/:id/poster')
  async poster(@Param('id') id: string) {
    const letter = this.store.letters.find((item) => item.id === id);
    if (!letter) throw new BadRequestException('回信不存在');
    const asset = await this.store.createLetterPoster(letter);
    return { posterUrl: asset.url, asset, permission: 'album-required' };
  }

  @Post('share-image')
  async shareImage(@Body() body: { id?: string; type?: string; month?: string }) {
    const letter = body.id ? this.store.letters.find((item) => item.id === body.id) : undefined;
    if (body.type === 'letter' || letter) {
      if (!letter) throw new BadRequestException('回信不存在');
      const asset = await this.store.createLetterPoster(letter);
      return { posterUrl: asset.url, asset, permission: 'album-required' };
    }
    if (body.type === 'report' || body.month) return await this.reportPoster(body.month ?? currentMonth());
    throw new BadRequestException('请指定要生成的回信或月报分享图');
  }

  @Post('letters/:id/save-to-diary')
  async saveToDiary(@Param('id') id: string) {
    const letter = this.store.letters.find((item) => item.id === id)!;
    letter.savedToDiary = true;
    this.store.diaries.unshift({ id: `diary_${Date.now()}`, userId: letter.userId, letterId: id, emotion: '委屈', content: letter.content, hasLetter: true, createdAt: new Date().toISOString() });
    this.store.persist();
    await this.store.flush();
    return { item: letter };
  }

  @Post('letters/:id/favorite')
  async favoriteLetter(@Param('id') id: string) {
    const userId = this.store.getDemoUserId();
    const letter = this.store.letters.find((item) => item.id === id && item.userId === userId);
    if (!letter) throw new NotFoundException('回信不存在');
    this.store.addFavorite(userId, 'letter', id);
    await this.store.persistAndFlush();
    return { item: this.store.decorateLetter(letter) };
  }

  @Delete('letters/:id/favorite')
  async deleteFavoriteLetter(@Param('id') id: string) {
    const userId = this.store.getDemoUserId();
    const letter = this.store.letters.find((item) => item.id === id && item.userId === userId);
    if (!letter) throw new NotFoundException('回信不存在');
    this.store.removeFavoriteByTarget(userId, 'letter', id);
    await this.store.persistAndFlush();
    return { ok: true, item: this.store.decorateLetter(letter) };
  }

  @Get('tools')
  tools() {
    const items = [
      { id: 'letter', name: '一键生成温柔回信', sortOrder: 1, enabled: true },
      { id: 'decompose', name: '情绪拆解', sortOrder: 2, enabled: true },
      { id: 'rewrite', name: '负面改写', sortOrder: 3, enabled: true },
      { id: 'rant', name: '发疯文案', sortOrder: 4, enabled: true },
      { id: 'healing-quote', name: '治愈短句', sortOrder: 5, enabled: true },
      { id: 'sleep-comfort', name: '失眠安慰', sortOrder: 6, enabled: true },
      { id: 'work-support', name: '工作破防', sortOrder: 7, enabled: true },
      { id: 'future-letter', name: '写给未来的自己', sortOrder: 8, enabled: true },
      { id: 'report', name: '情绪月报', sortOrder: 9, enabled: true },
    ];
    return { items };
  }

  @Post('tools/emotion-decompose')
  decompose(@Body() body: { content: string }) {
    const job = this.store.queueAI({
      taskType: 'breakdown',
      content: body.content,
      style: 'rational',
      userId: this.store.getDemoUserId(),
      sourceId: `task_${Date.now()}`,
    });
    return { taskId: job.id, jobId: job.id, status: job.status, job };
  }

  @Post('ai/tools/breakdown')
  aiBreakdown(@Body() body: { content: string; mood?: string; style?: AIStyle }) {
    const job = this.store.queueAI({
      taskType: 'breakdown',
      content: body.content,
      mood: body.mood,
      style: body.style ?? 'rational',
      userId: this.store.getDemoUserId(),
      sourceId: `task_${Date.now()}`,
    });
    return { taskId: job.id, jobId: job.id, status: job.status, job };
  }

  @Post('tools/decompose')
  decomposeAlias(@Body() body: { content: string }) {
    return this.decompose(body);
  }

  @Post('tools/run')
  runTool(@Body() body: { toolId?: string; type?: string; content?: string; input?: string; style?: AIStyle }) {
    const toolType = body.type ?? body.toolId ?? 'rewrite';
    const text = body.input ?? body.content ?? '';
    const style = body.style ?? (toolType.includes('rewrite') ? 'clear' : toolType.includes('future') ? 'poetic' : toolType.includes('work') ? 'rational' : toolType.includes('rant') ? 'light' : 'warm');
    const job = this.store.queueAI({
      userId: this.store.getDemoUserId(),
      sourceId: `tool_${Date.now()}`,
      taskType: toolType,
      style,
      content: text || toolType,
    });
    return { taskId: job.id, jobId: job.id, toolId: toolType, type: toolType, status: job.status, job };
  }

  @Post('tools/rewrite')
  rewriteTool(@Body() body: { content?: string; input?: string; style?: AIStyle }) {
    return this.runTool({ ...body, type: 'rewrite' });
  }

  @Post('tools/rant')
  rantTool(@Body() body: { content?: string; input?: string; style?: AIStyle }) {
    return this.runTool({ ...body, type: 'rant' });
  }

  @Post('tools/heal')
  healTool(@Body() body: { content?: string; input?: string; style?: AIStyle }) {
    return this.runTool({ ...body, type: 'healing-quote' });
  }

  @Post('tools/sleep')
  sleepTool(@Body() body: { content?: string; input?: string; style?: AIStyle }) {
    return this.runTool({ ...body, type: 'sleep-comfort' });
  }

  @Post('tools/work')
  workTool(@Body() body: { content?: string; input?: string; style?: AIStyle }) {
    return this.runTool({ ...body, type: 'work-support' });
  }

  @Post('tools/future')
  futureTool(@Body() body: { content?: string; input?: string; style?: AIStyle }) {
    return this.runTool({ ...body, type: 'future-letter' });
  }

  @Post('tools/emotion-decompose/:taskId/save')
  saveDecompose(@Param('taskId') taskId: string) {
    const job = this.store.aiJobs.find((item) => item.id === taskId);
    const structured = (job?.traceJson.find((item) => typeof item === 'object' && item && 'structured' in item) as { structured?: unknown } | undefined)?.structured;
    this.store.diaries.unshift({
      id: `diary_${Date.now()}`,
      userId: this.store.getDemoUserId(),
      emotion: '焦虑',
      content: job?.result ?? `情绪拆解结果 ${taskId}`,
      hasLetter: false,
      source: 'tool-decompose',
      toolResult: structured,
      createdAt: new Date().toISOString(),
    });
    this.store.persist();
    return { ok: true };
  }

  @Get('me/profile')
  profile() {
    return { item: this.store.users[0] };
  }

  @Get('me/stats')
  stats() {
    const month = currentMonth();
    return {
      item: {
        diaryCount: this.store.diaries.length,
        letterCount: this.store.letters.length,
        favoriteCount: this.store.favorites.filter((item) => item.userId === this.store.getDemoUserId()).length,
        growthDays: 21,
        streakDays: Math.min(7, Math.max(1, this.store.diaries.length + 3)),
        replyCount: this.store.letters.length,
        monthlyDiaryCount: this.store.diaries.filter((item) => item.createdAt.startsWith(month)).length,
      },
    };
  }

  @Get('me/growth-card')
  growthCard() {
    return { item: { title: '情绪成长卡', streak: 7, sentence: '你在认真照顾自己。' } };
  }

  @Delete('me/data')
  async clearData() {
    const userId = this.store.getDemoUserId();
    this.store.clearFavoritesForUser(userId);
    this.store.diaries = this.store.diaries.filter((item) => item.userId !== userId);
    this.store.letters = this.store.letters.filter((item) => item.userId !== userId);
    await this.store.persistAndFlush();
    return { ok: true };
  }

  @Post('diaries')
  async createDiary(@Body() body: { content: string; emotion?: string; letterId?: string; hasLetter?: boolean; source?: string; toolResult?: unknown }) {
    const diary = {
      id: `diary_${Date.now()}`,
      userId: this.store.getDemoUserId(),
      letterId: body.letterId,
      emotion: normalizeEmotion(body.emotion),
      content: body.content?.trim() || '今天认真照顾了自己的心情。',
      hasLetter: Boolean(body.hasLetter || body.letterId),
      source: body.source ?? 'manual',
      toolResult: body.toolResult,
      createdAt: new Date().toISOString(),
    };
    this.store.diaries.unshift(diary);
    this.store.persist();
    await this.store.flush();
    return { item: diary };
  }

  @Post('diaries/export')
  async exportDiaries() {
    return { item: await this.store.createDiaryExport(this.store.getDemoUserId()) };
  }

  @Get('exports/:assetId/download')
  downloadDiaryExport(@Param('assetId') assetId: string) {
    const download = this.store.getDiaryExportDownload(assetId, this.store.getDemoUserId());
    return new StreamableFile(fs.createReadStream(download.filePath), {
      type: download.asset.mimeType,
      length: download.asset.size,
      disposition: `attachment; filename="${download.filename}"`,
    });
  }

  /**
   * The private-mood publishing path normally creates a Diary immediately.
   * Older persisted records can legitimately contain an active private Mood
   * without that companion row (for example after an interrupted migration).
   * Present those records as a read-only diary projection instead of making
   * the diary index silently empty or inserting duplicate business records.
   */
  private diaryEntries(userId: string) {
    const persisted = this.store.diaries.filter((item) => item.userId === userId);
    const linkedMoodIds = new Set(persisted.map((item) => item.moodId).filter((item): item is string => Boolean(item)));
    const projectedMoods = this.store.moods
      .filter((item) => item.userId === userId && item.visibility === 'PRIVATE' && item.status === 'active' && !linkedMoodIds.has(item.id))
      .map((mood) => {
        const letter = this.store.letters.find((item) => item.userId === userId && item.sourceMoodId === mood.id);
        const hasLetter = Boolean(letter && (!letter.generationStatus || ['succeeded', 'fallback'].includes(letter.generationStatus)));
        return {
          id: mood.id,
          userId: mood.userId,
          moodId: mood.id,
          letterId: hasLetter ? letter?.id : undefined,
          emotion: mood.emotion,
          content: mood.content,
          hasLetter,
          source: 'private-mood-projection',
          attachmentIds: mood.attachmentIds ?? [],
          createdAt: mood.createdAt,
        };
      });
    return [...persisted, ...projectedMoods].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private decorateDiaryEntry(item: { emotion: Emotion; moodId?: string; attachmentIds?: string[] }) {
    return {
      ...item,
      attachments: this.store.mediaByIds(item.attachmentIds ?? this.store.moods.find((mood) => mood.id === item.moodId)?.attachmentIds ?? []),
      emotionLabel: emotionLabel(item.emotion),
    };
  }

  @Get('diaries')
  diaries(@Query('month') month?: string, @Query('emotion') emotion?: string, @Query('hasLetter') hasLetter?: string) {
    const normalizedEmotion = emotion ? normalizeEmotion(emotion) : '';
    const items = this.diaryEntries(this.store.getDemoUserId())
      .filter((item) => !month || item.createdAt.startsWith(month))
      .filter((item) => (!emotion || emotion === '全部' || emotion === '鍏ㄩ儴' || item.emotion === normalizedEmotion))
      .filter((item) => (!hasLetter || String(item.hasLetter) === hasLetter))
      .map((item) => this.decorateDiaryEntry(item));
    return { items };
  }

  @Get('diaries/months')
  diaryMonths() {
    const items = [...new Set(this.diaryEntries(this.store.getDemoUserId()).map((item) => item.createdAt.slice(0, 7)).filter(Boolean))]
      .sort((left, right) => right.localeCompare(left));
    return { items };
  }

  @Get('me/diaries')
  meDiaries(@Query('month') month?: string, @Query('emotion') emotion?: string, @Query('hasLetter') hasLetter?: string) {
    return this.diaries(month, emotion, hasLetter);
  }

  @Get('me/diaries/months')
  meDiaryMonths() {
    return this.diaryMonths();
  }

  @Post('me/diaries')
  createMeDiary(@Body() body: { content: string; emotion?: string; letterId?: string; hasLetter?: boolean; source?: string; toolResult?: unknown }) {
    return this.createDiary(body);
  }

  @Get('diaries/:id')
  diary(@Param('id') id: string) {
    const item = this.diaryEntries(this.store.getDemoUserId()).find((diary) => diary.id === id);
    if (!item) return { item: null };
    return { item: this.decorateDiaryEntry(item) };
  }

  @Delete('diaries/:id')
  deleteDiary(@Param('id') id: string) {
    this.store.diaries = this.store.diaries.filter((item) => item.id !== id);
    return { ok: true };
  }

  @Get('favorites')
  favorites(@Query('type') type?: string) {
    const userId = this.store.getDemoUserId();
    const items = this.store.favorites
      .filter((item) => item.userId === userId && (!type || item.targetType === type))
      .map((item) => {
        const post = item.targetType === 'post' ? this.store.posts.find((postItem) => postItem.id === item.targetId) : undefined;
        const letter = item.targetType === 'letter' ? this.store.letters.find((letterItem) => letterItem.id === item.targetId) : undefined;
        const diary = item.targetType === 'diary' ? this.store.diaries.find((diaryItem) => diaryItem.id === item.targetId) : undefined;
        return {
          ...item,
          title: letter?.title ?? (post ? '收藏的树洞' : diary ? '收藏的日记' : '收藏内容'),
          preview: letter?.content ?? post?.content ?? diary?.content ?? item.targetId,
          emotion: post?.emotion ? emotionLabel(post.emotion) : diary?.emotion ? emotionLabel(diary.emotion) : undefined,
        };
      });
    return { items };
  }

  @Get('me/favorites')
  meFavorites(@Query('type') type?: string) {
    return this.favorites(type);
  }

  @Get('me/letters')
  meLetters(@Query('status') status?: string) {
    return this.letters(status);
  }

  @Delete('favorites/:id')
  async deleteFavoriteItem(@Param('id') id: string) {
    this.store.removeFavoriteById(this.store.getDemoUserId(), id);
    await this.store.persistAndFlush();
    return { ok: true };
  }

  @Get('reports/monthly')
  async monthly(@Query('month') month?: string) {
    return await this.reports.monthly(month);
  }

  @Get('reports/monthly/months')
  async monthlyMonths() {
    return await this.reports.availableMonths();
  }

  @Get('report/month')
  async monthReportAlias(@Query('month') month?: string) {
    return await this.monthly(month);
  }

  @Get('me/month-report')
  async meMonthReport(@Query('month') month?: string) {
    return await this.monthly(month);
  }

  @Get('reports/monthly/:month/advice')
  async advice(@Param('month') month: string) {
    return await this.reports.advice(month);
  }

  @Post('reports/monthly/:month/poster')
  async reportPoster(@Param('month') month: string) {
    return await this.reports.poster(month);
  }

  @Post('report/share-image')
  async reportShareImage(@Body() body: { month?: string }) {
    return await this.reportPoster(body.month ?? new Date().toISOString().slice(0, 7));
  }

  @Get('settings/privacy')
  privacy() {
    return { item: this.store.privacySettings[this.store.getDemoUserId()] };
  }

  @Get('me/privacy')
  mePrivacy() {
    return this.privacy();
  }

  @Get('privacy-settings')
  privacySettingsAlias() {
    return this.privacy();
  }

  @Put('settings/privacy')
  async updatePrivacy(@Body() body: Partial<PrivacySetting>) {
    this.store.privacySettings[this.store.getDemoUserId()] = { ...this.store.privacySettings[this.store.getDemoUserId()], ...body };
    this.store.persist();
    await this.store.flush();
    return { item: this.store.privacySettings[this.store.getDemoUserId()] };
  }

  @Patch('settings/privacy')
  async patchPrivacy(@Body() body: Partial<PrivacySetting>) {
    return await this.updatePrivacy(body);
  }

  @Patch('me/privacy')
  async patchMePrivacy(@Body() body: Partial<PrivacySetting>) {
    return await this.updatePrivacy(body);
  }

  @Patch('privacy-settings')
  async patchPrivacyAlias(@Body() body: Partial<PrivacySetting>) {
    return await this.updatePrivacy(body);
  }

  @Get('feedback/categories')
  categories() {
    return { items: this.store.feedbackCategories.filter((item) => item.enabled).sort((a, b) => a.sortOrder - b.sortOrder) };
  }

  @Get('feedback/faqs')
  faqs() {
    // The frontend reads exactly the same records the admin CRUD writes.
    // Do not inject display-only fallback questions here: a disabled/deleted FAQ
    // must disappear after the next frontend reload.
    return { items: this.store.faqs.filter((item) => item.enabled).slice().sort((a, b) => a.sortOrder - b.sortOrder) };
  }

  @Post('feedback')
  async feedback(@Body() body: { categoryId?: string; content: string; sourcePage?: string; assetIds?: string[]; images?: string[] }) {
    const ticket = await this.store.createFeedbackTicket({
      categoryId: body.categoryId,
      content: body.content,
      sourcePage: body.sourcePage,
      // Legacy callers can still submit asset IDs through images, but raw URLs
      // are rejected by StoreService instead of being treated as screenshots.
      assetIds: body.assetIds ?? body.images,
    });
    return { item: this.store.decorateFeedbackTicket(ticket) };
  }

  @Get('feedback')
  feedbackTickets() {
    return { items: this.store.feedbackTickets.filter((item) => item.userId === this.store.getDemoUserId()).map((item) => this.store.decorateFeedbackTicket(item)) };
  }

  @Post('media/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadMedia(@UploadedFile() file?: Express.Multer.File, @Body('usageType') usageType?: string) {
    if (!file) throw new BadRequestException('请选择图片文件');
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowed.has(file.mimetype)) throw new BadRequestException('仅支持 JPEG、PNG 或 WebP 图片');
    return { item: await this.store.createMediaAsset(file, usageType ?? 'mood') };
  }

  @Delete('media/:id')
  async deleteMedia(@Param('id') id: string) {
    await this.store.deleteMediaAsset(id);
    return { ok: true };
  }

  // Legacy metadata-only upload endpoints are intentionally disabled: an uploaded asset must have a real file.
  @Post('upload')
  uploadAlias() { throw new BadRequestException('请使用 multipart /api/v1/media/upload 上传真实文件'); }

  @Post('uploads')
  uploadsAlias() { throw new BadRequestException('请使用 multipart /api/v1/media/upload 上传真实文件'); }

  @Post('export/diaries')
  exportDiariesAlias() {
    return this.exportDiaries();
  }

  @Post('share/image')
  shareImageAlias(@Body() body: { id?: string; type?: string }) {
    return this.shareImage(body);
  }

  @Post('assets/complete')
  complete() { throw new BadRequestException('请使用 multipart /api/v1/media/upload 上传真实文件'); }
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('api/admin/v1')
export class AdminController {
  constructor(@Inject(StoreService) private readonly store: StoreService) {}

  private admin(auth?: string) {
    return this.store.verifyToken(tokenFrom(auth));
  }

  private list<T>(items: T[], pageValue?: string | number, pageSizeValue?: string | number) {
    const page = Math.max(1, Number(pageValue ?? 1) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(pageSizeValue ?? 20) || 20));
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), page, pageSize, total, totalPages };
  }

  private dashboardData() {
    const today = new Date().toISOString().slice(0, 10);
    const dayKeys = Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - index));
      return day.toISOString().slice(0, 10);
    });
    const activeTrend = dayKeys.map((day) => ({
      date: day,
      users: this.store.users.filter((item) => item.createdAt?.startsWith(day)).length,
      posts: this.store.posts.filter((item) => item.createdAt?.startsWith(day)).length,
      replies: this.store.replies.filter((item) => item.createdAt?.startsWith(day)).length,
      aiJobs: this.store.aiJobs.filter((item) => item.createdAt?.startsWith(day)).length,
    }));
    const emotionDistribution = this.store.posts.reduce<Record<string, number>>((acc, post) => {
      acc[post.emotion] = (acc[post.emotion] ?? 0) + 1;
      return acc;
    }, {});
    const successfulJobs = this.store.aiJobs.filter((job) => ['succeeded', 'fallback'].includes(job.status)).length;
    const todayJobs = this.store.aiJobs.filter((job) => job.createdAt?.startsWith(today));
    const completedJobs = this.store.aiJobs.filter((job) => ['succeeded', 'failed', 'fallback'].includes(job.status));
    const failedJobs = completedJobs.filter((job) => job.status === 'failed');
    const fallbackJobs = completedJobs.filter((job) => job.status === 'fallback');
    const ollama = this.store.ollamaStatus();
    return {
      todayUsers: this.store.users.filter((u) => u.createdAt?.startsWith(today)).length,
      todayPosts: this.store.posts.filter((p) => p.createdAt?.startsWith(today)).length,
      pendingReviews: this.store.posts.filter((p) => p.reviewStatus === 'pending_review').length + this.store.replies.filter((r) => r.status === 'pending_review').length,
      journeySummary: {
        total: this.store.lifeJourneys.length,
        active: this.store.lifeJourneys.filter((item) => item.status === 'active').length,
        actions: this.store.actionCommitments.filter((item) => item.status === 'active').length,
        dueCheckins: this.store.outcomeCheckins.filter((item) => item.status === 'pending' && (!item.dueAt || Date.parse(item.dueAt) <= Date.now())).length,
        peerExperiences: this.store.peerExperiences.filter((item) => item.status === 'published').length,
        safetyEvents: this.store.safetyEvents.filter((item) => item.level === 'high').length,
        supportPlans: this.store.personalSupportPlans.filter((item) => item.active).length,
      },
      aiSuccessRate: this.store.aiJobs.length ? Math.round((successfulJobs / this.store.aiJobs.length) * 1000) / 10 : 100,
      activeTrend,
      emotionDistribution,
      latestPosts: this.store.posts.slice(0, 8),
      aiJobs: this.store.aiJobs.slice(0, 8),
      aiSummary: {
        total: this.store.aiJobs.length,
        succeeded: this.store.aiJobs.filter((job) => job.status === 'succeeded').length,
        fallback: this.store.aiJobs.filter((job) => job.status === 'fallback').length,
        failed: this.store.aiJobs.filter((job) => job.status === 'failed').length,
      },
      aiMonitor: {
        ollamaOnline: ollama.online,
        localModelCount: ollama.modelCount,
        todayCalls: todayJobs.length,
        successRate: completedJobs.length ? Math.round(((completedJobs.length - failedJobs.length) / completedJobs.length) * 1000) / 10 : 100,
        failureRate: completedJobs.length ? Math.round((failedJobs.length / completedJobs.length) * 1000) / 10 : 0,
        averageDurationMs: completedJobs.length ? Math.round(completedJobs.reduce((sum, job) => sum + job.durationMs, 0) / completedJobs.length) : 0,
        fallbackCount: fallbackJobs.length,
        lastCheckedAt: ollama.lastCheckedAt,
      },
    };
  }

  @Post('auth/login')
  async login(@Body() body: { username: string; password: string }) {
    const result = this.store.login(body.username, body.password);
    await this.store.flush();
    return result;
  }

  @Post('login')
  async loginAlias(@Body() body: { username: string; password: string }) {
    return await this.login(body);
  }

  @Post('auth/logout')
  logout() {
    return { ok: true };
  }

  @Get('auth/me')
  authMe(@Headers('authorization') auth?: string) {
    return this.me(auth);
  }

  @Get('me')
  me(@Headers('authorization') auth?: string) {
    const admin = this.admin(auth);
    return { item: { id: admin.id, username: admin.username, displayName: admin.displayName, role: admin.role } };
  }

  @Get('dashboard/overview')
  overview() {
    return { item: this.dashboardData() };
  }

  @Get('dashboard')
  dashboardAlias() {
    return this.overview();
  }

  @Get('dashboard/summary')
  dashboardSummary() {
    const item = this.dashboardData();
    return { item: { todayUsers: item.todayUsers, todayPosts: item.todayPosts, pendingReviews: item.pendingReviews, aiSuccessRate: item.aiSuccessRate } };
  }

  @Get('dashboard/activity')
  dashboardActivity() {
    return { items: this.dashboardData().activeTrend };
  }

  @Get('dashboard/emotion-distribution')
  dashboardEmotionDistribution() {
    return { item: this.dashboardData().emotionDistribution };
  }

  @Get('journeys')
  adminJourneys(@Headers('authorization') auth: string, @Query('status') status?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    this.admin(auth);
    const items = this.store.lifeJourneys.filter((item) => !status || status === 'all' || item.status === status).map((item) => ({ ...item, updates: this.store.journeyUpdates.filter((update) => update.journeyId === item.id).length, actions: this.store.actionCommitments.filter((action) => action.journeyId === item.id).length }));
    return this.list(items, page, pageSize);
  }

  @Get('actions')
  adminActions(@Headers('authorization') auth: string, @Query('status') status?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    this.admin(auth);
    return this.list(this.store.actionCommitments.filter((item) => !status || status === 'all' || item.status === status), page, pageSize);
  }

  @Get('checkins')
  adminCheckins(@Headers('authorization') auth: string, @Query('status') status?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    this.admin(auth);
    return this.list(this.store.outcomeCheckins.filter((item) => !status || status === 'all' || item.status === status), page, pageSize);
  }

  @Get('peer-experiences')
  adminPeerExperiences(@Headers('authorization') auth: string, @Query('status') status?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    this.admin(auth);
    const items = this.store.peerExperiences.filter((item) => !status || status === 'all' || item.status === status);
    return this.list(items, page, pageSize);
  }

  @Patch('peer-experiences/:id/review')
  async reviewPeerExperience(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: { status: 'published' | 'hidden' | 'rejected' }) {
    const admin = this.admin(auth);
    const item = this.store.peerExperiences.find((experience) => experience.id === id);
    if (!item) throw new NotFoundException('同路经历不存在');
    const before = { ...item };
    item.status = body.status;
    this.store.audit(admin.id, 'PEER_EXPERIENCE_REVIEW', 'PeerExperience', id, before, item);
    await this.store.persistAndFlush();
    return { item };
  }

  @Get('peer-matches')
  adminPeerMatches(@Headers('authorization') auth: string, @Query('status') status?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    this.admin(auth);
    const items = this.store.peerMatches.filter((item) => !status || status === 'all' || item.status === status);
    return this.list(items, page, pageSize);
  }

  @Get('safety/events')
  safetyEvents(@Headers('authorization') auth: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    this.admin(auth);
    return this.list(this.store.safetyEvents, page, pageSize);
  }

  @Get('support/plans')
  supportPlans(@Headers('authorization') auth: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    this.admin(auth);
    return this.list(this.store.personalSupportPlans, page, pageSize);
  }

  @Get('memory')
  adminMemory(@Headers('authorization') auth: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    this.admin(auth);
    return this.list(this.store.memoryItems.filter((item) => !item.deletedAt), page, pageSize);
  }

  @Get('dashboard/ai-summary')
  dashboardAiSummary() {
    return { item: this.dashboardData().aiSummary };
  }

  @Get('users')
  users(@Query('q') q?: string, @Query('status') status?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const needle = q?.trim().toLowerCase();
    const items = this.store.users.filter((user) => {
      const matchesQuery = !needle || [user.id, user.nickname, user.anonymousCode, user.openid].some((value) => value.toLowerCase().includes(needle));
      const matchesStatus = !status || status === 'all' || user.status === status;
      return matchesQuery && matchesStatus;
    });
    return this.list(items, page, pageSize);
  }
  @Get('users/:id')
  user(@Param('id') id: string) { return { item: this.store.users.find((u) => u.id === id), privacy: this.store.privacySettings[id] }; }
  @Patch('users/:id/status')
  async userStatus(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: { status: 'normal' | 'limited' | 'muted' | 'banned' | 'deleted' }) {
    const admin = this.admin(auth);
    const user = this.store.users.find((u) => u.id === id)!;
    const before = { ...user };
    user.status = body.status === 'muted' ? 'limited' : body.status === 'deleted' ? 'banned' : body.status;
    this.store.audit(admin.id, 'USER_STATUS', 'User', id, before, user);
    this.store.persist();
    await this.store.flush();
    return { item: user };
  }

  @Post('users/:id/note')
  userNote(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: { note?: string; tags?: string[] }) {
    const admin = this.admin(auth);
    const before = this.store.auditLogs.filter((item) => item.resourceType === 'User' && item.resourceId === id).slice(0, 3);
    const item = { id, note: body.note ?? '', tags: body.tags ?? [], updatedAt: new Date().toISOString() };
    this.store.audit(admin.id, 'USER_NOTE', 'User', id, before, item);
    this.store.persist();
    return { item };
  }

  @Get('users/export')
  exportUsers() {
    return { item: { count: this.store.users.length, downloadUrl: `/exports/users-${Date.now()}.json`, generatedAt: new Date().toISOString() } };
  }
  @Patch('users/:id/tags')
  userTags(@Param('id') id: string, @Body() body: { tags: string[] }) {
    return { item: { id, tags: body.tags } };
  }

  @Post('users/:id/tags')
  userTagsPost(@Param('id') id: string, @Body() body: { tags: string[] }) {
    return this.userTags(id, body);
  }

  @Delete('users/:id/data')
  async deleteUserData(@Param('id') id: string) {
    this.store.clearFavoritesForUser(id);
    this.store.diaries = this.store.diaries.filter((item) => item.userId !== id);
    this.store.letters = this.store.letters.filter((item) => item.userId !== id);
    await this.store.persistAndFlush();
    return { ok: true };
  }

  @Get('posts')
  adminPosts(@Query('q') q?: string, @Query('emotion') emotion?: string, @Query('reviewStatus') reviewStatus?: string, @Query('visibility') visibility?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const needle = q?.trim().toLowerCase();
    const items = this.store.posts.filter((post) => {
      const matchesQuery = !needle || [post.id, post.content, post.userId, post.emotion].some((value) => String(value).toLowerCase().includes(needle));
      const matchesEmotion = !emotion || emotion === 'all' || post.emotion === normalizeEmotion(emotion);
      const matchesReview = !reviewStatus || reviewStatus === 'all' || post.reviewStatus === reviewStatus;
      const matchesVisibility = !visibility || visibility === 'all' || post.visibility === visibility;
      return matchesQuery && matchesEmotion && matchesReview && matchesVisibility;
    });
    items.forEach((post) => this.store.decoratePost(post));
    return this.list(items, page, pageSize);
  }
  @Get('posts/:id')
  adminPost(@Param('id') id: string) { return { item: this.store.getPost(id, true), replies: this.store.replies.filter((r) => r.postId === id) }; }
  @Patch('posts/:id/moderation')
  async postModeration(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: { action: 'approve' | 'hide' | 'reject' | 'risk' }) {
    const item = this.store.moderatePost(this.admin(auth).id, id, body.action);
    await this.store.flush();
    return { item };
  }

  @Patch('posts/:id/review')
  async postReview(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: { status?: string; action?: 'approve' | 'hide' | 'reject' | 'risk' }) {
    const action = body.action ?? (body.status === 'published' || body.status === 'approve' ? 'approve' : body.status === 'hidden' || body.status === 'hide' ? 'hide' : body.status === 'rejected' || body.status === 'reject' ? 'reject' : 'risk');
    return await this.postModeration(auth, id, { action });
  }

  @Patch('posts/:id/approve')
  async postApprove(@Headers('authorization') auth: string, @Param('id') id: string) {
    return await this.postModeration(auth, id, { action: 'approve' });
  }

  @Patch('posts/:id/reject')
  async postReject(@Headers('authorization') auth: string, @Param('id') id: string) {
    return await this.postModeration(auth, id, { action: 'reject' });
  }

  @Patch('posts/:id/block')
  postBlock(@Headers('authorization') auth: string, @Param('id') id: string) {
    return { item: this.store.moderatePost(this.admin(auth).id, id, 'hide') };
  }
  @Patch('posts/:id/visibility')
  postVisibility(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: { visibility: Visibility; reviewStatus?: string }) {
    const admin = this.admin(auth);
    const post = this.store.getPost(id, true);
    const before = { ...post };
    post.visibility = body.visibility;
    if (body.reviewStatus) {
      post.reviewStatus = body.reviewStatus as typeof post.reviewStatus;
      if (post.reviewStatus === 'published') post.publishedAt ??= new Date().toISOString();
    }
    this.store.audit(admin.id, 'POST_VISIBILITY', 'Post', id, before, post);
    this.store.persist();
    return { item: post };
  }

  @Patch('posts/:id/risk')
  postRisk(@Headers('authorization') auth: string, @Param('id') id: string) {
    return this.postModeration(auth, id, { action: 'risk' });
  }

  @Post('posts/:id/regenerate-replies')
  regenerateReplies(@Param('id') id: string) {
    const post = this.store.getPost(id, true);
    const styles: AIStyle[] = ['warm', 'rational'];
    const jobs = styles.map((style) => this.store.queueAI({ taskType: 'public_ai_reply', userId: post.userId, sourceId: post.moodId, mood: post.emotion, style, content: post.content }));
    void Promise.all(jobs.map((job) => this.store.waitForAiJob(job.id))).then((completed) => {
      for (const job of completed.filter((item) => ['succeeded', 'fallback'].includes(item.status))) {
        this.store.replies.unshift({ id: `reply_${job.id}`, postId: post.id, type: 'AI', style: job.style, content: job.result, status: 'published', riskLevel: 'low', createdAt: job.createdAt });
      }
      post.replyCount = this.store.replies.filter((item) => item.postId === post.id && item.status === 'published').length;
      this.store.persist();
    });
    return { item: post, jobs, jobIds: jobs.map((job) => job.id), status: 'queued' };
  }
  @Delete('posts/:id')
  adminDeletePost(@Param('id') id: string) {
    const post = this.store.getPost(id, true);
    post.status = 'deleted';
    this.store.persist();
    return { ok: true };
  }

  @Get('replies')
  adminReplies(@Query('type') type?: string, @Query('status') status?: string, @Query('q') q?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const needle = q?.trim().toLowerCase();
    const items = this.store.replies.filter((reply) => {
      const matchesType = !type || type === 'all' || reply.type === type;
      const matchesStatus = !status || status === 'all' || reply.status === status;
      const matchesQuery = !needle || [reply.id, reply.postId, reply.content, reply.type].some((value) => String(value).toLowerCase().includes(needle));
      return matchesType && matchesStatus && matchesQuery;
    });
    return this.list(items, page, pageSize);
  }
  @Get('replies/:id')
  adminReply(@Param('id') id: string) { return { item: this.store.replies.find((r) => r.id === id) }; }
  @Patch('replies/:id/moderation')
  async replyModeration(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: { action: 'approve' | 'block'; content?: string }) {
    const item = this.store.moderateReply(this.admin(auth).id, id, body.action, body.content);
    await this.store.flush();
    return { item };
  }

  @Patch('replies/:id/review')
  async replyReview(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: { status?: string; action?: 'approve' | 'block' | 'hide'; content?: string }) {
    const action = body.action === 'hide' ? 'block' : body.action ?? (body.status === 'approved' || body.status === 'published' ? 'approve' : 'block');
    return await this.replyModeration(auth, id, { action, content: body.content });
  }

  @Patch('replies/:id/content')
  replyContent(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: { content: string }) {
    return this.replyEdit(auth, id, body);
  }

  @Patch('replies/:id/approve')
  async replyApprove(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: { content?: string }) {
    return await this.replyModeration(auth, id, { action: 'approve', content: body.content });
  }

  @Patch('replies/:id/block')
  async replyBlock(@Headers('authorization') auth: string, @Param('id') id: string) {
    return await this.replyModeration(auth, id, { action: 'block' });
  }

  @Patch('replies/:id/edit')
  async replyEdit(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: { content: string }) {
    return await this.replyModeration(auth, id, { action: 'approve', content: body.content });
  }

  @Get('ai/providers')
  providers(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.list(this.store.aiProviders.map((p) => ({ ...p, apiKeySecretRef: undefined, apiKeyMasked: p.apiKeyStatus === 'missing' ? '未配置' : '••••••••' })), page, pageSize);
  }
  @Post('ai/providers')
  async createProvider(@Headers('authorization') auth: string, @Body() body: Partial<AIProvider>) {
    const admin = this.admin(auth);
    assertProviderMutation({}, body);
    const provider: AIProvider = { id: `provider_${Date.now()}`, name: body.name ?? '新供应商', type: body.type ?? 'cloud', providerKind: body.providerKind ?? 'openai-compatible', baseUrl: body.baseUrl ?? DAPI_BASE_URL, modelName: body.modelName ?? '', apiKeyStatus: 'configured', enabled: body.enabled ?? true, priority: body.priority ?? 10, dailyLimit: body.dailyLimit ?? 1000, timeoutSeconds: body.timeoutSeconds ?? 12, failoverEnabled: body.failoverEnabled ?? true, usageTags: body.usageTags ?? [], failureRate: 0, avgLatencyMs: 0, todayCalls: 0 };
    this.store.aiProviders.unshift(provider);
    this.store.audit(admin.id, 'AI_PROVIDER_CREATE', 'AIProvider', provider.id, null, provider);
    this.store.persist();
    await this.store.flush();
    return { item: provider };
  }
  @Put('ai/providers/:id')
  async updateProvider(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: Partial<AIProvider>) {
    const admin = this.admin(auth);
    const provider = this.store.aiProviders.find((p) => p.id === id);
    if (!provider) throw new NotFoundException('AI Provider 不存在');
    assertProviderMutation(provider, body);
    const before = { ...provider };
    Object.assign(provider, body);
    this.store.audit(admin.id, 'AI_PROVIDER_UPDATE', 'AIProvider', id, before, provider);
    this.store.persist();
    await this.store.flush();
    return { item: provider };
  }

  @Patch('ai/providers/:id')
  async patchProvider(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: Partial<AIProvider>) {
    return await this.updateProvider(auth, id, body);
  }
  @Post('ai/providers/:id/test')
  async testProvider(@Headers('authorization') auth: string, @Param('id') id: string) {
    const admin = this.admin(auth);
    const item = await this.store.testAiProvider(id);
    this.store.audit(admin.id, 'AI_PROVIDER_TEST', 'AIProvider', id, null, { ok: item.ok, modelName: item.modelName, durationMs: item.durationMs });
    this.store.persist();
    await this.store.flush();
    return { ok: item.ok, message: item.ok ? '真实模型调用成功' : item.result, item };
  }

  @Get('ai/ollama/status')
  ollamaStatus() {
    return { item: this.store.ollamaStatus() };
  }

  @Post('ai/ollama/sync-models')
  syncOllamaModels(@Headers('authorization') auth: string) {
    this.admin(auth);
    throw new BadRequestException('本地模型测试与调用已禁用，请使用已配置的 DAPI。');
  }

  @Delete('ai/providers/:id')
  async deleteProvider(@Headers('authorization') auth: string, @Param('id') id: string) {
    const admin = this.admin(auth);
    const provider = this.store.aiProviders.find((p) => p.id === id);
    const before = provider ? { ...provider } : null;
    if (provider) provider.enabled = false;
    if (provider) this.store.audit(admin.id, 'AI_PROVIDER_DISABLE', 'AIProvider', id, before, provider);
    this.store.persist();
    await this.store.flush();
    return { item: provider };
  }

  @Get('ai/routes')
  routes(@Query('page') page?: string, @Query('pageSize') pageSize?: string) { return this.list(this.store.aiRoutes, page, pageSize); }
  @Put('ai/routes/:style')
  async updateRoute(@Headers('authorization') auth: string, @Param('style') style: AIStyle, @Body() body: Partial<AIStyleRoute>) {
    const admin = this.admin(auth);
    const route = this.store.aiRoutes.find((r) => r.style === style);
    if (!route) throw new NotFoundException('AI 路由不存在');
    const nextPrimary = body.primaryProviderId ?? route.primaryProviderId;
    const nextBackup = body.backupProviderId ?? route.backupProviderId;
    for (const [role, providerId] of [['主路由', nextPrimary], ['备用路由', nextBackup]] as const) {
      const provider = this.store.aiProviders.find((item) => item.id === providerId);
      if (!provider) throw new BadRequestException(`${role}供应商不存在`);
      if (!provider.enabled) throw new BadRequestException(`${role}供应商未启用`);
      if (provider.type === 'local' || provider.providerKind !== 'openai-compatible') {
        throw new BadRequestException(`${role}只能选择 DAPI 或已批准的远程兼容 Provider`);
      }
    }
    const before = { ...route };
    Object.assign(route, body, { routeVersion: route.routeVersion + 1 });
    this.store.audit(admin.id, 'AI_ROUTE_UPDATE', 'AIStyleRoute', style, before, route);
    this.store.persist();
    await this.store.flush();
    return { item: route };
  }

  @Patch('ai/routes/:style')
  async patchRoute(@Headers('authorization') auth: string, @Param('style') style: AIStyle, @Body() body: Partial<AIStyleRoute>) {
    return await this.updateRoute(auth, style, body);
  }

  @Post('ai/routes/:style/test')
  async testRoute(@Headers('authorization') auth: string, @Param('style') style: AIStyle, @Body() body: { content?: string }) {
    const admin = this.admin(auth);
    const job = this.store.queueAI({ taskType: 'public_ai_reply', userId: this.store.getDemoUserId(), sourceId: `route_test_${Date.now()}`, style, content: body.content ?? 'admin route test' });
    this.store.audit(admin.id, 'AI_ROUTE_TEST', 'AIStyleRoute', style, null, { jobId: job.id, style, routeVersion: job.routeVersion });
    this.store.persist();
    await this.store.flush();
    return { ok: true, jobId: job.id, status: job.status, job };
  }

  @Get('ai/jobs')
  jobs(@Query('page') page?: string, @Query('pageSize') pageSize?: string) { return this.list(this.store.aiJobs, page, pageSize); }
  @Get('ai/jobs/:id')
  job(@Param('id') id: string) { return { item: this.store.aiJobs.find((j) => j.id === id) }; }
  @Post('ai/jobs/:id/retry')
  async retryJob(@Headers('authorization') auth: string, @Param('id') id: string) {
    const admin = this.admin(auth);
    const job = this.store.aiJobs.find((j) => j.id === id)!;
    const retry = this.store.queueAiJob({ userId: job.userId, contentId: job.contentId, contentType: job.contentType, jobType: job.jobType, taskType: job.taskType, style: job.style, promptSummary: job.promptSummary });
    retry.retryCount = job.retryCount + 1;
    this.store.audit(admin.id, 'AI_JOB_RETRY', 'AIJob', retry.id, { retryOf: job.id }, retry);
    this.store.persist();
    await this.store.flush();
    return { item: retry, jobId: retry.id, status: retry.status };
  }
  @Post('ai/jobs/:id/fallback')
  async fallbackJob(@Headers('authorization') _auth: string, @Param('id') _id: string) {
    throw new BadRequestException('远程 Provider 均失败时任务会如实标记失败；已禁用自动模板兜底。');
  }

  @Get('feedback/tickets')
  tickets(@Query('q') q?: string, @Query('status') status?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const needle = q?.trim().toLowerCase();
    const items = this.store.feedbackTickets.filter((ticket) => {
      const matchesQuery = !needle || [ticket.id, ticket.content, ticket.sourcePage, ticket.categoryId].some((value) => String(value).toLowerCase().includes(needle));
      const matchesStatus = !status || status === 'all' || ticket.status === status;
      return matchesQuery && matchesStatus;
    });
    return this.list(items.map((ticket) => this.store.decorateFeedbackTicket(ticket)), page, pageSize);
  }

  @Get('feedback/summary')
  feedbackSummary(@Query('q') q?: string, @Query('status') status?: string) {
    const ticketMatches = this.store.feedbackTickets.filter((ticket) => {
      const needle = q?.trim().toLowerCase();
      const matchesQuery = !needle || [ticket.id, ticket.content, ticket.sourcePage, ticket.categoryId].some((value) => String(value).toLowerCase().includes(needle));
      return matchesQuery && (!status || status === 'all' || ticket.status === status);
    });
    const actual = {
      open: ticketMatches.filter((item) => item.status === 'open').length,
      today: ticketMatches.filter((item) => String(item.createdAt ?? '').startsWith(new Date().toISOString().slice(0, 10))).length,
      high: ticketMatches.filter((item) => ['high', 'urgent', 'critical'].includes(String(item.priority ?? '').toLowerCase())).length,
      resolved: ticketMatches.filter((item) => item.status === 'resolved').length,
      total: ticketMatches.length,
    };
    const fixtureSnapshot = !q && (!status || status === 'all') ? this.store.systemSettings.feedbackTicketMetrics?.value : undefined;
    const snapshot = fixtureSnapshot && typeof fixtureSnapshot === 'object' ? fixtureSnapshot as Record<string, unknown> : undefined;
    const value = (key: keyof typeof actual) => Number.isFinite(Number(snapshot?.[key])) ? Number(snapshot?.[key]) : actual[key];
    return {
      item: {
        open: value('open'),
        today: value('today'),
        high: value('high'),
        resolved: value('resolved'),
        total: value('total'),
        notes: snapshot?.notes && typeof snapshot.notes === 'object' ? snapshot.notes : undefined,
        source: snapshot ? 'persisted-snapshot' : 'live-count',
      },
    };
  }

  @Get('feedback')
  feedbackAlias(@Query('q') q?: string, @Query('status') status?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) { return this.tickets(q, status, page, pageSize); }
  @Get('feedback/tickets/:id')
  ticket(@Param('id') id: string) { return { item: this.store.decorateFeedbackTicket(this.store.feedbackTicketOrThrow(id)) }; }

  @Get('feedback/:id')
  feedbackItemAlias(@Param('id') id: string) { return this.ticket(id); }

  @Post('feedback/tickets/:id/reply')
  async ticketReply(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: { reply: string }) {
    const admin = this.admin(auth);
    const ticket = await this.store.replyToFeedbackTicket(admin.id, id, body.reply);
    return { item: this.store.decorateFeedbackTicket(ticket) };
  }

  @Patch('feedback/:id/reply')
  async feedbackReplyAlias(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: { reply: string }) {
    return await this.ticketReply(auth, id, body);
  }

  @Post('feedback/:id/reply')
  async feedbackReplyPostAlias(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: { reply: string }) {
    return await this.ticketReply(auth, id, body);
  }

  @Patch('feedback/tickets/:id/status')
  async ticketStatus(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: { status: string }) {
    const admin = this.admin(auth);
    const ticket = await this.store.updateFeedbackTicketStatus(admin.id, id, body.status);
    return { item: this.store.decorateFeedbackTicket(ticket) };
  }

  @Patch('feedback/:id/status')
  async feedbackStatusAlias(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: { status: string }) {
    return await this.ticketStatus(auth, id, body);
  }

  @Patch('feedback/:id/resolve')
  async feedbackResolveAlias(@Headers('authorization') auth: string, @Param('id') id: string) {
    return await this.ticketStatus(auth, id, { status: 'resolved' });
  }

  @Get('faqs')
  adminFaqs(@Query('page') page?: string, @Query('pageSize') pageSize?: string) { return this.list(this.store.faqs, page, pageSize); }
  @Post('faqs')
  async createFaq(@Headers('authorization') auth: string, @Body() body: { question: string; answer: string }) {
    const admin = this.admin(auth);
    const question = body.question?.trim();
    const answer = body.answer?.trim();
    if (!question || !answer) throw new BadRequestException('问题和答案不能为空');
    const faq = { id: `faq_${Date.now()}`, question, answer, sortOrder: this.store.faqs.length + 1, enabled: true, createdAt: new Date().toISOString() };
    this.store.faqs.unshift(faq);
    this.store.audit(admin.id, 'FAQ_CREATE', 'FAQ', faq.id, null, faq);
    this.store.persist();
    await this.store.flush();
    return { item: faq };
  }
  @Put('faqs/:id')
  async updateFaq(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: Partial<{ question: string; answer: string; enabled: boolean; sortOrder: number }>) {
    const admin = this.admin(auth);
    const faq = this.store.faqs.find((f) => f.id === id);
    if (!faq) throw new NotFoundException('FAQ 不存在');
    const before = { ...faq };
    const update = { ...body };
    if (update.question !== undefined) update.question = update.question.trim();
    if (update.answer !== undefined) update.answer = update.answer.trim();
    if ((update.question !== undefined && !update.question) || (update.answer !== undefined && !update.answer)) throw new BadRequestException('问题和答案不能为空');
    Object.assign(faq, update);
    this.store.audit(admin.id, 'FAQ_UPDATE', 'FAQ', id, before, faq);
    this.store.persist();
    await this.store.flush();
    return { item: faq };
  }

  @Patch('faqs/:id')
  patchFaq(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: Partial<{ question: string; answer: string; enabled: boolean; sortOrder: number }>) {
    return this.updateFaq(auth, id, body);
  }
  @Delete('faqs/:id')
  async deleteFaq(@Headers('authorization') auth: string, @Param('id') id: string) {
    const admin = this.admin(auth);
    const faq = this.store.faqs.find((item) => item.id === id);
    if (!faq) throw new NotFoundException('FAQ 不存在');
    this.store.faqs = this.store.faqs.filter((f) => f.id !== id);
    this.store.audit(admin.id, 'FAQ_DELETE', 'FAQ', id, faq, null);
    await this.store.flush();
    return { ok: true };
  }

  @Get('reply-presets')
  adminPresets(@Query('page') page?: string, @Query('pageSize') pageSize?: string) { return this.list(this.store.replyPresets, page, pageSize); }
  @Post('reply-presets')
  async createPreset(@Headers('authorization') auth: string, @Body() body: { text: string; scene?: string }) {
    const admin = this.admin(auth);
    const text = body.text?.trim();
    if (!text) throw new BadRequestException('回复预设内容不能为空');
    const item = { id: `preset_${Date.now()}`, text, scene: body.scene ?? 'comfort', sortOrder: this.store.replyPresets.length + 1, enabled: true, createdAt: new Date().toISOString() };
    this.store.replyPresets.unshift(item);
    this.store.audit(admin.id, 'REPLY_PRESET_CREATE', 'ReplyPreset', item.id, null, item);
    this.store.persist();
    await this.store.flush();
    return { item };
  }
  @Put('reply-presets/:id')
  async updatePreset(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: Partial<{ text: string; scene: string; enabled: boolean; sortOrder: number }>) {
    const admin = this.admin(auth);
    const item = this.store.replyPresets.find((p) => p.id === id);
    if (!item) throw new NotFoundException('回复预设不存在');
    const before = { ...item };
    const update = { ...body };
    if (update.text !== undefined) update.text = update.text.trim();
    if (update.text !== undefined && !update.text) throw new BadRequestException('回复预设内容不能为空');
    Object.assign(item, update);
    this.store.audit(admin.id, 'REPLY_PRESET_UPDATE', 'ReplyPreset', id, before, item);
    this.store.persist();
    await this.store.flush();
    return { item };
  }

  @Patch('reply-presets/:id')
  patchPreset(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: Partial<{ text: string; scene: string; enabled: boolean; sortOrder: number }>) {
    return this.updatePreset(auth, id, body);
  }
  @Delete('reply-presets/:id')
  async deletePreset(@Headers('authorization') auth: string, @Param('id') id: string) {
    const admin = this.admin(auth);
    const item = this.store.replyPresets.find((preset) => preset.id === id);
    if (!item) throw new NotFoundException('回复预设不存在');
    this.store.replyPresets = this.store.replyPresets.filter((p) => p.id !== id);
    this.store.audit(admin.id, 'REPLY_PRESET_DELETE', 'ReplyPreset', id, item, null);
    await this.store.flush();
    return { ok: true };
  }

  @Get('feedback-categories')
  adminCategories(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const items = this.store.feedbackCategories.map((item) => ({ ...item, ticketCount: this.store.feedbackTickets.filter((ticket) => ticket.categoryId === item.id).length }));
    return this.list(items, page, pageSize);
  }
  @Post('feedback-categories')
  async createCategory(@Headers('authorization') auth: string, @Body() body: { name: string }) {
    const admin = this.admin(auth);
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('分类名称不能为空');
    const item = { id: `cat_${Date.now()}`, name, sortOrder: this.store.feedbackCategories.length + 1, enabled: true };
    this.store.feedbackCategories.unshift(item);
    this.store.audit(admin.id, 'FEEDBACK_CATEGORY_CREATE', 'FeedbackCategory', item.id, null, item);
    this.store.persist();
    await this.store.flush();
    return { item };
  }
  @Put('feedback-categories/:id')
  async updateCategory(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: Partial<{ name: string; enabled: boolean; sortOrder: number }>) {
    const admin = this.admin(auth);
    const item = this.store.feedbackCategories.find((c) => c.id === id);
    if (!item) throw new NotFoundException('反馈分类不存在');
    const before = { ...item };
    const update = { ...body };
    if (update.name !== undefined) update.name = update.name.trim();
    if (update.name !== undefined && !update.name) throw new BadRequestException('分类名称不能为空');
    Object.assign(item, update);
    this.store.audit(admin.id, 'FEEDBACK_CATEGORY_UPDATE', 'FeedbackCategory', id, before, item);
    this.store.persist();
    await this.store.flush();
    return { item };
  }

  @Patch('feedback-categories/:id')
  patchCategory(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: Partial<{ name: string; enabled: boolean; sortOrder: number }>) {
    return this.updateCategory(auth, id, body);
  }
  @Delete('feedback-categories/:id')
  async deleteCategory(@Headers('authorization') auth: string, @Param('id') id: string) {
    const admin = this.admin(auth);
    const item = this.store.feedbackCategories.find((category) => category.id === id);
    if (!item) throw new NotFoundException('反馈分类不存在');
    if (this.store.feedbackTickets.some((ticket) => ticket.categoryId === id)) throw new BadRequestException('该分类仍有关联工单，请先停用或迁移工单');
    this.store.feedbackCategories = this.store.feedbackCategories.filter((c) => c.id !== id);
    this.store.audit(admin.id, 'FEEDBACK_CATEGORY_DELETE', 'FeedbackCategory', id, item, null);
    await this.store.flush();
    return { ok: true };
  }

  private configDefaults() {
    return { ...CONFIG_DEFAULTS };
  }

  private configObject() {
    const defaults = this.configDefaults();
    return Object.fromEntries(
      Object.entries(defaults).map(([key, value]) => [key, this.store.systemSettings[key]?.value ?? value]),
    );
  }

  @Get('system/settings')
  settings() {
    return { items: Object.entries(this.configObject()).map(([key, value]) => ({ key, value, description: this.store.systemSettings[key]?.description ?? key, updatedAt: this.store.systemSettings[key]?.updatedAt })) };
  }

  @Get('settings')
  settingsAlias() { return this.settings(); }

  @Get('config')
  config() {
    return { item: this.configObject() };
  }

  @Put('system/settings')
  async updateSettings(@Headers('authorization') auth: string, @Body() body: Record<string, unknown>) {
    const admin = this.admin(auth);
    const before = this.configObject();
    if (body.localModelFirst === true) {
      throw new BadRequestException('本地模型已被 DAPI-only 运行策略永久禁用。');
    }
    for (const [key, value] of Object.entries(body)) {
      this.store.systemSettings[key] = { ...(this.store.systemSettings[key] ?? { description: key }), value, updatedBy: admin.id, updatedAt: new Date().toISOString() };
      if (key === 'defaultVisibility') {
        for (const userId in this.store.privacySettings) {
          this.store.privacySettings[userId].defaultVisibility = value as 'PUBLIC' | 'PRIVATE';
        }
      }
    }
    if ('localModelFirst' in body) {
      this.store.systemSettings.localModelFirst.value = false;
    }
    this.store.enforceRemoteAiProviderPolicy();
    const after = this.configObject();
    this.store.audit(admin.id, 'SYSTEM_SETTINGS_UPDATE', 'SystemSetting', 'config', before, after);
    this.store.persist();
    await this.store.flush();
    return { items: Object.entries(this.store.systemSettings).map(([key, value]) => ({ key, ...value })) };
  }

  @Patch('settings')
  async patchSettingsAlias(@Headers('authorization') auth: string, @Body() body: Record<string, unknown>) {
    return await this.updateSettings(auth, body);
  }

  @Patch('config')
  async patchConfig(@Headers('authorization') auth: string, @Body() body: Record<string, unknown>) {
    await this.updateSettings(auth, body);
    return this.config();
  }

  @Post('config/reset')
  async resetConfig(@Headers('authorization') auth: string) {
    return await this.patchConfig(auth, this.configDefaults());
  }

  @Get('audit-logs')
  auditLogs(@Query('page') page?: string, @Query('pageSize') pageSize?: string) { return this.list(this.store.auditLogs, page, pageSize); }
}
