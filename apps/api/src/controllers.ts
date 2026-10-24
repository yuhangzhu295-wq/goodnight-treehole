import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { CanActivate, ExecutionContext, Injectable, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type {
  AIProvider,
  AIStyle,
  AIStyleRoute,
  Emotion,
  PrivacySetting,
  Visibility,
  SupportIntent,
  ActionBarrier,
} from '@goodnight/shared-types';
import { normalizeStoreEmotion, StoreService, type AIGenerateInput } from './store.service.js';
import { MonthlyReportService } from './monthly-report.service.js';
import { Batch1PersistenceService } from './batch1-persistence.service.js';
import { PeerPersistenceService } from './peer-persistence.service.js';
import { SelfPersistenceService } from './self-persistence.service.js';
import { FeedbackPersistenceService } from './feedback-persistence.service.js';
import { AdminNotesPersistenceService } from './admin-notes-persistence.service.js';
import { DIRECT_DB_MODELS } from './direct-db-models.js';
import { demoIdentityAllowed } from './identity-credential.js';
import { AnonymousSessionService, currentIdentity, SESSION_TTL_MS } from './anonymous-session.service.js';
import {
  DAPI_BASE_URL,
  DAPI_PROVIDER_ID,
  REMOTE_BACKUP_BASE_URL,
  REMOTE_BACKUP_PROVIDER_ID,
} from './remote-ai-provider.service.js';
import { assertNoLegacyLocalModelEndpoint, visualFixtureIdentity } from './runtime-environment.js';
import { loginRetryAfterSeconds, recordLoginFailure, recordLoginSuccess } from './login-throttle.js';

const id = (prefix: string) => `${prefix}_${crypto.randomBytes(5).toString('hex')}`;

function tokenFrom(header?: string) {
  return header?.replace(/^Bearer\s+/i, '');
}

function normalizedProviderUrl(value?: string) {
  return String(value ?? '')
    .trim()
    .replace(/\/$/, '');
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
  if (
    current.id === DAPI_PROVIDER_ID &&
    normalizedProviderUrl(next.baseUrl) !==
      normalizedProviderUrl(process.env.DAPI_BASE_URL || process.env.AI_PRIMARY_BASE_URL || DAPI_BASE_URL)
  ) {
    throw new BadRequestException('DAPI 主 Provider 的地址由运行策略固定。');
  }
  if (current.id === DAPI_PROVIDER_ID && patch.enabled === false) {
    throw new BadRequestException('DAPI 主 Provider 由运行策略锁定，不能停用。');
  }
  if (
    current.id === REMOTE_BACKUP_PROVIDER_ID &&
    normalizedProviderUrl(next.baseUrl) !==
      normalizedProviderUrl(process.env.AI_SECONDARY_BASE_URL || REMOTE_BACKUP_BASE_URL)
  ) {
    throw new BadRequestException('远程备用 Provider 的地址由运行策略固定。');
  }
}

const apiStartedAt = new Date().toISOString();

// Admin authorization used to be enforced one handler at a time by calling
// `this.admin(auth)` inside the method body. Any handler that forgot the call was
// silently public - including destructive ones - which is exactly what the product
// audit found. A controller guard makes the default deny and keeps the decision in
// one place, so a new endpoint cannot be added without a token by accident.
//
// The guard only proves a valid admin session exists; it does not replace the
// per-handler `this.admin(auth)` calls, which also resolve the acting admin for the
// audit trail.
const ADMIN_PUBLIC_ROUTES = new Set([
  'POST /api/admin/v1/auth/login',
  'POST /api/admin/v1/login',
  'POST /api/admin/v1/auth/logout',
]);

function normalizeRoutePath(path: string) {
  const value = path.startsWith('/') ? path : `/${path}`;
  return value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value;
}

@Injectable()
class AdminAuthGuard implements CanActivate {
  constructor(@Inject(StoreService) private readonly store: StoreService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      path?: string;
      url?: string;
      headers?: Record<string, string | undefined>;
    }>();
    const routePath = normalizeRoutePath(request.path ?? (request.url ?? '').split('?')[0]);
    const key = `${String(request.method ?? 'GET').toUpperCase()} ${routePath}`;
    if (ADMIN_PUBLIC_ROUTES.has(key)) return true;
    this.store.verifyToken(tokenFrom(request.headers?.authorization));
    return true;
  }
}

// The header carries a session credential, not a user id, and it is verified once per request by
// IdentityMiddleware. These helpers read the verified identity from that request's context and
// ignore the header argument entirely: a caller-supplied id is never an identity. A raw user id in
// the header is simply an invalid credential, and the middleware rejects it before we get here.
function runtimeUserId(_header?: string) {
  return currentIdentity()?.userId;
}

function requireRuntimeUserId(_header?: string): string {
  const identity = currentIdentity();
  if (!identity) {
    throw new UnauthorizedException('缺少用户身份凭证');
  }
  return identity.userId;
}

/** A nickname is a display label, not a place to smuggle markup or invisible overrides. */
const NICKNAME_MAX_CHARS = 20;
const NICKNAME_MAX_BYTES = 80;
/**
 * Control characters and format characters can make one name render as another.
 *
 * `\p{Cc}` is C0/C1 and `\p{Cf}` is the format category, which covers the soft hyphen, bidi
 * overrides and zero-width marks. ZWNJ/ZWJ (U+200C/U+200D) are exempt: they are part of legitimate
 * emoji and Indic sequences. The lookahead keeps those two from matching.
 */
const NICKNAME_FORBIDDEN = /(?![\u200C\u200D])[\p{Cc}\p{Cf}]/u;

/**
 * Invisible characters that are not in the format category.
 *
 * U+034F is a combining mark, U+2028/U+2029 are line/paragraph separators, and the Hangul fillers
 * (U+115F/U+1160/U+3164/U+FFA0) render as blank space. They are matched by value rather than in a
 * character class so a combining mark cannot be misread as part of a grapheme.
 */
const NICKNAME_INVISIBLE = ['\u034F', '\u2028', '\u2029', '\u115F', '\u1160', '\u3164', '\uFFA0'];

function hasForbiddenNicknameCharacters(value: string): boolean {
  return (
    NICKNAME_FORBIDDEN.test(value) ||
    NICKNAME_INVISIBLE.some((character) => value.includes(character)) ||
    /\p{Cs}/u.test(value)
  );
}

/**
 * Validates the only profile field this product lets a person edit.
 *
 * The body must contain exactly `nickname`: accepting extra keys would let a caller believe it can
 * change `anonymousCode` or `status`, and silently ignoring them is how a "saved" profile turns out
 * to be unchanged. Length is counted in user-visible characters so one emoji is one character.
 */
function normalizeNickname(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('请求内容无效');
  }
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'nickname') {
    throw new BadRequestException('只允许修改昵称');
  }
  const raw = (body as { nickname?: unknown }).nickname;
  if (typeof raw !== 'string') throw new BadRequestException('昵称必须是文本');
  // Check the raw value before trimming: a leading newline is a control character to reject, not
  // whitespace to silently drop. Trimming first let "\n昵称" through as "昵称".
  if (hasForbiddenNicknameCharacters(raw)) {
    throw new BadRequestException('昵称包含不可见字符');
  }
  const nickname = raw.normalize('NFC').trim();
  if (!nickname) throw new BadRequestException('昵称不能为空');
  // NFC can compose a sequence into a different code point; re-check the value that will be stored.
  if (hasForbiddenNicknameCharacters(nickname)) {
    throw new BadRequestException('昵称包含不可见字符');
  }
  if (Array.from(nickname).length > NICKNAME_MAX_CHARS) {
    throw new BadRequestException(`昵称最多 ${NICKNAME_MAX_CHARS} 个字符`);
  }
  if (Buffer.byteLength(nickname, 'utf8') > NICKNAME_MAX_BYTES) {
    throw new BadRequestException('昵称过长');
  }
  return nickname;
}
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

// Settings the running service actually reads when it makes a decision.
//
// Everything in CONFIG_DEFAULTS is persisted and editable, but only the keys below are
// consulted by backend logic; the rest are stored values with no consumer, so changing
// them in the admin console has no effect on the product (product audit ISSUE-003).
// This list is the single source of truth for that distinction and is returned by the
// config endpoints so the admin UI can say which settings are live instead of implying
// that every field changes behaviour.
const ENFORCED_SETTING_KEYS = [
  'appName',
  'appShortName',
  'defaultVisibility',
  'defaultPageSize',
  'highRiskBlockEnabled',
  'allowHumanRepliesDefault',
  'localModelFirst',
  'allowMonthlyReportShare',
  'logRetentionDays',
];

// Settings that are stored and editable but whose behaviour is deliberately not wired yet.
// They stay out of the operable part of the console so the operator cannot save a value
// that looks active but does nothing (product audit ISSUE-003, closure task section 22).
//   - the four AI keys need the remote provider to be reachable to be verified at all, and
//     DAPI currently answers HTTP 402, so wiring them would be an unverifiable change to the
//     failover path; they remain visible and clearly marked as not yet enforced
//   - the notification keys have no mail transport in this project at all, so they are
//     presented as a future capability rather than a working setting
const NOT_IMPLEMENTED_SETTING_KEYS = [
  // Every public post is gated by manual review already, which is a deliberate product
  // contract; auto-publishing below a threshold would weaken moderation, so the setting
  // has no legitimate consumer and stays read-only.
  'manualReviewThreshold',
  'cloudModelBackup',
  'aiTimeoutSeconds',
  'aiFailoverEnabled',
  'aiRetryCount',
  'sensitiveContentEncrypted',
  'scheduledCacheCleanup',
  'abnormalNotifyEnabled',
  'notifyEmail',
  'dailyDigestEnabled',
  'dailyDigestTime',
];

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
  濮斿眻: '委屈',
  澶辯湢: '失眠',
  鎭嬬埍: '恋爱',
  宸ヤ綔: '工作',
  鍏ㄩ儴: '全部',
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
    @Inject(Batch1PersistenceService) private readonly batch1Persistence: Batch1PersistenceService,
    @Inject(SelfPersistenceService) private readonly selfPersistence: SelfPersistenceService,
    @Inject(FeedbackPersistenceService) private readonly feedbackPersistence: FeedbackPersistenceService,
    @Inject(AnonymousSessionService) private readonly sessions: AnonymousSessionService,
  ) {}

  @Get('posts')
  async posts(
    @Query('emotion') emotion?: string,
    @Query('mood') mood?: string,
    @Query('sort') sort?: string,
  ) {
    // Only two orders exist and both are real: publication order, and the order the community's own
    // responses produce. An unknown value falls back to the default instead of erroring, so an older
    // client that sends something else keeps working.
    const order = sort === 'hot' ? 'hot' : 'latest';
    const items = await this.store.publicPosts(mood ?? emotion, order);
    return { items, total: items.length, sort: order };
  }

  @Get('debug/fingerprint')
  fingerprint() {
    return FINGERPRINT;
  }

  /**
   * Issues a session for a brand-new anonymous user. This is the only way a client without an
   * existing identity can obtain one; it cannot be used to obtain somebody else's, because the
   * server chooses the identity and stores the session.
   */
  @Post('auth/anonymous')
  async createAnonymousIdentity(@Body() body?: { deviceId?: string; deviceLabel?: string }) {
    const user = await this.store.createAnonymousUser();
    const session = await this.sessions.issue(user.id, {
      deviceId: typeof body?.deviceId === 'string' ? body.deviceId.slice(0, 120) : undefined,
      deviceLabel: typeof body?.deviceLabel === 'string' ? body.deviceLabel.slice(0, 120) : undefined,
    });
    return {
      item: {
        userId: user.id,
        credential: session.credential,
        expiresAt: session.expiresAt.toISOString(),
        expiresInMs: SESSION_TTL_MS,
        anonymousCode: user.anonymousCode,
      },
    };
  }

  /**
   * Issues a session for the seeded demo user so the offline demo keeps working. Disabled unless
   * ALLOW_DEMO_IDENTITY=true, because the demo user holds seeded content and handing out its session
   * in production would re-open the hole this exists to close.
   */
  @Post('auth/demo')
  async demoIdentity() {
    if (!demoIdentityAllowed()) {
      throw new ForbiddenException('演示身份在当前环境未启用');
    }
    const userId = this.store.getDemoUserId();
    const session = await this.sessions.issue(userId, { deviceLabel: 'demo' });
    return { item: { userId, credential: session.credential, expiresAt: session.expiresAt.toISOString(), expiresInMs: SESSION_TTL_MS } };
  }

  /** Ends the caller's session. The row is kept so the revocation stays auditable. */
  @Post('auth/logout')
  async logout(@Headers('x-goodnight-user-id') credential?: string) {
    if (credential?.trim()) {
      await this.sessions.revoke(credential, 'logout');
    }
    return { ok: true };
  }

  /**
   * Exchanges the caller's credential for a fresh one. The predecessor is revoked in the same
   * transaction, so a rotation cannot leave two live credentials.
   */
  @Post('auth/rotate')
  async rotateIdentity(@Headers('x-goodnight-user-id') credential?: string) {
    if (!credential?.trim()) throw new UnauthorizedException('缺少用户身份凭证');
    const rotated = await this.sessions.rotate(credential);
    return { item: { credential: rotated.credential, expiresAt: rotated.expiresAt.toISOString() } };
  }

  /**
   * Lists the caller's active sessions, so one can be recognised and cut off.
   *
   * `current` is computed server-side from the verified credential. The response carries no secret
   * material and is not cacheable, because it is tied to the caller's identity.
   */
  @Get('auth/sessions')
  @Header('Cache-Control', 'no-store')
  async listSessions(@Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return { items: await this.sessions.listActiveForUser(runtimeId) };
  }

  /**
   * Revokes one of the caller's own sessions. The current session is refused (409) and another
   * user's session id answers exactly like an unknown one (404), so the route cannot be used to
   * probe for sessions or to lock the caller out of the credential it is using.
   */
  @Post('auth/sessions/:id/revoke')
  async revokeSession(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    const revoked = await this.sessions.revokeSession(runtimeId, id, 'session_revoked_by_user');
    return { ok: true, revoked };
  }

  /**
   * Revokes every session of one device: what a lost device needs.
   *
   * Deprecated in favour of `POST auth/sessions/:id/revoke`: the C-end never learns a `deviceId`, so
   * nothing in the product calls this. It stays for operational use, and refuses to revoke the
   * device behind the current session so it cannot bypass the per-session self-revocation guard.
   */
  @Post('auth/revoke-device')
  async revokeDevice(@Body() body: { deviceId?: string }, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : '';
    if (!deviceId) throw new BadRequestException('缺少设备标识');
    if ((await this.sessions.currentDeviceId()) === deviceId) {
      throw new ConflictException('不能撤销当前正在使用的设备');
    }
    const revoked = await this.sessions.revokeDevice(runtimeId, deviceId, 'device_revoked_by_user');
    return { ok: true, revoked };
  }

  @Get('config')
  config() {
    const item = Object.fromEntries(
      Object.entries(CONFIG_DEFAULTS).map(([key, value]) => [key, this.store.systemSettings[key]?.value ?? value]),
    );
    return { item, enforcedKeys: ENFORCED_SETTING_KEYS, notImplementedKeys: NOT_IMPLEMENTED_SETTING_KEYS };
  }

  /**
   * The home dashboard: the caller's active journey, actions, due check-ins, follow-ups, peer
   * matches and latest letter. Every one of those is private per-user data, so this is not a public
   * route. It used to be documented as one ("Tonight summary and inspirational quote") while the
   * implementation called `tonightHome()` with no user and therefore returned `user_demo`'s private
   * journey to whoever asked - measured with no credential and with a different user's credential,
   * both receiving the same PRIVATE journey.
   */
  /**
   * The home dashboard: the caller's active journey, actions, due check-ins, follow-ups, peer
   * matches and latest letter. Every one of those is private per-user data, so this is not a public
   * route. It used to be documented as one ("Tonight summary and inspirational quote") while the
   * implementation called `tonightHome()` with no user and therefore returned `user_demo`'s private
   * journey to whoever asked - measured with no credential and with a different user's credential,
   * both receiving the same PRIVATE journey.
   */
  @Get('tonight')
  async tonight(@Headers('x-goodnight-user-id') requestedUserId?: string) {
    return { item: await this.store.tonightHome(requireRuntimeUserId(requestedUserId)) };
  }

  @Get('journeys')
  async journeys(@Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return {
      items: await this.store.listJourneyDetails(runtimeId),
    };
  }

  @Get('archive/journeys')
  async archiveJourneys(@Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return { items: await this.store.archiveJourneys(runtimeId) };
  }

  @Get('archive/journeys/:id')
  async archiveJourney(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return { item: await this.store.journeyArchiveDetail(id, runtimeId) };
  }

  @Post('archive/journeys/:id/export')
  async exportArchiveJourney(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return { item: await this.store.createJourneyArchiveExport(id, runtimeId) };
  }

  @Post('archive/journeys/:id/restore')
  async restoreArchiveJourney(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.restoreArchivedJourney(id, runtimeId);
  }

  @Delete('archive/journeys/:id')
  async deleteArchiveJourney(
    @Param('id') id: string,
    @Body() body: { confirmation?: string },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    if (body.confirmation !== 'DELETE_ARCHIVE') throw new BadRequestException('请完成第二次确认后再删除归档');
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.deleteJourneyArchive(id, runtimeId);
  }

  @Post('journeys')
  async createJourney(
    @Body()
    body: {
      title?: string;
      domain?: string;
      content?: string;
      facts?: string[];
      feelings?: string[];
      needs?: string[];
      constraints?: string[];
      visibility?: Visibility;
      intensity?: number;
      scenario?: string;
      relationScene?: string;
    },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.createJourney(body, runtimeId);
  }

  @Post('testing/cleanup-browser-fixtures')
  async cleanupBrowserFixtures(
    @Headers('x-goodnight-test-cleanup') token: string,
    @Body()
    body: {
      journeyIds?: string[];
      notificationIds?: string[];
      decisionIds?: string[];
      cooldownIds?: string[];
      legacy?: boolean;
    },
  ) {
    if (token !== 'first-batch-browser') throw new NotFoundException('测试清理入口不可用。');
    return await this.store.cleanupBrowserFixtures(body);
  }

  @Get('journeys/:id')
  async journey(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return { item: await this.store.journeyDetail(id, runtimeId) };
  }

  @Get('journeys/:id/fingerprint')
  async journeyFingerprint(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return { item: await this.store.fingerprint(id, runtimeId) };
  }

  @Patch('journeys/:id/intent')
  async journeyIntent(
    @Param('id') id: string,
    @Body() body: { intent?: SupportIntent },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    if (!body.intent) throw new BadRequestException('请选择你现在最需要的支持');
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.setJourneyIntent(id, body.intent, runtimeId);
  }

  @Patch('journeys/:id')
  async patchJourney(
    @Param('id') id: string,
    @Body()
    body: {
      status?: 'active' | 'paused' | 'archived';
      title?: string;
      summary?: string;
      expectedUpdatedAt?: string;
    },
    @Headers('x-goodnight-user-id') userIdHeader?: string,
  ) {
    const callerId = requireRuntimeUserId(userIdHeader);
    const item = await this.store.patchJourney(id, body, callerId);
    if (body.status && !body.title && !body.summary) {
      return { journey: item };
    }
    return { item, journey: item };
  }

  @Patch('journeys/:id/situation')
  async confirmSituation(
    @Param('id') id: string,
    @Body()
    body: {
      facts?: string[];
      feelings?: string[];
      needs?: string[];
      constraints?: string[];
      risks?: string[];
      domain?: string;
      subDomain?: string;
      eventType?: string;
      stage?: string;
      contextTags?: string[];
      peopleContext?: string[];
      decisionContext?: string[];
      behaviorSignals?: string[];
      recoverySignals?: string[];
      intensity?: number;
      urgency?: number;
    },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.confirmSituation(id, body, runtimeId);
  }

  @Post('journeys/:id/snapshots')
  async confirmSnapshot(
    @Param('id') id: string,
    @Body()
    body: {
      facts?: string[];
      feelings?: string[];
      needs?: string[];
      constraints?: string[];
      risks?: string[];
      domain?: string;
      subDomain?: string;
      eventType?: string;
      stage?: string;
      contextTags?: string[];
      peopleContext?: string[];
      decisionContext?: string[];
      behaviorSignals?: string[];
      recoverySignals?: string[];
      intensity?: number;
      urgency?: number;
    },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.confirmSituation(id, body, runtimeId);
  }

  @Post('journeys/:id/situation/reanalyze')
  async reanalyzeSituation(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.reanalyzeSituation(id, runtimeId);
  }

  @Post('journeys/:id/safety/acknowledge')
  async acknowledgeSafety(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.acknowledgeSafety(id, runtimeId);
  }

  @Post('journeys/:id/updates')
  async journeyUpdate(
    @Param('id') id: string,
    @Body() body: { content?: string; kind?: string; outcome?: Record<string, unknown> },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.addJourneyUpdate(id, body, runtimeId);
  }

  @Post('journeys/:id/action-plan')
  async actionPlan(
    @Param('id') id: string,
    @Body() body: { content?: string; mode?: 'initial' | 'smaller' },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const mode = body.mode === 'smaller' ? 'smaller' : 'initial';
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.generateActionPlan(id, body.content, mode, runtimeId);
  }

  @Post('journeys/:id/actions')
  async createAction(
    @Param('id') id: string,
    @Body() body: { title?: string; description?: string; dueAt?: string; reminderAt?: string },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.createActionCommitment(id, body, runtimeId);
  }

  @Get('journeys/:id/actions')
  async journeyActions(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return { items: await this.store.journeyActions(id, runtimeId) };
  }

  @Get('journeys/:id/timeline')
  async journeyTimeline(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return { items: await this.store.journeyTimeline(id, runtimeId) };
  }

  @Patch('journeys/:id/status')
  async journeyStatus(
    @Param('id') id: string,
    @Body() body: { status: 'active' | 'paused' | 'archived' },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.updateJourneyStatus(id, body.status, runtimeId);
  }

  @Post('journeys/:id/graduate')
  async graduate(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.graduateJourney(id, runtimeId);
  }

  @Post('journeys/:id/graduation-consent')
  async graduationConsent(
    @Param('id') id: string,
    @Body() body: { decision?: 'willing' | 'later' | 'no' },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    if (!body.decision || !['willing', 'later', 'no'].includes(body.decision))
      throw new BadRequestException('请选择是否匿名分享');
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.saveGraduationConsent(id, body.decision, runtimeId);
  }

  @Post('actions/:id/checkin')
  async actionCheckin(
    @Param('id') id: string,
    @Body()
    body: {
      status?: string;
      reflection?: string;
      result?: string;
      intensity?: number;
      barrier?: ActionBarrier;
      outcome?: Record<string, unknown>;
    },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.checkinAction(id, body, runtimeId);
  }

  @Post('actions/:id/checkins')
  async actionCheckins(
    @Param('id') id: string,
    @Body()
    body: {
      status?: string;
      reflection?: string;
      result?: string;
      intensity?: number;
      barrier?: ActionBarrier;
      outcome?: Record<string, unknown>;
    },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.checkinAction(id, body, runtimeId);
  }

  @Get('peers')
  async peers(@Headers('x-goodnight-user-id') userId?: string, @Query('matchId') matchId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return { item: await this.store.peerNetwork(runtimeId, matchId) };
  }

  @Post('peer-experiences')
  async createPeerExperience(
    @Body()
    body: {
      journeyId?: string;
      title?: string;
      domain?: string;
      stage?: string;
      content?: string;
      tags?: string[];
      consented?: boolean;
    },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.createPeerExperience(body.journeyId, body, runtimeId);
  }

  @Post('journeys/:id/peer-matches')
  async peerMatches(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.suggestPeerMatches(id, runtimeId);
  }

  @Get('journeys/:id/peers')
  async journeyPeers(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return { items: await this.store.journeyPeers(id, runtimeId) };
  }

  @Patch('peer-matches/:id')
  async peerMatch(
    @Param('id') id: string,
    @Body()
    body: {
      status: 'requested' | 'connected' | 'declined' | 'blocked';
      requestReason?: string;
      requestQuestion?: string;
    },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.updatePeerMatch(id, body, runtimeId);
  }

  @Post('peer-matches/:id/respond')
  async peerMatchRespond(
    @Param('id') id: string,
    @Body() body: { status: 'connected' | 'declined' | 'blocked' },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.updatePeerMatch(id, body, runtimeId);
  }

  @Post('peer-matches/:id/consent')
  async peerMatchConsent(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.startPeerConversation(id, runtimeId);
  }

  @Get('peer-requests')
  async peerRequests(
    @Headers('x-goodnight-user-id') userId?: string,
    @Query('scope') scope?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    // 'received' (the default) is the inbox on the user's own experiences; 'sent' is what the user
    // asked for. 同路人's 我的请求 tab passes scope=sent.
    const direction = scope === 'sent' ? 'sent' : 'received';
    return { items: await this.store.peerRequestList(runtimeId, direction) };
  }

  @Patch('peer-experiences/:id')
  async updatePeerExperience(
    @Param('id') id: string,
    @Body()
    body: {
      title?: string;
      content?: string;
      laterSummary?: Record<string, unknown>;
      helpfulActions?: string[];
      notHelpfulActions?: string[];
      retrospective?: string;
    },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.updatePeerExperience(id, body, runtimeId);
  }

  @Get('peer-experiences/:id')
  async peerExperience(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return { item: await this.store.peerExperienceDetail(id, this.store.resolveRuntimeUserId(runtimeId)) };
  }

  @Post('actions/:id/adaptive-plan')
  async adaptivePlan(
    @Param('id') id: string,
    @Body() body: { barrier: ActionBarrier },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.requestAdaptiveAction(id, body.barrier, runtimeId);
  }

  @Post('actions/:id/adapt')
  async adaptiveAction(
    @Param('id') id: string,
    @Body() body: { title?: string; description?: string; barrier?: ActionBarrier; dueAt?: string },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.createAdaptiveAction(id, body, runtimeId);
  }

  @Post('decisions')
  async decision(
    @Body() body: { journeyId?: string; question?: string; options?: string[]; criteria?: string[]; subject?: string; supersedesId?: string },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.createDecision(body, runtimeId);
  }

  @Get('decisions')
  async decisions(@Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return { items: await this.store.decisionList(runtimeId) };
  }

  @Patch('decisions/:id')
  async updateDecision(
    @Param('id') id: string,
    @Body()
    body: {
      question?: string;
      options?: string[];
      criteria?: string[];
      decision?: string;
      outcome?: string;
      status?: string;
    },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.updateDecision(id, body, runtimeId);
  }

  @Post('cooldowns')
  async cooldown(
    @Body() body: { decisionId?: string; title?: string; reason?: string; hours?: number },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.createCooldown(body, runtimeId);
  }

  @Get('cooldown')
  async cooldowns(@Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return { items: await this.store.cooldownList(runtimeId) };
  }

  @Post('handoffs')
  async handoff(
    @Body() body: { journeyId?: string; recipient?: string; channel?: string; summary?: string },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    if (DIRECT_DB_MODELS.RealityHandoff) {
      const item = await this.selfPersistence.createRealityHandoff({
        userId: runtimeId,
        journeyId: body.journeyId,
        recipient: body.recipient ?? '',
        channel: body.channel ?? '',
        summary: body.summary ?? '',
      });
      return { item };
    }
    return await this.store.createRealityHandoff(body, runtimeId);
  }

  @Post('handoffs/:id/share')
  async shareHandoff(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    if (DIRECT_DB_MODELS.RealityHandoff) {
      const item = await this.selfPersistence.shareRealityHandoff(id, runtimeId);
      return { item };
    }
    return await this.store.shareRealityHandoff(id, runtimeId);
  }

  @Get('handoffs')
  async handoffs(@Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    if (DIRECT_DB_MODELS.RealityHandoff) {
      const items = await this.selfPersistence.listRealityHandoffs(runtimeId);
      return { items };
    }
    return { items: await this.store.handoffList(runtimeId) };
  }

  @Post('trusted-contacts')
  async trustedContact(
    @Body() body: { nickname?: string; relation?: string; contactHint?: string },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    if (DIRECT_DB_MODELS.TrustedContact) {
      const item = await this.selfPersistence.createTrustedContact({
        userId: runtimeId,
        nickname: body.nickname ?? '',
        relation: body.relation ?? '',
        contactHint: body.contactHint ?? '',
      });
      return { item };
    }
    return await this.store.saveTrustedContact(body, runtimeId);
  }

  @Get('trusted-contacts')
  async trustedContacts(@Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    if (DIRECT_DB_MODELS.TrustedContact) {
      const items = await this.selfPersistence.listTrustedContacts(runtimeId);
      return { items };
    }
    return { items: await this.store.trustedContactList(runtimeId) };
  }

  @Post('future-messages')
  async futureMessage(
    @Body()
    body: {
      journeyId?: string;
      contextType?: string;
      contextRefId?: string;
      content?: string;
      deliverAt?: string;
    },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.saveFutureMessage(body, runtimeId);
  }

  @Get('future-messages')
  async futureMessages(@Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return { items: await this.store.futureMessageList(runtimeId) };
  }

  @Post('support-plans')
  async supportPlan(
    @Body() body: { journeyId?: string | null; title?: string; plan?: Record<string, unknown> },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    if (DIRECT_DB_MODELS.PersonalSupportPlan) {
      const item = await this.selfPersistence.saveSupportPlan({
        userId: runtimeId,
        journeyId: body.journeyId,
        title: body.title,
        plan: body.plan,
      });
      return { item };
    }
    return await this.store.saveSupportPlan(body, runtimeId);
  }

  @Get('me/support-plan')
  async supportPlanCurrent(@Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    if (DIRECT_DB_MODELS.PersonalSupportPlan) {
      const item = await this.selfPersistence.getSupportPlan(runtimeId);
      return { item };
    }
    return { item: await this.store.supportPlan(runtimeId) };
  }

  @Put('me/support-plan')
  async supportPlanPut(
    @Body() body: { journeyId?: string | null; title?: string; plan?: Record<string, unknown> },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    return await this.supportPlan(body, userId);
  }

  @Get('me/stable-self')
  async stableSelfProfile(@Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    if (DIRECT_DB_MODELS.StableSelfProfile) {
      const item = await this.selfPersistence.getStableSelfProfile(runtimeId);
      return { item };
    }
    return { item: await this.store.stableSelfProfile(runtimeId) };
  }

  @Put('me/stable-self')
  async stableSelfProfilePut(
    @Body() body: { profile?: Record<string, unknown> },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    if (DIRECT_DB_MODELS.StableSelfProfile) {
      const item = await this.selfPersistence.saveStableSelfProfile({
        userId: runtimeId,
        profile: body.profile ?? {},
      });
      return { item };
    }
    return await this.store.saveStableSelfProfile(body, runtimeId);
  }

  @Get('me/recovery')
  async recovery(@Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    return { items: await this.store.recoveryList(runtimeId) };
  }

  @Post('me/recovery')
  async recoveryCheckin(
    @Body() body: { journeyId?: string; signals?: Record<string, unknown>; summary?: string },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    if (DIRECT_DB_MODELS.RecoverySnapshot) {
      const item = await this.selfPersistence.appendRecoverySnapshot({
        userId: runtimeId,
        journeyId: body.journeyId,
        signals: body.signals ?? {},
        summary: body.summary,
      });
      return { item };
    }
    return await this.store.saveRecoveryCheckin(
      body.journeyId,
      body.signals ?? {},
      body.summary,
      runtimeId,
    );
  }

  @Get('notifications')
  async notifications(@Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    const items = await this.store.notificationList(runtimeId);
    return { items, unreadCount: items.filter((item) => item.status === 'unread').length };
  }

  @Patch('notifications/:id/read')
  async readNotification(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.readNotification(id, runtimeId);
  }

  @Get('peer-conversations')
  async peerConversations(@Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return { items: await this.store.conversationList(runtimeId) };
  }

  @Post('peer-conversations/:matchId/messages')
  async peerMessage(
    @Param('matchId') matchId: string,
    @Body() body: { content?: string },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.sendPeerMessage(matchId, body.content, runtimeId);
  }

  @Post('peer-conversations/:matchId/assist')
  async peerMessageAssist(
    @Param('matchId') matchId: string,
    @Body() body: { content?: string },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.requestPeerResponseAssist(matchId, body.content, runtimeId);
  }

  @Post('peer-conversations/:matchId/close')
  async closePeerConversation(@Param('matchId') matchId: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.closePeerConversation(matchId, runtimeId);
  }

  @Post('peer-conversations/:matchId/report')
  async reportPeerConversation(
    @Param('matchId') matchId: string,
    @Body() body: { reason?: string },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.reportPeerConversation(matchId, body.reason, runtimeId);
  }

  @Post('peer-conversations/:matchId/block')
  async blockPeerConversation(@Param('matchId') matchId: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.blockPeerConversation(matchId, runtimeId);
  }

  @Post('peer-conversations/:matchId/feedback')
  async peerConversationFeedback(
    @Param('matchId') matchId: string,
    @Body() body: { feedback?: string; note?: string; shareLater?: boolean },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.savePeerConversationFeedback(matchId, body, runtimeId);
  }

  @Get('memory')
  async memories(@Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return { items: await this.store.memoryList(false, runtimeId) };
  }

  @Get('me/memories')
  async memoriesAlias(@Headers('x-goodnight-user-id') userId?: string) {
    const targetUserId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    const userJobs = DIRECT_DB_MODELS.AIJob
      ? await this.batch1Persistence.listAiJobsForUser(targetUserId)
      : this.store.aiJobs.filter((job) => job.userId === targetUserId);
    const items = (await this.store.memoryList(true, targetUserId)).map((item) => {
      const usages = userJobs.flatMap((job) =>
        (job.traceJson ?? [])
          .filter(
            (trace: any) =>
              trace.event === 'memory-context' && Array.isArray(trace.memoryIds) && trace.memoryIds.includes(item.id),
          )
          .map((trace: any) => ({ jobId: job.id, taskType: job.taskType, at: trace.at ?? job.createdAt })),
      );
      return { ...item, usages };
    });
    return { items };
  }

  @Post('memory')
  async memory(
    @Body()
    body: {
      journeyId?: string;
      category?: string;
      title?: string;
      content?: string;
      days?: number;
      scope?: string;
    },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.saveMemory({ ...body, source: 'user_saved' }, runtimeId);
  }

  @Patch('me/memories/:id')
  async updateMemory(
    @Param('id') id: string,
    @Body() body: { title?: string; content?: string; days?: number; scope?: string; status?: string },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.updateMemory(id, body, runtimeId);
  }

  @Delete('memory/:id')
  async deleteMemory(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.deleteMemory(id, runtimeId);
  }

  @Delete('me/memories/:id')
  async deleteMemoryAlias(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.deleteMemory(id, runtimeId);
  }

  /**
   * The explicit re-consent action. It is a separate route on purpose: it is the only way an
   * effectively expired memory becomes usable again, and it writes a fresh consent timestamp, so it
   * must not be reachable as a side effect of an ordinary edit (§0.5/A5, §0.6/A5).
   */
  @Post('me/memories/:id/reactivate')
  async reactivateMemory(
    @Param('id') id: string,
    @Body() body: { days?: number },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = requireRuntimeUserId(userId);
    return await this.store.reactivateMemory(id, body?.days, runtimeId);
  }

  @Get('posts/:id')
  async post(@Param('id') id: string) {
    return { item: await this.store.getPost(id, true) };
  }

  @Post('posts/:id/hug')
  async hug(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    return await this.store.hugPost(id, runtimeUserId(userId));
  }

  @Delete('posts/:id/hug')
  async unHug(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    return await this.store.unHugPost(id, runtimeUserId(userId));
  }

  @Post('posts/:id/hugs')
  hugs(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    return this.hug(id, userId);
  }

  @Post('posts/:id/favorite')
  async favorite(@Param('id') id: string, @Headers('x-goodnight-user-id') requestedUserId?: string) {
    const post = await this.store.getPost(id, true);
    await this.store.addFavorite(requireRuntimeUserId(requestedUserId), 'post', id);
    await this.store.persistAndFlush();
    // Read again so the response reflects the favourite just added.
    return { item: await this.store.getPost(id, true) };
  }

  @Delete('posts/:id/favorite')
  async deleteFavorite(@Param('id') id: string, @Headers('x-goodnight-user-id') requestedUserId?: string) {
    await this.store.removeFavoriteByTarget(requireRuntimeUserId(requestedUserId), 'post', id);
    await this.store.persistAndFlush();
    return { item: await this.store.getPost(id, true) };
  }

  @Post('posts/:id/report')
  async report(@Param('id') id: string) {
    const item = await this.store.reportPost(id);
    return { item };
  }

  @Post('posts/:id/hide')
  async hideForCurrentUser(@Param('id') id: string) {
    const item = await this.store.hidePostForCurrentUser(id);
    return { ok: true, item };
  }

  @Delete('posts/:id')
  async deletePost(@Param('id') id: string, @Headers('x-goodnight-user-id') requestedUserId?: string) {
    // Only the author may delete a post. Moderation has its own admin route (hide/reject); without
    // this check any authenticated caller could take down someone else's public post by id.
    const userId = this.store.resolveRuntimeUserId(requireRuntimeUserId(requestedUserId));
    const post = await this.store.getPost(id, true);
    if (post.userId !== userId) throw new NotFoundException('树洞不存在');
    await this.store.deletePostAsAuthor(id);
    return { ok: true };
  }

  @Post('posts')
  async createPost(
    @Body()
    body: {
      content: string;
      emotion?: Emotion;
      mood?: string;
      visibility?: Visibility;
      style?: AIStyle;
      replyStyles?: AIStyle[];
      assetIds?: string[];
      journeyId?: string;
    },
  ) {
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
  async mood(
    @Body()
    body: {
      content: string;
      emotion?: Emotion;
      mood?: string;
      visibility: Visibility;
      style?: AIStyle;
      replyStyle?: AIStyle;
      replyStyles?: AIStyle[];
      assetIds?: string[];
      journeyId?: string;
    },
  ) {
    return this.store.createMood({
      ...body,
      emotion: normalizeEmotion(body.emotion ?? body.mood),
      style: body.style ?? body.replyStyle,
      replyStyles: body.replyStyles ?? (body.replyStyle ? [body.replyStyle] : undefined),
      journeyId: body.journeyId,
    });
  }

  @Post('moods/:id/queue-ai-replies')
  async queueReplies(@Param('id') id: string, @Headers('x-goodnight-user-id') requestedUserId?: string) {
    const userId = requireRuntimeUserId(requestedUserId);
    const mood = DIRECT_DB_MODELS.Mood ? await this.store.moodsDb.get(id) : this.store.moods.find((item) => item.id === id);
    const postId = DIRECT_DB_MODELS.Post
      ? await this.store.postsDb.idByMoodId(id)
      : (this.store.posts.find((item) => item.moodId === id)?.id ?? null);
    const styles: AIStyle[] = ['warm', 'rational', 'light', 'clear', 'poetic'];
    const jobs = styles.map((style) =>
      this.store.queueAI({
        taskType: 'public_ai_reply',
        userId: mood?.userId ?? userId,
        sourceId: id,
        style,
        content: mood?.content ?? '',
      }),
    );
    if (postId) {
      void Promise.all(jobs.map((job) => this.store.waitForAiJob(job.id))).then(async (completed) => {
        const usable = completed.filter((item) => ['succeeded', 'fallback'].includes(item.status));
        if (DIRECT_DB_MODELS.Reply) {
          for (const job of usable) {
            await this.store.repliesDb.create({
              id: `reply_${job.id}`,
              postId,
              type: 'AI',
              style: job.style,
              content: job.result,
              status: 'published',
              riskLevel: 'low',
              createdAt: new Date(job.createdAt),
            });
          }
          await this.store.syncReplyCount(postId);
          return;
        }
        for (const job of usable) {
          this.store.replies.unshift({
            id: `reply_${job.id}`,
            postId,
            type: 'AI',
            style: job.style,
            content: job.result,
            status: 'published',
            riskLevel: 'low',
            likeCount: 0,
            createdAt: job.createdAt,
          });
        }
        await this.store.syncReplyCount(postId);
        this.store.persist();
      });
    }
    return { jobs, jobIds: jobs.map((job) => job.id), status: 'queued' };
  }

  @Get('posts/:id/replies')
  async replies(@Param('id') id: string) {
    if (DIRECT_DB_MODELS.Reply) return { items: await this.store.repliesDb.listPublishedForPost(id) };
    return { items: this.store.replies.filter((item) => item.postId === id && item.status === 'published') };
  }

  @Get('reply-presets')
  async presets() {
    const now = new Date().toISOString();
    const required = ['抱抱你', '我懂你的感受', '会好起来的', '今晚早点休息', '你已经很棒了'].map((text, index) => ({
      id: `first5_preset_${index + 1}`,
      text,
      scene: 'comfort',
      sortOrder: index + 1,
      enabled: true,
      createdAt: now,
    }));
    const enabled = await this.feedbackPersistence.listPublicPresets();
    const items = [...required, ...enabled].reduce<Array<Record<string, unknown>>>((acc, item) => {
      if (!acc.some((seen) => seen.text === item.text)) acc.push(item as unknown as Record<string, unknown>);
      return acc;
    }, []);
    return { items };
  }

  @Post('posts/:id/replies')
  async reply(@Param('id') id: string, @Body() body: { content: string; anonymous?: boolean; visibility?: string }) {
    const item = await this.store.createReply(id, body);
    await this.store.flush();
    return { item };
  }

  @Post('replies/:id/like')
  async likeReply(@Param('id') id: string) {
    return { item: await this.store.likeReply(id) };
  }

  @Post('ai/generate')
  async aiGenerate(@Body() body: AIGenerateInput, @Headers('x-goodnight-user-id') userId?: string) {
    const job = this.store.queueAI({
      ...body,
      userId: this.store.resolveRuntimeUserId(runtimeUserId(userId)),
    });
    if (DIRECT_DB_MODELS.AIJob) {
      await this.store.awaitJobCommit(job.id);
    }
    return { jobId: job.id, status: job.status, job };
  }

  @Post('ai/tasks')
  async aiTask(@Body() body: AIGenerateInput, @Headers('x-goodnight-user-id') userId?: string) {
    const job = this.store.queueAI({
      ...body,
      userId: this.store.resolveRuntimeUserId(runtimeUserId(userId)),
    });
    if (DIRECT_DB_MODELS.AIJob) {
      await this.store.awaitJobCommit(job.id);
    }
    return { jobId: job.id, status: job.status, job };
  }

  @Get('ai/tasks/latest')
  async latestAiTask(
    @Query('taskType') taskType = 'negative_rewrite',
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const job = await this.store.latestSuccessfulAiJob(
      this.store.resolveRuntimeUserId(runtimeUserId(userId)),
      taskType,
    );
    const safeJob = job ? this.store.peerAssistJobForResponse(job) : null;
    return {
      item: safeJob,
      jobId: safeJob?.id ?? null,
      status: safeJob?.status ?? null,
      result: safeJob?.result ?? '',
    };
  }

  @Get('ai/tasks/:id')
  async aiTaskStatus(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    const expectedUserId = this.store.resolveRuntimeUserId(runtimeUserId(userId));
    if (DIRECT_DB_MODELS.AIJob) {
      await this.store.awaitJobCommit(id);
      const job = await this.batch1Persistence.getAiJob(id);
      if (!job || job.userId !== expectedUserId) {
        throw new NotFoundException('AI 任务不存在');
      }
      const safeJob = this.store.peerAssistJobForResponse(job);
      return {
        jobId: safeJob.id,
        status: safeJob.status,
        job: safeJob,
        result: safeJob.result,
        structured: safeJob.structuredResult ?? {},
      };
    }
    const job = this.store.aiJobs.find((item) => item.id === id);
    if (!job || job.userId !== expectedUserId) {
      throw new NotFoundException('AI 任务不存在');
    }
    if (!['queued', 'running'].includes(job.status)) await this.store.flush();
    const safeJob = this.store.peerAssistJobForResponse(job);
    return {
      jobId: safeJob.id,
      status: safeJob.status,
      job: safeJob,
      result: safeJob.result,
      structured: safeJob.structuredResult ?? {},
    };
  }

  @Get('letters/today')
  async today(@Headers('x-goodnight-user-id') requestedUserId?: string) {
    const userId = requireRuntimeUserId(requestedUserId);
    const letter = (DIRECT_DB_MODELS.Letter
      ? await this.store.lettersDb.findLatestWithContent(userId)
      : this.store.letters.find((item) => item.userId === userId)) ?? undefined;
    const sourceId: string | null =
      letter?.sourceMoodId ??
      (DIRECT_DB_MODELS.Mood
        ? (await this.store.moodsDb.latestForUser(userId))?.id
        : this.store.moods.find((item) => item.userId === userId)?.id) ??
      null;
    // `sourceMoodId` is a real foreign key, so a letter may only point at a mood row that exists.
    // This used to fall back to the literal seed id 'mood_1', which the seed no longer writes - it
    // writes `mood_seed_*` - so every user without a mood hit a foreign-key violation and the page
    // 500'd. A letter with no source is legitimate (`sourceMoodId` is nullable), so the fallback is
    // to leave it null rather than to invent a row that will never satisfy the constraint.
    // Diary is database-authoritative, so the fallback source is a row read rather than a scan of the
    // legacy array - whose getter throws.
    const source =
      (await this.store.resolveSourceContent(sourceId)) ||
      (DIRECT_DB_MODELS.Diary ? await this.store.diariesDb.findLatestWithContent(userId) : undefined)?.content ||
      '今天也辛苦了';
    // A read must never repeatedly enqueue a replacement task for a completed
    // letter. New private moods and explicit style changes already create a
    // real AiJob; GET remains an idempotent read of that persisted state.
    if (!letter || !letter.content) {
      const queued = await this.store.queueLetterGeneration({
        userId,
        sourceMoodId: sourceId,
        style: letter?.style ?? 'warm',
        content: source,
        letter,
      });
      return {
        item: { ...this.store.decorateLetter(queued.letter), sourceDiaryId: await this.sourceDiaryIdFor(queued.letter, userId) },
        jobId: queued.job.id,
        status: queued.job.status,
      };
    }
    return { item: { ...this.store.decorateLetter(letter), sourceDiaryId: await this.sourceDiaryIdFor(letter, userId) } };
  }

  /**
   * The diary entry a letter was written for, as the id that entry currently has.
   *
   * The diary row for the source mood when one exists, otherwise the mood itself (the diary list
   * projects it under the mood id). Returning the mood id alone is not enough: a diary row created for
   * that mood carries a different id, and the link would land on "没有找到这篇日记".
   */
  private async sourceDiaryIdFor(letter: any, caller: string): Promise<string | undefined> {
    if (!letter?.sourceMoodId) return undefined;
    const rows = DIRECT_DB_MODELS.Diary
      ? await this.store.diariesDb.listForUser(caller)
      : this.store.diaries.filter((item) => item.userId === caller);
    const linked =
      rows.find((row) => row.moodId === letter.sourceMoodId) ?? rows.find((row) => row.letterId === letter.id);
    return linked?.id ?? letter.sourceMoodId;
  }

  @Get('letters')
  async letters(@Query('status') status?: string, requestedUserId?: string) {
    const userId = requireRuntimeUserId(requestedUserId);
    let items = DIRECT_DB_MODELS.Letter
      ? await this.store.lettersDb.listForUser(userId)
      : this.store.letters.filter((item) => item.userId === userId);
    if (status === 'unread') items = items.filter((item) => item.status === 'unread');
    if (status === 'favorited' || status === 'fav')
      // `Letter.favorite` is the denormalised column FavoritePersistenceService keeps in step with
      // the favourite table; reading the table per row here would be an N+1 for no gain.
      items = items.filter((item) => Boolean(item.favorite));
    return { items: items.map((item) => this.store.decorateLetter(item)) };
  }

  @Get('letters/:id')
  async letter(@Param('id') id: string, @Headers('x-goodnight-user-id') userId?: string) {
    // The letter is private to its owner. The ownership check has to happen before the
    // lookup: an unknown caller id must not silently fall back to the demo user's letters
    // (product audit ISSUE-017).
    const caller = this.store.resolveRuntimeUserId(runtimeUserId(userId));
    const letter = DIRECT_DB_MODELS.Letter
      ? await this.store.lettersDb.get(id)
      : this.store.letters.find((item) => item.id === id);
    if (letter && letter.userId !== caller) throw new NotFoundException('回信不存在');
    if (!letter) return { item: undefined };
    return { item: { ...this.store.decorateLetter(letter), sourceDiaryId: await this.sourceDiaryIdFor(letter, caller) } };
  }

  @Patch('letters/:id/read')
  async readLetter(@Param('id') id: string, @Headers('x-goodnight-user-id') requestedUserId?: string) {
    const userId = this.store.resolveRuntimeUserId(requireRuntimeUserId(requestedUserId));
    const letter = DIRECT_DB_MODELS.Letter
      ? await this.store.lettersDb.findOwned(id, userId)
      : this.store.letters.find((item) => item.id === id && item.userId === userId);
    if (!letter) throw new NotFoundException('回信不存在');
    letter.status = 'read';
    this.store.persist();
    return { item: letter };
  }

  @Post('letters/:id/like')
  async likeLetter(@Param('id') id: string, @Headers('x-goodnight-user-id') requestedUserId?: string) {
    const userId = this.store.resolveRuntimeUserId(requireRuntimeUserId(requestedUserId));
    const letter = DIRECT_DB_MODELS.Letter
      ? await this.store.lettersDb.findOwned(id, userId)
      : this.store.letters.find((item) => item.id === id && item.userId === userId);
    if (!letter) throw new NotFoundException('回信不存在');
    letter.likeCount = (letter.likeCount ?? 0) + 1;
    this.store.persist();
    return { item: letter };
  }

  @Post('letters/:id/regenerate')
  async regenerate(
    @Param('id') id: string,
    @Body() body: { style?: AIStyle; simulatePrimaryFail?: boolean; simulateBackupFail?: boolean },
    @Headers('x-goodnight-user-id') requestedUserId?: string,
  ) {
    // The letter must belong to the caller. The old fallback to `letters[0]` meant an unknown id
    // silently regenerated whichever letter happened to be first in the store - possibly another
    // user's, using their private content as the AI source.
    const userId = this.store.resolveRuntimeUserId(requireRuntimeUserId(requestedUserId));
    const letter = DIRECT_DB_MODELS.Letter
      ? await this.store.lettersDb.findOwned(id, userId)
      : this.store.letters.find((item) => item.id === id && item.userId === userId);
    if (!letter) throw new NotFoundException('回信不存在');
    const source =
      (await this.store.resolveSourceContent(letter.sourceMoodId)) ||
      (DIRECT_DB_MODELS.Diary ? await this.store.diariesDb.findLatestWithContent(letter.userId) : undefined)?.content ||
      letter.content;
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
    // The latest explicit style choice owns the letter. An earlier, slower
    // remote result must not overwrite it after the person has moved on.
    letter.aiJobId = job.id;
    letter.generationStatus = job.status;
    this.store.persist();
    void this.store
      .waitForAiJob(job.id)
      .then((completed) => {
        if (letter.aiJobId !== completed.id) return;
        letter.style = body.style ?? letter.style;
        letter.generationStatus = completed.status;
        if (['succeeded', 'fallback'].includes(completed.status)) {
          letter.content = completed.result;
          letter.status = 'unread';
        }
        this.store.persist();
      })
      .catch(() => {
        if (letter.aiJobId !== job.id) return;
        letter.generationStatus = 'failed';
        this.store.persist();
      });
    return { item: letter, jobId: job.id, status: job.status, job };
  }

  @Post('letters/generate')
  async generateLetter(
    @Body() body: { style?: AIStyle; simulatePrimaryFail?: boolean; simulateBackupFail?: boolean },
    @Headers('x-goodnight-user-id') requestedUserId?: string,
  ) {
    const userId = requireRuntimeUserId(requestedUserId);
    const letter = DIRECT_DB_MODELS.Letter
      ? (await this.store.lettersDb.listRecentForUser(userId)).at(-1) ?? null
      : this.store.letters.find((item) => item.userId === userId);
    if (letter) return this.regenerate(letter.id, body, userId);
    // Same nullable-source rule as `today` above: the user may have no mood at all, and inventing a
    // source id that no row satisfies only turns this into a foreign-key failure.
    const latestMoodId = DIRECT_DB_MODELS.Mood
      ? (await this.store.moodsDb.latestForUser(userId))?.id
      : this.store.moods.find((item) => item.userId === userId)?.id;
    const queued = await this.store.queueLetterGeneration({
      userId,
      sourceMoodId: latestMoodId ?? null,
      style: body.style ?? 'warm',
      content: '今天也辛苦了',
    });
    return { item: queued.letter, jobId: queued.job.id, status: queued.job.status, job: queued.job };
  }

  @Post('letters/:id/poster')
  async poster(@Param('id') id: string, @Headers('x-goodnight-user-id') requestedUserId?: string) {
    const userId = this.store.resolveRuntimeUserId(requireRuntimeUserId(requestedUserId));
    const letter = DIRECT_DB_MODELS.Letter
      ? await this.store.lettersDb.findOwned(id, userId)
      : this.store.letters.find((item) => item.id === id && item.userId === userId);
    if (!letter) throw new NotFoundException('回信不存在');
    const asset = await this.store.createLetterPoster(letter);
    return { posterUrl: asset.url, asset, permission: 'album-required' };
  }

  @Post('share-image')
  async shareImage(
    @Body() body: { id?: string; type?: string; month?: string },
    @Headers('x-goodnight-user-id') requestedUserId?: string,
  ) {
    const userId = this.store.resolveRuntimeUserId(requireRuntimeUserId(requestedUserId));
    const letter = body.id
      ? DIRECT_DB_MODELS.Letter
        ? await this.store.lettersDb.findOwned(body.id, userId)
        : this.store.letters.find((item) => item.id === body.id && item.userId === userId)
      : undefined;
    if (body.type === 'letter' || body.id) {
      if (!letter) throw new NotFoundException('回信不存在');
      const asset = await this.store.createLetterPoster(letter);
      return { posterUrl: asset.url, asset, permission: 'album-required' };
    }
    if (body.type === 'report' || body.month) return await this.reportPoster(body.month ?? currentMonth());
    throw new BadRequestException('请指定要生成的回信或月报分享图');
  }

  @Post('letters/:id/save-to-diary')
  async saveToDiary(@Param('id') id: string, @Headers('x-goodnight-user-id') requestedUserId?: string) {
    const userId = this.store.resolveRuntimeUserId(requireRuntimeUserId(requestedUserId));
    const letter = DIRECT_DB_MODELS.Letter
      ? await this.store.lettersDb.findOwned(id, userId)
      : this.store.letters.find((item) => item.id === id && item.userId === userId);
    if (!letter) throw new NotFoundException('回信不存在');
    const savedDiary = {
      id: `diary_${Date.now()}`,
      userId: letter.userId,
      letterId: id,
      emotion: '委屈' as Emotion,
      content: letter.content,
      hasLetter: true,
      createdAt: new Date().toISOString(),
    };
    if (DIRECT_DB_MODELS.Letter && DIRECT_DB_MODELS.Diary) {
      // One transaction: the flag and the diary entry either both land or neither does. Split across
      // two writes, a failed insert left the letter marked saved with no diary behind it, and the flag
      // has to reach the row rather than just the object returned to this caller - otherwise the page
      // showed 已收藏 until the next read and then 收藏 again.
      const result = await this.store.lettersDb.saveToDiaryAtomically(id, userId, {
        id: savedDiary.id,
        emotion: savedDiary.emotion,
        content: savedDiary.content,
        createdAt: new Date(savedDiary.createdAt),
      });
      if (!result.saved) throw new NotFoundException('回信不存在');
      letter.savedToDiary = true;
      return { item: letter };
    }
    letter.savedToDiary = true;
    if (DIRECT_DB_MODELS.Diary) {
      await this.store.diariesDb.create({ ...savedDiary, createdAt: new Date(savedDiary.createdAt) });
    } else {
      this.store.diaries.unshift(savedDiary);
    }
    this.store.persist();
    await this.store.flush();
    return { item: letter };
  }

  @Post('letters/:id/favorite')
  async favoriteLetter(@Param('id') id: string, @Headers('x-goodnight-user-id') requestedUserId?: string) {
    const userId = requireRuntimeUserId(requestedUserId);
    const letter = DIRECT_DB_MODELS.Letter
      ? await this.store.lettersDb.findOwned(id, userId)
      : this.store.letters.find((item) => item.id === id && item.userId === userId);
    if (!letter) throw new NotFoundException('回信不存在');
    await this.store.addFavorite(userId, 'letter', id);
    await this.store.persistAndFlush();
    return { item: this.store.decorateLetter(letter) };
  }

  @Delete('letters/:id/favorite')
  async deleteFavoriteLetter(@Param('id') id: string, @Headers('x-goodnight-user-id') requestedUserId?: string) {
    const userId = requireRuntimeUserId(requestedUserId);
    const letter = DIRECT_DB_MODELS.Letter
      ? await this.store.lettersDb.findOwned(id, userId)
      : this.store.letters.find((item) => item.id === id && item.userId === userId);
    if (!letter) throw new NotFoundException('回信不存在');
    await this.store.removeFavoriteByTarget(userId, 'letter', id);
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
  decompose(@Body() body: { content: string }, @Headers('x-goodnight-user-id') requestedUserId?: string) {
    const job = this.store.queueAI({
      taskType: 'breakdown',
      content: body.content,
      style: 'rational',
      userId: requireRuntimeUserId(requestedUserId),
      sourceId: `task_${Date.now()}`,
    });
    return { taskId: job.id, jobId: job.id, status: job.status, job };
  }

  @Post('ai/tools/breakdown')
  aiBreakdown(@Body() body: { content: string; mood?: string; style?: AIStyle }, @Headers('x-goodnight-user-id') requestedUserId?: string) {
    const job = this.store.queueAI({
      taskType: 'breakdown',
      content: body.content,
      mood: body.mood,
      style: body.style ?? 'rational',
      userId: requireRuntimeUserId(requestedUserId),
      sourceId: `task_${Date.now()}`,
    });
    return { taskId: job.id, jobId: job.id, status: job.status, job };
  }

  @Post('tools/decompose')
  decomposeAlias(@Body() body: { content: string }) {
    return this.decompose(body);
  }

  @Post('tools/run')
  runTool(
    @Body() body: { toolId?: string; type?: string; content?: string; input?: string; style?: AIStyle },
    @Headers('x-goodnight-user-id') requestedUserId?: string,
  ) {
    const toolType = body.type ?? body.toolId ?? 'rewrite';
    const text = body.input ?? body.content ?? '';
    const style =
      body.style ??
      (toolType.includes('rewrite')
        ? 'clear'
        : toolType.includes('future')
          ? 'poetic'
          : toolType.includes('work')
            ? 'rational'
            : toolType.includes('rant')
              ? 'light'
              : 'warm');
    const job = this.store.queueAI({
      userId: requireRuntimeUserId(requestedUserId),
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
  async saveDecompose(@Param('taskId') taskId: string, @Headers('x-goodnight-user-id') requestedUserId?: string) {
    const userId = requireRuntimeUserId(requestedUserId);
    const job = DIRECT_DB_MODELS.AIJob
      ? await this.batch1Persistence.getAiJob(taskId)
      : this.store.aiJobs.find((item) => item.id === taskId);
    const structured = (
      job?.traceJson.find((item) => typeof item === 'object' && item && 'structured' in item) as
        { structured?: unknown } | undefined
    )?.structured;
    const decomposedDiary = {
      id: id('diary'),
      userId,
      emotion: '焦虑' as Emotion,
      content: job?.result ?? `情绪拆解结果 ${taskId}`,
      hasLetter: false,
      source: 'tool-decompose',
      createdAt: new Date().toISOString(),
    };
    if (DIRECT_DB_MODELS.Diary) {
      await this.store.diariesDb.create({ ...decomposedDiary, createdAt: new Date(decomposedDiary.createdAt) });
    } else {
      this.store.diaries.unshift(decomposedDiary);
    }
    await this.store.persistAndFlush();
    return { ok: true };
  }

  /**
   * The caller's anonymous profile.
   *
   * Read from the database, not the boot-time snapshot: `nickname` is editable and
   * database-authoritative (UI-V2-29-D1), and the snapshot would show a stale name after an edit on
   * another instance. The response is a whitelist projection - no `openid` - and is not cacheable.
   */
  @Get('me/profile')
  @Header('Cache-Control', 'no-store')
  async profile(@Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    return { item: await this.store.readUserProfile(runtimeId) };
  }

  /** Saves the caller's nickname. Only `nickname` is accepted; identity is never taken from the body. */
  @Patch('me/profile')
  @Header('Cache-Control', 'no-store')
  async updateProfile(@Body() body: unknown, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    return { item: await this.store.updateUserNickname(runtimeId, normalizeNickname(body)) };
  }

  @Get('me/stats')
  async stats(@Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    const month = currentMonth();
    const userDiaries = DIRECT_DB_MODELS.Diary
      ? await this.store.diariesDb.listForUser(runtimeId)
      : this.store.diaries.filter((item) => item.userId === runtimeId);
    const userLetters = DIRECT_DB_MODELS.Letter
      ? await this.store.lettersDb.listForUser(runtimeId)
      : this.store.letters.filter((item) => item.userId === runtimeId);
    // Favorite is database-authoritative; counting the in-memory array would always report 0.
    const favoriteCount = await this.store.favoritesDb.countForUser(runtimeId);
    return {
      item: {
        diaryCount: userDiaries.length,
        letterCount: userLetters.length,
        favoriteCount,
        growthDays: 21,
        streakDays: Math.min(7, Math.max(1, userDiaries.length + 3)),
        replyCount: userLetters.length,
        monthlyDiaryCount: userDiaries.filter((item) => new Date(item.createdAt).toISOString().startsWith(month)).length,
      },
    };
  }

  @Get('me/growth-card')
  growthCard(@Headers('x-goodnight-user-id') userId?: string) {
    this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    return { item: { title: '情绪成长卡', streak: 7, sentence: '你在认真照顾自己。' } };
  }

  @Delete('me/data')
  async clearData(@Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    await this.store.clearFavoritesForUser(runtimeId);
    if (DIRECT_DB_MODELS.Diary) await this.store.diariesDb.deleteAllForUser(runtimeId);
    else this.store.diaries = this.store.diaries.filter((item) => item.userId !== runtimeId);
    if (DIRECT_DB_MODELS.Letter) await this.store.lettersDb.deleteAllForUser(runtimeId);
    else this.store.letters = this.store.letters.filter((item) => item.userId !== runtimeId);
    await this.store.persistAndFlush();
    return { ok: true };
  }

  @Post('diaries')
  async createDiary(
    @Body()
    body: {
      content: string;
      emotion?: string;
      letterId?: string;
      hasLetter?: boolean;
      source?: string;
      toolResult?: unknown;
    },
    requestedUserId?: string,
  ) {
    const targetUserId = requireRuntimeUserId(requestedUserId);
    const diary = {
      id: `diary_${Date.now()}`,
      userId: targetUserId,
      letterId: body.letterId,
      emotion: normalizeEmotion(body.emotion),
      content: body.content?.trim() || '今天认真照顾了自己的心情。',
      hasLetter: Boolean(body.hasLetter || body.letterId),
      source: body.source ?? 'manual',
      toolResult: body.toolResult,
      createdAt: new Date().toISOString(),
    };
    if (DIRECT_DB_MODELS.Diary) {
      const created = await this.store.diariesDb.create({
        id: diary.id,
        userId: targetUserId,
        content: diary.content,
        emotion: diary.emotion,
        letterId: diary.letterId,
        source: diary.source,
        toolResult: diary.toolResult,
        createdAt: new Date(diary.createdAt),
      });
      return { item: created };
    }
    this.store.diaries.unshift(diary);
    this.store.persist();
    await this.store.flush();
    return { item: diary };
  }

  @Post('diaries/export')
  async exportDiaries(@Headers('x-goodnight-user-id') requestedUserId?: string) {
    return { item: await this.store.createDiaryExport(requireRuntimeUserId(requestedUserId)) };
  }

  @Get('exports/:assetId/download')
  async downloadDiaryExport(@Param('assetId') assetId: string, @Headers('x-goodnight-user-id') requestedUserId?: string) {
    const download = await this.store.getExportDownload(assetId, requireRuntimeUserId(requestedUserId));
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
  private async diaryEntries(userId: string) {
    // Diary is database-authoritative since Batch 4, so the list is a table read. The legacy array
    // read that used to sit here threw - its getter is disabled - which made every diary list a 500.
    const persisted = DIRECT_DB_MODELS.Diary
      ? await this.store.diariesDb.listForUser(userId)
      : this.store.diaries.filter((item) => item.userId === userId);
    const linkedMoodIds = new Set(persisted.map((item) => item.moodId).filter((item): item is string => Boolean(item)));
    const moodRows = DIRECT_DB_MODELS.Mood ? await this.store.moodsDb.listForUser(userId) : this.store.moods;
    // The companion letter for each candidate mood is fetched once, because the projection needs it
    // for every row that survives the filter and a per-row read would be an N+1 over the same ids.
    const letterByMoodId = DIRECT_DB_MODELS.Letter
      ? await this.store.lettersDb.latestBySourceMoods(
          (moodRows as Array<{ id: string }>).map((item) => item.id),
          userId,
        )
      : new Map<string, { generationStatus?: string; id?: string } | null>();
    const projectedMoods = moodRows
      .filter(
        (item) =>
          item.userId === userId &&
          item.visibility === 'PRIVATE' &&
          item.status === 'active' &&
          !linkedMoodIds.has(item.id),
      )
      .map((mood) => {
        const letter = DIRECT_DB_MODELS.Letter
          ? letterByMoodId.get(mood.id)
          : this.store.letters.find((item) => item.userId === userId && item.sourceMoodId === mood.id);
        const hasLetter = Boolean(
          letter && (!letter.generationStatus || ['succeeded', 'fallback'].includes(letter.generationStatus)),
        );
        return {
          id: mood.id,
          userId: mood.userId,
          moodId: mood.id,
          letterId: hasLetter ? letter?.id : undefined,
          emotion: mood.emotion,
          content: mood.content,
          hasLetter,
          source: 'private-mood-projection',
          attachmentIds: 'attachmentIds' in mood ? (mood.attachmentIds ?? []) : [],
          createdAt: typeof mood.createdAt === 'string' ? mood.createdAt : mood.createdAt.toISOString(),
        };
      });
    return [...persisted, ...projectedMoods].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  /**
   * Turns a diary or projected mood row into the shape the page renders.
   *
   * The attachments are the mood's, which is where the upload actually lives (`Post.moodId` is
   * unique and the mood owns its files). MediaAsset is database-authoritative, so resolving the ids
   * is an async table read, which is why this is async and both call sites await it.
   */
  private async decorateDiaryEntry(item: { emotion: string; moodId?: string; attachmentIds?: string[] }) {
    const attachmentIds =
      item.attachmentIds ??
      (DIRECT_DB_MODELS.Mood
        ? await this.store.moodsDb.attachmentIdsFor(item.moodId ?? '')
        : this.store.moods.find((mood) => mood.id === item.moodId)?.attachmentIds) ??
      [];
    return {
      ...item,
      attachments: await this.store.mediaByIds(attachmentIds),
      emotionLabel: emotionLabel(item.emotion),
    };
  }

  @Get('diaries')
  async diaries(
    @Query('month') month?: string,
    @Query('emotion') emotion?: string,
    @Query('hasLetter') hasLetter?: string,
    requestedUserId?: string,
  ) {
    const userId = requireRuntimeUserId(requestedUserId);
    const normalizedEmotion = emotion ? normalizeEmotion(emotion) : '';
    const entries = await this.diaryEntries(userId);
    const items = await Promise.all(
      entries
        .filter((item) => !month || item.createdAt.startsWith(month))
        .filter((item) => !emotion || emotion === '全部' || emotion === '全部' || item.emotion === normalizedEmotion)
        .filter((item) => !hasLetter || String(item.hasLetter) === hasLetter)
        .map((item) => this.decorateDiaryEntry(item)),
    );
    return { items };
  }

  @Get('diaries/months')
  async diaryMonths(requestedUserId?: string) {
    const userId = requireRuntimeUserId(requestedUserId);
    const entries = await this.diaryEntries(userId);
    const items = [
      ...new Set(entries.map((item) => item.createdAt.slice(0, 7)).filter(Boolean)),
    ].sort((left, right) => right.localeCompare(left));
    return { items };
  }

  @Get('me/diaries')
  meDiaries(
    @Query('month') month?: string,
    @Query('emotion') emotion?: string,
    @Query('hasLetter') hasLetter?: string,
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    return this.diaries(month, emotion, hasLetter, runtimeId);
  }

  @Get('me/diaries/months')
  meDiaryMonths(@Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    return this.diaryMonths(runtimeId);
  }

  @Post('me/diaries')
  createMeDiary(
    @Body()
    body: {
      content: string;
      emotion?: string;
      letterId?: string;
      hasLetter?: boolean;
      source?: string;
      toolResult?: unknown;
    },
    @Headers('x-goodnight-user-id') userId?: string,
  ) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    return this.createDiary(body, runtimeId);
  }

  @Get('diaries/:id')
  async diary(@Param('id') id: string, @Headers('x-goodnight-user-id') requestedUserId?: string) {
    const entries = await this.diaryEntries(requireRuntimeUserId(requestedUserId));
    const item = entries.find((diary) => diary.id === id);
    if (!item) return { item: null };
    return { item: await this.decorateDiaryEntry(item) };
  }

  @Delete('diaries/:id')
  async deleteDiary(@Param('id') id: string, @Headers('x-goodnight-user-id') requestedUserId?: string) {
    // A diary id is not a capability. Without the owner scope any authenticated caller could delete
    // someone else's entry by guessing an id, and the ids are timestamp-derived.
    const userId = this.store.resolveRuntimeUserId(requireRuntimeUserId(requestedUserId));
    // The delete has to reach the table before the response: a 200 followed by a restart used to
    // bring the entry back, because the handler mutated memory and never flushed.
    await this.store.diariesDb.deleteOwned(id, userId);
    return { ok: true };
  }

  @Get('favorites')
  async favorites(@Query('type') type?: string, requestedUserId?: string) {
    const userId = requireRuntimeUserId(requestedUserId);
    // Favorite is database-authoritative; the in-memory array is empty once it is registered.
    const rows = await this.store.favoritesDb.listForUser(userId, type);
    // The preview comes from the favourite's target. Post is database-authoritative too, so its rows
    // are read from the table; Letter and Diary still come from the store's arrays.
    const favouritePosts = DIRECT_DB_MODELS.Post
      ? await this.store.postsDb.findByIds(rows.filter((item) => item.targetType === 'post').map((item) => item.targetId))
      : [];
    const items = await Promise.all(
      rows.map(async (item) => {
      const post =
        item.targetType === 'post' ? favouritePosts.find((postItem) => postItem.id === item.targetId) : undefined;
      const letter =
        item.targetType === 'letter'
          ? DIRECT_DB_MODELS.Letter
            ? await this.store.lettersDb.get(item.targetId)
            : this.store.letters.find((letterItem) => letterItem.id === item.targetId)
          : undefined;
      const diary =
        item.targetType === 'diary'
          ? DIRECT_DB_MODELS.Diary
            ? await this.store.diariesDb.get(item.targetId)
            : this.store.diaries.find((diaryItem) => diaryItem.id === item.targetId)
          : undefined;
      return {
        ...item,
        title: letter?.title ?? (post ? '收藏的树洞' : diary ? '收藏的日记' : '收藏内容'),
        preview: letter?.content ?? post?.content ?? diary?.content ?? item.targetId,
        emotion: post?.emotion
          ? emotionLabel(post.emotion)
          : diary?.emotion
            ? emotionLabel(diary.emotion)
            : undefined,
      };
    }),
    );
    return { items };
  }

  @Get('me/favorites')
  async meFavorites(@Query('type') type?: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    return await this.favorites(type, runtimeId);
  }

  @Get('me/letters')
  meLetters(@Query('status') status?: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    return this.letters(status, runtimeId);
  }

  @Delete('favorites/:id')
  async deleteFavoriteItem(@Param('id') id: string, @Headers('x-goodnight-user-id') requestedUserId?: string) {
    await this.store.removeFavoriteById(requireRuntimeUserId(requestedUserId), id);
    await this.store.persistAndFlush();
    return { ok: true };
  }

  @Get('reports/monthly')
  async monthly(@Query('month') month?: string, @Headers('x-goodnight-user-id') userId?: string) {
    return await this.reports.monthly(month, runtimeUserId(userId));
  }

  @Get('reports/monthly/months')
  async monthlyMonths(@Headers('x-goodnight-user-id') userId?: string) {
    return await this.reports.availableMonths(runtimeUserId(userId));
  }

  @Get('report/month')
  async monthReportAlias(@Query('month') month?: string, @Headers('x-goodnight-user-id') userId?: string) {
    return await this.monthly(month, userId);
  }

  @Get('me/month-report')
  async meMonthReport(@Query('month') month?: string, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    return await this.monthly(month, runtimeId);
  }

  @Get('reports/monthly/:month/advice')
  async advice(@Param('month') month: string, @Headers('x-goodnight-user-id') userId?: string) {
    return await this.reports.advice(month, runtimeUserId(userId));
  }

  @Post('reports/monthly/:month/poster')
  async reportPoster(@Param('month') month: string, @Headers('x-goodnight-user-id') userId?: string) {
    return await this.reports.poster(month, runtimeUserId(userId));
  }

  @Post('report/share-image')
  async reportShareImage(@Body() body: { month?: string }) {
    return await this.reportPoster(body.month ?? new Date().toISOString().slice(0, 7));
  }

  @Get('settings/privacy')
  async privacy(@Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    if (DIRECT_DB_MODELS.PrivacySetting) {
      const item = await this.selfPersistence.getPrivacySettings(runtimeId);
      return { item };
    }
    return { item: this.store.privacySettings[runtimeId] };
  }

  @Get('me/privacy')
  async mePrivacy(@Headers('x-goodnight-user-id') userId?: string) {
    return await this.privacy(userId);
  }

  @Get('privacy-settings')
  async privacySettingsAlias(@Headers('x-goodnight-user-id') userId?: string) {
    return await this.privacy(userId);
  }

  @Put('settings/privacy')
  async updatePrivacy(@Body() body: Partial<PrivacySetting>, @Headers('x-goodnight-user-id') userId?: string) {
    const runtimeId = this.store.resolveRuntimeUserId(requireRuntimeUserId(userId));
    const allowedKeys = [
      'defaultVisibility',
      'allowAnonymousPublic',
      'allowHumanReplies',
      'allowMonthlyReportShare',
      'allowPeerMatching',
      'allowAnonymousExperienceStats',
      'allowRecoveryData',
      'allowJourneyLongTermAnalysis',
      'allowLongTermMemory',
      'allowAiMemoryUse',
      'allowAnonymousExperienceShare',
      'allowJourneyArchiveRetention',
      'allowFutureSelfNotifications',
      'allowDataExport',
    ] as const;
    const patch: any = {};
    for (const key of allowedKeys) {
      const value = body[key];
      if (key === 'defaultVisibility') {
        if (value === 'PRIVATE' || value === 'PUBLIC') patch.defaultVisibility = value;
      } else if (typeof value === 'boolean') {
        patch[key] = value;
      }
    }
    if (DIRECT_DB_MODELS.PrivacySetting) {
      const item = await this.selfPersistence.updatePrivacySettings(runtimeId, patch);
      return { item };
    }
    this.store.privacySettings[runtimeId] = { ...this.store.privacySettings[runtimeId], ...patch };
    this.store.persist();
    await this.store.flush();
    return { item: this.store.privacySettings[runtimeId] };
  }

  @Patch('settings/privacy')
  async patchPrivacy(@Body() body: Partial<PrivacySetting>, @Headers('x-goodnight-user-id') userId?: string) {
    return await this.updatePrivacy(body, userId);
  }

  @Patch('me/privacy')
  async patchMePrivacy(@Body() body: Partial<PrivacySetting>, @Headers('x-goodnight-user-id') userId?: string) {
    return await this.updatePrivacy(body, userId);
  }

  @Patch('privacy-settings')
  async patchPrivacyAlias(@Body() body: Partial<PrivacySetting>, @Headers('x-goodnight-user-id') userId?: string) {
    return await this.updatePrivacy(body, userId);
  }

  @Get('feedback/categories')
  async categories() {
    return { items: await this.feedbackPersistence.listPublicCategories() };
  }

  @Get('feedback/faqs')
  async faqs() {
    // Read from the table the console writes. Do not inject display-only fallback questions here: a
    // disabled/deleted FAQ must disappear after the next frontend reload.
    return { items: await this.feedbackPersistence.listPublicFaqs() };
  }

  @Post('feedback')
  async feedback(
    @Body() body: { categoryId?: string; content: string; sourcePage?: string; assetIds?: string[]; images?: string[] },
    @Headers('x-goodnight-user-id') requestedUserId?: string,
  ) {
    const userId = requireRuntimeUserId(requestedUserId);
    // The screenshot check still runs in the store, because MediaAsset is not converted yet and its
    // checks include a filesystem existence probe. The ids it returns are handed to the ticket writer,
    // which owns the row - the two models convert together with FeedbackCategory.
    const screenshots = await this.store.resolveFeedbackScreenshotIds(userId, body.assetIds ?? body.images);
    const ticket = await this.feedbackPersistence.createTicket({
      userId,
      categoryId: body.categoryId,
      content: body.content,
      sourcePage: body.sourcePage,
      screenshots,
    });
    return { item: ticket };
  }

  @Get('feedback')
  async feedbackTickets(@Headers('x-goodnight-user-id') requestedUserId?: string) {
    const userId = requireRuntimeUserId(requestedUserId);
    return { items: await this.feedbackPersistence.listTicketsForUser(userId) };
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
  async deleteMedia(@Param('id') id: string, @Headers('x-goodnight-user-id') requestedUserId?: string) {
    // The caller's own identity, so the delete is scoped to the same owner the upload attributed the
    // row to. Without it a non-demo user's draft image is a 404 to its own author.
    await this.store.deleteMediaAsset(id, requireRuntimeUserId(requestedUserId));
    return { ok: true };
  }

  // Legacy metadata-only upload endpoints are intentionally disabled: an uploaded asset must have a real file.
  @Post('upload')
  uploadAlias() {
    throw new BadRequestException('请使用 multipart /api/v1/media/upload 上传真实文件');
  }

  @Post('uploads')
  uploadsAlias() {
    throw new BadRequestException('请使用 multipart /api/v1/media/upload 上传真实文件');
  }

  @Post('export/diaries')
  exportDiariesAlias() {
    return this.exportDiaries();
  }

  @Post('share/image')
  shareImageAlias(@Body() body: { id?: string; type?: string }) {
    return this.shareImage(body);
  }

  @Post('assets/complete')
  complete() {
    throw new BadRequestException('请使用 multipart /api/v1/media/upload 上传真实文件');
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('api/admin/v1')
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(
    @Inject(StoreService) private readonly store: StoreService,
    @Inject(Batch1PersistenceService) private readonly batch1Persistence: Batch1PersistenceService,
    @Inject(PeerPersistenceService) private readonly peerPersistence: PeerPersistenceService,
    @Inject(SelfPersistenceService) private readonly selfPersistence: SelfPersistenceService,
    @Inject(FeedbackPersistenceService) private readonly feedbackPersistence: FeedbackPersistenceService,
    @Inject(AdminNotesPersistenceService) private readonly adminNotes: AdminNotesPersistenceService,
  ) {}

  private admin(auth?: string, allowedRoles?: string[]) {
    const admin = this.store.verifyToken(tokenFrom(auth));
    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(admin.role)) {
      throw new ForbiddenException('当前角色无权访问敏感管理数据');
    }
    return admin;
  }

  /** The same page defaults as `list()`, for endpoints that paginate in the database. */
  private pageParams(pageValue?: string | number, pageSizeValue?: string | number) {
    const configured = Number(this.store.systemSettings.defaultPageSize?.value);
    const fallbackSize = Number.isFinite(configured) && configured > 0 ? configured : 20;
    const page = Math.max(1, Number(pageValue ?? 1) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(pageSizeValue ?? fallbackSize) || fallbackSize));
    return { page, pageSize };
  }

  private list<T>(items: T[], pageValue?: string | number, pageSizeValue?: string | number) {
    // `defaultPageSize` (admin 系统设置) supplies the page size when the caller does not ask
    // for one, so the setting changes real list behaviour instead of being stored and
    // ignored (product audit ISSUE-003).
    const configured = Number(this.store.systemSettings.defaultPageSize?.value);
    const fallbackSize = Number.isFinite(configured) && configured > 0 ? configured : 20;
    const page = Math.max(1, Number(pageValue ?? 1) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(pageSizeValue ?? fallbackSize) || fallbackSize));
    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), page, pageSize, total, totalPages };
  }

  private matchesNeedle(values: unknown[], needle: string) {
    return values.some((value) =>
      String(value ?? '')
        .toLowerCase()
        .includes(needle),
    );
  }

  private safetyTriggerText(payload: unknown) {
    if (!payload || typeof payload !== 'object') return '';
    const record = payload as Record<string, unknown>;
    return [record.triggerExcerpt, record.intent]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join(' · ');
  }

  private async dashboardData() {
    const today = new Date().toISOString().slice(0, 10);
    const dayKeys = Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - index));
      return day.toISOString().slice(0, 10);
    });
    let aiMetrics: {
      trendByDay: Record<string, number>;
      successfulJobs: number;
      todayJobsCount: number;
      completedJobsCount: number;
      failedJobsCount: number;
      fallbackJobsCount: number;
      averageDurationMs: number;
      aiSuccessRate: number;
      latestJobs: any[];
      summary: { total: number; succeeded: number; fallback: number; failed: number };
    };

    if (DIRECT_DB_MODELS.AIJob) {
      aiMetrics = await this.batch1Persistence.getAiJobDashboardMetrics(dayKeys, today);
    } else {
      const successfulJobs = this.store.aiJobs.filter((job) => ['succeeded', 'fallback'].includes(job.status)).length;
      const todayJobs = this.store.aiJobs.filter((job) => job.createdAt?.startsWith(today));
      const completedJobs = this.store.aiJobs.filter((job) => ['succeeded', 'failed', 'fallback'].includes(job.status));
      const failedJobs = completedJobs.filter((job) => job.status === 'failed');
      const fallbackJobs = completedJobs.filter((job) => job.status === 'fallback');
      aiMetrics = {
        trendByDay: Object.fromEntries(
          dayKeys.map((day) => [day, this.store.aiJobs.filter((item) => item.createdAt?.startsWith(day)).length]),
        ),
        successfulJobs,
        todayJobsCount: todayJobs.length,
        completedJobsCount: completedJobs.length,
        failedJobsCount: failedJobs.length,
        fallbackJobsCount: fallbackJobs.length,
        averageDurationMs: completedJobs.length
          ? Math.round(completedJobs.reduce((sum, job) => sum + job.durationMs, 0) / completedJobs.length)
          : 0,
        aiSuccessRate: this.store.aiJobs.length
          ? Math.round((successfulJobs / this.store.aiJobs.length) * 1000) / 10
          : 100,
        latestJobs: this.store.aiJobs.slice(0, 8),
        summary: {
          total: this.store.aiJobs.length,
          succeeded: this.store.aiJobs.filter((job) => job.status === 'succeeded').length,
          fallback: fallbackJobs.length,
          failed: failedJobs.length,
        },
      };
    }

    const replyCountsByDay = DIRECT_DB_MODELS.Reply
      ? await this.store.repliesDb.countsByDay(new Date(`${dayKeys[0]}T00:00:00.000Z`))
      : null;
    // Post is database-authoritative; its three dashboard figures come from the table.
    const postsCreatedByDay = DIRECT_DB_MODELS.Post
      ? await Promise.all(
          dayKeys.map(async (day) => [
            day,
            await this.store.postsDb.countCreatedSince(new Date(`${day}T00:00:00.000Z`)),
          ] as const),
        )
      : null;
    const todayPostCount =
      (postsCreatedByDay?.at(-1)?.[1] ??
        this.store.posts.filter((p) => p.createdAt?.startsWith(today)).length) as number;
    const activeTrend = dayKeys.map(([day], index) => ({
      date: day,
      users: this.store.users.filter((item) => item.createdAt?.startsWith(day)).length,
      posts: postsCreatedByDay
        ? postsCreatedByDay[index][1]
        : this.store.posts.filter((item) => item.createdAt?.startsWith(day)).length,
      replies: replyCountsByDay
        ? (replyCountsByDay[day] ?? 0)
        : this.store.replies.filter((item) => item.createdAt?.startsWith(day)).length,
      aiJobs: aiMetrics.trendByDay[day] ?? 0,
    }));
    const emotionDistribution = DIRECT_DB_MODELS.Post
      ? (await this.store.postsDb.listRecent(500)).reduce<Record<string, number>>((acc, post) => {
          acc[post.emotion] = (acc[post.emotion] ?? 0) + 1;
          return acc;
        }, {})
      : this.store.posts.reduce<Record<string, number>>((acc, post) => {
          acc[post.emotion] = (acc[post.emotion] ?? 0) + 1;
          return acc;
        }, {});
    const ollama = await this.store.ollamaStatus();
    return {
      todayUsers: this.store.users.filter((u) => u.createdAt?.startsWith(today)).length,
      todayPosts: todayPostCount,
      pendingReviews:
        (DIRECT_DB_MODELS.Post
          ? (await this.store.postsDb.listPendingReview()).length
          : this.store.posts.filter((p) => p.reviewStatus === 'pending_review').length) +
        (DIRECT_DB_MODELS.Reply
          ? await this.store.repliesDb.countPending()
          : this.store.replies.filter((r) => r.status === 'pending_review').length),
      journeySummary: {
        total: await this.batch1Persistence.countTotalJourneys(),
        active: await this.batch1Persistence.countActiveJourneys(),
        actions: await this.batch1Persistence.countActiveActions(),
        dueCheckins: await this.batch1Persistence.countDueCheckins(),
        peerExperiences: DIRECT_DB_MODELS.PeerExperience
          ? await this.peerPersistence.countPublishedExperiences()
          : this.store.peerExperiences.filter((item) => item.status === 'published').length,
        safetyEvents: await this.store.countHighRiskSafetyEvents(),
        supportPlans: DIRECT_DB_MODELS.PersonalSupportPlan
          ? await this.selfPersistence.countActiveSupportPlans()
          : this.store.personalSupportPlans.filter((item) => item.active).length,
        followUps: this.store.followUpJobs.filter((item) => ['pending', 'scheduled'].includes(item.status)).length,
        unreadNotifications: await this.store.countUnreadNotifications(),
        peerRequests: DIRECT_DB_MODELS.PeerMatch
          ? await this.peerPersistence.countRequestedMatches()
          : this.store.peerMatches.filter((item) => item.status === 'requested').length,
        connectedPeerConversations: DIRECT_DB_MODELS.PeerConversation
          ? await this.peerPersistence.countConnectedConversations()
          : this.store.peerConversations.filter(
              (item) => item.status === 'active' && Date.parse(item.expiresAt) > Date.now(),
            ).length,
        recoveryRecords: DIRECT_DB_MODELS.RecoverySnapshot
          ? await this.selfPersistence.countRecoverySnapshots()
          : this.store.recoverySnapshots.length,
      },
      supportIntentDistribution: await this.batch1Persistence.getSupportIntentDistribution(),
      aiSuccessRate: aiMetrics.aiSuccessRate,
      activeTrend,
      emotionDistribution,
      latestPosts: DIRECT_DB_MODELS.Post ? await this.store.postsDb.listRecent(8) : this.store.posts.slice(0, 8),
      aiJobs: aiMetrics.latestJobs,
      aiSummary: aiMetrics.summary,
      aiMonitor: {
        ollamaOnline: ollama.online,
        localModelCount: ollama.modelCount,
        todayCalls: aiMetrics.todayJobsCount,
        successRate: aiMetrics.completedJobsCount
          ? Math.round(
              ((aiMetrics.completedJobsCount - aiMetrics.failedJobsCount) / aiMetrics.completedJobsCount) * 1000,
            ) / 10
          : 100,
        failureRate: aiMetrics.completedJobsCount
          ? Math.round((aiMetrics.failedJobsCount / aiMetrics.completedJobsCount) * 1000) / 10
          : 0,
        averageDurationMs: aiMetrics.averageDurationMs,
        fallbackCount: aiMetrics.fallbackJobsCount,
        lastCheckedAt: ollama.lastCheckedAt,
      },
    };
  }

  @Post('auth/login')
  async login(
    @Body() body: { username: string; password: string },
    @Headers('x-forwarded-for') forwardedFor?: string,
    @Headers('x-real-ip') realIp?: string,
  ) {
    // Real server-side throttling replaces the decorative captcha. A 429 carries Retry-After
    // so the client can tell the user how long to wait instead of guessing.
    const ip = (forwardedFor ?? realIp ?? 'unknown').split(',')[0].trim() || 'unknown';
    const username = String(body?.username ?? '');
    const retryAfter = loginRetryAfterSeconds(ip, username);
    if (retryAfter > 0) {
      throw new HttpException(
        { message: '登录尝试过于频繁，请稍后再试。', retryAfterSeconds: retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    try {
      const result = this.store.login(body.username, body.password);
      recordLoginSuccess(ip, username);
      await this.store.flush();
      return result;
    } catch (error) {
      recordLoginFailure(ip, username);
      throw error;
    }
  }

  @Post('login')
  async loginAlias(
    @Body() body: { username: string; password: string },
    @Headers('x-forwarded-for') forwardedFor?: string,
    @Headers('x-real-ip') realIp?: string,
  ) {
    return await this.login(body, forwardedFor, realIp);
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
  async overview() {
    return { item: await this.dashboardData() };
  }

  @Get('dashboard')
  async dashboardAlias() {
    return await this.overview();
  }

  @Get('dashboard/summary')
  async dashboardSummary() {
    const item = await this.dashboardData();
    return {
      item: {
        todayUsers: item.todayUsers,
        todayPosts: item.todayPosts,
        pendingReviews: item.pendingReviews,
        aiSuccessRate: item.aiSuccessRate,
      },
    };
  }

  @Get('dashboard/activity')
  async dashboardActivity() {
    return { items: (await this.dashboardData()).activeTrend };
  }

  @Get('dashboard/emotion-distribution')
  async dashboardEmotionDistribution() {
    return { item: (await this.dashboardData()).emotionDistribution };
  }

  @Get('journeys')
  async adminJourneys(
    @Headers('authorization') auth: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.admin(auth);
    const needle = q?.trim().toLowerCase();
    const userNames = new Map(this.store.users.map((user) => [user.id, user.nickname]));
    const dbJourneys = await this.batch1Persistence.listAdminJourneys();
    const journeyIds = dbJourneys.map((j) => j.id);
    const updateCounts = await this.batch1Persistence.countUpdatesByJourneyIds(journeyIds);
    const actionCounts = await this.batch1Persistence.countActionsByJourneyIds(journeyIds);
    const items = dbJourneys
      .filter((item) => {
        const matchesQuery =
          !needle ||
          this.matchesNeedle(
            [item.id, item.userId, userNames.get(item.userId), item.title, item.domain, item.summary],
            needle,
          );
        const matchesStatus = !status || status === 'all' || item.status === status;
        return matchesQuery && matchesStatus;
      })
      .map((item) => ({
        ...item,
        updates: updateCounts.get(item.id) ?? 0,
        actions: actionCounts.get(item.id) ?? 0,
      }));
    return this.list(items, page, pageSize);
  }

  @Get('actions')
  async adminActions(
    @Headers('authorization') auth: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.admin(auth);
    const needle = q?.trim().toLowerCase();
    const actions = await this.batch1Persistence.listAdminActions();
    return this.list(
      actions.filter((item) => {
        const matchesQuery =
          !needle || this.matchesNeedle([item.id, item.userId, item.title, item.description], needle);
        const matchesStatus = !status || status === 'all' || item.status === status;
        return matchesQuery && matchesStatus;
      }),
      page,
      pageSize,
    );
  }

  @Get('checkins')
  async adminCheckins(
    @Headers('authorization') auth: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.admin(auth);
    const needle = q?.trim().toLowerCase();
    const checkins = await this.batch1Persistence.listAdminCheckins();
    return this.list(
      checkins.filter((item) => {
        const matchesQuery =
          !needle ||
          this.matchesNeedle(
            [item.id, item.userId, item.journeyId, item.reflection, item.result, item.barrier],
            needle,
          );
        const matchesStatus = !status || status === 'all' || item.status === status;
        return matchesQuery && matchesStatus;
      }),
      page,
      pageSize,
    );
  }

  @Get('peer-experiences')
  async adminPeerExperiences(
    @Headers('authorization') auth: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.admin(auth);
    if (DIRECT_DB_MODELS.PeerExperience) {
      const items = await this.peerPersistence.listExperiencesForAdmin({ q, status });
      return this.list(items, page, pageSize);
    }
    const needle = q?.trim().toLowerCase();
    const items = this.store.peerExperiences.filter((item) => {
      const matchesQuery =
        !needle ||
        this.matchesNeedle([item.id, item.userId, item.title, item.domain, item.subDomain, item.content], needle);
      const matchesStatus = !status || status === 'all' || item.status === status;
      return matchesQuery && matchesStatus;
    });
    return this.list(items, page, pageSize);
  }

  @Patch('peer-experiences/:id/review')
  async reviewPeerExperience(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: { status: 'published' | 'hidden' | 'rejected' },
  ) {
    const admin = this.admin(auth);
    if (DIRECT_DB_MODELS.PeerExperience) {
      const item = await this.peerPersistence.reviewExperience(id, admin.id, body.status);
      return { item };
    }
    const item = this.store.peerExperiences.find((experience) => experience.id === id);
    if (!item) throw new NotFoundException('同路经历不存在');
    const before = { ...item };
    item.status = body.status;
    this.store.audit(admin.id, 'PEER_EXPERIENCE_REVIEW', 'PeerExperience', id, before, item);
    await this.store.persistAndFlush();
    return { item };
  }

  @Get('peer-matches')
  async adminPeerMatches(
    @Headers('authorization') auth: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.admin(auth);
    if (DIRECT_DB_MODELS.PeerMatch) {
      const items = await this.peerPersistence.listMatchesForAdmin({ q, status });
      return this.list(items, page, pageSize);
    }
    const needle = q?.trim().toLowerCase();
    const items = this.store.peerMatches.filter((item) => {
      const matchesQuery =
        !needle ||
        this.matchesNeedle(
          [item.id, item.userId, item.peerExperienceId, item.explanation, item.requestReason, item.requestQuestion],
          needle,
        );
      const matchesStatus = !status || status === 'all' || item.status === status;
      return matchesQuery && matchesStatus;
    });
    return this.list(items, page, pageSize);
  }

  @Get('follow-ups')
  adminFollowUps(
    @Headers('authorization') auth: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.admin(auth);
    const needle = q?.trim().toLowerCase();
    const items = this.store.followUpJobs.filter((item) => {
      const matchesQuery = !needle || this.matchesNeedle([item.id, item.userId, item.journeyId, item.kind], needle);
      const matchesStatus = !status || status === 'all' || item.status === status;
      return matchesQuery && matchesStatus;
    });
    return this.list(items, page, pageSize);
  }

  @Get('notifications')
  async adminNotifications(
    @Headers('authorization') auth: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.admin(auth);
    const needle = q?.trim().toLowerCase();
    const all = await this.store.adminNotificationList({ status });
    const items = all.filter((item) => {
      const matchesQuery =
        !needle ||
        this.matchesNeedle([item.id, item.userId, item.type, item.title, item.body, item.targetRoute], needle);
      return matchesQuery;
    });
    return this.list(items, page, pageSize);
  }

  @Get('peer-conversations')
  async adminPeerConversations(
    @Headers('authorization') auth: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('reported') reported?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.admin(auth);
    if (DIRECT_DB_MODELS.PeerConversation) {
      const items = await this.peerPersistence.listConversationsForAdmin({ q, status, reported });
      return this.list(items, page, pageSize);
    }
    const needle = q?.trim().toLowerCase();
    const items = this.store.peerConversations
      .filter((item) => {
        const matchesQuery =
          !needle ||
          this.matchesNeedle(
            [item.id, item.matchId, item.starterUserId, item.receiverUserId, item.reportReason],
            needle,
          );
        const matchesStatus = !status || status === 'all' || item.status === status;
        const matchesReported = reported !== 'true' || Boolean(item.reportedAt);
        return matchesQuery && matchesStatus && matchesReported;
      })
      .map((item) => ({
        ...item,
        messageCount: this.store.peerMessages.filter((message) => message.conversationId === item.id).length,
      }));
    return this.list(items, page, pageSize);
  }

  @Get('safety/events')
  async safetyEvents(
    @Headers('authorization') auth: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.admin(auth);
    const needle = q?.trim().toLowerCase();
    const userNames = new Map(this.store.users.map((user) => [user.id, user.nickname]));
    const all = await this.store.adminSafetyEventList({ status });
    const items = all.filter((event) => {
      const matchesQuery =
        !needle ||
        this.matchesNeedle(
          [event.id, event.userId, event.userNickname ?? userNames.get(event.userId), event.triggerExcerpt],
          needle,
        );
      return matchesQuery;
    });
    return this.list(items, page, pageSize);
  }

  @Get('safety/events/:id')
  async safetyEventDetail(@Headers('authorization') auth: string, @Param('id') id: string) {
    this.admin(auth);
    const item = await this.store.getSafetyEvent(id);
    if (!item) throw new NotFoundException('安全事件不存在');
    return { item: { ...item, triggerExcerpt: this.safetyTriggerText(item.payload) } };
  }

  @Patch('safety/events/:id/handle')
  async handleSafetyEvent(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: { status?: 'open' | 'handled'; note?: string },
  ) {
    const admin = this.admin(auth);
    return await this.store.handleSafetyEvent(id, admin.id, body ?? {});
  }

  // One row per report, so an operator sees every report rather than only the most recent one
  // per conversation. The reporter identity is exposed here on purpose: acting on a report
  // needs it, and this route sits behind AdminAuthGuard. It is never exposed to the peers.
  @Get('peer-reports')
  async peerReports(
    @Headers('authorization') auth: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.admin(auth);
    if (DIRECT_DB_MODELS.PeerReport) {
      const items = await this.peerPersistence.listReportsForAdmin({ q, status });
      return this.list(items, page, pageSize);
    }
    const needle = q?.trim().toLowerCase();
    const items = this.store.peerReports
      .filter((report) => {
        const matchesStatus = !status || status === 'all' || report.status === status;
        if (!matchesStatus) return false;
        if (!needle) return true;
        const view = this.store.peerReportForAdmin(report);
        return this.matchesNeedle(
          [report.id, report.reason, report.reporterUserId, view.reporterNickname, view.matchId, view.experienceTitle],
          needle,
        );
      })
      .map((report) => this.store.peerReportForAdmin(report));
    return this.list(items, page, pageSize);
  }

  @Patch('peer-reports/:id/handle')
  async handlePeerReport(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: { status?: 'open' | 'handled'; note?: string },
  ) {
    const admin = this.admin(auth);
    if (DIRECT_DB_MODELS.PeerReport) {
      if (!body?.status || !['open', 'handled'].includes(body.status)) {
        throw new BadRequestException('处理状态无效');
      }
      return await this.peerPersistence.handleReport(id, admin.id, body.status, body.note);
    }
    const existing = this.store.peerReports.find((report) => report.id === id);
    if (!existing) throw new NotFoundException('举报记录不存在');
    const before = { ...existing };
    const result = this.store.handlePeerReport(id, admin.id, body ?? {});
    this.store.audit(admin.id, 'PEER_REPORT_HANDLE', 'PeerReport', id, before, result.item);
    await this.store.persistAndFlush();
    return result;
  }

  @Get('support/plans')
  async supportPlans(
    @Headers('authorization') auth: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.admin(auth);
    if (DIRECT_DB_MODELS.PersonalSupportPlan) {
      return await this.selfPersistence.listSupportPlansForAdmin({
        q,
        page: page ? parseInt(page, 10) : undefined,
        pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      });
    }
    const needle = q?.trim().toLowerCase();
    const items = this.store.personalSupportPlans
      .filter((item) => !needle || this.matchesNeedle([item.id, item.userId, item.title], needle))
      .map(({ plan: _plan, ...rest }: any) => rest);
    return this.list(items, page, pageSize);
  }

  @Get('support/plans/:id')
  async supportPlanDetail(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
  ) {
    const admin = this.admin(auth, ['super_admin', 'admin']);
    return await this.selfPersistence.getAuditedSupportPlanForAdmin(id, admin.id);
  }

  @Get('memory/:id')
  async memoryDetail(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
  ) {
    const admin = this.admin(auth, ['super_admin', 'admin']);
    return await this.selfPersistence.getAuditedMemoryForAdmin(id, admin.id);
  }

  @Get('memory')
  async adminMemory(
    @Headers('authorization') auth: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    this.admin(auth);
    if (DIRECT_DB_MODELS.MemoryItem) {
      // Metadata only, and the search never runs over the memory text (§0.4/S4, §0.5/A7). Full
      // content is a separate audited single-record read.
      return await this.selfPersistence.listMemoriesForAdmin({
        q,
        page: Number(page ?? 1),
        pageSize: Number(pageSize ?? 20),
      });
    }
    const needle = q?.trim().toLowerCase();
    const items = this.store.memoryItems
      .filter(
        (item) =>
          !item.deletedAt &&
          (!needle || this.matchesNeedle([item.id, item.userId, item.category, item.title], needle)),
      )
      .map(({ content: _content, ...rest }: any) => rest);
    return this.list(items, page, pageSize);
  }

  @Get('dashboard/ai-summary')
  async dashboardAiSummary() {
    return { item: (await this.dashboardData()).aiSummary };
  }

  @Get('users')
  async users(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    // Filter and paginate in the database: nickname and status are database-authoritative, so a
    // boot-time snapshot would both show and search stale values, and a full read would grow with
    // the user table instead of with the page.
    const params = this.pageParams(page, pageSize);
    const { total, items } = await this.store.listUsersForAdmin({
      q: q?.trim(),
      status,
      page: params.page,
      pageSize: params.pageSize,
    });
    // The operator list carries each user's current note. The admin view read `user.note`
    // before, which this payload never contained, so the saved note vanished on the next load
    // (ISSUE-027). One query for the whole page rather than one per row.
    const notes = await this.adminNotes.currentNotesForUsers(items.map((user) => user.id));
    const withNotes = items.map((user) => {
      const note = notes.get(user.id);
      return { ...user, note: note?.content, noteUpdatedAt: note?.updatedAt };
    });
    return {
      items: withNotes,
      page: params.page,
      pageSize: params.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    };
  }
  // Declared before @Get('users/:id') on purpose. Nest matches routes in declaration
  // order, so a literal segment declared after the parameterised one is shadowed: the
  // previous `users/export` answered as `users/:id` with an empty body, which is why the
  // admin export button reported success while producing nothing (ISSUE-002).
  @Get('users/export')
  async exportUsers(@Headers('authorization') auth: string) {
    const admin = this.admin(auth);
    const item = await this.store.createUserExport();
    this.store.audit(admin.id, 'USER_EXPORT', 'User', 'export', null, { count: item.count, assetId: item.assetId });
    await this.store.flush();
    return { item };
  }

  @Get('users/export/:assetId/download')
  async userExportDownload(@Headers('authorization') auth: string, @Param('assetId') assetId: string) {
    this.admin(auth);
    const download = await this.store.getUserExportDownload(assetId);
    return new StreamableFile(fs.createReadStream(download.filePath), {
      type: download.asset.mimeType,
      length: download.asset.size,
      disposition: `attachment; filename="${download.filename}"`,
    });
  }

  @Get('users/:id')
  async user(@Param('id') id: string) {
    const privacy = DIRECT_DB_MODELS.PrivacySetting
      ? await this.selfPersistence.getPrivacySettings(id)
      : this.store.privacySettings[id];
    return { item: await this.store.readUserForAdmin(id), privacy };
  }
  @Patch('users/:id/status')
  async userStatus(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: { status: 'normal' | 'limited' | 'muted' | 'banned' | 'deleted' },
  ) {
    const admin = this.admin(auth);
    const before = await this.store.readUserForAdmin(id);
    if (!before) throw new NotFoundException('用户不存在');
    const status = body.status === 'muted' ? 'limited' : body.status === 'deleted' ? 'banned' : body.status;
    const item = await this.store.updateUserStatus(id, status);
    // The status is already committed; awaiting the audit makes a success response mean the audit
    // row exists too. If the audit write fails the request fails loudly, and a retry is idempotent.
    await this.store.audit(admin.id, 'USER_STATUS', 'User', id, before, item);
    return { item };
  }

  // Kept for compatibility with the existing admin call, but it now writes real business data
  // instead of only an AuditLog row (ISSUE-027). New callers should use POST users/:id/notes.
  @Post('users/:id/note')
  async userNote(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: { note?: string; tags?: string[] },
  ) {
    const admin = this.admin(auth);
    const note = await this.adminNotes.createNote({ userId: id, authorAdminId: admin.id, content: body?.note });
    this.store.audit(admin.id, 'USER_NOTE', 'User', id, null, { noteId: note.id, content: note.content });
    return { item: { id, note: note.content, noteId: note.id, tags: body?.tags ?? [], updatedAt: note.updatedAt } };
  }

  @Get('users/:id/notes')
  async userNotes(@Headers('authorization') auth: string, @Param('id') id: string) {
    this.admin(auth);
    const items = await this.adminNotes.listNotes(id);
    return { items, current: items[0] ?? null, total: items.length };
  }

  @Post('users/:id/notes')
  async createUserNote(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: { content?: string },
  ) {
    const admin = this.admin(auth);
    const note = await this.adminNotes.createNote({ userId: id, authorAdminId: admin.id, content: body?.content });
    this.store.audit(admin.id, 'USER_NOTE_CREATE', 'AdminUserNote', note.id, null, note);
    return { item: note };
  }

  @Delete('users/:id/notes/:noteId')
  async deleteUserNote(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
  ) {
    const admin = this.admin(auth);
    // The retraction hands the removed row back so the audit entry names it rather than only its id.
    const { deleted } = await this.adminNotes.deleteNote(id, noteId);
    this.store.audit(admin.id, 'USER_NOTE_DELETE', 'AdminUserNote', noteId, deleted, null);
    return { item: deleted };
  }

  @Patch('users/:id/tags')
  userTags(@Headers('authorization') auth: string, @Param('id') _id: string, @Body() _body?: unknown) {
    this.admin(auth);
    throw new HttpException(
      { code: 'ENDPOINT_DEPRECATED', message: '用户标签功能未实现；本请求未保存任何标签' },
      HttpStatus.GONE,
    );
  }

  @Post('users/:id/tags')
  userTagsPost(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body?: unknown) {
    return this.userTags(auth, id, body);
  }

  @Delete('users/:id/data')
  async deleteUserData(@Param('id') id: string) {
    await this.store.clearFavoritesForUser(id);
    this.store.diaries = this.store.diaries.filter((item) => item.userId !== id);
    if (DIRECT_DB_MODELS.Letter) await this.store.lettersDb.deleteAllForUser(id);
    else this.store.letters = this.store.letters.filter((item) => item.userId !== id);
    await this.store.persistAndFlush();
    return { ok: true };
  }

  @Get('posts')
  async adminPosts(
    @Query('q') q?: string,
    @Query('emotion') emotion?: string,
    @Query('reviewStatus') reviewStatus?: string,
    @Query('visibility') visibility?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const needle = q?.trim().toLowerCase();
    if (DIRECT_DB_MODELS.Post) {
      const rows = await this.store.postsDb.idsForAdmin({ status: reviewStatus });
      return this.list(rows, page, pageSize);
    }
    const items = this.store.posts.filter((post) => {
      const matchesQuery =
        !needle ||
        [post.id, post.content, post.userId, post.emotion].some((value) =>
          String(value).toLowerCase().includes(needle),
        );
      const matchesEmotion = !emotion || emotion === 'all' || post.emotion === normalizeEmotion(emotion);
      const matchesReview = !reviewStatus || reviewStatus === 'all' || post.reviewStatus === reviewStatus;
      const matchesVisibility = !visibility || visibility === 'all' || post.visibility === visibility;
      return matchesQuery && matchesEmotion && matchesReview && matchesVisibility;
    });
    // One context for the whole page rather than a lookup per row.
    const adminContext = await this.store.buildPostDecorationContext(items);
    items.forEach((post) => this.store.decoratePost(post, adminContext));
    return this.list(items, page, pageSize);
  }
  @Get('posts/:id')
  async adminPost(@Param('id') id: string) {
    return {
      item: await this.store.getPost(id, true),
      replies: DIRECT_DB_MODELS.Reply
        ? await this.store.repliesDb.listForPost(id)
        : this.store.replies.filter((r) => r.postId === id),
    };
  }
  @Patch('posts/:id/moderation')
  async postModeration(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: { action: 'approve' | 'hide' | 'reject' | 'risk' },
  ) {
    const item = await this.store.moderatePost(this.admin(auth).id, id, body.action);
    await this.store.flush();
    return { item };
  }

  @Patch('posts/:id/review')
  async postReview(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: { status?: string; action?: 'approve' | 'hide' | 'reject' | 'risk' },
  ) {
    const action =
      body.action ??
      (body.status === 'published' || body.status === 'approve'
        ? 'approve'
        : body.status === 'hidden' || body.status === 'hide'
          ? 'hide'
          : body.status === 'rejected' || body.status === 'reject'
            ? 'reject'
            : 'risk');
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
  async postBlock(@Headers('authorization') auth: string, @Param('id') id: string) {
    return { item: await this.store.moderatePost(this.admin(auth).id, id, 'hide') };
  }
  @Patch('posts/:id/visibility')
  postVisibility(@Headers('authorization') auth: string, @Param('id') _id: string, @Body() _body?: unknown) {
    this.admin(auth);
    throw new HttpException(
      {
        code: 'ENDPOINT_DEPRECATED',
        message: '该接口不再修改帖子内容或可见范围；审核、隐藏与恢复请使用 PATCH /api/admin/v1/posts/:id/review',
      },
      HttpStatus.GONE,
    );
  }

  @Patch('posts/:id/risk')
  postRisk(@Headers('authorization') auth: string, @Param('id') id: string) {
    return this.postModeration(auth, id, { action: 'risk' });
  }

  @Post('posts/:id/regenerate-replies')
  async regenerateReplies(@Param('id') id: string) {
    const post = await this.store.getPost(id, true);
    const styles: AIStyle[] = ['warm', 'rational'];
    const jobs = styles.map((style) =>
      this.store.queueAI({
        taskType: 'public_ai_reply',
        userId: post.userId,
        sourceId: post.moodId,
        mood: post.emotion,
        style,
        content: post.content,
      }),
    );
    void Promise.all(jobs.map((job) => this.store.waitForAiJob(job.id))).then(async (completed) => {
      const usable = completed.filter((item) => ['succeeded', 'fallback'].includes(item.status));
      if (DIRECT_DB_MODELS.Reply) {
        for (const job of usable) {
          await this.store.repliesDb.create({
            id: `reply_${job.id}`,
            postId: post.id,
            type: 'AI',
            style: job.style,
            content: job.result,
            status: 'published',
            riskLevel: 'low',
            createdAt: new Date(job.createdAt),
          });
        }
        await this.store.syncReplyCount(post.id);
        return;
      }
      for (const job of usable) {
        this.store.replies.unshift({
          id: `reply_${job.id}`,
          postId: post.id,
          type: 'AI',
          style: job.style,
          content: job.result,
          status: 'published',
          riskLevel: 'low',
          createdAt: job.createdAt,
        });
      }
      post.replyCount = this.store.replies.filter(
        (item) => item.postId === post.id && item.status === 'published',
      ).length;
      this.store.persist();
    });
    return { item: post, jobs, jobIds: jobs.map((job) => job.id), status: 'queued' };
  }
  @Delete('posts/:id')
  async adminDeletePost(@Param('id') id: string) {
    const post = await this.store.getPost(id, true);
    post.status = 'deleted';
    this.store.persist();
    return { ok: true };
  }

  @Get('replies')
  async adminReplies(
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (DIRECT_DB_MODELS.Reply) {
      return this.list(await this.store.repliesDb.listForAdmin({ type, status, q }), page, pageSize);
    }
    const needle = q?.trim().toLowerCase();
    const items = this.store.replies.filter((reply) => {
      const matchesType = !type || type === 'all' || reply.type === type;
      const matchesStatus = !status || status === 'all' || reply.status === status;
      const matchesQuery =
        !needle ||
        [reply.id, reply.postId, reply.content, reply.type].some((value) =>
          String(value).toLowerCase().includes(needle),
        );
      return matchesType && matchesStatus && matchesQuery;
    });
    return this.list(items, page, pageSize);
  }
  @Get('replies/:id')
  async adminReply(@Param('id') id: string) {
    return {
      item: DIRECT_DB_MODELS.Reply
        ? await this.store.repliesDb.get(id)
        : this.store.replies.find((r) => r.id === id),
    };
  }
  @Patch('replies/:id/moderation')
  async replyModeration(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: { action: 'approve' | 'block'; content?: string },
  ) {
    const item = await this.store.moderateReply(this.admin(auth).id, id, body.action, body.content);
    await this.store.flush();
    return { item };
  }

  @Patch('replies/:id/review')
  async replyReview(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: { status?: string; action?: 'approve' | 'block' | 'hide'; content?: string },
  ) {
    const action =
      body.action === 'hide'
        ? 'block'
        : (body.action ?? (body.status === 'approved' || body.status === 'published' ? 'approve' : 'block'));
    return await this.replyModeration(auth, id, { action, content: body.content });
  }

  @Patch('replies/:id/content')
  replyContent(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: { content: string }) {
    return this.replyEdit(auth, id, body);
  }

  @Patch('replies/:id/approve')
  async replyApprove(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: { content?: string },
  ) {
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
  async providers(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const rows = DIRECT_DB_MODELS.AIProvider
      ? await this.store.aiRoutingDb.listProviders()
      : this.store.aiProviders;
    return this.list(
      rows.map((p) => ({
        ...p,
        apiKeySecretRef: undefined,
        apiKeyMasked: p.apiKeyStatus === 'missing' ? '未配置' : '••••••••',
      })),
      page,
      pageSize,
    );
  }
  @Post('ai/providers')
  async createProvider(@Headers('authorization') auth: string, @Body() body: Partial<AIProvider>) {
    const admin = this.admin(auth);
    assertProviderMutation({}, body);
    const provider: AIProvider = {
      id: `provider_${Date.now()}`,
      name: body.name ?? '新供应商',
      type: body.type ?? 'cloud',
      providerKind: body.providerKind ?? 'openai-compatible',
      baseUrl: body.baseUrl ?? DAPI_BASE_URL,
      modelName: body.modelName ?? '',
      apiKeyStatus: 'configured',
      enabled: body.enabled ?? true,
      priority: body.priority ?? 10,
      dailyLimit: body.dailyLimit ?? 1000,
      timeoutSeconds: body.timeoutSeconds ?? 12,
      failoverEnabled: body.failoverEnabled ?? true,
      usageTags: body.usageTags ?? [],
      failureRate: 0,
      avgLatencyMs: 0,
      todayCalls: 0,
    };
    if (DIRECT_DB_MODELS.AIProvider) await this.store.aiRoutingDb.saveProvider(provider as never);
    else this.store.aiProviders.unshift(provider);
    await this.store.audit(admin.id, 'AI_PROVIDER_CREATE', 'AIProvider', provider.id, null, provider);
    this.store.persist();
    await this.store.flush();
    return { item: provider };
  }
  @Put('ai/providers/:id')
  async updateProvider(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: Partial<AIProvider>,
  ) {
    const admin = this.admin(auth);
    const existing = DIRECT_DB_MODELS.AIProvider
      ? await this.store.aiRoutingDb.getProvider(id)
      : this.store.aiProviders.find((p) => p.id === id);
    if (!existing) throw new NotFoundException('AI Provider 不存在');
    assertProviderMutation(existing as never, body);
    const before = { ...existing };
    const merged = { ...existing, ...body };
    if (DIRECT_DB_MODELS.AIProvider) await this.store.aiRoutingDb.saveProvider(merged as never);
    else Object.assign(this.store.aiProviders.find((p) => p.id === id)!, merged);
    await this.store.audit(admin.id, 'AI_PROVIDER_UPDATE', 'AIProvider', id, before, merged);
    this.store.persist();
    await this.store.flush();
    return { item: merged };
  }

  @Patch('ai/providers/:id')
  async patchProvider(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: Partial<AIProvider>,
  ) {
    return await this.updateProvider(auth, id, body);
  }
  @Post('ai/providers/:id/test')
  async testProvider(@Headers('authorization') auth: string, @Param('id') id: string) {
    const admin = this.admin(auth);
    const item = await this.store.testAiProvider(id);
    this.store.audit(admin.id, 'AI_PROVIDER_TEST', 'AIProvider', id, null, {
      ok: item.ok,
      modelName: item.modelName,
      durationMs: item.durationMs,
    });
    this.store.persist();
    await this.store.flush();
    return { ok: item.ok, message: item.ok ? '真实模型调用成功' : item.result, item };
  }

  @Get('ai/ollama/status')
  async ollamaStatus() {
    return { item: await this.store.ollamaStatus() };
  }

  @Post('ai/ollama/sync-models')
  syncOllamaModels(@Headers('authorization') auth: string) {
    this.admin(auth);
    throw new BadRequestException('本地模型测试与调用已禁用，请使用已配置的 DAPI。');
  }

  @Delete('ai/providers/:id')
  async deleteProvider(@Headers('authorization') auth: string, @Param('id') id: string) {
    const admin = this.admin(auth);
    const existing = DIRECT_DB_MODELS.AIProvider
      ? await this.store.aiRoutingDb.getProvider(id)
      : this.store.aiProviders.find((p) => p.id === id);
    const before = existing ? { ...existing } : null;
    if (existing) {
      const next = { ...existing, enabled: false };
      if (DIRECT_DB_MODELS.AIProvider) await this.store.aiRoutingDb.saveProvider(next as never);
      else this.store.aiProviders.find((p) => p.id === id)!.enabled = false;
      await this.store.audit(admin.id, 'AI_PROVIDER_DISABLE', 'AIProvider', id, before, next);
    }
    this.store.persist();
    await this.store.flush();
    return { item: existing ? { ...existing, enabled: false } : null };
  }

  @Get('ai/routes')
  async routes(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const rows: unknown[] = DIRECT_DB_MODELS.AIStyleRoute ? await this.store.aiRoutingDb.listRoutes() : this.store.aiRoutes;
    return this.list(rows, page, pageSize);
  }
  @Put('ai/routes/:style')
  async updateRoute(
    @Headers('authorization') auth: string,
    @Param('style') style: AIStyle,
    @Body() body: Partial<AIStyleRoute>,
  ) {
    const admin = this.admin(auth);
    const route = DIRECT_DB_MODELS.AIStyleRoute
      ? await this.store.aiRoutingDb.getRouteByStyle(style)
      : this.store.aiRoutes.find((r) => r.style === style);
    if (!route) throw new NotFoundException('AI 路由不存在');
    const nextPrimary = body.primaryProviderId ?? route.primaryProviderId;
    const nextBackup = body.backupProviderId ?? route.backupProviderId;
    for (const [role, providerId] of [
      ['主路由', nextPrimary],
      ['备用路由', nextBackup],
    ] as const) {
      const provider = DIRECT_DB_MODELS.AIProvider
        ? await this.store.aiRoutingDb.getProvider(providerId)
        : this.store.aiProviders.find((item) => item.id === providerId);
      if (!provider) throw new BadRequestException(`${role}供应商不存在`);
      if (!provider.enabled) throw new BadRequestException(`${role}供应商未启用`);
      if (provider.type === 'local' || provider.providerKind !== 'openai-compatible') {
        throw new BadRequestException(`${role}只能选择 DAPI 或已批准的远程兼容 Provider`);
      }
    }
    const before = { ...route };
    const merged = { ...route, ...body, routeVersion: route.routeVersion + 1 };
    if (DIRECT_DB_MODELS.AIStyleRoute) {
      await this.store.aiRoutingDb.saveRoute({ ...merged, bumpVersion: false } as never);
    } else {
      Object.assign(this.store.aiRoutes.find((r) => r.style === style)!, merged);
    }
    await this.store.audit(admin.id, 'AI_ROUTE_UPDATE', 'AIStyleRoute', style, before, merged);
    this.store.persist();
    await this.store.flush();
    return { item: merged };
  }

  @Patch('ai/routes/:style')
  async patchRoute(
    @Headers('authorization') auth: string,
    @Param('style') style: AIStyle,
    @Body() body: Partial<AIStyleRoute>,
  ) {
    return await this.updateRoute(auth, style, body);
  }

  @Post('ai/routes/:style/test')
  async testRoute(
    @Headers('authorization') auth: string,
    @Param('style') style: AIStyle,
    @Body() body: { content?: string },
  ) {
    const admin = this.admin(auth);
    const job = this.store.queueAI({
      taskType: 'public_ai_reply',
      userId: this.store.getDemoUserId(),
      sourceId: `route_test_${Date.now()}`,
      style,
      content: body.content ?? 'admin route test',
    });
    this.store.audit(admin.id, 'AI_ROUTE_TEST', 'AIStyleRoute', style, null, {
      jobId: job.id,
      style,
      routeVersion: job.routeVersion,
    });
    this.store.persist();
    await this.store.flush();
    return { ok: true, jobId: job.id, status: job.status, job };
  }

  @Get('ai/jobs')
  async jobs(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    if (DIRECT_DB_MODELS.AIJob) {
      const listed = await this.batch1Persistence.listAdminAiJobs(page, pageSize);
      // The operator list carries model-generated peer drafts, so the same response-boundary
      // redaction the user-facing task endpoints apply is applied here (review P1-5).
      return { ...listed, items: listed.items.map((job) => this.store.peerAssistJobForResponse(job)) };
    }
    return this.list(this.store.aiJobs, page, pageSize);
  }
  @Get('ai/jobs/:id')
  async job(@Param('id') id: string) {
    if (DIRECT_DB_MODELS.AIJob) {
      const found = await this.batch1Persistence.getAiJob(id);
      return { item: found ? this.store.peerAssistJobForResponse(found) : found };
    }
    return { item: this.store.aiJobs.find((j) => j.id === id) };
  }
  @Post('ai/jobs/:id/retry')
  async retryJob(@Headers('authorization') auth: string, @Param('id') id: string) {
    const admin = this.admin(auth);
    const job = DIRECT_DB_MODELS.AIJob
      ? await this.batch1Persistence.getAiJob(id)
      : this.store.aiJobs.find((j) => j.id === id);
    if (!job) throw new NotFoundException('AI 任务不存在');
    const retry = this.store.queueAiJob({
      userId: job.userId,
      contentId: job.contentId,
      contentType: job.contentType,
      jobType: job.jobType,
      taskType: job.taskType,
      style: job.style,
      promptSummary: job.promptSummary,
      retryCount: job.retryCount + 1,
    });
    retry.retryCount = job.retryCount + 1;
    if (DIRECT_DB_MODELS.AIJob) {
      await this.store.awaitJobCommit(retry.id);
      await this.batch1Persistence.updateJobRetryCount(retry.id, retry.retryCount);
    }
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
  async tickets(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const needle = q?.trim().toLowerCase();
    const items = this.store.feedbackTickets.filter((ticket) => {
      const matchesQuery =
        !needle ||
        [ticket.id, ticket.content, ticket.sourcePage, ticket.categoryId].some((value) =>
          String(value).toLowerCase().includes(needle),
        );
      const matchesStatus = !status || status === 'all' || ticket.status === status;
      return matchesQuery && matchesStatus;
    });
    return this.list(
      await Promise.all(items.map((ticket) => this.store.decorateFeedbackTicket(ticket))),
      page,
      pageSize,
    );
  }

  @Get('feedback/summary')
  feedbackSummary(@Query('q') q?: string, @Query('status') status?: string) {
    const ticketMatches = this.store.feedbackTickets.filter((ticket) => {
      const needle = q?.trim().toLowerCase();
      const matchesQuery =
        !needle ||
        [ticket.id, ticket.content, ticket.sourcePage, ticket.categoryId].some((value) =>
          String(value).toLowerCase().includes(needle),
        );
      return matchesQuery && (!status || status === 'all' || ticket.status === status);
    });
    const actual = {
      open: ticketMatches.filter((item) => item.status === 'open').length,
      today: ticketMatches.filter((item) =>
        String(item.createdAt ?? '').startsWith(new Date().toISOString().slice(0, 10)),
      ).length,
      high: ticketMatches.filter((item) =>
        ['high', 'urgent', 'critical'].includes(String(item.priority ?? '').toLowerCase()),
      ).length,
      resolved: ticketMatches.filter((item) => item.status === 'resolved').length,
      total: ticketMatches.length,
    };
    const fixtureSnapshot =
      !q && (!status || status === 'all') ? this.store.systemSettings.feedbackTicketMetrics?.value : undefined;
    const snapshot =
      fixtureSnapshot && typeof fixtureSnapshot === 'object' ? (fixtureSnapshot as Record<string, unknown>) : undefined;
    const value = (key: keyof typeof actual) =>
      Number.isFinite(Number(snapshot?.[key])) ? Number(snapshot?.[key]) : actual[key];
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
  feedbackAlias(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.tickets(q, status, page, pageSize);
  }
  @Get('feedback/tickets/:id')
  async ticket(@Param('id') id: string) {
    return { item: await this.store.decorateFeedbackTicket(this.store.feedbackTicketOrThrow(id)) };
  }

  @Get('feedback/:id')
  feedbackItemAlias(@Param('id') id: string) {
    return this.ticket(id);
  }

  @Post('feedback/tickets/:id/reply')
  async ticketReply(@Headers('authorization') auth: string, @Param('id') id: string, @Body() body: { reply: string }) {
    const admin = this.admin(auth);
    const ticket = await this.store.replyToFeedbackTicket(admin.id, id, body.reply);
    return { item: await this.store.decorateFeedbackTicket(ticket) };
  }

  @Patch('feedback/:id/reply')
  async feedbackReplyAlias(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: { reply: string },
  ) {
    return await this.ticketReply(auth, id, body);
  }

  @Post('feedback/:id/reply')
  async feedbackReplyPostAlias(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: { reply: string },
  ) {
    return await this.ticketReply(auth, id, body);
  }

  @Patch('feedback/tickets/:id/status')
  async ticketStatus(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    const admin = this.admin(auth);
    const ticket = await this.store.updateFeedbackTicketStatus(admin.id, id, body.status);
    return { item: await this.store.decorateFeedbackTicket(ticket) };
  }

  @Patch('feedback/:id/status')
  async feedbackStatusAlias(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return await this.ticketStatus(auth, id, body);
  }

  @Patch('feedback/:id/resolve')
  async feedbackResolveAlias(@Headers('authorization') auth: string, @Param('id') id: string) {
    return await this.ticketStatus(auth, id, { status: 'resolved' });
  }

  @Get('faqs')
  async adminFaqs(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.list(await this.feedbackPersistence.listFaqsForAdmin(), page, pageSize);
  }
  @Post('faqs')
  async createFaq(@Headers('authorization') auth: string, @Body() body: { question: string; answer: string; sortOrder?: number }) {
    const admin = this.admin(auth);
    const question = body.question?.trim();
    const answer = body.answer?.trim();
    if (!question || !answer) throw new BadRequestException('问题和答案不能为空');
    const faq = await this.feedbackPersistence.createFaq({ question, answer, sortOrder: body.sortOrder });
    this.store.audit(admin.id, 'FAQ_CREATE', 'FAQ', faq.id, null, faq);
    return { item: faq };
  }
  @Put('faqs/:id')
  async updateFaq(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: Partial<{ question: string; answer: string; enabled: boolean; sortOrder: number }>,
  ) {
    const admin = this.admin(auth);
    if (body.question !== undefined && !String(body.question).trim()) throw new BadRequestException('问题和答案不能为空');
    if (body.answer !== undefined && !String(body.answer).trim()) throw new BadRequestException('问题和答案不能为空');
    const faq = await this.feedbackPersistence.updateFaq(id, body);
    this.store.audit(admin.id, 'FAQ_UPDATE', 'FAQ', id, null, faq);
    return { item: faq };
  }

  @Patch('faqs/:id')
  patchFaq(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: Partial<{ question: string; answer: string; enabled: boolean; sortOrder: number }>,
  ) {
    return this.updateFaq(auth, id, body);
  }
  @Delete('faqs/:id')
  async deleteFaq(@Headers('authorization') auth: string, @Param('id') id: string) {
    const admin = this.admin(auth);
    // The service answers 404 for an id it does not have, and hands the deleted row back so the
    // audit record can name what was removed rather than only its id.
    const { deleted } = await this.feedbackPersistence.deleteFaq(id);
    this.store.audit(admin.id, 'FAQ_DELETE', 'FAQ', id, deleted, null);
    return { ok: true };
  }

  @Get('reply-presets')
  async adminPresets(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.list(await this.feedbackPersistence.listPresetsForAdmin(), page, pageSize);
  }
  @Post('reply-presets')
  async createPreset(@Headers('authorization') auth: string, @Body() body: { text: string; scene?: string; sortOrder?: number }) {
    const admin = this.admin(auth);
    const item = await this.feedbackPersistence.createPreset({ text: body.text, scene: body.scene, sortOrder: body.sortOrder });
    this.store.audit(admin.id, 'REPLY_PRESET_CREATE', 'ReplyPreset', item.id, null, item);
    return { item };
  }
  @Put('reply-presets/:id')
  async updatePreset(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: Partial<{ text: string; scene: string; enabled: boolean; sortOrder: number }>,
  ) {
    const admin = this.admin(auth);
    const item = await this.feedbackPersistence.updatePreset(id, body);
    this.store.audit(admin.id, 'REPLY_PRESET_UPDATE', 'ReplyPreset', id, null, item);
    return { item };
  }

  @Patch('reply-presets/:id')
  patchPreset(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: Partial<{ text: string; scene: string; enabled: boolean; sortOrder: number }>,
  ) {
    return this.updatePreset(auth, id, body);
  }
  @Delete('reply-presets/:id')
  async deletePreset(@Headers('authorization') auth: string, @Param('id') id: string) {
    const admin = this.admin(auth);
    const { deleted } = await this.feedbackPersistence.deletePreset(id);
    this.store.audit(admin.id, 'REPLY_PRESET_DELETE', 'ReplyPreset', id, deleted, null);
    return { ok: true };
  }

  @Get('feedback-categories')
  async adminCategories(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.list(await this.feedbackPersistence.listCategoriesForAdmin(), page, pageSize);
  }
  @Post('feedback-categories')
  async createCategory(@Headers('authorization') auth: string, @Body() body: { name: string; sortOrder?: number }) {
    const admin = this.admin(auth);
    const item = await this.feedbackPersistence.createCategory({ name: body.name, sortOrder: body.sortOrder });
    this.store.audit(admin.id, 'FEEDBACK_CATEGORY_CREATE', 'FeedbackCategory', item.id, null, item);
    return { item };
  }
  @Put('feedback-categories/:id')
  async updateCategory(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: Partial<{ name: string; enabled: boolean; sortOrder: number }>,
  ) {
    const admin = this.admin(auth);
    if (body.name !== undefined && !String(body.name).trim()) throw new BadRequestException('分类名称不能为空');
    const item = await this.feedbackPersistence.updateCategory(id, body);
    this.store.audit(admin.id, 'FEEDBACK_CATEGORY_UPDATE', 'FeedbackCategory', id, null, item);
    return { item };
  }

  @Patch('feedback-categories/:id')
  patchCategory(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Body() body: Partial<{ name: string; enabled: boolean; sortOrder: number }>,
  ) {
    return this.updateCategory(auth, id, body);
  }
  @Delete('feedback-categories/:id')
  async deleteCategory(@Headers('authorization') auth: string, @Param('id') id: string) {
    const admin = this.admin(auth);
    const item = await this.feedbackPersistence.findCategory(id).catch(() => null);
    if (!item) throw new NotFoundException('反馈分类不存在');
    if (await this.feedbackPersistence.categoryHasTickets(id))
      throw new BadRequestException('该分类仍有关联工单，请先停用或迁移工单');
    await this.feedbackPersistence.deleteCategory(id);
    this.store.audit(admin.id, 'FEEDBACK_CATEGORY_DELETE', 'FeedbackCategory', id, item, null);
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
    return {
      items: Object.entries(this.configObject()).map(([key, value]) => ({
        key,
        value,
        description: this.store.systemSettings[key]?.description ?? key,
        updatedAt: this.store.systemSettings[key]?.updatedAt,
      })),
      enforcedKeys: ENFORCED_SETTING_KEYS,
      notImplementedKeys: NOT_IMPLEMENTED_SETTING_KEYS,
    };
  }

  @Get('settings')
  settingsAlias() {
    return this.settings();
  }

  @Get('config')
  config() {
    return {
      item: this.configObject(),
      enforcedKeys: ENFORCED_SETTING_KEYS,
      notImplementedKeys: NOT_IMPLEMENTED_SETTING_KEYS,
    };
  }

  @Put('system/settings')
  async updateSettings(@Headers('authorization') auth: string, @Body() body: Record<string, unknown>) {
    const admin = this.admin(auth);
    const before = this.configObject();
    if (body.localModelFirst === true) {
      throw new BadRequestException('本地模型已被 DAPI-only 运行策略永久禁用。');
    }
    // A setting that is presented as a future capability must not be saved as if it were
    // active: accepting the write would let the console report a change that has no effect
    // (closure task sections 22 and 57).
    const refused = Object.keys(body).filter((key) => NOT_IMPLEMENTED_SETTING_KEYS.includes(key));
    if (refused.length > 0) {
      throw new BadRequestException(`这些设置当前版本尚未接入业务逻辑，无法保存：${refused.join('、')}`);
    }
    for (const [key, value] of Object.entries(body)) {
      this.store.systemSettings[key] = {
        ...(this.store.systemSettings[key] ?? { description: key }),
        value,
        updatedBy: admin.id,
        updatedAt: new Date().toISOString(),
      };
      if (key === 'defaultVisibility') {
        if (DIRECT_DB_MODELS.PrivacySetting) {
          await this.selfPersistence.updateDefaultVisibilityFanOut(value as 'PUBLIC' | 'PRIVATE');
        } else {
          for (const userId in this.store.privacySettings) {
            this.store.privacySettings[userId].defaultVisibility = value as 'PUBLIC' | 'PRIVATE';
          }
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
  async auditLogs(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    // The table is the source of truth. Audited single-record reads write there directly, so an
    // in-memory-only list hid them until a restart. Rows a handler has queued but not yet flushed
    // are merged in by id, so a moderation action just performed is not missing from the list.
    const persisted = await this.selfPersistence.listAuditLogsForAdmin();
    const byId = new Map(persisted.map((item) => [item.id, item as any]));
    for (const item of this.store.auditLogs) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
    const merged = [...byId.values()].sort((left, right) =>
      String(right.createdAt).localeCompare(String(left.createdAt)),
    );
    return this.list(merged, page, pageSize);
  }
}
