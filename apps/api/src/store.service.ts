import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import type { AIProvider, AIStyle, AIStyleRoute, Emotion, MediaAsset, PostItem, PrivacySetting, ReplyItem, Visibility, ActionBarrier, SupportIntent, JourneyOutcome, UserNotification } from '@goodnight/shared-types';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaRuntimeService } from './prisma-runtime.service.js';
import { DAPI_BASE_URL, DAPI_PROVIDER_ID, REMOTE_BACKUP_BASE_URL, REMOTE_BACKUP_PROVIDER_ID, RemoteAiProviderService, sanitizeProviderError } from './remote-ai-provider.service.js';
import { resolveUploadsDirectory, visualFixtureMode } from './runtime-environment.js';
import { scheduleFollowUp } from './follow-up-queue.js';

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
const SUPPORTED_AI_REPLY_STYLES: readonly AIStyle[] = ['warm', 'rational', 'light', 'clear', 'poetic'];

function isSupportedAiReplyStyle(value: unknown): value is AIStyle {
  return typeof value === 'string' && SUPPORTED_AI_REPLY_STYLES.includes(value as AIStyle);
}

const MOOD_KEY_TO_EMOTION: Record<string, string> = {
  anxious: '焦虑',
  anxiety: '焦虑',
  jiaolv: '焦虑',
  焦虑: '焦虑',
  '鐒﹁檻': '焦虑',
  aggrieved: '委屈',
  wronged: '委屈',
  weiqu: '委屈',
  委屈: '委屈',
  '濮斿眻': '委屈',
  insomnia: '失眠',
  sleepless: '失眠',
  shimian: '失眠',
  失眠: '失眠',
  '澶辯湢': '失眠',
  love: '恋爱',
  lianai: '恋爱',
  恋爱: '恋爱',
  '鎭嬬埍': '恋爱',
  work: '工作',
  gongzuo: '工作',
  工作: '工作',
  '宸ヤ綔': '工作',
  sad: '难过',
  nanguo: '难过',
  难过: '难过',
  lonely: '孤独',
  gudu: '孤独',
  孤独: '孤独',
  angry: '生气',
  shengqi: '生气',
  生气: '生气',
  all: '全部',
  全部: '全部',
  '鍏ㄩ儴': '全部',
};

export function normalizeStoreEmotion(value?: string): Emotion {
  if (!value) return '焦虑' as Emotion;
  const trimmed = String(value).trim();
  return (MOOD_KEY_TO_EMOTION[trimmed] ?? trimmed) as Emotion;
}

export type AITaskType =
  | 'post_reply'
  | 'today_letter'
  | 'breakdown'
  | 'rewrite'
  | 'rant'
  | 'heal'
  | 'sleep'
  | 'work'
  | 'future'
  | 'month_report'
  | 'situation_analysis'
  | 'action_plan'
  | 'journey_summary'
  | 'support_plan'
  | 'decision_clarify'
  | 'need_analysis'
  | 'risk_analysis'
  | 'barrier_analysis'
  | 'adaptive_action'
  | 'peer_match_explain'
  | 'loop_detection'
  | 'recovery_summary'
  | 'peer_response_assist';

export interface AIGenerateInput {
  taskType?: AITaskType | string;
  content?: string;
  mood?: string;
  style?: AIStyle;
  userId?: string;
  sourceId?: string;
  simulatePrimaryFail?: boolean;
  simulateBackupFail?: boolean;
}

export interface AIGenerateResult {
  status: 'queued';
  provider: string;
  style: AIStyle;
  result: string;
  structured: Record<string, unknown>;
  jobId: string;
  job: AIJob;
}

const dataFile = path.resolve(
  process.cwd(),
  process.env.GOODNIGHT_STORE_FILE ?? (process.env.VITEST ? `data/goodnight-store.vitest-${process.pid}.json` : 'data/goodnight-store.json'),
);
const uploadsDirectory = resolveUploadsDirectory();

function imageDimensions(buffer: Buffer, mimeType: string) {
  if (mimeType === 'image/png' && buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mimeType === 'image/webp' && buffer.length >= 30 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    const kind = buffer.subarray(12, 16).toString('ascii');
    if (kind === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  if (mimeType === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && offset + 8 < buffer.length) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      if (!length || offset + 2 + length > buffer.length) break;
      offset += 2 + length;
    }
  }
  return { width: 0, height: 0 };
}

function extensionForMime(mimeType: string) {
  return mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
}

function diaryExportFilename(generatedAt: string) {
  const date = generatedAt.slice(0, 10).replace(/[^0-9-]/g, '') || 'export';
  return `goodnight-treehole-diaries-${date}.json`;
}

function escapeSvgText(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character] ?? character));
}

export interface Mood {
  id: string;
  userId: string;
  emotion: Emotion;
  content: string;
  visibility: Visibility;
  riskLevel: 'low' | 'medium' | 'high';
  riskScore: number;
  status: 'active' | 'deleted';
  attachmentIds?: string[];
  journeyId?: string;
  createdAt: string;
}

export interface Letter {
  id: string;
  userId: string;
  sourceMoodId?: string;
  style: AIStyle;
  title: string;
  content: string;
  status: 'unread' | 'read';
  savedToDiary: boolean;
  aiJobId?: string;
  generationStatus?: AIJob['status'];
  favorite?: boolean;
  likeCount?: number;
  createdAt: string;
}

export interface Diary {
  id: string;
  userId: string;
  moodId?: string;
  journeyId?: string;
  letterId?: string;
  emotion: Emotion;
  content: string;
  hasLetter: boolean;
  source?: string;
  toolResult?: unknown;
  attachmentIds?: string[];
  createdAt: string;
}

export type FeedbackTicketStatus = 'open' | 'processing' | 'resolved' | 'closed';

export interface FeedbackTicket {
  id: string;
  userId: string;
  categoryId: string;
  sourcePage: string;
  content: string;
  status: FeedbackTicketStatus;
  priority: string;
  // Persist only MediaAsset ids. URLs are resolved at read time so stale or
  // user-supplied URLs can never be rendered by the admin application.
  screenshots: string[];
  reply: string;
  repliedBy?: string;
  repliedAt?: string;
  createdAt: string;
}

export interface AIJob {
  id: string;
  userId: string;
  contentId: string;
  contentType: string;
  taskType?: string;
  jobType: string;
  style: AIStyle;
  providerId: string;
  modelName: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'fallback' | 'cancelled';
  promptSummary: string;
  promptVersion?: string;
  result: string;
  structuredResult?: Record<string, unknown>;
  errorMessage?: string;
  durationMs: number;
  retryCount: number;
  fallbackUsed?: boolean;
  traceJson: unknown[];
  routeVersion: number;
  createdAt: string;
  completedAt?: string;
}

export interface LifeJourneyRecord {
  id: string;
  userId: string;
  title: string;
  domain: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
  stage: string;
  currentIntent?: SupportIntent;
  intentUpdatedAt?: string;
  initialIntensity?: number;
  visibility: Visibility;
  intensity?: number;
  summary?: string;
  nextReviewAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SituationSnapshotRecord {
  id: string;
  journeyId: string;
  facts: string[];
  feelings: string[];
  needs: string[];
  constraints: string[];
  risks: string[];
  domain?: string;
  subDomain?: string;
  eventType?: string;
  eventStartedAt?: string;
  daysSinceEvent?: number;
  stage?: string;
  contextTags?: string[];
  peopleContext?: string[];
  decisionContext?: string[];
  behaviorSignals?: string[];
  recoverySignals?: string[];
  intensity?: number;
  urgency?: number;
  fingerprintJson?: Record<string, unknown>;
  confidence: 'user_confirmed' | 'agent_draft';
  createdAt: string;
  updatedAt: string;
}

export interface JourneyUpdateRecord {
  id: string;
  journeyId: string;
  userId: string;
  kind: string;
  content: string;
  payload?: Record<string, unknown>;
  stage?: string;
  intensity?: number;
  lifeFunction?: string;
  actionResult?: string;
  decisionChange?: string;
  contactState?: string;
  sleepState?: string;
  socialState?: string;
  selfReportedHelpfulness?: number;
  eventDate?: string;
  createdAt: string;
}

export interface ActionCommitmentRecord {
  id: string;
  journeyId: string;
  userId: string;
  title: string;
  description?: string;
  status: 'active' | 'completed' | 'skipped' | 'paused';
  dueAt?: string;
  reminderAt?: string;
  evidence?: Record<string, unknown>;
  parentActionId?: string;
  adaptationReason?: ActionBarrier;
  attemptNumber?: number;
  createdAt: string;
  updatedAt: string;
}

export interface OutcomeCheckinRecord {
  id: string;
  journeyId: string;
  commitmentId?: string;
  userId: string;
  status: 'pending' | 'completed' | 'missed';
  reflection?: string;
  result?: string;
  intensity?: number;
  checkedAt?: string;
  dueAt?: string;
  barrier?: ActionBarrier;
  createdAt: string;
}

export interface PeerExperienceRecord {
  id: string;
  userId: string;
  journeyId?: string;
  title: string;
  domain: string;
  stage: string;
  subDomain?: string;
  content: string;
  tags: string[];
  fingerprintJson?: Record<string, unknown>;
  laterSummary?: Record<string, unknown>;
  helpfulActions?: string[];
  notHelpfulActions?: string[];
  retrospective?: string;
  consentedAt: string;
  status: 'draft' | 'pending_review' | 'published' | 'hidden' | 'rejected';
  reportCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PeerMatchRecord {
  id: string;
  userId: string;
  journeyId?: string;
  peerExperienceId: string;
  score: number;
  reasons: string[];
  stageDistance?: number;
  recoveryLead?: number;
  trustScore?: number;
  fingerprintSimilarity?: number;
  scoreBreakdown?: Record<string, number>;
  explanation?: string;
  requestReason?: string;
  requestQuestion?: string;
  acceptedAt?: string;
  status: 'suggested' | 'requested' | 'connected' | 'declined' | 'blocked';
  createdAt: string;
  updatedAt: string;
}

type DecisionRecord = { id: string; userId: string; journeyId?: string; question: string; options: string[]; criteria: string[]; decision?: string; status: string; createdAt: string; updatedAt: string };
type CooldownItem = { id: string; userId: string; decisionId?: string; title: string; reason?: string; releaseAt: string; status: string; createdAt: string };
type RealityHandoff = { id: string; userId: string; journeyId?: string; recipient: string; channel: string; summary: string; status: 'draft' | 'ready' | 'shared' | 'completed'; sharedAt?: string; createdAt: string; updatedAt: string };
type TrustedContact = { id: string; userId: string; nickname: string; relation: string; contactHint: string; enabled: boolean; createdAt: string; updatedAt: string };
type MessageToFutureSelf = { id: string; userId: string; journeyId?: string; content: string; deliverAt: string; deliveredAt?: string; createdAt: string };
type PersonalSupportPlan = { id: string; userId: string; journeyId?: string; title: string; plan: Record<string, unknown>; active: boolean; createdAt: string; updatedAt: string };
type MemoryItem = { id: string; userId: string; journeyId?: string; category: string; content: string; consentedAt: string; expiresAt: string; deletedAt?: string; createdAt: string };
type RecoverySnapshot = { id: string; userId: string; journeyId?: string; summary: string; signals: Record<string, unknown>; createdAt: string };
type SafetyEvent = { id: string; userId: string; journeyId?: string; level: string; source: string; action: string; payload?: Record<string, unknown>; createdAt: string };
type AgentDecisionLog = { id: string; userId: string; journeyId?: string; aiJobId?: string; taskType: string; decision: Record<string, unknown>; createdAt: string };
type FollowUpJob = { id: string; userId: string; journeyId?: string; kind: string; dueAt: string; status: string; payload?: Record<string, unknown>; completedAt?: string; createdAt: string };
type PeerConversationRecord = {
  id: string;
  matchId: string;
  starterUserId: string;
  receiverUserId: string;
  status: 'active' | 'closed' | 'extended';
  startsAt: string;
  consentAcceptedAt?: string;
  expiresAt: string;
  createdAt: string;
  closedAt?: string;
  closedReason?: 'closed' | 'expired' | 'blocked';
  feedback?: 'helpful' | 'unchanged' | 'uncomfortable';
  feedbackNote?: string;
  reportedAt?: string;
  reporterUserId?: string;
  reportReason?: string;
};
type PeerMessageRecord = { id: string; conversationId: string; senderUserId: string; content: string; authorType: 'HUMAN' | 'AI_ASSIST'; createdAt: string; reportedAt?: string; blockedAt?: string; piiFlags?: string[] };

interface StoreData {
  users: Array<{ id: string; openid: string; nickname: string; anonymousCode: string; avatarUrl: string; status: 'normal' | 'limited' | 'banned'; createdAt: string }>;
  adminUsers: Array<{ id: string; username: string; passwordHash: string; displayName: string; role: string; status: string; lastLoginAt?: string }>;
  privacySettings: Record<string, PrivacySetting>;
  moods: Mood[];
  posts: PostItem[];
  replies: ReplyItem[];
  letters: Letter[];
  diaries: Diary[];
  favorites: Array<{ id: string; userId: string; targetType: 'post' | 'letter' | 'diary'; targetId: string; createdAt: string }>;
  feedbackCategories: Array<{ id: string; name: string; sortOrder: number; enabled: boolean }>;
  faqs: Array<{ id: string; question: string; answer: string; sortOrder: number; enabled: boolean; createdAt: string }>;
  replyPresets: Array<{ id: string; text: string; scene: string; sortOrder: number; enabled: boolean; createdAt: string }>;
  feedbackTickets: FeedbackTicket[];
  systemSettings: Record<string, { value: unknown; description: string; updatedBy: string; updatedAt: string }>;
  aiProviders: AIProvider[];
  aiRoutes: AIStyleRoute[];
  aiJobs: AIJob[];
  assets: MediaAsset[];
  auditLogs: Array<{ id: string; adminUserId: string; action: string; resourceType: string; resourceId: string; beforeJson: unknown; afterJson: unknown; ip: string; userAgent: string; createdAt: string }>;
  lifeJourneys: LifeJourneyRecord[];
  situationSnapshots: SituationSnapshotRecord[];
  journeyUpdates: JourneyUpdateRecord[];
  actionCommitments: ActionCommitmentRecord[];
  outcomeCheckins: OutcomeCheckinRecord[];
  peerExperiences: PeerExperienceRecord[];
  peerMatches: PeerMatchRecord[];
  peerReputations: Array<{ id: string; userId: string; helpfulCount: number; reportCount: number; restrictedUntil?: string; updatedAt: string }>;
  decisionRecords: DecisionRecord[];
  cooldownItems: CooldownItem[];
  realityHandoffs: RealityHandoff[];
  trustedContacts: TrustedContact[];
  messagesToFutureSelf: MessageToFutureSelf[];
  personalSupportPlans: PersonalSupportPlan[];
  memoryItems: MemoryItem[];
  recoverySnapshots: RecoverySnapshot[];
  safetyEvents: SafetyEvent[];
  agentDecisionLogs: AgentDecisionLog[];
  followUpJobs: FollowUpJob[];
  notifications: UserNotification[];
  peerConversations: PeerConversationRecord[];
  peerMessages: PeerMessageRecord[];
}

function seedData(): StoreData {
  const createdAt = now();
  return {
    users: [
      { id: 'user_demo', openid: 'openid_demo', nickname: '晚安旅人', anonymousCode: '树洞 0427', avatarUrl: '/avatar.svg', status: 'normal', createdAt },
      { id: 'user_guest', openid: 'openid_guest', nickname: '今天也在努力', anonymousCode: '树洞 1024', avatarUrl: '/avatar.svg', status: 'normal', createdAt },
    ],
    adminUsers: [
      { id: 'admin_1', username: 'admin', passwordHash: 'plain:admin123', displayName: '值班管理员', role: 'super_admin', status: 'active' },
    ],
    privacySettings: {
      user_demo: { defaultVisibility: 'PRIVATE', allowAnonymousPublic: true, allowHumanReplies: true, allowMonthlyReportShare: true },
      user_guest: { defaultVisibility: 'PUBLIC', allowAnonymousPublic: true, allowHumanReplies: false, allowMonthlyReportShare: true },
    },
    moods: [
      { id: 'mood_1', userId: 'user_demo', emotion: '焦虑', content: '明天要汇报，我又开始担心自己讲不好。', visibility: 'PUBLIC', riskLevel: 'low', riskScore: 0.1, status: 'active', createdAt },
      { id: 'mood_2', userId: 'user_guest', emotion: '失眠', content: '凌晨两点还是睡不着，脑子一直在转。', visibility: 'PUBLIC', riskLevel: 'low', riskScore: 0.1, status: 'active', createdAt },
    ],
    posts: [
      { id: 'post_1', moodId: 'mood_1', userId: 'user_demo', emotion: '焦虑', content: '明天要汇报，我又开始担心自己讲不好。', visibility: 'PUBLIC', status: 'active', reviewStatus: 'published', hugCount: 18, replyCount: 2, favoriteCount: 5, reportCount: 0, createdAt },
      { id: 'post_2', moodId: 'mood_2', userId: 'user_guest', emotion: '失眠', content: '凌晨两点还是睡不着，脑子一直在转。', visibility: 'PUBLIC', status: 'active', reviewStatus: 'published', hugCount: 31, replyCount: 1, favoriteCount: 8, reportCount: 0, createdAt },
    ],
    replies: [
      { id: 'reply_ai_1', postId: 'post_1', type: 'AI', style: 'warm', content: '你已经在认真准备了，紧张只是身体在提醒你重视这件事。先把开场一句话写下来就好。', status: 'published', riskLevel: 'low', createdAt },
      { id: 'reply_human_1', postId: 'post_1', userId: 'user_guest', type: 'USER', style: 'human', content: '抱抱，我汇报前也会这样。把稿子读三遍会安心很多。', status: 'published', riskLevel: 'low', createdAt },
      { id: 'reply_ai_2', postId: 'post_2', type: 'AI', style: 'poetic', content: '夜晚把声音放大了，不代表明天会更难。先让肩膀落下来，给自己一杯温水。', status: 'published', riskLevel: 'low', createdAt },
    ],
    letters: [
      { id: 'letter_today', userId: 'user_demo', sourceMoodId: 'mood_1', style: 'warm', title: '给今晚的你', content: '辛苦了。今天的你没有被焦虑打败，而是在试着把它说出来。', status: 'unread', savedToDiary: false, createdAt },
    ],
    diaries: [
      { id: 'diary_1', userId: 'user_demo', moodId: 'mood_1', letterId: 'letter_today', emotion: '焦虑', content: '今天练习了汇报开场，虽然还是紧张，但已经比早上稳一点。', hasLetter: true, createdAt },
    ],
    favorites: [
      { id: 'fav_1', userId: 'user_demo', targetType: 'post', targetId: 'post_1', createdAt },
      { id: 'fav_2', userId: 'user_demo', targetType: 'letter', targetId: 'letter_today', createdAt },
    ],
    feedbackCategories: [
      { id: 'cat_1', name: '使用问题', sortOrder: 1, enabled: true },
      { id: 'cat_2', name: '内容建议', sortOrder: 2, enabled: true },
      { id: 'cat_3', name: '隐私与数据', sortOrder: 3, enabled: true },
    ],
    faqs: [
      { id: 'faq_1', question: '树洞内容会公开我的身份吗？', answer: '不会。广场只展示匿名编号，个人身份不会出现在公开内容里。', sortOrder: 1, enabled: true, createdAt },
      { id: 'faq_2', question: 'AI 回信是心理诊断吗？', answer: '不是。晚安树洞只提供情绪陪伴和整理，不做诊断或医疗建议。', sortOrder: 2, enabled: true, createdAt },
    ],
    replyPresets: [
      { id: 'preset_1', text: '给你一个轻轻的抱抱。', scene: 'comfort', sortOrder: 1, enabled: true, createdAt },
      { id: 'preset_2', text: '我看见你的不容易了。', scene: 'comfort', sortOrder: 2, enabled: true, createdAt },
    ],
    feedbackTickets: [
      { id: 'ticket_1', userId: 'user_demo', categoryId: 'cat_1', sourcePage: '/pages/feedback/index', content: '希望月报可以导出图片。', status: 'open', priority: 'medium', screenshots: [], reply: '', createdAt },
    ],
    systemSettings: {
      appName: { value: '晚安树洞', description: '小程序名称', updatedBy: 'system', updatedAt: createdAt },
      defaultVisibility: { value: 'PRIVATE', description: '新用户默认发布可见范围', updatedBy: 'system', updatedAt: createdAt },
      defaultPageSize: { value: 10, description: '默认分页数量', updatedBy: 'system', updatedAt: createdAt },
      highRiskBlockEnabled: { value: true, description: '高危词拦截开关', updatedBy: 'system', updatedAt: createdAt },
      allowHumanRepliesDefault: { value: true, description: '允许真人回应默认值', updatedBy: 'system', updatedAt: createdAt },
      localModelFirst: { value: false, description: '本地模型已由运行策略永久禁用', updatedBy: 'system', updatedAt: createdAt },
    },
    aiProviders: [
      { id: 'provider_qwen', name: '历史本地模型（已禁用）', type: 'local', providerKind: 'ollama', baseUrl: 'disabled://local-model', modelName: 'Qwen2.5-1.5B', apiKeyStatus: 'missing', enabled: false, priority: 99, dailyLimit: 0, timeoutSeconds: 1, failoverEnabled: false, usageTags: ['historical', 'disabled'], failureRate: 0, avgLatencyMs: 0, todayCalls: 31 },
      { id: DAPI_PROVIDER_ID, name: 'DAPI · DeepSeek', type: 'cloud', providerKind: 'openai-compatible', baseUrl: DAPI_BASE_URL, modelName: 'deepseek-chat', apiKeyStatus: 'missing', enabled: true, priority: 1, dailyLimit: 10000, timeoutSeconds: 30, failoverEnabled: true, usageTags: ['remote', 'primary', 'dapi', 'deepseek'], failureRate: 0, avgLatencyMs: 0, todayCalls: 0, modelMeta: { family: 'openai-compatible', capabilities: ['chat'] } },
      { id: REMOTE_BACKUP_PROVIDER_ID, name: 'OpenAI API · 远程备用', type: 'cloud', providerKind: 'openai-compatible', baseUrl: REMOTE_BACKUP_BASE_URL, modelName: 'gpt-4o-mini', apiKeyStatus: 'missing', enabled: false, priority: 2, dailyLimit: 10000, timeoutSeconds: 30, failoverEnabled: false, usageTags: ['remote', 'secondary', 'openai'], failureRate: 0, avgLatencyMs: 0, todayCalls: 0, modelMeta: { family: 'openai-compatible', capabilities: ['chat'] } },
      { id: 'provider_deepseek', name: 'DeepSeek（历史配置）', type: 'cloud', providerKind: 'other', baseUrl: 'https://api.deepseek.com', modelName: 'deepseek-chat', apiKeyStatus: 'missing', enabled: false, priority: 90, dailyLimit: 1000, timeoutSeconds: 12, failoverEnabled: false, usageTags: ['historical', 'disabled'], failureRate: 0.04, avgLatencyMs: 930, todayCalls: 18 },
      { id: 'provider_kimi', name: 'Kimi', type: 'cloud', baseUrl: 'https://api.moonshot.cn', modelName: 'moonshot-v1-128k', apiKeyStatus: 'missing', enabled: true, priority: 3, dailyLimit: 800, timeoutSeconds: 12, failoverEnabled: true, usageTags: ['poetic'], failureRate: 0.05, avgLatencyMs: 870, todayCalls: 12 },
      { id: 'provider_doubao', name: '豆包', type: 'cloud', baseUrl: 'https://ark.cn-beijing.volces.com', modelName: 'doubao-pro', apiKeyStatus: 'missing', enabled: true, priority: 4, dailyLimit: 800, timeoutSeconds: 12, failoverEnabled: true, usageTags: ['light'], failureRate: 0.03, avgLatencyMs: 760, todayCalls: 9 },
      { id: 'provider_openai', name: 'OpenAI', type: 'cloud', baseUrl: 'https://api.openai.com', modelName: 'gpt-4o-mini', apiKeyStatus: 'missing', enabled: true, priority: 5, dailyLimit: 500, timeoutSeconds: 12, failoverEnabled: true, usageTags: ['clear'], failureRate: 0.03, avgLatencyMs: 810, todayCalls: 7 },
      { id: 'provider_claude', name: 'Claude', type: 'cloud', baseUrl: 'https://api.anthropic.com', modelName: 'claude-3-haiku', apiKeyStatus: 'missing', enabled: false, priority: 6, dailyLimit: 300, timeoutSeconds: 12, failoverEnabled: true, usageTags: ['backup'], failureRate: 0.01, avgLatencyMs: 980, todayCalls: 0 },
      { id: 'provider_safe_template', name: '安全文案备用', type: 'template', providerKind: 'template', baseUrl: 'local://safe-response-template', modelName: 'safe-response-template', apiKeyStatus: 'configured', enabled: true, priority: 98, dailyLimit: 99999, timeoutSeconds: 1, failoverEnabled: false, usageTags: ['backup', 'template', 'safe'], failureRate: 0, avgLatencyMs: 1, todayCalls: 0 },
      { id: 'provider_template', name: '模板兜底', type: 'template', baseUrl: 'local://template', modelName: 'fallback-template', apiKeyStatus: 'configured', enabled: true, priority: 99, dailyLimit: 99999, timeoutSeconds: 1, failoverEnabled: false, usageTags: ['fallback'], failureRate: 0, avgLatencyMs: 4, todayCalls: 6 },
    ],
    aiRoutes: [
      { style: 'warm', label: '暖心陪伴', primaryProviderId: DAPI_PROVIDER_ID, backupProviderId: REMOTE_BACKUP_PROVIDER_ID, fallbackTemplateId: 'provider_template', promptVersion: 'dapi-warm-v1', promptTemplate: '温柔但不诊断地回应用户情绪。', enabled: true, routeVersion: 1 },
      { style: 'rational', label: '理性分析', primaryProviderId: DAPI_PROVIDER_ID, backupProviderId: REMOTE_BACKUP_PROVIDER_ID, fallbackTemplateId: 'provider_template', promptVersion: 'dapi-rational-v1', promptTemplate: '拆解事实、情绪和下一步。', enabled: true, routeVersion: 1 },
      { style: 'light', label: '轻松一点', primaryProviderId: DAPI_PROVIDER_ID, backupProviderId: REMOTE_BACKUP_PROVIDER_ID, fallbackTemplateId: 'provider_template', promptVersion: 'dapi-light-v1', promptTemplate: '轻松一点但不轻浮。', enabled: true, routeVersion: 1 },
      { style: 'clear', label: '清醒提醒', primaryProviderId: DAPI_PROVIDER_ID, backupProviderId: REMOTE_BACKUP_PROVIDER_ID, fallbackTemplateId: 'provider_template', promptVersion: 'dapi-clear-v1', promptTemplate: '清晰提醒边界和可控行动。', enabled: true, routeVersion: 1 },
      { style: 'poetic', label: '诗意疗愈', primaryProviderId: DAPI_PROVIDER_ID, backupProviderId: REMOTE_BACKUP_PROVIDER_ID, fallbackTemplateId: 'provider_template', promptVersion: 'dapi-poetic-v1', promptTemplate: '像夜灯一样温柔地书写。', enabled: true, routeVersion: 1 },
    ],
    aiJobs: [],
    assets: [],
    auditLogs: [],
    lifeJourneys: [],
    situationSnapshots: [],
    journeyUpdates: [],
    actionCommitments: [],
    outcomeCheckins: [],
    peerExperiences: [],
    peerMatches: [],
    peerReputations: [],
    decisionRecords: [],
    cooldownItems: [],
    realityHandoffs: [],
    trustedContacts: [],
    messagesToFutureSelf: [],
    personalSupportPlans: [],
    memoryItems: [],
    recoverySnapshots: [],
    safetyEvents: [],
    agentDecisionLogs: [],
    followUpJobs: [],
    notifications: [],
    peerConversations: [],
    peerMessages: [],
  };
}

@Injectable()
export class StoreService implements OnModuleInit {
  private data: StoreData;
  private persistQueue: Promise<void> = Promise.resolve();
  private persistenceError?: string;
  private ollamaOnline = false;
  private ollamaLastCheckedAt?: string;
  private ollamaLastError?: string;

  constructor(
    @Inject(PrismaRuntimeService) private readonly prisma: PrismaRuntimeService,
    @Inject(RemoteAiProviderService) private readonly remoteAi: RemoteAiProviderService = new RemoteAiProviderService(),
  ) {
    this.data = seedData();
  }

  async onModuleInit() {
    const persisted = await this.prisma.loadRuntimeState<StoreData>();
    this.data = persisted ?? this.loadLegacyStore();
    this.migrateAiJobs();
    this.recoverInterruptedAiJobs();
    this.reconcileFavoriteCounts();
    this.reconcileLetterFavorites();
    this.ensureGoodnightTwoCoverage();
    this.ensurePhaseTwoCoverage();
    this.ensureSeedCoverage();
    if (!visualFixtureMode) this.enforceRemoteAiProviderPolicy();
    await this.flush();
  }

  async reloadRuntimeState() {
    const persisted = await this.prisma.loadRuntimeState<StoreData>();
    if (persisted) {
      this.data = persisted;
      this.ensurePhaseTwoCoverage();
    }
  }

  get users() { return this.data.users; }
  get adminUsers() { return this.data.adminUsers; }
  get privacySettings() { return this.data.privacySettings; }
  get moods() { return this.data.moods; }
  get posts() { return this.data.posts; }
  get replies() { return this.data.replies; }
  get letters() { return this.data.letters; }
  set letters(value: Letter[]) { this.data.letters = value; this.persist(); }
  get diaries() { return this.data.diaries; }
  set diaries(value: Diary[]) { this.data.diaries = value; this.persist(); }
  get favorites() { return this.data.favorites; }
  set favorites(value: StoreData['favorites']) { this.data.favorites = value; this.persist(); }
  get feedbackCategories() { return this.data.feedbackCategories; }
  set feedbackCategories(value: StoreData['feedbackCategories']) { this.data.feedbackCategories = value; this.persist(); }
  get faqs() { return this.data.faqs; }
  set faqs(value: StoreData['faqs']) { this.data.faqs = value; this.persist(); }
  get replyPresets() { return this.data.replyPresets; }
  set replyPresets(value: StoreData['replyPresets']) { this.data.replyPresets = value; this.persist(); }
  get feedbackTickets() { return this.data.feedbackTickets; }
  get systemSettings() { return this.data.systemSettings; }
  get aiProviders() { return this.data.aiProviders; }
  get aiRoutes() { return this.data.aiRoutes; }
  get aiJobs() { return this.data.aiJobs; }
  get assets() { return this.data.assets; }
  get auditLogs() { return this.data.auditLogs; }
  get lifeJourneys() { return this.data.lifeJourneys; }
  get situationSnapshots() { return this.data.situationSnapshots; }
  get journeyUpdates() { return this.data.journeyUpdates; }
  get actionCommitments() { return this.data.actionCommitments; }
  get outcomeCheckins() { return this.data.outcomeCheckins; }
  get peerExperiences() { return this.data.peerExperiences; }
  get peerMatches() { return this.data.peerMatches; }
  get peerReputations() { return this.data.peerReputations; }
  get decisionRecords() { return this.data.decisionRecords; }
  get cooldownItems() { return this.data.cooldownItems; }
  get realityHandoffs() { return this.data.realityHandoffs; }
  get trustedContacts() { return this.data.trustedContacts; }
  get messagesToFutureSelf() { return this.data.messagesToFutureSelf; }
  get personalSupportPlans() { return this.data.personalSupportPlans; }
  get memoryItems() { return this.data.memoryItems; }
  get recoverySnapshots() { return this.data.recoverySnapshots; }
  get safetyEvents() { return this.data.safetyEvents; }
  get agentDecisionLogs() { return this.data.agentDecisionLogs; }
  get followUpJobs() { return this.data.followUpJobs; }
  get notifications() { return this.data.notifications; }
  get peerConversations() { return this.data.peerConversations; }
  get peerMessages() { return this.data.peerMessages; }

  private ensurePhaseTwoCoverage() {
    let changed = false;
    this.data.notifications ??= [];
    this.data.peerConversations ??= [];
    this.data.peerMessages ??= [];
    for (const journey of this.data.lifeJourneys) {
      if (journey.currentIntent && !['JUST_LISTEN', 'FIND_PEOPLE', 'SEE_OUTCOMES', 'NEXT_STEP', 'STOP_IMPULSE', 'PREPARE_CONVERSATION', 'NOTHING_NOW', 'HIGH_DISTRESS'].includes(journey.currentIntent)) {
        delete journey.currentIntent;
      }
    }
    for (const snapshot of this.data.situationSnapshots) {
      for (const key of ['facts', 'feelings', 'needs', 'constraints', 'risks', 'contextTags', 'peopleContext', 'decisionContext', 'behaviorSignals', 'recoverySignals'] as const) {
        if (!Array.isArray((snapshot as any)[key])) { (snapshot as any)[key] = []; changed = true; }
      }
    }
    if (changed) this.persist();
  }

  isFavorite(userId: string, targetType: StoreData['favorites'][number]['targetType'], targetId: string) {
    return this.data.favorites.some((item) => item.userId === userId && item.targetType === targetType && item.targetId === targetId);
  }

  decorateLetter(letter: Letter) {
    return { ...letter, favorite: this.isFavorite(letter.userId, 'letter', letter.id) };
  }

  addFavorite(userId: string, targetType: StoreData['favorites'][number]['targetType'], targetId: string) {
    const existing = this.data.favorites.find((item) => item.userId === userId && item.targetType === targetType && item.targetId === targetId);
    if (existing) return { item: existing, created: false };

    const favorite = { id: id('fav'), userId, targetType, targetId, createdAt: now() };
    this.data.favorites.unshift(favorite);
    if (targetType === 'post') {
      const post = this.posts.find((item) => item.id === targetId);
      if (post) post.favoriteCount += 1;
    }
    if (targetType === 'letter') {
      const letter = this.letters.find((item) => item.id === targetId && item.userId === userId);
      if (letter) letter.favorite = true;
    }
    return { item: favorite, created: true };
  }

  removeFavoriteByTarget(userId: string, targetType: StoreData['favorites'][number]['targetType'], targetId: string) {
    const removed = this.data.favorites.filter((item) => item.userId === userId && item.targetType === targetType && item.targetId === targetId);
    if (!removed.length) return removed;
    this.data.favorites = this.data.favorites.filter((item) => !removed.some((favorite) => favorite.id === item.id));
    this.applyFavoriteRemoval(removed);
    return removed;
  }

  removeFavoriteById(userId: string, favoriteId: string) {
    const favorite = this.data.favorites.find((item) => item.id === favoriteId && item.userId === userId);
    if (!favorite) return undefined;
    this.data.favorites = this.data.favorites.filter((item) => item.id !== favorite.id);
    this.applyFavoriteRemoval([favorite]);
    return favorite;
  }

  clearFavoritesForUser(userId: string) {
    const removed = this.data.favorites.filter((item) => item.userId === userId);
    if (!removed.length) return removed;
    this.data.favorites = this.data.favorites.filter((item) => item.userId !== userId);
    this.applyFavoriteRemoval(removed);
    return removed;
  }

  private storedFeedbackScreenshotIds(value: unknown) {
    if (!Array.isArray(value)) return [] as string[];
    const ids = value
      .map((item) => typeof item === 'string' ? item : item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined)
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim());
    return [...new Set(ids)];
  }

  resolveFeedbackScreenshotIds(userId: string, value: unknown) {
    if (value === undefined) return [] as string[];
    if (!Array.isArray(value)) throw new BadRequestException('反馈截图必须是图片资源列表');
    if (value.length > 2) throw new BadRequestException('反馈最多只能附带两张截图');
    if (value.some((item) => typeof item !== 'string' || !item.trim())) {
      throw new BadRequestException('反馈截图必须引用已上传的图片资源');
    }

    const ids = value.map((item) => String(item).trim());
    if (new Set(ids).size !== ids.length) throw new BadRequestException('请不要重复选择同一张反馈截图');

    for (const assetId of ids) {
      const asset = this.assets.find((item) => item.id === assetId);
      if (!asset || asset.status !== 'ready') throw new NotFoundException('反馈截图不存在或已被删除');
      if (asset.userId !== userId) throw new ForbiddenException('不能使用其他用户上传的截图');
      if (asset.usageType !== 'feedback') throw new BadRequestException('反馈只能使用通过反馈入口上传的截图');
      if (!fs.existsSync(path.join(uploadsDirectory, asset.storageKey))) {
        throw new NotFoundException('反馈截图文件不存在，请重新上传');
      }
    }
    return ids;
  }

  decorateFeedbackTicket(ticket: FeedbackTicket) {
    const screenshots = this.storedFeedbackScreenshotIds(ticket.screenshots)
      .map((assetId) => this.assets.find((asset) => asset.id === assetId && asset.userId === ticket.userId && asset.status === 'ready'))
      .filter((asset): asset is MediaAsset => Boolean(asset))
      .map((asset) => ({
        id: asset.id,
        url: asset.url,
        mimeType: asset.mimeType,
        size: asset.size,
        width: asset.width,
        height: asset.height,
      }));
    return { ...ticket, screenshots };
  }

  async createFeedbackTicket(input: { categoryId?: unknown; content?: unknown; sourcePage?: unknown; assetIds?: unknown }) {
    const userId = this.getDemoUserId();
    const content = typeof input.content === 'string' ? input.content.trim() : '';
    if (!content) throw new BadRequestException('反馈内容不能为空');
    if (content.length > 500) throw new BadRequestException('反馈内容不能超过 500 字');

    const requestedCategoryId = typeof input.categoryId === 'string' ? input.categoryId.trim() : '';
    const category = requestedCategoryId
      ? this.feedbackCategories.find((item) => item.id === requestedCategoryId)
      : this.feedbackCategories.filter((item) => item.enabled).sort((a, b) => a.sortOrder - b.sortOrder)[0];
    if (!category || !category.enabled) throw new BadRequestException('请选择可用的反馈分类');

    const sourcePage = typeof input.sourcePage === 'string' && input.sourcePage.trim()
      ? input.sourcePage.trim()
      : '/pages/help/feedback';
    if (!sourcePage.startsWith('/pages/') || sourcePage.length > 160) {
      throw new BadRequestException('反馈来源页面不合法');
    }

    const screenshots = this.resolveFeedbackScreenshotIds(userId, input.assetIds);
    const ticket: FeedbackTicket = {
      id: id('ticket'),
      userId,
      categoryId: category.id,
      sourcePage,
      content,
      status: 'open',
      priority: 'medium',
      screenshots,
      reply: '',
      createdAt: now(),
    };
    this.data.feedbackTickets.unshift(ticket);
    await this.persistAndFlush();
    return ticket;
  }

  feedbackTicketOrThrow(ticketId: string) {
    const ticket = this.feedbackTickets.find((item) => item.id === ticketId);
    if (!ticket) throw new NotFoundException('反馈工单不存在');
    return ticket;
  }

  async replyToFeedbackTicket(adminId: string, ticketId: string, value: unknown) {
    const ticket = this.feedbackTicketOrThrow(ticketId);
    const reply = typeof value === 'string' ? value.trim() : '';
    if (!reply) throw new BadRequestException('回复内容不能为空');
    if (reply.length > 1000) throw new BadRequestException('回复内容不能超过 1000 字');
    if (ticket.status === 'closed') throw new BadRequestException('已关闭的工单不能再回复');

    const before = { ...ticket };
    ticket.reply = reply;
    ticket.repliedBy = adminId;
    ticket.repliedAt = now();
    // A reply is work in progress, not proof that the issue has been solved.
    if (ticket.status === 'open') ticket.status = 'processing';
    this.audit(adminId, 'FEEDBACK_REPLY', 'FeedbackTicket', ticket.id, before, ticket);
    await this.persistAndFlush();
    return ticket;
  }

  async updateFeedbackTicketStatus(adminId: string, ticketId: string, value: unknown) {
    const ticket = this.feedbackTicketOrThrow(ticketId);
    const status = typeof value === 'string' ? value : '';
    const allowedStatuses: FeedbackTicketStatus[] = ['open', 'processing', 'resolved', 'closed'];
    if (!allowedStatuses.includes(status as FeedbackTicketStatus)) throw new BadRequestException('反馈工单状态不合法');
    const nextStatus = status as FeedbackTicketStatus;
    if (nextStatus === ticket.status) return ticket;

    const transitions: Record<FeedbackTicketStatus, FeedbackTicketStatus[]> = {
      open: ['processing', 'closed'],
      processing: ['resolved', 'closed'],
      resolved: ['processing', 'closed'],
      closed: [],
    };
    if (!transitions[ticket.status].includes(nextStatus)) {
      throw new BadRequestException('当前工单不能切换到该状态');
    }
    if (nextStatus === 'resolved' && !ticket.reply.trim()) {
      throw new BadRequestException('请先回复用户，再将工单标记为已解决');
    }

    const before = { ...ticket };
    ticket.status = nextStatus;
    this.audit(adminId, 'FEEDBACK_STATUS', 'FeedbackTicket', ticket.id, before, ticket);
    await this.persistAndFlush();
    return ticket;
  }

  async createMediaAsset(file: Express.Multer.File, usageType: string): Promise<MediaAsset> {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowed.has(file.mimetype)) throw new NotFoundException('仅支持 JPEG、PNG 或 WebP 图片');
    if (!file.buffer?.length) throw new NotFoundException('上传文件内容为空');
    if (file.size > 5 * 1024 * 1024) throw new NotFoundException('单张图片不能超过 5MB');
    const assetId = id('media');
    const storageKey = `${assetId}.${extensionForMime(file.mimetype)}`;
    const target = path.join(uploadsDirectory, storageKey);
    fs.mkdirSync(uploadsDirectory, { recursive: true });
    fs.writeFileSync(target, file.buffer);
    const dimensions = imageDimensions(file.buffer, file.mimetype);
    const asset: MediaAsset = {
      id: assetId,
      userId: this.getDemoUserId(),
      storageKey,
      url: `/uploads/${storageKey}`,
      mimeType: file.mimetype,
      size: file.size,
      width: dimensions.width,
      height: dimensions.height,
      usageType,
      status: 'ready',
      createdAt: now(),
    };
    this.assets.unshift(asset);
    this.persist();
    await this.flush();
    return asset;
  }

  async createDiaryExport(userId = this.getDemoUserId()) {
    const generatedAt = now();
    const diaries = this.diaries
      .filter((item) => item.userId === userId)
      .map((item) => {
        const attachmentIds = item.attachmentIds ?? this.moods.find((mood) => mood.id === item.moodId)?.attachmentIds ?? [];
        return {
          ...item,
          attachments: this.mediaByIds(attachmentIds).map((asset) => ({
            id: asset.id,
            url: asset.url,
            mimeType: asset.mimeType,
            size: asset.size,
            width: asset.width,
            height: asset.height,
            createdAt: asset.createdAt,
          })),
        };
      });
    const assetId = id('export');
    const storageKey = `diary-export-${generatedAt.replace(/[:.]/g, '-')}-${assetId}.json`;
    const target = path.join(uploadsDirectory, storageKey);
    const asset: MediaAsset = {
      id: assetId,
      userId,
      storageKey,
      url: `/api/v1/exports/${assetId}/download`,
      mimeType: 'application/json; charset=utf-8',
      size: 0,
      width: 0,
      height: 0,
      usageType: 'diary-export',
      status: 'ready',
      createdAt: generatedAt,
    };
    const document = {
      format: 'goodnight-treehole-diary-export/v1',
      generatedAt,
      count: diaries.length,
      diaries,
    };
    const contents = Buffer.from(`${JSON.stringify(document, null, 2)}\n`, 'utf8');
    asset.size = contents.length;

    fs.mkdirSync(uploadsDirectory, { recursive: true });
    fs.writeFileSync(target, contents);
    this.assets.unshift(asset);
    this.persist();
    try {
      await this.flush();
    } catch (error) {
      this.data.assets = this.data.assets.filter((item) => item.id !== asset.id);
      if (fs.existsSync(target)) fs.unlinkSync(target);
      throw error;
    }

    return {
      count: diaries.length,
      generatedAt,
      downloadUrl: asset.url,
      asset: { ...asset, filename: diaryExportFilename(generatedAt) },
    };
  }

  getDiaryExportDownload(assetId: string, userId = this.getDemoUserId()) {
    const asset = this.assets.find((item) => item.id === assetId && item.userId === userId && item.usageType === 'diary-export' && item.status === 'ready');
    if (!asset) throw new NotFoundException('导出文件不存在或无权访问');
    const target = path.resolve(uploadsDirectory, asset.storageKey);
    if (!target.startsWith(`${uploadsDirectory}${path.sep}`) || !fs.existsSync(target)) {
      throw new NotFoundException('导出文件已不存在，请重新导出');
    }
    return { asset, filePath: target, filename: diaryExportFilename(asset.createdAt) };
  }

  async createLetterPoster(letter: Letter): Promise<MediaAsset> {
    const assetId = id('media');
    const storageKey = `poster_${letter.id}_${Date.now()}.svg`;
    const title = escapeSvgText(letter.title || '给现在的你');
    const content = escapeSvgText(letter.content || '愿你今晚被温柔接住。').slice(0, 420);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440"><rect width="1080" height="1440" fill="#fff8eb"/><circle cx="920" cy="150" r="190" fill="#e5f2d3"/><path d="M0 1180 Q240 1030 460 1190 T1080 1160 V1440 H0Z" fill="#d8ead4"/><text x="100" y="210" font-family="sans-serif" font-size="42" fill="#76916f">晚安树洞 · 今日回信</text><text x="100" y="340" font-family="sans-serif" font-weight="700" font-size="66" fill="#4a5a48">${title}</text><foreignObject x="100" y="440" width="880" height="720"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:sans-serif;font-size:38px;line-height:1.75;color:#465244;white-space:pre-wrap;word-break:break-word;">${content}</div></foreignObject><text x="100" y="1300" font-family="sans-serif" font-size="34" fill="#76916f">把此刻轻轻收好</text></svg>`;
    const buffer = Buffer.from(svg, 'utf8');
    fs.writeFileSync(path.join(uploadsDirectory, storageKey), buffer);
    const asset: MediaAsset = {
      id: assetId,
      userId: letter.userId,
      storageKey,
      url: `/uploads/${storageKey}`,
      mimeType: 'image/svg+xml',
      size: buffer.length,
      width: 1080,
      height: 1440,
      usageType: 'letter-poster',
      status: 'ready',
      createdAt: now(),
    };
    this.assets.unshift(asset);
    this.persist();
    await this.flush();
    return asset;
  }

  async createMonthlyReportPoster(userId: string, month: string, summary: string): Promise<MediaAsset> {
    const assetId = id('media');
    const storageKey = `report_${month.replace(/[^0-9-]/g, '')}_${Date.now()}.svg`;
    const safeMonth = escapeSvgText(month);
    const safeSummary = escapeSvgText(summary || '本月的情绪记录正在汇总中。').slice(0, 420);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440"><rect width="1080" height="1440" fill="#f6fbf1"/><circle cx="160" cy="170" r="170" fill="#fff0c9"/><path d="M0 1240 Q220 1080 490 1220 T1080 1190 V1440 H0Z" fill="#dcebd4"/><text x="100" y="250" font-family="sans-serif" font-size="42" fill="#6f8c72">晚安树洞 · 情绪月报</text><text x="100" y="365" font-family="sans-serif" font-weight="700" font-size="70" fill="#3f5541">${safeMonth}</text><foreignObject x="100" y="470" width="880" height="670"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:sans-serif;font-size:40px;line-height:1.75;color:#465244;white-space:pre-wrap;word-break:break-word;">${safeSummary}</div></foreignObject><text x="100" y="1310" font-family="sans-serif" font-size="34" fill="#6f8c72">看见情绪，也看见正在努力的自己</text></svg>`;
    const buffer = Buffer.from(svg, 'utf8');
    fs.writeFileSync(path.join(uploadsDirectory, storageKey), buffer);
    const asset: MediaAsset = { id: assetId, userId, storageKey, url: `/uploads/${storageKey}`, mimeType: 'image/svg+xml', size: buffer.length, width: 1080, height: 1440, usageType: 'monthly-report-poster', status: 'ready', createdAt: now() };
    this.assets.unshift(asset);
    this.persist();
    await this.flush();
    return asset;
  }

  async deleteMediaAsset(assetId: string) {
    const asset = this.assets.find((item) => item.id === assetId && item.userId === this.getDemoUserId() && item.status === 'ready');
    if (!asset) throw new NotFoundException('图片不存在');
    const attached =
      [...this.moods, ...this.posts].some((item: any) => item.attachmentIds?.includes(assetId)) ||
      this.feedbackTickets.some((ticket) => this.storedFeedbackScreenshotIds(ticket.screenshots).includes(assetId));
    if (attached) throw new ForbiddenException('已发布内容的图片不能在草稿删除接口中移除');
    const target = path.join(uploadsDirectory, asset.storageKey);
    if (fs.existsSync(target)) fs.unlinkSync(target);
    asset.status = 'deleted';
    await this.persistAndFlush();
  }

  mediaByIds(assetIds: string[] = []) {
    return assetIds
      .map((assetId) => this.assets.find((asset) => asset.id === assetId && asset.status === 'ready'))
      .filter((asset): asset is MediaAsset => Boolean(asset));
  }

  decoratePost(post: PostItem) {
    const attachmentIds = post.attachmentIds ?? [];
    post.attachments = this.mediaByIds(attachmentIds);
    const ownerPrivacy = this.privacySettings[post.userId];
    const systemAllowsHumanReplies = this.systemSettings.allowHumanRepliesDefault?.value !== false;
    post.allowHumanReplies = post.visibility === 'PUBLIC' && post.reviewStatus === 'published' && ownerPrivacy?.allowHumanReplies !== false && systemAllowsHumanReplies;
    (post as PostItem & { favoritedByCurrentUser?: boolean }).favoritedByCurrentUser = this.favorites.some(
      (item) => item.userId === this.getDemoUserId() && item.targetType === 'post' && item.targetId === post.id,
    );
    return post;
  }

  persist() {
    // The relational mapper performs several awaited writes in one transaction.
    // Snapshot only when this queue entry begins: this avoids both in-transaction
    // mutation and an older queued snapshot overwriting a later user action.
    this.persistQueue = this.persistQueue
      .catch(() => undefined)
      .then(async () => {
        const snapshot = structuredClone(this.data);
        await this.prisma.saveRuntimeState(snapshot);
        this.persistenceError = undefined;
      })
      .catch((error) => {
        this.persistenceError = error instanceof Error ? error.message : String(error);
      });
  }

  async flush() {
    await this.persistQueue;
    if (this.persistenceError) throw new Error(this.persistenceError);
  }

  async persistAndFlush() {
    this.persist();
    await this.flush();
  }

  private loadLegacyStore(): StoreData {
    if (fs.existsSync(dataFile)) {
      return JSON.parse(fs.readFileSync(dataFile, 'utf8')) as StoreData;
    }
    return seedData();
  }

  private migrateAiJobs() {
    let changed = false;
    for (const job of this.data.aiJobs) {
      const legacyStatus = job.status as string;
      if (legacyStatus === 'success') { job.status = 'succeeded'; changed = true; }
      if (legacyStatus === 'fallback_completed') { job.status = 'fallback'; changed = true; }
    }
    if (changed) this.persist();
  }

  private recoverInterruptedAiJobs() {
    let changed = false;
    for (const job of this.data.aiJobs) {
      if (!['queued', 'running'].includes(job.status)) continue;
      job.status = 'failed';
      job.completedAt = now();
      job.errorMessage = [job.errorMessage, '任务在服务重启时未完成，已标记为失败，可在后台重试。'].filter(Boolean).join(' | ');
      job.traceJson = [...(job.traceJson ?? []), { status: 'failed', reason: 'interrupted-by-service-restart' }];
      changed = true;
    }
    if (changed) this.persist();
  }

  private reconcileFavoriteCounts() {
    let changed = false;
    for (const post of this.posts) {
      const expected = this.favorites.filter((item) => item.targetType === 'post' && item.targetId === post.id).length;
      if (post.favoriteCount !== expected) {
        post.favoriteCount = expected;
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  private reconcileLetterFavorites() {
    let changed = false;
    for (const letter of this.letters) {
      const expected = this.isFavorite(letter.userId, 'letter', letter.id);
      if (Boolean(letter.favorite) !== expected) {
        letter.favorite = expected;
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  private applyFavoriteRemoval(favorites: StoreData['favorites']) {
    for (const favorite of favorites) {
      if (favorite.targetType === 'post') {
        const post = this.posts.find((item) => item.id === favorite.targetId);
        if (post) post.favoriteCount = Math.max(0, post.favoriteCount - 1);
      }
      if (favorite.targetType === 'letter') {
        const letter = this.letters.find((item) => item.id === favorite.targetId && item.userId === favorite.userId);
        if (letter) letter.favorite = this.isFavorite(favorite.userId, 'letter', favorite.targetId);
      }
    }
  }

  enforceRemoteAiProviderPolicy() {
    if (visualFixtureMode) return;
    const upsert = (definition: AIProvider) => {
      const current = this.aiProviders.find((item) => item.id === definition.id);
      const next: AIProvider = {
        ...definition,
        todayCalls: current?.todayCalls ?? definition.todayCalls,
        avgLatencyMs: current?.avgLatencyMs ?? definition.avgLatencyMs,
        failureRate: current?.failureRate ?? definition.failureRate,
      };
      if (current) Object.assign(current, next);
      else this.aiProviders.unshift(next);
      return current ?? next;
    };

    const primary = upsert(this.remoteAi.primaryDefinition());
    const secondary = upsert(this.remoteAi.secondaryDefinition());
    for (const provider of this.aiProviders) {
      const managedRemote = provider.id === primary.id || provider.id === secondary.id;
      const template = provider.providerKind === 'template' || provider.type === 'template';
      if (!managedRemote && !template) {
        provider.enabled = false;
        provider.failoverEnabled = false;
        provider.usageTags = [...new Set([...provider.usageTags, 'disabled-by-policy'])];
      }
      if (provider.type === 'local' || provider.providerKind === 'ollama') provider.apiKeyStatus = 'missing';
    }
    const fallback = this.ensureSafeBackupTemplateProvider();
    for (const route of this.aiRoutes) {
      const changed = route.primaryProviderId !== primary.id || route.backupProviderId !== secondary.id || !route.fallbackTemplateId;
      route.primaryProviderId = primary.id;
      route.backupProviderId = secondary.id;
      route.fallbackTemplateId = fallback.id;
      route.promptVersion = `dapi-${route.style}-v1`;
      route.timeoutSeconds = Math.max(30, Number(route.timeoutSeconds ?? 30));
      if (changed) route.routeVersion = Math.max(1, Number(route.routeVersion ?? 0)) + 1;
    }
    this.persist();
  }

  async syncOllamaModels(assignRoutes = true) {
    void assignRoutes;
    this.ollamaLastCheckedAt = now();
    this.ollamaOnline = false;
    this.ollamaLastError = '本地模型已被 DAPI-only 运行策略禁用。';
    this.enforceRemoteAiProviderPolicy();
    await this.flush();
    return { online: false, disabled: true, baseUrl: 'disabled://local-model', models: [], providers: [], error: this.ollamaLastError };
  }

  ollamaStatus() {
    return {
      baseUrl: 'disabled://local-model',
      online: false,
      disabled: true,
      modelCount: 0,
      lastCheckedAt: this.ollamaLastCheckedAt,
      error: this.ollamaLastError,
      models: this.aiProviders.filter((provider) => provider.providerKind === 'ollama').map((provider) => ({
        providerId: provider.id,
        name: provider.modelName,
        enabled: provider.enabled,
        ...provider.modelMeta,
      })),
    };
  }

  private isTextOllamaProvider(provider?: AIProvider) {
    if (!provider || provider.providerKind !== 'ollama' || provider.type !== 'local') return false;
    const capabilities = provider.modelMeta?.capabilities ?? [];
    return provider.usageTags.includes('text') || (capabilities.includes('completion') && !capabilities.includes('vision'));
  }

  private isUserFacingTextOllamaProvider(provider?: AIProvider) {
    return this.isTextOllamaProvider(provider) && !this.requiresReasoningOutputExtraction(provider!);
  }

  private ensureSafeBackupTemplateProvider() {
    const existing = this.aiProviders.find((provider) => provider.id === 'provider_safe_template');
    if (existing) return existing;
    const provider: AIProvider = {
      id: 'provider_safe_template',
      name: '安全文案备用',
      type: 'template',
      providerKind: 'template',
      baseUrl: 'local://safe-response-template',
      modelName: 'safe-response-template',
      apiKeyStatus: 'configured',
      enabled: true,
      priority: 98,
      dailyLimit: 99_999,
      timeoutSeconds: 1,
      failoverEnabled: false,
      usageTags: ['backup', 'template', 'safe'],
      failureRate: 0,
      avgLatencyMs: 1,
      todayCalls: 0,
    };
    this.aiProviders.push(provider);
    return provider;
  }

  private isMissingOrCorruptedRouteCopy(value?: string) {
    return !value?.trim() || /\?{2,}/.test(value);
  }

  private appendAiTrace(job: AIJob, entry: Record<string, unknown>) {
    const event = { at: now(), ...entry };
    job.traceJson = [...(Array.isArray(job.traceJson) ? job.traceJson : []), event];
    return event;
  }

  async testAiProvider(providerId: string) {
    const provider = this.aiProviders.find((item) => item.id === providerId);
    if (!provider) throw new NotFoundException('AI Provider 不存在');
    if (!provider.enabled) return { ok: false, providerId, modelName: provider.modelName, durationMs: 0, result: 'Provider 已停用' };
    if (provider.type === 'local' || provider.providerKind === 'ollama') {
      return { ok: false, providerId, modelName: provider.modelName, durationMs: 0, result: '本地模型已被 DAPI-only 运行策略禁用。' };
    }
    if (provider.providerKind !== 'openai-compatible') {
      return { ok: false, providerId, modelName: provider.modelName, durationMs: 0, result: '当前 Provider 不在远程 AI 执行策略中。' };
    }
    try {
      const response = await this.remoteAi.generate(provider, { prompt: '请只回复：连接正常', timeoutMs: Math.max(provider.timeoutSeconds, 30) * 1000, maxTokens: 20 });
      provider.modelName = response.model;
      provider.todayCalls += 1;
      provider.avgLatencyMs = provider.avgLatencyMs ? Math.round((provider.avgLatencyMs + response.durationMs) / 2) : response.durationMs;
      this.persist();
      await this.flush();
      return { ok: true, providerId, modelName: response.model, durationMs: response.durationMs, result: response.result };
    } catch (error) {
      return { ok: false, providerId, modelName: provider.modelName, durationMs: 0, result: sanitizeProviderError(error) };
    }
  }

  getDemoUserId() {
    return 'user_demo';
  }

  /**
   * The project still uses its existing anonymous runtime identity adapter.
   * Integration tests may select another persisted anonymous user explicitly;
   * unknown identifiers are never created as a side effect of a request.
   */
  resolveRuntimeUserId(requestedUserId?: string) {
    const userId = requestedUserId?.trim() || this.getDemoUserId();
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(userId) || !this.users.some((item) => item.id === userId)) {
      throw new NotFoundException('当前匿名会话用户不存在');
    }
    return userId;
  }

  login(username: string, password: string) {
    const admin = this.adminUsers.find((item) => item.username === username && item.passwordHash === `plain:${password}`);
    if (!admin) throw new UnauthorizedException('账号或密码不正确');
    admin.lastLoginAt = now();
    const token = Buffer.from(`${admin.id}:${admin.role}:goodnight`).toString('base64url');
    this.audit(admin.id, 'LOGIN', 'AdminUser', admin.id, null, { lastLoginAt: admin.lastLoginAt });
    this.persist();
    return { token, admin: { id: admin.id, username: admin.username, displayName: admin.displayName, role: admin.role } };
  }

  verifyToken(token?: string) {
    if (!token) throw new UnauthorizedException('缺少登录凭证');
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [adminId] = decoded.split(':');
    const admin = this.adminUsers.find((item) => item.id === adminId);
    if (!admin) throw new UnauthorizedException('登录已失效');
    return admin;
  }

  audit(adminUserId: string, action: string, resourceType: string, resourceId: string, beforeJson: unknown, afterJson: unknown) {
    const snapshot = <T>(value: T): T => value == null ? value : JSON.parse(JSON.stringify(value)) as T;
    this.auditLogs.unshift({ id: id('audit'), adminUserId, action, resourceType, resourceId, beforeJson: snapshot(beforeJson), afterJson: snapshot(afterJson), ip: '127.0.0.1', userAgent: 'local-dev', createdAt: now() });
  }

  private ensureSeedCoverage() {
    const seeds = [
      { key: 'jiaolv', emotion: '焦虑', userId: 'user_demo', content: '明天要汇报，我又开始担心自己讲不好。', hugCount: 18 },
      { key: 'weiqu', emotion: '委屈', userId: 'user_demo', content: '今天被一句话刺了一下，心里有点委屈，但我想慢慢说出来。', hugCount: 22 },
      { key: 'shimian', emotion: '失眠', userId: 'user_guest', content: '凌晨两点还是睡不着，脑子一直在转。', hugCount: 31 },
      { key: 'lianai', emotion: '恋爱', userId: 'user_guest', content: '很想念一个人，又担心自己的在意太多了。', hugCount: 16 },
      { key: 'work', emotion: '工作', userId: 'user_demo', content: '工作消息一直弹出来，我有点喘不过气，想先把节奏找回来。', hugCount: 27 },
    ];
    let changed = false;
    for (const seed of seeds) {
      const hasPublishedSeed = this.data.posts.some(
        (post) => post.status === 'active' && post.reviewStatus === 'published' && post.emotion === seed.emotion,
      );
      if (hasPublishedSeed) continue;
      const moodId = `mood_seed_${seed.key}`;
      const postId = `post_seed_${seed.key}`;
      this.data.moods.unshift({
        id: moodId,
        userId: seed.userId,
        emotion: seed.emotion as Emotion,
        content: seed.content,
        visibility: 'PUBLIC',
        riskLevel: 'low',
        riskScore: 0.08,
        status: 'active',
        createdAt: now(),
      });
      this.data.posts.unshift({
        id: postId,
        moodId,
        userId: seed.userId,
        emotion: seed.emotion as Emotion,
        content: seed.content,
        visibility: 'PUBLIC',
        status: 'active',
        reviewStatus: 'published',
        hugCount: seed.hugCount,
        replyCount: 1,
        favoriteCount: 0,
        reportCount: 0,
        createdAt: now(),
      });
      this.data.replies.unshift({
        id: `reply_seed_${seed.key}`,
        postId,
        type: 'AI',
        style: 'warm',
        content: this.composeDynamicText({
          taskType: 'post_reply',
          content: seed.content,
          mood: seed.emotion,
          style: 'warm',
          routeLabel: '暖心陪伴',
        }).result,
        status: 'published',
        riskLevel: 'low',
        createdAt: now(),
      });
      changed = true;
    }
    if (changed) this.persist();
  }

  private ensureGoodnightTwoCoverage() {
    const arrayKeys = ['lifeJourneys', 'situationSnapshots', 'journeyUpdates', 'actionCommitments', 'outcomeCheckins', 'peerExperiences', 'peerMatches', 'peerReputations', 'decisionRecords', 'cooldownItems', 'realityHandoffs', 'trustedContacts', 'messagesToFutureSelf', 'personalSupportPlans', 'memoryItems', 'recoverySnapshots', 'safetyEvents', 'agentDecisionLogs', 'followUpJobs'] as const;
    let changed = false;
    for (const key of arrayKeys) {
      if (!Array.isArray((this.data as any)[key])) { (this.data as any)[key] = []; changed = true; }
    }
    for (const userId of Object.keys(this.data.privacySettings)) {
      const privacy = this.data.privacySettings[userId] as PrivacySetting & Record<string, unknown>;
      for (const key of ['allowPeerMatching', 'allowAnonymousExperienceStats', 'allowRecoveryData', 'allowJourneyLongTermAnalysis', 'allowLongTermMemory']) {
        if (privacy[key] === undefined) { privacy[key] = false; changed = true; }
      }
    }
    const envFlag = (name: string, fallback: boolean) => process.env[name] == null ? fallback : ['1', 'true', 'yes', 'on'].includes(String(process.env[name]).toLowerCase());
    const flags = {
      journeyModeEnabled: envFlag('ENABLE_JOURNEY_V2', true),
      peerExperienceNetworkEnabled: envFlag('ENABLE_PEER_MATCHING', true),
      actionLoopEnabled: envFlag('ENABLE_REALITY_ACTION', true),
      followUpEnabled: envFlag('ENABLE_FOLLOW_UP', true),
      boundedMemoryEnabled: envFlag('ENABLE_LONG_TERM_MEMORY', true),
      safetyEngineEnabled: envFlag('ENABLE_SAFETY_ENGINE', true),
      cooldownBoxEnabled: envFlag('ENABLE_COOLDOWN_BOX', true),
      decisionVaultEnabled: envFlag('ENABLE_DECISION_VAULT', true),
      dapiOnlyAiEnabled: true,
    };
    const current = this.data.systemSettings.goodnightTwoFeatureFlags?.value;
    if (JSON.stringify(current) !== JSON.stringify(flags)) {
      this.data.systemSettings.goodnightTwoFeatureFlags = { value: flags, description: 'GoodnightTreeHole 2.0 功能开关', updatedBy: 'system', updatedAt: now() };
      changed = true;
    }
    if (changed) this.persist();
  }

  private assertCanWrite(userId = this.getDemoUserId()) {
    const user = this.users.find((item) => item.id === userId);
    if (user?.status === 'limited' || user?.status === 'banned') {
      throw new ForbiddenException('当前账号已被禁言或限制发布，请联系管理员');
    }
  }

  private requireJourney(journeyId: string, userId = this.getDemoUserId()) {
    const journey = this.lifeJourneys.find((item) => item.id === journeyId && item.userId === userId);
    if (!journey) throw new NotFoundException('旅程不存在或无权访问');
    return journey;
  }

  private text(value: unknown, label: string, max = 500) {
    const result = typeof value === 'string' ? value.trim() : '';
    if (!result) throw new BadRequestException(`${label}不能为空`);
    if (result.length > max) throw new BadRequestException(`${label}不能超过 ${max} 字`);
    return result;
  }

  private optionalDate(value: unknown, label: string) {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${label}日期不合法`);
    return parsed.toISOString();
  }

  private privacyAllows(userId: string, key: keyof PrivacySetting, message: string) {
    if (this.privacySettings[userId]?.[key] !== true) throw new ForbiddenException(message);
  }

  tonightHome(userId = this.getDemoUserId()) {
    const journey = this.lifeJourneys.find((item) => item.userId === userId && item.status === 'active');
    const activeActions = this.actionCommitments.filter((item) => item.userId === userId && item.status === 'active').slice(0, 3);
    const dueCheckins = this.outcomeCheckins.filter((item) => item.userId === userId && item.status === 'pending' && (!item.dueAt || Date.parse(item.dueAt) <= Date.now())).slice(0, 3);
    const followUps = this.followUpJobs.filter((item) => item.userId === userId && item.status === 'pending' && Date.parse(item.dueAt) <= Date.now()).slice(0, 3);
    const matches = this.peerMatches.filter((item) => item.userId === userId && !['declined', 'blocked'].includes(item.status)).slice(0, 3);
    const latestLetter = this.letters.find((item) => item.userId === userId && item.content);
    return { journey: journey ?? null, activeActions, dueCheckins, followUps, matches, latestLetter: latestLetter ? this.decorateLetter(latestLetter) : null, counts: { activeActions: activeActions.length, dueCheckins: dueCheckins.length, followUps: followUps.length, matches: matches.length } };
  }

  async createJourney(input: { title?: unknown; domain?: unknown; content?: unknown; facts?: unknown; feelings?: unknown; needs?: unknown; constraints?: unknown; visibility?: Visibility; intensity?: number; scenario?: unknown; relationScene?: unknown }, requestedUserId?: string) {
    const userId = this.resolveRuntimeUserId(requestedUserId);
    this.assertCanWrite(userId);
    const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim().slice(0, 80) : '正在整理的一件事';
    const domain = this.text(input.domain ?? '其他', '困境领域', 40);
    const content = this.text(input.content, '事情描述', 1000);
    const risk = this.detectRisk(content);
    const createdAt = now();
    const intensity = input.intensity == null ? undefined : Math.max(0, Math.min(10, Number(input.intensity)));
    const journey: LifeJourneyRecord = { id: id('journey'), userId, title, domain, status: 'active', stage: risk.level === 'high' ? 'safety_first' : 'clarifying', visibility: input.visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE', intensity, initialIntensity: intensity, summary: '', createdAt, updatedAt: createdAt };
    const toArray = (value: unknown) => Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8) : [];
    const snapshot: SituationSnapshotRecord = { id: id('snapshot'), journeyId: journey.id, facts: toArray(input.facts).length ? toArray(input.facts) : [content], feelings: toArray(input.feelings), needs: toArray(input.needs), constraints: toArray(input.constraints), risks: risk.level === 'high' ? ['检测到需要优先确认现实安全的表达'] : [], domain, contextTags: [String(input.scenario ?? '').trim(), String(input.relationScene ?? '').trim()].filter(Boolean), confidence: 'agent_draft', createdAt, updatedAt: createdAt };
    this.lifeJourneys.unshift(journey);
    this.situationSnapshots.unshift(snapshot);
    this.journeyUpdates.unshift({ id: id('journey_update'), journeyId: journey.id, userId, kind: 'created', content, createdAt });
    if (risk.level === 'high') this.safetyEvents.unshift({ id: id('safety'), userId, journeyId: journey.id, level: 'high', source: 'journey_create', action: 'real_world_support_prompt', payload: { escalation: true }, createdAt });
    const job = this.queueAI({ taskType: 'situation_analysis', userId, sourceId: journey.id, content, mood: this.inferMood(content), style: 'rational' });
    void this.waitForAiJob(job.id).then(async (completed) => {
      const target = this.lifeJourneys.find((item) => item.id === journey.id);
      const current = this.situationSnapshots.find((item) => item.journeyId === journey.id);
      if (!target || !current || !['succeeded', 'fallback'].includes(completed.status)) return;
      const structured = completed.structuredResult ?? {};
      // A user confirmation is authoritative. The asynchronous AI completion
      // may still be audited, but it must never overwrite confirmed facts or
      // downgrade the snapshot back to an agent draft.
      if (current.confidence !== 'user_confirmed') {
        if (Array.isArray(structured.facts)) current.facts = structured.facts.map(String).filter(Boolean).slice(0, 8);
        if (Array.isArray(structured.feelings)) current.feelings = structured.feelings.map(String).filter(Boolean).slice(0, 8);
        if (Array.isArray(structured.needs)) current.needs = structured.needs.map(String).filter(Boolean).slice(0, 8);
        if (Array.isArray(structured.constraints)) current.constraints = structured.constraints.map(String).filter(Boolean).slice(0, 8);
        if (Array.isArray(structured.risks)) current.risks = structured.risks.map(String).filter(Boolean).slice(0, 8);
        current.domain = typeof structured.domain === 'string' ? structured.domain : current.domain;
        current.subDomain = typeof structured.subDomain === 'string' ? structured.subDomain : undefined;
        current.eventType = typeof structured.eventType === 'string' ? structured.eventType : undefined;
        current.stage = typeof structured.stage === 'string' ? structured.stage : 'clarifying';
        current.contextTags = Array.isArray(structured.contextTags) ? structured.contextTags.map(String).filter(Boolean).slice(0, 12) : current.contextTags;
        current.peopleContext = Array.isArray(structured.peopleContext) ? structured.peopleContext.map(String).filter(Boolean).slice(0, 8) : [];
        current.decisionContext = Array.isArray(structured.decisionContext) ? structured.decisionContext.map(String).filter(Boolean).slice(0, 8) : [];
        current.behaviorSignals = Array.isArray(structured.behaviorSignals) ? structured.behaviorSignals.map(String).filter(Boolean).slice(0, 8) : [];
        current.recoverySignals = Array.isArray(structured.recoverySignals) ? structured.recoverySignals.map(String).filter(Boolean).slice(0, 8) : [];
        current.intensity = Number.isFinite(Number(structured.intensity)) ? Math.max(0, Math.min(10, Number(structured.intensity))) : current.intensity;
        current.urgency = Number.isFinite(Number(structured.urgency)) ? Math.max(0, Math.min(10, Number(structured.urgency))) : current.urgency;
        current.fingerprintJson = { domain: current.domain, subDomain: current.subDomain, eventType: current.eventType, stage: current.stage, contextTags: current.contextTags, peopleContext: current.peopleContext, decisionContext: current.decisionContext, behaviorSignals: current.behaviorSignals, recoverySignals: current.recoverySignals };
        current.confidence = 'agent_draft';
        current.updatedAt = now();
        target.summary = String(structured.summary ?? completed.result).slice(0, 500);
        if (typeof structured.title === 'string' && structured.title.trim()) target.title = structured.title.trim().slice(0, 80);
        target.updatedAt = now();
      }
      this.agentDecisionLogs.unshift({ id: id('agent_decision'), userId, journeyId: journey.id, aiJobId: completed.id, taskType: 'situation_analysis', decision: structured, createdAt: now() });
      await this.persistAndFlush();
    }).catch(() => undefined);
    await this.persistAndFlush();
    return { journey, snapshot, job, safety: risk.level === 'high' ? { level: 'high', needsRealWorldSupport: true } : { level: risk.level, needsRealWorldSupport: false } };
  }

  async cleanupBrowserFixtures(input: { journeyIds?: unknown; notificationIds?: unknown; decisionIds?: unknown; cooldownIds?: unknown; legacy?: unknown }) {
    if (process.env.NODE_ENV === 'production') throw new ForbiddenException('生产环境不提供测试数据清理。');

    const demoUserId = this.getDemoUserId();
    const explicitJourneyIds = new Set(Array.isArray(input.journeyIds) ? input.journeyIds.map(String).filter(Boolean) : []);
    const explicitNotificationIds = new Set(Array.isArray(input.notificationIds) ? input.notificationIds.map(String).filter(Boolean) : []);
    const explicitDecisionIds = new Set(Array.isArray(input.decisionIds) ? input.decisionIds.map(String).filter(Boolean) : []);
    const explicitCooldownIds = new Set(Array.isArray(input.cooldownIds) ? input.cooldownIds.map(String).filter(Boolean) : []);
    const fixtureText = /(?:第一批浏览器回归|第二段浏览器回归|浏览器回归记录|浏览器回归行动|通知验证行动|浏览器决策|浏览器冷静箱|可信任的人-\d+|direct-check|我想先留住这个决定，明天再回答|今晚先不发送这句话)/i;
    const legacy = input.legacy === true;

    if (legacy) {
      for (const update of this.journeyUpdates) {
        if (update.userId === demoUserId && fixtureText.test(update.content)) explicitJourneyIds.add(update.journeyId);
      }
      for (const journey of this.lifeJourneys) {
        if (journey.userId === demoUserId && fixtureText.test(`${journey.title}\n${journey.summary ?? ''}`)) explicitJourneyIds.add(journey.id);
      }
    }

    const ownedJourneys = this.lifeJourneys.filter((journey) => explicitJourneyIds.has(journey.id));
    if (ownedJourneys.some((journey) => journey.userId !== demoUserId)) throw new ForbiddenException('测试清理只能处理当前演示用户创建的 Journey。');
    const journeyIds = new Set(ownedJourneys.map((journey) => journey.id));
    const actionIds = new Set(this.actionCommitments
      .filter((action) => journeyIds.has(action.journeyId) || (legacy && action.userId === demoUserId && fixtureText.test(action.title)))
      .map((action) => action.id));
    const actionJourneyIds = new Set(this.actionCommitments.filter((action) => actionIds.has(action.id)).map((action) => action.journeyId));
    for (const journeyId of actionJourneyIds) journeyIds.add(journeyId);

    const before = {
      journeys: this.lifeJourneys.length,
      actions: this.actionCommitments.length,
      notifications: this.notifications.length,
      jobs: this.aiJobs.length,
      handoffs: this.realityHandoffs.length,
      decisions: this.decisionRecords.length,
      cooldowns: this.cooldownItems.length,
    };
    const hasJourney = (journeyId?: string) => Boolean(journeyId && journeyIds.has(journeyId));
    const hasAction = (actionId?: string) => Boolean(actionId && actionIds.has(actionId));
    const notificationMatches = (item: UserNotification) => explicitNotificationIds.has(item.id)
      || [...journeyIds].some((journeyId) => item.targetRoute?.includes(journeyId));

    this.data.lifeJourneys = this.data.lifeJourneys.filter((item) => !journeyIds.has(item.id));
    this.data.situationSnapshots = this.data.situationSnapshots.filter((item) => !journeyIds.has(item.journeyId));
    this.data.journeyUpdates = this.data.journeyUpdates.filter((item) => !journeyIds.has(item.journeyId));
    this.data.actionCommitments = this.data.actionCommitments.filter((item) => !actionIds.has(item.id));
    this.data.outcomeCheckins = this.data.outcomeCheckins.filter((item) => !hasJourney(item.journeyId) && !hasAction(item.commitmentId));
    this.data.peerExperiences = this.data.peerExperiences.filter((item) => !hasJourney(item.journeyId));
    this.data.peerMatches = this.data.peerMatches.filter((item) => !hasJourney(item.journeyId));
    this.data.decisionRecords = this.data.decisionRecords.filter((item) => !explicitDecisionIds.has(item.id) && !hasJourney(item.journeyId) && !(legacy && item.userId === demoUserId && fixtureText.test(item.question)));
    this.data.cooldownItems = this.data.cooldownItems.filter((item) => !explicitCooldownIds.has(item.id) && !(legacy && item.userId === demoUserId && fixtureText.test(`${item.title}\n${item.reason ?? ''}`)));
    this.data.realityHandoffs = this.data.realityHandoffs.filter((item) => !hasJourney(item.journeyId) && !(legacy && item.userId === demoUserId && fixtureText.test(`${item.recipient}\n${item.summary}`)));
    this.data.messagesToFutureSelf = this.data.messagesToFutureSelf.filter((item) => !hasJourney(item.journeyId));
    this.data.personalSupportPlans = this.data.personalSupportPlans.filter((item) => !hasJourney(item.journeyId));
    this.data.memoryItems = this.data.memoryItems.filter((item) => !hasJourney(item.journeyId));
    this.data.recoverySnapshots = this.data.recoverySnapshots.filter((item) => !hasJourney(item.journeyId));
    this.data.safetyEvents = this.data.safetyEvents.filter((item) => !hasJourney(item.journeyId));
    this.data.agentDecisionLogs = this.data.agentDecisionLogs.filter((item) => !hasJourney(item.journeyId));
    this.data.followUpJobs = this.data.followUpJobs.filter((item) => !hasJourney(item.journeyId) && !hasAction(String(item.payload?.actionId ?? '')) && !explicitCooldownIds.has(String(item.payload?.cooldownId ?? '')));
    this.data.notifications = this.data.notifications.filter((item) => !notificationMatches(item));
    this.data.aiJobs = this.data.aiJobs.filter((item) => !journeyIds.has(item.contentId) && !actionIds.has(item.contentId) && !(legacy && item.userId === demoUserId && fixtureText.test(`${item.contentId}\n${item.promptSummary}`)));

    await this.persistAndFlush();
    return {
      journeys: before.journeys - this.lifeJourneys.length,
      actions: before.actions - this.actionCommitments.length,
      notifications: before.notifications - this.notifications.length,
      jobs: before.jobs - this.aiJobs.length,
      handoffs: before.handoffs - this.realityHandoffs.length,
      decisions: before.decisions - this.decisionRecords.length,
      cooldowns: before.cooldowns - this.cooldownItems.length,
    };
  }

  fingerprint(journeyId: string) {
    const journey = this.requireJourney(journeyId);
    const snapshot = this.situationSnapshots.find((item) => item.journeyId === journey.id);
    if (!snapshot) throw new NotFoundException('经历指纹不存在');
    return { journey, snapshot };
  }

  async setJourneyIntent(journeyId: string, intent: SupportIntent) {
    const journey = this.requireJourney(journeyId);
    const validIntents: SupportIntent[] = ['JUST_LISTEN', 'FIND_PEOPLE', 'SEE_OUTCOMES', 'NEXT_STEP', 'STOP_IMPULSE', 'PREPARE_CONVERSATION', 'NOTHING_NOW', 'HIGH_DISTRESS'];
    if (!validIntents.includes(intent)) throw new BadRequestException('暂时无法识别这个需要');
    const requiresSafetyFirst = intent === 'HIGH_DISTRESS' || (journey.stage === 'safety_first' && this.safetyEvents.some((item) => item.journeyId === journey.id && ['high', 'critical'].includes(item.level)));
    if (requiresSafetyFirst) {
      journey.stage = 'safety_first';
      journey.currentIntent = 'HIGH_DISTRESS';
      journey.intentUpdatedAt = now();
      this.safetyEvents.unshift({ id: id('safety'), userId: journey.userId, journeyId: journey.id, level: 'high', source: 'support_intent', action: 'real_world_support_prompt', payload: { intent }, createdAt: now() });
    } else {
      journey.currentIntent = intent;
      journey.intentUpdatedAt = now();
      journey.stage = intent === 'NEXT_STEP' ? 'planning' : intent === 'FIND_PEOPLE' || intent === 'SEE_OUTCOMES' ? 'matching' : intent === 'STOP_IMPULSE' ? 'cooldown' : 'clarifying';
    }
    journey.updatedAt = now();
    await this.persistAndFlush();
    return { journey, intent, route: this.intentRoute(intent, journey.stage === 'safety_first') };
  }

  private intentRoute(intent: SupportIntent, safetyFirst = false) {
    if (safetyFirst || intent === 'HIGH_DISTRESS') return { key: 'safety', targetRoute: '/pages/safety/index', message: '先把现实里的支持接上，不急着解决全部问题。' };
    const routes: Record<SupportIntent, { key: string; targetRoute: string; message: string }> = {
      JUST_LISTEN: { key: 'listen', targetRoute: '/pages/journey/detail', message: '先听你把这件事说完，不急着给行动。' },
      FIND_PEOPLE: { key: 'peers', targetRoute: '/pages/peers/index', message: '去看看真正经历过相似阶段的人。' },
      SEE_OUTCOMES: { key: 'outcomes', targetRoute: '/pages/peers/index?view=outcomes', message: '先看看相似经历后来发生了什么。' },
      NEXT_STEP: { key: 'action', targetRoute: '/pages/action/index', message: '把下一步缩到今晚做得完的一件事。' },
      STOP_IMPULSE: { key: 'cooldown', targetRoute: '/pages/action/index?section=vault', message: '先把冲动放进决定保险箱。' },
      PREPARE_CONVERSATION: { key: 'handoff', targetRoute: '/pages/action/index?section=handoff', message: '先整理想对现实中的人说的话。' },
      NOTHING_NOW: { key: 'pause', targetRoute: '/pages/tonight/index', message: '今天不解决，也是一种照顾。' },
      HIGH_DISTRESS: { key: 'safety', targetRoute: '/pages/safety/index', message: '先连接现实支持。' },
    };
    return routes[intent];
  }

  journeyDetail(journeyId: string, userId = this.getDemoUserId()) {
    const journey = this.requireJourney(journeyId, userId);
    return { journey, snapshot: this.situationSnapshots.find((item) => item.journeyId === journeyId) ?? null, updates: this.journeyUpdates.filter((item) => item.journeyId === journeyId), commitments: this.actionCommitments.filter((item) => item.journeyId === journeyId), checkins: this.outcomeCheckins.filter((item) => item.journeyId === journeyId), recovery: this.recoverySnapshots.filter((item) => item.journeyId === journeyId), peerMatches: this.peerMatches.filter((item) => item.journeyId === journeyId) };
  }

  journeyActions(journeyId: string) {
    const journey = this.requireJourney(journeyId);
    return this.actionCommitments.filter((item) => item.journeyId === journey.id);
  }

  journeyTimeline(journeyId: string) {
    const journey = this.requireJourney(journeyId);
    return this.journeyUpdates.filter((item) => item.journeyId === journey.id);
  }

  journeyPeers(journeyId: string, requestedUserId?: string) {
    const journey = this.requireJourney(journeyId, this.resolveRuntimeUserId(requestedUserId));
    this.privacyAllows(journey.userId, 'allowPeerMatching', '请先在隐私设置中打开同路经历网络');
    return this.peerMatches
      .filter((item) => item.journeyId === journey.id)
      .map((item) => this.peerMatchForUser(item))
      .filter((item) => item.experience);
  }

  async confirmSituation(journeyId: string, input: { facts?: unknown; feelings?: unknown; needs?: unknown; constraints?: unknown; risks?: unknown; domain?: unknown; subDomain?: unknown; eventType?: unknown; stage?: unknown; contextTags?: unknown; peopleContext?: unknown; decisionContext?: unknown; behaviorSignals?: unknown; recoverySignals?: unknown; intensity?: unknown; urgency?: unknown }) {
    const journey = this.requireJourney(journeyId);
    const item = this.situationSnapshots.find((snapshot) => snapshot.journeyId === journeyId);
    if (!item) throw new NotFoundException('情境快照不存在');
    const previousIntensity = item.intensity;
    const submittedIntensity = Number.isFinite(Number(input.intensity)) ? Math.max(0, Math.min(10, Number(input.intensity))) : undefined;
    const shouldRecordIntensity = submittedIntensity !== undefined && (journey.initialIntensity === undefined || previousIntensity !== submittedIntensity);
    const array = (value: unknown, fallback: string[]) => Array.isArray(value) ? value.map(String).map((part) => part.trim()).filter(Boolean).slice(0, 8) : fallback;
    item.facts = array(input.facts, item.facts); item.feelings = array(input.feelings, item.feelings); item.needs = array(input.needs, item.needs); item.constraints = array(input.constraints, item.constraints); item.risks = array(input.risks, item.risks); item.domain = typeof input.domain === 'string' && input.domain.trim() ? input.domain.trim().slice(0, 40) : item.domain; item.subDomain = typeof input.subDomain === 'string' ? input.subDomain.trim().slice(0, 80) : item.subDomain; item.eventType = typeof input.eventType === 'string' ? input.eventType.trim().slice(0, 80) : item.eventType; item.stage = typeof input.stage === 'string' ? input.stage.trim().slice(0, 60) : item.stage; item.contextTags = Array.isArray(input.contextTags) ? input.contextTags.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 12) : item.contextTags; item.peopleContext = Array.isArray(input.peopleContext) ? input.peopleContext.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 8) : item.peopleContext; item.decisionContext = Array.isArray(input.decisionContext) ? input.decisionContext.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 8) : item.decisionContext; item.behaviorSignals = Array.isArray(input.behaviorSignals) ? input.behaviorSignals.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 8) : item.behaviorSignals; item.recoverySignals = Array.isArray(input.recoverySignals) ? input.recoverySignals.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 8) : item.recoverySignals; item.intensity = submittedIntensity ?? item.intensity; item.urgency = Number.isFinite(Number(input.urgency)) ? Math.max(0, Math.min(10, Number(input.urgency))) : item.urgency; item.fingerprintJson = { domain: item.domain, subDomain: item.subDomain, eventType: item.eventType, stage: item.stage, contextTags: item.contextTags, peopleContext: item.peopleContext, decisionContext: item.decisionContext, behaviorSignals: item.behaviorSignals, recoverySignals: item.recoverySignals }; item.confidence = 'user_confirmed'; item.updatedAt = now();
    if (item.intensity !== undefined) { journey.intensity = item.intensity; journey.initialIntensity ??= item.intensity; }
    if (shouldRecordIntensity && submittedIntensity !== undefined) {
      const thought = item.behaviorSignals?.find((signal) => signal.startsWith('脑子里最吵的一句：'));
      this.journeyUpdates.unshift({ id: id('journey_update'), journeyId, userId: journey.userId, kind: 'intensity', content: `今晚的主观难受程度：${submittedIntensity}/10${thought ? `。${thought.replace('脑子里最吵的一句：', '')}` : ''}`, intensity: submittedIntensity, createdAt: now() });
    }
    journey.updatedAt = now();
    await this.persistAndFlush();
    return { item };
  }

  async reanalyzeSituation(journeyId: string) {
    const journey = this.requireJourney(journeyId);
    const snapshot = this.situationSnapshots.find((item) => item.journeyId === journeyId);
    if (!snapshot) throw new NotFoundException('经历指纹不存在');
    const source = [snapshot.facts.join('；'), snapshot.feelings.join('；'), snapshot.constraints.join('；')].filter(Boolean).join('\n') || journey.title;
    snapshot.confidence = 'agent_draft';
    snapshot.updatedAt = now();
    this.journeyUpdates.unshift({ id: id('journey_update'), journeyId, userId: journey.userId, kind: 'fingerprint_reanalysis_requested', content: '我请求系统根据原话重新整理了这段经历。', createdAt: now() });
    const job = this.queueAI({ taskType: 'situation_analysis', userId: journey.userId, sourceId: journeyId, content: source, mood: this.inferMood(source), style: 'rational' });
    void this.waitForAiJob(job.id).then(async (completed) => {
      if (!['succeeded', 'fallback'].includes(completed.status)) return;
      const current = this.situationSnapshots.find((item) => item.journeyId === journeyId);
      if (!current || current.confidence === 'user_confirmed') return;
      const structured = completed.structuredResult ?? {};
      const list = (value: unknown, fallback: string[], max = 8) => Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, max) : fallback;
      current.facts = list(structured.facts, current.facts); current.feelings = list(structured.feelings, current.feelings); current.needs = list(structured.needs, current.needs); current.constraints = list(structured.constraints, current.constraints); current.risks = list(structured.risks, current.risks); current.domain = typeof structured.domain === 'string' ? structured.domain : current.domain; current.subDomain = typeof structured.subDomain === 'string' ? structured.subDomain : current.subDomain; current.eventType = typeof structured.eventType === 'string' ? structured.eventType : current.eventType; current.stage = typeof structured.stage === 'string' ? structured.stage : current.stage; current.contextTags = list(structured.contextTags, current.contextTags ?? [], 12); current.peopleContext = list(structured.peopleContext, current.peopleContext ?? []); current.decisionContext = list(structured.decisionContext, current.decisionContext ?? []); current.behaviorSignals = list(structured.behaviorSignals, current.behaviorSignals ?? []); current.recoverySignals = list(structured.recoverySignals, current.recoverySignals ?? []); current.intensity = Number.isFinite(Number(structured.intensity)) ? Math.max(0, Math.min(10, Number(structured.intensity))) : current.intensity; current.urgency = Number.isFinite(Number(structured.urgency)) ? Math.max(0, Math.min(10, Number(structured.urgency))) : current.urgency; current.fingerprintJson = { domain: current.domain, subDomain: current.subDomain, eventType: current.eventType, stage: current.stage, contextTags: current.contextTags, peopleContext: current.peopleContext, decisionContext: current.decisionContext, behaviorSignals: current.behaviorSignals, recoverySignals: current.recoverySignals }; current.updatedAt = now();
      journey.summary = String(structured.summary ?? completed.result).slice(0, 500); if (typeof structured.title === 'string' && structured.title.trim()) journey.title = structured.title.trim().slice(0, 80); if (current.intensity !== undefined) journey.intensity = current.intensity; journey.updatedAt = now(); this.agentDecisionLogs.unshift({ id: id('agent_decision'), userId: journey.userId, journeyId, aiJobId: completed.id, taskType: 'situation_analysis', decision: structured, createdAt: now() }); await this.persistAndFlush();
    }).catch(() => undefined);
    await this.persistAndFlush();
    return { job, snapshot };
  }

  async acknowledgeSafety(journeyId: string) {
    const journey = this.requireJourney(journeyId);
    journey.stage = 'stabilizing';
    journey.currentIntent = 'JUST_LISTEN';
    journey.intentUpdatedAt = now();
    journey.updatedAt = now();
    this.journeyUpdates.unshift({ id: id('journey_update'), journeyId, userId: journey.userId, kind: 'safety_acknowledged', content: '我暂时安全，决定继续留在这里，先让自己稳定下来。', createdAt: now() });
    await this.persistAndFlush();
    return { journey };
  }

  async addJourneyUpdate(journeyId: string, input: { content?: unknown; kind?: unknown; outcome?: Partial<JourneyOutcome> }) {
    const journey = this.requireJourney(journeyId);
    const outcome = input.outcome ?? {};
    const item: JourneyUpdateRecord = { id: id('journey_update'), journeyId, userId: journey.userId, kind: typeof input.kind === 'string' && input.kind.trim() ? input.kind.trim() : 'note', content: this.text(input.content, '进展记录', 1000), stage: typeof outcome.stage === 'string' ? outcome.stage : undefined, intensity: Number.isFinite(Number(outcome.intensity)) ? Math.max(0, Math.min(10, Number(outcome.intensity))) : undefined, lifeFunction: outcome.lifeFunction, actionResult: outcome.actionResult, decisionChange: outcome.decisionChange, contactState: outcome.contactState, sleepState: outcome.sleepState, socialState: outcome.socialState, selfReportedHelpfulness: Number.isFinite(Number(outcome.selfReportedHelpfulness)) ? Number(outcome.selfReportedHelpfulness) : undefined, eventDate: outcome.eventDate, createdAt: now() };
    this.journeyUpdates.unshift(item); journey.updatedAt = now(); await this.persistAndFlush(); return { item };
  }

  async generateActionPlan(journeyId: string, content?: string) {
    const journey = this.requireJourney(journeyId);
    const source = content?.trim() || this.journeyUpdates.find((item) => item.journeyId === journeyId)?.content || this.situationSnapshots.find((item) => item.journeyId === journeyId)?.facts.join('、') || journey.title;
    const job = this.queueAI({ taskType: 'action_plan', userId: journey.userId, sourceId: journeyId, content: source, mood: '焦虑', style: 'rational' });
    await this.flush();
    return { job };
  }

  async createActionCommitment(journeyId: string, input: { title?: unknown; description?: unknown; dueAt?: unknown; reminderAt?: unknown; parentActionId?: string; adaptationReason?: ActionBarrier; attemptNumber?: number }) {
    const journey = this.requireJourney(journeyId);
    const createdAt = now();
    const dueAt = this.optionalDate(input.dueAt, '完成时间') ?? new Date(Date.now() + 24 * 3_600_000).toISOString();
    if (input.parentActionId && !this.actionCommitments.some((action) => action.id === input.parentActionId && action.userId === journey.userId)) throw new NotFoundException('原行动不存在');
    const item: ActionCommitmentRecord = { id: id('action'), journeyId, userId: journey.userId, title: this.text(input.title, '行动标题', 120), description: typeof input.description === 'string' ? input.description.trim().slice(0, 500) : undefined, status: 'active', dueAt, reminderAt: this.optionalDate(input.reminderAt, '提醒时间'), parentActionId: input.parentActionId, adaptationReason: input.adaptationReason, attemptNumber: Math.max(1, Number(input.attemptNumber ?? (input.parentActionId ? 2 : 1))), createdAt, updatedAt: createdAt };
    const checkin: OutcomeCheckinRecord = { id: id('checkin'), journeyId, commitmentId: item.id, userId: journey.userId, status: 'pending', dueAt, createdAt };
    const followUp: FollowUpJob = { id: id('follow_up'), userId: journey.userId, journeyId, kind: 'action_checkin', dueAt, status: 'pending', payload: { actionId: item.id, title: item.title }, createdAt };
    this.actionCommitments.unshift(item); this.outcomeCheckins.unshift(checkin); this.followUpJobs.unshift(followUp); this.journeyUpdates.unshift({ id: id('journey_update'), journeyId, userId: journey.userId, kind: 'commitment_created', content: item.title, payload: { parentActionId: item.parentActionId, adaptationReason: item.adaptationReason }, createdAt }); journey.stage = 'acting'; journey.updatedAt = createdAt; await this.persistAndFlush();
    const queue = await scheduleFollowUp(followUp);
    return { item, checkin, followUp, queue };
  }

  async checkinAction(actionId: string, input: { status?: string; reflection?: unknown; result?: unknown; intensity?: number; barrier?: ActionBarrier; outcome?: Partial<JourneyOutcome> }) {
    const action = this.actionCommitments.find((item) => item.id === actionId && item.userId === this.getDemoUserId());
    if (!action) throw new NotFoundException('行动不存在');
    const status = ['completed', 'skipped', 'missed'].includes(String(input.status)) ? String(input.status) : 'completed';
    action.status = status === 'completed' ? 'completed' : status === 'skipped' ? 'skipped' : 'paused'; action.updatedAt = now();
    const checkin = this.outcomeCheckins.find((item) => item.commitmentId === action.id && item.status === 'pending') ?? { id: id('checkin'), journeyId: action.journeyId, commitmentId: action.id, userId: action.userId, status: 'pending' as const, dueAt: action.dueAt, createdAt: now() };
    checkin.status = status === 'completed' ? 'completed' : 'missed';
    checkin.reflection = typeof input.reflection === 'string' ? input.reflection.trim().slice(0, 800) : undefined;
    checkin.result = typeof input.result === 'string' ? input.result.trim().slice(0, 240) : undefined;
    checkin.intensity = input.intensity == null ? undefined : Math.max(0, Math.min(10, Number(input.intensity)));
    checkin.barrier = input.barrier;
    checkin.checkedAt = now();
    if (!this.outcomeCheckins.some((item) => item.id === checkin.id)) this.outcomeCheckins.unshift(checkin);
    const followUp = this.followUpJobs.find((item) => item.status === 'pending' && item.payload?.actionId === action.id);
    if (followUp) { followUp.status = 'completed'; followUp.completedAt = checkin.checkedAt; }
    const outcome = input.outcome ?? {};
    this.journeyUpdates.unshift({ id: id('journey_update'), journeyId: action.journeyId, userId: action.userId, kind: 'checkin', content: checkin.reflection || `行动${action.status === 'completed' ? '已完成' : '已更新'}`, payload: { ...outcome, barrier: input.barrier }, stage: typeof outcome.stage === 'string' ? outcome.stage : undefined, intensity: Number.isFinite(Number(outcome.intensity)) ? Number(outcome.intensity) : checkin.intensity, lifeFunction: outcome.lifeFunction, actionResult: outcome.actionResult, decisionChange: outcome.decisionChange, contactState: outcome.contactState, sleepState: outcome.sleepState, socialState: outcome.socialState, selfReportedHelpfulness: Number.isFinite(Number(outcome.selfReportedHelpfulness)) ? Number(outcome.selfReportedHelpfulness) : undefined, eventDate: typeof outcome.eventDate === 'string' ? outcome.eventDate : undefined, createdAt: now() }); await this.persistAndFlush(); return { action, checkin, followUp: followUp ?? null, adaptive: status === 'missed' ? { required: true, nextRoute: `/pages/action/index?section=barrier&actionId=${action.id}` } : { required: false } };
  }

  async requestAdaptiveAction(actionId: string, barrier: ActionBarrier) {
    const action = this.actionCommitments.find((item) => item.id === actionId && item.userId === this.getDemoUserId());
    if (!action) throw new NotFoundException('行动不存在');
    const labels: Record<ActionBarrier, string> = { forgot: '忘了', too_hard: '太难了', emotion_too_strong: '当时情绪太强', environment: '环境不允许', something_else: '临时发生了别的事', did_not_want_to: '其实我不想做', other: '其他' };
    const job = this.queueAI({ taskType: 'adaptive_action', userId: action.userId, sourceId: action.id, content: JSON.stringify({ action: action.title, description: action.description, barrier: labels[barrier] }), mood: '焦虑', style: 'rational' });
    await this.flush();
    return { job, parentAction: action, barrier };
  }

  async createAdaptiveAction(actionId: string, input: { title?: unknown; description?: unknown; barrier?: ActionBarrier; dueAt?: unknown }) {
    const action = this.actionCommitments.find((item) => item.id === actionId && item.userId === this.getDemoUserId());
    if (!action) throw new NotFoundException('原行动不存在');
    const barrier = input.barrier ?? 'other';
    return await this.createActionCommitment(action.journeyId, { title: input.title, description: input.description, dueAt: input.dueAt, parentActionId: action.id, adaptationReason: barrier, attemptNumber: (action.attemptNumber ?? 1) + 1 });
  }

  async graduateJourney(journeyId: string) {
    const journey = this.requireJourney(journeyId);
    const completed = this.actionCommitments.filter((item) => item.journeyId === journeyId && item.status === 'completed').length;
    if (!completed) throw new BadRequestException('完成至少一个小行动后才能结束旅程');
    journey.status = 'completed'; journey.stage = 'graduated'; journey.completedAt = now(); journey.updatedAt = now();
    if (this.privacySettings[journey.userId]?.allowRecoveryData === true) this.recoverySnapshots.unshift({ id: id('recovery'), userId: journey.userId, journeyId, summary: `已完成 ${completed} 个小行动，留下了可回看的变化记录。`, signals: { completedActions: completed }, createdAt: now() });
    await this.persistAndFlush();
    return { ...this.journeyDetail(journeyId), graduation: this.graduationSummary(journeyId) };
  }

  graduationSummary(journeyId: string) {
    const journey = this.requireJourney(journeyId);
    const completedActions = this.actionCommitments.filter((item) => item.journeyId === journeyId && item.status === 'completed').length;
    const followUps = this.followUpJobs.filter((item) => item.journeyId === journeyId && ['delivered', 'completed'].includes(item.status)).length;
    const latestIntensity = this.outcomeCheckins
      .filter((item) => item.journeyId === journeyId && item.intensity !== undefined)
      .sort((a, b) => Date.parse(b.checkedAt ?? b.createdAt) - Date.parse(a.checkedAt ?? a.createdAt))[0]?.intensity ?? journey.intensity;
    return {
      message: '这件事好像已经不再像以前那样困住你了。',
      initialIntensity: journey.initialIntensity ?? journey.intensity,
      latestIntensity,
      completedActions,
      followUps,
      shareOptions: ['willing', 'later', 'no'] as const,
    };
  }

  async saveGraduationConsent(journeyId: string, decision: 'willing' | 'later' | 'no') {
    const journey = this.requireJourney(journeyId);
    if (journey.status !== 'completed') throw new BadRequestException('请先完成这段旅程');
    if (decision !== 'willing') return { decision, graduation: this.graduationSummary(journeyId), draft: null };
    this.privacyAllows(journey.userId, 'allowPeerMatching', '请先在隐私设置中打开同路经历网络');
    const existing = this.peerExperiences.find((item) => item.journeyId === journeyId && item.userId === journey.userId && item.status === 'pending_review');
    if (existing) return { decision, graduation: this.graduationSummary(journeyId), draft: existing };
    const snapshot = this.situationSnapshots.find((item) => item.journeyId === journeyId);
    const updates = this.journeyUpdates.filter((item) => item.journeyId === journeyId).slice(0, 6);
    const actions = this.actionCommitments.filter((item) => item.journeyId === journeyId);
    const completed = actions.filter((item) => item.status === 'completed').map((item) => item.title);
    const content = [
      snapshot?.facts?.length ? `当时发生了：${snapshot.facts.join('；')}` : '',
      snapshot?.feelings?.length ? `那时的感受是：${snapshot.feelings.join('、')}` : '',
      completed.length ? `我实际做过：${completed.join('、')}` : '',
      updates.filter((item) => item.kind !== 'created').map((item) => item.content).join('；'),
    ].filter(Boolean).join('\n').slice(0, 1600);
    const draft: PeerExperienceRecord = {
      id: id('experience'), userId: journey.userId, journeyId, title: this.redactPeerPublicText(journey.title), domain: this.redactPeerPublicText(journey.domain), subDomain: snapshot?.subDomain ? this.redactPeerPublicText(snapshot.subDomain) : undefined,
      stage: 'graduated', content: this.redactPeerPublicText(content || '我完成了一段真实经历的整理，愿意把后来发生的变化留给同路的人。'), tags: (snapshot?.contextTags ?? []).map((tag) => this.redactPeerPublicText(tag)), fingerprintJson: snapshot?.fingerprintJson,
      helpfulActions: completed, notHelpfulActions: [], consentedAt: now(), status: 'pending_review', reportCount: 0, createdAt: now(), updatedAt: now(),
    };
    this.peerExperiences.unshift(draft);
    await this.persistAndFlush();
    return { decision, graduation: this.graduationSummary(journeyId), draft };
  }

  async updatePeerExperience(experienceId: string, input: { title?: string; content?: string; laterSummary?: Record<string, unknown>; helpfulActions?: string[]; notHelpfulActions?: string[]; retrospective?: string }, requestedUserId?: string) {
    const item = this.peerExperiences.find((experience) => experience.id === experienceId && experience.userId === this.resolveRuntimeUserId(requestedUserId) && experience.status === 'pending_review');
    if (!item) throw new NotFoundException('待确认的经历不存在');
    if (typeof input.title === 'string' && input.title.trim()) item.title = this.redactPeerPublicText(input.title.trim().slice(0, 100));
    if (typeof input.content === 'string' && input.content.trim()) item.content = this.redactPeerPublicText(input.content.trim().slice(0, 1600));
    if (input.laterSummary) item.laterSummary = this.redactPeerPublicValue(input.laterSummary) as Record<string, unknown>;
    if (Array.isArray(input.helpfulActions)) item.helpfulActions = input.helpfulActions.map(String).filter(Boolean).slice(0, 8).map((value) => this.redactPeerPublicText(value));
    if (Array.isArray(input.notHelpfulActions)) item.notHelpfulActions = input.notHelpfulActions.map(String).filter(Boolean).slice(0, 8).map((value) => this.redactPeerPublicText(value));
    if (typeof input.retrospective === 'string') item.retrospective = this.redactPeerPublicText(input.retrospective.trim().slice(0, 1000));
    item.updatedAt = now();
    await this.persistAndFlush();
    return { item: this.peerExperienceSummary(item) };
  }

  async createPeerExperience(journeyId: string | undefined, input: { title?: unknown; domain?: unknown; subDomain?: unknown; stage?: unknown; content?: unknown; tags?: unknown; consented?: unknown; laterSummary?: unknown; helpfulActions?: unknown; notHelpfulActions?: unknown; retrospective?: unknown }, requestedUserId?: string) {
    const userId = this.resolveRuntimeUserId(requestedUserId);
    this.privacyAllows(userId, 'allowPeerMatching', '请先在隐私设置中打开同路经历网络');
    if (input.consented !== true) throw new BadRequestException('发布经历前必须明确同意匿名分享');
    const journey = journeyId ? this.requireJourney(journeyId, userId) : undefined;
    const sourceSnapshot = journey ? this.situationSnapshots.find((snapshot) => snapshot.journeyId === journey.id) : undefined;
    const values = (value: unknown) => Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8).map((item) => this.redactPeerPublicText(item)) : [];
    const title = this.redactPeerPublicText(this.text(input.title, '经历标题', 100));
    const content = this.redactPeerPublicText(this.text(input.content, '经历内容', 1600));
    const retrospective = typeof input.retrospective === 'string' ? this.redactPeerPublicText(input.retrospective.trim().slice(0, 1000)) : undefined;
    const item: PeerExperienceRecord = { id: id('experience'), userId, journeyId: journey?.id, title, domain: this.redactPeerPublicText(this.text(input.domain ?? journey?.domain, '经历领域', 40)), subDomain: typeof input.subDomain === 'string' ? this.redactPeerPublicText(input.subDomain.trim().slice(0, 80)) : sourceSnapshot?.subDomain ? this.redactPeerPublicText(sourceSnapshot.subDomain) : undefined, stage: this.text(input.stage ?? journey?.stage, '经历阶段', 40), content, tags: values(input.tags).length ? values(input.tags) : (sourceSnapshot?.contextTags ?? []).map((tag) => this.redactPeerPublicText(tag)), fingerprintJson: sourceSnapshot?.fingerprintJson, laterSummary: typeof input.laterSummary === 'object' && input.laterSummary ? this.redactPeerPublicValue(input.laterSummary) as Record<string, unknown> : undefined, helpfulActions: values(input.helpfulActions), notHelpfulActions: values(input.notHelpfulActions), retrospective, consentedAt: now(), status: 'pending_review', reportCount: 0, createdAt: now(), updatedAt: now() };
    this.peerExperiences.unshift(item); await this.persistAndFlush(); return { item: this.peerExperienceSummary(item) };
  }

  peerNetwork(requestedUserId?: string) {
    const userId = this.resolveRuntimeUserId(requestedUserId);
    const privacyEnabled = this.privacySettings[userId]?.allowPeerMatching === true;
    if (!privacyEnabled) return { privacyEnabled: false, experiences: [], matches: [], limited: false };
    const published = this.peerExperiences.filter((item) => item.status === 'published' && item.userId !== userId);
    const matches = this.peerMatches
      .filter((item) => item.userId === userId)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((match) => this.peerMatchForUser(match))
      .filter((item) => item.experience);
    return { privacyEnabled: true, experiences: published.slice(0, 3).map((item) => this.peerExperienceSummary(item)), matches, limited: published.length > 3 };
  }

  private peerExperienceSummary(experience?: PeerExperienceRecord) {
    if (!experience) return undefined;
    const timelineCount = experience.journeyId ? this.journeyUpdates.filter((item) => item.journeyId === experience.journeyId).length : 0;
    const checkinCount = experience.journeyId ? this.outcomeCheckins.filter((item) => item.journeyId === experience.journeyId).length : 0;
    const laterRecordCount = [experience.laterSummary, experience.retrospective, ...(experience.helpfulActions ?? [])].filter(Boolean).length + timelineCount + checkinCount;
    return {
      id: experience.id,
      title: this.redactPeerPublicText(experience.title),
      domain: this.redactPeerPublicText(experience.domain),
      subDomain: experience.subDomain ? this.redactPeerPublicText(experience.subDomain) : undefined,
      stage: experience.stage,
      tags: experience.tags.map((tag) => this.redactPeerPublicText(tag)),
      createdAt: experience.createdAt,
      graduated: experience.stage === 'graduated',
      laterRecordCount,
    };
  }

  private peerMatchForUser(match: PeerMatchRecord) {
    const experience = this.peerExperienceSummary(this.peerExperiences.find((item) => item.id === match.peerExperienceId));
    return {
      id: match.id,
      journeyId: match.journeyId,
      peerExperienceId: match.peerExperienceId,
      status: match.status,
      reasons: match.reasons.slice(0, 2),
      requestReason: match.requestReason,
      requestQuestion: match.requestQuestion,
      acceptedAt: match.acceptedAt,
      createdAt: match.createdAt,
      updatedAt: match.updatedAt,
      experience,
    };
  }

  private peerMessageForUser(message: PeerMessageRecord, viewerUserId: string) {
    return {
      id: message.id,
      author: message.senderUserId === viewerUserId ? 'self' : 'peer',
      authorType: message.authorType,
      content: message.content,
      createdAt: message.createdAt,
    };
  }

  private peerConversationForUser(conversation: PeerConversationRecord, viewerUserId: string) {
    return {
      id: conversation.id,
      matchId: conversation.matchId,
      status: conversation.status,
      startsAt: conversation.startsAt,
      consentAcceptedAt: conversation.consentAcceptedAt,
      expiresAt: conversation.expiresAt,
      createdAt: conversation.createdAt,
      closedAt: conversation.closedAt,
      closedReason: conversation.closedReason,
      messages: this.peerMessages
        .filter((message) => message.conversationId === conversation.id)
        .map((message) => this.peerMessageForUser(message, viewerUserId)),
    };
  }

  async suggestPeerMatches(journeyId: string, requestedUserId?: string) {
    const journey = this.requireJourney(journeyId, this.resolveRuntimeUserId(requestedUserId));
    this.privacyAllows(journey.userId, 'allowPeerMatching', '请先在隐私设置中打开同路经历网络');
    const existing = new Set(this.peerMatches.filter((item) => item.userId === journey.userId).map((item) => item.peerExperienceId));
    const candidates = this.peerExperiences.filter((item) => item.status === 'published' && item.userId !== journey.userId && !existing.has(item.id));
    const snapshot = this.situationSnapshots.find((item) => item.journeyId === journey.id);
    const currentTags = new Set(snapshot?.contextTags ?? []);
    const stageRank: Record<string, number> = { clarifying: 0, planning: 1, acting: 2, recovering: 3, graduated: 4 };
    const currentStage = stageRank[journey.stage] ?? 0;
    const created = candidates.map((experience) => {
      const peerSnapshot = experience.fingerprintJson ?? {};
      const peerTags = new Set(experience.tags);
      const sharedTags = [...currentTags].filter((tag) => peerTags.has(tag));
      const domain = experience.domain === journey.domain ? 1 : 0;
      const subDomain = snapshot?.subDomain && experience.subDomain && snapshot.subDomain === experience.subDomain ? 1 : 0;
      const fingerprintSimilarity = Math.min(1, sharedTags.length / Math.max(1, Math.max(currentTags.size, peerTags.size)));
      const peerStage = stageRank[experience.stage] ?? stageRank[String(peerSnapshot.stage)] ?? 0;
      const recoveryLead = Math.max(0, peerStage - currentStage);
      const stageSimilarity = peerStage >= currentStage ? Math.min(1, 0.6 + recoveryLead * 0.2) : 0.35;
      const peerOwner = this.peerReputations.find((item) => item.userId === experience.userId);
      const trustScore = peerOwner ? Math.min(1, peerOwner.helpfulCount / Math.max(1, peerOwner.helpfulCount + peerOwner.reportCount)) : 0.5;
      const safety = experience.reportCount === 0 ? 1 : 0.2;
      const preference = 0.5;
      const scoreBreakdown = { domain: domain * 0.25, fingerprintSimilarity: (subDomain * 0.5 + fingerprintSimilarity * 0.5) * 0.25, stage: stageSimilarity * 0.15, recoveryLead: Math.min(1, recoveryLead / 3) * 0.15, trust: trustScore * 0.1, safety: safety * 0.05, preference: preference * 0.05 };
      const score = Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0);
      const reasons = [domain ? `你们都经历过${journey.domain}里的相似事情` : '这段经历能提供不同领域的现实视角', subDomain ? `情境也接近：${experience.subDomain}` : sharedTags.length ? `你们都提到：${sharedTags.slice(0, 2).join('、')}` : '阶段信息可以帮助你换个角度看现在', recoveryLead > 0 ? `TA比你早走过约${recoveryLead}个阶段` : 'TA留下了真实的后来记录'];
      const explanation = `${reasons.join('；')}。`;
      const match: PeerMatchRecord = { id: id('peer_match'), userId: journey.userId, journeyId, peerExperienceId: experience.id, score, reasons, stageDistance: Math.abs(peerStage - currentStage), recoveryLead, trustScore, fingerprintSimilarity, scoreBreakdown, explanation, status: 'suggested', createdAt: now(), updatedAt: now() };
      this.peerMatches.unshift(match); return match;
    });
    await this.persistAndFlush();
    return { items: created.map((item) => this.peerMatchForUser(item)).filter((item) => item.experience) };
  }

  private peerPiiFlags(content: string) {
    const flags: string[] = [];
    const compact = content.replace(/[\s-]/g, '');
    if (/(?:^|\D)1[3-9]\d{9}(?:$|\D)/.test(compact)) flags.push('手机号');
    if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(content)) flags.push('邮箱');
    if (/(?:微信|wechat|weixin|wx|vx|qq)(?:号)?\s*(?:[：:]|是)?\s*(?:[A-Za-z][A-Za-z0-9_-]{4,}|\d{5,12})/i.test(content)) flags.push('社交账号');
    if (/(?:^|\D)[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?:$|\D)/.test(compact)) flags.push('证件号码');
    if (/(?:我的)?(?:地址|住址|住在|公司地址|学校地址)\s*(?:是|在|：|:)?\s*[\u4e00-\u9fa5]{2,}(?:省|市|区|县|路|街|巷|小区|大厦|学校|公司)/.test(content)) flags.push('具体地址');
    return [...new Set(flags)];
  }

  private assertPeerDraftSafe(content: string) {
    const flags = this.peerPiiFlags(content);
    if (flags.length) throw new BadRequestException(`这段话里好像有能认出你的信息（${flags.join('、')}），要不要先改一下？`);
  }

  private redactPeerPublicText(content: string) {
    return content
      .replace(/(?:^|\D)1[3-9]\d{9}(?:$|\D)/g, ' [已隐藏联系方式] ')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[已隐藏邮箱]')
      .replace(/(?:微信|wechat|weixin|wx|vx|qq)(?:号)?\s*(?:[：:]|是)?\s*(?:[A-Za-z][A-Za-z0-9_-]{4,}|\d{5,12})/gi, '[已隐藏账号]')
      .replace(/(?:^|\D)[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?:$|\D)/g, ' [已隐藏证件信息] ')
      .replace(/(?:我的)?(?:地址|住址|住在|公司地址|学校地址)\s*(?:是|在|：|:)?\s*[\u4e00-\u9fa5]{2,}(?:省|市|区|县|路|街|巷|小区|大厦|学校|公司)/g, '[已隐藏具体地址]')
      .replace(/(?:我叫|我是|叫我|他叫|她叫|朋友叫)[\u4e00-\u9fa5]{2,4}/g, '[已隐藏称呼]');
  }

  private redactPeerPublicValue(value: unknown): unknown {
    if (typeof value === 'string') return this.redactPeerPublicText(value);
    if (Array.isArray(value)) return value.map((item) => this.redactPeerPublicValue(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, this.redactPeerPublicValue(item)]));
    return value;
  }

  private peerNotification(userId: string, type: UserNotification['type'], suffix: string, title: string, body: string, targetRoute: string) {
    const notificationId = `notification_peer_${suffix}_${userId}`;
    const existing = this.notifications.find((item) => item.id === notificationId);
    if (existing) {
      existing.title = title;
      existing.body = body;
      existing.targetRoute = targetRoute;
      return existing;
    }
    const item: UserNotification = { id: notificationId, userId, type, title, body, targetRoute, status: 'unread', createdAt: now() };
    this.notifications.unshift(item);
    return item;
  }

  private closePeerConversationRecord(conversation: PeerConversationRecord, reason: 'closed' | 'expired' | 'blocked') {
    if (conversation.status === 'closed') return;
    conversation.status = 'closed';
    conversation.closedAt = now();
    conversation.closedReason = reason;
    const body = reason === 'expired' ? '这段匿名同行的 72 小时已经结束。' : reason === 'blocked' ? '这段匿名同行已被结束，你们不能继续发送消息。' : '这段匿名同行已经结束，你们不能继续发送消息。';
    const route = `/pages/peer/conversation?matchId=${encodeURIComponent(conversation.matchId)}`;
    this.peerNotification(conversation.starterUserId, 'CONVERSATION_CLOSED', `closed_${conversation.id}`, '这段同行到这里了', body, route);
    this.peerNotification(conversation.receiverUserId, 'CONVERSATION_CLOSED', `closed_${conversation.id}`, '这段同行到这里了', body, route);
  }

  private async expirePeerConversations() {
    const due = this.peerConversations.filter((conversation) => conversation.status === 'active' && Date.parse(conversation.expiresAt) <= Date.now());
    if (!due.length) return;
    due.forEach((conversation) => this.closePeerConversationRecord(conversation, 'expired'));
    await this.persistAndFlush();
  }

  private async requirePeerConversation(matchId: string, requestedUserId?: string) {
    await this.expirePeerConversations();
    const userId = this.resolveRuntimeUserId(requestedUserId);
    const conversation = this.peerConversations.find((item) => item.matchId === matchId && [item.starterUserId, item.receiverUserId].includes(userId));
    if (!conversation) throw new NotFoundException('匿名会话不存在');
    return { userId, conversation };
  }

  async updatePeerMatch(matchId: string, input: { status: 'requested' | 'connected' | 'declined' | 'blocked'; requestReason?: unknown; requestQuestion?: unknown }, requestedUserId?: string) {
    const currentUserId = this.resolveRuntimeUserId(requestedUserId);
    const item = this.peerMatches.find((match) => match.id === matchId);
    if (!item) throw new NotFoundException('同路匹配不存在');
    const experience = this.peerExperiences.find((candidate) => candidate.id === item.peerExperienceId);
    const isRequester = item.userId === currentUserId;
    const isExperienceOwner = experience?.userId === currentUserId;
    const status = input.status;
    if (status === 'requested' && (!isRequester || item.status !== 'suggested')) throw new BadRequestException('只有发起方可以对待匹配经历发出一次请求');
    if ((status === 'connected' || status === 'declined') && (!isExperienceOwner || item.status !== 'requested')) throw new BadRequestException('只有经历发布者可以处理待确认的同路请求');
    if (status === 'blocked' && !isRequester && !isExperienceOwner) throw new BadRequestException('你无权处理这条同路匹配');
    if (status === 'requested') {
      const requestReason = typeof input.requestReason === 'string' ? input.requestReason.trim().slice(0, 280) : '';
      const requestQuestion = typeof input.requestQuestion === 'string' ? input.requestQuestion.trim().slice(0, 160) : '';
      const safeReason = requestReason || '我想听听你后来是怎么把这段日子走过去的。';
      this.assertPeerDraftSafe(`${safeReason}\n${requestQuestion}`);
      item.requestReason = safeReason;
      item.requestQuestion = requestQuestion || undefined;
    }
    item.status = status;
    item.updatedAt = now();
    if (status === 'requested' && experience && experience.userId !== item.userId) {
      this.peerNotification(experience.userId, 'PEER_REQUEST', `request_${item.id}`, '有人想和你聊聊这段经历', '有人看见了你留下的后来，想先问一个小问题。', `/pages/peer/requests?matchId=${encodeURIComponent(item.id)}`);
    }
    if (status === 'connected') item.acceptedAt = now();
    await this.persistAndFlush();
    const conversation = this.peerConversations.find((candidate) => candidate.matchId === item.id);
    return { item: this.peerMatchForUser(item), conversation: conversation ? this.peerConversationForUser(conversation, currentUserId) : null };
  }

  async startPeerConversation(matchId: string, requestedUserId?: string) {
    const currentUserId = this.resolveRuntimeUserId(requestedUserId);
    const item = this.peerMatches.find((match) => match.id === matchId);
    if (!item) throw new NotFoundException('同路匹配不存在');
    const experience = this.peerExperiences.find((candidate) => candidate.id === item.peerExperienceId);
    if (!experience || experience.userId !== currentUserId || item.status !== 'connected') throw new ForbiddenException('只有接受请求的经历发布者可以确认同行边界');
    const existing = this.peerConversations.find((conversation) => conversation.matchId === item.id);
    if (existing) return { conversation: this.peerConversationForUser(existing, currentUserId) };
    const startsAt = now();
    const conversation: PeerConversationRecord = {
      id: id('peer_conversation'),
      matchId: item.id,
      starterUserId: item.userId,
      receiverUserId: experience.userId,
      status: 'active',
      startsAt,
      consentAcceptedAt: startsAt,
      expiresAt: new Date(Date.parse(startsAt) + 72 * 3_600_000).toISOString(),
      createdAt: startsAt,
    };
    this.peerConversations.unshift(conversation);
    this.peerNotification(item.userId, 'PEER_ACCEPTED', `accepted_${item.id}`, '有人愿意和你聊一会', '双方已确认匿名边界，这段同行现在开始，最多持续 72 小时。', `/pages/peer/conversation?matchId=${encodeURIComponent(item.id)}`);
    await this.persistAndFlush();
    return { conversation: this.peerConversationForUser(conversation, currentUserId) };
  }

  peerRequestList(requestedUserId?: string) {
    const userId = this.resolveRuntimeUserId(requestedUserId);
    return this.peerMatches
      .filter((match) => {
        const isOwner = this.peerExperiences.find((experience) => experience.id === match.peerExperienceId)?.userId === userId;
        const awaitsConsent = match.status === 'connected' && !this.peerConversations.some((conversation) => conversation.matchId === match.id);
        return isOwner && (match.status === 'requested' || awaitsConsent);
      })
      .map((match) => this.peerMatchForUser(match));
  }

  peerExperienceDetail(experienceId: string) {
    const experience = this.peerExperiences.find((item) => item.id === experienceId && item.status === 'published');
    if (!experience) throw new NotFoundException('这段同路经历不存在');
    const journey = experience.journeyId ? this.lifeJourneys.find((item) => item.id === experience.journeyId) : undefined;
    const timeline = experience.journeyId ? this.journeyUpdates.filter((item) => item.journeyId === experience.journeyId).slice(0, 4).map((item) => ({ id: item.id, content: this.redactPeerPublicText(item.content), eventDate: item.eventDate, createdAt: item.createdAt })) : [];
    const actions = experience.journeyId ? this.actionCommitments.filter((item) => item.journeyId === experience.journeyId).slice(0, 4).map((item) => ({ id: item.id, title: this.redactPeerPublicText(item.title), createdAt: item.createdAt })) : [];
    const safeExperience = { ...this.peerExperienceSummary(experience), content: this.redactPeerPublicText(experience.content) };
    const later = experience.laterSummary ? this.redactPeerPublicValue(experience.laterSummary) as Record<string, unknown> : { available: false, message: 'TA目前还没有留下这一阶段的后续记录。' };
    return { experience: safeExperience, journey: journey ? { completedAt: journey.completedAt, createdAt: journey.createdAt } : null, timeline, actions, later, helpfulActions: (experience.helpfulActions ?? []).map((item) => this.redactPeerPublicText(item)), notHelpfulActions: (experience.notHelpfulActions ?? []).map((item) => this.redactPeerPublicText(item)), retrospective: experience.retrospective ? this.redactPeerPublicText(experience.retrospective) : null };
  }

  async conversationList(requestedUserId?: string) {
    await this.expirePeerConversations();
    const userId = this.resolveRuntimeUserId(requestedUserId);
    return this.peerConversations
      .filter((conversation) => [conversation.starterUserId, conversation.receiverUserId].includes(userId))
      .map((conversation) => this.peerConversationForUser(conversation, userId));
  }

  async sendPeerMessage(matchId: string, content: unknown, requestedUserId?: string) {
    const { userId, conversation } = await this.requirePeerConversation(matchId, requestedUserId);
    if (conversation.status !== 'active' || Date.parse(conversation.expiresAt) <= Date.now()) throw new BadRequestException('这段 72 小时会话已经结束');
    const text = this.text(content, '消息内容', 1000);
    this.assertPeerDraftSafe(text);
    const item: PeerMessageRecord = { id: id('peer_message'), conversationId: conversation.id, senderUserId: userId, content: text, authorType: 'HUMAN', createdAt: now(), piiFlags: [] };
    this.peerMessages.unshift(item); await this.persistAndFlush(); return { item: this.peerMessageForUser(item, userId) };
  }

  async requestPeerResponseAssist(matchId: string, content: unknown, requestedUserId?: string) {
    const { userId, conversation } = await this.requirePeerConversation(matchId, requestedUserId);
    if (conversation.status !== 'active' || Date.parse(conversation.expiresAt) <= Date.now()) throw new BadRequestException('这段 72 小时会话已经结束');
    const source = this.text(content, '待整理的回复', 1000);
    this.assertPeerDraftSafe(source);
    const job = this.queueAI({ taskType: 'peer_response_assist', userId, sourceId: conversation.id, content: source, style: 'warm', mood: '委屈' });
    await this.flush();
    return { job: { id: job.id, status: job.status }, notice: 'AI 只会整理表达，最终消息仍需你确认后发送。' };
  }

  async closePeerConversation(matchId: string, requestedUserId?: string) {
    const { userId, conversation } = await this.requirePeerConversation(matchId, requestedUserId);
    this.closePeerConversationRecord(conversation, 'closed');
    await this.persistAndFlush();
    return { item: this.peerConversationForUser(conversation, userId) };
  }

  async reportPeerConversation(matchId: string, reason: unknown, requestedUserId?: string) {
    const { userId, conversation } = await this.requirePeerConversation(matchId, requestedUserId);
    const reportReason = this.text(reason, '举报原因', 300);
    conversation.reportedAt = now();
    conversation.reporterUserId = userId;
    conversation.reportReason = reportReason;
    const match = this.peerMatches.find((item) => item.id === matchId);
    const experience = match ? this.peerExperiences.find((item) => item.id === match.peerExperienceId) : undefined;
    if (experience) experience.reportCount += 1;
    await this.persistAndFlush();
    return { item: this.peerConversationForUser(conversation, userId) };
  }

  async blockPeerConversation(matchId: string, requestedUserId?: string) {
    const { userId, conversation } = await this.requirePeerConversation(matchId, requestedUserId);
    const match = this.peerMatches.find((item) => item.id === matchId);
    if (!match) throw new NotFoundException('同路匹配不存在');
    match.status = 'blocked';
    match.updatedAt = now();
    this.closePeerConversationRecord(conversation, 'blocked');
    await this.persistAndFlush();
    return { item: this.peerConversationForUser(conversation, userId), match: this.peerMatchForUser(match) };
  }

  async savePeerConversationFeedback(matchId: string, input: { feedback?: unknown; note?: unknown; shareLater?: unknown }, requestedUserId?: string) {
    const { userId, conversation } = await this.requirePeerConversation(matchId, requestedUserId);
    if (conversation.status === 'active' && Date.parse(conversation.expiresAt) > Date.now()) throw new BadRequestException('请先结束这段同行，再留下感受');
    const feedback = String(input.feedback ?? '');
    if (!['helpful', 'unchanged', 'uncomfortable'].includes(feedback)) throw new BadRequestException('请选择这段同行带来的感受');
    const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';
    this.assertPeerDraftSafe(note);
    conversation.feedback = feedback as PeerConversationRecord['feedback'];
    conversation.feedbackNote = note || undefined;
    let sharedExperience: PeerExperienceRecord | undefined;
    if (input.shareLater === true) {
      this.privacyAllows(userId, 'allowPeerMatching', '请先在隐私设置中允许匿名留下经历');
      const match = this.peerMatches.find((item) => item.id === matchId);
      const source = match ? this.peerExperiences.find((item) => item.id === match.peerExperienceId) : undefined;
      const journeyId = match?.userId === userId ? match.journeyId : source?.journeyId;
      const journey = journeyId ? this.lifeJourneys.find((item) => item.id === journeyId && item.userId === userId) : undefined;
      const snapshot = journey ? this.situationSnapshots.find((item) => item.journeyId === journey.id) : undefined;
      const shareText = this.redactPeerPublicText(note || '这段同行结束后，我愿意把后来的一点变化留给走在相似路上的人。');
      sharedExperience = {
        id: id('experience'), userId, journeyId: journey?.id, title: '这段同行之后，我慢慢走了一点出来', domain: journey?.domain ?? source?.domain ?? '其他', stage: 'graduated', subDomain: snapshot?.subDomain ?? source?.subDomain,
        content: shareText, tags: snapshot?.contextTags ?? source?.tags ?? [], fingerprintJson: snapshot?.fingerprintJson ?? source?.fingerprintJson,
        laterSummary: { summary: shareText }, helpfulActions: [], notHelpfulActions: [], consentedAt: now(), status: 'pending_review', reportCount: 0, createdAt: now(), updatedAt: now(),
      };
      this.peerExperiences.unshift(sharedExperience);
    }
    await this.persistAndFlush();
    return { item: this.peerConversationForUser(conversation, userId), sharedExperience: sharedExperience ? this.peerExperienceSummary(sharedExperience) : undefined };
  }

  notificationList(requestedUserId?: string) {
    const userId = this.resolveRuntimeUserId(requestedUserId);
    return this.notifications.filter((item) => item.userId === userId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }

  async readNotification(notificationId: string, requestedUserId?: string) {
    const userId = this.resolveRuntimeUserId(requestedUserId);
    const item = this.notifications.find((notification) => notification.id === notificationId && notification.userId === userId);
    if (!item) throw new NotFoundException('提醒不存在');
    item.status = 'read'; item.readAt = now(); await this.persistAndFlush(); return { item };
  }

  async saveRecoveryCheckin(journeyId: string | undefined, signals: Record<string, unknown>, summary?: unknown) {
    const userId = this.getDemoUserId();
    this.privacyAllows(userId, 'allowRecoveryData', '请先在隐私设置中允许保存生活恢复数据');
    const journey = journeyId ? this.requireJourney(journeyId, userId) : undefined;
    const allowed = new Set(['yes', 'partial', 'no']);
    const normalized = Object.fromEntries(Object.entries(signals).map(([key, value]) => [key, allowed.has(String(value)) ? String(value) : 'partial']));
    const item: RecoverySnapshot = { id: id('recovery'), userId, journeyId: journey?.id, summary: typeof summary === 'string' && summary.trim() ? summary.trim().slice(0, 500) : '今天记录了一次生活恢复情况。', signals: normalized, createdAt: now() };
    this.recoverySnapshots.unshift(item);
    if (journey) journey.updatedAt = now();
    await this.persistAndFlush();
    return { item };
  }

  async createDecision(input: { journeyId?: string; question?: unknown; options?: unknown; criteria?: unknown }) {
    const userId = this.getDemoUserId();
    const journey = input.journeyId ? this.requireJourney(input.journeyId, userId) : undefined;
    const values = (value: unknown) => Array.isArray(value) ? value.map(String).map((part) => part.trim()).filter(Boolean).slice(0, 10) : [];
    const item: DecisionRecord = { id: id('decision'), userId, journeyId: journey?.id, question: this.text(input.question, '决策问题', 400), options: values(input.options), criteria: values(input.criteria), status: 'draft', createdAt: now(), updatedAt: now() };
    this.decisionRecords.unshift(item); await this.persistAndFlush(); return { item };
  }

  async updateDecision(decisionId: string, input: { decision?: unknown; status?: unknown }) {
    const item = this.decisionRecords.find((record) => record.id === decisionId && record.userId === this.getDemoUserId());
    if (!item) throw new NotFoundException('决策记录不存在');
    if (typeof input.decision === 'string') item.decision = input.decision.trim().slice(0, 400) || undefined;
    if (typeof input.status === 'string' && ['draft', 'decided', 'archived'].includes(input.status)) item.status = input.status;
    item.updatedAt = now();
    await this.persistAndFlush();
    return { item };
  }

  decisionList() {
    const userId = this.getDemoUserId();
    return this.decisionRecords.filter((item) => item.userId === userId).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }

  async createCooldown(input: { decisionId?: string; title?: unknown; reason?: unknown; hours?: number }) {
    const userId = this.getDemoUserId();
    if (input.decisionId && !this.decisionRecords.some((item) => item.id === input.decisionId && item.userId === userId)) throw new NotFoundException('决策记录不存在');
    const hours = Math.max(1, Math.min(168, Number(input.hours ?? 24)));
    const item: CooldownItem = { id: id('cooldown'), userId, decisionId: input.decisionId, title: this.text(input.title, '冷静事项', 120), reason: typeof input.reason === 'string' ? input.reason.trim().slice(0, 400) : undefined, releaseAt: new Date(Date.now() + hours * 3_600_000).toISOString(), status: 'active', createdAt: now() };
    const followUp: FollowUpJob = { id: id('follow_up'), userId, kind: 'DECISION_COOLDOWN', dueAt: item.releaseAt, status: 'pending', payload: { cooldownId: item.id }, createdAt: now() };
    this.cooldownItems.unshift(item); this.followUpJobs.unshift(followUp); await this.persistAndFlush();
    const queue = await scheduleFollowUp(followUp);
    return { item, followUp, queue };
  }

  cooldownList() {
    const userId = this.getDemoUserId();
    return this.cooldownItems.filter((item) => item.userId === userId).map((item) => ({ ...item, status: Date.parse(item.releaseAt) <= Date.now() ? 'released' : item.status }));
  }

  async createRealityHandoff(input: { journeyId?: string; recipient?: unknown; channel?: unknown; summary?: unknown }) {
    const userId = this.getDemoUserId();
    const journey = input.journeyId ? this.requireJourney(input.journeyId, userId) : undefined;
    const item: RealityHandoff = { id: id('handoff'), userId, journeyId: journey?.id, recipient: this.text(input.recipient, '交接对象', 80), channel: this.text(input.channel, '联系渠道', 40), summary: this.text(input.summary, '交接摘要', 1000), status: 'ready', createdAt: now(), updatedAt: now() };
    this.realityHandoffs.unshift(item); await this.persistAndFlush(); return { item };
  }

  async shareRealityHandoff(idValue: string) {
    const item = this.realityHandoffs.find((handoff) => handoff.id === idValue && handoff.userId === this.getDemoUserId());
    if (!item) throw new NotFoundException('现实交接不存在');
    item.status = 'shared'; item.sharedAt = now(); item.updatedAt = now(); await this.persistAndFlush(); return { item };
  }

  handoffList() {
    const userId = this.getDemoUserId();
    return this.realityHandoffs.filter((item) => item.userId === userId);
  }

  async saveTrustedContact(input: { nickname?: unknown; relation?: unknown; contactHint?: unknown }) {
    const item: TrustedContact = { id: id('contact'), userId: this.getDemoUserId(), nickname: this.text(input.nickname, '联系人称呼', 60), relation: this.text(input.relation, '关系', 40), contactHint: this.text(input.contactHint, '联系方式提示', 120), enabled: true, createdAt: now(), updatedAt: now() };
    this.trustedContacts.unshift(item); await this.persistAndFlush(); return { item };
  }

  trustedContactList() {
    return this.trustedContacts.filter((item) => item.userId === this.getDemoUserId() && item.enabled);
  }

  async saveFutureMessage(input: { journeyId?: string; content?: unknown; deliverAt?: unknown }) {
    const userId = this.getDemoUserId();
    const journey = input.journeyId ? this.requireJourney(input.journeyId, userId) : undefined;
    const deliverAt = this.optionalDate(input.deliverAt, '送达时间');
    if (!deliverAt || Date.parse(deliverAt) <= Date.now()) throw new BadRequestException('送达时间必须晚于现在');
    const item: MessageToFutureSelf = { id: id('future_message'), userId, journeyId: journey?.id, content: this.text(input.content, '写给未来自己的话', 1200), deliverAt, createdAt: now() };
    const followUp: FollowUpJob = { id: id('follow_up'), userId, journeyId: journey?.id, kind: 'FUTURE_SELF', dueAt: deliverAt, status: 'pending', payload: { messageId: item.id }, createdAt: now() };
    this.messagesToFutureSelf.unshift(item); this.followUpJobs.unshift(followUp); await this.persistAndFlush();
    const queue = await scheduleFollowUp(followUp);
    return { item, followUp, queue };
  }

  futureMessageList() {
    return this.messagesToFutureSelf
      .filter((item) => item.userId === this.getDemoUserId())
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  }

  async saveSupportPlan(input: { journeyId?: string; title?: unknown; plan?: Record<string, unknown> }) {
    const userId = this.getDemoUserId();
    this.privacyAllows(userId, 'allowRecoveryData', '请先在隐私设置中允许保存支持计划');
    const journey = input.journeyId ? this.requireJourney(input.journeyId, userId) : undefined;
    const item: PersonalSupportPlan = { id: id('support_plan'), userId, journeyId: journey?.id, title: this.text(input.title ?? '我的现实支持计划', '支持计划标题', 100), plan: input.plan ?? {}, active: true, createdAt: now(), updatedAt: now() };
    this.personalSupportPlans.unshift(item); await this.persistAndFlush(); return { item };
  }

  supportPlan() {
    const userId = this.getDemoUserId();
    return this.personalSupportPlans.find((item) => item.userId === userId && item.active) ?? null;
  }

  recoveryList() {
    const userId = this.getDemoUserId();
    this.privacyAllows(userId, 'allowRecoveryData', '请先在隐私设置中允许查看恢复记录');
    return this.recoverySnapshots.filter((item) => item.userId === userId);
  }

  async saveMemory(input: { journeyId?: string; category?: unknown; content?: unknown; days?: number }) {
    const userId = this.getDemoUserId();
    this.privacyAllows(userId, 'allowLongTermMemory', '请先在隐私设置中允许保存有限记忆');
    const days = Math.max(1, Math.min(90, Number(input.days ?? 30)));
    const journey = input.journeyId ? this.requireJourney(input.journeyId, userId) : undefined;
    const item: MemoryItem = { id: id('memory'), userId, journeyId: journey?.id, category: this.text(input.category, '记忆分类', 50), content: this.text(input.content, '记忆内容', 500), consentedAt: now(), expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(), createdAt: now() };
    this.memoryItems.unshift(item); await this.persistAndFlush(); return { item };
  }

  async deleteMemory(idValue: string) {
    const item = this.memoryItems.find((memory) => memory.id === idValue && memory.userId === this.getDemoUserId());
    if (!item) throw new NotFoundException('记忆不存在');
    item.deletedAt = now(); await this.persistAndFlush(); return { ok: true, item };
  }

  async updateJourneyStatus(journeyId: string, status: 'active' | 'paused' | 'archived') {
    const journey = this.requireJourney(journeyId);
    journey.status = status; journey.updatedAt = now(); await this.persistAndFlush(); return { journey };
  }

  async publicPosts(emotion?: string) {
    const normalized = normalizeStoreEmotion(emotion);
    const normalizedValue = String(normalized);
    const hiddenPostIds = new Set(
      (await this.prisma.hiddenPost.findMany({
        where: { userId: this.getDemoUserId() },
        select: { postId: true },
      })).map((item) => item.postId),
    );
    this.posts.forEach((post) => this.decoratePost(post));
    return this.posts.filter((post) => !hiddenPostIds.has(post.id) && post.status === 'active' && post.reviewStatus === 'published' && (!emotion || normalizedValue === '全部' || post.emotion === normalized));
  }

  async hidePostForCurrentUser(postId: string) {
    this.getPost(postId, true);
    const userId = this.getDemoUserId();
    const item = await this.prisma.hiddenPost.upsert({
      where: { userId_postId: { userId, postId } },
      create: { userId, postId },
      update: {},
    });
    return item;
  }

  async likeReply(replyId: string) {
    const reply = this.replies.find((item) => item.id === replyId && item.status === 'published');
    if (!reply) throw new NotFoundException('回应不存在');
    reply.likeCount = (reply.likeCount ?? 0) + 1;
    await this.persistAndFlush();
    return reply;
  }

  getPost(idValue: string, includeUnpublished = false) {
    const post = this.posts.find((item) => item.id === idValue && item.status === 'active' && (includeUnpublished || item.reviewStatus !== 'hidden'));
    if (!post) throw new NotFoundException('树洞不存在');
    return this.decoratePost(post);
  }

  async createMood(input: { content: string; emotion: Emotion; visibility: Visibility; style?: AIStyle; replyStyles?: AIStyle[]; assetIds?: string[]; journeyId?: string }) {
    if (!input.content?.trim()) throw new NotFoundException('内容不能为空');
    const userId = this.getDemoUserId();
    this.assertCanWrite();
    const emotion = normalizeStoreEmotion(input.emotion);
    const risk = this.detectRisk(input.content);
    const attachmentIds = Array.from(new Set(input.assetIds ?? []));
    if (attachmentIds.length > 2) throw new NotFoundException('最多添加 2 张图片');
    const media = this.mediaByIds(attachmentIds);
    if (media.length !== attachmentIds.length || media.some((asset) => asset.userId !== userId)) throw new NotFoundException('图片不存在、尚未上传完成或不属于当前用户');
    const journey = input.journeyId ? this.requireJourney(input.journeyId, userId) : undefined;
    const mood: Mood = { id: id('mood'), userId, emotion, content: input.content.trim(), visibility: input.visibility, riskLevel: risk.level, riskScore: risk.score, status: 'active', attachmentIds, journeyId: journey?.id, createdAt: now() };
    this.moods.unshift(mood);
    if (input.visibility === 'PUBLIC') {
      const post: PostItem = { id: id('post'), moodId: mood.id, userId, emotion, content: mood.content, visibility: 'PUBLIC', status: 'active', reviewStatus: 'pending_review', hugCount: 0, replyCount: 0, favoriteCount: 0, reportCount: 0, journeyId: journey?.id, attachmentIds, attachments: media, createdAt: now() };
      this.posts.unshift(post);
      const requestedStyles = Array.isArray(input.replyStyles)
        ? input.replyStyles.filter(isSupportedAiReplyStyle)
        : [];
      // Prefer the plural public contract when it has usable values, otherwise
      // honour a valid single selected style before falling back safely.
      const styleCandidates: AIStyle[] =
        requestedStyles.length
          ? requestedStyles
          : isSupportedAiReplyStyle(input.style)
            ? [input.style]
            : ['warm'];
      const styles = Array.from(new Set(styleCandidates));
      // Persist the post and durable job records before waiting for a local model.
      // Ollama can take tens of seconds to cold-load a model; holding the publish
      // request open makes a successful post look like a failed action to users.
      const jobs = styles.map((style) => this.queueAiJob({
          userId,
          contentId: mood.id,
          contentType: 'Mood',
          jobType: '树洞温柔回应',
          taskType: 'post_reply',
          mood: emotion,
          style,
          promptSummary: mood.content,
        }));
      const queuedJobs = jobs;
      void Promise.all(queuedJobs.map((job) => this.waitForAiJob(job.id))).then(async (completedJobs) => {
        for (const job of completedJobs) {
          this.replies.unshift({
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
        post.replyCount = completedJobs.length;
        await this.persistAndFlush();
      }).catch(() => undefined);
      this.persist();
      await this.flush();
      return { mood, post, job: queuedJobs[0], jobs: queuedJobs, next: '/pages/post/detail', reviewStatus: post.reviewStatus };
    }
    const diary: Diary = { id: id('diary'), userId, moodId: mood.id, journeyId: journey?.id, emotion, content: mood.content, hasLetter: false, attachmentIds, createdAt: now() };
    this.diaries.unshift(diary);
    const queued = this.queueLetterGeneration({
      userId,
      sourceMoodId: mood.id,
      style: isSupportedAiReplyStyle(input.style) ? input.style : 'warm',
      content: mood.content,
    });
    void this.waitForAiJob(queued.job.id).then(async (completed) => {
      if (!['succeeded', 'fallback'].includes(completed.status)) return;
      const savedDiary = this.diaries.find((item) => item.id === diary.id);
      if (savedDiary) savedDiary.hasLetter = true;
      await this.persistAndFlush();
    }).catch(() => undefined);
    this.persist();
    await this.flush();
    return { mood, diary, letter: queued.letter, job: queued.job, jobs: [queued.job], next: '/pages/diary/index' };
  }

  detectRisk(content: string) {
    const high = /自杀|自伤|伤害别人|杀|暴力/.test(content);
    return { level: high ? 'high' as const : 'low' as const, score: high ? 0.92 : 0.08 };
  }

  queueLetterGeneration(input: { userId: string; sourceMoodId: string; style: AIStyle; content: string; letter?: Letter }) {
    if (input.letter?.aiJobId) {
      const pending = this.aiJobs.find((job) => job.id === input.letter?.aiJobId && ['queued', 'running'].includes(job.status));
      if (pending) return { letter: input.letter, job: pending };
    }
    const letter = input.letter ?? {
      id: id('letter'),
      userId: input.userId,
      sourceMoodId: input.sourceMoodId,
      style: input.style,
      title: '给今晚的你',
      content: '',
      status: 'unread' as const,
      savedToDiary: false,
      generationStatus: 'queued' as const,
      createdAt: now(),
    };
    if (!input.letter) this.letters.unshift(letter);
    const job = this.queueAI({
      taskType: 'warm_letter',
      content: input.content,
      style: input.style,
      userId: input.userId,
      sourceId: letter.id,
    });
    letter.aiJobId = job.id;
    letter.generationStatus = job.status;
    this.persist();
    void this.waitForAiJob(job.id).then((completed) => {
      const target = this.letters.find((item) => item.id === letter.id);
      if (!target) return;
      target.aiJobId = completed.id;
      target.generationStatus = completed.status;
      if (['succeeded', 'fallback'].includes(completed.status)) {
        target.style = input.style;
        target.content = completed.result;
        target.status = 'unread';
      }
      this.persist();
    }).catch(() => undefined);
    return { letter, job };
  }

  queueAI(input: AIGenerateInput) {
    const userId = input.userId ?? this.getDemoUserId();
    const taskType = this.normalizeTaskType(input.taskType);
    const content = input.content?.trim() || this.latestUserContent(userId) || '此刻的心情还没有说完。';
    const style = input.style ?? this.defaultStyleForTask(taskType);
    const sourceId = input.sourceId ?? `${taskType}_${Date.now()}`;
    const mood = input.mood ? normalizeStoreEmotion(input.mood) : this.inferMood(content);
    return this.queueAiJob({
      userId,
      contentId: sourceId,
      contentType: this.contentTypeForTask(taskType),
      jobType: this.jobTypeLabel(taskType),
      taskType,
      mood,
      style,
      promptSummary: content,
      simulatePrimaryFail: input.simulatePrimaryFail,
      simulateBackupFail: input.simulateBackupFail,
    });
  }

  generateAI(input: AIGenerateInput): AIGenerateResult {
    const taskType = this.normalizeTaskType(input.taskType);
    const style = input.style ?? this.defaultStyleForTask(taskType);
    const job = this.queueAI(input);

    return {
      status: 'queued',
      provider: '',
      style,
      result: '',
      structured: {},
      jobId: job.id,
      job,
    };
  }

  queueAiJob(input: { userId: string; contentId: string; contentType: string; jobType: string; taskType?: AITaskType | string; mood?: string; style: AIStyle; promptSummary: string; simulatePrimaryFail?: boolean; simulateBackupFail?: boolean }) {
    const taskType = this.normalizeTaskType(input.taskType ?? input.jobType);
    const route = this.aiRoutes.find((item) => item.style === input.style && item.enabled)
      ?? this.aiRoutes.find((item) => item.enabled && item.taskTypes?.includes(taskType))
      ?? this.aiRoutes[0];
    const isPeerResponseAssist = taskType === 'peer_response_assist';
    const peerDraftProvider = isPeerResponseAssist
      ? (this.aiProviders.find((item) => item.id === DAPI_PROVIDER_ID) ?? this.remoteAi.primaryDefinition())
      : undefined;
    const queuedPrimaryProviderId = peerDraftProvider?.id ?? route?.primaryProviderId;
    const job: AIJob = {
      id: id('job'), userId: input.userId, contentId: input.contentId, contentType: input.contentType, taskType: this.jobTypeLabel(taskType), jobType: this.jobTypeLabel(taskType),
      style: input.style, providerId: peerDraftProvider?.id ?? '', modelName: peerDraftProvider?.modelName ?? '', status: 'queued', promptSummary: input.promptSummary.slice(0, 160),
      promptVersion: route?.promptVersion, result: '', durationMs: 0, retryCount: 0,
      traceJson: [{
        at: now(), event: 'queued', status: 'queued', taskType, style: input.style, routeVersion: route?.routeVersion ?? 0,
        primaryProviderId: queuedPrimaryProviderId, backupProviderId: route?.backupProviderId, fallbackTemplateId: route?.fallbackTemplateId,
      }],
      routeVersion: route?.routeVersion ?? 0, createdAt: now(),
    };
    this.aiJobs.unshift(job);
    this.persist();
    void Promise.resolve().then(async () => {
      try {
        await this.runAiJob({ ...input, jobId: job.id });
      } catch (error) {
        job.status = 'failed';
        job.errorMessage = sanitizeProviderError(error);
        job.durationMs = Math.max(1, Date.now() - Date.parse(job.createdAt));
        job.completedAt = now();
        this.appendAiTrace(job, { event: 'terminal', status: 'failed', reason: job.errorMessage, durationMs: job.durationMs });
        this.persist();
      }
    });
    return job;
  }

  async waitForAiJob(jobId: string, timeoutMs = 120_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const job = this.aiJobs.find((item) => item.id === jobId);
      if (!job) throw new NotFoundException('AI 任务不存在');
      if (!['queued', 'running'].includes(job.status)) {
        await this.flush();
        return job;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`AI task ${jobId} did not finish within ${timeoutMs}ms`);
  }

  latestSuccessfulAiJob(userId: string, taskType: string) {
    const normalizedTaskType = this.jobTypeLabel(this.normalizeTaskType(taskType));
    return this.aiJobs.find((job) => (
      job.userId === userId
      && job.taskType === normalizedTaskType
      && ['succeeded', 'fallback'].includes(job.status)
      && Boolean(job.result)
    ));
  }

  async runAiJob(input: { userId: string; contentId: string; contentType: string; jobType: string; taskType?: AITaskType | string; mood?: string; style: AIStyle; promptSummary: string; simulatePrimaryFail?: boolean; simulateBackupFail?: boolean; jobId?: string }) {
    const taskType = this.normalizeTaskType(input.taskType ?? input.jobType);
    const route = this.aiRoutes.find((item) => item.style === input.style && item.enabled)
      ?? this.aiRoutes.find((item) => item.enabled && item.taskTypes?.includes(taskType))
      ?? this.aiRoutes[0];
    if (!route) throw new NotFoundException('没有可用的 AI 路由规则');
    const isPeerResponseAssist = taskType === 'peer_response_assist';
    // Peer drafts are a safety boundary: historical route state must never make
    // them use a template, local provider, or an unrelated remote fallback.
    const peerDraftProvider = isPeerResponseAssist
      ? (this.aiProviders.find((item) => item.id === DAPI_PROVIDER_ID) ?? this.remoteAi.primaryDefinition())
      : undefined;
    if (peerDraftProvider && !this.aiProviders.some((item) => item.id === peerDraftProvider.id)) {
      this.aiProviders.unshift(peerDraftProvider);
    }
    const primary = peerDraftProvider ?? this.aiProviders.find((item) => item.id === route.primaryProviderId);
    const backup = this.aiProviders.find((item) => item.id === route.backupProviderId);
    const job: AIJob = input.jobId ? this.aiJobs.find((item) => item.id === input.jobId)! : {
      id: id('job'), userId: input.userId, contentId: input.contentId, contentType: input.contentType, taskType: this.jobTypeLabel(taskType), jobType: this.jobTypeLabel(taskType),
      style: input.style, providerId: '', modelName: '', status: 'queued', promptSummary: input.promptSummary.slice(0, 160),
      promptVersion: route.promptVersion, result: '', durationMs: 0, retryCount: 0, traceJson: [], routeVersion: route.routeVersion, createdAt: now(),
    };
    if (!job) throw new NotFoundException('AI 任务不存在');
    if (!input.jobId) {
      this.aiJobs.unshift(job);
      this.appendAiTrace(job, {
        event: 'queued', status: 'queued', taskType, style: input.style, routeVersion: route.routeVersion,
        primaryProviderId: primary?.id ?? route.primaryProviderId, backupProviderId: route.backupProviderId, fallbackTemplateId: route.fallbackTemplateId,
      });
      this.persist();
    }

    const jobStartedAt = Date.now();
    job.status = 'running';
    this.appendAiTrace(job, {
      event: 'running', status: 'running', taskType, style: input.style, routeVersion: route.routeVersion,
      primaryProviderId: primary?.id ?? route.primaryProviderId, backupProviderId: route.backupProviderId, fallbackTemplateId: route.fallbackTemplateId,
    });
    this.persist();
    if (visualFixtureMode) {
      job.status = 'failed';
      job.errorMessage = 'VISUAL_FIXTURE_REMOTE_AI_DISABLED';
      job.durationMs = Math.max(1, Date.now() - jobStartedAt);
      job.completedAt = now();
      this.appendAiTrace(job, { event: 'terminal', status: 'failed', reason: job.errorMessage, durationMs: job.durationMs });
      this.persist();
      return job;
    }

    const risk = this.detectRisk(input.promptSummary);
    if (risk.level === 'high') {
      job.providerId = 'risk-escalation';
      job.modelName = 'safety-policy';
      job.result = '我很在意你现在的安全。请先联系身边可信任的人，或尽快联系当地紧急服务、心理危机干预热线；如果你正处在即时危险中，请优先拨打当地紧急电话。你不需要一个人扛着。';
      job.structuredResult = { riskLevel: 'high', escalation: true, nextSmallStep: '现在就联系一位可信任的人，并离开可能伤害自己的环境。' };
      job.status = 'succeeded';
      job.durationMs = 1;
      job.completedAt = now();
      this.appendAiTrace(job, {
        event: 'terminal', taskType, riskLevel: 'high', status: 'succeeded', providerId: job.providerId,
        modelName: job.modelName, durationMs: job.durationMs, safetyEscalation: true,
      });
      this.persist();
      return job;
    }

    const prompt = this.buildAiPrompt({ taskType, style: input.style, route, content: input.promptSummary, mood: input.mood ?? this.inferMood(input.promptSummary) });
    const needsStructuredResult = ['breakdown', 'situation_analysis', 'action_plan', 'support_plan', 'decision_clarify', 'need_analysis', 'risk_analysis', 'barrier_analysis', 'adaptive_action', 'peer_match_explain', 'loop_detection', 'recovery_summary', 'peer_response_assist'].includes(taskType);
    const candidates: Array<{ provider?: AIProvider; role: 'primary' | 'backup' | 'retry'; forcedFailure: boolean }> = isPeerResponseAssist
      ? [
          { provider: primary, role: 'primary', forcedFailure: input.simulatePrimaryFail === true },
          { provider: primary, role: 'retry', forcedFailure: input.simulatePrimaryFail === true },
          { provider: primary, role: 'retry', forcedFailure: input.simulatePrimaryFail === true },
        ]
      : [
          { provider: primary, role: 'primary', forcedFailure: input.simulatePrimaryFail === true },
          { provider: backup, role: 'backup', forcedFailure: input.simulateBackupFail === true },
        ];
    const errors: string[] = [];
    for (const candidate of candidates) {
      const provider = candidate.provider;
      const attemptStartedAt = Date.now();
      if (candidate.forcedFailure) {
        const reason = `simulated-${candidate.role}-failure`;
        this.appendAiTrace(job, { event: 'provider-attempt', providerId: provider?.id, modelName: provider?.modelName, role: candidate.role, status: 'failed', reason, durationMs: Math.max(0, Date.now() - attemptStartedAt) });
        errors.push(reason);
        continue;
      }
      if (!provider || !provider.enabled) {
        const reason = 'provider-unavailable';
        this.appendAiTrace(job, { event: 'provider-attempt', providerId: provider?.id, modelName: provider?.modelName, role: candidate.role, status: 'skipped', reason, durationMs: Math.max(0, Date.now() - attemptStartedAt) });
        errors.push(`${candidate.role}:${reason}`);
        continue;
      }
      if (provider.type === 'local' || provider.providerKind !== 'openai-compatible') {
        const reason = 'unsupported-remote-provider';
        this.appendAiTrace(job, { event: 'provider-attempt', providerId: provider.id, modelName: provider.modelName, role: candidate.role, status: 'skipped', reason, durationMs: Math.max(0, Date.now() - attemptStartedAt) });
        errors.push(`${provider.id}:${reason}`);
        continue;
      }
      try {
        const response = await this.remoteAi.generate(provider, {
          prompt,
          timeoutMs: Math.max(provider.timeoutSeconds, 30) * 1000,
          json: needsStructuredResult,
          maxTokens: needsStructuredResult ? 520 : 360,
        });
        const userFacingResult = this.extractUserFacingModelOutput(response.result, this.requiresReasoningOutputExtraction(provider));
        const structured = needsStructuredResult ? this.parseStructuredTaskResult(userFacingResult, taskType) : undefined;
        job.providerId = provider.id;
        job.modelName = response.model;
        job.result = this.safetyFilter(structured ? structured.summary : userFacingResult);
        job.structuredResult = structured;
        job.status = 'succeeded';
        job.fallbackUsed = candidate.role === 'backup';
        job.retryCount = candidates.indexOf(candidate);
        job.durationMs = Math.max(response.durationMs, Date.now() - jobStartedAt);
        job.completedAt = now();
        provider.modelName = response.model;
        provider.todayCalls += 1;
        provider.avgLatencyMs = provider.avgLatencyMs ? Math.round((provider.avgLatencyMs + response.durationMs) / 2) : response.durationMs;
        this.appendAiTrace(job, { event: 'provider-attempt', providerId: provider.id, modelName: response.model, role: candidate.role, status: 'succeeded', durationMs: response.durationMs, jobDurationMs: job.durationMs, structured: Boolean(structured), fallbackUsed: job.fallbackUsed });
        this.appendAiTrace(job, { event: 'terminal', providerId: provider.id, modelName: response.model, status: 'succeeded', durationMs: job.durationMs, fallbackUsed: job.fallbackUsed });
        this.persist();
        return job;
      } catch (error) {
        const message = sanitizeProviderError(error);
        errors.push(`${provider.id}:${message}`);
        this.appendAiTrace(job, { event: 'provider-attempt', providerId: provider.id, modelName: provider.modelName, role: candidate.role, status: 'failed', reason: message, durationMs: Math.max(1, Date.now() - attemptStartedAt) });
        if (candidate.role === 'primary' && !isPeerResponseAssist && !this.remoteAi.canFailOver(error)) break;
      }
    }

    if (isPeerResponseAssist) {
      job.providerId = primary?.id ?? DAPI_PROVIDER_ID;
      job.modelName = primary?.modelName ?? '';
      job.status = 'failed';
      job.fallbackUsed = false;
      job.retryCount = Math.max(0, candidates.length - 1);
      job.errorMessage = errors.join(' | ') || 'DAPI_PEER_ASSIST_FAILED';
      job.durationMs = Math.max(1, Date.now() - jobStartedAt);
      job.completedAt = now();
      this.appendAiTrace(job, { event: 'terminal', status: 'failed', reason: job.errorMessage, providerId: job.providerId, modelName: job.modelName, durationMs: job.durationMs, fallbackUsed: false });
      this.persist();
      return job;
    }

    const template = this.composeDynamicText({ taskType, content: input.promptSummary, mood: input.mood ?? this.inferMood(input.promptSummary), style: input.style, routeLabel: route.label });
    job.providerId = route.fallbackTemplateId || this.templateProvider().id;
    job.modelName = this.aiProviders.find((provider) => provider.id === job.providerId)?.modelName ?? 'safe-template';
    job.result = this.safetyFilter(template.result);
    job.structuredResult = needsStructuredResult ? template.structured : undefined;
    job.status = 'fallback';
    job.fallbackUsed = true;
    job.retryCount = Math.max(1, candidates.length - 1);
    job.errorMessage = errors.join(' | ') || 'AI_PROVIDER_FAILED';
    job.durationMs = Math.max(1, Date.now() - jobStartedAt);
    job.completedAt = now();
    this.appendAiTrace(job, { event: 'terminal', status: 'fallback', reason: job.errorMessage, providerId: job.providerId, modelName: job.modelName, durationMs: job.durationMs, fallbackUsed: true });
    this.persist();
    return job;
  }

  private templateProvider(): AIProvider {
    return { id: 'provider_template', name: '安全模板兜底', type: 'template', providerKind: 'template', baseUrl: 'local://template', modelName: 'safe-template', apiKeyStatus: 'configured', enabled: true, priority: 999, dailyLimit: 99_999, timeoutSeconds: 1, failoverEnabled: false, usageTags: ['fallback'], failureRate: 0, avgLatencyMs: 1, todayCalls: 0 };
  }

  private requiresReasoningOutputExtraction(provider: AIProvider) {
    return provider.providerKind === 'ollama' && /huihui-qwen3\.5/i.test(provider.modelName);
  }

  private extractUserFacingModelOutput(rawOutput: string, requiresReasoningExtraction: boolean) {
    const trimmed = rawOutput.trim();
    if (!requiresReasoningExtraction) return trimmed;
    const finalOutput = trimmed.split(/<\/think>\s*/i).at(-1)?.trim() ?? '';
    if (!/<\/think>/i.test(trimmed) || !finalOutput || /^thinking process\s*:/i.test(finalOutput)) {
      throw new Error('Reasoning-model response did not contain a safe final answer');
    }
    return finalOutput;
  }

  private buildAiPrompt(input: { taskType: AITaskType; style: AIStyle; route: AIStyleRoute; content: string; mood: string }) {
    const safety = '你是晚安树洞的中文情绪陪伴助手。你不是医生，不做心理疾病诊断、不冒充专业人员、不做绝对承诺。语气温和、具体、不过度说教。若用户提及即时人身危险，提醒其联系身边可信任的人和当地紧急支持。';
    const taskInstructions: Record<AITaskType, string> = {
      post_reply: '为匿名树洞写一段 90 到 160 字的公开温柔回应，不泄露或推测身份。',
      today_letter: '写一封给此刻用户的 140 到 220 字今日回信，紧贴其最近记录，给出一个很小且可执行的行动。',
      breakdown: '只输出严格 JSON，不要 Markdown。字段必须完整：{"triggerEvent":"","coreEmotions":[""],"realNeeds":[""],"nextSmallStep":"","summary":"","advice":["","",""]}。',
      rewrite: '把用户的负面表达改写成不否认感受、也不攻击自己的 80 到 150 字表达。',
      rant: '写一段允许释放情绪、但不煽动伤害自己或他人的 80 到 150 字文案。',
      heal: '写一句简短、自然、不过度承诺的治愈短句。',
      sleep: '给失眠中的用户一段 80 到 140 字安慰，聚焦当下放松和一个小动作。',
      work: '把工作困扰分成事实、可控因素和一个下一步，150 字以内。',
      future: '写一封 120 到 220 字给未来自己的短信，保留希望但不做绝对保证。',
      month_report: '根据提供的真实统计写一段月度观察，不改写或虚构其中的数字。',
      situation_analysis: '只输出严格 JSON：{"title":"","domain":"","subDomain":"","eventType":"","stage":"","contextTags":[],"peopleContext":[],"decisionContext":[],"behaviorSignals":[],"recoverySignals":[],"intensity":0,"urgency":0,"facts":[],"feelings":[],"needs":[],"constraints":[],"risks":[],"summary":"","nextStep":""}。只整理用户明确表达的内容，不补造事实。',
      action_plan: '只输出严格 JSON：{"title":"","description":"","dueInDays":1,"why":""}。给一个最小、可执行、用户可以自行确认的行动。',
      journey_summary: '根据旅程时间线写一段事实与变化摘要，不做诊断，不虚构数据。',
      support_plan: '只输出严格 JSON：{"signals":[],"smallSteps":[],"people":[],"whenToReview":""}。给出可执行的现实支持计划。',
      decision_clarify: '只输出严格 JSON：{"question":"","options":[],"criteria":[],"uncertainties":[],"nextStep":""}。帮助澄清选择，不替用户做决定。',
      need_analysis: '只输出严格 JSON：{"intent":"JUST_LISTEN|FIND_PEOPLE|SEE_OUTCOMES|NEXT_STEP|STOP_IMPULSE|PREPARE_CONVERSATION|NOTHING_NOW|HIGH_DISTRESS","reason":""}。只根据用户明确表达判断，不做诊断。',
      risk_analysis: '只输出严格 JSON：{"riskLevel":"low|medium|high","signals":[],"nextStep":""}。高风险时只提示现实支持，不生成热线号码。',
      barrier_analysis: '只输出严格 JSON：{"barrier":"forgot|too_hard|emotion_too_strong|environment|something_else|did_not_want_to|other","summary":"","nextStep":""}。',
      adaptive_action: '只输出严格 JSON：{"title":"","why":"","difficulty":"tiny|easy|moderate","expectedDuration":"","completionDefinition":"","adaptationReason":"forgot|too_hard|emotion_too_strong|environment|something_else|did_not_want_to|other","summary":""}。把行动缩小，不要一次给多个方案。',
      peer_match_explain: '只输出严格 JSON：{"explanation":"","sharedContext":[],"recoveryLead":""}。只能引用输入里的真实字段，不得编造经历。',
      loop_detection: '只输出严格 JSON：{"detected":false,"pattern":"","count":0,"windowDays":7,"options":[]}。只根据输入记录判断。',
      recovery_summary: '只输出严格 JSON：{"summary":"","trend":"up|steady|down|unknown","observations":[]}。只做生活观察，不做医疗诊断。',
      peer_response_assist: '只输出严格 JSON：{"draft":"","reminders":[]}。这是给真人编辑的草稿，不能自动发送。',
    };
    return `${safety}\n任务：${taskInstructions[input.taskType]}\n风格：${input.style}。路由提示：${input.route.promptTemplate}\n用户内容或统计：\n${input.content}\n请直接给出结果。`;
  }

  private parseBreakdownResult(value: string) {
    const normalized = value.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(normalized) as Record<string, unknown>;
    const coreEmotions = Array.isArray(parsed.coreEmotions) ? parsed.coreEmotions.map(String).filter(Boolean) : [];
    const realNeeds = Array.isArray(parsed.realNeeds) ? parsed.realNeeds.map(String).filter(Boolean) : [];
    const triggerEvent = String(parsed.triggerEvent ?? '').trim();
    const nextSmallStep = String(parsed.nextSmallStep ?? '').trim();
    const summary = String(parsed.summary ?? '').trim();
    if (!triggerEvent || !coreEmotions.length || !realNeeds.length || !nextSmallStep || !summary) throw new Error('Remote AI structured response is incomplete');
    const advice = Array.isArray(parsed.advice) ? parsed.advice.map(String).filter(Boolean).slice(0, 3) : [];
    return { triggerEvent, trigger: triggerEvent, coreEmotions, coreEmotion: coreEmotions.join('、'), realNeeds, realNeed: realNeeds.join('、'), nextSmallStep, nextStep: nextSmallStep, smallAction: nextSmallStep, firstStep: nextSmallStep, summary, advice };
  }

  private parseStructuredTaskResult(value: string, taskType: AITaskType) {
    if (taskType === 'breakdown') return this.parseBreakdownResult(value);
    const normalized = value.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(normalized) as Record<string, unknown>;
    const arrays = (key: string) => Array.isArray(parsed[key]) ? (parsed[key] as unknown[]).map(String).filter(Boolean) : [];
    if (taskType === 'peer_response_assist') {
      const draft = String(parsed.draft ?? '').trim();
      if (!draft) throw new Error('Remote peer-assist response is incomplete');
      return { ...parsed, draft, reminders: arrays('reminders'), summary: draft };
    }
    const summary = String(parsed.summary ?? parsed.description ?? parsed.nextStep ?? parsed.question ?? '').trim();
    if (!summary) throw new Error('Remote AI structured response is incomplete');
    return { ...parsed, summary, facts: arrays('facts'), feelings: arrays('feelings'), needs: arrays('needs'), constraints: arrays('constraints'), risks: arrays('risks'), options: arrays('options'), criteria: arrays('criteria'), signals: arrays('signals'), smallSteps: arrays('smallSteps'), uncertainties: arrays('uncertainties') };
  }

  private normalizeTaskType(value?: string): AITaskType {
    const key = String(value ?? '').trim();
    const map: Record<string, AITaskType> = {
      public_ai_reply: 'post_reply',
      warm_letter: 'today_letter',
      emotion_analysis: 'breakdown',
      negative_rewrite: 'rewrite',
      healing_phrase: 'heal',
      sleep_comfort: 'sleep',
      work_support: 'work',
      future_letter: 'future',
      monthly_report: 'month_report',
      post_reply: 'post_reply',
      '树洞温柔回应': 'post_reply',
      today_letter: 'today_letter',
      '今日回信': 'today_letter',
      breakdown: 'breakdown',
      decompose: 'breakdown',
      '情绪拆解': 'breakdown',
      rewrite: 'rewrite',
      '负面改写': 'rewrite',
      rant: 'rant',
      '发疯文案': 'rant',
      heal: 'heal',
      'healing-quote': 'heal',
      '治愈短句': 'heal',
      sleep: 'sleep',
      'sleep-comfort': 'sleep',
      '失眠安慰': 'sleep',
      work: 'work',
      'work-support': 'work',
      '工作破防': 'work',
      future: 'future',
      'future-letter': 'future',
      '写给未来的自己': 'future',
      month_report: 'month_report',
      report: 'month_report',
      '情绪月报': 'month_report',
      situation_analysis: 'situation_analysis',
      '情况分析': 'situation_analysis',
      action_plan: 'action_plan',
      '行动计划': 'action_plan',
      journey_summary: 'journey_summary',
      '旅程总结': 'journey_summary',
      support_plan: 'support_plan',
      '支持计划': 'support_plan',
      decision_clarify: 'decision_clarify',
      '决策澄清': 'decision_clarify',
      need_analysis: 'need_analysis',
      '需要分析': 'need_analysis',
      risk_analysis: 'risk_analysis',
      barrier_analysis: 'barrier_analysis',
      adaptive_action: 'adaptive_action',
      peer_match_explain: 'peer_match_explain',
      loop_detection: 'loop_detection',
      recovery_summary: 'recovery_summary',
      peer_response_assist: 'peer_response_assist',
    };
    return map[key] ?? 'post_reply';
  }

  private defaultStyleForTask(taskType: AITaskType): AIStyle {
    if (taskType === 'breakdown' || taskType === 'work' || taskType === 'situation_analysis' || taskType === 'action_plan' || taskType === 'support_plan' || taskType === 'decision_clarify' || taskType === 'need_analysis' || taskType === 'risk_analysis' || taskType === 'barrier_analysis' || taskType === 'adaptive_action' || taskType === 'loop_detection' || taskType === 'recovery_summary') return 'rational';
    if (taskType === 'future') return 'poetic';
    if (taskType === 'rewrite') return 'clear';
    return 'warm';
  }

  private contentTypeForTask(taskType: AITaskType) {
    if (taskType === 'today_letter') return 'Letter';
    if (taskType === 'post_reply') return 'Post';
    if (taskType === 'month_report') return 'Report';
    if (['situation_analysis', 'action_plan', 'journey_summary', 'support_plan', 'decision_clarify', 'need_analysis', 'risk_analysis', 'barrier_analysis', 'adaptive_action', 'peer_match_explain', 'loop_detection', 'recovery_summary'].includes(taskType)) return 'LifeJourney';
    return 'ToolTask';
  }

  private jobTypeLabel(taskType: AITaskType) {
    const map: Record<AITaskType, string> = {
      post_reply: '树洞温柔回应',
      today_letter: '今日回信',
      breakdown: '情绪拆解',
      rewrite: '负面改写',
      rant: '发疯文案',
      heal: '治愈短句',
      sleep: '失眠安慰',
      work: '工作破防',
      future: '写给未来的自己',
      month_report: '情绪月报',
      situation_analysis: '情况分析',
      action_plan: '行动计划',
      journey_summary: '旅程总结',
      support_plan: '支持计划',
      decision_clarify: '决策澄清',
      need_analysis: '支持需要分析',
      risk_analysis: '风险分析',
      barrier_analysis: '行动障碍分析',
      adaptive_action: '自适应行动',
      peer_match_explain: '同路匹配解释',
      loop_detection: '反刍熔断观察',
      recovery_summary: '生活恢复观察',
      peer_response_assist: '真人回复整理',
    };
    void map;
    return ({
      post_reply: 'public_ai_reply',
      today_letter: 'warm_letter',
      breakdown: 'emotion_analysis',
      rewrite: 'negative_rewrite',
      rant: 'rant',
      heal: 'healing_phrase',
      sleep: 'sleep_comfort',
      work: 'work_support',
      future: 'future_letter',
      month_report: 'monthly_report',
      situation_analysis: 'situation_analysis',
      action_plan: 'action_plan',
      journey_summary: 'journey_summary',
      support_plan: 'support_plan',
      decision_clarify: 'decision_clarify',
      need_analysis: 'need_analysis',
      risk_analysis: 'risk_analysis',
      barrier_analysis: 'barrier_analysis',
      adaptive_action: 'adaptive_action',
      peer_match_explain: 'peer_match_explain',
      loop_detection: 'loop_detection',
      recovery_summary: 'recovery_summary',
      peer_response_assist: 'peer_response_assist',
    } as Record<AITaskType, string>)[taskType];
  }

  private publicProviderName(providerId: string) {
    if (providerId.startsWith('provider_ollama_')) return 'local-ollama';
    const map: Record<string, string> = {
      provider_qwen: 'local-qwen',
      provider_deepseek: 'deepseek',
      provider_kimi: 'kimi',
      provider_openai: 'openai',
      provider_doubao: 'doubao',
      provider_template: 'fallback-template',
    };
    return map[providerId] ?? providerId;
  }

  private latestUserContent(userId: string) {
    const diary = this.diaries.find((item) => item.userId === userId);
    const mood = this.moods.find((item) => item.userId === userId);
    return diary?.content ?? mood?.content ?? '';
  }

  resolveSourceContent(sourceId?: string) {
    if (!sourceId) return '';
    return (
      this.moods.find((item) => item.id === sourceId)?.content ??
      this.diaries.find((item) => item.id === sourceId)?.content ??
      this.letters.find((item) => item.id === sourceId)?.content ??
      ''
    );
  }

  private inferMood(content: string): Emotion {
    const text = content || '';
    if (/睡不着|失眠|凌晨|夜里|入睡/.test(text)) return '失眠' as Emotion;
    if (/工作|领导|同事|汇报|会议|加班|项目|职场/.test(text)) return '工作' as Emotion;
    if (/喜欢|恋爱|想念|关系|分手|暧昧/.test(text)) return '恋爱' as Emotion;
    if (/委屈|批评|误会|刺|被说|责备/.test(text)) return '委屈' as Emotion;
    if (/焦虑|担心|害怕|紧张|慌|压力/.test(text)) return '焦虑' as Emotion;
    return '焦虑' as Emotion;
  }

  private extractTopic(content: string) {
    const text = content.replace(/\s+/g, ' ').trim();
    if (!text) return '还没说出口的那部分心情';
    return text.length > 34 ? `${text.slice(0, 34)}...` : text;
  }

  private buildStructured(input: { taskType: AITaskType; content: string; mood: string; style: AIStyle }) {
    const topic = this.extractTopic(input.content);
    const lowered = input.content;
    const trigger = /领导|批评|责备/.test(lowered)
      ? '被重要的人评价或否定，让努力感没有被看见'
      : /睡不着|凌晨|失眠/.test(lowered)
        ? '夜里大脑停不下来，对明天状态产生担心'
        : /工作|会议|加班|项目/.test(lowered)
          ? '工作节奏过密，让身体和注意力都在紧绷'
          : `你提到的“${topic}”正在牵动注意力`;
    const coreEmotion = /委屈|批评|责备|误会/.test(lowered)
      ? '委屈、受挫和一点不被理解'
      : /睡不着|失眠|担心/.test(lowered)
        ? '失眠里的焦虑、担心和疲惫'
        : `${input.mood}里夹着需要被确认的紧张`;
    const realNeed = /努力|认真|已经/.test(lowered)
      ? '希望自己的努力被看见，也希望获得更清楚的反馈'
      : /明天|状态/.test(lowered)
        ? '需要把今晚和明天切开，让身体先恢复一点能量'
        : '需要被理解、被确认，并找回一点可控感';
    const nextStep = /睡不着|失眠|凌晨/.test(lowered)
      ? '先把担心写成三行，放到明天再处理，然后做三轮慢呼气'
      : /工作|领导|批评|汇报/.test(lowered)
        ? '先写下一件可执行的小事，其他评价等情绪降下来再处理'
        : '先给这件事命名，再选一个五分钟内能完成的小动作';

    return {
      trigger,
      triggerEvent: trigger,
      coreEmotion,
      coreEmotions: [coreEmotion],
      emotion: coreEmotion,
      realNeed,
      realNeeds: [realNeed],
      need: realNeed,
      nextStep,
      nextSmallStep: nextStep,
      smallAction: nextStep,
      firstStep: nextStep,
      advice: this.dynamicAdvice(input.mood, input.style, input.content),
      summary: `这次的重点不是立刻解决全部问题，而是先承认“${topic}”确实让你累了。`,
    };
  }

  private dynamicAdvice(mood: string, style: AIStyle, content: string) {
    if (/睡不着|失眠|凌晨/.test(content) || mood === '失眠') return ['写下担心清单', '做三轮慢呼气', '把明天第一步写小'];
    if (/工作|领导|汇报|项目/.test(content) || mood === '工作') return ['先列一件小任务', '把反馈和自我价值分开', '给自己留十分钟缓冲'];
    if (style === 'poetic') return ['把心事写成一句话', '给房间留一盏小灯', '今晚少责备自己一点'];
    if (style === 'rational') return ['区分事实和猜测', '写下可控的一步', '暂时不做最终判断'];
    return ['喝几口温水', '把肩膀放松下来', '先照顾此刻的身体'];
  }

  private fallbackStructuredTask(input: { taskType: AITaskType; content: string; mood: string; style: AIStyle }, base: Record<string, unknown>) {
    const topic = this.extractTopic(input.content);
    const domain = /工作|同事|领导|汇报|会议|项目|加班|职场/.test(input.content) ? '工作'
      : /伴侣|恋爱|分手|暧昧|喜欢|关系/.test(input.content) ? '关系'
        : /家人|父母|孩子|家庭/.test(input.content) ? '家庭'
          : /睡不着|失眠|夜里|凌晨/.test(input.content) ? '睡眠' : '其他';
    const summary = String(base.summary ?? `先把“${topic}”放在这里，再决定要不要走下一步。`);
    if (input.taskType === 'situation_analysis') {
      return {
        ...base,
        title: `${domain}里正在整理的一件事`,
        domain,
        subDomain: domain === '工作' ? '沟通与期待' : undefined,
        eventType: '正在经历的现实困境',
        stage: 'clarifying',
        contextTags: [domain, input.mood].filter(Boolean),
        peopleContext: /同事|领导/.test(input.content) ? ['同事或工作关系'] : [],
        decisionContext: [],
        behaviorSignals: [],
        recoverySignals: [],
        intensity: 5,
        urgency: 4,
        facts: [input.content],
        feelings: [String(base.coreEmotion ?? input.mood)],
        needs: [String(base.realNeed ?? '被理解，并找回一点可控感')],
        constraints: [],
        risks: [],
        summary,
        nextStep: String(base.nextStep ?? ''),
      };
    }
    if (input.taskType === 'action_plan') return { ...base, title: '先完成一个五分钟的小动作', description: String(base.nextStep ?? ''), dueInDays: 1, why: String(base.realNeed ?? ''), summary };
    if (input.taskType === 'adaptive_action') return { ...base, title: `把“${topic}”缩小一点`, why: '先降低开始门槛，再根据真实结果调整。', difficulty: 'tiny', expectedDuration: '5 分钟', completionDefinition: String(base.nextStep ?? '写下一句最容易开始的话'), adaptationReason: 'other', summary };
    if (input.taskType === 'need_analysis') return { ...base, intent: 'JUST_LISTEN', reason: '先由用户选择自己更需要的支持方向。', summary };
    if (input.taskType === 'risk_analysis') return { ...base, riskLevel: 'low', signals: [], nextStep: String(base.nextStep ?? ''), summary };
    if (input.taskType === 'barrier_analysis') return { ...base, barrier: 'other', nextStep: String(base.nextStep ?? ''), summary };
    if (input.taskType === 'peer_match_explain') return { ...base, explanation: '匹配依据只会引用你已确认且允许参与匹配的经历线索。', sharedContext: [], recoveryLead: '', summary };
    if (input.taskType === 'loop_detection') return { ...base, detected: false, pattern: '', count: 0, windowDays: 7, options: [], summary };
    if (input.taskType === 'recovery_summary') return { ...base, trend: 'unknown', observations: [], summary };
    if (input.taskType === 'peer_response_assist') return { ...base, draft: '', reminders: ['这只是草稿，发送前请由真人确认。'], summary };
    return base;
  }

  private composeDynamicText(input: { taskType: AITaskType; content: string; mood: string; style: AIStyle; routeLabel: string }) {
    const topic = this.extractTopic(input.content);
    const structured = this.buildStructured(input);
    const action = structured.nextStep as string;
    const styleText: Record<AIStyle, string> = {
      warm: `暖心陪伴：我听见你提到“${topic}”。这份${input.mood}不是矫情，它是在提醒你已经撑了一会儿。今晚先不用急着证明自己，先做一件很小的事：${action}。`,
      rational: `理性分析：围绕“${topic}”，现在可以先分成三层看：事实是事情发生了，情绪是${structured.coreEmotion}，需要是${structured.realNeed}。下一步只保留一个动作：${action}。`,
      light: `轻松一点：关于“${topic}”，先把脑内音量调低一点。你不用一口气处理完，先把最卡住的地方写出来，再给自己一个短暂停顿：${action}。`,
      clear: `清醒提醒：你写下“${topic}”，说明这件事已经占用了能量。先别把它扩大成对自己的结论，今晚只处理可控部分：${action}。`,
      poetic: `诗意疗愈：你把“${topic}”放进树洞里，它就不必再独自压在心口。愿今晚的风轻一点，先让自己回到一个小小的动作里：${action}。`,
    };
    const taskText: Partial<Record<AITaskType, string>> = {
      breakdown: `情绪拆解：触发事件可能是“${structured.trigger}”；核心情绪是“${structured.coreEmotion}”；真实需要是“${structured.realNeed}”；可以先做的一小步是“${action}”。`,
      rewrite: `负面改写：把“${topic}”换成更照顾自己的说法：我正在经历${input.mood}，但这不等于我不够好。我可以先从“${action}”开始。`,
      rant: `发疯文案：今天这件“${topic}”真的够烦，也够消耗。允许你先吐槽，不急着优雅；吐完以后，把力气收回来一点点：${action}。`,
      heal: `治愈短句：就算“${topic}”让你很累，你也仍然值得被认真对待。先把自己放回当下：${action}。`,
      sleep: `失眠安慰：如果“${topic}”还在脑子里转，先告诉自己：现在不是解决全部问题的时间。把担心放进纸上，再做一轮慢呼气。`,
      work: `工作支撑：面对“${topic}”，先把评价、任务和自我价值分开。你要处理的是下一步任务，不是证明整个人都没问题；先做：${action}。`,
      future: `写给未来：未来的你会记得，此刻关于“${topic}”的难受并没有浪费。它提醒你要更温柔地安排边界，也提醒你从“${action}”重新开始。`,
      month_report: `情绪月报：这个阶段反复出现的线索是“${topic}”。${input.mood}背后有真实需要，下个月可以先固定一个小动作：${action}。`,
      situation_analysis: `情况分析：先把“${topic}”拆成已经发生的事实、此刻的感受和你可以确认的需要，再由你决定下一步是否合适。`,
      action_plan: `行动建议：围绕“${topic}”，先保留一个五分钟内能完成的小动作：${action}。完成后再根据结果调整，不把一次行动当成对自己的评价。`,
      journey_summary: `旅程摘要：你正在处理“${topic}”。目前能确认的是你已经把事情说出来，并找到了一步可尝试的动作：${action}。`,
      support_plan: `现实支持计划：当“${topic}”再次变重时，可以先做：${action}；如果仍然难以独自承受，请联系你信任的人和当地现实支持。`,
      decision_clarify: `决策澄清：关于“${topic}”，先把选项、在意的条件和还不确定的地方分别写下，不替自己仓促下结论。`,
      post_reply: styleText[input.style],
      today_letter: styleText[input.style],
    };
    return {
      result: taskText[input.taskType] ?? `${input.routeLabel}：${styleText[input.style]}`,
      structured: this.fallbackStructuredTask(input, structured),
    };
  }

  safetyFilter(text: string) {
    return text
      .replace(/我能治愈你/g, '我会陪你整理此刻的感受')
      .replace(/你一定会好/g, '愿你一点点变得轻松');
  }

  createReply(postId: string, input: { content: string; anonymous?: boolean; visibility?: string }) {
    const post = this.getPost(postId, true);
    const ownerPrivacy = this.privacySettings[post.userId];
    const systemAllowsHumanReplies = this.systemSettings.allowHumanRepliesDefault?.value !== false;
    if (post.visibility !== 'PUBLIC' || post.reviewStatus !== 'published' || ownerPrivacy?.allowHumanReplies === false || !systemAllowsHumanReplies) {
      throw new ForbiddenException('当前内容不允许真人回应');
    }
    if (!input.content?.trim()) throw new NotFoundException('回复内容不能为空');
    this.assertCanWrite();
    const risk = this.detectRisk(input.content);
    const reply: ReplyItem = { id: id('reply'), postId, userId: input.anonymous ? undefined : this.getDemoUserId(), type: 'USER', style: 'human', content: input.content.trim(), status: 'pending_review', riskLevel: risk.level, likeCount: 0, createdAt: now() };
    this.replies.unshift(reply);
    post.replyCount = this.replies.filter((item) => item.postId === postId && item.status === 'published').length;
    this.persist();
    return reply;
  }

  moderatePost(adminId: string, postId: string, action: 'approve' | 'hide' | 'reject' | 'risk') {
    const post = this.getPost(postId, true);
    const before = { ...post };
    if (action === 'approve') {
      post.reviewStatus = 'published';
      post.publishedAt ??= now();
    }
    if (action === 'hide') post.reviewStatus = 'hidden';
    if (action === 'reject') post.reviewStatus = 'rejected';
    if (action === 'risk') post.reportCount += 1;
    this.audit(adminId, `POST_${action.toUpperCase()}`, 'Post', postId, before, post);
    this.persist();
    return post;
  }

  moderateReply(adminId: string, replyId: string, action: 'approve' | 'block', content?: string) {
    const reply = this.replies.find((item) => item.id === replyId);
    if (!reply) throw new NotFoundException('回应不存在');
    const before = { ...reply };
    if (content) reply.content = content;
    reply.status = action === 'approve' ? 'published' : 'blocked';
    const post = this.posts.find((item) => item.id === reply.postId);
    if (post) post.replyCount = this.replies.filter((item) => item.postId === post.id && item.status === 'published').length;
    this.audit(adminId, `REPLY_${action.toUpperCase()}`, 'Reply', replyId, before, reply);
    this.persist();
    return reply;
  }
}
