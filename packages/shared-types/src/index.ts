export type Emotion = '委屈' | '焦虑' | '失眠' | '恋爱' | '工作';
export type Visibility = 'PRIVATE' | 'PUBLIC';
export type ReviewStatus = 'pending_review' | 'published' | 'hidden' | 'rejected';
export type ReplyStatus = 'pending_review' | 'published' | 'blocked';
export type ReplyType = 'USER' | 'AI';
export type ReplyAuthorType = 'HUMAN' | 'AI' | 'SYSTEM';
export type AIStyle = 'warm' | 'rational' | 'light' | 'clear' | 'poetic';
export type AIJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'fallback' | 'cancelled';
export type JourneyStatus = 'active' | 'paused' | 'completed' | 'archived';
export type PeerExperienceStatus = 'draft' | 'pending_review' | 'published' | 'hidden' | 'rejected';
export type PeerMatchStatus = 'suggested' | 'requested' | 'connected' | 'declined' | 'blocked';
export type ActionCommitmentStatus = 'active' | 'completed' | 'skipped' | 'paused';
export type CheckinStatus = 'pending' | 'completed' | 'missed';

export interface UserProfile {
  id: string;
  nickname: string;
  anonymousCode: string;
  avatarUrl: string;
  status: 'normal' | 'limited' | 'banned';
  createdAt?: string;
}

export interface PostItem {
  id: string;
  moodId: string;
  userId: string;
  emotion: Emotion;
  content: string;
  visibility: Visibility;
  status: 'active' | 'deleted';
  reviewStatus: ReviewStatus;
  hugCount: number;
  replyCount: number;
  favoriteCount: number;
  reportCount: number;
  allowHumanReplies?: boolean;
  attachmentIds?: string[];
  attachments?: MediaAsset[];
  createdAt: string;
  publishedAt?: string;
  journeyId?: string;
}

export interface MediaAsset {
  id: string;
  userId: string;
  storageKey: string;
  url: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  usageType: string;
  status: 'ready' | 'deleted';
  createdAt: string;
}

export interface ReplyItem {
  id: string;
  postId: string;
  userId?: string;
  type: ReplyType;
  style: AIStyle | 'human';
  content: string;
  status: ReplyStatus;
  riskLevel: 'low' | 'medium' | 'high';
  likeCount?: number;
  authorType?: ReplyAuthorType;
  createdAt: string;
}

export interface PrivacySetting {
  defaultVisibility: Visibility;
  allowAnonymousPublic: boolean;
  allowHumanReplies: boolean;
  allowMonthlyReportShare: boolean;
  allowPeerMatching?: boolean;
  allowAnonymousExperienceStats?: boolean;
  allowRecoveryData?: boolean;
  allowJourneyLongTermAnalysis?: boolean;
  allowLongTermMemory?: boolean;
  allowAiMemoryUse?: boolean;
  allowAnonymousExperienceShare?: boolean;
  allowJourneyArchiveRetention?: boolean;
  allowFutureSelfNotifications?: boolean;
  allowDataExport?: boolean;
}

export interface LifeJourney {
  id: string;
  userId: string;
  title: string;
  domain: string;
  status: JourneyStatus;
  stage: string;
  visibility: Visibility;
  intensity?: number;
  summary?: string;
  nextReviewAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SituationSnapshot {
  id: string;
  journeyId: string;
  facts: string[];
  feelings: string[];
  needs: string[];
  constraints: string[];
  risks: string[];
  confidence: 'user_confirmed' | 'agent_draft';
  createdAt: string;
  updatedAt?: string;
}

export interface JourneyUpdate {
  id: string;
  journeyId: string;
  userId: string;
  kind: string;
  content: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface ActionCommitment {
  id: string;
  journeyId: string;
  userId: string;
  title: string;
  description?: string;
  status: ActionCommitmentStatus;
  dueAt?: string;
  reminderAt?: string;
  evidence?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}

export interface OutcomeCheckin {
  id: string;
  journeyId: string;
  commitmentId?: string;
  userId: string;
  status: CheckinStatus;
  reflection?: string;
  result?: string;
  intensity?: number;
  checkedAt?: string;
  dueAt?: string;
  createdAt: string;
}

export interface PeerExperience {
  id: string;
  userId: string;
  journeyId?: string;
  title: string;
  domain: string;
  stage: string;
  content: string;
  tags: string[];
  consentedAt: string;
  status: PeerExperienceStatus;
  reportCount: number;
  createdAt: string;
  updatedAt?: string;
}

export interface PeerMatch {
  id: string;
  userId: string;
  journeyId?: string;
  peerExperienceId: string;
  score: number;
  reasons: string[];
  requestReason?: string;
  requestQuestion?: string;
  acceptedAt?: string;
  status: PeerMatchStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface AIProvider {
  id: string;
  name: string;
  type: 'local' | 'cloud' | 'template';
  baseUrl: string;
  modelName: string;
  apiKeyStatus: 'configured' | 'missing' | 'valid' | 'invalid';
  enabled: boolean;
  priority: number;
  dailyLimit: number;
  timeoutSeconds: number;
  failoverEnabled: boolean;
  usageTags: string[];
  failureRate: number;
  avgLatencyMs: number;
  todayCalls: number;
  providerKind?: 'ollama' | 'openai-compatible' | 'template' | 'other';
  modelMeta?: {
    size?: number;
    family?: string;
    parameterSize?: string;
    quantization?: string;
    capabilities?: string[];
    digest?: string;
    discoveredAt?: string;
  };
}

export interface AIStyleRoute {
  style: AIStyle;
  label: string;
  taskTypes?: string[];
  primaryProviderId: string;
  backupProviderId: string;
  fallbackTemplateId: string;
  promptVersion: string;
  promptTemplate: string;
  enabled: boolean;
  routeVersion: number;
  timeoutSeconds?: number;
  retryCount?: number;
}

export * from './fingerprint.js';
export * from './goodnight-2.js';
